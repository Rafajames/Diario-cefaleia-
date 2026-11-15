# Auditoria

`src/modules/audit/`

## Objetivo
Registro de acessos a dados clínicos e histórico de alterações.

## Arquivos e responsabilidades
- Implementado no banco: tabelas access_logs e audit_log, gatilho app.audit_row, funções open_patient_record, log_report_event e admin_audit_log
- Telas: administration/pages.tsx (AdminAuditPage) e patients/ProfilePage.tsx ("Quem acessou meus dados")

## Regras
O conteúdo do histórico é visível só ao titular; o administrador vê metadados.

## Testes
tests/integration/rls.test.ts (auditoria)
