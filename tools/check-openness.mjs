/**
 * How open is each layout?
 *
 *   node tools/check-openness.mjs
 *
 * Asked: "Are the Caverns supposed to be a giant open map?"
 *
 * `wide` is the share of walkable tiles with two clear tiles in every
 * direction — the middle of a big empty space, as opposed to a room or a
 * passage, both of which have a wall within two tiles. `square` is the widest
 * fully walkable square found anywhere, in tiles, at 2m a tile.
 *
 * A layout made of rooms and corridors sits in single digits on `wide` even
 * when its rooms are generous. Anything much past a quarter is a field.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.openaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/openness-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { layouts } = JSON.parse(lines[lines.length - 1]);

const pad = (s, n) => String(s).padEnd(n);
const pct = (a, b) => ((a / Math.max(1, b)) * 100).toFixed(1) + '%';
console.log(
  `${pad('layout', 12)} ${pad('levels', 7)} ${pad('floor', 8)} ${pad('wide', 8)} ${pad('square', 8)} widest`,
);
const rows = layouts.sort((a, b) => b.wideOpen / Math.max(1, b.floor) - a.wideOpen / Math.max(1, a.floor));
let bad = 0;
for (const r of rows) {
  const wide = r.wideOpen / Math.max(1, r.floor);
  // A quarter of the floor being two tiles from any wall means the level reads
  // as one space rather than a set of them.
  const flag = wide > 0.25 ? '   <-- reads as one open field' : '';
  if (wide > 0.25) bad++;
  console.log(
    `${pad(r.layout, 12)} ${pad(r.levels, 7)} ${pad(pct(r.floor, r.area), 8)} ${pad(pct(r.wideOpen, r.floor), 8)} ${pad(
      r.widestSquare,
      8,
    )} ${r.widestSquare * 2}m`,
  );
}
console.log(
  bad === 0
    ? '\nOK — every layout reads as rooms and passages, not a field.'
    : `\nFAILED — ${bad} layouts are mostly wide-open floor.`,
);
process.exit(bad === 0 ? 0 : 1);
