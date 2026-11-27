import { buildRelationScripts } from './relation-script';
import type { DiskLink, QueryMeta, QueryResult } from './types';

export interface PdfInput {
  diskgroup: string;
  results: QueryResult[];
  queries: QueryMeta[];
  links?: DiskLink[];
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

export async function downloadReport({ diskgroup, results, queries, links = [] }: PdfInput): Promise<void> {
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
  doc.text('Consultas ejecutadas mediante SQLcl / SQL*Plus en terminal real', 60, 160);

  doc.setTextColor(248, 250, 252);
  doc.setFontSize(13);
  let y = 230;
  const metaLines = [
    ['Etiqueta', diskgroup],
    ['Fecha', generatedAt.toLocaleString()],
    ['Consultas', `${results.length}`],
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
    const meta = queries.find((query) => query.id === (result.sourceId ?? result.id));
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
      `Filas: ${result.rows.length}   |   Duracion: ${result.durationMs} ms`,
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

  // ---------- Relaciones ----------
  if (links.length > 0) {
    if (y > pageHeight - 180) {
      doc.addPage();
      y = 55;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text('Relaciones diskgroup -> disco', 45, y);
    y += 12;
    autoTable(doc, {
      head: [['DISKGROUP', 'DISCO']],
      body: links.map((link) => [text(link.diskgroup), text(link.path)]),
      startY: y,
      margin: { left: 45, right: 45 },
      styles: { fontSize: 7, cellPadding: 3, overflow: 'ellipsize' },
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 7 },
      alternateRowStyles: { fillColor: [241, 245, 249] },
    });
    y = (doc as any).lastAutoTable.finalY + 28;

    const scripts = buildRelationScripts(links);
    if (scripts.length > 0) {
      if (y > pageHeight - 140) {
        doc.addPage();
        y = 55;
      }
      doc.setFont('courier', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text('Script autogenerado', 45, y);
      y += 16;

      doc.setFont('courier', 'normal');
      doc.setFontSize(8);
      for (const script of scripts) {
        const lines = doc.splitTextToSize(script, pageWidth - 90);
        if (y + lines.length * 11 > pageHeight - 50) {
          doc.addPage();
          y = 55;
        }
        doc.text(lines, 45, y);
        y += lines.length * 11 + 6;
      }
    }
  }

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
  const totalRows = results.reduce((sum, result) => sum + result.rows.length, 0);
  y += 24;
  doc.text(`Consultas: ${results.length}    Filas totales: ${totalRows}`, 45, y);

  // ---------- Pie de página ----------
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Generado ${generatedAt.toLocaleString()} - Etiqueta ${diskgroup}`, 45, pageHeight - 18);
    doc.text(`Pagina ${page} de ${totalPages}`, pageWidth - 45, pageHeight - 18, { align: 'right' });
  }

  const stamp = generatedAt.toISOString().slice(0, 10).replace(/-/g, '');
  doc.save(`reporte_diskgroups_${diskgroup}_${stamp}.pdf`);
}
