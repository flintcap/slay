/**
 * World-stream render harness (local, not committed).
 *   node shots/wtools/render.mjs --out=shots/w1 --shots=town,crypt,caverns
 * Boots once, then visits each requested scene and writes a PNG plus the
 * renderer's GPU-independent counters (draw calls, triangles, programs).
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const OUT = path.resolve(args.out ?? 'shots/w');
const WANT = String(args.shots ?? 'crypt').split(',');
const W = Number(args.width ?? 1280), H = Number(args.height ?? 720);
const PORT = Number(process.env.SLAY_PORT ?? 4304);
mkdirSync(OUT, { recursive: true });
const SEEDS = {"crypt":{"depth":1,"seed":1001},"caverns":{"depth":1,"seed":1000},"foundry":{"depth":2,"seed":1001},"sunkenTemple":{"depth":3,"seed":1001},"hive":{"depth":5,"seed":1004},"frostvault":{"depth":7,"seed":1010},"ashwaste":{"depth":10,"seed":1010},"voidspire":{"depth":14,"seed":1000}};

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: ['ignore', 'ignore', 'pipe'] });
const stop = () => { try { server.kill('SIGTERM'); } catch {} };
process.on('exit', stop);
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {} await sleep(500); }

const CHROME = '/opt/pw-browsers/chromium';
const browser = await chromium.launch({ executablePath: existsSync(CHROME) ? CHROME : undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.setDefaultTimeout(600000);
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || /THREE\.|shader|WebGL/i.test(m.text())) errors.push(m.text().slice(0, 400)); });
page.on('pageerror', (e) => errors.push(String(e).slice(0, 400)));
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => { const s = window.SLAY; return !!s && !!s.debug && !!s.engine && s.engine.currentSceneId !== null; }, null, { timeout: 900000 });
console.log(`booted in ${((Date.now() - t0) / 1000) | 0}s`);
// The rig leans toward the cursor; park it mid-screen so every shot is centred on the hero.
await page.mouse.move(W / 2, H / 2);
await page.evaluate(() => { localStorage.clear(); window.SLAY.save.hardReset?.(); window.SLAY.debug.makeCharacter('warden', 12); });

async function settle(n) { await page.evaluate((n) => new Promise((r) => { let i = 0; const s = () => (++i >= n ? r() : requestAnimationFrame(s)); requestAnimationFrame(s); }), n); }

// A shot is `biome` (the entry) or `biome@where`: `@room` the biggest room
// that is not the entry, or `@<kind>` the first room of that kind (treasure,
// ambush, vault, boss...). Shots of the same biome in a row reuse the level.
let loaded = null;
for (const name of WANT) {
  const t = Date.now();
  const [base, where] = name.split('@');
  try {
    if (base === 'town') {
      await page.evaluate(async () => { await window.SLAY.engine.goTo('town'); });
      loaded = null;
    } else if (loaded !== base) {
      const s = SEEDS[base];
      if (!s) { console.log('unknown', name); continue; }
      await page.evaluate(async (s) => { await window.SLAY.engine.goTo('dungeon', { depth: s.depth, seed: s.seed }); }, s);
      loaded = base;
    }
    const close = !!args.close || where === 'close';
    if (where && where !== 'close') {
      const at = await page.evaluate((where) => {
        const sc = window.SLAY.engine.currentScene;
        const rooms = sc.level.rooms.filter((r) => r.kind !== 'entry');
        let room = null;
        if (where === 'room') room = rooms.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];
        else room = rooms.find((r) => r.kind === where);
        if (!room) return null;
        // Stand a little south of the centre so the centre piece is in front.
        // ...but stay inside a small room: +3 put the hero in the corridor.
        const off = Math.max(1, Math.min(3, Math.floor(room.h / 2) - 1));
        const p = sc.mesh.tileToWorld(Math.round(room.center.x), Math.round(room.center.y) + off);
        sc.player.position.set(p.x, p.y, p.z);
        sc.player.root?.position?.set(p.x, p.y, p.z);
        sc.rig?.follow?.(sc.player.root);
        sc.rig?.snap?.();
        return { kind: room.kind, w: room.w, h: room.h };
      }, where);
      if (!at) { console.log(`${name} no such room`); continue; }
      console.log(`${name} -> ${JSON.stringify(at)}`);
      // Snap again once the scene has run a frame with the hero in place.
      await settle(3);
      await page.evaluate(() => { const sc = window.SLAY.engine.currentScene; sc.rig?.snap?.(); });
    }
    await settle(38);
    // Count one whole frame, every post pass included, not just the last quad.
    await page.evaluate(() => { const gl = window.SLAY.engine.renderer.gl; gl.info.autoReset = false; gl.info.reset(); });
    await settle(1);
    const info = await page.evaluate((close) => {
      const gl = window.SLAY.engine.renderer.gl;
      const sc = window.SLAY.engine.currentScene;
      let lights = 0; let meshes = 0; const mats = new Set();
      // The heaviest visible meshes, by triangles times instances.
      const heavy = [];
      sc.scene.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        const g = o.geometry; const n = (g.index ? g.index.count : g.getAttribute('position')?.count ?? 0) / 3;
        heavy.push([Math.round(n * (o.isInstancedMesh ? o.count : 1)), `${o.name || o.type}/${(Array.isArray(o.material) ? o.material[0] : o.material)?.name ?? ''}${o.isInstancedMesh ? 'x' + o.count : ''}${o.castShadow ? ' S' : ''}`]);
      });
      heavy.sort((a, b) => b[0] - a[0]);
      window.__heavy = heavy.slice(0, 6);
      let casters = 0; let shadowLights = 0;
      sc.scene.traverse((o) => { if (o.isLight && o.castShadow) shadowLights++; if (o.isMesh && o.castShadow && o.visible) casters++; });
      sc.scene.traverse((o) => { if (o.isLight) lights++; if (o.isMesh) { meshes++; (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m)); } });
      // Where the player is, and whether anything of them is drawn: a frame
      // with no visible hero is the worst failure this harness can catch.
      let hero = null;
      const pl = sc.player;
      if (pl && pl.root) {
        let parts = 0; let shown = 0;
        pl.root.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) { parts++; let v = true; for (let q = o; q; q = q.parent) if (!q.visible) v = false; if (v) shown++; } });
        const p = pl.root.position.clone(); p.y += 1; p.project(sc.camera);
        hero = { parts, shown, sx: Math.round((p.x * 0.5 + 0.5) * innerWidth), sy: Math.round((0.5 - p.y * 0.5) * innerHeight) };
        // What stands between the camera and the hero's chest, and the floor
        // under their feet: a drawn hero that cannot be seen is buried or hidden.
        const rc = window.SLAY.engine.input.raycaster;
        const chest = pl.root.position.clone(); chest.y += 1.1;
        const from = sc.camera.position.clone();
        const dist = from.distanceTo(chest);
        rc.set(from, chest.clone().sub(from).normalize());
        rc.near = 0; rc.far = dist + 2;
        const own = new Set(); pl.root.traverse((o) => own.add(o));
        const isShown = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
        hero.hits = rc.intersectObject(sc.scene, true)
          .filter((h) => isShown(h.object) && !h.object.isSprite && !h.object.isPoints && !h.object.isLine)
          .slice(0, 5)
          .map((h) => `${own.has(h.object) ? 'HERO ' : ''}${h.object.name || h.object.type}/${(Array.isArray(h.object.material) ? h.object.material[0] : h.object.material)?.name ?? ''}@${h.distance.toFixed(1)}`);
        hero.dist = +dist.toFixed(1);
        hero.y = +pl.root.position.y.toFixed(2);
        hero.pelvis = pl.animator ? +Number(pl.animator.pelvisDrop).toPrecision(3) : null;
        hero.floor = sc.mesh?.floorY ? +sc.mesh.floorY(pl.root.position.x, pl.root.position.z).toFixed(2) : null;
        if (close && sc.rig) { sc.rig.zoomBias = 0; sc.rig.zoom(-6); }
      }
      return { hero, calls: gl.info.render.calls, tris: gl.info.render.triangles, programs: gl.info.programs?.length, textures: gl.info.memory.textures, geometries: gl.info.memory.geometries, lights, shadowLights, casters, heavy: window.__heavy, meshes, materials: mats.size, biome: sc.biome?.id, variant: sc.level?.variant, layout: sc.level?.layout, _r: (gl.info.autoReset = true) };
    }, close);
    if (close) await settle(30);
    if (args.probe) {
      // What is drawn at these screen pixels: --probe=x,y;x,y
      const pts = String(args.probe).split(';').map((q) => q.split(',').map(Number));
      const hits = await page.evaluate((pts) => {
        const sc = window.SLAY.engine.currentScene; const rc = window.SLAY.engine.input.raycaster;
        const shown = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
        return pts.map(([x, y]) => {
          rc.setFromCamera({ x: (x / innerWidth) * 2 - 1, y: -(y / innerHeight) * 2 + 1 }, sc.camera);
          rc.near = 0; rc.far = 200;
          const h = rc.intersectObject(sc.scene, true).filter((h) => shown(h.object) && h.object.isMesh && !/roof|bedrock/i.test(h.object.name)).slice(0, 4);
          return `${x},${y}: ` + h.map((q) => {
            const o = q.object; const m = Array.isArray(o.material) ? o.material[0] : o.material;
            o.geometry.computeBoundingBox?.(); const bb = o.geometry.boundingBox; const sz = bb ? bb.getSize(o.position.clone()).toArray().map((v) => +v.toFixed(2)) : null;
            return `${o.name || o.type}/${m?.name ?? ''}@${q.distance.toFixed(1)} [${m?.type} #${m?.color?.getHexString?.()} em#${m?.emissive?.getHexString?.() ?? '-'} op${m?.opacity} bl${m?.blending} geo:${o.geometry.type} ${JSON.stringify(sz)} parent:${o.parent?.name || o.parent?.type}]`;
          }).join(' | ');
        });
      }, pts);
      console.log(`PROBE ${name} ${JSON.stringify(hits)}`);
    }
    const file = path.join(OUT, `${name.replace('@', '-')}.png`);
    await page.screenshot({ path: file });
    console.log(`${name.padEnd(13)} ${((Date.now() - t) / 1000) | 0}s ${JSON.stringify(info)}`);
    if (args.diag && close) {
      // Is every program the hero draws with alive and linked?
      const progs = await page.evaluate(() => {
        const sc = window.SLAY.engine.currentScene; const r = window.SLAY.engine.renderer.gl; const g = r.getContext();
        const live = new Set(r.info.programs);
        const seen = new Map();
        sc.player.root.traverse((o) => {
          if (!o.isMesh) return;
          for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
            const p = r.properties.get(m); const cp = p?.currentProgram;
            const k = cp ? cp.id : 'none';
            if (seen.has(k)) { seen.get(k).n++; continue; }
            seen.set(k, { n: 1, mat: m.name, live: cp ? live.has(cp) : null, used: cp?.usedTimes, isProg: cp ? g.isProgram(cp.program) : null,
              link: cp && g.isProgram(cp.program) ? g.getProgramParameter(cp.program, g.LINK_STATUS) : null,
              lsv: p?.lightsStateVersion, keys: p?.programs ? p.programs.size : 0, ver: m.version, vis: m.visible, side: m.side, cw: m.colorWrite, dt: m.depthTest, blend: m.blending, op: m.opacity });
          }
        });
        return [...seen.entries()];
      });
      console.log('PROGS ' + JSON.stringify(progs));
      // Experiments, each followed by a frame grab, cheapest suspect first.
      const tryIt = async (tag, fn) => {
        const out = await page.evaluate(fn);
        await settle(4);
        await page.screenshot({ path: file.replace('.png', `-${tag}.png`) });
        console.log(`EXP ${tag} ${JSON.stringify(out ?? null)}`);
      };
      await tryIt('bones', () => {
        const r = window.SLAY.engine.renderer.gl; const g = r.getContext(); const out = [];
        window.SLAY.engine.currentScene.player.root.traverse((o) => {
          if (!o.isSkinnedMesh || out.length > 5) return;
          const t = o.skeleton.boneTexture; const tp = t ? r.properties.get(t) : null;
          out.push({ n: o.name, bones: o.skeleton.bones.length, tex: !!t, gpu: tp?.__webglTexture ? g.isTexture(tp.__webglTexture) : null, ver: t?.version, gv: tp?.__version, bm: o.bindMode, nan: Array.from(o.skeleton.boneMatrices).some((v) => !Number.isFinite(v)), max: Math.max(...Array.from(o.skeleton.boneMatrices).map(Math.abs)) });
        });
        return out;
      });
      // Which bone, and what the animator thinks, when the skin explodes.
      const bones = await page.evaluate(() => {
        const pl = window.SLAY.engine.currentScene.player; const out = { bad: [], anim: {} };
        pl.root.updateMatrixWorld(true);
        let sk = null; pl.root.traverse((o) => { if (o.isSkinnedMesh && !sk) sk = o.skeleton; });
        if (sk) sk.bones.forEach((b, i) => {
          const m = sk.boneMatrices.slice(i * 16, i * 16 + 16); const mx = Math.max(...Array.from(m).map(Math.abs));
          const inv = Math.max(...sk.boneInverses[i].elements.map(Math.abs)); const w = Math.max(...b.matrixWorld.elements.map(Math.abs));
          if (mx > 200 || inv > 200 || w > 500) out.bad.push({ i, n: b.name, mx, inv, w, p: b.position.toArray().map((v) => +v.toFixed(3)), s: b.scale.toArray().map((v) => +v.toFixed(3)), q: b.quaternion.toArray().map((v) => +v.toFixed(3)), parent: b.parent?.name });
        });
        const a = pl.animator; if (a) for (const k of Object.keys(a)) { const v = a[k]; if (typeof v === 'number') out.anim[k] = +v.toFixed(3); }
        out.anim.cur = a?.cur?.name; out.feet = a?.feet?.map((f) => ({ x: +f.x.toFixed(2), z: +f.z.toFixed(2) }));
        return out;
      });
      console.log('BONES ' + JSON.stringify(bones));
      // Recompile every program with the same fog: if the hero appears, a
      // stale program or uniform hid it, not geometry and not the fog maths.
      await page.evaluate(() => { const sc = window.SLAY.engine.currentScene; window.__fog = sc.scene.fog; sc.scene.fog = null; });
      await settle(3);
      await page.evaluate(() => { const sc = window.SLAY.engine.currentScene; sc.scene.fog = window.__fog; });
      await settle(6);
      await page.screenshot({ path: file.replace('.png', '-recompiled.png') });
      const u = await page.evaluate(() => {
        const sc = window.SLAY.engine.currentScene; const gl = window.SLAY.engine.renderer.gl;
        const out = [];
        sc.player.root.traverse((o) => {
          if (!o.isMesh || out.length > 3) return;
          const m = Array.isArray(o.material) ? o.material[0] : o.material;
          const p = gl.properties.get(m);
          const fu = p?.uniforms?.slayFog?.value;
          out.push({ n: o.name, fog: fu ? [fu.x, fu.y, fu.z, fu.w] : null, prog: p?.currentProgram?.name, key: p?.currentProgram?.cacheKey?.slice(0, 60) });
        });
        return out;
      });
      console.log('DIAG ' + JSON.stringify(u));
    }
  } catch (e) {
    console.log(`${name} FAILED ${String(e).slice(0, 300)}`);
  }
}
if (errors.length) { console.log(`--- ${errors.length} console errors`); for (const e of errors.slice(0, 12)) console.log('  ' + e); }
writeFileSync(path.join(OUT, 'errors.txt'), errors.join('\n'));
await browser.close();
stop();
process.exit(0);
