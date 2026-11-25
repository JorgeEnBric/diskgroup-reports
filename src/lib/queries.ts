import type { QueryDefinition, QueryMeta } from './types';

/** Consultas maestras: se ejecutan tal cual, sin filtrar por la etiqueta del informe. */

const queries: QueryDefinition[] = [
  {
    id: 'dg_summary',
    title: '1. Diskgroups ASM',
    description: 'Estado, tipo y espacio de todos los diskgroups (V$ASM_DISKGROUP).',
    sql: `set lines 180 pages 200
col path format a25
col name format a25
col label format a15
col path format a40
select group_number,name,state,type,total_mb,free_mb
from v$asm_diskgroup order by name;`,
    columns: [
      { key: 'GROUP_NUMBER', label: 'Nº grupo', kind: 'number' },
      { key: 'NAME', label: 'Diskgroup' },
      { key: 'STATE', label: 'Estado' },
      { key: 'TYPE', label: 'Redundancia' },
      { key: 'TOTAL_MB', label: 'Total MB', kind: 'number' },
      { key: 'FREE_MB', label: 'Libre MB', kind: 'number' },
    ],
    evaluate(row) {
      if (row.STATE && row.STATE !== 'ONLINE') return 'ERROR';
      const total = Number(row.TOTAL_MB);
      const free = Number(row.FREE_MB);
      if (Number.isFinite(total) && total > 0 && Number.isFinite(free)) {
        const freePct = (100 * free) / total;
        if (freePct < 10) return 'ERROR';
        if (freePct < 20) return 'WARN';
      }
      return 'OK';
    },
    empty: { status: 'ERROR', message: 'No se encontraron diskgroups en V$ASM_DISKGROUP.' },
  },
  {
    id: 'dg_disks',
    title: '2. Discos candidatos',
    description: 'Discos con HEADER_STATUS = CANDIDATE en V$ASM_DISK (sin asignar a un diskgroup).',
    sql: `set lines 180 pages 200
col path format a25
col name format a25
col label format a15
col path format a40
set lines 180 pages 200
SELECT group_number, disk_number, name, path, mount_status, header_status, state, redundancy, os_mb, total_mb, free_mb, mount_date from v$asm_disk where header_status = 'CANDIDATE';`,
    columns: [
      { key: 'GROUP_NUMBER', label: 'Nº grupo', kind: 'number' },
      { key: 'DISK_NUMBER', label: 'Nº disco', kind: 'number' },
      { key: 'NAME', label: 'Disco' },
      { key: 'PATH', label: 'Path' },
      { key: 'MOUNT_STATUS', label: 'Mount' },
      { key: 'HEADER_STATUS', label: 'Header' },
      { key: 'STATE', label: 'Estado' },
      { key: 'REDUNDANCY', label: 'Redundancia' },
      { key: 'OS_MB', label: 'OS MB', kind: 'number' },
      { key: 'TOTAL_MB', label: 'Total MB', kind: 'number' },
      { key: 'FREE_MB', label: 'Libre MB', kind: 'number' },
      { key: 'MOUNT_DATE', label: 'Mount date' },
    ],
    evaluate(row) {
      if (row.HEADER_STATUS && row.HEADER_STATUS !== 'CANDIDATE') return 'ERROR';
      // Todo disco devuelto por esta consulta está sin asignar: requiere revisión.
      return 'WARN';
    },
    empty: { status: 'OK', message: 'No hay discos en estado CANDIDATE.' },
  },
  {
    id: 'db_name',
    title: '3. Nombre de la base de datos',
    description: 'Nombre de la base de datos conectada (V$DATABASE).',
    sql: `select name from v$database;`,
    columns: [{ key: 'NAME', label: 'Base de datos' }],
    evaluate() {
      return 'OK';
    },
    empty: { status: 'ERROR', message: 'No se pudo obtener el nombre de la base de datos.' },
  },
];

export function listQueries(): QueryDefinition[] {
  return queries;
}

export function listQueryMeta(): QueryMeta[] {
  return queries.map(({ id, title, description, columns }) => ({ id, title, description, columns }));
}

export function getQuery(id: string): QueryDefinition | undefined {
  return queries.find((query) => query.id === id);
}

export function isValidDiskgroup(value: string): boolean {
  return /^[A-Za-z0-9_]{1,30}$/.test(value);
}

export function renderSql(sql: string, diskgroup: string): string {
  return sql.replaceAll('{{DISKGROUP}}', diskgroup);
}
