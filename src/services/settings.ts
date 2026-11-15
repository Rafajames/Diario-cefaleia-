import { useQuery } from '@tanstack/react-query'
import { DEFAULT_SETTINGS, type ClinicalSettings } from '@/config/clinical-options'
import { supabase, unwrap } from './supabase'

export async function fetchSettings(): Promise<ClinicalSettings> {
  const rows = await unwrap<{ key: string; value: unknown }[]>(supabase().from('app_settings').select('key, value'))
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  for (const r of rows ?? []) if (r.key in DEFAULT_SETTINGS && r.value !== null) merged[r.key] = r.value
  return merged as ClinicalSettings
}

/** Parâmetros clínicos configuráveis (com os padrões como reserva enquanto carrega). */
export function useSettings(): ClinicalSettings {
  const q = useQuery({ queryKey: ['settings'], queryFn: fetchSettings, staleTime: 5 * 60_000 })
  return q.data ?? DEFAULT_SETTINGS
}
