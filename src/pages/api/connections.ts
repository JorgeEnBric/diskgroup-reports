import type { APIRoute } from 'astro';
import { CONFIG_PATH, decryptPassword, loadConfigFile } from '../../lib/connections';
import { connectionLabel, getConfig, KEEP_PASSWORD, publicSettings, saveSettings } from '../../lib/env';
import { forbidden, isAllowedMutation, json } from '../../lib/http';

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const GET: APIRoute = async () => {
  try {
    const { connections } = await loadConfigFile();
    return json({
      connections: connections.map(({ name, user, connect }) => ({ name, user, connect })),
      configPath: CONFIG_PATH,
    });
  } catch (error) {
    return json({ error: `No se pudo leer .config: ${message(error)}` }, 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  if (!isAllowedMutation(request)) return forbidden();

  let body: { name?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Cuerpo JSON inválido.' }, 400);
  }

  const name = String(body.name ?? '').trim();
  if (!/^[A-Za-z0-9_]{1,40}$/.test(name)) {
    return json({ error: 'Nombre de conexión inválido.' }, 400);
  }

  try {
    const { connections, encryptedPassword } = await loadConfigFile();
    const found = connections.find((connection) => connection.name === name);
    if (!found) {
      return json({ error: `La conexión ${name} no existe en .config.` }, 404);
    }

    const current = publicSettings();
    const password = encryptedPassword ? decryptPassword(encryptedPassword) : KEEP_PASSWORD;

    await saveSettings({
      sqlClient: current.sqlClient,
      sqlplusBin: current.sqlplusBin,
      dbUser: found.user,
      dbPassword: password,
      dbConnect: found.connect,
      tnsAdmin: found.tnsAdmin,
      directConnection: false,
      nlsLang: current.nlsLang,
      timeoutMs: current.timeoutMs,
      javaOpts: current.javaOpts,
    });

    return json({ name, saved: true, connectionLabel: connectionLabel(getConfig()) });
  } catch (error) {
    return json({ error: `No se pudo aplicar la conexión: ${message(error)}` }, 500);
  }
};
