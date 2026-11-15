import { describe, expect, it } from 'vitest'
import { classify, compareIndicators, computeIndicators, monthlySeries, overuseSignals } from '@/modules/clinical-evolution/calc'
import { DEFAULT_SETTINGS } from '@/config/clinical-options'
import { addDays, eachDay } from '@/utils/datetime'
import { adm, assess, attack, dataset, log } from './factories'

const opts = { today: '2026-04-30', now: () => 'fixo' }
const march = { from: '2026-03-01', to: '2026-03-30' }
const feb = { from: '2026-01-30', to: '2026-02-28' }
const rules = DEFAULT_SETTINGS.evolution_rules
const full = (from: string, to: string, except: string[]) => eachDay(from, to).filter((d) => !except.includes(d)).map((d) => log(d, { pain_free_confirmed: true }))
const at = (day: string, hours: number, max: number, over = {}) =>
  attack(`${day}T08:00`, { ended_at: `${day}T${String(8 + hours).padStart(2, '0')}:00`, intensity_max: max, ...over })

describe('indicadores', () => {
  it('conta dias com cefaleia, dias sem dor confirmados e dias desconhecidos separadamente', () => {
    const ds = dataset({
      attacks: [at('2026-03-02', 2, 6), at('2026-03-02', 1, 4), attack('2026-03-10T22:00', { ended_at: '2026-03-12T02:00', intensity_max: 8 })],
      dailyLogs: [log('2026-03-03', { pain_free_confirmed: true }), log('2026-03-04', { pain_free_confirmed: true }), log('2026-03-02', { pain_free_confirmed: true }), log('2026-03-05')],
    })
    const i = computeIndicators(ds, march, opts)
    expect(i.attackCount).toBe(3)
    expect(i.headacheDays).toBe(4) // 02, 10, 11, 12
    expect(i.painFreeConfirmedDays).toBe(2) // o dia 02 tem crise: não conta como sem dor
    expect(i.unknownDays).toBe(24)
    expect(i.headacheDays + i.painFreeConfirmedDays + i.unknownDays).toBe(30)
    expect(i.coverage).toBe(0.2)
  })

  it('sem nenhum registro: tudo é desconhecido, nada é "sem dor"', () => {
    const i = computeIndicators(dataset(), march, opts)
    expect(i).toMatchObject({ attackCount: 0, headacheDays: 0, painFreeConfirmedDays: 0, unknownDays: 30, coverage: 0 })
    expect(i.intensityPeak.mean).toBeNull()
    expect(i.durationMinutes.mean).toBeNull()
    expect(i.response).toBeNull()
  })

  it('intensidade: média, mediana, extremos e distribuição do pico', () => {
    const i = computeIndicators(dataset({ attacks: [at('2026-03-02', 1, 4), at('2026-03-05', 1, 6), at('2026-03-08', 1, 8), at('2026-03-09', 1, 8, { intensity_initial: 3, intensity_final: 1 })] }), march, opts)
    expect(i.intensityPeak).toMatchObject({ n: 4, mean: 6.5, median: 7, min: 4, max: 8 })
    expect(i.peakDistribution[8]).toBe(2)
    expect(i.intensityInitial).toMatchObject({ n: 1, missing: 3, mean: 3 })
    expect(i.intensityFinal.mean).toBe(1)
  })

  it('duração: só crises com início e término; término nunca é presumido', () => {
    const i = computeIndicators(dataset({ attacks: [at('2026-03-02', 2, 5), at('2026-03-05', 4, 5), attack('2026-03-08T08:00', { intensity_max: 5 })] }), march, opts)
    expect(i.durationMinutes).toMatchObject({ n: 2, missing: 1, mean: 180 })
    expect(i.totalMinutes).toBe(360)
    expect(i.hoursWithPain).toBe(6)
    expect(i.attacksWithoutEnd).toBe(1)
  })

  it('crise iniciada antes do período conta nos dias que cobre, mas não no nº de crises', () => {
    const i = computeIndicators(dataset({ attacks: [attack('2026-02-28T20:00', { ended_at: '2026-03-02T08:00', intensity_max: 7 })] }), march, opts)
    expect(i.attackCount).toBe(0)
    expect(i.headacheDays).toBe(2)
  })

  it('localização, lado, sintomas e desencadeantes', () => {
    const i = computeIndicators(dataset({ attacks: [
      at('2026-03-02', 1, 8, { locations: ['frontal', 'temporal_left'], side: 'left', symptoms: [{ symptom: 'nausea', phase: 'during' }, { symptom: 'nausea', phase: 'after' }],
        triggers: [{ category: 'sleep', factor: 'slept_little', relation: 'suspected' }] }),
      at('2026-03-05', 1, 4, { locations: ['frontal'], side: 'left', symptoms: [{ symptom: 'photophobia', phase: 'during' }],
        triggers: [{ category: 'sleep', factor: 'slept_little', relation: 'occurred_before' }] }),
    ] }), march, opts)
    expect(i.locations[0]).toEqual({ key: 'frontal', count: 2, pct: 100, meanPeak: 6 })
    expect(i.locations[1]).toMatchObject({ key: 'temporal_left', count: 1, meanPeak: 8 })
    expect(i.sides[0]).toMatchObject({ key: 'left', count: 2 })
    expect(i.symptoms.find((s) => s.key === 'nausea')?.count).toBe(1) // por crise, não por menção
    expect(i.triggers[0]).toMatchObject({ factor: 'slept_little', attacks: 2, suspected: 1, occurredBefore: 1, pctOfAttacks: 100 })
  })

  it('medicação: administrações, dias de uso e intensidade após tratamento', () => {
    const a = at('2026-03-02', 4, 8)
    const m1 = adm('2026-03-02T08:30', { attack_id: a.id, intensity_before: 8, outcome: 'partial' })
    const m2 = adm('2026-03-02T10:30', { attack_id: a.id, medication_name: 'B', category: 'triptan', outcome: 'complete' })
    const ds = dataset({ attacks: [a, at('2026-03-06', 1, 5)], administrations: [m1, m2, adm('2026-03-09T09:00')],
      assessments: [assess(a.id, '2026-03-02T09:30', 5, { administration_id: m1.id }), assess(a.id, '2026-03-02T11:30', 1, { administration_id: m2.id })] })
    const i = computeIndicators(ds, march, opts)
    expect(i.administrations).toBe(3)
    expect(i.acuteMedicationDays).toBe(2)
    expect(i.byClass.map((c) => [c.key, c.count])).toEqual([['analgesic', 2], ['triptan', 1]])
    expect(i.intensityAfterTreatment).toMatchObject({ n: 1, mean: 1 })
    expect(i.response?.completePct).toBe(50)
  })

  it('impacto funcional', () => {
    const i = computeIndicators(dataset({ attacks: [at('2026-03-02', 1, 8, { functional_impact: 3 }), at('2026-03-05', 1, 4, { functional_impact: 1 }), at('2026-03-07', 1, 4)] }), march, opts)
    expect(i.functionalImpact).toMatchObject({ n: 2, missing: 1, mean: 2 })
    expect(i.disablingAttacks).toBe(1)
  })
})

describe('comparação entre períodos', () => {
  it('regra de classificação é transparente', () => {
    expect(classify(4, 8, 'lower', true, rules).trend).toBe('improved')
    expect(classify(8, 4, 'lower', true, rules).trend).toBe('worsened')
    expect(classify(8.5, 8, 'lower', true, rules).trend).toBe('stable')
    expect(classify(60, 20, 'higher', true, rules).trend).toBe('improved')
    expect(classify(60, 20, 'neutral', true, rules).trend).toBe('changed')
    expect(classify(4, 8, 'lower', false, rules).trend).toBe('insufficient')
    expect(classify(null, 8, 'lower', true, rules).trend).toBe('insufficient')
    expect(classify(0, 0, 'lower', true, rules).trend).toBe('stable')
    expect(classify(2, 0, 'lower', true, rules).trend).toBe('worsened')
  })

  it('mesmas crises em número, mas menos intensas, curtas e incapacitantes: melhora nessas dimensões', () => {
    const daysF = ['2026-02-02', '2026-02-09', '2026-02-16', '2026-02-23']
    const daysM = ['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23']
    const ds = dataset({
      attacks: [...daysF.map((d) => at(d, 8, 9, { functional_impact: 3 })), ...daysM.map((d) => at(d, 2, 4, { functional_impact: 1 }))],
      dailyLogs: [...full(feb.from, feb.to, daysF), ...full(march.from, march.to, daysM)],
    })
    const r = compareIndicators(computeIndicators(ds, march, opts), computeIndicators(ds, feb, opts), rules)
    const t = Object.fromEntries(r.map((d) => [d.id, d.trend]))
    expect(t.headache_days).toBe('stable')
    expect(t.attacks).toBe('stable')
    expect(t.intensity).toBe('improved')
    expect(t.duration).toBe('improved')
    expect(t.pain_hours).toBe('improved')
    expect(t.functional_impact).toBe('improved')
  })

  it('piora em uma dimensão não é escondida por melhora em outra', () => {
    const daysF = ['2026-02-02', '2026-02-09', '2026-02-16']
    const daysM = ['2026-03-02', '2026-03-05', '2026-03-09', '2026-03-12', '2026-03-16', '2026-03-19']
    const ds = dataset({
      attacks: [...daysF.map((d) => at(d, 2, 9)), ...daysM.map((d) => at(d, 2, 3))],
      dailyLogs: [...full(feb.from, feb.to, daysF), ...full(march.from, march.to, daysM)],
    })
    const t = Object.fromEntries(compareIndicators(computeIndicators(ds, march, opts), computeIndicators(ds, feb, opts), rules).map((d) => [d.id, d.trend]))
    expect(t.headache_days).toBe('worsened')
    expect(t.intensity).toBe('improved')
  })

  it('sem cobertura de registros, frequência fica como dados insuficientes (não como melhora)', () => {
    const ds = dataset({ attacks: [at('2026-02-02', 2, 6), at('2026-02-09', 2, 6), at('2026-02-16', 2, 6)] })
    const r = compareIndicators(computeIndicators(ds, march, opts), computeIndicators(ds, feb, opts), rules)
    const freq = r.find((d) => d.id === 'headache_days')!
    expect(freq.trend).toBe('insufficient')
    expect(freq.reason).toContain('não são contados como dias sem dor')
    expect(r.find((d) => d.id === 'intensity')!.trend).toBe('insufficient')
  })

  it('poucas crises: intensidade fica como dados insuficientes', () => {
    const ds = dataset({ attacks: [at('2026-02-02', 2, 9), at('2026-03-02', 2, 3)] })
    const r = compareIndicators(computeIndicators(ds, march, opts), computeIndicators(ds, feb, opts), rules)
    expect(r.find((d) => d.id === 'intensity')!.trend).toBe('insufficient')
  })

  it('tempo até a medicação só indica mudança, sem juízo de valor; localização idem', () => {
    const mk = (days: string[], delay: number, loc: string) => days.map((d) => {
      const a = at(d, 4, 6, { locations: [loc] })
      return { a, m: adm(`${d}T${String(8 + delay).padStart(2, '0')}:00`, { attack_id: a.id, outcome: 'complete' }) }
    })
    const f = mk(['2026-02-02', '2026-02-09', '2026-02-16'], 3, 'frontal'), m = mk(['2026-03-02', '2026-03-09', '2026-03-16'], 1, 'diffuse')
    const ds = dataset({ attacks: [...f, ...m].map((x) => x.a), administrations: [...f, ...m].map((x) => x.m) })
    const r = compareIndicators(computeIndicators(ds, march, opts), computeIndicators(ds, feb, opts), rules)
    expect(r.find((d) => d.id === 'time_to_medication')).toMatchObject({ trend: 'changed', current: 60, previous: 180 })
    expect(r.find((d) => d.id === 'location')!.trend).toBe('changed')
    expect(r.find((d) => d.id === 'complete_relief')!.trend).toBe('stable')
  })

  it('série mensal compara meses', () => {
    const ds = dataset({ attacks: [at('2026-02-02', 2, 8), at('2026-03-02', 2, 4), at('2026-03-09', 4, 6)] })
    const s = monthlySeries(ds, { from: '2026-02-01', to: '2026-03-31' }, opts)
    expect(s.map((m) => [m.month, m.attacks, m.meanPeak, m.meanDurationHours])).toEqual([['02/26', 1, 8, 2], ['03/26', 2, 5, 3]])
  })
})

describe('sinalização de uso frequente de medicação', () => {
  const days = (n: number, category: string) => Array.from({ length: n }, (_, i) => adm(`${addDays('2026-04-30', -i)}T09:00`, { category }))
  const on = { ...DEFAULT_SETTINGS.overuse_flags, enabled: true }

  it('fica desativada até revisão médica', () => {
    expect(overuseSignals(days(20, 'triptan'), DEFAULT_SETTINGS.overuse_flags, '2026-04-30')).toEqual([])
  })
  it('sinaliza ao atingir o limite configurado e conta dias, não doses', () => {
    expect(overuseSignals(days(10, 'triptan'), on, '2026-04-30')[0]).toMatchObject({ days: 10, threshold: 10 })
    expect(overuseSignals(days(9, 'triptan'), on, '2026-04-30')).toEqual([])
    expect(overuseSignals([...days(9, 'triptan'), adm('2026-04-30T20:00', { category: 'triptan' })], on, '2026-04-30')).toEqual([])
    expect(overuseSignals(days(14, 'analgesic'), on, '2026-04-30')).toEqual([])
    expect(overuseSignals(days(15, 'nsaid'), on, '2026-04-30')).toHaveLength(1)
  })
})
