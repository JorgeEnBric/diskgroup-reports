import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as pty from 'node-pty';
import { getConfig, validateConfig, type Config } from './env';
import { addResult, appendOutput, disposeJob, setStatus, type JobInternal } from './jobs';
import { extractOracleErrors, parseSpool, rowsToObjects } from './parse';
import { getQuery, renderSql } from './queries';
import type { CheckStatus, QueryResult } from './types';

/** Oculta los warnings de JLine/JVM en pantalla sin perder el log crudo del job. */
function createOutputFilter() {
  let pending = '';
  const shouldDrop = (line: string): boolean =>
    /^\s*(?:WARNING:|Picked up JAVA_TOOL_OPTIONS:)/i.test(line);

  return {
    push(data: string): string {
      pending += data;
      const parts = pending.split(/(\r\n|\n|\r)/);
      pending = parts.pop() ?? '';
      let visible = '';
      for (let index = 0; index < parts.length; index += 2) {
        const line = parts[index] ?? '';
        const eol = parts[index + 1] ?? '';
        if (!shouldDrop(line)) visible += line + eol;
      }
      return visible;
    },
    flush(): string {
      const line = pending;
      pending = '';
      return line && !shouldDrop(line) ? line : '';
    },
  };
}

function buildScript(job: JobInternal, spoolPaths: Record<string, string>, cfg: Config): string {
  const total = job.queryIds.length;
  const lines = [
    'WHENEVER SQLERROR CONTINUE',
    'WHENEVER OSERROR CONTINUE',
    'SET ECHO OFF',
    'SET VERIFY OFF',
    'SET FEEDBACK OFF',
    'SET HEADING ON',
    'SET LINESIZE 32767',
    'SET TERMOUT ON',
  ];

  if (cfg.sqlClient === 'sqlcl') {
    // SQLcl usa SQLFORMAT en lugar de COLSEP / UNDERLINE / PAGESIZE.
    lines.push(`SET SQLFORMAT DELIMITED ${cfg.delimiter} " "`);
  } else {
    lines.push(
      'SET UNDERLINE OFF',
      'SET PAGESIZE 50000',
      `SET COLSEP '${cfg.delimiter}'`,
      'SET TRIMSPOOL ON',
    );
  }

  lines.push(
    'PROMPT ============================================================',
    `PROMPT Generando reporte maestro (etiqueta: ${job.diskgroup}) (${total} consultas)`,
    'PROMPT ============================================================',
  );

  job.queryIds.forEach((id, index) => {
    const query = getQuery(id);
    if (!query) return;
    lines.push('PROMPT', `PROMPT [${index + 1}/${total}] ${query.title}`);
    lines.push(`SPOOL "${spoolPaths[id]}"`);
    const sql = renderSql(query.sql.trim(), job.diskgroup, job.params);
    // Algunas consultas maestras ya terminan en ';': no duplicar el terminador.
    lines.push(sql.endsWith(';') ? sql : `${sql};`);
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

function toResult(
  id: string,
  raw: string,
  durationMs: number,
  cfg: Config,
  params?: Record<string, string>,
): QueryResult {
  const query = getQuery(id)!;
  const paramName = params?.diskgroupName ?? params?.diskName;
  const resultId = paramName ? `${id}:${paramName}` : id;
  const sourceId = resultId === id ? undefined : id;
  const title = params?.diskName
    ? `${query.title} [${params.diskName}]`
    : params?.diskgroupName
      ? `${query.title} ${params.diskgroupName}`
      : query.title;
  const common = { id: resultId, sourceId, title };

  const errors = extractOracleErrors(raw);
  if (errors.length > 0) {
    return {
      ...common,
      status: 'ERROR',
      rows: [],
      error: errors.join(' | '),
      durationMs,
    };
  }

  const objects = rowsToObjects(parseSpool(raw, cfg.delimiter));
  const rows = objects.map((row) => ({ ...row, __status: query.evaluate(row) }));

  if (rows.length === 0) {
    const empty = query.empty ?? {
      status: 'WARN' as const,
      message: 'La consulta no devolvió filas. Revisa los permisos y el entorno de la base de datos.',
    };
    const message =
      id === 'disk_free_check' && params?.diskName
        ? `disco consultado [${params.diskName}], disco libre`
        : empty.message;
    return {
      ...common,
      status: empty.status,
      rows: [],
      error: message,
      durationMs,
    };
  }

  return {
    ...common,
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
      // SQL*Plus y SQLcl aceptan barras normales en SPOOL, incluso en Windows.
      spoolPaths[id] = join(workDir, `q${index + 1}.txt`).replace(/\\/g, '/');
    });

    await writeFile(scriptPath, buildScript(job, spoolPaths, cfg), 'utf8');

    const clientName = cfg.sqlClient === 'sqlcl' ? 'SQLcl' : 'SQL*Plus';
    appendOutput(job, `[INFO] Ejecutando ${clientName}: ${cfg.sqlplusBin}\r\n`);
    if (cfg.directConnection) {
      appendOutput(job, `[INFO] Conexión directa: ${cfg.dbConnect}\r\n`);
    }
    if (cfg.javaOpts) {
      appendOutput(job, `[INFO] Opciones JVM activas: ${cfg.javaOpts}\r\n`);
    }

    const childEnv: Record<string, string> = { ...(process.env as Record<string, string>) };

    // Un TNS_ADMIN vacío provoca el error TNSHelper.getTnsnamesDir en SQLcl.
    delete childEnv.TNS_ADMIN;
    delete childEnv.JAVA_TOOL_OPTIONS;
    childEnv.NLS_LANG = cfg.nlsLang;
    if (cfg.tnsAdmin) childEnv.TNS_ADMIN = cfg.tnsAdmin;
    if (cfg.javaOpts) childEnv.JAVA_TOOL_OPTIONS = cfg.javaOpts;

    if (cfg.sqlClient === 'sqlcl') {
      childEnv.TERM = 'dumb';
      childEnv.SQLPATH = workDir;
    }

    const connection = `${cfg.dbUser}/${cfg.dbPassword}@${cfg.dbConnect}`;
    const args =
      cfg.sqlClient === 'sqlcl'
        ? ['-S', '-L', '-noupdates', '-nohistory', connection, `@${scriptPath}`]
        : ['-S', '-L', connection, `@${scriptPath}`];

    const child = pty.spawn(cfg.sqlplusBin, args, {
      // node-pty usa `name` como TERM en Unix; en SQLcl queremos un terminal no interactivo.
      name: cfg.sqlClient === 'sqlcl' ? 'dumb' : 'xterm-color',
      cols: 160,
      rows: 32,
      cwd: workDir,
      env: childEnv,
    });

    job.kill = () => child.kill();

    const filter = createOutputFilter();
    child.onData((data: string) => appendOutput(job, data, filter.push(data)));

    timeout = setTimeout(() => {
      appendOutput(job, `\r\n[ERROR] Timeout de ${cfg.timeoutMs} ms alcanzado.\r\n`);
      job.kill?.();
    }, cfg.timeoutMs);

    await new Promise<void>((resolve) => {
      child.onExit(() => {
        const remaining = filter.flush();
        if (remaining) appendOutput(job, '', remaining);
        resolve();
      });
    });

    if (timeout) clearTimeout(timeout);
    job.kill = undefined;

    if (job.status === 'cancelled') return;

    for (const id of job.queryIds) {
      const started = Date.now();
      const raw = await readFile(spoolPaths[id], 'utf8').catch(() => '');
      addResult(job, toResult(id, raw, Date.now() - started, cfg, job.params));
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
