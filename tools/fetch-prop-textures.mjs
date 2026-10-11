/**
 * Downloads the CC0 photo textures props and town buildings are dressed in
 * (weathered planks, rough timber, thatch, roof slates, block masonry, iron
 * plate) and packs them the way `tools/fetch-item-textures.mjs` does.
 *
 *   node tools/fetch-prop-textures.mjs               # every set not yet on disk
 *   node tools/fetch-prop-textures.mjs --only=thatch # just these
 *   node tools/fetch-prop-textures.mjs --force       # redo even if present
 *
 * Sources: Poly Haven (polyhaven.com) and ambientCG (ambientcg.com), every
 * texture CC0. Downloads land in `/tmp/slay-downloads/props/<set>/`, are
 * untrusted data and are only ever read by `unzip` (junked paths, images
 * only) and ImageMagick's `convert`. Nothing from a download is run.
 *
 * `src/art/props/PropMats.ts` projects them triplanar onto prop geometry.
 *
 * Output, per set, under `public/assets/textures/props/<set>/`:
 *
 *   albedo.webp   RGB colour (for `gray` sets colourless with its mean pulled
 *                 to mid grey so a tint decides the colour); AO at half
 *                 strength; A = height.
 *   normal.webp   RGB OpenGL tangent normal; A = roughness.
 *
 * Every written file gets a row in ASSETS.md.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DL = '/tmp/slay-downloads/props';
const LEDGER = path.join(ROOT, 'ASSETS.md');

/**
 * name: folder under textures/props/ (the names PropMats.ts reads); src: Poly
 * Haven id, or 'acg:<id>' for ambientCG; gray: colourless, tinted in game.
 */
const SETS = [
  { name: 'planks', src: 'weathered_planks', size: 1024, gray: false },
  { name: 'timber', src: 'rough_wood', size: 512, gray: true },
  { name: 'thatch', src: 'thatch_roof_angled', size: 1024, gray: false },
  { name: 'slate', src: 'roof_slates_02', size: 1024, gray: false },
  { name: 'masonry', src: 'castle_wall_slates', size: 1024, gray: false },
  { name: 'ironplate', src: 'metal_plate_02', size: 512, gray: true },
];

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const force = args.includes('--force');

function run(cmd, argv) {
  return execFileSync(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
}

function curl(url, out) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      run('curl', ['-sS', '-L', '--fail', '-m', '300', '-o', out, url]);
      if (existsSync(out) && statSync(out).size > 0) return true;
    } catch (err) {
      console.warn(`  retry ${attempt + 1} for ${url}: ${String(err.stderr ?? err).trim().slice(0, 120)}`);
    }
  }
  return false;
}

function json(url, dir) {
  const out = path.join(dir, `.api-${Date.now()}.json`);
  if (!curl(url, out)) throw new Error(`could not fetch ${url}`);
  const data = JSON.parse(readFileSync(out, 'utf8'));
  rmSync(out);
  return data;
}

function fetchAmbientCG(set, id, dir) {
  const zip = path.join(dir, 'set.zip');
  if (!curl(`https://ambientcg.com/get?file=${id}_1K-JPG.zip`, zip)) throw new Error(`no zip for ${id}`);
  const out = path.join(dir, 'x');
  mkdirSync(out);
  // -j junks every path inside the archive, so nothing can land outside `out`.
  run('unzip', ['-q', '-j', '-o', zip, '*.jpg', '-d', out]);
  const maps = {};
  for (const f of readdirSync(out)) {
    const m = /_(Color|NormalGL|Roughness|AmbientOcclusion|Displacement)\.jpg$/.exec(f);
    if (!m) continue;
    const k = { Color: 'color', NormalGL: 'normal', Roughness: 'rough', AmbientOcclusion: 'ao', Displacement: 'height' }[m[1]];
    maps[k] = path.join(out, f);
  }
  if (!maps.color || !maps.normal) throw new Error(`${set.name}: missing colour or normal map`);
  return { maps, author: 'Lennart Demes (ambientCG)', page: `https://ambientcg.com/view?id=${id}` };
}

function fetchRaw(set) {
  const dir = path.join(DL, set.name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  if (set.src.startsWith('acg:')) return fetchAmbientCG(set, set.src.slice(4), dir);
  const info = json(`https://api.polyhaven.com/info/${set.src}`, dir);
  const files = json(`https://api.polyhaven.com/files/${set.src}`, dir);
  const pick = (key) => files[key]?.['1k']?.jpg?.url ?? files[key]?.['1k']?.png?.url;
  const want = { color: pick('Diffuse'), normal: pick('nor_gl'), rough: pick('Rough'), ao: pick('AO'), height: pick('Displacement') };
  const maps = {};
  for (const [k, url] of Object.entries(want)) {
    if (!url) continue;
    const out = path.join(dir, `${k}${path.extname(new URL(url).pathname)}`);
    if (curl(url, out)) maps[k] = out;
  }
  if (!maps.color || !maps.normal) throw new Error(`${set.name}: missing colour or normal map`);
  const author = Object.keys(info.authors ?? {}).join(', ') || 'Poly Haven';
  return { maps, author, page: `https://polyhaven.com/a/${set.src}`, dims: info.dimensions };
}

function convert(set, maps) {
  const outDir = path.join(ROOT, 'public', 'assets', 'textures', 'props', set.name);
  mkdirSync(outDir, { recursive: true });
  const SIZE = set.size;
  const S = `${SIZE}x${SIZE}!`;
  const webp = ['-define', 'webp:exact=true', '-define', 'webp:alpha-quality=50', '-define', 'webp:method=6'];
  const albedo = path.join(outDir, 'albedo.webp');
  const mean = Number(run('convert', [maps.color, '-resize', S, '-modulate', '100,0', '-format', '%[fx:mean]', 'info:']).toString());
  const a = set.gray
    ? ['(', maps.color, '-resize', S, '-alpha', 'off', '-modulate', '100,0', '-evaluate', 'multiply', (0.62 / Math.max(0.05, mean)).toFixed(3), ')']
    : ['(', maps.color, '-resize', S, '-alpha', 'off', ')'];
  if (maps.ao) a.push('(', maps.ao, '-resize', S, '-channel', 'R', '-separate', '+channel', '-function', 'polynomial', '0.5,0.5', ')', '-compose', 'multiply', '-composite');
  if (maps.height) a.push('(', maps.height, '-resize', S, '-channel', 'R', '-separate', '+channel', '-auto-level', ')');
  else a.push('(', '-size', `${SIZE}x${SIZE}`, 'xc:gray50', ')');
  a.push('-alpha', 'off', '-compose', 'copy-opacity', '-composite', '-quality', '84', ...webp, albedo);
  run('convert', a);
  const normal = path.join(outDir, 'normal.webp');
  const n = ['(', maps.normal, '-resize', S, '-alpha', 'off', ')'];
  if (maps.rough) n.push('(', maps.rough, '-resize', S, '-channel', 'R', '-separate', '+channel', ')');
  else n.push('(', '-size', `${SIZE}x${SIZE}`, 'xc:gray75', ')');
  n.push('-alpha', 'off', '-compose', 'copy-opacity', '-composite', '-quality', '88', ...webp, normal);
  run('convert', n);
  return [albedo, normal];
}

function addLedgerRows(files, page, author) {
  const rels = new Set(files.map((f) => path.relative(path.join(ROOT, 'public', 'assets'), f).split(path.sep).join('/')));
  const relOf = (l) => l.split('|')[1]?.trim().replace(/^`|`$/g, '');
  const lines = readFileSync(LEDGER, 'utf8').split('\n');
  const at = lines.findIndex((l) => l.startsWith('|') && rels.has(relOf(l)));
  const kept = lines.filter((l) => !(l.startsWith('|') && rels.has(relOf(l))));
  const rows = [...rels].map((rel) => `| \`${rel}\` | ${page} | ${author} | CC0 1.0 |`);
  if (at >= 0) kept.splice(at, 0, ...rows);
  else {
    while (kept.length && kept[kept.length - 1] === '') kept.pop();
    kept.push(...rows, '');
  }
  writeFileSync(LEDGER, kept.join('\n'));
}

mkdirSync(DL, { recursive: true });
let failures = 0;
for (const set of SETS.filter((s) => (only ? only.includes(s.name) : true))) {
  if (!force && existsSync(path.join(ROOT, 'public', 'assets', 'textures', 'props', set.name, 'normal.webp'))) {
    console.log(`${set.name}: present, skipped`);
    continue;
  }
  try {
    console.log(`${set.name}: ${set.src}`);
    const { maps, author, page, dims } = fetchRaw(set);
    const files = convert(set, maps);
    addLedgerRows(files, page, author);
    console.log(`  ${files.map((f) => `${path.basename(f)} ${Math.round(statSync(f).size / 1024)}KB`).join(', ')}${dims ? `  (${dims.map((d) => (d / 1000).toFixed(2)).join('x')} m)` : ''}`);
  } catch (err) {
    failures++;
    console.error(`  FAILED ${set.name}: ${String(err.message ?? err).slice(0, 200)}`);
  }
}
process.exit(failures ? 1 : 0);
