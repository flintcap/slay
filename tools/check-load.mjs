/**
 * What does a floor cost, in numbers that survive not having a GPU?
 *
 *   node tools/check-load.mjs
 *
 * Frame time measured under software rendering says almost nothing about a
 * real machine, so this measures the parts that do not depend on one:
 *
 *  - draw calls and triangles, which are the same on any GPU
 *  - how many monsters are actually being simulated at once, as opposed to how
 *    many exist on the floor — the AI leash is what makes a big crowd affordable
 *  - the CPU cost of one scene update, with rendering excluded
 *
 * The last is the real risk of a larger crowd: a hundred and eighty rigs and
 * brains is work whether or not the GPU is idle.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4225;
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
  window.SLAY.debug.makeCharacter('warden', 20);
  await window.SLAY.engine.goTo('dungeon', { depth: 8 });
  window.SLAY.debug.godMode(true);
  for (let i = 0; i < 90; i++) await new Promise((r) => requestAnimationFrame(r));

  const engine = window.SLAY.engine;
  const scene = engine.currentScene;
  const info = engine.renderer?.gl?.info ?? null;

  // Stand where the fight is.
  //
  // Sampling at the entry stairs measures an empty floor: every monster is
  // outside the AI leash, nothing is simulated, and the update loop looks free
  // because it is doing nothing. Move to the densest cluster first, which is
  // the state the number is supposed to describe.
  const mobs = scene.enemies ?? [];
  if (mobs.length > 0 && scene.player) {
    let best = mobs[0].root.position;
    let bestN = -1;
    for (const a of mobs) {
      let n = 0;
      for (const b of mobs) {
        const dx = a.root.position.x - b.root.position.x;
        const dz = a.root.position.z - b.root.position.z;
        if (dx * dx + dz * dz < 24 * 24) n++;
      }
      if (n > bestN) { bestN = n; best = a.root.position; }
    }
    scene.player.root.position.set(best.x, scene.player.root.position.y, best.z);
    scene.player.position.set(best.x, scene.player.position.y, best.z);
    for (let i = 0; i < 40; i++) await new Promise((r) => requestAnimationFrame(r));
  }

  // Simulation cost with the GPU out of it: call the scene's own update.
  const samples = [];
  for (let i = 0; i < 40; i++) {
    const t0 = performance.now();
    scene.update(1 / 60, i / 60);
    samples.push(performance.now() - t0);
    await new Promise((r) => requestAnimationFrame(r));
  }
  samples.sort((a, b) => a - b);

  const px = scene.player?.position;
  let simulated = 0;
  for (const e of scene.enemies ?? []) {
    const dx = e.root.position.x - px.x;
    const dz = e.root.position.z - px.z;
    // Matches the scene's own leash: beyond this a monster is not thought about.
    if (dx * dx + dz * dz <= 38 * 38) simulated++;
  }

  return {
    depth: scene.run?.depth,
    biome: scene.level?.biome,
    layout: scene.level?.layout,
    monstersOnFloor: (scene.enemies ?? []).length,
    monstersSimulated: simulated,
    props: (scene.level?.props ?? []).length,
    drawCalls: info?.render?.calls ?? null,
    triangles: info?.render?.triangles ?? null,
    programs: info?.programs?.length ?? null,
    // A crowd nobody is standing in costs nothing, so this ratio is the number
    // that matters — it is what the leash buys.
    simulatedPct: 0,
    updateMsMedian: +samples[Math.floor(samples.length / 2)].toFixed(2),
    updateMsWorst: +samples[samples.length - 1].toFixed(2),
  };
});

out.simulatedPct = +((out.monstersSimulated / Math.max(1, out.monstersOnFloor)) * 100).toFixed(1);
const pad = (k) => String(k).padEnd(20);
console.log('');
for (const [k, v] of Object.entries(out)) console.log(`  ${pad(k)} ${v}`);
console.log('');
if (out.updateMsMedian !== undefined) {
  const budget = 16.7;
  console.log(
    out.updateMsMedian < budget * 0.35
      ? `OK — simulation takes ${out.updateMsMedian}ms of a ${budget}ms frame, leaving the rest for drawing.`
      : `TIGHT — simulation takes ${out.updateMsMedian}ms of a ${budget}ms frame.`,
  );
}
await browser.close();
server.kill('SIGTERM');
process.exit(0);
