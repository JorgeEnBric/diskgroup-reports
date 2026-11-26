import type { APIRoute } from 'astro';
import { CONFIG_PATH, loadConfigFile } from '../../lib/connections';
import {
  CONFIG_PASSWORD,
  connectionLabel,
  getConfig,
  publicSettings,
  saveSettings,
} from '../../lib/env';
import { refreshMasterPassword } from '../../lib/master-password';
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
    const { connections } = await loadConfigFile();
    const found = connections.find((connection) => connection.name === name);
    if (!found) {
      return json({ error: `La conexión ${name} no existe en .config.` }, 404);
    }

    const current = publicSettings();
    await saveSettings({
      sqlClient: current.sqlClient,
      sqlplusBin: current.sqlplusBin,
      dbUser: found.user,
      dbPassword: CONFIG_PASSWORD,
      dbConnect: found.connect,
      tnsAdmin: found.tnsAdmin,
      directConnection: false,
      nlsLang: current.nlsLang,
      timeoutMs: current.timeoutMs,
      javaOpts: current.javaOpts,
    });

    // La contraseña descifrada queda solo en memoria del servidor.
    await refreshMasterPassword();

    return json({ name, saved: true, connectionLabel: connectionLabel(getConfig()) });
  } catch (error) {
    return json({ error: `No se pudo aplicar la conexión: ${message(error)}` }, 500);
  }
};
