/**
 * Does the busiest part of a floor fit the budget, on any GPU?
 *
 *   SLAY_PORT=4309 node tools/check-perf.mjs                  # the standard floors
 *   SLAY_PORT=4309 node tools/check-perf.mjs --depths=1,12    # just these depths (0 is the town)
 *   SLAY_PORT=4309 node tools/check-perf.mjs --alloc          # also list who allocates
 *
 * Frame time under software rendering says nothing about a player's machine,
 * so this measures what does not depend on the GPU, at the densest knot of
 * monsters on each floor:
 *
 *  - draw calls and triangles for one whole frame (every post pass included)
 *  - shader programs, materials, geometries and textures alive
 *  - lights, and how many of them cast shadows (each one is a shadow pass)
 *  - CPU cost of one simulation step, and the share of it spent in monster AI
 *  - bytes of garbage one simulation step leaves behind, sampled by V8's heap
 *    profiler including objects already collected, so a per-frame allocation
 *    shows up even when the collector keeps up with it
 *
 * Each number has a budget (BUDGET below). The budgets are what a mid-range
 * laptop GPU (integrated, ~2020) holds at 60 fps with headroom, or for CPU
 * numbers, what leaves most of a 16.7 ms frame for drawing.
 */
import { bootGame } from './lib/game.mjs';

const BUDGET = {
  drawCalls: 900,
  triangles: 1_500_000,
  programs: 90,
  lights: 24,
  shadowLights: 2,
  materials: 400,
  geometries: 3500,
  textures: 160,
  // CPU, median of one scene.update(), simulation only. Measured on a
  // contended 4-core container; a player's machine is faster.
  updateMs: 6,
  // Garbage per simulation step. A frame that leaves 200 KB behind at 60 fps
  // is 12 MB/s for the collector: visible as periodic hitches.
  allocKBPerStep: 200,
};

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const DEPTHS = (arg('depths') ?? '0,1,6,12,20,32').split(',').map(Number);
const SEED = Number(arg('seed') ?? 424242);
const showAlloc = process.argv.includes('--alloc');

const { page, close, pageErrors, bootMs } = await bootGame({ fallbackPort: 4309 });
console.log(`booted in ${(bootMs / 1000).toFixed(0)}s`);
const cdp = await page.context().newCDPSession(page);
await cdp.send('HeapProfiler.enable');

await page.evaluate(() => {
  localStorage.clear();
  window.SLAY.save.hardReset();
  window.SLAY.debug.makeCharacter('warden', 30);
});

const rows = [];
for (const depth of DEPTHS) {
  const floor = await page.evaluate(
    async ({ depth, seed }) => {
      const engine = window.SLAY.engine;
      // Depth 0 is the town: nine residents, the camp and its lights.
      if (depth === 0) await engine.goTo('town');
      else await engine.goTo('dungeon', { depth, seed: seed + depth });
      window.SLAY.debug.godMode(true);
      const raf = () => new Promise((r) => requestAnimationFrame(r));
      for (let i = 0; i < 30; i++) await raf();
      const scene = engine.currentScene;

      // Stand where the fight is: the monster with most others within 24 m.
      const mobs = scene.enemies ?? [];
      if (mobs.length && scene.player) {
        let best = mobs[0].root.position;
        let bestN = -1;
        for (const a of mobs) {
          let n = 0;
          for (const b of mobs) {
            const dx = a.root.position.x - b.root.position.x;
            const dz = a.root.position.z - b.root.position.z;
            if (dx * dx + dz * dz < 24 * 24) n++;
          }
          if (n > bestN) {
            bestN = n;
            best = a.root.position;
          }
        }
        scene.player.position.set(best.x + 3, scene.player.position.y, best.z);
        scene.player.root.position.copy(scene.player.position);
      }
      // Let them notice and close in.
      for (let i = 0; i < 90; i++) await raf();
      return { biome: depth === 0 ? 'town' : scene.level?.biome, layout: depth === 0 ? 'camp' : scene.level?.layout, monsters: mobs.length };
    },
    { depth, seed: SEED },
  );

  // Garbage: sample every allocation during 30 simulation steps.
  await page.evaluate(() => window.gc?.());
  await cdp.send('HeapProfiler.startSampling', {
    samplingInterval: 1024,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });
  const cpu = await page.evaluate(async () => {
    const engine = window.SLAY.engine;
    const scene = engine.currentScene;
    // Time the AI separately by wrapping each monster's update for the run.
    let aiMs = 0;
    const wrapped = [];
    for (const e of scene.enemies ?? []) {
      const orig = e.update;
      e.update = function (...a) {
        const t = performance.now();
        try {
          return orig.apply(this, a);
        } finally {
          aiMs += performance.now() - t;
        }
      };
      wrapped.push([e, orig]);
    }
    const samples = [];
    for (let i = 0; i < 30; i++) {
      const t0 = performance.now();
      scene.update(1 / 60, engine.elapsed + i / 60);
      samples.push(performance.now() - t0);
      // Yield without letting the engine loop run its own update in between.
      await new Promise((r) => setTimeout(r, 0));
    }
    for (const [e, orig] of wrapped) e.update = orig;
    samples.sort((a, b) => a - b);
    const total = samples.reduce((a, b) => a + b, 0);
    let simulated = 0;
    const p = scene.player.position;
    for (const e of scene.enemies ?? []) {
      const dx = e.root.position.x - p.x;
      const dz = e.root.position.z - p.z;
      if (dx * dx + dz * dz <= 38 * 38) simulated++;
    }
    return {
      updateMs: +samples[Math.floor(samples.length / 2)].toFixed(2),
      updateWorstMs: +samples[samples.length - 1].toFixed(2),
      aiShare: total > 0 ? +(aiMs / total).toFixed(2) : 0,
      simulated,
    };
  });
  const { profile } = await cdp.send('HeapProfiler.stopSampling');
  // Sum allocation by function, walking the sampled call tree.
  const byFn = new Map();
  let allocBytes = 0;
  const walk = (node) => {
    const self = node.selfSize ?? 0;
    allocBytes += self;
    if (self > 0) {
      const f = node.callFrame;
      const where = `${f.functionName || '(anon)'} ${(f.url || '').split('/').slice(-2).join('/')}:${f.lineNumber + 1}`;
      byFn.set(where, (byFn.get(where) ?? 0) + self);
    }
    for (const c of node.children ?? []) walk(c);
  };
  walk(profile.head);
  const allocKBPerStep = +(allocBytes / 1024 / 30).toFixed(1);
  const topAlloc = [...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  // One whole frame through every pass, counted together.
  const gpu = await page.evaluate(() => {
    const engine = window.SLAY.engine;
    const scene = engine.currentScene;
    const gl = engine.renderer.gl;
    const info = gl.info;
    const auto = info.autoReset;
    info.autoReset = false;
    info.reset();
    engine.renderer.render(scene.scene, scene.camera, 1 / 60, engine.elapsed);
    const calls = info.render.calls;
    const triangles = info.render.triangles;
    info.autoReset = auto;

    // Who the meshes belong to: tallied by the scene's direct child that
    // holds them (named, or its type), with how many cast shadows (each of
    // those is drawn again in every shadow pass).
    const owners = new Map();
    const nameOf = (a) => a.name || a.userData?.kind || a.userData?.id || a.type;
    const ownerOf = (o) => {
      let a = o;
      let below = null;
      while (a.parent && a.parent !== scene.scene) {
        below = a;
        a = a.parent;
      }
      // A world root holding everything (the town) says nothing; go one deeper.
      if (below && a.children.length > 12) {
        return below === o ? `${nameOf(a)}/${o.type}:${o.geometry?.type ?? '?'}` : `${nameOf(a)}/${nameOf(below)}`;
      }
      return nameOf(a);
    };
    let lights = 0;
    let shadowLights = 0;
    const materials = new Set();
    let meshes = 0;
    let visibleMeshes = 0;
    let instanced = 0;
    scene.scene.traverse((o) => {
      if (o.isLight && !o.isAmbientLight && !o.isHemisphereLight) {
        if (o.visible && o.intensity > 0) {
          lights++;
          if (o.castShadow) shadowLights++;
        }
      }
      if (o.isMesh || o.isPoints || o.isLine || o.isSprite) {
        meshes++;
        let shown = o.visible;
        for (let a = o.parent; shown && a; a = a.parent) shown = a.visible;
        if (o.visible) visibleMeshes++;
        if (shown) {
          const k = ownerOf(o);
          const t = owners.get(k) ?? { n: 0, shadow: 0 };
          t.n++;
          if (o.castShadow) t.shadow++;
          owners.set(k, t);
        }
        if (o.isInstancedMesh) instanced++;
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => materials.add(x));
        else if (m) materials.add(m);
      }
    });
    return {
      drawCalls: calls,
      triangles,
      programs: info.programs?.length ?? 0,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      lights,
      shadowLights,
      materials: materials.size,
      meshes,
      visibleMeshes,
      instanced,
      owners: [...owners.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 10),
    };
  });

  const row = { depth, ...floor, ...gpu, ...cpu, allocKBPerStep, topAlloc };
  rows.push(row);
  const over = Object.entries(BUDGET).filter(([k, v]) => row[k] > v);
  console.log(
    `\ndepth ${depth} (${row.biome}/${row.layout}, ${row.monsters} monsters, ${row.simulated} awake)` +
      (over.length ? `  OVER: ${over.map(([k, v]) => `${k} ${row[k]} > ${v}`).join(', ')}` : '  within budget'),
  );
  for (const k of Object.keys(BUDGET)) console.log(`  ${k.padEnd(16)} ${String(row[k]).padStart(10)}   budget ${BUDGET[k]}`);
  console.log(`  ${'meshes'.padEnd(16)} ${String(row.meshes).padStart(10)}   (${row.visibleMeshes} visible, ${row.instanced} instanced)`);
  console.log(`  ${'AI share'.padEnd(16)} ${String(Math.round(row.aiShare * 100) + '%').padStart(10)}   of the update`);
  if (showAlloc || row.drawCalls > BUDGET.drawCalls) {
    console.log('  most meshes, by owner (shown / casting shadow):');
    for (const [k, t] of row.owners) console.log(`    ${String(t.n).padStart(6)} / ${String(t.shadow).padStart(4)}  ${k}`);
  }
  if (showAlloc || row.allocKBPerStep > BUDGET.allocKBPerStep) {
    console.log('  biggest allocators (KB per step):');
    for (const [where, b] of topAlloc) console.log(`    ${(b / 1024 / 30).toFixed(1).padStart(8)}  ${where}`);
  }
}

await close();
const failures = rows.flatMap((r) => Object.entries(BUDGET).filter(([k, v]) => r[k] > v).map(([k]) => `depth ${r.depth} ${k}`));
if (pageErrors.length) console.log(`\npage errors:\n  ${pageErrors.slice(0, 5).join('\n  ')}`);
console.log(
  failures.length === 0 && pageErrors.length === 0
    ? `\nOK — every measured floor fits the budget.`
    : `\nFAILED — ${failures.length} over budget${failures.length ? `: ${failures.join(', ')}` : ''}${pageErrors.length ? `, ${pageErrors.length} page errors` : ''}.`,
);
console.log(JSON.stringify({ budget: BUDGET, rows: rows.map(({ topAlloc, owners, ...r }) => r) }));
process.exit(failures.length === 0 && pageErrors.length === 0 ? 0 : 1);
