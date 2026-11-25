import { useEffect, useRef } from 'preact/hooks';

interface Props {
  output: string;
}

export default function TerminalPanel({ output }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<any>(null);
  const fitRef = useRef<any>(null);
  const writtenRef = useRef(0);

  useEffect(() => {
    let disposed = false;

    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ]);
      if (disposed || !hostRef.current || termRef.current) return;

      const terminal = new Terminal({
        convertEol: true,
        cursorBlink: false,
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: 12,
        lineHeight: 1.25,
        scrollback: 5000,
        theme: {
          background: '#0b1120',
          foreground: '#e2e8f0',
          cursor: '#38bdf8',
        },
      });
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(hostRef.current);
      try {
        fitAddon.fit();
      } catch {
        // El contenedor aún no tiene dimensiones.
      }

      termRef.current = terminal;
      fitRef.current = fitAddon;

      if (output.length > writtenRef.current) {
        terminal.write(output.slice(writtenRef.current).replace(/\r\n/g, '\n'));
        writtenRef.current = output.length;
      }
    })();

    const onResize = () => {
      try {
        fitRef.current?.fit();
      } catch {
        // Ignore.
      }
    };
    globalThis.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      globalThis.removeEventListener('resize', onResize);
      termRef.current?.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  useEffect(() => {
    const terminal = termRef.current;
    if (!terminal) return;
    if (output.length < writtenRef.current) {
      terminal.clear();
      writtenRef.current = 0;
    }
    const chunk = output.slice(writtenRef.current).replace(/\r\n/g, '\n');
    if (chunk) {
      terminal.write(chunk);
      writtenRef.current = output.length;
    }
  }, [output]);

  return (
    <div class="terminal-shell">
      <div class="terminal-title">
        <span class="terminal-dot red" />
        <span class="terminal-dot yellow" />
        <span class="terminal-dot green" />
        <span>sqlplus · PTY (ConPTY)</span>
      </div>
      <div class="terminal" ref={hostRef} />
    </div>
  );
}
