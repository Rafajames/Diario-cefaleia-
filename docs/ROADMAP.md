# Roadmap

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
