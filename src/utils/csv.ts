/** Exportação CSV (separador ";" + BOM, compatível com Excel em pt-BR). */
export type CsvValue = string | number | boolean | null | undefined

function cell(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  let s = typeof value === 'boolean' ? (value ? 'sim' : 'não') : String(value)
  // Proteção contra injeção de fórmulas em planilhas
  if (/^[=+\-@\t\r]/.test(s) && typeof value === 'string') s = `'${s}`
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv<T>(rows: T[], columns: { header: string; value: (row: T) => CsvValue }[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(';'), ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(';'))]
  return `﻿${lines.join('\r\n')}\r\n`
}

export function downloadText(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
