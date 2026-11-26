/** Constantes y tipos compartidos entre el servidor y la isla de ajustes. */
export const KEEP_PASSWORD = '__KEEP__';
export const CONFIG_PASSWORD = '__CONFIG__';
export const DEFAULT_SQL_CLIENT = 'sqlcl';

export type SqlClient = 'sqlcl' | 'sqlplus';

export interface PublicSettings {
  sqlClient: SqlClient;
  sqlplusBin: string;
  dbUser: string;
  dbPasswordSet: boolean;
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
