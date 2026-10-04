/**
 * Browser smoke test for the depth stream's systems, in the real game.
 *
 *   npm run build && SLAY_PORT=4306 node tools/smoke-depth.mjs
 *
 * Boots the built game, makes a character wearing item powers, walks into a
 * dungeon and drives real `Enemy.takeDamage` calls through the live power
 * runtime. Then opens every depth panel. Fails on any page error, or when a
 * power that must visibly act does not. Slow under software rendering: boot
 * alone takes minutes.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.SLAY_PORT ?? 4306);
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 400)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 400));
});
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.SLAY?.debug, null, { timeout: 600000, polling: 500 });

const result = await page.evaluate(async () => {
  const S = window.SLAY;
  localStorage.clear();
  S.save.hardReset();
  S.debug.makeCharacter('warden', 20);
  const c = S.save.account.current;
  // A melee weapon with Cleaving and an amulet with Rime: both visible in play.
  const sword = c.equipment.mainHand;
  if (sword) sword.powers = [{ id: 'cleave', mag: 1 }];
  if (c.equipment.amulet) c.equipment.amulet.powers = [{ id: 'chillOnHit', mag: 1 }];
  else {
    const amulet = { ...sword, uid: 'smoke-amulet', baseId: 'amulet.amulet', name: 'Smoke Amulet', mods: [], sockets: [], powers: [{ id: 'chillOnHit', mag: 1 }] };
    c.equipment.amulet = amulet;
  }
  await S.engine.goTo('dungeon', { depth: 3 });
  for (let i = 0; i < 40; i++) await new Promise((r) => requestAnimationFrame(r));
  const scene = S.engine.currentScene;
  scene.powers.refresh();
  scene.player.refreshStats();
  const out = { enemies: scene.enemies.length };
  // Two monsters next to each other, then hit one as the player.
  const [a, b] = scene.enemies.filter((e) => e.life > 0);
  if (!a || !b) return { ...out, error: 'not enough enemies' };
  b.root.position.copy(a.root.position).add({ x: 1.0, y: 0, z: 0 });
  const bLife = b.life;
  scene.player.stats.lifeSteal = 10;
  scene.player.life = scene.player.stats.life * 0.5;
  const lifeBefore = scene.player.life;
  const ctx = scene.context();
  a.takeDamage({ amount: 50, type: 'physical', crit: false, source: 'player', ability: 'Attack' }, ctx);
  out.cleaveLanded = b.life < bLife;
  out.chilled = a.hasStatus('chilled');
  out.leeched = scene.player.life > lifeBefore;
  // Loot filter: a strict filter hides a plain drop.
  S.save.account.lootFilter = { enabled: true, minRarity: 'set', keepPowers: true, keepTopTier: false, keepSockets: 0, hideOtherClasses: false, showGems: true, showRunes: true, showPotions: true };
  const plain = JSON.parse(JSON.stringify(sword));
  plain.uid = 'smoke-plain';
  plain.rarity = 'normal';
  plain.powers = undefined;
  plain.mods = [];
  plain.sockets = [];
  scene.dropItem(plain, scene.player.position);
  out.filterHid = scene.loot[scene.loot.length - 1]?.hidden === true;
  // Legacy: killing things earns renown that is banked at once.
  const renown0 = S.save.account.legacy?.renown ?? 0;
  for (const e of scene.enemies.slice(0, 6)) e.takeDamage({ amount: 1e9, type: 'physical', crit: false, source: 'player', ability: 'Attack' }, ctx);
  for (let i = 0; i < 90; i++) await new Promise((r) => requestAnimationFrame(r));
  out.renownGained = (S.save.account.legacy?.renown ?? 0) - renown0;
  out.kills = S.save.account.legacy?.stats?.kills ?? 0;
  return out;
});

// Every depth panel opens without throwing.
const panels = ['lootFilter', 'legacy'];
for (const id of panels) {
  await page.evaluate((p) => window.SLAY.events.emit('ui:open', { panel: p }), id);
  await sleep(300);
  const open = await page.evaluate((p) => !!document.querySelector(`[data-panel="${p}"].is-open, #panel-${p}.is-open, .panel.is-open`), id);
  result[`panel_${id}`] = open;
  await page.evaluate((p) => window.SLAY.events.emit('ui:close', { panel: p }), id);
}

console.log(JSON.stringify({ result, errors }, null, 2));
await browser.close();
const bad = errors.length > 0 || result.error || !result.cleaveLanded || !result.chilled || !result.leeched || !result.filterHid || !(result.kills > 0);
console.log(bad ? 'FAILED' : 'OK — depth systems work in the live game.');
process.exit(bad ? 1 : 0);
