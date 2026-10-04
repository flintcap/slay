/**
 * Does the story hold together?
 *
 *   node tools/check-story.mjs
 *
 * Bundles tools/story-entry.ts with the real game data and runs it. The entry
 * checks every id the story references, every chapter, every person's lines,
 * every boss's voice, and plays every contract through the real world
 * generator to prove it can be finished. Exit code 1 on any failure.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.storyaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/story-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
let raw = '';
let code = 0;
try {
  raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
} catch (err) {
  raw = String(err.stdout ?? '') + String(err.stderr ?? '');
  code = 1;
}
rmSync(OUT, { recursive: true, force: true });
process.stdout.write(raw);
process.exit(code);
