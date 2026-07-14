# Plan 004: Hardening das rotas públicas de escrita (auth, rate-limit, quota, CORS, HOST, GC, headers)

> **Executor instructions**: Siga passo a passo, rode cada verificação, só toque arquivos in-scope.
> STOP → pare e reporte. Ao terminar, atualize `plans/README.md`.
>
> **Drift check**: `git diff --stat feba0bf..HEAD -- server/src/index.ts server/src/routes/sync.ts server/src/routes/import.ts server/src/db/schema.sql ecosystem.config.cjs`

## Status
- **Priority**: P1
- **Effort**: M
- **Risk**: MED (mexe no boot do servidor e nas rotas; pode afetar acesso de dev pela rede)
- **Depends on**: none (mas rode 002 antes para ter testes)
- **Category**: security
- **Planned at**: commit `feba0bf`, 2026-07-08

## Why this matters
O app está sendo publicado num VPS (Debian/CloudPanel). As rotas de **escrita** são anônimas e sem
limite: `POST /api/sync` grava blobs de até 5 MB por request sem teto de linhas; `PUT /api/sync/:code`
faz upsert em código arbitrário; `POST /api/import` dispara download de centenas de MB + escrita em
disco + parse pesado. Não há rate-limit nem headers de hardening; `CORS origin:true` reflete
qualquer origem; e o default de `HOST` é `0.0.0.0` — agravado porque o `ecosystem.config.cjs` atual
**não** define `HOST`, então em produção o Node escuta em todas as interfaces (contornando o nginx
do CloudPanel se o firewall não bloquear a porta). Resultado: enchimento de disco / DoS barato e
superfície aberta. Este plano fecha isso sem exigir login (o app é sem conta).

## Current state
`server/src/index.ts` (linhas 14-43):
```ts
const app = Fastify({ logger: true, bodyLimit: 30 * 1024 * 1024 })
await app.register(cors, { origin: true })
gameDataRoutes(app); importRoutes(app); analyzeRoutes(app); syncRoutes(app)
// ... fastifyStatic + setNotFoundHandler ...
const port = Number(process.env.PORT ?? 3344)
await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' })
```
`server/src/routes/sync.ts` — `POST /api/sync` (linha 27), `PUT /api/sync/:code` (linha 38, upsert
`INSERT ... ON CONFLICT`), sem auth/limite. `MAX_BLOB_SIZE = 5*1024*1024`. Tabela `sync_blobs`
(`schema.sql`) tem `updated_at` mas nenhuma expiração.
`server/src/routes/import.ts` — `POST /api/import` (linha 68): `void runImport(valid)` sem auth;
já há trava `state.running` (409) de um-por-vez.
`ecosystem.config.cjs` (editado): define só `NODE_ENV` e `PORT` — **sem `HOST`**.
`server/.env.example`: `ANTHROPIC_API_KEY`, `VISION_MODEL`, `PORT` — sem `HOST` nem token de admin.

Não há `@fastify/rate-limit` nem `@fastify/helmet` instalados (grep vazio).

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 |
| Typecheck server | `npx tsc -p server/tsconfig.json --noEmit` | exit 0 |
| Test | `npm test --workspace server` | passa |
| Build | `npm run build --workspace server` | exit 0 |

## Scope
**In scope:**
- `server/package.json` — deps `@fastify/rate-limit`, `@fastify/helmet`
- `server/src/index.ts` — registrar rate-limit + helmet; CORS allowlist; default HOST
- `server/src/routes/sync.ts` — quota de linhas/bytes; `PUT` só atualiza código existente; GC por TTL
- `server/src/routes/import.ts` — proteger `POST /api/import` (token de admin ou loopback)
- `server/src/settings.ts` — helper `adminToken()` lendo env (se optar por token)
- `server/.env.example` — documentar `HOST`, `CORS_ORIGINS`, `ADMIN_TOKEN`, `SYNC_TTL_DAYS`
- `ecosystem.config.cjs` — voltar `HOST: '127.0.0.1'`
- `server/src/routes/sync.test.ts` (criar, se 002 pronto)
**Out of scope:** `web/` (a UI de import/sync só precisa mandar o header de admin se você escolher
token — mas isso é opcional; ver Step 4, decisão A vs B); mudar o modelo "código = credencial".

## Git workflow
Branch de `claude`; commits por passo (`feat(seg): rate-limit e helmet`, `feat(seg): quota e TTL em sync_blobs`, etc.). Não push/PR.

## Steps

### Step 1: Registrar rate-limit e helmet
Adicione a `server/package.json` deps `"@fastify/rate-limit": "^10.1.1"` e `"@fastify/helmet": "^13.0.1"`; `npm install`.
Em `server/src/index.ts`, após o CORS:
```ts
import rateLimit from '@fastify/rate-limit'
import helmet from '@fastify/helmet'
await app.register(helmet, { contentSecurityPolicy: false }) // CSP à parte (Step 5) p/ não quebrar Vite/PWA
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' }) // limite global brando
```
**Verify**: `npm run build --workspace server` → exit 0; subir o servidor e `curl -sI localhost:3344/api/status` mostra headers do helmet (ex.: `x-content-type-options: nosniff`).

### Step 2: CORS allowlist + default HOST seguro
Em `index.ts`, troque `origin: true` por uma allowlist via env (com fallback permissivo só em dev):
```ts
const origins = process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean)
await app.register(cors, { origin: origins && origins.length ? origins : true })
```
E o default de host para loopback:
```ts
await app.listen({ port, host: process.env.HOST ?? '127.0.0.1' })
```
No `ecosystem.config.cjs`, adicione `HOST: '127.0.0.1'` ao `env`. No `.env.example`, documente
`HOST` (127.0.0.1 em prod atrás do nginx; 0.0.0.0 só p/ acessar pelo celular em dev) e
`CORS_ORIGINS=https://companion.seudominio.com`.
**Verify**: `npx tsc -p server/tsconfig.json --noEmit` → exit 0. Manual: sem `HOST`, o log de boot
mostra `127.0.0.1`.

### Step 3: Quota e TTL em `sync_blobs`
Em `server/src/routes/sync.ts`:
- **Quota de criação**: antes do `INSERT` em `POST`, cheque um teto global de linhas
  (`SELECT COUNT(*) FROM sync_blobs`) e/ou soma de bytes; se exceder `SYNC_MAX_BLOBS` (env, default
  ex. 5000), responda 507/429 com erro claro. Isso limita o enchimento de disco.
- **`PUT` só atualiza código existente**: troque o upsert por um `UPDATE ... WHERE code = ?`; se
  `changes === 0`, responda 404 (não crie códigos escolhidos pelo cliente). A criação passa a ser
  exclusiva do `POST` (código gerado pelo servidor).
- **GC por TTL**: adicione uma função `pruneExpired()` que apaga blobs com
  `updated_at < datetime('now', '-' || ? || ' days')` (TTL de `SYNC_TTL_DAYS`, default ex. 180) e
  chame-a no boot (`index.ts`) e no início de cada `POST` (barato). Rate-limit mais estrito nas
  rotas de escrita de sync: `app.post('/api/sync', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, ...)`.
**Verify**: `npx tsc -p server/tsconfig.json --noEmit` → exit 0; teste do Step 6 cobre PUT-404 e quota.

### Step 4: Proteger `POST /api/import` (escolha A ou B; A é o default recomendado)
- **A (loopback + admin token)**: aceite o import só se vier de loopback OU com header
  `x-admin-token` igual a `process.env.ADMIN_TOKEN` (quando definido). Como a importação é uma ação
  de setup do dono (não de usuário final), restringir não afeta o fluxo normal. Adicione
  `adminToken()` em `settings.ts`. Se `ADMIN_TOKEN` não estiver definido, rejeite import remoto (só
  loopback) — assim o default é seguro. Documente `ADMIN_TOKEN` no `.env.example` e o header no README.
- **B (só loopback)**: aceite `POST /api/import` apenas de `127.0.0.1`/`::1`. Mais simples; o dono
  dispara via `curl` no servidor ou túnel SSH. (Se escolher B, a tela de import no navegador remoto
  deixa de funcionar — anote isso no relatório e no README.)

Rate-limit estrito também: `{ config: { rateLimit: { max: 3, timeWindow: '1 hour' } } }`.
**Verify**: `npx tsc` exit 0; manual: `POST /api/import` de origem não-autorizada → 401/403.

### Step 5: CSP em report-only (não quebrar Vite/PWA)
Configure o helmet (ou um header manual) com `Content-Security-Policy-Report-Only` adequada ao
bundle Vite + service worker (permitir `'self'`, `data:` p/ imagens/fontes, `https://fonts.gstatic.com`
enquanto a fonte não for auto-hospedada). Comece em report-only para não quebrar nada.
**Verify**: `curl -sI localhost:3344/` mostra o header `content-security-policy-report-only`; o app
carrega normalmente no navegador (nenhum recurso bloqueado no console).

### Step 6: Testes das rotas de sync (se 002 pronto)
Crie `server/src/routes/sync.test.ts` com Fastify `.inject()` + SQLite `:memory:` (aplique
`schema.sql`): POST cria código; PUT em código inexistente → 404; PUT em código existente atualiza;
quota estourada → erro; GET case-insensitive. Modele a montagem do app conforme `index.ts`
(registre só `syncRoutes`).
**Verify**: `npm test --workspace server` → novos testes passam.

## Test plan
- `sync.test.ts` cobrindo os ramos acima. Para import, um teste opcional que confirma 401/403 sem token/loopback.
- Manual: subir o servidor, tentar `PUT /api/sync/AAAA-AAAA-AAAA` (código novo) → 404; martelar
  `POST /api/sync` além do rate-limit → 429; `POST /api/import` remoto sem token → bloqueado.

## Done criteria
- [ ] `npm run build --workspace server` → exit 0
- [ ] `npm test --workspace server` → passa (se 002 pronto)
- [ ] `grep -n "127.0.0.1" server/src/index.ts ecosystem.config.cjs` → default de host loopback nos dois
- [ ] `grep -n "rate-limit\|helmet" server/src/index.ts` → ambos registrados
- [ ] `POST /api/import` rejeita origem não autorizada (manual/teste)
- [ ] `git status --short` só arquivos in-scope
- [ ] `plans/README.md` atualizado

## STOP conditions
- CSP (mesmo em report-only) quebrar o carregamento do app — deixe `contentSecurityPolicy: false`
  e reporte que a CSP precisa de calibração dedicada.
- `@fastify/rate-limit`/`helmet` incompatíveis com Fastify 5 instalado — reporte as versões.
- Se restringir o import quebrar o fluxo de setup esperado pelo dono de um jeito que o plano não
  previu (ex.: ele importa sempre pelo navegador remoto) — pare e confirme a escolha A vs B.

## Maintenance notes
- Quando a CSP report-only estiver limpa nos logs, promover para enforcing (`Content-Security-Policy`).
- O TTL de sync apaga backups de usuários inativos — escolher valor conservador e mencionar na UI
  de restauração (plano de UI futuro).
- Interage com o plano 003 (chaves BYOK fora do blob): mesmo com quota/rate-limit, o blob não deve
  conter segredos.
- Revisor: confirmar que o rate-limit global não atrapalha o polling de `/api/import/status` (1s) —
  se atrapalhar, isente `/api/import/status` do rate-limit.
