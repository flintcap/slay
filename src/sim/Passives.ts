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
  /** Stacking attack speed per hit landed. */
  hitStackAttackSpeed: number;
  hitStackMax: number;
  /** Chance for a hit to arc to a second target. */
  arcChance: number;
  arcRadius: number;
  /** Fraction of the original blow the arc carries. */
  arcDamagePct: number;
  /** Chance for a spell to cast a second time for free. */
  echoChance: number;
  echoDamagePct: number;
  /** Extra projectiles a bolt splits into, and what each one carries. */
  forkCount: number;
  forkDamagePct: number;
  forkSpread: number;
  /** Shocked enemies share this share of lightning damage with each other. */
  conductRadius: number;
  conductSharePct: number;
  /** Fraction of fire, cold and physical damage converted to lightning. */
  convertToLightningPct: number;
  /** A critical strike applies Vulnerable for this long. 0 = never. */
  critVulnerableSec: number;
  /** A critical strike applies this many stacks of Bleeding. */
  critBleedStacks: number;
  /** A critical strike throws a blade at another enemy. */
  critBladeChance: number;
  critBladeRange: number;
  critBladePct: number;
  /** Every Nth attack is a guaranteed critical. 0 = never. */
  guaranteedCritEvery: number;
  guaranteedCritBonusPct: number;
  /** Damage against a target scaled by how much life it is missing. */
  vsMissingLifePct: number;
  /** Poison ignores this much of the target's poison resistance. */
  resistPiercePct: number;
  /** Poison at this many stacks stuns. 0 = never. */
  poisonStunStacks: number;
  poisonStunSec: number;

  // --- shadow and clones --------------------------------------------------
  cloneCount: number;
  clonePowerPct: number;
  /** Damage reduction and regeneration while unseen. */
  stealthReductionPct: number;
  stealthRegenPct: number;

  // --- souls --------------------------------------------------------------
  /** Kills bank a Soul: damage and mana regeneration each, to a ceiling. */
  soulMaxStacks: number;
  soulDamagePct: number;
  soulManaRegen: number;
  soulDurationSec: number;

  // --- resource conversion ------------------------------------------------
  /** Maximum mana converted into maximum life, as a percentage. */
  manaToLifePct: number;
  /** Damage gained per 400 maximum life. */
  damagePer400Life: number;
  /** Skills may be paid with life at this rate. 0 = never. */
  lifePerMana: number;
  /** Damage while below half mana. */
  lowManaDamagePct: number;

  // --- low life -----------------------------------------------------------
  lowLifeThreshold: number;
  lowLifeReductionPct: number;
  lowLifeLeechPct: number;

  // --- minions, deeper ----------------------------------------------------
  minionAttackSpeedPct: number;
  minionLeechPct: number;
  /** Some minions are upgraded: this many, at this much more power. */
  minionEliteCount: number;
  minionElitePowerPct: number;

  // --- curses, deeper -----------------------------------------------------
  /** Cursed enemies lose this much of maximum life per second. */
  curseDecayPctPerSec: number;
  /** A standing debuff aura around the player. */
  auraDebuffRadius: number;
  auraResistShred: number;
  auraSlowPct: number;
  /** Mana restored on a kill, as a percentage of maximum. */
  killManaPct: number;

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
    hitStackAttackSpeed: 0,
    hitStackMax: 0,
    arcChance: 0,
    arcRadius: 0,
    arcDamagePct: 0,
    echoChance: 0,
    echoDamagePct: 0,
    forkCount: 0,
    forkDamagePct: 0,
    forkSpread: 0,
    conductRadius: 0,
    conductSharePct: 0,
    convertToLightningPct: 0,
    critVulnerableSec: 0,
    critBleedStacks: 0,
    critBladeChance: 0,
    critBladeRange: 0,
    critBladePct: 0,
    guaranteedCritEvery: 0,
    guaranteedCritBonusPct: 0,
    vsMissingLifePct: 0,
    resistPiercePct: 0,
    poisonStunStacks: 0,
    poisonStunSec: 0,
    cloneCount: 0,
    clonePowerPct: 0,
    stealthReductionPct: 0,
    stealthRegenPct: 0,
    soulMaxStacks: 0,
    soulDamagePct: 0,
    soulManaRegen: 0,
    soulDurationSec: 0,
    manaToLifePct: 0,
    damagePer400Life: 0,
    lifePerMana: 0,
    lowManaDamagePct: 0,
    lowLifeThreshold: 0,
    lowLifeReductionPct: 0,
    lowLifeLeechPct: 0,
    minionAttackSpeedPct: 0,
    minionLeechPct: 0,
    minionEliteCount: 0,
    minionElitePowerPct: 0,
    curseDecayPctPerSec: 0,
    auraDebuffRadius: 0,
    auraResistShred: 0,
    auraSlowPct: 0,
    killManaPct: 0,
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

  // ----------------------------------------------------------- stormcaller
  conductance: (e, r, id) => {
    // Shocked enemies take more from everything, which is the debuff branch of
    // the conditional multiplier rather than a lightning-only bonus.
    e.vsDebuffedPct += param(id, 'pctPerRank', 5) * r;
    e.curseDurationPct += param(id, 'durationPerRank', 0.4) * r * 10;
  },
  forkedBolt: (e, r, id) => {
    e.forkCount = Math.max(
      e.forkCount,
      param(id, 'forks', 2) + Math.floor(r / Math.max(1, param(id, 'forksPerRanks', 5))),
    );
    e.forkDamagePct = Math.max(
      e.forkDamagePct,
      param(id, 'forkPct', 60) + param(id, 'perRank', 3) * (r - 1),
    );
    e.forkSpread = Math.max(e.forkSpread, (param(id, 'spreadAngle', 20) * Math.PI) / 180);
  },
  tailwind: (e, r, id) => {
    e.momentumMovePct += param(id, 'castSpeed', 20) + param(id, 'perRank', 2) * (r - 1);
    e.momentumMoveCap = Math.max(e.momentumMoveCap, param(id, 'distance', 5));
    e.momentumDamageShare = Math.max(e.momentumDamageShare, param(id, 'damage', 15) / 100);
  },
  airborne: (e, r, id) => {
    e.momentumDamageShare += (param(id, 'pctPerRank', 1.5) * r) / 100;
    e.momentumMoveCap = Math.max(e.momentumMoveCap, param(id, 'perMetres', 3) * param(id, 'maxStacks', 10));
  },
  thunderRun: (e, r, id) => {
    e.trailDamagePct += 60 + 11 * (r - 1);
    e.trailRadius = Math.max(e.trailRadius, param(id, 'width', 2));
  },
  arcWeave: (e, r, id) => {
    e.arcChance = Math.min(
      param(id, 'chanceCap', 70),
      e.arcChance + param(id, 'chancePerRank', 15) * r,
    );
    e.arcRadius = Math.max(e.arcRadius, param(id, 'range', 7));
    e.arcDamagePct = Math.max(e.arcDamagePct, param(id, 'damagePct', 50));
  },
  superconductor: (e, r, id) => {
    e.conductSharePct += param(id, 'pct', 40) + param(id, 'perRank', 5) * (r - 1);
    e.conductRadius = Math.max(e.conductRadius, param(id, 'radius', 8));
  },
  resonance: (e, r, id) => {
    e.echoChance = Math.min(
      param(id, 'chanceCap', 45),
      e.echoChance + param(id, 'chancePerRank', 10) * r,
    );
    e.echoDamagePct = Math.max(e.echoDamagePct, param(id, 'damagePct', 50));
  },
  transformer: (e, r, id) => {
    e.convertToLightningPct = Math.min(
      param(id, 'cap', 60),
      e.convertToLightningPct + param(id, 'pctPerRank', 5) * r,
    );
  },
  conduitMastery: (e, r, id) => {
    e.dotMaxStacks += param(id, 'stacksPerRank', 2) * r;
    e.vsDebuffedPct += param(id, 'detonatePerRank', 4) * r;
  },
  neverGrounded: (e, r, id) => {
    // Damage that builds the further you have run and decays when you stop.
    e.momentumDamageShare += (param(id, 'pctPerMetre', 1) + param(id, 'perRank', 0.1) * (r - 1)) / 100;
    e.momentumMoveCap = Math.max(
      e.momentumMoveCap,
      param(id, 'cap', 120) + param(id, 'capPerRank', 8) * (r - 1),
    );
  },
  theGreatArc: (e, r, id) => {
    // The lightning capstone is the overkill chain wearing a different coat:
    // a kill throws what it spilled at everything within twenty metres.
    e.overkillCarryPct += param(id, 'carryPct', 80) + param(id, 'perRank', 2) * (r - 1);
    e.overkillChains = Math.max(e.overkillChains, param(id, 'maxCascade', 24));
    e.overkillRadius = Math.max(e.overkillRadius, param(id, 'radius', 20));
    e.arcChance = Math.max(e.arcChance, 100);
    e.arcRadius = Math.max(e.arcRadius, param(id, 'radius', 20) * 0.4);
    e.arcDamagePct = Math.max(e.arcDamagePct, 60);
  },

  // ----------------------------------------------------------- shadowblade
  toxicology: (e, r, id) => {
    e.dotDamagePct += param(id, 'damagePerRank', 9) * r;
    e.dotDurationSec += param(id, 'durationPerRank', 0.4) * r;
  },
  toxicMastery: (e, r, id) => {
    e.dotDamagePct += param(id, 'damagePerRank', 6) * r;
    e.dotTickPct += param(id, 'tickRatePerRank', 4) * r;
  },
  cultivate: (e, r, id) => {
    e.dotMaxStacks += Math.floor(r / Math.max(1, param(id, 'stacksPerRanks', 3)));
    e.dotDamagePct += param(id, 'bonusPerExtra', 5) * Math.floor(r / 3);
  },
  paralyticToxin: (e, r, id) => {
    e.poisonStunStacks = Math.max(e.poisonStunStacks, param(id, 'stunAtStacks', 5));
    e.poisonStunSec = Math.max(
      e.poisonStunSec,
      param(id, 'stunDuration', 1.5) + param(id, 'stunPerRank', 0.05) * (r - 1),
    );
  },
  bloodToxin: (e, r, id) => {
    e.resistPiercePct = Math.min(
      param(id, 'pierceFloor', 80),
      e.resistPiercePct + param(id, 'piercePerRank', 4) * r,
    );
  },
  hemotoxin: (e, r, id) => {
    e.vsMissingLifePct += param(id, 'pctPer10PerRank', 1.5) * r;
  },
  miasmaTrail: (e, r, id) => {
    e.trailDamagePct += 25 + 5 * (r - 1);
    e.trailRadius = Math.max(e.trailRadius, param(id, 'width', 1.6));
  },
  exploitWeakness: (e, r, id) => {
    e.critVulnerableSec = Math.max(e.critVulnerableSec, param(id, 'vulnerable', 8));
    e.vsDebuffedPct += param(id, 'defShredPerRank', 5) * r;
  },
  bleedingEdge: (e, r, id) => {
    e.critBleedStacks = Math.max(
      e.critBleedStacks,
      param(id, 'bleedStacks', 2) + Math.floor(r / Math.max(1, param(id, 'stacksPerRanks', 5))),
    );
    e.dotDamagePct += param(id, 'bleedDamagePerRank', 6) * r;
  },
  phantomBlades: (e, r, id) => {
    e.critBladeChance = Math.max(e.critBladeChance, param(id, 'chance', 100));
    e.critBladeRange = Math.max(e.critBladeRange, param(id, 'range', 9));
    e.critBladePct = Math.max(e.critBladePct, 90 + 15 * (r - 1));
  },
  perfectForm: (e, r, id) => {
    e.guaranteedCritEvery = Math.max(
      param(id, 'floor', 5),
      Math.round(param(id, 'interval', 12) - param(id, 'reducePerRank', 0.4) * (r - 1)),
    );
    e.guaranteedCritBonusPct = Math.max(e.guaranteedCritBonusPct, param(id, 'bonusDamage', 50));
  },
  riposteBlade: (e, r, id) => {
    e.blockCounterChance += Math.min(
      param(id, 'chanceCap', 60),
      param(id, 'chancePerRank', 15) * r,
    );
    e.blockCounterPct = Math.max(e.blockCounterPct, 160);
  },
  flurry: (e, r, id) => {
    e.hitStackAttackSpeed += param(id, 'attackSpeedPerStack', 10) + param(id, 'perRank', 1) * (r - 1);
    e.hitStackMax = Math.max(e.hitStackMax, param(id, 'maxStacks', 6));
  },
  momentum: (e, r, id) => {
    e.crowdDamagePct += param(id, 'pctPerRank', 2) * r;
    e.crowdDamageCap = Math.max(e.crowdDamageCap, param(id, 'pctPerRank', 2) * r * param(id, 'maxTargets', 8));
  },
  finisher: (e, r, id) => {
    e.executeThreshold = Math.max(e.executeThreshold, param(id, 'threshold', 30));
    e.executeDamagePct += param(id, 'pct', 40) + param(id, 'pctPerRank', 7) * (r - 1);
    e.killManaPct = Math.max(e.killManaPct, param(id, 'manaOnKill', 8));
  },
  gloomShroud: (e, r, id) => {
    e.stealthReductionPct += param(id, 'drPct', 30) + param(id, 'perRank', 2) * (r - 1);
    e.stealthRegenPct = Math.max(e.stealthRegenPct, param(id, 'lifeRegenPct', 2));
  },
  shadowLegion: (e, r, id) => {
    e.cloneCount = Math.max(
      e.cloneCount,
      Math.min(param(id, 'maxClones', 6), param(id, 'extraClones', 2) + Math.floor(r / Math.max(1, param(id, 'perRanks', 6)))),
    );
    e.clonePowerPct += param(id, 'damagePerRank', 4) * r;
  },
  mirrorGambit: (e, r, id) => {
    e.clonePowerPct += param(id, 'mimicPct', 40) + param(id, 'perRank', 4) * (r - 1);
    if (e.cloneCount === 0) e.cloneCount = 1;
  },
  apexPredator: (e, r, id) => {
    // Poison on a dying enemy leaps to the pack, amplified.
    e.dotSpreadInterval = e.dotSpreadInterval || 2;
    e.dotSpreadRadius = Math.max(e.dotSpreadRadius, param(id, 'radius', 10));
    e.dotSpreadStacks += 1;
    e.bloodTideAmplifyPct += param(id, 'amplify', 25) + param(id, 'perRank', 2) * (r - 1);
    e.bloodTideChains = Math.max(
      e.bloodTideChains,
      param(id, 'transferCap', 6) + Math.floor(r / Math.max(1, param(id, 'capPerRanks', 4))),
    );
    e.bloodTideRadius = Math.max(e.bloodTideRadius, param(id, 'radius', 10));
  },
  theUnseenBlade: (e, r, id) => {
    e.guaranteedCritBonusPct += param(id, 'critDamage', 40) + param(id, 'critPerRank', 5) * (r - 1);
    e.stealthReductionPct += 10;
  },
  thousandCuts: (e, r, id) => {
    // Crits stack critical damage; the ceiling is what the skill promises.
    e.critBladeChance = Math.max(e.critBladeChance, 40);
    e.critBladeRange = Math.max(e.critBladeRange, 9);
    e.critBladePct = Math.max(
      e.critBladePct,
      (param(id, 'critDamagePerCut', 2) + param(id, 'perRank', 0.3) * (r - 1)) * param(id, 'maxCuts', 50),
    );
  },

  // -------------------------------------------------------------- revenant
  decay: (e, r, id) => {
    e.curseEffectPct += param(id, 'strengthPerRank', 8) * r;
    e.curseDurationPct += param(id, 'durationPerRank', 0.5) * r * 10;
  },
  curseMastery: (e, r, id) => {
    e.curseDurationPct += param(id, 'costPerRank', 4) * r;
    e.curseEffectPct += param(id, 'costPerRank', 4) * r;
  },
  wither: (e, r, id) => {
    e.curseDecayPctPerSec += param(id, 'pct', 2) * (r / Math.max(1, param(id, 'pctPerSecondPerRanks', 4)));
  },
  bloodCurse: (e, r, id) => {
    e.curseLeechPct += param(id, 'lifePct', 6) + param(id, 'perRank', 0.8) * (r - 1);
  },
  contagion: (e, r, id) => {
    e.curseSpreadRadius = Math.max(
      e.curseSpreadRadius,
      param(id, 'radius', 7) + param(id, 'perRank', 0.2) * (r - 1),
    );
  },
  attrition: (e, r, id) => {
    e.auraDebuffRadius = Math.max(e.auraDebuffRadius, param(id, 'radius', 8));
    e.auraResistShred += param(id, 'resistPerRank', 1) * r;
    e.auraSlowPct += param(id, 'attackSpeedPerRank', 2) * r;
  },
  theLongDecline: (e, r, id) => {
    e.curseDecayPctPerSec += param(id, 'pctPerSecond', 5) + param(id, 'perRank', 0.5) * (r - 1);
    e.curseSpreadRadius = Math.max(e.curseSpreadRadius, 10);
  },
  boneMastery: (e, r, id) => {
    e.minionLifePct += param(id, 'lifePerRank', 9) * r;
    e.minionDamagePct += param(id, 'damagePerRank', 7) * r;
  },
  marrowFeast: (e, r, id) => {
    e.minionAttackSpeedPct += param(id, 'attackSpeedPerRank', 6) * r;
    e.minionLeechPct += param(id, 'leechPerRank', 0.8) * r;
    e.killLifePct = Math.max(e.killLifePct, param(id, 'healOnKillPct', 15) * 0.1);
  },
  ossuaryLord: (e, r, id) => {
    e.minionCapBonus += Math.floor(r / Math.max(1, param(id, 'warriorPerRanks', 2)));
    e.minionDurationPct += 20;
  },
  skeletalKnight: (e, r, id) => {
    e.minionEliteCount = Math.max(
      e.minionEliteCount,
      param(id, 'count', 2) + Math.floor(r / Math.max(1, param(id, 'countPerRanks', 8))),
    );
    e.minionElitePowerPct += param(id, 'damagePct', 80) + param(id, 'perRank', 6) * (r - 1);
    e.minionLifePct += param(id, 'lifePct', 120) * 0.25;
  },
  deathKnight: (e, r, id) => {
    e.minionElitePowerPct += param(id, 'damagePct', 40) + param(id, 'perRank', 4) * (r - 1);
    if (e.minionEliteCount === 0) e.minionEliteCount = 1;
  },
  theBoneChoir: (e, r, id) => {
    e.minionCapBonus += 2;
    e.minionDamagePct += param(id, 'lifePct', 60) + param(id, 'lifePerRank', 4) * (r - 1);
    e.auraRadiusM = Math.max(e.auraRadiusM, param(id, 'radius', 4) + param(id, 'perRank', 0.4) * (r - 1));
  },
  reapSoul: (e, r, id) => {
    e.soulMaxStacks = Math.max(e.soulMaxStacks, param(id, 'maxStacks', 15));
    e.soulDamagePct = Math.max(e.soulDamagePct, 3);
    e.soulManaRegen = Math.max(e.soulManaRegen, 2);
    e.soulDurationSec = Math.max(
      e.soulDurationSec,
      param(id, 'duration', 30) + param(id, 'durationPerRank', 1) * (r - 1),
    );
  },
  harvestMastery: (e, r, id) => {
    e.soulMaxStacks += param(id, 'maxPerRank', 2) * r;
    e.soulDamagePct += r / Math.max(1, param(id, 'damagePerSoulPerRanks', 5));
    e.soulDurationSec *= 1 + param(id, 'durationPct', 50) / 100;
  },
  deathsEmbrace: (e, r, id) => {
    e.manaToLifePct += param(id, 'pct', 10) * Math.floor(r / Math.max(1, param(id, 'manaToLifePerRanks', 2)));
    e.damagePer400Life += param(id, 'damagePer400Life', 1);
  },
  undying: (e, r, id) => {
    e.lowLifeThreshold = Math.max(e.lowLifeThreshold, param(id, 'threshold', 30));
    e.lowLifeReductionPct += param(id, 'drPerRank', 4) * r;
    e.lowLifeLeechPct += param(id, 'leechPerRank', 2) * r;
  },
  crimsonCovenant: (e, r, id) => {
    e.lifePerMana = Math.max(e.lifePerMana, param(id, 'lifePerMana', 2));
    e.lowManaDamagePct += param(id, 'lowManaDamage', 25) + param(id, 'perRank', 2) * (r - 1);
  },
  theSecondDeath: (e, r, id) => {
    // A second cheat death, stronger and slower, that spends your Souls.
    const cd = Math.max(60, param(id, 'cooldown', 180) - param(id, 'cdPerRank', 6) * (r - 1));
    e.cheatDeathCooldown = e.cheatDeathCooldown > 0 ? Math.min(e.cheatDeathCooldown, cd) : cd;
    e.cheatDeathHealPct = Math.max(e.cheatDeathHealPct, 60);
    e.cheatDeathInvuln = Math.max(
      e.cheatDeathInvuln,
      param(id, 'duration', 8) + param(id, 'perRank', 0.3) * (r - 1),
    );
    e.cheatDeathNovaPct = Math.max(e.cheatDeathNovaPct, param(id, 'damagePct', 100));
    e.cheatDeathRadius = Math.max(e.cheatDeathRadius, 8);
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
  /** Souls banked from recent kills, and how long the oldest has left. */
  souls: number;
  soulTimer: number;
  /** Attacks since the last guaranteed critical. */
  swings: number;
}

export function newPassiveState(): PassiveState {
  return { cheatDeathCd: 0, retribution: 0, moving: 0, hitStacks: 0, spreadTimer: 0, souls: 0, soulTimer: 0, swings: 0 };
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
  self: {
    manaFrac: number;
    maxMana: number;
    lifeFrac: number;
    nearby: number;
    moving?: number;
    souls?: number;
    maxLife?: number;
  },
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
  // Hemotoxin reads the *target's* missing life, not the player's.
  if (e.vsMissingLifePct > 0) {
    pct += Math.max(0, (1 - target.lifeFrac) * 10) * e.vsMissingLifePct;
  }
  // Crimson Covenant pays out while you are running on empty.
  if (e.lowManaDamagePct > 0 && self.manaFrac < 0.5) pct += e.lowManaDamagePct;
  // Souls banked from recent kills.
  if (e.soulDamagePct > 0 && (self.souls ?? 0) > 0) {
    pct += Math.min(e.soulMaxStacks, self.souls ?? 0) * e.soulDamagePct;
  }
  // Death's Embrace turns a deep life pool into damage.
  if (e.damagePer400Life > 0) pct += ((self.maxLife ?? 0) / 400) * e.damagePer400Life;
  if (e.maxManaPct > 0) {
    pct += Math.min(e.maxManaCap, e.maxManaPct * (self.maxMana / 200));
  }
  if (e.crowdDamagePct > 0) {
    pct += Math.min(e.crowdDamageCap, e.crowdDamagePct * Math.max(0, self.nearby - 1));
  }
  // Momentum: metres banked in the last few seconds turn into damage.
  if (e.momentumDamageShare > 0 && (self.moving ?? 0) > 0) {
    pct += Math.min(e.momentumMoveCap, self.moving ?? 0) * e.momentumDamageShare * 100;
  }
  return 1 + pct / 100;
}
