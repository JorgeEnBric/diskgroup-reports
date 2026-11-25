import type { JobEvent, JobSnapshot, JobStatus, QueryResult } from './types';

export interface JobInternal extends JobSnapshot {
  listeners: Set<(event: JobEvent) => void>;
  kill?: () => void;
  timer?: ReturnType<typeof setTimeout>;
  /** Log completo de la PTY, incluidas las líneas filtradas en pantalla. No se envía al navegador. */
  rawOutput: string;
}

const jobs = new Map<string, JobInternal>();

export function createJob(
  jobId: string,
  diskgroup: string,
  queryIds: string[],
  params?: Record<string, string>,
): JobInternal {
  const job: JobInternal = {
    jobId,
    diskgroup,
    queryIds,
    params,
    status: 'running',
    output: '',
    rawOutput: '',
    results: [],
    startedAt: new Date().toISOString(),
    listeners: new Set(),
  };
  jobs.set(jobId, job);
  return job;
}

export function getJob(jobId: string): JobInternal | undefined {
  return jobs.get(jobId);
}

export function snapshot(job: JobInternal): JobSnapshot {
  return {
    jobId: job.jobId,
    diskgroup: job.diskgroup,
    queryIds: job.queryIds,
    params: job.params,
    status: job.status,
    output: job.output,
    results: job.results,
    error: job.error,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };
}

export function publish(job: JobInternal, event: JobEvent): void {
  for (const listener of job.listeners) {
    try {
      listener(event);
    } catch {
      // Un listener roto no debe afectar a los demás.
    }
  }
}

/**
 * Guarda siempre el chunk original en `rawOutput` y publica solo `publishChunk`.
 * Así podemos ocultar warnings de JVM en el terminal sin perder el log completo.
 */
export function appendOutput(job: JobInternal, chunk: string, publishChunk = chunk): void {
  if (!chunk && !publishChunk) return;
  job.rawOutput += chunk;
  job.output += publishChunk;
  publish(job, { type: 'output', data: { chunk: publishChunk } });
}

/** Solo para diagnóstico en el servidor; nunca se expone por SSE. */
export function getRawOutput(job: JobInternal): string {
  return job.rawOutput;
}

export function addResult(job: JobInternal, result: QueryResult): void {
  job.results.push(result);
  publish(job, { type: 'result', data: result });
}

export function setStatus(job: JobInternal, status: JobStatus, error?: string): void {
  if (job.status !== 'running' && status !== job.status) return;
  job.status = status;
  if (error) job.error = error;
  if (status !== 'running') job.finishedAt = new Date().toISOString();
  publish(job, { type: 'status', data: { status, error } });
  if (status !== 'running') publish(job, { type: 'done', data: {} });
}

export function subscribe(job: JobInternal, listener: (event: JobEvent) => void): () => void {
  job.listeners.add(listener);
  listener({ type: 'snapshot', data: snapshot(job) });
  return () => job.listeners.delete(listener);
}

export function cancelJob(job: JobInternal): void {
  if (job.status !== 'running') return;
  appendOutput(job, '\r\n[INFO] Cancelado por el usuario.\r\n');
  job.kill?.();
  setStatus(job, 'cancelled');
}

export function disposeJob(job: JobInternal, delayMs = 10 * 60 * 1000): void {
  if (job.timer) clearTimeout(job.timer);
  job.timer = setTimeout(() => jobs.delete(job.jobId), delayMs);
  job.timer.unref?.();
}
