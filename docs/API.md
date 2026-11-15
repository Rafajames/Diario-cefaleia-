# API

Não há API própria: o frontend usa o **Supabase** (PostgREST + Auth) com a chave pública, e o banco
decide o que cada usuário pode fazer. Toda chamada passa por `src/services/supabase.ts`.

## Autenticação (Supabase Auth)

| Ação | Chamada | Serviço |
|---|---|---|
| Cadastro | `auth.signUp` com `full_name` e lista de consentimentos nos metadados | `authentication/service.ts → signUp` |
| Login / logout | `auth.signInWithPassword` / `auth.signOut` (local ou global) | `signIn`, `signOut` |
| Recuperar / redefinir senha | `auth.resetPasswordForEmail` / `auth.updateUser` | `requestPasswordReset`, `updatePassword` |

A função (role) **não** é aceita do cliente. O gatilho `app.handle_new_user` cria `profiles`,
`patients`/`professionals` e grava os consentimentos marcados no cadastro.

## Funções RPC (`supabase.rpc`)

| Função | Quem | O que faz |
|---|---|---|
| `public_config()` | anônimo e autenticado | Cadastro público ativo? Versões dos termos |
| `open_patient_record(p_patient_id)` | profissional/admin com vínculo | Verifica o vínculo e **registra o acesso**; pré-requisito para a RLS liberar a leitura |
| `log_report_event(p_patient_id, p_kind, p_detail)` | quem pode ler o paciente | Registra exportação (`export_pdf`, `export_csv`, `export_own_data`) |
| `find_grantee_by_email(p_email)` | autenticado | Localiza profissional ativo para compartilhamento |
| `professional_overview()` | profissional/admin | Pacientes vinculados, última atualização, crises em 30 dias |
| `admin_stats()` | admin | Contagens agregadas |
| `admin_aggregate_report()` | admin | Estatística anonimizada (consentimento de pesquisa, grupo ≥ 5) |
| `admin_audit_log(p_limit, p_offset)` | admin | Metadados do histórico de alterações |

Erros de permissão retornam código `42501`; mensagens de regra de negócio vêm em português (`P0001`/`42501`)
e são exibidas ao usuário por `utils/errors.ts → friendlyError`.

## Tabelas acessadas via PostgREST

| Módulo | Tabelas | Serviço |
|---|---|---|
| Pacientes | `profiles`, `patients`, `care_links`, `access_logs`, `deletion_requests`, `consents` | `patients/service.ts`, `authentication/service.ts` |
| Crises | `headache_attacks`, `attack_assessments` | `headache-attacks/service.ts` |
| Medicamentos / resposta | `medications`, `preventive_treatments`, `medication_administrations` | `medications/service.ts` |
| Registro diário | `daily_logs` | `daily-context/service.ts` |
| Ciclo menstrual | `menstrual_cycles` | `menstruation/service.ts` |
| Profissional | `clinical_notes` + RPCs | `professional-dashboard/service.ts` |
| Administração | `profiles`, `care_links`, `invites`, `app_settings`, `access_logs`, `medications` + RPCs | `administration/service.ts` |
| Carga para cálculos | crises, avaliações, administrações, registros diários, ciclos | `services/dataset.ts` |

## Contrato de dados

Tipos em `src/types/database.ts`. Horários clínicos trafegam como texto `YYYY-MM-DDTHH:mm[:ss]` sem fuso.
Listas de opções (localização, sintomas, fatores, classes) são chaves estáveis definidas em
`src/config/clinical-options.ts`.

## Edge Functions

Nenhuma nesta versão (`supabase/functions/` reservado). Previsto: envio de e-mail de convite e lembretes.
