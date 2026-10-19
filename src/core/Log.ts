/**
 * SLAY — the game's log: what happened this session, kept so a player can
 * send it when something goes wrong.
 *
 * Every warning and error the page prints lands here, with the game's own
 * milestones (boot steps, scene changes, a lost GPU). The last few hundred
 * lines are kept in memory and written to browser storage, so a session that
 * crashed or froze can still be read on the next launch: it is kept as the
 * "previous session". `saveLogFile()` writes both as a text file, and
 * `buildReport()` (core/Report.ts) puts them under the version and the
 * machine's details for the "copy report" button.
 */

const MAX_LINES = 500;
const MAX_LINE = 600;
const KEY = 'slay.log';
const KEY_PREV = 'slay.log.prev';

const lines: string[] = [];
let previous = '';
let started = 0;
let installed = false;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function stamp(): string {
  const s = (performance.now() - started) / 1000;
  return s.toFixed(2).padStart(8);
}

function text(parts: unknown[]): string {
  return parts
    .map((p) => {
      if (p instanceof Error) return p.stack ? p.stack.split('\n').slice(0, 4).join(' | ') : `${p.name}: ${p.message}`;
      if (typeof p === 'string') return p;
      try {
        return JSON.stringify(p);
      } catch {
        return String(p);
      }
    })
    .join(' ');
}

function write(): void {
  writeTimer = null;
  try {
    localStorage.setItem(KEY, lines.join('\n'));
  } catch {
    /* storage full or blocked: the log still lives in memory */
  }
}

/** Errors are written at once (the page may be about to die); the rest in a batch. */
function schedule(now: boolean): void {
  if (now) {
    if (writeTimer) clearTimeout(writeTimer);
    write();
  } else if (!writeTimer) writeTimer = setTimeout(write, 4000);
}

function push(level: 'I' | 'W' | 'E', msg: string): void {
  const line = `${stamp()} ${level} ${msg.length > MAX_LINE ? `${msg.slice(0, MAX_LINE)}…` : msg}`;
  lines.push(line);
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
  if (installed) schedule(level === 'E');
}

/** A milestone worth having in a report. */
export function logInfo(...parts: unknown[]): void {
  push('I', text(parts));
}

/**
 * Starts the log: keeps the last session's lines as the previous session and
 * listens to the page's warnings and errors. Called first thing at boot.
 */
export function installLog(): void {
  if (installed) return;
  installed = true;
  started = performance.now();
  try {
    previous = localStorage.getItem(KEY) ?? '';
    if (previous) localStorage.setItem(KEY_PREV, previous);
    else previous = localStorage.getItem(KEY_PREV) ?? '';
    localStorage.removeItem(KEY);
  } catch {
    previous = '';
  }
  // The console still prints as before; the log keeps a copy.
  const warn = console.warn.bind(console);
  const error = console.error.bind(console);
  console.warn = (...a: unknown[]) => {
    push('W', text(a));
    warn(...a);
  };
  console.error = (...a: unknown[]) => {
    push('E', text(a));
    error(...a);
  };
  window.addEventListener('error', (e) => push('E', `uncaught: ${text([e.error ?? e.message])}`));
  window.addEventListener('unhandledrejection', (e) => push('E', `unhandled promise: ${text([e.reason])}`));
  window.addEventListener('pagehide', () => schedule(true));
  push('I', `log started ${new Date().toISOString()}`);
}

/** This session's lines, oldest first. */
export function logText(): string {
  return lines.join('\n');
}

/** The session before this one, as it stood when it ended (or crashed). */
export function previousLogText(): string {
  return previous;
}

/** Saves `body` as a text file through the browser's download. */
export function saveTextFile(name: string, body: string): void {
  const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
