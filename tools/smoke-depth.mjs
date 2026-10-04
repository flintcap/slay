/**
 * Browser smoke test for the depth stream's systems, in the real game.
 *
 *   npm run build && SLAY_PORT=4306 node tools/smoke-depth.mjs
 *
 * Boots the built game, makes a character wearing item powers, walks into a
 * dungeon and drives real `Enemy.takeDamage` calls through the live power
 * runtime. Then opens every depth panel. Fails on any page error, or when a
 * power that must visibly act does not. Then springs a fallen adventurer,
 * takes a bargain at a shrine of choices through the real panel, and checks a
 * treasure runner spawns on a floor that rolled one. Slow under software rendering: boot
 * alone takes minutes.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.SLAY_PORT ?? 4306);
const OUT = 'shots/depth';
mkdirSync(OUT, { recursive: true });
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
  // Software rendering draws a frame every few seconds, so never wait a fixed
  // number of frames: wait until the thing is true, or give up after `max`.
  const until = async (test, max) => {
    for (let i = 0; i < max; i++) {
      if (test()) return true;
      await new Promise((r) => requestAnimationFrame(r));
    }
    return test();
  };
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
  await until(() => S.engine.currentScene?.enemies?.length > 0 && S.engine.currentScene?.powers, 40);
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
  await until(() => (S.save.account.legacy?.renown ?? 0) > renown0, 90);
  out.renownGained = (S.save.account.legacy?.renown ?? 0) - renown0;
  out.kills = S.save.account.legacy?.stats?.kills ?? 0;

  // Dungeon events, through the live scene's own runner and props.
  const ev = scene.dungeonEvents;
  out.eventKinds = (scene.level.events ?? []).map((e) => e.kind);
  out.eventProps = scene.mesh.interactables.filter((i) => ['chest.cursed', 'corpse.ambush', 'shrine.choice'].includes(i.kind)).map((i) => i.kind);
  const near = (kind, dx) => {
    const real = scene.mesh.interactables.find((i) => i.kind === kind && !i.used);
    if (real) return real;
    const x = scene.player.position.x + dx;
    const z = scene.player.position.z;
    const t = scene.mesh.worldToTile(x, z);
    return { kind, propKind: kind.split('.')[0], tileX: t.x, tileY: t.y, x, y: 0, z, index: 0, meshes: [], used: false };
  };
  const before = scene.enemies.length;
  out.fallenHandled = ev.interact(near('corpse.ambush', 2));
  await until(() => scene.enemies.length - before >= 5, 60);
  out.ambushers = scene.enemies.length - before;
  // The shrine opens the choice panel; accept the first bargain.
  ev.interact(near('shrine.choice', -2));
  await new Promise((r) => setTimeout(r, 300));
  const choice = document.querySelector('[data-panel="choice"]');
  out.choiceOpen = !!choice?.classList.contains('is-open');
  const statuses0 = scene.player.status.list().length;
  choice?.querySelector('.depth-card:not(.is-locked) button')?.click();
  await new Promise((r) => setTimeout(r, 300));
  out.choiceClosed = !choice?.classList.contains('is-open');
  out.bargainTaken = scene.player.status.list().length > statuses0 || ev.debugState().trials > 0;
  // A floor with a treasure runner spawns it, with no fighting brain.
  const idx = scene.run.levels.findIndex((l) => (l.events ?? []).some((e) => e.kind === 'treasureRunner'));
  out.runnerFloor = idx;
  if (idx >= 0) {
    if (idx !== scene.levelIndex) scene.loadLevel(idx);
    await until(() => scene.enemies.some((e) => e.named?.id === 'event.runner'), 10);
    const runner = scene.enemies.find((e) => e.named?.id === 'event.runner');
    out.runnerSpawned = !!runner && runner.ai === null;
  }
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

// The descent's modifier strip is on screen in the dungeon.
result.modStrip = await page.evaluate(() => document.querySelectorAll('.depth-mods .depth-mod').length);
await page.screenshot({ path: `${OUT}/dungeon.png` });

// Camp: the three stations, their panels, and the gate's choices.
const camp = await page.evaluate(async () => {
  const S = window.SLAY;
  const until = async (test, max) => {
    for (let i = 0; i < max; i++) {
      if (test()) return true;
      await new Promise((r) => requestAnimationFrame(r));
    }
    return test();
  };
  // Renown rank 9 opens every station, waypoints and pacts.
  const l = S.save.account.legacy;
  l.renown = Math.max(l.renown, 4000);
  l.milestones = [5, 10];
  await S.engine.goTo('town');
  await until(() => S.engine.currentScene?.interactables?.some((i) => i.id === 'station:gambler'), 30);
  const scene = S.engine.currentScene;
  const spots = scene.interactables.filter((i) => i.id.startsWith('station:'));
  return { stations: spots.map((s) => ({ id: s.id, x: s.pos.x, z: s.pos.z })) };
});
result.stations = camp.stations.map((s) => s.id);
for (const st of camp.stations) {
  await page.evaluate(async (s) => {
    const scene = window.SLAY.engine.currentScene;
    scene.player.position.set(s.x, 0, s.z);
    for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
  }, st);
  await page.screenshot({ path: `${OUT}/town-${st.id.split(':')[1]}.png` });
  const id = st.id.split(':')[1];
  await page.evaluate((p) => window.SLAY.events.emit('ui:open', { panel: `station-open:${p}` }), id);
  await sleep(400);
  result[`station_${id}`] = await page.evaluate((p) => !!document.querySelector(`[data-panel="${p}"].is-open`), id);
  if (id === 'bounties') await page.screenshot({ path: `${OUT}/panel-bounties.png` });
  await page.evaluate((p) => window.SLAY.events.emit('ui:close', { panel: p }), id);
}
// The gate: waypoints first (milestones 5 and 10 are claimed), then pacts.
await page.evaluate(() => window.SLAY.events.emit('ui:open', { panel: 'descend' }));
await sleep(400);
result.gateWaypoints = await page.evaluate(() => document.querySelectorAll('[data-panel="choice"].is-open .depth-card').length);
await page.screenshot({ path: `${OUT}/gate.png` });

console.log(JSON.stringify({ result, errors }, null, 2));
await browser.close();
const townBad = result.stations?.length !== 3 || !result.station_gambler || !result.station_enchanter || !result.station_bounties || !(result.gateWaypoints >= 3) || !(result.modStrip >= 1);
const eventsBad = !result.fallenHandled || !(result.ambushers >= 5) || !result.choiceOpen || !result.choiceClosed || !result.bargainTaken || (result.runnerFloor >= 0 && !result.runnerSpawned);
const bad = errors.length > 0 || result.error || !result.cleaveLanded || !result.chilled || !result.leeched || !result.filterHid || !(result.kills > 0) || eventsBad || townBad;
console.log(bad ? 'FAILED' : 'OK — depth systems work in the live game.');
process.exit(bad ? 1 : 0);
