/**
 * Where does the published game stutter while it is being played?
 *
 *   node tools/bundle-artifact.mjs                 # build what is published
 *   SLAY_PORT=4333 timeout 2400 node tools/check-lag.mjs
 *   SLAY_PORT=4333 timeout 2400 node tools/check-lag.mjs --warm --only=select,fight
 *
 * Plays the five places a player feels lag, in the published bundle, and
 * reports every frame over 50 ms in each:
 *
 *   menus     the title idling (its first rift flare included), the settings
 *             panel opened and closed on it, and the in-game panels
 *             (inventory, character, skills, map, journal, pause) in town
 *             and in a map
 *   select    the select screen, then every class shown in turn
 *   view      gliding through the first map at running pace, enemy by
 *             enemy, as they come into view
 *   areas     the same glide crossing from one zone of the map into the next
 *   fight     the soak's autopilot: attack the nearest, a hotbar skill every
 *             25 frames
 *
 * For each segment: frames, frame time p50 / p95 / max, how many frames went
 * over 50 and 100 ms, and what happened inside the worst of them: shader
 * programs linked, texture and buffer bytes sent to the GPU, WebGL contexts
 * made, and the engine's own update and render time for that frame.
 *
 * Headless Chromium here renders in software, so every frame is slow and a
 * frame's own drawing is not what a GPU would take. What transfers to a real
 * machine is what happened inside a frame: a program linked mid-play is a
 * stall on every driver (worst on Windows), a large upload is a stall, and
 * update time is plain JavaScript. Run small (the default 480x270) so the
 * software drawing stays under the spikes. Compare before and after back to
 * back on the same machine.
 *
 * --warm plays it all a second time in the same browser profile (a returning
 * player: IndexedDB caches filled). --only=a,b runs some segments.
 * --profile adds the heaviest JavaScript functions of each segment.
 * --texlog names who sent textures to the GPU in each segment (by call
 * stack), to find an upload that repeats every frame.
 */
import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { serveSingle, CHROME_ARGS, CHROME_PATH } from './lib/single.mjs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const PORT = Number(process.env.SLAY_PORT ?? 4333);
const WARM = process.argv.includes('--warm');
const PROFILE = process.argv.includes('--profile');
const TEXLOG = process.argv.includes('--texlog');
// --census: count what the scene graph holds in the map, branch by branch.
const CENSUS = process.argv.includes('--census');
const ONLY = arg('only')?.split(',') ?? ['menus', 'select', 'view', 'areas', 'fight'];
const [VW, VH] = (arg('size') ?? '480x270').split('x').map(Number);
const FIGHT_FRAMES = Number(arg('fight') ?? 300);
// The glide: metres a frame, and how many monsters it visits.
const STRIDE = Number(arg('stride') ?? 0.5);
const MAXSTOPS = Number(arg('stops') ?? 14);
const SPIKE = 50;

// --dir: serve another build (a baseline built in a scratch copy).
const server = await serveSingle(PORT, arg('dir') ?? 'dist-single');
const profileDir = mkdtempSync(path.join(tmpdir(), 'slay-lag-'));
const context = await chromium.launchPersistentContext(profileDir, {
  executablePath: CHROME_PATH,
  args: CHROME_ARGS,
  viewport: { width: VW, height: VH },
});

// Before any page script: frame stamps, and what each frame sent to the GPU.
await context.addInitScript((texlog) => {
  const w = window;
  const L = (w.__lag = { frames: [], links: [], tex: [], buf: [], ctx: [], long: [], texBy: new Map() });
  const now = () => performance.now();
  L.draws = 0;
  L.drawLog = [];
  const tick = (t) => {
    L.frames.push(t);
    L.drawLog.push([t, L.draws]);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) L.long.push([e.startTime, e.duration]);
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  const size = (args) => {
    // (target, level, internalformat, width, height, ...) or (..., source)
    for (const a of args) {
      if (a && typeof a === 'object' && 'width' in a && 'height' in a && !(ArrayBuffer.isView(a))) return a.width * a.height * 4;
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
    wrap('linkProgram', () => L.links.push(now()));
    // Draw calls, the main thread's own cost per frame on any GPU.
    for (const n of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      wrap(n, () => L.draws++);
    }
    for (const n of ['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'compressedTexImage2D']) {
      wrap(n, (args) => {
        const b = size(args);
        L.tex.push([now(), b]);
        if (!texlog) return;
        // The first frames of ours outside three.js say who asked.
        const st = (new Error().stack ?? '').split('\n').slice(2).map((x) => x.trim().replace(/^at /, '').replace(/\(?https?:[^)]*\/([^/):]+):(\d+):\d+\)?/, '$1:$2'));
        const k = st.slice(0, 7).join(' < ');
        const r = L.texBy.get(k) ?? [0, 0];
        r[0]++;
        r[1] += b;
        L.texBy.set(k, r);
      });
    }
    wrap('bufferData', (args) => {
      const d = args[1];
      L.buf.push([now(), typeof d === 'number' ? d : d?.byteLength ?? 0]);
    });
  }
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (/webgl/.test(type) && !this.__lagSeen) {
      this.__lagSeen = true;
      L.ctx.push(now());
    }
    return gc.call(this, type, ...rest);
  };
  // The engine's per-frame update and render cost, sampled every frame.
  L.eng = [];
  const sample = () => {
    const p = w.SLAY?.engine?.perf;
    if (p && p.count) {
      const i = (p.i - 1 + p.upd.length) % p.upd.length;
      L.eng.push([now(), p.upd[i], p.ren[i]]);
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
}, TEXLOG);

const raf = () => new Promise((r) => requestAnimationFrame(r));

async function visit(label) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  const cdp = await context.newCDPSession(page);
  if (PROFILE) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
  }
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.SLAY?.engine?.currentSceneId === 'title', null, { timeout: 900000, polling: 200 });
  console.log(`\n=== ${label} visit, ${VW}x${VH} ===`);
  const summary = [];

  /** Runs `fn` in the page and reports the frames it covered. */
  const seg = async (name, fn, a) => {
    if (PROFILE) await cdp.send('Profiler.start');
    // The page clock at the profile's start, to place samples in frames.
    const t0 = await page.evaluate(() => {
      window.__lag.texBy.clear();
      return performance.now();
    });
    await page.evaluate(fn, a);
    const t1 = await page.evaluate(() => performance.now());
    const prof = PROFILE ? (await cdp.send('Profiler.stop')).profile : null;
    const r = await page.evaluate(
      ([a, b, spike]) => {
        const L = window.__lag;
        const fr = L.frames.filter((t) => t >= a && t <= b);
        const iv = [];
        for (let i = 1; i < fr.length; i++) iv.push([fr[i - 1], fr[i], fr[i] - fr[i - 1]]);
        const ms = iv.map((x) => x[2]).sort((x, y) => x - y);
        const q = (f) => (ms.length ? ms[Math.min(ms.length - 1, Math.floor(f * ms.length))] : 0);
        const inside = (list, s, e) => list.filter((x) => (Array.isArray(x) ? x[0] : x) >= s && (Array.isArray(x) ? x[0] : x) < e);
        const worst = iv
          .filter((x) => x[2] > spike)
          .sort((x, y) => y[2] - x[2])
          .slice(0, 6)
          .map(([s, e, d]) => {
            const eng = inside(L.eng, s, e + 1).at(-1);
            return {
              ms: Math.round(d),
              at: Math.round(s - a),
              links: inside(L.links, s, e).length,
              texKB: Math.round(inside(L.tex, s, e).reduce((z, x) => z + x[1], 0) / 1024),
              bufKB: Math.round(inside(L.buf, s, e).reduce((z, x) => z + x[1], 0) / 1024),
              ctx: inside(L.ctx, s, e).length,
              upd: eng ? Math.round(eng[1]) : null,
              ren: eng ? Math.round(eng[2]) : null,
            };
          });
        const upd = inside(L.eng, a, b).map((x) => x[1]);
        const dl = L.drawLog.filter((x) => x[0] >= a && x[0] <= b);
        const drawsPerFrame = dl.length > 1 ? Math.round((dl.at(-1)[1] - dl[0][1]) / (dl.length - 1)) : 0;
        return {
          frames: iv.length,
          p50: Math.round(q(0.5)),
          p95: Math.round(q(0.95)),
          max: Math.round(ms.at(-1) ?? 0),
          over50: ms.filter((x) => x > 50).length,
          over100: ms.filter((x) => x > 100).length,
          links: inside(L.links, a, b).length,
          texKB: Math.round(inside(L.tex, a, b).reduce((z, x) => z + x[1], 0) / 1024),
          ctx: inside(L.ctx, a, b).length,
          updMax: Math.round(Math.max(0, ...upd)),
          drawsPerFrame,
          updOver50: upd.filter((x) => x > 50).length,
          long: inside(L.long, a, b).map((x) => Math.round(x[1])).sort((x, y) => y - x).slice(0, 5),
          worst,
        };
      },
      [t0, t1, SPIKE],
    );
    summary.push([name, r]);
    console.log(
      `[${label}] ${name}: ${r.frames} frames, p50 ${r.p50} p95 ${r.p95} max ${r.max} ms; >50 ms: ${r.over50}, >100 ms: ${r.over100}; ` +
        `programs linked ${r.links}, textures ${r.texKB} KB, contexts ${r.ctx}; draw calls a frame ${r.drawsPerFrame}; update max ${r.updMax} ms (${r.updOver50} over 50); long tasks ${r.long.join(', ')}`,
    );
    for (const w of r.worst) {
      console.log(`      ${String(w.ms).padStart(5)} ms at +${w.at}: links ${w.links}, tex ${w.texKB} KB, buf ${w.bufKB} KB, ctx ${w.ctx}, update ${w.upd}, render ${w.ren}`);
    }
    if (prof) {
      printProfile(prof);
      // What ran inside the slow updates and the long tasks, on their own.
      const wins = await page.evaluate(
        ([a, b]) => {
          const L = window.__lag;
          const w = [];
          for (const [t, u, r] of L.eng) if (t >= a && t <= b && u > 50) w.push([t - u - r - 4, t]);
          for (const [t, d] of L.long) if (t >= a && t <= b) w.push([t, t + d]);
          return w;
        },
        [t0, t1],
      );
      if (wins.length) printProfile(prof, { t0, wins });
    }
    if (TEXLOG) {
      const by = await page.evaluate(() => [...window.__lag.texBy.entries()].sort((x, y) => y[1][1] - x[1][1]).slice(0, 6));
      for (const [k, [n, b]] of by) console.log(`      tex ${Math.round(b / 1024)} KB in ${n} uploads: ${k.slice(0, 400)}`);
    }
  };

  const frames = async (n) => {
    for (let i = 0; i < n; i++) await raf();
  };

  if (ONLY.includes('menus')) {
    await seg('menus: title, 8 s idle', () => new Promise((r) => setTimeout(r, 8000)));
    await seg('menus: title settings open', async () => {
      window.SLAY.events.emit('ui:open', { panel: 'settings' });
      await new Promise((r) => setTimeout(r, 1500));
    });
    await seg('menus: title settings close', async () => {
      window.SLAY.events.emit('ui:close', { panel: 'settings' });
      await new Promise((r) => setTimeout(r, 1000));
    });
  }

  if (ONLY.includes('select')) {
    await seg('select: open', async () => {
      localStorage.clear();
      window.SLAY.save.hardReset();
      await window.SLAY.engine.goTo('charSelect');
      await new Promise((r) => setTimeout(r, 1500));
    });
    const classes = ['warden', 'mage', 'shadowblade', 'revenant', 'ranger'];
    for (const id of classes.slice(1).concat(classes[0])) {
      await seg(`select: show ${id}`, async (cid) => {
        // Pick the class's row the way a player does, so the panel's detail
        // (portrait, skill icons) is built as well as the hero on the plinth.
        const rows = [...document.querySelectorAll('.csx-row')];
        const ids = ['warden', 'mage', 'shadowblade', 'revenant', 'ranger'];
        const row = rows[ids.indexOf(cid)];
        if (row) row.click();
        else window.SLAY.events.emit('ui:open', { panel: `class:${cid}` });
        await new Promise((r) => setTimeout(r, 1500));
      }, id);
    }
  }

  const needTown = ONLY.some((o) => ['menus', 'view', 'areas', 'fight'].includes(o));
  if (needTown) {
    await seg('town: enter', async () => {
      if (window.SLAY.engine.currentSceneId !== 'charSelect') {
        localStorage.clear();
        window.SLAY.save.hardReset();
      }
      window.SLAY.debug.makeCharacter('warden', 1, 4242);
      await window.SLAY.engine.goTo('town');
      await new Promise((r) => setTimeout(r, 2000));
    });
  }
  const PANELS = ['inventory', 'character', 'skills', 'map', 'journal', 'questLog'];
  const panels = async (where) => {
    for (const id of PANELS) {
      await seg(`menus: ${where} ${id} open`, async (pid) => {
        window.SLAY.events.emit('ui:open', { panel: pid });
        await new Promise((r) => setTimeout(r, 1200));
      }, id);
      await seg(`menus: ${where} ${id} close`, async (pid) => {
        window.SLAY.events.emit('ui:close', { panel: pid });
        await new Promise((r) => setTimeout(r, 600));
      }, id);
    }
  };
  if (ONLY.includes('menus')) await panels('town');

  const needMap = ONLY.some((o) => ['menus', 'view', 'areas', 'fight'].includes(o));
  if (needMap) {
    await seg('map: enter', async () => {
      await window.SLAY.engine.goTo('dungeon', { depth: 1, seed: 4243 });
      window.SLAY.debug.godMode(true);
      await new Promise((r) => setTimeout(r, 2000));
    });
    if (CENSUS) {
      // What the scene graph walks every frame, by top-level branch.
      const rows = await page.evaluate(() => {
        const scene = window.SLAY.engine.currentScene.scene;
        const out = [];
        let all = 0;
        let auto = 0;
        for (const c of scene.children) {
          let n = 0;
          let a = 0;
          let meshes = 0;
          let transp = 0;
          c.traverse((o) => {
            n++;
            if (o.matrixAutoUpdate) a++;
            if (o.isMesh || o.isPoints || o.isSprite) {
              meshes++;
              const m = Array.isArray(o.material) ? o.material[0] : o.material;
              if (m?.transparent) transp++;
            }
          });
          all += n;
          auto += a;
          out.push(`${(c.name || c.type).slice(0, 28).padEnd(28)} objects ${String(n).padStart(5)}  auto ${String(a).padStart(5)}  drawables ${String(meshes).padStart(5)}  transparent ${transp}`);
        }
        out.unshift(`scene: ${all} objects, ${auto} with matrixAutoUpdate`);
        return out;
      });
      for (const r of rows) console.log(`      census ${r}`);
    }
  }
  if (ONLY.includes('menus')) {
    await seg('menus: map pause open', async () => {
      window.SLAY.events.emit('ui:open', { panel: 'pause' });
      await new Promise((r) => setTimeout(r, 2000));
    });
    await seg('menus: map pause close', async () => {
      window.SLAY.events.emit('ui:close', { panel: 'pause' });
      await new Promise((r) => setTimeout(r, 600));
    });
    await panels('map');
  }

  // The glide: the hero moves at running pace from stop to stop, through
  // the zones in order, so bodies and areas come into view as they would.
  if (ONLY.includes('view') || ONLY.includes('areas')) {
    await seg('view+areas: glide through the map', async ({ stride, maxStops }) => {
      const scene = window.SLAY.engine.currentScene;
      const p = scene.player;
      // Stops: every live monster, nearest first from the entry, then the boss.
      const left = (scene.enemies ?? []).filter((e) => e !== scene.boss);
      const stops = [];
      let at = p.position.clone();
      while (left.length) {
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
        if (bd < 14 * 14 && stops.length) continue;
        stops.push(e.root.position.clone());
        at = e.root.position.clone();
      }
      if (scene.boss) stops.push(scene.boss.root.position.clone());
      // A fixed stride a frame, as a running hero covers at about 30 frames
      // a second. (Software frames are slow; a stride by wall time would
      // jump across the map.)
      const zones = [];
      const raf = () => new Promise((r) => requestAnimationFrame(r));
      for (const s of stops.slice(0, maxStops)) {
        const from = p.position.clone();
        const d = Math.hypot(s.x + 3 - from.x, s.z + 3 - from.z);
        const steps = Math.max(1, Math.ceil(d / stride));
        for (let i = 1; i <= steps; i++) {
          const k = i / steps;
          const x = from.x + (s.x + 3 - from.x) * k;
          const z = from.z + (s.z + 3 - from.z) * k;
          p.position.set(x, scene.mesh.floorY(x, z), z);
          p.root.position.copy(p.position);
          await raf();
          if (scene.zoneHere !== zones.at(-1)?.[1]) zones.push([performance.now(), scene.zoneHere]);
        }
      }
      window.__lag.zones = zones;
    }, { stride: STRIDE, maxStops: MAXSTOPS });
    const zones = await page.evaluate(() => window.__lag.zones ?? []);
    console.log(`      zones crossed: ${zones.length - 1}`);
    // The frames around each zone crossing, on their own.
    const near = await page.evaluate((zs) => {
      const L = window.__lag;
      const out = [];
      for (const [t] of zs.slice(1)) {
        const fr = L.frames.filter((f) => f >= t - 400 && f <= t + 1200);
        let worst = 0;
        for (let i = 1; i < fr.length; i++) worst = Math.max(worst, fr[i] - fr[i - 1]);
        const links = L.links.filter((x) => x >= t - 400 && x <= t + 1200).length;
        out.push(`${Math.round(worst)} ms (links ${links})`);
      }
      return out;
    }, zones);
    if (near.length) console.log(`      worst frame within 1.2 s of each zone crossing: ${near.join(', ')}`);
  }

  if (ONLY.includes('fight')) {
    await seg('fight: autopilot', async (n) => {
      const e = window.SLAY.engine;
      const scene = e.currentScene;
      const input = e.input;
      const raf = () => new Promise((r) => requestAnimationFrame(r));
      const v = new scene.player.position.constructor();
      for (let i = 0; i < n; i++) {
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
    }, FIGHT_FRAMES);
  }

  // The way on: into the exit, through the curtain, into the next area.
  if (ONLY.includes('areas')) {
    const more = await page.evaluate(() => {
      const sc = window.SLAY.engine.currentScene;
      return sc?.id === 'dungeon' && sc.levelIndex + 1 < sc.run.levels.length;
    });
    if (more) {
      // What the area change asks of the shader cache: the light set and
      // biome either side, and how each new program's key differs from the
      // nearest program of the same shader that was already there.
      const lightsAndKeys = () => {
        const sc = window.SLAY.engine.currentScene;
        const n = { dir: 0, dirShadow: 0, point: 0, pointShadow: 0, spot: 0, spotShadow: 0, hemi: 0 };
        sc.scene.traverseVisible((o) => {
          if (!o.isLight) return;
          if (o.isDirectionalLight) (n.dir++, o.castShadow && n.dirShadow++);
          else if (o.isPointLight) (n.point++, o.castShadow && n.pointShadow++);
          else if (o.isSpotLight) (n.spot++, o.castShadow && n.spotShadow++);
          else if (o.isHemisphereLight) n.hemi++;
        });
        const fog = sc.scene.fog ? (sc.scene.fog.isFogExp2 ? 'exp2' : 'linear') : 'none';
        const keys = (window.SLAY.engine.renderer.gl.info.programs ?? []).map((q) => [String(q.name ?? '?'), String(q.cacheKey ?? '')]);
        return { biome: sc.level?.biome, lights: n, fog, env: !!sc.scene.environment, keys };
      };
      const before = await page.evaluate(lightsAndKeys);
      await seg('areas: next area, curtain down', async () => {
        const scene = window.SLAY.engine.currentScene;
        const from = scene.levelIndex;
        const p = scene.player;
        const t0 = performance.now();
        // The exit only opens to a hero standing on it; keep putting them there.
        while (scene.levelIndex === from && performance.now() - t0 < 120000) {
          const e = scene.exitPos;
          p.position.set(e.x, p.position.y, e.z);
          p.root.position.copy(p.position);
          await new Promise((r) => setTimeout(r, 50));
        }
        while (scene.transitioning && performance.now() - t0 < 180000) await new Promise((r) => setTimeout(r, 20));
      });
      const after = await page.evaluate(lightsAndKeys);
      const had = new Set(before.keys.map((k) => k[1]));
      const fresh = after.keys.filter((k) => !had.has(k[1]));
      console.log(`      area change: ${before.biome} -> ${after.biome}; lights ${JSON.stringify(before.lights)} -> ${JSON.stringify(after.lights)}; fog ${before.fog} -> ${after.fog}; env ${before.env} -> ${after.env}`);
      const diffs = new Map();
      let unmatched = 0;
      for (const [name, key] of fresh) {
        const parts = key.split(',');
        let best = null;
        for (const [n2, k2] of before.keys) {
          if (n2 !== name) continue;
          const q = k2.split(',');
          if (q.length !== parts.length) continue;
          const d = [];
          for (let i = 0; i < q.length; i++) if (q[i] !== parts[i]) d.push(`${i}:${q[i].slice(0, 24)}>${parts[i].slice(0, 24)}`);
          if (!best || d.length < best.length) best = d;
        }
        if (!best) {
          unmatched++;
          continue;
        }
        const tag = best.join(' ') || '(same key)';
        diffs.set(tag, (diffs.get(tag) ?? 0) + 1);
      }
      console.log(`      ${fresh.length} new programs; ${unmatched} with no program of that shader before`);
      for (const [tag, c] of [...diffs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`      ${String(c).padStart(3)} x  ${tag.slice(0, 300)}`);
      await seg('areas: first 5 s in the new area', () => new Promise((r) => setTimeout(r, 5000)));
    }
  }

  // One line per segment, for before / after tables.
  console.log(`\n${label} summary (frames over ${SPIKE} ms, worst ms, programs linked, contexts, draw calls a frame):`);
  for (const [name, r] of summary) {
    console.log(`  ${name.padEnd(36)} ${String(r.over50).padStart(4)}  ${String(r.max).padStart(6)}  ${String(r.links).padStart(4)}  ${String(r.ctx).padStart(3)}  ${String(r.drawsPerFrame).padStart(5)}`);
  }
  if (errors.length) console.log(`page errors:\n  ${[...new Set(errors)].slice(0, 6).join('\n  ')}`);
  await page.close();
  return summary;
}

/**
 * The heaviest JavaScript, by self time and by time inside (callees
 * included). Native GL calls are left out. With `only`, just the samples
 * that fall inside its windows (page clock, ms; `t0` is the page clock when
 * the profile started).
 */
function printProfile(prof, only) {
  const self = new Map();
  const incl = new Map();
  const byId = new Map(prof.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const label = (n) => {
    const f = n.callFrame;
    return f.url ? `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}` : null;
  };
  let at = prof.startTime;
  for (let i = 0; i < prof.samples.length; i++) {
    const dt = (prof.timeDeltas[i] ?? 0);
    at += dt;
    if (only) {
      const t = only.t0 + (at - prof.startTime) / 1000;
      if (!only.wins.some(([a, b]) => t >= a && t <= b)) continue;
    }
    const n = byId.get(prof.samples[i]);
    if (!n) continue;
    const ms = dt / 1000;
    const k = label(n);
    if (k) self.set(k, (self.get(k) ?? 0) + ms);
    const seen = new Set();
    for (let id = n.id; id !== undefined; id = parent.get(id)) {
      const kk = label(byId.get(id));
      if (!kk || seen.has(kk)) continue;
      seen.add(kk);
      incl.set(kk, (incl.get(kk) ?? 0) + ms);
    }
  }
  const top = (m, k) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k);
  const js = [...self.values()].reduce((a, b) => a + b, 0);
  const head = only ? `slow updates and long tasks (${only.wins.length})` : 'segment';
  console.log(`      ${head}: JS self ${Math.round(js)} ms`);
  console.log(`        self: ${top(self, 10).map(([k, v]) => `${Math.round(v)} ${k}`).join(' | ')}`);
  console.log(`        inside: ${top(incl, 16).map(([k, v]) => `${Math.round(v)} ${k}`).join(' | ')}`);
}

try {
  await visit('cold');
  if (WARM) await visit('warm');
} finally {
  await context.close().catch(() => {});
  await server.close();
  rmSync(profileDir, { recursive: true, force: true });
}
process.exit(0);
