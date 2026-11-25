import type { CheckStatus, QueryMeta, QueryResult } from '../lib/types';

interface Props {
  results: QueryResult[];
  queries: QueryMeta[];
}

function Badge({ status }: { status: CheckStatus }) {
  return <span class={`badge badge--${status.toLowerCase()}`}>{status}</span>;
}

function overall(results: QueryResult[]): CheckStatus {
  if (results.some((result) => result.status === 'ERROR')) return 'ERROR';
  if (results.some((result) => result.status === 'WARN')) return 'WARN';
  return 'OK';
}

export default function ReportTable({ results, queries }: Props) {
  if (results.length === 0) {
    return (
      <section class="panel report-panel">
        <div class="empty-state">
          <strong>Sin resultados todavía</strong>
          <span>Selecciona un diskgroup y ejecuta las consultas para generar el reporte.</span>
        </div>
      </section>
    );
  }

  return (
    <section class="panel report-panel">
      <div class="report-header">
        <div>
          <h2>Resultado del reporte</h2>
          <p>{results.length} consulta(s) ejecutada(s)</p>
        </div>
        <div class="overall">
          <span>Estado global</span>
          <Badge status={overall(results)} />
        </div>
      </div>

      {results.map((result) => {
        const meta = queries.find((query) => query.id === result.id);
        const columns = meta?.columns
          ?? Object.keys(result.rows[0] ?? {})
            .filter((key) => key !== '__status')
            .map((key) => ({ key, label: key, kind: undefined }));

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
                      <th>Validación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, index) => (
                      <tr key={index}>
                        {columns.map((column) => (
                          <td key={column.key}>{row[column.key] || '—'}</td>
                        ))}
                        <td><Badge status={row.__status} /></td>
                      </tr>
                    ))}
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
