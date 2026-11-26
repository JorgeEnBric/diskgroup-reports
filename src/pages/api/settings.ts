import type { APIRoute } from 'astro';
import { CONFIG_PASSWORD, connectionLabel, ENV_PATH, publicSettings, saveSettings } from '../../lib/env';
import { getMasterPassword } from '../../lib/master-password';
import { forbidden, isAllowedMutation, json } from '../../lib/http';

export const GET: APIRoute = async () => {
  const masterReady = Boolean(await getMasterPassword());
  return json({
    ...publicSettings(),
    dbPasswordSet: masterReady,
    dbPassword: masterReady ? CONFIG_PASSWORD : '',
    connectionLabel: connectionLabel(),
    envPath: ENV_PATH,
  });
};

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
    const masterReady = Boolean(await getMasterPassword());
    return json({
      ...settings,
      dbPasswordSet: masterReady,
      dbPassword: masterReady ? CONFIG_PASSWORD : '',
      connectionLabel: connectionLabel(),
      envPath: ENV_PATH,
      saved: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: `No se pudo guardar .env: ${message}` }, 500);
  }
};
