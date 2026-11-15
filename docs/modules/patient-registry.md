# Módulo: cadastro principal do paciente

Cada paciente tem **uma única ficha** (`public.patient_registry`), ligada à conta (`user_id`) quando ela existe.
Calendário, crises, medicamentos, relatórios e histórico clínico continuam apontando para a conta (`patients.id`); a ficha se liga a eles pelo mesmo `user_id`.

## Estado atual (Fase 1)
Abas: Identificação, Documentos (anexos na Fase 2), Contato, Endereço, Administrativo, Responsáveis e emergência, Histórico clínico, Consentimentos.

- **Rascunho:** nada é obrigatório para salvar. Para a situação ficar *Completo*: nome, CPF válido, data de nascimento, telefone celular e, se menor de 18 anos, responsável legal (nome, CPF e parentesco). A situação *Inativo* e *Aguardando documentos* só a administração define.
- **Prontuário:** `CEF-000001`, gerado por sequência no banco, único, não editável.
- **CPF:** validado pelos dígitos verificadores (navegador e banco), guardado só com números, **único** (impede duplicado). Mensagem de duplicidade não revela de quem é o cadastro.
- **Cadastro pela equipe, sem conta:** a administração cria a ficha, gera um **código de ativação** (7 dias, 5 tentativas, guardado só como hash, exibido uma vez). O paciente cria a conta e informa prontuário + código em *Cadastro* para vincular. Se a conta nova já tiver ficha automática sem CPF, ela é substituída pela ficha da equipe.
- **Sem duplicação:** nome, nascimento, sexo, telefone, país e cidade já existiam em `profiles`/`patients`; a ficha é mantida em sincronia nos dois sentidos (alterar numa tela reflete na outra).
- **Fora da ficha (continuam em `patients`):** medicamentos de uso contínuo e doenças associadas.

## Permissões (tudo por função no banco; a tabela não tem acesso direto)
| Quem | Ler | Escrever |
|---|---|---|
| Próprio paciente | sua ficha | seus campos, exceto administrativos |
| Administração | todas (acesso registrado) | todos os campos, cria cadastros |
| Médico responsável | fichas em que é responsável (registrado) | não |
| Médico com vínculo ativo + consentimento + prontuário aberto | ficha do paciente (registrado) | não |
| Demais | não | não |

O CPF nunca aparece em listas (mascarado), URLs, logs ou auditoria.

## Auditoria
`registry_audit` guarda quem, quando e **quais campos** mudaram, nunca os valores. Criação e alteração também gravam `created_by`/`updated_by`. O paciente e a administração consultam o histórico na própria ficha. Leituras por terceiros entram em `access_logs` (`open_registry`).

## Funções
`registry_save`, `registry_get`, `registry_list`, `registry_history`, `registry_generate_code`, `registry_claim`. Migration: `20261115000006_cadastro_paciente.sql`.

## Fase 2 (pendente)
Anexos (CPF, identidade, cartão do convênio, cartão SUS, encaminhamentos, exames, foto): bucket privado no Supabase Storage, regras de acesso por paciente, link temporário gerado só na abertura (registrado), PDF/JPG/PNG, limite de tamanho configurável em parâmetros.
