/**
 * Do monsters actually fight your summons, or do they walk past them?
 *
 *   node tools/check-aggro.mjs
 *
 * Also checks the scene glue by reading the source: the aim position has to be
 * pointed at the summon for the acting monster, and the blow has to be routed
 * to it. A brain that decides correctly and a scene that ignores the decision
 * is the same bug in two places.
 */
import { build } from 'vite';
import { rmSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.aggroaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/aggro-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8' });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { cases } = JSON.parse(lines[lines.length - 1]);

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('scenario', 38)} ${pad('fights', 8)} ${pad('walks to', 9)}`);
for (const c of cases) {
  console.log(`${pad(c.name, 38)} ${pad(c.fighting, 8)} ${pad(c.goesToward, 9)} ${c.ok ? '' : '<-- WRONG'}`);
}

// --- scene glue ------------------------------------------------------------
const scene = readFileSync(path.join(ROOT, 'src/scenes/DungeonScene.ts'), 'utf8');
const glue = [
  ['aim points at the summon', /this\.aimPos\.set\(m\.x, 0, m\.z\)/],
  ['blows land on the summon', /this\.skills\.damageMinion\(onMinion, packet\.amount\)/],
  ['summons handed to the AI', /minions: this\.skills\.minionTargets\(\)/],
  ['aim restored after the loop', /this\.aimPos\.copy\(this\.player\.position\)/],
];
console.log('');
const missing = [];
for (const [name, re] of glue) {
  const ok = re.test(scene);
  if (!ok) missing.push(name);
  console.log(`${pad(name, 38)} ${ok ? 'wired' : 'MISSING'}`);
}

const bad = cases.filter((c) => !c.ok);
console.log(
  bad.length === 0 && missing.length === 0
    ? '\nOK — monsters fight the summons standing in their way, and bosses still come for you.'
    : `\nFAILED — ${bad.length} wrong decisions, ${missing.length} unwired.`,
);
process.exit(bad.length === 0 && missing.length === 0 ? 0 : 1);
