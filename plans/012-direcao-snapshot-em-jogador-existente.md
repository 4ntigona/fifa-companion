# Plan 012: Captura → registrar evolução em jogador existente (destino "snapshot")

> **Executor instructions**: Siga passo a passo, rode cada verificação. STOP → pare e reporte.
> Ao terminar, atualize `plans/README.md`. Este é um plano de feature com uma decisão de UX
> embutida (casamento de jogador) — leia "STOP conditions" antes de começar.
>
> **Drift check**: `git diff --stat feba0bf..HEAD -- web/src/pages/Capture.tsx web/src/store.ts`

## Status
- **Priority**: P2
- **Effort**: M
- **Risk**: MED (casamento errado grava snapshot no jogador errado — exige confirmação explícita)
- **Depends on**: 007 recomendado (apply atômico) — não obrigatório
- **Category**: direction (feature)
- **Planned at**: commit `feba0bf`, 2026-07-08

## Why this matters
O caso de uso central do produto é fotografar o perfil de um jogador seu, temporadas depois, para
registrar a evolução. O código **já antecipa** isso: `ReviewRow.destination` inclui `'snapshot'` e o
`apply()` ramifica nele — mas o `<select>` de destino só oferece `youth`/`regen`/`generated`. Ou
seja, o destino `'snapshot'` é **código morto**: hoje fotografar um jogador existente cria um
**duplicado** em vez de adicionar um snapshot datado ao jogador que já está na carreira. Este plano
liga a meia-feature: quando a IA detecta uma tela de perfil, permitir casar com um jogador do elenco
e registrar a evolução nele.

## Current state
`web/src/pages/Capture.tsx`:
- `VisionResult.screenType` inclui `'perfil_jogador'` e `'negociacao'` (detectados pela IA em
  `server/src/vision/analyze.ts`), e `SCREEN_LABEL` (l.7-10) os rotula.
- `ReviewRow` (l.123-126): `interface ReviewRow extends ExtractedPlayer { include: boolean; destination: 'generated' | 'youth' | 'regen' | 'snapshot' }`.
- `apply()` (l.143-176) já trata `row.destination === 'snapshot'` (usa `origin: 'youth'` como
  fallback — porque nunca deveria chegar lá) e cria jogador + snapshot.
- O `<select>` de destino (l.216-222) só tem `youth`/`regen`/`generated` — `'snapshot'` nunca é
  selecionável.
- `store.ts` já tem `addSnapshot(playerId, {...})` e `listCareerPlayers(careerId)`.

Convenções: `.input`/`.pill-tab`; PT-BR; revisão sempre antes de gravar (nada é salvo sem
confirmação — invariante do app).

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck web | `npx tsc -p web/tsconfig.json --noEmit` | exit 0 |
| Build | `cd web && npx vite build` | files generated |
| Test web | `npm test --workspace web` | passa (se 002 pronto) |

## Scope
**In scope:** `web/src/pages/Capture.tsx` (opção de destino "snapshot" + seletor do jogador-alvo +
apply); possivelmente `web/src/store.ts` (helper de casamento por nome, se preferir isolá-lo lá).
**Out of scope:** casamento automático "mágico" sem confirmação (é risco de dados errados); tela de
negociação → shortlist (é uma extensão futura; anote, não faça aqui); mudar o prompt da IA.

## Git workflow
Branch de `claude`; commit `feat: captura registra evolução em jogador existente`. Não push/PR.

## Steps

### Step 1: Carregar o elenco da carreira no ReviewPanel
O `ReviewPanel` recebe `career`. Adicione a lista de jogadores da carreira para o casamento:
```ts
const squad = listCareerPlayers(career.id).players
```
(import de `listCareerPlayers` do store). Para cada `ReviewRow`, ao escolher destino "Evolução
(jogador existente)", ofereça um segundo `<select>` com os jogadores do elenco (por nome), guardando
o `career_player_id` alvo na row (adicione `targetPlayerId?: number` ao `ReviewRow`).
**Verify**: `npx tsc -p web/tsconfig.json --noEmit` → exit 0.

### Step 2: Opção no select + sugestão por nome
Adicione `<option value="snapshot">Evolução (jogador existente)</option>` ao select de destino
(l.216-222). Quando `screenType === 'perfil_jogador'`, faça essa opção ser o **default** da row
(em vez de `youth`). Para reduzir erro, pré-selecione no segundo select o jogador cujo nome mais se
parece com `row.name` (comparação simples: normalizar acento/caixa e checar inclusão/igualdade) — mas
**sempre** deixe o usuário confirmar/trocar; nunca grave sem seleção explícita do alvo.
**Verify**: build ok; manual: numa "tela de perfil", o destino já vem "Evolução" com um jogador sugerido.

### Step 3: `apply()` grava snapshot no alvo (sem criar jogador)
No `apply()`, quando `row.destination === 'snapshot'`:
- Exigir `row.targetPlayerId` (se ausente, pular a row e avisar — não criar jogador novo).
- Chamar `addSnapshot(row.targetPlayerId, { season, dateIngame: date || undefined, overall: row.overall,
  potential: row.potential, position: row.positions, formNotes: 'Registrado por foto' })`.
- NÃO chamar `createCareerPlayer` nesse ramo (é o bug atual — remova o fallback `origin:'youth'`
  para `'snapshot'`).
Se o plano 007 já introduziu `applyCapturedPlayers`, estenda-o para aceitar rows do tipo snapshot
(anexar a jogador existente) dentro do mesmo `mutate`.
**Verify**: `npx tsc` exit 0; manual: confirmar cria o snapshot no jogador certo (aparece na
timeline dele em `/jogador/:id`) e NÃO cria duplicado no elenco.

### Step 4: Teste (se 002 pronto)
Em `web/src/store.test.ts` (ou um teste de componente leve), cubra: uma row com destino snapshot +
`targetPlayerId` gera um snapshot no jogador alvo e não cria novo `careerPlayer`.
**Verify**: `npm test --workspace web` → passa.

## Test plan
- Manual (principal): com uma carreira com elenco, subir uma foto que a IA classifique como
  `perfil_jogador` (ou forçar `screenType` num teste), escolher destino "Evolução", confirmar o
  jogador-alvo, aplicar → o snapshot aparece na timeline do jogador; o total de jogadores do elenco
  não aumenta.
- Unit (se 002): o ramo snapshot do apply não cria jogador.

## Done criteria
- [ ] `npx tsc -p web/tsconfig.json --noEmit` → exit 0
- [ ] `cd web && npx vite build` → exit 0
- [ ] `grep -n "snapshot" web/src/pages/Capture.tsx` → opção no select + ramo do apply que só chama addSnapshot
- [ ] Manual: destino "Evolução" grava snapshot no jogador existente, sem duplicar
- [ ] `git status --short` só arquivos in-scope
- [ ] `plans/README.md` atualizado

## STOP conditions
- **Decisão de UX**: se o casamento por nome for ambíguo demais (muitos jogadores parecidos) e você
  não conseguir uma heurística confiável — NÃO grave por adivinhação. Deixe o usuário escolher
  manualmente o alvo (select sem pré-seleção) e reporte que o auto-match ficou de fora. Gravar
  snapshot no jogador errado corrompe o histórico de desenvolvimento silenciosamente.
- Se `ExtractedPlayer` não tiver os campos necessários para casar (só nome) — use nome + posição; se
  ainda assim inseguro, exija seleção manual.

## Maintenance notes
- Extensão natural (fora deste plano): `screenType === 'negociacao'` → destino "adicionar à
  shortlist" (reusa `addProspect`), mas isso precisa do `sofifa_player_id` real (a foto não o traz),
  então provavelmente vira "adicionar como observação". Anotar como spike futuro.
- Revisor: garantir que nenhum caminho cria jogador quando o destino é snapshot; conferir a
  confirmação explícita do alvo.
