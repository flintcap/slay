/**
 * Do strikes land when the game says, on target, without skating or popping?
 *
 *   node tools/check-strikes.mjs
 *
 * Plays every strike the way `Player.beginAction` does (see
 * `tools/strikes-entry.ts`) and checks, per case:
 *  - the clip's contact key arrives on the game's contact frame,
 *  - the weapon tip is moving fastest right around that frame,
 *  - at contact the business end points ahead of the body, not back at it,
 *  - planted feet stay put while the body brakes and turns under the swing,
 *  - no joint outside the arms jumps between two frames,
 *  - a two-handed weapon keeps the off hand on its haft.
 * Static, about 20 s. No browser.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.strikeaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/strikes-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8' });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const rows = JSON.parse(lines[lines.length - 1]);

/** The contact key must land within one frame of the game's contact. */
const MAX_KEY_ERR = 1 / 60 + 1e-3;
/** The tip is fastest within this of the contact, seconds. */
const MAX_PEAK_ERR = 0.06;
/** At contact the business end points at least this far forward. */
const MIN_FWD = 0.2;
/** Planted feet: mean and worst-frame speed over the floor, m/s. */
const MAX_SLIDE = 0.12;
const MAX_SLIDE_FRAME = 0.9;
/** Joint second difference, metres (the gait's limit). */
const MAX_POP = 0.16;
/** Off hand within this of the haft, metres. */
const MAX_GAP = 0.09;

const pad = (s, n) => String(s).padEnd(n);
console.log(
  `${pad('clip', 9)} ${pad('weapon', 24)} ${pad('key', 7)} ${pad('peak', 7)} ${pad('fwd', 6)} ${pad('up', 6)} ${pad('reach', 6)} ${pad('slide', 7)} ${pad('worst', 6)} ${pad('pop', 6)} ${pad('at', 16)} gap`,
);
let ok = true;
for (const r of rows) {
  const melee = !['cast', 'shoot'].includes(r.clip);
  const bad = [];
  if (Math.abs(r.keyErr) > MAX_KEY_ERR) bad.push('key');
  if (melee && Math.abs(r.peakErr) > MAX_PEAK_ERR) bad.push('peak');
  if (melee && r.fwd < MIN_FWD) bad.push('aim');
  if (r.slide > MAX_SLIDE || r.slideMax > MAX_SLIDE_FRAME) bad.push('slide');
  if (r.pop > MAX_POP) bad.push('pop');
  if (['attack1', 'attack2', 'slam', 'thrust', 'lunge'].includes(r.clip) && r.gap > MAX_GAP) bad.push('gap');
  if (bad.length) ok = false;
  console.log(
    `${pad(r.clip, 9)} ${pad(r.base, 24)} ${pad(r.keyErr, 7)} ${pad(r.peakErr, 7)} ${pad(r.fwd, 6)} ${pad(r.up, 6)} ${pad(r.reach, 6)} ${pad(r.slide, 7)} ${pad(r.slideMax, 6)} ${pad(r.pop, 6)} ${pad(r.popAt, 16)} ${r.gap}${bad.length ? `   <-- ${bad.join(', ')}` : ''}`,
  );
}
console.log(ok ? '\nOK — every strike lands on its contact frame, on target, feet planted.' : '\nFAILED — see the marked rows.');
process.exit(ok ? 0 : 1);
