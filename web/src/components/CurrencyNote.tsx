export default function CurrencyNote({ className = 'text-steel' }: { className?: string }) {
  return (
    <p className={`text-[11px] ${className}`}>
      Valores em euros (€), conforme a database do jogo (Kaggle/SoFIFA).
    </p>
  )
}
