/**
 * SLAY — the Shapeshifter's three trees.
 *
 *  - Feral (the great black cat): speed and single kills. Prowl banks damage
 *    while you move; Pounce, Slink and the Killing Dance close the gap.
 *  - Teeth (the grey wolf): bites and howls. Hits build Pack Instinct, howls
 *    are real buffs, and Call the Pack brings wolves out of the dark.
 *  - Claw (the bear): the wall. Wide swipes, roars that hold a room, a hide
 *    that hits back and a body that will not fall.
 *
 * Every active skill of a tree shifts the hero into that tree's form before it
 * fires (see `entities/Shapeshift.ts`); the form skill itself is the shape's
 * own strength and pressing it again stands you up as a man. All actives use
 * the `shift.*` family, run by `scenes/ShifterRunner.ts`.
 *
 * Pure data, spread into `data/skills.ts`. Nothing here imports skills.ts at
 * run time (the helpers come from `kit.ts`), so there is no import cycle.
 */
import type { SkillDef, SkillTreeDef } from '../../types';
import { build, dim, per, syn, type SynergyLink } from './kit';

// ---------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------

export const SHIFTER_TREES: SkillTreeDef[] = [
  {
    id: 'feral',
    name: 'Feral',
    classId: 'shapeshifter',
    blurb: 'The great black cat. Speed, the leap, and one throat at a time.',
  },
  {
    id: 'teeth',
    name: 'Teeth',
    classId: 'shapeshifter',
    blurb: 'The grey wolf. Bites that do not let go, howls that make the hunt, and the pack behind you.',
  },
  {
    id: 'claw',
    name: 'Claw',
    classId: 'shapeshifter',
    blurb: 'The bear. Wide swipes, a hide that bites back, and a body that stands in the door.',
  },
];

/** Which form each tree's skills fight in. */
export const TREE_FORM: Readonly<Record<string, 'cat' | 'wolf' | 'bear'>> = {
  feral: 'cat',
  teeth: 'wolf',
  claw: 'bear',
};

// ===========================================================================
// FERAL — the great black cat
// ===========================================================================

const FERAL = build('feral', [
  {
    id: 'rake',
    name: 'Rake',
    desc: 'Three quick swipes at one enemy, each 50% weapon damage (+7% per rank). The last one leaves it Bleeding for 4s.',
    tier: 1,
    col: 1,
    icon: 'ss-rake',
    t: 'enemy',
    mana: [3, 0.2],
    dmg: [0.5, 0.07],
    type: 'physical',
    fx: 'shift.rake',
    p: { hits: 3, single: 1, reach: 2.4, duration: 4 },
  },
]);

// ===========================================================================
// TEETH — the grey wolf
// ===========================================================================

const TEETH = build('teeth', []);

// ===========================================================================
// CLAW — the bear
// ===========================================================================

const CLAW = build('claw', []);

/** Every Shapeshifter skill, spread into `SKILLS`. */
export const SHIFTER_SKILLS: SkillDef[] = [...FERAL, ...TEETH, ...CLAW];

/** Same-tree synergies, spread into `SYNERGIES`. */
export const SHIFTER_SYNERGIES: SynergyLink[] = [];

void per;
void dim;
void syn;
