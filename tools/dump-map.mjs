/**
 * Prints a dungeon floor as text so a layout can actually be looked at.
 *
 *   node tools/dump-map.mjs halls 7
 */
import { build } from 'vite';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const kind = process.argv[2] ?? 'halls';
const seed = Number(process.argv[3] ?? 7);
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.mapdump');

writeFileSync(
  path.join(ROOT, 'tools/.dump-entry.ts'),
  `import { buildLayout, layoutSizeFor, T_FLOOR, T_DOOR, T_WATER, T_LAVA, T_CHASM } from '../src/world/Layouts';
import { streamFor } from '../src/core/RNG';
const kind = ${JSON.stringify(kind)} as never;
const rng = streamFor(${seed}, 'dump');
const size = layoutSizeFor(6, kind, rng);
const out = buildLayout(kind, { width: size.w, height: size.h, rng, depth: 6, seed: ${seed}, boss: false });
const g = out.grid;
const rows: string[] = [];
for (let y = 0; y < g.h; y++) {
  let line = '';
  for (let x = 0; x < g.w; x++) {
    const v = g.get(x, y);
    line += v === T_FLOOR ? '.' : v === T_DOOR ? '+' : v === T_WATER ? '~' : v === T_LAVA || v === T_CHASM ? '#' : v === 0 ? ' ' : 'X';
  }
  rows.push(line);
}
console.log(rows.join('\\n'));
console.log('rooms: ' + out.rooms.length + '  size: ' + g.w + 'x' + g.h);
`,
);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: { ssr: path.join(ROOT, 'tools/.dump-entry.ts'), outDir: OUT, rollupOptions: { output: { entryFileNames: 'e.mjs' } }, minify: false },
});
process.stdout.write(execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
rmSync(OUT, { recursive: true, force: true });
rmSync(path.join(ROOT, 'tools/.dump-entry.ts'), { force: true });
