import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
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

const PASSWORD_LINE = /^[ \t]*"password"[ \t]*:[ \t]*"([^"]*)"[ \t]*,?/m;
const CONNECTION_LINE = /^([^/@\s]+)\/([^@\s]*)@([^:/\s]+):(\d{1,5})\/(\S+)$/;

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
export function encryptPassword(plain: string): string {
  const keyText = (process.env.CONFIG_ENCRYPTION_KEY ?? '').trim();
  if (!keyText) {
    throw new Error('Falta CONFIG_ENCRYPTION_KEY para cifrar la contraseña de .config.');
  }

  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(keyText), nonce);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64');
}

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

/**
 * Lee .config en formato de líneas:
 *   USUARIO/[PASS]@HOST:PUERTO/SERVICIO
 * El token [PASS] se sustituye en servidor por la contraseña descifrada del campo `password`.
 */
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

  const encryptedPassword = text.match(PASSWORD_LINE)?.[1]?.trim() ?? '';
  const connections: SavedConnection[] = [];
  const usedNames = new Map<string, number>();

  text.split(/\r?\n/).forEach((raw, index) => {
    let line = raw.trim().replace(/,\s*$/, '').trim();
    if (!line) return;
    if (line === '{' || line === '}') return;
    if (/^(?:#|\/\/|--)/.test(line)) return;
    if (PASSWORD_LINE.test(line)) return;

    const match = CONNECTION_LINE.exec(line);
    if (!match) {
      throw new Error(
        `.config, línea ${index + 1}: se esperaba USUARIO/[PASS]@HOST:PUERTO/SERVICIO.`,
      );
    }

    const [, user, , host, port, service] = match;
    const seen = usedNames.get(service) ?? 0;
    usedNames.set(service, seen + 1);
    const name = seen === 0 ? service : `${service}_${seen + 1}`;

    connections.push({
      name,
      user,
      connect: `//${host}:${port}/${service}`,
      tnsAdmin: '',
    });
  });

  return { connections, encryptedPassword };
}

/**
 * Sustituye (o inserta) la línea `password` de .config sin tocar las conexiones.
 * La contraseña en claro nunca se escribe en este archivo.
 */
export async function saveEncryptedPassword(encrypted: string): Promise<void> {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encrypted)) {
    throw new Error('El valor cifrado no tiene un formato base64 válido.');
  }

  let text: string;
  try {
    text = await readFile(CONFIG_PATH, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('No existe .config. Copia .config.example antes de cifrar la contraseña.');
    }
    throw error;
  }

  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const line = `  "password": "${encrypted}",`;
  let updated: string;

  if (PASSWORD_LINE.test(text)) {
    updated = text.replace(PASSWORD_LINE, () => line);
  } else {
    const lines = text.split(/\r?\n/);
    const opening = lines.findIndex((item) => item.trim() === '{');
    if (opening >= 0) lines.splice(opening + 1, 0, line);
    else lines.unshift(line);
    updated = lines.join(newline);
  }

  const temporary = `${CONFIG_PATH}.${process.pid}.tmp`;
  await writeFile(temporary, updated, { mode: 0o600 });
  await rename(temporary, CONFIG_PATH);
}
