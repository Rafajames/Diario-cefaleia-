import { describe, expect, it } from 'vitest'
import { administrationIntervals, summarizeResponses } from '@/modules/treatment-response/calc'
import { adm, assess, attack } from './factories'

describe('resposta terapêutica — intervalos', () => {
  const a = attack('2026-03-10T08:00', { intensity_max: 8 })

  it('calcula tempo até medicação, início do alívio, alívio máximo e redução', () => {
    const m = adm('2026-03-10T08:40', { attack_id: a.id, intensity_before: 8, relief_started_at: '2026-03-10T09:10', max_relief_at: '2026-03-10T10:40', recurrence_at: '2026-03-10T20:40' })
    const ev = [
      assess(a.id, '2026-03-10T09:10', 6, { administration_id: m.id, minutes_after_dose: 30 }),
      assess(a.id, '2026-03-10T10:40', 2, { administration_id: m.id, minutes_after_dose: 120 }),
      assess(a.id, '2026-03-10T07:00', 0), // avaliação não vinculada: ignorada
    ]
    const r = administrationIntervals(m, a, ev)
    expect(r.minutesToMedication).toBe(40)
    expect(r.minutesToReliefOnset).toBe(30)
    expect(r.minutesToMaxRelief).toBe(120)
    expect(r.minutesToRecurrence).toBe(720)
    expect(r.lowestIntensityAfter).toBe(2)
    expect(r.intensityReduction).toBe(6)
    expect(r.evaluations.map((e) => e.reduction)).toEqual([2, 6])
  })

  it('usa o horário da avaliação quando o intervalo não foi informado', () => {
    const m = adm('2026-03-10T08:40', { attack_id: a.id, intensity_before: 7 })
    const r = administrationIntervals(m, a, [assess(a.id, '2026-03-10T09:40', 5, { administration_id: m.id })])
    expect(r.evaluations[0].minutesAfter).toBe(60)
  })

  it('dados incompletos resultam em nulo, nunca em valor presumido', () => {
    const r = administrationIntervals(adm('2026-03-10T08:40'), null, [])
    expect(r).toMatchObject({ minutesToMedication: null, minutesToReliefOnset: null, minutesToMaxRelief: null, intensityReduction: null, minutesToRecurrence: null })
  })

  it('redução negativa indica piora', () => {
    const m = adm('2026-03-10T08:40', { attack_id: a.id, intensity_before: 5 })
    expect(administrationIntervals(m, a, [assess(a.id, '2026-03-10T09:40', 8, { administration_id: m.id })]).intensityReduction).toBe(-3)
  })

  it('medicação registrada antes do início informado não gera intervalo negativo', () => {
    expect(administrationIntervals(adm('2026-03-10T07:00', { attack_id: a.id }), a).minutesToMedication).toBeNull()
  })
})

describe('resposta terapêutica — resumo', () => {
  const a1 = attack('2026-03-01T08:00'), a2 = attack('2026-03-05T08:00'), a3 = attack('2026-03-09T08:00')
  const list = [
    adm('2026-03-01T08:30', { attack_id: a1.id, medication_name: 'A', outcome: 'complete', recurred: false, intensity_before: 8, dose: 500, unit: 'mg', sequence_number: 1 }),
    adm('2026-03-01T10:30', { attack_id: a1.id, medication_name: 'A', outcome: 'partial', recurred: true, needed_rescue: true, sequence_number: 2 }),
    adm('2026-03-05T09:00', { attack_id: a2.id, medication_name: 'A', outcome: 'unknown' }),
    adm('2026-03-09T08:10', { attack_id: a3.id, medication_name: 'B', category: 'triptan', outcome: 'none', adverse_effect: true }),
  ]

  it('várias administrações na mesma crise são registros independentes', () => {
    const [A] = summarizeResponses(list, [a1, a2, a3], [], 'medication')
    expect(A.key).toBe('A')
    expect(A.uses).toBe(3)
    expect(A.minutesToMedication).toMatchObject({ n: 3, median: 60 })
  })

  it('proporções consideram apenas desfechos informados', () => {
    const [A, B] = summarizeResponses(list, [a1, a2, a3], [], 'medication')
    expect(A.outcomesReported).toBe(2)
    expect(A.completePct).toBe(50)
    expect(A.partialPct).toBe(50)
    expect(A.recurrenceReported).toBe(2)
    expect(A.recurrencePct).toBe(50)
    expect(A.rescueCount).toBe(1)
    expect(A.doses).toEqual(['500 mg'])
    expect(B.nonePct).toBe(100)
    expect(B.adverseEffects).toBe(1)
  })

  it('agrupa por classe e geral', () => {
    expect(summarizeResponses(list, [a1, a2, a3], [], 'category').map((g) => [g.key, g.uses])).toEqual([['analgesic', 3], ['triptan', 1]])
    expect(summarizeResponses(list, [a1, a2, a3], [], 'all')[0].uses).toBe(4)
  })

  it('sem desfechos, as proporções são nulas (não zero)', () => {
    const [g] = summarizeResponses([adm('2026-03-01T08:30')], [], [], 'all')
    expect(g.completePct).toBeNull()
    expect(g.recurrencePct).toBeNull()
  })
})
