# Solução de problemas

| Problema | Causa | Solução | Arquivos relacionados |
|---|---|---|---|
| Tela "Configuração pendente" | Variáveis `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` ausentes no build | Criar `.env` (local) ou definir as variáveis na hospedagem e refazer o build | `.env.example`, `src/config/env.ts` |
| "Você não tem permissão…" ao registrar | Consentimento de dados de saúde não concedido ou revogado; conta suspensa | Meu perfil → Consentimentos; ou reativar a conta no painel administrativo | `app.can_write_own`, `…0003_security.sql` |
| Profissional não vê o paciente | Vínculo pendente/revogado, consentimento de compartilhamento desativado, ou prontuário não aberto | Paciente autoriza em Meu perfil; o profissional abre o paciente pelo painel (isso registra o acesso) | `app.has_grant`, `app.can_read_patient`, `professional-dashboard/` |
| Profissional não vê o ciclo menstrual | Falta autorização específica | Paciente marca "Permitir que veja também meu ciclo menstrual" no vínculo | `app.can_read_menstruation` |
| Cadastro falha com "Cadastro público desativado" | `public_signup_enabled = false` e e-mail sem convite válido | Administrador cria convite para o mesmo e-mail (validade de 14 dias) | `app.handle_new_user`, `administration/` |
| Convidado virou paciente em vez de profissional | E-mail do cadastro diferente do convite, ou convite expirado/revogado | Novo convite; ajustar o perfil em Usuários | `invites`, `app.handle_new_user` |
| Link de confirmação/redefinição abre página errada | *Site URL* / *Redirect URLs* incorretas no Supabase | Ajustar em Auth → URL Configuration | `docs/DEPLOYMENT.md` |
| E-mails não chegam | SMTP padrão do Supabase (limite baixo) | Configurar SMTP próprio | Painel Supabase |
| Frequência aparece como "Dados insuficientes" | Menos de 50% dos dias do período têm informação | Marcar os dias sem dor; o limite é `evolution_rules.min_coverage` | `clinical-evolution/calc.ts` |
| Dia aparece cinza mesmo sem dor | Dia não foi confirmado como "sem dor" | Calendário → dia → "✓ Dia sem dor" | `calendar/calc.ts` |
| Crise com "!" no calendário | Sem término ou sem intensidade | Editar a crise e completar | `calendar/calc.ts → isAttackIncomplete` |
| Clicar no rótulo marcava a primeira opção | `<label>` envolvendo botões (corrigido na 0.1.0) | Usar sempre `Field`; grupos usam `role="group"` | `src/components/ui.tsx` |
| `npm run test:db:local` falha ao iniciar | Binários do PostgreSQL ausentes | Instalar PostgreSQL 15+ ou definir `PGBIN`; ou usar `DATABASE_URL` com `npm run test:db` | `scripts/test-db-local.sh` |
| `npm run test:e2e` não encontra navegador | Chrome/Chromium ausente | Instalar ou definir `CHROME_PATH` | `tests/e2e/smoke.mjs` |

## Ao corrigir um problema

1. Identificar o módulo. 2. Identificar a causa. 3. Corrigir. 4. Criar teste de regressão.
5. Registrar aqui e no [CHANGELOG](CHANGELOG.md).
