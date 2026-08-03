/**
 * Is every passive the engine computes actually read by the game?
 *
 * `src/sim/Passives.ts` resolves a character's passives into a flat record.
 * A field that nothing outside that module reads is the same bug the whole
 * skill list had: a declaration with no consumer. This proves the wiring
 * statically, so it costs a second rather than a browser boot.
 *
 * Two checks:
 *   1. Every field of `PassiveEffects` written by a rule is read somewhere in
 *      src/ outside Passives.ts.
 *   2. Every skill the engine claims to implement is a real skill id.
 *
 *   node tools/check-wiring.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PASSIVES = path.join(ROOT, 'src/sim/Passives.ts');
const src = readFileSync(PASSIVES, 'utf8');

// --- fields the interface declares ----------------------------------------
const ifaceBody = src.slice(
  src.indexOf('export interface PassiveEffects {'),
  src.indexOf('function emptyEffects()'),
);
const fields = [...ifaceBody.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*): number;/gm)].map((m) => m[1]);

// --- fields the rules actually write --------------------------------------
const rulesBody = src.slice(src.indexOf('const RULES: Record<string, Contribution> = {'), src.indexOf('export const IMPLEMENTED_PASSIVES'));
const written = new Set([...rulesBody.matchAll(/e\.([a-zA-Z][a-zA-Z0-9]*)\s*(?:\+=|=)/g)].map((m) => m[1]));

// --- everything else in src/ ----------------------------------------------
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}
const others = walk(path.join(ROOT, 'src')).filter((f) => f !== PASSIVES);
// `damageMultiplier` lives in Passives.ts but is a consumer, not a producer:
// it is where the conditional passives are actually spent. Count its body as
// reader code, and everything after the RULES table with it.
const consumerTail = src.slice(src.indexOf('export function damageMultiplier'));
const blob = others.map((f) => readFileSync(f, 'utf8')).join('\n') + '\n' + consumerTail;

const unread = [...written].filter((f) => !new RegExp(`\\.${f}\\b`).test(blob)).sort();
const unwritten = fields.filter((f) => !written.has(f)).sort();

// --- skill ids the engine names -------------------------------------------
const ruleIds = [...rulesBody.matchAll(/^  ([a-zA-Z][a-zA-Z0-9]*): \(e, r, id\)/gm)].map((m) => m[1]);
const skills = readFileSync(path.join(ROOT, 'src/data/skills.ts'), 'utf8');
const unknown = ruleIds.filter((id) => !new RegExp(`id: '${id}'`).test(skills));

console.log(`PassiveEffects fields declared: ${fields.length}`);
console.log(`  written by a rule:           ${written.size}`);
console.log(`  declared but no rule sets:   ${unwritten.length}`);
console.log(`skills the engine implements:  ${ruleIds.length}`);

if (unread.length) {
  console.log(`\nWRITTEN BUT NEVER READ outside Passives.ts (${unread.length}):`);
  for (const f of unread) console.log(`  ${f}`);
}
if (unknown.length) {
  console.log(`\nRULES for skill ids that do not exist (${unknown.length}):`);
  for (const id of unknown) console.log(`  ${id}`);
}
if (unwritten.length) {
  console.log(`\nfields no rule sets yet (${unwritten.length}, expected while classes are still being written):`);
  console.log(`  ${unwritten.join(', ')}`);
}

const ok = unread.length === 0 && unknown.length === 0;
console.log(ok ? '\nOK — every computed passive is read, and every rule names a real skill.' : '\nFAILED');
process.exit(ok ? 0 : 1);
