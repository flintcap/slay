/**
 * Renders the effect lab (`tools/vfxlab.html`): one picture per scene of
 * effects on a dark stone floor, through the game's real renderer. The floor
 * marks, telegraphs, bolts, blasts, swings, status looks and loot beams are all
 * procedural; the only way to know whether they read is to look.
 *
 *   SLAY_PORT=4329 timeout 900 node tools/check-decals.mjs [--only=bolts,marks] [--out=shots/vfx]
 *
 * Fails when a scene throws, when the page logs an error, or when a frame
 * comes back blank or blown out to white.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { gpuArgs } from './browser-args.mjs';

const arg = (k, d) => {
  const a = process.argv.find((s) => s.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const PORT = Number(process.env.SLAY_PORT ?? 4217);
const OUT = arg('out', 'shots/vfx');
const ONLY = arg('only', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  // Own process group: npx starts vite as a child, and killing npx alone
  // left vite running and holding the port after the checker exited.
  detached: true,
  stdio: ['ignore', 'ignore', 'pipe'],
});
const killServer = () => {
  try {
    process.kill(-server.pid, 'SIGKILL');
  } catch {
    /* already gone */
  }
};
process.on('exit', killServer);
let up = false;
for (let i = 0; i < 90; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/tools/vfxlab.html`)).ok) {
      up = true;
      break;
    }
  } catch {}
  await sleep(500);
}
if (!up) {
  console.error(`FAIL the dev server never came up on ${PORT}`);
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: gpuArgs(),
});
const fails = [];
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
page.on('pageerror', (e) => fails.push(`page error: ${String(e).slice(0, 300)}`));
page.on('console', (m) => {
  // Missing files are reported by URL below; the console line has none.
  if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) fails.push(`console: ${m.text().slice(0, 300)}`);
});
page.on('response', (r) => {
  if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) fails.push(`missing: ${r.url()} (${r.status()})`);
});
await page.goto(`http://127.0.0.1:${PORT}/tools/vfxlab.html`, { waitUntil: 'load' });
await page.waitForFunction(() => window.VFXLAB?.ready, null, { timeout: 240000, polling: 250 });
const scenes = (await page.evaluate(() => window.VFXLAB.scenes)).filter((s) => !ONLY.length || ONLY.includes(s));
mkdirSync(OUT, { recursive: true });

const notes = {};
for (const name of scenes) {
  const t0 = Date.now();
  const ok = await page.evaluate((n) => window.VFXLAB.run(n), name);
  if (!ok) {
    fails.push(`${name}: the lab does not know this scene`);
    continue;
  }
  const buf = await page.locator('#c').screenshot();
  writeFileSync(`${OUT}/${name}.png`, buf);
  // Judge the written PNG, not the live canvas (its GPU buffer is already
  // cleared): mean luma and the share of near-white pixels.
  const stats = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const g = document.createElement('canvas');
    g.width = 240;
    g.height = 150;
    const x = g.getContext('2d');
    x.drawImage(img, 0, 0, g.width, g.height);
    const d = x.getImageData(0, 0, g.width, g.height).data;
    let sum = 0;
    let white = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      sum += l;
      if (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245) white++;
    }
    const n = d.length / 4;
    return { mean: +(sum / n).toFixed(1), white: +((white / n) * 100).toFixed(2) };
  }, buf.toString('base64'));
  notes[name] = { ...stats, ms: Date.now() - t0 };
  if (stats.mean < 3) fails.push(`${name}: the frame is black (mean ${stats.mean})`);
  if (stats.white > 6) fails.push(`${name}: ${stats.white}% of the frame is blown to white`);
}

console.log(JSON.stringify(notes, null, 1));
await browser.close();
killServer();
if (fails.length) {
  for (const f of fails) console.error(`FAIL ${f}`);
  process.exit(1);
}
console.log(`OK — ${scenes.length} effect scenes rendered to ${OUT}/`);
process.exit(0);
