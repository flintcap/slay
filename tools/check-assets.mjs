/**
 * Every downloaded file is accounted for, free to use, and small enough.
 *
 *   node tools/check-assets.mjs           # check, exit 1 on any failure
 *   node tools/check-assets.mjs --list    # also print each folder's size
 *
 * Rules (see "Art and sound files" in docs/remake/PLAN.md):
 *
 * - Every file under `public/assets/` has a row in `ASSETS.md`, and every row
 *   points at a file that exists. Rows are `| path | source page | author | licence |`
 *   with the path relative to `public/assets/`.
 * - The licence is CC0 (any spelling of "CC0", "CC0 1.0", "Public Domain (CC0)").
 * - The source is an http(s) page from a known CC0 source.
 * - Formats: textures are WebP, sounds and music are OGG.
 * - Budgets: textures 70 MB, sounds 25 MB, music 35 MB, no single file over 4 MB,
 *   everything together under the artifact host's 256 MB per version.
 *
 * Empty `.keep` files that hold the folders open are ignored.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ASSETS = path.join(ROOT, 'public', 'assets');
const LEDGER = path.join(ROOT, 'ASSETS.md');
const listSizes = process.argv.includes('--list');

const MB = 1024 * 1024;
const BUDGETS = { textures: 70 * MB, sounds: 25 * MB, music: 35 * MB };
const FORMATS = { textures: ['.webp'], sounds: ['.ogg'], music: ['.ogg'] };
const MAX_FILE = 4 * MB;
const MAX_TOTAL = 256 * MB;
// Hosts whose catalogue is CC0 throughout, or that we only take CC0 entries from.
const SOURCES = [
  'polyhaven.com',
  'ambientcg.com',
  'kenney.nl',
  'opengameart.org',
];

const errors = [];
const fail = (msg) => errors.push(msg);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// --- The ledger -------------------------------------------------------------

const rows = new Map();
if (!existsSync(LEDGER)) {
  fail('ASSETS.md is missing');
} else {
  const lines = readFileSync(LEDGER, 'utf8').split('\n');
  let n = 0;
  for (const line of lines) {
    n++;
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const cells = t.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (cells.length < 4) continue;
    const [rawPath, source, author, licence] = cells;
    // Header and divider rows.
    if (/^path$/i.test(rawPath) || /^-+$/.test(rawPath.replace(/[:\s]/g, ''))) continue;
    const rel = rawPath.replace(/^`|`$/g, '').replace(/^public\/assets\//, '').replace(/^\/+/, '');
    if (rows.has(rel)) fail(`ASSETS.md:${n} lists ${rel} twice`);
    rows.set(rel, { source, author, licence, line: n });
    if (!/\bCC0\b/i.test(licence)) fail(`ASSETS.md:${n} ${rel}: licence "${licence}" is not CC0`);
    if (!author) fail(`ASSETS.md:${n} ${rel}: no author`);
    const url = source.replace(/^<|>$/g, '').replace(/^\[.*?\]\((.*)\)$/, '$1');
    if (!/^https?:\/\//.test(url)) fail(`ASSETS.md:${n} ${rel}: source "${source}" is not a URL`);
    else if (!SOURCES.some((h) => new URL(url).hostname.endsWith(h))) {
      fail(`ASSETS.md:${n} ${rel}: source host ${new URL(url).hostname} is not a known CC0 source`);
    }
  }
}

// --- The folder -------------------------------------------------------------

const files = walk(ASSETS).filter((f) => {
  const base = path.basename(f);
  return !(base === '.keep' && statSync(f).size === 0);
});
const sizes = { textures: 0, sounds: 0, music: 0 };
let total = 0;
const seen = new Set();

for (const f of files) {
  const rel = path.relative(ASSETS, f).split(path.sep).join('/');
  const top = rel.split('/')[0];
  const size = statSync(f).size;
  total += size;
  seen.add(rel);
  if (!(top in BUDGETS)) {
    fail(`${rel}: outside textures/, sounds/ and music/`);
    continue;
  }
  sizes[top] += size;
  const ext = path.extname(f).toLowerCase();
  if (!FORMATS[top].includes(ext)) fail(`${rel}: ${top} must be ${FORMATS[top].join(' or ')}, not ${ext || 'no extension'}`);
  if (size > MAX_FILE) fail(`${rel}: ${(size / MB).toFixed(2)} MB is over the 4 MB file limit`);
  if (size === 0) fail(`${rel}: empty file`);
  if (!rows.has(rel)) fail(`${rel}: not in ASSETS.md`);
}

for (const [rel, row] of rows) {
  if (!seen.has(rel)) fail(`ASSETS.md:${row.line} ${rel}: file does not exist`);
}

for (const [top, used] of Object.entries(sizes)) {
  if (used > BUDGETS[top]) fail(`${top}/: ${(used / MB).toFixed(1)} MB is over its ${BUDGETS[top] / MB} MB budget`);
}
if (total > MAX_TOTAL) fail(`all assets: ${(total / MB).toFixed(1)} MB is over the 256 MB artifact limit`);

// --- Report -----------------------------------------------------------------

const summary = Object.entries(sizes)
  .map(([k, v]) => `${k} ${(v / MB).toFixed(1)}/${BUDGETS[k] / MB} MB`)
  .join(', ');
console.log(`assets: ${files.length} files, ${rows.size} ledger rows; ${summary}`);
if (listSizes) {
  const byDir = new Map();
  for (const f of files) {
    const d = path.relative(ASSETS, path.dirname(f));
    byDir.set(d, (byDir.get(d) ?? 0) + statSync(f).size);
  }
  for (const [d, s] of [...byDir].sort()) console.log(`  ${d.padEnd(32)} ${(s / MB).toFixed(2)} MB`);
}
if (errors.length) {
  for (const e of errors.slice(0, 60)) console.log(`  FAIL ${e}`);
  if (errors.length > 60) console.log(`  ... and ${errors.length - 60} more`);
  console.log(`check-assets: FAIL (${errors.length})`);
  process.exit(1);
}
console.log('check-assets: PASS');
