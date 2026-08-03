/**
 * Is each kind of weapon actually held the right way?
 *
 *   node tools/check-grips.mjs
 *
 * Builds a real skeleton, attaches a real weapon through the real socket code,
 * runs the real animator until the carry pose settles, then measures it. Which
 * hand, which way up, and how far apart the hands are — that is the whole of
 * "held properly", and none of it needs a rendered frame.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.gripaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/grip-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8' });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { rows, covered, swings } = JSON.parse(lines[lines.length - 1]);

const pad = (s, n) => String(s).padEnd(n);
console.log(
  `${pad('base', 17)} ${pad('grip', 9)} ${pad('hand', 16)} ${pad('points', 14)} ${pad('hands', 16)} ${pad('gap', 7)} ${pad('upright', 8)} lean`,
);
for (const r of rows) {
  const hand = `${r.hand}${r.hand === r.want.hand ? '' : ` (want ${r.want.hand})`}`;
  const pts = `${r.points}${r.points === r.want.points ? '' : ` (want ${r.want.points})`}`;
  const hands = `${r.bothHands ? 'both' : 'one'}${
    r.bothHands === r.want.both ? '' : ` (want ${r.want.both ? 'both' : 'one'})`
  }`;
  console.log(
    `${pad(r.base, 17)} ${pad(r.grip, 9)} ${pad(hand, 16)} ${pad(pts, 14)} ${pad(hands, 16)} ${pad(r.handGap, 7)} ${pad(r.upright, 8)} ${r.lean}${
      r.ok ? '' : '   <-- WRONG'
    }`,
  );
}

console.log('\nmid-swing, the business end is out in front:');
for (const s of swings) {
  console.log(
    `  ${pad(s.base, 16)} ${pad(s.clip, 9)} forward ${pad(s.forward, 7)} up ${pad(s.up, 7)}${
      s.ok ? '' : '   <-- POINTING BACKWARD'
    }`,
  );
}

console.log('\nevery weapon category resolves to a chosen grip:');
const fellThrough = [];
for (const c of covered) {
  if (c.grip === 'none') fellThrough.push(c.category);
  console.log(`  ${pad(c.category, 16)} ${pad(c.grip, 9)} ${c.bases} bases`);
}

const bad = [...rows.filter((r) => !r.ok), ...swings.filter((s) => !s.ok)];
console.log(
  bad.length === 0 && fellThrough.length === 0
    ? '\nOK — every weapon is in the right hand, the right way up, with the right number of hands.'
    : `\nFAILED — ${bad.length} held wrong, ${fellThrough.length} categories with no grip.`,
);
process.exit(bad.length === 0 && fellThrough.length === 0 ? 0 : 1);
