/**
 * Entry point for `tools/check-menus.mjs`.
 *
 * The front end leans on data it does not own: item bases for the class
 * showcase, skill ids for the "opening skill" and "grows into" previews, and
 * the name rules on the creation screen. Any of those drifting makes the
 * select screen quietly show a bare model, a missing card, or accept a name it
 * should refuse. This proves all three.
 */
import { CLASSES, STARTING_SKILL_HINTS } from '../src/data/classes';
import { findBase } from '../src/data/itemBases';
import { SKILL_BY_ID } from '../src/data/skills';
import { startingSkillFor } from '../src/sim/Character';
import { FIELD_KIT } from '../src/scenes/FieldKit';
import { checkName } from '../src/ui/names';
import { TIPS } from '../src/ui/tips';

const problems: string[] = [];

for (const cls of CLASSES) {
  const kit = FIELD_KIT[cls.id];
  if (!kit) {
    problems.push(`${cls.id}: no field kit`);
    continue;
  }
  for (const [slot, baseId] of Object.entries(kit)) {
    const base = findBase(baseId as string);
    if (!base) {
      problems.push(`${cls.id}: field kit ${slot} "${baseId}" is not an item base`);
      continue;
    }
    const fits =
      base.slot === slot ||
      (slot === 'mainHand' && base.slot === 'twoHand') ||
      (slot === 'offHand' && (base.slot === 'mainHand' || base.category === 'quiver'));
    if (!fits) problems.push(`${cls.id}: field kit ${slot} "${baseId}" is a ${base.slot} item`);
    if (!base.visual) problems.push(`${cls.id}: field kit "${baseId}" has no visual`);
  }
  const starter = startingSkillFor(cls.id);
  if (!starter || !SKILL_BY_ID[starter]) problems.push(`${cls.id}: no opening skill`);
  for (const id of STARTING_SKILL_HINTS[cls.id] ?? []) {
    if (!SKILL_BY_ID[id]) problems.push(`${cls.id}: suggested skill "${id}" does not exist`);
  }
}

const roster = [{ name: 'Aldra' }] as never[];
const fallen = [{ name: 'Vorwyn' }];
const cases: Array<[string, boolean]> = [
  ['Kaelwyn', true],
  ['  Mor  ', true],
  ["D'Arcy", true],
  ['Anne-Marie', true],
  ['Éowyn', true],
  ['Vorwyn', true],
  ['', false],
  ['A', false],
  ['ThisNameIsFarTooLong', false],
  ['x1', false],
  ['<b>', false],
  ['Aldra', false],
  ['aldra', false],
  ["Mor'", false],
  ['Mo--r', false],
];
for (const [raw, ok] of cases) {
  const r = checkName(raw, roster, fallen);
  if (r.ok !== ok) problems.push(`name "${raw}": expected ${ok ? 'accepted' : 'refused'}, got ${r.ok ? 'accepted' : 'refused'} (${r.message})`);
}

if (TIPS.length < 10) problems.push(`only ${TIPS.length} loading tips`);

console.log(JSON.stringify({ problems, classes: CLASSES.length, cases: cases.length, tips: TIPS.length }));
