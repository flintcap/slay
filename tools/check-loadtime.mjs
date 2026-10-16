/**
 * How long does the published game take to load, and where does the time go?
 *
 *   node tools/bundle-artifact.mjs                       # build what is published
 *   SLAY_PORT=4333 timeout 1500 node tools/check-loadtime.mjs
 *   SLAY_PORT=4333 timeout 1500 node tools/check-loadtime.mjs --mbps=40 --warm
 *
 * Serves `dist-single/slay.html` wrapped the way the artifact host wraps it,
 * with every file in `dist-single/files.json` at its published path (the
 * seven `.wasm` packs, `assets/packs.json`, music, the worker), so this times
 * the bundle a player downloads, not the dev server.
 *
 * Reports, from navigation:
 *  - each boot-bar step and when the title scene is live
 *  - first town (a new warden, town entered) and first map (depth 1)
 *  - every request with its start, end and size, so pack downloads show
 *  - main-thread long tasks over 50 ms in each phase, the biggest first
 *
 * --mbps=N throttles the network to N megabits a second (localhost is
 * otherwise instant, which hides the pack downloads). --warm loads the page a
 * second time in the same profile, so IndexedDB bakes from the first visit are
 * there, as for a returning player. Timings on a shared machine are noisy:
 * compare before and after runs taken back to back.
 */
import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { serveSingle, CHROME_ARGS, CHROME_PATH } from './lib/single.mjs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const PORT = Number(process.env.SLAY_PORT ?? 4333);
const MBPS = Number(arg('mbps') ?? 0);
const WARM = process.argv.includes('--warm');
const MAP = !process.argv.includes('--no-map');
// --profile: a CPU profile of each phase, the heaviest functions listed.
const PROFILE = process.argv.includes('--profile');
// Seconds spent on the select screen before starting, as a player would.
const DWELL = Number(arg('dwell') ?? 5);
// --walk: after the map loads, stand by monster after monster and then the
// boss, as a player exploring would, and list the stalls on the way.
const WALK = process.argv.includes('--walk');
// --no-select: straight from the title to town (a shorter run).
const SELECT = !process.argv.includes('--no-select');
// Stops on the walk, and frames at each; frames of the fight after it.
const STOPS = Number(arg('stops') ?? 10);
const STOP_FRAMES = Number(arg('stop-frames') ?? 24);
const FIGHT_FRAMES = Number(arg('fight') ?? 250);
const [VW, VH] = (arg('size') ?? '1280x720').split('x').map(Number);

// --dir: serve another build (a baseline built in a scratch copy).
const server = await serveSingle(PORT, arg('dir') ?? 'dist-single');

const profile = mkdtempSync(path.join(tmpdir(), 'slay-loadtime-'));
const context = await chromium.launchPersistentContext(profile, {
  executablePath: CHROME_PATH,
  args: CHROME_ARGS,
  viewport: { width: VW, height: VH },
});

// Installed before any page script: boot-bar steps and long tasks, stamped
// with performance.now() (ms since navigation).
await context.addInitScript(() => {
  const w = window;
  w.__lt = { steps: [], long: [] };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__lt.long.push([Math.round(e.startTime), Math.round(e.duration)]);
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  const watch = () => {
    const el = document.getElementById('boot-status');
    if (!el) return false;
    const note = () => w.__lt.steps.push([Math.round(performance.now()), el.textContent]);
    note();
    new MutationObserver(note).observe(el, { childList: true, characterData: true, subtree: true });
    return true;
  };
  if (!watch()) document.addEventListener('DOMContentLoaded', watch, { once: true });
});

async function visit(label) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 300));
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  if (MBPS > 0) {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 40,
      downloadThroughput: (MBPS * 1e6) / 8,
      uploadThroughput: (MBPS * 1e6) / 8,
    });
  }
  // Requests, timed against navigation start in the page's own clock.
  const reqs = new Map();
  cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url, t0: e.timestamp, bytes: 0 }));
  cdp.on('Network.loadingFinished', (e) => {
    const r = reqs.get(e.requestId);
    if (r) {
      r.t1 = e.timestamp;
      r.bytes = e.encodedDataLength;
    }
  });
  let navTs = null;
  cdp.on('Network.requestWillBeSent', (e) => {
    if (navTs === null && e.type === 'Document') navTs = e.timestamp;
  });

  if (PROFILE) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
    await cdp.send('Profiler.start');
  }
  const profiles = [];
  const cut = async (name) => {
    if (!PROFILE) return;
    const { profile } = await cdp.send('Profiler.stop');
    profiles.push([name, profile]);
    await cdp.send('Profiler.start');
  };
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.SLAY?.engine?.currentSceneId === 'title', null, { timeout: 900000, polling: 100 });
  const titleAt = await page.evaluate(() => Math.round(performance.now()));
  await cut('boot');
  console.log(`[${label}] title scene live at ${titleAt} ms`);
  if (PROFILE) printProfile('boot', profiles[profiles.length - 1][1]);
  // Let the boot screen fade and the title settle, as a player would see it.
  await page.evaluate(() => new Promise((r) => setTimeout(r, 1500)));
  await cut('title, 1.5 s');

  // Each phase reports as it ends, so a run cut short still says something.
  const phase = async (name, fn, a) => {
    const t0 = await page.evaluate(() => performance.now());
    await page.evaluate(fn, a);
    const t1 = await page.evaluate(() => performance.now());
    await cut(name);
    const ls = await page.evaluate(([a, b]) => window.__lt.long.filter(([t]) => t >= a && t < b).map(([, d]) => d), [t0, t1]);
    const top = ls.slice().sort((x, y) => y - x).slice(0, 6);
    console.log(`[${label}] ${name}: ${Math.round(t1 - t0)} ms; ${ls.length} long tasks, ${ls.reduce((x, y) => x + y, 0)} ms, biggest ${top.join(', ')}`);
    // Programs first built during this phase, and the materials that use them.
    const progs = await page.evaluate(() => {
      const gl = window.SLAY?.engine?.renderer?.gl;
      // WebGPU keeps no program list (its pipelines are counted elsewhere).
      if (!gl || !Array.isArray(gl.info?.programs)) return null;
      const seen = (window.__lt.progSeen ??= new Set());
      const fresh = gl.info.programs.filter((q) => !seen.has(q));
      for (const q of fresh) seen.add(q);
      const scene = window.SLAY.engine.currentScene?.scene;
      const names = fresh.map((prog) => {
        const out = new Set();
        scene?.traverse((o) => {
          const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
          for (const m of ms) if (gl.properties.get(m)?.currentProgram === prog) out.add(`${o.name || o.parent?.name || o.type}/${m.name || m.type}`);
        });
        return [...out].slice(0, 2).join(' ') || prog.name;
      });
      return { total: gl.info.programs.length, names };
    });
    if (progs) console.log(`    programs: ${progs.total} alive, ${progs.names.length} new${progs.names.length && progs.names.length <= 40 ? `: ${progs.names.join(' | ')}` : ''}`);
    if (PROFILE && profiles.length) printProfile(name, profiles[profiles.length - 1][1]);
    return { name, t0: Math.round(t0), ms: Math.round(t1 - t0) };
  };
  const phases = [];
  // The way a new player goes: a moment on the title, the select screen,
  // then town with a fresh warden.
  if (SELECT) phases.push(
    await phase('select screen', async () => {
      localStorage.clear();
      window.SLAY.save.hardReset();
      await window.SLAY.engine.goTo('charSelect');
      for (let i = 0; i < 10; i++) await new Promise((r) => requestAnimationFrame(r));
    }),
  );
  if (SELECT) phases.push(await phase(`select, ${DWELL} s dwell`, (s) => new Promise((r) => setTimeout(r, s * 1000)), DWELL));
  phases.push(
    await phase('first town', async () => {
      if (window.SLAY.engine.currentSceneId === 'title') {
        localStorage.clear();
        window.SLAY.save.hardReset();
      }
      window.SLAY.debug.makeCharacter('warden', 1, 4242);
      await window.SLAY.engine.goTo('town');
      for (let i = 0; i < 10; i++) await new Promise((r) => requestAnimationFrame(r));
    }),
  );
  if (MAP) {
    phases.push(
      await phase('first map', async () => {
        await window.SLAY.engine.goTo('dungeon', { depth: 1, seed: 4243 });
        for (let i = 0; i < 10; i++) await new Promise((r) => requestAnimationFrame(r));
      }),
    );
    if (WALK) {
      phases.push(
        await phase('walk the map', async ({ stopsMax, frames }) => {
          const scene = window.SLAY.engine.currentScene;
          window.SLAY.debug.godMode(true);
          const raf = () => new Promise((r) => requestAnimationFrame(r));
          const p = scene.player;
          // A greedy tour from the entry, nearest unvisited monster next, so
          // each stop shows bodies the last one did not.
          const left = (scene.enemies ?? []).filter((e) => e !== scene.boss);
          const stops = [];
          let at = p.position.clone();
          while (left.length && stops.length < stopsMax) {
            let bi = 0;
            let bd = Infinity;
            left.forEach((e, i) => {
              const d = e.root.position.distanceToSquared(at);
              if (d < bd) {
                bd = d;
                bi = i;
              }
            });
            const e = left.splice(bi, 1)[0];
            // Skip what the last stop already had in view.
            if (bd < 20 * 20 && stops.length) continue;
            stops.push(e);
            at = e.root.position.clone();
          }
          if (scene.boss) stops.push(scene.boss);
          window.__lt.stops = [];
          // Shader programs built on the way, and whose: a program first
          // linked mid-play is a stall the load could have taken.
          const gl = window.SLAY.engine.renderer.gl;
          const seen = new Set(gl.info.programs);
          const whose = (prog) => {
            const out = new Set();
            scene.scene.traverse((o) => {
              const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
              for (const m of ms) if (gl.properties.get(m)?.currentProgram === prog) out.add(`${o.name || o.parent?.name || o.type}/${m.name || m.type}`);
            });
            return [...out].slice(0, 3).join(' ') || prog.name;
          };
          for (const e of stops) {
            const t = performance.now();
            p.position.set(e.root.position.x + 4, p.position.y, e.root.position.z + 4);
            p.root.position.copy(p.position);
            for (let i = 0; i < frames; i++) await raf();
            const fresh = gl.info.programs.filter((q) => !seen.has(q));
            for (const q of fresh) seen.add(q);
            window.__lt.stops.push([Math.round(t), e === scene.boss ? 'boss' : e.def?.id ?? '?', fresh.map(whose)]);
          }
        }, { stopsMax: STOPS, frames: STOP_FRAMES }),
      );
      const lt = await page.evaluate(() => window.__lt);
      console.log(`walk stops (ms, monster, long tasks until the next stop):`);
      for (let i = 0; i < (lt.stops ?? []).length; i++) {
        const [t, id, progs] = lt.stops[i];
        const end = lt.stops[i + 1]?.[0] ?? Infinity;
        const ls = lt.long.filter(([a]) => a >= t && a < end).map(([, d]) => d);
        console.log(`  ${String(t).padStart(7)}  ${String(id).padEnd(24)} ${ls.join(', ')}`);
        if (progs?.length) console.log(`           ${progs.length} new programs: ${progs.join(' | ')}`);
      }
      // Then fight (the soak's autopilot: attack the nearest, a hotbar skill
      // every 25 frames), so first casts, hits, deaths and summons show.
      phases.push(
        await phase('fight', async (frames) => {
          const e = window.SLAY.engine;
          const scene = e.currentScene;
          const input = e.input;
          const raf = () => new Promise((r) => requestAnimationFrame(r));
          const v = new scene.player.position.constructor();
          for (let i = 0; i < frames; i++) {
            if (e.currentScene !== scene) break;
            const p = scene.player.position;
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
            await raf();
          }
          input.mouseRight = false;
        }, FIGHT_FRAMES),
      );
    }
    // A few seconds of play in the map: what stalls once the fade is up.
    phases.push(
      await phase('map, 5 s idle', async () => {
        await new Promise((r) => setTimeout(r, 5000));
      }),
    );
  }
  const lt = await page.evaluate(() => window.__lt);
  if (PROFILE) await cdp.send('Profiler.stop').catch(() => {});
  await page.close();

  console.log(`\n=== ${label} visit${MBPS ? ` (${MBPS} Mbit/s)` : ' (unthrottled)'} ===`);
  console.log('boot steps (ms from navigation):');
  for (const [t, s] of lt.steps) console.log(`  ${String(t).padStart(7)}  ${s}`);
  console.log(`  ${String(titleAt).padStart(7)}  title scene live`);
  for (const p of phases) console.log(`  ${String(p.t0).padStart(7)}  ${p.name}: ${p.ms} ms`);

  const rows = [...reqs.values()].filter((r) => r.t1 && navTs !== null);
  const big = rows.filter((r) => r.bytes > 100_000).sort((a, b) => a.t0 - b.t0);
  console.log('requests over 100 KB (start..end ms, KB):');
  for (const r of big) {
    const name = r.url.replace(`http://127.0.0.1:${PORT}/`, '') || '(page)';
    console.log(`  ${String(Math.round((r.t0 - navTs) * 1000)).padStart(7)}..${String(Math.round((r.t1 - navTs) * 1000)).padEnd(7)} ${String(Math.round(r.bytes / 1024)).padStart(6)}  ${name}`);
  }
  const totalKB = Math.round(rows.reduce((a, r) => a + r.bytes, 0) / 1024);
  console.log(`  ${rows.length} requests, ${totalKB} KB in all`);

  const bounds = [
    ['boot', 0, titleAt],
    ...phases.map((p) => [p.name, p.t0, p.t0 + p.ms]),
  ];
  console.log('long tasks over 50 ms, by phase (count, total ms, biggest):');
  for (const [name, a, b] of bounds) {
    const ls = lt.long.filter(([t]) => t >= a && t < b);
    const sum = ls.reduce((s, [, d]) => s + d, 0);
    const top = ls.map(([, d]) => d).sort((x, y) => y - x).slice(0, 6);
    console.log(`  ${name.padEnd(16)} ${String(ls.length).padStart(4)}  ${String(sum).padStart(7)}  ${top.join(', ')}`);
  }
  if (errors.length) console.log(`errors:\n  ${[...new Set(errors)].slice(0, 60).join('\n  ')}`);
  const out = { label, mbps: MBPS, titleMs: titleAt, phases: phases.map((p) => [p.name, p.ms]), totalKB, errors: errors.length };
  console.log(JSON.stringify(out));
  return out;
}

/** Self time and inclusive time per function, the heaviest first. */
function printProfile(name, prof) {
  const byId = new Map(prof.nodes.map((n) => [n.id, n]));
  const dt = new Map();
  for (let i = 0; i < prof.samples.length; i++) dt.set(prof.samples[i], (dt.get(prof.samples[i]) ?? 0) + (prof.timeDeltas[i] ?? 0) / 1000);
  const self = new Map();
  const total = new Map();
  const label = (n) => `${n.callFrame.functionName || '(anon)'} ${(n.callFrame.url || '').split('/').pop()}:${n.callFrame.lineNumber + 1}`;
  const walk = (n, stack) => {
    const k = label(n);
    const ms = dt.get(n.id) ?? 0;
    self.set(k, (self.get(k) ?? 0) + ms);
    const seen = new Set(stack);
    let sum = ms;
    for (const c of n.children ?? []) sum += walk(byId.get(c), seen.has(k) ? stack : [...stack, k]);
    if (!seen.has(k)) total.set(k, (total.get(k) ?? 0) + sum);
    return sum;
  };
  walk(byId.get(prof.nodes[0].id), []);
  // Native calls (WebGL, canvas encode) are where the main thread waits on
  // the GPU process; under software rendering that wait is mostly the GPU's
  // own work and says little about a real machine. JS is what transfers.
  let js = 0;
  let native = 0;
  let idle = 0;
  let gc = 0;
  for (const [k, v] of self) {
    if (k.startsWith('(idle)')) idle += v;
    else if (k.startsWith('(garbage')) gc += v;
    else if (k.startsWith('(program)') || k.startsWith('(root)')) continue;
    else if (/ :0$/.test(k)) native += v;
    else js += v;
  }
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  console.log(`profile: ${name}   JS ${Math.round(js)} ms, native/GPU wait ${Math.round(native)} ms, GC ${Math.round(gc)} ms, idle ${Math.round(idle)} ms`);
  console.log('  self ms:');
  for (const [k, v] of top(self, 14)) console.log(`    ${String(Math.round(v)).padStart(7)}  ${k}`);
  console.log('  inclusive ms:');
  for (const [k, v] of top(total, 30)) if (!/^\(root\)|^\(program\)|^\(anon\) :0/.test(k)) console.log(`    ${String(Math.round(v)).padStart(7)}  ${k}`);
}

try {
  await visit('cold');
  if (WARM) await visit('warm');
} finally {
  await context.close().catch(() => {});
  await server.close();
  rmSync(profile, { recursive: true, force: true });
}
process.exit(0);
