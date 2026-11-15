-- Provisionamento do administrador geral.
-- Execute SOMENTE no SQL Editor do Supabase (ou via service role), depois que a pessoa
-- criou a conta normalmente e confirmou o e-mail. Troque o e-mail abaixo.
-- Pelo aplicativo isso é impossível: o gatilho app.protect_profile bloqueia.
update public.profiles
set role = 'admin'
where lower(email) = lower('TROQUE-PELO-EMAIL-DO-ADMINISTRADOR')
returning id, email, role;
