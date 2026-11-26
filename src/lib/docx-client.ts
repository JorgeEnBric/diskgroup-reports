import type { QueryMeta, QueryResult } from './types';

export interface TemplateInput {
  diskgroup: string;
  results: QueryResult[];
  queries: QueryMeta[];
}

/** Pide al servidor el Template.docx relleno y lo descarga en el navegador. */
export async function downloadTemplate({ diskgroup, results, queries }: TemplateInput): Promise<void> {
  const label = diskgroup.trim().toUpperCase();
  const response = await fetch('/api/build-template', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
    body: JSON.stringify({ label, results, queries }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? 'No se pudo construir el template.');
  }

  const disposition = response.headers.get('content-disposition') ?? '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1]
    ?? `reporte_diskgroups_${label}.docx`;
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
