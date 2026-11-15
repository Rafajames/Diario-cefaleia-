-- =====================================================================
-- Perfil de RECEPÇÃO: cadastra e atualiza fichas de pacientes (dados pessoais e administrativos),
-- sem NENHUM acesso a dados clínicos (crises, medicamentos, diário, observações) e sem painel administrativo.
-- O perfil só é atribuído por um administrador (tela Usuários) ou convite; nunca pelo próprio usuário.
-- Obs.: o novo valor do enum só é referenciado como texto ('reception'::text) nesta migration.
-- =====================================================================
alter type public.app_role add value if not exists 'reception';

alter table public.invites drop constraint if exists invites_role_check;
alter table public.invites add constraint invites_role_check check (role::text in ('patient', 'professional', 'reception'));

create or replace function app.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app.user_role()::text in ('admin', 'reception'), false)
$$;

create or replace function app.registry_access(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when r.user_id = auth.uid() and app.is_active() then 'owner'
    when app.is_admin() then 'admin'
    when app.user_role()::text = 'reception' then 'staff'
    when r.responsible_professional_id = auth.uid() and app.acts_as_professional() then 'responsible'
    when r.user_id is not null and app.can_read_patient(r.user_id) then 'clinician'
  end
  from public.patient_registry r where r.id = p_id
$$;

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
    if not app.is_staff() then
      raise exception 'Somente a administração ou a recepção cadastram pacientes.' using errcode = '42501';
    end if;
    v_access := case when app.is_admin() then 'admin' else 'staff' end;
  else
    v_access := app.registry_access(p_id);
    if v_access is null or v_access not in ('owner', 'admin', 'staff') then
      raise exception 'Sem permissão para alterar este cadastro.' using errcode = '42501';
    end if;
  end if;
  v_allowed := case when v_access in ('admin', 'staff') then c_common || c_admin else c_common end;

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

create or replace function public.registry_list(p_search text default null, p_status text default null, p_limit integer default 100)
returns table (id uuid, record_number text, full_name text, cpf_masked text, birth_date date, registration_status text,
               linked boolean, responsible_name text, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_s text := nullif(btrim(coalesce(p_search, '')), '');
  v_digits text := regexp_replace(coalesce(p_search, ''), '\D', '', 'g');
begin
  if not (app.is_staff() or app.acts_as_professional()) then
    raise exception 'Acesso restrito.' using errcode = '42501';
  end if;
  return query
  select r.id, r.record_number, r.full_name,
    case when r.cpf is null then null else '***.' || substr(r.cpf, 4, 3) || '.***-' || substr(r.cpf, 10, 2) end,
    r.birth_date, r.registration_status, r.user_id is not null, rp.full_name, r.updated_at
  from public.patient_registry r
  left join public.profiles rp on rp.id = r.responsible_professional_id
  where (app.is_staff() or r.responsible_professional_id = auth.uid())
    and (p_status is null or r.registration_status = p_status)
    and (v_s is null or lower(r.full_name) like '%' || lower(v_s) || '%' or lower(r.record_number) = lower(v_s)
         or (length(v_digits) = 11 and r.cpf = v_digits))
  order by r.updated_at desc
  limit least(greatest(p_limit, 1), 500);
end $$;

create or replace function public.registry_history(p_registry uuid)
returns table (created_at timestamptz, actor_name text, action text, fields text[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(app.registry_access(p_registry), '') not in ('owner', 'admin', 'staff') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return query
  select a.created_at, coalesce(nullif(p.full_name, ''), p.email), a.action, a.fields
  from public.registry_audit a left join public.profiles p on p.id = a.actor_id
  where a.registry_id = p_registry order by a.created_at desc limit 200;
end $$;

create or replace function public.registry_generate_code(p_registry uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  v_user uuid;
begin
  if not app.is_staff() then
    raise exception 'Somente a administração ou a recepção geram códigos.' using errcode = '42501';
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

-- Médicos que podem ser "responsável" (a recepção não lê a tabela de perfis diretamente)
create or replace function public.responsible_options() returns table (id uuid, full_name text, email text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_staff() then
    raise exception 'Acesso restrito.' using errcode = '42501';
  end if;
  return query
  select p.id, p.full_name, p.email from public.profiles p
  where p.status = 'active' and (p.role::text = 'professional' or (p.role::text = 'admin' and p.clinical_enabled))
  order by p.full_name;
end $$;

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema app from public, anon;
grant execute on function public.public_config() to anon, authenticated;
grant execute on function public.responsible_options(), public.registry_save(uuid, jsonb), public.registry_get(uuid, uuid),
  public.registry_list(text, text, integer), public.registry_history(uuid), public.registry_generate_code(uuid) to authenticated;
