/**
 * Headless check of the potion loop: do they drop, and does drinking one
 * actually change your life and mana?
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4218;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'ignore', 'pipe'],
});
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
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.SLAY?.debug, null, { timeout: 420000, polling: 500 });

// 1. Drop rates across ranks and depths.
const rates = await page.evaluate(async () => {
  const LOOT = await import('/src/sim/Loot.ts');
  const RNG = await import('/src/core/RNG.ts');
  const out = {};
  for (const rank of ['normal', 'champion', 'elite', 'rare', 'boss']) {
    for (const lvl of [1, 20, 50]) {
      const rng = new RNG.Random(1234);
      let hits = 0;
      const sizes = {};
      for (let i = 0; i < 2000; i++) {
        const p = LOOT.rollPotion(lvl, rank, rng);
        if (p) {
          hits++;
          sizes[p.baseId] = (sizes[p.baseId] ?? 0) + 1;
        }
      }
      out[`${rank}@${lvl}`] = { pct: +((hits / 2000) * 100).toFixed(1), sizes };
    }
  }
  return out;
});
for (const [k, v] of Object.entries(rates)) {
  console.log(k.padEnd(14), String(v.pct).padStart(5) + '%', Object.keys(v.sizes).join(','));
}

// 2. Drinking. Enter a dungeon, take damage, drink, confirm life moved.
const drink = await page.evaluate(async () => {
  window.SLAY.debug.makeCharacter('warden', 12);
  const c = window.SLAY.save.account.current;
  const INV = await import('/src/sim/Inventory.ts');
  const LOOT = await import('/src/sim/Loot.ts');
  const RNG = await import('/src/core/RNG.ts');
  const rng = new RNG.Random(7);
  for (const id of ['potion.heal.light', 'potion.mana.light']) {
    INV.addItemToInventory(c, LOOT.newItem(LOOT.getBase(id), 10, 'normal', rng));
  }
  await window.SLAY.engine.goTo('dungeon', { depth: 1 });
  for (let i = 0; i < 10; i++) await new Promise((r) => requestAnimationFrame(r));

  const scene = window.SLAY.engine.currentScene;
  const pl = scene?.player;
  if (!pl) return { error: 'no player' };
  pl.life = Math.max(1, pl.stats.life * 0.25);
  pl.mana = Math.max(1, pl.stats.mana * 0.25);
  const before = { life: pl.life, mana: pl.mana };

  window.SLAY.events.emit('potion:use', { kind: 'life' });
  window.SLAY.events.emit('potion:use', { kind: 'mana' });
  for (let i = 0; i < 5; i++) await new Promise((r) => requestAnimationFrame(r));

  const counts = {};
  for (const s of c.inventory) if (s && s.baseId.startsWith('potion')) counts[s.baseId] = (counts[s.baseId] ?? 0) + 1;
  return {
    before,
    after: { life: pl.life, mana: pl.mana },
    leftover: counts,
  };
});
console.log('drink:', JSON.stringify(drink));

// 3. Dual wield fires twice.
const dual = await page.evaluate(async () => {
  const SR = await import('/src/scenes/SkillRunner.ts');
  const scene = window.SLAY.engine.currentScene;
  const pl = scene?.player;
  if (!pl) return 'no player';
  const LOOT = await import('/src/sim/Loot.ts');
  const RNG = await import('/src/core/RNG.ts');
  const rng = new RNG.Random(3);
  const eq = pl.character.equipment;
  eq.mainHand = LOOT.newItem(LOOT.getBase('sword.short'), 10, 'normal', rng);
  eq.offHand = LOOT.newItem(LOOT.getBase('dagger.dirk'), 10, 'normal', rng);
  return { dualWield: SR.isDualWielding(pl), main: eq.mainHand.baseId, off: eq.offHand.baseId };
});
console.log('dual:', JSON.stringify(dual));

await browser.close();
server.kill('SIGTERM');
process.exit(0);
