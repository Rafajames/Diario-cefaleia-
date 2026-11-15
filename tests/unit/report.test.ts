import { describe, expect, it } from 'vitest'
import { buildReportContent, SELF_REPORT_NOTICE } from '@/modules/reports/content'
import { administrationsCsv, attacksCsv } from '@/modules/reports/csv'
import { compareIndicators, computeIndicators } from '@/modules/clinical-evolution/calc'
import { adm, attack, cycle, dataset } from './factories'

const period = { from: '2026-03-01', to: '2026-03-30' }, prev = { from: '2026-01-30', to: '2026-02-28' }
const opts = { today: '2026-04-30', now: () => 'fixo' }
const a1 = attack('2026-03-02T08:00', { ended_at: '2026-03-02T10:00', intensity_max: 7, locations: ['frontal'], notes: 'obs do paciente' })
const a2 = attack('2026-03-09T08:00', { intensity_max: 5 })
const ds = dataset({ attacks: [a1, a2], administrations: [adm('2026-03-02T08:30', { attack_id: a1.id, outcome: 'complete' })], cycles: [cycle('2026-03-02', '2026-03-05')] })
const current = computeIndicators(ds, period, opts)
const input = (menstruationAuthorized: boolean) => ({
  patientName: 'Paciente Teste', patient: null, period, previousPeriod: prev, current, comparison: compareIndicators(current, computeIndicators(ds, prev, opts)),
  dataset: ds, preventives: [], notes: [], menstruationAuthorized, generatedAt: '15/11/2026 10:00', generatedBy: 'Dra. Teste',
})

describe('relatório individual', () => {
  const c = buildReportContent(input(true))
  it('traz identificação institucional, data de geração e período de referência', () => {
    expect(c.institution).toContain('CENDOR')
    expect(c.generatedLine).toContain('15/11/2026')
    expect(c.subtitle).toContain('01/03/2026 a 30/03/2026')
  })
  it('avisa que os registros são autorrelatados e aponta dados incompletos', () => {
    expect(c.disclaimers).toContain(SELF_REPORT_NOTICE)
    expect(c.disclaimers.join(' ')).toMatch(/sem informação \(não contados como dias sem dor\)/)
    expect(c.disclaimers.join(' ')).toMatch(/1 crise\(s\) sem horário de término/)
  })
  it('contém as 17 seções previstas, na ordem', () => {
    expect(c.sections.map((s) => Number(s.title.split('.')[0]))).toEqual(Array.from({ length: 17 }, (_, i) => i + 1))
  })
  it('não contém diagnóstico automático', () => {
    expect(JSON.stringify(c)).not.toMatch(/diagnóstico de enxaqueca menstrual confirmad|uso excessivo de medicamentos/i)
    expect(c.disclaimers.join(' ')).toContain('não contém diagnósticos automáticos')
  })
  it('ciclo menstrual só entra com autorização específica', () => {
    const withAuth = c.sections[11], without = buildReportContent(input(false)).sections[11]
    expect(withAuth.tables?.length).toBe(1)
    expect(without.tables).toBeUndefined()
    expect(without.paragraphs?.[0]).toContain('sem autorização específica')
  })
})

describe('exportação CSV', () => {
  it('exporta crises e administrações do período com intervalos calculados', () => {
    const lines = attacksCsv(ds, period).trim().split('\r\n')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('120') // duração em minutos
    const meds = administrationsCsv(ds, period).trim().split('\r\n')
    expect(meds).toHaveLength(2)
    expect(meds[0]).toContain('min_ate_medicacao')
    expect(meds[1]).toContain(';30;')
  })
  it('respeita o período', () => {
    expect(attacksCsv(ds, { from: '2026-04-01', to: '2026-04-30' }).trim().split('\r\n')).toHaveLength(1)
  })
})
