import { useMemo, useState } from 'react'
import type { Period } from '@/types/database'
import { lastDays, todayLocal } from '@/utils/datetime'
import { Field, Input, Select } from './ui'

const PRESETS = [
  { value: '30', label: 'Últimos 30 dias' }, { value: '60', label: 'Últimos 60 dias' }, { value: '90', label: 'Últimos 90 dias' },
  { value: '180', label: 'Últimos 6 meses' }, { value: '365', label: 'Últimos 12 meses' }, { value: 'custom', label: 'Período personalizado' },
]

export function usePeriod(initial = '30') {
  const today = todayLocal()
  const [preset, setPreset] = useState(initial)
  const [custom, setCustom] = useState<Period>(lastDays(30, today))
  const period = useMemo<Period>(() => {
    if (preset !== 'custom') return lastDays(Number(preset), today)
    const to = custom.to > today ? today : custom.to
    return custom.from && to && custom.from <= to ? { from: custom.from, to } : lastDays(30, today)
  }, [preset, custom, today])
  return { period, preset, setPreset, custom, setCustom, today }
}

export function PeriodPicker({ state }: { state: ReturnType<typeof usePeriod> }) {
  return (
    <div className="no-print flex flex-wrap items-end gap-3">
      <Field label="Período de análise"><Select options={PRESETS} value={state.preset} onChange={(e) => state.setPreset(e.target.value)} /></Field>
      {state.preset === 'custom' && (
        <>
          <Field label="De"><Input type="date" max={state.custom.to} value={state.custom.from} onChange={(e) => state.setCustom({ ...state.custom, from: e.target.value })} /></Field>
          <Field label="Até"><Input type="date" min={state.custom.from} max={state.today} value={state.custom.to} onChange={(e) => state.setCustom({ ...state.custom, to: e.target.value })} /></Field>
        </>
      )}
    </div>
  )
}
