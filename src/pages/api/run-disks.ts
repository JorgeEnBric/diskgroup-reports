import { randomUUID } from 'node:crypto';
import type { APIRoute } from 'astro';
import { forbidden, isAllowedMutation, json } from '../../lib/http';
import { createJob } from '../../lib/jobs';
import { getQuery, isValidDiskgroup } from '../../lib/queries';
import { executeJob } from '../../lib/sqlplus';

const DYNAMIC_QUERY_ID = 'dg_disks_by_group';

export const POST: APIRoute = async ({ request }) => {
  if (!isAllowedMutation(request)) return forbidden();

  let body: { diskgroupName?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Cuerpo JSON inválido.' }, 400);
  }

  const diskgroupName = String(body.diskgroupName ?? '').trim().toUpperCase();
  if (!isValidDiskgroup(diskgroupName)) {
    return json({ error: 'Nombre de diskgroup inválido.' }, 400);
  }
  if (!getQuery(DYNAMIC_QUERY_ID)) {
    return json({ error: 'Consulta dinámica no disponible.' }, 500);
  }

  const jobId = randomUUID();
  const job = createJob(jobId, diskgroupName, [DYNAMIC_QUERY_ID], {
    diskgroupName,
  });
  void executeJob(job);

  return json({ jobId, diskgroupName }, 202);
};
