import type { APIRoute } from 'astro';
import { forbidden, isAllowedMutation, json } from '../../../lib/http';
import { writeSsh } from '../../../lib/ssh-sessions';

export const POST: APIRoute = async ({ request }) => {
  if (!isAllowedMutation(request)) return forbidden();

  let body: { sessionId?: unknown; data?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Cuerpo JSON inválido.' }, 400);
  }

  const sessionId = String(body.sessionId ?? '').trim();
  const data = typeof body.data === 'string' ? body.data : '';
  if (!sessionId || !data || data.length > 4096) {
    return json({ error: 'Entrada SSH inválida.' }, 400);
  }

  if (!writeSsh(sessionId, data)) {
    return json({ error: 'La sesión SSH no está activa.' }, 409);
  }

  return json({ ok: true });
};
