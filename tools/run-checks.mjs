/**
 * Run every checker and say which pass.
 *
 *   node tools/run-checks.mjs                 # static checkers only (fast, no browser)
 *   node tools/run-checks.mjs --browser       # browser checkers only (slow, one at a time)
 *   node tools/run-checks.mjs --all           # both
 *   node tools/run-checks.mjs --only=dupe,loot
 *   node tools/run-checks.mjs --skip=wallhug
 *   node tools/run-checks.mjs --browser --no-build   # reuse the current dist/
 *
 * A checker is "browser" if it drives Chromium; everything else bundles an
 * entry with `vite build --ssr` and runs it under Node. Browser checkers run
 * strictly one after another so they never share `SLAY_PORT`.
 *
 * The dev server runs with `SLAY_NO_HMR=1` (see vite.config.ts) so editing a
 * source file mid-run cannot reload the page out from under a checker.
 *
 * Each checker's full output goes to `.checks/<name>.txt`; the summary table
 * and a JSON line (`{ pass, fail, results }`) go to stdout. Exit code is the
 * number of failures, capped at 1.
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const TOOLS = path.join(ROOT, 'tools');
const OUT = path.join(ROOT, '.checks');
mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const list = (name) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3).split(',').filter(Boolean) : null;
};
const only = list('only');
const skip = new Set(list('skip') ?? []);
const wantBrowser = flag('browser') || flag('all');
const wantStatic = !flag('browser') || flag('all');
// Per checker: a browser checker gets 25 minutes, a static one 10, unless
// --timeout says otherwise. (With --only, a browser checker used to get the
// static 10 minutes and was killed while still booting.)
const fixedTimeout = list('timeout')?.[0];
const timeoutFor = (c) => Number(fixedTimeout ?? (c.browser ? 1_500_000 : 600_000));

const all = readdirSync(TOOLS)
  .filter((f) => /^check-.*\.mjs$/.test(f))
  .map((f) => {
    const name = f.slice(6, -4);
    const src = readFileSync(path.join(TOOLS, f), 'utf8');
    return { name, file: path.join(TOOLS, f), browser: /chromium|bootGame/.test(src) };
  })
  .filter((c) => (only ? only.includes(c.name) : true))
  .filter((c) => !skip.has(c.name))
  .filter((c) => (c.browser ? wantBrowser || only : wantStatic || only));

// If run-checks itself is stopped, take the running checker's whole group
// (its vite server and browser) with it, or they outlive it on the port.
let current = null;
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(sig, () => {
    if (current) {
      try {
        process.kill(-current, 'SIGKILL');
      } catch {
        /* already gone */
      }
    }
    // The checker's own server is in a group of its own and its exit hook
    // never ran (SIGKILL), so free the port as well.
    try {
      execFileSync('fuser', ['-k', '-KILL', '-n', 'tcp', process.env.SLAY_PORT ?? '4309'], { stdio: 'ignore' });
    } catch {
      /* nothing held it */
    }
    process.exit(130);
  });
}

function run(c) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [c.file], {
      cwd: ROOT,
      env: { ...process.env, SLAY_PORT: process.env.SLAY_PORT ?? '4309', SLAY_NO_HMR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      // Own process group, so a timeout also takes down the checker's vite
      // server and browser instead of leaving them holding the port.
      detached: true,
    });
    current = child.pid;
    const killAll = () => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* already gone */
      }
    };
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const timeoutMs = timeoutFor(c);
    const timer = setTimeout(() => {
      out += `\n[run-checks] killed after ${timeoutMs} ms\n`;
      killAll();
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      killAll();
      writeFileSync(path.join(OUT, `${c.name}.txt`), out);
      const lines = out.trim().split('\n');
      const last = lines.reverse().find((l) => /\S/.test(l) && !l.trim().startsWith('{')) ?? '';
      resolve({ name: c.name, browser: c.browser, code, ms: Date.now() - t0, last: last.slice(0, 140) });
    });
  });
}

// Checkers that use `vite preview` serve `dist/`, so it must match the source.
if (all.some((c) => c.browser) && !flag('no-build')) {
  process.stdout.write('building dist/ for the preview-server checkers... ');
  execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], { cwd: ROOT, stdio: 'ignore' });
  console.log('done');
}

// A server left on the port is worse than a crash: the next checker's own
// server cannot bind it, its readiness probe gets an answer anyway, and it
// runs against the stale one (a `vite preview` has no /src, so a dev-server
// checker then fails with "Failed to fetch dynamically imported module").
// Before and after every browser checker, anything listening is killed and
// the leak is pinned on the checker that left it.
const PORT = process.env.SLAY_PORT ?? '4309';
function portHeld() {
  try {
    execFileSync('fuser', ['-n', 'tcp', PORT], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
/** After a checker: give a server killed on exit a few seconds to let go. */
async function portLeftHeld() {
  for (let i = 0; i < 5 && portHeld(); i++) await new Promise((r) => setTimeout(r, 1000));
  return clearPort();
}
function clearPort() {
  try {
    // Exit status 0 means something held the port and was killed.
    execFileSync('fuser', ['-k', '-KILL', '-n', 'tcp', PORT], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const results = [];
for (const c of all) {
  if (c.browser && clearPort()) console.log(`[run-checks] port ${PORT} was already held; cleared it`);
  process.stdout.write(`${c.browser ? '[web] ' : '      '}${c.name.padEnd(18)} `);
  const r = await run(c);
  if (c.browser && (await portLeftHeld())) {
    r.code = r.code || 1;
    r.last = `left a server running on port ${PORT} (killed) | ${r.last}`;
  }
  results.push(r);
  console.log(`${r.code === 0 ? 'pass' : 'FAIL'} ${String(Math.round(r.ms / 1000)).padStart(4)}s  ${r.last}`);
}
const fail = results.filter((r) => r.code !== 0);
console.log(`\n${results.length - fail.length} passed, ${fail.length} failed${fail.length ? `: ${fail.map((r) => r.name).join(', ')}` : ''}`);
console.log(JSON.stringify({ pass: results.length - fail.length, fail: fail.length, results }));
process.exit(fail.length ? 1 : 0);
