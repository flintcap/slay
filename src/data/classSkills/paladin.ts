/**
 * SLAY — the Paladin's three trees. Spread into `../skills.ts`.
 *
 *  - Mace   maces and scepters. Heavy, blunt, single target: stagger, dents
 *           in armour, a bell rung inside a helmet.
 *  - Blade  swords. Fast and exact, single target: opened veins, answers to
 *           blows, cuts strung together like a litany.
 *  - Aura   one aura at a time, a ring at his feet, plus the vows and
 *           censures he lays on himself and on one enemy.
 *
 * Mace and Blade skills run through the `rite` handler family
 * (`scenes/paladin/Rites.ts`); auras through `vigil` (`scenes/paladin/Vigils.ts`).
 * A Mace skill wants a mace or scepter in hand, a Blade skill a sword.
 */
import type { SkillTreeDef } from '../../types';
import { build, type SynergyLink } from './kit';

export const PALADIN_TREES: SkillTreeDef[] = [
  {
    id: 'palMace',
    name: 'Mace',
    classId: 'paladin',
    blurb: 'Maces and scepters. One target, hit until it stops: stagger it, dent it, ring it like a bell.',
  },
  {
    id: 'palBlade',
    name: 'Blade',
    classId: 'paladin',
    blurb: 'Swords. Quick, exact cuts on one target: open it, answer it, finish it.',
  },
  {
    id: 'palAura',
    name: 'Aura',
    classId: 'paladin',
    blurb: 'One aura at a time, a ring of candle smoke at your feet. Vows for you, censures for them.',
  },
];

// ===========================================================================
// PALADIN — Mace
// ===========================================================================

const MACE = build('palMace', [
  {
    id: 'tollingBlow',
    name: 'Tolling Blow',
    desc: 'One heavy overhand blow at one enemy for 150% weapon damage (+18% per rank). It is Staggered for 2s: slower to move and to swing.',
    tier: 1,
    col: 0,
    icon: 'toll-blow',
    t: 'enemy',
    mana: [2, 0.2],
    dmg: [1.5, 0.18],
    fx: 'rite.toll',
    p: { reach: 2.6, duration: 2 },
  },
]);

export const PALADIN_SKILLS = [...MACE];

export const PALADIN_SYNERGIES: SynergyLink[] = [];
