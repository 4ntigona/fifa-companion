import { useEffect, useRef } from 'react'
import { useEscapeClose } from '../hooks'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
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
