/**
 * Which colliders stop you with nothing on screen?
 *
 *   node tools/check-ghost.mjs
 *
 * Reported: "the invisible walls are intended?"
 *
 * Static analysis says the prop colliders match the prop meshes, so this asks
 * the real scene instead. It boots the game, takes the dungeon's actual
 * collider list, and overlaps each small box against the world-space bounds of
 * every solid the scene draws — per instance, not per batch. A collider with a
 * drawn solid inside its footprint is a thing you can see and bump into. A
 * collider with nothing in it is an invisible wall.
 *
 * The floor counts as nothing: a solid has to stand at least a shin's height
 * out of the ground to be something you can see coming.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4193;
const CHROME = '/opt/pw-browsers/chromium';

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'ignore', 'pipe'],
});
process.on('exit', () => server.kill('SIGTERM'));
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break;
  } catch {
    /* wait */
  }
  await sleep(500);
}

const browser = await chromium.launch({
  executablePath: existsSync(CHROME) ? CHROME : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
// Boot is slow under software rendering; the debug hooks appear only once the
// engine has started.
await page.waitForFunction(() => !!window.SLAY?.engine, null, { timeout: 180000 });

const places = [{ where: 'town' }, { where: 'dungeon', depth: 1 }, { where: 'dungeon', depth: 4 }, { where: 'dungeon', depth: 9 }];
const results = [];
for (const place of places) {
  const out = await page.evaluate(async (p) => {
    localStorage.clear();
    window.SLAY.save.hardReset();
    window.SLAY.debug.makeCharacter('warden', 5);
    await window.SLAY.engine.goTo(p.where, p.where === 'dungeon' ? { depth: p.depth } : {});
    for (let i = 0; i < 60; i++) await new Promise((r) => requestAnimationFrame(r));
    const scene = window.SLAY.engine.currentScene;
    // The town keeps its geometry and colliders on `town`, the dungeon on
    // `mesh`. Everything below only needs a root and a collider list.
    const mesh = scene?.mesh ?? scene?.town;
    const THREE = window.SLAY.THREE;
    if (!mesh || !THREE) return { error: `no ${p.where}` };

    mesh.root.updateMatrixWorld(true);

    // Every drawn solid, as a world-space box. Instanced props are expanded
    // per instance: one bounding box around a whole batch of barrels would
    // cover the room and hide exactly the bug being looked for.
    const boxes = [];
    const bb = new THREE.Box3();
    const m4 = new THREE.Matrix4();
    mesh.root.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      // Glows, pools and shafts are light, not geometry you can see edge-on.
      if (mat?.transparent && mat?.blending !== 1) return;
      // The terrain buckets are one merged mesh per chunk, so their bounding
      // boxes are 64 metres across and would swallow every collider on the
      // level. They are the rock itself, already answered for by the merged
      // wall colliders this check skips.
      if (o.name === 'roof' || o.name === 'ceiling' || o.name.startsWith('surface')) return;
      const g = o.geometry;
      g.computeBoundingBox();
      if (!g.boundingBox) return;
      if (o.isInstancedMesh) {
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m4);
          m4.premultiply(o.matrixWorld);
          bb.copy(g.boundingBox).applyMatrix4(m4);
          // A collapsed instance (a looted chest) is scaled to nothing.
          if (bb.max.x - bb.min.x < 0.01) continue;
          boxes.push([bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z]);
        }
      } else {
        bb.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
        boxes.push([bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z]);
      }
    });

    const ghosts = [];
    let checked = 0;
    for (const c of mesh.colliders) {
      // Merged wall rectangles are the level's own rock; there are hundreds and
      // they are never the complaint. Only the small boxes — props, stairs,
      // arches — can be ghosts.
      if (c.w > 3.5 || c.d > 3.5) continue;
      checked++;
      const floorY = mesh.floorY ? mesh.floorY(c.x, c.z) : 0;
      const x0 = c.x - c.w * 0.5;
      const x1 = c.x + c.w * 0.5;
      const z0 = c.z - c.d * 0.5;
      const z1 = c.z + c.d * 0.5;
      let seen = false;
      for (const b of boxes) {
        if (b[3] < x0 || b[0] > x1 || b[5] < z0 || b[2] > z1) continue;
        // Floor decals and the ground itself do not count as something to bump
        // into; it has to stand up out of the floor.
        if (b[4] - floorY < 0.25) continue;
        seen = true;
        break;
      }
      if (!seen) ghosts.push({ x: +c.x.toFixed(1), z: +c.z.toFixed(1), w: +c.w.toFixed(2), d: +c.d.toFixed(2) });
    }
    return { biome: scene.level?.biome ?? '-', layout: scene.level?.layout ?? '-', checked, ghosts };
  }, place);
  results.push({ label: place.where === 'town' ? 'town' : `depth ${place.depth}`, ...out });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('where', 9)} ${pad('biome', 14)} ${pad('layout', 12)} ${pad('boxes', 7)} ghosts`);
let bad = 0;
for (const r of results) {
  if (r.error) {
    console.log(`${pad(r.label, 9)} ${r.error}`);
    bad++;
    continue;
  }
  bad += r.ghosts.length;
  console.log(
    `${pad(r.label, 9)} ${pad(r.biome, 14)} ${pad(r.layout, 12)} ${pad(r.checked, 7)} ${r.ghosts.length}${
      r.ghosts.length > 0 ? '   <-- INVISIBLE' : ''
    }`,
  );
  for (const g of r.ghosts.slice(0, 8)) {
    console.log(`          at ${g.x}, ${g.z}   ${g.w} x ${g.d}`);
  }
}
console.log(
  bad === 0
    ? '\nOK — every box you collide with has something drawn in it.'
    : `\nFAILED — ${bad} colliders stop the player with nothing on screen.`,
);
await browser.close();
server.kill('SIGTERM');
process.exit(bad === 0 ? 0 : 1);
