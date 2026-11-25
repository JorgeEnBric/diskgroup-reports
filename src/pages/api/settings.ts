import type { APIRoute } from 'astro';
import { connectionLabel, ENV_PATH, getConfig, publicSettings, saveSettings } from '../../lib/env';
import { forbidden, isAllowedMutation, json } from '../../lib/http';

export const GET: APIRoute = () =>
  json({
    ...publicSettings(),
    connectionLabel: connectionLabel(getConfig()),
    envPath: ENV_PATH,
  });

export const POST: APIRoute = async ({ request }) => {
  if (!isAllowedMutation(request)) return forbidden();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Cuerpo JSON inválido.' }, 400);
  }

  try {
    const settings = await saveSettings(body);
    return json({
      ...settings,
      connectionLabel: connectionLabel(getConfig()),
      envPath: ENV_PATH,
      saved: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: `No se pudo guardar .env: ${message}` }, 500);
  }
};
