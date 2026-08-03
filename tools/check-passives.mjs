/**
 * Which skills are spent points that buy nothing?
 *
 * A skill reaches the player through two doors and only two: it is castable
 * (it has a targeting mode) or it grants stats (it has a passive stat table).
 * A skill with neither cannot be cast and gives nothing, however good its
 * description sounds. `swornBrother` was found this way — a summon with a full
 * effect id that was registered passive and could never be pressed.
 *
 *   node tools/check-passives.mjs
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.passaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/passive-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { rows, treeOwner } = JSON.parse(lines[lines.length - 1]);

const castable = rows.filter((r) => r.targeting !== 'passive');
const granting = rows.filter((r) => r.targeting === 'passive' && r.hasPassiveStats);
const dead = rows.filter((r) => r.targeting === 'passive' && !r.hasPassiveStats);

console.log(`skills: ${rows.length}`);
console.log(`  castable:          ${castable.length}`);
console.log(`  passive, grants stats: ${granting.length}`);
console.log(`  DEAD (no cast, no stats): ${dead.length}`);

const byClass = {};
for (const d of dead) {
  const cls = treeOwner[d.tree] ?? '?';
  (byClass[cls] ??= []).push(d);
}
for (const [cls, list] of Object.entries(byClass).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n${cls} — ${list.length} dead`);
  for (const d of list.sort((a, b) => a.tier - b.tier)) {
    console.log(`  t${d.tier} ${d.id.padEnd(20)} ${d.effect ? `fx ${d.effect}` : 'no fx'}`);
  }
}

console.log(dead.length === 0 ? '\nOK — every skill either casts or grants stats.' : `\n${dead.length} skills do nothing at all.`);
process.exit(dead.length === 0 ? 0 : 1);
