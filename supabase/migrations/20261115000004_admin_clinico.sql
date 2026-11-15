-- =====================================================================
-- Administrador com atuação clínica (apenas contas habilitadas no SQL)
-- Um administrador só atua como médico se `clinical_enabled` for ligado
-- diretamente no banco. O aplicativo nunca consegue alterar esse campo.
-- O acesso a pacientes continua exigindo vínculo autorizado pelo paciente,
-- consentimento vigente e abertura de prontuário registrada.
-- =====================================================================
alter table public.profiles add column if not exists clinical_enabled boolean not null default false;

create or replace function app.acts_as_professional() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select role = 'professional' or (role = 'admin' and clinical_enabled)
    from public.profiles where id = auth.uid() and status = 'active'
  ), false)
$$;

create or replace function app.protect_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.id <> old.id or new.email is distinct from old.email or new.created_at <> old.created_at then
    raise exception 'Campo protegido não pode ser alterado.' using errcode = '42501';
  end if;
  if new.clinical_enabled is distinct from old.clinical_enabled then
    raise exception 'A atuação clínica do administrador só é habilitada diretamente no banco.' using errcode = '42501';
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

create or replace function app.has_grant(p_patient uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.care_links l
    join public.profiles g on g.id = l.grantee_id
    where l.patient_id = p_patient
      and l.grantee_id = auth.uid()
      and l.status = 'active'
      and g.status = 'active'
      and (g.role = 'professional' or (g.role = 'admin' and g.clinical_enabled))
  ) and app.has_consent(p_patient, 'professional_sharing')
$$;

create or replace function app.protect_care_link() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ok boolean;
begin
  if tg_op = 'INSERT' then
    select (role = 'professional' or (role = 'admin' and clinical_enabled)) into v_ok
      from public.profiles where id = new.grantee_id and status = 'active';
    if v_ok is not true then
      raise exception 'O vínculo só pode ser criado com um profissional ativo (ou administrador habilitado para atuação clínica).' using errcode = '42501';
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


create or replace function public.professional_overview()
returns table (patient_id uuid, full_name text, link_status text, include_menstruation boolean,
               last_record_at timestamptz, attacks_30d integer)
language plpgsql security definer set search_path = '' as $$
begin
  if not app.acts_as_professional() then
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

create or replace function public.find_grantee_by_email(p_email text)
returns table (id uuid, full_name text, role public.app_role)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.role from public.profiles p
  where app.is_active() and lower(p.email) = lower(trim(p_email)) and p.status = 'active'
    and (p.role = 'professional' or (p.role = 'admin' and p.clinical_enabled))
$$;

drop policy if exists clinical_notes_insert on public.clinical_notes;
drop policy if exists clinical_notes_update on public.clinical_notes;
create policy clinical_notes_insert on public.clinical_notes for insert to authenticated
  with check (author_id = auth.uid() and app.acts_as_professional() and app.can_read_patient(patient_id));
create policy clinical_notes_update on public.clinical_notes for update to authenticated
  using (author_id = auth.uid() and app.acts_as_professional() and app.can_read_patient(patient_id))
  with check (author_id = auth.uid() and app.acts_as_professional() and app.can_read_patient(patient_id));

grant execute on function public.professional_overview(), public.find_grantee_by_email(text) to authenticated;
revoke execute on function app.acts_as_professional() from public, anon;
grant execute on function app.acts_as_professional() to authenticated;
