import { describe, expect, it } from 'vitest'
import { canAccessArea, gateFor, homeFor, missingConsents } from '@/modules/authentication/access'
import { loginSchema, signupSchema } from '@/modules/authentication/schemas'
import { friendlyError } from '@/utils/errors'

const ok = { personal_data: true, health_data: true }

describe('permissões por perfil', () => {
  it('cada perfil só entra na própria área', () => {
    expect(canAccessArea('patient', 'patient')).toBe(true)
    expect(canAccessArea('patient', 'professional')).toBe(false)
    expect(canAccessArea('patient', 'admin')).toBe(false)
    expect(canAccessArea('professional', 'admin')).toBe(false)
    expect(canAccessArea('professional', 'patient')).toBe(false)
    expect(canAccessArea('admin', 'admin')).toBe(true)
    expect(canAccessArea(null, 'patient')).toBe(false)
  })
  it('define a tela inicial de cada perfil', () => {
    expect([homeFor('patient'), homeFor('professional'), homeFor('admin')]).toEqual(['/', '/profissional', '/admin'])
  })
  it('usuário comum não acessa a administração; sem login vai para a entrada', () => {
    expect(gateFor({ role: 'patient', status: 'active' }, ok, 'admin')).toBe('forbidden')
    expect(gateFor({ role: 'professional', status: 'active' }, { personal_data: true }, 'admin')).toBe('forbidden')
    expect(gateFor(null, {}, 'patient')).toBe('login')
    expect(gateFor({ role: 'admin', status: 'active' }, { personal_data: true }, 'admin')).toBe('ok')
  })
  it('conta suspensa é bloqueada antes de qualquer tela', () => {
    expect(gateFor({ role: 'patient', status: 'suspended' }, ok, 'patient')).toBe('suspended')
  })
  it('consentimentos obrigatórios bloqueiam o uso; o de pesquisa nunca é obrigatório', () => {
    expect(gateFor({ role: 'patient', status: 'active' }, { personal_data: true }, 'patient')).toBe('consents')
    expect(missingConsents('patient', {})).toEqual(['personal_data', 'health_data'])
    expect(missingConsents('patient', { ...ok, research: false, professional_sharing: false })).toEqual([])
    expect(gateFor({ role: 'patient', status: 'active' }, ok, 'patient')).toBe('ok')
  })
})

describe('validação de cadastro e login', () => {
  const base = { full_name: 'Maria Teste', email: ' Maria@Exemplo.com ', password: 'senha-segura-1', confirm: 'senha-segura-1', personal_data: true, health_data: true, professional_sharing: false, research: false }
  it('aceita cadastro válido e normaliza o e-mail', () => {
    const r = signupSchema.safeParse(base)
    expect(r.success).toBe(true)
    expect(r.data?.email).toBe('maria@exemplo.com')
  })
  it('o cadastro não possui campo de perfil/função', () => {
    const r = signupSchema.safeParse({ ...base, role: 'admin' })
    expect(r.success && 'role' in r.data).toBe(false)
  })
  it('rejeita senha fraca, senhas diferentes e falta de consentimento obrigatório', () => {
    const msgs = (v: object) => signupSchema.safeParse({ ...base, ...v }).error?.issues.map((i) => i.path[0]) ?? []
    expect(msgs({ password: 'curta1', confirm: 'curta1' })).toContain('password')
    expect(msgs({ password: 'somenteletrasaqui', confirm: 'somenteletrasaqui' })).toContain('password')
    expect(msgs({ confirm: 'outra-senha-1' })).toContain('confirm')
    expect(msgs({ health_data: false })).toContain('health_data')
    expect(msgs({ research: false })).toEqual([])
    expect(msgs({ email: 'invalido' })).toContain('email')
  })
  it('login exige e-mail válido e senha', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true)
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false)
  })
})

describe('mensagens de erro compreensíveis', () => {
  it('traduz erros técnicos', () => {
    expect(friendlyError({ message: 'Invalid login credentials' })).toBe('E-mail ou senha incorretos.')
    expect(friendlyError({ code: '42501', message: 'permission denied for table x' })).toMatch(/permissão/)
    expect(friendlyError({ code: 'P0001', message: 'Cadastro público desativado. Solicite um convite à CENDOR.' })).toMatch(/convite/)
    expect(friendlyError(new TypeError('Failed to fetch'))).toMatch(/conexão/)
    expect(friendlyError({ message: 'something obscure' })).toBe('Não foi possível concluir a operação. Tente novamente.')
  })
})
