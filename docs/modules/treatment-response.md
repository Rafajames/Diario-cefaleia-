# Resposta terapêutica

`src/modules/treatment-response/`

## Objetivo
Intervalos entre crise, medicação e alívio; redução de intensidade; resumo por medicamento, princípio ativo ou classe.

## Arquivos e responsabilidades
- `calc.ts` — administrationIntervals, summarizeResponses
- `AdministrationPanel.tsx` — doses, resposta e avaliações pós-dose dentro da crise

## Regras
Tempo até a medicação = dose − início da crise. Início do alívio e alívio máximo = horário informado − dose. Redução = intensidade antes − menor intensidade nas avaliações da dose. Proporções só sobre desfechos informados. Sequência temporal não prova efeito do medicamento.

## Testes
tests/unit/treatment-response.test.ts
