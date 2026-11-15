/**
 * Conteúdo do relatório individual (função pura, independente de PDF).
 * O gerador de PDF apenas desenha estas seções — o que entra no relatório é decidido aqui.
 */
import { labelOf } from '@/config/clinical-options'
import { INSTITUTION } from '@/config/env'
import type { ClinicalNote, Dataset, Patient, Period, PreventiveTreatment } from '@/types/database'
import { dateOf, fmtDate, fmtDateTime, fmtDuration, minutesBetween } from '@/utils/datetime'
import { attackPeak } from '@/modules/calendar/calc'
import { CRITERIA, TREND_LABEL, type DimensionResult, type Indicators } from '@/modules/clinical-evolution/calc'
import { PHASE_LABEL, type CyclePhase } from '@/modules/menstruation/calc'
import { RESPONSE_CAVEAT } from '@/modules/treatment-response/calc'

export interface ReportSection {
  title: string
  paragraphs?: string[]
  tables?: { head: string[]; body: (string | number)[][]; note?: string }[]
}

export interface ReportInput {
  patientName: string
  patient: Patient | null
  period: Period
  previousPeriod: Period
  current: Indicators
  comparison: DimensionResult[]
  dataset: Dataset
  preventives: PreventiveTreatment[]
  notes: (ClinicalNote & { author_name?: string })[]
  /** false quando quem gera não tem autorização para ver o ciclo menstrual */
  menstruationAuthorized: boolean
  generatedAt: string
  generatedBy: string
  /** Resumo para consulta: só as seções essenciais, sem listar crise a crise nem observações */
  compact?: boolean
}

export interface ReportContent {
  institution: string
  title: string
  subtitle: string
  generatedLine: string
  disclaimers: string[]
  sections: ReportSection[]
}

const v = (x: number | null | undefined, suffix = '') => (x === null || x === undefined ? '—' : `${String(x).replace('.', ',')}${suffix}`)
const dur = (x: number | null) => fmtDuration(x)

export const SELF_REPORT_NOTICE = 'Os registros deste relatório são autorrelatados pelo paciente e não substituem a avaliação clínica.'

export function buildReportContent(i: ReportInput): ReportContent {
  const c = i.current
  const inPeriod = (d: string) => d >= i.period.from && d <= i.period.to
  const attacks = i.dataset.attacks.filter((a) => !a.deleted_at && inPeriod(dateOf(a.started_at))).sort((a, b) => a.started_at.localeCompare(b.started_at))
  const missingIntensity = c.attackCount - c.intensityPeak.n
  const incomplete: string[] = []
  if (c.unknownDays) incomplete.push(`${c.unknownDays} de ${c.days} dias sem informação (não contados como dias sem dor)`)
  if (c.attacksWithoutEnd) incomplete.push(`${c.attacksWithoutEnd} crise(s) sem horário de término (fora dos cálculos de duração)`)
  if (missingIntensity) incomplete.push(`${missingIntensity} crise(s) sem intensidade informada`)

  const p = i.patient
  const sections: ReportSection[] = [
    {
      title: '1. Identificação do paciente',
      tables: [{ head: ['Campo', 'Informação (declarada pelo paciente)'], body: [
        ['Nome', i.patientName || '—'],
        ['Data de nascimento', fmtDate(p?.birth_date)],
        ['Cidade / país', [p?.city, p?.country].filter(Boolean).join(' / ') || '—'],
        ['Início aproximado das dores', p?.pain_onset_approx ?? '—'],
        ['Frequência habitual informada', p?.usual_frequency ?? '—'],
        ['Diagnóstico informado pelo paciente', p?.reported_diagnosis ?? '—'],
        ['Outras condições', p?.comorbidities ?? '—'],
        ['Medicamentos de uso contínuo', p?.continuous_medications ?? '—'],
      ] }],
    },
    {
      title: '2. Período analisado',
      paragraphs: [
        `De ${fmtDate(i.period.from)} a ${fmtDate(i.period.to)} (${c.days} dias). Período de comparação: ${fmtDate(i.previousPeriod.from)} a ${fmtDate(i.previousPeriod.to)}.`,
        `Cobertura de registros: ${Math.round(c.coverage * 100)}% dos dias com informação (crise ou confirmação de dia sem dor).`,
      ],
    },
    {
      title: '3. Dias com cefaleia',
      tables: [{ head: ['Indicador', 'Valor', 'Critério'], body: [
        ['Dias com cefaleia', c.headacheDays, CRITERIA.headacheDays],
        ['Dias sem dor confirmados', c.painFreeConfirmedDays, CRITERIA.painFreeConfirmedDays],
        ['Dias sem informação', c.unknownDays, CRITERIA.unknownDays],
      ] }],
    },
    { title: '4. Número de crises', paragraphs: [`${c.attackCount} crise(s) com início no período. ${CRITERIA.attackCount}`] },
    {
      title: '5. Intensidade (escala 0–10)',
      tables: [{ head: ['Momento', 'Crises com dado', 'Média', 'Mediana', 'Mínima', 'Máxima'], body: [
        ['Início', c.intensityInitial.n, v(c.intensityInitial.mean), v(c.intensityInitial.median), v(c.intensityInitial.min), v(c.intensityInitial.max)],
        ['Pico', c.intensityPeak.n, v(c.intensityPeak.mean), v(c.intensityPeak.median), v(c.intensityPeak.min), v(c.intensityPeak.max)],
        ['Após tratamento', c.intensityAfterTreatment.n, v(c.intensityAfterTreatment.mean), v(c.intensityAfterTreatment.median), v(c.intensityAfterTreatment.min), v(c.intensityAfterTreatment.max)],
        ['Término', c.intensityFinal.n, v(c.intensityFinal.mean), v(c.intensityFinal.median), v(c.intensityFinal.min), v(c.intensityFinal.max)],
      ] }],
    },
    {
      title: '6. Localização',
      tables: [
        { head: ['Região', 'Crises', '% das crises', 'Intensidade máx. média'], body: c.locations.map((l) => [labelOf('location', l.key), l.count, v(l.pct, '%'), v(l.meanPeak)]) },
        { head: ['Lado', 'Crises', '% das crises'], body: c.sides.map((l) => [labelOf('side', l.key), l.count, v(l.pct, '%')]) },
      ],
    },
    {
      title: '7. Duração',
      paragraphs: [`Duração média: ${dur(c.durationMinutes.mean)} · mediana: ${dur(c.durationMinutes.median)} · total: ${dur(c.totalMinutes)} (${v(c.hoursWithPain)} h), com base em ${c.durationMinutes.n} crise(s) com início e término informados. ${CRITERIA.durationMinutes}`],
    },
    { title: '8. Sintomas associados', tables: [{ head: ['Sintoma', 'Crises', '% das crises'], body: c.symptoms.map((s) => [labelOf('symptom', s.key), s.count, v(s.pct, '%')]) }] },
    {
      title: '9. Medicamentos',
      paragraphs: [`Medicação para crise: ${c.administrations} administração(ões) em ${c.acuteMedicationDays} dia(s) distintos.`],
      tables: [
        { head: ['Medicamento para crise', 'Administrações', '%'], body: c.byMedication.map((m) => [m.key, m.count, v(m.pct, '%')]) },
        { head: ['Classe', 'Administrações', '%'], body: c.byClass.map((m) => [labelOf('medCategory', m.key), m.count, v(m.pct, '%')]) },
        { head: ['Tratamento preventivo', 'Dose prescrita', 'Início', 'Término', 'Alterações de dose'],
          body: i.preventives.map((t) => [t.name, t.prescribed_dose ?? '—', fmtDate(t.start_date), fmtDate(t.end_date), t.dose_changes.map((d) => `${fmtDate(d.date)}: ${d.dose}`).join('; ') || '—']) },
      ],
    },
    {
      title: '10. Relação entre administração e resposta',
      tables: [{
        head: ['Medicamento', 'Usos', 'Doses', 'Intens. antes', 'Até medicar (med.)', 'Início alívio (med.)', 'Redução média', 'Alívio completo', 'Parcial', 'Sem resposta'],
        body: c.responseByMedication.map((m) => [m.key, m.uses, m.doses.join(', ') || '—', v(m.intensityBefore.mean), dur(m.minutesToMedication.median), dur(m.minutesToReliefOnset.median),
          v(m.intensityReduction.mean), `${v(m.completePct, '%')} (n=${m.outcomesReported})`, v(m.partialPct, '%'), v(m.nonePct, '%')]),
        note: RESPONSE_CAVEAT,
      }],
    },
    {
      title: '11. Recorrências e efeitos adversos',
      tables: [{ head: ['Medicamento', 'Recorrência', 'Respostas à pergunta', 'Precisou de outro medicamento', 'Efeitos adversos informados'],
        body: c.responseByMedication.map((m) => [m.key, v(m.recurrencePct, '%'), m.recurrenceReported, m.rescueCount, m.adverseEffects]) }],
    },
  ]

  if (c.menstrual && i.menstruationAuthorized) {
    const m = c.menstrual
    sections.push({
      title: '12. Ciclo menstrual',
      paragraphs: [m.note, 'Esta análise descreve coincidência temporal e não constitui diagnóstico de enxaqueca menstrual.'],
      tables: [{ head: ['Período do ciclo', 'Dias com cefaleia', 'Intensidade máx. média'],
        body: (['pre', 'bleeding', 'post', 'other'] as CyclePhase[]).map((ph) => [PHASE_LABEL[ph], m.headacheDaysByPhase[ph], v(m.peakIntensityByPhase[ph].mean)]) }],
    })
  } else {
    sections.push({ title: '12. Ciclo menstrual', paragraphs: [i.menstruationAuthorized ? 'Sem registros de ciclo menstrual no período.' : 'Não incluído: sem autorização específica do paciente para compartilhar estes dados.'] })
  }

  sections.push(
    {
      title: '13. Fatores associados (autorrelato)',
      tables: [{ head: ['Categoria', 'Fator', 'Crises', '% das crises', 'Suspeita', 'Ocorreu antes'],
        body: c.triggers.map((t) => [labelOf('triggerCategory', t.category), labelOf('factor', t.factor), t.attacks, v(t.pctOfAttacks, '%'), t.suspected, t.occurredBefore]),
        note: 'Fatores informados pelo paciente. Associação temporal não é causa comprovada.' }],
    },
    {
      title: '14. Hábitos (registro diário)',
      tables: [{ head: ['Item', 'Dias com registro', 'Média'], body: [
        ['Horas de sono', c.habits.sleepHours.n, v(c.habits.sleepHours.mean, ' h')], ['Qualidade do sono (1–5)', c.habits.sleepQuality.n, v(c.habits.sleepQuality.mean)],
        ['Hidratação (L)', c.habits.hydration.n, v(c.habits.hydration.mean)], ['Cafeína (doses)', c.habits.caffeine.n, v(c.habits.caffeine.mean)],
        ['Estresse (1–5)', c.habits.stress.n, v(c.habits.stress.mean)], ['Humor (1–5)', c.habits.mood.n, v(c.habits.mood.mean)],
      ] }],
    },
    {
      title: '15. Evolução comparativa',
      paragraphs: ['Cada dimensão é classificada separadamente. Não há pontuação global.'],
      tables: [{ head: ['Dimensão', 'Anterior', 'Atual', 'Classificação', 'Observação'],
        body: i.comparison.map((d) => [`${d.label}${d.unit ? ` (${d.unit})` : ''}`, v(d.previous), v(d.current), TREND_LABEL[d.trend], d.reason]) }],
    },
    {
      title: '16. Crises do período e observações do paciente',
      tables: [{ head: ['Início', 'Duração', 'Pico', 'Impacto', 'Localização', 'Observações'],
        body: attacks.map((a) => [fmtDateTime(a.started_at), a.still_ongoing ? 'em andamento' : dur(minutesBetween(a.started_at, a.ended_at)), v(attackPeak(a)), a.functional_impact ?? '—',
          a.locations.map((l) => labelOf('location', l)).join(', ') || '—', a.notes ?? '']) }],
    },
    {
      title: '17. Observações profissionais',
      paragraphs: i.notes.length ? undefined : ['Nenhuma observação profissional registrada.'],
      tables: i.notes.length ? [{ head: ['Data', 'Tipo', 'Autor', 'Conteúdo'],
        body: i.notes.map((nt) => [fmtDate(nt.created_at.slice(0, 10)), nt.kind === 'diagnosis' ? 'Diagnóstico informado pelo profissional' : 'Observação', nt.author_name ?? 'Profissional', nt.content]) }] : undefined,
    },
  )

  return {
    institution: INSTITUTION.full,
    title: `${INSTITUTION.appName} — ${i.compact ? 'Resumo para consulta' : 'Relatório individual'}`,
    subtitle: `${i.patientName || 'Paciente'} · período de referência: ${fmtDate(i.period.from)} a ${fmtDate(i.period.to)}`,
    generatedLine: `Gerado em ${i.generatedAt} por ${i.generatedBy}`,
    disclaimers: [
      SELF_REPORT_NOTICE,
      incomplete.length ? `Dados incompletos: ${incomplete.join('; ')}.` : 'Sem pendências de preenchimento identificadas no período.',
      'Este relatório não contém diagnósticos automáticos nem recomendações terapêuticas.',
    ],
    sections: i.compact ? sections.filter((x) => /^(1|2|3|4|5|9|10|11|15)\./.test(x.title)) : sections,
  }
}
