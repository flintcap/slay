/**
 * SLAY — endless depth scaling.
 *
 * There is no last floor. Depth 1 is a tutorial; depth 60 is what a well-built
 * level 90 character is supposed to be fighting; depth 100 is a wall; depth 200
 * exists and is finite in arithmetic but not in practice.
 *
 * How the curves stay sane:
 *
 *  - Monster life compounds per depth at a rate that DECAYS with depth, from
 *    ~16% early to an asymptote of ~4.5%. That gives a steep early ramp (so
 *    depth 20 is meaningfully harder than depth 10) and a long tail that never
 *    overflows: at depth 200 a normal monster has roughly 2.6e7 life, which is
 *    a large number but nowhere near the limits of a double.
 *  - Monster DAMAGE uses a slower exponent AND passes through a soft cap tied
 *    to the life a player of the appropriate level is expected to have. A hit
 *    approaches, but never reaches, a fixed fraction of your health bar, so
 *    depth 150 kills you in four hits rather than one.
 *  - Player power over the same span comes from item level, magic find and
 *    affix tiers, which the reward curve at the bottom of this file scales in
 *    the same shape. Progress is possible; it is just never free.
 */

import type { MonsterRank, StatKey, Rng } from '../types';

// ---------------------------------------------------------------------------
// Baselines
// ---------------------------------------------------------------------------

/** A depth-1 normal monster. Everything else is a multiple of these. */
export const MONSTER_BASE_LIFE = 42;
export const MONSTER_BASE_DAMAGE = 6;
export const MONSTER_BASE_DEFENSE = 14;

/** Depth past which monster levels grow slowly — power comes from multipliers. */
const LEVEL_SOFT_DEPTH = 60;
export const MAX_MONSTER_LEVEL = 120;

/**
 * Monster level for a depth. Depth 60 lines up with the level cap so a maxed
 * character fights "fair" fights there; past that levels creep and multipliers
 * take over.
 */
export function monsterLevelForDepth(depth: number): number {
  const d = Math.max(1, Math.floor(depth));
  if (d <= LEVEL_SOFT_DEPTH) return Math.max(1, Math.round(d * 1.5));
  return Math.min(MAX_MONSTER_LEVEL, Math.round(90 + (d - LEVEL_SOFT_DEPTH) * 0.5));
}

/**
 * Per-depth compounding rate. Starts at 1.16, decays toward 1.045.
 * This single function is the shape of the entire difficulty curve.
 */
export function depthRate(depth: number): number {
  return 1.045 + 0.115 * Math.exp(-(Math.max(1, depth) - 1) / 50);
}

const lifeTable: number[] = [1, 1];
function ensureTable(depth: number): void {
  for (let d = lifeTable.length; d <= depth + 1; d++) {
    lifeTable[d] = (lifeTable[d - 1] ?? 1) * depthRate(d - 1);
  }
}

/** Cumulative life multiplier at a depth. 1.0 at depth 1. */
export function lifeScale(depth: number): number {
  const d = Math.max(1, Math.min(2000, Math.floor(depth)));
  ensureTable(d);
  return lifeTable[d] ?? 1;
}

/** Defense scales far more slowly than life so hit chance stays readable. */
export function defenseScale(depth: number): number {
  return Math.pow(lifeScale(depth), 0.45);
}

/** Raw damage scaling before the soft cap. */
export function rawDamageScale(depth: number): number {
  return Math.pow(lifeScale(depth), 0.62);
}

// ---------------------------------------------------------------------------
// The anti-one-shot curve
// ---------------------------------------------------------------------------

/**
 * Life a competently geared character is expected to have at a level. Used only
 * as the reference for the damage soft cap — it is a design assumption, not a
 * measurement of the actual player.
 */
export function expectedPlayerLife(level: number): number {
  return 120 * Math.pow(1.045, Math.max(1, level) - 1);
}

/** Asymptotic soft cap: `raw` when small, never exceeding `cap`. */
export function softCap(raw: number, cap: number): number {
  if (cap <= 0) return 0;
  return cap * (1 - Math.exp(-raw / cap));
}

/** Largest fraction of expected life a single hit of each rank may reach. */
const HIT_FRACTION: Record<MonsterRank, number> = {
  normal: 0.2,
  champion: 0.28,
  elite: 0.34,
  rare: 0.38,
  boss: 0.48,
};

/** Multipliers applied on top of the depth curve for each monster rank. */
export const RANK_MULTIPLIERS: Record<MonsterRank, { life: number; damage: number; defense: number }> = {
  normal: { life: 1, damage: 1, defense: 1 },
  champion: { life: 3, damage: 1.35, defense: 1.2 },
  elite: { life: 6, damage: 1.7, defense: 1.5 },
  rare: { life: 9.5, damage: 1.95, defense: 1.7 },
  boss: { life: 34, damage: 2.4, defense: 2 },
};

export interface MonsterScaling {
  level: number;
  life: number;
  damage: number;
  defense: number;
  /** Per-second experience-independent value used by the drop layer. */
  ilvl: number;
}

/**
 * The numbers a monster of `rank` at `depth` should have, before its own
 * per-definition `lifeMul` / `damageMul` / `defenseMul` are applied.
 */
export function monsterScaling(depth: number, rank: MonsterRank = 'normal'): MonsterScaling {
  const mul = RANK_MULTIPLIERS[rank] ?? RANK_MULTIPLIERS.normal;
  const level = monsterLevelForDepth(depth);
  const life = MONSTER_BASE_LIFE * lifeScale(depth) * mul.life;
  const rawDamage = MONSTER_BASE_DAMAGE * rawDamageScale(depth) * mul.damage;
  const cap = expectedPlayerLife(level) * (HIT_FRACTION[rank] ?? 0.2);
  return {
    level,
    life: Math.round(life),
    damage: Math.max(1, Math.round(softCap(rawDamage, cap))),
    defense: Math.round(MONSTER_BASE_DEFENSE * defenseScale(depth) * mul.defense),
    ilvl: itemLevelForDepth(depth),
  };
}

// ---------------------------------------------------------------------------
// Pack composition
// ---------------------------------------------------------------------------

/** Chance that any given pack is led by a champion/elite/rare. */
export function elitePackChance(depth: number): number {
  return Math.min(0.55, 0.06 + depth * 0.0065);
}

/** Chance an elite pack is upgraded to rare (more affixes, better loot). */
export function rarePackChance(depth: number): number {
  return Math.min(0.4, 0.02 + depth * 0.004);
}

/** Number of champions escorting an elite. */
export function championCount(depth: number, rng: Rng): number {
  const base = 2 + Math.floor(depth / 25);
  return rng.int(base, base + 2);
}

/** Affixes rolled onto an elite or rare pack. */
export function affixCount(depth: number, rank: MonsterRank): number {
  const base = 1 + Math.floor(depth / 14);
  const rankBonus = rank === 'rare' ? 2 : rank === 'elite' ? 1 : 0;
  return Math.max(1, Math.min(6, base + rankBonus));
}

/** Baseline monster count for a level, before run modifiers. */
export function monsterBudget(depth: number, roomCount: number): number {
  const perRoom = 3 + Math.min(6, depth * 0.06);
  return Math.round(roomCount * perRoom);
}

/** How many levels a run of this depth contains before the boss floor. */
export function levelsForDepth(depth: number): number {
  return Math.max(2, Math.min(6, 2 + Math.floor(depth / 12)));
}

// ---------------------------------------------------------------------------
// Reward curve
// ---------------------------------------------------------------------------

/** Item level of drops at a depth — feeds affix tier gating. */
export function itemLevelForDepth(depth: number): number {
  const d = Math.max(1, Math.floor(depth));
  if (d <= LEVEL_SOFT_DEPTH) return Math.max(1, Math.round(d * 1.6));
  return Math.min(150, Math.round(96 + (d - LEVEL_SOFT_DEPTH) * 0.65));
}

/** Global XP premium for depth, on top of the monster-level curve. */
export function xpMultiplier(depth: number): number {
  const d = Math.max(1, depth);
  if (d <= LEVEL_SOFT_DEPTH) return 1 + d * 0.03;
  return 1 + LEVEL_SOFT_DEPTH * 0.03 + (d - LEVEL_SOFT_DEPTH) * 0.05;
}

export function goldMultiplier(depth: number): number {
  return 1 + Math.pow(Math.max(1, depth), 1.18) * 0.06;
}

/** Implicit magic find granted by depth — deep runs are the only way to mythics. */
export function depthMagicFind(depth: number): number {
  return Math.min(400, Math.pow(Math.max(0, depth - 1), 1.12) * 2.2);
}

/** Extra drops per kill at depth, as a multiplier on the drop count. */
export function dropRateMultiplier(depth: number): number {
  return 1 + Math.min(2.5, depth * 0.012);
}

/** Everything the reward layer needs for a depth, in one call. */
export function depthRewards(depth: number): {
  ilvl: number;
  xpMul: number;
  goldMul: number;
  magicFind: number;
  dropMul: number;
} {
  return {
    ilvl: itemLevelForDepth(depth),
    xpMul: xpMultiplier(depth),
    goldMul: goldMultiplier(depth),
    magicFind: depthMagicFind(depth),
    dropMul: dropRateMultiplier(depth),
  };
}

// ---------------------------------------------------------------------------
// Run modifiers
// ---------------------------------------------------------------------------

export interface RunModifierDef {
  id: string;
  name: string;
  desc: string;
  minDepth: number;
  weight: number;
  /** Multipliers applied to every monster on the run. */
  monster?: Partial<Record<'life' | 'damage' | 'defense' | 'speed' | 'attackSpeed' | 'count', number>>;
  /** Flat stat deltas applied to the player for the duration of the run. */
  player?: Partial<Record<StatKey, number>>;
  /** Behaviour hook resolved by the combat layer. */
  behavior?: string;
  params?: Record<string, number>;
  /** Reward multiplier contributed by this modifier. */
  reward: number;
  color: number;
  icon: string;
  excludes?: string[];
}

const M = (
  id: string,
  name: string,
  desc: string,
  o: Partial<RunModifierDef> & { reward: number; color: number; icon: string },
): RunModifierDef => ({
  id,
  name,
  desc,
  minDepth: o.minDepth ?? 1,
  weight: o.weight ?? 10,
  monster: o.monster,
  player: o.player,
  behavior: o.behavior,
  params: o.params,
  reward: o.reward,
  color: o.color,
  icon: o.icon,
  excludes: o.excludes,
});

export const RUN_MODIFIERS: RunModifierDef[] = [
  M('vengeful', 'Vengeful', 'Enemies explode for 25% of their maximum life when they die.', {
    minDepth: 3,
    behavior: 'deathExplode',
    params: { pct: 25, radius: 4 },
    reward: 1.12,
    color: 0xff5a33,
    icon: 'burst',
  }),
  M('frozen', 'Frozen', 'A chilling aura slows everything. Enemies are immune to cold.', {
    minDepth: 5,
    behavior: 'chillAura',
    params: { slow: 25, radius: 999 },
    player: { coldResist: -15 },
    reward: 1.1,
    color: 0x7fd8ff,
    icon: 'snowflake',
    excludes: ['molten'],
  }),
  M('cursed', 'Cursed', '-30% to all of your resistances.', {
    minDepth: 4,
    player: {
      fireResist: -30,
      coldResist: -30,
      lightningResist: -30,
      poisonResist: -30,
      arcaneResist: -30,
    },
    reward: 1.2,
    color: 0x6c3fa0,
    icon: 'hex',
  }),
  M('swarming', 'Swarming', '+100% monster count, -40% monster life.', {
    minDepth: 2,
    monster: { count: 2, life: 0.6 },
    reward: 1.15,
    color: 0x8fd44a,
    icon: 'swarm',
    excludes: ['titanic', 'sparse'],
  }),
  M('titanic', 'Titanic', '-50% monster count, +180% monster life and +40% damage.', {
    minDepth: 8,
    monster: { count: 0.5, life: 2.8, damage: 1.4 },
    reward: 1.18,
    color: 0xc98f3a,
    icon: 'giant',
    excludes: ['swarming'],
  }),
  M('ironclad', 'Ironclad', '+120% monster defense and +25% physical resistance.', {
    minDepth: 6,
    monster: { defense: 2.2 },
    behavior: 'resistPhysical',
    params: { pct: 25 },
    reward: 1.12,
    color: 0x9a9284,
    icon: 'plate',
  }),
  M('feral', 'Feral', '+35% monster movement and attack speed.', {
    minDepth: 4,
    monster: { speed: 1.35, attackSpeed: 1.35 },
    reward: 1.14,
    color: 0xb52020,
    icon: 'claw',
  }),
  M('volatile', 'Volatile', 'Every tenth monster killed leaves an unstable core that detonates after 2 seconds.',
    {
      minDepth: 10,
      behavior: 'volatileCore',
      params: { every: 10, delay: 2, radius: 5, pct: 60 },
      reward: 1.15,
      color: 0xff9a3c,
      icon: 'core',
    }),
  M('leeching', 'Leeching', 'Enemies heal for 20% of the damage they deal.', {
    minDepth: 12,
    behavior: 'monsterLeech',
    params: { pct: 20 },
    reward: 1.16,
    color: 0xa02040,
    icon: 'siphon',
  }),
  M('reflective', 'Reflective', 'Enemies return 12% of damage taken to melee attackers.', {
    minDepth: 15,
    behavior: 'monsterThorns',
    params: { pct: 12 },
    reward: 1.18,
    color: 0x88a03a,
    icon: 'spike',
  }),
  M('draining', 'Draining', 'Your mana regeneration is halved and enemies burn 4 mana per hit.', {
    minDepth: 9,
    player: { manaRegen: -50 },
    behavior: 'manaBurn',
    params: { perHit: 4 },
    reward: 1.14,
    color: 0x4f7ad6,
    icon: 'drain',
  }),
  M('blinding', 'Blinding', 'Torchlight is smothered. Your sight radius is halved.', {
    minDepth: 5,
    behavior: 'lightRadius',
    params: { pct: -50 },
    reward: 1.1,
    color: 0x241a2e,
    icon: 'shroud',
  }),
  M('haunted', 'Haunted', 'Wraiths spawn continuously and cannot be permanently killed.', {
    minDepth: 18,
    behavior: 'spawnWraiths',
    params: { interval: 22, count: 2 },
    reward: 1.22,
    color: 0x8ce0c8,
    icon: 'ghost',
  }),
  M('molten', 'Molten', 'The floor runs with fire. Standing still burns you.', {
    minDepth: 11,
    behavior: 'moltenFloor',
    params: { dps: 4, grace: 1.5 },
    player: { fireResist: -15 },
    reward: 1.16,
    color: 0xff6a1e,
    icon: 'lava',
    excludes: ['frozen'],
  }),
  M('static', 'Static', 'Lightning arcs between enemies, sharing 30% of the damage they take.', {
    minDepth: 14,
    behavior: 'monsterShareDamage',
    params: { pct: 30, radius: 6 },
    reward: 0.95,
    color: 0x9fd0ff,
    icon: 'arc',
  }),
  M('toxic', 'Toxic', 'Enemies leave poison pools where they die.', {
    minDepth: 7,
    behavior: 'deathPool',
    params: { duration: 8, radius: 3, dps: 8 },
    reward: 1.12,
    color: 0x6fbf2a,
    icon: 'miasma',
  }),
  M('fragile', 'Fragile', 'You take 25% more damage but deal 25% more.', {
    minDepth: 10,
    player: { damageReduction: 0, enhancedDamage: 25 },
    behavior: 'playerDamageTaken',
    params: { pct: 25 },
    reward: 1.2,
    color: 0xff8080,
    icon: 'crack',
  }),
  M('enraged', 'Enraged', 'Every enemy below 30% life gains +60% damage and +25% attack speed.', {
    minDepth: 13,
    behavior: 'lowLifeEnrage',
    params: { threshold: 30, damage: 60, attackSpeed: 25 },
    reward: 1.15,
    color: 0xff2d2d,
    icon: 'rage',
  }),
  M('warded', 'Warded', 'Enemies spawn with a shield equal to 20% of their life that regenerates out of combat.',
    {
      minDepth: 16,
      behavior: 'monsterShield',
      params: { pct: 20, regenDelay: 4 },
      reward: 1.14,
      color: 0x6fd0ff,
      icon: 'bubble',
    }),
  M('hunted', 'Hunted', 'A stalker follows you through the whole run. It cannot be outrun.', {
    minDepth: 20,
    behavior: 'stalker',
    params: { speed: 1.1, respawn: 45 },
    reward: 1.25,
    color: 0x4a3a55,
    icon: 'eye',
  }),
  M('starving', 'Starving', 'Potions restore half as much and healing effects are 30% weaker.', {
    minDepth: 12,
    behavior: 'healingReduced',
    params: { pct: 50, effects: 30 },
    reward: 1.18,
    color: 0x8d7f6a,
    icon: 'empty-flask',
  }),
  M('unstableGround', 'Unstable Ground', 'Sections of floor collapse without warning.', {
    minDepth: 17,
    behavior: 'collapsingFloor',
    params: { interval: 12, radius: 3, damagePct: 15 },
    reward: 1.16,
    color: 0x9c5a2a,
    icon: 'fissure',
  }),
  M('thinAir', 'Thin Air', 'Cooldowns are 30% longer.', {
    minDepth: 15,
    player: { cooldownReduction: -30 },
    reward: 1.18,
    color: 0xb0d0ff,
    icon: 'hourglass',
  }),
  M('bloodthirsty', 'Bloodthirsty', 'Enemies gain a permanent stacking +4% damage each time they hit you.', {
    minDepth: 19,
    behavior: 'monsterRamp',
    params: { pct: 4, cap: 200 },
    reward: 1.2,
    color: 0xc42b3a,
    icon: 'chalice',
  }),
  M('nimble', 'Nimble', 'Enemies dodge 20% of attacks outright.', {
    minDepth: 21,
    behavior: 'monsterDodge',
    params: { pct: 20 },
    reward: 1.18,
    color: 0xa8ffd0,
    icon: 'feather',
  }),
  M('legion', 'Legion', 'Every pack is an elite pack.', {
    minDepth: 24,
    behavior: 'allElite',
    reward: 1.35,
    color: 0xc060ff,
    icon: 'legion',
  }),
  M('wailing', 'Wailing', 'Periodic screams fear you for 2 seconds unless you keep moving.', {
    minDepth: 22,
    behavior: 'periodicFear',
    params: { interval: 25, duration: 2 },
    reward: 1.15,
    color: 0x9a67c9,
    icon: 'skull',
  }),
  M('petrifying', 'Petrifying', "The boss's gaze petrifies. Elite attacks have a 10% chance to petrify for 2s.", {
    minDepth: 26,
    behavior: 'petrifyOnHit',
    params: { chance: 10, duration: 2 },
    reward: 1.2,
    color: 0x9a9284,
    icon: 'stone',
  }),
  M('greedy', 'Greedy', 'Monsters carry 150% more gold but drop 30% fewer items.', {
    minDepth: 5,
    behavior: 'goldOverItems',
    params: { gold: 150, items: -30 },
    reward: 1.05,
    color: 0xf5d76e,
    icon: 'coin',
    excludes: ['generous'],
  }),
  M('generous', 'Generous', '+40% item drops, -60% gold.', {
    minDepth: 5,
    behavior: 'itemsOverGold',
    params: { items: 40, gold: -60 },
    reward: 1.05,
    color: 0x33d64a,
    icon: 'chest',
    excludes: ['greedy'],
  }),
  M('echoing', 'Echoing', 'Enemy abilities fire twice, the second at half power.', {
    minDepth: 28,
    behavior: 'monsterEcho',
    params: { pct: 50 },
    reward: 1.22,
    color: 0x6fa8ff,
    icon: 'echo',
  }),
  M('timeless', 'Timeless', 'After 8 minutes on a floor, every enemy becomes permanently Enraged.', {
    minDepth: 25,
    behavior: 'softEnrage',
    params: { seconds: 480 },
    reward: 1.18,
    color: 0xffe066,
    icon: 'clock',
  }),
  M('ravenous', 'Ravenous', 'Enemies that kill you gain your gear. (They keep it.)', {
    minDepth: 30,
    behavior: 'lootStealing',
    params: { chance: 100 },
    reward: 1.3,
    color: 0x8e0f0f,
    icon: 'maw',
  }),
  M('nullZone', 'Null Zone', 'Randomly placed fields suppress all of your skills while you stand in them.', {
    minDepth: 27,
    behavior: 'nullFields',
    params: { count: 6, radius: 5 },
    reward: 1.24,
    color: 0x2a0f3d,
    icon: 'void',
  }),
  M('gravebound', 'Gravebound', 'Everything you kill rises once, at 40% strength.', {
    minDepth: 23,
    behavior: 'reanimate',
    params: { pct: 40, chance: 100 },
    reward: 1.26,
    color: 0x4a3a55,
    icon: 'grave',
  }),
  M('empowered', 'Empowered', 'Elites roll one extra affix and grant 50% more experience.', {
    minDepth: 18,
    behavior: 'extraAffix',
    params: { affixes: 1, xp: 50 },
    reward: 1.16,
    color: 0xb8874a,
    icon: 'crown',
  }),
  M('sparse', 'Sparse', '-35% monster count, but every one of them is a champion.', {
    minDepth: 14,
    monster: { count: 0.65 },
    behavior: 'allChampion',
    reward: 1.2,
    color: 0xd0a0ff,
    icon: 'sparse',
    excludes: ['swarming'],
  }),
  M('suffocating', 'Suffocating', 'Life regeneration does not function.', {
    minDepth: 20,
    player: { lifeRegen: -1000 },
    reward: 1.16,
    color: 0x3a3f55,
    icon: 'lungs',
  }),
  M('mirrored', 'Mirrored', 'Elites split into two half-life copies the first time they drop below 50%.', {
    minDepth: 29,
    behavior: 'eliteSplit',
    params: { threshold: 50, copies: 1 },
    reward: 1.22,
    color: 0xc678dd,
    icon: 'mirror',
  }),
  M('deepDark', 'The Deep Dark', 'Depth scaling for this run is calculated as if it were 10 floors deeper.', {
    minDepth: 35,
    behavior: 'depthOffset',
    params: { depth: 10 },
    reward: 1.4,
    color: 0x0f0a14,
    icon: 'abyss',
  }),
];

export const RUN_MODIFIER_BY_ID: Record<string, RunModifierDef> = Object.create(null);
for (const m of RUN_MODIFIERS) RUN_MODIFIER_BY_ID[m.id] = m;

export function getRunModifier(id: string): RunModifierDef | undefined {
  return RUN_MODIFIER_BY_ID[id];
}

/** How many modifiers a run at this depth carries. */
export function modifierCountForDepth(depth: number): number {
  if (depth < 5) return 0;
  return Math.min(6, 1 + Math.floor((depth - 5) / 16));
}

/** Rolls the modifier set for a run, respecting depth gates and exclusions. */
export function rollRunModifiers(depth: number, rng: Rng, count?: number): string[] {
  const want = count ?? modifierCountForDepth(depth);
  if (want <= 0) return [];
  const pool = RUN_MODIFIERS.filter((m) => m.minDepth <= depth);
  if (pool.length === 0) return [];

  const chosen: RunModifierDef[] = [];
  const blocked = new Set<string>();
  for (let i = 0; i < want && chosen.length < pool.length; i++) {
    const candidates = pool.filter(
      (m) => !blocked.has(m.id) && !chosen.some((c) => c.id === m.id),
    );
    if (candidates.length === 0) break;
    const pick = rng.weighted(candidates, (m) => m.weight);
    chosen.push(pick);
    blocked.add(pick.id);
    for (const ex of pick.excludes ?? []) blocked.add(ex);
  }
  return chosen.map((m) => m.id);
}

/** Combined reward multiplier from a run's modifier list. */
export function runRewardMultiplier(modifierIds: readonly string[]): number {
  let mul = 1;
  for (const id of modifierIds) mul *= RUN_MODIFIER_BY_ID[id]?.reward ?? 1;
  return mul;
}

/** Combined monster multipliers from a run's modifier list. */
export function runMonsterMultipliers(modifierIds: readonly string[]): {
  life: number;
  damage: number;
  defense: number;
  speed: number;
  attackSpeed: number;
  count: number;
} {
  const out = { life: 1, damage: 1, defense: 1, speed: 1, attackSpeed: 1, count: 1 };
  for (const id of modifierIds) {
    const m = RUN_MODIFIER_BY_ID[id]?.monster;
    if (!m) continue;
    out.life *= m.life ?? 1;
    out.damage *= m.damage ?? 1;
    out.defense *= m.defense ?? 1;
    out.speed *= m.speed ?? 1;
    out.attackSpeed *= m.attackSpeed ?? 1;
    out.count *= m.count ?? 1;
  }
  return out;
}

/** Flat stat deltas a run's modifiers impose on the player. */
export function runPlayerMods(modifierIds: readonly string[]): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = {};
  for (const id of modifierIds) {
    const p = RUN_MODIFIER_BY_ID[id]?.player;
    if (!p) continue;
    for (const key of Object.keys(p) as StatKey[]) {
      out[key] = (out[key] ?? 0) + (p[key] ?? 0);
    }
  }
  return out;
}

/** Behaviour hooks the combat layer must install for a run. */
export function runBehaviors(modifierIds: readonly string[]): Array<{ id: string; params: Record<string, number> }> {
  const out: Array<{ id: string; params: Record<string, number> }> = [];
  for (const id of modifierIds) {
    const m = RUN_MODIFIER_BY_ID[id];
    if (m?.behavior) out.push({ id: m.behavior, params: m.params ?? {} });
  }
  return out;
}

/**
 * Effective depth after modifiers that shift the scaling window
 * (currently only "The Deep Dark").
 */
export function effectiveDepth(depth: number, modifierIds: readonly string[]): number {
  let d = depth;
  for (const id of modifierIds) {
    const m = RUN_MODIFIER_BY_ID[id];
    if (m?.behavior === 'depthOffset') d += m.params?.depth ?? 0;
  }
  return d;
}

/** One-line summary for the depth-select screen. */
export function describeDepth(depth: number): string {
  const s = monsterScaling(depth, 'normal');
  const r = depthRewards(depth);
  return (
    `Depth ${depth} — monster level ${s.level}, ~${s.life} life, ~${s.damage} per hit. ` +
    `Item level ${r.ilvl}, +${Math.round(r.magicFind)}% magic find.`
  );
}
