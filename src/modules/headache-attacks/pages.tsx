import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Card, Chips, Empty, Field, Input, IntensityInput, Modal, PageTitle, Spinner } from '@/components/ui'
import { LOCATIONS, labelOf } from '@/config/clinical-options'
import { useAction } from '@/hooks/useDraft'
import { blank } from '@/services/crud'
import type { Attack } from '@/types/database'
import { fmtDateTime, fmtInstant, nowLocal, todayLocal } from '@/utils/datetime'
import { friendlyError } from '@/utils/errors'
import { usePatientScope } from '@/modules/patients/scope'
import { AdministrationPanel } from '@/modules/treatment-response/AdministrationPanel'
import { AttackForm } from './AttackForm'
import { AttackList } from './AttackList'
import { draftFromAttack, emptyDraft } from './schemas'
import { createAttack, deleteAssessment, deleteAttack, fetchAssessments, fetchAttack, fetchAttacks, saveAssessment, updateAttack } from './service'

export function AttacksPage() {
  const { patientId } = usePatientScope()
  const q = useQuery({ queryKey: ['attacks', patientId], queryFn: () => fetchAttacks(patientId) })
  return (
    <>
      <PageTitle action={<Link to="/crises/nova"><Button>+ Registrar crise</Button></Link>}>Minhas crises</PageTitle>
      {q.isLoading ? <Spinner /> : q.error ? <Alert tone="bad">{friendlyError(q.error)}</Alert> : <AttackList attacks={q.data ?? []} linkBase="/crises" />}
    </>
  )
}

export function NewAttackPage() {
  const { patientId } = usePatientScope()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const day = params.get('data')
  // Dia anterior escolhido no calendário: começa sem horário presumido (meio-dia como ponto de partida editável)
  const start = day && day < todayLocal() ? `${day}T12:00` : nowLocal()
  const initial = { ...emptyDraft(start), still_ongoing: !(day && day < todayLocal()), start_is_approximate: !!(day && day < todayLocal()) }
  return (
    <>
      <PageTitle>Registrar crise</PageTitle>
      <p className="mb-3 text-sm text-muted">Só o início é obrigatório. Preencha o que souber agora e complete depois — medicamentos e novas avaliações são adicionados após salvar.</p>
      <AttackForm initial={initial} submitLabel="Salvar crise" onSubmit={async (p) => {
        const a = await createAttack(patientId, p)
        await qc.invalidateQueries()
        nav(`/crises/${a.id}`, { replace: true })
      }} />
    </>
  )
}

export function AttackPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['attack', id], queryFn: () => fetchAttack(id) })
  const assessments = useQuery({ queryKey: ['assessments', id], queryFn: () => fetchAssessments(id) })
  const [saved, setSaved] = useState(false)
  const act = useAction()
  if (q.isLoading) return <Spinner />
  if (q.error || !q.data) return <Alert tone="bad">{friendlyError(q.error)}</Alert>
  const attack = q.data
  return (
    <div className="space-y-4">
      <PageTitle action={<Link to="/calendario" className="text-sm text-brand">← Calendário</Link>}>Crise de {fmtDateTime(attack.started_at)}</PageTitle>
      <p className="text-xs text-muted">Registro feito em {fmtInstant(attack.recorded_at)} · última alteração em {fmtInstant(attack.updated_at)}</p>
      {saved && <Alert tone="good">Alterações salvas.</Alert>}
      <AdministrationPanel attack={attack} assessments={assessments.data ?? []} readOnly={false} />
      <AssessmentsCard attack={attack} />
      <AttackForm key={attack.updated_at} initial={draftFromAttack(attack)} submitLabel="Salvar alterações" onSubmit={async (p) => {
        await updateAttack(attack.id, p)
        await qc.invalidateQueries()
        setSaved(true)
      }} />
      <Card title="Excluir registro">
        <p className="mb-2 text-sm text-muted">A crise deixa de aparecer no diário e nos cálculos. A exclusão fica registrada no histórico de alterações.</p>
        {act.error && <Alert tone="bad">{act.error}</Alert>}
        <Button variant="danger" small disabled={act.busy} onClick={() => confirm('Excluir esta crise?') && act.run(() => deleteAttack(attack.id), () => nav('/calendario', { replace: true }))}>Excluir crise</Button>
      </Card>
    </div>
  )
}

/** Avaliações ao longo do episódio: a intensidade e a localização podem mudar. */
export function AssessmentsCard({ attack, readOnly = false }: { attack: Attack; readOnly?: boolean }) {
  const q = useQuery({ queryKey: ['assessments', attack.id], queryFn: () => fetchAssessments(attack.id) })
  const [open, setOpen] = useState(false)
  const act = useAction()
  const list = (q.data ?? []).filter((s) => !s.administration_id)
  return (
    <Card title="Avaliações ao longo da crise" action={!readOnly && <Button small variant="secondary" onClick={() => setOpen(true)}>+ Como está agora?</Button>}>
      {!list.length ? <Empty>Nenhuma avaliação adicional. Registre como a dor está agora, ou se ela mudou de lugar.</Empty> : (
        <ul className="divide-y divide-line text-sm">
          {list.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{fmtDateTime(s.assessed_at)} — intensidade <strong>{s.intensity ?? '—'}</strong>
                {s.locations?.length ? ` · ${s.locations.map((l) => labelOf('location', l)).join(', ')}` : ''}{s.note ? ` · ${s.note}` : ''}</span>
              {!readOnly && <button type="button" className="text-xs text-muted hover:text-danger" onClick={() => act.run(() => deleteAssessment(s.id))}>Excluir</button>}
            </li>
          ))}
        </ul>
      )}
      {open && <AssessmentModal attack={attack} onClose={() => setOpen(false)} />}
    </Card>
  )
}

function AssessmentModal({ attack, onClose }: { attack: Attack; onClose: () => void }) {
  const [at, setAt] = useState(nowLocal())
  const [value, setValue] = useState<number | null>(null)
  const [locations, setLocations] = useState<string[]>([])
  const [note, setNote] = useState('')
  const act = useAction()
  return (
    <Modal title="Nova avaliação" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Data e horário" error={act.fields.assessed_at}><Input type="datetime-local" max={nowLocal()} value={at} onChange={(e) => setAt(e.target.value)} /></Field>
        <Field label="Intensidade da dor"><IntensityInput value={value} onChange={setValue} /></Field>
        <Field label="A dor mudou de lugar? Marque onde está agora (opcional)"><Chips options={LOCATIONS} value={locations} onChange={setLocations} /></Field>
        <Field label="Observação"><Input value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} /></Field>
        {act.error && <Alert tone="bad">{act.error}</Alert>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={act.busy} onClick={() => act.run(() => saveAssessment({ attack_id: attack.id, patient_id: attack.patient_id },
            { assessed_at: at, intensity: value, minutes_after_dose: null, locations: locations.length ? locations : null, note: blank(note) }), onClose)}>Salvar</Button></div>
      </div>
    </Modal>
  )
}
