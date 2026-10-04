/**
 * Can every heavy monster and boss attack be read before it lands?
 *
 *   node tools/check-readable.mjs
 *
 * A blow at or above HEAVY times the monster's damage must put a marker on the
 * floor and wind up for at least MIN_TELL seconds (before attack speed). Lists
 * every ability that breaks the rule, boss abilities first.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const HEAVY = 1.5;
const MIN_TELL = 0.5;

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.readableaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/abilityaudit-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { rows } = JSON.parse(lines[lines.length - 1]);

const used = rows.filter((r) => r.boss || r.monster);
const bad = used.filter((r) => r.damageMul >= HEAVY && (!r.telegraph || r.windup < MIN_TELL));
bad.sort((a, b) => Number(b.boss) - Number(a.boss) || b.damageMul - a.damageMul);

console.log(`${used.length} abilities in use, ${used.filter((r) => r.damageMul >= HEAVY).length} heavy (>= ${HEAVY}x)`);
for (const r of bad) {
  console.log(
    `  ${r.boss ? 'BOSS ' : '     '}${r.id.padEnd(24)} ${String(r.damageMul).padEnd(5)}x  windup ${String(r.windup).padEnd(5)} marker ${r.telegraph ?? 'none'}`,
  );
}
console.log(bad.length === 0 ? '\nOK — every heavy blow is marked and telegraphed.' : `\nFAILED — ${bad.length} heavy blows you cannot read.`);
process.exit(bad.length === 0 ? 0 : 1);
