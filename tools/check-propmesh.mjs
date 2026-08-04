/**
 * Do the props that generation places actually reach the screen?
 *
 *   node tools/check-propmesh.mjs
 *
 * The density audit counts what the generator emits. This counts what the
 * builder drew: instanced meshes, their instance counts, and how that compares
 * with the placement list. A floor can measure full and render bare if the
 * geometry step drops it.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4223;
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
  window.SLAY.debug.makeCharacter('warden', 12);
  await window.SLAY.engine.goTo('dungeon', { depth: 3 });
  for (let i = 0; i < 60; i++) await new Promise((r) => requestAnimationFrame(r));
  const scene = window.SLAY.engine.currentScene;
  const level = scene?.level;
  const root = scene?.mesh?.root;
  if (!level || !root) return { error: 'no level' };

  const byKind = {};
  let instanced = 0;
  let instances = 0;
  root.traverse((o) => {
    if (!o.isInstancedMesh) return;
    instanced++;
    instances += o.count;
    const k = (o.name || 'unnamed').split('|')[0];
    byKind[k] = (byKind[k] ?? 0) + o.count;
  });
  // What the generator asked for, by kind.
  const placed = {};
  for (const p of level.props) placed[p.kind] = (placed[p.kind] ?? 0) + 1;
  return {
    biome: level.biome,
    variant: level.variant,
    layout: level.layout,
    propsPlaced: level.props.length,
    spawns: level.spawns.length,
    instancedMeshes: instanced,
    instancesDrawn: instances,
    byKind,
    placed,
  };
});

console.log(JSON.stringify(out, null, 1).slice(0, 4000));
await browser.close();
server.kill('SIGTERM');
process.exit(0);
