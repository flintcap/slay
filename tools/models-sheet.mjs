/**
 * Model lineups, without booting the game.
 *
 *   SLAY_PORT=4311 node tools/models-sheet.mjs classes,monsters,npcs --out=shots/models
 *
 * Starts a Vite dev server, opens an empty page on it with WebGL (SwiftShader),
 * imports the real model code from source and asks `tools/models-page.ts` to
 * render each named sheet. Every class in low, mid and top gear, every monster
 * family with elites and bosses, and every camp resident, each in one image,
 * with triangle and draw-call counts printed per figure.
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
const wanted = (args.find((a) => !a.startsWith('--')) ?? 'classes').split(',');
const OUT = path.resolve(flags.out ?? 'shots/models');
const PORT = Number(flags.port ?? process.env.SLAY_PORT ?? 4311);
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
await page.route(`http://127.0.0.1:${PORT}/__models`, (r) =>
  r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#111"></body>' }),
);
await page.goto(`http://127.0.0.1:${PORT}/__models`);

for (const name of wanted) {
  const t0 = Date.now();
  const res = await page.evaluate(async (n) => {
    const mod = await import('/tools/models-page.ts');
    const fn = mod.SHEETS[n];
    if (!fn) return { error: `no sheet "${n}"; have ${Object.keys(mod.SHEETS).join(', ')}` };
    try {
      return { uri: await fn() };
    } catch (e) {
      return { error: String(e && e.stack ? e.stack : e).slice(0, 1200) };
    }
  }, name);
  if (res.error) {
    console.error(res.error);
    continue;
  }
  const file = path.join(OUT, `${name}.png`);
  writeFileSync(file, Buffer.from(res.uri.split(',')[1], 'base64'));
  console.log(`wrote ${file} in ${Math.round((Date.now() - t0) / 1000)}s`);
}
await browser.close();
stop();
process.exit(0);
