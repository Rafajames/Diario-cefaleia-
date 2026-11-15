import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/services/supabase'
import type { ConsentType, Profile } from '@/types/database'
import { currentConsents, fetchConsents, fetchProfile, signOut as doSignOut } from './service'

interface AuthState {
  loading: boolean
  session: Session | null
  profile: Profile | null
  consents: Partial<Record<ConsentType, boolean>>
  /** true quando o usuário chegou por link de recuperação de senha */
  recovering: boolean
  error: unknown
  refresh: () => Promise<void>
  signOut: (everywhere?: boolean) => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [consents, setConsents] = useState<AuthState['consents']>({})
  const [loading, setLoading] = useState(true)
  const [recovering, setRecovering] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const userId = session?.user.id ?? null

  useEffect(() => {
    supabase().auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase().auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      if (event === 'SIGNED_OUT') { setProfile(null); setConsents({}); qc.clear() }
      setSession(s)
      if (!s) setLoading(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [qc])

  const load = useCallback(async () => {
    if (!userId) return
    try {
      const [p, c] = await Promise.all([fetchProfile(userId), fetchConsents(userId)])
      setProfile(p)
      setConsents(currentConsents(c))
      setError(null)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { void load() }, [load])

  const value = useMemo<AuthState>(() => ({
    loading, session, profile, consents, recovering, error,
    refresh: load,
    signOut: async (everywhere) => { await doSignOut(everywhere); setRecovering(false) },
  }), [loading, session, profile, consents, recovering, error, load])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth deve ser usado dentro de <AuthProvider>.')
  return v
}

/** Perfil garantido (para uso dentro de rotas protegidas). */
export function useProfile(): Profile {
  const { profile } = useAuth()
  if (!profile) throw new Error('Perfil indisponível fora de rota protegida.')
  return profile
}
