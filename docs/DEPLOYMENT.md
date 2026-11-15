# Deploy

Hospedagem sugerida: **Cloudflare Pages** (site estático) + **Supabase** (banco e autenticação).

## 1. Supabase

1. Crie um projeto em https://supabase.com (região mais próxima dos usuários, ex.: `sa-east-1`).
2. Aplique as migrations, em ordem, pelo **SQL Editor** (cole cada arquivo de `supabase/migrations/`) ou
   com a CLI:
   ```bash
   supabase link --project-ref <ref-do-projeto>
   supabase db push
   ```
3. **Auth → Providers → Email:** ative a confirmação de e-mail.
4. **Auth → URL Configuration:** *Site URL* = endereço público do app; em *Redirect URLs* inclua
   `https://<seu-dominio>/` e `https://<seu-dominio>/redefinir-senha` (e `http://localhost:5173/**` para desenvolvimento).
5. **Auth → SMTP:** configure um provedor de e-mail próprio para produção.
6. **Database → Advisors → Security:** confira se não há alertas (ex.: tabela sem RLS).
7. Opcional: carregue `supabase/seed/catalog_medications.sql` **depois** da revisão do responsável médico.
8. Anote, em **Project Settings → API**, a *Project URL* e a chave pública (*publishable/anon*).
   A chave `service_role` **não** deve ser usada no frontend.

## 2. Primeiro administrador

1. A pessoa cria a conta normalmente pelo aplicativo e confirma o e-mail.
2. No SQL Editor, execute `supabase/seed/provision_admin.sql` trocando o e-mail.
3. No painel administrativo, decida se o cadastro público fica ativo (`public_signup_enabled`) e convide
   os profissionais em **Convites** (o convite define o perfil da conta).

## 3. Cloudflare Pages

1. Workers & Pages → Create → Pages → conecte o repositório do GitHub.
2. Build command: `npm run build` · Output directory: `dist` · Node: 22.
3. Variáveis de ambiente (Production e Preview):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy. `public/_redirects` garante o roteamento da SPA e `public/_headers` os cabeçalhos de segurança.
5. Configure o domínio próprio (HTTPS automático) e atualize as URLs no passo 1.4.

Outras hospedagens estáticas (Vercel, Netlify, GitHub Pages) funcionam: basta servir `dist/` com
redirecionamento de todas as rotas para `index.html` e definir as duas variáveis no build.

## 4. Verificação pós-deploy

- [ ] Criar conta de teste, confirmar e-mail, entrar.
- [ ] Registrar dia sem dor, crise, medicamento, resposta e sangramento; conferir calendário e evolução.
- [ ] Gerar PDF e CSV.
- [ ] Convidar um profissional, compartilhar o diário e abrir o prontuário; conferir "Quem acessou meus dados".
- [ ] Tentar abrir `/admin` com conta comum (deve redirecionar).
- [ ] Recuperação de senha de ponta a ponta.

## 5. Operação

- **Backups:** verifique a política do plano Supabase; para dados reais, considere Point-in-Time Recovery.
  Backups contêm dados sensíveis — nunca os guarde no repositório.
- **Atualizações de schema:** sempre por nova migration em `supabase/migrations/`; rode `npm run test:db:local` antes.
- **Ambientes:** use um projeto Supabase separado para desenvolvimento/testes. Dados de demonstração nunca em produção.
