# Diário da Cefaleia — CENDOR

Plataforma web para acompanhamento longitudinal de pacientes com cefaleia, vinculada à
**CENDOR — Centro de Tratamento da Dor e Medicina Paliativa**.

O paciente registra crises, intensidade, localização, sintomas, medicamentos, resposta ao tratamento,
possíveis desencadeantes, ciclo menstrual e hábitos. A plataforma transforma esses registros em
indicadores e relatórios para o próprio paciente e para os profissionais que ele autorizar.

> **Estado: versão 0.1.0 — pré-produção.** O código, o banco e os testes estão prontos, mas o projeto
> ainda **não foi conectado a um projeto Supabase real** e precisa de revisão jurídica (LGPD) e de
> segurança antes de receber dados reais de pacientes. Veja [o que falta](#o-que-falta-para-produção).

## Princípios

- A evolução **não** é medida só por dias sem dor: frequência, intensidade, duração, localização,
  medicação, resposta, recorrência e impacto funcional são avaliados **separadamente**, sem nota global.
- **Falta de registro nunca é contada como ausência de dor.**
- Sem diagnósticos automáticos, sem recomendação de medicamentos ou doses, sem afirmar causalidade.
- O paciente controla quem vê seus dados; todo acesso de terceiros é registrado e visível para ele.

## Tecnologias

React 19 · TypeScript · Vite · Tailwind CSS 4 · Supabase (PostgreSQL, Auth, RLS) · React Hook Form ·
Zod · TanStack Query · Recharts · jsPDF · PWA (vite-plugin-pwa) · Vitest · Playwright (Chrome do sistema).

## Como executar localmente

Pré-requisitos: Node.js 22+ e um projeto Supabase (gratuito serve para desenvolvimento).

```bash
npm install
cp .env.example .env        # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev                 # http://localhost:5173
```

Banco de dados: aplique, em ordem, os arquivos de `supabase/migrations/` no projeto Supabase
(SQL Editor ou `supabase db push`). Passo a passo completo em [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

Sem as variáveis de ambiente o app abre uma tela de "Configuração pendente" — nada quebra.

## Testes

| Comando | O que verifica |
|---|---|
| `npm run typecheck` | Tipos TypeScript |
| `npm test` | 86 testes unitários: cálculos clínicos, calendário, ciclo, evolução, validações, permissões, relatório |
| `npm run test:db:local` | 35 testes de segurança (RLS, gatilhos, RPCs) contra um PostgreSQL real e descartável |
| `npm run test:e2e` | Fluxos de paciente, profissional e administrador no Chrome, contra um backend falso em memória |
| `npm run build` | Build de produção |

## Estrutura

```
src/
  app/            roteamento e layout
  components/     componentes de interface reutilizáveis
  config/         ambiente, opções clínicas, textos de consentimento, cores dos gráficos
  modules/        um diretório por módulo (regras de cálculo, validações, serviços, telas)
  services/       cliente Supabase, CRUD genérico, parâmetros, carga de dados
  hooks/ utils/ types/ styles/
supabase/
  migrations/     schema, RLS e funções (fonte da verdade do banco)
  seed/           catálogo opcional e modelo de provisionamento do administrador
tests/            unit/ · integration/ (banco) · e2e/ (interface)
docs/             arquitetura, banco, módulos, segurança, LGPD, API, deploy, changelog, roadmap
```

## Documentação

[Arquitetura](docs/ARCHITECTURE.md) · [Banco de dados](docs/DATABASE.md) · [Módulos](docs/MODULES.md) ·
[Segurança](docs/SECURITY.md) · [LGPD](docs/LGPD.md) · [API](docs/API.md) · [Deploy](docs/DEPLOYMENT.md) ·
[Changelog](docs/CHANGELOG.md) · [Roadmap](docs/ROADMAP.md) · [Solução de problemas](docs/TROUBLESHOOTING.md)

## O que falta para produção

1. Criar o projeto Supabase, aplicar as migrations e configurar Auth (confirmação de e-mail, SMTP, URLs).
2. Definir as variáveis de ambiente na hospedagem (Cloudflare Pages) e publicar.
3. Provisionar o primeiro administrador (`supabase/seed/provision_admin.sql`).
4. Revisão jurídica dos termos de consentimento e da documentação LGPD; nomear o encarregado (DPO).
5. Revisão médica dos parâmetros clínicos (`app_settings`) e do catálogo de medicamentos.
6. Revisão de segurança independente e teste ponta a ponta contra o projeto Supabase real.
7. Definir a licença do repositório (por isso ainda não há arquivo `LICENSE`).

## Avisos

Este software organiza registros autorrelatados. Não substitui avaliação profissional, não emite
diagnósticos e não recomenda tratamentos. Não versione `.env`, chaves, backups ou dados reais.
