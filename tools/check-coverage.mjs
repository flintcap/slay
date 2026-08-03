/**
 * Which skills are actually implemented, and which fall through to a generic
 * attack.
 *
 * `SkillRunner.cast` dispatches on the *family* half of a skill's effect id —
 * `ground.cloud` dispatches on `ground`. Families the switch does not name land
 * in `default:`, which fires a plain bolt for a caster or a plain swing for a
 * melee character. Those skills look alive from the outside: they cast, they
 * animate, they deal damage. They just do not do the thing they describe.
 *
 * This is a static check, so it runs in seconds and needs no browser.
 *
 *   node tools/check-coverage.mjs
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.audit');

/**
 * Families named by the dispatch switch in `SkillRunner.cast`.
 *
 * Kept here rather than parsed out of the source: a regex over a switch body is
 * exactly the kind of clever that breaks quietly and reports everything as
 * fine. If this list drifts, the check over-reports, which is the safe way for
 * it to fail.
 */
const HANDLED = new Set([
  'melee', 'cleave', 'whirlwind', 'projectile', 'bolt', 'nova', 'slam',
  'meteor', 'beam', 'cone', 'chain', 'dash', 'heal',
  'buff', 'aura', 'stance', 'shout', 'banner', 'self', 'absorb',
]);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/audit-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'entry.mjs' } },
    minify: false,
  },
});

const rows = JSON.parse(execFileSync('node', [path.join(OUT, 'entry.mjs')], { encoding: 'utf8' }));
rmSync(OUT, { recursive: true, force: true });

const active = rows.filter((r) => !r.passive);

// --- coverage --------------------------------------------------------------
const byClass = {};
for (const r of active) {
  const c = (byClass[r.cls] ??= { ok: 0, missing: [] });
  if (HANDLED.has(r.family)) c.ok++;
  else c.missing.push(r);
}

console.log('class          total  implemented  generic fallback');
console.log('-'.repeat(52));
for (const [cls, v] of Object.entries(byClass)) {
  const total = v.ok + v.missing.length;
  console.log(cls.padEnd(14) + String(total).padStart(5) + String(v.ok).padStart(13) + String(v.missing.length).padStart(18));
}
const missing = active.filter((r) => !HANDLED.has(r.family));
console.log('-'.repeat(52));
console.log(`${'all'.padEnd(14)}${String(active.length).padStart(5)}${String(active.length - missing.length).padStart(13)}${String(missing.length).padStart(18)}`);

const byFamily = {};
for (const r of missing) (byFamily[r.family] ??= []).push(r.id);
console.log('\nunimplemented families, worst first:');
for (const [f, ids] of Object.entries(byFamily).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${f.padEnd(11)}${String(ids.length).padStart(3)}  ${ids.join(', ')}`);
}

// --- uniqueness ------------------------------------------------------------
console.log('\n' + '='.repeat(52) + '\nuniqueness\n' + '='.repeat(52));

const dupIds = Object.entries(
  rows.reduce((a, r) => ((a[r.id] = (a[r.id] ?? 0) + 1), a), {})
).filter(([, n]) => n > 1);
console.log(`duplicate skill ids: ${dupIds.length}${dupIds.length ? ' — ' + dupIds.map(([k]) => k).join(', ') : ''}`);

for (const [label, key] of [['animation clip', 'clip'], ['particle emitter', 'emitter'], ['icon key', 'icon']]) {
  const counts = {};
  for (const r of active) counts[r[key]] = (counts[r[key]] ?? 0) + 1;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  console.log(`\n${label}: ${sorted.length} distinct across ${active.length} skills`);
  for (const [v, n] of sorted.slice(0, 8)) console.log(`    ${String(v).padEnd(14)}${n}`);
}

// A skill's full visual signature — the combination that should never repeat.
const sigs = {};
for (const r of active) {
  const k = `${r.clip}|${r.emitter}|${r.trail}|${r.density}|${r.size}`;
  (sigs[k] ??= []).push(`${r.cls}:${r.id}`);
}
const collisions = Object.entries(sigs).filter(([, v]) => v.length > 1);
console.log(`\nidentical visual signatures (clip + emitter + trail + density + size): ${collisions.length}`);
for (const [k, v] of collisions.slice(0, 12)) console.log(`    ${v.join(' = ')}\n      ${k}`);

process.exit(missing.length > 0 ? 1 : 0);
