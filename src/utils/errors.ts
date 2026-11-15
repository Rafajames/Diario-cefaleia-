/** Converte erros técnicos (Supabase/Postgres/rede) em mensagens compreensíveis. */
const BY_CODE: Record<string, string> = {
  '42501': 'Você não tem permissão para realizar esta ação.',
  '23505': 'Já existe um registro com estes dados.',
  '23503': 'Este registro está vinculado a outros dados e não pode ser alterado desta forma.',
  '23514': 'Algum valor informado está fora do intervalo permitido.',
  '22P02': 'Algum valor informado tem formato inválido.',
  PGRST116: 'Registro não encontrado ou sem permissão de acesso.',
  PGRST301: 'Sua sessão expirou. Entre novamente.',
}
const BY_TEXT: [RegExp, string][] = [
  [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/email not confirmed/i, 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.'],
  [/user already registered/i, 'Já existe uma conta com este e-mail.'],
  [/password should be at least/i, 'A senha é muito curta.'],
  [/rate limit|too many requests/i, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'],
  [/failed to fetch|networkerror|load failed/i, 'Sem conexão com o servidor. Verifique sua internet e tente novamente.'],
  [/row-level security/i, 'Você não tem permissão para realizar esta ação. Verifique seus consentimentos no perfil.'],
  [/jwt expired/i, 'Sua sessão expirou. Entre novamente.'],
  [/same password|different from the old/i, 'A nova senha deve ser diferente da anterior.'],
]

export function friendlyError(error: unknown): string {
  const e = (error ?? {}) as { code?: string; message?: string }
  const msg = e.message ?? (typeof error === 'string' ? error : '')
  // Mensagens levantadas pelo próprio banco (RAISE EXCEPTION) já estão em português
  if (e.code === 'P0001' && msg) return msg
  for (const [re, text] of BY_TEXT) if (re.test(msg)) return text
  if (e.code === '42501' && msg && !/permission denied/i.test(msg)) return msg
  if (e.code && BY_CODE[e.code]) return BY_CODE[e.code]
  return msg && /[áéíóúãõç]/i.test(msg) ? msg : 'Não foi possível concluir a operação. Tente novamente.'
}
