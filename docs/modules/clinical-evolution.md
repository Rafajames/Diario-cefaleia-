# Evolução clínica

`src/modules/clinical-evolution/`

## Objetivo
Indicadores por período, comparação entre períodos por dimensão, série mensal, sinalização informativa de uso frequente de medicação.

## Arquivos e responsabilidades
- `calc.ts` — computeIndicators, compareIndicators, classify, monthlySeries, overuseSignals
- `useEvolution.ts` — carga e cálculo
- `EvolutionView.tsx` — cartões, gráficos e tabelas
- `EvolutionPage.tsx` — tela do paciente

## Regras
Sem pontuação global. Classificação: variação relativa ≥ limite (padrão 20%); dimensões por dia exigem cobertura mínima (padrão 50%); por crise, mínimo de registros (padrão 3). Tempo até a medicação e localização só indicam "mudou". Sinalização de uso frequente fica desativada até revisão médica.

## Testes
tests/unit/evolution.test.ts
