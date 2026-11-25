export type CheckStatus = 'OK' | 'WARN' | 'ERROR';

export interface QueryColumn {
  key: string;
  label: string;
  kind?: 'text' | 'number' | 'percent';
}

export interface QueryDefinition {
  id: string;
  title: string;
  description: string;
  sql: string;
  columns: QueryColumn[];
  evaluate: (row: Record<string, string>) => CheckStatus;
  /** Resultado cuando la consulta no devuelve filas. Por defecto WARN. */
  empty?: { status: CheckStatus; message: string };
  /** Consultas bajo demanda no se muestran en la lista de selección. */
  hidden?: boolean;
}

export interface QueryMeta {
  id: string;
  title: string;
  description: string;
  columns: QueryColumn[];
  hidden?: boolean;
}

export interface ResultRow extends Record<string, string> {
  __status: CheckStatus;
}

export interface QueryResult {
  id: string;
  /** ID de la definición de consulta cuando `id` incluye parámetros (ej. dg_disks_by_group:DATA). */
  sourceId?: string;
  title: string;
  status: CheckStatus;
  rows: ResultRow[];
  error?: string;
  durationMs: number;
}

export type JobStatus = 'running' | 'done' | 'error' | 'cancelled';

export interface JobSnapshot {
  jobId: string;
  diskgroup: string;
  queryIds: string[];
  params?: Record<string, string>;
  status: JobStatus;
  output: string;
  results: QueryResult[];
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

export type JobEvent =
  | { type: 'snapshot'; data: JobSnapshot }
  | { type: 'output'; data: { chunk: string } }
  | { type: 'status'; data: { status: JobStatus; error?: string } }
  | { type: 'result'; data: QueryResult }
  | { type: 'done'; data: Record<string, never> }
  | { type: 'ping'; data: Record<string, never> };
