import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { api, type Career, type ExtractedPlayer, type VisionResult } from '../api/client'
import { getCareer, createCareerPlayer, addSnapshot, getAiSettings } from '../store'

const SCREEN_LABEL: Record<string, string> = {
  elenco: 'Elenco',
  perfil_jogador: 'Perfil de jogador',
  base_olheiros: 'Base/Olheiros',
  negociacao: 'Negociação',
  outro: 'Outra tela',
}

export default function CapturePage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<{ captureId: number; extracted: VisionResult } | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  const { data: careerData } = useQuery({
    queryKey: ['career', id],
    queryFn: () => getCareer(Number(id)),
  })
  const career = careerData?.career

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const ai = getAiSettings()
      const activeProvider = ai.activeProvider
      const apiKey = ai.keys[activeProvider] || ''
      const model = ai.models[activeProvider] || ''

      const fd = new FormData()
      fd.append('careerId', String(id))
      fd.append('image', file)
      fd.append('provider', activeProvider)
      fd.append('apiKey', apiKey)
      fd.append('model', model)
      return api<{ id: number; extracted: VisionResult | null; error: string | null }>('/api/captures', {
        method: 'POST',
        body: fd,
      })
    },
    onSuccess: (r) => {
      if (r.error) setAnalysisError(r.error)
      else if (r.extracted) setResult({ captureId: r.id, extracted: r.extracted })
    },
  })

  function onFile(file: File | undefined) {
    if (!file) return
    setResult(null)
    setAnalysisError(null)
    setPreview(URL.createObjectURL(file))
    upload.mutate(file)
  }

  return (
    <div className="space-y-4 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Capturar tela</h1>
        <Link to={`/carreira/${id}`} className="text-sm font-medium text-steel hover:text-ink">
          ← Carreira
        </Link>
      </div>
      <p className="text-sm text-slate-ink">
        Tire uma foto da tela do jogo (elenco, perfil de jogador, olheiros, negociação). A IA extrai os dados e você
        revisa antes de salvar — nada é gravado sem sua confirmação.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <button
        onClick={() => fileRef.current?.click()}
        className="w-full  border-2 border-dashed border-hairline-strong bg-surface-soft py-10 text-center transition-colors hover:border-primary hover:bg-tint-lavender/40"
      >
        <span className="text-3xl">📸</span>
        <p className="mt-2 text-sm font-semibold text-ink">Tirar foto ou escolher imagem</p>
      </button>

      {preview && <img src={preview} alt="captura" className="card max-h-64 w-full object-contain p-1" />}
      {upload.isPending && <p className="animate-pulse text-sm font-medium text-primary">Analisando a foto com IA…</p>}
      {(analysisError || upload.isError) && (
        <p className="bg-tint-rose p-4 text-sm text-charcoal">{analysisError ?? (upload.error as Error)?.message}</p>
      )}

      {result && career && (
        <ReviewPanel
          key={result.captureId}
          captureId={result.captureId}
          extracted={result.extracted}
          career={career}
          onApplied={() => {
            qc.invalidateQueries({ queryKey: ['career-players', id] })
            setResult(null)
            setPreview(null)
          }}
        />
      )}
    </div>
  )
}

interface ReviewRow extends ExtractedPlayer {
  include: boolean
  destination: 'generated' | 'youth' | 'regen' | 'snapshot'
}

function ReviewPanel(props: { captureId: number; extracted: VisionResult; career: Career; onApplied: () => void }) {
  const { extracted, career } = props
  const isSquadScreen = extracted.screenType === 'elenco'
  const [season, setSeason] = useState(career.current_season)
  const [date, setDate] = useState(career.current_date_ingame ?? '')
  const [rows, setRows] = useState<ReviewRow[]>(
    extracted.players.map((p) => ({
      ...p,
      include: true,
      destination:
        isSquadScreen && career.team_type === 'created'
          ? 'generated'
          : extracted.screenType === 'base_olheiros'
            ? 'youth'
            : 'youth',
    })),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function apply() {
    setSaving(true)
    setError(null)
    try {
      for (const row of rows.filter((r) => r.include)) {
        const created = createCareerPlayer({
          careerId: career.id,
          origin: row.destination === 'snapshot' ? 'youth' : row.destination,
          name: row.name,
          positions: row.positions || '—',
          age: row.age,
          overallOriginal: row.overall,
          potentialOriginal: row.potential,
          notes: [row.notes, row.value ? `Valor visto: ${row.value}` : null].filter(Boolean).join(' · ') || undefined,
          jerseyNumber: row.jerseyNumber,
          status: row.destination === 'generated' ? 'elenco' : 'base',
          inSquad: row.destination === 'generated',
        })
        // Snapshot inicial datado — registra o estado visto na foto na temporada atual.
        if (row.overall != null || row.potential != null) {
          addSnapshot(created.id, {
            season,
            dateIngame: date || undefined,
            overall: row.overall,
            potential: row.potential,
            position: row.positions,
            formNotes: 'Registrado por foto',
          })
        }
      }
      await api(`/api/captures/${props.captureId}`, { method: 'PATCH', body: JSON.stringify({ applied: true }) })
      props.onApplied()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3  border-2 border-primary bg-canvas p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">
          Revisão — {SCREEN_LABEL[extracted.screenType] ?? extracted.screenType}
        </h2>
        {extracted.fifaVersionGuess && <span className="tag-purple">Parece FIFA {extracted.fifaVersionGuess}</span>}
      </div>
      {extracted.context && <p className="text-[13px] text-steel">{extracted.context}</p>}

      <div className="flex items-center gap-2 text-sm">
        <span className="text-[13px] text-steel">📅 Registrar em:</span>
        <input value={season} onChange={(e) => setSeason(e.target.value)} className="input w-24 px-2 py-1.5 text-sm" />
        <input
          value={date}
          onChange={(e) => setDate(e.target.value)}
          type="date"
          className="input w-auto px-2 py-1.5 text-sm"
        />
      </div>

      {rows.length === 0 && <p className="text-sm text-slate-ink">Nenhum jogador legível na foto.</p>}
      <ul className="space-y-2">
        {rows.map((row, i) => (
          <li key={i} className={` p-3 text-sm ${row.include ? 'bg-surface' : 'bg-surface-soft opacity-50'}`}>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={row.include}
                className="size-4 accent-[#ff0033]"
                onChange={(e) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, include: e.target.checked } : r)))}
              />
              <input
                value={row.name}
                onChange={(e) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))}
                className="input flex-1 px-2 py-1.5 text-sm font-semibold"
              />
              <input
                value={row.positions ?? ''}
                placeholder="POS"
                onChange={(e) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, positions: e.target.value } : r)))}
                className="input w-16 px-2 py-1.5 text-center text-sm"
              />
            </div>
            <div className="mt-2 flex items-center gap-2 text-[13px] text-steel">
              <label>
                Idade{' '}
                <input
                  value={row.age ?? ''}
                  inputMode="numeric"
                  onChange={(e) =>
                    setRows((rs) =>
                      rs.map((r, j) =>
                        j === i
                          ? { ...r, age: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : undefined }
                          : r,
                      ),
                    )
                  }
                  className="input w-12 px-1 py-1 text-center text-sm"
                />
              </label>
              <label>
                OVR{' '}
                <input
                  value={row.overall ?? ''}
                  inputMode="numeric"
                  onChange={(e) =>
                    setRows((rs) =>
                      rs.map((r, j) =>
                        j === i
                          ? { ...r, overall: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : undefined }
                          : r,
                      ),
                    )
                  }
                  className="input w-12 px-1 py-1 text-center text-sm"
                />
              </label>
              <label>
                POT{' '}
                <input
                  value={row.potential ?? ''}
                  inputMode="numeric"
                  onChange={(e) =>
                    setRows((rs) =>
                      rs.map((r, j) =>
                        j === i
                          ? { ...r, potential: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : undefined }
                          : r,
                      ),
                    )
                  }
                  className="input w-12 px-1 py-1 text-center text-sm"
                />
              </label>
              <select
                value={row.destination}
                onChange={(e) =>
                  setRows((rs) =>
                    rs.map((r, j) => (j === i ? { ...r, destination: e.target.value as ReviewRow['destination'] } : r)),
                  )
                }
                className="input ml-auto w-auto px-2 py-1 text-sm"
              >
                <option value="youth">Base</option>
                <option value="regen">Regen</option>
                <option value="generated">Elenco (gerado)</option>
              </select>
            </div>
            {row.notes && <p className="mt-1 text-[13px] text-steel">{row.notes}</p>}
          </li>
        ))}
      </ul>

      {error && <p className="text-sm text-error">{error}</p>}
      <button onClick={apply} disabled={saving || rows.every((r) => !r.include)} className="btn-primary w-full py-3">
        {saving ? 'Salvando…' : `Confirmar ${rows.filter((r) => r.include).length} jogador(es)`}
      </button>
    </div>
  )
}
