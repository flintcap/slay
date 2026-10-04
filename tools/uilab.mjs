/**
 * UI lab photographer. Seconds per shot instead of minutes.
 *
 * Mounts the real HUD and panels without WebGL (see tools/uilab-entry.ts) and
 * screenshots named states. A state is a scenario name or a panel id; join
 * several with "+" to layer them.
 *
 *   SLAY_PORT=4301 node tools/uilab.mjs --out=shots/hud --shots=hud,inventory,tooltip,skills
 *   node tools/uilab.mjs --shots=hud --width=1280 --height=720
 *   node tools/uilab.mjs --shots=inventory --clip=440,140,620,200 --dpr=2
 */
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.resolve(args.out ?? 'shots/uilab');
const WANT = String(args.shots ?? 'hud').split(',');
const WIDTH = Number(args.width ?? 1920);
const HEIGHT = Number(args.height ?? 1080);
const PORT = Number(args.port ?? process.env.SLAY_PORT ?? 4301);
const CLS = args.class ? `&class=${args.class}` : '';
const NODE_Q = args.node ? `&node=${args.node}` : '';
mkdirSync(OUT, { recursive: true });

const server = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  server: { port: PORT, strictPort: true, host: '127.0.0.1' },
});
await server.listen();

const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium';
const browser = await chromium.launch({
  executablePath: existsSync(CHROME) ? CHROME : undefined,
  args: ['--no-sandbox'],
});
const errors = [];
for (const name of WANT) {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: Number(args.dpr ?? 1) });
  page.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) errors.push(`${name}: ${m.text()}`);
  });
  await page.goto(`http://127.0.0.1:${PORT}/tools/uilab.html?s=${encodeURIComponent(name)}${CLS}${NODE_Q}`, {
    waitUntil: 'load',
    timeout: 120000,
  });
  await page.waitForFunction(() => window.LAB_READY === true, null, { timeout: 120000 });
  await page.waitForTimeout(Number(args.wait ?? 1400));
  const file = path.join(OUT, `${name.replace(/\+/g, '_')}${WIDTH === 1920 ? '' : `_${WIDTH}`}.png`);
  // --clip=x,y,w,h photographs one region, handy with --dpr=2 for detail.
  const clip = args.clip ? String(args.clip).split(',').map(Number) : null;
  await page.screenshot({ path: file, clip: clip ? { x: clip[0], y: clip[1], width: clip[2], height: clip[3] } : undefined });
  console.log(`ok ${file}`);
  await page.close();
}
await browser.close();
await server.close();
if (errors.length) {
  console.error(errors.slice(0, 20).join('\n'));
  process.exit(1);
}
