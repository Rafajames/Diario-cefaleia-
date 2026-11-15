-- =====================================================================
-- Painel do médico: retornos por paciente e convite de vínculo pelo app.
-- =====================================================================

-- Data de retorno planejada pelo profissional. Só quem tem vínculo ativo autorizado e consentimento escreve;
-- o paciente pode ler (transparência) e o administrador não vê.
create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  professional_id uuid not null references public.profiles (id) on delete cascade,
  next_return date not null,
  reason text check (char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (patient_id, professional_id)
);
alter table public.follow_ups enable row level security;
revoke all on public.follow_ups from anon, authenticated;
grant select, insert, update, delete on public.follow_ups to authenticated;

create policy follow_ups_select on public.follow_ups for select to authenticated
  using (professional_id = auth.uid() or patient_id = auth.uid());
create policy follow_ups_insert on public.follow_ups for insert to authenticated
  with check (professional_id = auth.uid() and app.acts_as_professional() and app.has_grant(patient_id));
create policy follow_ups_update on public.follow_ups for update to authenticated
  using (professional_id = auth.uid() and app.acts_as_professional() and app.has_grant(patient_id))
  with check (professional_id = auth.uid() and app.acts_as_professional() and app.has_grant(patient_id));
create policy follow_ups_delete on public.follow_ups for delete to authenticated
  using (professional_id = auth.uid());

create trigger follow_ups_touch before update on public.follow_ups for each row execute function app.touch_updated_at();
create trigger follow_ups_audit after insert or update or delete on public.follow_ups for each row execute function app.audit_row();

-- O profissional pede o vínculo pelo e-mail do paciente. A resposta é sempre a mesma:
-- o app não revela se o e-mail tem conta. O vínculo nasce PENDENTE; só o paciente autoriza.
create or replace function public.request_patient_link(p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_patient uuid;
begin
  if not app.acts_as_professional() then
    raise exception 'Acesso restrito a profissionais.' using errcode = '42501';
  end if;
  select id into v_patient from public.profiles
  where lower(email) = lower(trim(p_email)) and role = 'patient' and status = 'active';
  if v_patient is null or v_patient = auth.uid() then
    return;
  end if;
  insert into public.care_links (patient_id, grantee_id, status)
  values (v_patient, auth.uid(), 'pending')
  on conflict (patient_id, grantee_id) do nothing;
end $$;

revoke execute on function public.request_patient_link(text) from public, anon;
grant execute on function public.request_patient_link(text) to authenticated;
