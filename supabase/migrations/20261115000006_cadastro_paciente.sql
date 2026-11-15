-- =====================================================================
-- Cadastro principal do paciente (Fase 1: sem anexos).
-- Uma única ficha por paciente (public.patient_registry), ligada à conta quando ela existe.
-- A equipe pode cadastrar o paciente ANTES de ele ter conta; o vínculo é feito por código de ativação.
-- Toda leitura/escrita passa por funções (RPC): a tabela não tem acesso direto para ninguém.
-- A auditoria deste cadastro guarda apenas QUEM, QUANDO e QUAIS CAMPOS — nunca os valores (CPF etc.).
-- =====================================================================

alter table public.access_logs drop constraint if exists access_logs_action_check;
alter table public.access_logs add constraint access_logs_action_check
  check (action in ('open_record', 'overview', 'export_pdf', 'export_csv', 'export_own_data', 'open_registry'));

-- Validação de CPF (dígitos verificadores)
create or replace function app.valid_cpf(p text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  s integer; i integer; r integer;
begin
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then return false; end if;
  s := 0; for i in 1..9 loop s := s + substr(d, i, 1)::integer * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> substr(d, 10, 1)::integer then return false; end if;
  s := 0; for i in 1..10 loop s := s + substr(d, i, 1)::integer * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  return r = substr(d, 11, 1)::integer;
end $$;

create sequence if not exists public.patient_record_seq;

create table public.patient_registry (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles (id) on delete set null,
  record_number text not null unique default ('CEF-' || lpad(nextval('public.patient_record_seq')::text, 6, '0')),
  registration_status text not null default 'incomplete' check (registration_status in ('incomplete', 'complete', 'awaiting_documents', 'inactive')),
  -- 1. Identificação
  full_name text check (char_length(full_name) <= 200),
  social_name text check (char_length(social_name) <= 200),
  cpf text check (cpf ~ '^\d{11}$'),
  rg_number text check (char_length(rg_number) <= 40),
  birth_date date check (birth_date between date '1900-01-01' and current_date),
  sex_at_birth text check (sex_at_birth in ('female', 'male', 'intersex', 'undisclosed')),
  nationality text check (char_length(nationality) <= 80),
  marital_status text check (char_length(marital_status) <= 40),
  -- 2. Contato
  phone_mobile text check (char_length(phone_mobile) <= 40),
  whatsapp text check (char_length(whatsapp) <= 40),
  phone_alt text check (char_length(phone_alt) <= 40),
  email_primary text check (char_length(email_primary) <= 320),
  email_secondary text check (char_length(email_secondary) <= 320),
  -- 3. Endereço
  cep text check (cep ~ '^\d{8}$'),
  street text check (char_length(street) <= 200),
  address_number text check (char_length(address_number) <= 20),
  address_complement text check (char_length(address_complement) <= 100),
  district text check (char_length(district) <= 120),
  city text check (char_length(city) <= 120),
  state text check (char_length(state) <= 80),
  country text check (char_length(country) <= 80),
  -- 4. Administrativo
  first_consultation date,
  responsible_professional_id uuid references public.profiles (id) on delete set null,
  insurance_name text check (char_length(insurance_name) <= 120),
  insurance_number text check (char_length(insurance_number) <= 60),
  cns text check (cns ~ '^\d{15}$'),
  -- 5. Emergência
  emergency_name text check (char_length(emergency_name) <= 200),
  emergency_relationship text check (char_length(emergency_relationship) <= 60),
  emergency_phone text check (char_length(emergency_phone) <= 40),
  emergency_phone_alt text check (char_length(emergency_phone_alt) <= 40),
  -- 6. Responsável legal
  guardian_name text check (char_length(guardian_name) <= 200),
  guardian_cpf text check (guardian_cpf ~ '^\d{11}$'),
  guardian_rg text check (char_length(guardian_rg) <= 40),
  guardian_relationship text check (char_length(guardian_relationship) <= 60),
  guardian_phone text check (char_length(guardian_phone) <= 40),
  guardian_email text check (char_length(guardian_email) <= 320),
  -- 7. Histórico clínico (medicamentos contínuos e doenças associadas continuam em public.patients)
  allergies text check (char_length(allergies) <= 2000),
  adverse_reactions text check (char_length(adverse_reactions) <= 2000),
  surgeries text check (char_length(surgeries) <= 2000),
  hospitalizations text check (char_length(hospitalizations) <= 2000),
  family_history text check (char_length(family_history) <= 2000),
  weight_kg numeric(5, 1) check (weight_kg between 1 and 500),
  height_cm numeric(5, 1) check (height_cm between 30 and 260),
  clinical_notes text check (char_length(clinical_notes) <= 4000),
  -- Ativação de conta (código guardado só como hash, com validade e limite de tentativas)
  activation_code_hash bytea,
  activation_expires_at timestamptz,
  activation_attempts smallint not null default 0,
  -- Rastreabilidade
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
create unique index patient_registry_cpf_uidx on public.patient_registry (cpf) where cpf is not null;
create index patient_registry_name_idx on public.patient_registry (lower(full_name));
create index patient_registry_responsible_idx on public.patient_registry (responsible_professional_id);

create table public.registry_audit (
  id bigint generated always as identity primary key,
  registry_id uuid not null references public.patient_registry (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('create', 'update', 'activation_code', 'link')),
  fields text[] not null default '{}',   -- apenas NOMES de campos, nunca valores
  created_at timestamptz not null default now()
);
create index registry_audit_registry_idx on public.registry_audit (registry_id, created_at desc);

alter table public.patient_registry enable row level security;
alter table public.registry_audit enable row level security;
revoke all on public.patient_registry, public.registry_audit from anon, authenticated;
revoke all on sequence public.patient_record_seq from anon, authenticated;

-- ---------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------
create or replace function app.registry_missing(r public.patient_registry) returns text[]
language sql stable set search_path = '' as $$
  select array_remove(array[
    case when coalesce(r.full_name, '') = '' then 'Nome completo' end,
    case when r.cpf is null then 'CPF' end,
    case when r.birth_date is null then 'Data de nascimento' end,
    case when coalesce(r.phone_mobile, '') = '' then 'Telefone celular' end,
    case when r.birth_date > (current_date - interval '18 years')
          and (coalesce(r.guardian_name, '') = '' or r.guardian_cpf is null or coalesce(r.guardian_relationship, '') = '')
         then 'Responsável legal (menor de 18 anos)' end
  ], null)
$$;

-- Quem pode ler: o próprio paciente; o administrador; o médico responsável; o médico com vínculo ativo,
-- consentimento e prontuário aberto (mesma regra dos dados clínicos).
create or replace function app.registry_access(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when r.user_id = auth.uid() and app.is_active() then 'owner'
    when app.is_admin() then 'admin'
    when r.responsible_professional_id = auth.uid() and app.acts_as_professional() then 'responsible'
    when r.user_id is not null and app.can_read_patient(r.user_id) then 'clinician'
  end
  from public.patient_registry r where r.id = p_id
$$;

-- ---------------------------------------------------------------------
-- Cria a ficha automaticamente quando o paciente se cadastra (e para os já existentes)
-- ---------------------------------------------------------------------
create or replace function app.registry_for_new_patient() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.patient_registry (user_id, full_name, email_primary, birth_date, sex_at_birth, phone_mobile, country, city, created_by, updated_by)
  select p.id, nullif(p.full_name, ''), p.email, new.birth_date, new.sex_at_birth, new.phone, new.country, new.city, p.id, p.id
  from public.profiles p where p.id = new.id
  on conflict (user_id) do nothing;
  return new;
end $$;
create trigger patients_registry_create after insert on public.patients
  for each row execute function app.registry_for_new_patient();

insert into public.patient_registry (user_id, full_name, email_primary, birth_date, sex_at_birth, phone_mobile, country, city, created_by, updated_by)
select p.id, nullif(p.full_name, ''), p.email, pt.birth_date, pt.sex_at_birth, pt.phone, pt.country, pt.city, p.id, p.id
from public.patients pt join public.profiles p on p.id = pt.id
on conflict (user_id) do nothing;

-- Mantém os campos que já existiam em `patients`/`profiles` sem duplicação divergente:
-- alterações feitas nas telas antigas refletem na ficha (a ficha reflete neles pela função de salvar).
create or replace function app.registry_sync_from_patient() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.patient_registry set
    birth_date = new.birth_date, sex_at_birth = new.sex_at_birth, phone_mobile = new.phone, country = new.country, city = new.city
  where user_id = new.id
    and (birth_date, sex_at_birth, phone_mobile, country, city) is distinct from (new.birth_date, new.sex_at_birth, new.phone, new.country, new.city);
  return new;
end $$;
create trigger patients_registry_sync after update of birth_date, sex_at_birth, phone, country, city on public.patients
  for each row execute function app.registry_sync_from_patient();

create or replace function app.registry_sync_from_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.patient_registry set full_name = nullif(new.full_name, '')
  where user_id = new.id and full_name is distinct from nullif(new.full_name, '');
  return new;
end $$;
create trigger profiles_registry_sync after update of full_name on public.profiles
  for each row execute function app.registry_sync_from_profile();

-- ---------------------------------------------------------------------
-- Salvar (criar/editar). Aceita cadastro incompleto. Valida no servidor.
-- ---------------------------------------------------------------------
create or replace function public.registry_save(p_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c_common text[] := array['full_name','social_name','cpf','rg_number','birth_date','sex_at_birth','nationality','marital_status',
    'phone_mobile','whatsapp','phone_alt','email_primary','email_secondary','cep','street','address_number','address_complement','district','city','state','country',
    'insurance_name','insurance_number','cns','emergency_name','emergency_relationship','emergency_phone','emergency_phone_alt',
    'guardian_name','guardian_cpf','guardian_rg','guardian_relationship','guardian_phone','guardian_email',
    'allergies','adverse_reactions','surgeries','hospitalizations','family_history','weight_kg','height_cm','clinical_notes'];
  c_admin text[] := array['first_consultation','responsible_professional_id','registration_status'];
  v_access text;
  v_allowed text[];
  v_clean jsonb := '{}'::jsonb;
  k text; v jsonb;
  v_old public.patient_registry;
  v_new public.patient_registry;
  v_cols text;
  v_changed text[];
  v_status text;
  v_email_re constant text := '^[^@\s]+@[^@\s]+\.[^@\s]+$';
begin
  if auth.uid() is null or not app.is_active() then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Dados inválidos.' using errcode = '22023';
  end if;

  if p_id is null then
    if not app.is_admin() then
      raise exception 'Somente a administração cadastra pacientes.' using errcode = '42501';
    end if;
    v_access := 'admin';
  else
    v_access := app.registry_access(p_id);
    if v_access is null or v_access not in ('owner', 'admin') then
      raise exception 'Sem permissão para alterar este cadastro.' using errcode = '42501';
    end if;
  end if;
  v_allowed := case when v_access = 'admin' then c_common || c_admin else c_common end;

  for k, v in select * from jsonb_each(p_data) loop
    if not (k = any(v_allowed)) then
      raise exception 'Campo não permitido: %.', k using errcode = '42501';
    end if;
    -- texto vazio vira nulo
    if jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '' then v := 'null'::jsonb; end if;
    if jsonb_typeof(v) = 'string' then v := to_jsonb(btrim(v #>> '{}')); end if;
    if k in ('cpf','guardian_cpf','cep','cns') and jsonb_typeof(v) = 'string' then
      v := to_jsonb(regexp_replace(v #>> '{}', '\D', '', 'g'));
    end if;
    v_clean := v_clean || jsonb_build_object(k, v);
  end loop;

  if v_clean ? 'cpf' and v_clean -> 'cpf' <> 'null'::jsonb and not app.valid_cpf(v_clean ->> 'cpf') then
    raise exception 'CPF inválido.' using errcode = '22023';
  end if;
  if v_clean ? 'guardian_cpf' and v_clean -> 'guardian_cpf' <> 'null'::jsonb and not app.valid_cpf(v_clean ->> 'guardian_cpf') then
    raise exception 'CPF do responsável inválido.' using errcode = '22023';
  end if;
  foreach k in array array['email_primary','email_secondary','guardian_email'] loop
    if v_clean ? k and v_clean -> k <> 'null'::jsonb and (v_clean ->> k) !~* v_email_re then
      raise exception 'E-mail inválido.' using errcode = '22023';
    end if;
  end loop;
  if v_clean ? 'cep' and v_clean -> 'cep' <> 'null'::jsonb and (v_clean ->> 'cep') !~ '^\d{8}$' then
    raise exception 'CEP inválido.' using errcode = '22023';
  end if;
  if v_clean ? 'cns' and v_clean -> 'cns' <> 'null'::jsonb and (v_clean ->> 'cns') !~ '^\d{15}$' then
    raise exception 'CNS inválido (15 dígitos).' using errcode = '22023';
  end if;
  if v_clean ? 'registration_status' and (v_clean ->> 'registration_status') not in ('auto', 'inactive', 'awaiting_documents') then
    raise exception 'Situação cadastral inválida.' using errcode = '22023';
  end if;
  if v_clean ? 'registration_status' then
    v_status := v_clean ->> 'registration_status';
    v_clean := v_clean - 'registration_status';
  end if;

  select string_agg(quote_ident(key), ', ') into v_cols from jsonb_object_keys(v_clean) as key;

  begin
    if p_id is null then
      if coalesce(v_clean ->> 'full_name', '') = '' then
        raise exception 'Informe ao menos o nome completo para iniciar o cadastro.' using errcode = '22023';
      end if;
      execute format('insert into public.patient_registry (%s, created_by, updated_by) select %s, $2, $2 from jsonb_populate_record(null::public.patient_registry, $1) returning *', v_cols, v_cols)
        into v_new using v_clean, auth.uid();
      insert into public.registry_audit (registry_id, actor_id, action, fields) values (v_new.id, auth.uid(), 'create', array(select jsonb_object_keys(v_clean)));
    else
      select * into v_old from public.patient_registry where id = p_id;
      if v_cols is not null then
        execute format('update public.patient_registry set updated_by = $2, updated_at = now(), (%s) = (select %s from jsonb_populate_record(null::public.patient_registry, $1)) where id = $3 returning *', v_cols, v_cols)
          into v_new using v_clean, auth.uid(), p_id;
      else
        v_new := v_old;
      end if;
      select coalesce(array_agg(key order by key), '{}') into v_changed
      from jsonb_object_keys(v_clean) as key
      where to_jsonb(v_old) -> key is distinct from to_jsonb(v_new) -> key;
      if cardinality(v_changed) > 0 then
        insert into public.registry_audit (registry_id, actor_id, action, fields) values (p_id, auth.uid(), 'update', v_changed);
      end if;
    end if;
  exception
    when unique_violation then
      raise exception 'Já existe um cadastro com este CPF ou dado único. Procure o cadastro existente.' using errcode = '23505';
    when check_violation or invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
      raise exception 'Algum valor está fora do formato ou do limite permitido.' using errcode = '22023';
  end;

  -- Situação cadastral: automática, salvo "inativo/aguardando documentos" definidos pela administração
  if v_status = 'inactive' or v_status = 'awaiting_documents' then
    null;
  elsif v_new.registration_status in ('inactive', 'awaiting_documents') and coalesce(v_status, '') <> 'auto' then
    v_status := v_new.registration_status;
  else
    v_status := case when cardinality(app.registry_missing(v_new)) = 0 then 'complete' else 'incomplete' end;
  end if;
  if v_status is distinct from v_new.registration_status then
    update public.patient_registry set registration_status = v_status where id = v_new.id returning * into v_new;
  end if;

  -- Reflete nos campos que já existiam em patients/profiles (única fonte para o restante do app)
  if v_new.user_id is not null then
    update public.patients set birth_date = v_new.birth_date, sex_at_birth = v_new.sex_at_birth, phone = v_new.phone_mobile,
      country = v_new.country, city = v_new.city
    where id = v_new.user_id
      and (birth_date, sex_at_birth, phone, country, city) is distinct from (v_new.birth_date, v_new.sex_at_birth, v_new.phone_mobile, v_new.country, v_new.city);
    if v_new.full_name is not null then
      update public.profiles set full_name = v_new.full_name where id = v_new.user_id and full_name is distinct from v_new.full_name;
    end if;
  end if;

  return jsonb_build_object('id', v_new.id, 'record_number', v_new.record_number, 'status', v_new.registration_status,
    'missing', to_jsonb(app.registry_missing(v_new)));
end $$;

-- Leitura de uma ficha (registra o acesso quando NÃO é o próprio paciente). Não devolve hash de ativação.
create or replace function public.registry_get(p_registry uuid default null, p_user uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_access text;
  r public.patient_registry;
begin
  select id into v_id from public.patient_registry where id = p_registry or user_id = p_user limit 1;
  v_access := case when v_id is null then null else app.registry_access(v_id) end;
  if v_access is null then
    raise exception 'Cadastro não encontrado ou sem permissão.' using errcode = '42501';
  end if;
  select * into r from public.patient_registry where id = v_id;
  if v_access <> 'owner' then
    insert into public.access_logs (actor_id, patient_id, action, detail) values (auth.uid(), coalesce(r.user_id, r.id), 'open_registry', 'cadastro');
  end if;
  return jsonb_build_object(
    'registry', to_jsonb(r) - 'activation_code_hash' - 'activation_attempts',
    'access', v_access,
    'linked', r.user_id is not null,
    'missing', to_jsonb(app.registry_missing(r)),
    'activation_pending', r.activation_code_hash is not null and r.activation_expires_at > now());
end $$;

-- Lista para a administração / médico responsável. Nunca devolve o CPF completo.
create or replace function public.registry_list(p_search text default null, p_status text default null, p_limit integer default 100)
returns table (id uuid, record_number text, full_name text, cpf_masked text, birth_date date, registration_status text,
               linked boolean, responsible_name text, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_s text := nullif(btrim(coalesce(p_search, '')), '');
  v_digits text := regexp_replace(coalesce(p_search, ''), '\D', '', 'g');
begin
  if not (app.is_admin() or app.acts_as_professional()) then
    raise exception 'Acesso restrito.' using errcode = '42501';
  end if;
  return query
  select r.id, r.record_number, r.full_name,
    case when r.cpf is null then null else '***.' || substr(r.cpf, 4, 3) || '.***-' || substr(r.cpf, 10, 2) end,
    r.birth_date, r.registration_status, r.user_id is not null, rp.full_name, r.updated_at
  from public.patient_registry r
  left join public.profiles rp on rp.id = r.responsible_professional_id
  where (app.is_admin() or r.responsible_professional_id = auth.uid())
    and (p_status is null or r.registration_status = p_status)
    and (v_s is null or lower(r.full_name) like '%' || lower(v_s) || '%' or lower(r.record_number) = lower(v_s)
         or (length(v_digits) = 11 and r.cpf = v_digits))
  order by r.updated_at desc
  limit least(greatest(p_limit, 1), 500);
end $$;

-- Histórico de alterações (somente nomes de campos): paciente (o próprio) e administração
create or replace function public.registry_history(p_registry uuid)
returns table (created_at timestamptz, actor_name text, action text, fields text[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(app.registry_access(p_registry), '') not in ('owner', 'admin') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return query
  select a.created_at, coalesce(nullif(p.full_name, ''), p.email), a.action, a.fields
  from public.registry_audit a left join public.profiles p on p.id = a.actor_id
  where a.registry_id = p_registry order by a.created_at desc limit 200;
end $$;

-- ---------------------------------------------------------------------
-- Ativação de conta para pacientes cadastrados pela equipe
-- ---------------------------------------------------------------------
create or replace function public.registry_generate_code(p_registry uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  v_user uuid;
begin
  if not app.is_admin() then
    raise exception 'Somente a administração gera códigos.' using errcode = '42501';
  end if;
  select user_id into v_user from public.patient_registry where id = p_registry;
  if not found then
    raise exception 'Cadastro não encontrado.' using errcode = '22023';
  end if;
  if v_user is not null then
    raise exception 'Este cadastro já está vinculado a uma conta.' using errcode = '22023';
  end if;
  update public.patient_registry
    set activation_code_hash = sha256(convert_to(v_code, 'UTF8')), activation_expires_at = now() + interval '7 days', activation_attempts = 0
    where id = p_registry;
  insert into public.registry_audit (registry_id, actor_id, action) values (p_registry, auth.uid(), 'activation_code');
  return v_code;  -- exibido uma única vez; o banco guarda só o hash
end $$;

-- Retorna false (e conta a tentativa) se o código não confere; nunca revela se o prontuário existe.
create or replace function public.registry_claim(p_record_number text, p_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  r public.patient_registry;
  v_own public.patient_registry;
begin
  if auth.uid() is null or app.user_role() is distinct from 'patient' then
    raise exception 'Somente pacientes ativam um cadastro.' using errcode = '42501';
  end if;
  select * into r from public.patient_registry
    where upper(record_number) = upper(btrim(p_record_number)) and user_id is null for update;
  if not found then
    return false;
  end if;
  if r.activation_code_hash is null or r.activation_expires_at is null or r.activation_expires_at < now() or r.activation_attempts >= 5 then
    return false;
  end if;
  if r.activation_code_hash <> sha256(convert_to(upper(btrim(p_code)), 'UTF8')) then
    update public.patient_registry set activation_attempts = activation_attempts + 1 where id = r.id;
    return false;
  end if;

  select * into v_own from public.patient_registry where user_id = auth.uid();
  if found then
    if v_own.cpf is not null then
      raise exception 'Sua conta já tem um cadastro com CPF. Procure a CENDOR.' using errcode = '22023';
    end if;
    delete from public.patient_registry where id = v_own.id;  -- ficha automática ainda vazia
  end if;

  update public.patient_registry set user_id = auth.uid(), activation_code_hash = null, activation_expires_at = null,
    activation_attempts = 0, updated_by = auth.uid(), updated_at = now() where id = r.id returning * into r;
  insert into public.registry_audit (registry_id, actor_id, action) values (r.id, auth.uid(), 'link');

  update public.patients set birth_date = coalesce(r.birth_date, birth_date), sex_at_birth = coalesce(r.sex_at_birth, sex_at_birth),
    phone = coalesce(r.phone_mobile, phone), country = coalesce(r.country, country), city = coalesce(r.city, city) where id = auth.uid();
  if r.full_name is not null then
    update public.profiles set full_name = r.full_name where id = auth.uid() and full_name is distinct from r.full_name;
  end if;
  return true;
end $$;

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema app from public, anon;
grant execute on function public.public_config() to anon, authenticated;
grant execute on function public.registry_save(uuid, jsonb), public.registry_get(uuid, uuid), public.registry_list(text, text, integer),
  public.registry_history(uuid), public.registry_generate_code(uuid), public.registry_claim(text, text) to authenticated;
