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
await page.evaluate(() => { localStorage.clear(); window.SLAY.save.hardReset?.(); window.SLAY.debug.makeCharacter('warden', 12); });

async function settle(n) { await page.evaluate((n) => new Promise((r) => { let i = 0; const s = () => (++i >= n ? r() : requestAnimationFrame(s)); requestAnimationFrame(s); }), n); }

for (const name of WANT) {
  const t = Date.now();
  try {
    if (name === 'town') {
      await page.evaluate(async () => { await window.SLAY.engine.goTo('town'); });
    } else {
      const s = SEEDS[name];
      if (!s) { console.log('unknown', name); continue; }
      await page.evaluate(async (s) => { await window.SLAY.engine.goTo('dungeon', { depth: s.depth, seed: s.seed }); }, s);
    }
    await settle(40);
    const info = await page.evaluate(() => {
      const gl = window.SLAY.engine.renderer.gl;
      const sc = window.SLAY.engine.currentScene;
      let lights = 0; let meshes = 0; const mats = new Set();
      sc.scene.traverse((o) => { if (o.isLight) lights++; if (o.isMesh) { meshes++; (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m)); } });
      return { calls: gl.info.render.calls, tris: gl.info.render.triangles, programs: gl.info.programs?.length, textures: gl.info.memory.textures, geometries: gl.info.memory.geometries, lights, meshes, materials: mats.size, biome: sc.biome?.id, variant: sc.level?.variant, layout: sc.level?.layout };
    });
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file });
    console.log(`${name.padEnd(13)} ${((Date.now() - t) / 1000) | 0}s ${JSON.stringify(info)}`);
  } catch (e) {
    console.log(`${name} FAILED ${String(e).slice(0, 300)}`);
  }
}
if (errors.length) { console.log(`--- ${errors.length} console errors`); for (const e of errors.slice(0, 12)) console.log('  ' + e); }
writeFileSync(path.join(OUT, 'errors.txt'), errors.join('\n'));
await browser.close();
stop();
process.exit(0);
