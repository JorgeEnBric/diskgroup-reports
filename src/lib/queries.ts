import type { QueryDefinition, QueryMeta } from './types';

/**
 * CONSULTAS MAESTRAS PROVISIONALES.
 * Sustituye `sql` y `evaluate` por tus consultas reales cuando las tengas.
 * Usa {{DISKGROUP}} como marcador; se sustituye por un nombre validado.
 */

const queries: QueryDefinition[] = [
  {
    id: 'dg_summary',
    title: '1. Resumen del diskgroup',
    description: 'Estado, redundancia y espacio libre del diskgroup.',
    sql: `SELECT d.NAME AS DISKGROUP,
       d.STATE AS STATE,
       d.TYPE AS REDUNDANCY,
       TO_CHAR(ROUND(d.TOTAL_MB)) AS TOTAL_MB,
       TO_CHAR(ROUND(d.FREE_MB)) AS FREE_MB,
       TO_CHAR(ROUND(d.USABLE_FILE_MB)) AS USABLE_FILE_MB,
       TO_CHAR(ROUND(100 * d.FREE_MB / NULLIF(d.TOTAL_MB, 0), 2)) AS FREE_PCT
FROM V$ASM_DISKGROUP_STAT d
WHERE d.NAME = '{{DISKGROUP}}'
ORDER BY d.NAME`,
    columns: [
      { key: 'DISKGROUP', label: 'Diskgroup' },
      { key: 'STATE', label: 'Estado' },
      { key: 'REDUNDANCY', label: 'Redundancia' },
      { key: 'TOTAL_MB', label: 'Total MB', kind: 'number' },
      { key: 'FREE_MB', label: 'Libre MB', kind: 'number' },
      { key: 'USABLE_FILE_MB', label: 'Usable MB', kind: 'number' },
      { key: 'FREE_PCT', label: 'Libre %', kind: 'percent' },
    ],
    evaluate(row) {
      if (row.STATE && row.STATE !== 'ONLINE') return 'ERROR';
      const usable = Number(row.USABLE_FILE_MB);
      if (Number.isFinite(usable) && usable < 0) return 'ERROR';
      const freePct = Number(row.FREE_PCT);
      if (Number.isFinite(freePct) && freePct < 10) return 'ERROR';
      if (Number.isFinite(freePct) && freePct < 20) return 'WARN';
      return 'OK';
    },
  },
  {
    id: 'dg_disks',
    title: '2. Integridad de discos',
    description: 'Discos miembros, failgroups, estados y errores de E/S.',
    sql: `SELECT TO_CHAR(d.DISK_NUMBER) AS DISK_NUMBER,
       d.NAME AS DISK_NAME,
       d.FAILGROUP AS FAILGROUP,
       d.PATH AS DISK_PATH,
       d.STATE AS STATE,
       d.HEADER_STATUS AS HEADER_STATUS,
       d.MODE_STATUS AS MODE_STATUS,
       TO_CHAR(ROUND(d.TOTAL_MB)) AS TOTAL_MB,
       TO_CHAR(d.READ_ERRS) AS READ_ERRS,
       TO_CHAR(d.WRITE_ERRS) AS WRITE_ERRS
FROM V$ASM_DISK_STAT d
WHERE d.GROUP_NUMBER IN (
    SELECT GROUP_NUMBER FROM V$ASM_DISKGROUP_STAT WHERE NAME = '{{DISKGROUP}}'
)
ORDER BY d.FAILGROUP, d.DISK_NUMBER`,
    columns: [
      { key: 'DISK_NUMBER', label: 'Nº disco', kind: 'number' },
      { key: 'DISK_NAME', label: 'Disco' },
      { key: 'FAILGROUP', label: 'Failgroup' },
      { key: 'DISK_PATH', label: 'Path' },
      { key: 'STATE', label: 'Estado' },
      { key: 'HEADER_STATUS', label: 'Header' },
      { key: 'MODE_STATUS', label: 'Modo' },
      { key: 'TOTAL_MB', label: 'Total MB', kind: 'number' },
      { key: 'READ_ERRS', label: 'Err. lectura', kind: 'number' },
      { key: 'WRITE_ERRS', label: 'Err. escritura', kind: 'number' },
    ],
    evaluate(row) {
      if (row.HEADER_STATUS && row.HEADER_STATUS !== 'MEMBER') return 'ERROR';
      if (row.STATE && row.STATE !== 'NORMAL') return 'ERROR';
      if (row.MODE_STATUS && row.MODE_STATUS !== 'ONLINE') return 'ERROR';
      if (Number(row.READ_ERRS) + Number(row.WRITE_ERRS) > 0) return 'WARN';
      return 'OK';
    },
  },
  {
    id: 'dg_activity',
    title: '3. Actividad y configuración',
    description: 'Operaciones ASM en curso y atributos relevantes del diskgroup.',
    sql: `SELECT 'OPERATION' AS KIND,
       o.OPERATION AS NAME,
       o.STATE AS STATE,
       TO_CHAR(o.PCT_DONE) AS VALUE1,
       TO_CHAR(o.EST_MINUTES) AS VALUE2,
       TO_CHAR(o.EST_COMPLETE_TIME, 'YYYY-MM-DD HH24:MI:SS') AS VALUE3
FROM V$ASM_OPERATION o
WHERE o.GROUP_NUMBER IN (
    SELECT GROUP_NUMBER FROM V$ASM_DISKGROUP_STAT WHERE NAME = '{{DISKGROUP}}'
)
UNION ALL
SELECT 'ATTRIBUTE' AS KIND,
       a.NAME AS NAME,
       a.VALUE AS STATE,
       NULL AS VALUE1,
       NULL AS VALUE2,
       NULL AS VALUE3
FROM V$ASM_ATTRIBUTE a
WHERE a.GROUP_NUMBER IN (
    SELECT GROUP_NUMBER FROM V$ASM_DISKGROUP_STAT WHERE NAME = '{{DISKGROUP}}'
)
  AND a.NAME IN ('compatible.asm', 'compatible.rdbms', 'au_size', 'sector_size')
ORDER BY KIND, NAME`,
    columns: [
      { key: 'KIND', label: 'Tipo' },
      { key: 'NAME', label: 'Nombre' },
      { key: 'STATE', label: 'Estado / Valor' },
      { key: 'VALUE1', label: 'Pct / —', kind: 'number' },
      { key: 'VALUE2', label: 'Min / —', kind: 'number' },
      { key: 'VALUE3', label: 'ETA / —' },
    ],
    evaluate(row) {
      if (row.KIND === 'OPERATION') {
        return 'WARN'; // Hay una operación ASM activa (rebalanceo, etc.).
      }
      return 'OK';
    },
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
