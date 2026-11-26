import { randomUUID } from 'node:crypto';
import * as pty from 'node-pty';
import { getSshConfig, validateSshConfig } from './env';
import type { SshEvent, SshInstanceOption, SshSessionStatus, SshSnapshot } from './ssh-shared';

/** Tope del buffer para no crecer sin límite durante sesiones largas. */
const MAX_OUTPUT = 200_000;
const DISPOSE_DELAY_MS = 10 * 60 * 1000;

interface SshSessionInternal extends SshSnapshot {
  listeners: Set<(event: SshEvent) => void>;
  child?: pty.IPty;
  timer?: ReturnType<typeof setTimeout>;
}

const sessions = new Map<string, SshSessionInternal>();

function snapshot(session: SshSessionInternal): SshSnapshot {
  return {
    sessionId: session.sessionId,
    instance: session.instance,
    status: session.status,
    output: session.output,
    startedAt: session.startedAt,
    error: session.error,
  };
}

function publish(session: SshSessionInternal, event: SshEvent): void {
  for (const listener of session.listeners) {
    try {
      listener(event);
    } catch {
      // Un listener roto no debe afectar a los demás.
    }
  }
}

function setStatus(
  session: SshSessionInternal,
  status: SshSessionStatus,
  error?: string,
): void {
  if (session.status === 'closed' && status !== 'closed') return;
  if (session.status === 'error' && status === 'running') return;
  session.status = status;
  if (error) session.error = error;
  publish(session, { type: 'status', data: { status, error } });
  if (status === 'closed' || status === 'error') {
    publish(session, { type: 'done', data: {} });
  }
}

function dispose(session: SshSessionInternal, delayMs = DISPOSE_DELAY_MS): void {
  if (session.timer) clearTimeout(session.timer);
  session.timer = setTimeout(() => {
    sessions.delete(session.sessionId);
  }, delayMs);
  session.timer.unref?.();
}

export function getSshSession(sessionId: string): SshSessionInternal | undefined {
  return sessions.get(sessionId);
}

export function subscribeSsh(
  sessionId: string,
  listener: (event: SshEvent) => void,
): (() => void) | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  session.listeners.add(listener);
  listener({ type: 'snapshot', data: snapshot(session) });
  return () => session.listeners.delete(listener);
}

export function createSshSession(instance: SshInstanceOption): SshSessionInternal {
  const problems = validateSshConfig();
  if (problems.length > 0) throw new Error(problems.join(' | '));

  const cfg = getSshConfig();
  const session: SshSessionInternal = {
    sessionId: randomUUID(),
    instance,
    status: 'connecting',
    output: '',
    startedAt: new Date().toISOString(),
    listeners: new Set(),
  };
  sessions.set(session.sessionId, session);

  const args = ['-tt', '-p', cfg.port, ...cfg.opts, `${cfg.user}@${instance.ip}`];
  const childEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
    TERM: 'xterm-256color',
  };
  delete childEnv.DB_PASSWORD;

  try {
    const child = pty.spawn(cfg.bin, args, {
      name: 'xterm-256color',
      cols: 160,
      rows: 40,
      cwd: process.cwd(),
      env: childEnv,
    });
    session.child = child;

    child.onData((data: string) => {
      session.output = `${session.output}${data}`.slice(-MAX_OUTPUT);
      publish(session, { type: 'output', data: { chunk: data } });
    });

    child.onExit(({ exitCode, signal }) => {
      session.child = undefined;
      const detail = signal ? ` señal ${signal}` : ` código ${exitCode}`;
      if (session.status === 'closed') return;
      if (exitCode === 0 && !signal) {
        setStatus(session, 'closed');
      } else {
        setStatus(session, 'error', `ssh terminó con${detail}.`);
      }
      dispose(session);
    });

    setStatus(session, 'running');
    return session;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    setStatus(session, 'error', message);
    publish(session, { type: 'output', data: { chunk: `[ERROR] ${message}\r\n` } });
    dispose(session, 30_000);
    throw new Error(`No se pudo iniciar ssh: ${message}`);
  }
}

export function writeSsh(sessionId: string, data: string): boolean {
  const session = sessions.get(sessionId);
  if (!session?.child || session.status !== 'running') return false;
  session.child.write(data);
  return true;
}

export function resizeSsh(sessionId: string, cols: number, rows: number): boolean {
  const session = sessions.get(sessionId);
  if (!session?.child) return false;
  const safeCols = Math.min(400, Math.max(20, Math.round(cols)));
  const safeRows = Math.min(200, Math.max(5, Math.round(rows)));
  session.child.resize(safeCols, safeRows);
  return true;
}

export function closeSsh(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  if (session.child) {
    session.child.kill();
    session.child = undefined;
  }
  setStatus(session, 'closed');
  dispose(session, 30_000);
  return true;
}
