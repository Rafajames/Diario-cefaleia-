import type { DailyLog, DateOnly } from '@/types/database'
import { deleteRow } from '@/services/crud'
import { supabase, unwrap } from '@/services/supabase'
import { todayLocal } from '@/utils/datetime'
import { ValidationError } from '@/modules/headache-attacks/service'
import { makeDailyLogSchema } from './schemas'

export const fetchDailyLogs = (patientId: string, from: DateOnly, to: DateOnly) =>
  unwrap<DailyLog[]>(supabase().from('daily_logs').select('*').eq('patient_id', patientId).gte('log_date', from).lte('log_date', to).order('log_date', { ascending: false }))

/** Cria ou atualiza o registro do dia (um por paciente e data). */
export function saveDailyLog(patientId: string, input: unknown) {
  const r = makeDailyLogSchema(todayLocal()).safeParse(input)
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => ({ path: String(i.path[0] ?? ''), message: i.message })))
  return unwrap<DailyLog>(supabase().from('daily_logs').upsert({ ...r.data, patient_id: patientId }, { onConflict: 'patient_id,log_date' }).select().single())
}

/** Confirma (ou desfaz) um dia sem dor preservando os demais campos já registrados. */
export async function setPainFree(patientId: string, date: DateOnly, existing: DailyLog | null, value: boolean) {
  if (existing) return unwrap(supabase().from('daily_logs').update({ pain_free_confirmed: value }).eq('id', existing.id))
  return saveDailyLog(patientId, {
    log_date: date, pain_free_confirmed: value, sleep_quality: null, sleep_hours: null, hydration_liters: null, meals: null,
    fasting: null, caffeine_servings: null, physical_activity: null, stress: null, mood: null, notes: null,
  })
}

export const deleteDailyLog = (id: string) => deleteRow('daily_logs', id)
