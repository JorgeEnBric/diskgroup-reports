import type { APIRoute } from 'astro';
import { buildTemplateDocument, templateFilename } from '../../lib/docx-template';
import { forbidden, isAllowedMutation, json } from '../../lib/http';
import { isValidDiskgroup } from '../../lib/queries';
import type { CheckStatus, DiskLink, QueryMeta, QueryResult, ResultRow } from '../../lib/types';

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

function asLinks(value: unknown): DiskLink[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 5000) return null;

  const seen = new Set<string>();
  const links: DiskLink[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const record = item as Record<string, unknown>;
    if (typeof record.diskgroup !== 'string' || typeof record.path !== 'string') return null;

    const diskgroup = record.diskgroup.trim().toUpperCase();
    const path = record.path.trim();
    if (!isValidDiskgroup(diskgroup) || path.length === 0 || path.length > 1024) return null;
    if (seen.has(path)) continue;
    seen.add(path);
    links.push({ diskgroup, path });
  }
  return links;
}

function asDiskgroups(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 100) return null;

  const names: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return null;
    const name = item.trim().toUpperCase();
    if (!isValidDiskgroup(name)) return null;
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

function asNewDiskgroups(value: unknown, diskgroups: string[]): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 100) return null;

  const names: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return null;
    const name = item.trim().toUpperCase();
    if (!isValidDiskgroup(name) || !diskgroups.includes(name)) return null;
    if (!names.includes(name)) names.push(name);
  }
  return names;
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

  const links = asLinks(body.links);
  if (!links) {
    return json({ error: 'Relaciones inválidas: usa pares diskgroup/path válidos.' }, 400);
  }

  const diskgroups = asDiskgroups(body.diskgroups);
  if (!diskgroups) {
    return json({ error: 'Orden de diskgroups inválido.' }, 400);
  }

  const newDiskgroups = asNewDiskgroups(body.newDiskgroups, diskgroups);
  if (!newDiskgroups) {
    return json({ error: 'Diskgroups nuevos inválidos: usa nombres añadidos válidos.' }, 400);
  }

  try {
    const docx = await buildTemplateDocument({
      label,
      results: asResults(body.results),
      queries: asQueries(body.queries),
      links,
      diskgroups,
      newDiskgroups,
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
