/** Configuração de ambiente. Nenhum segredo vive no código: apenas a URL e a chave PÚBLICA do Supabase. */
export const env = {
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '',
  supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '',
  isDev: import.meta.env.DEV,
}
export const isConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)

export const INSTITUTION = {
  appName: 'Diário da Cefaleia',
  short: 'CENDOR',
  full: 'CENDOR — Centro de Tratamento da Dor e Medicina Paliativa',
}
