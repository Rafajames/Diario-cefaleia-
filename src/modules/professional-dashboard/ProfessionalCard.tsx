import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Card, Field, Input, Spinner } from '@/components/ui'
import { useAction } from '@/hooks/useDraft'
import { useProfile } from '@/modules/authentication/AuthProvider'
import { fetchProfessional, saveProfessional } from './service'

/** Dados profissionais informados pelo próprio profissional (o aplicativo não valida registro em conselho). */
export function ProfessionalCard() {
  const me = useProfile()
  const q = useQuery({ queryKey: ['professional', me.id], queryFn: () => fetchProfessional(me.id) })
  const [v, setV] = useState({ council_type: '', council_number: '', specialty: '' })
  const act = useAction()
  useEffect(() => {
    if (q.data) setV({ council_type: q.data.council_type ?? '', council_number: q.data.council_number ?? '', specialty: q.data.specialty ?? '' })
  }, [q.data])
  if (q.isLoading) return <Spinner />
  return (
    <Card title="Perfil profissional">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Conselho" hint="Ex.: CRM" error={act.fields.council_type}><Input value={v.council_type} maxLength={20} onChange={(e) => setV({ ...v, council_type: e.target.value })} /></Field>
        <Field label="Número do registro" error={act.fields.council_number}><Input value={v.council_number} maxLength={40} onChange={(e) => setV({ ...v, council_number: e.target.value })} /></Field>
        <Field label="Especialidade" error={act.fields.specialty}><Input value={v.specialty} maxLength={120} onChange={(e) => setV({ ...v, specialty: e.target.value })} /></Field>
      </div>
      {act.error && !Object.keys(act.fields).length && <div className="mt-2"><Alert tone="bad">{act.error}</Alert></div>}
      <Button className="mt-3" small disabled={act.busy} onClick={() => act.run(() => saveProfessional(me.id, v))}>Salvar perfil profissional</Button>
      <p className="mt-2 text-xs text-muted">Estas informações são suas e aparecem para os pacientes com quem você tem vínculo. O sistema não confere o registro no conselho.</p>
    </Card>
  )
}
