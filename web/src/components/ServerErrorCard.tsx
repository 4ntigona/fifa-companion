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
