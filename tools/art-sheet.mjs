/**
 * Art contact sheets, without booting the game.
 *
 *   SLAY_PORT=4310 node tools/art-sheet.mjs items,rarity,skills --out=shots/art
 *
 * Starts a Vite dev server, opens an empty page on it, imports the art modules
 * straight from source and asks `tools/art-sheet-page.ts` to compose each named
 * sheet onto one canvas. Every sheet is written as a PNG to look at. Takes
 * seconds rather than the minutes a full game boot needs under software
 * rendering, so hundreds of icons can be judged at once.
 *
 * Sheets are whatever `art-sheet-page.ts` exports in `SHEETS`; run with
 * `--list` to print them.
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
const wanted = (args.find((a) => !a.startsWith('--')) ?? 'items').split(',');
const OUT = path.resolve(flags.out ?? 'shots/art');
const PORT = Number(flags.port ?? process.env.SLAY_PORT ?? 4310);
mkdirSync(OUT, { recursive: true });

const server = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'ignore', 'pipe'],
});
server.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => {
  try {
    server.kill('SIGTERM');
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
  // SwiftShader WebGL, for the 3D model sheets.
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 400)));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[page ${m.type()}]`, m.text().slice(0, 300));
});
// An empty document on the dev server's origin, so module imports resolve but
// the game itself never boots.
await page.route(`http://127.0.0.1:${PORT}/__artsheet`, (r) =>
  r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#111"></body>' }),
);
await page.goto(`http://127.0.0.1:${PORT}/__artsheet`);

if (flags.list) {
  const names = await page.evaluate(async () => Object.keys((await import('/tools/art-sheet-page.ts')).SHEETS));
  console.log(names.join('\n'));
} else {
  for (const name of wanted) {
    const t0 = Date.now();
    const res = await page.evaluate(async (n) => {
      const mod = await import('/tools/art-sheet-page.ts');
      const fn = mod.SHEETS[n];
      if (!fn) return { error: `no sheet "${n}"; have ${Object.keys(mod.SHEETS).join(', ')}` };
      const t = performance.now();
      const cv = await fn();
      return { uri: cv.toDataURL('image/png'), ms: performance.now() - t, w: cv.width, h: cv.height, note: cv.dataset.note ?? '' };
    }, name);
    if (res.error) {
      console.error(res.error);
      continue;
    }
    const file = path.join(OUT, `${name}.png`);
    writeFileSync(file, Buffer.from(res.uri.split(',')[1], 'base64'));
    console.log(`wrote ${file} ${res.w}x${res.h} in ${Math.round(res.ms)}ms (${Date.now() - t0}ms total) ${res.note}`);
  }
}
await browser.close();
stop();
process.exit(0);
