/**
 * Does a basic attack take a monster's life off?
 *
 * Drives the real right-click path and reads the victim's life before and
 * after, plus every stage a basic attack can fail at silently.
 *
 *   npm run build && node tools/check-attack.mjs [--class=warden]
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const CLASS = String(args.class ?? 'warden');
const PORT = Number(args.port ?? 4245);

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

const r = await page.evaluate(async ([cls]) => {
  window.SLAY.debug.makeCharacter(cls, 12);
  await window.SLAY.engine.goTo('dungeon', { depth: 1 });
  for (let i = 0; i < 40; i++) await new Promise((res) => requestAnimationFrame(res));

  // No dying mid-test.
  window.SLAY.debug.godMode(true);

  // Count real damage events rather than inferring from life, so a monster
  // that dies or regenerates cannot hide the answer.
  const hits = [];
  window.SLAY.events.on('enemy:damaged', (e) => hits.push(Math.round(e.amount)));

  const probe = window.SLAY.debug.attackProbe();
  window.SLAY.debug.releaseAttack();

  // Glued adjacent to a monster: isolates the swing from the walk.
  const glued = await window.SLAY.debug.swingProbe(8);

  const before = window.SLAY.debug.totalEnemyLife();
  let aimed = 0;
  // Walk the player at the pack so a melee swing can actually reach, and
  // re-aim every frame because monsters move.
  // Hold the button at the nearest monster and nothing else. Walking into
  // range is the game's job now, which is the whole point of the test.
  for (let i = 0; i < 240; i++) {
    if (window.SLAY.debug.aimAtNearest()) aimed++;
    await new Promise((res) => requestAnimationFrame(res));
  }
  window.SLAY.debug.releaseAttack();
  const after = window.SLAY.debug.totalEnemyLife();

  return { probe, glued, before, after, aimedFrames: aimed, hits: hits.length, damage: hits.reduce((a, b) => a + b, 0) };
}, [CLASS]);

console.log(JSON.stringify(r, null, 1));

console.log(
  `\nglued adjacent: ${r.glued.directHits} hits calling the swing directly, ` +
    `${r.glued.inputHits} through the right-click path`
);
console.log(`roaming: ${r.hits} hits for ${r.damage} damage over ${r.aimedFrames} aimed frames`);
const ok = r.glued.directHits > 0 && r.glued.inputHits > 0 && r.hits >= 8;
console.log(
  ok
    ? `OK — the swing connects, and holding the button closes the distance.`
    : r.glued.directHits > 0
      ? 'FAILED — the swing works but the right-click path does not reach it.'
      : 'FAILED — the swing itself lands nothing.'
);

await browser.close();
server.kill('SIGTERM');
process.exit(ok ? 0 : 1);
