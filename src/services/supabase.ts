import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, isConfigured } from '@/config/env'

let client: SupabaseClient | null = null

/** Cliente único do Supabase. Usa apenas a chave pública; a segurança é garantida pela RLS no banco. */
export function supabase(): SupabaseClient {
  if (!isConfigured) throw new Error('Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (ver .env.example).')
  client ??= createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  return client
}

/** Desembrulha { data, error } lançando o erro — os serviços devolvem dados ou lançam. */
export async function unwrap<T>(query: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await query
  if (error) throw error
  return data as T
}
