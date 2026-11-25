import { randomUUID } from 'node:crypto';
import type { APIRoute } from 'astro';
import { forbidden, isAllowedMutation, json } from '../../lib/http';
import { createJob } from '../../lib/jobs';
import { getQuery, isValidDiskgroup } from '../../lib/queries';
import { executeJob } from '../../lib/sqlplus';

export const POST: APIRoute = async ({ request }) => {
  if (!isAllowedMutation(request)) return forbidden();

  let body: { diskgroup?: unknown; queryIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Cuerpo JSON inválido.' }, 400);
  }

  const diskgroup = String(body.diskgroup ?? '').trim().toUpperCase();
  const queryIds = Array.isArray(body.queryIds) ? body.queryIds.map((id) => String(id)) : [];

  if (!isValidDiskgroup(diskgroup)) {
    return json({ error: 'Nombre de diskgroup inválido. Usa solo letras, números y guion bajo (máx. 30).' }, 400);
  }
  if (queryIds.length === 0) {
    return json({ error: 'Selecciona al menos una consulta.' }, 400);
  }

  const unknown = queryIds.filter((id) => {
    const query = getQuery(id);
    return !query || query.hidden === true;
  });
  if (unknown.length > 0) {
    return json({ error: `Consultas no permitidas: ${unknown.join(', ')}` }, 400);
  }

  const jobId = randomUUID();
  const job = createJob(jobId, diskgroup, [...new Set(queryIds)]);
  void executeJob(job);

  return json({ jobId, diskgroup }, 202);
};
