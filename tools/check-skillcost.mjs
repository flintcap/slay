/** Times the frame cost of casting each of a class's skills, one at a time. */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4220;
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
const page = await browser.newPage({ viewport: { width: 1024, height: 600 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 240)));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.SLAY?.debug, null, { timeout: 420000, polling: 500 });

const cls = process.argv[2] ?? 'ranger';
await page.evaluate(async (c) => {
  localStorage.clear();
  window.SLAY.save.hardReset();
  window.SLAY.debug.makeCharacter(c, 40);
  await window.SLAY.engine.goTo('dungeon', { depth: 3 });
}, cls);
await page.waitForFunction(() => window.SLAY.engine.currentSceneId === 'dungeon', null, { timeout: 300000, polling: 500 });
await page.evaluate(() => window.SLAY.debug.godMode(true));

const rows = await page.evaluate(async (c) => {
  const scene = window.SLAY.engine.currentScene;
  const pl = scene?.player;
  const runner = scene?.skills;
  if (!pl || !runner) return [{ id: 'ERROR', worst: -1 }];

  const ids = Object.keys(pl.character.skills).filter((k) => pl.character.skills[k] > 0);
  const out = [];
  const frame = () => new Promise((r) => requestAnimationFrame(r));

  for (const id of ids) {
    // Settle first, so the previous skill's effects are not counted.
    for (let i = 0; i < 30; i++) await frame();
    pl.cooldowns.clear();
    pl.mana = pl.stats.mana;
    let worst = 0;
    let last = performance.now();
    // Cast repeatedly: a one-off allocation hides, a per-cast stall does not.
    for (let i = 0; i < 40; i++) {
      if (i % 5 === 0) {
        pl.cooldowns.clear();
        pl.mana = pl.stats.mana;
        try { runner.cast(id, pl, pl.position.clone().add({ x: 5, y: 0, z: 0 }), scene.context(), scene.enemies, scene.boss); } catch {}
      }
      await frame();
      const now = performance.now();
      const dt = now - last;
      last = now;
      if (i > 2 && dt > worst) worst = dt;
    }
    out.push({ id, worst: +worst.toFixed(1) });
  }
  return out.sort((a, b) => b.worst - a.worst);
}, cls);

for (const r of rows) console.log(String(r.worst).padStart(8) + 'ms  ' + r.id);
await browser.close();
server.kill('SIGTERM');
process.exit(0);
