import type { QueryMeta, QueryResult } from './types';

export interface PdfInput {
  diskgroup: string;
  results: QueryResult[];
  queries: QueryMeta[];
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function worst(results: QueryResult[]): string {
  if (results.some((result) => result.status === 'ERROR')) return 'ERROR';
  if (results.some((result) => result.status === 'WARN')) return 'WARN';
  return 'OK';
}

export async function downloadReport({ diskgroup, results, queries }: PdfInput): Promise<void> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = (autoTableModule as any).default ?? (autoTableModule as any).autoTable;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const generatedAt = new Date();

  // ---------- Portada ----------
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');
  doc.setTextColor(248, 250, 252);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.text('Reporte de validacion de Diskgroups', 60, 130);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(148, 163, 184);
  doc.text('Consultas ejecutadas mediante SQL*Plus en terminal real', 60, 160);

  doc.setTextColor(248, 250, 252);
  doc.setFontSize(13);
  let y = 230;
  const metaLines = [
    ['Diskgroup', diskgroup],
    ['Fecha', generatedAt.toLocaleString()],
    ['Consultas', `${results.length}`],
    ['Estado global', worst(results)],
  ];
  for (const [label, value] of metaLines) {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, 60, y);
    doc.setFont('helvetica', 'normal');
    doc.text(text(value), 200, y);
    y += 30;
  }
  doc.setDrawColor(71, 85, 105);
  doc.line(60, y + 10, pageWidth - 60, y + 10);

  // ---------- Secciones ----------
  doc.addPage();
  y = 55;

  results.forEach((result, index) => {
    const meta = queries.find((query) => query.id === result.id);
    const keys = meta?.columns.map((column) => column.key)
      ?? Object.keys(result.rows[0] ?? {}).filter((key) => key !== '__status');
    const labels = meta?.columns.map((column) => column.label) ?? keys;

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`${index + 1}. ${result.title}`, 45, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Estado: ${result.status}   |   Filas: ${result.rows.length}   |   Duracion: ${result.durationMs} ms`,
      45,
      y + 16,
    );
    y += 28;

    if (result.error) {
      doc.setTextColor(190, 18, 60);
      doc.setFontSize(9);
      doc.text(doc.splitTextToSize(result.error, pageWidth - 90), 45, y);
      y += 24;
    }

    if (result.rows.length > 0) {
      autoTable(doc, {
        head: [labels],
        body: result.rows.map((row) => keys.map((key) => text(row[key]))),
        startY: y,
        margin: { left: 45, right: 45 },
        styles: { fontSize: 7, cellPadding: 3, overflow: 'ellipsize' },
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 7 },
        alternateRowStyles: { fillColor: [241, 245, 249] },
        didParseCell(data: any) {
          if (data.section === 'body' && data.column.index === 0) {
            const status = result.rows[data.row.index]?.__status;
            if (status === 'ERROR') data.cell.styles.textColor = [190, 18, 60];
            if (status === 'WARN') data.cell.styles.textColor = [180, 83, 9];
            if (status === 'OK') data.cell.styles.textColor = [22, 101, 52];
          }
        },
      });
      y = (doc as any).lastAutoTable.finalY + 28;
    } else {
      y += 14;
    }

    if (y > pageHeight - 70) {
      doc.addPage();
      y = 55;
    }
  });

  // ---------- Resumen ----------
  if (y > pageHeight - 140) {
    doc.addPage();
    y = 55;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text('Resumen', 45, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const counts = {
    OK: results.filter((result) => result.status === 'OK').length,
    WARN: results.filter((result) => result.status === 'WARN').length,
    ERROR: results.filter((result) => result.status === 'ERROR').length,
  };
  y += 24;
  doc.text(`OK: ${counts.OK}    WARN: ${counts.WARN}    ERROR: ${counts.ERROR}`, 45, y);
  y += 18;
  doc.text(`Resultado global: ${worst(results)}`, 45, y);

  // ---------- Pie de página ----------
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Generado ${generatedAt.toLocaleString()} - Diskgroup ${diskgroup}`, 45, pageHeight - 18);
    doc.text(`Pagina ${page} de ${totalPages}`, pageWidth - 45, pageHeight - 18, { align: 'right' });
  }

  const stamp = generatedAt.toISOString().slice(0, 10).replace(/-/g, '');
  doc.save(`reporte_diskgroups_${diskgroup}_${stamp}.pdf`);
}
