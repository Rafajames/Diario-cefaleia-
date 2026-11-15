-- =====================================================================
-- Diário da Cefaleia — CENDOR
-- Migration 0001: fundação (perfis, funções auxiliares, configurações,
-- consentimentos, vínculos, convites, logs de acesso e auditoria)
-- =====================================================================

create schema if not exists app;
grant usage on schema app to authenticated;

create type public.app_role as enum ('patient', 'professional', 'admin');
create type public.account_status as enum ('active', 'suspended');
create type public.consent_type as enum ('personal_data', 'health_data', 'professional_sharing', 'research');

-- ---------------------------------------------------------------------
-- Perfis (dados de conta, separados de auth.users e dos dados clínicos)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 200),
  email text not null,
  role public.app_role not null default 'patient',
  status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);

create table public.patients (
  id uuid primary key references public.profiles (id) on delete cascade,
  -- Identificação (declarada pelo paciente)
  birth_date date,
  phone text check (char_length(phone) <= 40),
  sex_at_birth text check (sex_at_birth in ('female', 'male', 'intersex', 'undisclosed')),
  gender text check (char_length(gender) <= 80),
  country text check (char_length(country) <= 80),
  city text check (char_length(city) <= 120),
  timezone text not null default 'America/Manaus' check (char_length(timezone) <= 64),
  -- Informações clínicas declaradas pelo paciente
  pain_onset_approx text check (char_length(pain_onset_approx) <= 120),
  usual_frequency text check (char_length(usual_frequency) <= 200),
  reported_diagnosis text check (char_length(reported_diagnosis) <= 500),
  clinical_history text check (char_length(clinical_history) <= 4000),
  comorbidities text check (char_length(comorbidities) <= 2000),
  continuous_medications text check (char_length(continuous_medications) <= 2000),
  -- Módulo menstrual (opcional, opt-in)
  tracks_menstruation boolean not null default false,
  cycle_regularity text check (cycle_regularity in ('regular', 'irregular', 'unknown')),
  usual_cycle_days smallint check (usual_cycle_days between 10 and 120),
  usual_bleeding_days smallint check (usual_bleeding_days between 1 and 30),
  next_period_expected date,
  hormonal_contraceptive text check (char_length(hormonal_contraceptive) <= 300),
  menstrual_notes text check (char_length(menstrual_notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.professionals (
  id uuid primary key references public.profiles (id) on delete cascade,
  council_type text check (char_length(council_type) <= 20),
  council_number text check (char_length(council_number) <= 40),
  specialty text check (char_length(specialty) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Configurações gerais (parâmetros clínicos e administrativos)
-- ---------------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

insert into public.app_settings (key, value, description) values
  ('public_signup_enabled', 'true', 'Permite cadastro público de pacientes. Se falso, apenas convidados conseguem se cadastrar.'),
  ('consent_versions', '{"personal_data":"1.0","health_data":"1.0","professional_sharing":"1.0","research":"1.0"}', 'Versão vigente de cada termo de consentimento.'),
  ('post_dose_intervals_min', '[30, 60, 120, 240]', 'Intervalos sugeridos (minutos) para avaliação após medicação. Opcionais para o paciente.'),
  ('severity_bands', '{"mild_max":3,"moderate_max":6}', 'Faixas de intensidade: leve 1..mild_max, moderada até moderate_max, intensa acima.'),
  ('menstrual_window', '{"days_before":2,"days_after":2,"min_cycles":3,"min_positive":2}', 'Janela perimenstrual: dias antes do 1º dia e dias depois (dia 1 = início). Padrão ICHD-3: dias -2 a +3 => days_before 2, days_after 2.'),
  ('evolution_rules', '{"relative_threshold":0.2,"min_attacks":3,"min_coverage":0.5}', 'Regras de classificação da evolução: variação relativa mínima, nº mínimo de crises e cobertura mínima de registros.'),
  ('overuse_flags', '{"enabled":false,"reviewed_by":null,"rules":[{"classes":["triptan","ergot","opioid","combination"],"days_per_30":10},{"classes":["analgesic","nsaid"],"days_per_30":15}]}', 'Sinalização informativa de possível uso frequente de medicação aguda. Permanece desativada até revisão do responsável médico.'),
  ('retention', '{"audit_log_months":60,"access_log_months":60}', 'Política de retenção (referência para rotinas de expurgo).');

-- ---------------------------------------------------------------------
-- Consentimentos (histórico imutável: cada decisão é uma nova linha)
-- ---------------------------------------------------------------------
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  consent_type public.consent_type not null,
  version text not null check (char_length(version) <= 20),
  granted boolean not null,
  created_at timestamptz not null default now()
);
create index consents_user_idx on public.consents (user_id, consent_type, created_at desc);

-- ---------------------------------------------------------------------
-- Vínculos de cuidado (paciente autoriza profissional/administrador)
-- ---------------------------------------------------------------------
create table public.care_links (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  grantee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  include_menstruation boolean not null default false,
  requested_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  authorized_at timestamptz,
  revoked_at timestamptz,
  unique (patient_id, grantee_id),
  check (patient_id <> grantee_id)
);
create index care_links_grantee_idx on public.care_links (grantee_id, status);

-- ---------------------------------------------------------------------
-- Convites
-- ---------------------------------------------------------------------
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) <= 320),
  role public.app_role not null default 'patient' check (role in ('patient', 'professional')),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  revoked_at timestamptz
);
create index invites_email_idx on public.invites (lower(email));

-- ---------------------------------------------------------------------
-- Logs de acesso a dados clínicos e histórico de alterações
-- ---------------------------------------------------------------------
create table public.access_logs (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  patient_id uuid,
  action text not null check (action in ('open_record', 'overview', 'export_pdf', 'export_csv', 'export_own_data')),
  detail text check (char_length(detail) <= 300),
  created_at timestamptz not null default now()
);
create index access_logs_lookup_idx on public.access_logs (actor_id, patient_id, action, created_at desc);
create index access_logs_patient_idx on public.access_logs (patient_id, created_at desc);

create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor_id uuid,
  patient_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_patient_idx on public.audit_log (patient_id, created_at desc);

create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text check (char_length(reason) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'rejected')),
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references public.profiles (id) on delete set null,
  admin_note text check (char_length(admin_note) <= 1000)
);

-- =====================================================================
-- Funções auxiliares (schema app: não exposto pela API)
-- =====================================================================
create or replace function app.user_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and status = 'active'
$$;

create or replace function app.is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active')
$$;

create or replace function app.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app.user_role() = 'admin', false)
$$;

create or replace function app.has_consent(p_user uuid, p_type public.consent_type) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select granted from public.consents
    where user_id = p_user and consent_type = p_type
    order by created_at desc, id desc limit 1
  ), false)
$$;

-- Há vínculo ativo, autorizado pelo paciente, com consentimento de compartilhamento vigente?
create or replace function app.has_grant(p_patient uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.care_links l
    join public.profiles g on g.id = l.grantee_id
    where l.patient_id = p_patient
      and l.grantee_id = auth.uid()
      and l.status = 'active'
      and g.status = 'active'
      and g.role in ('professional', 'admin')
  ) and app.has_consent(p_patient, 'professional_sharing')
$$;

-- Leitura de dados clínicos: o próprio paciente, ou terceiro com vínculo ativo
-- E com abertura de prontuário registrada nas últimas 8 horas (acesso nunca é invisível).
create or replace function app.can_read_patient(p_patient uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null then false
    when p_patient = auth.uid() then app.is_active()
    else app.has_grant(p_patient) and exists (
      select 1 from public.access_logs a
      where a.actor_id = auth.uid() and a.patient_id = p_patient
        and a.action = 'open_record' and a.created_at > now() - interval '8 hours'
    )
  end
$$;

create or replace function app.can_read_menstruation(p_patient uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_patient = auth.uid() then app.is_active()
    else app.can_read_patient(p_patient) and exists (
      select 1 from public.care_links l
      where l.patient_id = p_patient and l.grantee_id = auth.uid()
        and l.status = 'active' and l.include_menstruation
    )
  end
$$;

-- Escrita de dados clínicos: somente o próprio paciente, ativo e com consentimento de dados de saúde.
create or replace function app.can_write_own(p_patient uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_patient = auth.uid() and app.is_active() and app.has_consent(auth.uid(), 'health_data')
$$;

create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Histórico de alterações (genérico)
create or replace function app.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
begin
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
    return new;
  end if;
  insert into public.audit_log (table_name, record_id, action, actor_id, patient_id, old_data, new_data)
  values (
    tg_table_name,
    (v_row ->> 'id')::uuid,
    tg_op,
    auth.uid(),
    coalesce((v_row ->> 'patient_id')::uuid, (v_row ->> 'user_id')::uuid, (v_row ->> 'owner_id')::uuid,
             case when tg_table_name in ('patients', 'profiles') then (v_row ->> 'id')::uuid end),
    v_old, v_new
  );
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------
-- Criação automática do perfil no cadastro. A função NUNCA vem do cliente:
-- é 'patient' por padrão ou a função definida em um convite válido.
-- ---------------------------------------------------------------------
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_invite_id uuid;
  v_invite_role public.app_role;
  v_public boolean;
  v_role public.app_role := 'patient';
begin
  select id, role into v_invite_id, v_invite_role from public.invites
  where lower(email) = lower(new.email) and accepted_at is null and revoked_at is null and expires_at > now()
  order by created_at desc limit 1;

  select (value)::boolean into v_public from public.app_settings where key = 'public_signup_enabled';

  if v_invite_id is null and not coalesce(v_public, true) then
    raise exception 'Cadastro público desativado. Solicite um convite à CENDOR.' using errcode = 'P0001';
  end if;

  if v_invite_id is not null then
    v_role := v_invite_role;
    update public.invites set accepted_at = now() where id = v_invite_id;
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 200), v_role);

  if v_role = 'patient' then
    insert into public.patients (id) values (new.id);
  else
    insert into public.professionals (id) values (new.id);
  end if;

  -- Consentimentos marcados no formulário de cadastro (escolha do próprio titular),
  -- gravados com a versão vigente de cada termo.
  if jsonb_typeof(new.raw_user_meta_data -> 'consents') = 'array' then
    insert into public.consents (user_id, consent_type, version, granted)
    select new.id, k::public.consent_type,
           coalesce((select value ->> k from public.app_settings where key = 'consent_versions'), '1.0'), true
    from (select distinct jsonb_array_elements_text(new.raw_user_meta_data -> 'consents') as k) c
    where k in ('personal_data', 'health_data', 'professional_sharing', 'research');
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------
-- Proteção de função/situação da conta.
-- auth.uid() nulo = operação administrativa direta no banco (service role / SQL editor).
-- ---------------------------------------------------------------------
create or replace function app.protect_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.id <> old.id or new.email is distinct from old.email or new.created_at <> old.created_at then
    raise exception 'Campo protegido não pode ser alterado.' using errcode = '42501';
  end if;
  if new.role is distinct from old.role or new.status is distinct from old.status then
    if not app.is_admin() then
      raise exception 'Sem permissão para alterar função ou situação da conta.' using errcode = '42501';
    end if;
    if new.id = auth.uid() then
      raise exception 'O administrador não pode alterar a própria função ou situação.' using errcode = '42501';
    end if;
    if new.role is distinct from old.role and (new.role = 'admin' or old.role = 'admin') then
      raise exception 'O perfil administrativo só é provisionado ou removido diretamente no banco (ver docs/SECURITY.md).' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_protect before update on public.profiles
  for each row execute function app.protect_profile();

create or replace function app.sync_role_rows() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'patient' then
    insert into public.patients (id) values (new.id) on conflict do nothing;
  elsif new.role = 'professional' then
    insert into public.professionals (id) values (new.id) on conflict do nothing;
  end if;
  return new;
end $$;

create trigger profiles_sync_role after update of role on public.profiles
  for each row execute function app.sync_role_rows();

-- ---------------------------------------------------------------------
-- Regras dos vínculos: só o paciente ativa; terceiros só podem revogar.
-- ---------------------------------------------------------------------
create or replace function app.protect_care_link() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_grantee_role public.app_role;
begin
  if tg_op = 'INSERT' then
    select role into v_grantee_role from public.profiles where id = new.grantee_id and status = 'active';
    if v_grantee_role is null or v_grantee_role not in ('professional', 'admin') then
      raise exception 'O vínculo só pode ser criado com um profissional ou administrador ativo.' using errcode = '42501';
    end if;
    new.requested_by := auth.uid();
    if auth.uid() is not null and auth.uid() <> new.patient_id then
      new.status := 'pending';
      new.include_menstruation := false;
      new.authorized_at := null;
    elsif new.status = 'active' then
      new.authorized_at := now();
    end if;
    return new;
  end if;

  if auth.uid() is not null and auth.uid() <> old.patient_id then
    if new.status <> 'revoked'
       or new.include_menstruation is distinct from old.include_menstruation
       or new.patient_id <> old.patient_id or new.grantee_id <> old.grantee_id then
      raise exception 'Somente o paciente pode autorizar ou alterar este vínculo. Terceiros podem apenas revogar.' using errcode = '42501';
    end if;
  end if;
  if new.patient_id <> old.patient_id or new.grantee_id <> old.grantee_id then
    raise exception 'Paciente e profissional do vínculo não podem ser alterados.' using errcode = '42501';
  end if;
  if new.status = 'active' and old.status <> 'active' then
    new.authorized_at := now();
    new.revoked_at := null;
  elsif new.status = 'revoked' and old.status <> 'revoked' then
    new.revoked_at := now();
  end if;
  return new;
end $$;

create trigger care_links_protect before insert or update on public.care_links
  for each row execute function app.protect_care_link();

-- updated_at
create trigger profiles_touch before update on public.profiles for each row execute function app.touch_updated_at();
create trigger patients_touch before update on public.patients for each row execute function app.touch_updated_at();
create trigger professionals_touch before update on public.professionals for each row execute function app.touch_updated_at();
create trigger app_settings_touch before update on public.app_settings for each row execute function app.touch_updated_at();

-- auditoria
create trigger profiles_audit after insert or update or delete on public.profiles for each row execute function app.audit_row();
create trigger patients_audit after insert or update or delete on public.patients for each row execute function app.audit_row();
create trigger care_links_audit after insert or update or delete on public.care_links for each row execute function app.audit_row();
create trigger app_settings_audit after update on public.app_settings for each row execute function app.audit_row();
