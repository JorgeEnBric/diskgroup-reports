import { useEffect, useRef } from 'preact/hooks';

interface Props {
  sessionId: string;
  output: string;
  title: string;
  onInput: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
}

export default function SshTerminal({ sessionId, output, title, onInput, onResize }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<any>(null);
  const fitRef = useRef<any>(null);
  const writtenRef = useRef(0);
  const inputRef = useRef(onInput);
  const resizeRef = useRef(onResize);

  inputRef.current = onInput;
  resizeRef.current = onResize;

  useEffect(() => {
    let disposed = false;

    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ]);
      if (disposed || !hostRef.current || termRef.current) return;

      const terminal = new Terminal({
        convertEol: false,
        cursorBlink: true,
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
      termRef.current = terminal;
      fitRef.current = fitAddon;

      terminal.onData((data: string) => inputRef.current?.(data));
      terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        resizeRef.current?.(cols, rows);
      });

      const fit = () => {
        try {
          fitAddon.fit();
          terminal.focus();
        } catch {
          // El contenedor aún no tiene dimensiones.
        }
      };
      fit();
      globalThis.requestAnimationFrame?.(fit);

      if (output.length > writtenRef.current) {
        terminal.write(output.slice(writtenRef.current));
        writtenRef.current = output.length;
      }
    })();

    const onWindowResize = () => {
      try {
        fitRef.current?.fit();
      } catch {
        // Ignore.
      }
    };
    globalThis.addEventListener('resize', onWindowResize);

    return () => {
      disposed = true;
      globalThis.removeEventListener('resize', onWindowResize);
      termRef.current?.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  useEffect(() => {
    writtenRef.current = 0;
    termRef.current?.reset();
  }, [sessionId]);

  useEffect(() => {
    const terminal = termRef.current;
    if (!terminal) return;
    if (output.length < writtenRef.current) {
      terminal.clear();
      writtenRef.current = 0;
    }
    const chunk = output.slice(writtenRef.current);
    if (chunk) {
      terminal.write(chunk);
      writtenRef.current = output.length;
    }
  }, [output]);

  return (
    <div class="terminal-shell ssh-terminal-shell">
      <div class="terminal-title">
        <span class="terminal-dot red" />
        <span class="terminal-dot yellow" />
        <span class="terminal-dot green" />
        <span>{title}</span>
      </div>
      <div class="terminal ssh-terminal" ref={hostRef} />
    </div>
  );
}
