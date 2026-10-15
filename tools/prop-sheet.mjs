/**
 * Prop contact sheets, without booting the game.
 *
 *   SLAY_PORT=4327 timeout 600 node tools/prop-sheet.mjs kinds --ids=lights --biomes=crypt,swamp
 *   SLAY_PORT=4327 timeout 600 node tools/prop-sheet.mjs kinds --ids=chest,barrel --name=containers
 *
 * Starts a Vite dev server, opens an empty page with WebGPU (SwiftShader),
 * imports the real prop library and renders the sheet from
 * `tools/prop-page.ts`: every variant of every named kind (or group: lights,
 * stone, crypt, wild, elements, works, hive, containers, detail, all) for each
 * biome, under a dim dungeon light plus the prop's own light. Wrap it in `timeout`.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { gpuArgs } from './browser-args.mjs';

const args = process.argv.slice(2);
const flags = Object.fromEntries(
  args.filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const sheetName = args.find((a) => !a.startsWith('--')) ?? 'kinds';
const ids = String(flags.ids ?? 'lights').split(',');
const biomes = String(flags.biomes ?? 'crypt').split(',');
const OUT = path.resolve(flags.out ?? 'shots/props');
const PORT = Number(flags.port ?? process.env.SLAY_PORT ?? 4327);
mkdirSync(OUT, { recursive: true });

const server = spawn(
  process.execPath,
  [path.resolve('node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, SLAY_NO_HMR: '1' } },
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
  args: gpuArgs(),
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.setDefaultTimeout(1_800_000);
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 400)));
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning') console.log(`[page ${t}]`, m.text().slice(0, t === 'error' ? 4000 : 300));
  else if (t === 'log') console.log(m.text());
});
await page.route(`http://127.0.0.1:${PORT}/__props`, (r) =>
  r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#111"></body>' }),
);
await page.goto(`http://127.0.0.1:${PORT}/__props`);

const t0 = Date.now();
const res = await page.evaluate(
  async ([n, list, bl]) => {
    const mod = await import('/tools/prop-page.ts');
    const fn = mod.SHEETS[n];
    if (!fn) return { error: `no sheet "${n}"; have ${Object.keys(mod.SHEETS).join(', ')}` };
    try {
      return { uri: await fn(list, bl) };
    } catch (e) {
      return { error: String(e && e.stack ? e.stack : e).slice(0, 1200) };
    }
  },
  [sheetName, ids, biomes],
);
if (res.error) console.error(res.error);
else {
  const tag = String(flags.name ?? `${sheetName}-${ids.join('_')}-${biomes.join('_')}`.replace(/[^a-z0-9_-]/gi, '-')).slice(0, 80);
  const file = path.join(OUT, `${tag}.png`);
  writeFileSync(file, Buffer.from(res.uri.split(',')[1], 'base64'));
  console.log(`wrote ${file} in ${Math.round((Date.now() - t0) / 1000)}s`);
}
await browser.close();
stop();
process.exit(res.error ? 1 : 0);
