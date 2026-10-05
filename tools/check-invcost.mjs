/**
 * How long the inventory blocks for on a cold open.
 *
 * `blockingMs` is what the player feels: the synchronous work between pressing
 * I and the panel appearing. `eagerMs` is the same icons drawn the old way, all
 * up front. The gap between them is the fix. Then how long the icons take to
 * fill in once the pack is open (`inventoryIconSettle`).
 *
 *   npm run build && node tools/check-invcost.mjs
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.SLAY_PORT ?? 4237);

if (!existsSync('dist/index.html')) {
  console.error('No dist/ build. Run `npm run build` first.');
  process.exit(1);
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  // Own process group: npx starts vite as a child, and killing npx alone
  // left vite running and holding the port after the checker exited.
  detached: true,
  stdio: ['ignore', 'ignore', 'pipe'],
});
const killServer = () => {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
};
process.on('exit', killServer);
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
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 400)));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.SLAY?.debug, null, { timeout: 900000, polling: 500 });

const r = await page.evaluate(() => {
  window.SLAY.debug.makeCharacter('warden', 30);
  return window.SLAY.debug.inventoryOpenCost(60);
});
console.log(JSON.stringify(r, null, 1));
console.log(
  `\nopening the pack blocks for ${r.blockingMs}ms instead of ${r.eagerMs}ms ` +
    `(${(r.eagerMs / Math.max(0.1, r.blockingMs)).toFixed(0)}x)`
);

// How long a cold pack takes to fill in once open (the icons trickle in a few
// per frame). Software rendering paints canvases on the CPU, so a real machine
// is several times faster than this.
const settle = await page.evaluate(() => window.SLAY.debug.inventoryIconSettle(60));
console.log(JSON.stringify(settle));
console.log(
  `a cold pack of ${settle.items} fills in ${settle.allMs}ms over ${settle.frames} frames ` +
    `(first icon ${settle.firstMs}ms, ${settle.msPerIcon}ms per icon)`
);

await browser.close();
killServer();
process.exit(0);
