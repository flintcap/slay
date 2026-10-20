/**
 * The map flow in a real browser: one portal trip is one map.
 *
 *   SLAY_PORT=4321 timeout 2700 node tools/check-mapflow.mjs
 *
 * Checks, on one map:
 *   1. The run is a map (name, zones) and its first area has a waypoint ring.
 *   2. Walking into the next zone of an area fires `zone:entered`.
 *   3. Stepping on the way on loads the next area.
 *   4. The boss waits; walking through the arena gate seals it and wakes the
 *      boss; the gate opens when the boss falls.
 *   5. A real boss kill on a fresh map: the gate seals, the boss goes through
 *      its phases, dies, leaves loot and opens the way home; the portal
 *      clears the map, banks the tier and goes to town.
 *   6. The next portal opens a fresh map.
 *   7. A page reload mid-map keeps the hero and what they carry; Continue
 *      goes to town.
 *   8. [E] at the waypoint of a fresh map goes home.
 */
import { bootGame, frames } from './lib/game.mjs';

const problems = [];
const ok = (cond, what, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${what}${detail ? `  (${detail})` : ''}`);
  if (!cond) problems.push(what);
};

// `--from-boss`: skip 1 to 4 (map, zones, way on, gate) and start at the
// real boss kill. For a rerun when the first part already passed.
const FROM_BOSS = process.argv.includes('--from-boss');
// `--small`: an 854x480 page, which software GL draws about twice as fast.
const SMALL = process.argv.includes('--small');
const { page, close, pageErrors } = await bootGame({ fallbackPort: 4321, ...(SMALL ? { viewport: { width: 854, height: 480 } } : {}) });
try {
  await page.evaluate(async () => {
    localStorage.clear();
    window.SLAY.save.hardReset();
    window.SLAY.debug.makeCharacter('warden', 12);
    await window.SLAY.engine.goTo('dungeon', { depth: 6 });
  });
  await page.waitForFunction(() => window.SLAY.engine.currentSceneId === 'dungeon', null, { timeout: 600000, polling: 500 });
  await page.evaluate(() => window.SLAY.debug.godMode(true));
  await frames(page, 20);

  if (!FROM_BOSS) {
  // 1. A map, a waypoint.
  const m = await page.evaluate(() => {
    const s = window.SLAY.engine.currentScene;
    return {
      name: s.run.map?.name,
      zones: s.run.map?.zones.length ?? 0,
      areas: s.run.levels.length,
      waypoint: !!s.level.waypoint,
      ring: !!s.waypoint?.parent,
      hud: (document.body.textContent ?? '').includes(`Tier ${s.run.depth}`),
      label: document.querySelector('.hud-depth')?.textContent ?? '(no label)',
    };
  });
  ok(!!m.name && m.zones >= 2 && m.areas >= 2, 'the run is a map', `${m.name}, ${m.zones} zones in ${m.areas} areas`);
  ok(m.waypoint && m.ring, 'the first area has a waypoint ring');
  ok(m.hud, 'the HUD shows the tier', m.label);

  // 2. Zone banner: find an area with two zones and walk into the second.
  const zoneSeen = await page.evaluate(async () => {
    const S = window.SLAY;
    const s = S.engine.currentScene;
    let got = null;
    const off = S.events.on('zone:entered', (p) => (got = p.name));
    const step = async () => {
      for (let i = 0; i < 12; i++) await new Promise((r) => requestAnimationFrame(r));
    };
    for (let guard = 0; guard < s.run.levels.length; guard++) {
      const lvl = s.level;
      if ((lvl.zones?.length ?? 0) > 1) {
        const z = lvl.zones[1];
        // A walkable tile of the second zone.
        for (let y = z.bounds.y; y < z.bounds.y + z.bounds.h && !got; y++) {
          for (let x = z.bounds.x; x < z.bounds.x + z.bounds.w; x++) {
            const i = y * lvl.width + x;
            if (lvl.zoneOf[i] !== 1 || lvl.tiles[i] !== 1) continue;
            const w = s.mesh.tileToWorld(x, y);
            s.player.root.position.set(w.x, w.y, w.z);
            s.player.stop();
            await step();
            break;
          }
          if (got) break;
        }
        break;
      }
      if (s.levelIndex + 1 >= s.run.levels.length) break;
      s.loadLevel(s.levelIndex + 1);
      await step();
    }
    off?.();
    return { got, twoZoneArea: s.run.levels.some((l) => (l.zones?.length ?? 0) > 1) };
  });
  if (zoneSeen.twoZoneArea) ok(!!zoneSeen.got, 'walking into the next zone raises its banner', zoneSeen.got ?? 'none');
  else console.log('skip  no two-zone area on this map');

  // 3. The way on loads the next area.
  const before = await page.evaluate(() => {
    const s = window.SLAY.engine.currentScene;
    if (s.levelIndex + 1 >= s.run.levels.length) s.loadLevel(0);
    return s.levelIndex;
  });
  const moved = await page.evaluate(async () => {
    const s = window.SLAY.engine.currentScene;
    if (s.level.isBossLevel) return { skipped: true };
    const from = s.levelIndex;
    const e = s.exitPos;
    s.player.root.position.set(e.x, e.y, e.z);
    s.player.stop();
    for (let i = 0; i < 400 && s.levelIndex === from; i++) await new Promise((r) => requestAnimationFrame(r));
    return { from, to: s.levelIndex };
  });
  if (moved.skipped) console.log('skip  the first area is already the boss area');
  else ok(moved.to === before + 1, 'the way on loads the next area', `${moved.from} -> ${moved.to}`);

  // 4. The arena gate.
  const gate = await page.evaluate(async () => {
    const s = window.SLAY.engine.currentScene;
    const step = async (n) => {
      for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r));
    };
    while (s.transitioning) await step(5);
    const last = s.run.levels.length - 1;
    if (s.levelIndex !== last) s.loadLevel(last);
    await step(10);
    const g = s.arenaGate;
    const boss = s.boss;
    if (!g || !boss) return { missing: true };
    const waits = boss.dormant === true && !g.sealed;
    // Stand just outside the gate: the boss must not wake from there.
    const gt = s.level.arena.gate;
    const out = s.mesh.tileToWorld(gt.x, gt.y);
    s.player.root.position.set(out.x, out.y, out.z);
    s.player.stop();
    await step(30);
    const stillAsleep = !g.sealed && boss.dormant;
    // Walk in.
    window.SLAY.debug.warpToBoss();
    await step(30);
    const sealed = g.sealed;
    const blocked = g.tiles.every((t) => !s.nav.walkable(t.x, t.y));
    const awake = boss.dormant === false;
    const bars = !!g.bars?.parent;
    // The boss falls.
    boss.life = 0;
    await step(30);
    return { waits, stillAsleep, sealed, blocked, awake, bars, tiles: g.tiles.length, opened: !g.sealed, free: g.tiles.every((t) => s.nav.walkable(t.x, t.y)) };
  });
  if (gate.missing) ok(false, 'the boss area has an arena gate and a boss');
  else {
    ok(gate.waits && gate.stillAsleep, 'the boss waits while the hero is outside the gate');
    ok(gate.tiles === 3, 'the gate is three tiles wide', String(gate.tiles));
    ok(gate.sealed && gate.blocked && gate.bars, 'walking in seals the gate');
    ok(gate.awake, 'walking in wakes the boss');
    ok(gate.opened && gate.free, 'the gate opens when the boss falls');
  }

  }

  // 4b. A real boss kill on a fresh map: phases, the reward, the way home.
  await page.evaluate(async () => {
    await window.SLAY.engine.goTo('dungeon', { depth: 6 });
  });
  await page.waitForFunction(() => window.SLAY.engine.currentSceneId === 'dungeon' && !window.SLAY.engine.transitioning, null, { timeout: 600000, polling: 500 });
  await frames(page, 10);
  const fight = await page.evaluate(async () => {
    const S = window.SLAY;
    const s = S.engine.currentScene;
    const step = async (n) => {
      for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r));
    };
    s.debugGodMode(true);
    const map = { name: s.run.map?.name, seed: s.run.seed };
    S.debug.warpToBoss();
    await step(30);
    const boss = s.boss;
    if (!boss) return { missing: true, map };
    const phasesDefined = boss.bossDef.phases.length;
    const phases = [];
    let killed = false;
    let cleared = false;
    const offs = [
      S.events.on('boss:phase', (p) => phases.push(p.index)),
      S.events.on('boss:killed', () => (killed = true)),
      S.events.on('run:cleared', () => (cleared = true)),
    ];
    const sealed = !!s.arenaGate?.sealed;
    const lootBefore = s.loot.length;
    // Chunks of a tenth of its life, the way a fight wears it down.
    for (let i = 0; i < 400 && boss.alive; i++) {
      const pp = s.player.root.position;
      const bp = boss.root.position;
      if (Math.hypot(pp.x - bp.x, pp.z - bp.z) > 6) s.player.root.position.set(bp.x, pp.y, bp.z + 3);
      boss.takeDamage({ amount: boss.maxLife * 0.1, type: 'physical', crit: false, source: 'player' }, s.context());
      await step(4);
    }
    // The body falls, the loot lands, the way home opens.
    for (let i = 0; i < 600 && (s.boss || !s.returnPortal); i++) await step(1);
    await step(30);
    const reward = s.loot.length - lootBefore;
    const portal = !!s.returnPortal?.parent;
    const gateOpen = s.arenaGate ? !s.arenaGate.sealed : true;
    const recordBefore = S.save.account.current.depthRecord;
    // Step into the portal.
    const e = s.exitPos;
    s.player.root.position.set(e.x, e.y, e.z);
    s.player.stop();
    for (let i = 0; i < 300 && !cleared; i++) await step(1);
    for (const off of offs) off?.();
    return { map, phasesDefined, phases, killed, sealed, reward, portal, gateOpen, cleared, recordBefore, depth: s.run.depth };
  });
  if (fight.missing) ok(false, 'the boss area has a boss', JSON.stringify(fight.map));
  else {
    ok(fight.sealed, 'warping into the arena seals the gate');
    ok(fight.phases.length >= fight.phasesDefined - 1, 'the boss goes through its phases', `${fight.phases.join(',') || 'none'} of ${fight.phasesDefined}`);
    ok(fight.killed, 'the boss dies');
    ok(fight.reward > 0, 'the boss leaves a reward', `${fight.reward} drops`);
    ok(fight.portal, 'the way home opens');
    ok(fight.gateOpen, 'the arena gate opens again');
    ok(fight.cleared, 'stepping into the portal clears the map');
  }
  const wentHome = await page
    .waitForFunction(() => window.SLAY.engine.currentSceneId === 'town' && !window.SLAY.engine.transitioning, null, { timeout: 600000, polling: 500 })
    .then(() => true, () => false);
  ok(wentHome, 'the portal takes you home');
  const record = await page.evaluate(() => window.SLAY.save.account.current?.depthRecord ?? -1);
  ok(record >= (fight.depth ?? 6), 'the cleared tier is banked', `record ${record}`);

  // 4c. The next portal opens a fresh map.
  await page.evaluate(() => window.SLAY.events.emit('ui:open', { panel: 'descend' }));
  await page.waitForFunction(() => window.SLAY.engine.currentSceneId === 'dungeon' && !window.SLAY.engine.transitioning, null, { timeout: 600000, polling: 500 });
  const next = await page.evaluate(() => {
    const s = window.SLAY.engine.currentScene;
    return { name: s.run.map?.name, seed: s.run.seed, depth: s.run.depth, level: s.levelIndex };
  });
  ok(next.seed !== fight.map?.seed && next.level === 0, 'the next portal opens a fresh map', `${fight.map?.name} -> ${next.name}, tier ${next.depth}`);

  // 4d. Save and reload mid-map: what you carry survives a closed tab.
  const mark = await page.evaluate(() => {
    const c = window.SLAY.save.account.current;
    c.gold += 777;
    window.SLAY.save.touch();
    return { gold: c.gold, name: c.name, items: c.inventory.filter(Boolean).length };
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.SLAY?.debug && window.SLAY.engine.currentSceneId === 'title' && !window.SLAY.engine.transitioning, null, { timeout: 900000, polling: 500 });
  const back = await page.evaluate(() => {
    const c = window.SLAY.save.account.current;
    return c ? { gold: c.gold, name: c.name, items: c.inventory.filter(Boolean).length } : null;
  });
  ok(!!back && back.name === mark.name && back.gold === mark.gold && back.items === mark.items, 'a reload mid-map keeps the hero and what they carry', JSON.stringify(back));
  await page.keyboard.press('Enter');
  const cont = await page
    .waitForFunction(() => window.SLAY.engine.currentSceneId === 'town' && !window.SLAY.engine.transitioning, null, { timeout: 600000, polling: 500 })
    .then(() => true, () => false);
  ok(cont, 'Continue after the reload goes to town');

  // 5. The waypoint home, on a fresh map.
  await page.evaluate(async () => {
    await window.SLAY.engine.goTo('dungeon', { depth: 6 });
  });
  await page.waitForFunction(
    () => window.SLAY.engine.currentSceneId === 'dungeon' && window.SLAY.engine.currentScene.levelIndex === 0 && window.SLAY.engine.currentScene.waypoint,
    null,
    { timeout: 600000, polling: 500 },
  );
  await frames(page, 20);
  await page.evaluate(async () => {
    const s = window.SLAY.engine.currentScene;
    s.debugGodMode(true);
    const p = s.waypoint.position;
    s.player.root.position.set(p.x + 0.4, p.y, p.z);
    s.player.stop();
    for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
  });
  const prompt = await page.evaluate(() => window.SLAY.engine.currentScene.nearWaypoint || !!window.SLAY.engine.currentScene.nearProp);
  ok(prompt, 'standing on the waypoint shows a prompt');
  await page.keyboard.press('e');
  const home = await page
    .waitForFunction(() => window.SLAY.engine.currentSceneId === 'town', null, { timeout: 300000, polling: 500 })
    .then(() => true, () => false);
  ok(home, '[E] at the waypoint goes home');

  ok(pageErrors.length === 0, 'no page errors', pageErrors.slice(0, 2).join(' | '));
} finally {
  await close();
}

if (problems.length) {
  console.log(`FAILED: ${problems.length} problem(s).`);
  process.exit(1);
}
console.log('OK: the map flow works end to end.');
