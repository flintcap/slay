/**
 * Play a long session headless and report any error, leak or slowdown.
 *
 *   SLAY_PORT=4309 node tools/check-soak.mjs                 # 3 runs x 3 floors
 *   SLAY_PORT=4309 node tools/check-soak.mjs --runs=6 --floors=4 --frames=400
 *
 * Each run: town -> dungeon (a new depth each time) -> fight through
 * `--floors` levels through the scene's own level change -> back to town.
 * While on a floor an autopilot aims the attack button at the nearest monster
 * through the real input path (cursor projected from the monster's position),
 * so skills, deaths, loot, decals and effects all get exercised. God mode keeps
 * the hero alive; this is about the machine, not the balance.
 *
 * Measured on every return to town, where the world should be the same size
 * every time:
 *
 *  - caught errors (engine.errors) and uncaught page errors: must be zero
 *  - JS heap after a forced collection: must not keep climbing
 *  - GPU geometries, textures and shader programs alive: must not keep climbing
 *  - event-bus subscriptions per event: must not grow between visits
 *  - objects in the town scene: must not grow between visits
 *
 * And on every floor: the median cost of one simulation step, which must not
 * drift upward as the session goes on.
 */
import { bootGame } from './lib/game.mjs';

const arg = (name, d) => Number(process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d);
const RUNS = arg('runs', 3);
const FLOORS = arg('floors', 3);
const FRAMES = arg('frames', 300);
const START_DEPTH = arg('depth', 2);

const { page, close, pageErrors, bootMs } = await bootGame({
  fallbackPort: 4309,
  extraArgs: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
});
console.log(`booted in ${(bootMs / 1000).toFixed(0)}s; ${RUNS} runs x ${FLOORS} floors, ${FRAMES} frames each\n`);
const t0 = Date.now();

await page.evaluate(() => {
  localStorage.clear();
  window.SLAY.save.hardReset();
  window.SLAY.debug.makeCharacter('warden', 20);
});

/** Snapshot the things that leak. Taken in town. */
const snapshot = () =>
  page.evaluate(async () => {
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    for (let i = 0; i < 10; i++) await raf();
    window.gc?.();
    await raf();
    window.gc?.();
    const e = window.SLAY.engine;
    const info = e.renderer.gl.info;
    let objects = 0;
    e.currentScene?.scene.traverse(() => objects++);
    return {
      heapMB: +((performance.memory?.usedJSHeapSize ?? 0) / 1048576).toFixed(1),
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      listeners: window.SLAY.events.listenerCounts?.() ?? {},
      objects,
      domNodes: document.getElementsByTagName('*').length,
      errors: e.errorCount ?? 0,
    };
  });

/** Autopilot for `frames` frames on the current floor. Returns the median update cost. */
const fight = (frames) =>
  page.evaluate(async (frames) => {
    const e = window.SLAY.engine;
    const scene = e.currentScene;
    const input = e.input;
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    const THREEVec = scene.player.position.constructor;
    const v = new THREEVec();
    const costs = [];
    let kills0 = (scene.enemies ?? []).length;
    for (let i = 0; i < frames; i++) {
      if (e.currentScene !== scene) break;
      const p = scene.player.position;
      let best = null;
      let bestD = Infinity;
      for (const m of scene.enemies ?? []) {
        if (m.dead || m.alive === false) continue;
        const dx = m.root.position.x - p.x;
        const dz = m.root.position.z - p.z;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = m;
        }
      }
      // Wander to the nearest monster, or toward the stairs when none is left.
      if (best && bestD > 60 * 60) {
        scene.player.position.set(best.root.position.x + 4, p.y, best.root.position.z);
        scene.player.root.position.copy(scene.player.position);
      }
      const target = best ? best.root.position : scene.exitPos;
      if (target) {
        v.copy(target).project(scene.camera);
        input.ndc.set(Math.max(-1, Math.min(1, v.x)), Math.max(-1, Math.min(1, v.y)));
      }
      input.pointerOverUI = false;
      input.mouseRight = i % 40 < 34;
      if (!input.mouseRight) input.mouseRightPressed = false;
      // Fire the hotbar now and then so skills get used, not just the basic.
      if (i % 25 === 0) {
        const code = `Digit${1 + ((i / 25) % 6)}`;
        window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code.slice(5) }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code.slice(5) }));
      }
      const t = performance.now();
      await raf();
      costs.push(performance.now() - t);
    }
    input.mouseRight = false;
    const upd = [];
    const perf = e.perf;
    for (let k = 0; k < Math.min(perf.count, 120); k++) upd.push(perf.upd[(perf.i - 1 - k + perf.upd.length) % perf.upd.length]);
    upd.sort((a, b) => a - b);
    return {
      updateMs: +(upd[Math.floor(upd.length / 2)] ?? 0).toFixed(2),
      killed: kills0 - (scene.enemies ?? []).length,
      left: (scene.enemies ?? []).length,
    };
  }, frames);

const town = [];
const floors = [];
let depth = START_DEPTH;
await page.evaluate(() => window.SLAY.engine.goTo('town'));
town.push(await snapshot());
console.log(`town   heap ${town[0].heapMB}MB  geo ${town[0].geometries}  tex ${town[0].textures}  prog ${town[0].programs}  objects ${town[0].objects}  dom ${town[0].domNodes}`);

for (let run = 0; run < RUNS; run++) {
  await page.evaluate((d) => window.SLAY.engine.goTo('dungeon', { depth: d, seed: 9000 + d }), depth);
  for (let f = 0; f < FLOORS; f++) {
    const ok = await page.evaluate(async (f) => {
      const e = window.SLAY.engine;
      const s = e.currentScene;
      if (e.currentSceneId !== 'dungeon') return false;
      window.SLAY.debug.godMode(true);
      if (f > 0) {
        if (!s.run || s.levelIndex + 1 >= s.run.levels.length) return false;
        // The scene's own level change, as taking the stairs does.
        s.loadLevel(s.levelIndex + 1);
        for (let i = 0; i < 10; i++) await new Promise((r) => requestAnimationFrame(r));
      }
      return true;
    }, f);
    if (!ok) break;
    const r = await fight(FRAMES);
    const errs = await page.evaluate(() => window.SLAY.engine.errorCount ?? 0);
    floors.push({ run, depth, floor: f, ...r, errors: errs });
    console.log(
      `run ${run} depth ${depth} floor ${f}: update ${r.updateMs}ms, killed ${r.killed}, ${r.left} left, errors so far ${errs}`,
    );
  }
  await page.evaluate(() => window.SLAY.engine.goTo('town'));
  const snap = await snapshot();
  town.push(snap);
  console.log(
    `town   heap ${snap.heapMB}MB  geo ${snap.geometries}  tex ${snap.textures}  prog ${snap.programs}  objects ${snap.objects}  dom ${snap.domNodes}  errors ${snap.errors}`,
  );
  depth += 3;
}

const caught = await page.evaluate(() => [...window.SLAY.engine.errors.values()].map((e) => ({ ...e })));
await close();

// --- verdict -------------------------------------------------------------------
const problems = [];
for (const e of caught) problems.push(`caught ${e.where} error x${e.count}: ${e.message}\n      ${e.stack.split('\n').slice(1, 3).join('\n      ')}`);
for (const e of pageErrors) problems.push(`page error: ${e}`);

// Compare the last return to town with the first return (the first visit
// to town warms caches that are meant to persist).
if (town.length >= 3) {
  const a = town[1];
  const b = town[town.length - 1];
  const visits = town.length - 2;
  const grow = (k, slack) => {
    if (b[k] - a[k] > slack) problems.push(`${k} grew ${a[k]} -> ${b[k]} over ${visits} more round trips`);
  };
  grow('heapMB', 12 * visits);
  grow('geometries', 20);
  grow('textures', 8);
  grow('programs', 6);
  grow('objects', 20);
  grow('domNodes', 60);
  for (const [k, n] of Object.entries(b.listeners)) {
    const was = a.listeners[k] ?? 0;
    if (n > was) problems.push(`event "${k}" has ${n} subscribers in town, was ${was}: something subscribes and never unsubscribes`);
  }
}
// Simulation cost must not drift with session length.
if (floors.length >= 4) {
  const first = floors.slice(0, 2).map((f) => f.updateMs);
  const last = floors.slice(-2).map((f) => f.updateMs);
  const avg = (x) => x.reduce((p, q) => p + q, 0) / x.length;
  if (avg(last) > Math.max(2 * avg(first), avg(first) + 4)) {
    problems.push(`simulation slowed down over the session: ${avg(first).toFixed(1)}ms -> ${avg(last).toFixed(1)}ms`);
  }
}

console.log(`\nplayed ${floors.length} floors in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
if (problems.length) for (const p of problems) console.log(`  FAIL ${p}`);
console.log(
  problems.length === 0
    ? '\nOK — no errors, no leaks, no slowdown across the session.'
    : `\nFAILED — ${problems.length} problems in the soak.`,
);
console.log(JSON.stringify({ town, floors, caught: caught.length }));
process.exit(problems.length === 0 ? 0 : 1);
