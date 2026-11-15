# Testes de interface (e2e)

`npm run test:e2e` executa `smoke.mjs`: abre o app no Chrome do sistema e percorre os fluxos de
paciente (celular), profissional e administrador, falhando em qualquer erro de JavaScript.

O backend é **falso e em memória** (`fake-supabase.mjs`): não aplica RLS nem regras do banco. A segurança
é testada em `tests/integration` contra PostgreSQL real. Para homologação, repita o roteiro de
`docs/DEPLOYMENT.md` contra um projeto Supabase de testes.

Variáveis: `CHROME_PATH` (executável do navegador) e `E2E_SHOTS=pasta` (salva capturas de tela e o PDF gerado).
