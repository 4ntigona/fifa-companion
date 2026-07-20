import type { ReactNode } from 'react'
import { useEscapeClose } from '../hooks'

/** Shell de modal: overlay, click-fora fecha, Escape fecha, dialog acessível.
 *  Futuro focus-trap (adiado no plano 001) deve ser implementado AQUI, uma vez só. */
export default function Modal({ onClose, ariaLabel, role = 'dialog', children }: {
  onClose: () => void
  ariaLabel?: string
  role?: 'dialog' | 'alertdialog'
  children: ReactNode
}) {
  useEscapeClose(onClose)
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-deep/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div role={role} aria-modal="true" aria-label={ariaLabel}
        className="max-h-[90vh] w-full max-w-md space-y-2 overflow-y-auto rounded-t-2xl bg-canvas p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_24px_48px_-8px_color-mix(in_oklab,var(--color-navy-deep)_40%,transparent)] sm:rounded-2xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
