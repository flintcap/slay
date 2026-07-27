/**
 * SLAY — elite / rare pack affixes.
 *
 * An affix has to do two things: change the numbers, and change the *fight*.
 * Every entry here has a `behavior` hook the entity layer resolves each frame
 * (or on hit / on death), plus an aura colour so a pack reads at a glance —
 * you should know from across the room that the pack ahead is Molten + Jailer
 * and that you do not want to fight it in a corridor.
 *
 * `excludes` keeps combinations honest: nothing rolls two movement-denial
 * affixes, nothing rolls two elemental enchantments, and nothing pairs an
 * "unkillable while adds live" affix with "revives on death".
 */

import type { MonsterAffixDef } from '../types';

const ALL: MonsterAffixDef[] = [];

function affix(a: MonsterAffixDef): MonsterAffixDef {
  ALL.push(a);
  return a;
}

// --- Raw statline affixes ---------------------------------------------------

affix({
  id: 'extra_fast',
  name: 'Extra Fast',
  desc: 'Moves and strikes far quicker than it should.',
  minDepth: 1,
  weight: 12,
  mods: { speed: 1.45, attackSpeed: 1.4 },
  behavior: 'none',
  color: 0xffe066,
  excludes: ['juggernaut', 'lumbering'],
});

affix({
  id: 'extra_tough',
  name: 'Fortified',
  desc: 'A thick hide that shrugs off the first dozen blows.',
  minDepth: 1,
  weight: 12,
  mods: { life: 1.9, defense: 1.5 },
  behavior: 'none',
  color: 0xb0b8c8,
});

affix({
  id: 'berserker',
  name: 'Berserker',
  desc: 'Hits harder the closer it is to death.',
  minDepth: 3,
  weight: 10,
  mods: { damage: 1.25 },
  behavior: 'berserker',
  params: { maxBonus: 1.8 },
  color: 0xff3020,
});

affix({
  id: 'juggernaut',
  name: 'Juggernaut',
  desc: 'Cannot be slowed, stunned, frozen or knocked back.',
  minDepth: 6,
  weight: 8,
  mods: { life: 1.6, speed: 0.92 },
  behavior: 'juggernaut',
  color: 0xc08040,
  excludes: ['extra_fast', 'phasing'],
});

affix({
  id: 'stoneskin',
  name: 'Stoneskin',
  desc: 'Physical blows glance off; magic still bites.',
  minDepth: 5,
  weight: 8,
  mods: { defense: 2.2, speed: 0.9 },
  behavior: 'stoneskin',
  params: { physicalReduction: 0.45 },
  color: 0x9a9484,
});

affix({
  id: 'missile_dampening',
  name: 'Missile Dampening',
  desc: 'Projectiles slow to a crawl before they reach it.',
  minDepth: 8,
  weight: 6,
  mods: { defense: 1.2 },
  behavior: 'missile_dampening',
  params: { rangedReduction: 0.5 },
  color: 0x60a0d0,
  excludes: ['reflect_damage'],
});

// --- Elemental enchantments -------------------------------------------------

affix({
  id: 'fire_enchanted',
  name: 'Fire Enchanted',
  desc: 'Wreathed in flame; leaves burning ground and detonates on death.',
  minDepth: 2,
  weight: 11,
  mods: { damage: 1.15 },
  behavior: 'fire_enchanted',
  params: { auraRadius: 2.6, auraDps: 0.32, deathRadius: 4.5 },
  color: 0xff6a20,
  excludes: ['cold_enchanted', 'lightning_enchanted', 'poison_aura', 'arcane_enchanted'],
});

affix({
  id: 'cold_enchanted',
  name: 'Cold Enchanted',
  desc: 'Chills everything nearby and shatters into shards when killed.',
  minDepth: 2,
  weight: 11,
  mods: { damage: 1.1, life: 1.15 },
  behavior: 'cold_enchanted',
  params: { auraRadius: 3.0, auraDps: 0.22, shards: 10 },
  color: 0x88d8ff,
  excludes: ['fire_enchanted', 'lightning_enchanted', 'poison_aura', 'arcane_enchanted'],
});

affix({
  id: 'lightning_enchanted',
  name: 'Lightning Enchanted',
  desc: 'Discharges arcs of lightning when struck.',
  minDepth: 3,
  weight: 11,
  mods: { damage: 1.15, speed: 1.1 },
  behavior: 'lightning_enchanted',
  params: { arcs: 6, interval: 3.5 },
  color: 0xffe066,
  excludes: ['fire_enchanted', 'cold_enchanted', 'poison_aura', 'arcane_enchanted'],
});

affix({
  id: 'poison_aura',
  name: 'Pestilent',
  desc: 'Trails a cloud of spores that lingers where it walks.',
  minDepth: 3,
  weight: 10,
  mods: { life: 1.2 },
  behavior: 'poison_aura',
  params: { auraRadius: 3.2, auraDps: 0.28 },
  color: 0x8ee04a,
  excludes: ['fire_enchanted', 'cold_enchanted', 'lightning_enchanted', 'arcane_enchanted'],
});

affix({
  id: 'arcane_enchanted',
  name: 'Arcane Enchanted',
  desc: 'Sweeping beams of raw arcane rotate around it.',
  minDepth: 9,
  weight: 8,
  mods: { damage: 1.2 },
  behavior: 'arcane_enchanted',
  params: { beams: 2, sweepSpeed: 0.8, dps: 0.55 },
  color: 0xc060ff,
  excludes: ['fire_enchanted', 'cold_enchanted', 'lightning_enchanted', 'poison_aura'],
});

// --- Movement & control -----------------------------------------------------

affix({
  id: 'teleporter',
  name: 'Teleporter',
  desc: 'Blinks across the room the moment you gain distance.',
  minDepth: 4,
  weight: 9,
  mods: { speed: 1.05 },
  behavior: 'teleporter',
  params: { interval: 6, minRange: 7 },
  color: 0xa060ff,
  excludes: ['jailer'],
});

affix({
  id: 'phasing',
  name: 'Phasing',
  desc: 'Flickers out of reality; a fifth of your hits pass straight through.',
  minDepth: 10,
  weight: 6,
  mods: { life: 0.9 },
  behavior: 'phasing',
  params: { dodge: 0.22 },
  color: 0x9090ff,
  excludes: ['juggernaut'],
});

affix({
  id: 'waller',
  name: 'Waller',
  desc: 'Raises walls of stone to cut off your escape.',
  minDepth: 7,
  weight: 8,
  behavior: 'waller',
  params: { interval: 9, segments: 5, life: 8 },
  color: 0x8c8577,
  excludes: ['jailer'],
});

affix({
  id: 'jailer',
  name: 'Jailer',
  desc: 'Pins you in place with a cage of force.',
  minDepth: 8,
  weight: 8,
  behavior: 'jailer',
  params: { interval: 8, duration: 1.6 },
  color: 0xd8c060,
  excludes: ['waller', 'teleporter', 'vortex'],
});

affix({
  id: 'vortex',
  name: 'Vortex',
  desc: 'Yanks you into melee range without warning.',
  minDepth: 9,
  weight: 8,
  behavior: 'vortex',
  params: { interval: 7, range: 12 },
  color: 0x7040d0,
  excludes: ['knockback', 'jailer'],
});

affix({
  id: 'knockback',
  name: 'Knockback',
  desc: 'Every blow sends you flying.',
  minDepth: 3,
  weight: 9,
  mods: { damage: 1.1 },
  behavior: 'knockback',
  params: { force: 6 },
  color: 0xd0d0f0,
  excludes: ['vortex'],
});

affix({
  id: 'entangling',
  name: 'Entangling',
  desc: 'Its strikes leave you dragging your feet.',
  minDepth: 4,
  weight: 9,
  behavior: 'entangling',
  params: { slow: 0.35, duration: 2.5 },
  color: 0x70a040,
});

affix({
  id: 'gravity',
  name: 'Gravity Bound',
  desc: 'Drags you a step closer with every pulse.',
  minDepth: 12,
  weight: 6,
  behavior: 'gravity',
  params: { interval: 2.4, pull: 2.2, radius: 10 },
  color: 0x6040a0,
  excludes: ['knockback'],
});

affix({
  id: 'wormhole',
  name: 'Wormhole',
  desc: 'Swaps places with you when cornered.',
  minDepth: 14,
  weight: 5,
  behavior: 'wormhole',
  params: { interval: 11 },
  color: 0x40e0d0,
});

// --- Ground hazards ---------------------------------------------------------

affix({
  id: 'molten_trail',
  name: 'Molten',
  desc: 'Every step it takes catches fire behind it.',
  minDepth: 5,
  weight: 9,
  mods: { damage: 1.1 },
  behavior: 'molten_trail',
  params: { interval: 0.9, radius: 1.5, dps: 0.35, life: 4 },
  color: 0xff5010,
  excludes: ['frozen_ground'],
});

affix({
  id: 'frozen_ground',
  name: 'Frozen Ground',
  desc: 'The floor beneath it turns to treacherous rime.',
  minDepth: 6,
  weight: 8,
  behavior: 'frozen_ground',
  params: { interval: 1.2, radius: 1.8, slow: 0.4, life: 5 },
  color: 0x9ce0ff,
  excludes: ['molten_trail'],
});

affix({
  id: 'frozen_pulse',
  name: 'Frozen Pulse',
  desc: 'Fires slow, spiralling shards of ice on a beat.',
  minDepth: 7,
  weight: 8,
  behavior: 'frozen_pulse',
  params: { interval: 5, count: 5 },
  color: 0x66ccff,
});

affix({
  id: 'electrified',
  name: 'Electrified',
  desc: 'Sheds crawling bolts of lightning as it moves.',
  minDepth: 6,
  weight: 8,
  behavior: 'electrified',
  params: { interval: 2.6, bolts: 4 },
  color: 0xffee66,
});

affix({
  id: 'mortar',
  name: 'Mortar',
  desc: 'Lobs arcing shells at anything beyond melee reach.',
  minDepth: 8,
  weight: 8,
  behavior: 'mortar',
  params: { interval: 4.5, minRange: 6, radius: 2.6 },
  color: 0xff9040,
});

affix({
  id: 'arcane_sentry',
  name: 'Arcane Sentry',
  desc: 'Plants immobile turrets that keep firing after it dies.',
  minDepth: 10,
  weight: 7,
  behavior: 'arcane_sentry',
  params: { interval: 12, count: 1 },
  color: 0xc060ff,
});

affix({
  id: 'orbiter',
  name: 'Orbiting Wards',
  desc: 'Rings of burning wards circle it at melee range.',
  minDepth: 9,
  weight: 7,
  behavior: 'orbiter',
  params: { orbs: 3, radius: 2.4, spin: 1.6, dps: 0.45 },
  color: 0xff70e0,
});

// --- Defensive & sustain ----------------------------------------------------

affix({
  id: 'shielded',
  name: 'Shielded',
  desc: 'Periodically becomes immune — break off and wait it out.',
  minDepth: 6,
  weight: 9,
  behavior: 'shielded',
  params: { interval: 11, duration: 2.6 },
  color: 0x60c0ff,
  excludes: ['soul_bound'],
});

affix({
  id: 'thorns',
  name: 'Thorns',
  desc: 'Returns a slice of every melee blow to its owner.',
  minDepth: 3,
  weight: 9,
  mods: { defense: 1.2 },
  behavior: 'thorns',
  params: { ratio: 0.18 },
  color: 0xa0d060,
  excludes: ['reflect_damage'],
});

affix({
  id: 'reflect_damage',
  name: 'Reflects Damage',
  desc: 'Sends a share of all damage — including spells — back at you.',
  minDepth: 11,
  weight: 6,
  mods: { defense: 1.15 },
  behavior: 'reflect_damage',
  params: { ratio: 0.22 },
  color: 0xd0a0ff,
  excludes: ['thorns', 'missile_dampening'],
});

affix({
  id: 'life_leech',
  name: 'Life Leeching',
  desc: 'Drinks a third of the damage it deals.',
  minDepth: 5,
  weight: 9,
  mods: { damage: 1.1 },
  behavior: 'life_leech',
  params: { ratio: 0.34 },
  color: 0xc02040,
  excludes: ['vampiric'],
});

affix({
  id: 'vampiric',
  name: 'Vampiric',
  desc: 'Steadily drains life from you while you stand near it.',
  minDepth: 12,
  weight: 6,
  behavior: 'vampiric',
  params: { radius: 6, dps: 0.2, healRatio: 1.2 },
  color: 0x901030,
  excludes: ['life_leech'],
});

affix({
  id: 'regenerating',
  name: 'Fast Healing',
  desc: 'Knits itself back together between exchanges.',
  minDepth: 4,
  weight: 8,
  mods: { life: 1.2 },
  behavior: 'regenerating',
  params: { pctPerSecond: 0.035, delay: 3 },
  color: 0x60ff90,
});

affix({
  id: 'health_link',
  name: 'Health Link',
  desc: 'Shares damage with every linked pack member — kill the links first.',
  minDepth: 8,
  weight: 7,
  mods: { life: 1.15 },
  behavior: 'health_link',
  params: { radius: 14, share: 0.55 },
  color: 0xff60c0,
});

affix({
  id: 'soul_bound',
  name: 'Soul Bound',
  desc: 'Rises once at half strength before it truly dies.',
  minDepth: 13,
  weight: 5,
  behavior: 'soul_bound',
  params: { reviveFraction: 0.45 },
  color: 0xa0ff60,
  excludes: ['shielded'],
});

affix({
  id: 'blood_thirsty',
  name: 'Blood Thirsty',
  desc: 'Grows visibly stronger every time it lands a hit.',
  minDepth: 7,
  weight: 8,
  behavior: 'blood_thirsty',
  params: { perStack: 0.06, maxStacks: 10, duration: 8 },
  color: 0xff4060,
});

// --- Support & pack affixes -------------------------------------------------

affix({
  id: 'summoner',
  name: 'Summoner',
  desc: 'Keeps calling in fresh bodies until you cut it down.',
  minDepth: 7,
  weight: 8,
  behavior: 'summoner',
  params: { interval: 14, count: 2, cap: 6 },
  color: 0x60ff90,
});

affix({
  id: 'empowered',
  name: 'Empowering',
  desc: 'Every ally near it hits noticeably harder.',
  minDepth: 6,
  weight: 7,
  behavior: 'empowered',
  params: { radius: 10, damage: 1.3 },
  color: 0xffc040,
  excludes: ['hasted_pack'],
});

affix({
  id: 'hasted_pack',
  name: 'Frenzied Pack',
  desc: 'Drives its pack into a sprinting frenzy.',
  minDepth: 6,
  weight: 7,
  behavior: 'hasted_pack',
  params: { radius: 10, speed: 1.3, attackSpeed: 1.3 },
  color: 0x60ffe0,
  excludes: ['empowered'],
});

affix({
  id: 'avenger',
  name: 'Avenger',
  desc: 'Enrages permanently each time one of its pack falls.',
  minDepth: 9,
  weight: 7,
  behavior: 'avenger',
  params: { perDeath: 0.18, cap: 1.9 },
  color: 0xff8020,
});

affix({
  id: 'illusionist',
  name: 'Illusionist',
  desc: 'Splits into decoys the instant you commit to a swing.',
  minDepth: 10,
  weight: 6,
  behavior: 'illusionist',
  params: { interval: 13, count: 2 },
  color: 0x80c0ff,
});

affix({
  id: 'nightmarish',
  name: 'Nightmarish',
  desc: 'Its blows send you fleeing in terror.',
  minDepth: 9,
  weight: 6,
  behavior: 'nightmarish',
  params: { chance: 0.22, duration: 1.4 },
  color: 0x402050,
});

affix({
  id: 'plagued',
  name: 'Plagued',
  desc: 'Leaves festering pools behind and bursts when it dies.',
  minDepth: 5,
  weight: 9,
  behavior: 'plagued',
  params: { interval: 3.5, radius: 2.6, dps: 0.3, deathRadius: 4 },
  color: 0x99ff33,
});

affix({
  id: 'mana_burn',
  name: 'Mana Burn',
  desc: 'Drains your reserves with every strike.',
  minDepth: 8,
  weight: 7,
  behavior: 'mana_burn',
  params: { drain: 0.12 },
  color: 0x4060ff,
});

affix({
  id: 'unstable',
  name: 'Unstable',
  desc: 'Detonates violently the moment it drops.',
  minDepth: 4,
  weight: 9,
  behavior: 'unstable',
  params: { radius: 4.5, delay: 0.9, mul: 2.6 },
  color: 0xff7020,
  excludes: ['soul_bound'],
});

affix({
  id: 'chilling_death',
  name: 'Rimebound',
  desc: 'Explodes into a freezing nova on death.',
  minDepth: 7,
  weight: 8,
  behavior: 'chilling_death',
  params: { radius: 5, mul: 1.5 },
  color: 0xa8dcf0,
  excludes: ['unstable'],
});

affix({
  id: 'storm_death',
  name: 'Storm Charged',
  desc: 'Its death throws lightning across the room.',
  minDepth: 10,
  weight: 7,
  behavior: 'storm_death',
  params: { bolts: 8, mul: 1.3 },
  color: 0xffee66,
  excludes: ['unstable'],
});

// ---------------------------------------------------------------------------

export const MONSTER_AFFIXES: MonsterAffixDef[] = ALL;

const BY_ID = new Map<string, MonsterAffixDef>();
for (const a of ALL) BY_ID.set(a.id, a);

export function getAffix(id: string): MonsterAffixDef | undefined {
  return BY_ID.get(id);
}

/**
 * Rolls a legal affix set for a pack. `count` is the number wanted; exclusions
 * and depth gating can return fewer.
 */
export function rollAffixes(
  depth: number,
  count: number,
  rng: { weighted<T>(a: readonly T[], w: (t: T) => number): T; next(): number },
): MonsterAffixDef[] {
  const chosen: MonsterAffixDef[] = [];
  const banned = new Set<string>();
  for (let i = 0; i < count; i++) {
    const pool = ALL.filter(
      (a) => a.minDepth <= depth && !banned.has(a.id) && !chosen.some((c) => c.id === a.id),
    );
    if (!pool.length) break;
    const pick = rng.weighted(pool, (a) => a.weight);
    chosen.push(pick);
    banned.add(pick.id);
    for (const ex of pick.excludes ?? []) banned.add(ex);
  }
  return chosen;
}

/** How many affixes a rank carries. */
export function affixCountForRank(rank: string): number {
  switch (rank) {
    case 'champion':
      return 1;
    case 'elite':
      return 2;
    case 'rare':
      return 3;
    case 'boss':
      return 0;
    default:
      return 0;
  }
}
