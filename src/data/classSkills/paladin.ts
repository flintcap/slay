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
 * A Mace skill wants a mace or scepter in hand, a Blade skill a sword, a
 * shield skill a shield. What a passive does beyond its stat table is in
 * `sim/passives/paladin.ts`.
 */
import type { SkillTreeDef } from '../../types';
import { build, dim, per, syn, type SynergyLink } from './kit';

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
  // --------------------------------------------------------------- tier 1
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
  {
    id: 'hallowedIron',
    name: 'Hallowed Iron',
    desc: 'Iron quenched in chapel water. +5% damage and +8 defense per rank.',
    tier: 1,
    col: 1,
    icon: 'hallowed-iron',
    stat: { enhancedDamage: per(5), defense: per(8) },
  },
  {
    id: 'shieldCrack',
    name: 'Shield Crack',
    desc: 'The shield rim, edge-on, into one jaw. 80% weapon damage (+12% per rank), a short shove, and it is Rung for 1s (+0.03s per rank): stunned. Needs a shield.',
    tier: 1,
    col: 2,
    icon: 'shield-crack',
    t: 'enemy',
    mana: [4, 0.3],
    cd: [7, 0.15, 4],
    dmg: [0.8, 0.12],
    type: 'physical',
    fx: 'rite.crack',
    p: { reach: 2.2, stun: 1, stunPerRank: 0.03, knockback: 1.5 },
  },
  // --------------------------------------------------------------- tier 2
  {
    id: 'anvilfall',
    name: 'Anvilfall',
    desc: 'Both hands on the haft and straight down, like a smith on cold iron. 220% weapon damage (+30% per rank) to one enemy and two Dents in its armour for 6s: each Dent is -12% defense and -4% physical resistance.',
    tier: 2,
    col: 0,
    icon: 'anvilfall',
    t: 'enemy',
    req: ['tollingBlow'],
    mana: [6, 0.45],
    dmg: [2.2, 0.3],
    type: 'physical',
    fx: 'rite.anvil',
    p: { reach: 2.7, dents: 2, duration: 6 },
  },
  {
    id: 'forgedFaith',
    name: 'Forged Faith',
    desc: 'Prayers hammered into the plate. +14 defense and +1.5 damage reduction per rank.',
    tier: 2,
    col: 1,
    icon: 'forged-faith',
    req: ['hallowedIron'],
    stat: { defense: per(14), damageReduction: per(1.5) },
  },
  {
    id: 'doorbreaker',
    name: 'Doorbreaker',
    desc: 'Shield first, at one enemy up to 9 metres off. 140% weapon damage (+20% per rank), a hard shove, and it is Staggered for 2s. Needs a shield.',
    tier: 2,
    col: 2,
    icon: 'doorbreaker',
    t: 'enemy',
    req: ['shieldCrack'],
    mana: [8, 0.5],
    cd: [9, 0.25, 4],
    dmg: [1.4, 0.2],
    type: 'physical',
    fx: 'rite.door',
    p: { range: 9, reach: 2.2, duration: 2, knockback: 3 },
  },
  // --------------------------------------------------------------- tier 3
  {
    id: 'knell',
    name: 'Knell',
    desc: 'A blow that rings twice. 170% weapon damage (+22% per rank), then half a second later the helm rings again for half as much and the enemy is Rung for 0.6s.',
    tier: 3,
    col: 0,
    icon: 'knell',
    t: 'enemy',
    req: ['anvilfall'],
    mana: [8, 0.55],
    dmg: [1.7, 0.22],
    type: 'physical',
    fx: 'rite.knell',
    p: { reach: 2.6, echo: 0.5, echoDelay: 0.55, ring: 0.6, ringPerRank: 0.02 },
  },
  {
    id: 'crushingWeight',
    name: 'Crushing Weight',
    desc: 'What is already broken breaks easier. +7% damage per rank against an enemy that is Staggered, Rung or Dented.',
    tier: 3,
    col: 1,
    icon: 'crushing-weight',
    req: ['forgedFaith'],
    fx: 'passive.vsBroken',
    p: { pctPerRank: 7 },
  },
  {
    id: 'bellguard',
    name: 'Bellguard',
    desc: 'The shield takes the blow and rings with it. +3% block chance per rank (toward 20%), and whatever you block is Staggered for 1.5s.',
    tier: 3,
    col: 2,
    icon: 'bellguard',
    req: ['doorbreaker'],
    stat: { blockChance: dim(20, 0.1) },
    fx: 'passive.onBlock',
    p: { stagger: 1.5, staggerPerRank: 0.05 },
  },
  // --------------------------------------------------------------- tier 4
  {
    id: 'pilgrimsMaul',
    name: "Pilgrim's Maul",
    desc: 'A long, slow blow that spends every Dent on the enemy. 300% weapon damage (+42% per rank), and +30% more for each Dent it beats flat.',
    tier: 4,
    col: 0,
    icon: 'pilgrim-maul',
    t: 'enemy',
    req: ['knell'],
    mana: [11, 0.7],
    cd: [4, 0.08, 2],
    dmg: [3, 0.42],
    type: 'physical',
    fx: 'rite.maul',
    p: { reach: 2.7, perDent: 0.3 },
  },
  {
    id: 'ironPenance',
    name: 'Iron Penance',
    desc: 'Every blow is a confession beaten out of it. Your physical hits have a 10% chance (+1% per rank) to Dent the enemy for 6s.',
    tier: 4,
    col: 1,
    icon: 'iron-penance',
    req: ['crushingWeight'],
    fx: 'passive.onHit',
    p: { chance: 10, chancePerRank: 1, duration: 6 },
  },
  {
    id: 'barTheDoor',
    name: 'Bar the Door',
    desc: 'Set the shield and lean in. For 5s (+0.15s per rank): +20% block chance and +10 damage reduction. Needs a shield.',
    tier: 4,
    col: 2,
    icon: 'bar-door',
    t: 'self',
    req: ['bellguard'],
    mana: [7, 0.3],
    cd: [16, 0.3, 9],
    fx: 'rite.bar',
    p: { duration: 5, durationPerRank: 0.15 },
  },
  // --------------------------------------------------------------- tier 5
  {
    id: 'hurlCenser',
    name: 'Hurl the Censer',
    desc: 'Swing the censer out on its chain at one enemy up to 14 metres off. 160% weapon damage (+20% per rank) as fire, and it is Smoked for 4s: -30% attack rating while hot ash burns it.',
    tier: 5,
    col: 0,
    icon: 'hurl-censer',
    t: 'enemy',
    req: ['pilgrimsMaul'],
    mana: [9, 0.6],
    cd: [3, 0.05, 1.5],
    dmg: [1.6, 0.2],
    type: 'fire',
    fx: 'rite.censer',
    p: { range: 14, speed: 18, duration: 4, durationPerRank: 0.1 },
  },
  {
    id: 'weightOfStone',
    name: 'Weight of Stone',
    desc: 'Like dropping a church step on it. +2 minimum and +3 maximum damage, and +3% critical damage, per rank.',
    tier: 5,
    col: 1,
    icon: 'weight-stone',
    req: ['ironPenance'],
    stat: { minDamage: per(2), maxDamage: per(3), critDamage: per(3) },
  },
  {
    id: 'relicBash',
    name: 'Relic Bash',
    desc: 'Strike with the reliquary set in the shield boss. 140% weapon damage (+18% per rank); it spends every Dent on the enemy, and each one heals you 3% of your life (+0.15% per rank). Needs a shield.',
    tier: 5,
    col: 2,
    icon: 'relic-bash',
    t: 'enemy',
    req: ['barTheDoor'],
    mana: [9, 0.55],
    cd: [6, 0.12, 3],
    dmg: [1.4, 0.18],
    type: 'physical',
    fx: 'rite.relic',
    p: { reach: 2.2, healPct: 3, healPctPerRank: 0.15 },
  },
  // --------------------------------------------------------------- tier 6
  {
    id: 'theLastBell',
    name: 'The Last Bell',
    desc: 'Capstone. Every fourth Mace blow is a Toll: +60% damage (+4% per rank), and the enemy is Rung for 0.8s.',
    tier: 6,
    col: 0,
    icon: 'last-bell',
    req: ['hurlCenser'],
    fx: 'capstone.toll',
    p: { every: 4, pct: 60, pctPerRank: 4, ring: 0.8 },
  },
  {
    id: 'ironVerdict',
    name: 'Iron Verdict',
    desc: 'Judgement, in one blow. 500% weapon damage (+70% per rank) to one enemy. It is Rung for 0.4s, and 0.4s longer for each Dent in its armour, up to 2.5s.',
    tier: 6,
    col: 1,
    icon: 'iron-verdict',
    t: 'enemy',
    req: ['weightOfStone'],
    mana: [18, 1],
    cd: [10, 0.2, 5],
    dmg: [5, 0.7],
    type: 'physical',
    fx: 'rite.verdict',
    p: { reach: 2.8, ring: 0.4, ringPerDent: 0.4, ringCap: 2.5 },
  },
  {
    id: 'unbroken',
    name: 'Unbroken',
    desc: 'The bell cracked; it still rings. +12 life, +1.5 life regeneration and +1% physical resistance per rank (toward 25%).',
    tier: 6,
    col: 2,
    icon: 'unbroken',
    req: ['relicBash'],
    stat: { life: per(12), lifeRegen: per(1.5), physicalResist: dim(25, 0.08) },
  },
]);

const MACE_SYNERGIES: SynergyLink[] = [
  syn('tollingBlow', 'anvilfall', 6),
  syn('tollingBlow', 'knell', 5),
  syn('anvilfall', 'tollingBlow', 8),
  syn('anvilfall', 'pilgrimsMaul', 5),
  syn('knell', 'tollingBlow', 10),
  syn('pilgrimsMaul', 'anvilfall', 8),
  syn('pilgrimsMaul', 'ironPenance', 5),
  syn('shieldCrack', 'bellguard', 8),
  syn('doorbreaker', 'shieldCrack', 8),
  syn('relicBash', 'barTheDoor', 8),
  syn('relicBash', 'doorbreaker', 5),
  syn('hurlCenser', 'weightOfStone', 6),
  syn('ironVerdict', 'knell', 8),
  syn('ironVerdict', 'pilgrimsMaul', 6),
];

export const PALADIN_SKILLS = [...MACE];

export const PALADIN_SYNERGIES: SynergyLink[] = [...MACE_SYNERGIES];
