import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { Alert, Button, Spinner } from '@/components/ui'
import { friendlyError } from '@/utils/errors'
import { useAuth } from './AuthProvider'
import { gateFor, homeFor, type Area } from './access'
import { AuthShell } from './pages'

/** Protege uma área por perfil. A segurança real está na RLS; aqui evitamos telas que só dariam erro. */
export function RequireArea({ area, children }: { area: Area; children: ReactNode }) {
  const { loading, session, profile, consents, error, signOut, refresh } = useAuth()
  const loc = useLocation()
  if (loading) return <Spinner />
  if (session && !profile) {
    return (
      <AuthShell title="Não foi possível carregar sua conta">
        <div className="space-y-3">
          <Alert tone="bad">{friendlyError(error)}</Alert>
          <div className="flex gap-2"><Button onClick={() => refresh()}>Tentar novamente</Button><Button variant="ghost" onClick={() => signOut()}>Sair</Button></div>
        </div>
      </AuthShell>
    )
  }
  const gate = gateFor(profile, consents, area)
  if (gate === 'login') return <Navigate to="/entrar" replace state={{ from: loc.pathname }} />
  if (gate === 'consents') return <Navigate to="/consentimentos" replace />
  if (gate === 'forbidden') return <Navigate to={homeFor(profile!.role)} replace />
  if (gate === 'suspended') {
    return (
      <AuthShell title="Conta suspensa">
        <div className="space-y-3">
          <Alert tone="warn">Sua conta está suspensa. Entre em contato com a CENDOR para mais informações.</Alert>
          <Button variant="secondary" onClick={() => signOut()}>Sair</Button>
        </div>
      </AuthShell>
    )
  }
  return <>{children}</>
}
