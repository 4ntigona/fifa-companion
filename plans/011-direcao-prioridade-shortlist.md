# Plan 011: Prioridade da shortlist (alta/média/baixa) com ordenação

> **Executor instructions**: Siga passo a passo, rode cada verificação. STOP → pare e reporte.
> Ao terminar, atualize `plans/README.md`.
>
> **Drift check**: `git diff --stat feba0bf..HEAD -- web/src/pages/Prospects.tsx web/src/store.ts`

## Status
- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction (feature)
- **Planned at**: commit `feba0bf`, 2026-07-08

## Why this matters
O campo `priority` da shortlist existe ponta a ponta — `prospects.priority` no schema (`1 alta,
2 média, 3 baixa`, default 2), `updateProspect` já grava `priority` no store, e a mutation em
`Prospects.tsx` já tipa `priority?: number` — mas **nenhuma UI** lê ou seta, e a lista não ordena
por ele. Uma shortlist de 30 prospectos sem triagem é só uma lista. Toda a fiação está pronta;
falta o controle e a ordenação.

## Current state
`web/src/store.ts` — `updateProspect(id, { status?, notes?, priority? })` grava `priority`
(`if (patch.priority) pr.priority = patch.priority`). `Prospect` tem `priority: number`.
`web/src/pages/Prospects.tsx`:
- `updateProspect` mutation (l.~52-59) já aceita `priority?: number`.
- A renderização de cada item da shortlist (l.174-197) mostra nome, posições/idade/valor, overall→
  potencial, botões de status (`STATUS_LABEL`) e "Remover" — **sem** prioridade.
- `prospects` é renderizado na ordem que vem de `listProspects` (sem ordenação por prioridade).

Convenções: botões `pill-tab`/`pill-tab-active` para seleção (como os de status na mesma lista);
`updateProspect.mutate({ pid, ... })` já é o caminho.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck web | `npx tsc -p web/tsconfig.json --noEmit` | exit 0 |
| Build | `cd web && npx vite build` | files generated |

## Scope
**In scope:** `web/src/pages/Prospects.tsx` (controle de prioridade + ordenação). Se `updateProspect`
do store não persistir `priority` corretamente, `web/src/store.ts` (mas ele já persiste — confirme).
**Out of scope:** servidor (a shortlist é localStorage); mudar o schema.

## Git workflow
Branch de `claude`; commit `feat: prioridade da shortlist com ordenação`. Não push/PR.

## Steps

### Step 1: Controle de prioridade por item
Na renderização de cada prospecto (l.174-197), adicione uma linha de 3 pílulas de prioridade
(Alta=1, Média=2, Baixa=3), no padrão dos botões de status:
```tsx
const PRIORITY = [[1, '🔴 Alta'], [2, '🟡 Média'], [3, '⚪ Baixa']] as const
...
<div className="mt-2 flex flex-wrap items-center gap-1.5">
  {PRIORITY.map(([p, label]) => (
    <button key={p} onClick={() => updateProspect.mutate({ pid: pr.id, priority: p })}
      className={`${pr.priority === p ? 'pill-tab-active' : 'pill-tab'} px-3 py-1 text-[13px]`}>
      {label}
    </button>
  ))}
</div>
```
(Reuse o `updateProspect` existente — já invalida as queries certas.)
**Verify**: `npx tsc -p web/tsconfig.json --noEmit` → exit 0.

### Step 2: Ordenar a shortlist por prioridade
Antes de `prospects.map(...)`, ordene por prioridade (1→3) e, dentro da mesma prioridade, mantenha
a ordem atual (estável):
```ts
const sortedProspects = [...prospects].sort((a, b) => a.priority - b.priority)
```
Use `sortedProspects` no `.map`. Opcional: exibir um selo de prioridade no cabeçalho do item.
**Verify**: build ok; manual: marcar um prospecto como Alta o move para o topo; recarregar mantém
(persistiu no localStorage).

## Test plan
Sem testes unitários novos obrigatórios. Se o plano 006/002 estiver pronto, um teste em
`store.test.ts` confirmando que `updateProspect(pid, { priority: 1 })` persiste é bem-vindo (barato).
Manual: setar prioridades diferentes, recarregar a página, conferir ordenação e persistência.

## Done criteria
- [ ] `npx tsc -p web/tsconfig.json --noEmit` → exit 0
- [ ] `cd web && npx vite build` → exit 0
- [ ] `grep -n "priority" web/src/pages/Prospects.tsx` → controle + ordenação presentes
- [ ] Manual: prioridade persiste após reload e a lista ordena por ela
- [ ] `git status --short` só arquivos in-scope
- [ ] `plans/README.md` atualizado

## STOP conditions
- Se `updateProspect` do store NÃO persistir `priority` (contrário ao esperado) — conserte no store
  (é in-scope) e anote; se a mudança no store for maior que trivial, reporte.

## Maintenance notes
- Se um dia a shortlist crescer muito, considerar filtro por prioridade também.
- Revisor: confirmar que a ordenação é estável (não embaralha itens de mesma prioridade a cada render).
