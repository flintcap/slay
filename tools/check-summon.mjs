/**
 * Does a summon put an actual creature in the world?
 *
 * Reported: "raise skeleton doesn't work". Summons used to be a glowing ring on
 * the floor that fired bolts, so pressing the button produced no skeleton. This
 * casts every summoning skill and checks three things: the cast was accepted, a
 * body was added to the scene, and the thing deals damage.
 *
 *   npm run build && node tools/check-summon.mjs
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4249;
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
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
page.on('console', (m) => {
  if (m.text().startsWith('[sum]')) console.log(m.text());
});
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.SLAY?.debug, null, { timeout: 900000, polling: 500 });

const r = await page.evaluate(async () => {
  const frame = () => new Promise((res) => requestAnimationFrame(res));
  const SUMMONS = {
    raiseSkeleton: 'revenant',
    skeletalMage: 'revenant',
    grandOssuary: 'revenant',
    claySentinel: 'revenant',
    swornBrother: 'warden',
    shadowClone: 'shadowblade',
    livingFlame: 'pyromancer',
    lightningRod: 'stormcaller',
  };
  const rows = [];
  const byClass = {};
  for (const [id, cls] of Object.entries(SUMMONS)) (byClass[cls] ??= []).push(id);

  for (const [cls, ids] of Object.entries(byClass)) {
    window.SLAY.debug.makeCharacter(cls, 40);
    await window.SLAY.engine.goTo('dungeon', { depth: 3 });
    for (let i = 0; i < 30; i++) await frame();
    const scene = window.SLAY.engine.currentScene;
    const c = window.SLAY.save.account.current;
    window.SLAY.debug.godMode(true);
    const ctx = scene.context();

    for (const id of ids) {
      c.skills[id] = 5;
      scene.player.actionLock = 0;
      scene.player.cooldowns?.clear();
      scene.player.mana = scene.player.stats.mana;
      const before = scene.skills.turrets ? scene.skills.turrets.length : -1;
      const sceneKids = scene.scene.children.length;

      let hits = 0;
      const off = window.SLAY.events.on('enemy:damaged', () => hits++);
      let fired = false;
      let error = null;
      try {
        fired = scene.skills.cast(id, scene.player, scene.player.position.clone(), ctx, scene.enemies, null);
      } catch (e) {
        error = String(e).slice(0, 120);
      }
      for (let f = 0; f < 20; f++) await frame();
      const list = scene.skills.turrets ?? [];
      const made = list.length - Math.max(0, before);
      const withBody = list.filter((t) => t.body).length;
      const moved = list.some((t) => t.body && t.gait > 0.01);
      off();
      rows.push({
        id, cls, fired, error,
        summoned: made,
        withBody,
        addedToScene: scene.scene.children.length - sceneKids,
        moved,
        hits,
      });
      console.log(`[sum] ${id} done`);
      // Clear between tests so counts stay readable.
      scene.skills.dispose?.();
      scene.skills.setContext?.(ctx, scene.enemies, null);
    }
  }
  return rows;
});

await browser.close();
server.kill('SIGTERM');

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${pad('skill', 16)} ${pad('class', 12)} ${pad('fired', 6)} ${pad('made', 5)} ${pad('bodies', 7)} ${pad('moved', 6)} hits`);
for (const x of r) {
  console.log(
    `${pad(x.id, 16)} ${pad(x.cls, 12)} ${pad(x.fired ? 'yes' : 'NO', 6)} ${pad(x.summoned, 5)} ${pad(x.withBody, 7)} ${pad(x.moved ? 'yes' : '-', 6)} ${x.hits}${x.error ? '  ERR ' + x.error : ''}`,
  );
}
// Totems are meant to be bodiless; everything else must show up.
const BODILESS = new Set(['lightningRod']);
const broken = r.filter((x) => !x.fired || x.summoned <= 0 || (!BODILESS.has(x.id) && x.withBody === 0));
if (broken.length) {
  console.log(`\nFAILED — ${broken.map((x) => x.id).join(', ')}`);
  process.exit(1);
}
console.log('\nOK — every summon fires and every creature summon has a body.');
