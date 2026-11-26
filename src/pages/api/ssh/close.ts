import type { APIRoute } from 'astro';
import { forbidden, isAllowedMutation, json } from '../../../lib/http';
import { closeSsh } from '../../../lib/ssh-sessions';

export const POST: APIRoute = async ({ request }) => {
  if (!isAllowedMutation(request)) return forbidden();

  let body: { sessionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Cuerpo JSON inválido.' }, 400);
  }

  const sessionId = String(body.sessionId ?? '').trim();
  if (!sessionId) {
    return json({ error: 'Falta el identificador de sesión.' }, 400);
  }

  return json({ closed: closeSsh(sessionId) });
};
