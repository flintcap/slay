/**
 * Does one kill raise exactly one event?
 *
 *   node tools/check-kills.mjs
 *
 * Kills real monsters (plain, Soul Bound, splitter) and a real boss headlessly
 * and counts 'enemy:killed' and 'boss:killed'. Also checks that only the body
 * that dies raises them: a scene raising them too double counts every kill.
 */
import { build } from 'vite';
import { rmSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.killsaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/kills-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { cases } = JSON.parse(lines[lines.length - 1]);

const OWNERS = { 'enemy:killed': 'src/entities/Enemy.ts', 'boss:killed': 'src/entities/Boss.ts' };
const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((f) => (f.isDirectory() ? walk(path.join(d, f.name)) : [path.join(d, f.name)]));
const sources = walk(path.join(ROOT, 'src')).filter((f) => f.endsWith('.ts'));
for (const [ev, owner] of Object.entries(OWNERS)) {
  const where = sources.filter((f) => readFileSync(f, 'utf8').includes(`emit('${ev}'`)).map((f) => path.relative(ROOT, f));
  cases.push({ name: `only ${owner} raises ${ev}`, ok: where.length === 1 && where[0] === owner, detail: where.join(', ') || 'nobody' });
}

for (const c of cases) {
  console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name.padEnd(52)} ${c.detail}`);
}
const bad = cases.filter((c) => !c.ok);
console.log(bad.length === 0 ? '\nOK — one kill, one event.' : `\nFAILED — ${bad.length} of ${cases.length}.`);
process.exit(bad.length === 0 ? 0 : 1);
