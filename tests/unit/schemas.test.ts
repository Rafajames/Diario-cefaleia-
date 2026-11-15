import { describe, expect, it } from 'vitest'
import { draftFromAttack, draftToPayload, emptyDraft, makeAttackSchema } from '@/modules/headache-attacks/schemas'
import { makeAdministrationSchema } from '@/modules/medications/schemas'
import { makeDailyLogSchema } from '@/modules/daily-context/schemas'
import { makeCycleSchema } from '@/modules/patients/schemas'
import { parseSetting } from '@/modules/administration/settings-schema'
import { attack } from './factories'

const now = '2026-03-10T12:00'
const schema = makeAttackSchema(now)
const valid = (over = {}) => ({ ...draftToPayload(emptyDraft('2026-03-10T08:00')), still_ongoing: false, ...over })
const paths = (r: ReturnType<typeof schema.safeParse>) => r.error?.issues.map((i) => i.path[0]) ?? []

describe('registro de crise', () => {
  it('registro parcial: só o início é obrigatório', () => {
    expect(schema.safeParse(valid()).success).toBe(true)
  })
  it('registro completo', () => {
    const r = schema.safeParse(valid({
      ended_at: '2026-03-10T11:00', intensity_initial: 4, intensity_max: 8, intensity_final: 2, locations: ['frontal', 'temporal_left'], side: 'left',
      pain_qualities: ['pulsating'], aggravating: ['walking'], symptoms: [{ symptom: 'nausea', phase: 'before' }, { symptom: 'nausea', phase: 'during' }],
      triggers: [{ category: 'sleep', factor: 'slept_little', relation: 'suspected', confidence: 4 }], functional_impact: 2, notes: 'obs',
    }))
    expect(r.success).toBe(true)
  })
  it('intensidade fora de 0–10 ou fracionária é rejeitada', () => {
    expect(paths(schema.safeParse(valid({ intensity_max: 11 })))).toContain('intensity_max')
    expect(paths(schema.safeParse(valid({ intensity_max: -1 })))).toContain('intensity_max')
    expect(paths(schema.safeParse(valid({ intensity_max: 5.5 })))).toContain('intensity_max')
  })
  it('pico não pode ser menor que a intensidade inicial ou final', () => {
    expect(paths(schema.safeParse(valid({ intensity_initial: 7, intensity_max: 5 })))).toContain('intensity_max')
  })
  it('datas incoerentes são rejeitadas', () => {
    expect(paths(schema.safeParse(valid({ started_at: '2026-03-10T13:00' })))).toContain('started_at') // futuro
    expect(paths(schema.safeParse(valid({ ended_at: '2026-03-10T07:00' })))).toContain('ended_at')
    expect(paths(schema.safeParse(valid({ still_ongoing: true, ended_at: '2026-03-10T09:00' })))).toContain('ended_at')
  })
  it('localização e sintomas aceitam apenas opções conhecidas', () => {
    expect(schema.safeParse(valid({ locations: ['joelho'] })).success).toBe(false)
    expect(schema.safeParse(valid({ symptoms: [{ symptom: 'nausea', phase: 'sempre' }] })).success).toBe(false)
    expect(paths(schema.safeParse(valid({ aggravating: ['none_known', 'walking'] })))).toContain('aggravating')
  })
  it('edição: o rascunho preserva os dados e limpa textos "outro" quando a opção é desmarcada', () => {
    const a = attack('2026-03-10T08:00:00', { ended_at: '2026-03-10T09:30:00', intensity_max: 6, locations: ['frontal'], location_other: 'resto', notes: '  ' })
    const d = draftFromAttack(a)
    expect(d).toMatchObject({ started_at: '2026-03-10T08:00', ended_at: '2026-03-10T09:30', intensity_max: 6 })
    expect('id' in d || 'patient_id' in d).toBe(false)
    const p = draftToPayload(d)
    expect(p.location_other).toBeNull()
    expect(p.notes).toBeNull()
    expect(schema.safeParse({ ...p, still_ongoing: false }).success).toBe(true)
  })
})

describe('administração de medicamento', () => {
  const s = makeAdministrationSchema(now)
  const base = {
    attack_id: 'a', medication_id: null, medication_name: 'Medicamento A', active_ingredient: null, category: 'analgesic', dose: 500, unit: 'mg', route: 'oral',
    taken_at: '2026-03-10T08:30', time_is_approximate: false, sequence_number: 1, reason: null, notes: null, intensity_before: 7, relief_started_at: null, max_relief_at: null,
    outcome: null, pain_free: null, pain_free_minutes: null, recurred: null, recurrence_at: null, needed_rescue: null, adverse_effect: null, adverse_effect_note: null,
  }
  it('aceita registro sem resposta (dados incompletos)', () => expect(s.safeParse(base).success).toBe(true))
  it('exige nome do medicamento e rejeita dose negativa', () => {
    expect(s.safeParse({ ...base, medication_name: ' ' }).success).toBe(false)
    expect(s.safeParse({ ...base, dose: -1 }).success).toBe(false)
  })
  it('alívio e recorrência não podem ser anteriores à medicação', () => {
    expect(s.safeParse({ ...base, relief_started_at: '2026-03-10T08:00' }).success).toBe(false)
    expect(s.safeParse({ ...base, recurrence_at: '2026-03-10T08:00' }).success).toBe(false)
    expect(s.safeParse({ ...base, relief_started_at: '2026-03-10T09:00', max_relief_at: '2026-03-10T08:45' }).success).toBe(false)
    expect(s.safeParse({ ...base, relief_started_at: '2026-03-10T09:00', max_relief_at: '2026-03-10T10:00', recurred: true, recurrence_at: '2026-03-10T11:30' }).success).toBe(true)
  })
})

describe('registro diário e ciclo', () => {
  const empty = { pain_free_confirmed: true, sleep_quality: null, sleep_hours: null, hydration_liters: null, meals: null, fasting: null, caffeine_servings: null, physical_activity: null, stress: null, mood: null, notes: null }
  it('dia sem dor pode ser registrado sem nenhum campo complementar', () => {
    expect(makeDailyLogSchema('2026-03-10').safeParse({ ...empty, log_date: '2026-03-10' }).success).toBe(true)
  })
  it('não aceita dia futuro nem valores fora da faixa', () => {
    expect(makeDailyLogSchema('2026-03-10').safeParse({ ...empty, log_date: '2026-03-11' }).success).toBe(false)
    expect(makeDailyLogSchema('2026-03-10').safeParse({ ...empty, log_date: '2026-03-10', sleep_hours: 30 }).success).toBe(false)
    expect(makeDailyLogSchema('2026-03-10').safeParse({ ...empty, log_date: '2026-03-10', mood: 6 }).success).toBe(false)
  })
  it('ciclo incompleto é aceito; fim antes do início não', () => {
    const c = makeCycleSchema('2026-03-10')
    expect(c.safeParse({ start_date: '2026-03-05', end_date: null, flow: null, notes: null }).success).toBe(true)
    expect(c.safeParse({ start_date: '2026-03-05', end_date: '2026-03-04', flow: 'light', notes: null }).success).toBe(false)
    expect(c.safeParse({ start_date: '2026-03-11', end_date: null, flow: null, notes: null }).success).toBe(false)
  })
})

describe('parâmetros administrativos', () => {
  it('valida regras clínicas antes de salvar', () => {
    expect(parseSetting('severity_bands', '{"mild_max":3,"moderate_max":6}').ok).toBe(true)
    expect(parseSetting('severity_bands', '{"mild_max":7,"moderate_max":6}').ok).toBe(false)
    expect(parseSetting('severity_bands', '{mild_max:3}').ok).toBe(false)
    expect(parseSetting('menstrual_window', '{"days_before":2,"days_after":2,"min_cycles":3,"min_positive":4}').ok).toBe(false)
    expect(parseSetting('desconhecido', 'true').ok).toBe(false)
  })
  it('sinalização de uso frequente só pode ser ativada com responsável médico identificado', () => {
    const rules = '"rules":[{"classes":["triptan"],"days_per_30":10}]'
    expect(parseSetting('overuse_flags', `{"enabled":true,"reviewed_by":null,${rules}}`).ok).toBe(false)
    expect(parseSetting('overuse_flags', `{"enabled":true,"reviewed_by":"Dr. Responsável","${rules.slice(1)}}`).ok).toBe(true)
    expect(parseSetting('overuse_flags', `{"enabled":false,"reviewed_by":null,${rules}}`).ok).toBe(true)
  })
})
