import { useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Card, Checkbox, Field, Input, Spinner } from '@/components/ui'
import { INSTITUTION } from '@/config/env'
import { CONSENT_ORDER, CONSENT_TEXT } from '@/config/consents'
import { friendlyError } from '@/utils/errors'
import type { ConsentType } from '@/types/database'
import { useAuth } from './AuthProvider'
import { homeFor, missingConsents } from './access'
import { forgotSchema, loginSchema, resetSchema, signupSchema, type LoginValues, type SignupValues } from './schemas'
import { fetchPublicConfig, recordConsents, requestPasswordReset, signIn, signUp, updatePassword } from './service'

export function AuthShell({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <header className="text-center">
        <img src={`${import.meta.env.BASE_URL}logo-claro.png`} alt="Diário da Cefaleia" className="mx-auto mb-2 h-14 w-14" />
        <p className="text-2xl font-bold text-brand">{INSTITUTION.appName}</p>
        <p className="text-xs text-muted">{INSTITUTION.full}</p>
      </header>
      <Card title={title}>{children}</Card>
      {footer && <div className="text-center text-sm text-muted">{footer}</div>}
    </main>
  )
}

function useSubmit<T>(fn: (v: T) => Promise<void>) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (v: T) => {
    setError(''); setBusy(true)
    try { await fn(v) } catch (e) { setError(friendlyError(e)) } finally { setBusy(false) }
  }
  return { run, error, busy }
}

export function LoginPage() {
  const { profile } = useAuth()
  const f = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })
  const s = useSubmit<LoginValues>((v) => signIn(v.email, v.password))
  if (profile) return <Navigate to={homeFor(profile.role)} replace />
  return (
    <AuthShell title="Entrar" footer={<>Ainda não tem conta? <Link className="font-medium text-brand" to="/cadastro">Criar conta</Link></>}>
      <form className="space-y-3" onSubmit={f.handleSubmit(s.run)} noValidate>
        <Field label="E-mail" error={f.formState.errors.email?.message}><Input type="email" autoComplete="email" {...f.register('email')} /></Field>
        <Field label="Senha" error={f.formState.errors.password?.message}><Input type="password" autoComplete="current-password" {...f.register('password')} /></Field>
        {s.error && <Alert tone="bad">{s.error}</Alert>}
        <Button type="submit" className="w-full" disabled={s.busy}>{s.busy ? 'Entrando…' : 'Entrar'}</Button>
        <p className="text-center text-sm"><Link className="text-brand" to="/recuperar-senha">Esqueci minha senha</Link></p>
      </form>
    </AuthShell>
  )
}

export function SignupPage() {
  const { profile } = useAuth()
  const [done, setDone] = useState<'confirm' | null>(null)
  const cfg = useQuery({ queryKey: ['public-config'], queryFn: fetchPublicConfig })
  const f = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { personal_data: false, health_data: false, professional_sharing: false, research: false },
  })
  const s = useSubmit<SignupValues>(async (v) => {
    const consents = CONSENT_ORDER.filter((c) => v[c])
    const r = await signUp({ email: v.email, password: v.password, full_name: v.full_name, consents })
    if (r.needsEmailConfirmation) setDone('confirm')
  })
  if (profile) return <Navigate to={homeFor(profile.role)} replace />
  if (done) {
    return (
      <AuthShell title="Confirme seu e-mail" footer={<Link className="font-medium text-brand" to="/entrar">Voltar para o login</Link>}>
        <Alert tone="good">Enviamos um link de confirmação para o seu e-mail. Abra o link para ativar a conta e depois entre com sua senha.</Alert>
      </AuthShell>
    )
  }
  const e = f.formState.errors
  const w = f.watch()
  return (
    <AuthShell title="Criar conta" footer={<>Já tem conta? <Link className="font-medium text-brand" to="/entrar">Entrar</Link></>}>
      {cfg.isLoading ? <Spinner /> : (
        <form className="space-y-3" onSubmit={f.handleSubmit(s.run)} noValidate>
          {cfg.data && !cfg.data.public_signup_enabled && (
            <Alert tone="warn">O cadastro está disponível apenas para pessoas convidadas pela {INSTITUTION.short}. Use o mesmo e-mail em que recebeu o convite.</Alert>
          )}
          <Field label="Nome completo" error={e.full_name?.message}><Input autoComplete="name" {...f.register('full_name')} /></Field>
          <Field label="E-mail" error={e.email?.message}><Input type="email" autoComplete="email" {...f.register('email')} /></Field>
          <Field label="Senha" hint="Mínimo de 10 caracteres, com letra e número." error={e.password?.message}><Input type="password" autoComplete="new-password" {...f.register('password')} /></Field>
          <Field label="Confirmar senha" error={e.confirm?.message}><Input type="password" autoComplete="new-password" {...f.register('confirm')} /></Field>
          <fieldset className="space-y-3 rounded-lg bg-surface p-3">
            <legend className="px-1 text-sm font-semibold">Consentimentos</legend>
            {CONSENT_ORDER.map((c) => (
              <div key={c}>
                <Checkbox checked={!!w[c]} onChange={(v) => f.setValue(c, v, { shouldValidate: f.formState.isSubmitted })}
                  label={<><strong>{CONSENT_TEXT[c].title}{CONSENT_TEXT[c].required ? ' *' : ''}</strong><br /><span className="text-muted">{CONSENT_TEXT[c].summary}</span></>} />
                {e[c]?.message && <p role="alert" className="mt-1 text-xs text-danger">{e[c]?.message}</p>}
              </div>
            ))}
            <p className="text-xs text-muted">* Necessários para usar o diário. Os demais são opcionais e podem ser alterados depois no seu perfil.</p>
          </fieldset>
          {s.error && <Alert tone="bad">{s.error}</Alert>}
          <Button type="submit" className="w-full" disabled={s.busy}>{s.busy ? 'Criando…' : 'Criar conta'}</Button>
        </form>
      )}
    </AuthShell>
  )
}

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const f = useForm<{ email: string }>({ resolver: zodResolver(forgotSchema) })
  const s = useSubmit<{ email: string }>(async (v) => { await requestPasswordReset(v.email); setSent(true) })
  return (
    <AuthShell title="Recuperar senha" footer={<Link className="font-medium text-brand" to="/entrar">Voltar para o login</Link>}>
      {sent ? <Alert tone="good">Se existir uma conta com este e-mail, você receberá um link para criar uma nova senha.</Alert> : (
        <form className="space-y-3" onSubmit={f.handleSubmit(s.run)} noValidate>
          <Field label="E-mail da conta" error={f.formState.errors.email?.message}><Input type="email" autoComplete="email" {...f.register('email')} /></Field>
          {s.error && <Alert tone="bad">{s.error}</Alert>}
          <Button type="submit" className="w-full" disabled={s.busy}>Enviar link</Button>
        </form>
      )}
    </AuthShell>
  )
}

export function ResetPasswordPage() {
  const { session, loading, signOut } = useAuth()
  const nav = useNavigate()
  const f = useForm<{ password: string; confirm: string }>({ resolver: zodResolver(resetSchema) })
  const s = useSubmit<{ password: string }>(async (v) => {
    await updatePassword(v.password)
    await signOut(true) // encerra todas as sessões: a senha antiga pode ter sido comprometida
    nav('/entrar', { replace: true })
  })
  if (loading) return <Spinner />
  return (
    <AuthShell title="Criar nova senha" footer={<Link className="font-medium text-brand" to="/entrar">Voltar para o login</Link>}>
      {!session ? <Alert tone="warn">Link inválido ou expirado. Solicite um novo link de recuperação.</Alert> : (
        <form className="space-y-3" onSubmit={f.handleSubmit(s.run)} noValidate>
          <Field label="Nova senha" hint="Mínimo de 10 caracteres, com letra e número." error={f.formState.errors.password?.message}><Input type="password" autoComplete="new-password" {...f.register('password')} /></Field>
          <Field label="Confirmar nova senha" error={f.formState.errors.confirm?.message}><Input type="password" autoComplete="new-password" {...f.register('confirm')} /></Field>
          {s.error && <Alert tone="bad">{s.error}</Alert>}
          <Button type="submit" className="w-full" disabled={s.busy}>Salvar nova senha</Button>
        </form>
      )}
    </AuthShell>
  )
}

/** Exigida quando faltam consentimentos obrigatórios (ex.: convidado, ou nova versão dos termos). */
export function ConsentGatePage() {
  const { profile, consents, refresh, signOut } = useAuth()
  const cfg = useQuery({ queryKey: ['public-config'], queryFn: fetchPublicConfig })
  const [choice, setChoice] = useState<Partial<Record<ConsentType, boolean>>>({})
  const s = useSubmit<void>(async () => {
    if (!profile || !cfg.data) return
    await recordConsents(profile.id, choice, cfg.data.consent_versions)
    await refresh()
  })
  if (!profile) return <Navigate to="/entrar" replace />
  const missing = missingConsents(profile.role, consents)
  if (!missing.length) return <Navigate to={homeFor(profile.role)} replace />
  const list = profile.role === 'patient' ? CONSENT_ORDER.filter((c) => !consents[c]) : missing
  const ready = missing.every((c) => choice[c])
  return (
    <AuthShell title="Consentimentos" footer={<button className="text-brand" onClick={() => signOut()}>Sair</button>}>
      <div className="space-y-3">
        <p className="text-sm text-muted">Para continuar, precisamos do seu consentimento. Os itens marcados com * são necessários.</p>
        {list.map((c) => (
          <Checkbox key={c} checked={!!choice[c]} onChange={(v) => setChoice((p) => ({ ...p, [c]: v }))}
            label={<><strong>{CONSENT_TEXT[c].title}{missing.includes(c) ? ' *' : ''}</strong><br /><span className="text-muted">{CONSENT_TEXT[c].summary}</span></>} />
        ))}
        {s.error && <Alert tone="bad">{s.error}</Alert>}
        <Button className="w-full" disabled={!ready || s.busy || !cfg.data} onClick={() => s.run()}>Confirmar e continuar</Button>
      </div>
    </AuthShell>
  )
}
