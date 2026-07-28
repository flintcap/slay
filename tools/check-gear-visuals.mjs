/**
 * Verifies that equipped gear actually attaches geometry to the player skeleton.
 *
 * Scene-graph inspection, not a screenshot: the container has no GPU and full
 * renders time out, but the socket tree is exactly what "gear changes your look"
 * means and it can be read without drawing a frame.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4213;
const server = spawn(
  'npx',
  ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
process.on('exit', () => server.kill('SIGTERM'));
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break;
  } catch {}
  await sleep(500);
}

const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 240)));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.SLAY?.debug, null, { timeout: 420000, polling: 500 });

const result = await page.evaluate(async () => {
  window.SLAY.debug.makeCharacter('warden', 24);
  const c = window.SLAY.save.account.current;
  await window.SLAY.engine.goTo('dungeon', { depth: 1 });

  // Give the scene a couple of frames to build the player.
  for (let i = 0; i < 8; i++) await new Promise((r) => requestAnimationFrame(r));

  const scene = window.SLAY.engine.currentScene;
  const player = scene?.player;
  if (!player) return { error: 'no player on scene' };

  const found = {};
  for (const [name, bone] of Object.entries(player.bones)) {
    for (const child of bone.children) {
      const slot = child.userData?.socketSlot;
      if (!slot) continue;
      let tris = 0;
      child.traverse((o) => {
        if (o.isMesh && o.geometry) {
          const g = o.geometry;
          tris += (g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3;
        }
      });
      (found[slot] ??= []).push({ bone: name, tris: Math.round(tris) });
    }
  }
  return {
    equipped: Object.fromEntries(
      Object.entries(c.equipment)
        .filter(([, v]) => v)
        .map(([k, v]) => [k, v.baseId]),
    ),
    sockets: found,
  };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
server.kill('SIGTERM');
process.exit(result?.error ? 1 : 0);
