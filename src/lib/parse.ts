/** Convierte la salida de un SPOOL de SQL*Plus en una tabla [header, ...filas]. */
export function parseSpool(raw: string, delimiter: string): string[][] {
  const lines = raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .filter((line) => line.trim().length > 0)
    .filter((line) => !/^\s*(ORA-|SP2-|SQL>|no rows selected|PL\/SQL procedure|Disconnected)/i.test(line))
    .filter((line) => !/^\s*-{3,}\s*$/.test(line));

  if (lines.length === 0) return [];

  const header = lines[0].split(delimiter).map((cell) => cell.trim());
  const rows: string[][] = [];

  for (const line of lines.slice(1)) {
    const cells = line.split(delimiter).map((cell) => cell.trim());
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
