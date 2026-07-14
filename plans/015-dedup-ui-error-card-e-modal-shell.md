# Plan 015: Extrair ServerErrorCard e Modal shell compartilhados (dedup de UI)

> **Executor instructions**: Siga passo a passo, rode cada verificação. STOP → pare e reporte.
> Ao terminar, atualize a linha deste plano em `plans/README.md`.
>
> **Drift check (rode primeiro)**: `git diff --stat fe420d4..HEAD -- web/src/pages/Home.tsx web/src/pages/NewCareer.tsx web/src/pages/Prospects.tsx web/src/pages/Career.tsx web/src/pages/Player.tsx web/src/components/ConfirmDialog.tsx`
> Se algum arquivo in-scope mudou desde fe420d4, compare os excertos de "Current state" com o
> código vivo antes de prosseguir; divergência = STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW-MED (extração mecânica, mas toca componentes interativos — verificar abrir/fechar/submeter de cada modal)
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `fe420d4`, 2026-07-14

## Why this matters

Duas duplicações de UI acumuladas: (1) o card "Sem conexão com o servidor" existe **3× byte-
idêntico** (Home, NewCareer, Prospects) e já começou a divergir (Home tem `mb-3` a mais) — toda
mudança de copy/estilo de erro precisa ser feita em 3 lugares; (2) o shell de modal (overlay,
click-fora-fecha, `stopPropagation`, `role="dialog"`, escape-fecha) está reimplementado à mão em
3 modais (ConfirmDialog, AddPlayerModal, SnapshotModal). O plano 001 adiou um focus-trap completo;
com o shell compartilhado, esse follow-up terá **um** lugar para pousar em vez de três.

## Current state

### Card de erro triplicado

- `web/src/pages/Home.tsx:104-110`:
  ```tsx
  {versionsError && (
    <div className="card mb-3 bg-tint-rose p-5 text-sm text-charcoal">
      <p className="font-semibold">Sem conexão com o servidor.</p>
      <p className="mt-1">{(versionsErr as Error).message}</p>
      <button onClick={() => refetchVersions()} className="btn-secondary mt-3">Tentar de novo</button>
    </div>
  )}
  ```
- `web/src/pages/NewCareer.tsx:100-106` — mesmo bloco, sem `mb-3`, dentro de um ternário
  `{versionsError ? ( ... ) : ( ... )}`, retry = `refetchVersions()`.
- `web/src/pages/Prospects.tsx:157-163` — mesmo bloco, sem `mb-3`, dentro de um ternário
  `{searchError ? ( ... ) : ( ... )}`, retry = `refetchSearch()`.
- **NÃO confundir** com o card "não encontrada neste dispositivo" de `Career.tsx:44-50` e
  `Player.tsx:26-32` — esse é outro estado (recurso local ausente, sem retry, com link para Home)
  e fica FORA deste plano.

### Shell de modal triplicado

- `web/src/components/ConfirmDialog.tsx:13-32` — o exemplar mais completo:
  ```tsx
  export default function ConfirmDialog({ title, message, confirmLabel = 'Confirmar', danger = true, onConfirm, onCancel }: Props) {
    useEscapeClose(onCancel)
    const cancelRef = useRef<HTMLButtonElement>(null)
    useEffect(() => { cancelRef.current?.focus() }, [])
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-deep/50 sm:items-center" onClick={onCancel}>
        <div role="alertdialog" aria-modal="true" aria-label={title}
          className="w-full max-w-md space-y-3 bg-canvas p-5 shadow-[0_24px_48px_-8px_rgba(15,15,15,0.2)]"
          onClick={(e) => e.stopPropagation()}>
          ...
  ```
- `web/src/pages/Career.tsx:242-243` (`AddPlayerModal`) — overlay idêntico + inner com
  `role="dialog"` e `space-y-2` (e um `sm:` vazio residual no className):
  ```tsx
  <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-deep/50 sm:items-center" onClick={onClose}>
    <div role="dialog" aria-modal="true" className="w-full max-w-md space-y-2  bg-canvas p-5 shadow-[0_24px_48px_-8px_rgba(15,15,15,0.2)] sm:" onClick={(e) => e.stopPropagation()}>
  ```
  `useEscapeClose(onClose)` em `Career.tsx:217`.
- `web/src/pages/Player.tsx:216-217` (`SnapshotModal`) — mesmo par de divs;
  `useEscapeClose(props.onClose)` em `Player.tsx:196`.
- `useEscapeClose` vive em `web/src/hooks.ts:14-20`.

### Convenções do repo

- Componentes compartilhados em `web/src/components/` com `export default` (ver
  `ConfirmDialog.tsx`). Estética DESIGN.md: raio zero, IBM Plex Mono — as classes existentes já
  respeitam; **não invente classes novas**, mova as existentes.
- PT-BR em todo texto de UI.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc -p web/tsconfig.json --noEmit` | exit 0 |
| Testes web | `npm test --workspace web` | todos passam |
| Build | `cd web && npx vite build` | files generated |
| Verify completo | `npm run verify` | exit 0 |

## Scope

**In scope** (únicos arquivos a modificar):
- `web/src/components/ServerErrorCard.tsx` (criar)
- `web/src/components/Modal.tsx` (criar)
- `web/src/components/ConfirmDialog.tsx`
- `web/src/pages/Home.tsx`
- `web/src/pages/NewCareer.tsx`
- `web/src/pages/Prospects.tsx`
- `web/src/pages/Career.tsx`
- `web/src/pages/Player.tsx`

**Out of scope** (não toque):
- O card "não encontrada neste dispositivo" (`Career.tsx:44-50`, `Player.tsx:26-32`) — estado
  diferente, sem retry; unificá-lo é outro problema.
- Implementar focus-trap — é o follow-up adiado do plano 001; este plano só cria o lugar único
  onde ele vai pousar. NÃO implemente aqui.
- Qualquer mudança visual — o resultado renderizado deve ser pixel-idêntico (exceto o `mb-3`
  divergente da Home, que vira prop/wrapper local).
- `web/src/hooks.ts` — `useEscapeClose` continua onde está; o Modal o importa.

## Git workflow

- Branch: `claude` (continuar nela).
- Dois commits: `refactor: extrai ServerErrorCard (3 cópias → 1)` e
  `refactor: extrai Modal shell compartilhado (3 modais → 1 wrapper)`.
- Não fazer push nem PR.

## Steps

### Step 1: Criar `ServerErrorCard`

Crie `web/src/components/ServerErrorCard.tsx`:

```tsx
/** Card de erro de conexão com o servidor, com retry — usado onde uma query de rede falha. */
export default function ServerErrorCard({ message, onRetry, className = '' }: {
  message: string
  onRetry: () => void
  className?: string
}) {
  return (
    <div className={`card bg-tint-rose p-5 text-sm text-charcoal ${className}`}>
      <p className="font-semibold">Sem conexão com o servidor.</p>
      <p className="mt-1">{message}</p>
      <button onClick={onRetry} className="btn-secondary mt-3">Tentar de novo</button>
    </div>
  )
}
```

**Verify**: `npx tsc -p web/tsconfig.json --noEmit` → exit 0.

### Step 2: Trocar os 3 call sites

- `Home.tsx:104-110` → `{versionsError && <ServerErrorCard className="mb-3" message={(versionsErr as Error).message} onRetry={() => refetchVersions()} />}`
- `NewCareer.tsx:100-106` → mesma troca dentro do ternário existente, sem `className`.
- `Prospects.tsx:157-163` → idem, `onRetry={() => refetchSearch()}`.

Remova os blocos inline. Adicione o import `import ServerErrorCard from '../components/ServerErrorCard'`.

**Verify**: `grep -rn "Sem conexão com o servidor" web/src/` → só em `ServerErrorCard.tsx`;
`npx tsc -p web/tsconfig.json --noEmit` → exit 0. Commit 1 aqui.

### Step 3: Criar o `Modal` shell

Crie `web/src/components/Modal.tsx` consolidando overlay + dialog + escape:

```tsx
import { useEscapeClose } from '../hooks'

/** Shell de modal: overlay, click-fora fecha, Escape fecha, dialog acessível.
 *  Futuro focus-trap (adiado no plano 001) deve ser implementado AQUI, uma vez só. */
export default function Modal({ onClose, ariaLabel, role = 'dialog', children }: {
  onClose: () => void
  ariaLabel?: string
  role?: 'dialog' | 'alertdialog'
  children: React.ReactNode
}) {
  useEscapeClose(onClose)
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-deep/50 sm:items-center" onClick={onClose}>
      <div role={role} aria-modal="true" aria-label={ariaLabel}
        className="w-full max-w-md space-y-2 bg-canvas p-5 shadow-[0_24px_48px_-8px_rgba(15,15,15,0.2)]"
        onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
```

Nota: ConfirmDialog usa `space-y-3` e os outros `space-y-2` — diferença de 4px imperceptível;
padronize em `space-y-2` OU aceite `space-y-3` — escolha UMA e aplique ao shell (o diff visual é
aceitável; anote qual escolheu no commit).

**Verify**: `npx tsc -p web/tsconfig.json --noEmit` → exit 0.

### Step 4: Migrar os 3 modais para o shell

4a. `ConfirmDialog.tsx`: mantenha a API pública (props) idêntica — só o miolo muda:

```tsx
export default function ConfirmDialog({ title, message, confirmLabel = 'Confirmar', danger = true, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { cancelRef.current?.focus() }, [])
  return (
    <Modal onClose={onCancel} role="alertdialog" ariaLabel={title}>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      ...botões como hoje...
    </Modal>
  )
}
```

(O `useEscapeClose` sai do ConfirmDialog — o Modal já o faz. O autofocus no botão cancelar FICA.)

4b. `AddPlayerModal` em `Career.tsx`: substitua o par de divs externos por
`<Modal onClose={onClose}>...corpo do form como hoje...</Modal>` e remova o
`useEscapeClose(onClose)` local (`Career.tsx:217`).

4c. `SnapshotModal` em `Player.tsx`: idem — `<Modal onClose={props.onClose}>` e remova o
`useEscapeClose` local (`Player.tsx:196`).

**Verify**: `grep -rn "fixed inset-0 z-50" web/src/` → só em `Modal.tsx`;
`grep -rn "useEscapeClose" web/src/` → só em `hooks.ts` (definição) e `Modal.tsx` (uso);
`npx tsc -p web/tsconfig.json --noEmit` → exit 0.

### Step 5: Verificação funcional no browser

Rode o dev server (`.claude/launch.json` tem `server` e `web`) e verifique manualmente:
1. Home com servidor desligado → card de erro com "Tentar de novo" funcional.
2. Carreira → "+ Jogador" abre o AddPlayerModal; Escape fecha; click fora fecha; salvar cria.
3. Jogador → "+ Registrar evolução" abre o SnapshotModal; Escape/click-fora fecham; salvar grava.
4. Excluir carreira → ConfirmDialog abre com foco no "Cancelar"; confirmar exclui.

**Verify**: os 4 fluxos acima funcionam; `npm run verify` → exit 0. Commit 2.

## Test plan

Sem testes unitários novos obrigatórios (extração presentacional; o projeto não tem testes de
componente). A verificação é o Step 5 (manual) + typecheck + build. Se o executor tiver acesso a
browser tooling, um screenshot de cada modal antes/depois é bem-vindo no relatório.

## Done criteria

- [ ] `npm run verify` → exit 0
- [ ] `grep -rn "Sem conexão com o servidor" web/src/ | wc -l` → 1 (só ServerErrorCard.tsx)
- [ ] `grep -rn "fixed inset-0 z-50" web/src/ | wc -l` → 1 (só Modal.tsx)
- [ ] `grep -c "useEscapeClose" web/src/pages/Career.tsx web/src/pages/Player.tsx` → 0 em cada
- [ ] Fluxos do Step 5 verificados manualmente
- [ ] `git status --short` só arquivos in-scope
- [ ] `plans/README.md` atualizado

## STOP conditions

- Se os blocos citados em "Current state" não baterem com o código (drift) — STOP.
- Se a migração de algum modal exigir mudar a lógica interna do form (estado, mutations) — STOP;
  o plano só move o invólucro.
- Se o `ConfirmDialog` for usado em algum lugar com comportamento que dependa do `space-y-3`
  exato — improvável; se detectar diferença visual maior que o espaçamento, STOP.

## Maintenance notes

- O focus-trap adiado do plano 001 agora tem um lugar único: `Modal.tsx`. Quando for implementado,
  atenção ao autofocus do ConfirmDialog (cancelRef) — o trap não deve roubá-lo.
- Novos modais devem usar `<Modal>`; revisor deve rejeitar novos `fixed inset-0 z-50` inline.
- Novos estados de erro de rede devem usar `<ServerErrorCard>`.
