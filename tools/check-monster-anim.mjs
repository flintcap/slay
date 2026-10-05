/**
 * Does every monster body move without popping, walk with its legs and die
 * onto the floor?
 *
 *   node tools/check-monster-anim.mjs
 *
 * See `tools/monster-anim-entry.ts`: one real monster per archetype, driven
 * the way Enemy drives it through spawn, idle, walk, run, a telegraphed
 * attack and its strike, a cast, a hit and a death. Static, about 15 s.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.monsteraudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/monster-anim-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8' });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const rows = JSON.parse(lines[lines.length - 1]);

/** Biggest bone jump allowed, hip heights per frame squared (limb ends excepted in strikes). */
const MAX_POP = 0.25;
/** Where the hips may end after death, hip heights. */
const MAX_DEAD = 0.45;
/** Legged bodies must really swing their legs when running, radians. */
const MIN_SWING = 0.3;
const LEGGED = new Set(['humanoid', 'quadruped', 'colossal', 'insectoid', 'arachnid']);

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('archetype', 11)} ${pad('monster', 20)} ${pad('pop', 7)} ${pad('at', 22)} ${pad('dead hips', 10)} leg swing`);
let ok = true;
for (const r of rows) {
  const bad = [];
  if (r.nan) bad.push('NaN');
  if (r.pop > MAX_POP) bad.push('pop');
  if (r.archetype !== 'swarm' && r.deadHips > MAX_DEAD) bad.push('death');
  if (LEGGED.has(r.archetype) && !(r.legSwing >= MIN_SWING)) bad.push('legs');
  if (bad.length) ok = false;
  console.log(
    `${pad(r.archetype, 11)} ${pad(r.monster, 20)} ${pad(r.pop, 7)} ${pad(r.popAt, 22)} ${pad(r.deadHips, 10)} ${r.legSwing ?? '-'}${bad.length ? `   <-- ${bad.join(', ')}` : ''}`,
  );
}
console.log(ok ? '\nOK — every monster body moves cleanly.' : '\nFAILED — see the marked rows.');
process.exit(ok ? 0 : 1);
