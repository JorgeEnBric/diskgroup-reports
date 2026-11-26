import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import type { SshInstanceOption } from './ssh-shared';

function read(name: string, fallback = ''): string {
  return (process.env[name] ?? fallback).trim();
}

function splitArgs(value: string): string[] {
  // Sin shell: se admiten comillas dobles/simples para agrupar argumentos.
  const parts: string[] = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
  for (const match of value.matchAll(pattern)) {
    const token = (match[1] ?? match[2] ?? match[3]).replace(/\\(["'\\])/g, '$1');
    if (token) parts.push(token);
  }
  return parts;
}

async function exists(path: string): Promise<boolean> {
  if (!path) return false;
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findOnPath(names: string[]): Promise<string | undefined> {
  const directories = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  for (const name of names) {
    for (const directory of directories) {
      const candidate = join(directory, name);
      if (await exists(candidate)) return candidate;
    }
  }
  return undefined;
}

async function resolveTerminal(): Promise<{ command: string; args: string[] } | undefined> {
  const override = read('SSH_TERMINAL_BIN');
  if (override) {
    return { command: override, args: splitArgs(read('SSH_TERMINAL_ARGS')) };
  }

  if (process.platform === 'win32') {
    const windowsApps = join(
      process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? '', 'AppData', 'Local'),
      'Microsoft',
      'WindowsApps',
    );
    const wt = await findOnPath(['wt.exe']);
    if (wt) return { command: wt, args: [] };
    if (await exists(join(windowsApps, 'wt.exe'))) {
      return { command: join(windowsApps, 'wt.exe'), args: [] };
    }
    return { command: 'cmd.exe', args: ['/d', '/c', 'start', '""'] };
  }

  if (process.platform === 'darwin') {
    return { command: 'osascript', args: ['-e'] };
  }

  const terminal = await findOnPath([
    'gnome-terminal',
    'konsole',
    'xterm',
    'x-terminal-emulator',
    'xfce4-terminal',
    'mate-terminal',
  ]);
  return terminal ? { command: terminal, args: [] } : undefined;
}

function terminalArgs(
  terminal: { command: string; args: string[] },
  sshBin: string,
  sshArgs: string[],
): string[] {
  const name = terminal.command.toLowerCase();
  const command = [sshBin, ...sshArgs];
  const quoted = command
    .map((arg) => `'${arg.replace(/'/g, `'\\''`)}'`)
    .join(' ');

  if (process.platform === 'darwin') {
    return [...terminal.args, `tell application "Terminal" to do script "${quoted.replace(/"/g, '\\"')}"`];
  }
  if (name.includes('gnome-terminal')) return [...terminal.args, '--', ...command];
  if (name.includes('konsole')) return [...terminal.args, '-e', ...command];
  if (name.includes('x-terminal-emulator') || name.includes('xfce4-terminal') || name.includes('mate-terminal')) {
    return [...terminal.args, '-e', ...command];
  }
  if (name.includes('xterm')) return [...terminal.args, '-e', ...command];
  if (name.includes('cmd.exe')) return [...terminal.args, ...command];
  // Override: los argumentos SSH se pasan tal cual tras SSH_TERMINAL_ARGS.
  return [...terminal.args, ...command];
}

export interface SshLaunchResult {
  launched: boolean;
  target: string;
  terminal: string;
}

/** Abre una terminal nativa del sistema con el cliente ssh real. */
export async function launchNativeSsh(instance: SshInstanceOption): Promise<SshLaunchResult> {
  const user = read('SSH_USER');
  if (!user) throw new Error('SSH_USER no está configurado en .env.');

  const sshBin = read('SSH_BIN', 'ssh');
  const port = read('SSH_PORT', '22');
  const sshArgs = [
    '-tt',
    '-p',
    port,
    ...splitArgs(read('SSH_OPTS')),
    `${user}@${instance.ip}`,
  ];

  const terminal = await resolveTerminal();
  if (!terminal) {
    throw new Error(
      'No se encontró una terminal nativa. Configura SSH_TERMINAL_BIN y SSH_TERMINAL_ARGS en .env.',
    );
  }

  const args = terminalArgs(terminal, sshBin, sshArgs);
  const child = spawn(terminal.command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.on('error', () => undefined);
  child.unref();

  return {
    launched: true,
    target: `${instance.host} (${instance.ip})`,
    terminal: terminal.command,
  };
}
