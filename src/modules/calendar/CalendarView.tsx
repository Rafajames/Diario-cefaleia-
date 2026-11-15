import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Alert, Badge, Button, Card, Spinner, cx } from '@/components/ui'
import { labelOf } from '@/config/clinical-options'
import { useAction } from '@/hooks/useDraft'
import { useDataset } from '@/services/dataset'
import { useSettings } from '@/services/settings'
import type { DateOnly } from '@/types/database'
import { MONTHS, fmtDate, todayLocal } from '@/utils/datetime'
import { friendlyError } from '@/utils/errors'
import { usePatientScope } from '@/modules/patients/scope'
import { AttackList } from '@/modules/headache-attacks/AttackList'
import { DailyLogModal } from '@/modules/daily-context/DailyLogForm'
import { setPainFree } from '@/modules/daily-context/service'
import { STATUS_LABEL, buildMonthGrid, monthLoadRange, shiftMonth, summarizeDay, type DayStatus } from './calc'

const CELL: Record<DayStatus, string> = {
  no_record: 'bg-day-none text-ink',
  logged: 'bg-day-none text-ink',
  pain_free: 'bg-day-free text-white',
  mild: 'bg-day-mild text-ink',
  moderate: 'bg-day-moderate text-ink',
  severe: 'bg-day-severe text-white',
  pain_unrated: 'bg-day-unrated text-white',
}
const LEGEND: [string, string][] = [
  ['bg-day-none', 'Sem informação'], ['bg-day-free', 'Sem dor (confirmado)'], ['bg-day-mild', 'Dor leve'], ['bg-day-moderate', 'Dor moderada'],
  ['bg-day-severe', 'Dor intensa'], ['bg-day-unrated', 'Dor sem intensidade'], ['bg-day-menstruation', 'Menstruação'],
]

/** Calendário mensal + painel do dia. Somente leitura quando o escopo é de profissional. */
export function CalendarView() {
  const { patientId, readOnly, menstruationVisible } = usePatientScope()
  const settings = useSettings()
  const today = todayLocal()
  const [ym, setYm] = useState({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) })
  const [selected, setSelected] = useState<DateOnly>(today)
  const range = monthLoadRange(ym.year, ym.month)
  const q = useDataset(patientId, range.from, range.to, { menstruation: menstruationVisible, marginDays: 0 })
  const grid = useMemo(() => buildMonthGrid(ym.year, ym.month), [ym])
  const days = useMemo(() => {
    const map = new Map<DateOnly, ReturnType<typeof summarizeDay>>()
    if (q.data) for (const d of grid.flat()) if (d) map.set(d, summarizeDay(d, q.data, settings.severity_bands, today))
    return map
  }, [q.data, grid, settings.severity_bands, today])
  const go = (delta: number) => setYm((p) => shiftMonth(p.year, p.month, delta))
  const isCurrent = ym.year === Number(today.slice(0, 4)) && ym.month === Number(today.slice(5, 7))
  const sel = days.get(selected) ?? (q.data ? summarizeDay(selected, q.data, settings.severity_bands, today) : null)

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <Button small variant="ghost" aria-label="Mês anterior" onClick={() => go(-1)}>←</Button>
          <div className="text-center">
            <p className="font-semibold">{MONTHS[ym.month - 1]} de {ym.year}</p>
            {!isCurrent && <button type="button" className="text-xs text-brand" onClick={() => { setYm({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }); setSelected(today) }}>Voltar para hoje</button>}
          </div>
          <Button small variant="ghost" aria-label="Próximo mês" disabled={isCurrent} onClick={() => go(1)}>→</Button>
        </div>
        {q.error && <Alert tone="bad">{friendlyError(q.error)}</Alert>}
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">{['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}</div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {grid.flat().map((d, i) => {
            if (!d) return <span key={i} />
            const s = days.get(d)
            const future = d > today
            return (
              <button key={d} type="button" disabled={future} onClick={() => setSelected(d)}
                aria-label={`${fmtDate(d)}: ${s ? STATUS_LABEL[s.status] : 'carregando'}${s?.menstruation ? ', menstruação' : ''}${s?.incomplete ? ', informações incompletas' : ''}`}
                className={cx('relative aspect-square rounded-lg text-sm font-medium transition', future ? 'bg-transparent text-muted/50' : CELL[s?.status ?? 'no_record'],
                  selected === d && 'ring-2 ring-ink ring-offset-1', d === today && 'underline underline-offset-2')}>
                {Number(d.slice(8))}
                {s && s.attacks.length > 1 && <span className="absolute right-0.5 top-0.5 rounded-full bg-ink px-1 text-[10px] leading-4 text-white">{s.attacks.length}</span>}
                {s?.menstruation && <span className="absolute bottom-1 left-1 h-2 w-2 rounded-full border border-white bg-day-menstruation" />}
                {s?.incomplete && <span className="absolute bottom-0.5 right-1 text-[11px] font-bold" title="Informações incompletas">!</span>}
              </button>
            )
          })}
        </div>
        {q.isLoading && <Spinner />}
        <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          {LEGEND.filter(([, l]) => menstruationVisible || l !== 'Menstruação').map(([c, l]) => <li key={l} className="flex items-center gap-1"><span className={cx('h-3 w-3 rounded', c)} />{l}</li>)}
          <li><strong>!</strong> informações incompletas</li>
        </ul>
        <p className="mt-2 text-xs text-muted">Dias em cinza não têm informação — isso não significa que foram dias sem dor.</p>
      </Card>
      {sel && <DayPanel day={sel} patientId={patientId} readOnly={readOnly} administrations={q.data?.administrations ?? []} />}
    </div>
  )
}

function DayPanel({ day, patientId, readOnly, administrations }: { day: ReturnType<typeof summarizeDay>; patientId: string; readOnly: boolean; administrations: import('@/types/database').Administration[] }) {
  const [logOpen, setLogOpen] = useState(false)
  const act = useAction()
  const log = day.dailyLog
  const habits = log && [
    log.sleep_hours !== null && `Sono: ${log.sleep_hours} h`, log.sleep_quality !== null && `Qualidade do sono: ${log.sleep_quality}/5`,
    log.hydration_liters !== null && `Hidratação: ${log.hydration_liters} L`, log.caffeine_servings !== null && `Cafeína: ${log.caffeine_servings}`,
    log.fasting && 'Jejum', log.physical_activity && `Atividade física: ${labelOf('activity', log.physical_activity).toLowerCase()}`,
    log.stress !== null && `Estresse: ${log.stress}/5`, log.mood !== null && `Humor: ${log.mood}/5`, log.meals, log.notes,
  ].filter(Boolean)
  return (
    <Card title={fmtDate(day.date)} action={<Badge tone={day.status === 'pain_free' ? 'good' : day.attacks.length ? 'warn' : 'neutral'}>{STATUS_LABEL[day.status]}</Badge>}>
      <div className="space-y-3">
        {day.menstruation && <Badge tone="info">Menstruação</Badge>}
        {day.conflict && <Alert tone="warn">Este dia foi marcado como "sem dor", mas também tem crise registrada. Revise um dos registros.</Alert>}
        {day.incomplete && !day.conflict && <Alert tone="info">Há crise com informações incompletas (sem término ou sem intensidade).</Alert>}
        {day.attacks.length > 0 && <AttackList attacks={day.attacks} administrations={administrations} linkBase={readOnly ? undefined : '/crises'} />}
        {habits && habits.length > 0 && <p className="rounded-lg bg-surface p-2 text-sm">{habits.join(' · ')}</p>}
        {!day.attacks.length && !log && <p className="text-sm text-muted">Nenhum registro neste dia.</p>}
        {act.error && <Alert tone="bad">{act.error}</Alert>}
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <Link to={`/crises/nova?data=${day.date}`}><Button small>+ Registrar crise</Button></Link>
            {!day.attacks.length && (log?.pain_free_confirmed
              ? <Button small variant="secondary" disabled={act.busy} onClick={() => act.run(() => setPainFree(patientId, day.date, log, false))}>Desfazer "sem dor"</Button>
              : <Button small variant="secondary" disabled={act.busy} onClick={() => act.run(() => setPainFree(patientId, day.date, log, true))}>✓ Dia sem dor</Button>)}
            <Button small variant="ghost" onClick={() => setLogOpen(true)}>{log ? 'Editar registro diário' : 'Registro diário'}</Button>
          </div>
        )}
      </div>
      {logOpen && <DailyLogModal patientId={patientId} date={day.date} existing={log} hasAttack={day.attacks.length > 0} onClose={() => setLogOpen(false)} />}
    </Card>
  )
}
