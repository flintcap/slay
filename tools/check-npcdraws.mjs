/**
 * Are the camp residents cheap to draw?
 *
 *   node tools/check-npcdraws.mjs            (NPC_DUMP=1 lists every part)
 *
 * The nine residents stand in town all the time, so each one's mesh count is
 * paid every frame there, twice over for the ones that cast shadows. Builds
 * each one headlessly (see `tools/npcdraws-entry.ts`) and fails if any is over
 * budget. Body parts and clothes that share a material should be one mesh.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.npcdrawaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/npcdraws-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { rows } = JSON.parse(lines[lines.length - 1]);
// NPC_DUMP=1 lists every visible part: name, material type, size, triangles.
if (process.env.NPC_DUMP) console.log(lines.slice(0, -1).join('\n'));

/** Visible meshes one resident may have. */
const MAX_MESHES = Number(process.env.NPC_MAX_MESHES ?? 18);
/** All nine together, colour pass plus one shadow pass. Was 370 before the merge. */
const MAX_TOTAL = 240;

let bad = 0;
let total = 0;
for (const r of rows) {
  const over = r.meshes > MAX_MESHES;
  if (over) bad++;
  total += r.meshes + r.shadow;
  console.log(
    `${over ? 'FAIL' : 'ok  '}  ${r.id.padEnd(9)} ${String(r.meshes).padStart(3)} meshes (${r.skinned} skinned, ${r.shadow} cast shadow), ${r.materials} materials, ${r.tris} tris`,
  );
}
console.log(`\nall residents: ${total} draw calls (colour + one shadow pass, budget ${MAX_TOTAL})`);
if (total > MAX_TOTAL) bad++;
console.log(bad === 0 ? `OK — every resident is at most ${MAX_MESHES} meshes.` : `FAILED — ${bad} residents over ${MAX_MESHES} meshes.`);
process.exit(bad === 0 ? 0 : 1);
