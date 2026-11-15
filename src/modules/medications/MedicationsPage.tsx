import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, Badge, Button, Card, Empty, Field, Input, Modal, PageTitle, Select, Spinner, Textarea } from '@/components/ui'
import { MED_CATEGORIES, ROUTES, labelOf } from '@/config/clinical-options'
import { useAction, useDraft } from '@/hooks/useDraft'
import { blank, num } from '@/services/crud'
import type { Medication, MedicationCategory, PreventiveTreatment } from '@/types/database'
import { fmtDate, todayLocal } from '@/utils/datetime'
import { usePatientScope } from '@/modules/patients/scope'
import { archiveMedication, deletePreventive, fetchMedications, fetchPreventives, saveMedication, savePreventive } from './service'

/** Lista de tratamentos preventivos (reutilizada na visão do profissional). */
export function PreventiveList({ items, onEdit }: { items: PreventiveTreatment[]; onEdit?: (p: PreventiveTreatment) => void }) {
  const today = todayLocal()
  if (!items.length) return <Empty>Nenhum tratamento preventivo registrado.</Empty>
  return (
    <ul className="divide-y divide-line">
      {items.map((p) => (
        <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
          <div>
            <p className="font-semibold">{p.name} {p.prescribed_dose && <span className="font-normal">· {p.prescribed_dose}</span>} {(!p.end_date || p.end_date >= today) ? <Badge tone="good">Em uso</Badge> : <Badge>Encerrado</Badge>}</p>
            <p className="text-muted">{p.start_date ? `Início: ${fmtDate(p.start_date)}` : 'Início não informado'}{p.end_date && ` · Término: ${fmtDate(p.end_date)}`}{p.usual_time && ` · Horário: ${p.usual_time}`}{p.prescriber && ` · Prescrito por ${p.prescriber}`}</p>
            {p.dose_changes.length > 0 && <p className="text-muted">Alterações de dose: {p.dose_changes.map((d) => `${fmtDate(d.date)} → ${d.dose}`).join('; ')}</p>}
            {p.notes && <p className="text-muted">{p.notes}</p>}
          </div>
          {onEdit && <Button small variant="ghost" onClick={() => onEdit(p)}>Editar</Button>}
        </li>
      ))}
    </ul>
  )
}

export function MedicationsPage() {
  const { patientId } = usePatientScope()
  const meds = useQuery({ queryKey: ['medications', patientId], queryFn: () => fetchMedications(patientId) })
  const prev = useQuery({ queryKey: ['preventives', patientId], queryFn: () => fetchPreventives(patientId) })
  const [med, setMed] = useState<Medication | 'new' | null>(null)
  const [pv, setPv] = useState<PreventiveTreatment | 'new' | null>(null)
  const act = useAction()
  const mine = (meds.data ?? []).filter((m) => m.owner_id === patientId)
  const catalog = (meds.data ?? []).filter((m) => m.owner_id === null)
  return (
    <div className="space-y-4">
      <PageTitle>Medicamentos</PageTitle>
      <Alert tone="info">Este diário apenas registra o que você usa. Ele não recomenda medicamentos nem doses — siga sempre a orientação do seu médico.</Alert>
      <Card title="Tratamentos preventivos" action={<Button small onClick={() => setPv('new')}>+ Adicionar</Button>}>
        {prev.isLoading ? <Spinner /> : <PreventiveList items={prev.data ?? []} onEdit={setPv} />}
      </Card>
      <Card title="Meus medicamentos para crise" action={<Button small onClick={() => setMed('new')}>+ Cadastrar</Button>}>
        <p className="mb-2 text-xs text-muted">Cadastre aqui o que você costuma usar; depois é só escolher na lista ao registrar uma crise. O uso em cada crise é registrado dentro da própria crise.</p>
        {meds.isLoading ? <Spinner /> : !mine.length ? <Empty>Nenhum medicamento personalizado.</Empty> : (
          <ul className="divide-y divide-line">
            {mine.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span><strong>{m.trade_name}</strong>{m.strength !== null && ` ${m.strength} ${m.unit ?? ''}`}{m.active_ingredient && ` · ${m.active_ingredient}`} · {labelOf('medCategory', m.category)}{m.route && ` · ${labelOf('route', m.route)}`}{m.presentation && ` · ${m.presentation}`}</span>
                <span className="flex gap-2"><Button small variant="ghost" onClick={() => setMed(m)}>Editar</Button>
                  <Button small variant="ghost" disabled={act.busy} onClick={() => confirm('Remover da sua lista? Os registros de uso já feitos são mantidos.') && act.run(() => archiveMedication(m.id))}>Remover</Button></span>
              </li>
            ))}
          </ul>
        )}
        {act.error && <Alert tone="bad">{act.error}</Alert>}
      </Card>
      {catalog.length > 0 && (
        <Card title="Catálogo geral">
          <p className="text-sm text-muted">{catalog.map((m) => m.trade_name).join(' · ')}</p>
        </Card>
      )}
      {med && <MedicationModal ownerId={patientId} med={med === 'new' ? null : med} onClose={() => setMed(null)} />}
      {pv && <PreventiveModal patientId={patientId} item={pv === 'new' ? null : pv} onClose={() => setPv(null)} />}
    </div>
  )
}

export function MedicationModal({ ownerId, med, onClose, allowPreventive = false }: { ownerId: string | null; med: Medication | null; onClose: () => void; allowPreventive?: boolean }) {
  const { v, set } = useDraft({
    trade_name: med?.trade_name ?? '', active_ingredient: med?.active_ingredient ?? '', presentation: med?.presentation ?? '', category: (med?.category ?? 'analgesic') as MedicationCategory,
    route: med?.route ?? '', strength: med?.strength?.toString() ?? '', unit: med?.unit ?? '', notes: med?.notes ?? '',
  })
  const act = useAction()
  const save = () => act.run(() => saveMedication(ownerId, {
    ...v, active_ingredient: blank(v.active_ingredient), presentation: blank(v.presentation), route: v.route || null, strength: num(v.strength), unit: blank(v.unit), notes: blank(v.notes),
  }, med?.id), onClose)
  return (
    <Modal title={med ? 'Editar medicamento' : 'Cadastrar medicamento'} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nome comercial *" error={act.fields.trade_name}><Input value={v.trade_name} maxLength={160} onChange={(e) => set('trade_name', e.target.value)} /></Field>
        <Field label="Princípio ativo (se souber)"><Input value={v.active_ingredient} maxLength={200} onChange={(e) => set('active_ingredient', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Apresentação"><Input value={v.presentation} maxLength={120} placeholder="comprimido, gotas…" onChange={(e) => set('presentation', e.target.value)} /></Field>
          <Field label="Categoria"><Select options={MED_CATEGORIES.filter((c) => allowPreventive || c.value !== 'preventive')} value={v.category} onChange={(e) => set('category', e.target.value as MedicationCategory)} /></Field>
          <Field label="Dosagem" error={act.fields.strength}><Input inputMode="decimal" value={v.strength} onChange={(e) => set('strength', e.target.value)} /></Field>
          <Field label="Unidade"><Input value={v.unit} maxLength={20} placeholder="mg" onChange={(e) => set('unit', e.target.value)} /></Field>
        </div>
        <Field label="Via de administração"><Select placeholder="—" options={ROUTES} value={v.route} onChange={(e) => set('route', e.target.value)} /></Field>
        <Field label="Observações"><Textarea value={v.notes} maxLength={1000} onChange={(e) => set('notes', e.target.value)} /></Field>
        {act.error && <Alert tone="bad">{act.error}</Alert>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={act.busy} onClick={save}>Salvar</Button></div>
      </div>
    </Modal>
  )
}

function PreventiveModal({ patientId, item, onClose }: { patientId: string; item: PreventiveTreatment | null; onClose: () => void }) {
  const { v, set } = useDraft({
    medication_id: item?.medication_id ?? null, name: item?.name ?? '', prescribed_dose: item?.prescribed_dose ?? '', usual_time: item?.usual_time ?? '',
    start_date: item?.start_date ?? '', end_date: item?.end_date ?? '', dose_changes: item?.dose_changes ?? [], prescriber: item?.prescriber ?? '', notes: item?.notes ?? '',
  })
  const [change, setChange] = useState({ date: todayLocal(), dose: '' })
  const act = useAction()
  const save = () => act.run(() => savePreventive(patientId, {
    ...v, prescribed_dose: blank(v.prescribed_dose), usual_time: blank(v.usual_time), start_date: v.start_date || null, end_date: v.end_date || null,
    prescriber: blank(v.prescriber), notes: blank(v.notes),
  }, item?.id), onClose)
  return (
    <Modal title={item ? 'Editar tratamento preventivo' : 'Adicionar tratamento preventivo'} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Medicamento *" error={act.fields.name}><Input value={v.name} maxLength={160} onChange={(e) => set('name', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dosagem prescrita"><Input value={v.prescribed_dose} maxLength={120} placeholder="conforme a receita" onChange={(e) => set('prescribed_dose', e.target.value)} /></Field>
          <Field label="Horário habitual"><Input value={v.usual_time} maxLength={60} placeholder="ex.: à noite" onChange={(e) => set('usual_time', e.target.value)} /></Field>
          <Field label="Data de início"><Input type="date" value={v.start_date} onChange={(e) => set('start_date', e.target.value)} /></Field>
          <Field label="Data de término" error={act.fields.end_date}><Input type="date" min={v.start_date} value={v.end_date} onChange={(e) => set('end_date', e.target.value)} /></Field>
        </div>
        <Field label="Médico responsável"><Input value={v.prescriber} maxLength={160} onChange={(e) => set('prescriber', e.target.value)} /></Field>
        <fieldset className="space-y-2 rounded-lg bg-surface p-3">
          <legend className="px-1 text-sm font-medium">Alterações de dose</legend>
          {v.dose_changes.map((d, i) => (
            <p key={i} className="flex items-center justify-between text-sm">{fmtDate(d.date)} → {d.dose}
              <button type="button" className="text-xs text-muted hover:text-danger" onClick={() => set('dose_changes', v.dose_changes.filter((_, j) => j !== i))}>Remover</button></p>
          ))}
          <div className="flex gap-2">
            <Input type="date" value={change.date} onChange={(e) => setChange({ ...change, date: e.target.value })} />
            <Input placeholder="nova dose" value={change.dose} maxLength={120} onChange={(e) => setChange({ ...change, dose: e.target.value })} />
            <Button small variant="secondary" disabled={!change.dose.trim() || !change.date} onClick={() => { set('dose_changes', [...v.dose_changes, { date: change.date, dose: change.dose.trim() }]); setChange({ ...change, dose: '' }) }}>Incluir</Button>
          </div>
        </fieldset>
        <Field label="Observações"><Textarea value={v.notes} maxLength={1000} onChange={(e) => set('notes', e.target.value)} /></Field>
        {act.error && <Alert tone="bad">{act.error}</Alert>}
        <div className="flex justify-between gap-2">
          {item ? <Button variant="ghost" disabled={act.busy} onClick={() => confirm('Excluir este tratamento?') && act.run(() => deletePreventive(item.id), onClose)}>Excluir</Button> : <span />}
          <span className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={act.busy} onClick={save}>Salvar</Button></span>
        </div>
      </div>
    </Modal>
  )
}
