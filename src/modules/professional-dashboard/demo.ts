/**
 * Paciente de DEMONSTRAÇÃO: dados totalmente fictícios, gerados no navegador e nunca gravados.
 * Serve apenas para conhecer o painel e o prontuário sem pacientes reais.
 */
import type { Administration, Attack, DailyLog, Dataset } from '@/types/database'
import { addDays, todayLocal } from '@/utils/datetime'

export const DEMO_NAME = 'Paciente Demonstração (fictício)'

// Gerador pseudoaleatório determinístico: o exemplo é sempre o mesmo.
function rng(seed: number) {
  let s = seed
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 }
}
const pad = (n: number) => String(n).padStart(2, '0')

export function buildDemoDataset(today = todayLocal()): Dataset {
  const r = rng(42)
  const attacks: Attack[] = []
  const administrations: Administration[] = []
  const dailyLogs: DailyLog[] = []
  const days = 190
  for (let back = days; back >= 0; back--) {
    const date = addDays(today, -back)
    // Frequência menor nos meses mais recentes (melhora fictícia)
    const chance = back > 95 ? 0.2 : 0.09
    if (back > 0 && r() < chance) {
      const hour = 7 + Math.floor(r() * 12)
      const started = `${date}T${pad(hour)}:${pad(Math.floor(r() * 60))}:00`
      const max = (back > 95 ? 7 : 5) + Math.floor(r() * 3)
      const endH = Math.min(hour + 2 + Math.floor(r() * 5), 23)
      const id = `demo-a-${back}`
      attacks.push({
        id, patient_id: 'demo', started_at: started, start_is_approximate: false, onset_type: 'gradual', started_during_sleep: 'no',
        ended_at: `${date}T${pad(endH)}:00:00`, still_ongoing: false, improved_spontaneously: false, improved_after_medication: true, ended_by_sleep: false,
        intensity_initial: max - 2, intensity_max: max, intensity_final: 1, locations: ['frontal', 'temporal'], side: 'bilateral', location_other: null,
        pain_qualities: ['pulsatile'], quality_other: null, aggravating: [], aggravating_other: null, symptoms: [], triggers: [], functional_impact: 5,
        notes: null, recorded_at: started, updated_at: started, deleted_at: null,
      } as Attack)
      const took = `${date}T${pad(Math.min(hour + 1, 23))}:00:00`
      administrations.push({
        id: `demo-m-${back}`, patient_id: 'demo', attack_id: id, medication_id: null, medication_name: 'Medicamento fictício A', active_ingredient: null, category: 'analgesic',
        dose: 1, unit: 'comprimido', route: 'oral', taken_at: took, time_is_approximate: false, sequence_number: 1, reason: null, notes: null, intensity_before: max - 1,
        relief_started_at: `${date}T${pad(Math.min(hour + 2, 23))}:00:00`, max_relief_at: `${date}T${pad(endH)}:00:00`, outcome: r() < 0.7 ? 'complete' : 'partial',
        pain_free: null, pain_free_minutes: null, recurred: r() < 0.15, recurrence_at: null, needed_rescue: false, adverse_effect: false, adverse_effect_note: null,
      } as Administration)
    }
    if (back % 2 === 0) {
      dailyLogs.push({
        id: `demo-d-${back}`, patient_id: 'demo', log_date: date, pain_free_confirmed: !attacks.some((a) => a.started_at.startsWith(date)),
        sleep_quality: 2 + Math.floor(r() * 3), sleep_hours: 5 + Math.floor(r() * 4), hydration_liters: 1 + Math.round(r() * 20) / 10, meals: null, fasting: null,
        caffeine_servings: Math.floor(r() * 4), physical_activity: 'light', stress: 1 + Math.floor(r() * 5), mood: 2 + Math.floor(r() * 3), notes: null,
      } as DailyLog)
    }
  }
  return { attacks, assessments: [], administrations, dailyLogs, cycles: [] }
}
