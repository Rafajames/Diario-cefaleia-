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

/** Retorno planejado pelo profissional (a RLS limita ao próprio profissional e ao paciente). */
export interface FollowUp { id: string; patient_id: string; professional_id: string; next_return: string; reason: string | null }
export const fetchFollowUps = () => unwrap<FollowUp[]>(supabase().from('follow_ups').select('*').order('next_return'))

export function saveFollowUp(patientId: string, professionalId: string, nextReturn: string, reason: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextReturn)) throw new ValidationError([{ path: 'next_return', message: 'Informe a data do retorno.' }])
  if (reason.length > 300) throw new ValidationError([{ path: 'reason', message: 'Máximo de 300 caracteres.' }])
  return unwrap<FollowUp>(supabase().from('follow_ups')
    .upsert({ patient_id: patientId, professional_id: professionalId, next_return: nextReturn, reason: reason.trim() || null }, { onConflict: 'patient_id,professional_id' }).select().single())
}
export const clearFollowUp = (id: string) => unwrap(supabase().from('follow_ups').delete().eq('id', id))

/** Pede o vínculo pelo e-mail do paciente. A resposta nunca revela se o e-mail tem conta. */
export function requestPatientLink(email: string) {
  const e = email.trim()
  if (!/^\S+@\S+\.\S+$/.test(e)) throw new ValidationError([{ path: 'email', message: 'Informe um e-mail válido.' }])
  return unwrap(supabase().rpc('request_patient_link', { p_email: e }))
}

export interface ProfessionalData { id: string; council_type: string | null; council_number: string | null; specialty: string | null }
export const fetchProfessional = (id: string) => unwrap<ProfessionalData | null>(supabase().from('professionals').select('*').eq('id', id).maybeSingle())
export function saveProfessional(id: string, v: { council_type: string; council_number: string; specialty: string }) {
  const clean = (s: string, max: number, path: string) => {
    const t = s.trim()
    if (t.length > max) throw new ValidationError([{ path, message: `Máximo de ${max} caracteres.` }])
    return t || null
  }
  return updateRow<ProfessionalData>('professionals', id, {
    council_type: clean(v.council_type, 20, 'council_type'), council_number: clean(v.council_number, 40, 'council_number'), specialty: clean(v.specialty, 120, 'specialty'),
  })
}

/** Modelos de estrutura para a observação (apenas cabeçalhos em branco: nenhum conteúdo clínico pré-escrito, sem conduta nem dose). */
export const NOTE_TEMPLATES: { value: string; label: string; text: string }[] = [
  { value: '', label: 'Em branco', text: '' },
  { value: 'primeira', label: 'Primeira consulta', text: 'Motivo da consulta:\n\nHistória da cefaleia relatada:\n\nRegistros do diário analisados (período):\n\nPontos a esclarecer:\n\nCombinados com o paciente:\n' },
  { value: 'retorno', label: 'Retorno', text: 'Período analisado:\n\nO que o paciente relata desde a última consulta:\n\nO que os registros mostram:\n\nPontos a esclarecer:\n\nCombinados com o paciente:\n' },
  { value: 'diario', label: 'Revisão do diário', text: 'Período analisado:\n\nQualidade do preenchimento (dias sem informação):\n\nObservações sobre os registros:\n\nPendências para o paciente:\n' },
]
