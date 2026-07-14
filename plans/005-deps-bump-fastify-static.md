# Plan 005: Atualizar @fastify/static para corrigir advisory de path traversal / route-guard bypass

> **Executor instructions**: Siga passo a passo, rode cada verificação. STOP → pare e reporte.
> Ao terminar, atualize `plans/README.md`.
>
> **Drift check**: `git diff --stat feba0bf..HEAD -- server/package.json server/src/index.ts package-lock.json`

## Status
- **Priority**: P2
- **Effort**: S
- **Risk**: MED (major bump de uma dep de runtime; pode mudar API de `sendFile`/`setNotFoundHandler`)
- **Depends on**: none
- **Category**: security / dependencies
- **Planned at**: commit `feba0bf`, 2026-07-08

## Why this matters
`npm audit --omit=dev` reporta 1 advisory moderado: `@fastify/static 8.0.0 - 9.1.0` é vulnerável a
path traversal na listagem de diretório (GHSA-pr96-94w5-mx2h) e a bypass de route-guard via
separadores de path codificados (GHSA-x428-ghpx-8j92). O componente está em runtime servindo o SPA
em produção (`server/src/index.ts`). A versão instalada é `8.3.0`; o fix é o major `10.x`.

## Current state
`server/package.json`: `"@fastify/static": "^8.0.3"` (instalado 8.3.0). `server/src/index.ts`
(linhas 28-37):
```ts
if (existsSync(join(webDist, 'index.html'))) {
  await app.register(fastifyStatic, { root: webDist, prefix: '/' })
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found' })
    return reply.sendFile('index.html')
  })
  ...
}
```
Fastify core é 5.x (`"fastify": "^5.2.0"`). `@fastify/static@10` requer Fastify 5 — compatível.
`npm outdated` confirma: `@fastify/static` current 8.3.0 → latest 10.1.0.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 |
| Audit | `npm audit --omit=dev` | 0 advisories (após o bump) |
| Typecheck server | `npx tsc -p server/tsconfig.json --noEmit` | exit 0 |
| Build | `npm run build --workspace server` | exit 0 |

## Scope
**In scope:** `server/package.json` (versão de `@fastify/static`), `package-lock.json` (via install),
`server/src/index.ts` (só se a API do plugin mudar).
**Out of scope:** outros bumps de dependência (React 19, recharts 3, zod 4 etc. — são planos
próprios se desejados); qualquer mudança de comportamento além do necessário para o major.

## Git workflow
Branch de `claude`; commit `chore(deps): @fastify/static 10 (corrige advisory de path traversal)`. Não push/PR.

## Steps

### Step 1: Bump da dependência
Altere `server/package.json` para `"@fastify/static": "^10.1.0"` e rode `npm install`.
**Verify**: `npm audit --omit=dev` → **0 vulnerabilidades** (ou nenhuma envolvendo @fastify/static).

### Step 2: Confirmar a API do plugin no v10
Verifique o servir estático + fallback de SPA. No `@fastify/static@10`, `register({ root, prefix })`
e `reply.sendFile('index.html')` seguem suportados; confirme lendo `node_modules/@fastify/static/README.md`
(seção de opções) que nenhuma opção usada mudou de nome. Se `sendFile`/`root`/`prefix` tiverem
mudado, ajuste `server/src/index.ts` minimamente para a nova assinatura.
**Verify**: `npx tsc -p server/tsconfig.json --noEmit` → exit 0; `npm run build --workspace server` → exit 0.

### Step 3: Teste de fumaça do serving estático + SPA fallback
Faça o build do web (`npm run build --workspace web`) para popular `web/dist`, suba o servidor
compilado (`node server/dist/index.js` com `PORT` livre) e verifique:
- `GET /` → 200 com `<div id="root">` (index.html)
- `GET /carreira/1` (rota SPA) → 200 com index.html (fallback)
- `GET /api/status` → 200 JSON
- `GET /api/inexistente` → 404 JSON `{"error":"Not found"}`
- Um path com separador codificado (ex.: `GET /..%2f..%2fserver/package.json`) → **NÃO** vaza
  arquivo fora de `web/dist` (deve dar 404/400, não 200 com conteúdo do repo).
**Verify**: os 5 checks acima via `curl`.

## Test plan
Sem novos testes unitários (é bump de dep); a verificação é o roteiro de fumaça do Step 3. Se o
plano 002 estiver pronto, opcionalmente adicione um teste de integração com `.inject()` que confirma
o fallback de SPA e o 404 de `/api/*`.

## Done criteria
- [ ] `npm audit --omit=dev` → 0 advisories
- [ ] `npm run build --workspace server` → exit 0
- [ ] Roteiro de fumaça do Step 3 passa (incl. o path traversal negado)
- [ ] `grep '@fastify/static' server/package.json` → `^10`
- [ ] `git status --short` só arquivos in-scope
- [ ] `plans/README.md` atualizado

## STOP conditions
- Se `@fastify/static@10` exigir uma versão de Fastify diferente da instalada (5.x) → reporte o
  conflito de peer deps; não force.
- Se o Step 3 mostrar o servidor retornando conteúdo fora de `web/dist` mesmo após o bump → PARE e
  reporte (o fix não resolveu; pode precisar de configuração adicional de `allowedPath`).
- Se `sendFile`/`setNotFoundHandler` quebrarem de forma que exija reescrever o serving → reporte
  antes de improvisar.

## Maintenance notes
- Este bump é isolado; não encadeie outros majors no mesmo commit.
- Rodar `npm audit --omit=dev` periodicamente (idealmente no CI, plano futuro) para pegar novos advisories.
- Revisor: conferir que o serving de `/captures` (se ainda existir) e o fallback de SPA continuam
  funcionando após o major.
