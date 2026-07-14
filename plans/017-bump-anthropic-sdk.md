# Plan 017: Atualizar @anthropic-ai/sdk 0.39 → latest (dívida de versão do único vendor SDK)

> **Executor instructions**: Siga passo a passo, rode cada verificação. STOP → pare e reporte.
> Ao terminar, atualize a linha deste plano em `plans/README.md`.
>
> **Drift check (rode primeiro)**: `git diff --stat fe420d4..HEAD -- server/package.json server/src/vision/analyze.ts server/src/routes/analyze.ts package-lock.json`
> Se algum arquivo in-scope mudou desde fe420d4, compare os excertos de "Current state" com o
> código vivo antes de prosseguir; divergência = STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW-MED (major-zero bump 0.39→0.1xx pode ter breaking changes de tipos; superfície usada é pequena e estável)
- **Depends on**: none (016 recomendado antes, para testes isolados — não obrigatório)
- **Category**: dependencies
- **Planned at**: commit `fe420d4`, 2026-07-14

## Why this matters

O `@anthropic-ai/sdk` está em `^0.39.0` enquanto o npm publica `0.111+` — ~70 releases de
distância no único SDK de vendor do projeto. Não há advisory (audit limpo), mas a dívida cresce e
um dia um fix vai exigir atravessar todas as mudanças de uma vez. O uso é minúsculo — um arquivo,
duas chamadas de API estáveis (`messages.create` e `models.list`) — então o bump é barato agora e
caro depois. Este é o único bump de major recomendado pela auditoria; React 19/zod 4/recharts 3/
vite 8/TS 7 foram explicitamente adiados (sem driver de segurança, blast radius alto).

## Current state

- `server/package.json:14` — `"@anthropic-ai/sdk": "^0.39.0"`.
- Único consumidor: `server/src/vision/analyze.ts`:
  - `analyze.ts:1` — `import Anthropic from '@anthropic-ai/sdk'`
  - `analyze.ts:70-90` — `callAnthropic`: `new Anthropic({ apiKey })` +
    `client.messages.create({ model, max_tokens, system, messages: [{ role: 'user', content: [image, text] }] })`,
    lendo `msg.content.filter((b) => b.type === 'text')`.
  - Procure também por `models.list` no mesmo arquivo/rota de teste: `server/src/routes/analyze.ts`
    tem `POST /api/test-ai` (`analyze.ts:34`) que valida a chave BYOK — confirme se ele usa o SDK
    (`client.models.list()`) ou fetch puro antes de assumir.
- Arquitetura (decidida, não mudar): o proxy é **BYOK stateless** — a chave vem do navegador a
  cada request e nunca é persistida (CLAUDE.md). O bump não pode introduzir nenhum caching de
  client com chave embutida além do escopo da request.
- Testes: não há teste automatizado de `/api/analyze` (exige chave real). A verificação é
  typecheck + build + smoke manual com uma chave, se disponível — sem chave, typecheck/build são
  o portão e o smoke fica registrado como não executado.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Ver latest | `npm view @anthropic-ai/sdk dist-tags` | anote a versão `latest` |
| Install | `npm install` (após editar package.json) | exit 0 |
| Audit | `npm audit` | 0 vulnerabilidades |
| Typecheck | `npx tsc -p server/tsconfig.json --noEmit` | exit 0 |
| Verify completo | `npm run verify` | exit 0 |

## Scope

**In scope** (únicos arquivos a modificar):
- `server/package.json` (versão)
- `package-lock.json` (via `npm install`)
- `server/src/vision/analyze.ts` (SÓ se a API do SDK mudou de assinatura)
- `server/src/routes/analyze.ts` (SÓ se usar o SDK e a assinatura mudou)

**Out of scope** (não toque):
- Qualquer outro bump de dependência — um major por commit, este plano é só o SDK da Anthropic.
- Os caminhos OpenAI/Gemini/OpenRouter em `vision/analyze.ts` (usam fetch puro, não o SDK).
- O prompt (`SYSTEM`/`USER_TEXT`) e o parsing de JSON da resposta.

## Git workflow

- Branch: `claude` (continuar nela).
- Um commit: `chore(deps): @anthropic-ai/sdk 0.39 → <versão> (único consumidor: vision/analyze.ts)`.
- Não fazer push nem PR.

## Steps

### Step 1: Bump e install

`npm view @anthropic-ai/sdk dist-tags` → anote `latest`. Edite `server/package.json` para
`"@anthropic-ai/sdk": "^<latest>"` e rode `npm install`.

**Verify**: `npm audit` → 0 vulnerabilidades; `grep '"@anthropic-ai/sdk"' server/package.json` →
nova versão.

### Step 2: Typecheck e ajustes mínimos

`npx tsc -p server/tsconfig.json --noEmit`. Se falhar, os pontos prováveis de breaking change:
- shape de `msg.content` / narrowing do bloco de texto (`b.type === 'text'`) — ajuste o filtro
  para a tipagem nova mantendo o comportamento (concatenar todos os blocos de texto);
- o literal do `source: { type: 'base64', media_type, data }` para imagens;
- `client.models.list()` (se usado em `/api/test-ai`) — pode ter paginação nova.
Ajuste APENAS o necessário para compilar com comportamento idêntico.

**Verify**: `npx tsc -p server/tsconfig.json --noEmit` → exit 0; `npm run build --workspace server` → exit 0.

### Step 3: Smoke test do proxy

Se houver uma chave de teste disponível no ambiente do executor (NUNCA commitá-la nem imprimi-la):
suba o server e chame `POST /api/test-ai` com `{ provider: 'anthropic', apiKey: <chave>, model: 'claude-haiku-4-5-20251001' }`
→ espere 200 com resposta de validação. Sem chave disponível: pule e REGISTRE no relatório e na
linha do plans/README que o smoke não foi executado (typecheck/build são o portão).

**Verify**: 200 no test-ai OU registro explícito de "smoke não executado — sem chave".

### Step 4: Verify completo

**Verify**: `npm run verify` → exit 0.

## Test plan

Sem testes novos (a rota exige chave real; mocká-la testaria o mock). Portões: typecheck, build,
audit, e o smoke condicional do Step 3.

## Done criteria

- [ ] `npm run verify` → exit 0
- [ ] `npm audit` → 0 vulnerabilidades
- [ ] `grep '"@anthropic-ai/sdk"' server/package.json` → versão ≥ a `latest` anotada no Step 1
- [ ] Nenhuma mudança de comportamento em `vision/analyze.ts` além de ajustes de tipagem
- [ ] `git status --short` só arquivos in-scope
- [ ] `plans/README.md` atualizado (incluindo se o smoke rodou ou não)

## STOP conditions

- Se o typecheck do Step 2 exigir reescrever a estrutura de `callAnthropic` (não só ajustar
  tipos/filtros) — STOP e reporte o breaking change.
- Se a versão nova puxar advisories novos no `npm audit` — STOP.
- Se `/api/test-ai` usar o SDK de um jeito que a versão nova removeu (ex.: models.list mudou) e o
  ajuste não for óbvio — STOP.

## Maintenance notes

- Manter o SDK dentro de ~6 meses do latest daqui em diante — o custo é mínimo enquanto o gap é
  pequeno.
- Revisor: conferir que nenhuma chave apareceu em log/commit e que o client continua sendo criado
  por request (BYOK stateless).
