/**
 * Reproduces the "hold W + click never stops running" report.
 *
 * Drives real input events at the page, then samples the player's velocity and
 * move target after every input has been released. If the player is still
 * moving seconds later, the bug is confirmed and the sample tells us which
 * input path is stuck.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4197;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'ignore', 'pipe'],
});
process.on('exit', () => server.kill('SIGTERM'));
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch { /* wait */ }
  await sleep(500);
}

const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.SLAY?.debug, null, { timeout: 420000, polling: 500 });

await page.evaluate(async () => {
  window.SLAY.debug.makeCharacter('warden', 5);
  await window.SLAY.engine.goTo('town');
});
await page.waitForFunction(() => window.SLAY.engine.currentSceneId === 'town', null, { polling: 500, timeout: 120000 });

const sample = () =>
  page.evaluate(() => {
    const s = window.SLAY.engine.currentScene;
    const p = s.player;
    const i = window.SLAY.engine.input;
    return {
      pos: [+p.position.x.toFixed(2), +p.position.z.toFixed(2)],
      speed: +Math.hypot(p.velocity?.x ?? 0, p.velocity?.z ?? 0).toFixed(3),
      hasMoveTarget: !!p.moveTarget,
      moveTarget: p.moveTarget ? [+p.moveTarget.x.toFixed(1), +p.moveTarget.z.toFixed(1)] : null,
      mouseLeft: i.mouseLeft,
      keyW: i.keyDown('KeyW'),
      worldPoint: [+i.worldPoint.x.toFixed(1), +i.worldPoint.z.toFixed(1)],
      camPos: [+s.camera.position.x.toFixed(1), +s.camera.position.z.toFixed(1)],
    };
  });

/** Software rendering is slow; advance by real frames, not wall time. */
const frames = (n) =>
  page.evaluate(
    (k) => new Promise((r) => { let i = 0; const s = () => (++i >= k ? r() : requestAnimationFrame(s)); requestAnimationFrame(s); }),
    n
  );

console.log('baseline      ', JSON.stringify(await sample()));

// Hold W.
await page.keyboard.down('w');
await frames(20);
console.log('W held        ', JSON.stringify(await sample()));

// Click while W is still held (press and release, as a real click).
await page.mouse.move(900, 250);
await page.mouse.down();
await frames(6);
console.log('W + mousedown ', JSON.stringify(await sample()));
await page.mouse.up();
await frames(6);
console.log('W + click done', JSON.stringify(await sample()));

// Release W — everything is now released; the player must come to a stop.
await page.keyboard.up('w');
for (const n of [10, 30, 60, 120]) {
  await frames(n);
  console.log(`after +${String(n).padStart(3)}f  `, JSON.stringify(await sample()));
}

await browser.close();
server.kill('SIGTERM');
process.exit(0);
