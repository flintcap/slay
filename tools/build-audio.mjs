/**
 * Builds every recorded sound, ambience bed and music track from the CC0
 * source packs.
 *
 *   node tools/build-audio.mjs              # build everything
 *   node tools/build-audio.mjs --fetch      # download and unzip the packs first
 *   node tools/build-audio.mjs --only=hit.  # rebuild ids starting with "hit."
 *   SLAY_AUDIO_SRC=/path node tools/build-audio.mjs   # where the packs live
 *
 * Writes:
 *   public/assets/sounds/<id>/NN.ogg        effects, mono, peak -1 dBFS
 *   public/assets/sounds/beds/<key>/NN.ogg  ambience loops, stereo, -24 LUFS
 *   public/assets/music/<key>/NN.ogg        music, stereo, -18 LUFS
 *   src/audio/manifest.ts                   the counts and file lists the game reads
 *   ASSETS.md                               one row per file (sounds/ and music/ rows replaced)
 *
 * The source files are untrusted downloads: they are only ever read by ffmpeg.
 * Needs ffmpeg with libvorbis on the PATH.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PACKS } from './audio/packs.mjs';
import { BEDS, MUSIC, ROOTS, SFX } from './audio/recipe.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = process.env.SLAY_AUDIO_SRC ?? '/tmp/slay-downloads/audio';
const OUT = path.join(ROOT, 'public', 'assets');
const TMP = path.join(os.tmpdir(), `slay-audio-build-${process.pid}`);
const SR = 44100;
const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.slice(7) ?? null;
const JOBS = Math.max(1, Math.min(8, os.cpus().length));

mkdirSync(TMP, { recursive: true });

// --- helpers ----------------------------------------------------------------

function run(cmd, argv) {
  return new Promise((resolve) => {
    const p = spawn(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => resolve({ code, out, err }));
  });
}

async function ff(argv) {
  const r = await run('ffmpeg', ['-hide_banner', '-nostdin', '-y', ...argv]);
  if (r.code !== 0) throw new Error(`ffmpeg failed: ${argv.join(' ')}\n${r.err.split('\n').slice(-6).join('\n')}`);
  return r.err;
}

let tmpN = 0;
const tmp = (ext = 'wav') => path.join(TMP, `t${++tmpN}.${ext}`);

function sourcePath(take) {
  const pack = PACKS[take.pack];
  if (!pack) throw new Error(`unknown pack ${take.pack}`);
  return path.join(SRC, pack.dir, (ROOTS[take.pack] ?? '') + take.file);
}

async function duration(file) {
  const err = (await run('ffmpeg', ['-hide_banner', '-nostdin', '-i', file])).err;
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(err);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
}

/** Non-silent stretches of a file, longest first, as [start, end] pairs. */
async function pieces(file, n) {
  const total = await duration(file);
  const err = await ff(['-i', file, '-af', 'silencedetect=noise=-36dB:d=0.12', '-f', 'null', '-']);
  const spans = [];
  let at = 0;
  for (const line of err.split('\n')) {
    const s = /silence_start: ([\d.]+)/.exec(line);
    const e = /silence_end: ([\d.]+)/.exec(line);
    if (s) spans.push([at, Number(s[1])]);
    if (e) at = Number(e[1]);
  }
  if (at < total) spans.push([at, total]);
  return spans
    .map(([a, b]) => [Math.max(0, a - 0.03), Math.min(total, b + 0.08)])
    .filter(([a, b]) => b - a >= 0.3)
    .sort((p, q) => q[1] - q[0] - (p[1] - p[0]))
    .slice(0, n)
    .sort((p, q) => p[0] - q[0]);
}

/** Expands `slices` into one take per piece. */
async function expand(takes) {
  const out = [];
  for (const t of takes) {
    if (!t.slices) {
      out.push(t);
      continue;
    }
    for (const [a, b] of await pieces(sourcePath(t), t.slices)) {
      const { slices: _s, ...rest } = t;
      out.push({ ...rest, ss: a, t: Math.min(b - a, 4), fadeOut: rest.fadeOut ?? 0.08 });
    }
  }
  return out;
}

/** The filter chain for one take (not its mix layers). */
function chain(take, { trim }) {
  const f = [`aresample=${SR}`];
  if (take.ss || take.t) f.push(`atrim=start=${take.ss ?? 0}${take.t ? `:duration=${take.t}` : ''}`, 'asetpts=PTS-STARTPTS');
  if (take.rev) f.push('areverse');
  if (take.rate && take.rate !== 1) f.push(`asetrate=${Math.round(SR * take.rate)}`, `aresample=${SR}`);
  if (take.hp) f.push(`highpass=f=${take.hp}`);
  if (take.lp) f.push(`lowpass=f=${take.lp}`);
  if (trim && !take.keep) {
    const sr = 'silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.004';
    f.push(sr, 'areverse', sr, 'areverse');
  }
  if (take.fadeIn) f.push(`afade=t=in:d=${take.fadeIn}`);
  const fo = take.fadeOut ?? (take.t ? 0.06 : 0.008);
  f.push('areverse', `afade=t=in:d=${fo}`, 'areverse');
  if (take.delay) f.push(`adelay=${take.delay}:all=1`);
  return f.join(',');
}

/** Renders one take (and its mix layers) to a float WAV. */
async function render(take, { channels, trim }) {
  const inArgs = take.loops > 1 ? ['-stream_loop', String(take.loops - 1)] : [];
  const main = tmp();
  await ff([...inArgs, '-i', sourcePath(take), '-af', chain(take, { trim }), '-ac', String(channels), '-c:a', 'pcm_f32le', main]);
  if (!take.mix?.length) return main;
  const layers = [];
  for (const m of take.mix) layers.push(await render(m, { channels, trim: !m.keep && trim }));
  const mixed = tmp();
  const inputs = [main, ...layers].flatMap((f) => ['-i', f]);
  // Each layer is brought to the main take's peak first, so a layer's `gain` is relative to it.
  const top = await peak(main);
  const parts = [];
  for (let i = 0; i < take.mix.length; i++) {
    const g = top - (await peak(layers[i])) + (take.mix[i].gain ?? 0);
    parts.push(`[${i + 1}]volume=${g.toFixed(2)}dB[m${i}]`);
  }
  const fc = `${parts.join(';')};[0]${take.mix.map((_, i) => `[m${i}]`).join('')}amix=inputs=${take.mix.length + 1}:normalize=0:duration=longest`;
  await ff([...inputs, '-filter_complex', fc, '-ac', String(channels), '-c:a', 'pcm_f32le', mixed]);
  return mixed;
}

/** Average level effects are brought down to (dB, volumedetect mean). */
const SFX_MEAN = -14;

async function levels(file) {
  const err = await ff(['-i', file, '-af', 'volumedetect', '-f', 'null', '-']);
  const max = /max_volume: (-?[\d.]+) dB/.exec(err);
  const mean = /mean_volume: (-?[\d.]+) dB/.exec(err);
  return { max: max ? Number(max[1]) : 0, mean: mean ? Number(mean[1]) : -20 };
}

async function peak(file) {
  const err = await ff(['-i', file, '-af', 'volumedetect', '-f', 'null', '-']);
  const m = /max_volume: (-?[\d.]+) dB/.exec(err);
  return m ? Number(m[1]) : 0;
}

async function loudness(file, target) {
  const err = await ff(['-i', file, '-af', `loudnorm=I=${target}:TP=-1.5:LRA=11:print_format=json`, '-f', 'null', '-']);
  const json = err.slice(err.lastIndexOf('{'), err.lastIndexOf('}') + 1);
  return JSON.parse(json);
}

/** Encodes a rendered WAV to OGG Vorbis at its level. */
async function encode(wav, out, { kind, gain = 0 }) {
  mkdirSync(path.dirname(out), { recursive: true });
  let af;
  let q;
  let ch;
  if (kind === 'sfx') {
    // As loud as the peak allows, but dense sounds are held back to a common
    // average level so one take of an id does not jump out over the others.
    const { max, mean } = await levels(wav);
    af = `volume=${(Math.min(-1 - max, SFX_MEAN - mean) + gain).toFixed(2)}dB`;
    q = '4';
    ch = '1';
  } else {
    const target = kind === 'music' ? -18 : -24;
    const m = await loudness(wav, target);
    af =
      `loudnorm=I=${target}:TP=-1.5:LRA=11:linear=true:measured_I=${m.input_i}:measured_TP=${m.input_tp}` +
      `:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset},aresample=${SR}`;
    if (gain) af += `,volume=${gain}dB`;
    q = '2';
    ch = '2';
  }
  await ff(['-i', wav, '-af', af, '-ac', ch, '-ar', String(SR), '-c:a', 'libvorbis', '-q:a', q, '-map_metadata', '-1', out]);
}

/** Runs async jobs a few at a time. */
async function pool(jobs) {
  let i = 0;
  const errors = [];
  const worker = async () => {
    while (i < jobs.length) {
      const job = jobs[i++];
      try {
        await job();
      } catch (e) {
        errors.push(e.message);
      }
    }
  };
  await Promise.all(Array.from({ length: JOBS }, worker));
  return errors;
}

// --- fetch ------------------------------------------------------------------

function fetchPacks() {
  for (const [key, pack] of Object.entries(PACKS)) {
    const base = path.join(SRC, path.dirname(pack.dir));
    const into = path.join(SRC, pack.dir);
    if (existsSync(into) && readdirSync(into).length) continue;
    mkdirSync(into, { recursive: true });
    for (const url of pack.fetch) {
      const name = decodeURIComponent(url.split('/').pop());
      const file = path.join(base, name);
      console.log(`fetch ${key}: ${name}`);
      spawnSync('curl', ['-sSfL', '-o', file, url], { stdio: 'inherit' });
      if (name.endsWith('.zip')) spawnSync('unzip', ['-q', '-o', file, '-d', pack.kenney ? base : into], { stdio: 'inherit' });
      else spawnSync('cp', [file, path.join(into, name)]);
    }
  }
}

// --- build ------------------------------------------------------------------

/** Which pack a take (and its layers) came from, for the ledger. */
function credits(take, out = new Set()) {
  out.add(take.pack);
  for (const m of take.mix ?? []) credits(m, out);
  return out;
}

const ledger = new Map(); // rel path -> Set of pack keys
const files = { sfx: {}, beds: {}, music: {} };

async function buildGroup(kind, table, dirOf) {
  const jobs = [];
  for (const [key, list] of Object.entries(table)) {
    if (only && !key.startsWith(only)) continue;
    const dir = dirOf(key);
    rmSync(path.join(OUT, dir), { recursive: true, force: true });
    const takes = await expand(list);
    files[kind][key] = [];
    takes.forEach((take, n) => {
      const rel = `${dir}/${String(n + 1).padStart(2, '0')}.ogg`;
      files[kind][key].push(rel);
      ledger.set(rel, credits(take));
      jobs.push(async () => {
        const wav = await render(take, { channels: kind === 'sfx' ? 1 : 2, trim: kind === 'sfx' });
        await encode(wav, path.join(OUT, rel), { kind, gain: take.gain ?? 0 });
      });
    });
  }
  return pool(jobs);
}

function listExisting(dir) {
  const out = {};
  const base = path.join(OUT, dir);
  if (!existsSync(base)) return out;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.ogg')) {
        const rel = path.relative(OUT, full).split(path.sep).join('/');
        const key = path.relative(base, d).split(path.sep).join('/');
        (out[key] ??= []).push(rel);
      }
    }
  };
  walk(base);
  for (const k of Object.keys(out)) out[k].sort();
  return out;
}

function writeManifest() {
  // Read back from disk so a partial (--only) build still writes a full manifest.
  const sounds = listExisting('sounds');
  const counts = {};
  const beds = {};
  for (const [key, list] of Object.entries(sounds)) {
    if (key.startsWith('beds/')) beds[key.slice(5)] = list;
    else counts[key] = list.length;
  }
  const music = listExisting('music');
  const sortObj = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
  const body = [
    '/**',
    ' * Generated by tools/build-audio.mjs. Do not edit by hand.',
    ' *',
    ' * SAMPLE_COUNTS: variations per sound id (sounds/<id>/01.ogg ...).',
    ' * MUSIC_FILES / AMBIENCE_FILES: the files of each track and bed, relative to public/assets/.',
    ' */',
    '',
    `export const SAMPLE_COUNTS: Record<string, number> = ${JSON.stringify(sortObj(counts), null, 2)};`,
    '',
    `export const MUSIC_FILES: Record<string, string[]> = ${JSON.stringify(sortObj(music), null, 2)};`,
    '',
    `export const AMBIENCE_FILES: Record<string, string[]> = ${JSON.stringify(sortObj(beds), null, 2)};`,
    '',
  ].join('\n');
  writeFileSync(path.join(ROOT, 'src', 'audio', 'manifest.ts'), body);
  return { counts, music, beds };
}

const LEDGER_FILE = path.join(ROOT, 'ASSETS.md');
const LEDGER_JSON = path.join(ROOT, 'tools', 'audio', 'ledger.json');

function writeLedger() {
  // Keep credits of files this run did not rebuild.
  const old = existsSync(LEDGER_JSON) ? JSON.parse(readFileSync(LEDGER_JSON, 'utf8')) : {};
  const all = { ...old };
  for (const [rel, set] of ledger) all[rel] = [...set];
  const present = new Set([...Object.values(listExisting('sounds')).flat(), ...Object.values(listExisting('music')).flat()]);
  for (const rel of Object.keys(all)) if (!present.has(rel)) delete all[rel];
  const sorted = Object.fromEntries(Object.entries(all).sort(([a], [b]) => (a < b ? -1 : 1)));
  writeFileSync(LEDGER_JSON, JSON.stringify(sorted, null, 1) + '\n');

  const rows = Object.entries(sorted).map(([rel, keys]) => {
    const [first, ...rest] = keys;
    const p = PACKS[first];
    const extra = rest.map((k) => `${PACKS[k].author} (${PACKS[k].page.replace(/^https:\/\//, '')})`);
    const author = [p.author, ...extra].join(' + ');
    return `| ${rel} | ${p.page} | ${author} | CC0 |`;
  });
  const lines = readFileSync(LEDGER_FILE, 'utf8').split('\n');
  const kept = lines.filter((l) => !/^\|\s*`?(public\/assets\/)?(sounds|music)\//.test(l.trim()));
  let last = -1;
  kept.forEach((l, i) => {
    if (l.trim().startsWith('|')) last = i;
  });
  kept.splice(last + 1, 0, ...rows);
  writeFileSync(LEDGER_FILE, kept.join('\n'));
}

function size(dir) {
  let total = 0;
  let biggest = 0;
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else {
        const s = statSync(full).size;
        total += s;
        biggest = Math.max(biggest, s);
      }
    }
  };
  walk(path.join(OUT, dir));
  return { total, biggest };
}

if (args.includes('--fetch')) fetchPacks();

const t0 = Date.now();
const errors = [
  ...(await buildGroup('sfx', SFX, (k) => `sounds/${k}`)),
  ...(await buildGroup('beds', BEDS, (k) => `sounds/beds/${k}`)),
  ...(await buildGroup('music', MUSIC, (k) => `music/${k}`)),
];
const m = writeManifest();
writeLedger();
rmSync(TMP, { recursive: true, force: true });

const MB = 1024 * 1024;
const s = size('sounds');
const mu = size('music');
console.log(
  `audio: ${Object.keys(m.counts).length} sound ids (${Object.values(m.counts).reduce((a, b) => a + b, 0)} files), ` +
    `${Object.keys(m.beds).length} beds, ${Object.keys(m.music).length} tracks in ${((Date.now() - t0) / 1000).toFixed(0)} s`,
);
console.log(`  sounds ${(s.total / MB).toFixed(1)} MB (largest ${(s.biggest / MB).toFixed(2)} MB), music ${(mu.total / MB).toFixed(1)} MB (largest ${(mu.biggest / MB).toFixed(2)} MB)`);
if (errors.length) {
  for (const e of errors) console.log(`  FAIL ${e.split('\n')[0]}`);
  console.log(`build-audio: ${errors.length} takes failed`);
  process.exit(1);
}
console.log('build-audio: done');
