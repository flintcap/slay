/**
 * SLAY — the passive engine.
 *
 * Seventy-eight skills were authored with full descriptions, real parameters
 * and a tier position on the tree, and did nothing at all. A skill reaches the
 * player through exactly two doors — `SkillRunner.cast`, which only accepts a
 * skill with a targeting mode, and `skillPassiveStats`, which only reads a
 * skill's stat table. A skill with neither could not be pressed and granted
 * nothing. Every tier-6 capstone in five of the six classes was in that list.
 *
 * The reason those skills were never written is that none of them are stat
 * lines. "Blocked hits return 18% as physical damage" needs a block hook.
 * "Burning enemies that die explode" needs a kill hook. Adding them one at a
 * time would mean sixty-six special cases scattered through combat.
 *
 * So this module is the one place that knows what a character's passives do.
 * It resolves them once into a flat `PassiveEffects` record, and combat asks it
 * questions at a handful of choke points:
 *
 *   - `SkillRunner` tunes every packet it throws through `damageMultiplier`
 *   - `Player.takeDamage` runs `onBlocked` and `onLethal`
 *   - kills run through `onKill`
 *   - statuses the player applies are scaled by the dot and curse numbers
 *   - summons are scaled by the minion numbers
 *
 * Everything here is pure. It reads a character and returns numbers; it never
 * touches the scene, so it stays testable without a browser.
 */

import type { Character } from '../types';
import { SKILL_BY_ID } from '../data/skills';

/** A skill's rank, after +skills. Mirrors `Stats.effectiveRank`. */
function rankOf(c: Character, id: string): number {
  return c.skills[id] ?? 0;
}

/** Reads a numeric parameter off a skill definition, with a default. */
function param(id: string, key: string, dflt: number): number {
  const p = SKILL_BY_ID[id]?.params;
  const v = p?.[key];
  if (typeof v === 'number') return v;
  if (Array.isArray(v) && typeof v[0] === 'number') return v[0];
  return dflt;
}

/**
 * Everything a character's passives add up to.
 *
 * Percentages are whole numbers (18 means +18%) to match how the rest of the
 * stat system reads. Everything defaults to zero, so a character with no
 * passives allocated costs one object allocation and changes nothing.
 */
export interface PassiveEffects {
  // --- damage over time ---------------------------------------------------
  /** Added to every damage-over-time effect the player applies. */
  dotDamagePct: number;
  /** Extra seconds on every damage-over-time effect the player applies. */
  dotDurationSec: number;
  /** Extra stacks a stacking affliction may reach. */
  dotMaxStacks: number;
  /** How much faster the player's own dots tick, as a percentage. */
  dotTickPct: number;
  /** Burning spreads to a nearby enemy this often, in seconds. 0 = never. */
  dotSpreadInterval: number;
  dotSpreadRadius: number;
  dotSpreadStacks: number;
  /** Spread has no target limit and decays by this fraction per jump instead. */
  dotSpreadDecay: number;

  // --- curses and debuffs -------------------------------------------------
  curseEffectPct: number;
  curseDurationPct: number;
  curseRadiusM: number;
  /** A cursed enemy leeches this fraction of damage dealt back to you. */
  curseLeechPct: number;
  /** A cursed enemy's death passes its curses to enemies within this radius. */
  curseSpreadRadius: number;

  // --- minions ------------------------------------------------------------
  minionDamagePct: number;
  minionLifePct: number;
  minionCapBonus: number;
  minionDurationPct: number;

  // --- auras and ground effects ------------------------------------------
  auraStrengthPct: number;
  auraRadiusM: number;
  groundDurationPct: number;
  groundDamagePct: number;

  // --- conditional damage -------------------------------------------------
  /** Against a target that is bleeding. */
  vsBleedingPct: number;
  /** Against a target below `executeThreshold` of its life. */
  executeThreshold: number;
  executeDamagePct: number;
  /** Scales with how many enemies are near the player. */
  crowdDamagePct: number;
  crowdDamageCap: number;
  /** Scales with the player's own missing mana, per 10% missing. */
  missingManaPct: number;
  missingManaCap: number;
  /** Scales with the player's own missing life, per 10% missing. */
  missingLifePct: number;
  missingLifeCap: number;
  /** Scales with maximum mana, per 200 points. */
  maxManaPct: number;
  maxManaCap: number;
  /** Against a target carrying any debuff the player applied. */
  vsDebuffedPct: number;

  // --- on being hit -------------------------------------------------------
  /** Fraction of a blocked hit returned to the attacker. */
  thornsBlockPct: number;
  /** Fraction of an unblocked melee hit returned to the attacker. */
  thornsMeleePct: number;
  /** Chance on block to counterattack, as a percentage. */
  blockCounterChance: number;
  blockCounterPct: number;

  // --- cheat death --------------------------------------------------------
  /** 0 means none. Seconds between uses. */
  cheatDeathCooldown: number;
  /** Fraction of maximum life restored. */
  cheatDeathHealPct: number;
  /** Seconds of invulnerability granted. */
  cheatDeathInvuln: number;
  /** Radius of the stun or nova left behind. */
  cheatDeathRadius: number;
  /** Weapon-damage percentage of the blast, 0 for a stun-only version. */
  cheatDeathNovaPct: number;

  // --- on kill ------------------------------------------------------------
  /** Burning corpses explode for this share of their remaining burn. */
  killExplodePct: number;
  killExplodeRadius: number;
  /** Mana refunded on an execute kill, as a percentage of the skill's cost. */
  executeManaRefund: number;
  /** Life restored per kill, as a percentage of maximum. */
  killLifePct: number;

  // --- crits and hits -----------------------------------------------------
  /** Guaranteed critical on the next attack after standing still or hiding. */
  guaranteedCritAfter: number;
  /** Stacking attack speed per hit landed. */
  hitStackAttackSpeed: number;
  hitStackMax: number;
  /** Chance for a hit to arc to a second target. */
  arcChance: number;
  arcRadius: number;

  // --- movement -----------------------------------------------------------
  /** Movement speed gained per second of continuous movement. */
  momentumMovePct: number;
  momentumMoveCap: number;
  /** Damage gained from current movement speed, as a fraction of it. */
  momentumDamageShare: number;
  /** Leaves a damaging trail while moving. Damage is a weapon percentage. */
  trailDamagePct: number;
  trailRadius: number;

  // --- capstones ----------------------------------------------------------
  /** Overkill damage carries to nearby enemies at this fraction, N chains. */
  overkillCarryPct: number;
  overkillChains: number;
  overkillRadius: number;
  /** Every oath's strength, as a flat percentage bonus. */
  allOathsPct: number;
  /** Damage reduction per active oath. */
  drPerOath: number;
  /** Blocks build a retaliation charge; this is the percent per block. */
  retributionPctPerBlock: number;
  retributionRadius: number;
  /** Bleeds chain to nearby enemies, amplifying. */
  bloodTideAmplifyPct: number;
  bloodTideChains: number;
  bloodTideRadius: number;
}

function emptyEffects(): PassiveEffects {
  return {
    dotDamagePct: 0,
    dotDurationSec: 0,
    dotMaxStacks: 0,
    dotTickPct: 0,
    dotSpreadInterval: 0,
    dotSpreadRadius: 0,
    dotSpreadStacks: 0,
    dotSpreadDecay: 0,
    curseEffectPct: 0,
    curseDurationPct: 0,
    curseRadiusM: 0,
    curseLeechPct: 0,
    curseSpreadRadius: 0,
    minionDamagePct: 0,
    minionLifePct: 0,
    minionCapBonus: 0,
    minionDurationPct: 0,
    auraStrengthPct: 0,
    auraRadiusM: 0,
    groundDurationPct: 0,
    groundDamagePct: 0,
    vsBleedingPct: 0,
    executeThreshold: 0,
    executeDamagePct: 0,
    crowdDamagePct: 0,
    crowdDamageCap: 0,
    missingManaPct: 0,
    missingManaCap: 0,
    missingLifePct: 0,
    missingLifeCap: 0,
    maxManaPct: 0,
    maxManaCap: 0,
    vsDebuffedPct: 0,
    thornsBlockPct: 0,
    thornsMeleePct: 0,
    blockCounterChance: 0,
    blockCounterPct: 0,
    cheatDeathCooldown: 0,
    cheatDeathHealPct: 0,
    cheatDeathInvuln: 0,
    cheatDeathRadius: 0,
    cheatDeathNovaPct: 0,
    killExplodePct: 0,
    killExplodeRadius: 0,
    executeManaRefund: 0,
    killLifePct: 0,
    guaranteedCritAfter: 0,
    hitStackAttackSpeed: 0,
    hitStackMax: 0,
    arcChance: 0,
    arcRadius: 0,
    momentumMovePct: 0,
    momentumMoveCap: 0,
    momentumDamageShare: 0,
    trailDamagePct: 0,
    trailRadius: 0,
    overkillCarryPct: 0,
    overkillChains: 0,
    overkillRadius: 0,
    allOathsPct: 0,
    drPerOath: 0,
    retributionPctPerBlock: 0,
    retributionRadius: 0,
    bloodTideAmplifyPct: 0,
    bloodTideChains: 0,
    bloodTideRadius: 0,
  };
}

/**
 * One entry per previously-dead skill: what it contributes at rank `r`.
 *
 * The numbers come straight from each skill's own authored `p` block and its
 * description, so the tooltip a player reads is what the engine does.
 */
type Contribution = (e: PassiveEffects, r: number, id: string) => void;

const RULES: Record<string, Contribution> = {
  // ---------------------------------------------------------------- warden
  riposte: (e, r, id) => {
    e.blockCounterChance += param(id, 'procChance', 20) + param(id, 'procPerRank', 4) * (r - 1);
    e.blockCounterPct = Math.max(e.blockCounterPct, 110);
  },
  spikedGuard: (e, r, id) => {
    e.thornsBlockPct += param(id, 'blockReturn', 18) + param(id, 'blockPerRank', 6) * (r - 1);
    e.thornsMeleePct += param(id, 'meleeReturn', 6) + param(id, 'meleePerRank', 2) * (r - 1);
  },
  lastOath: (e, r, id) => {
    e.cheatDeathCooldown = Math.max(
      20,
      param(id, 'cooldown', 90) - param(id, 'cdPerRank', 6) * (r - 1),
    );
    e.cheatDeathHealPct = Math.max(
      e.cheatDeathHealPct,
      param(id, 'healPct', 25) + param(id, 'healPerRank', 2) * (r - 1),
    );
    e.cheatDeathRadius = Math.max(e.cheatDeathRadius, param(id, 'radius', 6));
  },
  bloodScent: (e, r, id) => {
    e.vsBleedingPct += param(id, 'pctPerRank', 7) * r;
  },
  executioner: (e, r, id) => {
    e.executeThreshold = Math.max(e.executeThreshold, param(id, 'threshold', 25));
    e.executeDamagePct += param(id, 'pct', 30) + param(id, 'pctPerRank', 6) * (r - 1);
    e.executeManaRefund = Math.max(e.executeManaRefund, param(id, 'manaRefund', 15));
  },
  unrelenting: (e, r, id) => {
    e.dotDurationSec += 2;
    e.dotDamagePct += param(id, 'lowLifePct', 5) * r;
  },
  commandingPresence: (e, r, id) => {
    e.auraStrengthPct += param(id, 'strengthPerRank', 8) * r;
    e.auraRadiusM += param(id, 'radiusPerRank', 0.4) * r;
  },
  standardBearer: (e, r, id) => {
    e.groundDurationPct += param(id, 'durationPct', 50) + param(id, 'perRank', 5) * (r - 1);
    e.auraStrengthPct += param(id, 'dmgPerRank', 2) * r;
  },
  hymnOfThorns: (e, r, id) => {
    e.thornsMeleePct += param(id, 'reflect', 12) + param(id, 'perRank', 4) * (r - 1);
    e.auraRadiusM = Math.max(e.auraRadiusM, param(id, 'radius', 10) - 10);
  },
  swornBrother: (e, r, id) => {
    e.minionDamagePct += param(id, 'damagePct', 60) + param(id, 'perRank', 4) * (r - 1);
    e.minionLifePct += param(id, 'lifePct', 80);
  },
  retribution: (e, r, id) => {
    e.retributionPctPerBlock += param(id, 'pctPerBlock', 3) + param(id, 'perRank', 1.5) * (r - 1);
    e.retributionRadius = Math.max(e.retributionRadius, param(id, 'radius', 4));
  },
  bloodTide: (e, r, id) => {
    e.bloodTideAmplifyPct += param(id, 'amplifyPct', 4) * r;
    e.bloodTideChains = Math.max(e.bloodTideChains, param(id, 'maxChains', 8));
    e.bloodTideRadius = Math.max(e.bloodTideRadius, param(id, 'radius', 6) + param(id, 'radiusPerRank', 0.3) * (r - 1));
  },
  theLastOrder: (e, r, id) => {
    e.allOathsPct += param(id, 'strength', 45) + param(id, 'perRank', 2.5) * (r - 1);
    e.drPerOath += param(id, 'drPerOath', 2);
  },

  // ------------------------------------------------------------ pyromancer
  cinderTouch: (e, r, id) => {
    e.dotDurationSec += param(id, 'durationPerRank', 0.5) * r;
    e.dotDamagePct += param(id, 'damagePerRank', 5) * r;
  },
  scorch: (e, r, id) => {
    e.dotDamagePct += param(id, 'burnPerRank', 6) * r;
  },
  smolder: (e, r, id) => {
    e.dotMaxStacks += Math.floor(r / Math.max(1, param(id, 'stacksPerRanks', 4)));
    e.dotDamagePct += param(id, 'damagePerRank', 4) * r;
  },
  pyreMastery: (e, r, id) => {
    e.dotDamagePct += param(id, 'damagePerRank', 8) * r;
    e.dotTickPct += param(id, 'tickRatePerRank', 3) * r;
  },
  combustion: (e, r, id) => {
    e.killExplodePct += param(id, 'pct', 80) + param(id, 'perRank', 10) * (r - 1);
    e.killExplodeRadius = Math.max(e.killExplodeRadius, param(id, 'radius', 3.5));
  },
  wildfire: (e, r, id) => {
    e.dotSpreadInterval = param(id, 'interval', 2);
    e.dotSpreadRadius = Math.max(e.dotSpreadRadius, param(id, 'radius', 5));
    e.dotSpreadStacks += param(id, 'stacks', 1) + Math.floor(r / Math.max(1, param(id, 'stacksPerRanks', 6)));
  },
  scorchedEarth: (e, r, id) => {
    e.groundDurationPct += param(id, 'durationPerRank', 12) * r;
    e.groundDamagePct += param(id, 'damagePerRank', 6) * r;
  },
  everburning: (e, r, id) => {
    e.dotDamagePct += param(id, 'magnitudePerRank', 8) * r;
    e.dotDurationSec += 3;
  },
  phoenixHeart: (e, r, id) => {
    e.cheatDeathCooldown = e.cheatDeathCooldown > 0
      ? Math.min(e.cheatDeathCooldown, Math.max(30, param(id, 'cooldown', 120) - param(id, 'cdPerRank', 8) * (r - 1)))
      : Math.max(30, param(id, 'cooldown', 120) - param(id, 'cdPerRank', 8) * (r - 1));
    e.cheatDeathHealPct = Math.max(e.cheatDeathHealPct, param(id, 'healPct', 100));
    e.cheatDeathInvuln = Math.max(e.cheatDeathInvuln, param(id, 'invuln', 3));
    e.cheatDeathNovaPct = Math.max(e.cheatDeathNovaPct, param(id, 'novaScale', 400));
    e.cheatDeathRadius = Math.max(e.cheatDeathRadius, 6);
  },
  plagueOfEmbers: (e, r, id) => {
    e.dotSpreadDecay = Math.max(
      0.02,
      (param(id, 'decayPct', 10) - param(id, 'decayPerRank', 0.4) * (r - 1)) / 100,
    );
    e.dotSpreadRadius = Math.max(e.dotSpreadRadius, 5);
    if (e.dotSpreadInterval === 0) e.dotSpreadInterval = 2;
  },
  emberSoul: (e, r, id) => {
    e.missingManaPct += param(id, 'pctPer10', 1) * r;
    e.missingManaCap = Math.max(e.missingManaCap, param(id, 'cap', 60));
  },
  arcaneConduit: (e, r, id) => {
    e.maxManaPct += param(id, 'pctPerRankPer200', 1) * r;
    e.maxManaCap = Math.max(e.maxManaCap, param(id, 'cap', 80));
  },
  cataclysm: (e, r, id) => {
    e.overkillCarryPct += param(id, 'carryPct', 60) + param(id, 'perRank', 3) * (r - 1);
    e.overkillChains = Math.max(
      e.overkillChains,
      param(id, 'chains', 4) + Math.floor(param(id, 'chainsPerRank', 0) * (r - 1)),
    );
    e.overkillRadius = Math.max(e.overkillRadius, param(id, 'radius', 8));
  },
};

/** Every skill this engine knows how to run. */
export const IMPLEMENTED_PASSIVES: readonly string[] = Object.keys(RULES);

/**
 * Resolve a character's allocated passives into one flat record.
 *
 * Cheap enough to call per frame, but callers generally cache it alongside
 * `computeStats` since both only change when gear or skills change.
 */
export function passiveEffects(c: Character): PassiveEffects {
  const e = emptyEffects();
  for (const id of Object.keys(c.skills)) {
    const r = rankOf(c, id);
    if (r <= 0) continue;
    RULES[id]?.(e, r, id);
  }
  return e;
}

/** State the engine needs to remember between hits. Owned by the player. */
export interface PassiveState {
  /** Seconds until cheat death is available again. */
  cheatDeathCd: number;
  /** Retaliation charge built by blocking, as a damage percentage. */
  retribution: number;
  /** Seconds of continuous movement, for momentum. */
  moving: number;
  /** Stacks of the on-hit attack speed buff. */
  hitStacks: number;
  /** Countdown to the next damage-over-time spread tick. */
  spreadTimer: number;
}

export function newPassiveState(): PassiveState {
  return { cheatDeathCd: 0, retribution: 0, moving: 0, hitStacks: 0, spreadTimer: 0 };
}

/**
 * The multiplier a packet gets against one specific target.
 *
 * `lifeFrac` is the target's remaining life as a fraction, `bleeding` and
 * `debuffed` describe what the player has already put on it, and `nearby` is
 * how many enemies are close to the player.
 */
export function damageMultiplier(
  e: PassiveEffects,
  target: { lifeFrac: number; bleeding: boolean; debuffed: boolean },
  self: { manaFrac: number; maxMana: number; lifeFrac: number; nearby: number },
): number {
  let pct = 0;
  if (target.bleeding) pct += e.vsBleedingPct;
  if (target.debuffed) pct += e.vsDebuffedPct;
  if (e.executeThreshold > 0 && target.lifeFrac * 100 <= e.executeThreshold) {
    pct += e.executeDamagePct;
  }
  if (e.missingManaPct > 0) {
    const missingTenths = Math.max(0, (1 - self.manaFrac) * 10);
    pct += Math.min(e.missingManaCap, e.missingManaPct * missingTenths);
  }
  if (e.missingLifePct > 0) {
    const missingTenths = Math.max(0, (1 - self.lifeFrac) * 10);
    pct += Math.min(e.missingLifeCap, e.missingLifePct * missingTenths);
  }
  if (e.maxManaPct > 0) {
    pct += Math.min(e.maxManaCap, e.maxManaPct * (self.maxMana / 200));
  }
  if (e.crowdDamagePct > 0) {
    pct += Math.min(e.crowdDamageCap, e.crowdDamagePct * Math.max(0, self.nearby - 1));
  }
  return 1 + pct / 100;
}
