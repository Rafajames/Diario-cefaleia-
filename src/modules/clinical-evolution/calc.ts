/**
 * Evolução clínica — indicadores e comparação entre períodos (funções puras).
 *
 * Princípios:
 *  - A evolução é avaliada por dimensão. Não existe pontuação global que possa esconder
 *    piora em uma dimensão atrás de melhora em outra.
 *  - Falta de registro nunca é contada como ausência de dor.
 *  - Todo indicador carrega período, nº de registros, dados ausentes e critério de cálculo.
 *  - Nada aqui é diagnóstico nem afirma causalidade.
 */
import type { Administration, DateOnly, Dataset, Period } from '@/types/database'
import { DEFAULT_SETTINGS, type ClinicalSettings } from '@/config/clinical-options'
import { addDays, dateOf, eachDay, minutesBetween, periodDays } from '@/utils/datetime'
import { countBy, describe, pct, round, type Stats } from '@/utils/stats'
import { attackDays, attackPeak } from '@/modules/calendar/calc'
import { summarizeResponses, type ResponseSummary } from '@/modules/treatment-response/calc'
import { analyzeMenstrualAssociation, type MenstrualAnalysis } from '@/modules/menstruation/calc'

export interface Ranked {
  key: string
  count: number
  pct: number | null
  meanPeak?: number | null
}

export interface TriggerRow {
  category: string
  factor: string
  attacks: number
  suspected: number
  occurredBefore: number
  pctOfAttacks: number | null
}

export interface Indicators {
  period: Period
  days: number
  computedAt: string
  // Frequência
  attackCount: number
  headacheDays: number
  painFreeConfirmedDays: number
  /** Dias sem crise e sem confirmação de "sem dor": NÃO são dias sem dor */
  unknownDays: number
  /** (dias com cefaleia + dias sem dor confirmados) / dias do período */
  coverage: number
  // Intensidade
  intensityInitial: Stats
  intensityPeak: Stats
  intensityFinal: Stats
  intensityAfterTreatment: Stats
  peakDistribution: number[] // índice = intensidade 0..10
  // Duração
  durationMinutes: Stats
  totalMinutes: number
  hoursWithPain: number
  attacksWithoutEnd: number
  // Distribuições
  locations: Ranked[]
  sides: Ranked[]
  qualities: Ranked[]
  symptoms: Ranked[]
  triggers: TriggerRow[]
  // Medicação
  administrations: number
  acuteMedicationDays: number
  byMedication: Ranked[]
  byClass: Ranked[]
  response: ResponseSummary | null
  responseByMedication: ResponseSummary[]
  adverseEffects: number
  // Impacto funcional (0..3)
  functionalImpact: Stats
  disablingAttacks: number
  impactDistribution: number[]
  // Menstruação (null quando não há ciclos disponíveis/autorizados)
  menstrual: MenstrualAnalysis | null
  // Hábitos (registro diário)
  habits: { logs: number; sleepHours: Stats; sleepQuality: Stats; hydration: Stats; caffeine: Stats; stress: Stats; mood: Stats }
}

export const CRITERIA: Record<string, string> = {
  headacheDays: 'Dias do período cobertos por ao menos uma crise (do início ao término; sem término informado conta apenas o dia de início).',
  painFreeConfirmedDays: 'Dias marcados como "sem dor" pelo paciente e sem crise registrada.',
  unknownDays: 'Dias sem crise e sem confirmação de ausência de dor. Não são contados como dias sem dor.',
  attackCount: 'Crises com início dentro do período.',
  intensityPeak: 'Maior intensidade conhecida de cada crise (0–10).',
  intensityAfterTreatment: 'Menor intensidade nas avaliações posteriores à medicação, por crise.',
  durationMinutes: 'Término menos início, apenas para crises com ambos os horários. O término nunca é presumido.',
  acuteMedicationDays: 'Dias distintos com ao menos uma administração de medicamento para crise.',
  response: 'Proporções sobre administrações com desfecho informado. Associação temporal, não causal.',
  functionalImpact: 'Escala 0–3 informada pelo paciente por crise (0 nenhum, 3 incapacitante).',
}

function rank(map: Map<string, number>, total: number, extra?: (key: string) => number | null): Ranked[] {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count, pct: pct(count, total), ...(extra ? { meanPeak: extra(key) } : {}) }))
    .sort((a, b) => b.count - a.count)
}

export interface ComputeOptions {
  today: DateOnly
  settings?: Pick<ClinicalSettings, 'menstrual_window'>
  now?: () => string
}

export function computeIndicators(ds: Dataset, period: Period, opts: ComputeOptions): Indicators {
  const inRange = (d: DateOnly) => d >= period.from && d <= period.to
  const live = ds.attacks.filter((a) => !a.deleted_at)
  const attacks = live.filter((a) => inRange(dateOf(a.started_at)))
  const ids = new Set(attacks.map((a) => a.id))
  const adms = ds.administrations.filter((m) => inRange(dateOf(m.taken_at)))
  const logs = ds.dailyLogs.filter((l) => inRange(l.log_date))
  const days = periodDays(period)

  // Dias com cefaleia: crises iniciadas antes também contam nos dias que cobrem dentro do período
  const headacheSet = new Set(live.flatMap((a) => attackDays(a, opts.today)).filter(inRange))
  const painFree = logs.filter((l) => l.pain_free_confirmed && !headacheSet.has(l.log_date)).length
  const headacheDays = headacheSet.size

  const peaks = attacks.map(attackPeak)
  const distribution = Array(11).fill(0) as number[]
  for (const p of peaks) if (p !== null) distribution[p]++

  const durations = attacks.map((a) => minutesBetween(a.started_at, a.ended_at))
  const known = durations.filter((d): d is number => d !== null)
  const totalMinutes = known.reduce((a, b) => a + b, 0)

  const afterTreatment = attacks.filter((a) => ds.administrations.some((m) => m.attack_id === a.id)).map((a) => {
    const admIds = new Set(ds.administrations.filter((m) => m.attack_id === a.id).map((m) => m.id))
    const vals = ds.assessments
      .filter((s) => s.attack_id === a.id && s.administration_id && admIds.has(s.administration_id) && s.intensity !== null)
      .map((s) => s.intensity as number)
    return vals.length ? Math.min(...vals) : null
  })

  const locCount = new Map<string, number>()
  const locPeaks = new Map<string, number[]>()
  for (const a of attacks) {
    const p = attackPeak(a)
    for (const l of new Set(a.locations)) {
      locCount.set(l, (locCount.get(l) ?? 0) + 1)
      if (p !== null) locPeaks.set(l, [...(locPeaks.get(l) ?? []), p])
    }
  }
  const symptomCount = new Map<string, number>()
  for (const a of attacks) for (const s of new Set(a.symptoms.map((x) => x.symptom))) symptomCount.set(s, (symptomCount.get(s) ?? 0) + 1)
  const qualityCount = new Map<string, number>()
  for (const a of attacks) for (const q of new Set(a.pain_qualities)) qualityCount.set(q, (qualityCount.get(q) ?? 0) + 1)

  const trig = new Map<string, TriggerRow>()
  for (const a of attacks) {
    const seen = new Set<string>()
    for (const t of a.triggers) {
      const k = `${t.category}:${t.factor}`
      const row = trig.get(k) ?? { category: t.category, factor: t.factor, attacks: 0, suspected: 0, occurredBefore: 0, pctOfAttacks: null }
      if (!seen.has(k)) row.attacks++
      seen.add(k)
      if (t.relation === 'suspected') row.suspected++
      else row.occurredBefore++
      trig.set(k, row)
    }
  }

  const impact = attacks.map((a) => a.functional_impact)
  const impactDistribution = [0, 0, 0, 0]
  for (const v of impact) if (v !== null) impactDistribution[v]++

  const allResponse = summarizeResponses(adms, live, ds.assessments, 'all')[0] ?? null

  return {
    period,
    days,
    computedAt: (opts.now ?? (() => new Date().toISOString()))(),
    attackCount: attacks.length,
    headacheDays,
    painFreeConfirmedDays: painFree,
    unknownDays: days - headacheDays - painFree,
    coverage: round((headacheDays + painFree) / days, 3),
    intensityInitial: describe(attacks.map((a) => a.intensity_initial)),
    intensityPeak: describe(peaks),
    intensityFinal: describe(attacks.map((a) => a.intensity_final)),
    intensityAfterTreatment: describe(afterTreatment),
    peakDistribution: distribution,
    durationMinutes: describe(durations),
    totalMinutes,
    hoursWithPain: round(totalMinutes / 60),
    attacksWithoutEnd: attacks.filter((a) => !a.ended_at).length,
    locations: rank(locCount, attacks.length, (k) => {
      const v = locPeaks.get(k)
      return v?.length ? round(v.reduce((a, b) => a + b, 0) / v.length) : null
    }),
    sides: rank(countBy(attacks, (a) => a.side), attacks.length),
    qualities: rank(qualityCount, attacks.length),
    symptoms: rank(symptomCount, attacks.length),
    triggers: [...trig.values()].map((t) => ({ ...t, pctOfAttacks: pct(t.attacks, attacks.length) })).sort((a, b) => b.attacks - a.attacks),
    administrations: adms.length,
    acuteMedicationDays: new Set(adms.map((m) => dateOf(m.taken_at))).size,
    byMedication: rank(countBy(adms, (m) => m.medication_name.trim()), adms.length),
    byClass: rank(countBy(adms, (m) => m.category || 'other'), adms.length),
    response: allResponse,
    responseByMedication: summarizeResponses(adms, live, ds.assessments, 'medication'),
    adverseEffects: adms.filter((m) => m.adverse_effect).length,
    functionalImpact: describe(impact),
    disablingAttacks: impactDistribution[3],
    impactDistribution,
    menstrual: ds.cycles.length
      ? analyzeMenstrualAssociation(ds.cycles, live, ds.administrations.filter((m) => m.attack_id && ids.has(m.attack_id)),
          (opts.settings ?? DEFAULT_SETTINGS).menstrual_window, opts.today, period)
      : null,
    habits: {
      logs: logs.length,
      sleepHours: describe(logs.map((l) => l.sleep_hours)),
      sleepQuality: describe(logs.map((l) => l.sleep_quality)),
      hydration: describe(logs.map((l) => l.hydration_liters)),
      caffeine: describe(logs.map((l) => l.caffeine_servings)),
      stress: describe(logs.map((l) => l.stress)),
      mood: describe(logs.map((l) => l.mood)),
    },
  }
}

// ---------------------------------------------------------------------------
// Comparação entre períodos
// ---------------------------------------------------------------------------
export type Trend = 'improved' | 'stable' | 'worsened' | 'changed' | 'insufficient'

export interface EvolutionRules {
  /** Variação relativa mínima para sair de "estável" (0.2 = 20%) */
  relative_threshold: number
  /** Nº mínimo de crises (ou administrações) em cada período para dimensões baseadas em crises */
  min_attacks: number
  /** Cobertura mínima de dias registrados para dimensões baseadas em dias */
  min_coverage: number
}

export interface DimensionResult {
  id: string
  label: string
  unit: string
  current: number | null
  previous: number | null
  delta: number | null
  relativeChange: number | null
  trend: Trend
  /** 'lower' = menor é melhor; 'higher' = maior é melhor; 'neutral' = só indica mudança */
  better: 'lower' | 'higher' | 'neutral'
  reason: string
  nCurrent: number
  nPrevious: number
}

export function classify(
  current: number | null,
  previous: number | null,
  better: DimensionResult['better'],
  sufficient: boolean,
  rules: EvolutionRules,
): { trend: Trend; delta: number | null; relativeChange: number | null; reason: string } {
  if (!sufficient || current === null || previous === null) {
    return { trend: 'insufficient', delta: null, relativeChange: null, reason: 'Dados insuficientes em um dos períodos.' }
  }
  const delta = round(current - previous, 2)
  const relativeChange = previous !== 0 ? round((current - previous) / Math.abs(previous), 3) : current === 0 ? 0 : null
  // Base zero: qualquer aparecimento é mudança relevante
  const significant = relativeChange === null ? true : Math.abs(relativeChange) >= rules.relative_threshold
  const threshold = `${Math.round(rules.relative_threshold * 100)}%`
  if (!significant) return { trend: 'stable', delta, relativeChange, reason: `Variação menor que ${threshold}.` }
  if (better === 'neutral') return { trend: 'changed', delta, relativeChange, reason: `Variação de ${threshold} ou mais (sem juízo de melhora/piora).` }
  const improved = better === 'lower' ? delta < 0 : delta > 0
  return { trend: improved ? 'improved' : 'worsened', delta, relativeChange, reason: `Variação de ${threshold} ou mais.` }
}

export function compareIndicators(cur: Indicators, prev: Indicators, rules: EvolutionRules = DEFAULT_SETTINGS.evolution_rules): DimensionResult[] {
  const dayBased = cur.coverage >= rules.min_coverage && prev.coverage >= rules.min_coverage
  const attackBased = cur.attackCount >= rules.min_attacks && prev.attackCount >= rules.min_attacks
  const per30 = (v: number, days: number) => round((v / days) * 30)
  const stat = (c: Stats, p: Stats) => c.n >= rules.min_attacks && p.n >= rules.min_attacks
  const resp = (r: ResponseSummary | null) => r ?? null

  type Draft = Omit<DimensionResult, 'trend' | 'delta' | 'relativeChange' | 'reason'> & { sufficient: boolean }
  const dims: Draft[] = []
  const add = (id: string, label: string, unit: string, current: number | null, previous: number | null,
    better: DimensionResult['better'], sufficient: boolean, nCurrent: number, nPrevious: number) =>
    dims.push({ id, label, unit, current, previous, better, nCurrent, nPrevious, sufficient })

  add('headache_days', 'Dias com cefaleia', 'dias/30', per30(cur.headacheDays, cur.days), per30(prev.headacheDays, prev.days), 'lower', dayBased, cur.days - cur.unknownDays, prev.days - prev.unknownDays)
  add('attacks', 'Número de crises', 'crises/30', per30(cur.attackCount, cur.days), per30(prev.attackCount, prev.days), 'lower', dayBased, cur.attackCount, prev.attackCount)
  add('intensity', 'Intensidade máxima média', '0–10', cur.intensityPeak.mean, prev.intensityPeak.mean, 'lower', stat(cur.intensityPeak, prev.intensityPeak), cur.intensityPeak.n, prev.intensityPeak.n)
  add('duration', 'Duração média das crises', 'min', cur.durationMinutes.mean, prev.durationMinutes.mean, 'lower', stat(cur.durationMinutes, prev.durationMinutes), cur.durationMinutes.n, prev.durationMinutes.n)
  add('pain_hours', 'Horas totais com dor', 'h/30', per30(cur.hoursWithPain, cur.days), per30(prev.hoursWithPain, prev.days), 'lower',
    dayBased && cur.attacksWithoutEnd === 0 && prev.attacksWithoutEnd === 0, cur.durationMinutes.n, prev.durationMinutes.n)
  add('medication_days', 'Dias com medicação para crise', 'dias/30', per30(cur.acuteMedicationDays, cur.days), per30(prev.acuteMedicationDays, prev.days), 'lower', dayBased, cur.administrations, prev.administrations)
  const cr = resp(cur.response), pr = resp(prev.response)
  const rs = (pick: (r: ResponseSummary) => Stats) => !!cr && !!pr && stat(pick(cr), pick(pr))
  add('time_to_medication', 'Tempo até a medicação (mediana)', 'min', cr?.minutesToMedication.median ?? null, pr?.minutesToMedication.median ?? null, 'neutral', rs((r) => r.minutesToMedication), cr?.minutesToMedication.n ?? 0, pr?.minutesToMedication.n ?? 0)
  add('time_to_relief', 'Tempo até o início do alívio (mediana)', 'min', cr?.minutesToReliefOnset.median ?? null, pr?.minutesToReliefOnset.median ?? null, 'lower', rs((r) => r.minutesToReliefOnset), cr?.minutesToReliefOnset.n ?? 0, pr?.minutesToReliefOnset.n ?? 0)
  add('intensity_reduction', 'Redução média da intensidade após medicação', 'pontos', cr?.intensityReduction.mean ?? null, pr?.intensityReduction.mean ?? null, 'higher', rs((r) => r.intensityReduction), cr?.intensityReduction.n ?? 0, pr?.intensityReduction.n ?? 0)
  const enoughOutcomes = (cr?.outcomesReported ?? 0) >= rules.min_attacks && (pr?.outcomesReported ?? 0) >= rules.min_attacks
  add('complete_relief', 'Alívio completo após medicação', '%', cr?.completePct ?? null, pr?.completePct ?? null, 'higher', enoughOutcomes, cr?.outcomesReported ?? 0, pr?.outcomesReported ?? 0)
  const enoughRec = (cr?.recurrenceReported ?? 0) >= rules.min_attacks && (pr?.recurrenceReported ?? 0) >= rules.min_attacks
  add('recurrence', 'Recorrência após medicação', '%', cr?.recurrencePct ?? null, pr?.recurrencePct ?? null, 'lower', enoughRec, cr?.recurrenceReported ?? 0, pr?.recurrenceReported ?? 0)
  add('functional_impact', 'Impacto funcional médio', '0–3', cur.functionalImpact.mean, prev.functionalImpact.mean, 'lower', stat(cur.functionalImpact, prev.functionalImpact), cur.functionalImpact.n, prev.functionalImpact.n)

  const results: DimensionResult[] = dims.map(({ sufficient, ...d }) => {
    const c = classify(d.current, d.previous, d.better, sufficient, rules)
    const reason = c.trend === 'insufficient' && ['headache_days', 'attacks', 'medication_days', 'pain_hours'].includes(d.id) && !dayBased
      ? `Cobertura de registros abaixo de ${Math.round(rules.min_coverage * 100)}% em um dos períodos — dias sem registro não são contados como dias sem dor.`
      : c.trend === 'insufficient' && !attackBased && d.nCurrent + d.nPrevious === 0 ? 'Sem registros para esta dimensão.' : c.reason
    return { ...d, ...c, reason }
  })

  // Mudança de localização: comparação da região mais frequente (apenas "mudou"/"estável")
  const topC = cur.locations[0]?.key ?? null, topP = prev.locations[0]?.key ?? null
  results.push({
    id: 'location', label: 'Localização mais frequente', unit: '', current: null, previous: null, delta: null, relativeChange: null,
    better: 'neutral', nCurrent: cur.attackCount, nPrevious: prev.attackCount,
    trend: !attackBased || !topC || !topP ? 'insufficient' : topC === topP ? 'stable' : 'changed',
    reason: !attackBased || !topC || !topP ? 'Dados insuficientes em um dos períodos.' : `Antes: ${topP}; agora: ${topC}.`,
  })
  return results
}

export const TREND_LABEL: Record<Trend, string> = {
  improved: 'Melhora',
  stable: 'Estabilidade',
  worsened: 'Piora',
  changed: 'Mudou',
  insufficient: 'Dados insuficientes',
}

// ---------------------------------------------------------------------------
// Série mensal (gráficos de evolução)
// ---------------------------------------------------------------------------
export function monthlySeries(ds: Dataset, period: Period, opts: ComputeOptions) {
  const months = [...new Set(eachDay(period.from, period.to).map((d) => d.slice(0, 7)))]
  return months.map((ym) => {
    const [y, m] = ym.split('-').map(Number)
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const from = `${ym}-01` < period.from ? period.from : `${ym}-01`
    const end = `${ym}-${String(last).padStart(2, '0')}`
    const ind = computeIndicators(ds, { from, to: end > period.to ? period.to : end }, opts)
    return {
      month: `${String(m).padStart(2, '0')}/${String(y).slice(2)}`,
      headacheDays: ind.headacheDays,
      painFreeDays: ind.painFreeConfirmedDays,
      unknownDays: ind.unknownDays,
      attacks: ind.attackCount,
      meanPeak: ind.intensityPeak.mean,
      meanDurationHours: ind.durationMinutes.mean === null ? null : round(ind.durationMinutes.mean / 60),
      medicationDays: ind.acuteMedicationDays,
      administrations: ind.administrations,
      meanImpact: ind.functionalImpact.mean,
    }
  })
}

// ---------------------------------------------------------------------------
// Sinalização informativa de uso frequente de medicação aguda
// ---------------------------------------------------------------------------
export interface OveruseSignal {
  classes: string[]
  days: number
  threshold: number
  windowFrom: DateOnly
  windowTo: DateOnly
}

/**
 * Conta dias de uso por grupo de classes nos 30 dias que terminam em "today".
 * Só sinaliza quando a configuração está ativada (após revisão do responsável médico).
 * É um aviso informativo — não é diagnóstico de cefaleia por uso excessivo de medicamentos.
 */
export function overuseSignals(administrations: Administration[], config: ClinicalSettings['overuse_flags'], today: DateOnly): OveruseSignal[] {
  if (!config.enabled) return []
  const from = addDays(today, -29)
  return config.rules.flatMap((rule) => {
    const days = new Set(
      administrations
        .filter((m) => rule.classes.includes(m.category) && dateOf(m.taken_at) >= from && dateOf(m.taken_at) <= today)
        .map((m) => dateOf(m.taken_at)),
    ).size
    return days >= rule.days_per_30 ? [{ classes: rule.classes, days, threshold: rule.days_per_30, windowFrom: from, windowTo: today }] : []
  })
}
