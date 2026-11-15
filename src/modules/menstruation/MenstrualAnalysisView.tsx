import { Alert, Badge, Table } from '@/components/ui'
import { fmtDate } from '@/utils/datetime'
import { PHASE_LABEL, type CyclePhase, type MenstrualAnalysis } from './calc'

const PHASES: CyclePhase[] = ['pre', 'bleeding', 'post', 'other']

/** Associação temporal entre cefaleia e menstruação. Sempre apresentada como possível padrão, nunca como diagnóstico. */
export function MenstrualAnalysisView({ analysis }: { analysis: MenstrualAnalysis }) {
  const w = analysis.window
  return (
    <div className="space-y-3">
      <Alert tone={analysis.pattern === 'possible_pattern' ? 'warn' : 'info'}>
        <strong>{analysis.pattern === 'possible_pattern' ? 'Possível padrão temporal' : analysis.pattern === 'not_observed' ? 'Padrão não observado' : 'Dados insuficientes'}.</strong> {analysis.note}
      </Alert>
      <p className="text-xs text-muted">
        Janela analisada: de {w.days_before} dia(s) antes do início do sangramento até {w.days_after} dia(s) depois (equivalente aos dias −{w.days_before} a +{w.days_after + 1}, referência ICHD-3).
        Critério de repetição: {w.min_positive} de {w.min_cycles} ciclos. Esta análise descreve coincidência no tempo; não é diagnóstico de enxaqueca menstrual.
      </p>
      <Table head={['Período do ciclo', 'Dias com cefaleia', 'Intensidade máxima média', 'Alívio completo após medicação']}
        rows={PHASES.map((p) => {
          const r = analysis.completeReliefByPhase[p]
          return [PHASE_LABEL[p], analysis.headacheDaysByPhase[p], analysis.peakIntensityByPhase[p].mean ?? '—', r.reported ? `${r.complete} de ${r.reported}` : '—']
        })} />
      <Table empty="Nenhum ciclo registrado." head={['Início do sangramento', 'Último dia', 'Janela analisada', 'Cefaleia na janela']}
        rows={[...analysis.cycles].reverse().map((c) => [
          fmtDate(c.start_date),
          c.end_date ? fmtDate(c.end_date) : <Badge tone="info">Não informado</Badge>,
          `${fmtDate(c.windowFrom)} a ${fmtDate(c.windowTo)}`,
          c.hadHeadacheInWindow ? <Badge tone="warn">{c.headacheDaysInWindow.length} dia(s)</Badge> : <Badge>Não</Badge>,
        ])} />
    </div>
  )
}
