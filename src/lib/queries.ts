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
  {
    id: 'dg_disks_by_group',
    title: 'Discos del diskgroup',
    description: 'Discos asignados al diskgroup seleccionado desde la tabla “Diskgroups ASM”.',
    hidden: true,
    sql: `set lines 180 pages 200
col path format a40
col name format a25
col label format a15
col mount_date format a20
col header_status format a12
col mount_status format a12
col redundancy format a12
col state format a10
SELECT group_number, disk_number, name, path, mount_status, header_status, state, redundancy, os_mb, total_mb, free_mb, mount_date from v$asm_disk
where GROUP_NUMBER IN (
  SELECT GROUP_NUMBER FROM V$ASM_DISKGROUP WHERE NAME = '{{DISKGROUP_NAME}}'
)
ORDER BY name;`,
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
      if (row.HEADER_STATUS && row.HEADER_STATUS !== 'MEMBER') return 'ERROR';
      if (row.STATE && row.STATE !== 'NORMAL') return 'ERROR';
      return 'OK';
    },
    empty: { status: 'WARN', message: 'El diskgroup no tiene discos asociados.' },
  },
  {
    id: 'disk_free_check',
    title: 'Confirmar disco libre',
    description: 'Comprueba si un nombre de disco ya está presente en V$ASM_DISK.',
    hidden: true,
    sql: `set lines 180 pages 200
col nota format a20
col name format a25
col path format a40
select 'DISCO YA EXISTE!!!' AS NOTA, name, path, mount_status from v$asm_disk where name = '{{DISK_NAME}}';`,
    columns: [
      { key: 'NOTA', label: 'Nota' },
      { key: 'NAME', label: 'Disco' },
      { key: 'PATH', label: 'Path' },
      { key: 'MOUNT_STATUS', label: 'Mount' },
    ],
    evaluate(row) {
      return row.NOTA ? 'WARN' : 'OK';
    },
    empty: { status: 'OK', message: 'disco consultado [], disco libre' },
  },
];

export function listQueries(): QueryDefinition[] {
  return queries;
}

export function listQueryMeta(): QueryMeta[] {
  return queries.map(({ id, title, description, columns, hidden }) => ({
    id,
    title,
    description,
    columns,
    hidden,
  }));
}

export function getQuery(id: string): QueryDefinition | undefined {
  return queries.find((query) => query.id === id);
}

export function isValidDiskgroup(value: string): boolean {
  return /^[A-Za-z0-9_]{1,30}$/.test(value);
}

export function isValidDiskName(value: string): boolean {
  return /^[A-Za-z0-9_]{1,30}$/.test(value);
}

export function renderSql(
  sql: string,
  diskgroup: string,
  params: Record<string, string> = {},
): string {
  return sql
    .replaceAll('{{DISKGROUP}}', diskgroup)
    .replaceAll('{{DISKGROUP_NAME}}', params.diskgroupName ?? '')
    .replaceAll('{{DISK_NAME}}', params.diskName ?? '');
}
