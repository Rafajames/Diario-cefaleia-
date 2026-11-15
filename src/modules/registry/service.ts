import { supabase, unwrap } from '@/services/supabase'
import { ValidationError } from '@/modules/headache-attacks/service'
import { isValidCpf, onlyDigits } from './cpf'

/** Ficha principal do paciente (tabela patient_registry). Acesso apenas por funções do banco. */
export interface Registry {
  id: string
  user_id: string | null
  record_number: string
  registration_status: 'incomplete' | 'complete' | 'awaiting_documents' | 'inactive'
  [field: string]: string | number | null
}
export interface RegistryView {
  registry: Registry
  access: 'owner' | 'admin' | 'responsible' | 'clinician'
  linked: boolean
  missing: string[]
  activation_pending: boolean
}
export interface RegistryListRow {
  id: string; record_number: string; full_name: string | null; cpf_masked: string | null; birth_date: string | null
  registration_status: Registry['registration_status']; linked: boolean; responsible_name: string | null; updated_at: string
}
export interface RegistryHistoryRow { created_at: string; actor_name: string | null; action: string; fields: string[] }

export const STATUS_LABEL: Record<Registry['registration_status'], string> = {
  incomplete: 'Incompleto', complete: 'Completo', awaiting_documents: 'Aguardando documentos', inactive: 'Inativo',
}

export const registryGet = (p: { registry?: string | null; user?: string | null }) =>
  unwrap<RegistryView>(supabase().rpc('registry_get', { p_registry: p.registry ?? null, p_user: p.user ?? null }))
export const registryList = (search: string, status: string) =>
  unwrap<RegistryListRow[]>(supabase().rpc('registry_list', { p_search: search.trim() || null, p_status: status || null, p_limit: 200 }))
export const registryHistory = (id: string) => unwrap<RegistryHistoryRow[]>(supabase().rpc('registry_history', { p_registry: id }))
export const registryGenerateCode = (id: string) => unwrap<string>(supabase().rpc('registry_generate_code', { p_registry: id }))
export const registryClaim = (recordNumber: string, code: string) => unwrap<boolean>(supabase().rpc('registry_claim', { p_record_number: recordNumber, p_code: code }))

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
/** Validação imediata no navegador (o banco repete todas as regras). Campos vazios são aceitos: o cadastro pode ficar incompleto. */
export function validateRegistry(data: Record<string, unknown>, today: string): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = []
  const s = (k: string) => (typeof data[k] === 'string' ? (data[k] as string).trim() : '')
  for (const k of ['cpf', 'guardian_cpf']) if (s(k) && !isValidCpf(s(k))) issues.push({ path: k, message: 'CPF inválido.' })
  for (const k of ['email_primary', 'email_secondary', 'guardian_email']) if (s(k) && !EMAIL.test(s(k))) issues.push({ path: k, message: 'E-mail inválido.' })
  if (s('birth_date') && (s('birth_date') > today || s('birth_date') < '1900-01-01')) issues.push({ path: 'birth_date', message: 'Data de nascimento inválida.' })
  if (s('cep') && onlyDigits(s('cep')).length !== 8) issues.push({ path: 'cep', message: 'CEP deve ter 8 dígitos.' })
  if (s('cns') && onlyDigits(s('cns')).length !== 15) issues.push({ path: 'cns', message: 'CNS deve ter 15 dígitos.' })
  if (s('weight_kg') && !(Number(s('weight_kg').replace(',', '.')) >= 1 && Number(s('weight_kg').replace(',', '.')) <= 500)) issues.push({ path: 'weight_kg', message: 'Peso entre 1 e 500 kg.' })
  if (s('height_cm') && !(Number(s('height_cm').replace(',', '.')) >= 30 && Number(s('height_cm').replace(',', '.')) <= 260)) issues.push({ path: 'height_cm', message: 'Altura entre 30 e 260 cm.' })
  return issues
}

/** Salva apenas o que mudou (cadastro incompleto é aceito). id nulo = novo cadastro (somente administração). */
export async function registrySave(id: string | null, changes: Record<string, string>, today: string) {
  const issues = validateRegistry(changes, today)
  if (issues.length) throw new ValidationError(issues)
  const payload: Record<string, string | number | null> = {}
  for (const [k, v] of Object.entries(changes)) {
    const t = v.trim()
    payload[k] = k === 'weight_kg' || k === 'height_cm' ? (t ? Number(t.replace(',', '.')) : null) : t === '' ? null : t
  }
  return unwrap<{ id: string; record_number: string; status: Registry['registration_status']; missing: string[] }>(supabase().rpc('registry_save', { p_id: id, p_data: payload }))
}

export interface ProfessionalOption { id: string; full_name: string; email: string }
/** Médicos que podem ser "responsável" (administração). */
export async function fetchResponsibleOptions(): Promise<ProfessionalOption[]> {
  const rows = await unwrap<(ProfessionalOption & { role: string; clinical_enabled: boolean })[]>(
    supabase().from('profiles').select('id, full_name, email, role, clinical_enabled').in('role', ['professional', 'admin']).eq('status', 'active').order('full_name'))
  return rows.filter((r) => r.role === 'professional' || r.clinical_enabled)
}
