import { decryptPassword, loadConfigFile } from './connections';

let cached: string | undefined;
let pending: Promise<string> | undefined;

async function readMasterPassword(): Promise<string> {
  try {
    const { encryptedPassword } = await loadConfigFile();
    if (!encryptedPassword) return '';
    return decryptPassword(encryptedPassword);
  } catch {
    // .config ausente o clave inválida: el job mostrará un error claro al validar.
    return '';
  }
}

/** Descifra .config una sola vez y mantiene la contraseña solo en memoria del servidor. */
export async function getMasterPassword(): Promise<string> {
  if (cached !== undefined) return cached;
  if (!pending) pending = readMasterPassword();
  cached = await pending;
  return cached;
}

/** Fuerza una nueva lectura de .config, por ejemplo al aplicar una conexión. */
export async function refreshMasterPassword(): Promise<string> {
  cached = undefined;
  pending = readMasterPassword();
  cached = await pending;
  return cached;
}
