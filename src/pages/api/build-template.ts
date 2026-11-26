import type { APIRoute } from 'astro';
import { buildTemplateDocument, templateFilename } from '../../lib/docx-template';
import { forbidden, isAllowedMutation, json } from '../../lib/http';
import { isValidDiskgroup } from '../../lib/queries';
import type { CheckStatus, QueryMeta, QueryResult, ResultRow } from '../../lib/types';

function asQueries(value: unknown): QueryMeta[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (typeof record.id !== 'string') return [];
    const columns = Array.isArray(record.columns)
      ? record.columns.flatMap((column) => {
          if (!column || typeof column !== 'object') return [];
          const entry = column as Record<string, unknown>;
          if (typeof entry.key !== 'string' || typeof entry.label !== 'string') return [];
          return [{ key: entry.key, label: entry.label }];
        })
      : [];
    return [{
      id: record.id,
      title: typeof record.title === 'string' ? record.title : '',
      description: typeof record.description === 'string' ? record.description : '',
      columns,
      hidden: record.hidden === true,
    }];
  });
}

function asResults(value: unknown): QueryResult[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (typeof record.id !== 'string') return [];
    const rows = Array.isArray(record.rows)
      ? record.rows.slice(0, 5000).flatMap((row) => {
          if (!row || typeof row !== 'object') return [];
          const clean: Record<string, string> = {};
          for (const [key, cell] of Object.entries(row)) clean[key] = String(cell ?? '');
          return [clean as ResultRow];
        })
      : [];
    const status: CheckStatus = record.status === 'OK' || record.status === 'ERROR'
      ? record.status
      : 'WARN';
    return [{
      id: record.id,
      sourceId: typeof record.sourceId === 'string' ? record.sourceId : undefined,
      title: typeof record.title === 'string' ? record.title : '',
      status,
      rows,
      error: typeof record.error === 'string' ? record.error : undefined,
      durationMs: typeof record.durationMs === 'number' ? record.durationMs : 0,
    }];
  });
}

export const POST: APIRoute = async ({ request }) => {
  if (!isAllowedMutation(request)) return forbidden();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Cuerpo JSON inválido.' }, 400);
  }

  const label = String(body.label ?? '').trim().toUpperCase();
  if (!isValidDiskgroup(label)) {
    return json({ error: 'Etiqueta de reporte inválida. Usa solo letras, números y guion bajo (máx. 30).' }, 400);
  }

  try {
    const docx = await buildTemplateDocument({
      label,
      results: asResults(body.results),
      queries: asQueries(body.queries),
    });
    const filename = templateFilename(label);

    return new Response(new Uint8Array(docx), {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: `No se pudo construir el template: ${message}` }, 500);
  }
};
