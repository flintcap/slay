/**
 * Do the packed textures hold the scans, and does the game draw them?
 *
 *   node tools/pack-textures.mjs && SLAY_PORT=4312 node tools/check-ktx2.mjs
 *
 * First without a browser:
 *  - every scan is packed, from its current source (`pack-textures --check`)
 *  - every packed file is close to its WebP (the packer's own measure, kept
 *    in public/ktx2/index.json), and for a few, decoded here from the file
 *    itself, level 0 against the WebP, channel by channel
 *
 * Then in the game, on its GPU device:
 *  1. the GPU reads BC7, and a scan asked for comes back packed, every level
 *  2. for a colour map and a normal map, every texel the GPU decodes from the
 *     file equals what tools/lib/bc7.mjs decodes (the blocks keep BC7's rules)
 *  3. load time: the same files loaded as WebP (decoded, then mipmapped on
 *     the GPU) and packed, uploads and all
 *  4. in town every scan in use is packed; their video memory against what
 *     the plain pixels would take
 *  5. no errors
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import { bootGame, frames } from './lib/game.mjs';
import { decodeBC7 } from './lib/bc7.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = process.env.SLAY_SHOTS ?? 'shots';
mkdirSync(OUT, { recursive: true });

let failed = 0;
const ok = (name, pass, detail = '') => {
  if (!pass) failed++;
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${pass || !detail ? '' : `\n        ${detail}`}`);
};

/** Each file's whole-image PSNR must reach this; the hardest scans (noisy normal maps) sit near 32 dB. */
const MIN_PSNR = 30;
/** Files checked from their bytes: a colour map and a normal map, a flat one and a noisy one. */
const SAMPLES = ['textures/world/cobble/albedo.webp', 'textures/world/obsidian/normal.webp', 'textures/hero/hessian/albedo.webp', 'textures/props/planks/normal.webp'];

// --- the files ------------------------------------------------------------------
const fresh = spawnSync(process.execPath, [path.join(ROOT, 'tools/pack-textures.mjs'), '--check'], { encoding: 'utf8' });
ok('every scan is packed from its current source', fresh.status === 0, fresh.stdout.trim().split('\n').slice(-3).join(' | '));
const index = JSON.parse(readFileSync(path.join(ROOT, 'public/ktx2/index.json'), 'utf8'));
const entries = Object.entries(index.files);
const low = entries.filter(([, e]) => !(e.psnr >= MIN_PSNR)).map(([rel, e]) => `${rel} ${e.psnr} dB`);
ok(`every packed file is within ${MIN_PSNR} dB of its scan (${entries.length} files)`, low.length === 0, low.join(', '));

const { default: decodeWebp, init } = await import('@jsquash/webp/decode.js');
await init(await WebAssembly.compile(readFileSync(path.join(ROOT, 'node_modules/@jsquash/webp/codec/dec/webp_dec.wasm'))));
const { read } = await import('three/examples/jsm/libs/ktx-parse.module.js');
for (const rel of SAMPLES) {
  const img = await decodeWebp(readFileSync(path.join(ROOT, 'public/assets', rel)));
  const c = read(new Uint8Array(readFileSync(path.join(ROOT, 'public/ktx2', rel.replace(/\.webp$/, '.ktx2')))));
  const { width: w, height: h } = img;
  const levels = Math.log2(Math.max(w, h)) + 1;
  const dec = decodeBC7(zstdDecompressSync(c.levels[0].levelData), w, h);
  const err = [0, 0, 0, 0];
  // Stored bottom row first, as the game flips every WebP.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = ((h - 1 - y) * w + x) * 4;
      const d = (y * w + x) * 4;
      for (let k = 0; k < 4; k++) err[k] += (img.data[s + k] - dec[d + k]) ** 2;
    }
  }
  const db = err.map((e) => 10 * Math.log10((255 * 255) / (e / (w * h))));
  ok(
    `${rel}: ${c.pixelWidth}x${c.pixelHeight}, ${c.levels.length} levels, ${db.map((d) => d.toFixed(1)).join(' / ')} dB`,
    c.pixelWidth === w && c.pixelHeight === h && c.levels.length === levels && db.every((d) => d >= MIN_PSNR - 3),
    `${c.levels.length} levels of ${levels}`,
  );
}

// --- in the game ----------------------------------------------------------------
const { page, close, pageErrors, bootMs } = await bootGame({ fallbackPort: 4312 });
console.log(`booted in ${(bootMs / 1000).toFixed(0)}s`);

/** Errors caught before the page is loaded again. */
const earlyErrors = [];
const bc7 = await page.evaluate(() => window.SLAY.engine.renderer.gl.hasFeature('texture-compression-bc'));
ok('the GPU reads BC7', bc7);
if (bc7) {
  const loaded = await page.evaluate(async (files) => {
    const A = await import('/src/core/Assets.ts');
    const probe = await import('/tools/lib/ktx2-probe.mjs');
    const gl = window.SLAY.engine.renderer.gl;
    const out = [];
    for (const [rel, srgb] of files) {
      const tex = A.loadTexture(rel, { srgb });
      const ready = await A.textureReady(tex);
      const row = { rel, ready, packed: !!tex.isCompressedTexture, levels: tex.mipmaps?.length ?? 0, size: tex.image?.width ?? 0 };
      if (ready && row.packed) row.levelChecks = [await probe.compareLevel(gl, tex, 0), await probe.compareLevel(gl, tex, 3)];
      out.push(row);
    }
    return out;
  }, [
    ['textures/world/cobble/albedo.webp', true],
    ['textures/world/obsidian/normal.webp', false],
  ]);
  for (const r of loaded) {
    ok(`${r.rel} loads packed, ${r.levels} levels`, r.ready && r.packed && r.levels === Math.log2(r.size) + 1, JSON.stringify(r));
    for (const l of r.levelChecks ?? []) {
      ok(
        `  the GPU decodes its ${l.width}x${l.height} level as the packer does${l.srgb ? ' (sRGB)' : ''}`,
        l.off === 0,
        `${l.off} channels differ, by up to ${l.worst}`,
      );
    }
  }

  // The same files both ways, each from cold: whatever the boot loaded of
  // them is let go first, and the page is loaded again after.
  const timing = await page.evaluate(async (files) => {
    const A = await import('/src/core/Assets.ts');
    const gl = window.SLAY.engine.renderer.gl;
    const device = gl.backend.device;
    const run = async () => {
      for (const rel of files) A.releaseAssetTexture(rel);
      const t0 = performance.now();
      const texes = files.map((rel) => A.loadTexture(rel, { srgb: rel.endsWith('albedo.webp') }));
      await Promise.all(texes.map((t) => A.textureReady(t)));
      const t1 = performance.now();
      for (const t of texes) gl.initTexture(t);
      await device.queue.onSubmittedWorkDone();
      return { load: t1 - t0, upload: performance.now() - t1, packed: texes.filter((t) => t.isCompressedTexture).length };
    };
    await A.usePackedTextures(false);
    const plain = await run();
    await A.usePackedTextures(true);
    const packed = await run();
    return { plain, packed };
  }, ['textures/world/snow/albedo.webp', 'textures/world/snow/normal.webp', 'textures/world/sand/albedo.webp', 'textures/world/sand/normal.webp', 'textures/world/ice/albedo.webp', 'textures/world/ice/normal.webp']);
  const ms = (t) => `${t.load.toFixed(0)} ms to load, ${t.upload.toFixed(0)} ms to upload`;
  console.log(`        6 scans as WebP: ${ms(timing.plain)}; packed: ${ms(timing.packed)}`);
  ok('the packed files load and upload faster', timing.packed.packed === 6 && timing.plain.packed === 0 && timing.packed.load + timing.packed.upload < timing.plain.load + timing.plain.upload, JSON.stringify(timing));

  earlyErrors.push(...(await page.evaluate(() => [...window.SLAY.engine.errors.values()].map((e) => `${e.where}: ${e.message}`))));
  await page.reload();
  await page.waitForFunction(() => window.SLAY?.debug, null, { timeout: 600_000, polling: 500 });
  await page.evaluate(async () => {
    localStorage.clear();
    window.SLAY.save.hardReset();
    window.SLAY.debug.makeCharacter('warden', 8);
    await window.SLAY.engine.goTo('town');
  });
  await frames(page, 60);
  const town = await page.evaluate(async () => (await import('/src/core/Assets.ts')).assetStats());
  console.log(`        town: ${town.loaded} scans loaded, ${town.packed} packed; ${town.videoMB} MB of video memory, ${town.plainMB} MB as plain pixels`);
  ok('every scan in town is packed', town.loaded > 0 && town.packed === town.loaded, JSON.stringify(town));
  ok('they take a quarter of the video memory or less', town.plainMB > 0 && town.videoMB * 3.9 <= town.plainMB, JSON.stringify(town));
  await page.screenshot({ path: `${OUT}/ktx2-town.png` });
}

const errors = [...earlyErrors, ...(await page.evaluate(() => [...window.SLAY.engine.errors.values()].map((e) => `${e.where}: ${e.message}`)))];
ok('no errors were caught', errors.length === 0, errors.join(' | '));
ok('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await close();
console.log(failed ? `\nFAILED — ${failed} failed.` : '\nOK');
process.exit(failed ? 1 : 0);
