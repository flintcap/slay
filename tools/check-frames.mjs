/**
 * The standing perf check: does play stay smooth in the three places that
 * matter, and is it no worse than last time?
 *
 *   node tools/bundle-artifact.mjs                       # build what is published
 *   SLAY_PORT=4333 timeout 2700 node tools/check-frames.mjs
 *   SLAY_PORT=4333 timeout 2700 node tools/check-frames.mjs --save      # new baseline
 *   SLAY_PORT=4333 timeout 2700 node tools/check-frames.mjs --only=boss --frames=60
 *
 * Plays, in the published bundle (the `.wasm` packs included):
 *
 *   town   the camp with its nine residents, the hero walking a loop
 *   map    a busy floor at its densest knot of monsters, fighting
 *   boss   a boss arena, fighting the boss
 *
 * The fights use the soak's autopilot (attack the nearest, a hotbar skill
 * every 25 frames) with the hero unkillable, so every run plays the same.
 *
 * For each, after a few seconds to settle, it records every frame and
 * reports p50, p95, p99 and worst of:
 *
 *   frame    the time between frames (what a player feels)
 *   update   the engine's simulation step (plain JavaScript)
 *   cpu      update plus the render call (JavaScript and GL submission)
 *
 * plus frames over 33 and 50 ms, draw calls and triangles a frame, shader
 * programs linked while playing (each one a stall on a real driver), and
 * texture bytes sent to the GPU while playing.
 *
 * Headless Chromium here renders in software, so `frame` is far slower
 * than any GPU and only worth reading on a real machine (--headed). What
 * holds anywhere is the rest: JavaScript time, draw calls, triangles,
 * mid-play links and uploads. Those are what it fails on.
 *
 * It fails when, against the baseline in tools/perf-frames.json:
 *  - any program links while playing (the baseline is none)
 *  - draw calls or triangles a frame grow by more than 15%
 *  - update p95 grows by more than 60% and 2 ms (the CPU is shared and
 *    noisy here; a real regression is far bigger than the noise)
 *  - update frames over 33 ms grow by more than 3
 *  - mid-play texture uploads grow by more than 2 MB
 *  - the page throws
 *
 * --save writes the numbers as the new baseline (do it on a quiet machine,
 * and say in the commit why the baseline moved).
 *
 * --profile also samples the CPU while each place plays and prints the ten
 * functions with the most self time (JavaScript only; the GPU wait and
 * idle are left out), to find what an update spike was.
 */
import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { serveSingle, CHROME_ARGS, CHROME_PATH } from './lib/single.mjs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const PORT = Number(process.env.SLAY_PORT ?? 4333);
const ONLY = arg('only')?.split(',') ?? ['town', 'map', 'boss'];
const [VW, VH] = (arg('size') ?? '480x270').split('x').map(Number);
const FRAMES = Number(arg('frames') ?? 120);
const SETTLE_MS = Number(arg('settle') ?? 6000);
// At least this many frames too: a software frame can take a second.
const SETTLE_FRAMES = Number(arg('settleFrames') ?? 20);
const PROFILE = process.argv.includes('--profile');
const SEED = Number(arg('seed') ?? 424242);
const SAVE = process.argv.includes('--save');
const HEADED = process.argv.includes('--headed');
const BASELINE = path.resolve('tools/perf-frames.json');

const server = await serveSingle(PORT, arg('dir') ?? 'dist-single');
const profileDir = mkdtempSync(path.join(tmpdir(), 'slay-frames-'));
const context = await chromium.launchPersistentContext(profileDir, {
  executablePath: CHROME_PATH,
  args: HEADED ? [] : CHROME_ARGS,
  headless: !HEADED,
  viewport: { width: VW, height: VH },
});

// Before any page script: frame stamps, links, uploads and draws.
await context.addInitScript((PROFILE_UP) => {
  const w = window;
  const F = (w.__frames = { links: [], tex: [], draws: 0, tris: 0 });
  const now = () => performance.now();
  const size = (args) => {
    for (const a of args) {
      if (a && typeof a === 'object' && 'width' in a && 'height' in a && !ArrayBuffer.isView(a)) return a.width * a.height * 4;
      if (ArrayBuffer.isView(a)) return a.byteLength;
    }
    const nums = args.filter((a) => typeof a === 'number');
    return nums.length >= 5 ? nums[3] * nums[4] * 4 : 0;
  };
  for (const C of [w.WebGL2RenderingContext, w.WebGLRenderingContext]) {
    if (!C) continue;
    const p = C.prototype;
    const wrap = (name, fn) => {
      const orig = p[name];
      if (!orig) return;
      p[name] = function (...args) {
        fn(args);
        return orig.apply(this, args);
      };
    };
    wrap('linkProgram', () => F.links.push(now()));
    for (const n of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) wrap(n, () => F.draws++);
    for (const n of ['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'compressedTexImage2D']) {
      wrap(n, (args) => {
        F.tex.push([now(), size(args), n, args.filter((a) => typeof a === 'number').slice(0, 8).join(' '), PROFILE_UP ? new Error().stack.split('\n').slice(2, 7).map((l) => l.trim().replace(/\(?https?:\/\/[^/]+\//, '(')).join(' < ') : '']);
      });
    }
  }
}, PROFILE);

/** In the page: put the hero where the test plays. */
async function setUp({ where, seed }) {
  const S = window.SLAY;
  const engine = S.engine;
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  localStorage.clear();
  S.save.hardReset();
  S.debug.makeCharacter('warden', 30, seed);
  if (where === 'town') {
    await engine.goTo('town');
  } else if (where === 'map') {
    await engine.goTo('dungeon', { depth: 6, seed: seed + 6 });
  } else {
    await engine.goTo('dungeon', { depth: 8, seed: seed + 8 });
    // The warp loads the boss area without the curtain a player walks
    // through; warm it the way that curtain does.
    S.debug.warpToBoss();
    await engine.prime(engine.currentScene);
  }
  while (engine.transitioning) await raf();
  S.debug.godMode(true);
  const scene = engine.currentScene;
  if (where === 'map') {
    // The densest knot: the monster with most others within 24 m.
    const mobs = scene.enemies ?? [];
    let best = null;
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
    if (best) {
      scene.player.position.set(best.x + 3, scene.player.position.y, best.z);
      scene.player.root.position.copy(scene.player.position);
    }
  }
  return {
    scene: engine.currentSceneId,
    monsters: (scene.enemies ?? []).length,
    boss: !!scene.boss,
    quality: engine.renderer.qualityLevel,
  };
}

/** In the page: play `n` frames (fight, or walk a loop in town) and measure them. */
async function play({ n, settleMs, settleFrames, fight }) {
  const S = window.SLAY;
  const e = S.engine;
  const F = window.__frames;
  const scene = e.currentScene;
  const input = e.input;
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const v = new scene.player.position.constructor();
  const home = scene.player.position.clone();
  const step = (i) => {
    const p = scene.player.position;
    if (fight) {
      let best = null;
      let bestD = Infinity;
      for (const m of scene.enemies ?? []) {
        if (m.dead || m.alive === false) continue;
        const d = (m.root.position.x - p.x) ** 2 + (m.root.position.z - p.z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = m;
        }
      }
      if (best && bestD > 30 * 30) {
        scene.player.position.set(best.root.position.x + 4, p.y, best.root.position.z);
        scene.player.root.position.copy(scene.player.position);
      }
      if (best) {
        v.copy(best.root.position).project(scene.camera);
        input.ndc.set(Math.max(-1, Math.min(1, v.x)), Math.max(-1, Math.min(1, v.y)));
      }
      input.pointerOverUI = false;
      input.mouseRight = i % 40 < 34;
      if (!input.mouseRight) input.mouseRightPressed = false;
      if (i % 25 === 0) {
        const code = `Digit${1 + ((i / 25) % 6)}`;
        window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code.slice(5) }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code.slice(5) }));
      }
    } else {
      // A slow loop around where the hero stood, so the camera moves.
      const a = (i / 240) * Math.PI * 2;
      v.set(home.x + Math.cos(a) * 6, p.y, home.z + Math.sin(a) * 6).project(scene.camera);
      input.ndc.set(Math.max(-1, Math.min(1, v.x)), Math.max(-1, Math.min(1, v.y)));
      input.pointerOverUI = false;
      input.pointerOverClickable = false;
      // A press on the floor each step: the hero walks only after a press that
      // began over the world (entities/Controls.ts).
      input.mouseLeft = true;
      input.mouseLeftPressed = true;
    }
  };
  // Settle: the same play, unmeasured, so the first-use costs of this place
  // (the load's tail, the first swing) are behind it.
  const t0 = performance.now();
  let i = 0;
  while (performance.now() - t0 < settleMs || i < settleFrames) {
    step(i++);
    await raf();
  }
  const frames = [];
  const upd = [];
  const cpu = [];
  const draws = [];
  const tris = [];
  const info = e.renderer.gl.info;
  const auto = info.autoReset;
  // Programs alive before, to name any made while playing.
  const had = new Set(info.programs ?? []);
  if (window.__profileMeasured) console.profile('measured');
  const start = performance.now();
  let last = start;
  let lastDraws = F.draws;
  for (let k = 0; k < n && e.currentScene === scene; k++) {
    step(i++);
    info.reset();
    info.autoReset = false;
    await raf();
    const now = performance.now();
    frames.push(now - last);
    last = now;
    const p = e.perf;
    const j = (p.i - 1 + p.upd.length) % p.upd.length;
    upd.push(p.upd[j]);
    cpu.push(p.upd[j] + p.ren[j]);
    draws.push(F.draws - lastDraws);
    lastDraws = F.draws;
    tris.push(info.render.triangles);
  }
  if (window.__profileMeasured) console.profileEnd('measured');
  info.autoReset = auto;
  input.mouseRight = false;
  input.mouseLeft = false;
  const end = performance.now();
  const stats = (list) => {
    const s = [...list].sort((a, b) => a - b);
    const q = (f) => (s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : 0);
    const r = (x) => Math.round(x * 10) / 10;
    return { p50: r(q(0.5)), p95: r(q(0.95)), p99: r(q(0.99)), worst: r(s.at(-1) ?? 0), over33: s.filter((x) => x > 33).length, over50: s.filter((x) => x > 50).length };
  };
  const med = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)] ?? 0;
  return {
    measured: frames.length,
    frame: stats(frames),
    update: stats(upd),
    cpu: stats(cpu),
    drawCalls: med(draws),
    triangles: med(tris),
    links: F.links.filter((t) => t >= start && t <= end).length,
    texKB: Math.round(F.tex.filter(([t]) => t >= start && t <= end).reduce((z, x) => z + x[1], 0) / 1024),
    // The biggest uploads while playing, with their size arguments (and,
    // under --profile, where they came from).
    topUploads: F.tex
      .filter(([t]) => t >= start && t <= end)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([t, b, fn, dims, from]) => `${Math.round(b / 1024)} KB ${fn}(${dims}) at +${Math.round(t - start)} ms ${from}`.slice(0, 400)),
    programs: info.programs?.length ?? 0,
    // What each program made while playing was for: three names a program
    // after its material type or shader name.
    newPrograms: (info.programs ?? []).filter((q) => !had.has(q)).map((q) => String(q.name ?? '?') + ' ' + String(q.cacheKey ?? '').slice(0, 60)),
  };
}

const results = {};
const errors = [];
try {
  const page = await context.newPage();
  page.on('pageerror', (err) => errors.push(String(err).slice(0, 300)));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.SLAY?.engine?.currentSceneId === 'title', null, { timeout: 900000, polling: 200 });
  console.log(`=== ${VW}x${VH}, ${FRAMES} frames each, ${HEADED ? 'GPU' : 'software rendering'} ===`);
  for (const where of ONLY) {
    const setup = await page.evaluate(setUp, { where, seed: SEED });
    const cdp = PROFILE ? await page.context().newCDPSession(page) : null;
    let measured = null;
    if (cdp) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
      measured = new Promise((res) => cdp.once('Profiler.consoleProfileFinished', (ev) => res(ev.profile)));
      await page.evaluate(() => (window.__profileMeasured = true));
    }
    const r = await page.evaluate(play, { n: FRAMES, settleMs: SETTLE_MS, settleFrames: SETTLE_FRAMES, fight: where !== 'town' });
    if (cdp) {
      const profile = await measured;
      const byId = new Map(profile.nodes.map((nd) => [nd.id, nd]));
      const self = new Map();
      const dts = profile.timeDeltas ?? [];
      profile.samples.forEach((id, k) => {
        const f = byId.get(id)?.callFrame;
        if (!f || ['(idle)', '(program)', '(garbage collector)', '(root)'].includes(f.functionName)) return;
        if (!f.url && !f.functionName) return;
        const key = `${f.functionName || '(anon)'} ${(f.url || 'native').split('/').pop()}:${f.lineNumber + 1}`;
        self.set(key, (self.get(key) ?? 0) + (dts[k + 1] ?? dts[k] ?? 0) / 1000);
      });
      r.topSelf = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, ms]) => [k, Math.round(ms)]);
      // Who called the top three, three frames up, by the same time.
      const parent = new Map();
      for (const nd of profile.nodes) for (const c of nd.children ?? []) parent.set(c, nd.id);
      const name = (f) => `${f.functionName || '(anon)'}:${f.lineNumber + 1}`;
      r.callers = [];
      for (const [top] of r.topSelf.slice(0, 3)) {
        const via = new Map();
        profile.samples.forEach((id, k) => {
          const f = byId.get(id)?.callFrame;
          if (!f || `${f.functionName || '(anon)'} ${(f.url || 'native').split('/').pop()}:${f.lineNumber + 1}` !== top) return;
          const chain = [];
          for (let q = parent.get(id); q !== undefined && chain.length < 4; q = parent.get(q)) chain.push(name(byId.get(q).callFrame));
          const c = chain.join(' < ');
          via.set(c, (via.get(c) ?? 0) + (dts[k + 1] ?? dts[k] ?? 0) / 1000);
        });
        for (const [c, ms] of [...via.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)) r.callers.push(`${top.split(' ')[0]} ${Math.round(ms)} ms < ${c}`);
      }
      await cdp.detach().catch(() => {});
    }
    results[where] = { ...setup, ...r };
    const f = (s) => `p50 ${s.p50} p95 ${s.p95} p99 ${s.p99} worst ${s.worst} (>33: ${s.over33}, >50: ${s.over50})`;
    console.log(`\n${where}: ${setup.scene}, ${setup.monsters} monsters${setup.boss ? ', boss' : ''}, quality ${setup.quality}, ${r.measured} frames`);
    console.log(`  frame   ${f(r.frame)}`);
    console.log(`  update  ${f(r.update)}`);
    console.log(`  cpu     ${f(r.cpu)}`);
    console.log(`  draw calls ${r.drawCalls}, triangles ${r.triangles}, programs ${r.programs}, linked while playing ${r.links}, uploaded while playing ${r.texKB} KB`);
    for (const n of r.newPrograms) console.log(`  new while playing: ${n}`);
    for (const [k, ms] of r.topSelf ?? []) console.log(`  self ${String(ms).padStart(6)} ms  ${k}`);
    for (const c of r.callers ?? []) console.log(`  via ${c}`);
    if (PROFILE) for (const u of r.topUploads.slice(0, 2)) console.log(`  upload ${u}`);
  }
  await page.close();
} finally {
  await context.close().catch(() => {});
  await server.close();
  rmSync(profileDir, { recursive: true, force: true });
}

const fails = [];
if (errors.length) fails.push(`${errors.length} page errors: ${[...new Set(errors)].slice(0, 3).join(' | ')}`);
const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
for (const [where, r] of Object.entries(results)) {
  if (r.links > 0) fails.push(`${where}: ${r.links} programs linked while playing`);
  const b = base?.[where];
  if (!b) continue;
  const grew = (k, now, was, rel, abs = 0) => {
    if (now > was * (1 + rel) && now - was > abs) fails.push(`${where}: ${k} ${now} (baseline ${was})`);
  };
  grew('draw calls', r.drawCalls, b.drawCalls, 0.15);
  grew('triangles', r.triangles, b.triangles, 0.15);
  grew('update p95 ms', r.update.p95, b.update.p95, 0.6, 2);
  if (r.update.over33 > b.update.over33 + 3) fails.push(`${where}: update frames over 33 ms ${r.update.over33} (baseline ${b.update.over33})`);
  if (r.texKB > b.texKB + 2048) fails.push(`${where}: uploaded while playing ${r.texKB} KB (baseline ${b.texKB})`);
}
if (SAVE) {
  writeFileSync(BASELINE, JSON.stringify({ ...(base ?? {}), ...results }, null, 2) + '\n');
  console.log(`\nbaseline written to ${path.relative(process.cwd(), BASELINE)}`);
} else if (!base) console.log('\nno baseline yet (run with --save)');
console.log(fails.length ? `\nFAILED: ${fails.length}\n  ${fails.join('\n  ')}` : '\nOK: smooth where it can be measured, and no worse than the baseline.');
process.exit(fails.length && !SAVE ? 1 : 0);
