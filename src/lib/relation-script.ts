import type { DiskLink } from './types';

function quotedPath(path: string): string {
  return `'${path.trim().replace(/'/g, "''")}'`;
}

/**
 * Genera una sentencia por diskgroup con discos enlazados:
 * ALTER para los diskgroups actuales y CREATE para los pedidos como nuevos.
 * Conserva el orden de `diskgroups` y, dentro de cada grupo, el orden de enlazado.
 */
export function buildRelationScripts(
  links: DiskLink[],
  diskgroups: string[] = [],
  newDiskgroups: string[] = [],
): string[] {
  const created = new Set(newDiskgroups.map((name) => name.trim().toUpperCase()));
  const pathsByDiskgroup = new Map<string, string[]>();
  const order: string[] = [];

  for (const rawName of diskgroups) {
    const name = rawName.trim().toUpperCase();
    if (name && !order.includes(name)) order.push(name);
  }

  for (const link of links) {
    const name = link.diskgroup.trim().toUpperCase();
    const path = link.path.trim();
    if (!name || !path) continue;

    if (!pathsByDiskgroup.has(name)) {
      pathsByDiskgroup.set(name, []);
      if (!order.includes(name)) order.push(name);
    }

    const paths = pathsByDiskgroup.get(name)!;
    if (!paths.includes(path)) paths.push(path);
  }

  const scripts: string[] = [];
  for (const name of order) {
    const paths = pathsByDiskgroup.get(name) ?? [];
    if (paths.length === 0) continue;

    const quoted = paths.map(quotedPath);
    const disks = quoted.length === 1 ? quoted[0] : `(${quoted.join(', ')})`;
    scripts.push(
      created.has(name)
        ? `CREATE DISKGROUP ${name}  EXTERNAL REDUNDANCY DISK ${disks} REBALANCE POWER 8;`
        : `ALTER DISKGROUP ${name} ADD DISK ${disks} REBALANCE POWER 8;`,
    );
  }

  return scripts;
}
