/**
 * Can you throw an item away, and can you pick it back up?
 *
 *   npm run build && node tools/check-drop.mjs
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4239;

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
  window.SLAY.debug.makeCharacter('warden', 12);
  await window.SLAY.engine.goTo('dungeon', { depth: 1 });
  for (let i = 0; i < 30; i++) await new Promise((res) => requestAnimationFrame(res));

  const scene = window.SLAY.engine.currentScene;
  const c = window.SLAY.save.account.current;
  const item = c.inventory.find((it) => it);
  if (!item) return { error: 'nothing in the pack' };

  const before = { ground: scene.loot.length, held: c.inventory.filter(Boolean).length };

  // Exactly what the panel does: take it out, then tell the scene.
  const i = c.inventory.findIndex((it) => it?.uid === item.uid);
  c.inventory[i] = null;
  window.SLAY.events.emit('loot:discard', { item });
  for (let k = 0; k < 5; k++) await new Promise((res) => requestAnimationFrame(res));

  const after = { ground: scene.loot.length, held: c.inventory.filter(Boolean).length };
  const onFloor = scene.loot.some((l) => l.item?.uid === item.uid);

  // And back up again.
  const tookIt = scene.pickUpByUid ? scene.pickUpByUid(item.uid) : null;
  for (let k = 0; k < 5; k++) await new Promise((res) => requestAnimationFrame(res));
  const back = c.inventory.some((it) => it?.uid === item.uid);

  return { name: item.name, before, after, onFloor, tookIt, back, ground: scene.loot.length };
});
console.log(JSON.stringify(r, null, 1));

const ok = r.onFloor && r.after.ground === r.before.ground + 1 && r.back;
console.log(ok ? '\nOK — dropped to the floor and picked back up.' : '\nFAILED');

await browser.close();
server.kill('SIGTERM');
process.exit(ok ? 0 : 1);
