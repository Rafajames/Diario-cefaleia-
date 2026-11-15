# Arquitetura

## Visão geral

```
Navegador (PWA React)  ──HTTPS──►  Supabase
  módulos de interface               ├─ Auth (GoTrue): contas, sessões, e-mails
  regras de cálculo (puras)          ├─ PostgREST: API automática sobre o Postgres
  validação (Zod)                    └─ PostgreSQL: dados + RLS + gatilhos + funções RPC
```

Não há servidor de aplicação próprio. **Toda regra de autorização vive no banco** (Row Level Security,
gatilhos e funções `security definer`). O frontend usa apenas a chave pública; as verificações de tela
existem só para navegação — nunca como barreira de segurança.

## Camadas do frontend

| Camada | Onde | Responsabilidade |
|---|---|---|
| Telas | `src/modules/*/…Page.tsx`, `pages.tsx` | Composição e interação |
| Componentes | `src/components/` | Interface reutilizável, sem regra de negócio |
| Regras de cálculo | `src/modules/*/calc.ts` | Funções **puras**, testadas, sem acesso a rede |
| Validação | `src/modules/*/schemas.ts` | Zod; a mesma regra existe como constraint no banco |
| Serviços | `src/modules/*/service.ts`, `src/services/` | Única camada que fala com o Supabase |
| Configuração | `src/config/` | Opções clínicas, parâmetros padrão, textos, cores |

Regra de dependência: telas → serviços/cálculos → utilitários. Módulos de cálculo nunca importam telas.
O cálculo flui em uma direção: `calendar/calc` → `treatment-response/calc` → `menstruation/calc` →
`clinical-evolution/calc` → `reports/content` (sem ciclos).

## Fluxo de dados clínicos

1. `services/dataset.ts` carrega um **Dataset** (crises, avaliações, administrações, registros diários,
   ciclos) de um paciente para um intervalo.
2. Funções puras calculam calendário, indicadores, comparação e análise menstrual a partir do Dataset.
3. As mesmas funções alimentam a tela do paciente, a visão do profissional, o PDF e o CSV — a lógica
   nunca é duplicada.

`PatientScope` (`modules/patients/scope.tsx`) informa a cada tela **de qual paciente** ela trata e se é
somente leitura. As telas do paciente e as abas do profissional reutilizam os mesmos componentes.

## Decisões técnicas

| # | Decisão | Motivo |
|---|---|---|
| 1 | Autorização 100% no banco (RLS) | Não confiar no frontend; uma única fonte de verdade |
| 2 | Horários clínicos como `timestamp` sem fuso ("relógio de parede" do paciente); `recorded_at` como `timestamptz` do servidor | O diário registra o que o paciente viveu no horário local; evita que conversões de fuso movam uma crise de dia. Diferencia horário do evento × horário do registro. Limitação: durações que atravessam mudança de horário de verão podem variar 1 h |
| 3 | Sintomas e desencadeantes em `jsonb` dentro da crise | Salvar a crise é uma operação atômica; listas são validadas por Zod e por constraint de tipo. Podem ser normalizados por views no futuro |
| 4 | Cada administração de medicamento é uma linha própria; avaliações pós-dose são `attack_assessments` ligadas à administração | Exigência clínica: múltiplas doses e múltiplas avaliações por crise |
| 5 | Terceiros só leem após `open_patient_record()` registrar o acesso (válido por 8 h) | O acesso de profissional/administrador nunca é invisível |
| 6 | Exclusão lógica de crises (`deleted_at`) + histórico em `audit_log` | Rastreabilidade |
| 7 | Consentimentos como histórico imutável (só inserção) | Prova de versão e data de cada decisão |
| 8 | Função da conta definida só pelo banco (padrão `patient` ou convite) | Usuário nunca escolhe o próprio perfil |
| 9 | Parâmetros clínicos em `app_settings`, com padrões em `config/clinical-options.ts` | Regras transparentes e configuráveis; revisão médica |
| 10 | Sem pontuação global de evolução | Uma nota única esconderia piora em alguma dimensão |
| 11 | TanStack Query para cache; após cada escrita, todas as consultas são invalidadas | Simplicidade e consistência; volume de dados por paciente é pequeno |
| 12 | Formulário de crise com React Hook Form; modais pequenos com `useDraft` | Menos código nos formulários simples; validação sempre via Zod no serviço |
| 13 | Service worker guarda só o "app shell"; nenhuma resposta da API é armazenada em cache | Dados clínicos não ficam em cache do navegador |
| 14 | Gráficos sem eixo duplo, com legenda, tabela equivalente e paleta validada para daltonismo | Leitura correta e acessível |

## Preparado para o futuro

- **Internacionalização:** textos de opções centralizados em `config/clinical-options.ts`; valores gravados são chaves estáveis em inglês.
- **Mapa anatômico:** localizações já são chaves por região/lado; basta um componente que emita as mesmas chaves.
- **App nativo / integrações:** a API é o próprio Supabase; regras de cálculo são TypeScript puro reutilizável.
- **IA para síntese:** `reports/content.ts` já produz o resumo estruturado que serviria de entrada — como ferramenta de organização, nunca de diagnóstico.
