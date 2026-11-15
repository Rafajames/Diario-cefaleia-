import { Alert, PageTitle, Spinner } from '@/components/ui'
import { PeriodPicker, usePeriod } from '@/components/PeriodPicker'
import { friendlyError } from '@/utils/errors'
import { EvolutionView } from './EvolutionView'
import { useEvolution } from './useEvolution'

export function EvolutionPage() {
  const state = usePeriod('90')
  const ev = useEvolution(state.period)
  return (
    <div className="space-y-4">
      <PageTitle>Minha evolução</PageTitle>
      <PeriodPicker state={state} />
      <p className="text-sm text-muted">A evolução é mostrada em várias dimensões: é possível continuar tendo crises e, ainda assim, melhorar em intensidade, duração ou impacto no dia a dia.</p>
      {ev.isLoading ? <Spinner /> : ev.error ? <Alert tone="bad">{friendlyError(ev.error)}</Alert> : ev.result && <EvolutionView r={ev.result} />}
    </div>
  )
}
