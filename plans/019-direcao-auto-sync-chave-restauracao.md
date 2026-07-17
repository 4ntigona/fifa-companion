# Plan 019: Auto-sync da chave de restauração (debounce + indicador de não-sincronizado)

> **Executor instructions**: Siga passo a passo, rode cada verificação. STOP → pare e reporte.
> Ao terminar, atualize a linha deste plano em `plans/README.md`.
>
> **Drift check (rode primeiro)**: `git diff --stat fe420d4..HEAD -- web/src/store.ts web/src/pages/Settings.tsx web/src/main.tsx web/src/store.test.ts server/src/routes/sync.ts`
> Se algum arquivo in-scope mudou desde fe420d4, compare os excertos de "Current state" com o
> código vivo antes de prosseguir; divergência = STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (toca o caminho único de escrita do store; risco de loop push→save→push e de spam de PUTs — ambos tratados abaixo)
- **Depends on**: none (006/007 já landaram — os testes de caracterização protegem o store)
- **Category**: direction (feature)
- **Planned at**: commit `fe420d4`, 2026-07-14

## Why this matters

A chave de restauração hoje só sobe dados quando o usuário clica "Atualizar dados na chave" — na
prática, ninguém lembra, e o backup do servidor fica stale (sem nenhum aviso de staleness na UI).
Pior: o servidor expira blobs sem PUT há 180 dias (`SYNC_TTL_DAYS`), então uma chave esquecida
morre silenciosamente. Decisão de design (dono, 2026-07-14): **push automático com debounce após
cada mutação** quando existe chave, **flush ao esconder a aba**, e **indicador "alterações não
sincronizadas"** em Configurações. Bônus estrutural: PUTs frequentes renovam o `updated_at` e
eliminam o risco de expiração por TTL para usuários ativos.

## Current state

- `web/src/store.ts`:
  - `save(db)` — linha 87-96 (com tratamento de QuotaExceededError do plano 007).
  - `mutate(fn)` — linha 98-103: `load() → fn(db) → save(db)`. **Todas** as mutações de dados do
    usuário passam por aqui (create/update/delete de carreira, jogador, snapshot, prospecto, IA).
  - Funções de sync chamam `save()` **diretamente, sem mutate()**: `generateRestoreKey` (538-546),
    `pushToRestoreKey` (549-557), `restoreFromKey` (560-573), `removeRestoreKey` (576-587),
    `importBackup` (~505-513). Isso importa: pendurar o auto-push em `mutate()` (não em `save()`)
    evita naturalmente o loop push→save→push.
  - `pushToRestoreKey()` — 549-557:
    ```ts
    export async function pushToRestoreKey(): Promise<void> {
      const db = load()
      if (!db.sync.code) throw new Error('Nenhuma chave de restauração gerada ainda.')
      await api(`/api/sync/${encodeURIComponent(db.sync.code)}`, {
        method: 'PUT', body: JSON.stringify({ data: snapshotForSync(db) }),
      })
      db.sync.lastSyncedAt = nowIso()
      save(db)
    }
    ```
  - `SyncInfo` (linhas 35-38): `{ code: string | null; lastSyncedAt: string | null }`.
  - `stripSecrets`/`snapshotForSync` (527-535) EXCLUEM `sync` do blob — campos novos em `sync`
    não vazam para o servidor. Não mexer nelas.
- `web/src/hooks.ts:4-11` — `useDebouncedValue` é um **hook React**; não serve dentro de
  `store.ts` (módulo puro). O debounce do auto-push precisa ser um `setTimeout` de módulo.
- `web/src/pages/Settings.tsx` — `SyncSection` (147-269):
  - mutation `push` (160-164) com `onSuccess`/`onError` → `setMsg`.
  - `lastSyncedAt` exibido em 219-221: `Última atualização: {new Date(...).toLocaleString('pt-BR')}`.
  - `msg` renderizado em 256.
- `web/src/main.tsx` — entry point React (QueryClientProvider + Router + `<App/>`); lugar para
  registrar o listener de `visibilitychange` uma única vez.
- Servidor (`server/src/routes/sync.ts`, plano 004): `PUT /api/sync/:code` rate limit
  **20/min**, retorna **404** se o código não existe (ex.: expirado por TTL ou removido em outro
  aparelho). O auto-push precisa tolerar 404 sem spammar (ver Step 2).
- Sem NENHUM handling online/offline no app hoje (grep por `navigator.onLine`/`'online'` = vazio).
- Testes: `web/src/store.test.ts` (17 casos) mocka `globalThis.fetch`; ambiente happy-dom
  (`web/vitest.config.ts`). Fake timers: vitest `vi.useFakeTimers()` disponível.
- Convenções: PT-BR na UI; erros de domínio via `throw new Error('mensagem PT')`; mutations
  TanStack Query invalidando query keys.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck web | `npx tsc -p web/tsconfig.json --noEmit` | exit 0 |
| Testes web | `npm test --workspace web` | todos passam (17 existentes + novos) |
| Build | `cd web && npx vite build` | files generated |
| Verify completo | `npm run verify` | exit 0 |

## Scope

**In scope** (únicos arquivos a modificar):
- `web/src/store.ts` (campo `lastMutatedAt`, agendador de auto-push, `initAutoSync`)
- `web/src/main.tsx` (chamar `initAutoSync()` uma vez)
- `web/src/pages/Settings.tsx` (indicador de não-sincronizado)
- `web/src/store.test.ts` (novos testes)

**Out of scope** (não toque):
- `server/` — a API atual (PUT 20/min) já comporta o design; nada muda.
- Background Sync API / service worker (`vite.config.ts`) — durabilidade offline real fica para
  depois; este plano cobre "aba aberta volta a sincronizar".
- `stripSecrets`/`snapshotForSync` — o blob enviado não muda.
- Auto-RESTORE (puxar do servidor) — só push; restore continua manual e explícito.
- Toasts/notificações globais — o status vive em Configurações (toasts foram adiados no plano 001).

## Git workflow

- Branch: `claude` (continuar nela).
- Um commit: `feat: auto-sync da chave de restauração (debounce + indicador)`.
- Não fazer push nem PR.

## Steps

### Step 1: `lastMutatedAt` no SyncInfo

Em `store.ts`, estenda `SyncInfo` e o default:

```ts
export interface SyncInfo {
  code: string | null
  lastSyncedAt: string | null
  lastMutatedAt: string | null   // última mutação de dados — para o indicador de staleness
}
```

Em `emptyDb()`, `sync: { code: null, lastSyncedAt: null, lastMutatedAt: null }`. O merge de
`load()` (`sync: { ...emptyDb().sync, ...db.sync }`) já preenche o campo em blobs antigos.
Em `mutate()`, após `fn(db)` e antes de `save(db)`, sete `db.sync.lastMutatedAt = nowIso()`.

**Verify**: `npx tsc -p web/tsconfig.json --noEmit` → exit 0; `npm test --workspace web` →
17 existentes passam (nenhum asserta o shape exato de `sync` — se algum falhar por isso,
atualize o teste e anote).

### Step 2: Agendador de auto-push em `store.ts`

Módulo puro (sem hooks). Adicione perto das funções de sync:

```ts
/* ---------------- auto-sync (push automático com debounce) ---------------- */

const AUTO_PUSH_DELAY_MS = 10_000  // folga ampla p/ o rate limit do servidor (PUT 20/min)
let autoPushTimer: ReturnType<typeof setTimeout> | null = null
let autoPushInFlight = false

/** Agenda um push debounced. Chamado por mutate() a cada mutação de dados. */
function scheduleAutoPush() {
  const { code } = load().sync
  if (!code) return
  if (autoPushTimer) clearTimeout(autoPushTimer)
  autoPushTimer = setTimeout(() => { void runAutoPush() }, AUTO_PUSH_DELAY_MS)
}

async function runAutoPush() {
  autoPushTimer = null
  if (autoPushInFlight) { scheduleAutoPush(); return }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return // volta no próximo trigger
  autoPushInFlight = true
  try {
    await pushToRestoreKey()
  } catch {
    // melhor esforço: a falha mantém lastMutatedAt > lastSyncedAt, e o indicador
    // em Configurações mostra o estado; o próximo mutate/visibilitychange tenta de novo.
  } finally {
    autoPushInFlight = false
  }
}

/** Registra o flush ao esconder a aba. Chamar UMA vez no boot do app (main.tsx). */
export function initAutoSync() {
  if (typeof document === 'undefined') return
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return
    const { code, lastSyncedAt, lastMutatedAt } = load().sync
    if (!code || !lastMutatedAt) return
    if (lastSyncedAt && lastSyncedAt >= lastMutatedAt) return // nada pendente
    if (autoPushTimer) clearTimeout(autoPushTimer)
    void runAutoPush()
  })
}
```

Em `mutate()`, após `save(db)`, chame `scheduleAutoPush()`. **NÃO** chame de `save()` — as
funções de sync usam `save()` direto e isso criaria loop (push→save→push).

IMPORTANTE (loop): `pushToRestoreKey` chama `save(db)` direto (não `mutate`), então o push NÃO
reagenda a si mesmo. Confirme isso lendo o código antes de seguir.

**Verify**: `npx tsc -p web/tsconfig.json --noEmit` → exit 0; teste do Step 5 cobre o resto.

### Step 3: Boot em `main.tsx`

Em `web/src/main.tsx`, importe e chame uma única vez, fora do render:

```ts
import { initAutoSync } from './store'
initAutoSync()
```

**Verify**: `cd web && npx vite build` → exit 0.

### Step 4: Indicador em Configurações

Em `Settings.tsx` / `SyncSection`, junto ao `lastSyncedAt` (linhas 219-221), derive e mostre o
estado:

```tsx
const dirty = info.lastMutatedAt && (!info.lastSyncedAt || info.lastSyncedAt < info.lastMutatedAt)
```

```tsx
<p className="text-[13px] text-steel">
  {info.lastSyncedAt && <>Última atualização: {new Date(info.lastSyncedAt).toLocaleString('pt-BR')} · </>}
  {dirty
    ? <span className="font-medium text-error">alterações ainda não sincronizadas — sincronização automática em instantes</span>
    : <span className="text-success">sincronizado</span>}
</p>
```

Nota: `info` vem de `getSyncInfo()` via `useState` + `refresh()` — o valor não atualiza sozinho
quando o auto-push termina em background. Aceitável para v1 (o usuário vê o estado ao abrir a
tela); NÃO adicione polling/subscriptions — anote como limitação no commit.

O botão manual "Atualizar dados na chave" (232-234) PERMANECE — é o fallback explícito.

**Verify**: `npx tsc -p web/tsconfig.json --noEmit` → exit 0.

### Step 5: Testes

Estenda `web/src/store.test.ts` (padrão: mock de `globalThis.fetch` como nos testes existentes;
`vi.useFakeTimers()` / `vi.advanceTimersByTime`):

1. **agenda push após mutação quando há chave**: semeie um blob com `sync.code` preenchido
   (via `localStorage.setItem` direto, como o helper `seedCareer` faz), mocke `fetch`, chame
   `createCareerPlayer(...)`, avance 10s de fake timers → `fetch` foi chamado com
   `PUT /api/sync/<code>`.
2. **não agenda sem chave**: sem `sync.code`, mutação + avanço de timers → `fetch` NÃO chamado.
3. **debounce colapsa mutações**: 3 mutações em sequência rápida + avanço de 10s → exatamente
   1 PUT.
4. **push não reagenda a si mesmo (anti-loop)**: após o PUT do caso 1 resolver, avance mais 30s
   → nenhum PUT adicional.
5. **`lastMutatedAt` avança em mutate e o dirty se resolve no push**: após mutação,
   `getSyncInfo().lastMutatedAt` > `lastSyncedAt`; após o push mockado resolver,
   `lastSyncedAt >= lastMutatedAt`.

Atenção com fake timers + promises: use `await vi.advanceTimersByTimeAsync(10_000)` (versão
async) para o `runAutoPush` interno resolver.

**Verify**: `npm test --workspace web` → todos passam (17 + 5 novos).

### Step 6: Verificação manual

Dev server + browser:
1. Configurações → gerar chave (se não houver). Editar algo (ex.: nota de um prospecto).
2. Network tab: ~10s depois, um `PUT /api/sync/<code>` dispara sozinho → 200.
3. Configurações mostra "sincronizado" após reabrir a seção; editar de novo → "alterações ainda
   não sincronizadas" até o próximo push.
4. Esconder a aba (trocar de aba) logo após uma edição → o PUT dispara no visibilitychange.

**Verify**: os 4 checks; `npm run verify` → exit 0.

## Test plan

Ver Step 5 (5 casos novos em `store.test.ts`, modelados nos testes de fetch-mock existentes).
Manual: Step 6.

## Done criteria

- [ ] `npm run verify` → exit 0
- [ ] `npm test --workspace web` → passa, incluindo os 5 casos novos
- [ ] `grep -n "scheduleAutoPush()" web/src/store.ts` → chamado em `mutate()` e em nenhum outro caminho de escrita
- [ ] `grep -n "initAutoSync" web/src/main.tsx` → presente
- [ ] Manual (Step 6): PUT automático observado no Network, indicador correto em Configurações
- [ ] O blob enviado continua sem `ai.keys` e sem `sync` (os testes do plano 003 continuam passando)
- [ ] `git status --short` só arquivos in-scope
- [ ] `plans/README.md` atualizado

## STOP conditions

- Se `pushToRestoreKey` tiver mudado para usar `mutate()` (drift) — o anti-loop do Step 2 quebra;
  STOP e reporte.
- Se os fake timers do vitest não drenarem o async do push (caso 1 do Step 5 falhando mesmo com
  `advanceTimersByTimeAsync`) — tente `vi.runAllTimersAsync()`; se ainda falhar, STOP com o log.
- Se o PUT automático receber 404 (chave expirada/removida em outro aparelho) repetidamente em
  teste manual — o comportamento esperado é silêncio + indicador dirty; se observar spam de
  requests (loop), STOP.
- Se qualquer teste do plano 003 (chaves BYOK fora do blob) falhar — STOP imediatamente.

## Maintenance notes

- Durabilidade offline real (Background Sync API no service worker) é o próximo degrau — exigiria
  customizar o `generateSW` em `vite.config.ts`. Fora deste plano de propósito.
- O indicador em Settings não atualiza em tempo real (sem subscription no store) — se o store um
  dia ganhar um event emitter, ligar o `SyncSection` nele.
- Se o volume de PUTs virar problema no VPS, subir `AUTO_PUSH_DELAY_MS` (ou fazer o servidor
  responder 429 — o cliente já tolera falha silenciosa).
- Revisor: conferir o anti-loop (push não chama mutate), o guard de `navigator.onLine`, e que
  nenhum campo novo vaza no blob (stripSecrets continua excluindo `sync`).
