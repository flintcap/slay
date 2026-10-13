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
 * run time (the helpers are this file's own), so there is no import cycle.
 */
import type { DamageType, SkillDef, SkillTargeting, SkillTreeDef, StatKey } from '../../types';

// ---------------------------------------------------------------------------
// Authoring helpers (the same shapes `data/skills.ts` uses)
// ---------------------------------------------------------------------------

const MAX = 20;
const r1 = (n: number): number => Math.round(n * 10) / 10;
const lin = (a: number, b: number) => (r: number): number => r1(a + b * (r - 1));
const per = (b: number) => (r: number): number => r1(b * r);
const dim = (cap: number, k: number) => (r: number): number => r1(cap * (1 - Math.pow(1 - k, r)));
const mana = (a: number, b: number) => (r: number): number => Math.max(0, r1(a + b * (r - 1)));
const cool = (a: number, b: number, min = 0.4) => (r: number): number => Math.max(min, r1(a - b * (r - 1)));

interface Spec {
  id: string;
  name: string;
  desc: string;
  tier: number;
  col: number;
  icon: string;
  max?: number;
  req?: string[];
  t?: SkillTargeting;
  mana?: [number, number];
  cd?: [number, number] | [number, number, number];
  dmg?: [number, number];
  type?: DamageType;
  fx?: string;
  p?: Record<string, number | number[]>;
  stat?: Partial<Record<StatKey, (r: number) => number>>;
}

function build(treeId: string, specs: Spec[]): SkillDef[] {
  return specs.map((s): SkillDef => {
    const out: SkillDef = {
      id: s.id,
      treeId,
      name: s.name,
      desc: s.desc,
      tier: s.tier,
      column: s.col,
      maxRank: s.max ?? MAX,
      targeting: s.t ?? 'passive',
      icon: s.icon,
    };
    if (s.req) out.requires = s.req;
    if (s.mana) out.manaCost = mana(s.mana[0], s.mana[1]);
    if (s.cd) out.cooldown = cool(s.cd[0], s.cd[1], s.cd[2]);
    if (s.dmg) out.damageScale = lin(s.dmg[0], s.dmg[1]);
    if (s.type) out.damageType = s.type;
    if (s.fx) out.effect = s.fx;
    if (s.p) out.params = s.p;
    if (s.stat) out.passive = s.stat;
    return out;
  });
}

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
export const SHIFTER_SYNERGIES: Array<{ target: string; source: string; pctPerRank: number }> = [];

void per;
void dim;
