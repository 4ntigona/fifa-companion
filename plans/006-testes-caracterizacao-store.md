# Plan 006: Testes de caracterização de web/src/store.ts (persistência do usuário)

> **Executor instructions**: Siga passo a passo, rode cada verificação, só toque arquivos in-scope.
> STOP → pare e reporte. Ao terminar, atualize `plans/README.md`.
>
> **Drift check**: `git diff --stat feba0bf..HEAD -- web/src/store.ts`
> Se `store.ts` mudou, os testes devem refletir o comportamento ATUAL (é caracterização, não spec).

## Status
- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (só adiciona testes)
- **Depends on**: 002 (test runner + happy-dom)
- **Category**: tests
- **Planned at**: commit `feba0bf`, 2026-07-08

## Why this matters
`web/src/store.ts` é o banco de dados inteiro do usuário (carreiras, elencos, snapshots,
prospecção, chaves) num blob localStorage. Uma regressão = **perda silenciosa de dados**. O módulo
teve churn em vários commits e nunca teve teste. Estes testes de caracterização travam o
comportamento atual (invariantes de contadores, cascata de exclusão, contratar→elenco, round-trip
export/import) para que os refactors dos planos 003/007 sejam seguros.

## Current state
`web/src/store.ts` — funções síncronas sobre um `LocalDb` no localStorage. Estruturas-chave:
```ts
interface LocalDb {
  version: 1
  counters: { career: number; player: number; snapshot: number; prospect: number }
  careers: Career[]; careerPlayers: CareerPlayer[]; snapshots: Snapshot[]; prospects: Prospect[]
  ai: AiSettings; sync: SyncInfo
}
function load() { /* JSON.parse do blob; catch {} → emptyDb() (engole erro) */ }
function save(db) { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)) }
function mutate(fn) { const db = load(); const r = fn(db); save(db); return r }
```
Funções públicas a caracterizar (todas em `store.ts`): `createCareer` (async — busca elenco via
`api()`), `listCareers`, `getCareer` (lança 'Carreira não encontrada'), `updateCareer`,
`deleteCareer` (cascata: remove careerPlayers/snapshots/prospects da carreira), `createCareerPlayer`,
`listCareerPlayers`, `getCareerPlayer` (lança), `deleteCareerPlayer`, `addSnapshot`, `listProspects`,
`addProspect` (lança se duplicado), `updateProspect` (status 'contratado' copia jogador para o
elenco, idempotente por checagem de duplicado), `removeProspect`, `getAiSettings`/`setAiSettings`,
`exportBackup`/`importBackup`, `generateRestoreKey`/`restoreFromKey`/`removeRestoreKey`/`pushToRestoreKey`.

`createCareer` e as funções de sync chamam `api()` de `./api/client` (fazem `fetch`) — nos testes,
**mocke** `fetch` (ou o módulo `./api/client`). As demais são puras sobre localStorage.

Ambiente de teste (do plano 002): `web/vitest.config.ts` com `environment: 'happy-dom'` → há
`localStorage`. Padrão de teste: `beforeEach(() => localStorage.clear())`.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Test web | `npm test --workspace web` | novos testes passam |
| Typecheck web | `npx tsc -p web/tsconfig.json --noEmit` | exit 0 |

## Scope
**In scope:** `web/src/store.test.ts` (criar; se o plano 003 já criou, ESTENDA o mesmo arquivo).
**Out of scope:** modificar `web/src/store.ts` (é caracterização — se um teste revelar bug, NÃO
conserte aqui; anote no relatório para virar/were-plano 007). Qualquer outro arquivo de produção.

## Git workflow
Branch de `claude`; commit `test: caracteriza web/src/store.ts`. Não push/PR.

## Steps

### Step 1: Setup e mock de api()
Crie `web/src/store.test.ts`. Faça `vi.mock('./api/client', ...)` retornando um `api()` controlável
(ou `vi.stubGlobal('fetch', ...)`), e `beforeEach(() => localStorage.clear())`. Para `createCareer`,
o mock de `api('/api/team/:v/:id')` deve devolver `{ team: {...}, players: [ {player_id, short_name,
positions, age, overall, potential, ...} ] }` — um elenco fake de 2-3 jogadores.
**Verify**: `npm test --workspace web` roda o arquivo (mesmo que só com 1 teste inicial).

### Step 2: Caracterizar CRUD de carreira + cascata
Testes:
- `createCareer` (time existente) cria a carreira e copia o elenco para `careerPlayers` com
  `origin:'sofifa'`, e retorna `{ id, squadLoaded: N }`.
- `getCareer(idInexistente)` lança erro (mensagem 'Carreira não encontrada').
- `deleteCareer(id)` remove a carreira E seus `careerPlayers`, `snapshots` (dos jogadores dela) e
  `prospects` — asserir que os arrays ficam sem nenhum item daquela carreira.
**Verify**: `npm test --workspace web` → passam.

### Step 3: Caracterizar contratar→elenco (idempotência) e snapshots
- `addProspect` duas vezes o mesmo jogador → segunda lança 'já está na shortlist'.
- `updateProspect(pid, { status: 'contratado' })` cria um `careerPlayer` origin `sofifa`; chamar de
  novo NÃO duplica (a checagem de existência em `store.ts` segura isso) — travar com asserção.
- `addSnapshot(playerId, {...})` anexa ao jogador certo; `getCareerPlayer` retorna os snapshots dele.
**Verify**: passam.

### Step 4: Round-trip export/import e restore, e o comportamento de `load()` inválido
- Popular estado, `importBackup(File)` com um blob válido substitui o estado e retorna as contagens.
- `importBackup` com blob inválido (`version !== 1`) lança e **NÃO** apaga o estado atual — asserir
  que os dados anteriores continuam.
- Blob corrompido no localStorage → `load()` (indireto via qualquer getter) retorna estado vazio
  sem lançar (documentar esse "catch engole erro" como comportamento atual conhecido).
- Se o plano 003 já landou: asserir que o payload de sync/export NÃO contém `ai.keys` (senão, esse
  teste vira parte do 003).
**Verify**: passam; `npx tsc -p web/tsconfig.json --noEmit` → exit 0.

## Test plan
Este plano É o test plan. Cobertura mínima: create/get/delete carreira + cascata; contratar
idempotente; addSnapshot; import válido/inválido; load() de blob corrompido. Modele o estilo em
`web/src/smoke.test.ts` (criado no plano 002).

## Done criteria
- [ ] `npm test --workspace web` → todos passam, incluindo ≥8 novos casos em `store.test.ts`
- [ ] `npx tsc -p web/tsconfig.json --noEmit` → exit 0
- [ ] `web/src/store.ts` NÃO foi modificado (`git status --short` só mostra `store.test.ts`)
- [ ] `plans/README.md` atualizado

## STOP conditions
- Se um teste não passar porque o comportamento atual é um bug (ex.: cascata deixa órfãos, counters
  colidem no import) — **NÃO conserte o código**. Marque o teste com `it.todo`/`it.skip` + comentário
  e reporte o bug (ele é o plano 007). Caracterização documenta o que É, não o que deveria ser.
- Se `createCareer` for difícil de mockar por acoplamento a `api()` — reporte; pode exigir extrair o
  fetch, o que é fora de escopo aqui.

## Maintenance notes
- Quando o plano 007 corrigir counters/quota, estes testes de caracterização devem ser
  ATUALIZADOS para o novo comportamento correto (deixe claro no PR quais mudaram e por quê).
- Revisor: garantir que os testes não dependem de ordem de execução nem de rede real (fetch mockado).
