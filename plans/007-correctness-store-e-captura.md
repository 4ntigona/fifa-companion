# Plan 007: Robustez de store/captura — quota, atomicidade, counters, retry, objectURL

> **Executor instructions**: Siga passo a passo, rode cada verificação, só toque arquivos in-scope.
> STOP → pare e reporte. Ao terminar, atualize `plans/README.md`.
>
> **Drift check**: `git diff --stat feba0bf..HEAD -- web/src/store.ts web/src/pages/Capture.tsx web/src/pages/Prospects.tsx`

## Status
- **Priority**: P2
- **Effort**: M
- **Risk**: MED (mexe na persistência; se o plano 006 estiver pronto, os testes de caracterização protegem)
- **Depends on**: 002 (testes); idealmente 006 (caracterização antes de mexer)
- **Category**: correctness
- **Planned at**: commit `feba0bf`, 2026-07-08

## Why this matters
Cinco defeitos de correctness na camada de dados/captura: (1) `save()` não trata
`QuotaExceededError` — storage cheio vira erro cru e gravação parcial; (2) o `apply()` da captura
grava cada jogador+snapshot em `mutate` separados → falha no meio deixa jogador sem snapshot;
(3) `importBackup`/`restoreFromKey` confiam em `counters` do blob — um blob sem counters colide IDs
(jogadores/snapshots no registro errado); (4) `retry:false` está inconsistente entre páginas para
queries que lançam sincronamente; (5) `URL.createObjectURL` da captura nunca é revogado. Juntos,
são "perda/corrupção silenciosa de dados do usuário" — o pior tipo de bug para um app cujo valor é
justamente guardar o progresso da carreira.

## Current state
`web/src/store.ts`:
```ts
function emptyDb(): LocalDb { return { version: 1, counters: { career:0, player:0, snapshot:0, prospect:0 }, ... } }
function load() { try { ... return { ...emptyDb(), ...db, ai:{...}, sync:{...} } } catch { return emptyDb() } }
function save(db) { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)) }   // sem try/catch
```
`importBackup` (l. 407-415) e `restoreFromKey` (l. 455-469) fazem `save({ ...emptyDb(), ...data, ... })`
— se `data.counters` faltar, `emptyDb().counters` (zeros) prevalece → próximo `++counters.player`
gera id existente. IDs são atribuídos por `++db.counters.X` em `createCareerPlayer`/`addSnapshot`/etc.

`getCareerPlayer` (l. ~268): `const career = db.careers.find((c) => c.id === p.career_id)!` — non-null
assertion que mente se houver jogador órfão.

`web/src/pages/Capture.tsx` — `apply()` (l. 143-176): loop chamando `createCareerPlayer(...)` e depois
`addSnapshot(created.id, ...)` — **dois `mutate` por jogador**. `onFile` (l. 64-71):
`setPreview(URL.createObjectURL(file))` sem revogar; `onApplied` faz `setPreview(null)` sem
`revokeObjectURL`. Query `['career', id]` (l. 37-40) **sem** `retry:false`.

`web/src/pages/Prospects.tsx` — query `['career', id]` (l. ~24) **sem** `retry:false`. Contraste:
`Career.tsx` e `Player.tsx` já usam `retry:false` (plano 001).

Convenções: erros de domínio como `throw new Error('mensagem PT')`; `mutate()` é o ponto único de
escrita. Ambiente de teste: happy-dom (plano 002).

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Test web | `npm test --workspace web` | passa |
| Typecheck web | `npx tsc -p web/tsconfig.json --noEmit` | exit 0 |
| Build | `cd web && npx vite build` | files generated |

## Scope
**In scope:** `web/src/store.ts`, `web/src/pages/Capture.tsx`, `web/src/pages/Prospects.tsx`,
`web/src/store.test.ts` (estender).
**Out of scope:** `server/`; mudar o formato do blob (v1) — as correções são compatíveis; migração
de storage.

## Git workflow
Branch de `claude`; commits por defeito (`fix: trata QuotaExceededError em save`, `fix: apply da captura atômico`, `fix: recomputa counters no import/restore`, `fix: retry e objectURL na captura`). Não push/PR.

## Steps

### Step 1: `save()` trata QuotaExceededError com erro de domínio
Em `store.ts`, envolva o `setItem` em try/catch e lance mensagem clara:
```ts
function save(db: LocalDb) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)) }
  catch (e) {
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      throw new Error('Armazenamento local cheio. Exporte um backup e remova carreiras antigas para liberar espaço.')
    }
    throw e
  }
}
```
**Verify**: `npx tsc` exit 0; teste do Step 6 cobre.

### Step 2: `apply()` da captura atômico (um único mutate)
Em `Capture.tsx`, hoje o loop chama `createCareerPlayer`+`addSnapshot` por linha. Torne a operação
atômica adicionando ao `store.ts` uma função `applyCapturedPlayers(careerId, rows)` que faz TODA a
criação de jogadores+snapshots dentro de **um** `mutate()` (tudo ou nada), e chame-a no `apply()`.
Assinatura sugerida:
```ts
export function applyCapturedPlayers(careerId: number, rows: Array<{
  origin: 'youth'|'regen'|'generated'; name: string; positions: string; age?: number
  overallOriginal?: number; potentialOriginal?: number; notes?: string; jerseyNumber?: number
  status: string; inSquad: boolean
  snapshot?: { season: string; dateIngame?: string; overall?: number; potential?: number; position?: string; formNotes?: string }
}>): { created: number } { /* um único mutate: cria jogador, e se snapshot, cria snapshot */ }
```
Ajuste `apply()` em `Capture.tsx` para montar `rows` (com o `snapshot` embutido quando houver
overall/potential) e chamar `applyCapturedPlayers` uma vez. Assim, uma falha de quota não deixa
metade gravada.
**Verify**: `npx tsc` exit 0; manual: importar 3 jogadores por foto grava os 3 com seus snapshots.

### Step 3: Recomputar `counters` em load/import/restore
Adicione ao `store.ts` um helper que reconcilia counters com o maior id presente:
```ts
function reconcileCounters(db: LocalDb): LocalDb {
  db.counters.career = Math.max(db.counters.career ?? 0, ...db.careers.map(c => c.id), 0)
  db.counters.player = Math.max(db.counters.player ?? 0, ...db.careerPlayers.map(p => p.id), 0)
  db.counters.snapshot = Math.max(db.counters.snapshot ?? 0, ...db.snapshots.map(s => s.id), 0)
  db.counters.prospect = Math.max(db.counters.prospect ?? 0, ...db.prospects.map(p => p.id), 0)
  return db
}
```
Chame-o em `load()` (antes do return) e nos merges de `importBackup`/`restoreFromKey` (antes do
`save`). Isso impede colisão de IDs vindos de blob externo/malformado.
**Verify**: teste do Step 6 (blob com arrays populados e counters zerados não gera id duplicado).

### Step 4: Remover a non-null assertion perigosa
Em `getCareerPlayer`, troque `...find(...)!` por checagem: se a carreira não existir, lance o mesmo
erro tratado ('Jogador não encontrado' ou 'Carreira não encontrada') que a `Player.tsx` já renderiza
via `isError`. Evita crash de tela com dado órfão.
**Verify**: `npx tsc` exit 0.

### Step 5: `retry:false` consistente + revogar objectURL
- Em `Prospects.tsx` e `Capture.tsx`, adicione `retry: false` à query `['career', id]` (igual a
  Career/Player) — a `queryFn` lança sincronamente para id inexistente; retentar é inútil.
- Em `Capture.tsx`, guarde a URL do preview num ref e `URL.revokeObjectURL` ao substituir e no
  cleanup (`useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current) }, [])`).
**Verify**: `npx tsc` exit 0; `cd web && npx vite build` → files generated.

### Step 6: Testes
Estenda `web/src/store.test.ts`:
- `save()` lança o erro de domínio quando `localStorage.setItem` estoura (mocke setItem para lançar `DOMException('','QuotaExceededError')`).
- `applyCapturedPlayers` é atômico: se o segundo jogador falhar (forçar quota no meio), NENHUM é
  gravado (ou todos — o contrato é "tudo ou nada"; asserir o estado consistente).
- `importBackup`/`restoreFromKey` de um blob com `careerPlayers:[{id:5,...}]` e `counters.player:0`
  → após import, `createCareerPlayer` gera id > 5 (não colide).
**Verify**: `npm test --workspace web` → novos testes passam.

## Test plan
Ver Step 6. Se o plano 006 já existe, ATUALIZE os testes de caracterização que agora mudam de
comportamento (ex.: import com counters zerados antes deixava colidir; agora reconcilia). Deixe
claro no PR quais mudaram.

## Done criteria
- [ ] `npm test --workspace web` → passa, incl. os 3 novos casos
- [ ] `npx tsc -p web/tsconfig.json --noEmit` → exit 0
- [ ] `cd web && npx vite build` → exit 0
- [ ] `grep -n "QuotaExceededError" web/src/store.ts` → presente
- [ ] `grep -n "reconcileCounters" web/src/store.ts` → chamado em load/import/restore
- [ ] `grep -c "retry: false" web/src/pages/Prospects.tsx web/src/pages/Capture.tsx` → ≥1 em cada
- [ ] `git status --short` só arquivos in-scope
- [ ] `plans/README.md` atualizado

## STOP conditions
- Se tornar `apply()` atômico exigir mudar o shape de `createCareerPlayer`/`addSnapshot` de um jeito
  que quebre outros chamadores (Career.tsx AddPlayerModal, Player.tsx SnapshotModal) — mantenha
  essas APIs e adicione `applyCapturedPlayers` ao lado, sem removê-las. Se não der, PARE e reporte.
- Se os testes do plano 006 quebrarem por mudança de comportamento esperada — atualize-os; se
  quebrarem por algo inesperado, PARE.

## Maintenance notes
- `reconcileCounters` usa spread de arrays em `Math.max` — para arrays enormes (milhares) trocar por
  `reduce` (evita estourar o stack). Hoje o volume é pequeno; anotado.
- Interage com o plano 003 (não persistir chaves) — ambos tocam `store.ts`; se forem executados em
  paralelo, reconcilie os diffs.
- Revisor: confirmar que `applyCapturedPlayers` realmente usa um único `mutate` (senão a
  atomicidade é falsa).
