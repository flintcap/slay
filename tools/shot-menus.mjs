/**
 * Screenshots of the front-end screens, without booting the 3D game.
 *
 * Serves `tools/menus-preview.html` with the Vite dev server and photographs
 * each screen in seconds rather than the many minutes a full render takes.
 * Fails on any page error, so it doubles as a smoke test for the menu code.
 *
 *   node tools/shot-menus.mjs --out=shots/menus --screens=title,charSelect,pause,settings,death
 *   (add --width=1280 --height=720 to check a small window)
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const OUT = path.resolve(args.out ?? 'shots/menus');
const SCREENS = String(
  args.screens ?? 'title,charSelect,charSelectNew,pause,settings,controls,death,banners,boss,hints,loading',
).split(',');
const WIDTH = Number(args.width ?? 1920);
const HEIGHT = Number(args.height ?? 1080);
const PORT = Number(args.port ?? process.env.SLAY_PORT ?? 4302);
mkdirSync(OUT, { recursive: true });
/** How long each screen's choreography takes to reach its best frame, in ms. */
const WAIT = { boss: 1500, hints: 6500, banners: 2200 };

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'ignore', 'pipe'],
});
process.on('exit', () => server.kill('SIGTERM'));
let up = false;
for (let i = 0; i < 120; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/tools/menus-preview.html`)).ok) {
      up = true;
      break;
    }
  } catch {
    /* not yet */
  }
  await sleep(500);
}
if (!up) {
  console.error('dev server never came up');
  process.exit(1);
}

const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium';
const browser = await chromium.launch({
  executablePath: existsSync(CHROME) ? CHROME : undefined,
  args: ['--no-sandbox'],
});
let failed = false;
for (const name of SCREENS) {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    // The preview page has no favicon; that 404 is not the menus' fault.
    if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text());
  });
  await page.goto(`http://127.0.0.1:${PORT}/tools/menus-preview.html?screen=${name}`, { waitUntil: 'load', timeout: 180000 });
  try {
    await page.waitForFunction(() => window.MENUS_READY === true, null, { timeout: 180000 });
  } catch {
    errors.push('preview never became ready');
  }
  // Let the entrance choreography finish (the slowest is the death screen).
  await sleep(Number(args.wait ?? WAIT[name] ?? 3600));
  const file = path.join(OUT, `${name}${WIDTH !== 1920 ? `-${WIDTH}` : ''}.png`);
  await page.screenshot({ path: file });
  console.log(`${errors.length ? 'ERR ' : 'ok  '} ${name.padEnd(14)} ${file}`);
  for (const e of errors) console.log('     ' + e.slice(0, 300));
  if (errors.length) failed = true;
  await page.close();
}
await browser.close();
server.kill('SIGTERM');
process.exit(failed ? 1 : 0);
