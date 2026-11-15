# Registro de crises

`src/modules/headache-attacks/`

## Objetivo
Formulário em seções (identificação, intensidade, localização, características, agravamento, sintomas, duração, desencadeantes, impacto) e avaliações ao longo da crise.

## Arquivos e responsabilidades
- `schemas.ts` — validação e conversão rascunho ↔ registro
- `service.ts` — CRUD, exclusão lógica, avaliações
- `AttackForm.tsx` — formulário
- `AttackList.tsx` — lista (edição ou leitura)
- `pages.tsx` — lista, nova crise, edição

## Regras
Só o início é obrigatório. Horário do evento ≠ horário do registro (recorded_at). Sintomas não viram diagnóstico. Fatores: suspeita × ocorreu antes; associação não é causa.

## Testes
tests/unit/schemas.test.ts · tests/integration/rls.test.ts · tests/e2e (nova crise, edição)
