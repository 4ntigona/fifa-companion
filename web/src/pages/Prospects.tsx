import { useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { api, fmtEur, versionLabel, type Prospect, type SofifaPlayer, type SofifaPlayerListItem } from '../api/client'
import { getCareer, listProspects, addProspect as addProspectStore, updateProspect as updateProspectStore, removeProspect as removeProspectStore } from '../api/user-data'
import { useDebouncedValue, setActiveCareerId } from '../hooks'
import ServerErrorCard from '../components/ServerErrorCard'
import CompareProspects from '../components/CompareProspects'
import CurrencyNote from '../components/CurrencyNote'

const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST']
const STATUS_LABEL: Record<Prospect['status'], string> = {
  observando: 'Observando', negociando: 'Negociando', contratado: 'Contratado', descartado: 'Descartado',
}
const PRIORITY = [[1, 'Alta'], [2, 'Média'], [3, 'Baixa']] as const

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

  useEffect(() => { if (id) setActiveCareerId(Number(id)) }, [id])

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

  const activeFilters = [position, minAge, maxAge, minOverall, minPotential, maxValue, league, nationality].filter(Boolean).length

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
  const [compareIds, setCompareIds] = useState<number[]>([])   // ids de Prospect, máx. 2
  const [showCompare, setShowCompare] = useState(false)

  const addProspect = useMutation({
    // a busca só traz um subconjunto de colunas — reidrata o registro completo (attributes_json
    // incluso) antes de gravar, para a tela do jogador poder exibi-lo depois.
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
    <div className="space-y-4 pt-5">
      <div className="flex items-center justify-between">
        <Link to={`/carreira/${id}`} className="text-[13px] font-bold uppercase tracking-[0.06em] text-steel hover:text-ink">
          ← Elenco
        </Link>
        <span className="text-[12px] text-steel">{version ? `${versionLabel(version)} · database real` : ''}</span>
      </div>
      <h1 className="display text-[24px] not-italic text-ink">Scout</h1>

      <div className="flex gap-2">
        <button onClick={() => setTab('buscar')} className={tab === 'buscar' ? 'pill-tab-active' : 'pill-tab'}>
          Buscar
        </button>
        <button onClick={() => setTab('shortlist')} className={tab === 'shortlist' ? 'pill-tab-active' : 'pill-tab'}>
          Shortlist ({prospects.length})
        </button>
      </div>

      {tab === 'buscar' && (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome…" className="input" />

          <details className="card overflow-hidden">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium text-ink">
              Filtros
              {activeFilters > 0 && <span className="tag-purple">{activeFilters}</span>}
            </summary>
            <div className="grid grid-cols-2 gap-2 border-t border-hairline-soft p-3 sm:grid-cols-3">
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
          </details>

          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="mr-1 text-[13px] text-steel">Ordenar:</span>
            {[['potential', 'Potencial'], ['overall', 'Overall'], ['growth', 'Margem'], ['age', 'Idade'], ['value', 'Valor']].map(([k, label]) => (
              <button key={k} onClick={() => setSort(k)} className={sort === k ? 'pill-tab-active' : 'pill-tab'}>
                {label}
              </button>
            ))}
          </div>

          {searchError ? (
            <ServerErrorCard message={(searchErr as Error).message} onRetry={() => refetchSearch()} />
          ) : (
          <>
          <div className="flex items-center justify-between text-[13px] text-steel">
            <span>{searchData ? `${searchData.total.toLocaleString('pt-BR')} jogadores encontrados` : ''}</span>
            {isFetching && <span>Buscando…</span>}
          </div>
          <CurrencyNote />
          <div className="card divide-y divide-hairline-soft">
            {searchData?.players.map((p) => (
              <div key={p.player_id} className="flex items-center gap-3 px-3 py-3">
                <span className="shirtno">{p.positions.split(',')[0]?.trim() ?? '—'}</span>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink">{p.short_name}</span>
                  <span className="block truncate text-[12px] text-steel">
                    {p.age} anos · {p.club_name ?? '—'} · {fmtEur(p.value_eur)}
                  </span>
                </div>
                <span className="growpill shrink-0">{p.overall} → {p.potential}</span>
                <button
                  onClick={() => addProspect.mutate(p)}
                  disabled={shortlistIds.has(p.player_id)}
                  className="shrink-0 rounded-full border border-primary px-3 py-1.5 text-[12px] font-bold text-primary disabled:border-hairline disabled:text-faint"
                >
                  {shortlistIds.has(p.player_id) ? 'Na lista' : '+ Lista'}
                </button>
              </div>
            ))}
          </div>
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
        <>
        {prospects.length >= 2 && (
          <div className="flex items-center gap-2 text-[13px] text-steel">
            <span>Comparar:</span>
            {compareIds.length === 2
              ? <button onClick={() => setShowCompare(true)} className="btn-primary px-3 py-1.5 text-[13px]">Comparar selecionados</button>
              : <span>selecione {2 - compareIds.length} jogador(es) abaixo</span>}
            {compareIds.length > 0 && (
              <button onClick={() => setCompareIds([])} className="btn-secondary px-3 py-1.5 text-[13px]">Limpar</button>
            )}
          </div>
        )}
        {prospects.length === 0 ? (
          <p className="card bg-surface-soft p-4 text-sm text-slate-ink">
            Shortlist vazia — adicione jogadores pela busca.
          </p>
        ) : (
          <ul className="space-y-2">
            {sortedProspects.map((pr) => (
              <li key={pr.id} className="card p-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="shirtno">{pr.player?.positions.split(',')[0]?.trim() ?? '—'}</span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-ink">{pr.player?.short_name ?? `#${pr.sofifa_player_id}`}</span>
                    <span className="block truncate text-[12px] text-steel">
                      {pr.player ? `${pr.player.age} anos · ${fmtEur(pr.player.value_eur)}` : ''}
                    </span>
                  </div>
                  {pr.player && <span className="growpill shrink-0">{pr.player.overall} → {pr.player.potential}</span>}
                </div>
                <ControlRow label="Comparar">
                  <button
                    onClick={() => setCompareIds((ids) =>
                      ids.includes(pr.id) ? ids.filter((i) => i !== pr.id)
                      : ids.length < 2 ? [...ids, pr.id] : ids)}
                    disabled={!pr.player}
                    className={`${compareIds.includes(pr.id) ? 'pill-tab-active' : 'pill-tab'} px-3 py-1 text-[13px]`}>
                    {compareIds.includes(pr.id) ? 'Comparando' : 'Comparar'}
                  </button>
                  {PRIORITY.map(([p, label]) => (
                    <button key={p} onClick={() => updateProspect.mutate({ pid: pr.id, priority: p })}
                      className={`${pr.priority === p ? 'pill-tab-active' : 'pill-tab'} px-3 py-1 text-[13px]`}>
                      {label}
                    </button>
                  ))}
                </ControlRow>
                <ControlRow label="Status">
                  {(Object.keys(STATUS_LABEL) as Prospect['status'][]).map((s) => (
                    <button key={s} onClick={() => updateProspect.mutate({ pid: pr.id, status: s })}
                      className={`${pr.status === s ? 'pill-tab-active' : 'pill-tab'} px-3 py-1 text-[13px]`}>
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                  <button onClick={() => removeProspect.mutate(pr.id)}
                    className="ml-auto rounded-full px-2.5 py-1 text-[13px] font-medium text-error hover:bg-tint-rose">
                    Remover
                  </button>
                </ControlRow>
                <NotesEditor value={pr.notes} onSave={(notes) => updateProspect.mutate({ pid: pr.id, notes })} />
              </li>
            ))}
          </ul>
        )}
        </>
      )}
      {showCompare && compareIds.length === 2 && (() => {
        const [pa, pb] = compareIds.map((cid) => prospects.find((p) => p.id === cid)?.player)
        return pa && pb ? <CompareProspects a={pa} b={pb} onClose={() => setShowCompare(false)} /> : null
      })()}
    </div>
  )
}

function ControlRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-2">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-steel">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
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
