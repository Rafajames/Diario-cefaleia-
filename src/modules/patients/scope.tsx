import { createContext, useContext, type ReactNode } from 'react'

/** De qual paciente a tela trata e se é somente leitura (visão de profissional/administrador). */
export interface PatientScope {
  patientId: string
  patientName: string
  readOnly: boolean
  /** O ciclo menstrual só é visível a terceiros com autorização específica do paciente */
  menstruationVisible: boolean
}

const Ctx = createContext<PatientScope | null>(null)

export const PatientScopeProvider = ({ value, children }: { value: PatientScope; children: ReactNode }) => <Ctx.Provider value={value}>{children}</Ctx.Provider>

export function usePatientScope(): PatientScope {
  const v = useContext(Ctx)
  if (!v) throw new Error('usePatientScope deve ser usado dentro de <PatientScopeProvider>.')
  return v
}
