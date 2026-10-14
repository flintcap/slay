/**
 * Do the boss systems work? Sizes, profiles, picking and moods.
 *
 *   node tools/check-bosssys.mjs
 *
 * Size spread, profile numbers, reach kept on resized bosses, no-repeat and
 * seen-less picking, and each of the five moods. See tools/bosssys-entry.ts.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.bosssysaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/bosssys-entry.ts'),
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
console.log(bad.length === 0 ? '\nOK — sizes, profiles, picking and moods all hold.' : `\nFAILED — ${bad.length} of ${cases.length}.`);
process.exit(bad.length === 0 ? 0 : 1);
