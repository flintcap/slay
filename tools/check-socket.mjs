/**
 * Does dragging a gem onto a socketed item put it in the socket?
 *
 * Drives the inventory panel's own drop handler — the same call a real drag
 * makes — rather than re-implementing the rules here, so a pass means the
 * thing the player touches works.
 *
 *   npm run build && node tools/check-socket.mjs
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4241;

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
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 400)));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.SLAY?.debug, null, { timeout: 900000, polling: 500 });

const r = await page.evaluate(async () => {
  window.SLAY.debug.makeCharacter('warden', 30);
  await window.SLAY.engine.goTo('town');
  for (let i = 0; i < 20; i++) await new Promise((res) => requestAnimationFrame(res));
  return window.SLAY.debug.socketByDrag();
});
console.log(JSON.stringify(r, null, 1));

const ok = r.handled === true && r.socketsAfter?.[0] === r.gemId && r.gemStillInPack === false;
console.log(ok ? '\nOK — the gem went into the first empty socket.' : '\nFAILED');

await browser.close();
server.kill('SIGTERM');
process.exit(ok ? 0 : 1);
