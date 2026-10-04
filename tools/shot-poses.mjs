/**
 * Renders a pose sheet: real models and the real animator, frozen at chosen
 * moments and laid out in a grid. Fast, because it never boots the game.
 *
 *   SLAY_PORT=4303 node tools/shot-poses.mjs --set=gait [--out=shots/animation]
 *
 * Sets live in `tools/pose-sheet.ts`.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const SET = String(args.set ?? 'gait');
const OUT = path.resolve(String(args.out ?? 'shots/animation'));
const PORT = Number(process.env.SLAY_PORT ?? 4303);

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'ignore', 'pipe'],
});
const shutdown = () => server.kill('SIGTERM');
process.on('exit', shutdown);
for (let i = 0; i < 120; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break;
  } catch {}
  await sleep(500);
}

const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text());
});
const extra = Object.entries(args)
  .filter(([k]) => ['cols', 'w', 'h'].includes(k))
  .map(([k, v]) => `&${k}=${v}`)
  .join('');
await page.goto(`http://127.0.0.1:${PORT}/tools/pose-sheet.html?set=${SET}${extra}`, { waitUntil: 'commit', timeout: 600000 });
await page.waitForFunction(() => window.POSES_READY === true, null, { timeout: 600000, polling: 500 });
mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, `poses-${SET}.png`);
await page.screenshot({ path: file, fullPage: true });
console.log('wrote', file);
for (const e of errors.slice(0, 10)) console.error('  ', e);
await browser.close();
shutdown();
process.exit(errors.length ? 1 : 0);
