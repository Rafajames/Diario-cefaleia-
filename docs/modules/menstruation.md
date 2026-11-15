# Ciclo menstrual

`src/modules/menstruation/`

## Objetivo
Registro opcional de sangramentos e análise de associação temporal com a cefaleia.

## Arquivos e responsabilidades
- `calc.ts` — fases, janela perimenstrual, regra de repetição
- `service.ts` — CRUD de ciclos
- `CyclePage.tsx` — tela do paciente
- `MenstrualAnalysisView.tsx` — apresentação da análise

## Regras
Janela padrão: dias −2 a +3 (referência ICHD-3), configurável. Padrão possível = cefaleia na janela em 2 de 3 ciclos concluídos. Nunca é diagnóstico de enxaqueca menstrual. Terceiros só veem com autorização específica.

## Testes
tests/unit/menstruation.test.ts · tests/integration/rls.test.ts
