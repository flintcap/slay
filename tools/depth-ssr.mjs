/**
 * Shared runner for the depth stream's headless checkers.
 *
 * Bundles a `tools/<name>-entry.ts` with `vite build --ssr`, runs it under
 * Node, and returns the JSON object printed on its last stdout line.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

export async function runEntry(name) {
  const OUT = path.join(ROOT, `.${name}audit`);
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  try {
    await build({
      configFile: false,
      logLevel: 'error',
      root: ROOT,
      build: {
        ssr: path.join(ROOT, `tools/${name}-entry.ts`),
        outDir: OUT,
        rollupOptions: { output: { entryFileNames: 'e.mjs' } },
        minify: false,
      },
    });
    const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
    const lines = raw.trim().split('\n');
    return JSON.parse(lines[lines.length - 1]);
  } finally {
    rmSync(OUT, { recursive: true, force: true });
  }
}

/** Prints problems and exits non-zero when there are any. */
export function finish(problems, okText) {
  if (problems.length) {
    console.log('\nPROBLEMS');
    for (const p of problems) console.log('  - ' + p);
    console.log(`\nFAILED — ${problems.length} problem(s).`);
    process.exit(1);
  }
  console.log(`\nOK — ${okText}`);
}
