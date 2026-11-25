import type { APIRoute } from 'astro';
import { forbidden, isAllowedMutation, json } from '../../lib/http';
import { cancelJob, getJob } from '../../lib/jobs';

export const POST: APIRoute = async ({ request }) => {
  if (!isAllowedMutation(request)) return forbidden();

  let body: { jobId?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Cuerpo JSON inválido.' }, 400);
  }

  const job = getJob(String(body.jobId ?? ''));
  if (!job) return json({ error: 'Job no encontrado.' }, 404);

  cancelJob(job);
  return json({ ok: true });
};
