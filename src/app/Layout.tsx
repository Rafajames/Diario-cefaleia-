import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router'
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
    { to: '/perfil', label: 'Perfil', icon: '☺' },
  ],
  professional: [
    { to: '/profissional', label: 'Pacientes', icon: '☰', end: true },
    { to: '/conta', label: 'Minha conta', icon: '☺' },
  ],
  admin: [
    { to: '/admin', label: 'Painel', icon: '◧', end: true },
    { to: '/admin/usuarios', label: 'Usuários', icon: '☰' },
    { to: '/admin/vinculos', label: 'Vínculos', icon: '⇄' },
    { to: '/admin/convites', label: 'Convites', icon: '✉' },
    { to: '/admin/catalogo', label: 'Catálogo', icon: '◍' },
    { to: '/admin/configuracoes', label: 'Parâmetros', icon: '⚙' },
    { to: '/admin/auditoria', label: 'Auditoria', icon: '▤' },
    { to: '/profissional', label: 'Pacientes autorizados', icon: '☷' },
    { to: '/conta', label: 'Minha conta', icon: '☺' },
  ],
}
const ROLE_LABEL = { patient: 'Paciente', professional: 'Profissional de saúde', admin: 'Administrador geral' }

/** Estrutura das telas autenticadas: cabeçalho, navegação lateral (desktop) e inferior (celular). */
export function AppLayout() {
  const me = useProfile()
  const { signOut } = useAuth()
  const items = NAV[me.role]
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
        <nav className="flex-1 space-y-1 p-3">{items.map((i) => link(i, false))}</nav>
        <div className="border-t border-line p-3 text-sm">
          <p className="truncate font-medium">{me.full_name || me.email}</p>
          <p className="text-xs text-muted">{ROLE_LABEL[me.role]}</p>
          <button type="button" className="mt-2 text-brand" onClick={() => signOut()}>Sair</button>
        </div>
      </aside>
      <div className="flex min-h-dvh flex-col">
        <header className="no-print flex items-center justify-between border-b border-line bg-brand px-4 py-3 text-white md:hidden">
          <div><p className="font-bold leading-tight">{INSTITUTION.appName}</p><p className="text-[11px] opacity-90">{INSTITUTION.short} · {ROLE_LABEL[me.role]}</p></div>
          <button type="button" className="rounded-lg border border-white/50 px-2 py-1 text-xs" onClick={() => signOut()}>Sair</button>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 p-4 pb-24 md:p-6 md:pb-6"><Outlet /></main>
        <nav className="no-print fixed inset-x-0 bottom-0 z-20 flex overflow-x-auto border-t border-line bg-card md:hidden" aria-label="Navegação principal">{items.map((i) => link(i, true))}</nav>
      </div>
    </div>
  )
}

const Brand = () => (
  <div className="flex items-center gap-2 border-b border-line p-4">
    <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-9 w-9" />
    <div><p className="font-bold leading-tight text-brand">{INSTITUTION.appName}</p><p className="text-[11px] text-muted">{INSTITUTION.short}</p></div>
  </div>
)

/** Escopo do próprio paciente: leitura e escrita dos seus dados. */
export function OwnPatientScope({ children }: { children: ReactNode }) {
  const me = useProfile()
  return <PatientScopeProvider value={{ patientId: me.id, patientName: me.full_name, readOnly: false, menstruationVisible: true }}>{children}</PatientScopeProvider>
}
