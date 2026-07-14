import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { api, fmtEur, versionLabel, type Prospect, type SofifaPlayer, type SofifaPlayerListItem } from '../api/client'
import { getCareer, listProspects, addProspect as addProspectStore, updateProspect as updateProspectStore, removeProspect as removeProspectStore } from '../store'
import { useDebouncedValue } from '../hooks'

const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST']
const STATUS_LABEL: Record<Prospect['status'], string> = {
  observando: '👀 Observando', negociando: '🤝 Negociando', contratado: '✅ Contratado', descartado: '✖ Descartado',
}
const PRIORITY = [[1, '🔴 Alta'], [2, '🟡 Média'], [3, '⚪ Baixa']] as const

interface CountryLeagues {
  country: string
  leagues: { id: number | null; name: string; level: number | null; teams: number }[]
}

export default function ProspectsPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'buscar' | 'shortlist'>('buscar')
  const [q, setQ] = useState('')
  const [position, setPosition] = useState('')
  const [maxAge, setMaxAge] = useState('')
  const [minAge, setMinAge] = useState('')
  const [minPotential, setMinPotential] = useState('')
  const [minOverall, setMinOverall] = useState('')
  const [maxValue, setMaxValue] = useState('')
  const [league, setLeague] = useState('')
  const [nationality, setNationality] = useState('')
  const [sort, setSort] = useState('potential')
  const [limit, setLimit] = useState(50)

  // valores debounced — não busca a cada tecla
  const dq = useDebouncedValue(q)
  const dMaxAge = useDebouncedValue(maxAge)
  const dMinAge = useDebouncedValue(minAge)
  const dMinOverall = useDebouncedValue(minOverall)
  const dMinPotential = useDebouncedValue(minPotential)
  const dMaxValue = useDebouncedValue(maxValue)

  const { data: careerData } = useQuery({
    queryKey: ['career', id],
    queryFn: async () => getCareer(Number(id)),
    retry: false,
  })
  const version = careerData?.career.fifa_version

  const { data: leaguesData } = useQuery({
    queryKey: ['leagues', version],
    queryFn: () => api<{ countries: CountryLeagues[] }>(`/api/leagues/${version}`),
    enabled: version != null,
  })
  const countries = leaguesData?.countries ?? []
  const allLeagues = [...new Map(countries.flatMap((c) => c.leagues).map((l) => [l.name, l])).values()]
    .sort((a, b) => a.name.localeCompare(b.name))

  // volta o limite ao mudar qualquer filtro
  useEffect(() => { setLimit(50) }, [dq, position, dMaxAge, dMinAge, dMinOverall, dMinPotential, dMaxValue, league, nationality, sort])

  const params = new URLSearchParams({
    ...(dq && { q: dq }), ...(position && { position }), ...(dMaxAge && { maxAge: dMaxAge }),
    ...(dMinAge && { minAge: dMinAge }),
    ...(dMinPotential && { minPotential: dMinPotential }), ...(dMinOverall && { minOverall: dMinOverall }),
    ...(dMaxValue && { maxValue: String(Number(dMaxValue) * 1_000_000) }),
    ...(league && { league }), ...(nationality && { nationality }),
    sort, limit: String(limit),
  })
  const { data: searchData, isFetching, isError: searchError, error: searchErr, refetch: refetchSearch } = useQuery({
    queryKey: ['player-search', version, params.toString()],
    queryFn: () => api<{ players: SofifaPlayerListItem[]; total: number }>(`/api/players/${version}?${params}`),
    enabled: version != null && tab === 'buscar',
    placeholderData: (prev) => prev,
  })

  const { data: prospectsData } = useQuery({
    queryKey: ['prospects', id],
    queryFn: async () => listProspects(Number(id)),
  })
  const prospects = prospectsData?.prospects ?? []
  const shortlistIds = new Set(prospects.map((p) => p.sofifa_player_id))
  const sortedProspects = [...prospects].sort((a, b) => a.priority - b.priority)

  const addProspect = useMutation({
    // a busca só traz um subconjunto de colunas — reidrata o registro completo (attributes_json
    // incluso) antes de gravar no localStorage, para a tela do jogador poder exibi-lo depois.
    mutationFn: async (p: SofifaPlayerListItem) => {
      const full = await api<{ player: SofifaPlayer }>(`/api/player/${version}/${p.player_id}`)
      return addProspectStore(Number(id), full.player)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prospects', id] }),
  })
  const updateProspect = useMutation({
    mutationFn: async (p: { pid: number; status?: Prospect['status']; notes?: string; priority?: number }) =>
      updateProspectStore(p.pid, { status: p.status, notes: p.notes, priority: p.priority }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prospects', id] })
      qc.invalidateQueries({ queryKey: ['career-players', id] })
    },
  })
  const removeProspect = useMutation({
    mutationFn: async (pid: number) => removeProspectStore(pid),
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
            <input value={minAge} onChange={(e) => setMinAge(e.target.value.replace(/\D/g, ''))} placeholder="Idade mín." inputMode="numeric" className="input" />
            <input value={maxAge} onChange={(e) => setMaxAge(e.target.value.replace(/\D/g, ''))} placeholder="Idade máx." inputMode="numeric" className="input" />
            <input value={minOverall} onChange={(e) => setMinOverall(e.target.value.replace(/\D/g, ''))} placeholder="Overall mín." inputMode="numeric" className="input" />
            <input value={minPotential} onChange={(e) => setMinPotential(e.target.value.replace(/\D/g, ''))} placeholder="Potencial mín." inputMode="numeric" className="input" />
            <input value={maxValue} onChange={(e) => setMaxValue(e.target.value.replace(/\D/g, ''))} placeholder="Valor máx. (€M)" inputMode="numeric" className="input" />
            <select value={league} onChange={(e) => setLeague(e.target.value)} className="input">
              <option value="">Liga</option>
              {allLeagues.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
            </select>
            <select value={nationality} onChange={(e) => setNationality(e.target.value)} className="input">
              <option value="">Nacionalidade</option>
              {countries.map((c) => <option key={c.country} value={c.country}>{c.country}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="mr-1 text-[13px] text-steel">Ordenar:</span>
            {[['potential', 'Potencial'], ['overall', 'Overall'], ['growth', 'Margem'], ['age', 'Idade'], ['value', 'Valor']].map(([k, label]) => (
              <button key={k} onClick={() => setSort(k)} className={sort === k ? 'pill-tab-active' : 'pill-tab'}>
                {label}
              </button>
            ))}
          </div>

          {searchError ? (
            <div className="card bg-tint-rose p-5 text-sm text-charcoal">
              <p className="font-semibold">Sem conexão com o servidor.</p>
              <p className="mt-1">{(searchErr as Error).message}</p>
              <button onClick={() => refetchSearch()} className="btn-secondary mt-3">Tentar de novo</button>
            </div>
          ) : (
          <>
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
                      onClick={() => addProspect.mutate(p)}
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
          {searchData && searchData.players.length < searchData.total && searchData.players.length < 200 && (
            <button onClick={() => setLimit((l) => l + 50)} disabled={isFetching} className="btn-secondary w-full">
              {isFetching ? 'Carregando…' : `Carregar mais (${searchData.players.length} de ${searchData.total.toLocaleString('pt-BR')})`}
            </button>
          )}
          </>
          )}
        </>
      )}

      {tab === 'shortlist' && (
        <ul className="space-y-2">
          {prospects.length === 0 && (
            <p className="card bg-surface-soft p-4 text-sm text-slate-ink">
              Shortlist vazia — adicione jogadores pela busca.
            </p>
          )}
          {sortedProspects.map((pr) => (
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
                {PRIORITY.map(([p, label]) => (
                  <button key={p} onClick={() => updateProspect.mutate({ pid: pr.id, priority: p })}
                    className={`${pr.priority === p ? 'pill-tab-active' : 'pill-tab'} px-3 py-1 text-[13px]`}>
                    {label}
                  </button>
                ))}
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
