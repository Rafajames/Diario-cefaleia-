import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Alert, Button, Checkbox, Chips, Field, Input, IntensityInput, Section, Select, Textarea, TriState } from '@/components/ui'
import {
  AGGRAVATING, FUNCTIONAL_IMPACT, LOCATIONS, PAIN_QUALITIES, SIDES, SYMPTOMS, SYMPTOM_PHASES, TRIGGER_CATEGORIES, TRIGGER_RELATIONS, labelOf,
} from '@/config/clinical-options'
import type { AttackSymptom, AttackTrigger, SymptomPhase } from '@/types/database'
import { friendlyError } from '@/utils/errors'
import { fmtDuration, minutesBetween, nowLocal } from '@/utils/datetime'
import { draftToPayload, type AttackDraft, type AttackPayload } from './schemas'
import { ValidationError } from './service'

interface Props {
  initial: AttackDraft
  submitLabel: string
  onSubmit: (payload: AttackPayload) => Promise<void>
}

/** Formulário de crise dividido em seções. Apenas data/horário de início são obrigatórios. */
export function AttackForm({ initial, submitLabel, onSubmit }: Props) {
  const f = useForm<AttackDraft>({ defaultValues: initial })
  const v = f.watch()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof AttackDraft>(k: K, value: AttackDraft[K]) => f.setValue(k as never, value as never, { shouldDirty: true })
  const err = (k: keyof AttackDraft) => f.formState.errors[k]?.message as string | undefined

  const submit = f.handleSubmit(async (draft) => {
    setError(''); setBusy(true)
    try {
      await onSubmit(draftToPayload(draft))
    } catch (e) {
      if (e instanceof ValidationError) {
        for (const i of e.issues) if (i.path) f.setError(i.path as never, { message: i.message })
        setError(`Revise os campos destacados. ${e.message}`)
      } else setError(friendlyError(e))
    } finally { setBusy(false) }
  })

  // Sintomas: um item por (sintoma, fase)
  const symptomKeys = [...new Set(v.symptoms.map((s) => s.symptom))]
  const setSymptoms = (keys: string[]) =>
    set('symptoms', keys.flatMap((k): AttackSymptom[] => {
      const kept = v.symptoms.filter((s) => s.symptom === k)
      return kept.length ? kept : [{ symptom: k, phase: 'during' }]
    }))
  const togglePhase = (symptom: string, phases: string[]) =>
    set('symptoms', [
      ...v.symptoms.filter((s) => s.symptom !== symptom),
      ...(phases.length ? phases : ['during']).map((p): AttackSymptom => ({ symptom, phase: p as SymptomPhase })),
    ])

  // Desencadeantes
  const setFactors = (category: string, factors: string[]) =>
    set('triggers', [
      ...v.triggers.filter((t) => t.category !== category),
      ...factors.map((factor): AttackTrigger => v.triggers.find((t) => t.category === category && t.factor === factor) ?? { category, factor, relation: 'suspected' }),
    ])
  const patchTrigger = (t: AttackTrigger, patch: Partial<AttackTrigger>) =>
    set('triggers', v.triggers.map((x) => (x.category === t.category && x.factor === t.factor ? { ...x, ...patch } : x)))

  const duration = minutesBetween(v.started_at, v.ended_at || null)

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Section title="Identificação da crise" open>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Início (data e horário) *" error={err('started_at')}>
            <Input type="datetime-local" max={nowLocal()} {...f.register('started_at')} />
          </Field>
          <div className="flex items-end pb-2">
            <Checkbox label="Horário aproximado (não sei exatamente)" checked={v.start_is_approximate} onChange={(x) => set('start_is_approximate', x)} />
          </div>
        </div>
        <Field label="Tipo de início">
          <Chips single options={[{ value: 'sudden', label: 'Súbito' }, { value: 'gradual', label: 'Gradual' }]} value={v.onset_type ? [v.onset_type] : []}
            onChange={(x) => set('onset_type', (x[0] as AttackDraft['onset_type']) ?? null)} />
        </Field>
        <Field label="A crise começou durante o sono?">
          <Chips single options={[{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }, { value: 'unknown', label: 'Não sei' }]}
            value={v.started_during_sleep ? [v.started_during_sleep] : []} onChange={(x) => set('started_during_sleep', (x[0] as AttackDraft['started_during_sleep']) ?? null)} />
        </Field>
      </Section>

      <Section title="Intensidade" hint="0 a 10 — preencha o que souber" open>
        <Field label="Intensidade máxima (pior momento)" error={err('intensity_max')}><IntensityInput value={v.intensity_max} onChange={(x) => set('intensity_max', x)} /></Field>
        <Field label="Intensidade no início"><IntensityInput value={v.intensity_initial} onChange={(x) => set('intensity_initial', x)} /></Field>
        <p className="text-xs text-muted">Outras medições ao longo da crise (inclusive a intensidade atual e após medicamentos) podem ser adicionadas depois de salvar.</p>
      </Section>

      <Section title="Localização" hint={v.locations.length ? `${v.locations.length} selecionada(s)` : undefined}>
        <Field label="Onde dói? (pode marcar mais de uma)"><Chips options={LOCATIONS} value={v.locations} onChange={(x) => set('locations', x)} /></Field>
        {v.locations.includes('other') && <Field label="Outra localização" error={err('location_other')}><Input {...f.register('location_other')} maxLength={200} /></Field>}
        <Field label="Lado"><Chips single options={SIDES} value={v.side ? [v.side] : []} onChange={(x) => set('side', (x[0] as AttackDraft['side']) ?? null)} /></Field>
        <p className="text-xs text-muted">Se a dor mudar de lugar durante a crise, registre uma nova avaliação depois de salvar.</p>
      </Section>

      <Section title="Características da dor" hint={v.pain_qualities.length ? `${v.pain_qualities.length} selecionada(s)` : undefined}>
        <Chips options={PAIN_QUALITIES} value={v.pain_qualities} onChange={(x) => set('pain_qualities', x)} />
        {v.pain_qualities.includes('other') && <Field label="Outra característica"><Input {...f.register('quality_other')} maxLength={200} /></Field>}
      </Section>

      <Section title="Agravamento">
        <Chips options={AGGRAVATING} value={v.aggravating}
          onChange={(x) => set('aggravating', x.includes('none_known') && !v.aggravating.includes('none_known') ? ['none_known'] : x.filter((k) => k !== 'none_known' || x.length === 1))} />
        {err('aggravating') && <Alert tone="bad">{err('aggravating')}</Alert>}
        {v.aggravating.includes('other') && <Field label="Outro fator de agravamento"><Input {...f.register('aggravating_other')} maxLength={200} /></Field>}
      </Section>

      <Section title="Sintomas associados" hint={symptomKeys.length ? `${symptomKeys.length} selecionado(s)` : undefined}>
        <Chips options={SYMPTOMS} value={symptomKeys} onChange={setSymptoms} />
        {symptomKeys.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Quando cada sintoma apareceu?</p>
            {symptomKeys.map((k) => (
              <div key={k} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface p-2">
                <span className="min-w-40 text-sm">{labelOf('symptom', k)}</span>
                <Chips options={SYMPTOM_PHASES} value={v.symptoms.filter((s) => s.symptom === k).map((s) => s.phase)} onChange={(p) => togglePhase(k, p)} />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Duração e término">
        <Checkbox label="Ainda estou com dor" checked={v.still_ongoing} onChange={(x) => { set('still_ongoing', x); if (x) set('ended_at', '') }} />
        {!v.still_ongoing && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Término (data e horário)" hint="Deixe em branco se não souber — o término não será presumido." error={err('ended_at')}>
                <Input type="datetime-local" min={v.started_at} max={nowLocal()} {...f.register('ended_at')} />
              </Field>
              <div className="flex items-end gap-2 pb-2">
                <Button small variant="secondary" onClick={() => set('ended_at', nowLocal())}>Terminou agora</Button>
                {duration !== null && duration >= 0 && <span className="text-sm text-muted">Duração: <strong>{fmtDuration(duration)}</strong></span>}
              </div>
            </div>
            <Field label="Intensidade ao término"><IntensityInput value={v.intensity_final} onChange={(x) => set('intensity_final', x)} /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Melhorou espontaneamente?"><TriState value={v.improved_spontaneously} onChange={(x) => set('improved_spontaneously', x)} /></Field>
              <Field label="Melhorou após medicação?"><TriState value={v.improved_after_medication} onChange={(x) => set('improved_after_medication', x)} /></Field>
              <Field label="A crise foi interrompida pelo sono?"><TriState value={v.ended_by_sleep} onChange={(x) => set('ended_by_sleep', x)} /></Field>
            </div>
          </>
        )}
      </Section>

      <Section title="Possíveis desencadeantes e contexto" hint={v.triggers.length ? `${v.triggers.length} selecionado(s)` : undefined}>
        <p className="text-xs text-muted">Marque o que aconteceu antes da crise ou o que você suspeita estar relacionado. Uma associação não significa que o fator causou a dor.</p>
        {TRIGGER_CATEGORIES.map((c) => (
          <Field key={c.value} label={c.label}>
            <Chips options={c.factors} value={v.triggers.filter((t) => t.category === c.value).map((t) => t.factor)} onChange={(x) => setFactors(c.value, x)} />
          </Field>
        ))}
        {v.triggers.map((t) => (
          <div key={`${t.category}:${t.factor}`} className="space-y-2 rounded-lg bg-surface p-3">
            <p className="text-sm font-semibold">{labelOf('triggerCategory', t.category)} — {labelOf('factor', t.factor)}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Relação com a crise">
                <Select options={TRIGGER_RELATIONS} value={t.relation} onChange={(e) => patchTrigger(t, { relation: e.target.value as AttackTrigger['relation'] })} />
              </Field>
              <Field label="Quando ocorreu (aproximado)">
                <Input value={t.when ?? ''} maxLength={80} placeholder="ex.: noite anterior" onChange={(e) => patchTrigger(t, { when: e.target.value || undefined })} />
              </Field>
            </div>
            <Field label="Quanto você confia nessa associação?" hint="1 = pouca confiança · 5 = muita confiança">
              <Chips single options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))} value={t.confidence ? [String(t.confidence)] : []}
                onChange={(x) => patchTrigger(t, { confidence: x[0] ? Number(x[0]) : undefined })} />
            </Field>
            <Field label="Observações"><Input value={t.note ?? ''} maxLength={300} onChange={(e) => patchTrigger(t, { note: e.target.value || undefined })} /></Field>
          </div>
        ))}
      </Section>

      <Section title="Impacto nas atividades e observações">
        <Field label="Impacto nas atividades diárias">
          <Chips single options={FUNCTIONAL_IMPACT} value={v.functional_impact === null ? [] : [String(v.functional_impact)]}
            onChange={(x) => set('functional_impact', x[0] === undefined ? null : Number(x[0]))} />
        </Field>
        <Field label="Observações" error={err('notes')}><Textarea {...f.register('notes')} maxLength={4000} /></Field>
      </Section>

      {error && <Alert tone="bad">{error}</Alert>}
      <div className="sticky bottom-16 z-10 md:bottom-2">
        <Button type="submit" className="w-full shadow-lg" disabled={busy}>{busy ? 'Salvando…' : submitLabel}</Button>
      </div>
    </form>
  )
}
