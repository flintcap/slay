/**
 * Photographs the character panel with one chosen weapon equipped.
 *
 *   node tools/shot-grip.mjs sword.short warden
 *
 * `check-grips.mjs` measures the grip and is the thing that gates a change;
 * this exists because a number can be right and a pose can still look wrong,
 * and getting the lean backwards was exactly that. Clips a region rather than
 * screenshotting the element: the figure turns on its own, so waiting for it to
 * hold still never returns.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const base = process.argv[2] ?? 'sword.short';
const cls = process.argv[3] ?? 'warden';

const PORT = 4219;
const server = spawn(
  'npx',
  ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
process.on('exit', () => server.kill('SIGTERM'));
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break;
  } catch {}
  await sleep(500);
}

const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.SLAY?.debug, null, { timeout: 420000, polling: 500 });

const info = await page.evaluate(
  ([baseId, classId]) => {
    window.SLAY.debug.makeCharacter(classId, 40);
    const c = window.SLAY.save.account.current;
    for (const k of Object.keys(c.equipment)) if (k !== 'chest') c.equipment[k] = null;
    const uid = window.SLAY.debug.equip(baseId, 30, 'rare');
    window.SLAY.events.emit('ui:refresh', {});
    window.SLAY.events.emit('ui:open', { panel: 'inventory' });
    return uid ? baseId : `could not equip ${baseId}`;
  },
  [base, cls],
);
console.log(cls, '->', info);

await page.waitForSelector('[data-panel="inventory"].is-open', { timeout: 120000 });
await page.waitForTimeout(6000);
const box = await page.evaluate(() => {
  const el = document.querySelector('.pd-view');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
});
mkdirSync('shots', { recursive: true });
const out = `shots/grip-${base.replace('.', '-')}.png`;
await page.screenshot({ path: out, clip: box ?? undefined });
console.log('wrote', out);

await browser.close();
server.kill('SIGTERM');
process.exit(0);
