import type { ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { cx } from '@/components/ui'
import { INSTITUTION } from '@/config/env'
import { useAuth, useProfile } from '@/modules/authentication/AuthProvider'
import { PatientScopeProvider } from '@/modules/patients/scope'

interface NavItem { to: string; label: string; icon: string; end?: boolean }

const NAV: Record<string, NavItem[]> = {
  patient: [
    { to: '/', label: 'Hoje', icon: '●', end: true },
    { to: '/calendario', label: 'Calendário', icon: '▦' },
    { to: '/crises', label: 'Crises', icon: '✚' },
    { to: '/medicamentos', label: 'Medicamentos', icon: '◍' },
    { to: '/ciclo', label: 'Ciclo', icon: '◔' },
    { to: '/evolucao', label: 'Evolução', icon: '↗' },
    { to: '/relatorios', label: 'Relatórios', icon: '▤' },
    { to: '/cadastro', label: 'Cadastro', icon: '▣' },
    { to: '/perfil', label: 'Perfil', icon: '☺' },
  ],
  professional: [
    { to: '/profissional', label: 'Pacientes', icon: '☰', end: true },
    { to: '/conta', label: 'Minha conta', icon: '☺' },
  ],
  admin: [
    { to: '/admin', label: 'Painel', icon: '◧', end: true },
    { to: '/admin/cadastros', label: 'Cadastros', icon: '▣' },
    { to: '/admin/usuarios', label: 'Usuários', icon: '☰' },
    { to: '/admin/vinculos', label: 'Vínculos', icon: '⇄' },
    { to: '/admin/convites', label: 'Convites', icon: '✉' },
    { to: '/admin/catalogo', label: 'Catálogo', icon: '◍' },
    { to: '/admin/configuracoes', label: 'Parâmetros', icon: '⚙' },
    { to: '/admin/auditoria', label: 'Auditoria', icon: '▤' },
    { to: '/conta', label: 'Minha conta', icon: '☺' },
  ],
}
const MODE_KEY = 'diario.perfil'
const readMode = () => { try { return localStorage.getItem(MODE_KEY) } catch { return null } }
const saveMode = (m: string) => { try { localStorage.setItem(MODE_KEY, m) } catch { /* preferência opcional */ } }
const ROLE_LABEL = { patient: 'Paciente', professional: 'Profissional de saúde', admin: 'Administrador geral' }

/** Estrutura das telas autenticadas: cabeçalho, navegação lateral (desktop) e inferior (celular). */
export function AppLayout() {
  const me = useProfile()
  const { signOut } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()
  // Administrador habilitado para atuação clínica pode alternar entre os dois perfis
  const dual = me.role === 'admin' && me.clinical_enabled
  const asDoctor = dual && (loc.pathname.startsWith('/profissional') || (!loc.pathname.startsWith('/admin') && readMode() === 'professional'))
  const items = asDoctor ? NAV.professional : NAV[me.role]
  const switchTo = (mode: 'admin' | 'professional') => { saveMode(mode); nav(mode === 'admin' ? '/admin' : '/profissional') }
  const switcher = dual ? (
    <div role="group" aria-label="Trocar de perfil" className="flex gap-1 rounded-lg border border-line p-0.5 text-xs">
      {(['admin', 'professional'] as const).map((m) => (
        <button key={m} type="button" aria-pressed={(m === 'professional') === asDoctor}
          className={cx('flex-1 rounded-md px-2 py-1', (m === 'professional') === asDoctor ? 'bg-brand text-white' : 'text-brand')}
          onClick={() => switchTo(m)}>{m === 'admin' ? 'Administrador' : 'Médico'}</button>
      ))}
    </div>
  ) : null
  const link = (i: NavItem, mobile: boolean) => (
    <NavLink key={i.to} to={i.to} end={i.end}
      className={({ isActive }) => cx(mobile ? 'flex min-w-16 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px]' : 'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
        isActive ? (mobile ? 'font-semibold text-brand' : 'bg-brand-soft font-semibold text-brand') : 'text-muted hover:text-ink')}>
      <span aria-hidden className={mobile ? 'text-base leading-none' : 'w-5 text-center'}>{i.icon}</span>{i.label}
    </NavLink>
  )
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[230px_1fr]">
      <aside className="no-print hidden border-r border-line bg-card md:flex md:flex-col">
        <Brand />
        {switcher && <div className="border-b border-line p-3">{switcher}</div>}
        <nav className="flex-1 space-y-1 p-3">{items.map((i) => link(i, false))}</nav>
        <div className="border-t border-line p-3 text-sm">
          <p className="truncate font-medium">{me.full_name || me.email}</p>
          <p className="text-xs text-muted">{dual ? (asDoctor ? ROLE_LABEL.professional : ROLE_LABEL.admin) : ROLE_LABEL[me.role]}</p>
          <button type="button" className="mt-2 text-brand" onClick={() => signOut()}>Sair</button>
        </div>
      </aside>
      <div className="flex min-h-dvh flex-col">
        <header className="no-print flex items-center justify-between border-b border-line bg-brand px-4 py-3 text-white md:hidden">
          <div className="flex items-center gap-2"><img src={`${import.meta.env.BASE_URL}logo-escuro.png`} alt="" className="h-9 w-9 rounded-lg" /><div><p className="font-bold leading-tight">{INSTITUTION.appName}</p><p className="text-[11px] opacity-90">{INSTITUTION.short} · {dual ? (asDoctor ? ROLE_LABEL.professional : ROLE_LABEL.admin) : ROLE_LABEL[me.role]}</p></div></div>
          <button type="button" className="rounded-lg border border-white/50 px-2 py-1 text-xs" onClick={() => signOut()}>Sair</button>
        </header>
        {switcher && <div className="no-print border-b border-line bg-card p-2 md:hidden">{switcher}</div>}
        <main className="mx-auto w-full max-w-5xl flex-1 p-4 pb-24 md:p-6 md:pb-6"><Outlet /></main>
        <nav className="no-print fixed inset-x-0 bottom-0 z-20 flex overflow-x-auto border-t border-line bg-card md:hidden" aria-label="Navegação principal">{items.map((i) => link(i, true))}</nav>
      </div>
    </div>
  )
}

const Brand = () => (
  <div className="flex items-center gap-2 border-b border-line p-4">
    <img src={`${import.meta.env.BASE_URL}logo-claro.png`} alt="Diário da Cefaleia" className="h-9 w-9" />
    <div><p className="font-bold leading-tight text-brand">{INSTITUTION.appName}</p><p className="text-[11px] text-muted">{INSTITUTION.short}</p></div>
  </div>
)

/** Escopo do próprio paciente: leitura e escrita dos seus dados. */
export function OwnPatientScope({ children }: { children: ReactNode }) {
  const me = useProfile()
  return <PatientScopeProvider value={{ patientId: me.id, patientName: me.full_name, readOnly: false, menstruationVisible: true }}>{children}</PatientScopeProvider>
}
