-- =====================================================================
-- Migration 0002: dados clínicos (crises, avaliações, registro diário,
-- medicamentos, resposta terapêutica, ciclo menstrual, observações)
--
-- DECISÃO: horários de eventos clínicos são armazenados como "timestamp"
-- (horário local do paciente, sem fuso). O diário registra o relógio de
-- parede do paciente; o horário em que o registro foi feito (recorded_at)
-- é timestamptz gerado no servidor. Ver docs/ARCHITECTURE.md.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Crises de cefaleia
-- ---------------------------------------------------------------------
create table public.headache_attacks (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  -- Identificação
  started_at timestamp not null,
  start_is_approximate boolean not null default false,
  onset_type text check (onset_type in ('sudden', 'gradual')),
  started_during_sleep text check (started_during_sleep in ('yes', 'no', 'unknown')),
  -- Duração / desfecho
  ended_at timestamp,
  still_ongoing boolean not null default false,
  improved_spontaneously boolean,
  improved_after_medication boolean,
  ended_by_sleep boolean,
  -- Intensidade (0 a 10). Nenhuma é obrigatória.
  intensity_initial smallint check (intensity_initial between 0 and 10),
  intensity_max smallint check (intensity_max between 0 and 10),
  intensity_final smallint check (intensity_final between 0 and 10),
  -- Localização, características, agravamento
  locations text[] not null default '{}',
  side text check (side in ('right', 'left', 'bilateral', 'undefined')),
  location_other text check (char_length(location_other) <= 200),
  pain_qualities text[] not null default '{}',
  quality_other text check (char_length(quality_other) <= 200),
  aggravating text[] not null default '{}',
  aggravating_other text check (char_length(aggravating_other) <= 200),
  -- Sintomas: [{ "symptom": "nausea", "phase": "before|during|after", "note": "" }]
  symptoms jsonb not null default '[]' check (jsonb_typeof(symptoms) = 'array'),
  -- Desencadeantes/contexto: [{ "category","factor","relation":"suspected|occurred_before","when":"","confidence":1..5,"note":"" }]
  triggers jsonb not null default '[]' check (jsonb_typeof(triggers) = 'array'),
  -- Impacto funcional: 0 nenhum, 1 leve, 2 moderado, 3 incapacitante
  functional_impact smallint check (functional_impact between 0 and 3),
  notes text check (char_length(notes) <= 4000),
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, patient_id),
  check (ended_at is null or ended_at >= started_at),
  check (not (still_ongoing and ended_at is not null)),
  check (cardinality(locations) <= 20 and cardinality(pain_qualities) <= 20 and cardinality(aggravating) <= 20)
);
create index headache_attacks_patient_idx on public.headache_attacks (patient_id, started_at desc);

-- Avaliações ao longo da crise (intensidade e localização podem mudar)
create table public.attack_assessments (
  id uuid primary key default gen_random_uuid(),
  attack_id uuid not null,
  patient_id uuid not null references public.patients (id) on delete cascade,
  administration_id uuid,
  assessed_at timestamp not null,
  minutes_after_dose integer check (minutes_after_dose between 0 and 10080),
  intensity smallint check (intensity between 0 and 10),
  locations text[],
  note text check (char_length(note) <= 1000),
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (attack_id, patient_id) references public.headache_attacks (id, patient_id) on delete cascade
);
create index attack_assessments_attack_idx on public.attack_assessments (attack_id, assessed_at);

-- ---------------------------------------------------------------------
-- Registro diário (inclusive dias sem dor)
-- ---------------------------------------------------------------------
create table public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  log_date date not null,
  pain_free_confirmed boolean not null default false,
  sleep_quality smallint check (sleep_quality between 1 and 5),
  sleep_hours numeric(4, 1) check (sleep_hours between 0 and 24),
  hydration_liters numeric(4, 1) check (hydration_liters between 0 and 20),
  meals text check (char_length(meals) <= 500),
  fasting boolean,
  caffeine_servings smallint check (caffeine_servings between 0 and 50),
  physical_activity text check (physical_activity in ('none', 'light', 'moderate', 'intense')),
  stress smallint check (stress between 1 and 5),
  mood smallint check (mood between 1 and 5),
  notes text check (char_length(notes) <= 2000),
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (patient_id, log_date)
);

-- ---------------------------------------------------------------------
-- Medicamentos: catálogo (owner_id nulo = catálogo geral; senão, personalizado)
-- ---------------------------------------------------------------------
create table public.medications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.patients (id) on delete cascade,
  trade_name text not null check (char_length(trade_name) between 1 and 160),
  active_ingredient text check (char_length(active_ingredient) <= 200),
  presentation text check (char_length(presentation) <= 120),
  category text not null default 'other' check (category in
    ('analgesic', 'nsaid', 'triptan', 'ergot', 'opioid', 'antiemetic', 'combination', 'preventive', 'other')),
  route text check (route in ('oral', 'sublingual', 'nasal', 'subcutaneous', 'intramuscular', 'intravenous', 'rectal', 'topical', 'other')),
  strength numeric(10, 3) check (strength >= 0),
  unit text check (char_length(unit) <= 20),
  notes text check (char_length(notes) <= 1000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index medications_owner_idx on public.medications (owner_id);

create table public.preventive_treatments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  medication_id uuid references public.medications (id) on delete set null,
  name text not null check (char_length(name) between 1 and 160),
  prescribed_dose text check (char_length(prescribed_dose) <= 120),
  usual_time text check (char_length(usual_time) <= 60),
  start_date date,
  end_date date,
  -- [{ "date": "2026-01-10", "dose": "50 mg", "note": "" }]
  dose_changes jsonb not null default '[]' check (jsonb_typeof(dose_changes) = 'array'),
  prescriber text check (char_length(prescriber) <= 160),
  notes text check (char_length(notes) <= 1000),
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

-- Cada administração é um registro independente, com sua resposta.
create table public.medication_administrations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  attack_id uuid,
  medication_id uuid references public.medications (id) on delete set null,
  medication_name text not null check (char_length(medication_name) between 1 and 160),
  active_ingredient text check (char_length(active_ingredient) <= 200),
  category text not null default 'other',
  dose numeric(10, 3) check (dose >= 0),
  unit text check (char_length(unit) <= 20),
  route text check (char_length(route) <= 30),
  taken_at timestamp not null,
  time_is_approximate boolean not null default false,
  sequence_number smallint check (sequence_number between 1 and 50),
  reason text check (char_length(reason) <= 300),
  notes text check (char_length(notes) <= 1000),
  intensity_before smallint check (intensity_before between 0 and 10),
  -- Resposta (toda opcional)
  relief_started_at timestamp,
  max_relief_at timestamp,
  outcome text check (outcome in ('complete', 'partial', 'none', 'worse', 'unknown')),
  pain_free boolean,
  pain_free_minutes integer check (pain_free_minutes between 0 and 43200),
  recurred boolean,
  recurrence_at timestamp,
  needed_rescue boolean,
  adverse_effect boolean,
  adverse_effect_note text check (char_length(adverse_effect_note) <= 500),
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, patient_id),
  foreign key (attack_id, patient_id) references public.headache_attacks (id, patient_id) on delete cascade,
  check (relief_started_at is null or relief_started_at >= taken_at),
  check (max_relief_at is null or max_relief_at >= taken_at),
  check (recurrence_at is null or recurrence_at >= taken_at)
);
create index medication_administrations_patient_idx on public.medication_administrations (patient_id, taken_at desc);
create index medication_administrations_attack_idx on public.medication_administrations (attack_id);

alter table public.attack_assessments
  add foreign key (administration_id, patient_id)
  references public.medication_administrations (id, patient_id) on delete cascade;

-- ---------------------------------------------------------------------
-- Ciclo menstrual (sangramentos)
-- ---------------------------------------------------------------------
create table public.menstrual_cycles (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  start_date date not null,
  end_date date,
  flow text check (flow in ('light', 'moderate', 'heavy')),
  notes text check (char_length(notes) <= 1000),
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (patient_id, start_date),
  check (end_date is null or (end_date >= start_date and end_date <= start_date + 30))
);

-- ---------------------------------------------------------------------
-- Observações clínicas (autoria profissional, separadas do autorrelato)
-- ---------------------------------------------------------------------
create table public.clinical_notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete restrict,
  kind text not null default 'observation' check (kind in ('observation', 'diagnosis')),
  content text not null check (char_length(content) between 1 and 6000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (patient_id <> author_id)
);
create index clinical_notes_patient_idx on public.clinical_notes (patient_id, created_at desc);

-- Gatilhos: updated_at + auditoria em todas as tabelas clínicas
do $$
declare t text;
begin
  foreach t in array array['headache_attacks', 'attack_assessments', 'daily_logs', 'medications',
    'preventive_treatments', 'medication_administrations', 'menstrual_cycles', 'clinical_notes']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function app.touch_updated_at()', t || '_touch', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.audit_row()', t || '_audit', t);
  end loop;
end $$;

-- Autor de observação clínica precisa ser profissional (reforço além da RLS)
create or replace function app.protect_clinical_note() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.author_id <> old.author_id or new.patient_id <> old.patient_id) then
    raise exception 'Autor e paciente da observação não podem ser alterados.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger clinical_notes_protect before update on public.clinical_notes
  for each row execute function app.protect_clinical_note();
