import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { importLocalBlob, type ImportLocalResult } from '../api/user-data'
import { readLegacyBlob, markLegacyMigrated } from '../store'

/**
 * Banner one-shot pós-login: dados do modelo antigo (localStorage) ou de uma
 * chave de restauração podem ser importados para a conta. Some após migrar
 * (ou dispensar) — o blob local fica no navegador como fallback.
 */
export default function MigrateLocalBanner() {
  const qc = useQueryClient()
  const [legacy] = useState(() => readLegacyBlob())
  const [dismissed, setDismissed] = useState(false)
  const [restoreCode, setRestoreCode] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [done, setDone] = useState<ImportLocalResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const migrate = useMutation({
    mutationFn: async (source: 'local' | 'code') => {
      if (source === 'local') {
        if (!legacy) throw new Error('Nada para importar.')
        return importLocalBlob(legacy)
      }
      const code = restoreCode.trim().toUpperCase()
      if (!code) throw new Error('Informe a chave.')
      const r = await api<{ data: string }>(`/api/sync/${encodeURIComponent(code)}`)
      return importLocalBlob(JSON.parse(r.data))
    },
    onSuccess: (r) => {
      markLegacyMigrated()
      setDone(r)
      setError(null)
      qc.invalidateQueries({ queryKey: ['careers'] })
    },
    onError: (e) => setError((e as Error).message),
  })

  if (dismissed || (!legacy && !showCode && !done)) {
    // sem dados locais: oferece só um link discreto para restaurar por chave
    if (!done && !dismissed) {
      return (
        <button onClick={() => setShowCode(true)} className="text-[13px] text-steel underline hover:text-ink">
          Tem dados no modelo antigo (chave de restauração)? Importe para sua conta.
        </button>
      )
    }
    return null
  }

  if (done) {
    return (
      <div className="rounded-xl bg-tint-mint p-4 text-sm text-charcoal">
        Importado para sua conta: {done.careers} carreira(s), {done.players} jogador(es),{' '}
        {done.snapshots} snapshot(s), {done.prospects} prospecto(s).
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-xl border border-hairline bg-tint-yellow-bold p-4 text-sm text-charcoal">
      <p className="font-semibold">Seus dados agora vivem na sua conta.</p>
      <p>
        {legacy
          ? 'Encontramos carreiras salvas no modelo antigo (só neste navegador). Importe-as para a sua conta para acessá-las de qualquer aparelho.'
          : 'Cole a chave de restauração do modelo antigo para trazer os dados para a sua conta.'}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {legacy && (
          <button onClick={() => migrate.mutate('local')} disabled={migrate.isPending} className="btn-primary">
            {migrate.isPending ? 'Importando…' : 'Importar meus dados locais'}
          </button>
        )}
        {!showCode && (
          <button onClick={() => setShowCode(true)} className="btn-secondary">Usar chave de restauração</button>
        )}
        <button onClick={() => setDismissed(true)} className="btn-secondary">Agora não</button>
      </div>
      {showCode && (
        <div className="flex flex-wrap gap-2">
          <input
            value={restoreCode}
            onChange={(e) => setRestoreCode(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX-XXXX"
            className="input flex-1"
          />
          <button onClick={() => migrate.mutate('code')} disabled={!restoreCode.trim() || migrate.isPending} className="btn-secondary">
            {migrate.isPending ? 'Importando…' : 'Importar da chave'}
          </button>
        </div>
      )}
      {error && <p className="font-medium text-error">{error}</p>}
    </div>
  )
}
