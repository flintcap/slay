/**
 * Renders what the feel stream draws, in the real built game.
 *
 * Boots `dist/` in headless Chromium (SwiftShader), walks into a dungeon and
 * stages effects for every element school in a row in front of the camera:
 * cast flares, projectiles caught mid-flight, impacts, and the marks they
 * leave behind. Also dumps the particle and decal sheets as the GPU sees them.
 *
 *   npm run build
 *   SLAY_PORT=4305 node tools/shot-feel.mjs --out=shots/feel
 *
 * Shots: atlas-sprites.png, atlas-decals.png, vfx-flight.png, vfx-impact.png,
 * vfx-marks.png. Boot takes minutes under software rendering.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const OUT = path.resolve(args.out ?? 'shots/feel');
const PORT = Number(args.port ?? process.env.SLAY_PORT ?? 4305);
const WANT = String(args.shots ?? 'atlas,vfx').split(',');
mkdirSync(OUT, { recursive: true });
if (!existsSync('dist/index.html')) {
  console.error('No dist/ build found. Run `npm run build` first.');
  process.exit(1);
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', () => {});
const shutdown = () => {
  try {
    server.kill('SIGTERM');
  } catch {
    /* gone */
  }
};
process.on('exit', shutdown);
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break;
  } catch {
    /* not yet */
  }
  await sleep(500);
}

const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium';
const browser = await chromium.launch({
  executablePath: existsSync(CHROME) ? CHROME : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => !!window.SLAY?.debug && window.SLAY.engine?.currentSceneId !== null, null, { timeout: 1500000 });

async function frames(n) {
  await page.evaluate(
    (k) => new Promise((res) => {
      let i = 0;
      const step = () => (++i >= k ? res() : requestAnimationFrame(step));
      requestAnimationFrame(step);
    }),
    n,
  );
}

// Into a dungeon, monsters out of the way, camera settled.
await page.evaluate(async () => {
  const s = window.SLAY;
  s.debug.makeCharacter('pyromancer', 20);
  await s.engine.goTo('dungeon', { depth: 1 });
});
await frames(40);
await page.evaluate(() => {
  const sc = window.SLAY.engine.currentScene;
  sc.debugGodMode?.(true);
  for (const e of sc.enemies ?? []) e.root.position.set(9999, 0, 9999);
});
await frames(30);

if (WANT.includes('atlas')) {
  const dumps = await page.evaluate(() => {
    const sc = window.SLAY.engine.currentScene;
    const out = {};
    sc.scene.traverse((o) => {
      const u = o.material?.uniforms?.uAtlas?.value;
      const img = u?.image;
      if (!img || !img.toDataURL) return;
      const key = img.width === 512 && img.height === 1024 ? 'sprites' : img.width === 640 && img.height === 1280 ? 'decals' : null;
      if (key && !out[key]) out[key] = img.toDataURL('image/png');
    });
    return out;
  });
  for (const [k, url] of Object.entries(dumps)) {
    const file = path.join(OUT, `atlas-${k}.png`);
    writeFileSync(file, Buffer.from(String(url).split(',')[1], 'base64'));
    console.log('ok', file);
  }
}

if (WANT.includes('vfx')) {
  // Stage: one lane per school, perpendicular to the camera's view.
  const stage = async (phase) =>
    page.evaluate((ph) => {
      const sc = window.SLAY.engine.currentScene;
      const fx = sc.effects;
      const p = sc.player.position;
      const V = p.constructor;
      const schools = ['physical', 'fire', 'cold', 'lightning', 'poison', 'arcane', 'bone'];
      schools.forEach((school, i) => {
        const lane = (i - 3) * 1.6;
        // Camera yaw is 45 degrees; lanes run across the screen.
        const ax = p.x + lane * 0.7071 - 0.7071 * 3;
        const az = p.z - lane * 0.7071 - 0.7071 * 3;
        if (ph === 'flight') {
          fx.castFlare(school, ax, 1.1, az, {});
          fx.projectile(new V(ax, 1.1, az), new V(ax + 30 * 0.7071, 1.1, az + 30 * 0.7071), { element: school, speed: 4, size: 0.4 });
        } else if (ph === 'impact') {
          fx.impact(school, ax + 2, 0.9, az + 2, { scale: 1.3 });
        } else {
          fx.nova(ax + 4, az + 4, 1.4, { element: school, mark: true, particles: false });
        }
      });
    }, phase);
  await stage('flight');
  await frames(12);
  await page.screenshot({ path: path.join(OUT, 'vfx-flight.png'), timeout: 900000 });
  console.log('ok', path.join(OUT, 'vfx-flight.png'));
  await stage('impact');
  await frames(3);
  await page.screenshot({ path: path.join(OUT, 'vfx-impact.png'), timeout: 900000 });
  console.log('ok', path.join(OUT, 'vfx-impact.png'));
  await stage('marks');
  await frames(45);
  await page.screenshot({ path: path.join(OUT, 'vfx-marks.png'), timeout: 900000 });
  console.log('ok', path.join(OUT, 'vfx-marks.png'));
}

if (errors.length) {
  console.error(`--- ${errors.length} console error(s) ---`);
  for (const e of errors.slice(0, 20)) console.error('  ' + e);
}
await browser.close();
shutdown();
process.exit(0);
