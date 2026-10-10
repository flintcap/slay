/**
 * Hero sheets, without booting the game.
 *
 *   SLAY_PORT=4324 node tools/hero-sheet.mjs bodies,faces --out=shots/heroes [--k=v ...]
 *
 * Starts a Vite dev server, opens an empty page with WebGL (SwiftShader),
 * imports the hero code from source and asks `tools/hero-page.ts` to render
 * each named sheet: bodies, faces, extremities; `check` prints a report and
 * sets the exit code instead (see tools/check-hero.mjs). Extra `--k=v` flags are
 * handed to the sheet. Takes seconds, not the minutes a game boot does.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const flags = Object.fromEntries(
  args.filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const wanted = (args.find((a) => !a.startsWith('--')) ?? 'bodies').split(',');
const OUT = path.resolve(flags.out ?? 'shots/heroes');
const PORT = Number(flags.port ?? process.env.SLAY_PORT ?? 4324);
mkdirSync(OUT, { recursive: true });

const server = spawn(
  process.execPath,
  [path.resolve('node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
server.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => {
  try {
    server.kill('SIGKILL');
  } catch {
    /* gone */
  }
};
process.on('exit', stop);

let up = false;
for (let i = 0; i < 120 && !up; i++) {
  try {
    up = (await fetch(`http://127.0.0.1:${PORT}/@vite/client`)).ok;
  } catch {
    /* not yet */
  }
  if (!up) await sleep(500);
}
if (!up) {
  console.error('vite did not come up');
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.setDefaultTimeout(1_800_000);
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 400)));
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning') console.log(`[page ${t}]`, m.text().slice(0, 300));
  else if (t === 'log') console.log(m.text());
});
await page.route(`http://127.0.0.1:${PORT}/__heroes`, (r) =>
  r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#111"></body>' }),
);
await page.goto(`http://127.0.0.1:${PORT}/__heroes`);

let failed = false;
for (const name of wanted) {
  const t0 = Date.now();
  const res = await page.evaluate(async ([n, f]) => {
    const mod = await import('/tools/hero-page.ts');
    const fn = mod.SHEETS[n];
    if (!fn) return { error: `no sheet "${n}"; have ${Object.keys(mod.SHEETS).join(', ')}` };
    try {
      return { uri: await fn(f) };
    } catch (e) {
      return { error: String(e && e.stack ? e.stack : e).slice(0, 1200) };
    }
  }, [name, flags]);
  if (res.error) {
    console.error(res.error);
    continue;
  }
  if (!res.uri.startsWith('data:')) {
    // A check: a JSON report instead of a picture.
    const rep = JSON.parse(res.uri);
    for (const l of rep.lines) console.log(l);
    console.log(`${name}: ${rep.pass ? 'PASS' : 'FAIL'}`);
    if (!rep.pass) failed = true;
    continue;
  }
  const file = path.join(OUT, `${name}.png`);
  writeFileSync(file, Buffer.from(res.uri.split(',')[1], 'base64'));
  console.log(`wrote ${file} in ${Math.round((Date.now() - t0) / 1000)}s`);
}
await browser.close();
stop();
process.exit(failed ? 1 : 0);
