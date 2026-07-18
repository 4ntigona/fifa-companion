import { useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fmtEur, versionLabel, type CareerPlayer } from '../api/client'
import { getCareer, listCareerPlayers, updateCareer, createCareerPlayer, deleteCareer, parseObjectives, type Objective } from '../api/user-data'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import CurrencyNote from '../components/CurrencyNote'
import { sanitizeStat, setActiveCareerId } from '../hooks'

/** O hub de desenvolvimento do time (ver design-proposals/blueprint.md §3): contexto do
 *  save, objetivos da diretoria, conselheiro (placeholder até a fase 0.3.007), radar de
 *  desenvolvimento (o que mudou desde a última captura) e o elenco em si. Prospecção e
 *  Captura saíram daqui — viraram tabs, sempre disponíveis para a carreira ativa. */
export default function CareerPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'elenco' | 'base'>('elenco')
  const [quickFilter, setQuickFilter] = useState('')
  const [editingSeason, setEditingSeason] = useState(false)
  const [showAddPlayer, setShowAddPlayer] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // esta carreira vira o contexto ativo do app (tab bar + header)
  useEffect(() => { if (id) setActiveCareerId(Number(id)) }, [id])

  const { data, isError } = useQuery({
    queryKey: ['career', id],
    queryFn: async () => getCareer(Number(id)),
    retry: false,
  })
  const { data: playersData } = useQuery({
    queryKey: ['career-players', id],
    queryFn: async () => listCareerPlayers(Number(id)),
  })

  const career = data?.career
  const players = playersData?.players ?? []
  const qf = quickFilter.trim().toLowerCase()
  const matches = (p: CareerPlayer) =>
    !qf || p.name.toLowerCase().includes(qf) || p.positions.toLowerCase().includes(qf)
  // vendido sai do elenco ativo (e já tem in_squad=0 via updateCareerPlayer, mas o filtro é
  // explícito por segurança); emprestado permanece visível no elenco, com a tag de aviso.
  const squad = players.filter((p) => p.in_squad && !['base', 'vendido'].includes(p.status) && matches(p))
  const youth = players.filter((p) => (p.origin === 'youth' || p.origin === 'regen' || p.status === 'base') && matches(p))

  const updateSeason = useMutation({
    mutationFn: async (payload: { currentSeason?: string; currentDateIngame?: string }) =>
      updateCareer(Number(id), payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['career', id] }); setEditingSeason(false) },
  })

  const toggleObjective = useMutation({
    mutationFn: async (objectives: Objective[]) => updateCareer(Number(id), { objectives }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['career', id] }),
  })

  const remove = useMutation({
    mutationFn: async () => deleteCareer(Number(id)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['careers'] }); nav('/mais') },
  })

  if (isError) return (
    <div className="card mt-6 bg-surface-soft p-6 text-sm text-slate-ink">
      <p className="font-semibold text-ink">Carreira não encontrada nesta conta.</p>
      <p className="mt-1">Ela pode ter sido excluída.</p>
      <Link to="/mais" className="btn-primary mt-3 inline-block">Voltar</Link>
    </div>
  )
  if (!career) return <p className="pt-6 text-slate-ink">Carregando…</p>

  const objectives = parseObjectives(career.objectives)

  return (
    <div className="space-y-6 pt-5">
      {/* 1. Contexto do save */}
      <section className="card relative overflow-hidden p-5">
        <span className="watermark-no">{career.fifa_version}</span>
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="display truncate text-[22px] not-italic text-ink">{career.name}</h1>
            <p className="mt-0.5 truncate text-sm text-steel">
              {career.team_type === 'created'
                ? `${career.created_team_name} (clube criado${career.replacedTeam ? `, substituiu ${career.replacedTeam.team_name}` : ''})`
                : career.team?.team_name}
            </p>
          </div>
          <span className="tag-purple shrink-0">{versionLabel(career.fifa_version)}</span>
        </div>

        <div className="relative mt-4 flex items-center gap-2 rounded-xl bg-surface-soft p-2.5 text-sm">
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
              <span className="text-ink">Temporada <b>{career.current_season}</b>{career.current_date_ingame ? ` · ${career.current_date_ingame}` : ''}</span>
              <button onClick={() => setEditingSeason(true)}
                className="ml-auto rounded-full border border-hairline-strong px-3 py-1 text-[13px] font-medium text-ink hover:border-ink">
                Atualizar
              </button>
            </>
          )}
        </div>

        {career.team_type === 'created' && (
          <div className="relative mt-4 grid grid-cols-2 gap-2 text-sm text-steel">
            <div>Verba: <b className="text-ink">{fmtEur(career.created_team_budget_eur)}</b></div>
            <div>Liga: <b className="text-ink">{career.created_team_league ?? '—'}</b></div>
            <div>Qualidade: <b className="text-ink">{career.squad_quality ?? '—'}</b></div>
          </div>
        )}
        {career.team && (
          <div className="relative mt-4 grid grid-cols-2 gap-2 text-sm text-steel sm:grid-cols-4">
            <div>Geral <b className="text-ink">{career.team.overall}</b></div>
            <div>ATA <b className="text-ink">{career.team.attack}</b></div>
            <div>MEI <b className="text-ink">{career.team.midfield}</b></div>
            <div>DEF <b className="text-ink">{career.team.defence}</b></div>
            <div className="col-span-2">Verba: <b className="text-ink">{fmtEur(career.team.transfer_budget_eur)}</b></div>
          </div>
        )}
        {(career.team_type === 'created' || career.team) && <CurrencyNote className="relative mt-2" />}
      </section>

      {/* 2. Objetivos da diretoria */}
      {objectives.length > 0 && (
        <section>
          <SectionTitle>Objetivos da diretoria</SectionTitle>
          <div className="card divide-y divide-hairline-soft">
            {objectives.map((o, i) => (
              <button
                key={i}
                onClick={() => toggleObjective.mutate(objectives.map((ob, j) => (j === i ? { ...ob, done: !ob.done } : ob)))}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border-2 ${
                  o.done ? 'border-success bg-success text-white' : 'border-hairline-strong text-transparent'
                }`}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M2 6.5l2.6 2.6L10 3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className={`text-sm ${o.done ? 'text-steel line-through decoration-faint' : 'text-ink'}`}>{o.text}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 3. Conselheiro — reserva do painel de IA (fase 0.3.007) */}
      <section>
        <SectionTitle>Conselheiro</SectionTitle>
        <div className="card relative overflow-hidden p-5" style={{ borderLeft: '4px solid var(--color-primary)' }}>
          <p className="text-sm text-steel">
            Em breve: peça um parecer da carreira e receba orientações priorizadas com base
            no elenco, nos objetivos e na evolução registrada — sempre por sua conta, nunca automático.
          </p>
          <button disabled className="btn-primary mt-3 cursor-not-allowed opacity-40">
            Analisar carreira (em breve)
          </button>
        </div>
      </section>

      {/* 4. Radar de desenvolvimento */}
      <DevelopmentRadar players={players} />

      {/* 5. Elenco */}
      <section>
        <SectionTitle>Elenco</SectionTitle>
        <div className="mb-3 flex gap-2">
          <button onClick={() => setTab('elenco')} className={tab === 'elenco' ? 'pill-tab-active' : 'pill-tab'}>
            Elenco ({squad.length})
          </button>
          <button onClick={() => setTab('base')} className={tab === 'base' ? 'pill-tab-active' : 'pill-tab'}>
            Base & Regens ({youth.length})
          </button>
        </div>
        <input
          value={quickFilter}
          onChange={(e) => setQuickFilter(e.target.value)}
          placeholder="Filtrar por nome ou posição…"
          className="input mb-3"
        />
        <PlayerList players={tab === 'elenco' ? squad : youth} />
        {tab === 'elenco' && squad.length === 0 && career.team_type === 'created' && (
          <p className="card bg-surface-soft p-4 text-sm text-slate-ink">
            Clube criado: os jogadores gerados pelo jogo entram por "+ Jogador" (manual) ou pela tab Captura (foto do elenco).
          </p>
        )}
        <div className="mt-3 flex items-center gap-4">
          <button onClick={() => setShowAddPlayer(true)} className="btn-secondary">+ Jogador</button>
          <button onClick={() => setConfirmingDelete(true)} disabled={remove.isPending}
            className="ml-auto text-[13px] font-medium text-error underline decoration-error/40 underline-offset-2 hover:decoration-error">
            {remove.isPending ? 'Excluindo…' : 'Excluir carreira'}
          </button>
        </div>
      </section>

      {showAddPlayer && <AddPlayerModal careerId={Number(id)} version={career.fifa_version} onClose={() => setShowAddPlayer(false)} />}
      {confirmingDelete && career && (
        <ConfirmDialog
          title="Excluir carreira"
          message={`Excluir "${career.name}"? Todos os jogadores, snapshots e a shortlist dela serão apagados. Essa ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          onConfirm={() => { setConfirmingDelete(false); remove.mutate() }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="display mb-2 px-1 text-[13px] tracking-[0.04em] text-ink">{children}</h2>
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
        className="input w-32 py-1.5 text-sm" />
      <input value={d} onChange={(e) => setD(e.target.value)} type="date"
        className="input w-auto py-1.5 text-sm" />
      <button onClick={() => props.onSave(s, d)} disabled={props.saving} className="btn-primary py-1.5 text-[13px]">Salvar</button>
      <button onClick={props.onCancel} className="btn-ghost py-1.5 text-[13px]">Cancelar</button>
    </div>
  )
}

/** O que mudou desde a última captura: jogadores com pelo menos um snapshot registrado,
 *  ordenados pelo crescimento (overall atual − overall original). Sem dado inventado: só
 *  entra na conta quem tem uma base real (sofifa ou overall original informado). */
function DevelopmentRadar({ players }: { players: CareerPlayer[] }) {
  const tracked = players
    .map((p) => {
      const baseline = p.sofifa?.overall ?? p.overall_original
      if (baseline == null || !p.latestSnapshot) return null
      const current = p.latestSnapshot.overall ?? baseline
      const potential = p.sofifa?.potential ?? p.potential_original
      return { player: p, baseline, current, potential, delta: current - baseline }
    })
    .filter((e): e is NonNullable<typeof e> => e != null)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 6)

  return (
    <section>
      <SectionTitle>Radar de desenvolvimento</SectionTitle>
      {tracked.length === 0 ? (
        <p className="card p-4 text-sm text-slate-ink">
          Registre a evolução do elenco na tab Captura para ver aqui quem está crescendo.
        </p>
      ) : (
        <div className="card divide-y divide-hairline-soft">
          {tracked.map(({ player: p, baseline, current, potential, delta }) => (
            <Link key={p.id} to={`/jogador/${p.id}`} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-ink">{p.name}</span>
                <span className="block truncate text-[12px] text-steel">
                  {p.positions}{p.age ? ` · ${p.age} anos` : ''}{p.origin !== 'sofifa' ? ` · ${p.origin}` : ''}
                </span>
              </span>
              {delta > 0 ? (
                <span className="growpill shrink-0">{baseline} → {current}</span>
              ) : (
                <span className="shrink-0 text-[13px] text-faint">
                  {current}{potential != null ? ` / ${potential}` : ''} · estagnado
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

function PlayerList({ players }: { players: CareerPlayer[] }) {
  if (players.length === 0) return null
  return (
    <div className="card divide-y divide-hairline-soft">
      {players.map((p) => {
        const ovr = p.latestSnapshot?.overall ?? p.sofifa?.overall ?? p.overall_original
        const pot = p.latestSnapshot?.potential ?? p.sofifa?.potential ?? p.potential_original
        const shirt = p.sofifa?.club_jersey_number ?? p.jersey_number ?? p.positions.split(',')[0]?.trim()
        return (
          <Link key={p.id} to={`/jogador/${p.id}`} className="flex items-center gap-3 px-3 py-3">
            <span className="shirtno">{shirt ?? '—'}</span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-sm font-bold text-ink">{p.name}</span>
                {p.origin !== 'sofifa' && <span className="tag-orange uppercase">{p.origin}</span>}
                {p.status === 'emprestado' && <span className="tag-purple">empréstimo</span>}
              </span>
              <span className="block truncate text-[12px] text-steel">{p.positions}{p.age ? ` · ${p.age} anos` : ''}</span>
            </span>
            <span className="shrink-0 text-sm">
              <span className="font-mono font-semibold text-ink">{ovr ?? '—'}</span>
              <span className="font-mono text-faint"> / {pot ?? '—'}</span>
            </span>
          </Link>
        )
      })}
    </div>
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
    mutationFn: async () =>
      createCareerPlayer({
        careerId, origin, name, positions: positions || '—',
        age: age ? Number(age) : undefined,
        overallOriginal: overall ? Number(overall) : undefined,
        potentialOriginal: potential ? Number(potential) : undefined,
        strengths: strengths || undefined, notes: notes || undefined,
        status: origin === 'generated' ? 'elenco' : 'base',
        inSquad: origin === 'generated',
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['career-players', String(careerId)] }); onClose() },
  })

  return (
    <Modal onClose={onClose}>
      <h3 className="text-lg font-semibold text-ink">Adicionar jogador</h3>
      <p className="text-[13px] text-steel">
        Para jogadores reais da database do {versionLabel(version)}, use a Scout. Aqui entram os que só existem no seu save.
      </p>
      <div className="flex gap-2 text-sm">
        {(['youth', 'regen', 'generated'] as const).map((o) => (
          <button key={o} onClick={() => setOrigin(o)}
            className={origin === o ? 'pill-tab-active' : 'pill-tab'}>
            {o === 'youth' ? 'Base' : o === 'regen' ? 'Regen' : 'Gerado (clube criado)'}
          </button>
        ))}
      </div>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome *" className="input" />
      <div className="flex gap-2">
        <input value={positions} onChange={(e) => setPositions(e.target.value)} placeholder="Posições (ST, CAM)" className="input w-1/2" />
        <input value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))} placeholder="Idade" inputMode="numeric" className="input w-1/2" />
      </div>
      <div className="flex gap-2">
        <input value={overall} onChange={(e) => setOverall(sanitizeStat(e.target.value))} placeholder="Overall original" inputMode="numeric" className="input w-1/2" />
        <input value={potential} onChange={(e) => setPotential(sanitizeStat(e.target.value))} placeholder="Potencial original" inputMode="numeric" className="input w-1/2" />
      </div>
      <input value={strengths} onChange={(e) => setStrengths(e.target.value)} placeholder="Pontos fortes" className="input" />
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações" rows={2} className="input h-auto" />
      {create.isError && <p className="text-[13px] text-error">{(create.error as Error).message}</p>}
      <div className="flex gap-2 pt-1">
        <button onClick={() => create.mutate()} disabled={!name || create.isPending} className="btn-primary flex-1">Salvar</button>
        <button onClick={onClose} className="btn-secondary">Cancelar</button>
      </div>
    </Modal>
  )
}
