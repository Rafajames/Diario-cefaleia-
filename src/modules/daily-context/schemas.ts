import { z } from 'zod'

const scale = z.number().int().min(1).max(5).nullable()

/** Registro diário: tudo é opcional, exceto a data. */
export const dailyLogSchema = z.object({
  log_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.'),
  pain_free_confirmed: z.boolean(),
  sleep_quality: scale,
  sleep_hours: z.number().min(0, 'Horas de sono entre 0 e 24.').max(24, 'Horas de sono entre 0 e 24.').nullable(),
  hydration_liters: z.number().min(0).max(20, 'Hidratação entre 0 e 20 litros.').nullable(),
  meals: z.string().max(500).nullable(),
  fasting: z.boolean().nullable(),
  caffeine_servings: z.number().int().min(0).max(50).nullable(),
  physical_activity: z.enum(['none', 'light', 'moderate', 'intense']).nullable(),
  stress: scale,
  mood: scale,
  notes: z.string().max(2000).nullable(),
})
export type DailyLogPayload = z.infer<typeof dailyLogSchema>

export const makeDailyLogSchema = (today: string) =>
  dailyLogSchema.refine((v) => v.log_date <= today, { path: ['log_date'], message: 'Não é possível registrar um dia futuro.' })
