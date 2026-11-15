import type { Assessment, Attack } from '@/types/database'
import { deleteRow, insertRow, updateRow } from '@/services/crud'
import { supabase, unwrap } from '@/services/supabase'
import { nowLocal } from '@/utils/datetime'
import { assessmentSchema, makeAttackSchema, type AttackPayload } from './schemas'

export class ValidationError extends Error {
  constructor(public issues: { path: string; message: string }[]) {
    super(issues.map((i) => i.message).join(' '))
  }
}

function parseAttack(payload: AttackPayload): AttackPayload {
  const r = makeAttackSchema(nowLocal()).safeParse(payload)
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => ({ path: String(i.path[0] ?? ''), message: i.message })))
  return r.data
}

export const fetchAttack = (id: string) => unwrap<Attack>(supabase().from('headache_attacks').select('*').eq('id', id).is('deleted_at', null).single())

export const fetchAttacks = (patientId: string, limit = 200) =>
  unwrap<Attack[]>(supabase().from('headache_attacks').select('*').eq('patient_id', patientId).is('deleted_at', null).order('started_at', { ascending: false }).limit(limit))

export const fetchOngoingAttacks = (patientId: string) =>
  unwrap<Attack[]>(supabase().from('headache_attacks').select('*').eq('patient_id', patientId).is('deleted_at', null).eq('still_ongoing', true).order('started_at', { ascending: false }))

export const createAttack = (patientId: string, payload: AttackPayload) =>
  insertRow<Attack>('headache_attacks', { ...parseAttack(payload), patient_id: patientId })

export const updateAttack = (id: string, payload: AttackPayload) => updateRow<Attack>('headache_attacks', id, parseAttack(payload))

/** Exclusão lógica: o registro sai das telas e dos cálculos, mas permanece no histórico de auditoria. */
export const deleteAttack = (id: string) => updateRow<Attack>('headache_attacks', id, { deleted_at: new Date().toISOString(), still_ongoing: false })

export const fetchAssessments = (attackId: string) =>
  unwrap<Assessment[]>(supabase().from('attack_assessments').select('*').eq('attack_id', attackId).order('assessed_at'))

export function saveAssessment(base: { attack_id: string; patient_id: string; administration_id?: string | null }, input: unknown, id?: string) {
  const r = assessmentSchema.safeParse(input)
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => ({ path: String(i.path[0] ?? ''), message: i.message })))
  return id ? updateRow<Assessment>('attack_assessments', id, r.data) : insertRow<Assessment>('attack_assessments', { ...r.data, ...base })
}
export const deleteAssessment = (id: string) => deleteRow('attack_assessments', id)
