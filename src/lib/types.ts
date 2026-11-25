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
}

export interface QueryMeta {
  id: string;
  title: string;
  description: string;
  columns: QueryColumn[];
}

export interface ResultRow extends Record<string, string> {
  __status: CheckStatus;
}

export interface QueryResult {
  id: string;
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
