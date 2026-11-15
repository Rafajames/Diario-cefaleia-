import { Alert, Button, Checkbox, Chips, Field, Input, Modal, Textarea, TriState } from '@/components/ui'
import { ACTIVITY_LEVELS } from '@/config/clinical-options'
import { useAction, useDraft } from '@/hooks/useDraft'
import { blank, num } from '@/services/crud'
import type { DailyLog, DateOnly } from '@/types/database'
import { fmtDate } from '@/utils/datetime'
import { saveDailyLog } from './service'

const FIVE = (low: string, high: string) => [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: n === 1 ? `1 · ${low}` : n === 5 ? `5 · ${high}` : String(n) }))
const one = (v: number | null) => (v === null ? [] : [String(v)])
const pick = (x: string[]) => (x[0] ? Number(x[0]) : null)

/** Registro diário — todos os campos complementares são opcionais. */
export function DailyLogModal({ patientId, date, existing, hasAttack, onClose }: { patientId: string; date: DateOnly; existing: DailyLog | null; hasAttack: boolean; onClose: () => void }) {
  const { v, set } = useDraft({
    pain_free_confirmed: existing?.pain_free_confirmed ?? false,
    sleep_quality: existing?.sleep_quality ?? null,
    sleep_hours: existing?.sleep_hours?.toString() ?? '',
    hydration_liters: existing?.hydration_liters?.toString() ?? '',
    meals: existing?.meals ?? '',
    fasting: existing?.fasting ?? null,
    caffeine_servings: existing?.caffeine_servings?.toString() ?? '',
    physical_activity: existing?.physical_activity ?? null,
    stress: existing?.stress ?? null,
    mood: existing?.mood ?? null,
    notes: existing?.notes ?? '',
  })
  const act = useAction()
  const save = () => act.run(() => saveDailyLog(patientId, {
    ...v, log_date: date,
    pain_free_confirmed: hasAttack ? false : v.pain_free_confirmed,
    sleep_hours: num(v.sleep_hours), hydration_liters: num(v.hydration_liters),
    caffeine_servings: num(v.caffeine_servings) === null ? null : Math.round(num(v.caffeine_servings)!),
    meals: blank(v.meals), notes: blank(v.notes),
  }), onClose)
  return (
    <Modal title={`Registro diário — ${fmtDate(date)}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-muted">Preencha apenas o que quiser. Nenhum campo é obrigatório.</p>
        {hasAttack
          ? <Alert tone="info">Há crise registrada neste dia, por isso ele não pode ser marcado como "sem dor".</Alert>
          : <Checkbox label={<strong>Confirmo que este foi um dia sem dor de cabeça</strong>} checked={v.pain_free_confirmed} onChange={(x) => set('pain_free_confirmed', x)} />}
        <Field label="Qualidade do sono"><Chips single options={FIVE('péssima', 'ótima')} value={one(v.sleep_quality)} onChange={(x) => set('sleep_quality', pick(x))} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Horas dormidas" error={act.fields.sleep_hours}><Input inputMode="decimal" value={v.sleep_hours} onChange={(e) => set('sleep_hours', e.target.value)} /></Field>
          <Field label="Hidratação (litros, aprox.)" error={act.fields.hydration_liters}><Input inputMode="decimal" value={v.hydration_liters} onChange={(e) => set('hydration_liters', e.target.value)} /></Field>
          <Field label="Cafeína (xícaras/doses)" error={act.fields.caffeine_servings}><Input inputMode="numeric" value={v.caffeine_servings} onChange={(e) => set('caffeine_servings', e.target.value)} /></Field>
          <Field label="Jejum prolongado?"><TriState value={v.fasting} onChange={(x) => set('fasting', x)} /></Field>
        </div>
        <Field label="Alimentação"><Input value={v.meals} maxLength={500} placeholder="ex.: refeições regulares, pulou o almoço" onChange={(e) => set('meals', e.target.value)} /></Field>
        <Field label="Atividade física"><Chips single options={ACTIVITY_LEVELS} value={v.physical_activity ? [v.physical_activity] : []} onChange={(x) => set('physical_activity', (x[0] as DailyLog['physical_activity']) ?? null)} /></Field>
        <Field label="Estresse"><Chips single options={FIVE('nenhum', 'muito alto')} value={one(v.stress)} onChange={(x) => set('stress', pick(x))} /></Field>
        <Field label="Humor"><Chips single options={FIVE('muito ruim', 'muito bom')} value={one(v.mood)} onChange={(x) => set('mood', pick(x))} /></Field>
        <Field label="Outras observações"><Textarea value={v.notes} maxLength={2000} onChange={(e) => set('notes', e.target.value)} /></Field>
        {act.error && <Alert tone="bad">{act.error}</Alert>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={act.busy} onClick={save}>Salvar</Button></div>
      </div>
    </Modal>
  )
}
