/**
 * Is any clutter floating, or standing somewhere it should not be?
 *
 *   node tools/check-props.mjs
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.propaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/props-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const d = JSON.parse(lines[lines.length - 1]);

console.log(`levels ${d.levels}   props ${d.props}`);
const offTile = d.bad.filter((b) => !b.onFloor);
const wrongHeight = d.bad.filter((b) => b.onFloor);
console.log(`\nprops on a tile that is not floor: ${offTile.length}`);
console.log(`floor props not grounded to the lowest floor they touch: ${wrongHeight.length}`);
console.log(`props that sit on a step and needed the drop: ${d.lipped} (${((d.lipped / d.props) * 100).toFixed(1)}% of all props)`);

const tally = {};
for (const b of d.bad) tally[b.kind] = (tally[b.kind] ?? 0) + 1;
for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  console.log(`  ${k.padEnd(16)} ${n}`);
}
const ok = d.bad.length === 0;
console.log(ok ? '\nOK — every floor prop is grounded to the lowest floor it touches.' : '\nFOUND misplaced props.');
process.exit(ok ? 0 : 1);
