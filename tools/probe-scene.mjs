/**
 * What is actually on screen, by name and size?
 *
 *   node tools/probe-scene.mjs
 *
 * Written after two rounds of guessing at artifacts from a screenshot and
 * getting it wrong. Dumps every mesh in the dungeon scene with its name,
 * material, blending mode and world bounding box, so "what is that dark cone"
 * has an answer rather than a theory.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4227;
const server = spawn('npx', ['vite','preview','--port',String(PORT),'--strictPort','--host','127.0.0.1'], { stdio:['ignore','ignore','pipe'] });
process.on('exit', () => server.kill('SIGTERM'));
for (let i=0;i<60;i++){ try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {} await sleep(500); }

const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.SLAY?.debug, null, { timeout: 420000, polling: 500 });

const out = await page.evaluate(async () => {
  localStorage.clear();
  window.SLAY.save.hardReset();
  window.SLAY.debug.makeCharacter('warden', 5);
  await window.SLAY.engine.goTo('dungeon', { depth: 1 });
  for (let i = 0; i < 60; i++) await new Promise((r) => requestAnimationFrame(r));
  const scene = window.SLAY.engine.currentScene;
  const root = scene?.mesh?.root;
  if (!root) return { error: 'no mesh root' };

  const THREE = window.SLAY.THREE ?? null;
  const rows = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    const g = o.geometry;
    g?.computeBoundingBox?.();
    const bb = g?.boundingBox;
    const size = bb ? [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z] : [0, 0, 0];
    rows.push({
      name: o.name || '(unnamed)',
      kind: o.isInstancedMesh ? `inst x${o.count}` : 'mesh',
      material: m?.name || m?.type || '?',
      blending: m?.blending ?? null,
      transparent: !!m?.transparent,
      depthWrite: m?.depthWrite !== false,
      side: m?.side ?? 0,
      // The tall narrow things are what a cone looks like in a size dump.
      size: size.map((v) => +v.toFixed(1)),
      tris: g?.index ? g.index.count / 3 : (g?.attributes?.position?.count ?? 0) / 3,
    });
  });
  // Biggest first: whatever is filling the frame is near the top.
  rows.sort((a, b) => b.size[1] - a.size[1]);
  return { biome: scene.level?.biome, layout: scene.level?.layout, rows: rows.slice(0, 30) };
});

if (out.error) { console.log(out.error); }
else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${out.biome} / ${out.layout}\n`);
  console.log(`${pad('name', 24)} ${pad('kind', 12)} ${pad('material', 22)} ${pad('blend', 6)} ${pad('trans', 6)} ${pad('side', 5)} ${pad('size (w,h,d)', 22)} tris`);
  for (const r of out.rows) {
    console.log(
      `${pad(r.name, 24)} ${pad(r.kind, 12)} ${pad(r.material, 22)} ${pad(r.blending, 6)} ${pad(r.transparent, 6)} ${pad(r.side, 5)} ${pad(r.size.join(','), 22)} ${Math.round(r.tris)}`,
    );
  }
}
await browser.close();
server.kill('SIGTERM');
process.exit(0);
