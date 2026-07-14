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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-deep/50 sm:items-center" onClick={onClose}>
      <div role={role} aria-modal="true" aria-label={ariaLabel}
        className="w-full max-w-md space-y-2 bg-canvas p-5 shadow-[0_24px_48px_-8px_rgba(15,15,15,0.2)]"
        onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
