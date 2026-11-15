/**
 * Datas e horários "de relógio de parede" (sem fuso).
 * Toda a aritmética usa UTC como calendário neutro, para que o fuso do
 * navegador nunca desloque um registro clínico para outro dia.
 */
import type { DateOnly, LocalDateTime, Period } from '@/types/database'

const pad = (n: number) => String(n).padStart(2, '0')
const DAY_MS = 86_400_000

/** Milissegundos de um horário local tratado como UTC. NaN se inválido. */
export function toMs(value: LocalDateTime | DateOnly): number {
  const s = value.length === 10 ? `${value}T00:00:00` : value.slice(0, 19).replace(' ', 'T')
  return Date.parse(`${s.length === 16 ? `${s}:00` : s}Z`)
}

export function fromMs(ms: number): LocalDateTime {
  return new Date(ms).toISOString().slice(0, 19)
}

/** Diferença b − a em minutos; null se faltar algum dos horários. Nunca presume valores ausentes. */
export function minutesBetween(a: LocalDateTime | null | undefined, b: LocalDateTime | null | undefined): number | null {
  if (!a || !b) return null
  const diff = toMs(b) - toMs(a)
  return Number.isFinite(diff) ? Math.round(diff / 60_000) : null
}

export const dateOf = (value: LocalDateTime): DateOnly => value.slice(0, 10)
export const timeOf = (value: LocalDateTime): string => value.slice(11, 16)

export function addDays(date: DateOnly, days: number): DateOnly {
  return fromMs(toMs(date) + days * DAY_MS).slice(0, 10)
}

/** Dias de a até b (b − a). */
export function daysBetween(a: DateOnly, b: DateOnly): number {
  return Math.round((toMs(b) - toMs(a)) / DAY_MS)
}

export function eachDay(from: DateOnly, to: DateOnly): DateOnly[] {
  const out: DateOnly[] = []
  for (let d = from; d <= to && out.length < 4000; d = addDays(d, 1)) out.push(d)
  return out
}

export const periodDays = (p: Period) => daysBetween(p.from, p.to) + 1

/** Período imediatamente anterior, com a mesma duração. */
export function previousPeriod(p: Period): Period {
  const n = periodDays(p)
  return { from: addDays(p.from, -n), to: addDays(p.from, -1) }
}

export function lastDays(n: number, today: DateOnly): Period {
  return { from: addDays(today, -(n - 1)), to: today }
}

/** Horário atual do dispositivo como relógio de parede. */
export function nowLocal(d = new Date()): LocalDateTime {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const todayLocal = (d = new Date()): DateOnly => nowLocal(d).slice(0, 10)

/** Valor para <input type="datetime-local"> */
export const toInput = (v: LocalDateTime | null | undefined) => (v ? v.slice(0, 16).replace(' ', 'T') : '')

export function fmtDate(d: DateOnly | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${day}/${m}/${y}`
}
export function fmtDateTime(v: LocalDateTime | null | undefined): string {
  return v ? `${fmtDate(dateOf(v))} ${timeOf(v)}` : '—'
}
/** Carimbo do servidor (timestamptz) no fuso do dispositivo. */
export function fmtInstant(v: string | null | undefined): string {
  return v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

export function fmtDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return '—'
  const m = Math.round(minutes)
  if (m < 60) return `${m} min`
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const r = m % 60
  return [d ? `${d} d` : '', h ? `${h} h` : '', r ? `${r} min` : ''].filter(Boolean).join(' ')
}

export const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export function monthPeriod(year: number, month: number): Period {
  const from = `${year}-${pad(month)}-01`
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { from, to: `${year}-${pad(month)}-${pad(last)}` }
}
