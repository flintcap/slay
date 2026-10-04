/**
 * The combat sweep: every skill and every monster ability, exercised.
 *
 *   node tools/check-sweep.mjs                 everything (~25 s)
 *   node tools/check-sweep.mjs --skills        only the 163 active skills
 *   node tools/check-sweep.mjs --abilities --only=ground_slam --trace
 *
 * A skill must do something you can see. A monster blow must be able to land
 * (on a hero standing still, or one crossing the ground it leaves), and one
 * with a marker must be avoidable by walking out of it and, if that is not
 * enough, dashing through as it lands. See tools/sweep-entry.ts.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.sweepaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/sweep-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs'), ...process.argv.slice(2)], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { cases } = JSON.parse(lines[lines.length - 1]);

for (const c of cases) {
  console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name.padEnd(44)} ${c.detail}`);
}
const bad = cases.filter((c) => !c.ok);
console.log(bad.length === 0 ? '\nOK — every skill does something and every monster blow can land and be avoided.' : `\nFAILED — ${bad.length} of ${cases.length}.`);
process.exit(bad.length === 0 ? 0 : 1);
