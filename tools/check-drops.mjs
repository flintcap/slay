/**
 * Does every item drop somewhere, in a sane number of kills?
 *
 *   node tools/check-drops.mjs [--list]
 *
 * Works the odds out from the drop tables (see `tools/drops-entry.ts`) for a
 * hero at each item's own level. Fails when an item can never drop, when one
 * is far rarer than the others of its kind at its level, or when a boss's own
 * drop takes too many kills of that boss.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/** How much rarer than the middle item of its kind one may be. */
const SPREAD = 6;
/** Most kills of one boss it may take to see one of its own drops. */
const MAX_BOSS_KILLS = 40;

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.dropsaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false, logLevel: 'error', root: ROOT,
  build: { ssr: path.join(ROOT, 'tools/drops-entry.ts'), outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } }, minify: false },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { rows, sigRows, problems } = JSON.parse(lines[lines.length - 1]);

const fmt = (n) => (n === null || !Number.isFinite(n) ? 'never' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : n.toFixed(0));
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

console.log('kind              items   fastest   middle   slowest   (kills to see one, at its level)');
const kinds = [...new Set(rows.map((r) => r.kind))].sort();
for (const k of kinds) {
  const rs = rows.filter((r) => r.kind === k && r.kills !== null && Number.isFinite(r.kills));
  if (!rs.length) continue;
  const ks = rs.map((r) => r.kills);
  const mid = median(ks);
  console.log(`${k.padEnd(17)} ${String(rs.length).padStart(5)}   ${fmt(Math.min(...ks)).padStart(7)}  ${fmt(mid).padStart(7)}  ${fmt(Math.max(...ks)).padStart(8)}`);
  for (const r of rs) if (r.kills > mid * SPREAD) problems.push(`${r.id} (${r.name}): ${fmt(r.kills)} kills, over ${SPREAD}x the ${fmt(mid)} of its kind`);
  if (process.argv.includes('--list')) for (const r of [...rs].sort((a, b) => b.kills - a.kills).slice(0, 8)) console.log(`    ${r.id.padEnd(30)} ilvl ${String(r.ilvl).padStart(3)}  ${fmt(r.kills)}`);
}

const sk = sigRows.map((r) => r.bossKills);
if (sk.length) console.log(`\n${sigRows.length} boss drops: ${fmt(Math.min(...sk))} to ${fmt(Math.max(...sk))} kills of their boss, middle ${fmt(median(sk))}`);
for (const r of sigRows) if (r.bossKills > MAX_BOSS_KILLS) problems.push(`${r.boss} -> ${r.id}: ${fmt(r.bossKills)} kills of its boss`);

if (problems.length) {
  console.log('\nPROBLEMS');
  for (const p of problems) console.log('  - ' + p);
  console.log(`\nFAILED: ${problems.length} problem(s).`);
  process.exit(1);
}
console.log('\nOK: every item drops, and none takes an unfair number of kills.');
