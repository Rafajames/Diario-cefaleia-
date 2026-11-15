/**
 * Listas de opções clínicas. Fonte única: formulários, relatórios e gráficos leem daqui.
 * Os "value" são gravados no banco — não renomear sem migração de dados.
 */
export interface Option<T extends string = string> {
  value: T
  label: string
}

const opts = <T extends string>(pairs: [T, string][]): Option<T>[] => pairs.map(([value, label]) => ({ value, label }))

export const LOCATIONS = opts([
  ['frontal', 'Frontal'],
  ['temporal_right', 'Temporal direita'],
  ['temporal_left', 'Temporal esquerda'],
  ['temporal_bilateral', 'Temporal bilateral'],
  ['parietal_right', 'Parietal direita'],
  ['parietal_left', 'Parietal esquerda'],
  ['parietal_bilateral', 'Parietal bilateral'],
  ['occipital_right', 'Occipital direita'],
  ['occipital_left', 'Occipital esquerda'],
  ['occipital_bilateral', 'Occipital bilateral'],
  ['periorbital', 'Região periorbitária'],
  ['retroorbital', 'Região retro-orbitária'],
  ['diffuse', 'Difusa'],
  ['other', 'Outra'],
])

export const SIDES = opts([
  ['right', 'Direito'],
  ['left', 'Esquerdo'],
  ['bilateral', 'Bilateral'],
  ['undefined', 'Indefinido'],
])

export const PAIN_QUALITIES = opts([
  ['pulsating', 'Pulsátil'],
  ['pressure', 'Pressão'],
  ['tightening', 'Aperto'],
  ['stabbing', 'Pontada'],
  ['burning', 'Queimação'],
  ['shock', 'Choque'],
  ['heaviness', 'Peso'],
  ['other', 'Outra'],
])

export const AGGRAVATING = opts([
  ['routine_activity', 'Piora com atividades físicas habituais'],
  ['walking', 'Piora ao caminhar'],
  ['stairs', 'Piora ao subir escadas'],
  ['head_movement', 'Piora ao movimentar a cabeça'],
  ['cough_strain', 'Piora ao tossir ou fazer esforço'],
  ['none_known', 'Não apresenta agravamento conhecido'],
  ['other', 'Outro'],
])

export const SYMPTOMS = opts([
  ['nausea', 'Náusea'],
  ['vomiting', 'Vômitos'],
  ['photophobia', 'Fotofobia (incômodo com luz)'],
  ['phonophobia', 'Fonofobia (incômodo com som)'],
  ['osmophobia', 'Osmofobia (incômodo com cheiros)'],
  ['dizziness', 'Tontura'],
  ['vertigo', 'Vertigem'],
  ['blurred_vision', 'Visão embaçada'],
  ['visual_changes', 'Alterações visuais'],
  ['tingling', 'Formigamento'],
  ['numbness', 'Dormência'],
  ['speech_difficulty', 'Dificuldade de fala'],
  ['concentration_difficulty', 'Dificuldade de concentração'],
  ['tearing', 'Lacrimejamento'],
  ['nasal_congestion', 'Congestão nasal'],
  ['other', 'Outros'],
])

export const SYMPTOM_PHASES = opts([
  ['before', 'Antes da dor'],
  ['during', 'Durante a dor'],
  ['after', 'Depois da dor'],
])

export const TRIGGER_CATEGORIES: { value: string; label: string; factors: Option[] }[] = [
  {
    value: 'sleep',
    label: 'Sono',
    factors: opts([
      ['slept_little', 'Dormiu pouco'],
      ['overslept', 'Dormiu excessivamente'],
      ['interrupted_sleep', 'Sono interrompido'],
      ['poor_sleep', 'Sono de má qualidade'],
      ['routine_change', 'Alteração da rotina'],
    ]),
  },
  {
    value: 'food',
    label: 'Alimentação',
    factors: opts([
      ['fasting', 'Jejum'],
      ['late_meal', 'Atraso de refeição'],
      ['specific_food', 'Alimento específico'],
      ['caffeine_excess', 'Excesso de cafeína'],
      ['caffeine_reduction', 'Redução de cafeína'],
      ['alcohol', 'Álcool'],
    ]),
  },
  {
    value: 'environment',
    label: 'Ambiente',
    factors: opts([
      ['bright_light', 'Luz intensa'],
      ['noise', 'Ruído'],
      ['strong_odor', 'Odor intenso'],
      ['heat', 'Calor'],
      ['cold', 'Frio'],
      ['weather_change', 'Mudança climática'],
    ]),
  },
  {
    value: 'emotional',
    label: 'Condições emocionais',
    factors: opts([
      ['stress', 'Estresse'],
      ['anxiety', 'Ansiedade'],
      ['emotional_overload', 'Sobrecarga emocional'],
      ['worry', 'Preocupação'],
      ['emotional_other', 'Outro'],
    ]),
  },
  {
    value: 'physical',
    label: 'Condições físicas',
    factors: opts([
      ['dehydration', 'Desidratação'],
      ['intense_exercise', 'Atividade física intensa'],
      ['fatigue', 'Fadiga'],
      ['physical_effort', 'Esforço físico'],
      ['physical_other', 'Outro'],
    ]),
  },
  {
    value: 'hormonal',
    label: 'Hormonais',
    factors: opts([
      ['menstrual_period', 'Período menstrual'],
      ['premenstrual', 'Período pré-menstrual'],
      ['ovulation', 'Ovulação percebida'],
      ['hormonal_change', 'Alteração hormonal informada'],
      ['hormonal_other', 'Outro'],
    ]),
  },
]

export const TRIGGER_RELATIONS = opts([
  ['suspected', 'Suspeito que esteja associado'],
  ['occurred_before', 'Aconteceu antes da crise'],
])

export const FUNCTIONAL_IMPACT = opts([
  ['0', 'Nenhum — atividades normais'],
  ['1', 'Leve — atividades com algum desconforto'],
  ['2', 'Moderado — precisou reduzir atividades'],
  ['3', 'Incapacitante — precisou parar ou deitar'],
])

export const MED_CATEGORIES = opts([
  ['analgesic', 'Analgésico simples'],
  ['nsaid', 'Anti-inflamatório'],
  ['triptan', 'Triptano'],
  ['ergot', 'Ergotamínico'],
  ['opioid', 'Opioide'],
  ['antiemetic', 'Antiemético'],
  ['combination', 'Combinação'],
  ['preventive', 'Preventivo'],
  ['other', 'Outro'],
])

export const ROUTES = opts([
  ['oral', 'Oral'],
  ['sublingual', 'Sublingual'],
  ['nasal', 'Nasal'],
  ['subcutaneous', 'Subcutânea'],
  ['intramuscular', 'Intramuscular'],
  ['intravenous', 'Intravenosa'],
  ['rectal', 'Retal'],
  ['topical', 'Tópica'],
  ['other', 'Outra'],
])

export const OUTCOMES = opts([
  ['complete', 'Melhorou completamente'],
  ['partial', 'Melhorou parcialmente'],
  ['none', 'Não melhorou'],
  ['worse', 'Piorou'],
  ['unknown', 'Ainda não sabe avaliar'],
])

export const FLOWS = opts([
  ['light', 'Leve'],
  ['moderate', 'Moderado'],
  ['heavy', 'Intenso'],
])

export const ACTIVITY_LEVELS = opts([
  ['none', 'Nenhuma'],
  ['light', 'Leve'],
  ['moderate', 'Moderada'],
  ['intense', 'Intensa'],
])

const ALL_FACTORS = TRIGGER_CATEGORIES.flatMap((c) => c.factors.map((f) => ({ ...f, label: `${f.label}` })))

const index = (list: Option[]) => Object.fromEntries(list.map((o) => [o.value, o.label]))
const LABELS: Record<string, Record<string, string>> = {
  location: index(LOCATIONS),
  side: index(SIDES),
  quality: index(PAIN_QUALITIES),
  aggravating: index(AGGRAVATING),
  symptom: index(SYMPTOMS),
  phase: index(SYMPTOM_PHASES),
  factor: index(ALL_FACTORS),
  triggerCategory: Object.fromEntries(TRIGGER_CATEGORIES.map((c) => [c.value, c.label])),
  medCategory: index(MED_CATEGORIES),
  route: index(ROUTES),
  outcome: index(OUTCOMES),
  flow: index(FLOWS),
  impact: index(FUNCTIONAL_IMPACT),
  activity: index(ACTIVITY_LEVELS),
}

/** Rótulo legível de um valor gravado; devolve o próprio valor quando desconhecido (ex.: texto livre). */
export function labelOf(kind: keyof typeof LABELS | string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  return LABELS[kind]?.[String(value)] ?? String(value)
}

/** Parâmetros clínicos padrão. Em produção são lidos de app_settings (configuráveis pelo administrador). */
export const DEFAULT_SETTINGS = {
  post_dose_intervals_min: [30, 60, 120, 240],
  severity_bands: { mild_max: 3, moderate_max: 6 },
  menstrual_window: { days_before: 2, days_after: 2, min_cycles: 3, min_positive: 2 },
  evolution_rules: { relative_threshold: 0.2, min_attacks: 3, min_coverage: 0.5 },
  overuse_flags: {
    enabled: false,
    reviewed_by: null as string | null,
    rules: [
      { classes: ['triptan', 'ergot', 'opioid', 'combination'], days_per_30: 10 },
      { classes: ['analgesic', 'nsaid'], days_per_30: 15 },
    ],
  },
  consent_versions: { personal_data: '1.0', health_data: '1.0', professional_sharing: '1.0', research: '1.0' },
  public_signup_enabled: true,
}
export type ClinicalSettings = typeof DEFAULT_SETTINGS
