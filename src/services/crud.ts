import { supabase, unwrap } from './supabase'

/** Operações genéricas de escrita. A autorização é sempre decidida pela RLS do banco. */
export const insertRow = <T>(table: string, row: object) => unwrap<T>(supabase().from(table).insert(row).select().single())
export const updateRow = <T>(table: string, id: string, patch: object) => unwrap<T>(supabase().from(table).update(patch).eq('id', id).select().single())
export const deleteRow = (table: string, id: string) => unwrap(supabase().from(table).delete().eq('id', id))

/** '' e espaços viram null; demais valores passam inalterados. */
export const blank = <T>(v: T): T | null => (typeof v === 'string' ? ((v.trim() || null) as T | null) : v ?? null)
export const num = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
