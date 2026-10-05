/**
 * Times the frame cost of casting each of a class's skills, one at a time.
 *
 *   SLAY_PORT=4309 node tools/check-skillcost.mjs [class] [--frames=20]
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.SLAY_PORT ?? 4220);
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  // Own process group: npx starts vite as a child, and killing npx alone
  // left vite running and holding the port after the checker exited.
  detached: true,
  stdio: ['ignore', 'ignore', 'pipe'],
});
const killServer = () => {
  try {
    process.kill(-server.pid, 'SIGKILL');
  } catch {
    /* already gone */
  }
};
process.on('exit', killServer);
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

const cls = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'ranger';
await page.evaluate(async (c) => {
  localStorage.clear();
  window.SLAY.save.hardReset();
  window.SLAY.debug.makeCharacter(c, 40);
  await window.SLAY.engine.goTo('dungeon', { depth: 3 });
}, cls);
await page.waitForFunction(() => window.SLAY.engine.currentSceneId === 'dungeon', null, { timeout: 300000, polling: 500 });
await page.evaluate(() => window.SLAY.debug.godMode(true));

// One skill per evaluate, printed as it lands: under software rendering a
// level-40 class takes many minutes, and a run cut short still says something.
const ids = await page.evaluate(() => {
  const pl = window.SLAY.engine.currentScene?.player;
  return pl ? Object.keys(pl.character.skills).filter((k) => pl.character.skills[k] > 0) : [];
});
if (!ids.length) console.log('ERROR: no player or no skills');
const FRAMES = Number(process.argv.find((a) => a.startsWith('--frames='))?.split('=')[1] ?? 20);
const rows = [];
for (const id of ids) {
  const r = await page.evaluate(
    async ({ id, frames }) => {
      const scene = window.SLAY.engine.currentScene;
      const pl = scene?.player;
      const runner = scene?.skills;
      if (!pl || !runner) return { id, worst: -1 };
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      // Settle first, so the previous skill's effects are not counted.
      for (let i = 0; i < 10; i++) await frame();
      let worst = 0;
      let last = performance.now();
      // Cast repeatedly: a one-off allocation hides, a per-cast stall does not.
      for (let i = 0; i < frames; i++) {
        if (i % 5 === 0) {
          pl.cooldowns.clear();
          pl.mana = pl.stats.mana;
          try {
            runner.cast(id, pl, pl.position.clone().add({ x: 5, y: 0, z: 0 }), scene.context(), scene.enemies, scene.boss);
          } catch {}
        }
        await frame();
        const now = performance.now();
        const dt = now - last;
        last = now;
        if (i > 2 && dt > worst) worst = dt;
      }
      return { id, worst: +worst.toFixed(1) };
    },
    { id, frames: FRAMES },
  );
  rows.push(r);
  console.log(String(r.worst).padStart(8) + 'ms  ' + r.id);
}
rows.sort((a, b) => b.worst - a.worst);
console.log(`\nworst: ${rows.slice(0, 5).map((r) => `${r.id} ${r.worst}ms`).join(', ')}`);
await browser.close();
killServer();
process.exit(0);
