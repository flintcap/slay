/**
 * Do hits, stuns, knockdowns and deaths read right and never pop?
 *
 *   node tools/check-reactions.mjs
 *
 * See `tools/reactions-entry.ts`. Per scenario: the biggest one-frame joint
 * jump, planted-foot slide, and the scenario's own test (a swing still lands
 * on time through a hit, a run keeps running, a frozen body holds still, a
 * knocked-down body sits low, a dead body lies on the floor and nothing goes
 * through it). Static, about 20 s. No browser.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.reactaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/reactions-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8' });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const rows = JSON.parse(lines[lines.length - 1]);

/** Joint second difference, metres (the gait's limit). */
const MAX_POP = 0.16;
/** Planted feet, mean m/s. A falling body's feet drag, so deaths get more room. */
const MAX_SLIDE = 0.12;
const MAX_SLIDE_FALL = 0.35;

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('scenario', 24)} ${pad('pop', 7)} ${pad('at', 14)} ${pad('slide', 7)} ${pad('worst', 6)} check`);
let ok = true;
for (const r of rows) {
  const falls = /death|down/.test(r.name);
  const bad = [];
  if (r.pop > MAX_POP) bad.push('pop');
  if (r.slide > (falls ? MAX_SLIDE_FALL : MAX_SLIDE)) bad.push('slide');
  if (!r.ok) bad.push('check');
  if (bad.length) ok = false;
  console.log(
    `${pad(r.name, 24)} ${pad(r.pop, 7)} ${pad(r.popAt, 14)} ${pad(r.slide, 7)} ${pad(r.slideMax, 6)} ${r.note}${bad.length ? `   <-- ${bad.join(', ')}` : ''}`,
  );
}
console.log(ok ? '\nOK — reactions hold the body together.' : '\nFAILED — see the marked rows.');
process.exit(ok ? 0 : 1);
