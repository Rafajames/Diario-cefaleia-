import { z } from 'zod'
import { AGGRAVATING, LOCATIONS, PAIN_QUALITIES, SYMPTOMS, TRIGGER_CATEGORIES } from '@/config/clinical-options'
import type { Attack } from '@/types/database'
import { blank } from '@/services/crud'

const values = (list: { value: string }[]) => list.map((o) => o.value) as [string, ...string[]]
export const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, 'Informe data e horário válidos.')
export const intensity = z.number().int().min(0, 'A intensidade vai de 0 a 10.').max(10, 'A intensidade vai de 0 a 10.').nullable()
const text = (max: number) => z.string().max(max, `Máximo de ${max} caracteres.`).nullable()
const FACTORS = TRIGGER_CATEGORIES.flatMap((c) => c.factors)

const base = z.object({
  started_at: localDateTime,
  start_is_approximate: z.boolean(),
  onset_type: z.enum(['sudden', 'gradual']).nullable(),
  started_during_sleep: z.enum(['yes', 'no', 'unknown']).nullable(),
  ended_at: localDateTime.nullable(),
  still_ongoing: z.boolean(),
  improved_spontaneously: z.boolean().nullable(),
  improved_after_medication: z.boolean().nullable(),
  ended_by_sleep: z.boolean().nullable(),
  intensity_initial: intensity,
  intensity_max: intensity,
  intensity_final: intensity,
  locations: z.array(z.enum(values(LOCATIONS))).max(20),
  side: z.enum(['right', 'left', 'bilateral', 'undefined']).nullable(),
  location_other: text(200),
  pain_qualities: z.array(z.enum(values(PAIN_QUALITIES))).max(20),
  quality_other: text(200),
  aggravating: z.array(z.enum(values(AGGRAVATING))).max(20),
  aggravating_other: text(200),
  symptoms: z.array(z.object({
    symptom: z.enum(values(SYMPTOMS)),
    phase: z.enum(['before', 'during', 'after']),
    note: z.string().max(200).optional(),
  })).max(60),
  triggers: z.array(z.object({
    category: z.enum(values(TRIGGER_CATEGORIES)),
    factor: z.enum(values(FACTORS)),
    relation: z.enum(['suspected', 'occurred_before']),
    when: z.string().max(80).optional(),
    confidence: z.number().int().min(1).max(5).optional(),
    note: z.string().max(300).optional(),
  })).max(40),
  functional_impact: z.number().int().min(0).max(3).nullable(),
  notes: text(4000),
})

export type AttackPayload = z.infer<typeof base>

/** Validação do registro de crise. "now" é injetado para permitir testes determinísticos. */
export const makeAttackSchema = (now: string) =>
  base.superRefine((v, ctx) => {
    const issue = (path: keyof AttackPayload, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
    if (v.started_at.slice(0, 16) > now.slice(0, 16)) issue('started_at', 'O início não pode estar no futuro.')
    if (v.ended_at && v.ended_at.slice(0, 16) < v.started_at.slice(0, 16)) issue('ended_at', 'O término não pode ser anterior ao início.')
    if (v.ended_at && v.ended_at.slice(0, 16) > now.slice(0, 16)) issue('ended_at', 'O término não pode estar no futuro.')
    if (v.still_ongoing && v.ended_at) issue('ended_at', 'Uma crise em andamento não pode ter horário de término.')
    for (const k of ['intensity_initial', 'intensity_final'] as const) {
      if (v.intensity_max !== null && v[k] !== null && v[k]! > v.intensity_max) issue('intensity_max', 'A intensidade máxima não pode ser menor que a inicial ou a final.')
    }
    if (v.aggravating.includes('none_known') && v.aggravating.length > 1) issue('aggravating', '"Sem agravamento conhecido" não pode ser combinado com outras opções.')
  })

/** Rascunho do formulário: igual ao registro, com horários como texto de <input> ('' = não informado). */
export type AttackDraft = Omit<AttackPayload, 'ended_at'> & { ended_at: string }

export function emptyDraft(started_at: string): AttackDraft {
  return {
    started_at, start_is_approximate: false, onset_type: null, started_during_sleep: null, ended_at: '', still_ongoing: true,
    improved_spontaneously: null, improved_after_medication: null, ended_by_sleep: null,
    intensity_initial: null, intensity_max: null, intensity_final: null, locations: [], side: null, location_other: null,
    pain_qualities: [], quality_other: null, aggravating: [], aggravating_other: null, symptoms: [], triggers: [],
    functional_impact: null, notes: null,
  }
}

export function draftFromAttack(a: Attack): AttackDraft {
  const d = emptyDraft(a.started_at.slice(0, 16))
  const out = { ...d } as Record<string, unknown>
  for (const k of Object.keys(d)) out[k] = (a as unknown as Record<string, unknown>)[k]
  return { ...(out as AttackDraft), started_at: a.started_at.slice(0, 16), ended_at: a.ended_at?.slice(0, 16) ?? '' }
}

export function draftToPayload(d: AttackDraft): AttackPayload {
  return {
    ...d,
    ended_at: d.ended_at || null,
    location_other: d.locations.includes('other') ? blank(d.location_other) : null,
    quality_other: d.pain_qualities.includes('other') ? blank(d.quality_other) : null,
    aggravating_other: d.aggravating.includes('other') ? blank(d.aggravating_other) : null,
    notes: blank(d.notes),
  }
}

export const assessmentSchema = z.object({
  assessed_at: localDateTime,
  intensity,
  minutes_after_dose: z.number().int().min(0).max(10080).nullable(),
  locations: z.array(z.enum(values(LOCATIONS))).nullable(),
  note: text(1000),
})
