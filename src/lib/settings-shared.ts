/** Constante y tipos compartidos entre el servidor y la isla de ajustes. */
export const KEEP_PASSWORD = '__KEEP__';

export interface PublicSettings {
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
}
