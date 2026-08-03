/**
 * Can equipping ever duplicate or lose an item?
 *
 *   node tools/check-dupe.mjs
 *
 * Drives every class through every slot-to-slot move its gear can make, and
 * checks the one invariant that matters: no item uid appears twice anywhere,
 * and none disappears.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.dupeaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/dupe-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { classes, cases, orphans } = JSON.parse(lines[lines.length - 1]);

console.log(`${classes.length} classes, every slot-to-slot move each can make\n`);
if (cases.length === 0) {
  console.log('no item was duplicated and none was lost');
} else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad('class', 14)} ${pad('move', 40)} problem`);
  for (const c of cases) {
    const what = c.dupes.length ? `DUPED ${c.dupes.join(', ')}` : `LOST ${c.lost.join(', ')}`;
    console.log(`${pad(c.cls, 14)} ${pad(c.what, 40)} ${what}`);
  }
}

console.log(
  orphans.length === 0
    ? '\nno fresh character starts with an off-hand weapon and an empty main hand'
    : `\n${orphans.length} fresh characters start with an orphaned off-hand weapon:`,
);
for (const o of orphans) console.log(`  ${o.cls} ${o.off}`);

const bad = cases.length + orphans.length;
console.log(
  bad === 0
    ? '\nOK — equipping never duplicates an item and never loses one.'
    : `\nFAILED — ${cases.length} moves duplicate or lose an item, ${orphans.length} orphaned off-hands.`,
);
process.exit(bad === 0 ? 0 : 1);
