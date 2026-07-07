import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { api, fmtEur, versionLabel, type Career, type CareerPlayer } from '../api/client'

export default function CareerPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'elenco' | 'base'>('elenco')
  const [editingSeason, setEditingSeason] = useState(false)
  const [showAddPlayer, setShowAddPlayer] = useState(false)

  const { data } = useQuery({
    queryKey: ['career', id],
    queryFn: () => api<{ career: Career }>(`/api/careers/${id}`),
  })
  const { data: playersData } = useQuery({
    queryKey: ['career-players', id],
    queryFn: () => api<{ players: CareerPlayer[] }>(`/api/careers/${id}/players`),
  })

  const career = data?.career
  const players = playersData?.players ?? []
  const squad = players.filter((p) => p.in_squad && !['base'].includes(p.status))
  const youth = players.filter((p) => p.origin === 'youth' || p.origin === 'regen' || p.status === 'base')

  const updateSeason = useMutation({
    mutationFn: (payload: { currentSeason?: string; currentDateIngame?: string }) =>
      api(`/api/careers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['career', id] }); setEditingSeason(false) },
  })

  if (!career) return <p className="pt-6 text-slate-ink">Carregando…</p>

  const objectives: string[] = career.objectives ? JSON.parse(career.objectives) : []

  return (
    <div className="space-y-8 pt-6">
      {/* banda navy do dashboard — assinatura do design */}
      <section className="border border-hairline bg-navy p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{career.name}</h1>
            <p className="mt-0.5 text-sm text-white/70">
              {career.team_type === 'created'
                ? `${career.created_team_name} (clube criado${career.replacedTeam ? `, substituiu ${career.replacedTeam.team_name}` : ''})`
                : career.team?.team_name}
            </p>
          </div>
          <span className="bg-white/10 px-3 py-1 text-[13px] font-semibold text-white">
            {versionLabel(career.fifa_version)}
          </span>
        </div>

        {/* Linha do tempo do save — sempre visível e editável */}
        <div className="mt-4 flex items-center gap-2  bg-navy-mid/60 p-2.5 text-sm">
          {editingSeason ? (
            <SeasonEditor
              season={career.current_season}
              dateIngame={career.current_date_ingame}
              saving={updateSeason.isPending}
              onSave={(s, d) => updateSeason.mutate({ currentSeason: s, currentDateIngame: d || undefined })}
              onCancel={() => setEditingSeason(false)}
            />
          ) : (
            <>
              <span>📅 Temporada <b>{career.current_season}</b>{career.current_date_ingame ? ` · ${career.current_date_ingame}` : ''}</span>
              <button onClick={() => setEditingSeason(true)}
                className="ml-auto  border border-white/30 px-3 py-1 text-[13px] font-medium text-white hover:bg-white/10">
                Atualizar
              </button>
            </>
          )}
        </div>

        {career.team_type === 'created' && (
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-white/80">
            <div>Verba: <b className="text-white">{fmtEur(career.created_team_budget_eur)}</b></div>
            <div>Liga: <b className="text-white">{career.created_team_league ?? '—'}</b></div>
            <div>Qualidade: <b className="text-white">{career.squad_quality ?? '—'}</b></div>
          </div>
        )}
        {career.team && (
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-white/80 sm:grid-cols-4">
            <div>Geral <b className="text-white">{career.team.overall}</b></div>
            <div>ATA <b className="text-white">{career.team.attack}</b></div>
            <div>MEI <b className="text-white">{career.team.midfield}</b></div>
            <div>DEF <b className="text-white">{career.team.defence}</b></div>
            <div className="col-span-2">Verba: <b className="text-white">{fmtEur(career.team.transfer_budget_eur)}</b></div>
          </div>
        )}
        {objectives.length > 0 && (
          <ul className="mt-4 list-inside list-disc text-sm text-white/80">
            {objectives.map((o, i) => <li key={i}>{o}</li>)}
          </ul>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Link to={`/carreira/${id}/prospeccao`} className="btn-primary">🔎 Prospecção</Link>
          <Link to={`/carreira/${id}/captura`}
            className="bg-white px-[18px] py-2.5 text-sm font-medium text-navy hover:bg-white/90">
            📸 Capturar tela
          </Link>
          <button onClick={() => setShowAddPlayer(true)}
            className="border border-white/40 px-[18px] py-2.5 text-sm font-medium text-white hover:bg-white/10">
            + Jogador
          </button>
        </div>
      </section>

      <section>
        <div className="mb-3 flex gap-2">
          <button onClick={() => setTab('elenco')} className={tab === 'elenco' ? 'pill-tab-active' : 'pill-tab'}>
            Elenco ({squad.length})
          </button>
          <button onClick={() => setTab('base')} className={tab === 'base' ? 'pill-tab-active' : 'pill-tab'}>
            Base & Regens ({youth.length})
          </button>
        </div>
        <PlayerList players={tab === 'elenco' ? squad : youth} />
        {tab === 'elenco' && squad.length === 0 && career.team_type === 'created' && (
          <p className="card bg-surface-soft p-4 text-sm text-slate-ink">
            Clube criado: os jogadores gerados pelo jogo entram por "+ Jogador" (manual) ou por 📸 foto da tela do elenco.
          </p>
        )}
      </section>

      {showAddPlayer && <AddPlayerModal careerId={Number(id)} version={career.fifa_version} onClose={() => setShowAddPlayer(false)} />}
    </div>
  )
}

function SeasonEditor(props: {
  season: string; dateIngame: string | null; saving: boolean
  onSave: (s: string, d: string) => void; onCancel: () => void
}) {
  const [s, setS] = useState(props.season)
  const [d, setD] = useState(props.dateIngame ?? '')
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <input value={s} onChange={(e) => setS(e.target.value)} placeholder="Temporada (2024/25)"
        className="w-32  border border-white/30 bg-transparent p-1.5 text-sm text-white placeholder:text-white/50" />
      <input value={d} onChange={(e) => setD(e.target.value)} type="date"
        className="border border-white/30 bg-transparent p-1.5 text-sm text-white [color-scheme:dark]" />
      <button onClick={() => props.onSave(s, d)} disabled={props.saving}
        className="bg-primary px-3 py-1.5 text-[13px] font-semibold text-black hover:bg-primary-pressed hover:text-white">Salvar</button>
      <button onClick={props.onCancel}
        className="px-3 py-1.5 text-[13px] font-medium text-white/80 hover:bg-white/10">Cancelar</button>
    </div>
  )
}

function PlayerList({ players }: { players: CareerPlayer[] }) {
  if (players.length === 0) return null
  return (
    <ul className="space-y-1">
      {players.map((p) => {
        const ovr = p.latestSnapshot?.overall ?? p.sofifa?.overall ?? p.overall_original
        const pot = p.latestSnapshot?.potential ?? p.sofifa?.potential ?? p.potential_original
        return (
          <li key={p.id}>
            <Link to={`/jogador/${p.id}`}
              className="card flex items-center justify-between p-3 text-sm transition-colors hover:border-primary">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink">{p.name}</span>
                <span className="text-[13px] text-steel">{p.positions}{p.age ? ` · ${p.age} anos` : ''}</span>
                {p.origin !== 'sofifa' && (
                  <span className="tag-orange uppercase">{p.origin}</span>
                )}
                {p.status === 'emprestado' && <span className="tag-purple">empréstimo</span>}
              </div>
              <div className="shrink-0 text-right">
                <span className="font-semibold text-success">{ovr ?? '—'}</span>
                <span className="text-stone"> / {pot ?? '—'}</span>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function AddPlayerModal({ careerId, version, onClose }: { careerId: number; version: number; onClose: () => void }) {
  const qc = useQueryClient()
  const [origin, setOrigin] = useState<'generated' | 'youth' | 'regen'>('youth')
  const [name, setName] = useState('')
  const [positions, setPositions] = useState('')
  const [age, setAge] = useState('')
  const [overall, setOverall] = useState('')
  const [potential, setPotential] = useState('')
  const [strengths, setStrengths] = useState('')
  const [notes, setNotes] = useState('')

  const create = useMutation({
    mutationFn: () =>
      api('/api/career-players', {
        method: 'POST',
        body: JSON.stringify({
          careerId, origin, name, positions: positions || '—',
          age: age ? Number(age) : undefined,
          overallOriginal: overall ? Number(overall) : undefined,
          potentialOriginal: potential ? Number(potential) : undefined,
          strengths: strengths || undefined, notes: notes || undefined,
          status: origin === 'generated' ? 'elenco' : 'base',
          inSquad: origin === 'generated',
        }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['career-players', String(careerId)] }); onClose() },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-deep/50 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md space-y-2  bg-canvas p-5 shadow-[0_24px_48px_-8px_rgba(15,15,15,0.2)] sm:" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-ink">Adicionar jogador</h3>
        <p className="text-[13px] text-steel">
          Para jogadores reais da database do {versionLabel(version)}, use a Prospecção. Aqui entram os que só existem no seu save.
        </p>
        <div className="flex gap-2 text-sm">
          {(['youth', 'regen', 'generated'] as const).map((o) => (
            <button key={o} onClick={() => setOrigin(o)}
              className={origin === o ? 'pill-tab-active' : 'pill-tab'}>
              {o === 'youth' ? 'Base' : o === 'regen' ? 'Regen' : 'Gerado (clube criado)'}
            </button>
          ))}
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome *" className="input" />
        <div className="flex gap-2">
          <input value={positions} onChange={(e) => setPositions(e.target.value)} placeholder="Posições (ST, CAM)" className="input w-1/2" />
          <input value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))} placeholder="Idade" inputMode="numeric" className="input w-1/2" />
        </div>
        <div className="flex gap-2">
          <input value={overall} onChange={(e) => setOverall(e.target.value.replace(/\D/g, ''))} placeholder="Overall original" inputMode="numeric" className="input w-1/2" />
          <input value={potential} onChange={(e) => setPotential(e.target.value.replace(/\D/g, ''))} placeholder="Potencial original" inputMode="numeric" className="input w-1/2" />
        </div>
        <input value={strengths} onChange={(e) => setStrengths(e.target.value)} placeholder="Pontos fortes" className="input" />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações" rows={2} className="input h-auto" />
        {create.isError && <p className="text-[13px] text-error">{(create.error as Error).message}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={() => create.mutate()} disabled={!name || create.isPending} className="btn-primary flex-1">Salvar</button>
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
        </div>
      </div>
    </div>
  )
}
