/** Tipos compartidos entre el servidor y la isla de consola SSH. */

export interface SshInstanceOption {
  id: string;
  database: string;
  ambiente: string;
  host: string;
  ip: string;
  label: string;
}

export type SshSessionStatus = 'connecting' | 'running' | 'closed' | 'error';

export interface SshSnapshot {
  sessionId: string;
  instance: SshInstanceOption;
  status: SshSessionStatus;
  output: string;
  startedAt: string;
  error?: string;
}

export type SshEvent =
  | { type: 'snapshot'; data: SshSnapshot }
  | { type: 'output'; data: { chunk: string } }
  | { type: 'status'; data: { status: SshSessionStatus; error?: string } }
  | { type: 'ping'; data: Record<string, never> }
  | { type: 'done'; data: Record<string, never> };
