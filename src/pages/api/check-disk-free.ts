import { randomUUID } from 'node:crypto';
import type { APIRoute } from 'astro';
import { forbidden, isAllowedMutation, json } from '../../lib/http';
import { createJob } from '../../lib/jobs';
import { getQuery, isValidDiskName } from '../../lib/queries';
import { executeJob } from '../../lib/sqlplus';

const CHECK_QUERY_ID = 'disk_free_check';

export const POST: APIRoute = async ({ request }) => {
  if (!isAllowedMutation(request)) return forbidden();

  let body: { diskName?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Cuerpo JSON inválido.' }, 400);
  }

  const diskName = String(body.diskName ?? '').trim().toUpperCase();
  if (!isValidDiskName(diskName)) {
    return json({ error: 'Nombre de disco inválido. Usa solo letras, números y guion bajo (máx. 30).' }, 400);
  }
  if (!getQuery(CHECK_QUERY_ID)) {
    return json({ error: 'Consulta de comprobación no disponible.' }, 500);
  }

  const jobId = randomUUID();
  const job = createJob(jobId, diskName, [CHECK_QUERY_ID], { diskName });
  void executeJob(job);

  return json({ jobId, diskName }, 202);
};
