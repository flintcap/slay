/**
 * Do planted feet stay planted?
 *
 *   node tools/check-footplant.mjs
 *
 * Walks a real model with the real animator along a scripted route and
 * measures how fast feet that are on the ground slide across it, plus the
 * biggest one-frame joint jump (a pop between states). See
 * `tools/footplant-entry.ts`.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.footaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/footplant-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8' });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const r = JSON.parse(lines[lines.length - 1]);

/** Planted feet may creep this fast on average, m/s. */
const MAX_SLIDE = 0.12;
/** And no single planted frame faster than this. */
const MAX_SLIDE_FRAME = 0.9;
/**
 * No joint's motion may change by more than this between two frames (a second
 * difference, so fast steady motion passes and a discontinuity does not).
 */
// A running leg folding at toe-off measures up to ~0.15 here and is smooth to
// the eye; a real snap between two states measures 0.2 and up.
const MAX_POP = 0.16;

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('segment', 20)} ${pad('body m/s', 9)} ${pad('planted', 8)} ${pad('slide', 7)} worst`);
for (const s of r.segs) {
  console.log(`${pad(s.label, 20)} ${pad(s.bodySpeed, 9)} ${pad(s.plantedFrames, 8)} ${pad(s.slide, 7)} ${s.slideMax}`);
}
console.log(`\nmean planted slide ${r.slide} m/s (limit ${MAX_SLIDE}), worst frame ${r.slideMax} m/s (limit ${MAX_SLIDE_FRAME})`);
console.log(`biggest one-frame joint jump ${r.pop} m at ${r.popAt} (limit ${MAX_POP})`);
console.log(`inside actions (arms excepted): jump ${r.actionPop} m at ${r.actionPopAt} (limit ${MAX_POP}); slide per segment above`);
const act = r.segs.filter((s) => s.action);
const actSlide = act.every((s) => s.slide <= MAX_SLIDE && s.slideMax <= MAX_SLIDE_FRAME);
const ok = r.slide <= MAX_SLIDE && r.slideMax <= MAX_SLIDE_FRAME && r.pop <= MAX_POP && r.actionPop <= MAX_POP && actSlide;
console.log(ok ? '\nOK — feet plant and nothing pops.' : '\nFAILED — feet skate or a joint pops.');
process.exit(ok ? 0 : 1);
