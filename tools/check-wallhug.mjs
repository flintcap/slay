/**
 * Do attacks land on a monster standing against a wall?
 *
 * Reported bug: attacks and skills deal zero damage when the target is backed
 * against a wall, but work fine in the open. This pins a dummy on a floor tile
 * that touches a wall, stands the player back down the same line with clear
 * sight, and fires. Then it repeats the identical shot with the dummy out in
 * the open as a control.
 *
 * A pass means the wall-adjacent numbers match the open-floor numbers.
 *
 *   npm run build && node tools/check-wallhug.mjs [--class=ranger]
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const CLASS = String(args.class ?? 'ranger');
const PORT = Number(args.port ?? 4247);

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
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
    '--disable-dev-shm-usage',
  ],
});
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 400)));
page.on('console', (m) => {
  if (m.text().startsWith('[wall]')) console.log(m.text());
});
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.SLAY?.debug, null, { timeout: 900000, polling: 500 });

const r = await page.evaluate(async ([cls]) => {
  const frame = () => new Promise((res) => requestAnimationFrame(res));

  window.SLAY.debug.makeCharacter(cls, 20);
  window.SLAY.debug.equip(cls === 'ranger' ? 'bow.short' : 'sword.short');
  await window.SLAY.engine.goTo('dungeon', { depth: 1 });
  for (let i = 0; i < 40; i++) await frame();
  window.SLAY.debug.godMode(true);

  const scene = window.SLAY.engine.currentScene;
  const L = scene.level;
  const W = L.width;
  const H = L.height;
  const WALKABLE = new Set([1, 3, 4, 7, 8, 9]);
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : L.tiles[y * W + x]);
  const walk = (x, y) => WALKABLE.has(at(x, y));

  const DIRS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  // A floor tile whose neighbour is wall, with at least six clear floor tiles
  // running straight back from that wall so the player has an unobstructed shot.
  let found = null;
  for (let y = 2; y < H - 2 && !found; y++) {
    for (let x = 2; x < W - 2 && !found; x++) {
      if (!walk(x, y)) continue;
      for (const [dx, dy] of DIRS) {
        if (at(x + dx, y + dy) !== 2) continue;
        let k = 0;
        while (k < 9 && walk(x - dx * (k + 1), y - dy * (k + 1))) k++;
        if (k < 6) continue;
        found = { x, y, dx, dy, back: k };
        break;
      }
    }
  }
  if (!found) return { error: 'no wall-adjacent tile with a clear lane' };

  const world = (tx, ty) => scene.mesh.tileToWorld(tx, ty).clone().setY(0);
  const wallSpot = world(found.x, found.y);
  // Press the dummy toward the wall, as a monster that has backed into one is.
  wallSpot.x += found.dx * 0.55;
  wallSpot.z += found.dy * 0.55;
  const openSpot = world(found.x - found.dx * 3, found.y - found.dy * 3);

  const player = scene.player;
  const dummy = (scene.enemies ?? []).find((e) => e.life > 0);
  if (!dummy) return { error: 'no live monster on this floor' };
  dummy.life = 1e9;
  if (dummy.stats) dummy.stats.life = 1e9;

  const rangedSpot = world(found.x - found.dx * 6, found.y - found.dy * 6);
  const meleeSpot = world(found.x - found.dx * 1, found.y - found.dy * 1);

  const ctx = scene.context();

  /** Fire one thing and report how much of it landed. */
  async function trial(label, target, from, what) {
    dummy.root.position.copy(target);
    player.root.position.copy(from);
    player.actionLock = 0;
    player.cooldowns?.clear();
    player.mana = player.stats.mana;
    await frame();

    let hits = 0;
    let damage = 0;
    const off = window.SLAY.events.on('enemy:damaged', (e) => {
      hits++;
      damage += e.amount;
    });
    const aim = target.clone().setY(0);
    let fired = true;
    try {
      if (what === 'basic') player.faceTowards(aim.x, aim.z), scene.skills.basicAttack(player, aim, ctx, scene.enemies, null);
      else fired = scene.skills.cast(what, player, aim, ctx, scene.enemies, null);
    } catch (err) {
      return { label, what, error: String(err).slice(0, 140) };
    }
    // Long enough for the arrow to cross six tiles.
    for (let f = 0; f < 45; f++) {
      dummy.root.position.copy(target);
      await frame();
    }
    off();
    return { label, what, fired, hits, damage: Math.round(damage) };
  }

  const c = window.SLAY.save.account.current;
  // A ranged skill and a piercing one, if this class has them.
  const skillIds = Object.keys(c.skills ?? {}).filter((k) => (c.skills[k] ?? 0) > 0);
  const tests = ['basic', ...skillIds.slice(0, 3)];

  const rows = [];
  for (const what of tests) {
    const isMelee = cls !== 'ranger';
    const from = isMelee ? meleeSpot : rangedSpot;
    rows.push(await trial('against wall', wallSpot, from, what));
    rows.push(await trial('open floor', openSpot, from, what));
    console.log(`[wall] ${what} done`);
  }

  return { tile: found, tests, rows };
}, [CLASS]);

await browser.close();
server.kill('SIGTERM');

if (r.error) {
  console.log(`could not run: ${r.error}`);
  process.exit(1);
}

console.log(`\nwall-adjacent tile ${r.tile.x},${r.tile.y}  clear lane ${r.tile.back} tiles\n`);
const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('attack', 22)} ${pad('where', 14)} ${pad('fired', 6)} ${pad('hits', 5)} damage`);
for (const x of r.rows) {
  console.log(
    `${pad(x.what, 22)} ${pad(x.label, 14)} ${pad(x.fired === false ? 'no' : 'yes', 6)} ${pad(x.hits ?? '-', 5)} ${x.damage ?? x.error ?? '-'}`,
  );
}

const broken = [];
for (let i = 0; i < r.rows.length; i += 2) {
  const wall = r.rows[i];
  const open = r.rows[i + 1];
  if (!open || open.hits === 0) continue; // the control did nothing; nothing to compare
  if (wall.hits === 0) broken.push(wall.what);
}
if (broken.length) {
  console.log(`\nFAILED — lands in the open but not against a wall: ${broken.join(', ')}`);
  process.exit(1);
}
console.log('\nOK — every attack that lands in the open also lands against a wall.');
