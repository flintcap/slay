/**
 * Smoke test: does a build boot and draw? Serves a built folder, opens it in
 * Chrome and waits for the title screen; on a test build (one with the
 * `window.SLAY` handle) it also walks into town and down one tier and draws
 * there. Fails on any page error, a blank picture, or no WebGPU.
 *
 * The automatic checks (.github/workflows/checks.yml) run it on a Mac, whose
 * Chrome draws WebGPU on the real GPU (Metal). Here it runs on SwiftShader,
 * slowly.
 *
 *   node tools/smoke.mjs --dir=dist-release            release build: title only
 *   node tools/smoke.mjs --dir=dist                    test build: title, town, tier 1
 *   node tools/smoke.mjs --dir=dist --gpu=real --out=smoke
 *
 * --gpu=real launches Chrome with its own GPU (no software flags). --out keeps
 * a screenshot of each stop. --timeout is seconds per stop (default 120, or
 * 900 on software).
 */
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import path from 'node:path';
import { gpuArgs } from './browser-args.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.resolve(ROOT, args.dir ?? 'dist');
const REAL = args.gpu === 'real';
const STOP_MS = Number(args.timeout ?? (REAL ? 120 : 900)) * 1000;
const OUT = args.out ? path.resolve(ROOT, args.out) : null;
const PORT = Number(process.env.SLAY_PORT ?? 4410);
if (!existsSync(path.join(DIR, 'index.html'))) throw new Error(`${DIR} has no index.html: build it first`);
if (OUT) mkdirSync(OUT, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2',
};
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const file = path.join(DIR, url === '/' ? 'index.html' : url);
  if (!file.startsWith(DIR) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((ok) => server.listen(PORT, '127.0.0.1', ok));

/** Share of pixels brighter than black in a PNG screenshot (8-bit RGB or RGBA). */
function litShare(png) {
  let o = 8;
  let w = 0;
  let h = 0;
  let ch = 4;
  const idat = [];
  while (o < png.length) {
    const len = png.readUInt32BE(o);
    const type = png.toString('ascii', o + 4, o + 8);
    const data = png.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      ch = data[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const prev = Buffer.alloc(stride);
  const row = Buffer.alloc(stride);
  let lit = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? row[x - ch] : 0;
      const b = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      let v = src[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[x] = v & 255;
    }
    for (let x = 0; x < stride; x += ch) if (row[x] + row[x + 1] + row[x + 2] > 30) lit++;
    row.copy(prev);
  }
  return lit / (w * h);
}

const fails = [];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
  args: REAL ? ['--enable-unsafe-webgpu'] : gpuArgs(),
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => fails.push(`page error: ${e.message}`));
page.on('console', (m) => {
  // A missing file is reported below with its address.
  if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) fails.push(`console error: ${m.text().slice(0, 300)}`);
});
page.on('response', (r) => {
  if (r.status() >= 400) fails.push(`${r.status()} for ${r.url().replace(`http://127.0.0.1:${PORT}/`, '')}`);
});

async function stop(name) {
  const png = await page.screenshot({ timeout: STOP_MS });
  if (OUT) writeFileSync(path.join(OUT, `${name}.png`), png);
  const share = litShare(png);
  console.log(`${name}: ${(share * 100).toFixed(0)}% of the picture lit`);
  if (share < 0.05) fails.push(`${name}: the picture is blank`);
}

try {
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${PORT}/`);
  const gpu = await page.evaluate(async () => {
    const a = await navigator.gpu?.requestAdapter();
    if (!a) return null;
    const i = a.info;
    return [i.vendor, i.architecture, i.device, i.description].filter(Boolean).join(' / ') || 'unnamed';
  });
  console.log(`browser ${browser.version()}, GPU: ${gpu ?? 'none'}`);
  if (!gpu) throw new Error('no WebGPU adapter');
  await page.waitForSelector('.ttl-menu .mn-item', { state: 'visible', timeout: STOP_MS });
  const ver = (await page.textContent('.ttl-ver').catch(() => null)) ?? '';
  console.log(`title in ${((Date.now() - t0) / 1000).toFixed(1)} s, ${ver || 'no version shown'}`);
  if (!ver) fails.push('the title shows no version');
  await page.waitForTimeout(1500);
  await stop('title');

  const deep = await page.evaluate(() => !!window.SLAY?.debug);
  if (deep) {
    for (const [name, go] of [
      ['town', async () => {
        window.SLAY.debug.makeCharacter('warden', 1, 5150);
        await window.SLAY.engine.goTo('town');
      }],
      ['tier1', async () => {
        await window.SLAY.engine.goTo('dungeon', { depth: 1, seed: 5151 });
        window.SLAY.debug.godMode(true);
      }],
    ]) {
      const t = Date.now();
      await page.evaluate(go);
      await page.waitForFunction((id) => window.SLAY.engine.currentSceneId === id, name === 'town' ? 'town' : 'dungeon', {
        timeout: STOP_MS,
      });
      await page.waitForTimeout(3000);
      const fps = await page.evaluate(() => Math.round(window.SLAY.engine.fps));
      console.log(`${name} in ${((Date.now() - t) / 1000).toFixed(1)} s, ${fps} fps`);
      await stop(name);
    }
  } else console.log('release build: no debug handle, title only');
} catch (e) {
  fails.push(String(e?.message ?? e).split('\n')[0]);
} finally {
  await browser.close();
  server.close();
}

if (fails.length === 0) console.log('OK — the build boots and draws.');
else {
  for (const f of fails) console.log(`FAIL ${f}`);
  process.exit(1);
}
