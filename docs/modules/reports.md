# Relatórios

`src/modules/reports/`

## Objetivo
Relatório individual em PDF (17 seções) e exportações CSV.

## Arquivos e responsabilidades
- `content.ts` — conteúdo do relatório (função pura)
- `pdf.ts` — desenho do PDF (jsPDF)
- `csv.ts` — crises, medicamentos, registro diário
- `ReportPanel.tsx` — tela

## Regras
Inclui identificação CENDOR, data de geração, período, dados incompletos e aviso de autorrelato. Ciclo menstrual só com autorização. Cada exportação é registrada em access_logs.

## Testes
tests/unit/report.test.ts · tests/e2e (PDF e CSV)
