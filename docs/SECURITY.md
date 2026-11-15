# Segurança

O sistema trata **dados pessoais sensíveis de saúde**. Este documento descreve os controles
implementados, como são testados e o que ainda depende de configuração ou revisão externa.

## Modelo de autorização

| Quem | Pode ler | Pode escrever |
|---|---|---|
| Paciente | Apenas os próprios dados; observações profissionais sobre si; quem acessou seus dados | Apenas os próprios dados, se a conta estiver ativa **e** houver consentimento de dados de saúde |
| Profissional | Pacientes com vínculo **ativo autorizado pelo paciente** + consentimento de compartilhamento vigente + abertura de prontuário registrada. Ciclo menstrual só com autorização específica | Somente observações clínicas (identificadas com autoria) |
| Administrador | Contas, vínculos, convites, parâmetros, estatísticas agregadas, logs (metadados). Dados clínicos **somente** de pacientes que o autorizaram, pela mesma regra do profissional | Situação de contas, função paciente↔profissional, vínculos pendentes/revogação, convites, parâmetros, catálogo |
| Anônimo | Apenas `public_config()` (cadastro aberto? versões dos termos) | Nada |

Tudo isso é imposto no PostgreSQL (RLS + gatilhos). O frontend não é barreira de segurança.

## Controles implementados

- **RLS em todas as tabelas**; privilégios concedidos explicitamente só a `authenticated`; nada a `anon`.
- **Acesso nunca invisível:** terceiros só leem dados clínicos após `open_patient_record()`, que grava em
  `access_logs`. O registro vale 8 horas. O paciente vê a lista de acessos no próprio perfil.
- **Função da conta:** definida apenas pelo banco no cadastro (`patient` ou a função de um convite válido).
  Metadados enviados pelo cliente são ignorados para esse fim.
- **Escalada de privilégio bloqueada por gatilho:** ninguém altera a própria função ou situação; o
  administrador não promove ninguém a administrador nem altera outro administrador por requisições comuns.
- **Vínculos:** terceiros só criam vínculo *pendente*; apenas o paciente ativa; qualquer parte pode revogar.
- **Consentimentos** versionados e imutáveis; revogar o compartilhamento corta o acesso imediatamente.
- **Conta suspensa** perde leitura e escrita, inclusive dos próprios dados clínicos.
- **Histórico de alterações** (`audit_log`) em todas as tabelas clínicas; o administrador vê só metadados.
- **Validação no servidor** por constraints (faixas, datas coerentes, tamanhos, enumerações, FKs compostas).
- **Funções `security definer`** com `search_path = ''` e `execute` revogado de `public`/`anon`.
- **Separação** entre autenticação (`auth.*`, gerido pelo Supabase) e dados clínicos (`public.*`).
- **Frontend:** só a chave pública; nenhum dado clínico em `localStorage` ou no cache do service worker;
  cabeçalhos de segurança em `public/_headers`; proteção contra injeção de fórmulas no CSV; senha mínima
  de 10 caracteres com letra e número; redefinição de senha encerra todas as sessões.
- **Estatística populacional** só com consentimento de pesquisa e grupo mínimo de 5 pacientes.

## Como é testado

`npm run test:db:local` aplica as migrations em um PostgreSQL real e executa 35 cenários, entre eles:
paciente não acessa dados de outro; profissional sem vínculo, com vínculo pendente, sem consentimento ou
sem abertura registrada não lê nada; menstruação exige autorização específica; usuário comum não acessa
funções/tabelas administrativas; alterações indevidas de função são bloqueadas; anônimo não lê nada;
conta suspensa perde acesso; histórico de auditoria é gravado; consentimentos não podem ser alterados.

Limitação: os testes usam um PostgreSQL comum com um stub mínimo do ambiente Supabase
(`tests/integration/supabase-stub.sql`). Repita a verificação no projeto real com
*Database → Advisors → Security* após aplicar as migrations.

## Provisionamento do administrador geral

Nunca pelo aplicativo. Depois que a pessoa criar a conta normalmente, execute no **SQL Editor** do
Supabase (que roda sem `auth.uid()`), conforme `supabase/seed/provision_admin.sql`:

```sql
update public.profiles set role = 'admin' where email = 'email-do-administrador';
```

Registre quem executou e quando. Mantenha no mínimo dois administradores e use MFA nas contas do
painel Supabase.

## Configurações externas obrigatórias (não estão no código)

| Item | Onde | Por quê |
|---|---|---|
| Confirmação de e-mail ativada | Supabase → Auth → Providers → Email | Impede uso de e-mail alheio (inclusive de convidados) |
| SMTP próprio | Supabase → Auth → SMTP | O serviço padrão tem limite baixo e não é para produção |
| Site URL e Redirect URLs | Supabase → Auth → URL Configuration | Links de confirmação e de redefinição de senha |
| Proteção contra senhas vazadas, limites de taxa, expiração de sessão | Supabase → Auth | Proteção de contas e sessões |
| MFA para administradores e profissionais | Supabase → Auth → MFA (e interface — ver Roadmap) | Contas de alto privilégio |
| Backups / PITR | Supabase → Database → Backups | Continuidade; exige plano pago para PITR |
| HTTPS e domínio | Cloudflare Pages | HTTPS é automático; HSTS já vem em `public/_headers` |
| Chave `service_role` | Nunca no frontend nem no repositório | Ignora a RLS |

## Pendências antes de dados reais

- Revisão de segurança independente (incluindo teste de intrusão) e revisão jurídica.
- Teste ponta a ponta contra o projeto Supabase real.
- Política de Content-Security-Policy específica para o domínio final.
- Rotina de expurgo conforme `app_settings.retention` e plano de resposta a incidentes.

## Relato de vulnerabilidades

Não abra issue pública com detalhes. Comunique o responsável técnico da CENDOR por canal privado.

## Administrador com atuação clínica

Por padrão o administrador não acessa dados clínicos. Contas administradoras escolhidas podem ser habilitadas para também atuar como médico ligando `profiles.clinical_enabled` diretamente no banco (`supabase/seed/provision_admin_clinico.sql`); gatilho `app.protect_profile` impede qualquer alteração pelo aplicativo. Mesmo habilitado, o acesso a um paciente exige vínculo ativo autorizado por ele, consentimento de compartilhamento e abertura de prontuário registrada em `access_logs`.
