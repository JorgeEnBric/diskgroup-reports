/**
 * Convierte la salida de un SPOOL en una tabla [header, ...filas].
 * Compatible con SQL*Plus (COLSEP) y SQLcl (SQLFORMAT DELIMITED).
 */

function cleanCell(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Divide una línea respetando las comillas de SQLcl y el delimitador `|~|`. */
function splitCells(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  let index = 0;

  while (index < line.length) {
    if (line[index] === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 2;
        continue;
      }
      quoted = !quoted;
      index += 1;
      continue;
    }

    if (!quoted && line.startsWith(delimiter, index)) {
      cells.push(cleanCell(current));
      current = '';
      index += delimiter.length;
      continue;
    }

    current += line[index];
    index += 1;
  }

  cells.push(cleanCell(current));
  return cells;
}

export function parseSpool(raw: string, delimiter: string): string[][] {
  const lines = raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .filter((line) => line.trim().length > 0)
    .filter((line) => !/^\s*(ORA-|SP2-|SQL>|no rows selected|PL\/SQL procedure|Disconnected)/i.test(line))
    .filter((line) => !/^\s*-{3,}\s*$/.test(line));

  if (lines.length === 0) return [];

  const header = splitCells(lines[0], delimiter);
  const rows: string[][] = [];

  for (const line of lines.slice(1)) {
    const cells = splitCells(line, delimiter);
    if (cells.length !== header.length) continue; // Líneas de resumen / avisos.
    rows.push(cells);
  }

  return [header, ...rows];
}

export function rowsToObjects(table: string[][]): Record<string, string>[] {
  if (table.length === 0) return [];
  const [header, ...rows] = table;
  return rows.map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      record[key] = cells[index] ?? '';
    });
    return record;
  });
}

export function extractOracleErrors(raw: string): string[] {
  return raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^(ORA-|SP2-)/i.test(line));
}
