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
 *   5. [E] at the waypoint of a fresh map goes home.
 */
import { bootGame, frames } from './lib/game.mjs';

const problems = [];
const ok = (cond, what, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${what}${detail ? `  (${detail})` : ''}`);
  if (!cond) problems.push(what);
};

const { page, close, pageErrors } = await bootGame({ fallbackPort: 4321 });
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
  ok(!!m.name && m.zones >= 3 && m.areas >= 1, 'the run is a map', `${m.name}, ${m.zones} zones in ${m.areas} areas`);
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
