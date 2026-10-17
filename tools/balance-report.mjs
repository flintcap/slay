/**
 * A read-only audit of the item economy: affix lines by item level, uniques
 * against rares, gems, runes, charms, drop odds and prices.
 *
 *   node tools/balance-report.mjs            readable tables
 *   node tools/balance-report.mjs --json     the raw numbers
 *
 * Measures, never changes. See tools/balance-entry.ts for the scale used.
 * Written for docs/remake/balance-proposal.md.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.balancereport');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/balance-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const r = JSON.parse(lines[lines.length - 1]);
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(r, null, 1));
  process.exit(0);
}
const table = (title, rows) => {
  console.log(`\n== ${title}`);
  if (!rows.length) return;
  const keys = [...new Set(rows.flatMap((x) => Object.keys(x)))];
  const fmt = (v) => (v === undefined ? '-' : typeof v === 'object' && v !== null ? Object.values(v).join('/') : String(v));
  const w = keys.map((k) => Math.max(k.length, ...rows.map((x) => fmt(x[k]).length)));
  console.log(keys.map((k, i) => k.padEnd(w[i])).join('  '));
  for (const x of rows) console.log(keys.map((k, i) => fmt(x[k]).padEnd(w[i])).join('  '));
};
table('Rare and magic lines (score = unique-line shares)', r.affixes);
const u = r.uniques;
console.log(`\n== Uniques: ${u.count} (non-charm), ${u.withPower} with a power or bend`);
console.log(`below a usual rare at own level: ${u.belowRareAt0} (${u.belowRareAt0NoPower} with no power)`);
console.log(`below a usual rare 20 levels deeper: ${u.belowRareAt20} (${u.belowRareAt20NoPower} with no power)`);
table('Unique/rare ratio by tier', u.byRarity);
table('Weakest uniques at their own level (u/rare/p75)', u.worstAt0.map((x) => ({ id: x.id, ilvl: x.ilvl, power: x.power, at0: x.at0, at20: x.at20 })));
console.log(`\n== Sets: ${r.sets.sets} sets, ${r.sets.pieces} pieces (see check-setpower)`);
table('Gems: mean share of a unique line at the gem level', r.gems);
table('Runes (share of a unique line at rune level)', r.runes);
table('Runes: average kills to own one (best of drop or fuse)', r.runeKills);
table('Runewords', r.runewords);
table('Charms vs a rare ring', r.charms);
table('Drops per depth', r.drops);
table('Prices per depth', r.prices);
if (r.noCurve.length) console.log(`\nstats with no curve (scored against 10): ${r.noCurve.join(', ')}`);
