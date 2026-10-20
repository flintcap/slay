/**
 * Meshes the bodies a first launch needs, ahead of time, into one file the
 * game ships: public/meshes/heroes.bin.
 *
 *   node tools/build-meshes.mjs            # rebuild if the code changed
 *   node tools/build-meshes.mjs --force    # rebuild anyway
 *   node tools/build-meshes.mjs --check    # exit 1 if the file is stale
 *
 * The select-screen heroes, each class as a new character, the
 * shapeshifter's beasts and the townsfolk are meshed in Node by the game's
 * own code (`tools/meshes-entry.ts`), under the keys the game's mesh cache
 * looks for (`art/hero/MeshCache.ts`). The game reads the file at boot, so a
 * first launch reads those bodies instead of meshing them for tens of
 * seconds; anything missing or stale is simply meshed, as before.
 *
 * The file is built from the bundled meshing code: when a rebuild bundles to
 * the same bytes, the file is kept. It is not in git (`npm run build` makes it).
 *
 * Layout, all gzip: "SLAYMESH", a u32 header length, the JSON header, padding
 * to 4 bytes, then every array, each at a 4-byte boundary. The header holds
 * the cache version, the bundle's hash, the prewarm jobs covered, and per
 * part its key and where each array sits.
 */
import { build } from 'vite';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'public/meshes');
const FILE = path.join(OUT_DIR, 'heroes.bin');
const TMP = path.join(ROOT, '.meshbuild');
const args = process.argv.slice(2);
const MAGIC = 'SLAYMESH';

/** The header of a shipped file, or null. */
export function readHeader(bytes) {
  const raw = gunzipSync(bytes);
  if (raw.subarray(0, 8).toString('latin1') !== MAGIC) return null;
  const len = raw.readUInt32LE(8);
  return { header: JSON.parse(raw.subarray(12, 12 + len).toString('utf8')), raw, dataAt: (12 + len + 3) & ~3 };
}

if (import.meta.main) {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  await build({
    configFile: false,
    logLevel: 'error',
    root: ROOT,
    build: { ssr: path.join(ROOT, 'tools/meshes-entry.ts'), outDir: TMP, rollupOptions: { output: { entryFileNames: 'e.mjs' } }, minify: false },
  });
  const bundle = path.join(TMP, 'e.mjs');
  const source = createHash('sha256').update(readFileSync(bundle)).digest('hex').slice(0, 16);
  const old = existsSync(FILE) ? readHeader(readFileSync(FILE))?.header : null;

  if (args.includes('--check')) {
    rmSync(TMP, { recursive: true, force: true });
    const fresh = old?.source === source;
    console.log(fresh ? `heroes.bin is current (${old.parts.length} parts)` : 'stale: heroes.bin was built from other code');
    process.exit(fresh ? 0 : 1);
  }
  if (old?.source === source && !args.includes('--force')) {
    rmSync(TMP, { recursive: true, force: true });
    console.log(`heroes.bin is current (${old.parts.length} parts)`);
    process.exit(0);
  }

  const t0 = performance.now();
  const lines = execFileSync(process.execPath, [bundle], { encoding: 'utf8', maxBuffer: 1 << 30 }).trim().split('\n');
  rmSync(TMP, { recursive: true, force: true });
  const { version, jobs, times, parts } = JSON.parse(lines[lines.length - 1]);

  const chunks = [];
  let at = 0;
  const place = (b64) => {
    const buf = Buffer.from(b64, 'base64');
    const offset = at;
    chunks.push(buf);
    at += buf.length;
    const pad = (4 - (at & 3)) & 3;
    if (pad) {
      chunks.push(Buffer.alloc(pad));
      at += pad;
    }
    return { offset, bytes: buf.length };
  };
  const header = {
    version,
    source,
    jobs,
    parts: parts.map((p) => ({
      key: p.key,
      attrs: p.attrs.map((a) => ({ name: a.name, itemSize: a.itemSize, type: a.type, ...place(a.data) })),
      index: { type: p.index.type, ...place(p.index.data) },
    })),
  };
  const json = Buffer.from(JSON.stringify(header), 'utf8');
  const head = Buffer.alloc(12);
  head.write(MAGIC, 0, 'latin1');
  head.writeUInt32LE(json.length, 8);
  const pad = Buffer.alloc(((12 + json.length + 3) & ~3) - 12 - json.length);
  const raw = Buffer.concat([head, json, pad, ...chunks]);
  const gz = gzipSync(raw, { level: 9 });
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(FILE, gz);

  const slow = Object.entries(times).sort((a, b) => b[1] - a[1]);
  const total = slow.reduce((s, [, ms]) => s + ms, 0);
  console.log(`meshed ${parts.length} parts in ${(total / 1000).toFixed(1)} s of meshing (${((performance.now() - t0) / 1000).toFixed(0)} s in all)`);
  console.log(`slowest: ${slow.slice(0, 5).map(([id, ms]) => `${id} ${ms} ms`).join(', ')}`);
  console.log(`heroes.bin: ${(raw.length / 1048576).toFixed(1)} MB of arrays, ${(gz.length / 1048576).toFixed(1)} MB to download`);
}
