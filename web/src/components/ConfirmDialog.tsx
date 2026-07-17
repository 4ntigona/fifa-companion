import { useEffect, useRef } from 'react'
import Modal from './Modal'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ title, message, confirmLabel = 'Confirmar', danger = true, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  // foco inicial no botão seguro (cancelar) — padrão de diálogo destrutivo
  useEffect(() => { cancelRef.current?.focus() }, [])
  return (
    <Modal onClose={onCancel} role="alertdialog" ariaLabel={title}>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <p className="text-sm text-slate-ink">{message}</p>
      <div className="flex gap-2 pt-1">
        <button ref={cancelRef} onClick={onCancel} className="btn-secondary flex-1">Cancelar</button>
        <button onClick={onConfirm} className={danger ? 'btn-primary flex-1' : 'btn-dark flex-1'}>{confirmLabel}</button>
      </div>
    </Modal>
  )
}
