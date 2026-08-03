/**
 * SLAY — the stat sheet.
 *
 * `computeStats` is the hot path: it runs whenever gear, skills, level or
 * statuses change, and everything else in the game reads its output. The order
 * of operations is deliberate and is the whole reason this file exists:
 *
 *   1. Attribute layer   class base + level + player-allocated + gear/status
 *                        attribute grants (attributes are themselves stats, so
 *                        "+15 strength" on a ring feeds every strength effect).
 *   2. Flat layer        every additive number from gear, set bonuses, skill
 *                        passives and active statuses, summed into one pool.
 *   3. Derivation        attributes become life, mana, attack rating, crit and
 *                        the strength damage bonus.
 *   4. Percentage layer  percentages are ADDITIVE inside a source pool (all
 *                        gear enhanced-defense adds together) and MULTIPLICATIVE
 *                        across pools (gear x skills x statuses). This is what
 *                        stops three 100% buffs from being a 4x and keeps late
 *                        game scaling smooth instead of explosive.
 *
 * `enhancedDamage` is left as a combined percentage rather than being folded
 * into min/max damage, because `Combat.rollDamage` owns the damage roll and
 * would otherwise double-apply it. `enhancedDefense` IS folded into `defense`,
 * because `mitigate` and `hitChance` read `defense` directly.
 */

import type { Character, EquipSlot, Item, StatKey, Stats } from '../types';
import { BASE_LIFE, BASE_MANA, getClass } from '../data/classes';
import { HARD_SKILL_RANK_CAP, SKILL_BY_ID } from '../data/skills';
import { passiveEffects } from './Passives';
import { peekStatuses } from './Status';
import { itemStats } from './Loot';

export const MAX_LEVEL = 99;

/** Every key in `Stats`, in a stable order — used for iteration and UI. */
export const STAT_KEYS: readonly StatKey[] = [
  'strength',
  'dexterity',
  'vitality',
  'energy',
  'life',
  'mana',
  'lifeRegen',
  'manaRegen',
  'attackRating',
  'minDamage',
  'maxDamage',
  'attackSpeed',
  'castSpeed',
  'critChance',
  'critDamage',
  'lifeSteal',
  'manaSteal',
  'defense',
  'blockChance',
  'damageReduction',
  'physicalResist',
  'fireResist',
  'coldResist',
  'lightningResist',
  'poisonResist',
  'arcaneResist',
  'fireDamage',
  'coldDamage',
  'lightningDamage',
  'poisonDamage',
  'arcaneDamage',
  'enhancedDamage',
  'enhancedDefense',
  'elementalDamagePct',
  'areaDamagePct',
  'moveSpeed',
  'magicFind',
  'goldFind',
  'cooldownReduction',
  'skillLevels',
];

/** Attribute derivation constants, shared with the UI so tooltips can explain them. */
export const DERIVE = {
  /** Enhanced damage percent per point of strength. */
  strDamagePct: 0.5,
  /** Attack rating per point of dexterity. */
  dexAttackRating: 5,
  /** Critical chance percent per point of dexterity. */
  dexCritChance: 0.02,
  /** Defense per point of dexterity (agility as armour). */
  dexDefense: 0.25,
  /** Mana regeneration per point of energy. */
  enrManaRegen: 0.05,
  /** Base attack rating everyone has. */
  baseAttackRating: 20,
  /** Base unarmed damage. */
  baseMinDamage: 1,
  baseMaxDamage: 3,
  /** Base critical damage multiplier, in percent (150 = 1.5x). */
  baseCritDamage: 150,
  /** Base life regeneration per second. */
  baseLifeRegen: 0.5,
  baseManaRegen: 1.5,
} as const;

// ---------------------------------------------------------------------------
// Construction helpers
// ---------------------------------------------------------------------------

export function emptyStats(): Stats {
  return {
    strength: 0,
    dexterity: 0,
    vitality: 0,
    energy: 0,
    life: 0,
    mana: 0,
    lifeRegen: 0,
    manaRegen: 0,
    attackRating: 0,
    minDamage: 0,
    maxDamage: 0,
    attackSpeed: 0,
    castSpeed: 0,
    critChance: 0,
    critDamage: 0,
    lifeSteal: 0,
    manaSteal: 0,
    defense: 0,
    blockChance: 0,
    damageReduction: 0,
    physicalResist: 0,
    fireResist: 0,
    coldResist: 0,
    lightningResist: 0,
    poisonResist: 0,
    arcaneResist: 0,
    fireDamage: 0,
    coldDamage: 0,
    lightningDamage: 0,
    poisonDamage: 0,
    arcaneDamage: 0,
    enhancedDamage: 0,
    enhancedDefense: 0,
    elementalDamagePct: 0,
    areaDamagePct: 0,
    moveSpeed: 0,
    magicFind: 0,
    goldFind: 0,
    cooldownReduction: 0,
    skillLevels: 0,
  };
}

/** Adds `from` into `into` in place and returns it. */
export function addStats(into: Stats, from: Partial<Stats>): Stats {
  for (const key of STAT_KEYS) {
    const v = from[key];
    if (v) into[key] += v;
  }
  return into;
}

export function cloneStats(s: Stats): Stats {
  return { ...s };
}

/** Difference `b - a`, for the item comparison tooltip. */
export function diffStats(a: Stats, b: Stats): Partial<Stats> {
  const out: Partial<Stats> = {};
  for (const key of STAT_KEYS) {
    const d = b[key] - a[key];
    if (Math.abs(d) > 0.0001) out[key] = d;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Experience curve
// ---------------------------------------------------------------------------

/**
 * XP to advance FROM `level` to `level + 1`.
 *
 * `50 * L^2 * 1.06^L` — quadratic early so the first ten levels fall in a
 * couple of dungeon floors, exponential late so 90-99 is a real commitment
 * (roughly two thirds of the total curve lives above level 80, D2-style).
 */
export function xpForLevel(level: number): number {
  if (level < 1) return 0;
  if (level >= MAX_LEVEL) return Infinity;
  return Math.floor(50 * level * level * Math.pow(1.06, level));
}

const CUMULATIVE: number[] = (() => {
  const table = new Array<number>(MAX_LEVEL + 2).fill(0);
  let sum = 0;
  for (let l = 1; l < MAX_LEVEL; l++) {
    sum += xpForLevel(l);
    table[l + 1] = sum;
  }
  table[MAX_LEVEL + 1] = sum;
  return table;
})();

/** Total accumulated XP required to BE `level`. Level 1 is 0. */
export function totalXpForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level > MAX_LEVEL) return CUMULATIVE[MAX_LEVEL] ?? 0;
  return CUMULATIVE[level] ?? 0;
}

/** The level a raw total XP value corresponds to. */
export function levelForXp(totalXp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && totalXp >= totalXpForLevel(level + 1)) level++;
  return level;
}

/** Progress toward the next level, 0..1. */
export function levelProgress(level: number, xp: number): number {
  if (level >= MAX_LEVEL) return 1;
  const need = xpForLevel(level);
  if (!isFinite(need) || need <= 0) return 1;
  return Math.max(0, Math.min(1, xp / need));
}

// ---------------------------------------------------------------------------
// Gear
// ---------------------------------------------------------------------------

const EQUIP_SLOTS: readonly EquipSlot[] = [
  'mainHand',
  'offHand',
  'helm',
  'chest',
  'gloves',
  'boots',
  'belt',
  'amulet',
  'ring1',
  'ring2',
];

/**
 * Set bonuses. ITEMS owns the concrete set definitions; this is the generic
 * curve applied to any `setId` the player has multiple pieces of, so a set is
 * always worth completing even before its bespoke bonus exists.
 */
export function setBonusStats(equipment: Partial<Record<EquipSlot, Item>>): Partial<Stats> {
  const counts = new Map<string, number>();
  let maxIlvl = 1;
  for (const slot of EQUIP_SLOTS) {
    const item = equipment[slot];
    if (!item?.setId) continue;
    counts.set(item.setId, (counts.get(item.setId) ?? 0) + 1);
    if (item.ilvl > maxIlvl) maxIlvl = item.ilvl;
  }
  if (counts.size === 0) return {};

  const out: Partial<Stats> = {};
  const scale = 1 + maxIlvl / 40;
  for (const [, n] of counts) {
    if (n < 2) continue;
    // Each piece past the first is worth more than the last.
    const steps = n - 1;
    const power = (steps * (steps + 1)) / 2;
    out.strength = (out.strength ?? 0) + Math.round(3 * power * scale);
    out.dexterity = (out.dexterity ?? 0) + Math.round(3 * power * scale);
    out.vitality = (out.vitality ?? 0) + Math.round(3 * power * scale);
    out.energy = (out.energy ?? 0) + Math.round(3 * power * scale);
    out.life = (out.life ?? 0) + Math.round(12 * power * scale);
    out.enhancedDamage = (out.enhancedDamage ?? 0) + 8 * power;
    out.enhancedDefense = (out.enhancedDefense ?? 0) + 10 * power;
    out.fireResist = (out.fireResist ?? 0) + 4 * power;
    out.coldResist = (out.coldResist ?? 0) + 4 * power;
    out.lightningResist = (out.lightningResist ?? 0) + 4 * power;
    out.poisonResist = (out.poisonResist ?? 0) + 4 * power;
    if (n >= 4) out.skillLevels = (out.skillLevels ?? 0) + 1;
    if (n >= 6) out.skillLevels = (out.skillLevels ?? 0) + 1;
  }
  return out;
}

/** Summed stats of everything equipped, including the generic set bonus. */
export function gearStats(c: Character): Stats {
  const out = emptyStats();
  for (const slot of EQUIP_SLOTS) {
    const item = c.equipment[slot];
    if (!item) continue;
    try {
      addStats(out, itemStats(item));
    } catch {
      // A malformed or not-yet-known base must never brick the stat sheet.
    }
  }
  addStats(out, setBonusStats(c.equipment));
  return out;
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

/**
 * Effective rank of a skill: hard points plus `+skills` from gear/statuses.
 * Skills with zero hard points stay at zero — `+2 to all skills` never unlocks
 * anything you did not pay for.
 */
export function effectiveRank(hardRank: number, skillLevels: number): number {
  if (hardRank <= 0) return 0;
  return Math.min(HARD_SKILL_RANK_CAP, hardRank + Math.max(0, Math.floor(skillLevels)));
}

/** Every passive stat grant from allocated skills at their effective ranks. */
export function skillPassiveStats(
  skills: Record<string, number>,
  skillLevels: number,
): Stats {
  const out = emptyStats();
  const e = passiveEffects({ skills } as never);
  // The Last Order: every oath's numbers get bigger, and each one you hold adds
  // flat damage reduction. It is the Warden's capstone and it is the only thing
  // in the game that scales another skill's stat grant, so it is resolved here
  // rather than in the passive engine — this is where those grants are summed.
  const oathScale = 1 + e.allOathsPct / 100;
  let oaths = 0;
  for (const id of Object.keys(skills)) {
    const hard = skills[id] ?? 0;
    if (hard <= 0) continue;
    const def = SKILL_BY_ID[id];
    if (!def?.passive) continue;
    const isOath = id.startsWith('oathOf');
    if (isOath) oaths++;
    const rank = effectiveRank(hard, skillLevels);
    for (const key of Object.keys(def.passive) as StatKey[]) {
      const fn = def.passive[key];
      if (!fn) continue;
      const v = fn(rank);
      if (Number.isFinite(v)) out[key] += isOath ? v * oathScale : v;
    }
  }
  out.damageReduction += e.drPerOath * oaths;
  return out;
}

// ---------------------------------------------------------------------------
// The recompute
// ---------------------------------------------------------------------------

/** Combine additive-within-pool percentages multiplicatively across pools. */
function combinePercent(...pools: number[]): number {
  let mul = 1;
  for (const p of pools) mul *= 1 + p / 100;
  return (mul - 1) * 100;
}

/**
 * Full recompute: class base + level + allocated attributes + gear + set
 * bonuses + skill passives + active statuses.
 */
export function computeStats(c: Character): Stats {
  const cls = getClass(c.classId);
  const level = Math.max(1, Math.min(MAX_LEVEL, c.level));

  // --- pool 1: gear (includes sockets/gems via itemStats, plus set bonuses).
  const gear = gearStats(c);

  // --- pool 3: statuses (needed early because a status can grant +skills).
  const container = peekStatuses(c.id);
  const statusMods = container ? container.statMods() : {};
  const status = addStats(emptyStats(), statusMods);

  // --- pool 2: skill passives, at ranks boosted by gear/status +skills only.
  //     (Masteries that themselves grant +skills do not feed back into rank
  //     calculation — otherwise a mastery would boost itself.)
  const externalSkillLevels = gear.skillLevels + status.skillLevels;
  const skills = skillPassiveStats(c.skills, externalSkillLevels);

  const out = emptyStats();

  // --- attributes -----------------------------------------------------------
  out.strength = cls.base.strength + c.allocated.strength + gear.strength + skills.strength + status.strength;
  out.dexterity =
    cls.base.dexterity + c.allocated.dexterity + gear.dexterity + skills.dexterity + status.dexterity;
  out.vitality = cls.base.vitality + c.allocated.vitality + gear.vitality + skills.vitality + status.vitality;
  out.energy = cls.base.energy + c.allocated.energy + gear.energy + skills.energy + status.energy;

  // --- flat, additive across every source ----------------------------------
  const flatKeys: StatKey[] = [
    'life',
    'mana',
    'lifeRegen',
    'manaRegen',
    'attackRating',
    'minDamage',
    'maxDamage',
    'attackSpeed',
    'castSpeed',
    'critChance',
    'critDamage',
    'lifeSteal',
    'manaSteal',
    'defense',
    'blockChance',
    'damageReduction',
    'physicalResist',
    'fireResist',
    'coldResist',
    'lightningResist',
    'poisonResist',
    'arcaneResist',
    'fireDamage',
    'coldDamage',
    'lightningDamage',
    'poisonDamage',
    'arcaneDamage',
    'elementalDamagePct',
    'areaDamagePct',
    'moveSpeed',
    'magicFind',
    'goldFind',
    'cooldownReduction',
  ];
  for (const key of flatKeys) out[key] = gear[key] + skills[key] + status[key];

  out.skillLevels = externalSkillLevels + skills.skillLevels;

  // --- derivation from attributes ------------------------------------------
  out.life += BASE_LIFE + cls.perLevel.life * (level - 1) + out.vitality * cls.lifePerVit;
  out.mana += BASE_MANA + cls.perLevel.mana * (level - 1) + out.energy * cls.manaPerEnr;
  out.attackRating +=
    DERIVE.baseAttackRating + cls.perLevel.attackRating * (level - 1) + out.dexterity * DERIVE.dexAttackRating;
  out.critChance += out.dexterity * DERIVE.dexCritChance;
  out.critDamage += DERIVE.baseCritDamage;
  out.defense += out.dexterity * DERIVE.dexDefense;
  out.lifeRegen += DERIVE.baseLifeRegen;
  out.manaRegen += DERIVE.baseManaRegen + out.energy * DERIVE.enrManaRegen;
  out.minDamage += DERIVE.baseMinDamage;
  out.maxDamage += DERIVE.baseMaxDamage;

  // --- percentage pools -----------------------------------------------------
  // Additive inside a pool, multiplicative across pools, plus strength.
  const strengthDamage = out.strength * DERIVE.strDamagePct;
  out.enhancedDamage = combinePercent(
    gear.enhancedDamage,
    skills.enhancedDamage,
    status.enhancedDamage,
    strengthDamage,
  );
  const defPct = combinePercent(gear.enhancedDefense, skills.enhancedDefense, status.enhancedDefense);
  out.enhancedDefense = defPct;
  out.defense = Math.max(0, out.defense * (1 + defPct / 100));

  // --- clamps ---------------------------------------------------------------
  out.life = Math.max(1, Math.round(out.life));
  out.mana = Math.max(0, Math.round(out.mana));
  out.attackRating = Math.max(1, Math.round(out.attackRating));
  out.defense = Math.round(out.defense);
  out.minDamage = Math.max(0, out.minDamage);
  out.maxDamage = Math.max(out.minDamage, out.maxDamage);
  out.blockChance = Math.max(0, Math.min(75, out.blockChance));
  out.critChance = Math.max(0, Math.min(95, out.critChance));
  out.critDamage = Math.max(100, out.critDamage);
  out.lifeSteal = Math.max(0, Math.min(40, out.lifeSteal));
  out.manaSteal = Math.max(0, Math.min(40, out.manaSteal));
  out.cooldownReduction = Math.max(0, Math.min(70, out.cooldownReduction));
  out.moveSpeed = Math.max(-80, Math.min(150, out.moveSpeed));
  out.attackSpeed = Math.max(-75, Math.min(200, out.attackSpeed));
  out.castSpeed = Math.max(-75, Math.min(200, out.castSpeed));
  out.damageReduction = Math.max(0, out.damageReduction);
  out.skillLevels = Math.round(out.skillLevels);

  return out;
}

/** Movement speed in world units per second, from the percentage stat. */
export const BASE_MOVE_SPEED = 5.4;
export function moveSpeedOf(stats: Stats): number {
  return BASE_MOVE_SPEED * (1 + stats.moveSpeed / 100);
}

/** Attacks per second from the attack speed percentage. */
export function attacksPerSecond(stats: Stats, weaponBase = 1.2): number {
  return Math.max(0.2, weaponBase * (1 + stats.attackSpeed / 100));
}

/** Cast time multiplier, <1 is faster. */
export function castTimeScale(stats: Stats): number {
  return 1 / (1 + stats.castSpeed / 100);
}

/** Applies cooldown reduction to a raw cooldown. */
export function reducedCooldown(seconds: number, stats: Stats): number {
  return Math.max(0.15, seconds * (1 - stats.cooldownReduction / 100));
}
