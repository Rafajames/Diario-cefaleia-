# Registro diário

`src/modules/daily-context/`

## Objetivo
Dia sem dor confirmado e hábitos (sono, hidratação, alimentação, cafeína, atividade, estresse, humor).

## Arquivos e responsabilidades
- `schemas.ts` — validação
- `service.ts` — gravação por paciente e data
- `DailyLogForm.tsx` — modal

## Regras
Tudo opcional. Dia com crise não pode ser marcado como sem dor.

## Testes
tests/unit/schemas.test.ts
