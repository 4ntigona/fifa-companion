import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { fmtEur, versionLabel } from '../api/client'
import { getCareerPlayer, addSnapshot, updateCareerPlayer } from '../api/user-data'
import Modal from '../components/Modal'
import CurrencyNote from '../components/CurrencyNote'
import { sanitizeStat } from '../hooks'

const STATUS_OPTIONS = [
  ['titular', 'Titular'], ['reserva', 'Reserva'], ['emprestado', 'Emprestado'], ['vendido', 'Vendido'],
] as const
// vendido sai do elenco ativo; emprestado continua visível no elenco com a tag de aviso
// (é como a importação já marca club_loaned_from — mantém consistência com o comportamento atual).
const OUT_OF_SQUAD_STATUS = new Set(['vendido'])

export default function PlayerPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [showSnapshot, setShowSnapshot] = useState(false)

  const { data, isError } = useQuery({
    queryKey: ['career-player', id],
    queryFn: async () => getCareerPlayer(Number(id)),
    retry: false,
  })
  if (isError) return (
    <div className="card mt-6 bg-surface-soft p-6 text-sm text-slate-ink">
      <p className="font-semibold text-ink">Jogador não encontrado neste dispositivo.</p>
      <p className="mt-1">Ele pode ter sido excluído ou os dados foram restaurados de outro backup.</p>
      <Link to="/" className="btn-primary mt-3 inline-block">Voltar ao início</Link>
    </div>
  )
  const updateStatus = useMutation({
    mutationFn: async (status: string) =>
      updateCareerPlayer(Number(id), { status, inSquad: !OUT_OF_SQUAD_STATUS.has(status) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['career-player', id] })
      qc.invalidateQueries({ queryKey: ['career-players', data?.player.career_id] })
    },
  })

  if (!data) return <p className="pt-6 text-slate-ink">Carregando…</p>
  const { player: p, career } = data
  const snaps = p.snapshots ?? []

  const baseOvr = p.sofifa?.overall ?? p.overall_original
  const basePot = p.sofifa?.potential ?? p.potential_original
  const chartData = [
    ...(baseOvr != null ? [{ label: 'Original', overall: baseOvr, potencial: basePot }] : []),
    ...snaps.map((s) => ({
      label: `${s.season}${s.date_ingame ? ` ${s.date_ingame.slice(5)}` : ''}`,
      overall: s.overall, potencial: s.potential,
    })),
  ]

  const attrs: Record<string, unknown> = p.sofifa?.attributes_json ? JSON.parse(p.sofifa.attributes_json) : {}

  return (
    <div className="space-y-6 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{p.name}</h1>
        <Link to={`/carreira/${p.career_id}`} className="text-sm font-medium text-steel hover:text-ink">← Carreira</Link>
      </div>

      <section className="card p-5 text-sm">
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-ink">{p.positions}{p.age ? ` · ${p.age} anos` : ''}</span>
            <span className={p.origin === 'sofifa' ? 'tag-purple' : 'tag-orange'}>
              {p.origin === 'sofifa' ? `database ${versionLabel(career.fifa_version)}` : p.origin}
            </span>
          </div>
          <div className="text-lg">
            <b className="text-success">{snaps.at(-1)?.overall ?? baseOvr ?? '—'}</b>
            <span className="text-stone"> / {snaps.at(-1)?.potential ?? basePot ?? '—'}</span>
          </div>
        </div>
        {p.sofifa && (
          <div className="mt-3 grid grid-cols-3 gap-1 text-[13px] text-charcoal sm:grid-cols-6">
            <div>PAC <b>{p.sofifa.pace ?? '—'}</b></div>
            <div>SHO <b>{p.sofifa.shooting ?? '—'}</b></div>
            <div>PAS <b>{p.sofifa.passing ?? '—'}</b></div>
            <div>DRI <b>{p.sofifa.dribbling ?? '—'}</b></div>
            <div>DEF <b>{p.sofifa.defending ?? '—'}</b></div>
            <div>FIS <b>{p.sofifa.physic ?? '—'}</b></div>
          </div>
        )}
        {p.sofifa && (
          <div className="mt-2 text-[13px] text-steel">
            {p.sofifa.club_name} · {p.sofifa.league_name} · Valor original {fmtEur(p.sofifa.value_eur)} · Salário {fmtEur(p.sofifa.wage_eur)}
            {p.sofifa.preferred_foot ? ` · Pé ${p.sofifa.preferred_foot === 'Left' ? 'esquerdo' : 'direito'}` : ''}
            {p.sofifa.weak_foot ? ` · Pé ruim ${p.sofifa.weak_foot}★` : ''}
            {p.sofifa.skill_moves ? ` · Skills ${p.sofifa.skill_moves}★` : ''}
          </div>
        )}
        {p.sofifa && <CurrencyNote className="mt-1 text-steel" />}
        {(baseOvr != null || basePot != null) && (
          <div className="mt-2 text-[13px] text-steel">
            Original no jogo: <b className="text-charcoal">{baseOvr ?? '—'}</b> OVR / <b className="text-charcoal">{basePot ?? '—'}</b> POT
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] text-steel">Status:</span>
          {STATUS_OPTIONS.map(([s, label]) => (
            <button key={s} onClick={() => updateStatus.mutate(s)}
              className={`${p.status === s ? 'pill-tab-active' : 'pill-tab'} px-3 py-1 text-[13px]`}>
              {label}
            </button>
          ))}
        </div>
        {p.strengths && <div className="mt-2 text-charcoal"><span className="text-steel">Pontos fortes:</span> {p.strengths}</div>}
        {p.notes && <div className="mt-1 text-charcoal"><span className="text-steel">Observações:</span> {p.notes}</div>}
        {p.regenOf && (
          <div className="mt-2"><span className="tag-orange">Regen de {p.regenOf.short_name} ({p.regenOf.overall} OVR original)</span></div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Desenvolvimento</h2>
          <button onClick={() => setShowSnapshot(true)} className="btn-primary px-3.5 py-2 text-[13px]">
            + Registrar evolução
          </button>
        </div>
        {chartData.length >= 2 ? (
          <div className="card h-56 p-3">
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <XAxis dataKey="label" stroke="var(--color-stone)" fontSize={11} tickLine={false} axisLine={{ stroke: 'var(--color-hairline)' }} />
                <YAxis domain={['dataMin - 3', 'dataMax + 3']} stroke="var(--color-stone)" fontSize={11} width={30} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: 'var(--color-canvas)', border: '1px solid var(--color-hairline)', borderRadius: 0, fontSize: 12, color: 'var(--color-ink)' }} />
                <Legend />
                <Line type="monotone" dataKey="overall" name="Overall" stroke="var(--color-primary)" strokeWidth={2} dot={{ fill: 'var(--color-primary)' }} />
                <Line type="monotone" dataKey="potencial" name="Potencial" stroke="var(--color-steel)" strokeWidth={2} strokeDasharray="4 3" dot={{ fill: 'var(--color-steel)' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="card bg-surface-soft p-4 text-sm text-slate-ink">
            Registre a evolução ao longo das temporadas para ver o gráfico (mínimo 2 pontos).
          </p>
        )}
        <ul className="mt-2 space-y-1 text-sm">
          {[...snaps].reverse().map((s) => (
            <li key={s.id} className="card flex items-center justify-between p-2.5">
              <span className="text-charcoal">
                📅 {s.season}{s.date_ingame ? ` · ${s.date_ingame}` : ''}
                {s.position ? ` · ${s.position}` : ''}
                {s.form_notes ? <span className="ml-1 text-[13px] text-stone">({s.form_notes})</span> : ''}
              </span>
              <span><b className="text-success">{s.overall ?? '—'}</b><span className="text-stone"> / {s.potential ?? '—'}</span></span>
            </li>
          ))}
        </ul>
      </section>

      {p.origin === 'sofifa' && Object.keys(attrs).length > 0 && (
        <details className="card p-5 text-sm">
          <summary className="cursor-pointer font-semibold text-ink">Todos os atributos originais ({versionLabel(career.fifa_version)})</summary>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] text-charcoal sm:grid-cols-3">
            {Object.entries(attrs)
              .filter(([, v]) => v !== '' && v != null)
              .map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-hairline-soft py-0.5">
                  <span className="text-steel">{k.replace(/_/g, ' ')}</span>
                  <span>{String(v)}</span>
                </div>
              ))}
          </div>
        </details>
      )}

      {showSnapshot && (
        <SnapshotModal
          playerId={p.id}
          defaultSeason={career.current_season}
          defaultDate={career.current_date_ingame}
          lastOverall={snaps.at(-1)?.overall ?? baseOvr}
          lastPotential={snaps.at(-1)?.potential ?? basePot}
          onClose={() => setShowSnapshot(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['career-player', id] }); setShowSnapshot(false) }}
        />
      )}
    </div>
  )
}

function SnapshotModal(props: {
  playerId: number
  defaultSeason: string
  defaultDate: string | null
  lastOverall: number | null | undefined
  lastPotential: number | null | undefined
  onClose: () => void
  onSaved: () => void
}) {
  const [season, setSeason] = useState(props.defaultSeason)
  const [date, setDate] = useState(props.defaultDate ?? '')
  const [overall, setOverall] = useState(props.lastOverall != null ? String(props.lastOverall) : '')
  const [potential, setPotential] = useState(props.lastPotential != null ? String(props.lastPotential) : '')
  const [position, setPosition] = useState('')
  const [notes, setNotes] = useState('')

  const create = useMutation({
    mutationFn: async () =>
      addSnapshot(props.playerId, {
        season, dateIngame: date || undefined,
        overall: overall ? Number(overall) : undefined,
        potential: potential ? Number(potential) : undefined,
        position: position || undefined, formNotes: notes || undefined,
      }),
    onSuccess: props.onSaved,
  })

  return (
    <Modal onClose={props.onClose}>
      <h3 className="text-lg font-semibold text-ink">Registrar evolução</h3>
      <p className="text-[13px] text-steel">Sempre vinculada à temporada/data do jogo — é assim que o desenvolvimento é acompanhado.</p>
      <div className="flex gap-2">
        <input autoFocus value={season} onChange={(e) => setSeason(e.target.value)} placeholder="Temporada *" className="input w-1/2" />
        <input value={date} onChange={(e) => setDate(e.target.value)} type="date" className="input w-1/2" />
      </div>
      <div className="flex gap-2">
        <input value={overall} onChange={(e) => setOverall(sanitizeStat(e.target.value))} placeholder="Overall atual" inputMode="numeric" className="input w-1/2" />
        <input value={potential} onChange={(e) => setPotential(sanitizeStat(e.target.value))} placeholder="Potencial atual" inputMode="numeric" className="input w-1/2" />
      </div>
      <div className="flex gap-2">
        <input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Posição (se mudou)" className="input w-1/2" />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Forma/observações" className="input w-1/2" />
      </div>
      {create.isError && <p className="text-[13px] text-error">{(create.error as Error).message}</p>}
      <div className="flex gap-2 pt-1">
        <button onClick={() => create.mutate()} disabled={!season || create.isPending} className="btn-primary flex-1">Salvar</button>
        <button onClick={props.onClose} className="btn-secondary">Cancelar</button>
      </div>
    </Modal>
  )
}
