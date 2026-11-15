# Medicamentos

`src/modules/medications/`

## Objetivo
Catálogo geral e pessoal, tratamentos preventivos e persistência das administrações.

## Arquivos e responsabilidades
- `schemas.ts` — medicamento, preventivo, administração
- `service.ts` — CRUD
- `MedicationsPage.tsx` — telas e modais

## Regras
O sistema não recomenda medicamentos nem doses. Cada administração é um registro independente.

## Testes
tests/unit/schemas.test.ts
