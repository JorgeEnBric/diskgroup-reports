import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as pty from 'node-pty';
import { getConfig, validateConfig, type Config } from './env';
import { addResult, appendOutput, disposeJob, setStatus, type JobInternal } from './jobs';
import { extractOracleErrors, parseSpool, rowsToObjects } from './parse';
import { getQuery, renderSql } from './queries';
import type { CheckStatus, QueryResult } from './types';

function buildScript(job: JobInternal, spoolPaths: Record<string, string>, cfg: Config): string {
  const total = job.queryIds.length;
  const lines = [
    'WHENEVER SQLERROR CONTINUE',
    'WHENEVER OSERROR CONTINUE',
    'SET ECHO OFF',
    'SET VERIFY OFF',
    'SET FEEDBACK OFF',
    'SET HEADING ON',
    'SET UNDERLINE OFF',
    'SET PAGESIZE 50000',
    'SET LINESIZE 32767',
    `SET COLSEP '${cfg.delimiter}'`,
    'SET TRIMSPOOL ON',
    'SET TERMOUT ON',
    'PROMPT ============================================================',
    `PROMPT Validando diskgroup ${job.diskgroup} (${total} consultas)`,
    'PROMPT ============================================================',
  ];

  job.queryIds.forEach((id, index) => {
    const query = getQuery(id);
    if (!query) return;
    lines.push('PROMPT', `PROMPT [${index + 1}/${total}] ${query.title}`);
    lines.push(`SPOOL "${spoolPaths[id]}"`);
    lines.push(`${renderSql(query.sql.trim(), job.diskgroup)};`);
    lines.push('SPOOL OFF');
  });

  lines.push('PROMPT', 'PROMPT ============================================================', 'PROMPT Fin de la validación', 'EXIT');
  return `${lines.join('\n')}\n`;
}

function worstStatus(statuses: CheckStatus[]): CheckStatus {
  if (statuses.includes('ERROR')) return 'ERROR';
  if (statuses.includes('WARN')) return 'WARN';
  return 'OK';
}

function toResult(id: string, raw: string, durationMs: number, cfg: Config): QueryResult {
  const query = getQuery(id)!;
  const errors = extractOracleErrors(raw);
  if (errors.length > 0) {
    return {
      id,
      title: query.title,
      status: 'ERROR',
      rows: [],
      error: errors.join(' | '),
      durationMs,
    };
  }

  const objects = rowsToObjects(parseSpool(raw, cfg.delimiter));
  const rows = objects.map((row) => ({ ...row, __status: query.evaluate(row) }));

  if (rows.length === 0) {
    return {
      id,
      title: query.title,
      status: 'WARN',
      rows: [],
      error: 'La consulta no devolvió filas. Revisa el nombre del diskgroup y los permisos.',
      durationMs,
    };
  }

  return {
    id,
    title: query.title,
    status: worstStatus(rows.map((row) => row.__status)),
    rows,
    durationMs,
  };
}

export async function executeJob(job: JobInternal): Promise<void> {
  const cfg = getConfig();
  const problems = validateConfig(cfg);
  if (problems.length > 0) {
    setStatus(job, 'error', problems.join(' | '));
    appendOutput(job, `\r\n[ERROR] ${problems.join(' | ')}\r\n`);
    disposeJob(job);
    return;
  }

  let workDir = '';
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    workDir = await mkdtemp(join(tmpdir(), 'dg-report-'));
    const scriptPath = join(workDir, 'run.sql');
    const spoolPaths: Record<string, string> = {};

    job.queryIds.forEach((id, index) => {
      // SQL*Plus en Windows acepta barras normales en SPOOL.
      spoolPaths[id] = join(workDir, `q${index + 1}.txt`).replace(/\\/g, '/');
    });

    await writeFile(scriptPath, buildScript(job, spoolPaths, cfg), 'utf8');

    appendOutput(job, `[INFO] Ejecutando ${cfg.sqlplusBin}\r\n`);
    if (cfg.directConnection) {
      appendOutput(job, `[INFO] Conexión directa: ${cfg.dbConnect}\r\n`);
    }

    const childEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
      NLS_LANG: cfg.nlsLang,
    };
    if (cfg.tnsAdmin) childEnv.TNS_ADMIN = cfg.tnsAdmin;

    const child = pty.spawn(
      cfg.sqlplusBin,
      ['-S', '-L', `${cfg.dbUser}/${cfg.dbPassword}@${cfg.dbConnect}`, `@${scriptPath}`],
      {
        name: 'xterm-color',
        cols: 160,
        rows: 32,
        cwd: workDir,
        env: childEnv,
      },
    );

    job.kill = () => child.kill();

    child.onData((data: string) => appendOutput(job, data));

    timeout = setTimeout(() => {
      appendOutput(job, `\r\n[ERROR] Timeout de ${cfg.timeoutMs} ms alcanzado.\r\n`);
      job.kill?.();
    }, cfg.timeoutMs);

    await new Promise<void>((resolve) => {
      child.onExit(() => resolve());
    });

    if (timeout) clearTimeout(timeout);
    job.kill = undefined;

    if (job.status === 'cancelled') return;

    for (const id of job.queryIds) {
      const started = Date.now();
      const raw = await readFile(spoolPaths[id], 'utf8').catch(() => '');
      addResult(job, toResult(id, raw, Date.now() - started, cfg));
    }

    setStatus(job, 'done');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendOutput(job, `\r\n[ERROR] ${message}\r\n`);
    setStatus(job, 'error', message);
  } finally {
    if (timeout) clearTimeout(timeout);
    job.kill = undefined;
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    disposeJob(job);
  }
}
