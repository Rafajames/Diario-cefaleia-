import { z } from 'zod'

const text = (max: number) => z.string().max(max, `Máximo de ${max} caracteres.`).nullable()
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.').nullable()

/** Perfil do paciente: quase tudo é opcional. */
export const makePatientSchema = (today: string) =>
  z.object({
    birth_date: date.refine((d) => !d || (d <= today && d >= '1900-01-01'), 'Data de nascimento inválida.'),
    phone: text(40),
    sex_at_birth: z.enum(['female', 'male', 'intersex', 'undisclosed']).nullable(),
    gender: text(80),
    country: text(80),
    city: text(120),
    timezone: z.string().min(1).max(64),
    pain_onset_approx: text(120),
    usual_frequency: text(200),
    reported_diagnosis: text(500),
    clinical_history: text(4000),
    comorbidities: text(2000),
    continuous_medications: text(2000),
  })

export const menstrualProfileSchema = z.object({
  tracks_menstruation: z.boolean(),
  cycle_regularity: z.enum(['regular', 'irregular', 'unknown']).nullable(),
  usual_cycle_days: z.number().int().min(10, 'Entre 10 e 120 dias.').max(120, 'Entre 10 e 120 dias.').nullable(),
  usual_bleeding_days: z.number().int().min(1, 'Entre 1 e 30 dias.').max(30, 'Entre 1 e 30 dias.').nullable(),
  next_period_expected: date,
  hormonal_contraceptive: text(300),
  menstrual_notes: text(2000),
})

export const makeCycleSchema = (today: string) =>
  z.object({
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe o primeiro dia do sangramento.'),
    end_date: date,
    flow: z.enum(['light', 'moderate', 'heavy']).nullable(),
    notes: text(1000),
  }).superRefine((v, ctx) => {
    if (v.start_date > today) ctx.addIssue({ code: 'custom', path: ['start_date'], message: 'O início não pode estar no futuro.' })
    if (v.end_date && v.end_date < v.start_date) ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'O último dia não pode ser anterior ao primeiro.' })
    if (v.end_date && v.end_date > today) ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'O último dia não pode estar no futuro.' })
  })
