import type { ReportContent } from './content'

const BRAND: [number, number, number] = [32, 104, 80]
const INK: [number, number, number] = [28, 43, 38]
const MUTED: [number, number, number] = [93, 110, 104]

/** Desenha o conteúdo do relatório em PDF (A4). As bibliotecas são carregadas sob demanda. */
export async function renderReportPdf(content: ReportContent): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 40
  let y = 0

  const ensure = (h: number) => { if (y + h > H - 50) { doc.addPage(); y = 50 } }
  const text = (s: string, size: number, color = INK, style: 'normal' | 'bold' = 'normal', gap = 4) => {
    doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color)
    const lines = doc.splitTextToSize(s, W - 2 * M) as string[]
    for (const line of lines) { ensure(size + 2); doc.text(line, M, y + size); y += size + 2 }
    y += gap
  }

  doc.setFillColor(...BRAND); doc.rect(0, 0, W, 64, 'F')
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(content.title, M, 28)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(content.institution, M, 46)
  y = 78
  text(content.subtitle, 11, INK, 'bold')
  text(content.generatedLine, 8, MUTED)
  for (const d of content.disclaimers) text(`• ${d}`, 8.5, MUTED, 'normal', 1)
  y += 8

  for (const s of content.sections) {
    ensure(40)
    text(s.title, 11.5, BRAND, 'bold', 2)
    for (const p of s.paragraphs ?? []) text(p, 9)
    for (const t of s.tables ?? []) {
      if (!t.body.length) { text('Sem registros neste período.', 9, MUTED) ; continue }
      autoTable(doc, {
        startY: y, head: [t.head], body: t.body.map((r) => r.map(String)), margin: { left: M, right: M, bottom: 50 },
        styles: { fontSize: 8, cellPadding: 3, textColor: INK, overflow: 'linebreak' }, headStyles: { fillColor: BRAND, textColor: 255, fontSize: 8 },
        alternateRowStyles: { fillColor: [242, 244, 243] }, theme: 'grid',
      })
      y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? y) + 8
      if (t.note) text(t.note, 7.5, MUTED)
    }
    y += 6
  }

  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED)
    doc.text(`${content.institution} · ${content.generatedLine} · Registros autorrelatados · Documento com dados pessoais sensíveis`, M, H - 24, { maxWidth: W - 2 * M - 60 })
    doc.text(`${p}/${pages}`, W - M, H - 24, { align: 'right' })
  }
  return doc.output('blob')
}
