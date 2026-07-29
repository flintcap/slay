/**
 * Renders a ranger mid-shot and writes the frame out.
 *
 * The arrow visual has been "fixed" twice from code inspection alone and was
 * wrong both times. This tool exists so the fix is judged by looking at the
 * picture, which is the only test that matches how the player judges it.
 *
 *   node tools/check-arrow.mjs
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4231;
const OUT = 'shots';
mkdirSync(OUT, { recursive: true });

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'ignore', 'pipe'],
});
process.on('exit', () => server.kill('SIGTERM'));
for (let i = 0; i < 90; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break;
  } catch {}
  await sleep(500);
}

const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 400)));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.SLAY?.debug, null, { timeout: 900000, polling: 500 });

const gear = await page.evaluate(async () => {
  window.SLAY.debug.makeCharacter('ranger', 10);
  const c = window.SLAY.save.account.current;
  const LOOT = await import('/src/sim/Loot.ts');
  const INV = await import('/src/sim/Character.ts');
  const RNG = await import('/src/core/RNG.ts');
  const rng = new RNG.Random(11);
  // A ranger without a bow falls back to a melee swing, which renders no
  // projectile at all and makes the shot look "fixed" when nothing fired.
  const bow = LOOT.newItem(LOOT.getBase('bow.short'), 10, 'rare', rng);
  INV.equipItem(c, bow);
  await window.SLAY.engine.goTo('dungeon', { depth: 1 });
  for (let i = 0; i < 30; i++) await new Promise((r) => requestAnimationFrame(r));
  return { main: c.equipment.mainHand?.baseId ?? null, off: c.equipment.offHand?.baseId ?? null };
});
console.log('gear:', JSON.stringify(gear));

// Fire, then hold the frame a moment after launch so the arrow is in the air
// rather than at the muzzle or already landed.
const info = await page.evaluate(async () => {
  const scene = window.SLAY.engine.currentScene;
  const pl = scene.player;
  const input = window.SLAY.engine.input;
  // Drive the real input path rather than reaching into the skill runner, so
  // what gets rendered is exactly what a player pressing the button would see.
  input.pointerOverUI = false;
  input.worldPoint.set(pl.position.x + 9, 0, pl.position.z + 1);
  input.mouseRight = true;
  await new Promise((r) => requestAnimationFrame(r));
  input.mouseRight = false;
  for (let i = 0; i < 8; i++) await new Promise((r) => requestAnimationFrame(r));

  // Count what is actually in the scene near the shot.
  const kinds = {};
  scene.scene.traverse((o) => {
    if (!o.visible) return;
    if (o.isMesh || o.isSprite) {
      const d = o.position.distanceTo(pl.position);
      if (d < 12) kinds[o.type + ':' + (o.material?.type ?? '?')] = (kinds[o.type + ':' + (o.material?.type ?? '?')] ?? 0) + 1;
    }
  });
  let pointLights = 0;
  scene.scene.traverse((o) => {
    if (o.isPointLight && o.visible) pointLights++;
  });
  return { kinds, pointLights, info: window.SLAY.engine.renderer.gl?.info?.programs?.length ?? -1 };
});
console.log('scene near player:', JSON.stringify(info, null, 1));

await page.screenshot({ path: `${OUT}/arrow.png` });
console.log(`wrote ${OUT}/arrow.png`);

await browser.close();
server.kill('SIGTERM');
process.exit(0);
