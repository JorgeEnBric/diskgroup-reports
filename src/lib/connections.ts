import { createDecipheriv } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const CONFIG_PATH = join(process.cwd(), '.config');

export interface SavedConnection {
  name: string;
  user: string;
  connect: string;
  tnsAdmin: string;
}

export interface ConfigFile {
  connections: SavedConnection[];
  encryptedPassword: string;
}

function keyFrom(value: string): Buffer {
  const key = /^[0-9a-fA-F]{64}$/.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64');
  if (key.length !== 32) {
    throw new Error('CONFIG_ENCRYPTION_KEY debe tener 32 bytes (base64 o hexadecimal).');
  }
  return key;
}

/** AES-256-GCM: base64 = nonce(12) + tag(16) + ciphertext. */
export function decryptPassword(encrypted: string): string {
  if (!encrypted) return '';

  const keyText = (process.env.CONFIG_ENCRYPTION_KEY ?? '').trim();
  if (!keyText) {
    throw new Error('Falta CONFIG_ENCRYPTION_KEY para descifrar la contraseña de .config.');
  }

  const raw = Buffer.from(encrypted, 'base64');
  if (raw.length < 29) {
    throw new Error('La contraseña cifrada de .config no tiene un formato válido.');
  }

  const decipher = createDecipheriv('aes-256-gcm', keyFrom(keyText), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([
    decipher.update(raw.subarray(28)),
    decipher.final(),
  ]).toString('utf8');
}

/** Lee .config. La clave reservada "password" no se trata como conexión. */
export async function loadConfigFile(): Promise<ConfigFile> {
  let text: string;
  try {
    text = await readFile(CONFIG_PATH, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { connections: [], encryptedPassword: '' };
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('.config no contiene JSON válido.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('.config debe contener un objeto JSON con las conexiones.');
  }

  const root = parsed as Record<string, unknown>;
  const encryptedPassword =
    typeof root.password === 'string' ? root.password.trim() : '';
  const connections: SavedConnection[] = [];

  for (const [name, value] of Object.entries(root)) {
    if (name === 'password') continue;
    if (!/^[A-Za-z0-9_]{1,40}$/.test(name)) continue;
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;

    const item = value as Record<string, unknown>;
    const user = typeof item.user === 'string' ? item.user.trim() : '';
    const connect = typeof item.connect === 'string' ? item.connect.trim() : '';
    const tnsAdmin = typeof item.tnsAdmin === 'string' ? item.tnsAdmin.trim() : '';
    if (!user || !connect) continue;

    connections.push({ name, user, connect, tnsAdmin });
  }

  connections.sort((a, b) => a.name.localeCompare(b.name));
  return { connections, encryptedPassword };
}
