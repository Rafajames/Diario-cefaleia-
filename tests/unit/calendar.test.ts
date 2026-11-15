import { describe, expect, it } from 'vitest'
import { attackDays, buildMonthGrid, shiftMonth, summarizeDay } from '@/modules/calendar/calc'
import { attack, cycle, dataset, log } from './factories'

const bands = { mild_max: 3, moderate_max: 6 }
const today = '2026-03-31'

describe('calendário', () => {
  it('monta a grade do mês e muda de mês atravessando o ano', () => {
    const grid = buildMonthGrid(2026, 3) // 1º de março de 2026 é domingo
    expect(grid[0][0]).toBe('2026-03-01')
    expect(grid.flat().filter(Boolean)).toHaveLength(31)
    expect(grid.every((w) => w.length === 7)).toBe(true)
    expect(buildMonthGrid(2026, 2).flat().filter(Boolean)).toHaveLength(28)
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 })
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 })
  })

  it('dia sem registro não é dia sem dor', () => {
    const d = summarizeDay('2026-03-10', dataset(), bands, today)
    expect(d.status).toBe('no_record')
    expect(d.status).not.toBe('pain_free')
  })

  it('dia sem dor precisa ser confirmado', () => {
    const ds = dataset({ dailyLogs: [log('2026-03-10', { pain_free_confirmed: true }), log('2026-03-11', { sleep_hours: 7 })] })
    expect(summarizeDay('2026-03-10', ds, bands, today).status).toBe('pain_free')
    expect(summarizeDay('2026-03-11', ds, bands, today).status).toBe('logged')
  })

  it('classifica o dia pela maior intensidade entre várias crises', () => {
    const ds = dataset({ attacks: [
      attack('2026-03-10T08:00', { ended_at: '2026-03-10T09:00', intensity_max: 2 }),
      attack('2026-03-10T18:00', { ended_at: '2026-03-10T20:00', intensity_max: 8 }),
    ] })
    const d = summarizeDay('2026-03-10', ds, bands, today)
    expect(d.attacks).toHaveLength(2)
    expect(d.status).toBe('severe')
    expect(d.maxIntensity).toBe(8)
    expect(new Set(d.attacks.map((a) => a.id)).size).toBe(2)
  })

  it('faixas de intensidade', () => {
    const one = (i: number) => summarizeDay('2026-03-10', dataset({ attacks: [attack('2026-03-10T08:00', { ended_at: '2026-03-10T09:00', intensity_max: i })] }), bands, today).status
    expect([one(1), one(3), one(4), one(6), one(7), one(10)]).toEqual(['mild', 'mild', 'moderate', 'moderate', 'severe', 'severe'])
  })

  it('crise que atravessa dias marca todos os dias cobertos', () => {
    const a = attack('2026-03-10T22:00', { ended_at: '2026-03-12T06:00', intensity_max: 5 })
    expect(attackDays(a, today)).toEqual(['2026-03-10', '2026-03-11', '2026-03-12'])
    const ds = dataset({ attacks: [a] })
    expect(summarizeDay('2026-03-11', ds, bands, today).status).toBe('moderate')
    expect(summarizeDay('2026-03-13', ds, bands, today).status).toBe('no_record')
  })

  it('sem término informado conta só o dia de início e fica marcado como incompleto', () => {
    const a = attack('2026-03-10T22:00', { intensity_max: 5 })
    expect(attackDays(a, today)).toEqual(['2026-03-10'])
    expect(summarizeDay('2026-03-10', dataset({ attacks: [a] }), bands, today).incomplete).toBe(true)
  })

  it('crise em andamento se estende até hoje', () => {
    const a = attack('2026-03-29T10:00', { still_ongoing: true, intensity_max: 4 })
    expect(attackDays(a, today)).toEqual(['2026-03-29', '2026-03-30', '2026-03-31'])
  })

  it('crise sem intensidade aparece como dor não classificada, e não some', () => {
    const d = summarizeDay('2026-03-10', dataset({ attacks: [attack('2026-03-10T08:00', { ended_at: '2026-03-10T09:00' })] }), bands, today)
    expect(d.status).toBe('pain_unrated')
    expect(d.incomplete).toBe(true)
  })

  it('"sem dor" e crise no mesmo dia: prevalece a crise e sinaliza conflito', () => {
    const ds = dataset({
      attacks: [attack('2026-03-10T08:00', { ended_at: '2026-03-10T09:00', intensity_max: 3 })],
      dailyLogs: [log('2026-03-10', { pain_free_confirmed: true })],
    })
    const d = summarizeDay('2026-03-10', ds, bands, today)
    expect(d.status).toBe('mild')
    expect(d.conflict).toBe(true)
  })

  it('crise excluída não aparece', () => {
    const ds = dataset({ attacks: [attack('2026-03-10T08:00', { deleted_at: '2026-03-11T00:00:00Z', intensity_max: 9 })] })
    expect(summarizeDay('2026-03-10', ds, bands, today).status).toBe('no_record')
  })

  it('indica menstruação, inclusive ciclo sem data de término', () => {
    const ds = dataset({ cycles: [cycle('2026-03-05', '2026-03-09'), cycle('2026-03-28')] })
    expect(summarizeDay('2026-03-07', ds, bands, today).menstruation).toBe(true)
    expect(summarizeDay('2026-03-10', ds, bands, today).menstruation).toBe(false)
    expect(summarizeDay('2026-03-28', ds, bands, today).menstruation).toBe(true)
    expect(summarizeDay('2026-03-29', ds, bands, today).menstruation).toBe(false)
  })
})
