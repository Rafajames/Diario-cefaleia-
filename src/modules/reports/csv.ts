import { labelOf } from '@/config/clinical-options'
import type { Dataset, Period } from '@/types/database'
import { toCsv } from '@/utils/csv'
import { dateOf, minutesBetween } from '@/utils/datetime'
import { attackPeak } from '@/modules/calendar/calc'
import { administrationIntervals } from '@/modules/treatment-response/calc'

const within = (p: Period, d: string) => d >= p.from && d <= p.to

export function attacksCsv(ds: Dataset, p: Period): string {
  return toCsv(ds.attacks.filter((a) => !a.deleted_at && within(p, dateOf(a.started_at))), [
    { header: 'id_crise', value: (a) => a.id },
    { header: 'inicio', value: (a) => a.started_at },
    { header: 'inicio_aproximado', value: (a) => a.start_is_approximate },
    { header: 'termino', value: (a) => a.ended_at },
    { header: 'em_andamento', value: (a) => a.still_ongoing },
    { header: 'duracao_min', value: (a) => minutesBetween(a.started_at, a.ended_at) },
    { header: 'tipo_inicio', value: (a) => a.onset_type },
    { header: 'iniciou_no_sono', value: (a) => a.started_during_sleep },
    { header: 'intensidade_inicial', value: (a) => a.intensity_initial },
    { header: 'intensidade_maxima', value: (a) => a.intensity_max },
    { header: 'intensidade_final', value: (a) => a.intensity_final },
    { header: 'pico_conhecido', value: (a) => attackPeak(a) },
    { header: 'localizacao', value: (a) => a.locations.map((l) => labelOf('location', l)).join(' | ') },
    { header: 'lado', value: (a) => (a.side ? labelOf('side', a.side) : null) },
    { header: 'caracteristicas', value: (a) => a.pain_qualities.map((l) => labelOf('quality', l)).join(' | ') },
    { header: 'agravamento', value: (a) => a.aggravating.map((l) => labelOf('aggravating', l)).join(' | ') },
    { header: 'sintomas', value: (a) => a.symptoms.map((s) => `${labelOf('symptom', s.symptom)} (${s.phase})`).join(' | ') },
    { header: 'fatores_autorrelatados', value: (a) => a.triggers.map((t) => `${labelOf('factor', t.factor)} [${t.relation}]`).join(' | ') },
    { header: 'impacto_funcional_0a3', value: (a) => a.functional_impact },
    { header: 'melhora_espontanea', value: (a) => a.improved_spontaneously },
    { header: 'melhora_apos_medicacao', value: (a) => a.improved_after_medication },
    { header: 'interrompida_pelo_sono', value: (a) => a.ended_by_sleep },
    { header: 'observacoes', value: (a) => a.notes },
    { header: 'registrado_em', value: (a) => a.recorded_at },
  ])
}

export function administrationsCsv(ds: Dataset, p: Period): string {
  const attackById = new Map(ds.attacks.map((a) => [a.id, a]))
  return toCsv(ds.administrations.filter((m) => within(p, dateOf(m.taken_at))), [
    { header: 'id_administracao', value: (m) => m.id },
    { header: 'id_crise', value: (m) => m.attack_id },
    { header: 'numero_na_crise', value: (m) => m.sequence_number },
    { header: 'medicamento', value: (m) => m.medication_name },
    { header: 'principio_ativo', value: (m) => m.active_ingredient },
    { header: 'classe', value: (m) => labelOf('medCategory', m.category) },
    { header: 'dose', value: (m) => m.dose },
    { header: 'unidade', value: (m) => m.unit },
    { header: 'via', value: (m) => m.route },
    { header: 'horario', value: (m) => m.taken_at },
    { header: 'horario_aproximado', value: (m) => m.time_is_approximate },
    { header: 'intensidade_antes', value: (m) => m.intensity_before },
    { header: 'min_ate_medicacao', value: (m) => administrationIntervals(m, m.attack_id ? attackById.get(m.attack_id) : null, ds.assessments).minutesToMedication },
    { header: 'min_ate_inicio_alivio', value: (m) => administrationIntervals(m, null, ds.assessments).minutesToReliefOnset },
    { header: 'min_ate_alivio_maximo', value: (m) => administrationIntervals(m, null, ds.assessments).minutesToMaxRelief },
    { header: 'reducao_intensidade', value: (m) => administrationIntervals(m, null, ds.assessments).intensityReduction },
    { header: 'desfecho', value: (m) => (m.outcome ? labelOf('outcome', m.outcome) : null) },
    { header: 'ficou_sem_dor', value: (m) => m.pain_free },
    { header: 'min_sem_dor', value: (m) => m.pain_free_minutes },
    { header: 'recorrencia', value: (m) => m.recurred },
    { header: 'horario_recorrencia', value: (m) => m.recurrence_at },
    { header: 'precisou_outro_medicamento', value: (m) => m.needed_rescue },
    { header: 'efeito_adverso', value: (m) => m.adverse_effect },
    { header: 'descricao_efeito_adverso', value: (m) => m.adverse_effect_note },
    { header: 'motivo', value: (m) => m.reason },
    { header: 'observacoes', value: (m) => m.notes },
  ])
}

export function dailyLogsCsv(ds: Dataset, p: Period): string {
  return toCsv(ds.dailyLogs.filter((l) => within(p, l.log_date)), [
    { header: 'data', value: (l) => l.log_date },
    { header: 'sem_dor_confirmado', value: (l) => l.pain_free_confirmed },
    { header: 'qualidade_sono_1a5', value: (l) => l.sleep_quality },
    { header: 'horas_sono', value: (l) => l.sleep_hours },
    { header: 'hidratacao_litros', value: (l) => l.hydration_liters },
    { header: 'alimentacao', value: (l) => l.meals },
    { header: 'jejum', value: (l) => l.fasting },
    { header: 'cafeina_doses', value: (l) => l.caffeine_servings },
    { header: 'atividade_fisica', value: (l) => (l.physical_activity ? labelOf('activity', l.physical_activity) : null) },
    { header: 'estresse_1a5', value: (l) => l.stress },
    { header: 'humor_1a5', value: (l) => l.mood },
    { header: 'observacoes', value: (l) => l.notes },
  ])
}
