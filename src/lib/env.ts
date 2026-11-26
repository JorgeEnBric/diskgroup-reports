import 'dotenv/config';
import { rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DEFAULT_SQL_CLIENT,
  KEEP_PASSWORD,
  type PublicSettings,
  type SqlClient,
} from './settings-shared';

export { DEFAULT_SQL_CLIENT, KEEP_PASSWORD } from './settings-shared';
export type { PublicSettings, SqlClient } from './settings-shared';

export const ENV_PATH = join(process.cwd(), '.env');

const KEYS = [
  'SQL_CLIENT',
  'SQLPLUS_BIN',
  'DB_USER',
  'DB_PASSWORD',
  'DB_CONNECT',
  'DB_HOST',
  'DB_PORT',
  'DB_SERVICE',
  'DIRECT_CONNECTION',
  'TNS_ADMIN',
  'NLS_LANG',
  'JOB_TIMEOUT_MS',
  'JAVA_OPTS',
  'CONFIG_ENCRYPTION_KEY',
] as const;

function read(name: string, fallback = ''): string {
  return (process.env[name] ?? fallback).trim();
}

function readClient(sqlplusBin: string): SqlClient {
  const configured = read('SQL_CLIENT').toLowerCase();
  if (configured === 'sqlplus' || configured === 'sqlcl') return configured;

  // Si no se configuró explícitamente, se infiere del binario; por defecto SQLcl.
  if (/sqlplus/i.test(sqlplusBin) && !/sqlcl/i.test(sqlplusBin)) return 'sqlplus';
  return DEFAULT_SQL_CLIENT;
}

export interface Config {
  sqlClient: SqlClient;
  sqlplusBin: string;
  dbUser: string;
  dbPassword: string;
  dbConnect: string;
  dbHost: string;
  dbPort: string;
  dbService: string;
  directConnection: boolean;
  tnsAdmin: string;
  nlsLang: string;
  timeoutMs: number;
  javaOpts: string;
  delimiter: string;
}

/** Se lee en cada petición para que los cambios del panel de ajustes se apliquen al instante. */
export function getConfig(): Config {
  const sqlplusBin = read('SQLPLUS_BIN');
  const timeout = Number(read('JOB_TIMEOUT_MS', '120000'));
  return {
    sqlClient: readClient(sqlplusBin),
    sqlplusBin,
    dbUser: read('DB_USER'),
    dbPassword: read('DB_PASSWORD'),
    dbConnect: read('DB_CONNECT'),
    dbHost: read('DB_HOST'),
    dbPort: read('DB_PORT'),
    dbService: read('DB_SERVICE'),
    directConnection: read('DIRECT_CONNECTION', 'false').toLowerCase() === 'true',
    tnsAdmin: read('TNS_ADMIN'),
    nlsLang: read('NLS_LANG', 'AMERICAN_AMERICA.AL32UTF8'),
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 120000,
    javaOpts: read('JAVA_OPTS'),
    delimiter: '|~|',
  };
}

/** Nunca devuelve el password en claro; usa un marcador para conservarlo. */
export function publicSettings(): PublicSettings {
  const cfg = getConfig();
  return {
    sqlClient: cfg.sqlClient,
    sqlplusBin: cfg.sqlplusBin,
    dbUser: cfg.dbUser,
    dbPasswordSet: Boolean(cfg.dbPassword),
    dbPassword: cfg.dbPassword ? KEEP_PASSWORD : '',
    dbConnect: cfg.dbConnect,
    dbHost: cfg.dbHost,
    dbPort: cfg.dbPort,
    dbService: cfg.dbService,
    directConnection: cfg.directConnection,
    tnsAdmin: cfg.tnsAdmin,
    nlsLang: cfg.nlsLang,
    timeoutMs: cfg.timeoutMs,
    javaOpts: cfg.javaOpts,
  };
}

export interface SettingsInput {
  sqlClient?: unknown;
  sqlplusBin?: unknown;
  dbUser?: unknown;
  dbPassword?: unknown;
  directConnection?: unknown;
  host?: unknown;
  port?: unknown;
  service?: unknown;
  dbConnect?: unknown;
  tnsAdmin?: unknown;
  nlsLang?: unknown;
  timeoutMs?: unknown;
  javaOpts?: unknown;
}

function str(value: unknown, max = 500): string {
  return String(value ?? '').trim().slice(0, max);
}

export interface NormalizedSettings {
  sqlClient: SqlClient;
  sqlplusBin: string;
  dbUser: string;
  dbPassword: string;
  dbConnect: string;
  dbHost: string;
  dbPort: string;
  dbService: string;
  directConnection: boolean;
  tnsAdmin: string;
  nlsLang: string;
  timeoutMs: number;
  javaOpts: string;
}

export function normalizeSettings(input: SettingsInput): NormalizedSettings {
  const current = getConfig();
  const directConnection =
    input.directConnection === true ||
    input.directConnection === 'true' ||
    input.directConnection === 'on';

  const clientInput = str(input.sqlClient ?? current.sqlClient, 20).toLowerCase();
  const sqlClient: SqlClient = clientInput === 'sqlplus' ? 'sqlplus' : DEFAULT_SQL_CLIENT;

  const passwordInput = str(input.dbPassword, 200);
  const dbPassword = passwordInput === KEEP_PASSWORD ? current.dbPassword : passwordInput;

  const dbHost = directConnection ? str(input.host, 200) : current.dbHost;
  const dbPort = directConnection ? str(input.port, 10) : current.dbPort;
  const dbService = directConnection ? str(input.service, 200) : current.dbService;
  const dbConnect = directConnection
    ? dbHost && dbPort && dbService
      ? `//${dbHost}:${dbPort}/${dbService}`
      : ''
    : str(input.dbConnect, 500);

  const timeout = Number(str(input.timeoutMs, 10));

  return {
    sqlClient,
    sqlplusBin: str(input.sqlplusBin, 500),
    dbUser: str(input.dbUser, 200),
    dbPassword,
    dbConnect,
    dbHost,
    dbPort,
    dbService,
    directConnection,
    tnsAdmin: str(input.tnsAdmin, 500),
    nlsLang: str(input.nlsLang, 100) || 'AMERICAN_AMERICA.AL32UTF8',
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? Math.min(timeout, 3600000) : 120000,
    javaOpts: str(input.javaOpts, 2000),
  };
}

function envLine(key: string, value: string): string {
  const v = value ?? '';
  if (/["#\r\n]/.test(v) || /^\s|\s$/.test(v)) {
    const escaped = v
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n');
    return `${key}="${escaped}"`;
  }
  return `${key}=${v}`;
}

/** Escribe .env de forma atómica y actualiza el entorno del proceso en caliente. */
export async function saveSettings(input: SettingsInput): Promise<PublicSettings> {
  const settings = normalizeSettings(input);
  const values: Record<string, string> = {
    SQL_CLIENT: settings.sqlClient,
    SQLPLUS_BIN: settings.sqlplusBin,
    DB_USER: settings.dbUser,
    DB_PASSWORD: settings.dbPassword,
    DB_CONNECT: settings.dbConnect,
    DB_HOST: settings.dbHost,
    DB_PORT: settings.dbPort,
    DB_SERVICE: settings.dbService,
    DIRECT_CONNECTION: settings.directConnection ? 'true' : 'false',
    TNS_ADMIN: settings.tnsAdmin,
    NLS_LANG: settings.nlsLang,
    JOB_TIMEOUT_MS: String(settings.timeoutMs),
    JAVA_OPTS: settings.javaOpts,
    CONFIG_ENCRYPTION_KEY: read('CONFIG_ENCRYPTION_KEY'),
  };

  const content = [
    '# Ajustes guardados desde el panel web de la herramienta.',
    ...KEYS.map((key) => envLine(key, values[key])),
    '',
  ].join('\n');

  const temporary = `${ENV_PATH}.${process.pid}.tmp`;
  await writeFile(temporary, content, { mode: 0o600 });
  await rename(temporary, ENV_PATH);

  for (const key of KEYS) process.env[key] = values[key];
  return publicSettings();
}

export function validateConfig(cfg: Config = getConfig()): string[] {
  const problems: string[] = [];
  const binary = cfg.sqlClient === 'sqlcl' ? 'sql.exe / sqlcl.exe' : 'sqlplus.exe';

  if (!cfg.sqlplusBin) problems.push(`Falta la ruta de ${binary} en los ajustes`);
  if (!cfg.dbUser) problems.push('Falta el usuario de la base de datos');
  if (!cfg.dbPassword) problems.push('Falta la contraseña de la base de datos');
  if (!cfg.dbConnect) {
    problems.push(
      cfg.directConnection
        ? 'Completa hostname, puerto y servicio para la conexión directa'
        : 'Falta DB_CONNECT en los ajustes',
    );
  }
  return problems;
}

/** Cadena segura para mostrar en la UI: nunca incluye el password. */
export function connectionLabel(cfg: Config = getConfig()): string {
  const client = cfg.sqlClient === 'sqlcl' ? 'sql' : 'sqlplus';
  return cfg.dbConnect ? `${client} ${cfg.dbUser}@${cfg.dbConnect}`.trim() : 'sin configurar';
}
