/**
 * Resposta terapêutica — regras de cálculo (funções puras).
 *
 * IMPORTANTE: a sequência temporal (medicação → melhora) NÃO prova que o
 * medicamento causou a melhora. Estes números descrevem o que foi registrado.
 */
import type { Administration, Assessment, Attack } from '@/types/database'
import { minutesBetween } from '@/utils/datetime'
import { describe, pct, type Stats } from '@/utils/stats'

export interface AdministrationIntervals {
  /** Horário da administração − horário de início da crise */
  minutesToMedication: number | null
  /** Horário em que percebeu melhora − horário da administração */
  minutesToReliefOnset: number | null
  /** Horário do melhor resultado − horário da administração */
  minutesToMaxRelief: number | null
  intensityBefore: number | null
  /** Menor intensidade registrada nas avaliações posteriores vinculadas a esta administração */
  lowestIntensityAfter: number | null
  /** intensityBefore − lowestIntensityAfter (positivo = redução) */
  intensityReduction: number | null
  /** Horário da recorrência − horário da administração */
  minutesToRecurrence: number | null
  evaluations: { minutesAfter: number | null; intensity: number | null; reduction: number | null }[]
}

const nonNegative = (v: number | null) => (v !== null && v >= 0 ? v : null)

export function administrationIntervals(
  adm: Administration,
  attack: Pick<Attack, 'started_at'> | null | undefined,
  assessments: Assessment[] = [],
): AdministrationIntervals {
  const own = assessments
    .filter((a) => a.administration_id === adm.id)
    .map((a) => ({
      minutesAfter: a.minutes_after_dose ?? nonNegative(minutesBetween(adm.taken_at, a.assessed_at)),
      intensity: a.intensity,
    }))
    .sort((a, b) => (a.minutesAfter ?? 0) - (b.minutesAfter ?? 0))
  const before = adm.intensity_before
  const after = own.map((e) => e.intensity).filter((v): v is number => v !== null)
  const lowest = after.length ? Math.min(...after) : null
  return {
    minutesToMedication: nonNegative(minutesBetween(attack?.started_at, adm.taken_at)),
    minutesToReliefOnset: nonNegative(minutesBetween(adm.taken_at, adm.relief_started_at)),
    minutesToMaxRelief: nonNegative(minutesBetween(adm.taken_at, adm.max_relief_at)),
    intensityBefore: before,
    lowestIntensityAfter: lowest,
    intensityReduction: before !== null && lowest !== null ? before - lowest : null,
    minutesToRecurrence: nonNegative(minutesBetween(adm.taken_at, adm.recurrence_at)),
    evaluations: own.map((e) => ({
      ...e,
      reduction: before !== null && e.intensity !== null ? before - e.intensity : null,
    })),
  }
}

export interface ResponseSummary {
  key: string
  uses: number
  intensityBefore: Stats
  minutesToMedication: Stats
  minutesToReliefOnset: Stats
  minutesToMaxRelief: Stats
  intensityReduction: Stats
  /** Proporções calculadas apenas sobre administrações com desfecho informado (n = outcomesReported) */
  outcomesReported: number
  completePct: number | null
  partialPct: number | null
  nonePct: number | null
  worsePct: number | null
  /** Recorrência entre as administrações em que o paciente respondeu à pergunta */
  recurrenceReported: number
  recurrencePct: number | null
  rescueCount: number
  adverseEffects: number
  /** Doses distintas registradas — comparar medicamentos exige considerar dose, contexto e gravidade inicial */
  doses: string[]
}

export type GroupBy = 'medication' | 'ingredient' | 'category' | 'all'

const keyOf = (a: Administration, by: GroupBy) =>
  by === 'all' ? 'all'
  : by === 'medication' ? a.medication_name.trim()
  : by === 'ingredient' ? (a.active_ingredient?.trim() || 'Princípio ativo não informado')
  : a.category || 'other'

export function summarizeResponses(
  administrations: Administration[],
  attacks: Attack[],
  assessments: Assessment[],
  by: GroupBy = 'medication',
): ResponseSummary[] {
  const attackById = new Map(attacks.map((a) => [a.id, a]))
  const groups = new Map<string, Administration[]>()
  for (const adm of administrations) {
    const k = keyOf(adm, by)
    groups.set(k, [...(groups.get(k) ?? []), adm])
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const iv = list.map((a) => administrationIntervals(a, a.attack_id ? attackById.get(a.attack_id) : null, assessments))
      const reported = list.filter((a) => a.outcome && a.outcome !== 'unknown')
      const count = (o: string) => reported.filter((a) => a.outcome === o).length
      const recurrence = list.filter((a) => a.recurred !== null)
      return {
        key,
        uses: list.length,
        intensityBefore: describe(list.map((a) => a.intensity_before)),
        minutesToMedication: describe(iv.map((i) => i.minutesToMedication)),
        minutesToReliefOnset: describe(iv.map((i) => i.minutesToReliefOnset)),
        minutesToMaxRelief: describe(iv.map((i) => i.minutesToMaxRelief)),
        intensityReduction: describe(iv.map((i) => i.intensityReduction)),
        outcomesReported: reported.length,
        completePct: pct(count('complete'), reported.length),
        partialPct: pct(count('partial'), reported.length),
        nonePct: pct(count('none'), reported.length),
        worsePct: pct(count('worse'), reported.length),
        recurrenceReported: recurrence.length,
        recurrencePct: pct(recurrence.filter((a) => a.recurred).length, recurrence.length),
        rescueCount: list.filter((a) => a.needed_rescue).length,
        adverseEffects: list.filter((a) => a.adverse_effect).length,
        doses: [...new Set(list.filter((a) => a.dose !== null).map((a) => `${a.dose} ${a.unit ?? ''}`.trim()))],
      }
    })
    .sort((a, b) => b.uses - a.uses)
}

export const RESPONSE_CAVEAT =
  'Dados autorrelatados. A melhora após a medicação não comprova que o medicamento foi o responsável. ' +
  'Comparações entre medicamentos devem considerar diferenças de dose, contexto e gravidade inicial da crise.'
