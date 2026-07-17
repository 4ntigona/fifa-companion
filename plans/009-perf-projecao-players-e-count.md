# Plan 009: Enxugar /api/players — projeção de colunas, dedup do COUNT, reidratação sob demanda

> **Executor instructions**: Siga passo a passo, rode cada verificação. STOP → pare e reporte.
> Ao terminar, atualize `plans/README.md`.
>
> **Drift check**: `git diff --stat feba0bf..HEAD -- server/src/routes/game-data.ts web/src/pages/Prospects.tsx web/src/store.ts web/src/api/client.ts`

## Status
- **Priority**: P2
- **Effort**: M
- **Risk**: MED (a lista de busca perde `attributes_json`; contratar/adicionar precisa reidratar)
- **Depends on**: none (mas 002/006 ajudam a proteger a mudança no store)
- **Category**: performance
- **Planned at**: commit `feba0bf`, 2026-07-08

## Why this matters
`GET /api/players/:version` faz `SELECT *` (inclui `attributes_json` — JSON de 30+ atributos por
jogador) e devolve até 200 linhas por busca, mas a lista de prospecção só usa 8 campos. Além disso,
roda um segundo `SELECT COUNT(*)` com o mesmo WHERE (dois full-scans de ~19k linhas por request). É
o maior componente do payload da busca e é puro over-fetch. Enxugar a projeção e evitar o COUNT
redundante corta banda e CPU do servidor por busca — que é a tela mais usada do app.

## Current state
`server/src/routes/game-data.ts` (linhas 99-131):
```ts
const where = conds.join(' AND ')
const rows = db.prepare(`SELECT * FROM sofifa_players WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(...params, lim, off)
const total = (db.prepare(`SELECT COUNT(*) AS c FROM sofifa_players WHERE ${where}`).get(...params) as { c: number }).c
return { players: rows, total }
```
`where`/`params` são montados com bind params (seguro). `SofifaPlayer` (`web/src/api/client.ts`
l.50-76) inclui `attributes_json: string` e os 6 campos pace/shooting/etc.

`web/src/pages/Prospects.tsx` — a lista (l.124-146) usa `short_name, positions, age, club_name,
league_name, value_eur, overall, potential`. Ao clicar "+ Shortlist", chama
`addProspect.mutate(p)` passando o objeto `SofifaPlayer` inteiro para `store.addProspect`, que o
copia para o localStorage (`prospects[].player`). `updateProspect(contratado)` copia esse `player`
para o elenco. A tela do jogador (`Player.tsx`) lê `p.sofifa.attributes_json` da cópia local.

Já existe `GET /api/player/:version/:playerId` (`game-data.ts:133`) que devolve o registro completo
(reidratação).

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npm run typecheck` (raiz, após 002) ou os 2 `tsc` | exit 0 |
| Test | `npm test --workspace server && npm test --workspace web` | passa |
| Build | `npm run build` | exit 0 |

## Scope
**In scope:** `server/src/routes/game-data.ts` (projeção na busca; dedup do COUNT), `web/src/pages/Prospects.tsx`
(reidratar o jogador completo ao adicionar à shortlist), possivelmente `web/src/store.ts`/`web/src/api/client.ts`
(tipo do item de lista mais enxuto). Testes correspondentes.
**Out of scope:** `/api/teams/:version` (pode receber o mesmo tratamento depois — anote, não faça
aqui para manter o plano focado); FTS5/índice de nome (é investigação separada — o `LIKE '%q%'`
fica como está, protegido pelo debounce e teto de 200).

## Git workflow
Branch de `claude`; commits `perf(api): projeção de colunas na busca de jogadores` e `perf(api): não recomputar COUNT redundante`. Não push/PR.

## Steps

### Step 1: Projetar só as colunas usadas na lista de busca
Em `game-data.ts`, defina a lista de colunas exibidas e use na busca:
```ts
const LIST_COLS = 'fifa_version, player_id, short_name, long_name, positions, overall, potential, value_eur, age, club_name, league_name, nationality_name'
const rows = db.prepare(`SELECT ${LIST_COLS} FROM sofifa_players WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(...params, lim, off)
```
(NÃO interpole dados do usuário — `LIST_COLS` é literal constante; `where`/`orderBy` já são
allowlist/bind.) `/api/player/:version/:id` continua `SELECT *` para a reidratação completa.
**Verify**: `npx tsc -p server/tsconfig.json --noEmit` → exit 0.

### Step 2: Reidratar o jogador completo ao adicionar à shortlist / contratar
Como a lista agora não traz `attributes_json` nem pace/sho/…, o fluxo de "adicionar à shortlist" (e,
por consequência, contratar → elenco) precisa buscar o registro completo antes de gravar no
localStorage. Em `Prospects.tsx`, no `addProspect`, faça:
```ts
const addProspect = useMutation({
  mutationFn: async (p: SofifaPlayerListItem) => {
    const full = await api<{ player: SofifaPlayer }>(`/api/player/${version}/${p.player_id}`)
    return addProspectStore(Number(id), full.player)
  },
  ...
})
```
Assim o localStorage continua guardando o `SofifaPlayer` completo (a tela do jogador segue lendo
`attributes_json`). Ajuste os tipos: crie `SofifaPlayerListItem` (subset) em `client.ts` para o
retorno da busca, mantendo `SofifaPlayer` (completo) para `/api/player`.
**Verify**: `npx tsc -p web/tsconfig.json --noEmit` → exit 0; manual: adicionar à shortlist e abrir a
tela do jogador contratado mostra os atributos completos.

### Step 3: Não recomputar o COUNT quando desnecessário
O `total` só muda quando os filtros mudam, não quando o `limit`/`offset` (paginação "carregar mais")
muda. Como a query key da busca inclui `limit`, cada "carregar mais" refaz o COUNT à toa. Opções
(escolha a mais simples que o executor conseguir verificar):
- **A (servidor)**: aceitar um query param `withCount=0` e, quando ausente/0, pular o COUNT (o
  cliente pede `withCount=1` só na primeira página de um conjunto de filtros). Retornar `total: null`
  quando não calculado; o cliente memoiza o último `total` conhecido.
- **B (uma query)**: usar `COUNT(*) OVER()` como coluna na própria query de linhas (SQLite 3.25+
  suporta window functions; better-sqlite3 traz SQLite recente) e ler `total` da primeira linha —
  elimina o segundo scan sempre.
Prefira **B** (mais simples de verificar, sem mudar o protocolo). Ex.:
`SELECT ${LIST_COLS}, COUNT(*) OVER() AS _total FROM ... LIMIT ? OFFSET ?`; `total = rows[0]?._total ?? 0`;
remova `_total` de cada row antes de responder.
**Verify**: teste do Step 4; manual: a resposta ainda traz `total` correto.

### Step 4: Testes (se 002 pronto)
`server/src/routes/game-data.test.ts` com SQLite `:memory:` + `schema.sql` + alguns
`sofifa_players` fake: a busca retorna só as colunas projetadas (sem `attributes_json`), o `total`
está correto com filtros, e `/api/player/:v/:id` traz `attributes_json`.
**Verify**: `npm test --workspace server` → passa.

## Test plan
- Server: projeção não inclui `attributes_json`; `total` correto (via `COUNT(*) OVER()`).
- Web: mockar `/api/player/:v/:id` e asserir que `addProspect` reidrata antes de gravar (o objeto no
  store tem `attributes_json`).
- Manual: buscar, adicionar à shortlist, contratar, abrir o jogador → atributos completos visíveis;
  no Network, o payload da busca encolheu.

## Done criteria
- [ ] `npm run typecheck` → exit 0
- [ ] `npm test --workspace server` → passa (se 002 pronto)
- [ ] `npm run build` → exit 0
- [ ] `grep -n "SELECT \*" server/src/routes/game-data.ts` → só na rota `/api/player/:playerId` (não na busca)
- [ ] `grep -n "OVER()" server/src/routes/game-data.ts` (se escolheu B) → presente
- [ ] Manual: tela do jogador contratado mostra atributos completos (reidratação ok)
- [ ] `git status --short` só arquivos in-scope
- [ ] `plans/README.md` atualizado

## STOP conditions
- Se `COUNT(*) OVER()` não for suportado pela versão de SQLite do better-sqlite3 instalado (teste
  rápido: `SELECT COUNT(*) OVER()` numa query) → use a opção A (withCount) e reporte.
- Se remover `attributes_json` da lista quebrar alguma tela que dependia dele fora do fluxo de
  reidratação (grep por `attributes_json` no web) → PARE e reporte; a reidratação do Step 2 deve
  cobrir todos os caminhos.

## Maintenance notes
- Aplicar a mesma projeção a `/api/teams/:version` depois (mesmo padrão, menor impacto).
- Se no futuro subir o teto de 200 ou adicionar scroll infinito, revisitar o COUNT.
- Revisor: garantir que NENHUM dado do usuário entra na string SQL (só `LIST_COLS` literal + binds).
