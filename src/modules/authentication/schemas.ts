import { z } from 'zod'

const email = z.string().trim().toLowerCase().pipe(z.email('Informe um e-mail válido.'))
export const password = z
  .string()
  .min(10, 'A senha deve ter pelo menos 10 caracteres.')
  .max(72, 'A senha deve ter no máximo 72 caracteres.')
  .regex(/[a-zA-Z]/, 'A senha deve conter ao menos uma letra.')
  .regex(/\d/, 'A senha deve conter ao menos um número.')

export const loginSchema = z.object({ email, password: z.string().min(1, 'Informe a senha.') })

export const signupSchema = z
  .object({
    full_name: z.string().trim().min(3, 'Informe seu nome completo.').max(200),
    email,
    password,
    confirm: z.string(),
    personal_data: z.boolean().refine((v) => v, 'Este consentimento é necessário para criar a conta.'),
    health_data: z.boolean().refine((v) => v, 'Este consentimento é necessário para usar o diário.'),
    professional_sharing: z.boolean(),
    research: z.boolean(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'As senhas não conferem.' })

export const forgotSchema = z.object({ email })

export const resetSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'As senhas não conferem.' })

export type LoginValues = z.infer<typeof loginSchema>
export type SignupValues = z.infer<typeof signupSchema>
