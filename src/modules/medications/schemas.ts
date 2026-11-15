import { z } from 'zod'
import { intensity, localDateTime } from '@/modules/headache-attacks/schemas'

const text = (max: number) => z.string().max(max, `Máximo de ${max} caracteres.`).nullable()
const CATEGORIES = ['analgesic', 'nsaid', 'triptan', 'ergot', 'opioid', 'antiemetic', 'combination', 'preventive', 'other'] as const
const ROUTES = ['oral', 'sublingual', 'nasal', 'subcutaneous', 'intramuscular', 'intravenous', 'rectal', 'topical', 'other'] as const

export const medicationSchema = z.object({
  trade_name: z.string().trim().min(1, 'Informe o nome do medicamento.').max(160),
  active_ingredient: text(200),
  presentation: text(120),
  category: z.enum(CATEGORIES),
  route: z.enum(ROUTES).nullable(),
  strength: z.number().min(0, 'A dosagem não pode ser negativa.').nullable(),
  unit: text(20),
  notes: text(1000),
})

export const preventiveSchema = z
  .object({
    medication_id: z.string().nullable(),
    name: z.string().trim().min(1, 'Informe o nome do medicamento.').max(160),
    prescribed_dose: text(120),
    usual_time: text(60),
    start_date: z.string().nullable(),
    end_date: z.string().nullable(),
    dose_changes: z.array(z.object({ date: z.string().min(10), dose: z.string().min(1).max(120), note: z.string().max(200).optional() })).max(50),
    prescriber: text(160),
    notes: text(1000),
  })
  .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, { path: ['end_date'], message: 'A data de término não pode ser anterior ao início.' })

const administrationBase = z.object({
  attack_id: z.string().nullable(),
  medication_id: z.string().nullable(),
  medication_name: z.string().trim().min(1, 'Informe o medicamento.').max(160),
  active_ingredient: text(200),
  category: z.enum(CATEGORIES),
  dose: z.number().min(0, 'A dose não pode ser negativa.').nullable(),
  unit: text(20),
  route: text(30),
  taken_at: localDateTime,
  time_is_approximate: z.boolean(),
  sequence_number: z.number().int().min(1).max(50).nullable(),
  reason: text(300),
  notes: text(1000),
  intensity_before: intensity,
  // Resposta — tudo opcional
  relief_started_at: localDateTime.nullable(),
  max_relief_at: localDateTime.nullable(),
  outcome: z.enum(['complete', 'partial', 'none', 'worse', 'unknown']).nullable(),
  pain_free: z.boolean().nullable(),
  pain_free_minutes: z.number().int().min(0).max(43200).nullable(),
  recurred: z.boolean().nullable(),
  recurrence_at: localDateTime.nullable(),
  needed_rescue: z.boolean().nullable(),
  adverse_effect: z.boolean().nullable(),
  adverse_effect_note: text(500),
})
export type AdministrationPayload = z.infer<typeof administrationBase>

export const makeAdministrationSchema = (now: string) =>
  administrationBase.superRefine((v, ctx) => {
    const issue = (path: keyof AdministrationPayload, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
    const t = v.taken_at.slice(0, 16)
    if (t > now.slice(0, 16)) issue('taken_at', 'O horário da medicação não pode estar no futuro.')
    if (v.relief_started_at && v.relief_started_at.slice(0, 16) < t) issue('relief_started_at', 'O início do alívio não pode ser anterior à medicação.')
    if (v.max_relief_at && v.max_relief_at.slice(0, 16) < t) issue('max_relief_at', 'O alívio máximo não pode ser anterior à medicação.')
    if (v.relief_started_at && v.max_relief_at && v.max_relief_at < v.relief_started_at) issue('max_relief_at', 'O alívio máximo não pode ser anterior ao início do alívio.')
    if (v.recurrence_at && v.recurrence_at.slice(0, 16) < t) issue('recurrence_at', 'A recorrência não pode ser anterior à medicação.')
  })
