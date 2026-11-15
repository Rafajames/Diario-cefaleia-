# Calendário

`src/modules/calendar/`

## Objetivo
Visão mensal dos dias com cefaleia, sem dor confirmados, com menstruação e com informação incompleta.

## Arquivos e responsabilidades
- `calc.ts` — grade do mês, dias cobertos por crise, classificação do dia
- `CalendarView.tsx` — calendário e painel do dia (reutilizado pelo profissional)

## Regras
Dia sem registro é "sem informação", nunca "sem dor". Várias crises por dia; crise pode atravessar dias; sem término informado conta só o dia de início.

## Testes
tests/unit/calendar.test.ts
