/** Regras de acesso por perfil (funções puras). A proteção real é a RLS do banco; aqui é só navegação. */
import type { ConsentType, Profile, Role } from '@/types/database'

export type Area = 'patient' | 'professional' | 'admin'

const AREAS: Record<Role, Area[]> = {
  patient: ['patient'],
  professional: ['professional'],
  // O administrador usa a área profissional apenas para pacientes que o autorizaram explicitamente
  admin: ['admin', 'professional'],
}

export const canAccessArea = (role: Role | null | undefined, area: Area): boolean => !!role && AREAS[role].includes(area)

export const homeFor = (role: Role): string => (role === 'admin' ? '/admin' : role === 'professional' ? '/profissional' : '/')

export const REQUIRED_CONSENTS: Record<Role, ConsentType[]> = {
  patient: ['personal_data', 'health_data'],
  professional: ['personal_data'],
  admin: ['personal_data'],
}

/** Consentimentos obrigatórios ainda não concedidos. O de pesquisa NUNCA é obrigatório. */
export function missingConsents(role: Role, granted: Partial<Record<ConsentType, boolean>>): ConsentType[] {
  return REQUIRED_CONSENTS[role].filter((c) => !granted[c])
}

export type Gate = 'login' | 'suspended' | 'consents' | 'forbidden' | 'ok'

/** Decide o que mostrar para uma rota protegida. */
export function gateFor(profile: Pick<Profile, 'role' | 'status'> | null, granted: Partial<Record<ConsentType, boolean>>, area: Area): Gate {
  if (!profile) return 'login'
  if (profile.status !== 'active') return 'suspended'
  if (missingConsents(profile.role, granted).length) return 'consents'
  return canAccessArea(profile.role, area) ? 'ok' : 'forbidden'
}
