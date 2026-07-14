# Plan 018: Comparação lado a lado de 2 prospectos da shortlist

> **Executor instructions**: Siga passo a passo, rode cada verificação. STOP → pare e reporte.
> Ao terminar, atualize a linha deste plano em `plans/README.md`.
>
> **Drift check (rode primeiro)**: `git diff --stat fe420d4..HEAD -- web/src/pages/Prospects.tsx web/src/api/client.ts web/src/store.ts`
> Se algum arquivo in-scope mudou desde fe420d4, compare os excertos de "Current state" com o
> código vivo antes de prosseguir; divergência = STOP. (Exceção esperada: se o plano 015 já rodou,
> `Prospects.tsx` mudou nas linhas do card de erro — isso é ok; o que importa é a aba shortlist.)

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (feature aditiva, só leitura de dados já locais; nenhuma mudança de servidor)
- **Depends on**: 015 recomendado (usa o `Modal` compartilhado; sem ele, use o padrão de modal inline existente — ver Step 3)
- **Category**: direction (feature)
- **Planned at**: commit `fe420d4`, 2026-07-14

## Why this matters

A prospecção é o coração do produto ("garimpar joias na database original"), e a pergunta central
do usuário na shortlist é "qual dos dois eu contrato?". Hoje ele alterna entre cards de memória.
A decisão de design (tomada pelo dono em 2026-07-14, após auditoria): comparar **2 prospectos da
shortlist**, porque `Prospect.player` já guarda o `SofifaPlayer` completo no localStorage
(reidratado ao adicionar — plano 009), então a comparação custa **zero fetches** e zero mudança
de servidor. Formas mais ambiciosas (comparar com o elenco, comparar da busca) ficam como
extensão futura — ver Maintenance notes.

## Current state

- `web/src/api/client.ts` — `Prospect` (interface, ~linha 149):
  ```ts
  export interface Prospect {
    id: number
    career_id: number
    sofifa_player_id: number
    status: 'observando' | 'negociando' | 'contratado' | 'descartado'
    priority: number
    notes: string | null
    player?: SofifaPlayer   // ← completo: pace/shooting/…/attributes_json
  }
  ```
  `SofifaPlayer` (~linha 68) tem `overall, potential, value_eur, wage_eur, age, positions,
  club_name, league_name, nationality_name, preferred_foot, weak_foot, skill_moves, pace,
  shooting, passing, dribbling, defending, physic, attributes_json` (string JSON com 30+ atributos).
- `web/src/store.ts` — `addProspect` grava `player` completo (o chamador em Prospects.tsx
  reidrata via `/api/player/:v/:id` antes — não mexer nesse fluxo).
- `web/src/pages/Prospects.tsx`:
  - Aba shortlist: `{tab === 'shortlist' && (` na linha ~205; `sortedProspects.map((pr) => (` na
    linha ~212. Cada card mostra nome, posições/idade/valor, `overall → potential`, pílulas de
    prioridade (`PRIORITY`, linha 12), pílulas de status (`STATUS_LABEL`, linha 9-11), botão
    Remover e `NotesEditor`.
  - Padrão de pílula de seleção: `className={cond ? 'pill-tab-active' : 'pill-tab'}` — usado em
    abas, sort, prioridade e status. Reuse para o toggle de seleção da comparação.
- `web/src/pages/Player.tsx:78-87` — o grid de 6 stats a imitar (labels PT: PAC/SHO/PAS/DRI/DEF/FIS):
  ```tsx
  <div className="mt-3 grid grid-cols-3 gap-1 text-[13px] text-charcoal sm:grid-cols-6">
    <div>PAC <b>{p.sofifa.pace ?? '—'}</b></div>
    ...
  ```
- `Player.tsx:156-169` — o renderer de `attributes_json` a imitar (details/summary, entries
  filtradas de vazio/null, `key.replace(/_/g, ' ')`).
- Modal: se o plano 015 já rodou, existe `web/src/components/Modal.tsx` (props
  `{ onClose, ariaLabel?, role?, children }`). Senão, o padrão inline é o par de divs de
  `ConfirmDialog.tsx:19-22` (overlay `fixed inset-0 z-50 ...` + inner `role="dialog"` com
  `stopPropagation`) + `useEscapeClose` de `web/src/hooks.ts:14`.
- Design (DESIGN.md — decidido): raio de borda ZERO, IBM Plex Mono, preto/vermelho. Classes de
  valor: `text-success` (verde, usado para overall), `text-stone`/`text-steel` para secundário.
- Mobile-first (~380px, CLAUDE.md): duas colunas de card completas não cabem — o layout da
  comparação deve ser **linha por atributo**: `valor A | rótulo | valor B` (grid de 3 colunas),
  não dois cards lado a lado.
- Produto (CLAUDE.md, invariante): dados reais, nunca inventados — atributo ausente renderiza
  `—`, nunca um valor calculado.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck web | `npx tsc -p web/tsconfig.json --noEmit` | exit 0 |
| Testes web | `npm test --workspace web` | todos passam |
| Build | `cd web && npx vite build` | files generated |
| Verify completo | `npm run verify` | exit 0 |

## Scope

**In scope** (únicos arquivos a modificar):
- `web/src/pages/Prospects.tsx` (modo de seleção + abertura da comparação)
- `web/src/components/CompareProspects.tsx` (criar — a view de comparação)

**Out de scope** (não toque):
- `server/` — nada de novo endpoint; os dados já estão no localStorage.
- Comparar jogador do elenco ou resultado de busca — extensão futura (ver Maintenance notes).
- `web/src/store.ts` — nenhuma mudança de dados; a comparação é só leitura.
- Recharts/gráfico radar — fora; a comparação é textual/numérica (mantém o chunk leve).

## Git workflow

- Branch: `claude` (continuar nela).
- Um commit: `feat: comparação lado a lado de 2 prospectos da shortlist`.
- Não fazer push nem PR.

## Steps

### Step 1: Modo de seleção na aba shortlist

Em `Prospects.tsx`, adicione estado:

```ts
const [compareIds, setCompareIds] = useState<number[]>([])   // ids de Prospect, máx. 2
const [showCompare, setShowCompare] = useState(false)
```

No topo da aba shortlist (logo após `{tab === 'shortlist' && (`), quando `prospects.length >= 2`,
renderize uma barra de comparação:

```tsx
<div className="flex items-center gap-2 text-[13px] text-steel">
  <span>Comparar:</span>
  {compareIds.length === 2
    ? <button onClick={() => setShowCompare(true)} className="btn-primary px-3 py-1.5 text-[13px]">Comparar selecionados</button>
    : <span>selecione {2 - compareIds.length} jogador(es) abaixo</span>}
  {compareIds.length > 0 && (
    <button onClick={() => setCompareIds([])} className="btn-secondary px-3 py-1.5 text-[13px]">Limpar</button>
  )}
</div>
```

Em cada card do `sortedProspects.map`, adicione uma pílula de seleção (junto às pílulas de
prioridade ou no cabeçalho do card):

```tsx
<button
  onClick={() => setCompareIds((ids) =>
    ids.includes(pr.id) ? ids.filter((i) => i !== pr.id)
    : ids.length < 2 ? [...ids, pr.id] : ids)}
  disabled={!pr.player}
  className={`${compareIds.includes(pr.id) ? 'pill-tab-active' : 'pill-tab'} px-3 py-1 text-[13px]`}>
  {compareIds.includes(pr.id) ? '✓ Comparando' : '⚖ Comparar'}
</button>
```

(`disabled={!pr.player}` — prospectos antigos sem `player` completo não são comparáveis; o
tooltip/estado disabled basta.)

**Verify**: `npx tsc -p web/tsconfig.json --noEmit` → exit 0.

### Step 2: Componente `CompareProspects`

Crie `web/src/components/CompareProspects.tsx`. Props:

```ts
{ a: SofifaPlayer; b: SofifaPlayer; onClose: () => void }
```

Estrutura (linha por atributo, mobile-first):

1. Cabeçalho: dois nomes lado a lado (grid-cols-2), cada um com posições/idade/clube/valor
   (`fmtEur` de `../api/client`).
2. Linhas principais (grid `grid-cols-[1fr_auto_1fr]`, valor A | rótulo central | valor B):
   OVR, POT, e as 6 stats (PAC/SHO/PAS/DRI/DEF/FIS), depois Pé, Pé ruim (★), Skills (★),
   Valor, Salário.
3. Destaque do maior valor numérico da linha com `text-success font-semibold`; empate = ambos
   neutros; ausente = `—` (nunca inventar — invariante do produto).
4. Bloco opcional `<details>` "Todos os atributos" comparando as chaves da UNIÃO dos dois
   `attributes_json` (parse com try/catch; ausente = `—`), seguindo o renderer de
   `Player.tsx:156-169`.

Helper sugerido dentro do componente:

```tsx
function Row({ label, a, b, higherIsBetter = true }: { label: string; a: number | string | null | undefined; b: number | string | null | undefined; higherIsBetter?: boolean }) {
  const na = typeof a === 'number' ? a : null
  const nb = typeof b === 'number' ? b : null
  const aWins = na != null && nb != null && (higherIsBetter ? na > nb : na < nb)
  const bWins = na != null && nb != null && (higherIsBetter ? nb > na : nb < na)
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-hairline-soft py-1 text-sm">
      <span className={`text-right ${aWins ? 'font-semibold text-success' : 'text-charcoal'}`}>{a ?? '—'}</span>
      <span className="text-[11px] uppercase tracking-wide text-steel">{label}</span>
      <span className={`${bWins ? 'font-semibold text-success' : 'text-charcoal'}`}>{b ?? '—'}</span>
    </div>
  )
}
```

Contêiner: use o `Modal` do plano 015 se existir (`import Modal from './Modal'`); senão, copie o
padrão overlay/dialog de `ConfirmDialog.tsx:19-22` + `useEscapeClose`. Título acessível:
`ariaLabel={\`Comparação: ${a.short_name} × ${b.short_name}\`}`.

**Verify**: `npx tsc -p web/tsconfig.json --noEmit` → exit 0.

### Step 3: Ligar em Prospects.tsx

Renderize no fim da página (padrão dos outros modais):

```tsx
{showCompare && compareIds.length === 2 && (() => {
  const [pa, pb] = compareIds.map((cid) => prospects.find((p) => p.id === cid)?.player)
  return pa && pb ? <CompareProspects a={pa} b={pb} onClose={() => setShowCompare(false)} /> : null
})()}
```

**Verify**: `cd web && npx vite build` → exit 0.

### Step 4: Verificação manual no browser

Com o dev server (`.claude/launch.json`: `server` + `web`) e uma carreira com ≥2 prospectos na
shortlist (adicione pela busca se preciso):
1. A barra "Comparar:" aparece na aba shortlist com ≥2 prospectos.
2. Selecionar 2 → botão "Comparar selecionados" ativa; selecionar um 3º não entra (máx. 2).
3. A comparação abre: linhas OVR/POT/6 stats com o maior valor de cada linha em verde; `—` onde
   faltar dado.
4. Escape e click-fora fecham; "Limpar" reseta a seleção.
5. Mobile (viewport ~380px): as linhas não estouram horizontalmente.

**Verify**: os 5 checks acima; `npm run verify` → exit 0.

## Test plan

Sem testes unitários novos obrigatórios (feature de leitura/UI; o projeto não tem testes de
componente). Opcional barato: um teste puro da lógica de "quem vence a linha" se o executor
extraí-la para função exportada. A verificação principal é o Step 4.

## Done criteria

- [ ] `npm run verify` → exit 0
- [ ] `grep -n "CompareProspects" web/src/pages/Prospects.tsx` → import + uso
- [ ] Manual (Step 4): seleção máx. 2, comparação renderiza, `—` para ausentes, mobile ok
- [ ] Zero requests novos ao servidor no fluxo de comparação (verificar no Network tab)
- [ ] `git status --short` só arquivos in-scope
- [ ] `plans/README.md` atualizado

## STOP conditions

- Se `Prospect.player` não contiver os 6 stats/attributes_json em prospectos de teste — verifique
  se foram adicionados ANTES do plano 009 (reidratação); prospectos antigos podem ser subset.
  Nesse caso o `disabled={!pr.player}` do Step 1 precisa também checar `pr.player.attributes_json`
  — ajuste e siga; se o problema for outro, STOP.
- Se a aba shortlist tiver mudado estruturalmente desde fe420d4 (drift além do plano 015) — STOP.
- Se o layout linha-por-atributo estourar em 380px mesmo com `text-sm` — reporte com screenshot
  em vez de improvisar um redesign.

## Maintenance notes

- Extensões futuras naturais (fora deste plano): (a) comparar prospecto × jogador do ELENCO
  ("ele é melhor que quem eu tenho?") — exige tratar jogadores youth/regen/generated sem stats
  (células "indisponível"); (b) comparar 2 resultados da BUSCA — exige 2 reidratações
  via `/api/player/:v/:id` (padrão já existe em `addProspect`). O `CompareProspects` recebe dois
  `SofifaPlayer` puros justamente para essas extensões reutilizarem o componente.
- Revisor: conferir que nenhum valor é calculado/inventado para células ausentes (invariante do
  produto) e que o chunk do Recharts NÃO entrou no bundle da prospecção.
