/**
 * Do passive tooltips give the right numbers?
 *
 *   node tools/check-stattext.mjs
 *
 * The skill tree shows a passive's real stats in rows under its text. The text
 * must not say something else: every stat's number has to appear in it (see
 * tools/stattext-entry.ts for what counts).
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.stattextaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/stattext-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { wrong } = JSON.parse(lines[lines.length - 1]);

for (const w of wrong) console.log(`FAIL ${w.id.padEnd(20)} ${w.key.padEnd(18)} ${w.v}\n     ${w.desc}`);
console.log(wrong.length === 0 ? '\nOK — every passive gives the numbers its text says.' : `\nFAILED — ${wrong.length} stat(s) the text gets wrong or hides.`);
process.exit(wrong.length === 0 ? 0 : 1);
