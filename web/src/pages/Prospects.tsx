import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { api, fmtEur, versionLabel, type Career, type Prospect, type SofifaPlayer } from '../api/client'

const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST']
const STATUS_LABEL: Record<Prospect['status'], string> = {
  observando: '👀 Observando', negociando: '🤝 Negociando', contratado: '✅ Contratado', descartado: '✖ Descartado',
}

export default function ProspectsPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'buscar' | 'shortlist'>('buscar')
  const [q, setQ] = useState('')
  const [position, setPosition] = useState('')
  const [maxAge, setMaxAge] = useState('')
  const [minPotential, setMinPotential] = useState('')
  const [minOverall, setMinOverall] = useState('')
  const [maxValue, setMaxValue] = useState('')
  const [sort, setSort] = useState('potential')

  const { data: careerData } = useQuery({
    queryKey: ['career', id],
    queryFn: () => api<{ career: Career }>(`/api/careers/${id}`),
  })
  const version = careerData?.career.fifa_version

  const params = new URLSearchParams({
    ...(q && { q }), ...(position && { position }), ...(maxAge && { maxAge }),
    ...(minPotential && { minPotential }), ...(minOverall && { minOverall }),
    ...(maxValue && { maxValue: String(Number(maxValue) * 1_000_000) }), sort, limit: '50',
  })
  const { data: searchData, isFetching } = useQuery({
    queryKey: ['player-search', version, params.toString()],
    queryFn: () => api<{ players: SofifaPlayer[]; total: number }>(`/api/players/${version}?${params}`),
    enabled: version != null && tab === 'buscar',
  })

  const { data: prospectsData } = useQuery({
    queryKey: ['prospects', id],
    queryFn: () => api<{ prospects: Prospect[] }>(`/api/careers/${id}/prospects`),
  })
  const prospects = prospectsData?.prospects ?? []
  const shortlistIds = new Set(prospects.map((p) => p.sofifa_player_id))

  const addProspect = useMutation({
    mutationFn: (sofifaPlayerId: number) =>
      api('/api/prospects', { method: 'POST', body: JSON.stringify({ careerId: Number(id), sofifaPlayerId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prospects', id] }),
  })
  const updateProspect = useMutation({
    mutationFn: (p: { pid: number; status?: string; notes?: string; priority?: number }) =>
      api(`/api/prospects/${p.pid}`, { method: 'PATCH', body: JSON.stringify(p) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prospects', id] })
      qc.invalidateQueries({ queryKey: ['career-players', id] })
    },
  })
  const removeProspect = useMutation({
    mutationFn: (pid: number) => api(`/api/prospects/${pid}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prospects', id] }),
  })

  return (
    <div className="space-y-4 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Prospecção {version ? <span className="text-steel">· {versionLabel(version)}</span> : ''}
        </h1>
        <Link to={`/carreira/${id}`} className="text-sm font-medium text-steel hover:text-ink">← Carreira</Link>
      </div>
      <p className="text-[13px] text-steel">Busca na database original do jogo — overalls, potenciais e valores reais.</p>

      <div className="flex gap-2">
        <button onClick={() => setTab('buscar')} className={tab === 'buscar' ? 'pill-tab-active' : 'pill-tab'}>
          Buscar jogadores
        </button>
        <button onClick={() => setTab('shortlist')} className={tab === 'shortlist' ? 'pill-tab-active' : 'pill-tab'}>
          Shortlist ({prospects.length})
        </button>
      </div>

      {tab === 'buscar' && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome…" className="input" />
            <select value={position} onChange={(e) => setPosition(e.target.value)} className="input">
              <option value="">Posição</option>
              {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input value={maxAge} onChange={(e) => setMaxAge(e.target.value.replace(/\D/g, ''))} placeholder="Idade máx." inputMode="numeric" className="input" />
            <input value={minOverall} onChange={(e) => setMinOverall(e.target.value.replace(/\D/g, ''))} placeholder="Overall mín." inputMode="numeric" className="input" />
            <input value={minPotential} onChange={(e) => setMinPotential(e.target.value.replace(/\D/g, ''))} placeholder="Potencial mín." inputMode="numeric" className="input" />
            <input value={maxValue} onChange={(e) => setMaxValue(e.target.value.replace(/\D/g, ''))} placeholder="Valor máx. (€M)" inputMode="numeric" className="input" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="mr-1 text-[13px] text-steel">Ordenar:</span>
            {[['potential', 'Potencial'], ['overall', 'Overall'], ['growth', 'Margem'], ['age', 'Idade'], ['value', 'Valor']].map(([k, label]) => (
              <button key={k} onClick={() => setSort(k)} className={sort === k ? 'pill-tab-active' : 'pill-tab'}>
                {label}
              </button>
            ))}
          </div>

          {isFetching && <p className="text-sm text-steel">Buscando…</p>}
          {searchData && (
            <p className="text-[13px] text-stone">{searchData.total.toLocaleString('pt-BR')} jogadores encontrados</p>
          )}
          <ul className="space-y-1">
            {searchData?.players.map((p) => (
              <li key={p.player_id} className="card p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-semibold text-ink">{p.short_name}</span>
                    <span className="ml-2 text-[13px] text-steel">{p.positions} · {p.age} anos</span>
                    <div className="truncate text-[13px] text-slate-ink">{p.club_name ?? '—'} · {p.league_name ?? '—'} · {fmtEur(p.value_eur)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="text-right">
                      <span className="font-semibold text-success">{p.overall}</span>
                      <span className="text-stone"> → {p.potential}</span>
                    </div>
                    <button
                      onClick={() => addProspect.mutate(p.player_id)}
                      disabled={shortlistIds.has(p.player_id)}
                      className="btn-primary px-3 py-1.5 text-[13px]"
                    >
                      {shortlistIds.has(p.player_id) ? 'Na lista' : '+ Shortlist'}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === 'shortlist' && (
        <ul className="space-y-2">
          {prospects.length === 0 && (
            <p className="card bg-surface-soft p-4 text-sm text-slate-ink">
              Shortlist vazia — adicione jogadores pela busca.
            </p>
          )}
          {prospects.map((pr) => (
            <li key={pr.id} className="card p-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-ink">{pr.player?.short_name ?? `#${pr.sofifa_player_id}`}</span>
                  <span className="ml-2 text-[13px] text-steel">
                    {pr.player ? `${pr.player.positions} · ${pr.player.age} anos · ${fmtEur(pr.player.value_eur)}` : ''}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-semibold text-success">{pr.player?.overall}</span>
                  <span className="text-stone"> → {pr.player?.potential}</span>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {(Object.keys(STATUS_LABEL) as Prospect['status'][]).map((s) => (
                  <button key={s} onClick={() => updateProspect.mutate({ pid: pr.id, status: s })}
                    className={`${pr.status === s ? 'pill-tab-active' : 'pill-tab'} px-3 py-1 text-[13px]`}>
                    {STATUS_LABEL[s]}
                  </button>
                ))}
                <button onClick={() => removeProspect.mutate(pr.id)}
                  className="ml-auto  px-2 py-1 text-[13px] font-medium text-error hover:bg-tint-rose">
                  Remover
                </button>
              </div>
              <NotesEditor value={pr.notes} onSave={(notes) => updateProspect.mutate({ pid: pr.id, notes })} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NotesEditor({ value, onSave }: { value: string | null; onSave: (v: string) => void }) {
  const [v, setV] = useState(value ?? '')
  return (
    <div className="mt-2 flex gap-2">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Notas…"
        className="input flex-1 px-2.5 py-1.5 text-[13px]" />
      {v !== (value ?? '') && (
        <button onClick={() => onSave(v)} className="btn-secondary px-3 py-1.5 text-[13px]">Salvar</button>
      )}
    </div>
  )
}
