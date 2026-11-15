# Banco de dados

Fonte da verdade: `supabase/migrations/` (aplicar em ordem).

| Arquivo | Conteúdo |
|---|---|
| `…0001_foundation.sql` | Perfis, pacientes, profissionais, parâmetros, consentimentos, vínculos, convites, logs, funções auxiliares, gatilhos de cadastro e proteção |
| `…0002_clinical.sql` | Crises, avaliações, registro diário, medicamentos, administrações, ciclo menstrual, observações clínicas |
| `…0003_security.sql` | RLS em todas as tabelas, privilégios explícitos, funções RPC |

## Tabelas

| Tabela | Finalidade | Observações |
|---|---|---|
| `profiles` | Conta: nome, e-mail, função (`patient`/`professional`/`admin`), situação | 1:1 com `auth.users`; função e situação protegidas por gatilho |
| `patients` | Dados declarados pelo paciente + preferências do módulo menstrual | Todos opcionais |
| `professionals` | Dados do profissional (conselho, especialidade) | |
| `app_settings` | Parâmetros clínicos e administrativos (jsonb) | Leitura: autenticados; escrita: admin |
| `consents` | Histórico imutável de consentimentos (tipo, versão, concedido, data) | Só inserção |
| `care_links` | Vínculo paciente ↔ profissional/admin (`pending`/`active`/`revoked`, `include_menstruation`) | Só o paciente ativa |
| `invites` | Convites por e-mail com função | Só admin |
| `access_logs` | Quem abriu/exportou dados de qual paciente | Escrita apenas por funções do servidor |
| `audit_log` | Histórico de alterações (antes/depois) | Conteúdo visível só ao titular |
| `deletion_requests` | Pedidos de exclusão de conta e dados | |
| `headache_attacks` | Crise: início, término, intensidades, localização, características, sintomas, desencadeantes, impacto | `deleted_at` = exclusão lógica |
| `attack_assessments` | Avaliações ao longo da crise (intensidade/localização), opcionalmente ligadas a uma administração | |
| `daily_logs` | Registro diário, inclusive "dia sem dor confirmado" | Único por paciente e data |
| `medications` | Catálogo geral (`owner_id` nulo) e medicamentos personalizados do paciente | |
| `preventive_treatments` | Tratamentos preventivos e alterações de dose | |
| `medication_administrations` | Cada dose usada em crise + resposta (alívio, desfecho, recorrência, efeito adverso) | |
| `menstrual_cycles` | Sangramentos (início, fim opcional, fluxo) | Visível a terceiros só com autorização específica |
| `clinical_notes` | Observações de autoria profissional | Separadas do autorrelato; o paciente pode ler |

## Integridade e validação no servidor

- Intensidades entre 0 e 10; escalas 1–5; impacto 0–3; textos com tamanho máximo.
- Término ≥ início; crise em andamento não tem término; alívio/recorrência ≥ horário da dose.
- Chaves estrangeiras compostas `(attack_id, patient_id)` impedem anexar avaliação ou dose à crise de outro paciente.
- Enumerações por `check` (função, situação, desfecho, via, categoria, fluxo…).

## Funções auxiliares (schema `app`, não exposto pela API)

`user_role()`, `is_active()`, `is_admin()`, `has_consent(user, tipo)`, `has_grant(paciente)`,
`can_read_patient(paciente)`, `can_read_menstruation(paciente)`, `can_write_own(paciente)`,
`handle_new_user()`, `protect_profile()`, `protect_care_link()`, `audit_row()`, `purge_patient()`.

## Convenções

- Horários de eventos clínicos: `timestamp` (horário local do paciente). Carimbos do sistema: `timestamptz`.
- Toda tabela clínica tem `patient_id`, `recorded_at`, `updated_at` e gatilho de auditoria.
- Nova tabela? Habilite RLS, crie as políticas, conceda privilégios explícitos a `authenticated` e adicione testes em `tests/integration/rls.test.ts`.
