import { useEffect, useRef, useState } from 'preact/hooks';
import type { SshInstanceOption, SshSessionStatus, SshSnapshot } from '../lib/ssh-shared';
import SshTerminal from './SshTerminal';

interface Props {
  open: boolean;
  instance?: SshInstanceOption;
  onClose: () => void;
}

type ViewStatus = SshSessionStatus | 'idle';

const statusText: Record<ViewStatus, string> = {
  idle: 'Sin conexión',
  connecting: 'Conectando…',
  running: 'Conectado',
  closed: 'Cerrada',
  error: 'Error',
};

const statusClass: Record<ViewStatus, string> = {
  idle: '',
  connecting: 'running',
  running: 'done',
  closed: 'cancelled',
  error: 'error',
};

async function postJson<T>(path: string, body: unknown, keepalive = false): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
    body: JSON.stringify(body),
    keepalive,
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? 'No se pudo completar la petición.');
  return data;
}

function closeRequest(sessionId: string, keepalive = false): void {
  void postJson('/api/ssh/close', { sessionId }, keepalive).catch(() => undefined);
}

export default function SshConsoleModal({ open, instance, onClose }: Props) {
  const [status, setStatus] = useState<ViewStatus>('idle');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState('');
  const sourceRef = useRef<EventSource | null>(null);
  const activeIdRef = useRef('');
  const tokenRef = useRef(0);
  const inputChainRef = useRef<Promise<void>>(Promise.resolve());

  function stop(closeRemote: boolean): void {
    tokenRef.current += 1;
    sourceRef.current?.close();
    sourceRef.current = null;
    const id = activeIdRef.current;
    activeIdRef.current = '';
    inputChainRef.current = Promise.resolve();
    setSessionId('');
    if (closeRemote && id) closeRequest(id, true);
  }

  useEffect(() => {
    if (open && instance) return;
    stop(true);
    setStatus('idle');
    setOutput('');
    setError('');
  }, [open, instance?.id]);

  useEffect(() => {
    if (!open || !instance) return;
    void connect();
  }, [open, instance?.id]);

  useEffect(
    () => () => {
      stop(true);
    },
    [],
  );

  useEffect(() => {
    const onUnload = () => {
      if (activeIdRef.current) closeRequest(activeIdRef.current, true);
    };
    globalThis.addEventListener('beforeunload', onUnload);
    return () => globalThis.removeEventListener('beforeunload', onUnload);
  }, []);

  async function connect(): Promise<void> {
    stop(true);
    const token = tokenRef.current;
    if (!instance) return;

    setStatus('connecting');
    setOutput('');
    setError('');

    try {
      const data = await postJson<{ sessionId: string }>('/api/ssh/sessions', {
        instanceId: instance.id,
      });
      if (token !== tokenRef.current || !open) {
        closeRequest(data.sessionId);
        return;
      }

      const id = data.sessionId;
      activeIdRef.current = id;
      setSessionId(id);

      const source = new EventSource(`/api/ssh/stream?sessionId=${encodeURIComponent(id)}`);
      sourceRef.current = source;
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        source.close();
        if (sourceRef.current === source) sourceRef.current = null;
      };

      source.addEventListener('snapshot', (event) => {
        if (settled || token !== tokenRef.current) return;
        const snapshot = JSON.parse((event as MessageEvent<string>).data) as SshSnapshot;
        setOutput(snapshot.output);
        setStatus(snapshot.status);
        setError(snapshot.error ?? '');
        if (snapshot.status === 'closed' || snapshot.status === 'error') finish();
      });

      source.addEventListener('output', (event) => {
        if (settled || token !== tokenRef.current) return;
        const payload = JSON.parse((event as MessageEvent<string>).data) as { chunk: string };
        setOutput((previous) => previous + payload.chunk);
      });

      source.addEventListener('status', (event) => {
        if (settled || token !== tokenRef.current) return;
        const payload = JSON.parse((event as MessageEvent<string>).data) as {
          status: SshSessionStatus;
          error?: string;
        };
        setStatus(payload.status);
        setError(payload.error ?? '');
        if (payload.status === 'closed' || payload.status === 'error') finish();
      });

      source.addEventListener('done', finish);

      source.onerror = () => {
        if (settled || token !== tokenRef.current) return;
        setError('Se perdió la conexión con la consola SSH.');
        finish();
      };
    } catch (cause) {
      if (token !== tokenRef.current) return;
      setStatus('error');
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function sendInput(data: string): void {
    const id = activeIdRef.current;
    if (!id) return;
    inputChainRef.current = inputChainRef.current
      .then(async () => {
        await postJson('/api/ssh/input', { sessionId: id, data }, true);
      })
      .catch(() => undefined);
  }

  function sendResize(cols: number, rows: number): void {
    const id = activeIdRef.current;
    if (!id) return;
    void postJson('/api/ssh/resize', { sessionId: id, cols, rows }, true).catch(() => undefined);
  }

  if (!open) return null;

  return (
    <div
      class="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div class="modal modal--ssh" role="dialog" aria-modal="true" aria-label="Consola SSH">
        <div class="modal-header">
          <div>
            <h2>Consola SSH</h2>
            <p>{instance?.label ?? 'Sin instancia seleccionada'}</p>
          </div>
          <button type="button" class="modal-close" onClick={onClose} title="Cerrar consola SSH">
            ✕
          </button>
        </div>

        <div class="ssh-console__meta">
          <span class={`status status--${statusClass[status]}`}>{statusText[status]}</span>
          <span class="ssh-console__target">
            {instance ? `${instance.host} · ${instance.ip}` : '—'}
          </span>
        </div>

        <div class="modal-body ssh-console__body">
          {error && <p class="alert">{error}</p>}
          <p class="ssh-console__hint">
            Escribe la contraseña directamente en la terminal cuando `ssh` la solicite. No se guarda en la aplicación.
          </p>
          <SshTerminal
            sessionId={sessionId}
            output={output}
            title={`ssh ${instance?.ip ?? ''}`}
            onInput={sendInput}
            onResize={sendResize}
          />
        </div>

        <div class="modal-footer">
          <button type="button" class="button button--ghost" onClick={() => void connect()}>
            Reconectar
          </button>
          <button type="button" class="button button--ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
