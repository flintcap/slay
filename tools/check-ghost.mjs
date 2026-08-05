/**
 * Which colliders stop you with nothing on screen?
 *
 *   node tools/check-ghost.mjs
 *
 * Reported: "the invisible walls are intended?"
 *
 * Static analysis says the prop colliders match the prop meshes, so this asks
 * the real scene instead. It boots the game, takes the dungeon's actual
 * collider list, and for each one fires rays straight down through the box from
 * head height. A collider with something under the rays is a thing you can see
 * and bump into. A collider the rays pass clean through — nothing but floor —
 * is an invisible wall.
 *
 * Floor counts as nothing: rays that only hit geometry at or below the floor
 * height are misses.
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

const depths = [1, 4, 9];
const results = [];
for (const depth of depths) {
  const out = await page.evaluate(async (d) => {
    localStorage.clear();
    window.SLAY.save.hardReset();
    window.SLAY.debug.makeCharacter('warden', 5);
    await window.SLAY.engine.goTo('dungeon', { depth: d });
    for (let i = 0; i < 60; i++) await new Promise((r) => requestAnimationFrame(r));
    const scene = window.SLAY.engine.currentScene;
    const mesh = scene?.mesh;
    const THREE = window.SLAY.THREE;
    if (!mesh || !THREE) return { error: 'no dungeon' };

    mesh.root.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    ray.far = 40;
    const down = new THREE.Vector3(0, -1, 0);
    const origin = new THREE.Vector3();

    // Rays at the box centre and its four quarter points, so a thin prop under
    // a wide collider still registers.
    const offsets = [
      [0, 0],
      [0.35, 0.35],
      [-0.35, 0.35],
      [0.35, -0.35],
      [-0.35, -0.35],
    ];

    const ghosts = [];
    let checked = 0;
    for (const c of mesh.colliders) {
      // Merged wall rectangles are the level's own rock; they are never the
      // complaint and there are hundreds of them. Only the small boxes — props,
      // stairs, arches — can be ghosts.
      if (c.w > 3.5 || c.d > 3.5) continue;
      checked++;
      const floorY = mesh.floorY ? mesh.floorY(c.x, c.z) : 0;
      let hitTop = -Infinity;
      for (const [ox, oz] of offsets) {
        origin.set(c.x + ox * c.w, floorY + 12, c.z + oz * c.d);
        ray.set(origin, down);
        const hits = ray.intersectObject(mesh.root, true);
        for (const h of hits) {
          // Ignore the floor itself and anything the roof shader discards.
          if (h.object.name === 'lightShafts') continue;
          const above = h.point.y - floorY;
          if (above < 0.12) continue;
          // The rock lid is 5m up and covers everything; it is not a prop.
          if (above > 4) continue;
          if (above > hitTop) hitTop = above;
        }
      }
      if (hitTop === -Infinity) {
        ghosts.push({ x: +c.x.toFixed(1), z: +c.z.toFixed(1), w: +c.w.toFixed(2), d: +c.d.toFixed(2) });
      }
    }
    return { biome: scene.level?.biome, layout: scene.level?.layout, checked, ghosts };
  }, depth);
  results.push({ depth, ...out });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('depth', 7)} ${pad('biome', 14)} ${pad('layout', 12)} ${pad('boxes', 7)} ghosts`);
let bad = 0;
for (const r of results) {
  if (r.error) {
    console.log(`${pad(r.depth, 7)} ${r.error}`);
    bad++;
    continue;
  }
  bad += r.ghosts.length;
  console.log(
    `${pad(r.depth, 7)} ${pad(r.biome, 14)} ${pad(r.layout, 12)} ${pad(r.checked, 7)} ${r.ghosts.length}${
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
