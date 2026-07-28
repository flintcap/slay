/**
 * Targeted dungeon probe: identifies the largest meshes on screen, where the
 * player actually is, and how bright the frame is — enough to explain a bad
 * frame without another round of guessing.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4191;
const CHROME = '/opt/pw-browsers/chromium';

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'ignore', 'pipe'],
});
process.on('exit', () => server.kill('SIGTERM'));
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch { /* wait */ }
  await sleep(500);
}

const browser = await chromium.launch({
  executablePath: existsSync(CHROME) ? CHROME : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.SLAY?.debug, { timeout: 300000 });

await page.evaluate(async () => {
  window.SLAY.debug.makeCharacter('warden', 12);
  await window.SLAY.engine.goTo('dungeon', { depth: 3 });
});
await page.evaluate(() => new Promise((r) => { let i = 0; const s = () => (++i > 60 ? r() : requestAnimationFrame(s)); requestAnimationFrame(s); }));

const out = await page.evaluate(() => {
  const THREE = window.SLAY.THREE;
  const s = window.SLAY.engine.currentScene;
  const cam = s.camera;
  const rows = [];
  s.scene.traverse((o) => {
    if (!(o.isMesh || o.isSkinnedMesh) || !o.visible) return;
    const g = o.geometry;
    if (!g?.attributes?.position) return;
    g.computeBoundingBox?.();
    const b = g.boundingBox;
    if (!b) return;
    o.updateWorldMatrix(true, false);
    const sc = new (b.min.constructor)();
    o.getWorldScale?.(sc);
    const sx = (b.max.x - b.min.x) * (sc.x || 1);
    const sy = (b.max.y - b.min.y) * (sc.y || 1);
    const sz = (b.max.z - b.min.z) * (sc.z || 1);
    const p = o.getWorldPosition(new (b.min.constructor)());
    rows.push({
      name: o.name || '(unnamed)',
      parent: o.parent?.name || '',
      mat: (Array.isArray(o.material) ? o.material[0] : o.material)?.type ?? '?',
      size: [+sx.toFixed(1), +sy.toFixed(1), +sz.toFixed(1)],
      vol: +(sx * sy * sz).toFixed(0),
      pos: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)],
      distToCam: +p.distanceTo(cam.position).toFixed(1),
    });
  });
  rows.sort((a, b) => b.vol - a.vol);

  const pl = s.player;
  const plPos = pl ? pl.root.getWorldPosition(new (cam.position.constructor)()) : null;

  return {
    biggest: rows.slice(0, 12),
    camPos: [+cam.position.x.toFixed(1), +cam.position.y.toFixed(1), +cam.position.z.toFixed(1)],
    playerPos: plPos ? [+plPos.x.toFixed(1), +plPos.y.toFixed(1), +plPos.z.toFixed(1)] : null,
    playerDistToCam: plPos ? +plPos.distanceTo(cam.position).toFixed(1) : null,
    playerChildMeshes: (() => { let n = 0; pl?.root.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) n++; }); return n; })(),
    playerScale: pl ? [pl.root.scale.x, pl.root.scale.y, pl.root.scale.z] : null,
    enemyCount: s.enemies?.length ?? 0,
    enemiesNearCam: (s.enemies ?? []).filter((e) => e.root.position.distanceTo(cam.position) < 40).length,
    hotbar: window.SLAY.save.account.current?.hotbar ?? null,
    skillCount: Object.keys(window.SLAY.save.account.current?.skills ?? {}).length,
  };
});

console.log(JSON.stringify(out, null, 1));
await browser.close();
server.kill('SIGTERM');
process.exit(0);
