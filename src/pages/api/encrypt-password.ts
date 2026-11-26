import type { APIRoute } from 'astro';
import { CONFIG_PATH, encryptPassword, saveEncryptedPassword } from '../../lib/connections';
import { forbidden, isAllowedMutation, json } from '../../lib/http';

export const POST: APIRoute = async ({ request }) => {
  if (!isAllowedMutation(request)) return forbidden();

  let body: { password?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Cuerpo JSON inválido.' }, 400);
  }

  const password = typeof body.password === 'string' ? body.password : '';
  if (!password.trim()) {
    return json({ error: 'Escribe la contraseña maestra.' }, 400);
  }
  if (password.length > 200) {
    return json({ error: 'La contraseña es demasiado larga (máx. 200 caracteres).' }, 400);
  }

  try {
    const encrypted = encryptPassword(password);
    await saveEncryptedPassword(encrypted);
    return json({ encrypted, configPath: CONFIG_PATH, saved: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: `No se pudo guardar la contraseña cifrada: ${message}` }, 500);
  }
};
