import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { join } from 'node:path';
import type { SshInstanceOption } from './ssh-shared';

export const INSTANCES_PATH = join(process.cwd(), 'instancias_ips.json');

interface RawInstance {
  ambiente?: unknown;
  host?: unknown;
  ip?: unknown;
}

function clean(value: unknown, max = 120): string {
  return String(value ?? '')
    .trim()
    .slice(0, max);
}

/** ID estable: el mismo archivo produce siempre los mismos identificadores. */
function instanceId(database: string, entry: RawInstance, index: number): string {
  const seed = `${database}|${clean(entry.ambiente)}|${clean(entry.host)}|${clean(entry.ip)}|${index}`;
  return createHash('sha1').update(seed).digest('hex').slice(0, 16);
}

/** Aplana el JSON a instancias concretas; nunca se acepta una IP escrita por el navegador. */
export async function loadSshInstances(): Promise<SshInstanceOption[]> {
  const content = await readFile(INSTANCES_PATH, 'utf8');
  let parsed: { instancias?: Record<string, RawInstance[]> };
  try {
    parsed = JSON.parse(content) as { instancias?: Record<string, RawInstance[]> };
  } catch {
    throw new Error('instancias_ips.json no contiene JSON válido.');
  }

  if (!parsed.instancias || typeof parsed.instancias !== 'object') {
    throw new Error('instancias_ips.json no tiene la clave "instancias".');
  }

  const options: SshInstanceOption[] = [];
  for (const [database, entries] of Object.entries(parsed.instancias)) {
    const name = clean(database, 60);
    if (!name || !Array.isArray(entries)) continue;

    entries.forEach((entry, index) => {
      const ambiente = clean(entry?.ambiente, 60);
      const host = clean(entry?.host, 120);
      const ip = clean(entry?.ip, 45);
      if (!host || !ip || isIP(ip) === 0) return;

      options.push({
        id: instanceId(name, entry, index),
        database: name,
        ambiente,
        host,
        ip,
        label: `${name} · ${ambiente || 'Sin ambiente'} · ${host} (${ip})`,
      });
    });
  }

  if (options.length === 0) {
    throw new Error('instancias_ips.json no tiene instancias válidas.');
  }

  return options;
}

export async function findSshInstance(id: string): Promise<SshInstanceOption | undefined> {
  if (!/^[a-f0-9]{16}$/.test(id)) return undefined;
  const instances = await loadSshInstances();
  return instances.find((instance) => instance.id === id);
}
