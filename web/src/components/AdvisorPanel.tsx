import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { listAdvisorReports, requestAdvisor, type AdvisorEntry, type AdvisorReport } from '../api/client'
import { getAiSettings, DEFAULT_MODELS, PROVIDER_LABELS } from '../store'

/** O Conselheiro do hub de desenvolvimento: análise completa da carreira OU pergunta dirigida,
 *  sempre por gatilho explícito (cada ação = 1 chamada BYOK, que custa ao usuário). Mostra o
 *  parecer mais recente no topo e o histórico abaixo — vai se atualizando conforme o técnico
 *  interage. A chave de IA vem do localStorage; o servidor nunca a persiste. */
export default function AdvisorPanel({ careerId }: { careerId: number }) {
  const qc = useQueryClient()
  const [question, setQuestion] = useState('')

  const ai = getAiSettings()
  const aiKey = ai.keys[ai.activeProvider]
  const hasKey = Boolean(aiKey)

  const { data } = useQuery({
    queryKey: ['advisor', careerId],
    queryFn: () => listAdvisorReports(careerId),
  })
  const reports = data?.reports ?? []
  const latest = reports[0]
  const history = reports.slice(1)

  const ask = useMutation({
    mutationFn: (q?: string) =>
      requestAdvisor(careerId, {
        provider: ai.activeProvider,
        apiKey: aiKey!,
        model: ai.models[ai.activeProvider] || DEFAULT_MODELS[ai.activeProvider],
        question: q,
      }),
    onSuccess: () => { setQuestion(''); qc.invalidateQueries({ queryKey: ['advisor', careerId] }) },
  })

  return (
    <div className="card overflow-hidden" style={{ borderLeft: '4px solid var(--color-primary)' }}>
      <div className="space-y-3 p-5">
        {!hasKey ? (
          <p className="text-sm text-steel">
            Ative uma chave de IA em <Link to="/config" className="font-medium text-link underline">Configurações</Link>{' '}
            para o conselheiro analisar sua carreira. A chave fica só neste aparelho.
          </p>
        ) : (
          <>
            {latest ? (
              <ReportView entry={latest} />
            ) : (
              <p className="text-sm text-steel">
                Peça um parecer da carreira e receba orientações priorizadas com base no elenco,
                nos objetivos e na evolução registrada.
              </p>
            )}

            {ask.isError && <p className="text-sm text-error">{(ask.error as Error).message}</p>}

            <button
              onClick={() => ask.mutate(undefined)}
              disabled={ask.isPending}
              className="btn-primary w-full"
            >
              {ask.isPending && ask.variables === undefined ? 'Analisando…' : latest ? 'Analisar de novo' : 'Analisar carreira'}
            </button>

            <form
              onSubmit={(e) => { e.preventDefault(); if (question.trim()) ask.mutate(question.trim()) }}
              className="flex gap-2"
            >
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Pergunte ao conselheiro…"
                maxLength={500}
                className="input flex-1"
              />
              <button type="submit" disabled={!question.trim() || ask.isPending} className="btn-secondary shrink-0">
                {ask.isPending && ask.variables !== undefined ? 'Perguntando…' : 'Perguntar'}
              </button>
            </form>

            <p className="text-[11px] text-faint">
              Cada análise ou pergunta é uma chamada ao provedor {PROVIDER_LABELS[ai.activeProvider]} (você paga por uso).
            </p>

            {history.length > 0 && (
              <details className="border-t border-hairline-soft pt-2">
                <summary className="cursor-pointer text-[13px] font-medium text-steel">Histórico ({history.length})</summary>
                <div className="mt-2 space-y-4">
                  {history.map((h) => <ReportView key={h.id} entry={h} compact />)}
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const PRIO_TAG: Record<AdvisorReport['orientacoes'][number]['prioridade'], string> = {
  alta: 'tag-orange', media: 'tag-purple', baixa: 'tag bg-tint-gray text-steel',
}
const PRIO_LABEL = { alta: 'Alta', media: 'Média', baixa: 'Baixa' } as const

function ReportView({ entry, compact }: { entry: AdvisorEntry; compact?: boolean }) {
  const when = new Date(entry.createdAt.replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  return (
    <div className={compact ? 'rounded-xl bg-surface-soft p-3' : ''}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-steel">
          {entry.kind === 'consulta' ? 'Consulta' : 'Parecer'} · {when}
        </span>
      </div>
      {entry.question && <p className="mb-2 text-[13px] italic text-steel">“{entry.question}”</p>}
      <p className="text-sm font-medium text-ink">{entry.report.resumo}</p>
      <ul className="mt-3 space-y-2">
        {entry.report.orientacoes.map((o, i) => (
          <li key={i} className="rounded-xl bg-surface-soft p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-bold text-ink">{o.titulo}</span>
              <span className={`${PRIO_TAG[o.prioridade]} shrink-0`}>{PRIO_LABEL[o.prioridade]}</span>
            </div>
            <p className="mt-1 text-[13px] text-slate-ink">{o.detalhe}</p>
            {o.jogadores && o.jogadores.length > 0 && (
              <p className="mt-1 text-[12px] text-steel">{o.jogadores.join(' · ')}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
