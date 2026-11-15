/** Regras de acesso por perfil (funções puras). A proteção real é a RLS do banco; aqui é só navegação. */
import type { ConsentType, Profile, Role } from '@/types/database'

export type Area = 'patient' | 'professional' | 'admin' | 'reception'

const AREAS: Record<Role, Area[]> = {
  patient: ['patient'],
  professional: ['professional'],
  admin: ['admin'],
  // Recepção: somente cadastro de pacientes, sem dados clínicos
  reception: ['reception'],
}

/** O administrador só usa a área profissional se a conta foi habilitada para atuação clínica (feito no banco). */
export const canAccessArea = (role: Role | null | undefined, area: Area, clinical = false): boolean =>
  !!role && (AREAS[role].includes(area) || (role === 'admin' && clinical && area === 'professional'))

export const homeFor = (role: Role): string => (role === 'admin' ? '/admin' : role === 'professional' ? '/profissional' : role === 'reception' ? '/recepcao' : '/')

export const REQUIRED_CONSENTS: Record<Role, ConsentType[]> = {
  patient: ['personal_data', 'health_data'],
  professional: ['personal_data'],
  admin: ['personal_data'],
  reception: ['personal_data'],
}

/** Consentimentos obrigatórios ainda não concedidos. O de pesquisa NUNCA é obrigatório. */
export function missingConsents(role: Role, granted: Partial<Record<ConsentType, boolean>>): ConsentType[] {
  return REQUIRED_CONSENTS[role].filter((c) => !granted[c])
}

export type Gate = 'login' | 'suspended' | 'consents' | 'forbidden' | 'ok'

/** Decide o que mostrar para uma rota protegida. */
export function gateFor(profile: (Pick<Profile, 'role' | 'status'> & { clinical_enabled?: boolean }) | null, granted: Partial<Record<ConsentType, boolean>>, area: Area): Gate {
  if (!profile) return 'login'
  if (profile.status !== 'active') return 'suspended'
  if (missingConsents(profile.role, granted).length) return 'consents'
  return canAccessArea(profile.role, area, !!profile.clinical_enabled) ? 'ok' : 'forbidden'
}
