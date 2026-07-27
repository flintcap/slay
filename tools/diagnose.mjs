/**
 * Scene diagnostics. Boots the game, enters each scene, and reports what is
 * actually in the scene graph plus every console error — so a black frame can
 * be traced to a throw, an empty graph, or a lighting problem rather than
 * guessed at.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4188;
const CHROME = '/opt/pw-browsers/chromium';

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'ignore', 'pipe'],
});
server.stderr.on('data', (d) => process.stderr.write(`[preview] ${d}`));
process.on('exit', () => server.kill('SIGTERM'));

let up = false;
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) { up = true; break; }
  } catch { /* not listening */ }
  await sleep(500);
}
if (!up) { console.error('preview never came up'); process.exit(1); }

const browser = await chromium.launch({
  executablePath: existsSync(CHROME) ? CHROME : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e)));

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
const booted = await page
  .waitForFunction(() => window.SLAY?.debug && window.SLAY?.engine?.currentSceneId, { timeout: 300000 })
  .then(() => true)
  .catch(() => false);
console.log(booted ? 'booted ok' : 'BOOT TIMED OUT');
if (!booted) {
  const st = await page.textContent('#boot-status').catch(() => null);
  console.log('boot status:', st);
}

/** Walks the active scene and summarises what would actually draw. */
const probe = async (label) => {
  const info = await page.evaluate(() => {
    const s = window.SLAY?.engine?.currentScene;
    if (!s) return { error: 'no active scene' };
    let meshes = 0, visibleMeshes = 0, lights = 0, emptyGeo = 0, totalTris = 0;
    const matNames = new Set();
    const lightInfo = [];
    const bbox = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
    s.scene.traverse((o) => {
      if (o.isLight) {
        lights++;
        lightInfo.push(`${o.type}(i=${(o.intensity ?? 0).toFixed(2)})`);
      }
      if (o.isMesh || o.isSkinnedMesh) {
        meshes++;
        if (o.visible) visibleMeshes++;
        const g = o.geometry;
        const n = g?.index ? g.index.count / 3 : (g?.attributes?.position?.count ?? 0) / 3;
        if (!n) emptyGeo++;
        totalTris += n || 0;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (m) matNames.add(m.type);
        if (g?.attributes?.position) {
          o.updateWorldMatrix(true, false);
          g.computeBoundingBox?.();
          const b = g.boundingBox;
          if (b) {
            for (const corner of [b.min, b.max]) {
              const v = corner.clone().applyMatrix4(o.matrixWorld);
              bbox.min[0] = Math.min(bbox.min[0], v.x); bbox.max[0] = Math.max(bbox.max[0], v.x);
              bbox.min[1] = Math.min(bbox.min[1], v.y); bbox.max[1] = Math.max(bbox.max[1], v.y);
              bbox.min[2] = Math.min(bbox.min[2], v.z); bbox.max[2] = Math.max(bbox.max[2], v.z);
            }
          }
        }
      }
    });
    const cam = s.camera;
    return {
      id: s.id,
      children: s.scene.children.length,
      meshes, visibleMeshes, emptyGeo, lights,
      totalTris: Math.round(totalTris),
      materials: [...matNames].join(','),
      lightInfo: lightInfo.slice(0, 8).join(' '),
      camPos: cam ? [+cam.position.x.toFixed(2), +cam.position.y.toFixed(2), +cam.position.z.toFixed(2)] : null,
      bbox: meshes ? { min: bbox.min.map((v) => +v.toFixed(1)), max: bbox.max.map((v) => +v.toFixed(1)) } : null,
      drawCalls: window.SLAY.engine.renderer.gl.info.render.calls,
      triesRendered: window.SLAY.engine.renderer.gl.info.render.triangles,
      // Builder internals: an unlit dungeon is almost always zero torches.
      torches: s.mesh?.torches?.length ?? 'n/a',
      lightPool: s.mesh?.lights?.length ?? 'n/a',
      props: s.level?.props?.length ?? 'n/a',
      spawns: s.level?.spawns?.length ?? 'n/a',
      enemies: s.enemies?.length ?? 'n/a',
      biome: s.biome?.id ?? 'n/a',
      ambientIntensity: s.biome?.ambientIntensity ?? 'n/a',
      keyIntensity: s.biome?.keyIntensity ?? 'n/a',
      nonZeroLights: (() => { let n = 0; s.scene.traverse((o) => { if (o.isLight && o.intensity > 0.01 && o.visible) n++; }); return n; })(),
    };
  });
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(info, null, 1));
};

await probe('title (auto-entered)');

for (const [label, fn] of [
  ['charSelect', () => window.SLAY.engine.goTo('charSelect')],
  ['town', async () => { window.SLAY.debug.makeCharacter('warden', 10); await window.SLAY.engine.goTo('town'); }],
  ['dungeon', async () => { window.SLAY.debug.makeCharacter('warden', 10); await window.SLAY.engine.goTo('dungeon', { depth: 1 }); }],
]) {
  try {
    await page.evaluate(fn);
    await page.evaluate(() => new Promise((r) => { let i = 0; const s = () => (++i > 30 ? r() : requestAnimationFrame(s)); requestAnimationFrame(s); }));
    await probe(label);
  } catch (e) {
    console.log(`\n=== ${label} === FAILED: ${e.message.split('\n')[0]}`);
  }
}

if (errors.length) {
  console.log(`\n--- ${errors.length} console error(s) ---`);
  for (const e of [...new Set(errors)].slice(0, 30)) console.log('  ' + e.slice(0, 400));
} else {
  console.log('\nno console errors');
}

await browser.close();
server.kill('SIGTERM');
process.exit(0);
