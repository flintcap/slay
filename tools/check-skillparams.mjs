/**
 * Does every skill setting do something?
 *
 *   node tools/check-skillparams.mjs
 *
 * A skill's `params` block holds the numbers its tooltip promises. Each read
 * of each setting is recorded while the real game resolves every class's
 * passives, estimates every attack, and casts every active skill at real
 * monsters (see tools/skillparams-entry.ts). A setting nothing ever read is a
 * promise nothing keeps, so it fails here: wire it up or take it out of the
 * data and the text.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.skillparamsaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/skillparams-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
let raw;
try {
  // The feel layer has no screen to shake here and says so on stderr; only stdout counts.
  raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
} catch (err) {
  console.error(String(err.stderr ?? err).slice(-4000));
  process.exit(1);
} finally {
  rmSync(OUT, { recursive: true, force: true });
}
const lines = raw.trim().split('\n');
const { unread, errors, refused } = JSON.parse(lines[lines.length - 1]);

const bad = Object.entries(unread);
for (const [id, keys] of bad) console.log(`FAIL ${id.padEnd(22)} never reads: ${keys.join(', ')}`);
for (const e of errors) console.log(`FAIL ${e}`);
for (const id of refused) console.log(`FAIL ${id.padEnd(22)} the runner would not cast it with any weapon`);
const fails = bad.length + errors.length + refused.length;
console.log(fails === 0 ? '\nOK — every skill setting is read by the game.' : `\nFAILED — ${fails} problem(s).`);
process.exit(fails === 0 ? 0 : 1);
