import type { APIRoute } from 'astro';
import { json } from '../../../lib/http';
import { INSTANCES_PATH, loadSshInstances } from '../../../lib/ssh-instances';

export const GET: APIRoute = async () => {
  try {
    const instances = await loadSshInstances();
    return json({ instances, total: instances.length, path: INSTANCES_PATH });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: `No se pudo leer instancias_ips.json: ${message}` }, 500);
  }
};
