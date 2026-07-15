import { fmtEur, type SofifaPlayer } from '../api/client'
import Modal from './Modal'

/** Uma linha de comparação numérica: valor A | rótulo | valor B, com o maior destacado. */
function Row({ label, a, b, higherIsBetter = true }: {
  label: string
  a: number | string | null | undefined
  b: number | string | null | undefined
  higherIsBetter?: boolean
}) {
  const na = typeof a === 'number' ? a : null
  const nb = typeof b === 'number' ? b : null
  const aWins = na != null && nb != null && (higherIsBetter ? na > nb : na < nb)
  const bWins = na != null && nb != null && (higherIsBetter ? nb > na : nb < na)
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-hairline-soft py-1 text-sm">
      <span className={`text-right ${aWins ? 'font-semibold text-success' : 'text-charcoal'}`}>{a ?? '—'}</span>
      <span className="text-[11px] uppercase tracking-wide text-steel">{label}</span>
      <span className={`${bWins ? 'font-semibold text-success' : 'text-charcoal'}`}>{b ?? '—'}</span>
    </div>
  )
}

/** União das chaves de attributes_json dos dois jogadores, para a tabela de "todos os atributos". */
function parseAttrs(json: string | undefined): Record<string, unknown> {
  if (!json) return {}
  try {
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return {}
  }
}

export default function CompareProspects({ a, b, onClose }: { a: SofifaPlayer; b: SofifaPlayer; onClose: () => void }) {
  const attrsA = parseAttrs(a.attributes_json)
  const attrsB = parseAttrs(b.attributes_json)
  const allKeys = [...new Set([...Object.keys(attrsA), ...Object.keys(attrsB)])]
    .filter((k) => (attrsA[k] !== '' && attrsA[k] != null) || (attrsB[k] !== '' && attrsB[k] != null))
    .sort()

  return (
    <Modal onClose={onClose} ariaLabel={`Comparação: ${a.short_name} × ${b.short_name}`}>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="font-semibold text-ink">{a.short_name}</p>
          <p className="text-[13px] text-steel">{a.positions} · {a.age} anos</p>
          <p className="text-[13px] text-steel">{a.club_name ?? '—'} · {fmtEur(a.value_eur)}</p>
        </div>
        <div className="text-right">
          <p className="font-semibold text-ink">{b.short_name}</p>
          <p className="text-[13px] text-steel">{b.positions} · {b.age} anos</p>
          <p className="text-[13px] text-steel">{b.club_name ?? '—'} · {fmtEur(b.value_eur)}</p>
        </div>
      </div>

      <div className="mt-3">
        <Row label="Overall" a={a.overall} b={b.overall} />
        <Row label="Potencial" a={a.potential} b={b.potential} />
        <Row label="PAC" a={a.pace} b={b.pace} />
        <Row label="SHO" a={a.shooting} b={b.shooting} />
        <Row label="PAS" a={a.passing} b={b.passing} />
        <Row label="DRI" a={a.dribbling} b={b.dribbling} />
        <Row label="DEF" a={a.defending} b={b.defending} />
        <Row label="FIS" a={a.physic} b={b.physic} />
        <Row label="Pé ruim" a={a.weak_foot} b={b.weak_foot} />
        <Row label="Skills" a={a.skill_moves} b={b.skill_moves} />
        <Row label="Valor" a={fmtEur(a.value_eur)} b={fmtEur(b.value_eur)} />
        <Row label="Salário" a={fmtEur(a.wage_eur)} b={fmtEur(b.wage_eur)} />
      </div>

      {allKeys.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[13px] font-semibold text-ink">Todos os atributos</summary>
          <div className="mt-2 max-h-64 overflow-y-auto">
            {allKeys.map((k) => (
              <Row key={k} label={k.replace(/_/g, ' ')} a={attrsA[k] as number | string | null} b={attrsB[k] as number | string | null} />
            ))}
          </div>
        </details>
      )}

      <button onClick={onClose} className="btn-secondary mt-3 w-full">Fechar</button>
    </Modal>
  )
}
