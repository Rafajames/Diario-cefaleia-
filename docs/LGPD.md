# LGPD — proteção de dados

> **Minuta técnica.** Descreve o que o sistema faz com dados pessoais para apoiar a análise do
> responsável jurídico e do encarregado (DPO). **Não é parecer jurídico.** Itens marcados com
> **[definir]** dependem de decisão institucional da CENDOR.

## Agentes de tratamento

- Controlador: CENDOR — Centro de Tratamento da Dor e Medicina Paliativa. **[definir]** razão social, CNPJ, contato.
- Encarregado (DPO): **[definir]**.
- Operadores: Supabase (banco, autenticação) e Cloudflare (hospedagem do site). **[definir]** contratos,
  região de hospedagem e avaliação de transferência internacional de dados.

## Dados coletados

| Categoria | Dados | Origem |
|---|---|---|
| Conta | Nome, e-mail, senha (hash, gerida pelo Supabase Auth), função, situação | Titular |
| Identificação (opcional) | Nascimento, telefone, sexo ao nascimento, gênero, país, cidade, fuso | Titular |
| Saúde (sensível) | Crises, intensidade, localização, sintomas, desencadeantes, impacto, medicamentos e resposta, tratamentos preventivos, hábitos, histórico declarado | Titular |
| Saúde reprodutiva (sensível, opcional) | Sangramentos, regularidade, contraceptivo | Titular (opt-in) |
| Observações clínicas (sensível) | Observações e diagnóstico informados pelo profissional | Profissional |
| Registros técnicos | Consentimentos, vínculos, acessos, histórico de alterações | Sistema |

Princípio da necessidade: quase todos os campos são opcionais; nenhum questionário é obrigatório.

## Finalidades e bases legais (proposta para validação jurídica)

| Finalidade | Base sugerida |
|---|---|
| Criar e manter a conta | Consentimento (art. 7º, I) / execução do serviço solicitado |
| Diário de saúde do paciente | Consentimento específico e destacado para dados sensíveis (art. 11, I) |
| Compartilhamento com profissional escolhido pelo paciente | Consentimento específico; **[avaliar]** tutela da saúde (art. 11, II, "f") |
| Estatísticas e pesquisa | Consentimento específico, separado e opcional; dados agregados/anonimizados |
| Logs de acesso e auditoria | Cumprimento de obrigação legal e segurança |

O consentimento para pesquisa **não** é condição de uso. Cada consentimento é registrado com tipo,
versão do termo, decisão e data (tabela `consents`, histórico imutável).

## Compartilhamentos

- Com profissionais/administradores: apenas por vínculo autorizado pelo próprio paciente, revogável a
  qualquer momento; ciclo menstrual exige autorização adicional.
- Nenhum compartilhamento com terceiros para marketing. Nenhum dado é vendido.
- Estatísticas populacionais: apenas agregadas, com consentimento e grupo mínimo de 5 pessoas.

## Direitos do titular — como o sistema atende

| Direito | Implementação |
|---|---|
| Acesso e confirmação | Todas as telas do paciente; observações profissionais visíveis em Meu perfil |
| Correção | Edição de perfil e de qualquer registro |
| Portabilidade | Meu perfil → "Exportar todos os meus dados (JSON)"; Relatórios → PDF e CSV |
| Informação sobre compartilhamento | Meu perfil → vínculos e "Quem acessou meus dados" |
| Revogação do consentimento | Meu perfil → Consentimentos (efeito imediato) |
| Eliminação | Meu perfil → "Solicitar exclusão" (tabela `deletion_requests`) |

## Retenção e eliminação

- **[definir]** prazos. Ponto de atenção para o jurídico: se os registros integrarem o prontuário do
  paciente, pode haver dever legal de guarda por prazo mínimo (ver Lei 13.787/2018 e normas do CFM), o
  que limita a eliminação imediata.
- Referência técnica em `app_settings.retention` (meses para logs).

Procedimento de eliminação (administrador + responsável técnico):
1. Conferir a identidade do solicitante e as obrigações legais de retenção.
2. Marcar a solicitação como "em processamento" no painel administrativo.
3. No SQL Editor do Supabase: `select app.purge_patient('<id do usuário>');` — remove a conta, todos os
   dados clínicos (cascata) e o histórico de auditoria do titular. A função recusa chamadas pela API.
4. Registrar a conclusão (ou a recusa justificada) com nota ao titular.
5. Lembrar que backups mantêm os dados até expirarem: **[definir]** prazo e informar o titular.

## Segurança

Ver [SECURITY.md](SECURITY.md). Destaques: RLS em todas as tabelas, registro de todo acesso de terceiros,
histórico de alterações, validação no servidor, segredos fora do repositório.

## Pendências

- Texto jurídico definitivo dos termos (hoje há resumos em `src/config/consents.ts`) e da política de privacidade.
- Relatório de Impacto à Proteção de Dados (RIPD), recomendado por envolver dados sensíveis em escala.
- Tratamento de dados de menores de idade: **[definir]** se serão aceitos e como obter consentimento dos responsáveis.
- Plano de resposta a incidentes e canal de atendimento ao titular.

## Cadastro do paciente

Coletamos o necessário ao atendimento; quase todos os campos são opcionais e o cadastro pode ficar incompleto. CPF, documentos e dados de saúde são dados pessoais que exigem base legal e consentimento registrado pelo paciente na conta. Cadastros feitos pela equipe antes de o paciente ter conta precisam de base legal definida pelo CENDOR (revisão jurídica pendente). O paciente consulta quem acessou e quem alterou sua ficha.
