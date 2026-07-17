# Plan 013: Ciclo de vida do jogador (titular/reserva/emprestado/vendido) editável

> **Executor instructions**: Siga passo a passo, rode cada verificação. STOP → pare e reporte.
> Ao terminar, atualize `plans/README.md`.
>
> **Drift check**: `git diff --stat feba0bf..HEAD -- web/src/pages/Player.tsx web/src/pages/Career.tsx web/src/store.ts`

## Status
- **Priority**: P3
- **Effort**: M
- **Risk**: LOW (mudanças locais ao localStorage; mas os filtros de aba em Career dependem de status)
- **Depends on**: none
- **Category**: direction (feature)
- **Planned at**: commit `feba0bf`, 2026-07-08

## Why this matters
O produto é "gerenciar jogadores ao longo da carreira", mas o jogador é **imutável** depois de
criado: o enum de `status` promete `elenco | titular | reserva | emprestado | vendido | base`, e
`career_players.in_squad` existe — mas só `elenco`/`base`/`emprestado` são usados (este último
apenas auto-derivado na importação), e **nada** permite ao usuário mudar status, marcar retorno de
empréstimo, vender (tirar do elenco) ou separar titular/reserva. É intenção declarada não entregue.

## Current state
`web/src/store.ts`:
- `CareerPlayer.status` é `string`; `in_squad: number` (0/1).
- Existe `updateCareerPlayer`? Verifique: se **não** existir uma função para editar status/in_squad,
  ela precisa ser criada (o store tem `createCareerPlayer`, `deleteCareerPlayer`, mas confirme se há
  update de status). Padrão de update no store: dentro de `mutate`, achar por id e alterar campos.
- `deleteCareerPlayer(id)` já existe.

`web/src/pages/Career.tsx`:
- Filtros de aba (perto de onde `squad`/`youth` são derivados): `squad = players.filter(p => p.in_squad && !['base'].includes(p.status))`; `youth = players.filter(p => p.origin==='youth' || p.origin==='regen' || p.status==='base')`.
- Tag "empréstimo" aparece quando `status === 'emprestado'`.

`web/src/pages/Player.tsx` — página de detalhe do jogador (tem SnapshotModal, atributos). É o lugar
natural para o seletor de status.

Convenções: `.pill-tab` para seleção; `updateCareer`/mutations via TanStack Query invalidando
`['career-players', id]` e `['career-player', id]`.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck web | `npx tsc -p web/tsconfig.json --noEmit` | exit 0 |
| Build | `cd web && npx vite build` | files generated |
| Test web | `npm test --workspace web` | passa (se 002 pronto) |

## Scope
**In scope:** `web/src/store.ts` (função `updateCareerPlayer` se ausente), `web/src/pages/Player.tsx`
(seletor de status/in_squad), `web/src/pages/Career.tsx` (filtros de aba tratando os novos status).
**Out of scope:** servidor; histórico de transferências (só o status atual); automações (ex.: data
de retorno de empréstimo) — anotar como futuro.

## Git workflow
Branch de `claude`; commit `feat: ciclo de vida do status do jogador editável`. Não push/PR.

## Steps

### Step 1: `updateCareerPlayer` no store (se ausente)
Garanta uma função:
```ts
export function updateCareerPlayer(id: number, patch: { status?: string; inSquad?: boolean; jerseyNumber?: number }) {
  return mutate((db) => {
    const p = db.careerPlayers.find((x) => x.id === id)
    if (!p) return { updated: 0 }
    if (patch.status !== undefined) p.status = patch.status
    if (patch.inSquad !== undefined) p.in_squad = patch.inSquad ? 1 : 0
    if (patch.jerseyNumber !== undefined) p.jersey_number = patch.jerseyNumber
    return { updated: 1 }
  })
}
```
Se já existir algo equivalente, reuse.
**Verify**: `npx tsc` exit 0.

### Step 2: Seletor de status na página do jogador
Em `Player.tsx`, adicione um grupo de pílulas de status (Titular, Reserva, Emprestado, Vendido, e
"Base" só para origem youth/regen). Ao escolher, chame uma mutation `updateCareerPlayer` que também
ajusta `in_squad` conforme a regra: `vendido` e `emprestado` → fora do elenco ativo (`in_squad: 0`);
`titular`/`reserva`/`elenco` → `in_squad: 1`. Invalide `['career-player', id]` e `['career-players', careerId]`.
**Verify**: build ok; manual: mudar status persiste e reflete ao voltar para a carreira.

### Step 3: Ajustar os filtros de aba em Career
Os filtros `squad`/`youth` em `Career.tsx` precisam acomodar os novos valores:
- **Elenco** (aba "Elenco"): jogadores `in_squad === 1` e status não-base — inclui titular/reserva/
  elenco; **exclui** vendido e (opcionalmente) emprestado. Decida: mostrar emprestados numa
  sub-seção ou fora do elenco ativo. O mais simples: elenco = `in_squad && status not in
  ['base','vendido']`; emprestados aparecem com a tag existente.
- **Vendidos**: não aparecem no elenco ativo. Opcional: uma terceira aba "Ex-elenco" (vendidos), ou
  simplesmente somem do elenco. Escolha a mais simples e documente no relatório.
Ajuste os `filter(...)` conforme a decisão.
**Verify**: `npx tsc` exit 0; manual: marcar um jogador como "vendido" o tira do elenco.

### Step 4: Teste (se 002 pronto)
Em `store.test.ts`: `updateCareerPlayer(id, { status: 'vendido', inSquad: false })` altera status e
zera `in_squad`; o filtro de elenco (replicado no teste ou testado via a função) o exclui.
**Verify**: `npm test --workspace web` → passa.

## Test plan
- Manual (principal): mudar status pelos vários valores, conferir persistência (reload) e que o
  elenco ativo reflete (vendido some; titular/reserva ficam; emprestado com tag).
- Unit (se 002): `updateCareerPlayer` grava status/in_squad.

## Done criteria
- [ ] `npx tsc -p web/tsconfig.json --noEmit` → exit 0
- [ ] `cd web && npx vite build` → exit 0
- [ ] `grep -n "updateCareerPlayer" web/src/store.ts web/src/pages/Player.tsx` → função + uso
- [ ] Manual: status editável, persiste, e afeta as abas de Career corretamente
- [ ] `git status --short` só arquivos in-scope
- [ ] `plans/README.md` atualizado

## STOP conditions
- Se mudar os filtros de aba em `Career.tsx` quebrar a contagem/exibição de forma que o plano não
  previu (ex.: base/regens somem) — pare e reconcilie a regra de filtro antes de seguir.
- Se não houver lugar óbvio para "vendidos" e a decisão de UX for maior que trivial — implemente o
  mínimo (vendido sai do elenco) e reporte a opção de aba "Ex-elenco" como follow-up.

## Maintenance notes
- Futuro: histórico de transferências (datas de compra/venda/empréstimo) e retorno automático de
  empréstimo por temporada — exigiria novos campos no `career_players`/tabela de eventos.
- Revisor: conferir que `in_squad` e `status` ficam consistentes (nenhum "vendido" com `in_squad:1`).
