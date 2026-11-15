-- =====================================================================
-- Migration 0003: Row Level Security, privilégios e funções RPC
-- Princípios:
--  * RLS habilitada em TODAS as tabelas; nada é concedido a "anon".
--  * Paciente só lê/escreve os próprios dados.
--  * Terceiros (profissional/admin) só leem com vínculo ativo autorizado
--    pelo paciente + abertura de prontuário registrada (access_logs).
--  * Ninguém altera a própria função por requisições comuns.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array['profiles', 'patients', 'professionals', 'app_settings', 'consents', 'care_links',
    'invites', 'access_logs', 'audit_log', 'deletion_requests', 'headache_attacks', 'attack_assessments',
    'daily_logs', 'medications', 'preventive_treatments', 'medication_administrations', 'menstrual_cycles',
    'clinical_notes']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Privilégios explícitos (somente "authenticated"; a RLS filtra as linhas)
-- ---------------------------------------------------------------------
grant select, update on public.profiles to authenticated;
grant select, update on public.patients, public.professionals to authenticated;
grant select, insert, update on public.app_settings to authenticated;
grant select, insert on public.consents to authenticated;
grant select, insert, update on public.care_links to authenticated;
grant select, insert, update on public.invites to authenticated;
grant select on public.access_logs, public.audit_log to authenticated;
grant select, insert, update on public.deletion_requests to authenticated;
grant select, insert, update, delete on public.headache_attacks, public.attack_assessments, public.daily_logs,
  public.medications, public.preventive_treatments, public.medication_administrations,
  public.menstrual_cycles to authenticated;
grant select, insert, update on public.clinical_notes to authenticated;

-- ---------------------------------------------------------------------
-- Perfis
-- ---------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or app.is_admin()
  or app.has_grant(id)
  or exists (select 1 from public.care_links l where l.patient_id = auth.uid() and l.grantee_id = profiles.id)
  or exists (select 1 from public.care_links l where l.grantee_id = auth.uid() and l.patient_id = profiles.id and l.status = 'pending')
);
create policy profiles_update on public.profiles for update to authenticated
  using ((id = auth.uid() and app.is_active()) or app.is_admin())
  with check ((id = auth.uid() and app.is_active()) or app.is_admin());

create policy patients_select on public.patients for select to authenticated using (app.can_read_patient(id));
create policy patients_update on public.patients for update to authenticated
  using (id = auth.uid() and app.is_active()) with check (id = auth.uid() and app.is_active());

create policy professionals_select on public.professionals for select to authenticated using (
  id = auth.uid() or app.is_admin()
  or exists (select 1 from public.care_links l where l.patient_id = auth.uid() and l.grantee_id = professionals.id)
);
create policy professionals_update on public.professionals for update to authenticated
  using (id = auth.uid() and app.is_active()) with check (id = auth.uid() and app.is_active());

-- ---------------------------------------------------------------------
-- Configurações
-- ---------------------------------------------------------------------
create policy app_settings_select on public.app_settings for select to authenticated using (app.is_active());
create policy app_settings_insert on public.app_settings for insert to authenticated with check (app.is_admin());
create policy app_settings_update on public.app_settings for update to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------------
-- Consentimentos (somente inserção: histórico imutável)
-- ---------------------------------------------------------------------
create policy consents_select on public.consents for select to authenticated
  using (user_id = auth.uid() or app.is_admin());
create policy consents_insert on public.consents for insert to authenticated
  with check (user_id = auth.uid() and app.is_active());

-- ---------------------------------------------------------------------
-- Vínculos (regras de transição no gatilho app.protect_care_link)
-- ---------------------------------------------------------------------
create policy care_links_select on public.care_links for select to authenticated
  using (patient_id = auth.uid() or grantee_id = auth.uid() or app.is_admin());
create policy care_links_insert on public.care_links for insert to authenticated
  with check ((patient_id = auth.uid() and app.is_active()) or app.is_admin());
create policy care_links_update on public.care_links for update to authenticated
  using ((patient_id = auth.uid() and app.is_active()) or (grantee_id = auth.uid() and app.is_active()) or app.is_admin())
  with check ((patient_id = auth.uid() and app.is_active()) or (grantee_id = auth.uid() and app.is_active()) or app.is_admin());

-- ---------------------------------------------------------------------
-- Convites, logs, exclusão
-- ---------------------------------------------------------------------
create policy invites_admin_select on public.invites for select to authenticated using (app.is_admin());
create policy invites_admin_insert on public.invites for insert to authenticated with check (app.is_admin());
create policy invites_admin_update on public.invites for update to authenticated using (app.is_admin()) with check (app.is_admin());

-- O paciente vê quem acessou seus dados; o ator vê os próprios acessos; o admin vê todos (sem conteúdo clínico).
create policy access_logs_select on public.access_logs for select to authenticated
  using (patient_id = auth.uid() or actor_id = auth.uid() or app.is_admin());

-- O histórico de alterações contém dados clínicos: somente o titular lê diretamente.
-- O administrador consulta apenas metadados via public.admin_audit_log().
create policy audit_log_select on public.audit_log for select to authenticated
  using (patient_id = auth.uid() and app.is_active());

create policy deletion_requests_select on public.deletion_requests for select to authenticated
  using (user_id = auth.uid() or app.is_admin());
create policy deletion_requests_insert on public.deletion_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and processed_by is null);
create policy deletion_requests_update on public.deletion_requests for update to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------------
-- Tabelas clínicas com patient_id
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['headache_attacks', 'attack_assessments', 'daily_logs',
    'preventive_treatments', 'medication_administrations', 'menstrual_cycles']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (%s)',
      t || '_select', t,
      case when t = 'menstrual_cycles' then 'app.can_read_menstruation(patient_id)' else 'app.can_read_patient(patient_id)' end);
    execute format('create policy %I on public.%I for insert to authenticated with check (app.can_write_own(patient_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (app.can_write_own(patient_id)) with check (app.can_write_own(patient_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (app.can_write_own(patient_id))', t || '_delete', t);
  end loop;
end $$;

-- Catálogo de medicamentos
create policy medications_select on public.medications for select to authenticated
  using ((owner_id is null and app.is_active()) or app.can_read_patient(owner_id));
create policy medications_insert on public.medications for insert to authenticated
  with check ((owner_id is null and app.is_admin()) or app.can_write_own(owner_id));
create policy medications_update on public.medications for update to authenticated
  using ((owner_id is null and app.is_admin()) or app.can_write_own(owner_id))
  with check ((owner_id is null and app.is_admin()) or app.can_write_own(owner_id));
create policy medications_delete on public.medications for delete to authenticated
  using ((owner_id is null and app.is_admin()) or app.can_write_own(owner_id));

-- Observações clínicas: o paciente lê (direito de acesso); só profissional com acesso escreve.
create policy clinical_notes_select on public.clinical_notes for select to authenticated
  using (app.can_read_patient(patient_id));
create policy clinical_notes_insert on public.clinical_notes for insert to authenticated
  with check (author_id = auth.uid() and app.user_role() = 'professional' and app.can_read_patient(patient_id));
create policy clinical_notes_update on public.clinical_notes for update to authenticated
  using (author_id = auth.uid() and app.user_role() = 'professional' and app.can_read_patient(patient_id))
  with check (author_id = auth.uid() and app.user_role() = 'professional' and app.can_read_patient(patient_id));

-- =====================================================================
-- Funções RPC (schema public)
-- =====================================================================

-- Configuração pública mínima (tela de cadastro, antes do login)
create or replace function public.public_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'public_signup_enabled', coalesce((select value from public.app_settings where key = 'public_signup_enabled'), 'true'::jsonb),
    'consent_versions', coalesce((select value from public.app_settings where key = 'consent_versions'), '{}'::jsonb)
  )
$$;

-- Abertura de prontuário: verifica o vínculo e REGISTRA o acesso. Sem isso a RLS nega a leitura.
create or replace function public.open_patient_record(p_patient_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app.has_grant(p_patient_id) then
    raise exception 'Acesso não autorizado a este paciente.' using errcode = '42501';
  end if;
  insert into public.access_logs (actor_id, patient_id, action) values (auth.uid(), p_patient_id, 'open_record');
  return true;
end $$;

create or replace function public.log_report_event(p_patient_id uuid, p_kind text, p_detail text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_kind not in ('export_pdf', 'export_csv', 'export_own_data') then
    raise exception 'Tipo de evento inválido.' using errcode = '22023';
  end if;
  if not app.can_read_patient(p_patient_id) then
    raise exception 'Acesso não autorizado a este paciente.' using errcode = '42501';
  end if;
  insert into public.access_logs (actor_id, patient_id, action, detail)
  values (auth.uid(), p_patient_id, p_kind, left(p_detail, 300));
end $$;

-- Paciente localiza o profissional pelo e-mail para compartilhar o diário
create or replace function public.find_grantee_by_email(p_email text)
returns table (id uuid, full_name text, role public.app_role)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.role from public.profiles p
  where app.is_active() and lower(p.email) = lower(trim(p_email))
    and p.role in ('professional', 'admin') and p.status = 'active'
$$;

-- Painel do profissional: visão geral dos pacientes vinculados (registra o acesso)
create or replace function public.professional_overview()
returns table (patient_id uuid, full_name text, link_status text, include_menstruation boolean,
               last_record_at timestamptz, attacks_30d integer)
language plpgsql security definer set search_path = '' as $$
begin
  if app.user_role() is null or app.user_role() not in ('professional', 'admin') then
    raise exception 'Acesso restrito a profissionais.' using errcode = '42501';
  end if;
  insert into public.access_logs (actor_id, patient_id, action) values (auth.uid(), null, 'overview');
  return query
  select l.patient_id, p.full_name, l.status, l.include_menstruation,
    case when app.has_grant(l.patient_id) then greatest(
      (select max(a.recorded_at) from public.headache_attacks a where a.patient_id = l.patient_id and a.deleted_at is null),
      (select max(d.recorded_at) from public.daily_logs d where d.patient_id = l.patient_id)) end,
    case when app.has_grant(l.patient_id) then
      (select count(*)::integer from public.headache_attacks a
        where a.patient_id = l.patient_id and a.deleted_at is null and a.started_at >= (now() - interval '30 days')) end
  from public.care_links l
  join public.profiles p on p.id = l.patient_id
  where l.grantee_id = auth.uid() and l.status in ('active', 'pending');
end $$;

-- Painel administrativo: somente contagens agregadas
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_admin() then
    raise exception 'Acesso restrito ao administrador.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'patients', (select count(*) from public.profiles where role = 'patient'),
    'professionals', (select count(*) from public.profiles where role = 'professional'),
    'suspended', (select count(*) from public.profiles where status = 'suspended'),
    'active_patients_30d', (select count(distinct pid) from (
        select patient_id pid from public.headache_attacks where recorded_at > now() - interval '30 days'
        union select patient_id from public.daily_logs where recorded_at > now() - interval '30 days') s),
    'new_signups_30d', (select count(*) from public.profiles where created_at > now() - interval '30 days'),
    'records_total', (select count(*) from public.headache_attacks where deleted_at is null)
        + (select count(*) from public.daily_logs) + (select count(*) from public.medication_administrations),
    'attacks_total', (select count(*) from public.headache_attacks where deleted_at is null),
    'reports_generated', (select count(*) from public.access_logs where action in ('export_pdf', 'export_csv')),
    'active_links', (select count(*) from public.care_links where status = 'active'),
    'pending_deletions', (select count(*) from public.deletion_requests where status = 'pending'),
    'generated_at', now()
  );
end $$;

-- Estatística populacional anonimizada: apenas pacientes com consentimento de pesquisa,
-- e somente quando o grupo tem tamanho mínimo (k = 5).
create or replace function public.admin_aggregate_report() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_n integer;
  v_min constant integer := 5;
begin
  if not app.is_admin() then
    raise exception 'Acesso restrito ao administrador.' using errcode = '42501';
  end if;
  select count(*) into v_n from public.patients p where app.has_consent(p.id, 'research');
  if v_n < v_min then
    return jsonb_build_object('insufficient', true, 'minimum_group', v_min, 'consenting_patients', v_n);
  end if;
  return (
    with c as (select p.id from public.patients p where app.has_consent(p.id, 'research')),
    a as (select h.* from public.headache_attacks h join c on c.id = h.patient_id
          where h.deleted_at is null and h.started_at > now() - interval '90 days')
    select jsonb_build_object(
      'insufficient', false, 'consenting_patients', v_n, 'period_days', 90,
      'attacks', (select count(*) from a),
      'patients_with_attacks', (select count(distinct patient_id) from a),
      'mean_max_intensity', (select round(avg(intensity_max), 1) from a),
      'median_duration_hours', (select round((percentile_cont(0.5) within group
          (order by extract(epoch from (ended_at - started_at)) / 3600.0))::numeric, 1) from a where ended_at is not null),
      'acute_medication_administrations', (select count(*) from public.medication_administrations m
          join c on c.id = m.patient_id where m.taken_at > now() - interval '90 days'),
      'generated_at', now())
  );
end $$;

-- Histórico de alterações para o administrador: apenas metadados, sem conteúdo clínico
create or replace function public.admin_audit_log(p_limit integer default 100, p_offset integer default 0)
returns table (id bigint, table_name text, record_id uuid, action text, actor_id uuid, patient_id uuid, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_admin() then
    raise exception 'Acesso restrito ao administrador.' using errcode = '42501';
  end if;
  return query select l.id, l.table_name, l.record_id, l.action, l.actor_id, l.patient_id, l.created_at
    from public.audit_log l order by l.id desc limit least(greatest(p_limit, 1), 500) offset greatest(p_offset, 0);
end $$;

-- Procedimento de eliminação de dados (uso EXCLUSIVO via service role / SQL editor,
-- após análise das obrigações legais de retenção — ver docs/LGPD.md).
create or replace function app.purge_patient(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    raise exception 'Operação permitida apenas diretamente no banco.' using errcode = '42501';
  end if;
  delete from public.audit_log where patient_id = p_user;
  delete from auth.users where id = p_user; -- cascata: perfil, paciente e todos os dados clínicos
end $$;

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema app from public, anon;
grant execute on function public.public_config() to anon, authenticated;
grant execute on function public.open_patient_record(uuid), public.log_report_event(uuid, text, text),
  public.find_grantee_by_email(text), public.professional_overview(), public.admin_stats(),
  public.admin_aggregate_report(), public.admin_audit_log(integer, integer) to authenticated;
grant execute on function app.user_role(), app.is_active(), app.is_admin(), app.has_consent(uuid, public.consent_type),
  app.has_grant(uuid), app.can_read_patient(uuid), app.can_read_menstruation(uuid), app.can_write_own(uuid) to authenticated;
