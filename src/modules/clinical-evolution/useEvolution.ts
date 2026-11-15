import { useMemo } from 'react'
import { useDataset } from '@/services/dataset'
import { useSettings } from '@/services/settings'
import type { Period } from '@/types/database'
import { previousPeriod, todayLocal } from '@/utils/datetime'
import { usePatientScope } from '@/modules/patients/scope'
import { compareIndicators, computeIndicators, monthlySeries, overuseSignals } from './calc'

/** Carrega os dados do período atual + anterior e calcula indicadores, comparação e série mensal. */
export function useEvolution(period: Period) {
  const { patientId, menstruationVisible } = usePatientScope()
  const settings = useSettings()
  const today = todayLocal()
  const prev = previousPeriod(period)
  const q = useDataset(patientId, prev.from, period.to, { menstruation: menstruationVisible })
  const result = useMemo(() => {
    if (!q.data) return null
    const opts = { today, settings }
    const current = computeIndicators(q.data, period, opts)
    const previous = computeIndicators(q.data, prev, opts)
    return {
      dataset: q.data,
      current,
      previous,
      previousPeriod: prev,
      rules: settings.evolution_rules,
      comparison: compareIndicators(current, previous, settings.evolution_rules),
      series: monthlySeries(q.data, period, opts),
      overuse: overuseSignals(q.data.administrations, settings.overuse_flags, today),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, period.from, period.to, settings, today])
  return { ...q, result, settings }
}
export type EvolutionResult = NonNullable<ReturnType<typeof useEvolution>['result']>
