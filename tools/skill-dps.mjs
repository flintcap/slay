/**
 * Damage per second of every damage skill, by the real skill runner.
 *
 *   node tools/skill-dps.mjs                   every class
 *   DPS_CLASS=mage node tools/skill-dps.mjs    one class
 *   DPS_ONLY=firebolt,infernoStream node tools/skill-dps.mjs
 *
 * A report, not a pass/fail check: it flags a skill whose rank-10 damage
 * per second, on one target and on a crowd, are both under 60% of the
 * median of the other damage skills in its tree at the same or a lower
 * tier. Those are the "dead picks" milestone 3 of balance.md looks for.
 * See tools/skilldps-entry.ts.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.skilldps');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/skilldps-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { rows } = JSON.parse(lines[lines.length - 1]);

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const flagged = [];
let tree = '';
for (const r of rows) {
  if (r.tree !== tree) {
    tree = r.tree;
    console.log(`\n${r.cls} / ${tree}`);
    console.log('  skill                   tier  one@1  crowd@1  one@10  crowd@10  fx');
  }
  if (r.error) {
    console.log(`  ${r.id.padEnd(24)} error ${r.error}`);
    continue;
  }
  const peers = rows.filter((x) => x.tree === r.tree && x.id !== r.id && !x.error && x.tier <= r.tier);
  const weak = peers.length >= 2 && r.one10 < 0.6 * median(peers.map((x) => x.one10)) && r.crowd10 < 0.6 * median(peers.map((x) => x.crowd10));
  if (weak) flagged.push(`${r.cls}:${r.id}`);
  console.log(
    `  ${r.id.padEnd(24)} ${String(r.tier).padEnd(4)}  ${String(r.one1).padEnd(5)}  ${String(r.crowd1).padEnd(7)}  ${String(r.one10).padEnd(6)}  ${String(r.crowd10).padEnd(8)}  ${r.fx}${weak ? '   <- weak' : ''}`,
  );
}
console.log(`\n${flagged.length} flagged: ${flagged.join(', ') || 'none'}`);
