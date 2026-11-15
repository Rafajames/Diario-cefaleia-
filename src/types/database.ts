/**
 * Tipos das linhas do banco (espelham supabase/migrations).
 * Horários clínicos são "relógio de parede" do paciente: 'YYYY-MM-DDTHH:mm[:ss]' sem fuso.
 */
export type LocalDateTime = string
export type DateOnly = string // 'YYYY-MM-DD'
export type Role = 'patient' | 'professional' | 'admin'
export type AccountStatus = 'active' | 'suspended'
export type ConsentType = 'personal_data' | 'health_data' | 'professional_sharing' | 'research'

export interface Profile {
  id: string
  full_name: string
  email: string
  role: Role
  status: AccountStatus
  created_at: string
  updated_at: string
}

export interface Patient {
  id: string
  birth_date: DateOnly | null
  phone: string | null
  sex_at_birth: 'female' | 'male' | 'intersex' | 'undisclosed' | null
  gender: string | null
  country: string | null
  city: string | null
  timezone: string
  pain_onset_approx: string | null
  usual_frequency: string | null
  reported_diagnosis: string | null
  clinical_history: string | null
  comorbidities: string | null
  continuous_medications: string | null
  tracks_menstruation: boolean
  cycle_regularity: 'regular' | 'irregular' | 'unknown' | null
  usual_cycle_days: number | null
  usual_bleeding_days: number | null
  next_period_expected: DateOnly | null
  hormonal_contraceptive: string | null
  menstrual_notes: string | null
}

export interface Consent {
  id: string
  user_id: string
  consent_type: ConsentType
  version: string
  granted: boolean
  created_at: string
}

export interface CareLink {
  id: string
  patient_id: string
  grantee_id: string
  status: 'pending' | 'active' | 'revoked'
  include_menstruation: boolean
  requested_by: string | null
  created_at: string
  authorized_at: string | null
  revoked_at: string | null
}

export type SymptomPhase = 'before' | 'during' | 'after'
export interface AttackSymptom {
  symptom: string
  phase: SymptomPhase
  note?: string
}
export interface AttackTrigger {
  category: string
  factor: string
  /** suspeita do paciente × fato que ocorreu antes da crise */
  relation: 'suspected' | 'occurred_before'
  when?: string
  confidence?: number // 1..5
  note?: string
}

export interface Attack {
  id: string
  patient_id: string
  started_at: LocalDateTime
  start_is_approximate: boolean
  onset_type: 'sudden' | 'gradual' | null
  started_during_sleep: 'yes' | 'no' | 'unknown' | null
  ended_at: LocalDateTime | null
  still_ongoing: boolean
  improved_spontaneously: boolean | null
  improved_after_medication: boolean | null
  ended_by_sleep: boolean | null
  intensity_initial: number | null
  intensity_max: number | null
  intensity_final: number | null
  locations: string[]
  side: 'right' | 'left' | 'bilateral' | 'undefined' | null
  location_other: string | null
  pain_qualities: string[]
  quality_other: string | null
  aggravating: string[]
  aggravating_other: string | null
  symptoms: AttackSymptom[]
  triggers: AttackTrigger[]
  functional_impact: number | null
  notes: string | null
  recorded_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Assessment {
  id: string
  attack_id: string
  patient_id: string
  administration_id: string | null
  assessed_at: LocalDateTime
  minutes_after_dose: number | null
  intensity: number | null
  locations: string[] | null
  note: string | null
}

export interface DailyLog {
  id: string
  patient_id: string
  log_date: DateOnly
  pain_free_confirmed: boolean
  sleep_quality: number | null
  sleep_hours: number | null
  hydration_liters: number | null
  meals: string | null
  fasting: boolean | null
  caffeine_servings: number | null
  physical_activity: 'none' | 'light' | 'moderate' | 'intense' | null
  stress: number | null
  mood: number | null
  notes: string | null
}

export type MedicationCategory =
  | 'analgesic' | 'nsaid' | 'triptan' | 'ergot' | 'opioid' | 'antiemetic' | 'combination' | 'preventive' | 'other'

export interface Medication {
  id: string
  owner_id: string | null
  trade_name: string
  active_ingredient: string | null
  presentation: string | null
  category: MedicationCategory
  route: string | null
  strength: number | null
  unit: string | null
  notes: string | null
  active: boolean
}

export interface PreventiveTreatment {
  id: string
  patient_id: string
  medication_id: string | null
  name: string
  prescribed_dose: string | null
  usual_time: string | null
  start_date: DateOnly | null
  end_date: DateOnly | null
  dose_changes: { date: DateOnly; dose: string; note?: string }[]
  prescriber: string | null
  notes: string | null
}

export type Outcome = 'complete' | 'partial' | 'none' | 'worse' | 'unknown'

export interface Administration {
  id: string
  patient_id: string
  attack_id: string | null
  medication_id: string | null
  medication_name: string
  active_ingredient: string | null
  category: string
  dose: number | null
  unit: string | null
  route: string | null
  taken_at: LocalDateTime
  time_is_approximate: boolean
  sequence_number: number | null
  reason: string | null
  notes: string | null
  intensity_before: number | null
  relief_started_at: LocalDateTime | null
  max_relief_at: LocalDateTime | null
  outcome: Outcome | null
  pain_free: boolean | null
  pain_free_minutes: number | null
  recurred: boolean | null
  recurrence_at: LocalDateTime | null
  needed_rescue: boolean | null
  adverse_effect: boolean | null
  adverse_effect_note: string | null
}

export interface MenstrualCycle {
  id: string
  patient_id: string
  start_date: DateOnly
  end_date: DateOnly | null
  flow: 'light' | 'moderate' | 'heavy' | null
  notes: string | null
}

export interface ClinicalNote {
  id: string
  patient_id: string
  author_id: string
  kind: 'observation' | 'diagnosis'
  content: string
  created_at: string
  updated_at: string
}

/** Conjunto de dados de um paciente em um intervalo — entrada de todos os cálculos clínicos. */
export interface Dataset {
  attacks: Attack[]
  assessments: Assessment[]
  administrations: Administration[]
  dailyLogs: DailyLog[]
  cycles: MenstrualCycle[]
}

export interface Period {
  from: DateOnly
  to: DateOnly
}
