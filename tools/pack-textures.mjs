/**
 * Packs the game's textures for the GPU: BC7 blocks in KTX2 files.
 *
 *   node tools/pack-textures.mjs           # pack what changed since the last run
 *   node tools/pack-textures.mjs --all     # pack everything again
 *   node tools/pack-textures.mjs --check   # exit 1 when a packed file is missing or out of date
 *   node tools/pack-textures.mjs --only=world/lava   # just the files whose path holds that
 *
 * A WebP is small to download but lands on the GPU as plain pixels, four
 * bytes each, and its smaller sizes (mip levels) are drawn there when it
 * arrives. A BC7 texture stays packed on the GPU at one byte a pixel, a
 * quarter of the memory, and every level is made here, once, so a load only
 * copies blocks.
 *
 * Reads every WebP under public/assets/textures/ but ui/ (the menus draw
 * those as CSS backgrounds). Writes public/ktx2/<same path>.ktx2 and
 * public/ktx2/index.json, which lists each packed file with the hash of its
 * source and this packer's version, so an unchanged file is not packed again.
 * Neither is committed: `npm run build` runs this first. The game loads the
 * packed file where the GPU reads BC7 (`core/Assets.ts`), the WebP elsewhere.
 *
 * Levels by map:
 *  - albedo, emissive: averaged as light (sRGB in and out); the albedo's
 *    alpha (height) averaged as it is
 *  - normal: averaged as directions, then made unit length again; the alpha
 *    (roughness) averaged as it is
 *
 * Rows are stored bottom first: the game flips every WebP it decodes (the
 * normal maps are OpenGL style), and a packed texture cannot be flipped on
 * upload.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { zstdCompressSync, constants as zlib } from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'public/assets');
const OUT = path.join(ROOT, 'public/ktx2');
const INDEX = path.join(OUT, 'index.json');
/** Raised whenever the packed bytes would change for the same source. */
const VERSION = 2;

// KTX2 numbers (Khronos Data Format and KTX2 specifications).
const VK_FORMAT_BC7_UNORM = 145;
const VK_FORMAT_BC7_SRGB = 146;
const KHR_DF_MODEL_BC7 = 134;
const KHR_DF_TRANSFER_LINEAR = 1;
const KHR_DF_TRANSFER_SRGB = 2;
const KHR_DF_PRIMARIES_BT709 = 1;
const KHR_SUPERCOMPRESSION_ZSTD = 2;
const ZSTD_LEVEL = 19;

if (isMainThread) await main();
else worker();

// --- the main thread ----------------------------------------------------------

async function main() {
  const all = process.argv.includes('--all');
  const check = process.argv.includes('--check');

  const sources = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.webp')) sources.push(path.relative(SRC, full).split(path.sep).join('/'));
    }
  };
  walk(path.join(SRC, 'textures'));
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
  const wanted = sources.filter((rel) => !rel.startsWith('textures/ui/')).sort();

  let index = { version: VERSION, files: {} };
  if (existsSync(INDEX)) {
    try {
      const read = JSON.parse(readFileSync(INDEX, 'utf8'));
      if (read?.version === VERSION && read.files) index = read;
    } catch {
      /* packed again from scratch */
    }
  }

  const outOf = (rel) => path.join(OUT, rel.replace(/\.webp$/, '.ktx2'));
  const hashes = new Map(wanted.map((rel) => [rel, createHash('sha256').update(readFileSync(path.join(SRC, rel))).digest('hex')]));
  const todo = wanted.filter((rel) => (!only || rel.includes(only)) && (all || index.files[rel]?.source !== hashes.get(rel) || !existsSync(outOf(rel))));
  const gone = only ? [] : Object.keys(index.files).filter((rel) => !hashes.has(rel));

  if (check) {
    for (const rel of todo) console.log(`stale  ${rel}`);
    for (const rel of gone) console.log(`gone   ${rel}`);
    console.log(todo.length + gone.length ? `\n${todo.length + gone.length} packed textures out of date: run node tools/pack-textures.mjs` : `ok    ${wanted.length} textures packed`);
    process.exit(todo.length + gone.length ? 1 : 0);
  }

  for (const rel of gone) {
    rmSync(outOf(rel), { force: true });
    delete index.files[rel];
  }
  if (!todo.length) {
    console.log(`${wanted.length} textures packed, none changed`);
    writeIndex(index);
    return;
  }

  const t0 = performance.now();
  const threads = Math.max(1, Math.min(todo.length, Number(process.env.SLAY_PACK_THREADS) || availableParallelism()));
  console.log(`packing ${todo.length} of ${wanted.length} textures on ${threads} threads`);
  const queue = todo.slice();
  let done = 0;
  let srcBytes = 0;
  let outBytes = 0;
  const failures = [];
  await Promise.all(
    Array.from({ length: threads }, async () => {
      const w = new Worker(new URL(import.meta.url));
      try {
        for (;;) {
          const rel = queue.shift();
          if (!rel) return;
          const out = outOf(rel);
          const r = await new Promise((resolve, reject) => {
            w.once('message', resolve);
            w.once('error', reject);
            w.postMessage({ src: path.join(SRC, rel), out, kind: kindOf(rel) });
          });
          done++;
          if (r.error) {
            failures.push(`${rel}: ${r.error}`);
            continue;
          }
          index.files[rel] = { source: hashes.get(rel), bytes: r.bytes, psnr: Math.round(r.psnr * 10) / 10 };
          srcBytes += statSync(path.join(SRC, rel)).size;
          outBytes += r.bytes;
          console.log(`${String(done).padStart(4)}/${todo.length}  ${rel}  ${r.width}x${r.height}  ${(r.bytes / 1024).toFixed(0)} KB  ${r.psnr.toFixed(1)} dB  ${(r.ms / 1000).toFixed(1)} s`);
        }
      } finally {
        await w.terminate();
      }
    }),
  );
  writeIndex(index);
  const mb = (n) => (n / 1024 / 1024).toFixed(1);
  console.log(`\npacked ${todo.length - failures.length} in ${((performance.now() - t0) / 1000).toFixed(0)} s: ${mb(srcBytes)} MB of WebP to ${mb(outBytes)} MB of KTX2`);
  if (failures.length) {
    for (const f of failures) console.log(`FAIL  ${f}`);
    process.exit(1);
  }
}

function writeIndex(index) {
  mkdirSync(OUT, { recursive: true });
  const files = Object.fromEntries(Object.entries(index.files).sort(([a], [b]) => (a < b ? -1 : 1)));
  writeFileSync(INDEX, `${JSON.stringify({ version: VERSION, files }, null, 1)}\n`);
}

/** What a map holds, from its file name (`art/TextureSets.ts`). */
function kindOf(rel) {
  const name = path.basename(rel, '.webp');
  if (name === 'normal') return 'normal';
  if (name === 'albedo' || name === 'emissive') return 'colour';
  throw new Error(`${rel}: not an albedo, normal or emissive map, so its colour space is unknown`);
}

// --- a worker -------------------------------------------------------------------

function worker() {
  let ready = null;
  parentPort.on('message', async (job) => {
    try {
      ready ??= loadTools();
      const tools = await ready;
      const t0 = performance.now();
      const r = await pack(tools, job);
      parentPort.postMessage({ ...r, ms: performance.now() - t0 });
    } catch (err) {
      parentPort.postMessage({ error: String(err?.stack ?? err) });
    }
  });
}

async function loadTools() {
  const { default: decode, init } = await import('@jsquash/webp/decode.js');
  const wasm = path.join(ROOT, 'node_modules/@jsquash/webp/codec/dec/webp_dec.wasm');
  await init(await WebAssembly.compile(readFileSync(wasm)));
  const { encodeBC7 } = await import('./lib/bc7.mjs');
  const { write, createDefaultContainer } = await import('three/examples/jsm/libs/ktx-parse.module.js');
  return { decode, encodeBC7, write, createDefaultContainer };
}

async function pack({ decode, encodeBC7, write, createDefaultContainer }, { src, out, kind }) {
  const img = await decode(readFileSync(src));
  const { width, height } = img;
  if (width % 4 || height % 4) throw new Error(`${width}x${height} is not a multiple of 4`);
  let level = flipRows(new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength), width, height);

  const levels = [];
  let w = width;
  let h = height;
  let sq = 0;
  for (;;) {
    const { blocks, error } = encodeBC7(level, w, h);
    if (levels.length === 0) sq = error;
    levels.push(blocks);
    if (w === 1 && h === 1) break;
    const nw = Math.max(1, w >> 1);
    const nh = Math.max(1, h >> 1);
    level = kind === 'normal' ? halveNormal(level, w, h, nw, nh) : halveColour(level, w, h, nw, nh);
    w = nw;
    h = nh;
  }

  const c = createDefaultContainer();
  c.vkFormat = kind === 'colour' ? VK_FORMAT_BC7_SRGB : VK_FORMAT_BC7_UNORM;
  c.typeSize = 1;
  c.pixelWidth = width;
  c.pixelHeight = height;
  c.levelCount = levels.length;
  c.supercompressionScheme = KHR_SUPERCOMPRESSION_ZSTD;
  c.levels = levels.map((data) => ({
    levelData: new Uint8Array(zstdCompressSync(data, { params: { [zlib.ZSTD_c_compressionLevel]: ZSTD_LEVEL } })),
    uncompressedByteLength: data.byteLength,
  }));
  const dfd = c.dataFormatDescriptor[0];
  dfd.colorModel = KHR_DF_MODEL_BC7;
  dfd.colorPrimaries = KHR_DF_PRIMARIES_BT709;
  dfd.transferFunction = kind === 'colour' ? KHR_DF_TRANSFER_SRGB : KHR_DF_TRANSFER_LINEAR;
  dfd.texelBlockDimension = [3, 3, 0, 0];
  dfd.bytesPlane = [0, 0, 0, 0, 0, 0, 0, 0];
  // One sample covering the whole 128-bit block (KHR_DF_CHANNEL_BC7_DATA).
  dfd.samples = [{ bitOffset: 0, bitLength: 127, channelType: 0, samplePosition: [0, 0, 0, 0], sampleLower: 0, sampleUpper: 0xffffffff }];
  c.keyValue = { KTXorientation: 'ru', KTXwriter: `SLAY pack-textures ${VERSION}` };
  const bytes = write(c, { keepWriter: true });

  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, bytes);
  const mse = sq / (width * height * 4);
  return { width, height, bytes: bytes.byteLength, psnr: mse > 0 ? 10 * Math.log10((255 * 255) / mse) : 99 };
}

function flipRows(src, w, h) {
  const out = new Uint8Array(w * h * 4);
  const row = w * 4;
  for (let y = 0; y < h; y++) out.set(src.subarray((h - 1 - y) * row, (h - y) * row), y * row);
  return out;
}

const toLinear = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  toLinear[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
const toSrgb = (l) => {
  const c = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
};

/** The 2x2 (or 2x1) source pixels behind each pixel of the next level down. */
function* quads(w, h, nw, nh) {
  const sx = w > nw ? 2 : 1;
  const sy = h > nh ? 2 : 1;
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const at = [];
      for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) at.push(((y * sy + j) * w + x * sx + i) * 4);
      yield [(y * nw + x) * 4, at];
    }
  }
}

function halveColour(src, w, h, nw, nh) {
  const out = new Uint8Array(nw * nh * 4);
  for (const [o, at] of quads(w, h, nw, nh)) {
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (const p of at) s += toLinear[src[p + c]];
      out[o + c] = toSrgb(s / at.length);
    }
    let a = 0;
    for (const p of at) a += src[p + 3];
    out[o + 3] = Math.round(a / at.length);
  }
  return out;
}

function halveNormal(src, w, h, nw, nh) {
  const out = new Uint8Array(nw * nh * 4);
  for (const [o, at] of quads(w, h, nw, nh)) {
    let x = 0;
    let y = 0;
    let z = 0;
    let a = 0;
    for (const p of at) {
      x += src[p] / 127.5 - 1;
      y += src[p + 1] / 127.5 - 1;
      z += src[p + 2] / 127.5 - 1;
      a += src[p + 3];
    }
    const len = Math.hypot(x, y, z) || 1;
    out[o] = Math.round((x / len + 1) * 127.5);
    out[o + 1] = Math.round((y / len + 1) * 127.5);
    out[o + 2] = Math.round((z / len + 1) * 127.5);
    out[o + 3] = Math.round(a / at.length);
  }
  return out;
}
