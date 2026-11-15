import type { Administration, Assessment, Attack, DailyLog, Dataset, MenstrualCycle } from '@/types/database'

let seq = 0
const id = () => `id-${++seq}`
export const P = 'patient-1'

export const attack = (started_at: string, over: Partial<Attack> = {}): Attack => ({
  id: id(), patient_id: P, started_at, start_is_approximate: false, onset_type: null, started_during_sleep: null,
  ended_at: null, still_ongoing: false, improved_spontaneously: null, improved_after_medication: null, ended_by_sleep: null,
  intensity_initial: null, intensity_max: null, intensity_final: null, locations: [], side: null, location_other: null,
  pain_qualities: [], quality_other: null, aggravating: [], aggravating_other: null, symptoms: [], triggers: [],
  functional_impact: null, notes: null, recorded_at: '', updated_at: '', deleted_at: null, ...over,
})

export const adm = (taken_at: string, over: Partial<Administration> = {}): Administration => ({
  id: id(), patient_id: P, attack_id: null, medication_id: null, medication_name: 'Medicamento A', active_ingredient: null,
  category: 'analgesic', dose: null, unit: null, route: null, taken_at, time_is_approximate: false, sequence_number: null,
  reason: null, notes: null, intensity_before: null, relief_started_at: null, max_relief_at: null, outcome: null,
  pain_free: null, pain_free_minutes: null, recurred: null, recurrence_at: null, needed_rescue: null, adverse_effect: null,
  adverse_effect_note: null, ...over,
})

export const assess = (attack_id: string, assessed_at: string, intensity: number | null, over: Partial<Assessment> = {}): Assessment => ({
  id: id(), attack_id, patient_id: P, administration_id: null, assessed_at, minutes_after_dose: null, intensity, locations: null, note: null, ...over,
})

export const log = (log_date: string, over: Partial<DailyLog> = {}): DailyLog => ({
  id: id(), patient_id: P, log_date, pain_free_confirmed: false, sleep_quality: null, sleep_hours: null, hydration_liters: null,
  meals: null, fasting: null, caffeine_servings: null, physical_activity: null, stress: null, mood: null, notes: null, ...over,
})

export const cycle = (start_date: string, end_date: string | null = null): MenstrualCycle => ({
  id: id(), patient_id: P, start_date, end_date, flow: null, notes: null,
})

export const dataset = (over: Partial<Dataset> = {}): Dataset => ({ attacks: [], assessments: [], administrations: [], dailyLogs: [], cycles: [], ...over })
