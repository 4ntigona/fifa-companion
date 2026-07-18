import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { analyzePhoto, type Career, type ExtractedPlayer, type VisionResult } from '../api/client'
import { getAiSettings, DEFAULT_MODELS, PROVIDER_LABELS } from '../store'
import { getCareer, applyCapturedPlayers, listCareerPlayers, type CapturedPlayerRow } from '../api/user-data'
import type { CareerPlayer } from '../api/client'
import { sanitizeStat, setActiveCareerId } from '../hooks'

const SCREEN_LABEL: Record<string, string> = {
  elenco: 'Elenco', perfil_jogador: 'Perfil de jogador', base_olheiros: 'Base/Olheiros',
  negociacao: 'Negociação', outro: 'Outra tela',
}

/** File → { base64, mediaType } normalizando para um dos formatos aceitos. */
function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      const [meta, b64] = dataUrl.split(',')
      const mime = meta.slice(meta.indexOf(':') + 1, meta.indexOf(';'))
      const mediaType = /image\/(jpeg|png|webp)/.test(mime) ? mime : 'image/jpeg'
      resolve({ base64: b64, mediaType })
    }
    reader.onerror = () => reject(new Error('Falha ao ler a imagem.'))
    reader.readAsDataURL(file)
  })
}

export default function CapturePage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const lastFileRef = useRef<File | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<{ extracted: VisionResult } | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  useEffect(() => { if (id) setActiveCareerId(Number(id)) }, [id])

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  function setPreviewUrl(url: string | null) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = url
    setPreview(url)
  }

  const { data: careerData } = useQuery({
    queryKey: ['career', id],
    queryFn: async () => getCareer(Number(id)),
    retry: false,
  })
  const career = careerData?.career

  const ai = getAiSettings()
  const aiKey = ai.keys[ai.activeProvider]

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!aiKey) {
        throw new Error(`Adicione a chave da ${PROVIDER_LABELS[ai.activeProvider]} em ⚙️ Configurações para analisar fotos.`)
      }
      const { base64, mediaType } = await fileToBase64(file)
      return analyzePhoto({
        provider: ai.activeProvider,
        apiKey: aiKey,
        model: ai.models[ai.activeProvider] || DEFAULT_MODELS[ai.activeProvider],
        mediaType,
        imageBase64: base64,
      })
    },
    onSuccess: (extracted) => setResult({ extracted }),
    onError: (e) => setAnalysisError((e as Error).message),
  })

  function onFile(file: File | undefined) {
    if (!file) return
    lastFileRef.current = file
    setResult(null)
    setAnalysisError(null)
    setPreviewUrl(URL.createObjectURL(file))
    upload.mutate(file)
  }

  return (
    <div className="space-y-4 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Capturar tela</h1>
        <Link to={`/carreira/${id}`} className="text-sm font-medium text-steel hover:text-ink">← Carreira</Link>
      </div>
      <p className="text-sm text-slate-ink">
        Tire uma foto da tela do jogo (elenco, perfil de jogador, olheiros, negociação). A IA extrai os dados
        e você revisa antes de salvar — nada é gravado sem sua confirmação.
      </p>

      <input
        ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
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
        <div className="bg-tint-rose p-4 text-sm text-charcoal">
          <p>{analysisError ?? (upload.error as Error)?.message}</p>
          {lastFileRef.current && (
            <button onClick={() => onFile(lastFileRef.current!)} className="btn-secondary mt-3">
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {result && career && (
        <ReviewPanel
          extracted={result.extracted}
          career={career}
          onApplied={() => {
            qc.invalidateQueries({ queryKey: ['career-players', id] })
            setResult(null); setPreviewUrl(null)
          }}
        />
      )}
    </div>
  )
}

interface ReviewRow extends ExtractedPlayer {
  include: boolean
  destination: 'generated' | 'youth' | 'regen' | 'snapshot'
  targetPlayerId?: number
}

/** Normaliza para comparação de nome (minúsculas, sem acento) — só para sugerir, nunca decide sozinho. */
function normalizeName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function suggestMatch(name: string, squad: CareerPlayer[]): number | undefined {
  const n = normalizeName(name)
  return squad.find((p) => normalizeName(p.name) === n || normalizeName(p.name).includes(n) || n.includes(normalizeName(p.name)))?.id
}

function ReviewPanel(props: { extracted: VisionResult; career: Career; onApplied: () => void }) {
  const { extracted, career } = props
  const isSquadScreen = extracted.screenType === 'elenco'
  const isProfileScreen = extracted.screenType === 'perfil_jogador'
  const { data: squadData } = useQuery({
    queryKey: ['career-players', String(career.id)],
    queryFn: () => listCareerPlayers(career.id),
  })
  const squad = squadData?.players ?? []
  const [season, setSeason] = useState(career.current_season)
  const [date, setDate] = useState(career.current_date_ingame ?? '')
  const [rows, setRows] = useState<ReviewRow[]>(
    extracted.players.map((p) => ({
      ...p, include: true,
      destination: isProfileScreen ? 'snapshot'
        : isSquadScreen && career.team_type === 'created' ? 'generated'
        : 'youth',
      targetPlayerId: undefined,
    })),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // O elenco chega async do servidor — sugere o casamento por nome quando carregar.
  useEffect(() => {
    if (!squad.length) return
    setRows((rs) => rs.map((r) =>
      r.destination === 'snapshot' && r.targetPlayerId == null
        ? { ...r, targetPlayerId: suggestMatch(r.name, squad) }
        : r,
    ))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [squadData])

  async function apply() {
    setSaving(true)
    setError(null)
    try {
      const included = rows.filter((r) => r.include)
      const missingTarget = included.filter((r) => r.destination === 'snapshot' && !r.targetPlayerId)
      if (missingTarget.length) {
        throw new Error(`Escolha o jogador do elenco para "${missingTarget[0].name}" (destino Evolução exige o jogador-alvo) ou mude o destino.`)
      }
      const missingStats = included.filter((r) => r.destination === 'snapshot' && r.overall == null && r.potential == null)
      if (missingStats.length) {
        throw new Error(`"${missingStats[0].name}" não tem overall/potencial lidos — não há o que registrar como evolução.`)
      }
      const capturedRows: CapturedPlayerRow[] = included.map((row): CapturedPlayerRow => {
        const snapshot = row.overall != null || row.potential != null
          ? { season, dateIngame: date || undefined, overall: row.overall, potential: row.potential, position: row.positions, formNotes: 'Registrado por foto' }
          : undefined
        if (row.destination === 'snapshot') {
          return { target: 'existing', targetPlayerId: row.targetPlayerId!, snapshot: snapshot! }
        }
        return {
          target: 'new',
          origin: row.destination,
          name: row.name,
          positions: row.positions || '—',
          age: row.age,
          overallOriginal: row.overall,
          potentialOriginal: row.potential,
          notes: [row.notes, row.value ? `Valor visto: ${row.value}` : null].filter(Boolean).join(' · ') || undefined,
          jerseyNumber: row.jerseyNumber,
          status: row.destination === 'generated' ? 'elenco' : 'base',
          inSquad: row.destination === 'generated',
          snapshot,
        }
      })
      await applyCapturedPlayers(career.id, capturedRows)
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
        <h2 className="text-lg font-semibold text-ink">Revisão — {SCREEN_LABEL[extracted.screenType] ?? extracted.screenType}</h2>
        {extracted.fifaVersionGuess && <span className="tag-purple">Parece FIFA {extracted.fifaVersionGuess}</span>}
      </div>
      {extracted.context && <p className="text-[13px] text-steel">{extracted.context}</p>}

      <div className="flex items-center gap-2 text-sm">
        <span className="text-[13px] text-steel">📅 Registrar em:</span>
        <input value={season} onChange={(e) => setSeason(e.target.value)} className="input w-24 px-2 py-1.5 text-sm" />
        <input value={date} onChange={(e) => setDate(e.target.value)} type="date" className="input w-auto px-2 py-1.5 text-sm" />
      </div>

      {rows.length === 0 && <p className="text-sm text-slate-ink">Nenhum jogador legível na foto.</p>}
      <ul className="space-y-2">
        {rows.map((row, i) => (
          <li key={i} className={` p-3 text-sm ${row.include ? 'bg-surface' : 'bg-surface-soft opacity-50'}`}>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={row.include} className="size-4 accent-[#ff0033]"
                onChange={(e) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, include: e.target.checked } : r)))} />
              <input value={row.name}
                onChange={(e) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))}
                className="input flex-1 px-2 py-1.5 text-sm font-semibold" />
              <input value={row.positions ?? ''} placeholder="POS"
                onChange={(e) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, positions: e.target.value } : r)))}
                className="input w-16 px-2 py-1.5 text-center text-sm" />
            </div>
            <div className="mt-2 flex items-center gap-2 text-[13px] text-steel">
              <label>Idade <input value={row.age ?? ''} inputMode="numeric"
                onChange={(e) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, age: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : undefined } : r)))}
                className="input w-12 px-1 py-1 text-center text-sm" /></label>
              <label>OVR <input value={row.overall ?? ''} inputMode="numeric"
                onChange={(e) => { const v = sanitizeStat(e.target.value); setRows((rs) => rs.map((r, j) => (j === i ? { ...r, overall: v ? Number(v) : undefined } : r))) }}
                className="input w-12 px-1 py-1 text-center text-sm" /></label>
              <label>POT <input value={row.potential ?? ''} inputMode="numeric"
                onChange={(e) => { const v = sanitizeStat(e.target.value); setRows((rs) => rs.map((r, j) => (j === i ? { ...r, potential: v ? Number(v) : undefined } : r))) }}
                className="input w-12 px-1 py-1 text-center text-sm" /></label>
              <select value={row.destination}
                onChange={(e) => {
                  const destination = e.target.value as ReviewRow['destination']
                  setRows((rs) => rs.map((r, j) => (j === i ? {
                    ...r, destination,
                    targetPlayerId: destination === 'snapshot' ? (r.targetPlayerId ?? suggestMatch(r.name, squad)) : undefined,
                  } : r)))
                }}
                className="input ml-auto w-auto px-2 py-1 text-sm">
                {squad.length > 0 && <option value="snapshot">Evolução (jogador existente)</option>}
                <option value="youth">Base</option>
                <option value="regen">Regen</option>
                <option value="generated">Elenco (gerado)</option>
              </select>
            </div>
            {row.destination === 'snapshot' && (
              <div className="mt-2 flex items-center gap-2 text-[13px] text-steel">
                <span>Jogador do elenco:</span>
                <select value={row.targetPlayerId ?? ''}
                  onChange={(e) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, targetPlayerId: e.target.value ? Number(e.target.value) : undefined } : r)))}
                  className="input flex-1 px-2 py-1 text-sm">
                  <option value="">Escolha o jogador…</option>
                  {squad.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
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
