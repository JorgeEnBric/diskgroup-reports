import { useEffect, useRef, useState } from 'preact/hooks';
import { buildCandidateCopyText } from '../lib/candidate-copy';
import type { QueryMeta, QueryResult } from '../lib/types';

type NoticeVariant = 'ok' | 'error' | 'info';

interface Props {
  results: QueryResult[];
  queries: QueryMeta[];
  onShowDisks?: (diskgroupName: string) => void;
  onAddDiskgroup?: (diskgroupName: string) => void;
  onRequestNewDiskgroup?: () => void;
  onLinkDisk?: (path: string) => void;
  addedDiskgroups?: string[];
  linkedDiskgroupsByPath?: Record<string, string>;
  loadingDisks?: string[];
  title?: string;
  notice?: string;
  noticeVariant?: NoticeVariant;
  hideQueryHeader?: boolean;
  onClose?: () => void;
  closeLabel?: string;
}

function noticeClass(variant?: NoticeVariant): string {
  return variant ? `notice notice--${variant}` : 'notice';
}

export default function ReportTable({
  results,
  queries,
  onShowDisks,
  onAddDiskgroup,
  onRequestNewDiskgroup,
  onLinkDisk,
  addedDiskgroups = [],
  linkedDiskgroupsByPath = {},
  loadingDisks = [],
  title = 'Resultado del reporte',
  notice,
  noticeVariant,
  hideQueryHeader = false,
  onClose,
  closeLabel = 'Cerrar sección',
}: Props) {
  const [copiedKey, setCopiedKey] = useState('');
  const [copyErrorKey, setCopyErrorKey] = useState('');
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    },
    [],
  );

  async function copyCandidateFunction(path: string, key: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(buildCandidateCopyText(path));
      setCopiedKey(key);
      setCopyErrorKey('');
    } catch {
      setCopiedKey('');
      setCopyErrorKey(key);
    }

    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => {
      setCopiedKey('');
      setCopyErrorKey('');
    }, 2000);
  }

  const closeButton = onClose ? (
    <button
      type="button"
      class="panel-close"
      aria-label={closeLabel}
      title={closeLabel}
      onClick={onClose}
    >
      <span aria-hidden="true">✕</span>
    </button>
  ) : null;

  if (results.length === 0) {
    return (
      <section class="panel report-panel">
        <div class="report-header">
          <div>
            <h2>{title}</h2>
            <p>Sin resultados todavía</p>
          </div>
          {closeButton}
        </div>
        {notice ? (
          <p class={noticeClass(noticeVariant)}>{notice}</p>
        ) : (
          <div class="empty-state">
            <strong>Sin resultados todavía</strong>
            <span>Ejecuta las consultas para generar el reporte.</span>
          </div>
        )}
      </section>
    );
  }

  return (
    <section class="panel report-panel">
      <div class="report-header">
        <div>
          <h2>{title}</h2>
          <p>{results.length} consulta(s) ejecutada(s)</p>
        </div>
        {closeButton}
      </div>

      {notice && <p class={noticeClass(noticeVariant)}>{notice}</p>}

      {results.map((result) => {
        const meta = queries.find((query) => query.id === (result.sourceId ?? result.id));
        const columns = meta?.columns
          ?? Object.keys(result.rows[0] ?? {})
            .filter((key) => key !== '__status')
            .map((key) => ({ key, label: key, kind: undefined }));

        const sourceId = result.sourceId ?? result.id;
        const showDiskAction = sourceId === 'dg_summary';
        const showCopyFunction = sourceId === 'dg_disks';
        const isDiskCheck = sourceId === 'disk_free_check';
        const diskExists = result.rows.some((row) => row.NOTA === 'DISCO YA EXISTE!!!');
        const resultNotice = result.error ?? (isDiskCheck && diskExists ? 'DISCO YA EXISTE!!!' : undefined);
        let resultNoticeVariant: NoticeVariant | undefined = noticeVariant;
        if (isDiskCheck) resultNoticeVariant = diskExists ? 'error' : 'ok';

        return (
          <article class="query-block" key={result.id}>
            {!hideQueryHeader && (
              <header class="query-block-header">
                <h3>{result.title}</h3>
                <div class="query-block-meta">
                  <small>{result.rows.length} filas · {result.durationMs} ms</small>
                  {sourceId === 'dg_summary' && onRequestNewDiskgroup ? (
                    <button
                      type="button"
                      class="action-link action-link--new"
                      title="Pedir un diskgroup nuevo"
                      onClick={onRequestNewDiskgroup}
                    >
                      <span aria-hidden="true">＋</span>
                      Pedir un diskgroup nuevo
                    </button>
                  ) : null}
                </div>
              </header>
            )}

            {resultNotice && <p class={noticeClass(resultNoticeVariant)}>{resultNotice}</p>}

            {result.rows.length > 0 ? (
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {columns.map((column) => (
                        <th key={column.key}>{column.label}</th>
                      ))}
                      <th>ACCION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, index) => {
                      const diskgroupName = (row.NAME ?? '').trim().toUpperCase();
                      const diskPath = (row.PATH ?? '').trim();
                      const rowKey = `${result.id}:${index}`;
                      const isLoading = loadingDisks.includes(diskgroupName);
                      const isAdded = addedDiskgroups.includes(diskgroupName);
                      const linkOwner = diskPath ? linkedDiskgroupsByPath[diskPath] : undefined;
                      const canLink = addedDiskgroups.length > 0;
                      const hasVerDiscos = showDiskAction && Boolean(onShowDisks) && Boolean(diskgroupName);
                      const hasAdd = showDiskAction && Boolean(onAddDiskgroup) && Boolean(diskgroupName);
                      const hasCopy = showCopyFunction;
                      const hasLink = showCopyFunction && Boolean(onLinkDisk);

                      return (
                        <tr key={index}>
                          {columns.map((column) => (
                            <td key={column.key}>{row[column.key] || '—'}</td>
                          ))}
                          <td>
                            <div class="action-cell">
                              {hasVerDiscos ? (
                                <button
                                  type="button"
                                  class="action-link"
                                  disabled={isLoading}
                                  title={`Ver discos del diskgroup ${diskgroupName}`}
                                  onClick={() => onShowDisks!(diskgroupName)}
                                >
                                  <span aria-hidden="true">🔍</span>
                                  {isLoading ? 'Consultando…' : 'Ver discos'}
                                </button>
                              ) : null}

                              {hasAdd ? (
                                <button
                                  type="button"
                                  class={isAdded ? 'action-link action-link--add is-active' : 'action-link action-link--add'}
                                  aria-pressed={isAdded}
                                  title={
                                    isAdded
                                      ? `Quitar ${diskgroupName} y sus relaciones`
                                      : `Añadir ${diskgroupName} a las relaciones`
                                  }
                                  onClick={() => onAddDiskgroup!(diskgroupName)}
                                >
                                  <span aria-hidden="true">{isAdded ? '✓' : '＋'}</span>
                                  Add
                                </button>
                              ) : null}

                              {hasCopy ? (
                                <button
                                  type="button"
                                  class="action-link action-link--copy"
                                  disabled={!diskPath}
                                  title={diskPath ? `Copiar función para ${diskPath}` : 'Sin PATH para copiar'}
                                  onClick={() => void copyCandidateFunction(diskPath, rowKey)}
                                >
                                  <span aria-hidden="true">📋</span>
                                  {copiedKey === rowKey
                                    ? 'Copiado ✓'
                                    : copyErrorKey === rowKey
                                      ? 'No se pudo copiar'
                                      : 'Copiar función'}
                                </button>
                              ) : null}

                              {hasLink ? (
                                <button
                                  type="button"
                                  class="action-link action-link--link"
                                  disabled={!diskPath || !canLink || Boolean(linkOwner)}
                                  title={
                                    !diskPath
                                      ? 'Sin PATH para enlazar'
                                      : !canLink
                                        ? 'Añade un diskgroup con Add para enlazar'
                                        : linkOwner
                                          ? `Ya enlazado a ${linkOwner}`
                                          : `Enlazar ${diskPath} al diskgroup activo`
                                  }
                                  onClick={() => onLinkDisk!(diskPath)}
                                >
                                  <span aria-hidden="true">🔗</span>
                                  Enlazar
                                </button>
                              ) : null}

                              {!hasVerDiscos && !hasAdd && !hasCopy && !hasLink ? (
                                <span class="action-empty">—</span>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <br></br>
            )}
          </article>
        );
      })}
    </section>
  );
}
