import type { JobEvent, JobSnapshot, JobStatus, QueryResult } from './types';

export interface JobInternal extends JobSnapshot {
  listeners: Set<(event: JobEvent) => void>;
  kill?: () => void;
  timer?: ReturnType<typeof setTimeout>;
}

const jobs = new Map<string, JobInternal>();

export function createJob(jobId: string, diskgroup: string, queryIds: string[]): JobInternal {
  const job: JobInternal = {
    jobId,
    diskgroup,
    queryIds,
    status: 'running',
    output: '',
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

export function appendOutput(job: JobInternal, chunk: string): void {
  if (!chunk) return;
  job.output += chunk;
  publish(job, { type: 'output', data: { chunk } });
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
