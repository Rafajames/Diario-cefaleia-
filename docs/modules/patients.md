# Pacientes

`src/modules/patients/`

## Objetivo
Perfil declarado pelo paciente, tela inicial, compartilhamento com profissionais, histórico de acessos e direitos do titular (exportação e exclusão).

## Arquivos e responsabilidades
- `schemas.ts` — perfil, perfil menstrual e ciclo
- `service.ts` — perfil, vínculos, acessos, exportação integral, pedido de exclusão
- `scope.tsx` — PatientScope (de qual paciente a tela trata; somente leitura)
- `HomePage.tsx` — tela "Hoje"
- `ProfilePage.tsx` — conta, dados, consentimentos, compartilhamento, segurança, privacidade

## Regras
Campos opcionais. Informações declaradas pelo paciente ficam separadas das observações profissionais (clinical_notes).

## Testes
tests/unit/schemas.test.ts · tests/integration/rls.test.ts · tests/e2e (perfil, compartilhamento)
