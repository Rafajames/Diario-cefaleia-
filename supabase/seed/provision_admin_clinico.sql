-- Habilita um ADMINISTRADOR a também atuar como médico (somente para contas escolhidas).
-- Execute SOMENTE no SQL Editor do Supabase. Troque os e-mails abaixo.
-- A conta já deve ser administradora (ver provision_admin.sql). O app não consegue alterar este campo.
update public.profiles
set clinical_enabled = true
where role = 'admin'
  and lower(email) in (lower('EMAIL-DO-ADMIN-1'), lower('EMAIL-DO-ADMIN-2'))
returning id, email, role, clinical_enabled;

insert into public.professionals (id)
select id from public.profiles where role = 'admin' and clinical_enabled
on conflict do nothing;
