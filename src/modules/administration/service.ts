import type { AccountStatus, CareLink, Consent, Medication, Profile, Role } from '@/types/database'
import { insertRow, updateRow } from '@/services/crud'
import { supabase, unwrap } from '@/services/supabase'
import { ValidationError } from '@/modules/headache-attacks/service'
import type { DeletionRequest } from '@/modules/patients/service'

export type AdminStats = Record<'total_users' | 'patients' | 'professionals' | 'suspended' | 'active_patients_30d' | 'new_signups_30d' | 'records_total' | 'attacks_total' | 'reports_generated' | 'active_links' | 'pending_deletions', number> & { generated_at: string }
export const fetchStats = () => unwrap<AdminStats>(supabase().rpc('admin_stats'))
export const fetchAggregate = () => unwrap<Record<string, number | boolean | string | null>>(supabase().rpc('admin_aggregate_report'))

export const fetchProfiles = () => unwrap<Profile[]>(supabase().from('profiles').select('*').order('created_at', { ascending: false }).limit(1000))
export const fetchAllConsents = () => unwrap<Consent[]>(supabase().from('consents').select('*').order('created_at', { ascending: true }).limit(10000))
/** Função e situação são validadas no banco: o administrador não altera a si mesmo nem cria outros administradores por aqui. */
export const setStatus = (id: string, status: AccountStatus) => updateRow<Profile>('profiles', id, { status })
export const setRole = (id: string, role: Exclude<Role, 'admin'>) => updateRow<Profile>('profiles', id, { role })

export const fetchLinks = () => unwrap<CareLink[]>(supabase().from('care_links').select('*').order('created_at', { ascending: false }).limit(1000))
/** Vínculo criado pelo administrador nasce PENDENTE: só o paciente pode autorizar. */
export const createPendingLink = (patient_id: string, grantee_id: string) => insertRow<CareLink>('care_links', { patient_id, grantee_id, status: 'pending' })
export const revokeLink = (id: string) => updateRow<CareLink>('care_links', id, { status: 'revoked' })

export interface Invite { id: string; email: string; role: Role; created_at: string; expires_at: string; accepted_at: string | null; revoked_at: string | null }
export const fetchInvites = () => unwrap<Invite[]>(supabase().from('invites').select('*').order('created_at', { ascending: false }).limit(500))
export function createInvite(email: string, role: 'patient' | 'professional' | 'reception', invited_by: string) {
  const e = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new ValidationError([{ path: 'email', message: 'Informe um e-mail válido.' }])
  return insertRow<Invite>('invites', { email: e, role, invited_by })
}
export const revokeInvite = (id: string) => updateRow<Invite>('invites', id, { revoked_at: new Date().toISOString() })

export interface SettingRow { key: string; value: unknown; description: string | null; updated_at: string }
export const fetchSettingRows = () => unwrap<SettingRow[]>(supabase().from('app_settings').select('*').order('key'))
export const saveSetting = (key: string, value: unknown, updated_by: string) =>
  unwrap(supabase().from('app_settings').update({ value, updated_by }).eq('key', key).select().single())

export interface AccessLog { id: number; actor_id: string; patient_id: string | null; action: string; detail: string | null; created_at: string }
export const fetchAccessLogs = () => unwrap<AccessLog[]>(supabase().from('access_logs').select('*').order('id', { ascending: false }).limit(200))
export interface AuditMeta { id: number; table_name: string; record_id: string | null; action: string; actor_id: string | null; patient_id: string | null; created_at: string }
export const fetchAuditMeta = () => unwrap<AuditMeta[]>(supabase().rpc('admin_audit_log', { p_limit: 200, p_offset: 0 }))

export const fetchDeletionRequests = () => unwrap<DeletionRequest[]>(supabase().from('deletion_requests').select('*').order('requested_at', { ascending: false }).limit(200))
export const updateDeletionRequest = (id: string, status: string, admin_note: string, processed_by: string) =>
  updateRow('deletion_requests', id, { status, admin_note: admin_note.trim() || null, processed_by, processed_at: new Date().toISOString() })

export const fetchCatalog = () => unwrap<Medication[]>(supabase().from('medications').select('*').is('owner_id', null).order('trade_name'))
export const setCatalogActive = (id: string, active: boolean) => updateRow<Medication>('medications', id, { active })
