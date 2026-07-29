/**
 * Two map questions, answered with numbers.
 *
 * 1. Does the minimap arrow point where the character is facing? For each of
 *    four headings the world direction and the drawn arrow direction must
 *    match, since both maps put +Z down the canvas.
 * 2. Does walking with the map closed reveal ground on it? The record is shared
 *    now, so the count should climb as the player moves regardless of which
 *    map is on screen.
 *
 *   npm run build && node tools/check-map.mjs
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4243;

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

await page.evaluate(async () => {
  window.SLAY.debug.makeCharacter('warden', 12);
  await window.SLAY.engine.goTo('dungeon', { depth: 1 });
  for (let i = 0; i < 40; i++) await new Promise((r) => requestAnimationFrame(r));
});

const arrow = await page.evaluate(() => window.SLAY.debug.arrowCheck());
console.log('facing        heading (x,z)   arrow (x,y)');
for (const r of arrow) {
  console.log(r.facing.padEnd(13), r.heading.padEnd(15), r.arrow);
}
const arrowOk = arrow.length === 4 && arrow.every((r) => r.heading === r.arrow);
console.log(arrowOk ? 'arrow: OK — points where the character faces' : 'arrow: FAILED');

// Walk with the map closed, then see how much it knows.
const walk = await page.evaluate(async () => {
  const before = window.SLAY.debug.exploredCount();
  const scene = window.SLAY.engine.currentScene;
  const input = window.SLAY.engine.input;
  const p = scene.player;
  // Shove the player around the floor; the minimap reveal runs off position.
  for (let step = 0; step < 8; step++) {
    input.pointerOverUI = false;
    p.moveTo(p.position.x + (step % 2 ? -7 : 7), p.position.z + 5);
    for (let i = 0; i < 45; i++) await new Promise((r) => requestAnimationFrame(r));
  }
  const after = window.SLAY.debug.exploredCount();
  return { before, after };
});
console.log('\nexplored tiles before walking:', walk.before.seen, 'after:', walk.after.seen);
const walkOk = walk.after.seen > walk.before.seen && walk.after.records === 1;
console.log(walkOk ? 'reveal: OK — one shared record, and it grew' : 'reveal: FAILED');

await browser.close();
server.kill('SIGTERM');
process.exit(arrowOk && walkOk ? 0 : 1);
