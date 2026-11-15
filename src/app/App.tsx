import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Alert, Card, PageTitle, Spinner } from '@/components/ui'
import { INSTITUTION, isConfigured } from '@/config/env'
import { AuthProvider, useAuth } from '@/modules/authentication/AuthProvider'
import { homeFor, type Area } from '@/modules/authentication/access'
import { RequireArea } from '@/modules/authentication/guards'
import { ConsentGatePage, ForgotPasswordPage, LoginPage, ResetPasswordPage, SignupPage } from '@/modules/authentication/pages'
import { CalendarView } from '@/modules/calendar/CalendarView'
import { AttackPage, AttacksPage, NewAttackPage } from '@/modules/headache-attacks/pages'
import { MedicationsPage } from '@/modules/medications/MedicationsPage'
import { CyclePage } from '@/modules/menstruation/CyclePage'
import { HomePage } from '@/modules/patients/HomePage'
import { ProfilePage } from '@/modules/patients/ProfilePage'
import { AppLayout, OwnPatientScope } from './Layout'

// Telas pesadas (gráficos, PDF, painéis) são carregadas sob demanda
const EvolutionPage = lazy(() => import('@/modules/clinical-evolution/EvolutionPage').then((m) => ({ default: m.EvolutionPage })))
const ReportPanel = lazy(() => import('@/modules/reports/ReportPanel').then((m) => ({ default: m.ReportPanel })))
const pro = () => import('@/modules/professional-dashboard/pages')
const ProfessionalDashboardPage = lazy(() => pro().then((m) => ({ default: m.ProfessionalDashboardPage })))
const PatientRecordPage = lazy(() => pro().then((m) => ({ default: m.PatientRecordPage })))
const adm = () => import('@/modules/administration/pages')
const AdminDashboardPage = lazy(() => adm().then((m) => ({ default: m.AdminDashboardPage })))
const AdminUsersPage = lazy(() => adm().then((m) => ({ default: m.AdminUsersPage })))
const AdminLinksPage = lazy(() => adm().then((m) => ({ default: m.AdminLinksPage })))
const AdminInvitesPage = lazy(() => adm().then((m) => ({ default: m.AdminInvitesPage })))
const AdminSettingsPage = lazy(() => adm().then((m) => ({ default: m.AdminSettingsPage })))
const AdminAuditPage = lazy(() => adm().then((m) => ({ default: m.AdminAuditPage })))
const AdminCatalogPage = lazy(() => adm().then((m) => ({ default: m.AdminCatalogPage })))

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
})

const area = (a: Area, children: ReactNode) => <RequireArea area={a}>{children}</RequireArea>

function Home() {
  const { profile } = useAuth()
  if (profile && profile.role !== 'patient') return <Navigate to={homeFor(profile.role)} replace />
  return <OwnPatientScope><HomePage /></OwnPatientScope>
}

/** Qualquer usuário autenticado (a conta em si não pertence a uma área específica). */
function RequireAny({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <Spinner />
  return <RequireArea area={profile?.role === 'admin' ? 'admin' : profile?.role === 'professional' ? 'professional' : 'patient'}>{children}</RequireArea>
}

function AppRoutes() {
  const patient = (el: ReactNode) => area('patient', <OwnPatientScope>{el}</OwnPatientScope>)
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/entrar" element={<LoginPage />} />
        <Route path="/cadastro" element={<SignupPage />} />
        <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
        <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
        <Route path="/consentimentos" element={<ConsentGatePage />} />
        <Route element={<RequireAny><AppLayout /></RequireAny>}>
          <Route path="/" element={<Home />} />
          <Route path="/calendario" element={patient(<><PageTitle>Calendário</PageTitle><CalendarView /></>)} />
          <Route path="/crises" element={patient(<AttacksPage />)} />
          <Route path="/crises/nova" element={patient(<NewAttackPage />)} />
          <Route path="/crises/:id" element={patient(<AttackPage />)} />
          <Route path="/medicamentos" element={patient(<MedicationsPage />)} />
          <Route path="/ciclo" element={patient(<CyclePage />)} />
          <Route path="/evolucao" element={patient(<EvolutionPage />)} />
          <Route path="/relatorios" element={patient(<><PageTitle>Relatórios</PageTitle><ReportPanel /></>)} />
          <Route path="/perfil" element={patient(<ProfilePage />)} />
          <Route path="/conta" element={<ProfilePage />} />
          <Route path="/profissional" element={area('professional', <ProfessionalDashboardPage />)} />
          <Route path="/profissional/pacientes/:id" element={area('professional', <PatientRecordPage />)} />
          <Route path="/admin" element={area('admin', <AdminDashboardPage />)} />
          <Route path="/admin/usuarios" element={area('admin', <AdminUsersPage />)} />
          <Route path="/admin/vinculos" element={area('admin', <AdminLinksPage />)} />
          <Route path="/admin/convites" element={area('admin', <AdminInvitesPage />)} />
          <Route path="/admin/configuracoes" element={area('admin', <AdminSettingsPage />)} />
          <Route path="/admin/auditoria" element={area('admin', <AdminAuditPage />)} />
          <Route path="/admin/catalogo" element={area('admin', <AdminCatalogPage />)} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

function SetupPending() {
  return (
    <main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-2xl font-bold text-brand">{INSTITUTION.appName}</h1>
      <Card title="Configuração pendente">
        <div className="space-y-3 text-sm">
          <Alert tone="warn">A conexão com o banco de dados (Supabase) ainda não foi configurada neste ambiente.</Alert>
          <p>Defina as variáveis <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (arquivo <code>.env</code> local ou variáveis do provedor de hospedagem) e aplique as migrations de <code>supabase/migrations</code>.</p>
          <p className="text-muted">Passo a passo em <code>docs/DEPLOYMENT.md</code>.</p>
        </div>
      </Card>
    </main>
  )
}

export function App() {
  if (!isConfigured) return <SetupPending />
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
