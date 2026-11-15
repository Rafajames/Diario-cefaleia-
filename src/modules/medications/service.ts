import type { Administration, Medication, PreventiveTreatment } from '@/types/database'
import { deleteRow, insertRow, updateRow } from '@/services/crud'
import { supabase, unwrap } from '@/services/supabase'
import { nowLocal } from '@/utils/datetime'
import { ValidationError } from '@/modules/headache-attacks/service'
import { makeAdministrationSchema, medicationSchema, preventiveSchema } from './schemas'
import type { ZodType } from 'zod'

function parse<T>(schema: ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input)
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => ({ path: String(i.path[0] ?? ''), message: i.message })))
  return r.data
}

/** Catálogo geral (owner_id nulo) + medicamentos personalizados do paciente. */
export const fetchMedications = (patientId: string) =>
  unwrap<Medication[]>(supabase().from('medications').select('*').or(`owner_id.is.null,owner_id.eq.${patientId}`).eq('active', true).order('trade_name'))

export const saveMedication = (ownerId: string | null, input: unknown, id?: string) => {
  const data = parse(medicationSchema, input)
  return id ? updateRow<Medication>('medications', id, data) : insertRow<Medication>('medications', { ...data, owner_id: ownerId })
}
export const archiveMedication = (id: string) => updateRow<Medication>('medications', id, { active: false })

export const fetchPreventives = (patientId: string) =>
  unwrap<PreventiveTreatment[]>(supabase().from('preventive_treatments').select('*').eq('patient_id', patientId).order('start_date', { ascending: false, nullsFirst: true }))

export const savePreventive = (patientId: string, input: unknown, id?: string) => {
  const data = parse(preventiveSchema, input)
  return id ? updateRow<PreventiveTreatment>('preventive_treatments', id, data) : insertRow<PreventiveTreatment>('preventive_treatments', { ...data, patient_id: patientId })
}
export const deletePreventive = (id: string) => deleteRow('preventive_treatments', id)

export const fetchAdministrations = (attackId: string) =>
  unwrap<Administration[]>(supabase().from('medication_administrations').select('*').eq('attack_id', attackId).order('taken_at'))

export const saveAdministration = (patientId: string, input: unknown, id?: string) => {
  const data = parse(makeAdministrationSchema(nowLocal()), input)
  return id ? updateRow<Administration>('medication_administrations', id, data) : insertRow<Administration>('medication_administrations', { ...data, patient_id: patientId })
}
export const deleteAdministration = (id: string) => deleteRow('medication_administrations', id)
