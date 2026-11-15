import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Card, Checkbox, Chips, Empty, Field, Input, Modal, PageTitle, Select, Spinner, Textarea } from '@/components/ui'
import { FLOWS, labelOf } from '@/config/clinical-options'
import { useAction, useDraft } from '@/hooks/useDraft'
import { blank, num } from '@/services/crud'
import { useDataset } from '@/services/dataset'
import { useSettings } from '@/services/settings'
import type { MenstrualCycle, Patient } from '@/types/database'
import { addDays, daysBetween, fmtDate, todayLocal } from '@/utils/datetime'
import { fetchPatient, updateMenstrualProfile } from '@/modules/patients/service'
import { usePatientScope } from '@/modules/patients/scope'
import { analyzeMenstrualAssociation } from './calc'
import { MenstrualAnalysisView } from './MenstrualAnalysisView'
import { deleteCycle, fetchCycles, saveCycle } from './service'

export function CyclePage() {
  const { patientId } = usePatientScope()
  const patient = useQuery({ queryKey: ['patient', patientId], queryFn: () => fetchPatient(patientId) })
  const act = useAction()
  if (patient.isLoading) return <Spinner />
  if (!patient.data) return <Alert tone="bad">Não foi possível carregar seu perfil.</Alert>
  if (!patient.data.tracks_menstruation) {
    return (
      <>
        <PageTitle>Ciclo menstrual</PageTitle>
        <Card>
          <p className="mb-3 text-sm text-muted">Este módulo é opcional. Ao ativá-lo, você pode registrar seus sangramentos e ver se as crises costumam coincidir com o período menstrual. Você decide, em cada compartilhamento, se o profissional pode ver estes dados.</p>
          {act.error && <Alert tone="bad">{act.error}</Alert>}
          <Button disabled={act.busy} onClick={() => act.run(() => updateMenstrualProfile(patientId, { ...profileDraft(patient.data!), tracks_menstruation: true }))}>Quero registrar meu ciclo</Button>
        </Card>
      </>
    )
  }
  return <CycleContent patient={patient.data} />
}

const profileDraft = (p: Patient) => ({
  tracks_menstruation: p.tracks_menstruation, cycle_regularity: p.cycle_regularity, usual_cycle_days: p.usual_cycle_days, usual_bleeding_days: p.usual_bleeding_days,
  next_period_expected: p.next_period_expected, hormonal_contraceptive: p.hormonal_contraceptive, menstrual_notes: p.menstrual_notes,
})

function CycleContent({ patient }: { patient: Patient }) {
  const settings = useSettings()
  const today = todayLocal()
  const cycles = useQuery({ queryKey: ['cycles', patient.id], queryFn: () => fetchCycles(patient.id) })
  const data = useDataset(patient.id, addDays(today, -365), today)
  const [editing, setEditing] = useState<MenstrualCycle | 'new' | null>(null)
  const analysis = useMemo(() => data.data && cycles.data
    ? analyzeMenstrualAssociation(cycles.data, data.data.attacks, data.data.administrations, settings.menstrual_window, today, { from: addDays(today, -365), to: today })
    : null, [data.data, cycles.data, settings.menstrual_window, today])
  const act = useAction()
  return (
    <div className="space-y-4">
      <PageTitle action={<Button onClick={() => setEditing('new')}>+ Registrar sangramento</Button>}>Ciclo menstrual</PageTitle>
      <Card title="Sangramentos registrados">
        {cycles.isLoading ? <Spinner /> : !cycles.data?.length ? <Empty>Nenhum sangramento registrado. Você pode registrar ciclos passados a qualquer momento.</Empty> : (
          <ul className="divide-y divide-line">
            {cycles.data.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span><strong>{fmtDate(c.start_date)}</strong> {c.end_date ? `a ${fmtDate(c.end_date)} (${daysBetween(c.start_date, c.end_date) + 1} dias)` : '— último dia não informado'}
                  {c.flow && ` · fluxo ${labelOf('flow', c.flow).toLowerCase()}`}{c.notes && ` · ${c.notes}`}</span>
                <span className="flex gap-2">
                  <Button small variant="ghost" onClick={() => setEditing(c)}>Editar</Button>
                  <Button small variant="ghost" disabled={act.busy} onClick={() => confirm('Excluir este registro?') && act.run(() => deleteCycle(c.id))}>Excluir</Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {act.error && <Alert tone="bad">{act.error}</Alert>}
      </Card>
      <Card title="Cefaleia e período menstrual (últimos 12 meses)">{analysis ? <MenstrualAnalysisView analysis={analysis} /> : <Spinner />}</Card>
      <ProfileCard patient={patient} />
      {editing && <CycleModal patientId={patient.id} cycle={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function CycleModal({ patientId, cycle, onClose }: { patientId: string; cycle: MenstrualCycle | null; onClose: () => void }) {
  const today = todayLocal()
  const { v, set } = useDraft({ start_date: cycle?.start_date ?? today, end_date: cycle?.end_date ?? '', flow: cycle?.flow ?? null, notes: cycle?.notes ?? '' })
  const act = useAction()
  return (
    <Modal title={cycle ? 'Editar sangramento' : 'Registrar sangramento'} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Primeiro dia *" error={act.fields.start_date}><Input type="date" max={today} value={v.start_date} onChange={(e) => set('start_date', e.target.value)} /></Field>
          <Field label="Último dia" hint="Pode preencher depois." error={act.fields.end_date}><Input type="date" min={v.start_date} max={today} value={v.end_date} onChange={(e) => set('end_date', e.target.value)} /></Field>
        </div>
        <Field label="Fluxo"><Chips single options={FLOWS} value={v.flow ? [v.flow] : []} onChange={(x) => set('flow', (x[0] as MenstrualCycle['flow']) ?? null)} /></Field>
        <Field label="Outras informações"><Textarea value={v.notes} maxLength={1000} onChange={(e) => set('notes', e.target.value)} /></Field>
        {act.error && <Alert tone="bad">{act.error}</Alert>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={act.busy} onClick={() => act.run(() => saveCycle(patientId, { ...v, end_date: v.end_date || null, notes: blank(v.notes) }, cycle?.id), onClose)}>Salvar</Button></div>
      </div>
    </Modal>
  )
}

function ProfileCard({ patient }: { patient: Patient }) {
  const { v, set } = useDraft({ ...profileDraft(patient), usual_cycle_days: patient.usual_cycle_days?.toString() ?? '', usual_bleeding_days: patient.usual_bleeding_days?.toString() ?? '' })
  const act = useAction()
  const [ok, setOk] = useState(false)
  const int = (s: string) => (num(s) === null ? null : Math.round(num(s)!))
  const save = () => act.run(() => updateMenstrualProfile(patient.id, {
    ...v, usual_cycle_days: int(v.usual_cycle_days), usual_bleeding_days: int(v.usual_bleeding_days),
    next_period_expected: v.next_period_expected || null, hormonal_contraceptive: blank(v.hormonal_contraceptive), menstrual_notes: blank(v.menstrual_notes),
  }), () => setOk(true))
  return (
    <Card title="Informações do ciclo (opcionais)">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ciclo"><Select placeholder="—" options={[{ value: 'regular', label: 'Regular' }, { value: 'irregular', label: 'Irregular' }, { value: 'unknown', label: 'Não sei' }]}
            value={v.cycle_regularity ?? ''} onChange={(e) => set('cycle_regularity', (e.target.value || null) as Patient['cycle_regularity'])} /></Field>
          <Field label="Duração habitual do ciclo (dias)" error={act.fields.usual_cycle_days}><Input inputMode="numeric" value={v.usual_cycle_days} onChange={(e) => set('usual_cycle_days', e.target.value)} /></Field>
          <Field label="Duração habitual do sangramento (dias)" error={act.fields.usual_bleeding_days}><Input inputMode="numeric" value={v.usual_bleeding_days} onChange={(e) => set('usual_bleeding_days', e.target.value)} /></Field>
          <Field label="Data prevista da próxima menstruação"><Input type="date" value={v.next_period_expected ?? ''} onChange={(e) => set('next_period_expected', e.target.value || null)} /></Field>
        </div>
        <Field label="Uso de contraceptivo hormonal"><Input value={v.hormonal_contraceptive ?? ''} maxLength={300} onChange={(e) => set('hormonal_contraceptive', e.target.value)} /></Field>
        <Field label="Outras informações"><Textarea value={v.menstrual_notes ?? ''} maxLength={2000} onChange={(e) => set('menstrual_notes', e.target.value)} /></Field>
        <Checkbox label="Manter o módulo de ciclo menstrual ativo" checked={v.tracks_menstruation} onChange={(x) => set('tracks_menstruation', x)} />
        {act.error && <Alert tone="bad">{act.error}</Alert>}
        {ok && !act.error && <Alert tone="good">Informações salvas.</Alert>}
        <Button disabled={act.busy} onClick={save}>Salvar informações</Button>
      </div>
    </Card>
  )
}
