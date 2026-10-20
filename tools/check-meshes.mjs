/**
 * Do the bodies that come with the game match what the game would mesh, and
 * does a first launch read them instead of meshing?
 *
 *   node tools/build-meshes.mjs && SLAY_PORT=4313 node tools/check-meshes.mjs
 *
 * 1. public/meshes/heroes.bin is built from the current code
 *    (`build-meshes --check`)
 * 2. in the game, on a fresh profile: the file is read at boot, and the town
 *    prewarm has nothing left to mesh
 * 3. every class in its field kit and as a new character, the shapeshifter's
 *    beasts and every resident are built on the page without meshing a part
 * 4. a hero and a resident meshed fresh in a worker, by the browser, equal
 *    the shipped parts bit for bit (Node and the browser mesh alike)
 * 5. no errors
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { bootGame } from './lib/game.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
let failed = 0;
const ok = (name, pass, detail = '') => {
  if (!pass) failed++;
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${pass || !detail ? '' : `\n        ${detail}`}`);
};

const fresh = spawnSync(process.execPath, [path.join(ROOT, 'tools/build-meshes.mjs'), '--check'], { encoding: 'utf8' });
ok('heroes.bin is built from the current code', fresh.status === 0, fresh.stdout.trim());

const { page, close, pageErrors, bootMs } = await bootGame({ fallbackPort: 4313 });
console.log(`booted in ${(bootMs / 1000).toFixed(0)}s`);

const boot = await page.evaluate(async () => {
  const M = await import('/src/art/hero/MeshCache.ts');
  const { logText } = await import('/src/core/Log.ts');
  return { stats: M.meshCacheStats(), line: logText().split('\n').find((l) => l.includes('shipped bodies')) ?? null };
});
console.log(`        ${boot.stats.shipped} parts shipped; ${boot.line ?? 'no log line'}`);
ok('the shipped parts are read at boot', boot.stats.shipped > 0, JSON.stringify(boot));
ok('the town prewarm has nothing left to mesh', /shipped bodies: [1-9]\d*; 0 left/.test(boot.line ?? ''), boot.line ?? 'no log line');

// Everything the file covers, built here on the page.
const built = await page.evaluate(async () => {
  const M = await import('/src/art/hero/MeshCache.ts');
  const { buildClassHero, buildCharacterHero } = await import('/src/scenes/HeroModel.ts');
  const { buildFolk, NPC_LOOK_IDS } = await import('/src/art/npc/Folk.ts');
  const { buildHero } = await import('/src/art/hero/Hero.ts');
  const { HERO_LOOKS } = await import('/src/art/hero/Looks.ts');
  const { BEAST_FORMS, meshBeast } = await import('/src/art/hero/forms/BeastBody.ts');
  const { CLASSES } = await import('/src/data/classes.ts');
  const { createCharacter } = await import('/src/sim/Character.ts');
  const { Random } = await import('/src/core/RNG.ts');
  const keys = [];
  M.onMeshed((k) => keys.push(k));
  const before = M.meshCacheStats();
  const t0 = performance.now();
  for (const c of CLASSES) {
    buildClassHero(c.id).dispose();
    buildCharacterHero(createCharacter(c.id, c.id, new Random(1))).dispose();
  }
  const shifter = buildHero(HERO_LOOKS.shapeshifter, 'shapeshifter');
  for (const f of BEAST_FORMS) meshBeast(f, shifter.rig.shape);
  for (const id of NPC_LOOK_IDS) buildFolk(id);
  const after = M.meshCacheStats();
  M.onMeshed(null);
  return { keys: keys.map((k) => k.slice(0, 120)), ms: performance.now() - t0, meshed: after.meshed - before.meshed, read: after.fromShipped - before.fromShipped + after.fromStored - before.fromStored, classes: CLASSES.length, folk: NPC_LOOK_IDS.length };
});
console.log(`        ${built.classes} classes twice, 3 beasts and ${built.folk} residents built in ${(built.ms / 1000).toFixed(1)} s`);
ok('none of them meshes a part', built.meshed === 0 && built.read > 0, `${built.meshed} meshed, ${built.read} read: ${built.keys.slice(0, 6).join(' | ')}`);

// The browser's own meshing, in a worker of the game's (no shipped parts
// there), against the shipped arrays.
const same = await page.evaluate(async (jobs) => {
  const M = await import('/src/art/hero/MeshCache.ts');
  const { pageAssetBase } = await import('/src/core/Assets.ts');
  const out = [];
  for (const job of jobs) {
    const w = new Worker('/src/art/npc/FolkWorker.ts', { type: 'module' });
    const reply = await new Promise((resolve, reject) => {
      w.onmessage = (e) => resolve(e.data);
      w.onerror = (e) => reject(new Error(e.message));
      w.postMessage({ job, base: pageAssetBase() });
    });
    w.terminate();
    const row = { job, parts: reply.entries.length, differ: [] };
    for (const [key, raw] of reply.entries) {
      const g = M.meshCached(key.slice(key.indexOf('|') + 1), () => {
        throw new Error('not shipped');
      });
      const bits = (a) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
      const eq = (a, b) => a.constructor === b.constructor && a.length === b.length && bits(a).every((v, i) => v === bits(b)[i]);
      const names = Object.keys(raw.attrs);
      const bad = names.filter((n) => !g.attributes[n] || !eq(raw.attrs[n].array, g.attributes[n].array));
      if (!eq(raw.index, g.index.array)) bad.push('index');
      if (Object.keys(g.attributes).length !== names.length) bad.push('attribute count');
      if (bad.length) row.differ.push(`${key.slice(0, 60)}: ${bad.join(', ')}`);
    }
    out.push(row);
  }
  return out;
}, ['hero:warden', 'hesk']);
for (const r of same) {
  ok(`${r.job}: the browser meshes its ${r.parts} parts exactly as shipped`, r.parts > 0 && r.differ.length === 0, r.differ.slice(0, 4).join(' | '));
}

const errors = await page.evaluate(() => [...window.SLAY.engine.errors.values()].map((e) => `${e.where}: ${e.message}`));
ok('no errors were caught', errors.length === 0, errors.join(' | '));
ok('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await close();
console.log(failed ? `\nFAILED — ${failed} failed.` : '\nOK');
process.exit(failed ? 1 : 0);
