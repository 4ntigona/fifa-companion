import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api, fmtEur, type SofifaTeam, type VersionInfo } from '../api/client'
import { createCareer } from '../api/user-data'
import ServerErrorCard from '../components/ServerErrorCard'
import { useDebouncedValue } from '../hooks'

interface CountryLeagues {
  country: string
  leagues: { id: number | null; name: string; level: number | null; teams: number }[]
}

export default function NewCareer() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [version, setVersion] = useState<number | null>(null)
  const [teamType, setTeamType] = useState<'existing' | 'created'>('existing')
  const [country, setCountry] = useState('')
  const [leagueId, setLeagueId] = useState<string>('') // league_id como string (select)
  const [teamQuery, setTeamQuery] = useState('')
  const [teamId, setTeamId] = useState<number | null>(null)
  const [season, setSeason] = useState('')
  // clube criado
  const [createdName, setCreatedName] = useState('')
  const [createdBudget, setCreatedBudget] = useState('')
  const [replacedTeamId, setReplacedTeamId] = useState<number | null>(null)
  const [quality, setQuality] = useState('')
  const [objectives, setObjectives] = useState('')

  const debouncedTeamQuery = useDebouncedValue(teamQuery)

  const { data: versionsData, isError: versionsError, error: versionsErr, refetch: refetchVersions } = useQuery({
    queryKey: ['versions'],
    queryFn: () => api<{ versions: VersionInfo[] }>('/api/versions'),
  })
  const versions = versionsData?.versions ?? []
  const selected = versions.find((v) => v.fifaVersion === version)

  const { data: leaguesData } = useQuery({
    queryKey: ['leagues', version],
    queryFn: () => api<{ countries: CountryLeagues[] }>(`/api/leagues/${version}`),
    enabled: version != null && Boolean(selected?.imported),
  })
  const countries = leaguesData?.countries ?? []
  const countryLeagues = countries.find((c) => c.country === country)?.leagues ?? []
  const selectedLeague = countryLeagues.find((l) => String(l.id) === leagueId)

  const { data: teamsData } = useQuery({
    queryKey: ['teams', version, leagueId, debouncedTeamQuery],
    queryFn: () =>
      api<{ teams: SofifaTeam[] }>(
        `/api/teams/${version}?` +
        new URLSearchParams({ ...(leagueId && { leagueId }), ...(debouncedTeamQuery && { q: debouncedTeamQuery }) }),
      ),
    // sem liga escolhida, busca por nome ainda funciona (todas as ligas)
    enabled: version != null && Boolean(selected?.imported) && Boolean(leagueId || debouncedTeamQuery),
  })

  const defaultSeason = useMemo(() => {
    if (!version) return ''
    const year = 2000 + version - 1 // FIFA 16 → temporada 2015/16
    return `${year}/${String(version).padStart(2, '0')}`
  }, [version])

  const create = useMutation({
    mutationFn: () =>
      createCareer({
        name: name || (teamType === 'created' ? createdName : teamsData?.teams.find((t) => t.team_id === teamId)?.team_name) || 'Carreira',
        fifaVersion: version!,
        teamType,
        sofifaTeamId: teamType === 'existing' ? teamId ?? undefined : undefined,
        createdTeamName: teamType === 'created' ? createdName : undefined,
        createdTeamBudgetEur: teamType === 'created' && createdBudget ? Number(createdBudget) : undefined,
        createdTeamLeague: teamType === 'created'
          ? (selectedLeague ? `${selectedLeague.name} (${country})` : undefined)
          : undefined,
        replacedTeamId: teamType === 'created' ? replacedTeamId ?? undefined : undefined,
        objectives: objectives ? objectives.split('\n').filter(Boolean) : undefined,
        squadQuality: teamType === 'created' ? quality || undefined : undefined,
        currentSeason: season || defaultSeason,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['careers'] })
      nav(`/carreira/${r.id}`)
    },
  })

  const canCreate =
    version != null &&
    (teamType === 'existing' ? teamId != null : createdName.trim().length > 0) &&
    (selected?.imported || teamType === 'created')

  return (
    <div className="space-y-8 pt-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Nova carreira</h1>

      <section>
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-steel">Versão do jogo</h2>
        {versionsError ? (
          <ServerErrorCard message={(versionsErr as Error).message} onRetry={() => refetchVersions()} />
        ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {versions.map((v) => (
            <button
              key={v.fifaVersion}
              onClick={() => { setVersion(v.fifaVersion); setTeamId(null); setCountry(''); setLeagueId('') }}
              className={` p-3 text-sm transition-colors ${
                version === v.fifaVersion
                  ? 'bg-tint-lavender font-semibold text-charcoal ring-2 ring-primary'
                  : v.imported
                    ? 'border border-hairline bg-canvas text-charcoal hover:border-hairline-strong'
                    : 'border border-hairline bg-surface-soft text-stone'
              }`}
            >
              {v.label}
              {!v.imported && <span className="block text-[11px]">sem database</span>}
            </button>
          ))}
        </div>
        )}
        {selected && !selected.imported && (
          <p className="mt-2  bg-tint-peach p-3 text-[13px] text-orange-deep">
            Database do {selected.label} não importada — importe na tela inicial.
            Sem ela, só é possível carreira de clube criado com jogadores por foto/manual.
          </p>
        )}
      </section>

      {version != null && (
        <section>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-steel">Time</h2>
          <div className="mb-3 flex gap-2">
            <button
              onClick={() => setTeamType('existing')}
              className={teamType === 'existing' ? 'pill-tab-active' : 'pill-tab'}
            >
              Time original do jogo
            </button>
            <button
              onClick={() => selected?.createClub && setTeamType('created')}
              disabled={!selected?.createClub}
              className={`${teamType === 'created' ? 'pill-tab-active' : 'pill-tab'} disabled:opacity-40`}
              title={selected?.createClub ? '' : 'Criar clube só existe do FIFA 22 em diante'}
            >
              Clube criado {selected?.createClub ? '' : '(FIFA 22+)'}
            </button>
          </div>

          {teamType === 'existing' && selected?.imported && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <select
                  value={country}
                  onChange={(e) => { setCountry(e.target.value); setLeagueId(''); setTeamId(null) }}
                  className="input w-1/2"
                >
                  <option value="">País…</option>
                  {countries.map((c) => (
                    <option key={c.country} value={c.country}>{c.country}</option>
                  ))}
                </select>
                <select
                  value={leagueId}
                  onChange={(e) => { setLeagueId(e.target.value); setTeamId(null) }}
                  disabled={!country}
                  className="input w-1/2"
                >
                  <option value="">{country ? 'Liga…' : 'Escolha o país'}</option>
                  {countryLeagues.map((l) => (
                    <option key={`${l.id}`} value={String(l.id)}>
                      {l.name}{l.level != null && l.level > 1 ? ` (${l.level}ª div.)` : ''} · {l.teams} times
                    </option>
                  ))}
                </select>
              </div>
              <input
                value={teamQuery}
                onChange={(e) => setTeamQuery(e.target.value)}
                placeholder={leagueId ? 'Filtrar time…' : 'Ou busque o time direto pelo nome…'}
                className="input"
              />
              <ul className="max-h-72 space-y-1 overflow-y-auto">
                {teamsData?.teams.map((t) => (
                  <li key={t.team_id}>
                    <button
                      onClick={() => setTeamId(t.team_id)}
                      className={`w-full  p-3 text-left text-sm transition-colors ${
                        teamId === t.team_id
                          ? 'bg-tint-lavender ring-2 ring-primary'
                          : 'border border-hairline bg-canvas hover:border-hairline-strong'
                      }`}
                    >
                      <div className="flex justify-between">
                        <span className="font-semibold text-ink">{t.team_name}</span>
                        <span className="font-semibold text-success">{t.overall ?? '—'}</span>
                      </div>
                      <div className="text-[13px] text-slate-ink">
                        {t.league_name} · ATA {t.attack ?? '—'} · MEI {t.midfield ?? '—'} · DEF {t.defence ?? '—'} · Verba {fmtEur(t.transfer_budget_eur)}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {teamType === 'created' && (
            <div className="space-y-2">
              <input value={createdName} onChange={(e) => setCreatedName(e.target.value)} placeholder="Nome do clube criado *" className="input" />
              <div className="flex gap-2">
                <input value={createdBudget} onChange={(e) => setCreatedBudget(e.target.value.replace(/\D/g, ''))}
                  placeholder="Verba de transferência (€)" inputMode="numeric" className="input w-1/2" />
                <input value={quality} onChange={(e) => setQuality(e.target.value)} placeholder="Qualidade do elenco (ex. 4.5★)" className="input w-1/2" />
              </div>
              {selected?.imported ? (
                <>
                  <div className="flex gap-2">
                    <select
                      value={country}
                      onChange={(e) => { setCountry(e.target.value); setLeagueId(''); setReplacedTeamId(null) }}
                      className="input w-1/2"
                    >
                      <option value="">País da liga…</option>
                      {countries.map((c) => (
                        <option key={c.country} value={c.country}>{c.country}</option>
                      ))}
                    </select>
                    <select
                      value={leagueId}
                      onChange={(e) => { setLeagueId(e.target.value); setReplacedTeamId(null) }}
                      disabled={!country}
                      className="input w-1/2"
                    >
                      <option value="">{country ? 'Liga do clube…' : 'Escolha o país'}</option>
                      {countryLeagues.map((l) => (
                        <option key={`${l.id}`} value={String(l.id)}>
                          {l.name}{l.level != null && l.level > 1 ? ` (${l.level}ª div.)` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <select
                    value={replacedTeamId ?? ''}
                    onChange={(e) => setReplacedTeamId(e.target.value ? Number(e.target.value) : null)}
                    disabled={!leagueId}
                    className="input"
                  >
                    <option value="">{leagueId ? 'Time substituído pelo seu clube…' : 'Escolha a liga primeiro'}</option>
                    {teamsData?.teams.map((t) => (
                      <option key={t.team_id} value={t.team_id}>{t.team_name}</option>
                    ))}
                  </select>
                </>
              ) : (
                <p className="bg-surface p-3 text-[13px] text-steel">
                  Importe a database do {selected?.label} para escolher liga e time substituído das listas reais.
                </p>
              )}
              <textarea value={objectives} onChange={(e) => setObjectives(e.target.value)} rows={3}
                placeholder={'Objetivos do conselho (um por linha)\nEx.: Terminar no meio da tabela'}
                className="input h-auto" />
            </div>
          )}
        </section>
      )}

      {version != null && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-steel">Detalhes</h2>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da carreira (opcional)" className="input" />
          <input value={season || defaultSeason} onChange={(e) => setSeason(e.target.value)} placeholder="Temporada inicial" className="input" />
        </section>
      )}

      {create.isError && <p className="text-sm text-error">{String((create.error as Error).message)}</p>}
      <button
        onClick={() => create.mutate()}
        disabled={!canCreate || create.isPending}
        className="btn-primary w-full py-3"
      >
        {create.isPending ? 'Criando…' : teamType === 'existing' ? 'Criar carreira (carrega o elenco completo)' : 'Criar carreira'}
      </button>
    </div>
  )
}
