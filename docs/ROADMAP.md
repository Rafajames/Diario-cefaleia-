# Roadmap

## Próxima etapa já definida: cadastro do paciente, Fase 2
Decisões tomadas: cadastro feito pela equipe sem conta, acesso a CPF e documentos para paciente, administração, médico responsável e médico vinculado (sempre registrado), entrega em duas fases.
1. **Anexos em armazenamento privado** (Supabase Storage, bucket privado, sem link público): CPF/documento oficial, RG ou CIN (frente e verso), cartão do convênio, cartão SUS, documento do responsável legal, encaminhamentos, exames, outros e foto opcional.
2. Regras de acesso nos objetos iguais às da ficha (`registry_access`); link temporário de poucos segundos, gerado só na abertura e registrado em `access_logs`.
3. PDF, JPG e PNG; limite de tamanho configurável em **Parâmetros** do administrador; conferência do tipo real do arquivo.
4. Aba **Documentos** funcional; situação "Aguardando documentos" ligada à lista de pendências.
5. Perfil de **recepção** (sem acesso clínico) para cadastrar pacientes, no lugar de depender só do administrador.
6. Revisão jurídica da base legal para cadastrar paciente antes do consentimento dele (pendente).

## Próximos passos (para colocar em uso)
1. Conectar ao projeto Supabase real, aplicar migrations e executar o roteiro de verificação do DEPLOYMENT.
2. Revisões jurídica (LGPD, termos) e médica (parâmetros clínicos, catálogo).
3. Testes ponta a ponta automatizados contra um projeto Supabase de homologação.
4. E-mail de convite (Edge Function + SMTP) e MFA para profissionais e administradores.

## Melhorias planejadas
- Gráficos no PDF; relatório por classe e por princípio ativo na interface (o cálculo já existe em `summarizeResponses`).
- Configuração de listas clínicas (sintomas, fatores) pelo administrador.
- Lembretes e notificações (registro diário, avaliação pós-dose).
- Registro offline com sincronização.
- Mapa anatômico interativo para localização da dor.
- Normalização de sintomas/desencadeantes em views para análises em SQL.
- Rotina automática de expurgo conforme política de retenção.

## Futuro (arquitetura já preparada)
Aplicativo nativo · internacionalização e outros países · integração com wearables e prontuários
eletrônicos · questionários clínicos validados (após verificar licenças) · análise de padrões temporais ·
estudos observacionais e painéis epidemiológicos anonimizados · IA para **resumir** históricos, como
ferramenta de organização e síntese — nunca como substituta do profissional ou geradora de diagnóstico.
