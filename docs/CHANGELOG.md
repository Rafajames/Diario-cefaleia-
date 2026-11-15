# Changelog

## 0.3.0 — 2026-11-15

- Painel do médico: tela inicial com orientação, cartões de resumo, busca e filtro por situação, exportação da lista em CSV, retornos planejados (tabela `follow_ups`, visível ao paciente) e convite de vínculo pelo e-mail do paciente (`request_patient_link`: resposta sempre igual, vínculo nasce pendente).
- Paciente de demonstração (`/profissional/demo`): dados fictícios gerados no navegador, nada é gravado.
- Resumo para consulta em PDF (versão compacta do relatório), modelos de estrutura para observações (só títulos em branco) e perfil profissional (conselho, número, especialidade).
- Migration `0005_painel_medico.sql`.

## 0.2.0 — 2026-11-15

- Logo oficial do projeto (variantes clara e escura), ícones do PWA e favicon.
- Publicação no GitHub Pages (workflow `pages.yml`, caminho base configurável por `VITE_BASE`).
- Administrador com atuação clínica: campo `profiles.clinical_enabled`, ligado **somente no SQL** (`supabase/seed/provision_admin_clinico.sql`, migration `0004`). Sem ele, o administrador não recebe vínculos nem usa o painel profissional. Com ele, continuam exigidos vínculo autorizado pelo paciente, consentimento e abertura de prontuário registrada.
- Troca de perfil (Administrador ⇄ Médico) para contas habilitadas.

## 0.1.0 — 2026-11-15

Primeira versão funcional (pré-produção).

### Alterações
- Fundação: React + TypeScript + Vite + Tailwind + PWA; tokens de cor da CENDOR; estrutura modular.
- Banco: 18 tabelas com RLS, gatilhos de proteção e auditoria, 8 funções RPC, parâmetros configuráveis.
- Autenticação: cadastro (público ou por convite), login, logout, recuperação e redefinição de senha, consentimentos versionados, controle por perfil.
- Paciente: perfil, tela "Hoje", calendário mensal, registro de crises em seções, avaliações ao longo da crise, registro diário, medicamentos (catálogo pessoal e preventivos), administrações com resposta terapêutica e intervalos calculados, ciclo menstrual com análise temporal, evolução com comparação entre períodos e gráficos, relatório em PDF, exportações CSV/JSON, compartilhamento e histórico de acessos, pedido de exclusão.
- Profissional: painel de pacientes vinculados e prontuário em 10 abas (somente leitura) com observações clínicas.
- Administrador: indicadores agregados, usuários, vínculos, convites, catálogo, parâmetros, auditoria, relatório anonimizado, pedidos de exclusão.
- Testes: 86 unitários, 35 de segurança do banco, teste de fumaça da interface em Chrome.

### Correções
- **Campos de seleção acionados pelo rótulo** (`components/ui.tsx → Field`): o campo era um `<label>` envolvendo botões; clicar no texto do rótulo acionava o primeiro botão (ex.: marcava intensidade 0 ou a primeira localização). Agora `<label for>` é usado só em controles simples e grupos usam `role="group"`. Regressão coberta por `tests/e2e/smoke.mjs` (passo "nova-crise").
- Símbolo "−" não suportado pela fonte do PDF no critério de duração: texto alterado para "menos".
- Tabela comparativa cortada em telas médias: passou a quebrar linha.

### Problemas conhecidos
- Ainda não validado contra um projeto Supabase real (ver README → "O que falta para produção").
- Envio de e-mail de convite não implementado: o administrador envia o link de cadastro manualmente.
- Uma avaliação pós-dose por intervalo pode receber horário futuro se registrada antes de o intervalo passar.
- Navegação inferior no celular tem 8 itens e rola horizontalmente.
- Durações que atravessam mudança de horário de verão podem variar em 1 hora (horários são locais, sem fuso).
- Sem MFA na interface; sem modo offline para registro.
