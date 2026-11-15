import type { MenstrualCycle } from '@/types/database'
import { deleteRow, insertRow, updateRow } from '@/services/crud'
import { supabase, unwrap } from '@/services/supabase'
import { todayLocal } from '@/utils/datetime'
import { makeCycleSchema } from '@/modules/patients/schemas'
import { parse } from '@/modules/patients/service'

export const fetchCycles = (patientId: string) =>
  unwrap<MenstrualCycle[]>(supabase().from('menstrual_cycles').select('*').eq('patient_id', patientId).order('start_date', { ascending: false }).limit(60))

/** Aceita ciclos incompletos (sem último dia) e correções retrospectivas. */
export const saveCycle = (patientId: string, input: unknown, id?: string) => {
  const data = parse(makeCycleSchema(todayLocal()), input)
  return id ? updateRow<MenstrualCycle>('menstrual_cycles', id, data) : insertRow<MenstrualCycle>('menstrual_cycles', { ...data, patient_id: patientId })
}
export const deleteCycle = (id: string) => deleteRow('menstrual_cycles', id)
