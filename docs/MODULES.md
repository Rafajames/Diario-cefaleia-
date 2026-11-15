# Módulos

Cada módulo fica em `src/modules/<nome>/` com regras de cálculo, validações, serviços e telas próprios.
Erros são convertidos em mensagens compreensíveis por `utils/errors.ts`; validações lançam `ValidationError` com o campo afetado.

| Módulo | Objetivo | Documento |
|---|---|---|
| Autenticação | Cadastro, login, logout, recuperação/redefinição de senha, sessão, consentimentos obrigatórios e controle de acesso por perfil. | [modules/authentication.md](modules/authentication.md) |
| Pacientes | Perfil declarado pelo paciente, tela inicial, compartilhamento com profissionais, histórico de acessos e direitos do titular (exportação e exclusão). | [modules/patients.md](modules/patients.md) |
| Calendário | Visão mensal dos dias com cefaleia, sem dor confirmados, com menstruação e com informação incompleta. | [modules/calendar.md](modules/calendar.md) |
| Registro de crises | Formulário em seções (identificação, intensidade, localização, características, agravamento, sintomas, duração, desencadeantes, impacto) e avaliações ao longo da crise. | [modules/headache-attacks.md](modules/headache-attacks.md) |
| Medicamentos | Catálogo geral e pessoal, tratamentos preventivos e persistência das administrações. | [modules/medications.md](modules/medications.md) |
| Resposta terapêutica | Intervalos entre crise, medicação e alívio; redução de intensidade; resumo por medicamento, princípio ativo ou classe. | [modules/treatment-response.md](modules/treatment-response.md) |
| Ciclo menstrual | Registro opcional de sangramentos e análise de associação temporal com a cefaleia. | [modules/menstruation.md](modules/menstruation.md) |
| Registro diário | Dia sem dor confirmado e hábitos (sono, hidratação, alimentação, cafeína, atividade, estresse, humor). | [modules/daily-context.md](modules/daily-context.md) |
| Evolução clínica | Indicadores por período, comparação entre períodos por dimensão, série mensal, sinalização informativa de uso frequente de medicação. | [modules/clinical-evolution.md](modules/clinical-evolution.md) |
| Relatórios | Relatório individual em PDF (17 seções) e exportações CSV. | [modules/reports.md](modules/reports.md) |
| Painel do profissional | Pacientes vinculados e prontuário em abas, somente leitura, com observações clínicas. | [modules/professional-dashboard.md](modules/professional-dashboard.md) |
| Administração | Indicadores agregados, usuários, vínculos, convites, catálogo, parâmetros, pedidos de exclusão. | [modules/administration.md](modules/administration.md) |
| Auditoria | Registro de acessos a dados clínicos e histórico de alterações. | [modules/audit.md](modules/audit.md) |
