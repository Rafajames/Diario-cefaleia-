#!/usr/bin/env python3
"""Gera UM SQL que leva qualquer banco ao estado atual (pula o que já foi aplicado)."""
import glob, os, re, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
guards = {  # arquivo -> condição "ainda não aplicado"
  '0001': "to_regclass('public.profiles') is null",
  '0002': "to_regclass('public.headache_attacks') is null",
  '0003': "to_regprocedure('public.open_patient_record(uuid)') is null",
  '0004': "not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='clinical_enabled')",
  '0005': "to_regclass('public.follow_ups') is null",
  '0006': "to_regclass('public.patient_registry') is null",
  '0007': "to_regprocedure('app.is_staff()') is null",
}
out = ["-- DIÁRIO DA CEFALEIA — SQL ÚNICO (cole tudo e clique em Run).",
       "-- Seguro para rodar em banco novo ou já atualizado: cada parte só roda se ainda não foi aplicada.",
       "-- Pode rodar de novo quantas vezes quiser.", "begin;"]
for f in sorted(glob.glob(f'{root}/supabase/migrations/*.sql')):
    n = re.search(r'0000(\d\d)_', f).group(1); k = '00' + n
    sql = open(f).read()
    assert '$mig$' not in sql
    out.append(f"\n-- ===== migration {k} =====\ndo $run$ begin\n  if {guards[k]} then\n    execute $mig$\n{sql}\n$mig$;\n  end if;\nend $run$;")
out.append("commit;")
cat = open(f'{root}/supabase/seed/catalog_medications.sql').read()
out.append("\n-- ===== catálogo opcional de medicamentos (só se ainda estiver vazio) =====\ndo $run$ begin\n  if not exists (select 1 from public.medications where owner_id is null) then\n    execute $mig$\n" + cat + "\n$mig$;\n  end if;\nend $run$;")
out.append("""
-- ===== contas de teste e administradores (só afetam contas que já existem) =====
update public.profiles set role = 'admin'
 where lower(email) in ('jrafa47@gmail.com','dreugeniopatricio@gmail.com');
update public.profiles set clinical_enabled = true
 where role = 'admin' and lower(email) in ('jrafa47@gmail.com','dreugeniopatricio@gmail.com');
insert into public.professionals (id)
 select id from public.profiles where role = 'admin' and clinical_enabled on conflict do nothing;

-- Recepção de teste (em bloco protegido: se o banco ainda não "enxergar" o novo perfil, é só rodar este SQL de novo)
do $run$ begin
  update public.profiles set role = 'reception' where lower(email) = 'recepcao.teste@cefaleia.test';
exception when others then
  raise notice 'Rode este SQL mais uma vez para concluir a promoção da recepção de teste (%).', sqlerrm;
end $run$;

select email, role, clinical_enabled from public.profiles
 where lower(email) in ('jrafa47@gmail.com','dreugeniopatricio@gmail.com','recepcao.teste@cefaleia.test','paciente.teste@cefaleia.test') order by email;""")
open(sys.argv[1], 'w').write('\n'.join(out) + '\n')
