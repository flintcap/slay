/**
 * Renders a geared character from the front and the back, and lists every mesh
 * hanging off their skeleton with the slot it came from.
 *
 * Runs against the built bundle, not the dev server. The dev server re-transforms
 * every module on boot and reloads on any source edit, which under software
 * rendering means it can take longer to become ready than the run is allowed —
 * `npm run build` once, then this is comparatively quick.
 *
 *   npm run build && node tools/check-worn.mjs --class=ranger
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const CLASS = String(args.class ?? 'ranger');
const PORT = Number(args.port ?? 4233);
const OUT = 'shots';
mkdirSync(OUT, { recursive: true });

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

// Gear the character deliberately: random rolls give an archer with no bow.
const gear = await page.evaluate(async ([cls]) => {
  const d = window.SLAY.debug;
  d.makeCharacter(cls, 12);
  const worn = {
    chest: d.equip('chest.leather'),
    mainHand: cls === 'ranger' ? d.equip('bow.short') : d.equip('sword.short'),
  };
  await window.SLAY.engine.goTo('dungeon', { depth: 1 });
  for (let i = 0; i < 40; i++) await new Promise((r) => requestAnimationFrame(r));
  const c = window.SLAY.save.account.current;
  return {
    ok: worn,
    equipped: Object.fromEntries(
      Object.entries(c.equipment).map(([k, v]) => [k, v?.baseId ?? null])
    ),
  };
}, [CLASS]);
console.log('equipped:', JSON.stringify(gear.equipped, null, 1));

const parts = await page.evaluate(() => window.SLAY.debug.wornParts());
console.log(`\n${parts.length} meshes on the skeleton:`);
for (const p of parts) {
  console.log(`  ${p.slot.padEnd(14)} bone=${(p.bone || '-').padEnd(10)} y=${String(p.pos[1]).padStart(7)} z=${String(p.pos[2]).padStart(7)}  ${p.name}`);
}

await page.screenshot({ path: `${OUT}/worn-${CLASS}-front.png` });

// Spin the camera behind them. The stray panel the player reported is on the
// back, which the default over-the-shoulder view never shows.
await page.evaluate(async () => {
  const s = window.SLAY.engine.currentScene;
  if (s.rig && typeof s.rig.yaw === 'number') s.rig.yaw += Math.PI;
  for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
});
await page.screenshot({ path: `${OUT}/worn-${CLASS}-back.png` });
console.log(`\nwrote ${OUT}/worn-${CLASS}-{front,back}.png`);

await browser.close();
server.kill('SIGTERM');
process.exit(0);
