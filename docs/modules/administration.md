# Administração

`src/modules/administration/`

## Objetivo
Indicadores agregados, usuários, vínculos, convites, catálogo, parâmetros, pedidos de exclusão.

## Arquivos e responsabilidades
- `service.ts` — chamadas administrativas
- `settings-schema.ts` — validação dos parâmetros
- `pages.tsx` — telas

## Regras
O administrador não lê dados clínicos sem autorização do paciente, não ativa vínculos e não cria administradores pela interface.

## Testes
tests/unit/schemas.test.ts · tests/integration/rls.test.ts · tests/e2e (admin)
