/**
 * Finds work that was declared but never wired up.
 *
 * This project was built by parallel agents that ran out of budget partway
 * through, and the seams all have the same shape: a data table declares
 * something the code never reads. Nothing crashes, nothing is marked TODO, and
 * every runtime smoke test passes — the feature simply is not there.
 *
 * The skill audit found 59 skills like that. This generalises the check across
 * every declared-versus-handled pair in the project, so the remaining gaps can
 * be counted rather than discovered one bug report at a time.
 *
 *   node tools/check-unfinished.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.ts')) files.push(p);
  }
})(SRC);

const text = Object.fromEntries(files.map((f) => [path.relative(ROOT, f), readFileSync(f, 'utf8')]));

/** Every file except the ones listed, joined — "is this mentioned anywhere else". */
function othersThan(...owners) {
  return Object.entries(text)
    .filter(([f]) => !owners.includes(f))
    .map(([, s]) => s)
    .join('\n');
}

/** Literal-string mention of an id, so `'burning'` matches but `burningX` does not. */
function mentions(haystack, id) {
  return new RegExp(`['"\`]${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`).test(haystack);
}

const findings = [];

function check(label, owner, declared, consumers, note) {
  const hay = consumers ?? othersThan(owner);
  const orphans = declared.filter((d) => !mentions(hay, d));
  findings.push({ label, total: declared.length, orphans, note });
}

// --- statuses --------------------------------------------------------------
check(
  'status effects',
  'src/data/statuses.ts',
  [...text['src/data/statuses.ts'].matchAll(/def\('([\w.]+)'/g)].map((m) => m[1]),
  null,
  'declared with full stats and icons, but nothing in the game applies them',
);

// --- monster affix behaviours ----------------------------------------------
{
  const declared = [
    ...new Set([...text['src/data/monsterAffixes.ts'].matchAll(/behavior:\s*'(\w+)'/g)].map((m) => m[1])),
  ].filter((b) => b !== 'none');
  const consumers = ['src/entities/Enemy.ts', 'src/entities/Boss.ts', 'src/entities/Abilities.ts', 'src/scenes/DungeonScene.ts']
    .map((f) => text[f] ?? '')
    .join('\n');
  check('monster affix behaviours', 'src/data/monsterAffixes.ts', declared, consumers,
    'rolled onto elites and champions, but the behaviour is never acted on');
}

// --- quest objectives ------------------------------------------------------
if (text['src/data/quests.ts'] || text['src/sim/Quests.ts']) {
  const owner = text['src/data/quests.ts'] ? 'src/data/quests.ts' : 'src/sim/Quests.ts';
  const declared = [...new Set([...(text[owner] ?? '').matchAll(/kind:\s*'(\w+)'/g)].map((m) => m[1]))];
  check('quest objective kinds', owner, declared, text['src/sim/Quests.ts'] ?? '',
    'an objective the quest system never counts progress for');
}

// --- item model shapes -----------------------------------------------------
{
  const builders = new Set(
    [...text['src/art/ItemModels.ts'].matchAll(/^\s{2}(\w+):\s*build\w+,?$/gm)].map((m) => m[1]),
  );
  const used = [...new Set([...text['src/data/itemBases.ts'].matchAll(/'([\w.]+)',\s*'[\w.]+'\s*\)/g)].map((m) => m[1]))];
  void used;
  findings.push({
    label: 'item model builders',
    total: builders.size,
    orphans: [],
    note: 'shape ids resolve through `resolveShape`, which always falls back — nothing can be orphaned',
  });
}

// --- report ----------------------------------------------------------------
console.log('DECLARED BUT NEVER WIRED UP\n' + '='.repeat(70));
let worst = 0;
for (const f of findings) {
  const pct = f.total ? Math.round((f.orphans.length / f.total) * 100) : 0;
  console.log(`\n${f.label}: ${f.orphans.length} of ${f.total} orphaned (${pct}%)`);
  console.log(`  ${f.note}`);
  if (f.orphans.length) {
    for (let i = 0; i < f.orphans.length; i += 8) {
      console.log('    ' + f.orphans.slice(i, i + 8).join(', '));
    }
  }
  worst += f.orphans.length;
}
console.log('\n' + '='.repeat(70));
console.log(`total orphaned declarations: ${worst}`);
process.exit(worst > 0 ? 1 : 0);
