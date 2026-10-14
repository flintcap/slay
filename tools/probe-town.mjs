/**
 * Does the town get heavier the longer you stay, or the more often you come
 * back? Samples what the renderer and the scene hold while the hero walks
 * the camp, and again after each trip out to a map and home.
 *
 *   npm run build
 *   SLAY_PORT=4343 timeout 1800 node tools/probe-town.mjs --trips=3 --stay=60
 *
 * Software rendering makes every frame slow, so frame times here say little;
 * what matters is whether the counts (draw calls, programs, textures,
 * geometries, scene objects, lights, update time) creep up.
 */
import { bootGame } from './lib/game.mjs';

const arg = (k, d) => process.argv.find((s) => s.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const TRIPS = Number(arg('trips', 3));
const STAY = Number(arg('stay', 60));

const { page, close, pageErrors } = await bootGame({ fallbackPort: 4343, viewport: { width: 480, height: 270 } });

const sample = (label) =>
  page.evaluate((label) => {
    const e = window.SLAY.engine;
    const gl = e.renderer.gl;
    const sc = e.currentScene;
    let objects = 0;
    let lights = 0;
    let litLights = 0;
    sc.scene.traverse((o) => {
      objects++;
      if (o.isLight) {
        lights++;
        if (o.intensity > 0 && o.visible) litLights++;
      }
    });
    const p = e.perf;
    const n = Math.min(p.count, p.upd.length);
    let upd = 0;
    let ren = 0;
    for (let i = 0; i < n; i++) {
      upd += p.upd[i];
      ren += p.ren[i];
    }
    return {
      label,
      scene: sc.id,
      quality: e.renderer.qualityLevel,
      dyn: e.renderer.dynamicScale,
      draws: gl.info.render.calls,
      programs: gl.info.programs?.length ?? 0,
      textures: gl.info.memory.textures,
      geometries: gl.info.memory.geometries,
      objects,
      lights,
      litLights,
      updMs: +(upd / Math.max(1, n)).toFixed(2),
      renMs: +(ren / Math.max(1, n)).toFixed(2),
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    };
  }, label);

const walk = (seconds) =>
  page.evaluate(async (seconds) => {
    const sc = window.SLAY.engine.currentScene;
    const t0 = performance.now();
    let k = 0;
    while (performance.now() - t0 < seconds * 1000) {
      const a = (k++ % 8) * (Math.PI / 4);
      sc.player.moveTo(Math.cos(a) * 9, Math.sin(a) * 9 + 2);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }, seconds);

const rows = [];
await page.evaluate(async () => {
  window.SLAY.debug.makeCharacter('warden', 12, 4242);
  await window.SLAY.engine.goTo('town');
});
await page.waitForTimeout(4000);
rows.push(await sample('town, first'));
for (let i = 0; i < 3; i++) {
  await walk(STAY / 3);
  rows.push(await sample(`town, +${Math.round(((i + 1) * STAY) / 3)} s`));
}
for (let t = 1; t <= TRIPS; t++) {
  await page.evaluate(async (t) => {
    await window.SLAY.engine.goTo('dungeon', { depth: 2, seed: 900 + t });
  }, t);
  await page.waitForTimeout(3000);
  rows.push(await sample(`map, trip ${t}`));
  await page.evaluate(async () => {
    await window.SLAY.engine.goTo('town');
  });
  await page.waitForTimeout(4000);
  await walk(10);
  rows.push(await sample(`town, after trip ${t}`));
}

for (const r of rows) console.log(JSON.stringify(r));
const first = rows[0];
const last = rows.at(-1);
const grew = ['draws', 'programs', 'textures', 'geometries', 'objects', 'lights'].filter((k) => last[k] > first[k] * 1.1 + 2);
console.log(grew.length ? `town grew: ${grew.map((k) => `${k} ${first[k]} -> ${last[k]}`).join(', ')}` : 'town steady');
if (pageErrors.length) console.log(`page errors: ${pageErrors.slice(0, 3).join(' | ')}`);
await close();
