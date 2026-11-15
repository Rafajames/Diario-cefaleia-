# Autenticação

`src/modules/authentication/`

## Objetivo
Cadastro, login, logout, recuperação/redefinição de senha, sessão, consentimentos obrigatórios e controle de acesso por perfil.

## Arquivos e responsabilidades
- `access.ts` — regras puras de área por perfil e de consentimentos obrigatórios
- `schemas.ts` — validação de login, cadastro e senha
- `service.ts` — chamadas ao Supabase Auth e à tabela consents
- `AuthProvider.tsx` — sessão, perfil e consentimentos vigentes
- `guards.tsx` — RequireArea
- `pages.tsx` — telas de acesso e de consentimentos

## Regras
A função nunca vem do cliente. O perfil administrativo é provisionado no banco. Consentimento de pesquisa nunca é obrigatório.

## Testes
tests/unit/access.test.ts · tests/integration/rls.test.ts (cadastro e funções) · tests/e2e (cadastro, login)
