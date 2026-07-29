/**
 * Where the frame goes when an item hits the floor.
 *
 * Breaks a drop into its stages — the 3D model, the inventory icon — and times
 * each cold (first of its rarity, paying for whatever it caches) and warm.
 * Guessing at this from source has been wrong before; the numbers are not.
 *
 *   npm run build && node tools/check-dropcost.mjs
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4235;

if (!existsSync('dist/index.html')) {
  console.error('No dist/ build. Run `npm run build` first.');
  process.exit(1);
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'ignore', 'pipe'],
});
process.on('exit', () => server.kill('SIGTERM'));
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

const cost = await page.evaluate(() => window.SLAY.debug.dropCost(12));
console.log('rarity     coldModel  coldIcon  warmModel  warmIcon   (ms)');
for (const [rarity, v] of Object.entries(cost)) {
  console.log(
    rarity.padEnd(10),
    String(v.coldModelMs).padStart(9),
    String(v.coldIconMs).padStart(9),
    String(v.warmModelMs).padStart(10),
    String(v.warmIconMs).padStart(9)
  );
}

await browser.close();
server.kill('SIGTERM');
process.exit(0);
