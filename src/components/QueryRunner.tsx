import { useEffect, useRef, useState } from 'preact/hooks';
import { downloadTemplate } from '../lib/docx-client';
import { downloadReport } from '../lib/pdf-client';
import { isValidDiskgroup } from '../lib/queries';
import { buildRelationScripts } from '../lib/relation-script';
import type { SshInstanceOption } from '../lib/ssh-shared';
import type { DiskLink, JobSnapshot, JobStatus, QueryMeta, QueryResult } from '../lib/types';
import DiskFreeModal from './DiskFreeModal';
import DiskTemplateModal from './DiskTemplateModal';
import NewDiskgroupModal from './NewDiskgroupModal';
import ReportTable from './ReportTable';
import TerminalPanel from './TerminalPanel';

const statusLabel: Record<JobStatus | 'idle', string> = {
  idle: 'Sin ejecutar',
  running: 'Ejecutando',
  done: 'Finalizado',
  error: 'Error',
  cancelled: 'Cancelado',
};

interface DiskPanel {
  key: string;
  diskgroupName: string;
  jobId?: string;
  loading: boolean;
  result?: QueryResult;
  error: string;
}

interface SavedConnectionOption {
  name: string;
  user: string;
  connect: string;
}

export default function QueryRunner() {
  const [diskgroup, setDiskgroup] = useState('CRQ_123456789');
  const [queries, setQueries] = useState<QueryMeta[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<JobStatus | 'idle'>('idle');
  const [output, setOutput] = useState('');
  const [results, setResults] = useState<QueryResult[]>([]);
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState('');
  const [connectionLabel, setConnectionLabel] = useState('');
  const [diskPanels, setDiskPanels] = useState<DiskPanel[]>([]);
  const [addedDiskgroups, setAddedDiskgroups] = useState<string[]>([]);
  const [newDiskgroups, setNewDiskgroups] = useState<string[]>([]);
  const [activeDiskgroup, setActiveDiskgroup] = useState('');
  const [diskLinks, setDiskLinks] = useState<DiskLink[]>([]);
  const [checkResults, setCheckResults] = useState<QueryResult[]>([]);
  const [checkModalOpen, setCheckModalOpen] = useState(false);
  const [newDiskgroupModalOpen, setNewDiskgroupModalOpen] = useState(false);
  const [diskTemplateModalOpen, setDiskTemplateModalOpen] = useState(false);
  const [savedConnections, setSavedConnections] = useState<SavedConnectionOption[]>([]);
  const [selectedConnection, setSelectedConnection] = useState('');
  const [connectionSearch, setConnectionSearch] = useState('');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [connectionError, setConnectionError] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateError, setTemplateError] = useState('');
  const [sshInstances, setSshInstances] = useState<SshInstanceOption[]>([]);
  const [sshInstanceSearch, setSshInstanceSearch] = useState('');
  const [sshSelectedId, setSshSelectedId] = useState('');
  const [sshInstancesLoading, setSshInstancesLoading] = useState(false);
  const [sshInstancesError, setSshInstancesError] = useState('');
  const [sshLaunching, setSshLaunching] = useState(false);
  const [sshLaunchMessage, setSshLaunchMessage] = useState('');
  const [sshLaunchError, setSshLaunchError] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const detailSourcesRef = useRef<Map<string, EventSource>>(new Map());
  const detailTokensRef = useRef<Map<string, number>>(new Map());
  const pendingOpensRef = useRef<Set<string>>(new Set());

  function patchPanel(key: string, patch: Partial<DiskPanel>): void {
    setDiskPanels((previous) =>
      previous.map((panel) => (panel.key === key ? { ...panel, ...patch } : panel)),
    );
  }

  function upsertCheckResult(result: QueryResult): void {
    setCheckResults((previous) => [
      ...previous.filter((item) => item.id !== result.id),
      result,
    ]);
  }

  function closeCheckResult(id: string): void {
    setCheckResults((previous) => previous.filter((item) => item.id !== id));
  }

  const diskgroupTableNames = Array.from(
    new Set(
      results
        .filter((result) => (result.sourceId ?? result.id) === 'dg_summary')
        .flatMap((result) => result.rows.map((row) => (row.NAME ?? '').trim().toUpperCase()))
        .filter(Boolean),
    ),
  );

  function toggleAddDiskgroup(rawName: string): void {
    const name = rawName.trim().toUpperCase();
    if (!isValidDiskgroup(name)) return;

    if (addedDiskgroups.includes(name)) {
      const remaining = addedDiskgroups.filter((item) => item !== name);
      setAddedDiskgroups(remaining);
      setNewDiskgroups((previous) => previous.filter((item) => item !== name));
      setDiskLinks((previous) => previous.filter((link) => link.diskgroup !== name));
      if (activeDiskgroup === name) setActiveDiskgroup(remaining[remaining.length - 1] ?? '');
      return;
    }

    setAddedDiskgroups([...addedDiskgroups, name]);
    setActiveDiskgroup(name);
  }

  function createNewDiskgroup(rawName: string): void {
    const name = rawName.trim().toUpperCase();
    if (!isValidDiskgroup(name) || addedDiskgroups.includes(name) || diskgroupTableNames.includes(name)) return;

    setAddedDiskgroups([...addedDiskgroups, name]);
    setNewDiskgroups([...newDiskgroups, name]);
    setActiveDiskgroup(name);
    setNewDiskgroupModalOpen(false);
  }

  function removeNewDiskgroup(name: string): void {
    const remaining = addedDiskgroups.filter((item) => item !== name);
    setAddedDiskgroups(remaining);
    setNewDiskgroups((previous) => previous.filter((item) => item !== name));
    setDiskLinks((previous) => previous.filter((link) => link.diskgroup !== name));
    if (activeDiskgroup === name) setActiveDiskgroup(remaining[remaining.length - 1] ?? '');
  }

  function linkDisk(rawPath: string): void {
    const path = rawPath.trim();
    if (!path || !activeDiskgroup || !addedDiskgroups.includes(activeDiskgroup)) return;
    setDiskLinks((previous) =>
      previous.some((link) => link.path === path)
        ? previous
        : [...previous, { diskgroup: activeDiskgroup, path }],
    );
  }

  function unlinkDisk(path: string): void {
    setDiskLinks((previous) => previous.filter((link) => link.path !== path));
  }

  function invalidateDiskRequest(key: string): void {
    detailTokensRef.current.set(key, (detailTokensRef.current.get(key) ?? 0) + 1);
  }

  function closeAllDiskSources(): void {
    for (const source of detailSourcesRef.current.values()) source.close();
    detailSourcesRef.current.clear();
  }

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
      closeAllDiskSources();
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

  async function refreshSshInstances(): Promise<void> {
    setSshInstancesLoading(true);
    setSshInstancesError('');
    setSshLaunchMessage('');
    setSshLaunchError(false);
    try {
      const response = await fetch('/api/ssh/instances');
      const data = (await response.json()) as {
        instances?: SshInstanceOption[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? 'No se pudo leer instancias_ips.json.');

      const list = data.instances ?? [];
      setSshInstances(list);
      setSshSelectedId((previous) =>
        previous && list.some((instance) => instance.id === previous) ? previous : '',
      );
    } catch (cause) {
      setSshInstances([]);
      setSshInstancesError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSshInstancesLoading(false);
    }
  }

  async function openSshConsole(): Promise<void> {
    if (!sshSelectedId || sshLaunching) return;
    setSshLaunching(true);
    setSshLaunchError(false);
    setSshLaunchMessage('Abriendo consola SSH en la terminal del sistema…');
    try {
      const response = await fetch('/api/ssh/launch', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
        body: JSON.stringify({ instanceId: sshSelectedId }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        target?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? 'No se pudo abrir la consola SSH.');
      setSshLaunchMessage(`Consola SSH abierta: ${data.target ?? selectedSshInstance?.label ?? ''}`.trim());
    } catch (cause) {
      setSshLaunchError(true);
      setSshLaunchMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSshLaunching(false);
    }
  }

  useEffect(() => {
    void refreshSshInstances();
  }, []);

  async function refreshConnections(): Promise<void> {
    try {
      const response = await fetch('/api/connections');
      const data = (await response.json()) as {
        connections?: SavedConnectionOption[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? 'No se pudo leer .config.');

      const list = data.connections ?? [];
      setSavedConnections(list);
      setConnectionMessage((previous) =>
        previous.startsWith('Conexión') ? previous : `${list.length} conexión(es) en .config`,
      );
      setConnectionError(false);
    } catch (cause) {
      setConnectionMessage(cause instanceof Error ? cause.message : String(cause));
      setConnectionError(true);
    }
  }

  async function applyConnection(name: string): Promise<void> {
    if (!name) return;
    setConnectionMessage(`Aplicando conexión ${name}…`);
    setConnectionError(false);

    try {
      const response = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
        body: JSON.stringify({ name }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'No se pudo aplicar la conexión.');

      setSelectedConnection(name);
      setConnectionSearch('');
      setConnectionMessage(`Conexión ${name} aplicada`);
      window.dispatchEvent(new Event('dg:settings-changed'));
    } catch (cause) {
      setConnectionMessage(cause instanceof Error ? cause.message : String(cause));
      setConnectionError(true);
    }
  }

  useEffect(() => {
    void refreshConnections();
    window.addEventListener('focus', refreshConnections);
    return () => window.removeEventListener('focus', refreshConnections);
  }, []);

  async function start(): Promise<void> {
    eventSourceRef.current?.close();
    closeAllDiskSources();
    for (const key of detailTokensRef.current.keys()) invalidateDiskRequest(key);
    pendingOpensRef.current.clear();
    setDiskPanels([]);
    setAddedDiskgroups([]);
    setNewDiskgroups([]);
    setActiveDiskgroup('');
    setDiskLinks([]);
    setCheckResults([]);
    setCheckModalOpen(false);
    setNewDiskgroupModalOpen(false);
    setOutput('');
    setResults([]);
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

  function closeDisks(rawName: string): void {
    const key = rawName.trim().toUpperCase();
    invalidateDiskRequest(key);
    detailSourcesRef.current.get(key)?.close();
    detailSourcesRef.current.delete(key);
    pendingOpensRef.current.delete(key);
    setDiskPanels((previous) => previous.filter((panel) => panel.key !== key));
  }

  async function openDisks(rawName: string): Promise<void> {
    const diskgroupName = rawName.trim().toUpperCase();
    if (!isValidDiskgroup(diskgroupName)) return;

    const existing = diskPanels.find((panel) => panel.key === diskgroupName);
    if (pendingOpensRef.current.has(diskgroupName) || existing?.loading) return;
    pendingOpensRef.current.add(diskgroupName);
    const releasePending = () => pendingOpensRef.current.delete(diskgroupName);

    invalidateDiskRequest(diskgroupName);
    const token = detailTokensRef.current.get(diskgroupName)!;
    const isCurrent = () => detailTokensRef.current.get(diskgroupName) === token;

    detailSourcesRef.current.get(diskgroupName)?.close();
    detailSourcesRef.current.delete(diskgroupName);

    setDiskPanels((previous) => {
      const found = previous.find((panel) => panel.key === diskgroupName);
      const fresh: DiskPanel = {
        key: diskgroupName,
        diskgroupName,
        jobId: undefined,
        loading: true,
        result: undefined,
        error: '',
      };
      return found
        ? previous.map((panel) => (panel.key === diskgroupName ? fresh : panel))
        : [...previous, fresh];
    });

    try {
      const response = await fetch('/api/run-disks', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
        body: JSON.stringify({ diskgroupName }),
      });
      if (!isCurrent()) {
        releasePending();
        return;
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? 'No se pudo consultar los discos.');
      }

      const newJobId = data.jobId as string;
      patchPanel(diskgroupName, { jobId: newJobId });

      const source = new EventSource(`/api/stream?jobId=${encodeURIComponent(newJobId)}`);
      detailSourcesRef.current.set(diskgroupName, source);
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        releasePending();
        source.close();
        if (detailSourcesRef.current.get(diskgroupName) === source) {
          detailSourcesRef.current.delete(diskgroupName);
        }
        if (isCurrent()) patchPanel(diskgroupName, { loading: false });
      };

      source.addEventListener('snapshot', (event) => {
        if (settled || !isCurrent()) return;
        const snapshot = JSON.parse((event as MessageEvent<string>).data) as JobSnapshot;
        patchPanel(diskgroupName, {
          result: snapshot.results[0],
          error: snapshot.error ?? '',
        });
        if (snapshot.status !== 'running') finish();
      });

      source.addEventListener('result', (event) => {
        if (settled || !isCurrent()) return;
        const result = JSON.parse((event as MessageEvent<string>).data) as QueryResult;
        patchPanel(diskgroupName, { result });
      });

      source.addEventListener('status', (event) => {
        if (settled || !isCurrent()) return;
        const payload = JSON.parse((event as MessageEvent<string>).data) as {
          status: JobStatus;
          error?: string;
        };
        if (payload.error) patchPanel(diskgroupName, { error: payload.error });
        if (payload.status !== 'running') finish();
      });

      source.addEventListener('done', finish);

      source.onerror = () => {
        if (settled || !isCurrent()) return;
        patchPanel(diskgroupName, { error: 'Se perdió la conexión durante la consulta de discos.' });
        finish();
      };
    } catch (cause) {
      releasePending();
      if (!isCurrent()) return;
      patchPanel(diskgroupName, {
        error: cause instanceof Error ? cause.message : String(cause),
        loading: false,
      });
    }
  }

  function toggleQuery(id: string): void {
    setSelected((previous) =>
      previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id],
    );
  }

  const busy = status === 'running';
  const diskgroupValid = isValidDiskgroup(diskgroup.trim().toUpperCase());
  const loadingDisks = diskPanels.filter((panel) => panel.loading).map((panel) => panel.diskgroupName);
  const allResults = [
    ...results,
    ...diskPanels
      .map((panel) => panel.result)
      .filter((result): result is QueryResult => Boolean(result)),
    ...checkResults,
  ];
  const linkedDiskgroupsByPath: Record<string, string> = {};
  for (const link of diskLinks) linkedDiskgroupsByPath[link.path] = link.diskgroup;
  const relationScripts = buildRelationScripts(diskLinks, addedDiskgroups, newDiskgroups);
  const searchText = connectionSearch.trim().toLowerCase();
  const visibleConnections = searchText
    ? savedConnections.filter((connection) =>
        `${connection.name} ${connection.user} ${connection.connect}`
          .toLowerCase()
          .includes(searchText),
      )
    : savedConnections;
  const sshSearchText = sshInstanceSearch.trim().toLowerCase();
  const visibleSshInstances = sshSearchText
    ? sshInstances.filter((instance) =>
        `${instance.database} ${instance.ambiente} ${instance.host} ${instance.ip}`
          .toLowerCase()
          .includes(sshSearchText),
      )
    : sshInstances;
  const selectedSshInstance = sshInstances.find((instance) => instance.id === sshSelectedId);

  async function buildTemplate(): Promise<void> {
    setTemplateBusy(true);
    setTemplateError('');
    try {
      await downloadTemplate({
        diskgroup: diskgroup.trim().toUpperCase(),
        results: allResults,
        queries,
        links: diskLinks,
        diskgroups: addedDiskgroups,
        newDiskgroups,
      });
    } catch (cause) {
      setTemplateError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setTemplateBusy(false);
    }
  }

  return (
    <main class="layout">
      <section class="panel controls-panel">
        <div class="panel-heading">
          <div>
            <h2>Conexiones</h2>
          </div>
          <span class={`status status--${status}`}>{statusLabel[status]}</span>
        </div>

        <div class="field connection-picker">
          <span>Lista de conexiones (.config)</span>
          <div class="connection-search">
            <span class="connection-search__icon" aria-hidden="true">🔎</span>
            <input
              type="text"
              value={connectionSearch}
              onInput={(event) => setConnectionSearch((event.target as HTMLInputElement).value)}
              placeholder="Nombre, usuario o conexión…"
              disabled={busy}
            />
            <span class="connection-search__count">
              {visibleConnections.length}/{savedConnections.length}
            </span>
          </div>
          <div class="connection-row">
            <div class="select-wrap">
              <select
                value={selectedConnection}
                onChange={(event) => void applyConnection((event.target as HTMLSelectElement).value)}
                disabled={busy}
              >
                <option value="">Selecciona una conexión…</option>
                {visibleConnections.map((connection) => (
                  <option
                    key={connection.name}
                    value={connection.name}
                    title={`${connection.user}@${connection.connect}`}
                  >
                    {connection.name}
                  </option>
                ))}
                {visibleConnections.length === 0 && (
                  <option value="" disabled>Sin coincidencias</option>
                )}
              </select>
              <span class="select-chevron" aria-hidden="true">▾</span>
            </div>
            <button
              type="button"
              class="button button--ghost button--small"
              onClick={() => void refreshConnections()}
              disabled={busy}
              title="Recargar conexiones desde .config"
            >
              ↻
            </button>
          </div>
          <small class={connectionError ? 'hint hint--error' : 'hint'}>
            {connectionMessage || 'Las conexiones se leen de .config.'}
          </small>
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
            placeholder="CRQ_XXXXXXX"
            maxLength={30}
            disabled={busy}
          />
          <small class={diskgroupValid ? 'hint' : 'hint hint--error'}>
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
        {templateError && <p class="alert">{templateError}</p>}

        <div class="actions actions--compact">
          <button
            class="button button--primary"
            onClick={start}
            disabled={busy || !diskgroupValid || selected.length === 0}
            aria-label="Ejecutar consultas"
            title="Ejecutar consultas"
          >
            <span class="button-icon" aria-hidden="true">▶</span>
            <span class="button-label">{busy ? 'Ejecutando…' : 'Ejecutar'}</span>
          </button>
          <button
            class="button button--ghost"
            onClick={cancel}
            disabled={!busy}
            aria-label="Cancelar"
            title="Cancelar"
          >
            <span class="button-icon" aria-hidden="true">■</span>
            <span class="button-label">Cancelar</span>
          </button>
          <button
            class="button button--ghost"
            onClick={() => setCheckModalOpen(true)}
            disabled={busy}
            aria-label="Confirmar disco libre"
            title="Confirmar disco libre"
          >
            <span class="button-icon" aria-hidden="true">✓</span>
            <span class="button-label">Disco libre</span>
          </button>
          <button
            class="button button--download"
            onClick={() => void downloadReport({ diskgroup: diskgroup.trim().toUpperCase(), results: allResults, queries, links: diskLinks, diskgroups: addedDiskgroups, newDiskgroups })}
            disabled={allResults.length === 0}
            aria-label="Descargar PDF"
            title="Descargar PDF"
          >
            <span class="button-icon" aria-hidden="true">↓</span>
            <span class="button-label">PDF</span>
          </button>
          <button
            class="button button--template"
            onClick={() => void buildTemplate()}
            disabled={busy || templateBusy || !diskgroupValid || allResults.length === 0}
            aria-label="Construir template"
            title="Construir template"
          >
            <span class="button-icon" aria-hidden="true">▤</span>
            <span class="button-label">{templateBusy ? 'Construyendo…' : 'Template'}</span>
          </button>
          <button
            class="button button--template"
            onClick={() => setDiskTemplateModalOpen(true)}
            aria-label="Plantilla disco"
            title="Plantilla disco"
          >
            <span class="button-icon" aria-hidden="true">📋</span>
            <span class="button-label">Plantilla disco</span>
          </button>
        </div>
      </section>

      <div class="side-column">
        <section class="panel terminal-panel">
          <div class="panel-heading">
            <div>
              <h2>Terminal</h2>
              <p>SQLcl / SQL*Plus.</p>
            </div>
          </div>
          <TerminalPanel output={output} />
        </section>

        <section class="panel ssh-panel">
          <div class="panel-heading">
            <div>
              <h2>Consola SSH</h2>
            </div>
          </div>

          <div class="field ssh-picker">
            <span>Instancia SSH (instancias_ips.json)</span>
            <div class="connection-search">
              <span class="connection-search__icon" aria-hidden="true">🔎</span>
              <input
                type="text"
                value={sshInstanceSearch}
                onInput={(event) => setSshInstanceSearch((event.target as HTMLInputElement).value)}
                placeholder="Base, ambiente, host o IP…"
              />
              <span class="connection-search__count">
                {visibleSshInstances.length}/{sshInstances.length}
              </span>
            </div>
            <div class="connection-row">
              <div class="select-wrap">
                <select
                  value={sshSelectedId}
                  onChange={(event) => setSshSelectedId((event.target as HTMLSelectElement).value)}
                >
                  <option value="">Selecciona una instancia…</option>
                  {visibleSshInstances.map((instance) => (
                    <option key={instance.id} value={instance.id} title={instance.label}>
                      {instance.label}
                    </option>
                  ))}
                  {visibleSshInstances.length === 0 && (
                    <option value="" disabled>Sin coincidencias</option>
                  )}
                </select>
                <span class="select-chevron" aria-hidden="true">▾</span>
              </div>
              <button
                type="button"
                class="button button--ghost button--small"
                onClick={() => void refreshSshInstances()}
                disabled={sshInstancesLoading}
                title="Recargar instancias desde instancias_ips.json"
              >
                ↻
              </button>
            </div>
            <small class={sshInstancesError || sshLaunchError ? 'hint hint--error' : 'hint'}>
              {sshInstancesError ||
                sshLaunchMessage ||
                'Selecciona la base, ambiente e IP concretos para abrir la consola SSH en una terminal nativa.'}
            </small>
            <button
              type="button"
              class="button button--ghost button--ssh"
              onClick={() => void openSshConsole()}
              disabled={!sshSelectedId || !selectedSshInstance || sshLaunching}
            >
              {sshLaunching ? 'Abriendo consola…' : 'Abrir consola SSH'}
            </button>
          </div>
        </section>

        <section class="panel relations-panel">
          <div class="panel-heading">
            <div>
              <h2>Relaciones</h2>
              <p>Diskgroup → disco candidato.</p>
            </div>
          </div>

          {addedDiskgroups.length === 0 ? (
            <div class="empty-state relations-empty">
              <strong>Sin diskgroups añadidos</strong>
              <span>Pulsa Add en la tabla 1. Diskgroups ASM o usa «Pedir un diskgroup nuevo».</span>
            </div>
          ) : (
            <div class="relations-list">
              {addedDiskgroups.map((name) => {
                const rows = diskLinks.filter((link) => link.diskgroup === name);
                const isActive = name === activeDiskgroup;
                return (
                  <div class={isActive ? 'relation-group is-active' : 'relation-group'} key={name}>
                    <div class="relation-group__heading">
                      <button
                        type="button"
                        class="relation-group__title"
                        title={isActive ? 'Diskgroup activo para Enlazar' : `Usar ${name} como destino de Enlazar`}
                        onClick={() => setActiveDiskgroup(name)}
                      >
                        <span class="relation-group__marker" aria-hidden="true">◆</span>
                        <strong>{name}</strong>
                        {newDiskgroups.includes(name) && (
                          <span class="relation-group__badge relation-group__badge--new">nuevo</span>
                        )}
                        {isActive && <span class="relation-group__badge">activo</span>}
                      </button>
                      {newDiskgroups.includes(name) ? (
                        <button
                          type="button"
                          class="relation-group__remove"
                          aria-label={`Quitar el diskgroup nuevo ${name}`}
                          title={`Quitar ${name} y sus relaciones`}
                          onClick={() => removeNewDiskgroup(name)}
                        >
                          ✕
                        </button>
                      ) : null}
                    </div>
                    {rows.length === 0 ? (
                      <p class="relation-empty">Sin discos enlazados.</p>
                    ) : (
                      <ul class="relation-rows">
                        {rows.map((link) => (
                          <li class="relation-row" key={link.path}>
                            <span aria-hidden="true">→</span>
                            <code>{link.path}</code>
                            <button
                              type="button"
                              class="relation-remove"
                              aria-label={`Desenlazar ${link.path}`}
                              title={`Desenlazar ${link.path}`}
                              onClick={() => unlinkDisk(link.path)}
                            >
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {relationScripts.length > 0 && (
            <div class="relation-scripts">
              <span class="relation-scripts__label">Script autogenerado</span>
              <code>{relationScripts.join('\n')}</code>
            </div>
          )}
        </section>
      </div>

      <ReportTable
        results={results}
        queries={queries}
        onShowDisks={(name) => void openDisks(name)}
        onAddDiskgroup={toggleAddDiskgroup}
        onRequestNewDiskgroup={() => setNewDiskgroupModalOpen(true)}
        onLinkDisk={linkDisk}
        addedDiskgroups={addedDiskgroups}
        linkedDiskgroupsByPath={linkedDiskgroupsByPath}
        loadingDisks={loadingDisks}
      />

      {diskPanels.map((panel) => (
        <ReportTable
          key={panel.key}
          results={panel.result ? [panel.result] : []}
          queries={queries}
          title={`Discos del diskgroup ${panel.diskgroupName}`}
          hideQueryHeader
          notice={panel.error || (panel.loading ? 'Consultando discos…' : undefined)}
          noticeVariant={panel.error ? 'error' : panel.loading ? 'info' : undefined}
          onClose={() => closeDisks(panel.diskgroupName)}
          closeLabel={`Cerrar discos del diskgroup ${panel.diskgroupName}`}
        />
      ))}

      {checkResults.map((result) => (
        <ReportTable
          key={result.id}
          results={[result]}
          queries={queries}
          title={result.title}
          hideQueryHeader
          onClose={() => closeCheckResult(result.id)}
          closeLabel={`Quitar ${result.title} del reporte`}
        />
      ))}

      <DiskFreeModal
        open={checkModalOpen}
        onClose={() => setCheckModalOpen(false)}
        onResult={upsertCheckResult}
      />

      <DiskTemplateModal
        open={diskTemplateModalOpen}
        onClose={() => setDiskTemplateModalOpen(false)}
      />

      <NewDiskgroupModal
        open={newDiskgroupModalOpen}
        existingNames={addedDiskgroups}
        tableNames={diskgroupTableNames}
        onClose={() => setNewDiskgroupModalOpen(false)}
        onConfirm={createNewDiskgroup}
      />
    </main>
  );
}
