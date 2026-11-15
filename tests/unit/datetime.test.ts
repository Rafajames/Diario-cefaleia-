import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, eachDay, fmtDuration, lastDays, minutesBetween, monthPeriod, previousPeriod } from '@/utils/datetime'
import { describe as stats, median } from '@/utils/stats'
import { toCsv } from '@/utils/csv'

describe('datas de relógio de parede', () => {
  it('calcula minutos entre horários, inclusive atravessando a meia-noite', () => {
    expect(minutesBetween('2026-03-01T08:00', '2026-03-01T09:30:00')).toBe(90)
    expect(minutesBetween('2026-03-01T23:30', '2026-03-02T01:00')).toBe(90)
    expect(minutesBetween('2026-03-01 08:00:00', '2026-03-01T08:45')).toBe(45)
  })
  it('não presume horário ausente', () => {
    expect(minutesBetween('2026-03-01T08:00', null)).toBeNull()
    expect(minutesBetween(undefined, '2026-03-01T08:00')).toBeNull()
  })
  it('soma dias atravessando mês, ano e ano bissexto', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30)
    expect(eachDay('2026-02-27', '2026-03-01')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01'])
  })
  it('monta períodos', () => {
    expect(lastDays(30, '2026-03-30')).toEqual({ from: '2026-03-01', to: '2026-03-30' })
    expect(previousPeriod({ from: '2026-03-01', to: '2026-03-30' })).toEqual({ from: '2026-01-30', to: '2026-02-28' })
    expect(monthPeriod(2026, 2)).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
  it('formata durações', () => {
    expect(fmtDuration(45)).toBe('45 min')
    expect(fmtDuration(150)).toBe('2 h 30 min')
    expect(fmtDuration(1500)).toBe('1 d 1 h')
    expect(fmtDuration(null)).toBe('—')
  })
})

describe('estatística', () => {
  it('ignora nulos e os conta como ausentes', () => {
    expect(stats([4, null, 8, undefined])).toEqual({ n: 2, missing: 2, mean: 6, median: 6, min: 4, max: 8 })
    expect(stats([]).mean).toBeNull()
    expect(median([1, 9, 5])).toBe(5)
  })
})

describe('csv', () => {
  it('escapa separadores, aspas e fórmulas', () => {
    const csv = toCsv([{ a: 'x;y', b: '=1+1', c: 'diz "oi"' }], [
      { header: 'A', value: (r) => r.a }, { header: 'B', value: (r) => r.b }, { header: 'C', value: (r) => r.c },
    ])
    expect(csv).toContain('"x;y";\'=1+1;"diz ""oi"""')
    expect(csv.charCodeAt(0)).toBe(0xfeff)
  })
})
