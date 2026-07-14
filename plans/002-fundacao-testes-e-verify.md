# Plan 002: Baseline de verificação — vitest, scripts agregados e CLAUDE.md

> **Executor instructions**: Siga passo a passo. Rode cada comando de verificação e confirme o
> resultado esperado antes de seguir. Só modifique arquivos in-scope. Se uma STOP condition
> ocorrer, pare e reporte. Ao terminar, atualize a linha deste plano em `plans/README.md`.
>
> **Drift check (rode primeiro)**: `git diff --stat feba0bf..HEAD -- package.json server/package.json web/package.json`
> Se algum desses mudou desde este plano, compare com os excertos em "Current state" antes de prosseguir.

## Status
- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests / dx
- **Planned at**: commit `feba0bf`, 2026-07-08

## Why this matters
Hoje a única verificação é `tsc --noEmit` + `vite build` — pega erros de tipo, mas **zero** lógica
de runtime. Nenhuma regressão em persistência (`web/src/store.ts`), importação de dados ou nas
rotas do servidor é detectável antes de chegar ao usuário. Este plano instala o test runner e cria
o comando único de verificação, tornando seguros todos os refactors dos outros planos. É
pré-requisito de 006 e 007. Também cria o `CLAUDE.md` que falta num repo operado por agentes.

## Current state
Monorepo npm workspaces (`server/`, `web/`). Node 20+, ESM. **Não há test runner, lint nem CI.**
Comandos de verificação atuais (não documentados em script): `npx tsc -p server/tsconfig.json
--noEmit`, `npx tsc -p web/tsconfig.json --noEmit`, `cd web && npx vite build`.

`package.json` (raiz) — scripts atuais:
```json
"scripts": {
  "dev:server": "npm run dev --workspace server",
  "dev:web": "npm run dev --workspace web",
  "build": "npm run build --workspace web && npm run build --workspace server",
  "start": "node --env-file-if-exists=server/.env server/dist/index.js",
  "import:data": "npm run import:data --workspace server"
}
```
`server/package.json` devDeps: `@types/better-sqlite3`, `@types/node`, `tsx`, `typescript`.
`web/package.json` devDeps incluem `vite`, `typescript`, `@vitejs/plugin-react`.

Arquitetura relevante para os testes (inline — o executor não a conhece): dados do usuário vivem
no `localStorage` via `web/src/store.ts` (blob JSON único, funções síncronas); o servidor usa
`better-sqlite3` (síncrono) e Fastify 5. Testes de web precisam de um `localStorage` fake
(ambiente jsdom/happy-dom); testes de server podem usar SQLite `:memory:`.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` (raiz) | exit 0 |
| Typecheck server | `npx tsc -p server/tsconfig.json --noEmit` | exit 0 |
| Typecheck web | `npx tsc -p web/tsconfig.json --noEmit` | exit 0 |
| Test (novo) | `npm test` (raiz) | roda vitest nos 2 workspaces, exit 0 |

## Scope
**In scope:**
- `package.json` (raiz) — scripts
- `server/package.json`, `web/package.json` — devDep vitest + script `test`
- `server/vitest.config.ts` (criar), `web/vitest.config.ts` (criar)
- `server/src/smoke.test.ts` (criar — 1 teste trivial provando que o runner roda), `web/src/smoke.test.ts` (criar)
- `CLAUDE.md` (criar, raiz)
- `.gitignore` — adicionar `coverage/` se ausente

**Out of scope:** qualquer arquivo de produção em `server/src` ou `web/src` (além dos smoke tests);
ESLint/Prettier (é outro plano potencial); CI/GitHub Actions.

## Git workflow
Branch a partir de `claude`; commits conventional em PT (ex.: `chore: adiciona vitest e script de verificação agregado`). Não push/PR.

## Steps

### Step 1: Instalar vitest em cada workspace
Adicione `"vitest": "^2.1.8"` aos `devDependencies` de `server/package.json` E `web/package.json`.
No `web/package.json` adicione também `"happy-dom": "^15.11.0"` (ambiente DOM leve p/ localStorage).
Rode `npm install`.

**Verify**: `npx vitest --version` (na raiz) → imprime versão 2.x, exit 0.

### Step 2: Config do vitest — server (ambiente node)
Crie `server/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
```
Adicione ao `server/package.json` scripts: `"test": "vitest run"`.
Crie `server/src/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
describe('smoke', () => { it('roda', () => { expect(1 + 1).toBe(2) }) })
```
**Verify**: `npm test --workspace server` → 1 teste passa, exit 0.

### Step 3: Config do vitest — web (ambiente happy-dom, localStorage disponível)
Crie `web/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { environment: 'happy-dom', include: ['src/**/*.test.{ts,tsx}'] },
})
```
Adicione ao `web/package.json` scripts: `"test": "vitest run"`.
Crie `web/src/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
describe('smoke', () => {
  it('tem localStorage no ambiente de teste', () => {
    localStorage.setItem('x', '1'); expect(localStorage.getItem('x')).toBe('1')
  })
})
```
**Verify**: `npm test --workspace web` → 1 teste passa, exit 0.

### Step 4: Scripts agregados na raiz
No `package.json` da raiz, adicione aos scripts:
```json
"typecheck": "tsc -p server/tsconfig.json --noEmit && tsc -p web/tsconfig.json --noEmit",
"test": "npm run test --workspace server && npm run test --workspace web",
"verify": "npm run typecheck && npm test && npm run build"
```
**Verify**: `npm run typecheck` → exit 0; `npm test` → todos passam; `npm run verify` → exit 0
(typecheck + testes + build completo).

### Step 5: CLAUDE.md
Crie `CLAUDE.md` na raiz com estas seções (conteúdo real, conciso, em PT):
- **O que é**: companion de modo carreira do FIFA/EA FC; foco em gerenciar jogadores.
- **Verificação**: "`npm run verify` na raiz (typecheck server+web, testes vitest, build). Não há lint."
- **Modelo de dados (contraintuitivo)**: dados do usuário (carreiras, elencos, snapshots,
  prospecção, chaves BYOK) vivem no **localStorage do navegador** via `web/src/store.ts` — NÃO no
  servidor. O servidor guarda só a database do jogo (SQLite somente leitura: `sofifa_players`/
  `sofifa_teams`), os blobs de restauração (`sync_blobs`) e faz proxy stateless de IA (`/api/analyze`).
- **BYOK**: a chave do provedor de IA vem do navegador por request; o servidor não deve persisti-la.
- **Invariante de produto**: os dados do jogo são reais (dumps SoFIFA/Kaggle) — nunca inventar
  nem reduzir atributos.
- **Layout**: `server/` (Fastify + better-sqlite3, ESM), `web/` (React 18 + Vite + Tailwind v4 +
  TanStack Query v5, PWA PT-BR). Deploy: VPS Debian/CloudPanel + PM2 (`ecosystem.config.cjs`),
  processo único servindo API + `web/dist`.
- **Estética**: segue `DESIGN.md` (terminal PEDRO\RIVERA — IBM Plex Mono, preto/vermelho, raio de
  borda zero). Adoção intencional.

**Verify**: `test -f CLAUDE.md` → exit 0; leitura humana confirma as seções acima.

## Test plan
Os smoke tests provam que os dois runners funcionam (node e DOM). Os planos 006/007 adicionam os
testes reais. Nenhum teste de produção neste plano.

## Done criteria
- [ ] `npm test` (raiz) → exit 0, roda vitest em server e web
- [ ] `npm run typecheck` → exit 0
- [ ] `npm run verify` → exit 0
- [ ] `test -f server/vitest.config.ts && test -f web/vitest.config.ts && test -f CLAUDE.md` → exit 0
- [ ] `git status --short` mostra só arquivos in-scope
- [ ] Linha deste plano DONE em `plans/README.md`

## STOP conditions
- `happy-dom` não fornecer `localStorage` (Step 3 falha) — tente `jsdom` como alternativa; se ambos
  falharem, PARE e reporte.
- Vitest 2.x incompatível com a versão de Vite/Node instalada — reporte a incompatibilidade.
- `npm run build` quebrar após adicionar scripts (não deveria — scripts são aditivos).

## Maintenance notes
- Ao adicionar testes, siga `include` dos configs (`*.test.ts`/`*.test.tsx`).
- Se um dia entrar ESLint, adicione `lint` ao script `verify`.
- Revisor: conferir que os smoke tests não são o único teste ao fim dos planos 006/007.
