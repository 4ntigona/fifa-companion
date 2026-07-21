import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { importLocalBlob, type ImportLocalResult } from '../api/user-data'
import { readLegacyBlob, markLegacyMigrated } from '../store'

/**
 * Banner one-shot pós-login: se este navegador ainda tem dados do modelo antigo
 * (local-first, anterior à v0.3.000) no localStorage, oferece importá-los para a conta.
 * Some após migrar (ou dispensar) — o blob local fica no navegador como fallback.
 *
 * O caminho por "chave de restauração" saiu na v0.4.002 junto com a tabela sync_blobs
 * (ver plans/021): a migração já cumpriu seu papel e manter a rota pública não se
 * justificava. Este caminho sobrevive porque lê só o localStorage — não depende do
 * servidor e custa zero.
 */
export default function MigrateLocalBanner() {
  const qc = useQueryClient()
  const [legacy] = useState(() => readLegacyBlob())
  const [dismissed, setDismissed] = useState(false)
  const [done, setDone] = useState<ImportLocalResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const migrate = useMutation({
    mutationFn: async () => {
      if (!legacy) throw new Error('Nada para importar.')
      return importLocalBlob(legacy)
    },
    onSuccess: (r) => {
      markLegacyMigrated()
      setDone(r)
      setError(null)
      qc.invalidateQueries({ queryKey: ['careers'] })
    },
    onError: (e) => setError((e as Error).message),
  })

  if (done) {
    return (
      <div className="rounded-xl bg-tint-mint p-4 text-sm text-charcoal">
        Importado para sua conta: {done.careers} carreira(s), {done.players} jogador(es),{' '}
        {done.snapshots} snapshot(s), {done.prospects} prospecto(s).
      </div>
    )
  }

  // Sem dados antigos neste navegador (o caso normal): o banner não existe.
  if (dismissed || !legacy) return null

  return (
    <div className="space-y-3 rounded-xl border border-hairline bg-tint-yellow-bold p-4 text-sm text-charcoal">
      <p className="font-semibold">Seus dados agora vivem na sua conta.</p>
      <p>
        Encontramos carreiras salvas no modelo antigo (só neste navegador). Importe-as para a
        sua conta para acessá-las de qualquer aparelho.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => migrate.mutate()} disabled={migrate.isPending} className="btn-primary">
          {migrate.isPending ? 'Importando…' : 'Importar meus dados locais'}
        </button>
        <button onClick={() => setDismissed(true)} className="btn-secondary">Agora não</button>
      </div>
      {error && <p className="font-medium text-error">{error}</p>}
    </div>
  )
}
