/**
 * Ciclo menstrual — associação temporal com a cefaleia (funções puras).
 *
 * Referência: critério temporal da ICHD-3 — dias −2 a +3 da menstruação, em que o
 * dia +1 é o primeiro dia de sangramento e não existe dia 0. Em deslocamento a partir
 * da data de início: de −2 a +2 dias (days_before = 2, days_after = 2).
 *
 * O resultado é um POSSÍVEL PADRÃO TEMPORAL. Não é diagnóstico de enxaqueca menstrual.
 */
import type { Administration, Attack, DateOnly, MenstrualCycle, Period } from '@/types/database'
import { addDays, dateOf } from '@/utils/datetime'
import { describe, type Stats } from '@/utils/stats'
import { attackDays, attackPeak } from '@/modules/calendar/calc'

export interface MenstrualWindow {
  days_before: number
  days_after: number
  min_cycles: number
  min_positive: number
}

export type CyclePhase = 'pre' | 'bleeding' | 'post' | 'other'

/** Fase do dia em relação aos sangramentos registrados. Fim ausente: só o 1º dia conta como sangramento. */
export function phaseOf(date: DateOnly, cycles: MenstrualCycle[], w: MenstrualWindow): CyclePhase {
  let phase: CyclePhase = 'other'
  for (const c of cycles) {
    const end = c.end_date ?? c.start_date
    if (date >= c.start_date && date <= end) return 'bleeding'
    if (date >= addDays(c.start_date, -w.days_before) && date < c.start_date) phase = 'pre'
    else if (phase === 'other' && c.end_date && date > end && date <= addDays(end, w.days_after)) phase = 'post'
  }
  return phase
}

export const inPerimenstrualWindow = (date: DateOnly, c: MenstrualCycle, w: MenstrualWindow) =>
  date >= addDays(c.start_date, -w.days_before) && date <= addDays(c.start_date, w.days_after)

export interface CycleFinding {
  start_date: DateOnly
  end_date: DateOnly | null
  incomplete: boolean
  windowFrom: DateOnly
  windowTo: DateOnly
  headacheDaysInWindow: DateOnly[]
  hadHeadacheInWindow: boolean
}

export interface MenstrualAnalysis {
  window: MenstrualWindow
  cycles: CycleFinding[]
  /** Ciclos considerados na regra de repetição (os mais recentes, até min_cycles) */
  evaluatedCycles: number
  positiveCycles: number
  pattern: 'possible_pattern' | 'not_observed' | 'insufficient_data'
  headacheDaysByPhase: Record<CyclePhase, number>
  peakIntensityByPhase: Record<CyclePhase, Stats>
  completeReliefByPhase: Record<CyclePhase, { reported: number; complete: number }>
  note: string
}

const PHASES: CyclePhase[] = ['pre', 'bleeding', 'post', 'other']

export function analyzeMenstrualAssociation(
  cycles: MenstrualCycle[],
  attacks: Attack[],
  administrations: Administration[],
  w: MenstrualWindow,
  today: DateOnly,
  period?: Period,
): MenstrualAnalysis {
  const live = attacks.filter((a) => !a.deleted_at)
  const sorted = [...cycles].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const headacheDays = new Set(live.flatMap((a) => attackDays(a, today)))

  const findings: CycleFinding[] = sorted.map((c) => {
    const windowFrom = addDays(c.start_date, -w.days_before)
    const windowTo = addDays(c.start_date, w.days_after)
    const days = [...headacheDays].filter((d) => d >= windowFrom && d <= windowTo).sort()
    return {
      start_date: c.start_date,
      end_date: c.end_date,
      incomplete: !c.end_date,
      windowFrom,
      windowTo,
      headacheDaysInWindow: days,
      hadHeadacheInWindow: days.length > 0,
    }
  })

  // Só avalia ciclos cuja janela já terminou (não conclui sobre janela em andamento)
  const closed = findings.filter((f) => f.windowTo <= today)
  const recent = closed.slice(-w.min_cycles)
  const positive = recent.filter((f) => f.hadHeadacheInWindow).length
  const pattern: MenstrualAnalysis['pattern'] =
    recent.length < w.min_cycles ? 'insufficient_data' : positive >= w.min_positive ? 'possible_pattern' : 'not_observed'

  const inPeriod = (d: DateOnly) => !period || (d >= period.from && d <= period.to)
  const byPhase = Object.fromEntries(PHASES.map((p) => [p, 0])) as Record<CyclePhase, number>
  for (const d of headacheDays) if (inPeriod(d)) byPhase[phaseOf(d, sorted, w)]++

  const peaks = Object.fromEntries(PHASES.map((p) => [p, [] as (number | null)[]])) as Record<CyclePhase, (number | null)[]>
  const attackPhase = new Map<string, CyclePhase>()
  for (const a of live) {
    const start = dateOf(a.started_at)
    if (!inPeriod(start)) continue
    const ph = phaseOf(start, sorted, w)
    attackPhase.set(a.id, ph)
    peaks[ph].push(attackPeak(a))
  }

  const relief = Object.fromEntries(PHASES.map((p) => [p, { reported: 0, complete: 0 }])) as MenstrualAnalysis['completeReliefByPhase']
  for (const adm of administrations) {
    const ph = adm.attack_id ? attackPhase.get(adm.attack_id) : undefined
    if (!ph || !adm.outcome || adm.outcome === 'unknown') continue
    relief[ph].reported++
    if (adm.outcome === 'complete') relief[ph].complete++
  }

  const note =
    pattern === 'insufficient_data'
      ? `Dados insuficientes: são necessários ${w.min_cycles} ciclos registrados com a janela perimenstrual concluída (há ${recent.length}).`
      : pattern === 'possible_pattern'
        ? `Possível padrão temporal: houve cefaleia na janela perimenstrual em ${positive} dos ${recent.length} ciclos mais recentes. Isto não é um diagnóstico.`
        : `Padrão não observado: houve cefaleia na janela perimenstrual em ${positive} dos ${recent.length} ciclos mais recentes.`

  return {
    window: w,
    cycles: findings,
    evaluatedCycles: recent.length,
    positiveCycles: positive,
    pattern,
    headacheDaysByPhase: byPhase,
    peakIntensityByPhase: Object.fromEntries(PHASES.map((p) => [p, describe(peaks[p])])) as Record<CyclePhase, Stats>,
    completeReliefByPhase: relief,
    note,
  }
}

export const PHASE_LABEL: Record<CyclePhase, string> = {
  pre: 'Dias anteriores ao sangramento',
  bleeding: 'Durante o sangramento',
  post: 'Dias posteriores ao sangramento',
  other: 'Outros períodos do ciclo',
}
