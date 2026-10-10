/**
 * Downloads the CC0 photo texture sets the world is built from and converts
 * them into the game's packed WebP layout.
 *
 *   node tools/fetch-textures.mjs                 # every set not yet on disk
 *   node tools/fetch-textures.mjs --only=slab,ice # just these
 *   node tools/fetch-textures.mjs --force         # redo even if present
 *
 * Sources are Poly Haven (polyhaven.com) and ambientCG (ambientcg.com). Both
 * publish every texture under CC0. Downloads land in
 * `/tmp/slay-downloads/ground/<set>/` and are treated as untrusted data: they
 * are only ever read by `unzip` (junked paths, images only) and ImageMagick's
 * `convert`. Nothing that comes out of a download is run.
 *
 * Output, per set, under `public/assets/textures/<folder>/<set>/`:
 *
 *   albedo.webp   RGB colour (sRGB) with the AO map multiplied in at half
 *                 strength; ALPHA = height (auto-levelled, 0 low .. 1 high).
 *   normal.webp   RGB OpenGL-style tangent normal; ALPHA = roughness.
 *   emissive.webp RGB emission, only for sets that ship one (lava).
 *
 * Height and roughness ride in alpha because WebP stores alpha at full
 * resolution (lightly quantised here), where a packed RGB data map would lose detail to
 * chroma subsampling.
 *
 * `gray: true` sets lose their colour (mean pulled to mid grey) so a tint in
 * the material decides it: dyed cloth, leather, metals, fur, bone.
 *
 * Every written file gets a row in ASSETS.md (added once, never duplicated).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DL = '/tmp/slay-downloads/ground';
const LEDGER = path.join(ROOT, 'ASSETS.md');

/**
 * name: folder name under textures/<folder>/
 * src:  'ph:<id>' (Poly Haven) or 'acg:<id>' (ambientCG)
 * size: output pixels (1024 for world surfaces, 512 for small things)
 */
const SETS = [
  // Floors
  { name: 'slab', src: 'ph:rock_tile_floor', size: 1024 },
  { name: 'tiles_worn', src: 'ph:worn_tile_floor', size: 1024 },
  { name: 'flagstone', src: 'ph:grey_stone_path', size: 1024 },
  { name: 'flagstone_dark', src: 'ph:monastery_stone_floor', size: 1024 },
  { name: 'cobble', src: 'ph:cobblestone_floor_04', size: 1024 },
  // Walls
  { name: 'ashlar', src: 'ph:stone_brick_wall_001', size: 1024 },
  { name: 'rubble_wall', src: 'ph:castle_wall_varriation', size: 1024 },
  { name: 'brick_red', src: 'ph:castle_brick_07', size: 1024 },
  { name: 'mossy_wall', src: 'ph:mossy_stone_wall', size: 1024 },
  { name: 'sandstone', src: 'ph:sandstone_blocks_08', size: 1024 },
  { name: 'plaster', src: 'ph:damaged_plaster', size: 1024 },
  // Natural rock
  { name: 'cliff', src: 'ph:cliff_side', size: 1024 },
  { name: 'cave', src: 'ph:rock_face', size: 1024 },
  { name: 'basalt', src: 'ph:dark_rock', size: 1024 },
  { name: 'obsidian', src: 'acg:Rock035', size: 1024 },
  { name: 'lava_crust', src: 'acg:Lava001', size: 1024 },
  { name: 'lava', src: 'acg:Lava004', size: 512 },
  { name: 'ice', src: 'acg:Ice002', size: 1024 },
  // Terrain
  { name: 'snow', src: 'ph:snow_02', size: 1024 },
  { name: 'dirt', src: 'ph:dirt', size: 1024 },
  { name: 'path', src: 'ph:rocky_trail', size: 1024 },
  { name: 'mud', src: 'ph:brown_mud_02', size: 1024 },
  { name: 'grass', src: 'ph:forrest_ground_01', size: 1024 },
  { name: 'leaves', src: 'ph:forest_leaves_02', size: 1024 },
  { name: 'roots', src: 'ph:roots', size: 1024 },
  { name: 'sand', src: 'ph:sand_01', size: 1024 },
  { name: 'cracked', src: 'ph:mud_cracked_dry_03', size: 1024 },
  { name: 'ash', src: 'ph:burned_ground_01', size: 1024 },
  // Built things
  { name: 'planks', src: 'ph:old_planks_02', size: 1024 },
  { name: 'rust', src: 'ph:rust_coarse_01', size: 1024 },
  { name: 'bark', src: 'ph:bark_brown_02', size: 1024 },
  // Small things: props, gear and bodies read these through `surface()`.
  { name: 'iron', gray: true, src: 'ph:metal_plate_02', size: 512 },
  { name: 'steel', gray: true, src: 'acg:Metal032', size: 512 },
  { name: 'chainmail', gray: true, src: 'acg:Chainmail004', size: 512 },
  { name: 'cloth', gray: true, src: 'acg:Fabric030', size: 512 },
  { name: 'leather', gray: true, src: 'ph:leather_white', size: 512 },
  { name: 'wood', src: 'ph:rough_wood', size: 512 },
  { name: 'fur', gray: true, src: 'acg:Fabric084', size: 512 },
  { name: 'bone', gray: true, src: 'acg:Rock023', size: 512 },
  { name: 'flesh', src: 'acg:Lava005', size: 512, noEmissive: true },
  { name: 'moss', src: 'acg:Moss002', size: 512 },
];
const FOLDER = 'world';

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const force = args.includes('--force');

function run(cmd, argv, opts = {}) {
  return execFileSync(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20, ...opts });
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

function json(url) {
  const out = path.join(DL, `.api-${Date.now()}.json`);
  if (!curl(url, out)) throw new Error(`could not fetch ${url}`);
  const data = JSON.parse(readFileSync(out, 'utf8'));
  rmSync(out);
  return data;
}

/** Download the raw maps for a set into its own empty directory. */
function fetchRaw(set) {
  const [kind, id] = set.src.split(':');
  const dir = path.join(DL, set.name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const maps = {};
  let author;
  let page;
  if (kind === 'ph') {
    const info = json(`https://api.polyhaven.com/info/${id}`);
    author = Object.keys(info.authors ?? {}).join(', ') || 'Poly Haven';
    page = `https://polyhaven.com/a/${id}`;
    const files = json(`https://api.polyhaven.com/files/${id}`);
    const pick = (key) => files[key]?.['1k']?.jpg?.url ?? files[key]?.['1k']?.png?.url;
    const want = { color: pick('Diffuse'), normal: pick('nor_gl'), rough: pick('Rough'), ao: pick('AO'), height: pick('Displacement') };
    for (const [k, url] of Object.entries(want)) {
      if (!url) continue;
      const out = path.join(dir, `${k}${path.extname(new URL(url).pathname)}`);
      if (curl(url, out)) maps[k] = out;
    }
    set.dimensions = info.dimensions;
  } else {
    page = `https://ambientcg.com/view?id=${id}`;
    author = 'Lennart Demes (ambientCG)';
    const zip = path.join(dir, 'set.zip');
    if (!curl(`https://ambientcg.com/get?file=${id}_1K-JPG.zip`, zip)) throw new Error(`no zip for ${id}`);
    const out = path.join(dir, 'x');
    mkdirSync(out);
    // -j junks every path inside the archive, so nothing can land outside `out`.
    run('unzip', ['-q', '-j', '-o', zip, '*.jpg', '-d', out]);
    for (const f of readdirSync(out)) {
      const m = /_(Color|NormalGL|Roughness|AmbientOcclusion|Displacement|Emission)\.jpg$/.exec(f);
      if (!m) continue;
      const k = { Color: 'color', NormalGL: 'normal', Roughness: 'rough', AmbientOcclusion: 'ao', Displacement: 'height', Emission: 'emissive' }[m[1]];
      maps[k] = path.join(out, f);
    }
  }
  if (!maps.color || !maps.normal) throw new Error(`${set.name}: missing colour or normal map`);
  return { maps, author, page };
}

function convert(set, maps) {
  const outDir = path.join(ROOT, 'public', 'assets', 'textures', FOLDER, set.name);
  mkdirSync(outDir, { recursive: true });
  const S = `${set.size}x${set.size}!`;
  const written = [];
  const webp = ['-define', 'webp:exact=true', '-define', 'webp:alpha-quality=50', '-define', 'webp:method=6'];

  // Albedo, AO at half strength, height in alpha.
  const albedo = path.join(outDir, 'albedo.webp');
  const a = ['(', maps.color, '-resize', S, '-alpha', 'off'];
  if (set.gray) {
    // Tintable sets: colourless, with the mean pulled to a mid value so the
    // material's tint is the colour you get (cloth dyes, leather, metals).
    const mean = Number(run('convert', [maps.color, '-resize', S, '-modulate', '100,0', '-format', '%[fx:mean]', 'info:']).toString());
    a.push('-modulate', '100,0', '-evaluate', 'multiply', String((0.62 / Math.max(0.05, mean)).toFixed(3)));
  }
  a.push(')');
  if (maps.ao) {
    a.push('(', maps.ao, '-resize', S, '-channel', 'R', '-separate', '+channel', '-function', 'polynomial', '0.5,0.5', ')', '-compose', 'multiply', '-composite');
  }
  if (maps.height) {
    a.push('(', maps.height, '-resize', S, '-channel', 'R', '-separate', '+channel', '-auto-level', ')');
  } else {
    a.push('(', '-size', `${set.size}x${set.size}`, 'xc:gray50', ')');
  }
  a.push('-alpha', 'off', '-compose', 'copy-opacity', '-composite', '-quality', '84', ...webp, albedo);
  run('convert', a);
  written.push(albedo);

  // Normal, roughness in alpha.
  const normal = path.join(outDir, 'normal.webp');
  const n = ['(', maps.normal, '-resize', S, '-alpha', 'off', ')'];
  if (maps.rough) n.push('(', maps.rough, '-resize', S, '-channel', 'R', '-separate', '+channel', ')');
  else n.push('(', '-size', `${set.size}x${set.size}`, 'xc:gray75', ')');
  n.push('-alpha', 'off', '-compose', 'copy-opacity', '-composite', '-quality', '88', ...webp, normal);
  run('convert', n);
  written.push(normal);

  if (maps.emissive && !set.noEmissive) {
    const em = path.join(outDir, 'emissive.webp');
    run('convert', [maps.emissive, '-resize', `${Math.min(512, set.size)}x${Math.min(512, set.size)}!`, '-alpha', 'off', '-quality', '82', em]);
    written.push(em);
  }
  return written;
}

function addLedgerRows(files, page, author) {
  let text = readFileSync(LEDGER, 'utf8');
  const have = new Set(
    text
      .split('\n')
      .filter((l) => l.startsWith('|'))
      .map((l) => l.split('|')[1]?.trim().replace(/^`|`$/g, '')),
  );
  let add = '';
  for (const f of files) {
    const rel = path.relative(path.join(ROOT, 'public', 'assets'), f).split(path.sep).join('/');
    if (have.has(rel)) continue;
    add += `| \`${rel}\` | ${page} | ${author} | CC0 1.0 |\n`;
  }
  if (!add) return;
  if (!text.endsWith('\n')) text += '\n';
  writeFileSync(LEDGER, text + add);
}

mkdirSync(DL, { recursive: true });
const todo = SETS.filter((s) => (only ? only.includes(s.name) : true));
let failures = 0;
for (const set of todo) {
  const outDir = path.join(ROOT, 'public', 'assets', 'textures', FOLDER, set.name);
  if (!force && existsSync(path.join(outDir, 'normal.webp'))) {
    console.log(`${set.name}: present, skipped`);
    continue;
  }
  try {
    console.log(`${set.name}: ${set.src}`);
    const { maps, author, page } = fetchRaw(set);
    const files = convert(set, maps);
    addLedgerRows(files, page, author);
    const kb = files.map((f) => `${path.basename(f)} ${Math.round(statSync(f).size / 1024)}KB`).join(', ');
    console.log(`  ${kb}${set.dimensions ? `  (${set.dimensions.map((d) => (d / 1000).toFixed(2)).join('x')} m)` : ''}`);
  } catch (err) {
    failures++;
    console.error(`  FAILED ${set.name}: ${String(err.message ?? err).slice(0, 200)}`);
  }
}
process.exit(failures ? 1 : 0);
