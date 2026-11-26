import type { APIRoute } from 'astro';
import { forbidden, isAllowedMutation, json } from '../../../lib/http';
import { findSshInstance } from '../../../lib/ssh-instances';
import { launchNativeSsh } from '../../../lib/ssh-launcher';

export const POST: APIRoute = async ({ request }) => {
  if (!isAllowedMutation(request)) return forbidden();

  let body: { instanceId?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Cuerpo JSON inválido.' }, 400);
  }

  const instanceId = String(body.instanceId ?? '').trim();
  if (!instanceId) {
    return json({ error: 'Falta la instancia SSH.' }, 400);
  }

  try {
    const instance = await findSshInstance(instanceId);
    if (!instance) {
      return json({ error: 'La instancia SSH no existe en instancias_ips.json.' }, 404);
    }

    const result = await launchNativeSsh(instance);
    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 500);
  }
};
