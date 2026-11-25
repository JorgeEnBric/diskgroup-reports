import { useEffect, useRef, useState } from 'preact/hooks';
import { downloadReport } from '../lib/pdf-client';
import { isValidDiskgroup } from '../lib/queries';
import type { JobSnapshot, JobStatus, QueryMeta, QueryResult } from '../lib/types';
import ReportTable from './ReportTable';
import TerminalPanel from './TerminalPanel';

const statusLabel: Record<JobStatus | 'idle', string> = {
  idle: 'Sin ejecutar',
  running: 'Ejecutando',
  done: 'Finalizado',
  error: 'Error',
  cancelled: 'Cancelado',
};

export default function QueryRunner() {
  const [diskgroup, setDiskgroup] = useState('DATA');
  const [queries, setQueries] = useState<QueryMeta[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<JobStatus | 'idle'>('idle');
  const [output, setOutput] = useState('');
  const [results, setResults] = useState<QueryResult[]>([]);
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState('');
  const [connectionLabel, setConnectionLabel] = useState('');
  const [detailResults, setDetailResults] = useState<QueryResult[]>([]);
  const [detailError, setDetailError] = useState('');
  const [loadingDisks, setLoadingDisks] = useState<string[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const detailSourcesRef = useRef<Set<EventSource>>(new Set());

  useEffect(() => {
    let active = true;
    fetch('/api/queries')
      .then((response) => response.json())
      .then((data: { queries: QueryMeta[] }) => {
        if (!active) return;
        setQueries(data.queries);
        setSelected(data.queries.filter((query) => !query.hidden).map((query) => query.id));
      })
      .catch(() => {
        if (active) setError('No se pudo cargar el catálogo de consultas.');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () => () => {
      eventSourceRef.current?.close();
      for (const source of detailSourcesRef.current) source.close();
      detailSourcesRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    let active = true;

    const load = () => {
      fetch('/api/settings')
        .then((response) => response.json())
        .then((data: { connectionLabel: string }) => {
          if (active) setConnectionLabel(data.connectionLabel);
        })
        .catch(() => undefined);
    };

    load();
    window.addEventListener('dg:settings-changed', load);
    return () => {
      active = false;
      window.removeEventListener('dg:settings-changed', load);
    };
  }, []);

  async function start(): Promise<void> {
    eventSourceRef.current?.close();
    setOutput('');
    setResults([]);
    setDetailResults([]);
    setDetailError('');
    setError('');
    setJobId('');
    setStatus('running');

    try {
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
        body: JSON.stringify({ diskgroup, queryIds: selected }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? 'No se pudo iniciar la ejecución.');
      }

      const id = data.jobId as string;
      setJobId(id);

      const source = new EventSource(`/api/stream?jobId=${encodeURIComponent(id)}`);
      eventSourceRef.current = source;

      source.addEventListener('snapshot', (event) => {
        const snapshot = JSON.parse((event as MessageEvent<string>).data) as JobSnapshot;
        setStatus(snapshot.status);
        setOutput(snapshot.output);
        setResults(snapshot.results);
        setError(snapshot.error ?? '');
        if (snapshot.status !== 'running') source.close();
      });

      source.addEventListener('output', (event) => {
        const payload = JSON.parse((event as MessageEvent<string>).data) as { chunk: string };
        setOutput((previous) => previous + payload.chunk);
      });

      source.addEventListener('result', (event) => {
        const result = JSON.parse((event as MessageEvent<string>).data) as QueryResult;
        setResults((previous) => [...previous, result]);
      });

      source.addEventListener('status', (event) => {
        const payload = JSON.parse((event as MessageEvent<string>).data) as {
          status: JobStatus;
          error?: string;
        };
        setStatus(payload.status);
        setError(payload.error ?? '');
        if (payload.status !== 'running') source.close();
      });

      source.addEventListener('done', () => source.close());

      source.onerror = () => {
        source.close();
        setError((previous) => previous || 'Se perdió la conexión con el servidor.');
      };
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus('error');
    }
  }

  async function cancel(): Promise<void> {
    if (!jobId) return;
    await fetch('/api/cancel', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
      body: JSON.stringify({ jobId }),
    }).catch(() => undefined);
  }

  async function openDisks(rawName: string): Promise<void> {
    const diskgroupName = rawName.trim().toUpperCase();
    if (!isValidDiskgroup(diskgroupName) || loadingDisks.includes(diskgroupName)) return;

    setDetailError('');
    setLoadingDisks((previous) => [...previous, diskgroupName]);

    try {
      const response = await fetch('/api/run-disks', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
        body: JSON.stringify({ diskgroupName }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? 'No se pudo consultar los discos.');
      }

      const source = new EventSource(`/api/stream?jobId=${encodeURIComponent(data.jobId as string)}`);
      detailSourcesRef.current.add(source);

      const finish = () => {
        source.close();
        detailSourcesRef.current.delete(source);
        setLoadingDisks((previous) => previous.filter((name) => name !== diskgroupName));
      };

      source.addEventListener('snapshot', (event) => {
        const snapshot = JSON.parse((event as MessageEvent<string>).data) as JobSnapshot;
        setDetailResults((previous) => [
          ...previous.filter((result) => !snapshot.results.some((item) => item.id === result.id)),
          ...snapshot.results,
        ]);
        if (snapshot.error) setDetailError(snapshot.error);
        if (snapshot.status !== 'running') finish();
      });

      source.addEventListener('result', (event) => {
        const result = JSON.parse((event as MessageEvent<string>).data) as QueryResult;
        setDetailResults((previous) => [...previous.filter((item) => item.id !== result.id), result]);
      });

      source.addEventListener('status', (event) => {
        const payload = JSON.parse((event as MessageEvent<string>).data) as {
          status: JobStatus;
          error?: string;
        };
        if (payload.error) setDetailError(payload.error);
        if (payload.status !== 'running') finish();
      });

      source.addEventListener('done', finish);
      source.onerror = () => {
        setDetailError('Se perdió la conexión durante la consulta de discos.');
        finish();
      };
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : String(cause));
      setLoadingDisks((previous) => previous.filter((name) => name !== diskgroupName));
    }
  }

  function toggleQuery(id: string): void {
    setSelected((previous) =>
      previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id],
    );
  }

  const busy = status === 'running';
  const diskgroupValid = isValidDiskgroup(diskgroup.trim().toUpperCase());
  const allResults = [...results, ...detailResults];

  return (
    <main class="layout">
      <section class="panel controls-panel">
        <div class="panel-heading">
          <div>
            <h2>Consultas a ejecutar</h2>
            <p>Define la etiqueta del informe y selecciona las consultas maestras.</p>
          </div>
          <span class={`status status--${status}`}>{statusLabel[status]}</span>
        </div>

        {connectionLabel && (
          <div class="connection-info">
            <span>Conexión activa</span>
            <code>{connectionLabel}</code>
          </div>
        )}

        <label class="field">
          <span>Etiqueta del informe</span>
          <input
            type="text"
            value={diskgroup}
            onInput={(event) => setDiskgroup((event.target as HTMLInputElement).value.toUpperCase())}
            placeholder="DATA"
            maxLength={30}
            disabled={busy}
          />
          <small class={diskgroupValid ? 'hint' : 'hint hint--error'}>
            Las consultas maestras son globales; esta etiqueta solo identifica el reporte. Solo letras, números y guion bajo (máx. 30).
          </small>
        </label>

        <div class="field">
          <span>Consultas maestras</span>
          <div class="query-list">
            {queries.filter((query) => !query.hidden).map((query) => (
              <label class="query-option" key={query.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(query.id)}
                  onChange={() => toggleQuery(query.id)}
                  disabled={busy}
                />
                <span>
                  <strong>{query.title}</strong>
                  <small>{query.description}</small>
                </span>
              </label>
            ))}
          </div>
        </div>

        {error && <p class="alert">{error}</p>}

        <div class="actions">
          <button class="button button--primary" onClick={start} disabled={busy || !diskgroupValid || selected.length === 0}>
            {busy ? 'Ejecutando…' : 'Ejecutar consultas'}
          </button>
          <button class="button button--ghost" onClick={cancel} disabled={!busy}>
            Cancelar
          </button>
          <button
            class="button button--download"
            onClick={() => void downloadReport({ diskgroup: diskgroup.trim().toUpperCase(), results: allResults, queries })}
            disabled={allResults.length === 0}
          >
            Descargar PDF
          </button>
        </div>
      </section>

      <section class="panel terminal-panel">
        <div class="panel-heading">
          <div>
            <h2>Terminal</h2>
            <p>Salida en vivo de SQLcl / SQL*Plus.</p>
          </div>
        </div>
        <TerminalPanel output={output} />
      </section>

      <ReportTable
        results={results}
        queries={queries}
        onShowDisks={(name) => void openDisks(name)}
        loadingDisks={loadingDisks}
      />

      {(detailResults.length > 0 || loadingDisks.length > 0 || detailError) && (
        <ReportTable
          results={detailResults}
          queries={queries}
          title="Discos del diskgroup"
          notice={detailError || (loadingDisks.length > 0 ? 'Consultando discos…' : undefined)}
        />
      )}
    </main>
  );
}
