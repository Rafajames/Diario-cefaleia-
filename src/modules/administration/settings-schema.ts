import { z } from 'zod'

const CLASSES = ['analgesic', 'nsaid', 'triptan', 'ergot', 'opioid', 'antiemetic', 'combination', 'preventive', 'other'] as const
const version = z.string().regex(/^\d+(\.\d+){0,2}$/, 'Use o formato 1.0')

/** Validação de cada parâmetro configurável (app_settings). Impede salvar regras clínicas malformadas. */
export const SETTING_SCHEMAS: Record<string, z.ZodType> = {
  public_signup_enabled: z.boolean(),
  consent_versions: z.object({ personal_data: version, health_data: version, professional_sharing: version, research: version }).strict(),
  post_dose_intervals_min: z.array(z.number().int().min(5).max(1440)).min(1).max(8),
  severity_bands: z.object({ mild_max: z.number().int().min(1).max(8), moderate_max: z.number().int().min(2).max(9) }).strict()
    .refine((v) => v.mild_max < v.moderate_max, 'mild_max deve ser menor que moderate_max.'),
  menstrual_window: z.object({ days_before: z.number().int().min(0).max(7), days_after: z.number().int().min(0).max(10), min_cycles: z.number().int().min(2).max(6), min_positive: z.number().int().min(1).max(6) }).strict()
    .refine((v) => v.min_positive <= v.min_cycles, 'min_positive não pode ser maior que min_cycles.'),
  evolution_rules: z.object({ relative_threshold: z.number().min(0.05).max(1), min_attacks: z.number().int().min(1).max(20), min_coverage: z.number().min(0).max(1) }).strict(),
  overuse_flags: z.object({
    enabled: z.boolean(),
    reviewed_by: z.string().max(200).nullable(),
    rules: z.array(z.object({ classes: z.array(z.enum(CLASSES)).min(1), days_per_30: z.number().int().min(1).max(30) }).strict()).max(10),
  }).strict().refine((v) => !v.enabled || !!v.reviewed_by?.trim(), 'Para ativar a sinalização, informe em "reviewed_by" o responsável médico que revisou os critérios.'),
  retention: z.object({ audit_log_months: z.number().int().min(1).max(600), access_log_months: z.number().int().min(1).max(600) }).strict(),
}

export function parseSetting(key: string, json: string): { ok: true; value: unknown } | { ok: false; error: string } {
  let raw: unknown
  try { raw = JSON.parse(json) } catch { return { ok: false, error: 'JSON inválido. Verifique vírgulas, aspas e chaves.' } }
  const schema = SETTING_SCHEMAS[key]
  if (!schema) return { ok: false, error: 'Parâmetro desconhecido.' }
  const r = schema.safeParse(raw)
  return r.success ? { ok: true, value: r.data } : { ok: false, error: r.error.issues.map((i) => `${i.path.join('.') || 'valor'}: ${i.message}`).join(' · ') }
}
