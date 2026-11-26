import { useEffect, useRef, useState } from 'preact/hooks';
import { isValidDiskName } from '../lib/queries';
import type { JobSnapshot, JobStatus, QueryResult } from '../lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onResult: (result: QueryResult) => void;
}

const columns = [
  { key: 'NOTA', label: 'Nota' },
  { key: 'NAME', label: 'Disco' },
  { key: 'PATH', label: 'Path' },
  { key: 'MOUNT_STATUS', label: 'Mount' },
];

async function cancelJob(jobId: string): Promise<void> {
  await fetch('/api/cancel', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
    body: JSON.stringify({ jobId }),
  }).catch(() => undefined);
}

export default function DiskFreeModal({ open, onClose, onResult }: Props) {
  const [diskName, setDiskName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const activeJobRef = useRef('');
  const tokenRef = useRef(0);

  function stopActive(cancel: boolean): void {
    tokenRef.current += 1;
    const jobId = activeJobRef.current;
    sourceRef.current?.close();
    sourceRef.current = null;
    activeJobRef.current = '';
    if (cancel && jobId) void cancelJob(jobId);
    setLoading(false);
  }

  useEffect(() => {
    if (open) return;
    stopActive(true);
    setDiskName('');
    setError('');
    setResult(null);
  }, [open]);

  useEffect(
    () => () => {
      stopActive(false);
    },
    [],
  );

  async function check(): Promise<void> {
    const normalized = diskName.trim().toUpperCase();
    if (!isValidDiskName(normalized)) {
      setError('Nombre de disco inválido. Usa solo letras, números y guion bajo (máx. 30).');
      return;
    }

    stopActive(false);
    const token = tokenRef.current;
    setError('');
    setResult(null);
    setLoading(true);

    try {
      const response = await fetch('/api/check-disk-free', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
        body: JSON.stringify({ diskName: normalized }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? 'No se pudo iniciar la comprobación.');
      }

      const jobId = data.jobId as string;
      if (token !== tokenRef.current) {
        await cancelJob(jobId);
        return;
      }
      activeJobRef.current = jobId;

      const source = new EventSource(`/api/stream?jobId=${encodeURIComponent(jobId)}`);
      sourceRef.current = source;
      let settled = false;

      const applyResult = (incoming: QueryResult) => {
        if (settled || token !== tokenRef.current) return;
        setResult(incoming);
        onResult(incoming);
      };

      const finish = () => {
        if (settled) return;
        settled = true;
        source.close();
        if (sourceRef.current === source) sourceRef.current = null;
        activeJobRef.current = '';
        if (token === tokenRef.current) setLoading(false);
      };

      source.addEventListener('snapshot', (event) => {
        if (settled || token !== tokenRef.current) return;
        const snapshot = JSON.parse((event as MessageEvent<string>).data) as JobSnapshot;
        if (snapshot.results[0]) applyResult(snapshot.results[0]);
        if (snapshot.error) setError(snapshot.error);
        if (snapshot.status !== 'running') finish();
      });

      source.addEventListener('result', (event) => {
        if (settled || token !== tokenRef.current) return;
        applyResult(JSON.parse((event as MessageEvent<string>).data) as QueryResult);
      });

      source.addEventListener('status', (event) => {
        if (settled || token !== tokenRef.current) return;
        const payload = JSON.parse((event as MessageEvent<string>).data) as {
          status: JobStatus;
          error?: string;
        };
        if (payload.error) setError(payload.error);
        if (payload.status !== 'running') finish();
      });

      source.addEventListener('done', finish);

      source.onerror = () => {
        if (settled || token !== tokenRef.current) return;
        setError('Se perdió la conexión durante la comprobación.');
        finish();
      };
    } catch (cause) {
      if (token !== tokenRef.current) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setLoading(false);
    }
  }

  if (!open) return null;

  const normalized = diskName.trim().toUpperCase();
  const valid = isValidDiskName(normalized);
  const exists = Boolean(result?.rows.some((row) => row.NOTA === 'DISCO YA EXISTE!!!'));

  return (
    <div
      class="modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="disk-free-title"
      >
        <div class="modal-header">
          <div>
            <h2 id="disk-free-title">Confirmar disco libre</h2>
            <p>Consulta V$ASM_DISK por nombre de disco.</p>
          </div>
          <button type="button" class="modal-close" aria-label="Cerrar" onClick={onClose}>
            ✕
          </button>
        </div>

        <div class="modal-body">
          <label class="field">
            <span>Nombre del disco</span>
            <input
              type="text"
              value={diskName}
              onInput={(event) => setDiskName((event.target as HTMLInputElement).value.toUpperCase())}
              placeholder="DISCO_1"
              maxLength={30}
              disabled={loading}
            />
            <small class={valid || diskName.trim() === '' ? 'hint' : 'hint hint--error'}>
              Solo letras, números y guion bajo (máx. 30 caracteres).
            </small>
          </label>

          {error && <p class="alert">{error}</p>}

          {result ? (
            exists ? (
              <>
                <p class="notice notice--error">DISCO YA EXISTE!!!</p>
                <br />
                <br />
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {columns.map((column) => (
                          <th key={column.key}>{column.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, index) => (
                        <tr key={index}>
                          {columns.map((column) => (
                            <td key={column.key}>{row[column.key] || '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p class="notice notice--ok">
                {result.error || `Disco consultado ${normalized}, es un disco libre`}
              </p>
            )
          ) : null}

          {loading && <p class="notice notice--info">Consultando…</p>}
        </div>

        <div class="modal-footer">
          <button
            type="button"
            class="button button--primary"
            onClick={() => void check()}
            disabled={loading || !valid}
          >
            {loading ? 'Consultando…' : 'Consultar'}
          </button>
          <button type="button" class="button button--ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
