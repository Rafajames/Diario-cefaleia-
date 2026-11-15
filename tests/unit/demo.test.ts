import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@/config/clinical-options'
import { buildEvolution } from '@/modules/clinical-evolution/useEvolution'
import { buildDemoDataset } from '@/modules/professional-dashboard/demo'
import { NOTE_TEMPLATES } from '@/modules/professional-dashboard/service'
import { addDays } from '@/utils/datetime'

describe('paciente de demonstração', () => {
  const today = '2026-11-15'
  const ds = buildDemoDataset(today)
  it('gera dados fictícios, determinísticos e dentro do período', () => {
    expect(ds.attacks.length).toBeGreaterThan(10)
    expect(ds.administrations.length).toBe(ds.attacks.length)
    expect(JSON.stringify(buildDemoDataset(today))).toBe(JSON.stringify(ds))
    expect(ds.attacks.every((a) => a.started_at.slice(0, 10) <= today)).toBe(true)
  })
  it('alimenta os mesmos cálculos do prontuário real', () => {
    const r = buildEvolution(ds, { from: addDays(today, -89), to: today }, DEFAULT_SETTINGS, today)
    expect(r.current.attackCount).toBeGreaterThan(0)
    expect(r.comparison.length).toBeGreaterThan(0)
  })
})

describe('modelos de observação', () => {
  it('têm apenas títulos em branco, sem conduta nem dose', () => {
    for (const t of NOTE_TEMPLATES) expect(t.text).not.toMatch(/\b(mg|dose|prescrev|recomend)/i)
  })
})
