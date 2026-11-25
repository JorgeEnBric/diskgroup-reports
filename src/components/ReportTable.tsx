import type { CheckStatus, QueryMeta, QueryResult } from '../lib/types';

interface Props {
  results: QueryResult[];
  queries: QueryMeta[];
  onShowDisks?: (diskgroupName: string) => void;
  loadingDisks?: string[];
  title?: string;
  notice?: string;
}

function Badge({ status }: { status: CheckStatus }) {
  return <span class={`badge badge--${status.toLowerCase()}`}>{status}</span>;
}

function overall(results: QueryResult[]): CheckStatus {
  if (results.some((result) => result.status === 'ERROR')) return 'ERROR';
  if (results.some((result) => result.status === 'WARN')) return 'WARN';
  return 'OK';
}

export default function ReportTable({
  results,
  queries,
  onShowDisks,
  loadingDisks = [],
  title = 'Resultado del reporte',
  notice,
}: Props) {
  if (results.length === 0) {
    return (
      <section class="panel report-panel">
        <div class="report-header">
          <div>
            <h2>{title}</h2>
            <p>Sin resultados todavía</p>
          </div>
        </div>
        {notice ? (
          <p class="notice">{notice}</p>
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
        <div class="overall">
          <span>Estado global</span>
          <Badge status={overall(results)} />
        </div>
      </div>

      {notice && <p class="notice">{notice}</p>}

      {results.map((result) => {
        const meta = queries.find((query) => query.id === (result.sourceId ?? result.id));
        const columns = meta?.columns
          ?? Object.keys(result.rows[0] ?? {})
            .filter((key) => key !== '__status')
            .map((key) => ({ key, label: key, kind: undefined }));

        const showDiskAction = (result.sourceId ?? result.id) === 'dg_summary';

        return (
          <article class="query-block" key={result.id}>
            <header class="query-block-header">
              <h3>{result.title}</h3>
              <div class="query-block-meta">
                <Badge status={result.status} />
                <small>{result.rows.length} filas · {result.durationMs} ms</small>
              </div>
            </header>

            {result.error && <p class="notice">{result.error}</p>}

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
                      const diskgroupName = row.NAME;
                      const isLoading = loadingDisks.includes(diskgroupName);

                      return (
                        <tr key={index}>
                          {columns.map((column) => (
                            <td key={column.key}>{row[column.key] || '—'}</td>
                          ))}
                          <td>
                            {showDiskAction && onShowDisks && diskgroupName ? (
                              <button
                                type="button"
                                class="action-link"
                                disabled={isLoading}
                                title={`Ver discos del diskgroup ${diskgroupName}`}
                                onClick={() => onShowDisks(diskgroupName)}
                              >
                                <span aria-hidden="true">🔍</span>
                                {isLoading ? 'Consultando…' : 'Ver discos'}
                              </button>
                            ) : (
                              <span class="action-empty">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p class="notice">La consulta no devolvió filas.</p>
            )}
          </article>
        );
      })}
    </section>
  );
}
