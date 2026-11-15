# Painel do profissional

`src/modules/professional-dashboard/`

## Objetivo
Pacientes vinculados e prontuário em abas, somente leitura, com observações clínicas.

## Arquivos e responsabilidades
- `service.ts` — visão geral, abertura de prontuário, observações
- `pages.tsx` — painel e prontuário

## Regras
Abrir o paciente chama open_patient_record (registra o acesso). Alertas são informativos. Sem recomendações terapêuticas.

## Testes
tests/integration/rls.test.ts · tests/e2e (profissional)
