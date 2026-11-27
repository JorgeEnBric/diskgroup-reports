import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { buildRelationScripts } from './relation-script';
import type { DiskLink, QueryMeta, QueryResult } from './types';

export interface TemplateInput {
  label: string;
  results: QueryResult[];
  queries: QueryMeta[];
  links?: DiskLink[];
}

const TEMPLATE_PATH = join(process.cwd(), 'Template.docx');
const DOCUMENT_PART = 'word/document.xml';
/** 6 pulgadas: ancho útil del template con sus márgenes actuales. */
const CONTENT_WIDTH = 8640;

const TABLE_PLACEHOLDERS = [
  { pattern: /\[\s*Tabla\s*0\s*\.\s*Base\s+de\s+datos\s*\]/i, queryId: 'db_name' },
  { pattern: /\[\s*Tabla\s*1\s*\.\s*Diskgroups\s+ASM\s*\]/i, queryId: 'dg_summary' },
  { pattern: /\[\s*Tabla\s*2\s*\.\s*Discos\s+candidatos\s*\]/i, queryId: 'dg_disks' },
] as const;

const DISKGROUP_QUERY_ID = 'dg_disks_by_group';
const DISKGROUP_TABLES_PLACEHOLDER = /\[\s*Tablas de discos de diskgroups solicitadas\s*\]/i;

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function textRun(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `<w:t xml:space="preserve">${escapeXml(text)}</w:t>`;
}

function paragraphText(paragraph: string): string {
  const parts: string[] = [];
  const pattern = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(paragraph))) parts.push(decodeXml(match[1]));
  return parts.join('');
}

/** Conserva el estilo del párrafo y del primer run, pero unifica su texto. */
function replaceParagraphText(paragraph: string, value: string): string {
  const pPr = paragraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? '';
  const rPr = paragraph.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? '';
  return `<w:p>${pPr}<w:r>${rPr}${textRun(value)}</w:r></w:p>`;
}

function tableCell(
  value: unknown,
  width: number,
  options: { header?: boolean; shaded?: boolean } = {},
): string {
  const header = options.header === true;
  const shading = header
    ? '<w:shd w:val="clear" w:color="auto" w:fill="1E40AF"/>'
    : options.shaded
      ? '<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>'
      : '';

  return (
    '<w:tc>' +
    `<w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shading}<w:vAlign w:val="center"/></w:tcPr>` +
    '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>' +
    '<w:r><w:rPr>' +
    '<w:rFonts w:ascii="Aptos Narrow" w:hAnsi="Aptos Narrow" w:cs="Times New Roman"/>' +
    (header ? '<w:b/>' : '') +
    `<w:color w:val="${header ? 'FFFFFF' : '000000'}"/>` +
    '<w:sz w:val="14"/><w:szCs w:val="14"/>' +
    `</w:rPr>${textRun(value)}</w:r></w:p>` +
    '</w:tc>'
  );
}

function buildTable(meta: QueryMeta | undefined, result: QueryResult | undefined): string {
  const columns = meta?.columns ?? [];
  const rows = result?.rows ?? [];
  const keys = columns.length > 0
    ? columns.map((column) => column.key)
    : Object.keys(rows[0] ?? {}).filter((key) => key !== '__status');
  const labels = columns.length > 0
    ? columns.map((column) => column.label)
    : keys.slice();
  const safeKeys = keys.length > 0 ? keys : ['NOTA'];
  const safeLabels = labels.length > 0 ? labels : ['Nota'];
  const width = Math.max(360, Math.floor(CONTENT_WIDTH / safeKeys.length));

  const header = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${safeLabels
    .map((label) => tableCell(label, width, { header: true }))
    .join('')}</w:tr>`;
  const body = rows.length > 0
    ? rows
        .map((row, index) =>
          `<w:tr>${safeKeys
            .map((key) => tableCell(row[key], width, { shaded: index % 2 === 1 }))
            .join('')}</w:tr>`,
        )
        .join('')
    : `<w:tr>${safeKeys
        .map((_, index) =>
          tableCell(
            index === 0 ? result?.error ?? 'Sin datos' : '',
            width,
            { shaded: false },
          ),
        )
        .join('')}</w:tr>`;

  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((side) => `<w:${side} w:val="single" w:sz="4" w:color="CBD5E1"/>`)
    .join('');
  const margins = ['top', 'left', 'bottom', 'right']
    .map((side) => `<w:${side} w:w="${side === 'left' || side === 'right' ? 60 : 40}" w:type="dxa"/>`)
    .join('');

  return (
    '<w:tbl><w:tblPr>' +
    `<w:tblW w:w="${CONTENT_WIDTH}" w:type="dxa"/>` +
    '<w:jc w:val="center"/><w:tblLayout w:type="fixed"/>' +
    `<w:tblBorders>${borders}</w:tblBorders>` +
    `<w:tblCellMar>${margins}</w:tblCellMar>` +
    '</w:tblPr>' +
    `<w:tblGrid>${safeKeys.map(() => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>` +
    header +
    body +
    '</w:tbl>'
  );
}

function sectionTitle(text: string): string {
  return (
    '<w:p><w:pPr><w:pStyle w:val="Ttulo2"/><w:keepNext/></w:pPr>' +
    '<w:r><w:rPr><w:lang w:val="es-CO"/></w:rPr>' +
    `${textRun(text)}</w:r></w:p>`
  );
}

function scriptParagraph(text: string): string {
  return (
    '<w:p><w:pPr><w:spacing w:before="0" w:after="80" w:line="240" w:lineRule="auto"/></w:pPr>' +
    '<w:r><w:rPr>' +
    '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' +
    '<w:sz w:val="16"/><w:szCs w:val="16"/>' +
    `</w:rPr>${textRun(text)}</w:r></w:p>`
  );
}

/** Una tabla por cada diskgroup que el usuario consultó con “Ver discos”. */
function buildDiskgroupTables(results: QueryResult[], queries: QueryMeta[]): string {
  const meta = queries.find((query) => query.id === DISKGROUP_QUERY_ID);
  const requested = results.filter(
    (result) =>
      (result.sourceId ?? result.id) === DISKGROUP_QUERY_ID ||
      result.id.startsWith(`${DISKGROUP_QUERY_ID}:`),
  );

  if (requested.length === 0) {
    return `<w:p><w:r>${textRun('No se solicitaron discos de diskgroups.')}</w:r></w:p>`;
  }

  return requested
    .map((result, index) => {
      const title = result.title || 'Discos del diskgroup';
      const separator = index < requested.length - 1 ? '<w:p/>' : '';
      return sectionTitle(title) + buildTable(meta, result) + separator;
    })
    .join('');
}

/** Sección adicional con las relaciones elegidas en el panel derecho. */
function buildLinksTable(links: DiskLink[]): string {
  if (links.length === 0) return '';

  const meta: QueryMeta = {
    id: 'disk_links',
    title: 'Relaciones diskgroup -> disco',
    description: '',
    columns: [
      { key: 'DISKGROUP', label: 'DISKGROUP' },
      { key: 'DISCO', label: 'DISCO' },
    ],
  };
  const result: QueryResult = {
    id: 'disk_links',
    title: meta.title,
    status: 'OK',
    rows: links.map((link) => ({
      DISKGROUP: link.diskgroup,
      DISCO: link.path,
      __status: 'OK' as const,
    })),
    durationMs: 0,
  };

  return sectionTitle(meta.title) + buildTable(meta, result);
}

/** Mismo script que muestra el panel, añadido al final del documento. */
function buildRelationScriptSection(links: DiskLink[]): string {
  const scripts = buildRelationScripts(links);
  if (scripts.length === 0) return '';
  return sectionTitle('Script autogenerado') + scripts.map(scriptParagraph).join('');
}

function today(): { long: string; stamp: string } {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear());
  return { long: `${day}/${month}/${year}`, stamp: `${year}${month}${day}` };
}

export function templateFilename(label: string): string {
  return `reporte_diskgroups_${label}_${today().stamp}.docx`;
}

/** Rellena Template.docx conservando el resto del paquete (logo, estilos, encabezado). */
export async function buildTemplateDocument({ label, results, queries, links = [] }: TemplateInput): Promise<Uint8Array> {
  let template: Uint8Array;
  try {
    template = new Uint8Array(await readFile(TEMPLATE_PATH));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`No se pudo leer ${TEMPLATE_PATH}: ${message}`);
  }

  const zip = unzipSync(template);
  const part = Object.keys(zip).find((name) => name === DOCUMENT_PART);
  if (!part) throw new Error(`${TEMPLATE_PATH} no contiene ${DOCUMENT_PART}.`);

  const date = today();
  const replaced = new Set<string>();
  let xml = strFromU8(zip[part]);

  xml = xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, (paragraph) => {
    const text = paragraphText(paragraph);

    if (text.includes('[Fecha de hoy]')) {
      replaced.add('date');
      return replaceParagraphText(paragraph, date.long);
    }
    if (text.includes('[Etiqueta de reporte]')) {
      replaced.add('label');
      return replaceParagraphText(paragraph, label);
    }
    if (DISKGROUP_TABLES_PLACEHOLDER.test(text)) {
      replaced.add(DISKGROUP_QUERY_ID);
      return buildDiskgroupTables(results, queries);
    }

    for (const placeholder of TABLE_PLACEHOLDERS) {
      if (placeholder.pattern.test(text)) {
        replaced.add(placeholder.queryId);
        const result = results.find((item) => (item.sourceId ?? item.id) === placeholder.queryId);
        const meta = queries.find((query) => query.id === placeholder.queryId);
        return buildTable(meta, result);
      }
    }
    return paragraph;
  });

  const missing = [
    'date',
    'label',
    DISKGROUP_QUERY_ID,
    ...TABLE_PLACEHOLDERS.map((item) => item.queryId),
  ].filter((key) => !replaced.has(key));
  if (missing.length > 0) {
    throw new Error(`Faltan marcadores en ${TEMPLATE_PATH}: ${missing.join(', ')}.`);
  }

  const extraXml = buildLinksTable(links) + buildRelationScriptSection(links);
  if (extraXml) {
    const sectPrIndex = xml.lastIndexOf('<w:sectPr');
    const bodyEndIndex = xml.lastIndexOf('</w:body>');
    const insertAt = sectPrIndex >= 0 ? sectPrIndex : bodyEndIndex >= 0 ? bodyEndIndex : xml.length;
    xml = `${xml.slice(0, insertAt)}<w:p/>${extraXml}${xml.slice(insertAt)}`;
  }

  zip[part] = strToU8(xml);
  return zipSync(zip, { level: 6 });
}
