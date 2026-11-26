const RESET = '\u001b[0m';
const BLUE = '\u001b[1;34m';
const CYAN = '\u001b[36m';
const GREEN = '\u001b[1;32m';
const GRAY = '\u001b[90m';
const RED = '\u001b[1;31m';
const YELLOW = '\u001b[1;33m';

interface TableRow {
  cells: string[];
  eol: string;
}

export interface TerminalFormatter {
  push(chunk: string): string;
  flush(): string;
}

function unquote(cell: string): string {
  if (cell.length >= 2 && cell.startsWith('"') && cell.endsWith('"')) {
    return cell.slice(1, -1).replace(/""/g, '"');
  }
  return cell;
}

function colorize(content: string): string {
  if (/^\[\d+\/\d+\]\s/.test(content)) return `${BLUE}${content}${RESET}`;
  if (/^\s*=+\s*$/.test(content)) return `${GRAY}${content}${RESET}`;
  if (/Fin de la validación/i.test(content)) return `${GREEN}${content}${RESET}`;
  if (/^\[INFO\]/i.test(content)) return `${CYAN}${content}${RESET}`;
  if (/^\[ERROR\]|^(?:ORA-|SP2-)/i.test(content)) return `${RED}${content}${RESET}`;
  if (/^\[WARN\]/i.test(content)) return `${YELLOW}${content}${RESET}`;
  return content;
}

interface TerminalLine {
  content: string;
  eol: string;
}

/**
 * La PTY convierte `\n` en `\r\n`; si el script ya enviaba `\r\n` aparece `\r\r\n`.
 * Se normaliza para que xterm no reciba retornos de carro duplicados.
 */
function splitLines(text: string): TerminalLine[] {
  const normalized = text.replace(/\r+\n/g, '\r\n');
  const lines: TerminalLine[] = [];
  let rest = normalized;

  while (rest.length > 0) {
    const match = /\r\n|\n|\r/.exec(rest);
    if (!match) {
      lines.push({ content: rest, eol: '' });
      break;
    }

    lines.push({ content: rest.slice(0, match.index), eol: match[0] });
    rest = rest.slice(match.index + match[0].length);
  }

  return lines;
}

/**
 * Convierte la salida delimitada de SQLcl/SQL*Plus en tablas alineadas para la PTY.
 * El log crudo del job no se modifica: este formateador solo afecta a lo publicado.
 */
export function createTerminalFormatter(delimiter: string): TerminalFormatter {
  let block: TableRow[] = [];
  /** Un `\r` puede llegar en un chunk distinto que su `\n`; se conserva hasta el siguiente push. */
  let pendingCR = '';

  function flushBlock(): string {
    if (block.length === 0) return '';

    const widths = block[0].cells.map(() => 0);
    for (const row of block) {
      row.cells.forEach((cell, index) => {
        widths[index] = Math.max(widths[index], cell.length);
      });
    }

    const text = block
      .map(
        (row) =>
          row.cells
            .map((cell, index) => cell.padEnd(widths[index]))
            .join('   ')
            .replace(/\s+$/, '') + row.eol,
      )
      .join('');

    block = [];
    return text;
  }

  return {
    push(chunk: string): string {
      const combined = pendingCR + chunk;
      const trailing = /\r+$/.exec(combined)?.[0] ?? '';
      pendingCR = trailing;
      const text = trailing ? combined.slice(0, -trailing.length) : combined;
      if (!text) return '';

      let output = '';
      for (const { content, eol } of splitLines(text)) {
        if (content.includes(delimiter)) {
          block.push({ cells: content.split(delimiter).map(unquote), eol });
          continue;
        }

        output += flushBlock();
        output += colorize(content) + eol;
      }
      return output;
    },

    flush(): string {
      const remaining = pendingCR;
      pendingCR = '';
      return (remaining ? colorize(remaining) : '') + flushBlock();
    },
  };
}
