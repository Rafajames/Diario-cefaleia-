import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, Badge, Button, Card, Checkbox, Chips, Empty, Field, Input, IntensityInput, Modal, Select, Spinner, Textarea, TriState } from '@/components/ui'
import { MED_CATEGORIES, OUTCOMES, ROUTES, labelOf } from '@/config/clinical-options'
import { useAction, useDraft } from '@/hooks/useDraft'
import { blank, num } from '@/services/crud'
import { useSettings } from '@/services/settings'
import type { Administration, Assessment, Attack, MedicationCategory, Outcome } from '@/types/database'
import { fmtDateTime, fmtDuration, fromMs, nowLocal, toInput, toMs } from '@/utils/datetime'
import { deleteAssessment, saveAssessment } from '@/modules/headache-attacks/service'
import { deleteAdministration, fetchAdministrations, fetchMedications, saveAdministration } from '@/modules/medications/service'
import type { AdministrationPayload } from '@/modules/medications/schemas'
import { RESPONSE_CAVEAT, administrationIntervals } from './calc'

type Draft = Omit<AdministrationPayload, 'dose' | 'relief_started_at' | 'max_relief_at' | 'recurrence_at' | 'pain_free_minutes'> & {
  dose: string; relief_started_at: string; max_relief_at: string; recurrence_at: string; pain_free_minutes: string
}

const toDraft = (a: Administration | null, attack: Attack, seq: number): Draft => ({
  attack_id: attack.id,
  medication_id: a?.medication_id ?? null,
  medication_name: a?.medication_name ?? '',
  active_ingredient: a?.active_ingredient ?? null,
  category: (a?.category as MedicationCategory) ?? 'other',
  dose: a?.dose?.toString() ?? '',
  unit: a?.unit ?? null,
  route: a?.route ?? null,
  taken_at: toInput(a?.taken_at) || nowLocal(),
  time_is_approximate: a?.time_is_approximate ?? false,
  sequence_number: a?.sequence_number ?? seq,
  reason: a?.reason ?? null,
  notes: a?.notes ?? null,
  intensity_before: a?.intensity_before ?? null,
  relief_started_at: toInput(a?.relief_started_at),
  max_relief_at: toInput(a?.max_relief_at),
  outcome: a?.outcome ?? null,
  pain_free: a?.pain_free ?? null,
  pain_free_minutes: a?.pain_free_minutes?.toString() ?? '',
  recurred: a?.recurred ?? null,
  recurrence_at: toInput(a?.recurrence_at),
  needed_rescue: a?.needed_rescue ?? null,
  adverse_effect: a?.adverse_effect ?? null,
  adverse_effect_note: a?.adverse_effect_note ?? null,
})

const toPayload = (d: Draft): AdministrationPayload => ({
  ...d,
  medication_name: d.medication_name.trim(),
  active_ingredient: blank(d.active_ingredient), unit: blank(d.unit), route: blank(d.route), reason: blank(d.reason), notes: blank(d.notes),
  dose: num(d.dose),
  relief_started_at: d.relief_started_at || null,
  max_relief_at: d.max_relief_at || null,
  recurrence_at: d.recurred ? d.recurrence_at || null : null,
  pain_free_minutes: d.pain_free ? num(d.pain_free_minutes) : null,
  adverse_effect_note: d.adverse_effect ? blank(d.adverse_effect_note) : null,
})

const OUTCOME_TONE: Record<Outcome, 'good' | 'info' | 'warn' | 'bad' | 'neutral'> = { complete: 'good', partial: 'info', none: 'warn', worse: 'bad', unknown: 'neutral' }

interface Props { attack: Attack; assessments: Assessment[]; readOnly: boolean }

/** Medicamentos usados em uma crise: cada administração é um registro independente, com sua resposta. */
export function AdministrationPanel({ attack, assessments, readOnly }: Props) {
  const adms = useQuery({ queryKey: ['administrations', attack.id], queryFn: () => fetchAdministrations(attack.id) })
  const [editing, setEditing] = useState<{ mode: 'dose' | 'response'; adm: Administration | null } | null>(null)
  const [evaluating, setEvaluating] = useState<Administration | null>(null)
  const act = useAction()
  if (adms.isLoading) return <Spinner />
  const list = adms.data ?? []

  return (
    <Card title="Medicamentos nesta crise" action={!readOnly && <Button small onClick={() => setEditing({ mode: 'dose', adm: null })}>+ Registrar medicamento</Button>}>
      {adms.error ? <Alert tone="bad">Não foi possível carregar os medicamentos.</Alert> : !list.length ? <Empty>Nenhum medicamento registrado nesta crise.</Empty> : (
        <ul className="space-y-3">
          {list.map((a, i) => {
            const iv = administrationIntervals(a, attack, assessments)
            return (
              <li key={a.id} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{a.sequence_number ?? i + 1}ª administração — {a.medication_name}{a.dose !== null && ` · ${a.dose} ${a.unit ?? ''}`}</p>
                    <p className="text-sm text-muted">{fmtDateTime(a.taken_at)}{a.time_is_approximate && ' (aprox.)'}{a.route && ` · via ${labelOf('route', a.route).toLowerCase()}`}{a.reason && ` · ${a.reason}`}</p>
                  </div>
                  {a.outcome && <Badge tone={OUTCOME_TONE[a.outcome]}>{labelOf('outcome', a.outcome)}</Badge>}
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                  <Metric label="Tempo até a medicação" value={fmtDuration(iv.minutesToMedication)} />
                  <Metric label="Início do alívio" value={fmtDuration(iv.minutesToReliefOnset)} />
                  <Metric label="Alívio máximo" value={fmtDuration(iv.minutesToMaxRelief)} />
                  <Metric label="Redução da intensidade" value={iv.intensityReduction === null ? '—' : `${iv.intensityReduction} (de ${iv.intensityBefore} para ${iv.lowestIntensityAfter})`} />
                </dl>
                {iv.evaluations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {assessments.filter((s) => s.administration_id === a.id).map((s) => (
                      <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-1 text-xs">
                        {s.minutes_after_dose !== null ? fmtDuration(s.minutes_after_dose) : fmtDateTime(s.assessed_at)}: <strong>{s.intensity ?? '—'}</strong>
                        {!readOnly && <button type="button" aria-label="Excluir avaliação" className="text-muted hover:text-danger" onClick={() => act.run(() => deleteAssessment(s.id))}>✕</button>}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-sm text-muted">
                  {a.pain_free && `Ficou sem dor${a.pain_free_minutes ? ` por ${fmtDuration(a.pain_free_minutes)}` : ''}. `}
                  {a.recurred && `A dor retornou${iv.minutesToRecurrence !== null ? ` ${fmtDuration(iv.minutesToRecurrence)} após a dose` : ''}. `}
                  {a.needed_rescue && 'Precisou de outro medicamento. '}
                  {a.adverse_effect && `Efeito adverso informado${a.adverse_effect_note ? `: ${a.adverse_effect_note}` : ''}. `}
                  {a.notes}
                </p>
                {!readOnly && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button small variant="secondary" onClick={() => setEditing({ mode: 'response', adm: a })}>{a.outcome ? 'Editar resposta' : 'Registrar resposta'}</Button>
                    <Button small variant="secondary" onClick={() => setEvaluating(a)}>+ Avaliação após a dose</Button>
                    <Button small variant="ghost" onClick={() => setEditing({ mode: 'dose', adm: a })}>Editar</Button>
                    <Button small variant="ghost" disabled={act.busy} onClick={() => confirm('Excluir esta administração e suas avaliações?') && act.run(() => deleteAdministration(a.id))}>Excluir</Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {list.length > 0 && <p className="mt-3 text-xs text-muted">{RESPONSE_CAVEAT}</p>}
      {act.error && <Alert tone="bad">{act.error}</Alert>}
      {editing && <AdministrationModal attack={attack} adm={editing.adm} mode={editing.mode} seq={list.length + 1} onClose={() => setEditing(null)} />}
      {evaluating && <EvaluationModal attack={attack} adm={evaluating} onClose={() => setEvaluating(null)} />}
    </Card>
  )
}

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div><dt className="text-xs text-muted">{label}</dt><dd className="font-medium">{value}</dd></div>
)

function AdministrationModal({ attack, adm, mode, seq, onClose }: { attack: Attack; adm: Administration | null; mode: 'dose' | 'response'; seq: number; onClose: () => void }) {
  const meds = useQuery({ queryKey: ['medications', attack.patient_id], queryFn: () => fetchMedications(attack.patient_id) })
  const { v, set, setV } = useDraft<Draft>(toDraft(adm, attack, seq))
  const act = useAction()
  const pick = (id: string) => {
    const m = meds.data?.find((x) => x.id === id)
    if (!m) return setV((p) => ({ ...p, medication_id: null }))
    setV((p) => ({ ...p, medication_id: m.id, medication_name: m.trade_name, active_ingredient: m.active_ingredient, category: m.category,
      route: m.route ?? p.route, unit: m.unit ?? p.unit, dose: p.dose || (m.strength?.toString() ?? '') }))
  }
  const save = () => act.run(() => saveAdministration(attack.patient_id, toPayload(v), adm?.id), onClose)
  return (
    <Modal title={mode === 'dose' ? (adm ? 'Editar administração' : 'Registrar medicamento') : `Resposta — ${v.medication_name}`} onClose={onClose}>
      <div className="space-y-3">
        {mode === 'dose' ? (
          <>
            <Field label="Meus medicamentos / catálogo" hint="Escolha da lista ou digite o nome abaixo. O sistema não recomenda medicamentos nem doses.">
              <Select placeholder="— digitar manualmente —" value={v.medication_id ?? ''} onChange={(e) => pick(e.target.value)}
                options={(meds.data ?? []).filter((m) => m.category !== 'preventive').map((m) => ({ value: m.id, label: `${m.trade_name}${m.strength ? ` ${m.strength} ${m.unit ?? ''}` : ''}` }))} />
            </Field>
            <Field label="Medicamento *" error={act.fields.medication_name}><Input value={v.medication_name} maxLength={160} onChange={(e) => set('medication_name', e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Dose utilizada" error={act.fields.dose}><Input inputMode="decimal" value={v.dose} onChange={(e) => set('dose', e.target.value)} /></Field>
              <Field label="Unidade"><Input value={v.unit ?? ''} maxLength={20} placeholder="mg, gotas, comp." onChange={(e) => set('unit', e.target.value)} /></Field>
              <Field label="Via"><Select placeholder="—" options={ROUTES} value={v.route ?? ''} onChange={(e) => set('route', e.target.value || null)} /></Field>
              <Field label="Classe"><Select options={MED_CATEGORIES.filter((c) => c.value !== 'preventive')} value={v.category} onChange={(e) => set('category', e.target.value as MedicationCategory)} /></Field>
            </div>
            <Field label="Data e horário da administração *" error={act.fields.taken_at}><Input type="datetime-local" max={nowLocal()} value={v.taken_at} onChange={(e) => set('taken_at', e.target.value)} /></Field>
            <Checkbox label="Horário aproximado" checked={v.time_is_approximate} onChange={(x) => set('time_is_approximate', x)} />
            <Field label="Intensidade da dor imediatamente antes"><IntensityInput value={v.intensity_before} onChange={(x) => set('intensity_before', x)} /></Field>
            <Field label="Motivo"><Input value={v.reason ?? ''} maxLength={300} placeholder="ex.: dor não cedeu com a primeira dose" onChange={(e) => set('reason', e.target.value)} /></Field>
            <Field label="Observações"><Textarea value={v.notes ?? ''} maxLength={1000} onChange={(e) => set('notes', e.target.value)} /></Field>
          </>
        ) : (
          <>
            <Field label="Como ficou a dor depois deste medicamento?">
              <Chips single options={OUTCOMES} value={v.outcome ? [v.outcome] : []} onChange={(x) => set('outcome', (x[0] as Outcome) ?? null)} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Quando percebeu o início da melhora" error={act.fields.relief_started_at}><Input type="datetime-local" min={v.taken_at} value={v.relief_started_at} onChange={(e) => set('relief_started_at', e.target.value)} /></Field>
              <Field label="Quando teve o melhor resultado" error={act.fields.max_relief_at}><Input type="datetime-local" min={v.taken_at} value={v.max_relief_at} onChange={(e) => set('max_relief_at', e.target.value)} /></Field>
            </div>
            <Field label="A dor desapareceu?"><TriState value={v.pain_free} onChange={(x) => set('pain_free', x)} /></Field>
            {v.pain_free && <Field label="Por quanto tempo ficou sem dor? (minutos)" hint="Deixe em branco se não souber ou se a dor não voltou."><Input inputMode="numeric" value={v.pain_free_minutes} onChange={(e) => set('pain_free_minutes', e.target.value)} /></Field>}
            <Field label="A dor retornou?"><TriState value={v.recurred} onChange={(x) => set('recurred', x)} /></Field>
            {v.recurred && <Field label="Horário da recorrência" error={act.fields.recurrence_at}><Input type="datetime-local" min={v.taken_at} value={v.recurrence_at} onChange={(e) => set('recurrence_at', e.target.value)} /></Field>}
            <Field label="Precisou utilizar outro medicamento?"><TriState value={v.needed_rescue} onChange={(x) => set('needed_rescue', x)} /></Field>
            <Field label="Houve efeito adverso?"><TriState value={v.adverse_effect} onChange={(x) => set('adverse_effect', x)} /></Field>
            {v.adverse_effect && <Field label="Qual efeito?"><Input value={v.adverse_effect_note ?? ''} maxLength={500} onChange={(e) => set('adverse_effect_note', e.target.value)} /></Field>}
          </>
        )}
        {act.error && <Alert tone="bad">{act.error}</Alert>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={act.busy} onClick={save}>Salvar</Button></div>
      </div>
    </Modal>
  )
}

function EvaluationModal({ attack, adm, onClose }: { attack: Attack; adm: Administration; onClose: () => void }) {
  const settings = useSettings()
  const [minutes, setMinutes] = useState<string>('')
  const [custom, setCustom] = useState('')
  const [freeTime, setFreeTime] = useState('')
  const [value, setValue] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const act = useAction()
  const presets = [...settings.post_dose_intervals_min.map((m) => ({ value: String(m), label: fmtDuration(m) })), { value: 'other', label: 'Outro intervalo' }, { value: 'free', label: 'Horário livre' }]
  const save = () => {
    const mins = minutes === 'free' ? null : num(minutes === 'other' ? custom : minutes)
    const assessed_at = minutes === 'free' ? freeTime : mins !== null ? fromMs(toMs(adm.taken_at) + mins * 60_000).slice(0, 16) : ''
    return act.run(() => saveAssessment({ attack_id: attack.id, patient_id: attack.patient_id, administration_id: adm.id },
      { assessed_at, intensity: value, minutes_after_dose: mins === null ? null : Math.round(mins), locations: null, note: blank(note) }), onClose)
  }
  return (
    <Modal title={`Avaliação após ${adm.medication_name}`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Quanto tempo depois da dose?" hint="Os intervalos são sugestões — nenhum é obrigatório." error={act.fields.assessed_at}>
          <Chips single options={presets} value={minutes ? [minutes] : []} onChange={(x) => setMinutes(x[0] ?? '')} />
        </Field>
        {minutes === 'other' && <Field label="Minutos após a dose"><Input inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value)} /></Field>}
        {minutes === 'free' && <Field label="Data e horário da avaliação"><Input type="datetime-local" min={toInput(adm.taken_at)} max={nowLocal()} value={freeTime} onChange={(e) => setFreeTime(e.target.value)} /></Field>}
        <Field label="Intensidade da dor nesse momento" error={act.fields.intensity}><IntensityInput value={value} onChange={setValue} /></Field>
        <Field label="Observação"><Input value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} /></Field>
        {act.error && <Alert tone="bad">{act.error}</Alert>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={act.busy || !minutes} onClick={save}>Salvar</Button></div>
      </div>
    </Modal>
  )
}
