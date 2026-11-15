import type { ZodType } from 'zod'
import type { CareLink, Patient, Profile } from '@/types/database'
import { insertRow, updateRow } from '@/services/crud'
import { supabase, unwrap } from '@/services/supabase'
import { todayLocal } from '@/utils/datetime'
import { ValidationError } from '@/modules/headache-attacks/service'
import { makePatientSchema, menstrualProfileSchema } from './schemas'

export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input)
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => ({ path: String(i.path[0] ?? ''), message: i.message })))
  return r.data
}

export const fetchPatient = (id: string) => unwrap<Patient>(supabase().from('patients').select('*').eq('id', id).single())
export const updatePatient = (id: string, input: unknown) => updateRow<Patient>('patients', id, parse(makePatientSchema(todayLocal()), input))
export const updateMenstrualProfile = (id: string, input: unknown) => updateRow<Patient>('patients', id, parse(menstrualProfileSchema, input))
export const updateName = (id: string, full_name: string) => {
  const name = full_name.trim()
  if (name.length < 3) throw new ValidationError([{ path: 'full_name', message: 'Informe seu nome completo.' }])
  return updateRow<Profile>('profiles', id, { full_name: name.slice(0, 200) })
}

// ---- Compartilhamento (vínculos) -------------------------------------------------
export interface LinkView extends CareLink { grantee: Pick<Profile, 'id' | 'full_name' | 'role' | 'email'> | null }

export async function fetchMyLinks(patientId: string): Promise<LinkView[]> {
  const links = await unwrap<CareLink[]>(supabase().from('care_links').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }))
  if (!links.length) return []
  const people = await unwrap<Pick<Profile, 'id' | 'full_name' | 'role' | 'email'>[]>(supabase().from('profiles').select('id, full_name, role, email').in('id', links.map((l) => l.grantee_id)))
  return links.map((l) => ({ ...l, grantee: people.find((p) => p.id === l.grantee_id) ?? null }))
}

export async function shareWithProfessional(patientId: string, email: string, includeMenstruation: boolean) {
  const found = await unwrap<{ id: string; full_name: string }[]>(supabase().rpc('find_grantee_by_email', { p_email: email }))
  if (!found?.length) throw new ValidationError([{ path: 'email', message: 'Nenhum profissional ativo encontrado com este e-mail. Confirme o endereço com o profissional.' }])
  return unwrap(supabase().from('care_links').upsert(
    { patient_id: patientId, grantee_id: found[0].id, status: 'active', include_menstruation: includeMenstruation },
    { onConflict: 'patient_id,grantee_id' }))
}
export const updateLink = (id: string, patch: Partial<Pick<CareLink, 'status' | 'include_menstruation'>>) => updateRow<CareLink>('care_links', id, patch)

export interface AccessLogView { id: number; actor_id: string; action: string; created_at: string; detail: string | null }
export const fetchAccessToMe = (patientId: string) =>
  unwrap<AccessLogView[]>(supabase().from('access_logs').select('id, actor_id, action, created_at, detail').eq('patient_id', patientId).neq('actor_id', patientId).order('created_at', { ascending: false }).limit(50))

// ---- Direitos do titular -----------------------------------------------------------
const TABLES = ['headache_attacks', 'attack_assessments', 'medication_administrations', 'daily_logs', 'menstrual_cycles', 'preventive_treatments', 'clinical_notes'] as const

/** Exporta todos os dados do próprio paciente em formato estruturado (portabilidade). */
export async function exportAllMyData(patientId: string) {
  const sb = supabase()
  const [profile, patient, consents, links, medications, ...clinical] = await Promise.all([
    unwrap(sb.from('profiles').select('*').eq('id', patientId).single()),
    unwrap(sb.from('patients').select('*').eq('id', patientId).single()),
    unwrap(sb.from('consents').select('*').eq('user_id', patientId)),
    unwrap(sb.from('care_links').select('*').eq('patient_id', patientId)),
    unwrap(sb.from('medications').select('*').eq('owner_id', patientId)),
    ...TABLES.map((t) => unwrap(sb.from(t).select('*').eq('patient_id', patientId))),
  ])
  await sb.rpc('log_report_event', { p_patient_id: patientId, p_kind: 'export_own_data' })
  return {
    exported_at: new Date().toISOString(),
    note: 'Exportação integral dos dados do titular — Diário da Cefaleia (CENDOR). Registros autorrelatados.',
    profile, patient, consents, care_links: links, custom_medications: medications,
    ...Object.fromEntries(TABLES.map((t, i) => [t, clinical[i]])),
  }
}

export interface DeletionRequest { id: string; user_id: string; reason: string | null; status: string; requested_at: string; processed_at: string | null; admin_note: string | null }
export const fetchMyDeletionRequests = (userId: string) =>
  unwrap<DeletionRequest[]>(supabase().from('deletion_requests').select('*').eq('user_id', userId).order('requested_at', { ascending: false }))
export const requestDeletion = (userId: string, reason: string) => insertRow('deletion_requests', { user_id: userId, reason: reason.trim().slice(0, 1000) || null })
