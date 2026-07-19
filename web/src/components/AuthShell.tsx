import type { ReactNode } from 'react'

/** Moldura de tela cheia das telas fora do shell (login, troca forçada de senha): o wordmark
 *  da marca, a faixa geométrica de assinatura e um card centralizado. É a primeira impressão
 *  da identidade Prancheta. */
export default function AuthShell({ title, subtitle, children }: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex justify-center">
          <span className="display text-2xl italic text-ink">Prancheta<span className="text-pink">!</span></span>
        </div>
        <div className="card overflow-hidden">
          <div className="patternband" />
          <div className="p-6">
            <h1 className="display text-[22px] not-italic text-ink">{title}</h1>
            <p className="mt-1 text-sm text-slate-ink">{subtitle}</p>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
