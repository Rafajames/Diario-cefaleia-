/** Utilidades de CPF e máscaras. A validação definitiva é feita no banco; aqui é só para feedback imediato. */
export const onlyDigits = (s: string) => s.replace(/\D/g, '')

export function isValidCpf(value: string): boolean {
  const d = onlyDigits(value)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const dv = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i)
    const r = (sum * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

export const formatCpf = (s: string) => {
  const d = onlyDigits(s).slice(0, 11)
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}
export const formatCep = (s: string) => onlyDigits(s).slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2')
export const maskCpf = (s: string | null | undefined) => (s && onlyDigits(s).length === 11 ? `***.${onlyDigits(s).slice(3, 6)}.***-${onlyDigits(s).slice(9)}` : '—')

export const isAdult = (birth: string | null | undefined, today: string): boolean => {
  if (!birth) return true // sem data: não presumimos menoridade
  const [y, m, d] = birth.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  const age = ty - y - (tm < m || (tm === m && td < d) ? 1 : 0)
  return age >= 18
}
