/**
 * Calendário — regras de cálculo (funções puras).
 * Regra central: ausência de registro NUNCA é tratada como ausência de dor.
 */
import type { Attack, DailyLog, DateOnly, Dataset, MenstrualCycle } from '@/types/database'
import { addDays, dateOf, eachDay, monthPeriod } from '@/utils/datetime'

export type DayStatus = 'no_record' | 'pain_free' | 'mild' | 'moderate' | 'severe' | 'pain_unrated' | 'logged'

export interface SeverityBands {
  mild_max: number
  moderate_max: number
}

export function severityOf(intensity: number | null, bands: SeverityBands): DayStatus {
  if (intensity === null) return 'pain_unrated'
  if (intensity <= 0) return 'pain_unrated'
  if (intensity <= bands.mild_max) return 'mild'
  if (intensity <= bands.moderate_max) return 'moderate'
  return 'severe'
}

/** Maior intensidade conhecida da crise (pico, inicial ou final). */
export function attackPeak(a: Pick<Attack, 'intensity_initial' | 'intensity_max' | 'intensity_final'>): number | null {
  const v = [a.intensity_max, a.intensity_initial, a.intensity_final].filter((x): x is number => x !== null)
  return v.length ? Math.max(...v) : null
}

/**
 * Dias cobertos por uma crise.
 * - Com término: do dia de início ao dia de término.
 * - Em andamento: do início até hoje.
 * - Sem término informado: apenas o dia de início (o término não é presumido).
 */
export function attackDays(a: Pick<Attack, 'started_at' | 'ended_at' | 'still_ongoing'>, today: DateOnly): DateOnly[] {
  const start = dateOf(a.started_at)
  const end = a.ended_at ? dateOf(a.ended_at) : a.still_ongoing && today >= start ? today : start
  return eachDay(start, end)
}

export const isAttackIncomplete = (a: Attack) => (!a.ended_at && !a.still_ongoing) || attackPeak(a) === null

export function isBleedingDay(date: DateOnly, cycles: MenstrualCycle[]): boolean {
  return cycles.some((c) => date >= c.start_date && date <= (c.end_date ?? c.start_date))
}

export interface DaySummary {
  date: DateOnly
  status: DayStatus
  maxIntensity: number | null
  attacks: Attack[]
  dailyLog: DailyLog | null
  menstruation: boolean
  /** Falta término/intensidade em alguma crise, ou o dia foi marcado "sem dor" e também tem crise */
  incomplete: boolean
  conflict: boolean
}

export function summarizeDay(date: DateOnly, ds: Pick<Dataset, 'attacks' | 'dailyLogs' | 'cycles'>, bands: SeverityBands, today: DateOnly): DaySummary {
  const attacks = ds.attacks.filter((a) => !a.deleted_at && attackDays(a, today).includes(date))
  const dailyLog = ds.dailyLogs.find((l) => l.log_date === date) ?? null
  const peaks = attacks.map(attackPeak).filter((v): v is number => v !== null)
  const maxIntensity = peaks.length ? Math.max(...peaks) : null
  const conflict = attacks.length > 0 && !!dailyLog?.pain_free_confirmed
  let status: DayStatus = 'no_record'
  if (attacks.length) status = severityOf(maxIntensity, bands)
  else if (dailyLog?.pain_free_confirmed) status = 'pain_free'
  else if (dailyLog) status = 'logged'
  return {
    date,
    status,
    maxIntensity,
    attacks,
    dailyLog,
    menstruation: isBleedingDay(date, ds.cycles),
    incomplete: conflict || attacks.some(isAttackIncomplete),
    conflict,
  }
}

/** Grade mensal com semanas iniciando no domingo; null = célula fora do mês. */
export function buildMonthGrid(year: number, month: number): (DateOnly | null)[][] {
  const { from, to } = monthPeriod(year, month)
  const firstWeekday = new Date(`${from}T00:00:00Z`).getUTCDay()
  const cells: (DateOnly | null)[] = [...Array(firstWeekday).fill(null), ...eachDay(from, to)]
  while (cells.length % 7) cells.push(null)
  const weeks: (DateOnly | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}

/** Intervalo a carregar para exibir um mês: inclui folga para crises que atravessam a virada do mês. */
export function monthLoadRange(year: number, month: number) {
  const p = monthPeriod(year, month)
  return { from: addDays(p.from, -31), to: addDays(p.to, 1) }
}

export const STATUS_LABEL: Record<DayStatus, string> = {
  no_record: 'Sem informação',
  pain_free: 'Sem dor (confirmado)',
  mild: 'Dor leve',
  moderate: 'Dor moderada',
  severe: 'Dor intensa',
  pain_unrated: 'Dor sem intensidade informada',
  logged: 'Registro diário sem confirmação de dor',
}
