import { describe, expect, it } from 'vitest'
import { formatCep, formatCpf, isAdult, isValidCpf, maskCpf, onlyDigits } from '@/modules/registry/cpf'
import { validateRegistry } from '@/modules/registry/service'

describe('CPF', () => {
  it('valida dígitos verificadores e rejeita repetidos e tamanhos errados', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true)
    expect(isValidCpf('52998224725')).toBe(true)
    expect(isValidCpf('52998224724')).toBe(false)
    expect(isValidCpf('11111111111')).toBe(false)
    expect(isValidCpf('123')).toBe(false)
    expect(isValidCpf('')).toBe(false)
  })
  it('formata e mascara sem expor o número completo', () => {
    expect(formatCpf('52998224725')).toBe('529.982.247-25')
    expect(formatCep('69301000')).toBe('69301-000')
    expect(onlyDigits('529.982.247-25')).toBe('52998224725')
    expect(maskCpf('52998224725')).toBe('***.982.***-25')
    expect(maskCpf(null)).toBe('—')
  })
})

describe('maioridade', () => {
  it('considera 18 anos completos e não presume menoridade sem data', () => {
    expect(isAdult('2008-11-15', '2026-11-15')).toBe(true)
    expect(isAdult('2008-11-16', '2026-11-15')).toBe(false)
    expect(isAdult(null, '2026-11-15')).toBe(true)
  })
})

describe('validação do cadastro (rascunho permitido)', () => {
  const today = '2026-11-15'
  it('aceita cadastro vazio ou parcial', () => {
    expect(validateRegistry({}, today)).toEqual([])
    expect(validateRegistry({ full_name: 'Maria', cpf: '', email_primary: '' }, today)).toEqual([])
  })
  it('aponta apenas o que está preenchido e inválido', () => {
    const paths = validateRegistry({ cpf: '123', guardian_cpf: '529.982.247-25', email_primary: 'x', birth_date: '2030-01-01', cep: '123', cns: '1', weight_kg: '900', height_cm: '10' }, today).map((i) => i.path)
    expect(paths.sort()).toEqual(['birth_date', 'cep', 'cns', 'cpf', 'email_primary', 'height_cm', 'weight_kg'].sort())
  })
})
