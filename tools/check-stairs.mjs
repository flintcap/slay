/** Warps the camera to the exit tile and photographs it. */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4224;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'ignore', 'pipe'],
});
process.on('exit', () => server.kill('SIGTERM'));
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {}
  await sleep(500);
}
const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 240)));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.SLAY?.debug, null, { timeout: 420000, polling: 500 });

await page.evaluate(async () => {
  localStorage.clear();
  window.SLAY.save.hardReset();
  window.SLAY.debug.makeCharacter('warden', 10);
  await window.SLAY.engine.goTo('dungeon', { depth: 1 });
});
await page.waitForFunction(() => window.SLAY.engine.currentSceneId === 'dungeon', null, { timeout: 300000, polling: 500 });
await page.evaluate(() => window.SLAY.debug.godMode(true));

const info = await page.evaluate(async () => {
  const s = window.SLAY.engine.currentScene;
  const mesh = s.mesh;
  const lvl = s.level;
  const exit = mesh.tileToWorld(lvl.exit.x, lvl.exit.y);
  // Stand the player on the exit so the camera frames it.
  s.player.root.position.set(exit.x, 0, exit.z + 3.5);
  s.player.stop();
  for (let i = 0; i < 40; i++) await new Promise((r) => requestAnimationFrame(r));
  // Structural proof: count geometry sitting near the exit and the entry.
  const entryW = mesh.tileToWorld(lvl.entry.x, lvl.entry.y);
  const near = (p, r) => {
    let n = 0;
    mesh.root.traverse((o) => {
      if (!o.isMesh) return;
      o.getWorldPosition(window.__v ??= new (window.SLAY.engine.currentScene.player.root.position.constructor)());
      const d = Math.hypot(window.__v.x - p.x, window.__v.z - p.z);
      if (d < r) n++;
    });
    return n;
  };
  return {
    exit: [exit.x.toFixed(1), exit.z.toFixed(1)],
    meshesNearExit: near(exit, 4),
    meshesNearEntry: near(entryW, 4),
  };
});
console.log(JSON.stringify(info));
mkdirSync('shots', { recursive: true });
await page.screenshot({ path: 'shots/stairs.png' });
console.log('wrote shots/stairs.png');
await browser.close();
server.kill('SIGTERM');
process.exit(0);
