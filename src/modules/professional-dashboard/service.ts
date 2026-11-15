import type { ClinicalNote } from '@/types/database'
import { insertRow, updateRow } from '@/services/crud'
import { supabase, unwrap } from '@/services/supabase'
import { ValidationError } from '@/modules/headache-attacks/service'

export interface OverviewRow {
  patient_id: string
  full_name: string
  link_status: 'active' | 'pending'
  include_menstruation: boolean
  last_record_at: string | null
  attacks_30d: number | null
}

/** Pacientes vinculados ao profissional (o acesso à visão geral é registrado no servidor). */
export const fetchOverview = () => unwrap<OverviewRow[]>(supabase().rpc('professional_overview'))

/** Abre o prontuário: o servidor confere o vínculo/consentimento e registra o acesso. Sem isso, a RLS nega a leitura. */
export const openPatientRecord = (patientId: string) => unwrap<boolean>(supabase().rpc('open_patient_record', { p_patient_id: patientId }))

export const logReportEvent = (patientId: string, kind: 'export_pdf' | 'export_csv', detail?: string) =>
  unwrap(supabase().rpc('log_report_event', { p_patient_id: patientId, p_kind: kind, p_detail: detail ?? null }))

export type NoteView = ClinicalNote & { author_name?: string }

export async function fetchNotes(patientId: string): Promise<NoteView[]> {
  const notes = await unwrap<ClinicalNote[]>(supabase().from('clinical_notes').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }))
  if (!notes.length) return []
  const authors = await unwrap<{ id: string; full_name: string }[]>(supabase().from('profiles').select('id, full_name').in('id', [...new Set(notes.map((n) => n.author_id))]))
  return notes.map((n) => ({ ...n, author_name: authors?.find((a) => a.id === n.author_id)?.full_name }))
}

export function saveNote(patientId: string, authorId: string, input: { kind: ClinicalNote['kind']; content: string }, id?: string) {
  const content = input.content.trim()
  if (!content) throw new ValidationError([{ path: 'content', message: 'Escreva a observação.' }])
  if (content.length > 6000) throw new ValidationError([{ path: 'content', message: 'Máximo de 6000 caracteres.' }])
  return id ? updateRow<ClinicalNote>('clinical_notes', id, { kind: input.kind, content })
    : insertRow<ClinicalNote>('clinical_notes', { patient_id: patientId, author_id: authorId, kind: input.kind, content })
}
