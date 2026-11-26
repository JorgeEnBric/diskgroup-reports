import type { APIRoute } from 'astro';
import { forbidden, isAllowedMutation, json } from '../../../lib/http';
import { resizeSsh } from '../../../lib/ssh-sessions';

export const POST: APIRoute = async ({ request }) => {
  if (!isAllowedMutation(request)) return forbidden();

  let body: { sessionId?: unknown; cols?: unknown; rows?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Cuerpo JSON inválido.' }, 400);
  }

  const sessionId = String(body.sessionId ?? '').trim();
  const cols = Number(body.cols);
  const rows = Number(body.rows);
  if (!sessionId || !Number.isFinite(cols) || !Number.isFinite(rows)) {
    return json({ error: 'Dimensiones inválidas.' }, 400);
  }

  if (!resizeSsh(sessionId, cols, rows)) {
    return json({ error: 'La sesión SSH no está activa.' }, 409);
  }

  return json({ ok: true });
};
