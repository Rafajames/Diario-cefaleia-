import { supabase, unwrap } from '@/services/supabase'
import type { Consent, ConsentType, Profile } from '@/types/database'
import { DEFAULT_SETTINGS } from '@/config/clinical-options'

export interface PublicConfig {
  public_signup_enabled: boolean
  consent_versions: Record<ConsentType, string>
}

export async function fetchPublicConfig(): Promise<PublicConfig> {
  const data = await unwrap<Partial<PublicConfig>>(supabase().rpc('public_config'))
  return {
    public_signup_enabled: data?.public_signup_enabled ?? true,
    consent_versions: { ...DEFAULT_SETTINGS.consent_versions, ...(data?.consent_versions ?? {}) },
  }
}

export const signIn = (email: string, password: string) =>
  supabase().auth.signInWithPassword({ email, password }).then(({ error }) => { if (error) throw error })

/** A função (role) nunca é enviada pelo cliente: o banco define 'patient' ou a função de um convite válido. */
export async function signUp(input: { email: string; password: string; full_name: string; consents: ConsentType[] }) {
  const { data, error } = await supabase().auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { full_name: input.full_name, consents: input.consents }, emailRedirectTo: `${window.location.origin}/` },
  })
  if (error) throw error
  return { needsEmailConfirmation: !data.session }
}

export const signOut = (everywhere = false) =>
  supabase().auth.signOut({ scope: everywhere ? 'global' : 'local' }).then(({ error }) => { if (error) throw error })

export const requestPasswordReset = (email: string) =>
  supabase().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/redefinir-senha` }).then(({ error }) => { if (error) throw error })

export const updatePassword = (password: string) =>
  supabase().auth.updateUser({ password }).then(({ error }) => { if (error) throw error })

export const fetchProfile = (id: string) => unwrap<Profile>(supabase().from('profiles').select('*').eq('id', id).single())

export const fetchConsents = (userId: string) =>
  unwrap<Consent[]>(supabase().from('consents').select('*').eq('user_id', userId).order('created_at', { ascending: true }))

/** Estado vigente = última decisão registrada de cada tipo. */
export function currentConsents(history: Consent[]): Partial<Record<ConsentType, boolean>> {
  const out: Partial<Record<ConsentType, boolean>> = {}
  for (const c of [...history].sort((a, b) => a.created_at.localeCompare(b.created_at))) out[c.consent_type] = c.granted
  return out
}

/** Registra decisões de consentimento (histórico imutável: sempre insere novas linhas). */
export async function recordConsents(userId: string, decisions: Partial<Record<ConsentType, boolean>>, versions: Record<ConsentType, string>) {
  const rows = (Object.entries(decisions) as [ConsentType, boolean][]).map(([consent_type, granted]) => ({
    user_id: userId, consent_type, granted, version: versions[consent_type],
  }))
  if (rows.length) await unwrap(supabase().from('consents').insert(rows))
}
