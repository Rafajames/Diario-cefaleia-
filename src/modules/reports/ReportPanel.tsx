import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Card, Spinner } from '@/components/ui'
import { PeriodPicker, usePeriod } from '@/components/PeriodPicker'
import { downloadText } from '@/utils/csv'
import { fmtDate } from '@/utils/datetime'
import { friendlyError } from '@/utils/errors'
import { useProfile } from '@/modules/authentication/AuthProvider'
import { useEvolution } from '@/modules/clinical-evolution/useEvolution'
import { DataQuality } from '@/modules/clinical-evolution/EvolutionView'
import { fetchPreventives } from '@/modules/medications/service'
import { fetchPatient } from '@/modules/patients/service'
import { usePatientScope } from '@/modules/patients/scope'
import { fetchNotes, logReportEvent } from '@/modules/professional-dashboard/service'
import { buildReportContent } from './content'
import { administrationsCsv, attacksCsv, dailyLogsCsv } from './csv'

/** Geração do relatório individual em PDF e exportações CSV. Toda exportação é registrada no servidor. */
export function ReportPanel() {
  const scope = usePatientScope()
  const me = useProfile()
  const state = usePeriod('90')
  const ev = useEvolution(state.period)
  const patient = useQuery({ queryKey: ['patient', scope.patientId], queryFn: () => fetchPatient(scope.patientId) })
  const preventives = useQuery({ queryKey: ['preventives', scope.patientId], queryFn: () => fetchPreventives(scope.patientId) })
  const notes = useQuery({ queryKey: ['notes', scope.patientId], queryFn: () => fetchNotes(scope.patientId) })
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const tag = `${state.period.from}_a_${state.period.to}`

  const run = async (kind: string, fn: () => Promise<void>) => {
    setBusy(kind); setError('')
    try { await fn() } catch (e) { setError(friendlyError(e)) } finally { setBusy('') }
  }
  const pdf = () => run('pdf', async () => {
    if (!ev.result) return
    const content = buildReportContent({
      patientName: scope.patientName, patient: patient.data ?? null, period: state.period, previousPeriod: ev.result.previousPeriod,
      current: ev.result.current, comparison: ev.result.comparison, dataset: ev.result.dataset, preventives: preventives.data ?? [], notes: notes.data ?? [],
      menstruationAuthorized: scope.menstruationVisible, generatedAt: new Date().toLocaleString('pt-BR'), generatedBy: me.full_name || me.email,
    })
    const { renderReportPdf } = await import('./pdf')
    const blob = await renderReportPdf(content)
    await logReportEvent(scope.patientId, 'export_pdf', tag)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `diario-cefaleia_relatorio_${tag}.pdf`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  })
  const csv = (name: string, build: () => string) => run(name, async () => {
    if (!ev.result) return
    await logReportEvent(scope.patientId, 'export_csv', `${name} ${tag}`)
    downloadText(`diario-cefaleia_${name}_${tag}.csv`, build())
  })

  return (
    <div className="space-y-4">
      <PeriodPicker state={state} />
      {ev.isLoading ? <Spinner /> : ev.error ? <Alert tone="bad">{friendlyError(ev.error)}</Alert> : ev.result && (
        <>
          <Card title={`Relatório individual — ${fmtDate(state.period.from)} a ${fmtDate(state.period.to)}`}>
            <p className="mb-3 text-sm text-muted">O PDF reúne identificação, dias com cefaleia, crises, intensidade, localização, duração, sintomas, medicamentos, resposta, recorrências,
              {scope.menstruationVisible ? ' ciclo menstrual,' : ''} fatores associados, hábitos, evolução comparativa e observações. Inclui aviso de que os registros são autorrelatados e a indicação de dados incompletos.</p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={!!busy} onClick={pdf}>{busy === 'pdf' ? 'Gerando…' : 'Gerar relatório em PDF'}</Button>
              <Button variant="secondary" disabled={!!busy} onClick={() => csv('crises', () => attacksCsv(ev.result!.dataset, state.period))}>CSV — crises</Button>
              <Button variant="secondary" disabled={!!busy} onClick={() => csv('medicamentos', () => administrationsCsv(ev.result!.dataset, state.period))}>CSV — medicamentos</Button>
              <Button variant="secondary" disabled={!!busy} onClick={() => csv('registro-diario', () => dailyLogsCsv(ev.result!.dataset, state.period))}>CSV — registro diário</Button>
            </div>
            {error && <div className="mt-3"><Alert tone="bad">{error}</Alert></div>}
            <p className="mt-3 text-xs text-muted">Os arquivos contêm dados pessoais sensíveis. Guarde-os e compartilhe-os com cuidado. Cada exportação fica registrada no histórico de acessos.</p>
          </Card>
          <DataQuality ind={ev.result.current} />
        </>
      )}
    </div>
  )
}
