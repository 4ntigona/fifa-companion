# Plan 001: Tornar o feedback e a interação do app confiáveis (erros amigáveis, debounce, paginação, diálogos acessíveis)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat bdd5c7e..HEAD -- web/src/api/client.ts web/src/pages web/src/main.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx (UX do produto)
- **Planned at**: commit `bdd5c7e`, 2026-07-07

## Why this matters

O app é um PWA mobile-first usado durante partidas de FIFA — o usuário alterna entre TV e celular
com o app aberto. Hoje, quando o servidor está fora do ar, toda tela mostra apenas "Erro 500" (ou
nada); quando uma carreira não existe, a tela fica em "Carregando…" para sempre; cada tecla
digitada na busca dispara uma requisição; a prospecção corta em 50 resultados sem como ver o
resto; e as confirmações destrutivas usam `window.confirm` nativo, que destoa da estética
terminal e do requisito de acessibilidade do DESIGN.md. Este plano fecha essas cinco lacunas de
experiência — todas pequenas, todas visíveis em uso real (o dono do projeto encontrou o
"Erro 500" cru em uso nesta semana).

## Current state

Repo: monorepo npm workspaces — `server/` (Fastify + SQLite, database do jogo, somente leitura)
e `web/` (React 18 + Vite + Tailwind v4 + TanStack Query v5, PWA em PT-BR). Dados do usuário
vivem no `localStorage` via `web/src/store.ts`; o servidor só serve a database do jogo e faz
proxy de IA. **Não há test runner configurado** — verificação é typecheck + build + greps.

Arquivos relevantes:

- `web/src/api/client.ts` — helper `api()` usado por todas as chamadas HTTP; erro genérico (linhas 1–16)
- `web/src/main.tsx` — QueryClient com `defaultOptions: { queries: { staleTime: 30_000, retry: 1 } }` (linha 9)
- `web/src/pages/Home.tsx` — lista carreiras (localStorage) + versões/import (HTTP); sem estado de erro nas queries de leitura
- `web/src/pages/NewCareer.tsx` — busca de times dispara query por tecla (`queryKey` linha 47)
- `web/src/pages/Prospects.tsx` — filtros disparam query por tecla (linha 36); `limit: '50'` fixo sem paginação (linha 33)
- `web/src/pages/Career.tsx` — "Carregando…" infinito se a carreira não existe (linha 46); `confirm(` nativo (linha 41); modal `AddPlayerModal` sem Escape/foco (linha 227)
- `web/src/pages/Player.tsx` — "Carregando…" infinito (linha 17); modal `SnapshotModal` sem Escape/foco (linha 181)
- `web/src/pages/Settings.tsx` — 4 usos de `confirm(` nativo (linhas 179, 184, 189, 256)
- `web/src/pages/Capture.tsx` — erro de análise sem botão de tentar de novo (linhas 63, 98)
- `web/src/store.ts` — `getCareer` lança `'Carreira não encontrada'` (linha 184); `getCareerPlayer` lança `'Jogador não encontrado'` (linha 267)
- `server/src/routes/game-data.ts` — `/api/players/:version` **já aceita** `offset` e `limit` (linhas 97, 123); nenhuma mudança de servidor é necessária

Excerto 1 — `web/src/api/client.ts:1-16` (erro genérico):

```ts
export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  // Content-Type só quando há corpo: Fastify rejeita (400) um Content-Type
  // application/json em requisição sem corpo (ex.: DELETE sem body).
  const hasBody = init?.body != null && !(init.body instanceof FormData)
  const res = await fetch(path, {
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  })
  if (!res.ok) {
    let msg = `Erro ${res.status}`
    try { msg = (await res.json()).error ?? msg } catch { /* mantém msg */ }
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}
```

Excerto 2 — `web/src/pages/Prospects.tsx:29-38` (query re-dispara a cada tecla; limit fixo):

```ts
  const params = new URLSearchParams({
    ...(q && { q }), ...(position && { position }), ...(maxAge && { maxAge }),
    ...(minPotential && { minPotential }), ...(minOverall && { minOverall }),
    ...(maxValue && { maxValue: String(Number(maxValue) * 1_000_000) }), sort, limit: '50',
  })
  const { data: searchData, isFetching } = useQuery({
    queryKey: ['player-search', version, params.toString()],
    queryFn: () => api<{ players: SofifaPlayer[]; total: number }>(`/api/players/${version}?${params}`),
    enabled: version != null && tab === 'buscar',
  })
```

Excerto 3 — `web/src/pages/Career.tsx:41-46` (confirm nativo + loading infinito):

```ts
    if (confirm(`Excluir a carreira "${career.name}"? Todos os jogadores, snapshots e a shortlist dela serão apagados. Essa ação não pode ser desfeita.`)) {
      remove.mutate()
    }
  }

  if (!career) return <p className="pt-6 text-slate-ink">Carregando…</p>
```

Excerto 4 — `web/src/pages/Career.tsx:227` (modal sem Escape/gestão de foco; o de
`Player.tsx:181` é idêntico no padrão):

```tsx
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-deep/50 sm:items-center" onClick={onClose}>
```

Convenções do repo que o executor DEVE seguir:

- **UI em PT-BR**, tom conciso. Copie o estilo das strings existentes.
- **Classes de componente** já definidas em `web/src/index.css` (@layer components): `.card`,
  `.btn-primary`, `.btn-secondary`, `.input`, `.pill-tab`, `.pill-tab-active`, `.tag-*`.
  Use-as; não invente cores novas. Tokens de cor: `text-error`, `text-success`, `text-steel`,
  `bg-surface`, `bg-tint-rose`, `border-hairline` etc. (ver `@theme` no mesmo arquivo).
- **DESIGN.md** (raiz do repo) exige: foco visível (já há `:focus-visible` global no
  `index.css`), interações keyboard-first, contraste AA, motion 200ms, e **raio de borda zero**
  (há regra global `* { border-radius: 0 !important }` — não adicione `rounded-*`).
- Estado do usuário via `web/src/store.ts` (localStorage); queries/mutations via TanStack Query
  com `queryKey`s existentes (`['careers']`, `['career', id]`, `['career-players', id]`,
  `['prospects', id]`, `['versions']`) — invalide os mesmos keys, não crie variantes.
- Exemplar de página bem estruturada para imitar: `web/src/pages/Settings.tsx` (seções `card`,
  mutations com `onSuccess`/`onError`, mensagens `{ ok, text }`).

## Commands you will need

| Purpose            | Command                                                        | Expected on success |
|--------------------|----------------------------------------------------------------|---------------------|
| Install            | `npm install` (raiz)                                           | exit 0              |
| Typecheck web      | `npx tsc -p web/tsconfig.json --noEmit` (raiz)                 | exit 0, sem erros   |
| Build web          | `cd web && npx vite build`                                     | "files generated"   |
| Dev (manual QA)    | `npm run dev:server` e `npm run dev:web` (dois terminais)      | app em :5173        |

Não há lint configurado nem test runner. Verificação manual: abrir `http://localhost:5173`.

## Scope

**In scope** (somente estes arquivos podem ser modificados/criados):

- `web/src/api/client.ts`
- `web/src/hooks.ts` (criar)
- `web/src/components/ConfirmDialog.tsx` (criar; criar a pasta `components/`)
- `web/src/pages/Home.tsx`
- `web/src/pages/NewCareer.tsx`
- `web/src/pages/Prospects.tsx`
- `web/src/pages/Career.tsx`
- `web/src/pages/Player.tsx`
- `web/src/pages/Capture.tsx`
- `web/src/pages/Settings.tsx`
- `plans/README.md` (atualizar status ao final)

**Out of scope** (NÃO tocar, mesmo parecendo relacionado):

- `server/**` — o endpoint de busca já suporta `offset`; nenhuma mudança de servidor.
- `web/src/store.ts` — as mensagens de erro lançadas ali são consumidas como estão.
- `web/src/index.css` e `DESIGN.md` — tokens e regras de design são fonte de verdade; use-os.
- `web/src/App.tsx` — navegação inferior (bottom-nav) foi considerada e adiada; não adicionar.
- `web/vite.config.ts`, manifest, ícones.
- Qualquer biblioteca nova (`npm install` de dependências) — tudo aqui se faz com React puro.

## Git workflow

- Branch de trabalho: partir de `claude` (branch atual do repo) — criar `advisor/001-ux`.
- Commits por passo lógico, estilo do repo (conventional commits em PT):
  ex. `feat: erros de rede amigáveis e retry nas queries de leitura` (ver `git log --oneline -5`).
- NÃO fazer push nem abrir PR sem instrução do operador.

## Steps

### Step 1: Mensagens de erro de rede amigáveis no `api()`

Em `web/src/api/client.ts`, altere o helper `api()` (Excerto 1) para distinguir três falhas:

1. **Falha de rede** (fetch rejeita — servidor fora do ar, sem conexão): capture com try/catch em
   volta do `fetch` e lance `new Error('Não foi possível falar com o servidor. Verifique sua conexão — ou se o servidor do app está no ar.')`.
2. **Resposta não-JSON com status de erro** (ex.: HTML de proxy com 500/502/504): quando o parse
   do corpo falhar E `res.status >= 500`, lance
   `new Error('O servidor está indisponível no momento (HTTP ' + res.status + '). Tente de novo em instantes.')`.
3. Demais erros: manter o comportamento atual (usa `.error` do JSON quando existir).

Formato alvo (o shape importa, não cada caractere):

```ts
export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body != null && !(init.body instanceof FormData)
  let res: Response
  try {
    res = await fetch(path, {
      headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    })
  } catch {
    throw new Error('Não foi possível falar com o servidor. Verifique sua conexão — ou se o servidor do app está no ar.')
  }
  if (!res.ok) {
    let msg: string | null = null
    try { msg = (await res.json()).error ?? null } catch { /* corpo não-JSON */ }
    if (!msg) {
      msg = res.status >= 500
        ? `O servidor está indisponível no momento (HTTP ${res.status}). Tente de novo em instantes.`
        : `Erro ${res.status}`
    }
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}
```

**Verify**: `npx tsc -p web/tsconfig.json --noEmit` → exit 0.

### Step 2: Criar `web/src/hooks.ts` com `useDebouncedValue` e `useEscapeClose`

Criar o arquivo com exatamente estes dois hooks (React puro, sem dependências):

```ts
import { useEffect, useState } from 'react'

/** Retorna o valor após `delayMs` sem mudanças — para não buscar a cada tecla. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

/** Fecha modais com a tecla Escape (acessibilidade keyboard-first do DESIGN.md). */
export function useEscapeClose(onClose: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])
}
```

**Verify**: `npx tsc -p web/tsconfig.json --noEmit` → exit 0.

### Step 3: Debounce nas buscas (NewCareer e Prospects)

- `web/src/pages/NewCareer.tsx`: importe `useDebouncedValue` e crie
  `const debouncedTeamQuery = useDebouncedValue(teamQuery)`. Na query de times (linha ~45-54),
  troque `teamQuery` por `debouncedTeamQuery` **no `queryKey` E na URL** (`new URLSearchParams`).
  O `enabled` também passa a usar `debouncedTeamQuery`.
- `web/src/pages/Prospects.tsx`: os filtros de digitação são `q`, `maxAge`, `minOverall`,
  `minPotential`, `maxValue`. Aplique `useDebouncedValue` a cada um (5 chamadas, uma por valor —
  hooks não podem estar em loop) e use as versões debounced na construção de `params`
  (Excerto 2). `position` e `sort` são select/botões — não precisam de debounce.

**Verify**: `npx tsc -p web/tsconfig.json --noEmit` → exit 0. Manual: digitar rápido "arsenal"
na busca de time e observar na aba Network do navegador uma única chamada a `/api/teams` após a
pausa (não uma por tecla).

### Step 4: Estados de erro e "não encontrado" nas telas

4a. **Home** (`web/src/pages/Home.tsx`): a query `['versions']` é a espinha da seção "Databases
do jogo". Capture `isError` e `refetch` do `useQuery` e, quando `isError`, renderize no lugar da
grade de versões:

```tsx
<div className="card bg-tint-rose p-5 text-sm text-charcoal">
  <p className="font-semibold">Sem conexão com o servidor.</p>
  <p className="mt-1">{(error as Error).message}</p>
  <button onClick={() => refetch()} className="btn-secondary mt-3">Tentar de novo</button>
</div>
```

4b. **Prospects** (`web/src/pages/Prospects.tsx`): na query `['player-search', ...]`, capture
`isError`/`error`/`refetch` e renderize o mesmo padrão de card de erro acima no lugar da lista
de resultados quando falhar.

4c. **NewCareer** (`web/src/pages/NewCareer.tsx`): mesma coisa para a query `['versions']`
(bloqueia a tela inteira — o card de erro substitui a grade de versões).

4d. **Career e Player** ("Carregando…" infinito — Excerto 3): essas telas leem do localStorage
(instantâneo); o único caso real de `!career`/`!data` é id inexistente (link antigo, dados
restaurados). Em `Career.tsx` linha 46 e `Player.tsx` linha 17, capture `isError` da query e
troque o retorno por:

```tsx
if (isError) return (
  <div className="card mt-6 bg-surface-soft p-6 text-sm text-slate-ink">
    <p className="font-semibold text-ink">Carreira não encontrada neste dispositivo.</p>
    <p className="mt-1">Ela pode ter sido excluída ou os dados foram restaurados de outro backup.</p>
    <Link to="/" className="btn-primary mt-3 inline-block">Voltar ao início</Link>
  </div>
)
if (!career) return <p className="pt-6 text-slate-ink">Carregando…</p>
```

(Em `Player.tsx`, texto "Jogador não encontrado neste dispositivo." e `Link` já está importado
em ambos os arquivos.)

**Verify**: `npx tsc -p web/tsconfig.json --noEmit` → exit 0. Manual: com o web rodando e o
servidor **desligado**, abrir a Home → card "Sem conexão com o servidor" com botão; abrir
`http://localhost:5173/carreira/999` → card "Carreira não encontrada".

### Step 5: "Carregar mais" na prospecção

Em `web/src/pages/Prospects.tsx`:

1. Adicione estado `const [limit, setLimit] = useState(50)`.
2. Use `limit: String(limit)` nos `params` (no lugar do `'50'` fixo — Excerto 2). O `queryKey`
   já inclui `params.toString()`, então muda junto. Adicione
   `placeholderData: (prev) => prev` à query para a lista não piscar ao carregar mais
   (TanStack Query v5 — substitui o antigo `keepPreviousData`).
3. Ao mudar qualquer filtro debounced, volte o limite: `useEffect(() => setLimit(50), [<valores debounced>])`.
4. Depois da lista de resultados, quando `searchData && searchData.players.length < searchData.total`,
   renderize:

```tsx
<button onClick={() => setLimit((l) => l + 50)} disabled={isFetching} className="btn-secondary w-full">
  {isFetching ? 'Carregando…' : `Carregar mais (${searchData.players.length} de ${searchData.total.toLocaleString('pt-BR')})`}
</button>
```

Nota: o servidor já aceita `limit` até 200 (`server/src/routes/game-data.ts:122` faz
`Math.min(Number(limit ?? 50), 200)`). Ao atingir 200 resultados exibidos, o botão continuará
funcionando mas o servidor capa em 200 — aceite esse teto e esconda o botão quando
`searchData.players.length >= 200` (adicione essa condição ao render do botão).

**Verify**: `npx tsc -p web/tsconfig.json --noEmit` → exit 0. Manual: na prospecção com a
database FIFA 22 importada, sem filtros → "Carregar mais (50 de 19.239)"; clicar → lista cresce
para 100 sem limpar; após 200, botão some.

### Step 6: `ConfirmDialog` acessível substituindo os 5 `confirm()` nativos

6a. Criar `web/src/components/ConfirmDialog.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { useEscapeClose } from '../hooks'

interface Props {
  title: string
  message: string
  confirmLabel?: string   // default: 'Confirmar'
  danger?: boolean        // true → botão vermelho (btn-primary); false → btn-dark
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ title, message, confirmLabel = 'Confirmar', danger = true, onConfirm, onCancel }: Props) {
  useEscapeClose(onCancel)
  const cancelRef = useRef<HTMLButtonElement>(null)
  // foco inicial no botão seguro (cancelar) — padrão de diálogo destrutivo
  useEffect(() => { cancelRef.current?.focus() }, [])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-deep/50 sm:items-center" onClick={onCancel}>
      <div role="alertdialog" aria-modal="true" aria-label={title}
        className="w-full max-w-md space-y-3 bg-canvas p-5 shadow-[0_24px_48px_-8px_rgba(15,15,15,0.2)]"
        onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
        <p className="text-sm text-slate-ink">{message}</p>
        <div className="flex gap-2 pt-1">
          <button ref={cancelRef} onClick={onCancel} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={onConfirm} className={danger ? 'btn-primary flex-1' : 'btn-dark flex-1'}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
```

6b. **Career.tsx** (linha ~41): troque o `confirm(...)` por estado
`const [confirmingDelete, setConfirmingDelete] = useState(false)`; o botão "🗑 Excluir carreira"
passa a `setConfirmingDelete(true)`; renderize no fim do JSX (junto do `AddPlayerModal`):

```tsx
{confirmingDelete && career && (
  <ConfirmDialog
    title="Excluir carreira"
    message={`Excluir "${career.name}"? Todos os jogadores, snapshots e a shortlist dela serão apagados. Essa ação não pode ser desfeita.`}
    confirmLabel="Excluir"
    onConfirm={() => { setConfirmingDelete(false); remove.mutate() }}
    onCancel={() => setConfirmingDelete(false)}
  />
)}
```

6c. **Settings.tsx** (linhas 179, 184, 189, 256): mesmo padrão. Como são 4 confirmações na mesma
tela, use um único estado discriminado por ação:
`const [pending, setPending] = useState<null | 'regenerate' | 'removeKey' | 'restore' | 'import'>(null)`
— para o caso `'import'`, guarde também o `File` pendente em um `useRef<File | null>`.
Cada handler (`onGenerate`, `onRemove`, `onRestore`, `onImport`) vira: seta `pending` em vez de
chamar `confirm`; um único `<ConfirmDialog>` no fim do JSX lê `pending` e mapeia
título/mensagem/ação (mantenha os textos atuais dos `confirm()`). Exceção: em `onGenerate`, o
diálogo só aparece quando `info.code` já existe (o fluxo sem chave continua direto, sem diálogo).

**Verify**: `npx tsc -p web/tsconfig.json --noEmit` → exit 0 e
`grep -rn "confirm(" web/src/pages/` → **nenhum resultado** (os 5 usos viraram ConfirmDialog).
Manual: clicar "Excluir carreira" → diálogo com foco no "Cancelar"; Escape fecha sem excluir.

### Step 7: Escape + foco inicial nos modais existentes

- `web/src/pages/Career.tsx` — `AddPlayerModal` (linha ~227): chame `useEscapeClose(onClose)` no
  topo do componente; adicione `role="dialog"` e `aria-modal="true"` na div interna do modal; e
  `autoFocus` no primeiro input ("Nome *").
- `web/src/pages/Player.tsx` — `SnapshotModal` (linha ~181): idem — `useEscapeClose(props.onClose)`,
  `role="dialog"`, `aria-modal="true"`, `autoFocus` no input "Temporada *".

**Verify**: `npx tsc -p web/tsconfig.json --noEmit` → exit 0. Manual: abrir "+ Jogador" →
cursor já no campo Nome; Escape fecha.

### Step 8: "Tentar novamente" na captura

Em `web/src/pages/Capture.tsx`: guarde o último arquivo em
`const lastFileRef = useRef<File | null>(null)` (setado no início de `onFile`, linha ~63).
No bloco de erro (linha ~96-100, o `<p className="bg-tint-rose ...">`), transforme em um card
com o texto do erro + botão:

```tsx
<div className="bg-tint-rose p-4 text-sm text-charcoal">
  <p>{analysisError ?? (upload.error as Error)?.message}</p>
  {lastFileRef.current && (
    <button onClick={() => onFile(lastFileRef.current!)} className="btn-secondary mt-3">
      Tentar novamente
    </button>
  )}
</div>
```

Atenção: `onFile` faz `setPreview(URL.createObjectURL(file))` — no retry o preview é recriado,
o que é aceitável; não é preciso revogar o objectURL antigo neste plano.

**Verify**: `npx tsc -p web/tsconfig.json --noEmit` → exit 0. Manual: sem chave de IA
configurada, enviar uma foto → erro com botão "Tentar novamente" visível.

### Step 9: Build final e índice

`cd web && npx vite build` → termina com `files generated` (o service worker do PWA é gerado).
Atualize a linha deste plano em `plans/README.md` para DONE.

## Test plan

O repo **não tem test runner** (nenhum `vitest`/`jest` configurado — instalar um está fora de
escopo). A verificação é:

1. `npx tsc -p web/tsconfig.json --noEmit` → exit 0 (roda após cada step).
2. `cd web && npx vite build` → sucesso (step 9).
3. `grep -rn "confirm(" web/src/pages/` → vazio (step 6).
4. Roteiro manual de QA (com `npm run dev:server` + `npm run dev:web` rodando):
   - Servidor desligado → Home mostra card de erro com "Tentar de novo"; religar e clicar → grade volta.
   - `/carreira/999` → "Carreira não encontrada", link "Voltar ao início" funciona.
   - Busca de time: digitar rápido → 1 requisição (Network tab).
   - Prospecção sem filtro → "Carregar mais (50 de N)"; clica → 100 itens, lista não pisca.
   - Excluir carreira → diálogo estilizado, foco no Cancelar, Escape cancela, Enter no botão Excluir exclui.
   - "+ Jogador" → foco no campo Nome, Escape fecha.
   - Captura sem chave de IA → erro com "Tentar novamente".

## Done criteria

Machine-checkable. TODOS devem valer:

- [ ] `npx tsc -p web/tsconfig.json --noEmit` → exit 0
- [ ] `cd web && npx vite build` → exit 0
- [ ] `grep -rn "confirm(" web/src/pages/` → 0 resultados
- [ ] `grep -rln "useDebouncedValue" web/src/pages/` → lista `NewCareer.tsx` e `Prospects.tsx`
- [ ] `grep -c "useEscapeClose" web/src/pages/Career.tsx web/src/pages/Player.tsx` → ≥1 em cada
- [ ] `test -f web/src/components/ConfirmDialog.tsx && test -f web/src/hooks.ts` → exit 0
- [ ] `git status --short` mostra apenas arquivos da lista "In scope"
- [ ] Linha deste plano atualizada em `plans/README.md`

## STOP conditions

Pare e reporte (não improvise) se:

- Os excertos em "Current state" não baterem com o código (drift desde `bdd5c7e`).
- `npx tsc` falhar duas vezes seguidas no mesmo step após uma tentativa razoável de correção.
- O step 5 exigir mudanças em `server/` (não deveria — o `offset`/`limit` já existem; se a
  resposta do endpoint não tiver `total`, PARE).
- Você se ver tentado a instalar qualquer dependência nova (ex.: lib de modal/toast) — o plano
  inteiro é React puro + classes existentes.
- Os textos/classes do DESIGN.md conflitarem com algo pedido aqui (ex.: precisar de
  `rounded-*`) — a regra global de raio zero vence; reporte a inconsistência.

## Maintenance notes

- **Adiado de propósito** (não implementar junto): navegação inferior fixa para mobile
  (bottom-nav) — mexe no layout de todas as telas e merece decisão de design própria; sistema de
  toasts — as mensagens inline atuais cobrem o necessário; virtualização da lista de prospecção —
  só vale se o teto de 200 subir.
- O `ConfirmDialog` não tem focus-trap completo (Tab pode sair do diálogo) — suficiente para AA
  neste tamanho de app; se o app crescer, considerar `<dialog>` nativo ou focus-trap real.
- Se um dia o servidor ganhar paginação real por cursor, o "Carregar mais" do step 5 (que
  recarrega `limit` crescente) deve migrar para `useInfiniteQuery`.
- Revisor: conferir que nenhum `queryKey` existente mudou de formato (invalidação em outras
  telas depende deles) e que nenhuma classe `rounded-*` entrou (regra do DESIGN.md).
