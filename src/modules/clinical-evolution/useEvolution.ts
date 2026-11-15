import { useMemo } from 'react'
import type { ClinicalSettings } from '@/config/clinical-options'
import { useDataset } from '@/services/dataset'
import { useSettings } from '@/services/settings'
import type { Dataset, Period } from '@/types/database'
import { previousPeriod, todayLocal } from '@/utils/datetime'
import { usePatientScope } from '@/modules/patients/scope'
import { compareIndicators, computeIndicators, monthlySeries, overuseSignals } from './calc'

/** Cálculo puro (também usado pelo paciente de demonstração). */
export function buildEvolution(dataset: Dataset, period: Period, settings: ClinicalSettings, today: string) {
  const prev = previousPeriod(period)
  const opts = { today, settings }
  const current = computeIndicators(dataset, period, opts)
  const previous = computeIndicators(dataset, prev, opts)
  return {
    dataset,
    current,
    previous,
    previousPeriod: prev,
    rules: settings.evolution_rules,
    comparison: compareIndicators(current, previous, settings.evolution_rules),
    series: monthlySeries(dataset, period, opts),
    overuse: overuseSignals(dataset.administrations, settings.overuse_flags, today),
  }
}

/** Carrega os dados do período atual + anterior e calcula indicadores, comparação e série mensal. */
export function useEvolution(period: Period) {
  const { patientId, menstruationVisible } = usePatientScope()
  const settings = useSettings()
  const today = todayLocal()
  const prev = previousPeriod(period)
  const q = useDataset(patientId, prev.from, period.to, { menstruation: menstruationVisible })
  const result = useMemo(() => (q.data ? buildEvolution(q.data, period, settings, today) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q.data, period.from, period.to, settings, today])
  return { ...q, result, settings }
}
export type EvolutionResult = NonNullable<ReturnType<typeof useEvolution>['result']>
