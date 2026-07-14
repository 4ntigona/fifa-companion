# Plan 010: Filtros de liga, nacionalidade e idade mínima na prospecção

> **Executor instructions**: Siga passo a passo, rode cada verificação. STOP → pare e reporte.
> Ao terminar, atualize `plans/README.md`.
>
> **Drift check**: `git diff --stat feba0bf..HEAD -- web/src/pages/Prospects.tsx server/src/routes/game-data.ts`

## Status
- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction (feature)
- **Planned at**: commit `feba0bf`, 2026-07-08

## Why this matters
A prospecção é a razão de existir do app ("garimpar joias na database original"), mas a UI não deixa
filtrar por **liga** nem **nacionalidade** — embora o servidor já aceite os dois (e `minAge`). É
pura assimetria de superfície: o backend está pronto e ocioso. Poder restringir a "Serie B" ou a uma
nacionalidade é o filtro mais óbvio que falta para caçar wonderkids no FIFA 16/22.

## Current state
`server/src/routes/game-data.ts` (linhas 100-115) — `/api/players/:version` já aceita `league`,
`nationality`, `minAge` (além dos que a UI usa):
```ts
if (minAge) { conds.push('age >= ?'); params.push(Number(minAge)) }
...
if (league) { conds.push('league_name = ?'); params.push(league) }
if (nationality) { conds.push('nationality_name = ?'); params.push(nationality) }
```
`web/src/pages/Prospects.tsx` — os filtros na UI (linhas 99-109) são só: `q`, `position`, `maxAge`,
`minOverall`, `minPotential`, `maxValue`. Os `params` enviados (montados mais acima, ~l.42-46) não
incluem `league`/`nationality`/`minAge`. Já há debounce (`useDebouncedValue`) e reset de `limit` ao
mudar filtro (plano 001/UX).

Endpoint de ligas já existe e é usado em `NewCareer.tsx`: `GET /api/leagues/:version` retorna
`{ countries: [{ country, leagues: [{ id, name, level, teams }] }] }`. Para nacionalidade não há
endpoint dedicado — mas a lista de países vem do mesmo `/api/leagues` (campo `country`).

Convenções: inputs `.input`; selects como os de `NewCareer.tsx`; debounce nos campos de texto;
padrão de `URLSearchParams` condicional já existente.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck web | `npx tsc -p web/tsconfig.json --noEmit` | exit 0 |
| Build | `cd web && npx vite build` | files generated |

## Scope
**In scope:** `web/src/pages/Prospects.tsx` (adicionar os 3 filtros + enviá-los nos params).
**Out of scope:** `server/` (já suporta — não mudar); criar endpoint de nacionalidades (reusar
`country` de `/api/leagues`); filtros combinados avançados.

## Git workflow
Branch de `claude`; commit `feat: filtros de liga/nacionalidade/idade-mín. na prospecção`. Não push/PR.

## Steps

### Step 1: Estado e query de ligas
Em `Prospects.tsx`, adicione estados `const [league, setLeague] = useState('')`,
`const [nationality, setNationality] = useState('')`, `const [minAge, setMinAge] = useState('')`.
Adicione uma query de ligas/países (padrão de `NewCareer.tsx`):
```ts
const { data: leaguesData } = useQuery({
  queryKey: ['leagues', version],
  queryFn: () => api<{ countries: { country: string; leagues: { id: number|null; name: string; level: number|null }[] }[] }>(`/api/leagues/${version}`),
  enabled: version != null,
})
```
Derive a lista de países (`countries.map(c => c.country)`) e a lista plana de ligas para o select.
**Verify**: `npx tsc -p web/tsconfig.json --noEmit` → exit 0.

### Step 2: Inputs na UI
No grid de filtros (l.99-109), adicione: um `<select>` de nacionalidade (opção vazia + países), um
`<select>` de liga (opção vazia + nomes de liga; pode listar todas as ligas de todos os países, ou
filtrar pelo país selecionado se houver — o mais simples é listar todas por nome), e um input
"Idade mín." (numérico, igual ao "Idade máx."). Use as classes `.input` existentes; ajuste o grid
para caber (ex.: `sm:grid-cols-3` já acomoda; ou passe para `sm:grid-cols-3` com mais linhas).
**Verify**: build ok; a tela mostra os novos controles.

### Step 3: Enviar nos params (com debounce onde for texto)
Aplique `useDebouncedValue` ao `minAge` (campo de texto), como os outros numéricos. Nos `params`,
adicione condicionalmente `league`, `nationality`, `minAge` (debounced). Inclua os novos valores no
`useEffect` que reseta o `limit` (para "carregar mais" reiniciar ao trocar filtro). `league`/
`nationality` vêm de select — podem ir sem debounce.
**Verify**: `npx tsc` exit 0; manual: escolher liga "Serie B" (FIFA 16) e ver a lista restringir;
escolher nacionalidade e idem; "Idade mín. 16 + máx. 19" combina.

## Test plan
Sem testes unitários novos (é UI + params; o servidor já é coberto pelo plano 009 se executado).
Verificação manual: com FIFA 22 importado, filtrar por liga (ex.: "Premier League"), por
nacionalidade (ex.: "Brazil"), e por idade mínima; confirmar no Network que os params
`league`/`nationality`/`minAge` são enviados e a contagem de resultados cai.

## Done criteria
- [ ] `npx tsc -p web/tsconfig.json --noEmit` → exit 0
- [ ] `cd web && npx vite build` → exit 0
- [ ] `grep -n "nationality\|league\|minAge" web/src/pages/Prospects.tsx` → estados e params presentes
- [ ] Manual: os 3 filtros afetam a lista de resultados
- [ ] `git status --short` só `Prospects.tsx`
- [ ] `plans/README.md` atualizado

## STOP conditions
- Se `/api/leagues/:version` retornar shape diferente do citado → confirme o shape real lendo a
  rota em `game-data.ts` antes de mapear.
- Se a database da versão não estiver importada, a query de ligas falha — trate como os outros
  estados de erro do app (o filtro fica vazio), não quebre a tela.

## Maintenance notes
- Se o plano 009 (projeção) landar, a lista continua trazendo `league_name`/`nationality_name`
  (estão em `LIST_COLS`) — os filtros não dependem de `attributes_json`.
- Revisor: conferir que os novos filtros entram no reset de `limit` (senão "carregar mais" mistura
  resultados de filtros diferentes).
