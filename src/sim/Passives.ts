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

import type { Character, DamageType } from '../types';
import { SKILL_BY_ID, synergyPct } from '../data/skills';
import { applyPowerPassives } from './ItemPowers';
import { emptyPaladinEffects, PALADIN_RULES, type PaladinEffects } from './passives/paladin';
import { SHIFTER_RULES } from './shifterPassives';
import { emptyRangerEffects, RANGER_RULES, type RangerEffects } from './passives/ranger';

/** A skill's rank, after +skills. Mirrors `Stats.effectiveRank`. */
function rankOf(c: Character, id: string): number {
  return c.skills[id] ?? 0;
}

/** Reads a numeric parameter off a skill definition, with a default. */
/** Two "to a N% floor" limits together reach the lower one. */
const floorOf = (have: number, f: number): number => (have > 0 ? Math.min(have, f) : f);

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
  /** Many Mouths: % more damage for you and your wolves, for each wolf standing (`ShifterRunner.tickShiftPack`). */
  manyMouthsPct: number;

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
  /** Flurry: damage percent per stack held. */
  hitStackDamagePct: number;
  /** Chance for a hit to arc to a second target. */
  arcChance: number;
  arcRadius: number;
  /** Fraction of the original blow the arc carries. */
  arcDamagePct: number;
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
  /** Antivenom: poison that would hit you heals this share of it instead. */
  poisonHealPct: number;
  /** Every Nth attack is a guaranteed critical. 0 = never. */
  guaranteedCritEvery: number;
  guaranteedCritBonusPct: number;
  /** The Unseen Blade: a kill from the veil keeps it and adds this many seconds, up to the cap. */
  veilKillExtendSec: number;
  veilKillCapSec: number;
  /** Damage against a target scaled by how much life it is missing. */
  vsMissingLifePct: number;
  /** Poison ignores this much of the target's poison resistance. */
  resistPiercePct: number;
  /** Poison at this many stacks stuns. 0 = never. */
  poisonStunStacks: number;
  poisonStunSec: number;
  /** Seconds before Paralytic Toxin can stun the same target again. */
  poisonStunCd: number;
  /** Poisoned targets are also Slowed (Paralytic Toxin). */
  poisonSlows: boolean;
  /**
   * Hits of a damage type that leave a status: Corrosive Edge (poison leaves
   * Corroded), Scorch (fire leaves Scorched). Chance in percent.
   */
  onHitStatuses: Array<{ type: DamageType; id: string; chance: number; duration: number }>;
  /** Fire and Lightning Mastery: percent of a damage type's resistance your hits ignore. */
  pierceByType: Partial<Record<DamageType, number>>;
  /**
   * The Mage's masteries: damage percent for hits of one element only, added
   * to `elementalDamagePct` when the hit is rolled (`RollOpts.elemPct`).
   */
  elementPct: Partial<Record<DamageType, number>>;
  /** Ember Soul: the missing-mana bonus counts only for hits of this type (null for all). */
  missingManaType: DamageType | null;
  /** Conductance: more damage against Shocked targets, and seconds on every Shocked you apply. */
  vsShockedPct: number;
  shockLongerSec: number;
  /** Splintering Frost: a Frozen or Brittle kill bursts for this percent of its maximum life, this far, Chilling for this long. */
  shatterPct: number;
  shatterRadius: number;
  shatterChill: number;
  /** Kindling, Deadly Aim: extra critical chance and damage against a kind of target. */
  condCrit: Array<{ when: 'burning' | 'healthy'; chance: number; damage: number }>;
  /** Storm Fury: cast speed per lightning hit, how many, and how long they last. */
  castStackPct: number;
  castStackMax: number;
  castStackSec: number;
  /** Flurry: seconds without landing a hit before its stacks fall away. */
  hitStackDecay: number;
  /** Combustion: the blast sets survivors burning. */
  killExplodeIgnite: number;
  /** Butchery, Unrelenting, Arterial Strike: the hero's bleeds hit harder, last longer, and stop running out on low targets. */
  bleedDamagePct: number;
  lowLifeBleedPct: number;
  bleedDurationPct: number;
  bleedHoldBelow: number;
  /** Arterial Strike: a critical strike leaves Hemorrhage. */
  critHemorrhage: number;
  /** Reaver: Frenzy stacks a kill grants. */
  killFrenzy: number;
  /** Blood Drinker: life steal works twice against a bleeding target. */
  bleedLeechDouble: number;

  // --- shadow and clones --------------------------------------------------
  cloneCount: number;
  clonePowerPct: number;
  /** Mirror Gambit: share (%) of a skill's melee blow each nearby clone strikes again. */
  mirrorStrikePct: number;
  /** Damage reduction and regeneration while unseen. */
  stealthReductionPct: number;
  stealthRegenPct: number;

  // --- souls --------------------------------------------------------------
  /** Kills bank a Soul: damage and mana regeneration each, to a ceiling. */
  soulMaxStacks: number;
  soulDamagePct: number;
  soulManaRegen: number;
  soulDurationSec: number;
  /** How near a kill must fall to bank Souls, and how many it banks. */
  soulRadius: number;
  soulPerKill: number;
  /** Soul Cage: Souls a caged enemy gives up when it dies. */
  soulCageBonus: number;
  /** The Second Death: maximum life each Soul restores when it catches you, in percent. */
  cheatDeathSoulHealPct: number;
  /** Grave Pact: share of overflowing stolen life kept as a ward, and the ward's ceiling (% of life). */
  overhealShieldPct: number;
  overhealCapPct: number;
  /** Vampiric Touch: share of your life steal your minions steal for you, in percent. */
  minionStealShare: number;
  /** Endless Quiver: every this many skill shots from a bow, one is free. */
  freeShotEvery: number;
  /** Volley Mastery: extra arrows for a skill that looses several. */
  extraArrows: number;

  // --- resource conversion ------------------------------------------------
  /** Maximum mana converted into maximum life, as a percentage. */
  manaToLifePct: number;
  /** Damage gained per 400 maximum life. */
  damagePer400Life: number;
  /** Skills may be paid with life at this rate. 0 = never. */
  lifePerMana: number;
  /** Damage while below half mana. */
  lowManaDamagePct: number;
  /** The mana level (percent) below which that damage applies. */
  lowManaThreshold: number;

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
  /** Skeletal Knight: extra life (%) for knights, and whether they cleave. */
  minionEliteLifePct: number;
  minionEliteCleave: boolean;
  /** Death Knight: knights' blows are this much more (%), on top of Skeletal Knight's. */
  minionEliteMorePct: number;
  /** Marrow Feast: a minion heals itself for this share (%) of each blow, and this much of its life (%) on a kill. */
  minionSelfLeechPct: number;
  minionKillHealPct: number;
  /** Ossuary Lord: extra room per summon skill. */
  capBySkill: Record<string, number>;
  /** The Bone Choir: a fallen minion's pool (radius m, seconds, % of its life a second, % healed back). */
  choirRadius: number;
  choirSec: number;
  choirLifePct: number;
  choirHealShare: number;
  /** Blood Curse: share (%) of damage to the cursed returned as mana. */
  curseManaLeechPct: number;
  /** Curse Mastery: curses cost this much less mana (%). */
  curseCostPct: number;
  /** Contagion: most enemies one death hands its curses to. */
  curseSpreadMax: number;

  // --- curses, deeper -----------------------------------------------------
  /** Cursed enemies lose this much of maximum life per second. */
  curseDecayPctPerSec: number;
  /** A standing debuff aura around the player. */
  auraDebuffRadius: number;
  auraResistShred: number;
  auraSlowPct: number;
  /** Attrition: enemies this near (m) lose these resistances and this much attack speed (%). */
  attritionRadius: number;
  attritionResist: number;
  attritionAttackSpeed: number;
  /** Hex Upon Hex: each of your curses on an enemy past the first, it takes this much more damage (%). */
  hexPct: number;
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
  /** Miasma Trail: how long a patch lasts, how often it bites, its poison chance. */
  trailSec: number;
  trailTick: number;
  trailPoisonPct: number;
  /** Apex Predator: poison on a target below this life % stops running out. */
  poisonHoldBelow: number;
  /** Silhouette: chance (%) that a blow misses the hero outright. */
  avoidPct: number;
  /** Night Eyes and The Unseen Blade: extra critical damage (points) on blows from the veil. */
  veilCritPct: number;
  /** Dark Pact: Veil costs this much less mana (%). */
  veilCostPct: number;
  /** Riposte Blade: chance (%) to answer a melee blow, its power (%), and whether it always crits. */
  meleeCounterChance: number;
  meleeCounterPct: number;
  meleeCounterCrit: boolean;
  /** Lethality: share (%) of physical resistance a critical strike ignores. */
  critPhysPiercePct: number;
  /** Phantom Blades: most spectral blades a second (0 = no limit). */
  critBladeMax: number;
  /** A Thousand Cuts: critical damage (points) per Cut, the most Cuts, and what a crit costs. */
  cutPct: number;
  cutMax: number;
  cutSpend: number;

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
  /** Deflect: mana a block gives back, and seconds a block makes you immune to that damage type. */
  blockMana: number;
  blockGraceSec: number;
  /** Phalanx: points added to the block cap. */
  blockCapBonus: number;
  /** Immovable, Veteran's Resolve: percent off every hold on you, and the share it never goes under. */
  ccReductionPct: number;
  ccFloorPct: number;
  /** Immovable: 1 when nothing knocks you back. */
  knockbackImmune: number;
  /** Veteran's Resolve: percent off a shout's mana cost. */
  shoutCostPct: number;
  /** Last Oath: seconds the cheat death stuns what stands around you. */
  cheatDeathStunSec: number;
  /** Bleeds chain to nearby enemies, amplifying. */
  bloodTideAmplifyPct: number;
  bloodTideChains: number;
  bloodTideRadius: number;
  /**
   * Blood Tide (the Knight's): when a bleeding enemy dies, its stacks leap to
   * up to `tideLeapMax` enemies within `tideLeapRadius` metres, each leap
   * `tideLeapPct` percent stronger (`scenes/knight/KnightKit.ts`).
   */
  tideLeapPct: number;
  tideLeapMax: number;
  tideLeapRadius: number;

  /** The Paladin's own numbers (`passives/paladin.ts`). */
  pal: PaladinEffects;
  /** The Ranger's own numbers (`passives/ranger.ts`). */
  rgr: RangerEffects;
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
    manyMouthsPct: 0,
    auraStrengthPct: 0,
    auraRadiusM: 0,
    groundDurationPct: 0,
    groundDamagePct: 0,
    vsBleedingPct: 0,
    executeThreshold: 0,
    executeDamagePct: 0,
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
    hitStackDamagePct: 0,
    arcChance: 0,
    arcRadius: 0,
    arcDamagePct: 0,
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
    poisonHealPct: 0,
    guaranteedCritEvery: 0,
    guaranteedCritBonusPct: 0,
    veilKillExtendSec: 0,
    veilKillCapSec: 0,
    vsMissingLifePct: 0,
    resistPiercePct: 0,
    poisonStunStacks: 0,
    poisonStunSec: 0,
    poisonStunCd: 0,
    poisonSlows: false,
    onHitStatuses: [],
    pierceByType: {},
    elementPct: {},
    missingManaType: null,
    vsShockedPct: 0,
    shockLongerSec: 0,
    shatterPct: 0,
    shatterRadius: 0,
    shatterChill: 0,
    condCrit: [],
    castStackPct: 0,
    castStackMax: 0,
    castStackSec: 0,
    hitStackDecay: 0,
    killExplodeIgnite: 0,
    bleedDamagePct: 0,
    lowLifeBleedPct: 0,
    bleedDurationPct: 0,
    bleedHoldBelow: 0,
    critHemorrhage: 0,
    killFrenzy: 0,
    bleedLeechDouble: 0,
    cloneCount: 0,
    clonePowerPct: 0,
    mirrorStrikePct: 0,
    stealthReductionPct: 0,
    stealthRegenPct: 0,
    soulMaxStacks: 0,
    soulDamagePct: 0,
    soulManaRegen: 0,
    soulDurationSec: 0,
    soulRadius: 0,
    soulPerKill: 0,
    soulCageBonus: 0,
    cheatDeathSoulHealPct: 0,
    overhealShieldPct: 0,
    overhealCapPct: 0,
    minionStealShare: 0,
    freeShotEvery: 0,
    extraArrows: 0,
    manaToLifePct: 0,
    damagePer400Life: 0,
    lifePerMana: 0,
    lowManaDamagePct: 0,
    lowManaThreshold: 0,
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
    attritionRadius: 0,
    attritionResist: 0,
    attritionAttackSpeed: 0,
    hexPct: 0,
    killManaPct: 0,
    momentumMovePct: 0,
    momentumMoveCap: 0,
    momentumDamageShare: 0,
    trailDamagePct: 0,
    trailRadius: 0,
    trailSec: 0,
    trailTick: 0,
    trailPoisonPct: 0,
    poisonHoldBelow: 0,
    minionEliteLifePct: 0,
    minionEliteCleave: false,
    minionEliteMorePct: 0,
    minionSelfLeechPct: 0,
    minionKillHealPct: 0,
    capBySkill: {},
    choirRadius: 0,
    choirSec: 0,
    choirLifePct: 0,
    choirHealShare: 0,
    curseManaLeechPct: 0,
    curseCostPct: 0,
    curseSpreadMax: 0,
    avoidPct: 0,
    veilCritPct: 0,
    veilCostPct: 0,
    meleeCounterChance: 0,
    meleeCounterPct: 0,
    meleeCounterCrit: false,
    critPhysPiercePct: 0,
    critBladeMax: 0,
    cutPct: 0,
    cutMax: 0,
    cutSpend: 0,
    overkillCarryPct: 0,
    overkillChains: 0,
    overkillRadius: 0,
    allOathsPct: 0,
    drPerOath: 0,
    retributionPctPerBlock: 0,
    blockMana: 0,
    blockGraceSec: 0,
    blockCapBonus: 0,
    ccReductionPct: 0,
    ccFloorPct: 0,
    knockbackImmune: 0,
    shoutCostPct: 0,
    cheatDeathStunSec: 0,
    bloodTideAmplifyPct: 0,
    bloodTideChains: 0,
    bloodTideRadius: 0,
    tideLeapPct: 0,
    tideLeapMax: 0,
    tideLeapRadius: 0,
    pal: emptyPaladinEffects(),
    rgr: emptyRangerEffects(),
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
  // ---------------------------------------------------------------- knight
  riposte: (e, r, id) => {
    e.blockCounterChance += param(id, 'procChance', 20) + param(id, 'procPerRank', 4) * (r - 1);
    e.blockCounterPct = Math.max(e.blockCounterPct, 110 + 10 * (r - 1));
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
    e.cheatDeathStunSec = Math.max(e.cheatDeathStunSec, param(id, 'stun', 3));
  },
  deflect: (e, r, id) => {
    e.blockMana += param(id, 'manaOnBlock', 4) + param(id, 'manaPerRank', 1) * (r - 1);
    e.blockGraceSec = Math.max(e.blockGraceSec, param(id, 'graceWindow', 0.4));
  },
  immovable: (e, r, id) => {
    e.ccReductionPct += param(id, 'ccReductionPerRank', 4) * r;
    e.ccFloorPct = floorOf(e.ccFloorPct, param(id, 'ccFloor', 70));
    e.knockbackImmune = Math.max(e.knockbackImmune, param(id, 'knockbackImmune', 1));
  },
  veteransResolve: (e, r, id) => {
    e.ccReductionPct += param(id, 'ccReductionPerRank', 4) * r;
    e.ccFloorPct = floorOf(e.ccFloorPct, param(id, 'ccFloor', 70));
    e.shoutCostPct += param(id, 'shoutCostPerRank', 3) * r;
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
    e.lowLifeBleedPct += param(id, 'lowLifePct', 5) * r;
    e.bleedHoldBelow = Math.max(e.bleedHoldBelow, param(id, 'noExpire', 1) > 0 ? param(id, 'threshold', 40) : 0);
  },
  butchery: (e, r, id) => {
    e.bleedDamagePct += param(id, 'pctPerRank', 9) * r;
  },
  arterialStrike: (e, r, id) => {
    e.critHemorrhage = 1;
    e.bleedDurationPct += param(id, 'durationPerRank', 8) * r;
  },
  bloodDrinker: (e, r, id) => {
    e.bleedLeechDouble = Math.max(e.bleedLeechDouble, param(id, 'doubleVsBleeding', 1));
  },
  reaver: (e, r, id) => {
    e.killFrenzy = Math.max(e.killFrenzy, param(id, 'frenzyStacks', 1));
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
  },
  swornBrother: (e, r, id) => {
    e.minionDamagePct += param(id, 'damagePct', 60) + param(id, 'perRank', 4) * (r - 1);
    e.minionLifePct += param(id, 'lifePct', 80);
  },
  retribution: (e, r, id) => {
    e.retributionPctPerBlock += param(id, 'pctPerBlock', 3) + param(id, 'perRank', 1.5) * (r - 1);
    // It took Phalanx's rule when Gatefall replaced it: the block cap rises.
    e.blockCapBonus = Math.max(e.blockCapBonus, param(id, 'capBonus', 10));
  },
  bloodTide: (e, r, id) => {
    e.tideLeapPct += param(id, 'amplifyPct', 4) * r;
    e.tideLeapMax = Math.max(e.tideLeapMax, param(id, 'maxChains', 8));
    e.tideLeapRadius = Math.max(e.tideLeapRadius, param(id, 'radius', 6) + param(id, 'radiusPerRank', 0.3) * (r - 1));
  },
  theLastOrder: (e, r, id) => {
    e.allOathsPct += param(id, 'strength', 45) + param(id, 'perRank', 2.5) * (r - 1);
    e.drPerOath += param(id, 'drPerOath', 2);
  },

  // ------------------------------------------------------------ mage, fire
  scorch: (e, r, id) => {
    e.dotDamagePct += param(id, 'burnPerRank', 6) * r;
    // "Your fire hits apply Scorched" was in the tooltip and nowhere else.
    e.onHitStatuses.push({
      type: 'fire',
      id: 'scorched',
      chance: param(id, 'chance', 35) + param(id, 'chancePerRank', 4) * (r - 1),
      duration: param(id, 'duration', 8),
    });
  },
  combustion: (e, r, id) => {
    e.killExplodePct += param(id, 'pct', 80) + param(id, 'perRank', 10) * (r - 1);
    e.killExplodeRadius = Math.max(e.killExplodeRadius, param(id, 'radius', 3.5));
    e.killExplodeIgnite = Math.max(e.killExplodeIgnite, param(id, 'spreadBurn', 1));
  },
  fireMastery: (e, r, id) => {
    e.elementPct.fire = (e.elementPct.fire ?? 0) + param(id, 'damagePerRank', 9) * r;
    e.pierceByType.fire = Math.min(param(id, 'pierceFloor', 20), (e.pierceByType.fire ?? 0) + param(id, 'piercePerRank', 1) * r);
  },
  lightningMastery: (e, r, id) => {
    e.elementPct.lightning = (e.elementPct.lightning ?? 0) + param(id, 'damagePerRank', 10) * r;
    e.pierceByType.lightning = Math.min(param(id, 'pierceFloor', 25), (e.pierceByType.lightning ?? 0) + param(id, 'piercePerRank', 1) * r);
  },
  kindling: (e, r, id) => {
    e.condCrit.push({ when: 'burning', chance: 0, damage: param(id, 'critDmgPerRank', 8) * r });
  },
  deadlyAim: (e, r, id) => {
    e.condCrit.push({ when: 'healthy', chance: param(id, 'critPerRank', 1) * r, damage: 0 });
  },
  stormFury: (e, r, id) => {
    e.castStackPct += param(id, 'castSpeedPerStack', 1);
    e.castStackMax = Math.max(e.castStackMax, param(id, 'maxStacks', 10));
    e.castStackSec = Math.max(e.castStackSec, param(id, 'decay', 3));
  },
  emberSoul: (e, r, id) => {
    e.missingManaPct += param(id, 'pctPer10', 1) * r;
    e.missingManaCap = Math.max(e.missingManaCap, param(id, 'cap', 60));
    // "Your fire damage": the bonus is for fire hits only.
    e.missingManaType = 'fire';
  },
  cataclysm: (e, r, id) => {
    e.overkillCarryPct += param(id, 'carryPct', 60) + param(id, 'perRank', 3) * (r - 1);
    e.overkillChains = Math.max(
      e.overkillChains,
      // "+1 per 5 ranks".
      param(id, 'chains', 4) + (param(id, 'chainsPerRanks', 0) > 0 ? Math.floor(r / param(id, 'chainsPerRanks', 0)) : 0),
    );
    e.overkillRadius = Math.max(e.overkillRadius, param(id, 'radius', 8));
  },

  // ------------------------------------------------------- mage, lightning
  conductance: (e, r, id) => {
    // Shocked enemies take more from all your hits (any element), and every
    // Shocked you apply lasts longer. Nothing else.
    e.vsShockedPct += param(id, 'pctPerRank', 5) * r;
    e.shockLongerSec += param(id, 'durationPerRank', 0.4) * r;
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

  // ------------------------------------------------------------ mage, cold
  coldMastery: (e, r, id) => {
    e.elementPct.cold = (e.elementPct.cold ?? 0) + param(id, 'damagePerRank', 9) * r;
  },
  splinteringFrost: (e, r, id) => {
    e.shatterPct += param(id, 'lifePct', 20) + param(id, 'perRank', 1) * (r - 1);
    e.shatterRadius = Math.max(e.shatterRadius, param(id, 'radius', 3) + param(id, 'radiusPerRank', 0.1) * (r - 1));
    e.shatterChill = Math.max(e.shatterChill, param(id, 'chill', 3));
  },
  frostbite: (e, r, id) => {
    e.onHitStatuses.push({
      type: 'cold',
      id: 'chilled',
      chance: param(id, 'chance', 15) + param(id, 'chancePerRank', 3) * (r - 1),
      duration: param(id, 'duration', 3),
    });
  },
  shatterpoint: (e, r, id) => {
    e.vsDebuffedPct += param(id, 'pctPerRank', 5) * r;
  },
  permafrost: (e, r, id) => {
    e.curseDurationPct += param(id, 'durationPerRank', 6) * r;
  },
  absoluteZero: (e, r, id) => {
    e.onHitStatuses.push({
      type: 'cold',
      id: 'frozen',
      chance: param(id, 'chance', 10) + param(id, 'perRank', 1) * (r - 1),
      duration: param(id, 'duration', 1.5),
    });
    e.vsDebuffedPct += param(id, 'pctPerRank', 2) * r;
  },

  // ----------------------------------------------------------------- rogue
  antivenom: (e, r, id) => {
    e.poisonHealPct += param(id, 'healPct', 30) + param(id, 'perRank', 3) * (r - 1);
  },
  toxicology: (e, r, id) => {
    e.dotDamagePct += param(id, 'damagePerRank', 9) * r;
    e.dotDurationSec += param(id, 'durationPerRank', 0.4) * r;
  },
  toxicMastery: (e, r, id) => {
    e.dotDamagePct += param(id, 'damagePerRank', 6) * r;
    e.dotTickPct += param(id, 'tickRatePerRank', 4) * r;
  },
  cultivate: (e, r, id) => {
    // Poisoned holds 6 stacks; Cultivate grows that to its own ceiling.
    const extra = Math.min(Math.max(0, param(id, 'maxStacks', 12) - 6), Math.floor(r / Math.max(1, param(id, 'stacksPerRanks', 3))));
    e.dotMaxStacks += extra;
    e.dotDamagePct += param(id, 'bonusPerExtra', 5) * extra;
  },
  paralyticToxin: (e, r, id) => {
    e.poisonStunStacks = Math.max(e.poisonStunStacks, param(id, 'stunAtStacks', 5));
    e.poisonStunSec = Math.max(
      e.poisonStunSec,
      param(id, 'stunDuration', 1.5) + param(id, 'stunPerRank', 0.05) * (r - 1),
    );
    e.poisonStunCd = Math.max(e.poisonStunCd, param(id, 'internalCd', 8));
    e.poisonSlows = true;
  },
  corrosiveEdge: (e, r, id) => {
    // Its attack speed comes from the skill's stat table; this is the rest of
    // the tooltip, which nothing read: poison hits apply Corroded.
    e.onHitStatuses.push({
      type: 'poison',
      id: 'corroded',
      chance: param(id, 'chance', 30) + param(id, 'chancePerRank', 3.5) * (r - 1),
      duration: param(id, 'duration', 8),
    });
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
    e.trailRadius = Math.max(e.trailRadius, param(id, 'width', 1.6) / 2);
    e.trailSec = Math.max(e.trailSec, param(id, 'duration', 5));
    e.trailTick = param(id, 'tickRate', 0.5);
    e.trailPoisonPct = Math.max(e.trailPoisonPct, param(id, 'poisonChance', 40));
  },
  exploitWeakness: (e, r, id) => {
    e.critVulnerableSec = Math.max(e.critVulnerableSec, param(id, 'vulnerable', 8));
    e.vsDebuffedPct += param(id, 'vsDebuffedPerRank', 5) * r;
  },
  bleedingEdge: (e, r, id) => {
    e.critBleedStacks = Math.max(
      e.critBleedStacks,
      param(id, 'bleedStacks', 2) + Math.floor(r / Math.max(1, param(id, 'stacksPerRanks', 5))),
    );
    // Bleeds only, as the text says (Butchery's `bleedDamagePct`).
    e.bleedDamagePct += param(id, 'bleedDamagePerRank', 6) * r;
  },
  phantomBlades: (e, r, id) => {
    e.critBladeChance = Math.max(e.critBladeChance, param(id, 'chance', 100));
    e.critBladeRange = Math.max(e.critBladeRange, param(id, 'range', 9));
    e.critBladePct = Math.max(e.critBladePct, 90 + 15 * (r - 1));
    e.critBladeMax = Math.max(e.critBladeMax, param(id, 'maxPerSecond', 4));
  },
  lethality: (e, r, id) => {
    e.critPhysPiercePct = Math.max(e.critPhysPiercePct, Math.min(param(id, 'pierceCap', 40), param(id, 'piercePerRank', 2) * r));
  },
  riposteBlade: (e, r, id) => {
    e.meleeCounterChance = Math.max(e.meleeCounterChance, Math.min(param(id, 'chanceCap', 60), param(id, 'chancePerRank', 15) * r));
    e.meleeCounterPct = Math.max(e.meleeCounterPct, 160 + 20 * (r - 1));
    e.meleeCounterCrit = e.meleeCounterCrit || param(id, 'alwaysCrit', 0) > 0;
  },
  // Flurry: the speed a stack gives is fixed (the ceiling is near anyway);
  // each rank makes every stack hit harder.
  flurry: (e, r, id) => {
    e.hitStackAttackSpeed += param(id, 'attackSpeedPerStack', 8);
    e.hitStackDamagePct += param(id, 'damagePerStack', 2) + param(id, 'perRank', 0.3) * (r - 1);
    e.hitStackMax = Math.max(e.hitStackMax, param(id, 'maxStacks', 6));
    e.hitStackDecay = Math.max(e.hitStackDecay, param(id, 'decay', 2));
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
  nightEyes: (e, r, id) => {
    e.veilCritPct += param(id, 'critDamage', 25) + param(id, 'perRank', 3) * (r - 1);
  },
  darkPact: (e, r, id) => {
    e.veilCostPct += param(id, 'treeCostPerRank', 5) * r;
  },
  silhouette: (e, r, id) => {
    e.avoidPct = Math.max(e.avoidPct, Math.min(param(id, 'dodgeCap', 25), param(id, 'dodgePerRank', 1) * r));
  },
  // Mirror Gambit: your clones answer your skills' melee blows.
  mirrorGambit: (e, r, id) => {
    e.mirrorStrikePct += param(id, 'mimicPct', 40) + param(id, 'perRank', 4) * (r - 1);
  },
  apexPredator: (e, r, id) => {
    e.poisonHoldBelow = Math.max(e.poisonHoldBelow, param(id, 'threshold', 50));
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
    e.veilCritPct += param(id, 'critDamage', 40) + param(id, 'critPerRank', 5) * (r - 1);
    e.stealthReductionPct += 10;
    e.veilKillExtendSec = Math.max(e.veilKillExtendSec, param(id, 'extendPerKill', 1.5) + param(id, 'perRank', 0.15) * (r - 1));
    e.veilKillCapSec = Math.max(e.veilKillCapSec, param(id, 'cap', 20));
  },
  thousandCuts: (e, r, id) => {
    // Crits bank Cuts; a miss of a crit spends them (SkillRunner.tune).
    e.cutPct = Math.max(e.cutPct, param(id, 'critDamagePerCut', 2) + param(id, 'perRank', 0.3) * (r - 1));
    e.cutMax = Math.max(e.cutMax, param(id, 'maxCuts', 50));
    e.cutSpend = Math.max(1, param(id, 'spendCost', 5));
  },

  // -------------------------------------------------------------- revenant
  decay: (e, r, id) => {
    e.curseEffectPct += param(id, 'strengthPerRank', 8) * r;
    e.curseDurationPct += param(id, 'durationPerRank', 0.5) * r * 10;
  },
  curseMastery: (e, r, id) => {
    e.curseCostPct += param(id, 'costPerRank', 4) * r;
    e.curseDurationPct += param(id, 'costPerRank', 4) * r;
    e.curseEffectPct += param(id, 'costPerRank', 4) * r;
  },
  // Each curse past the first makes the next blow land harder.
  hexUponHex: (e, r, id) => {
    e.hexPct += param(id, 'pct', 6) + param(id, 'perRank', 0.6) * (r - 1);
  },
  bloodCurse: (e, r, id) => {
    e.curseLeechPct += param(id, 'lifePct', 6) + param(id, 'perRank', 0.8) * (r - 1);
    e.curseManaLeechPct = Math.max(e.curseManaLeechPct, param(id, 'manaPct', 3));
  },
  contagion: (e, r, id) => {
    e.curseSpreadRadius = Math.max(
      e.curseSpreadRadius,
      param(id, 'radius', 7) + param(id, 'perRank', 0.2) * (r - 1),
    );
    e.curseSpreadMax = Math.max(e.curseSpreadMax, param(id, 'maxTargets', 6));
  },
  // Its own status (`attrition`), laid by the scene's aura tick.
  attrition: (e, r, id) => {
    e.attritionRadius = Math.max(e.attritionRadius, param(id, 'radius', 8));
    e.attritionResist += param(id, 'resistPerRank', 1) * r;
    e.attritionAttackSpeed += param(id, 'attackSpeedPerRank', 2) * r;
  },
  theLongDecline: (e, r, id) => {
    e.curseDecayPctPerSec += param(id, 'pctPerSecond', 5) + param(id, 'perRank', 0.5) * (r - 1);
  },
  boneMastery: (e, r, id) => {
    e.minionLifePct += param(id, 'lifePerRank', 9) * r;
    e.minionDamagePct += param(id, 'damagePerRank', 7) * r;
  },
  // The army feeds itself: its own blows and kills heal the minion that landed them.
  marrowFeast: (e, r, id) => {
    e.minionAttackSpeedPct += param(id, 'attackSpeedPerRank', 6) * r;
    e.minionSelfLeechPct += param(id, 'leechPerRank', 0.8) * r;
    e.minionKillHealPct = Math.max(e.minionKillHealPct, param(id, 'healOnKillPct', 15));
  },
  ossuaryLord: (e, r, id) => {
    const add = (skill: string, per: number): void => {
      e.capBySkill[skill] = (e.capBySkill[skill] ?? 0) + Math.floor(r / Math.max(1, per));
    };
    add('raiseSkeleton', param(id, 'warriorPerRanks', 2));
    add('skeletalMage', param(id, 'magePerRanks', 4));
    add('claySentinel', param(id, 'sentinelPerRanks', 12));
  },
  skeletalKnight: (e, r, id) => {
    e.minionEliteCount = Math.max(
      e.minionEliteCount,
      param(id, 'count', 2) + Math.floor(r / Math.max(1, param(id, 'countPerRanks', 8))),
    );
    e.minionElitePowerPct += param(id, 'damagePct', 80) + param(id, 'perRank', 6) * (r - 1);
    e.minionEliteLifePct += param(id, 'lifePct', 120);
    e.minionEliteCleave = e.minionEliteCleave || param(id, 'cleave', 0) > 0;
  },
  // "More": multiplies the knight's blow, Skeletal Knight's bonus included.
  deathKnight: (e, r, id) => {
    e.minionEliteMorePct += param(id, 'damagePct', 40) + param(id, 'perRank', 4) * (r - 1);
    if (e.minionEliteCount === 0) e.minionEliteCount = 1;
  },
  theBoneChoir: (e, r, id) => {
    e.choirRadius = Math.max(e.choirRadius, param(id, 'radius', 4));
    e.choirSec = Math.max(e.choirSec, param(id, 'duration', 8) + param(id, 'perRank', 0.4) * (r - 1));
    e.choirLifePct = Math.max(e.choirLifePct, param(id, 'lifePct', 60) + param(id, 'lifePerRank', 4) * (r - 1));
    e.choirHealShare = Math.max(e.choirHealShare, param(id, 'healShare', 50));
  },
  blightMastery: (e, r, id) => {
    e.dotTickPct += param(id, 'tickRatePerRank', 3) * r;
  },
  ossuaryMastery: (e, r, id) => {
    e.minionDamagePct += param(id, 'damagePerRank', 6) * r;
  },
  reapSoul: (e, r, id) => {
    e.soulRadius = Math.max(e.soulRadius, param(id, 'radius', 12));
    e.soulPerKill = Math.max(e.soulPerKill, param(id, 'stacks', 1));
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
  soulCage: (e, _r, id) => {
    e.soulCageBonus = Math.max(e.soulCageBonus, param(id, 'bonusSouls', 2));
  },
  vampiricTouch: (e, _r, id) => {
    e.minionStealShare = Math.max(e.minionStealShare, param(id, 'minionShare', 50));
  },
  gravepactMastery: (e, _r, id) => {
    e.overhealShieldPct = Math.max(e.overhealShieldPct, param(id, 'overhealPct', 100));
    e.overhealCapPct = Math.max(e.overhealCapPct, param(id, 'shieldCapPct', 30));
  },
  crimsonCovenant: (e, r, id) => {
    e.lowManaThreshold = Math.max(e.lowManaThreshold, param(id, 'threshold', 50));
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
    e.cheatDeathSoulHealPct = Math.max(
      e.cheatDeathSoulHealPct,
      param(id, 'lifePerSoul', 6) + param(id, 'soulPerRank', 0.4) * (r - 1),
    );
    e.cheatDeathRadius = Math.max(e.cheatDeathRadius, 8);
  },
  // The Paladin's rules live in their own file.
  ...PALADIN_RULES,
  // The Shapeshifter's, kept in their own file.
  ...SHIFTER_RULES,
  // The Ranger's, in their own file.
  ...RANGER_RULES,
};

/** Every skill this engine knows how to run. */
export const IMPLEMENTED_PASSIVES: readonly string[] = Object.keys(RULES);

/**
 * The number each synergy-fed passive grows (`SYNERGIES` in data/skills.ts):
 * a passive has no damage ladder for its synergies to raise, so they raise
 * the thing it does.
 */
const SYNERGY_FIELDS: Partial<Record<string, Array<keyof PassiveEffects>>> = {
  retribution: ['retributionPctPerBlock'],
  bloodTide: ['tideLeapPct'],
  apexPredator: ['bloodTideAmplifyPct'],
  cataclysm: ['overkillCarryPct'],
  thousandCuts: ['cutPct'],
  riposte: ['blockCounterPct'],
  riposteBlade: ['meleeCounterPct'],
  phantomBlades: ['critBladePct'],
  theBoneChoir: ['choirLifePct'],
  theLongDecline: ['curseDecayPctPerSec'],
  theSecondDeath: ['cheatDeathNovaPct'],
  swornBrother: ['minionDamagePct'],
};

/**
 * Rules that build on another rule's numbers, so they run after every other:
 * Harvest adds to and stretches the Souls Reap Soul sets up.
 */
const RUN_LAST: ReadonlySet<string> = new Set(['harvestMastery']);

/**
 * Resolve a character's allocated passives into one flat record.
 *
 * Cheap enough to call per frame, but callers generally cache it alongside
 * `computeStats` since both only change when gear or skills change.
 */
export function passiveEffects(c: Character): PassiveEffects {
  const e = emptyEffects();
  // Two passes: a rule that grows another rule's numbers runs after it,
  // whichever was learned first (`RUN_LAST`).
  for (let pass = 0; pass < 2; pass++) for (const id of Object.keys(c.skills)) {
    if (RUN_LAST.has(id) !== (pass === 1)) continue;
    const r = rankOf(c, id);
    if (r <= 0) continue;
    const fields = SYNERGY_FIELDS[id];
    const before = fields?.map((k) => e[k] as number);
    RULES[id]?.(e, r, id);
    // Its synergies add their share to what this passive itself just gave.
    const more = fields ? synergyPct(id, c.skills) / 100 : 0;
    if (fields && before && more > 0) {
      fields.forEach((k, i) => {
        (e[k] as number) += ((e[k] as number) - before[i]!) * more;
      });
    }
  }
  // Item powers that are really passives on an item: cheat death, overkill,
  // arcs. `Stats` calls this with only `skills`, so equipment may be absent.
  if (c.equipment) applyPowerPassives(c, e);
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
  /** Storm Fury's cast speed stacks, and seconds before they fall away. */
  castStacks: number;
  castStackLeft: number;
  /** Countdown to the next damage-over-time spread tick. */
  spreadTimer: number;
  /** Souls banked from recent kills, and how long the oldest has left. */
  souls: number;
  soulTimer: number;
  /** Attacks since the last guaranteed critical. */
  swings: number;
  /** A Thousand Cuts: Cuts banked this fight. */
  cuts: number;
}

export function newPassiveState(): PassiveState {
  return { cheatDeathCd: 0, retribution: 0, moving: 0, hitStacks: 0, castStacks: 0, castStackLeft: 0, spreadTimer: 0, souls: 0, soulTimer: 0, swings: 0, cuts: 0 };
}

/**
 * The multiplier a packet gets against one specific target.
 *
 * `lifeFrac` is the target's remaining life as a fraction, `bleeding` and
 * `debuffed` describe what the player has already put on it.
 */
export function damageMultiplier(
  e: PassiveEffects,
  target: { lifeFrac: number; bleeding: boolean; debuffed: boolean; shocked?: boolean },
  self: {
    manaFrac: number;
    maxMana: number;
    lifeFrac: number;
    moving?: number;
    souls?: number;
    maxLife?: number;
    /** Flurry stacks held. */
    hitStacks?: number;
  },
  /** The hit's damage type, for bonuses that count one element only. */
  type?: DamageType,
): number {
  let pct = 0;
  if (e.hitStackDamagePct > 0) pct += e.hitStackDamagePct * (self.hitStacks ?? 0);
  if (target.bleeding) pct += e.vsBleedingPct;
  if (target.debuffed) pct += e.vsDebuffedPct;
  if (e.executeThreshold > 0 && target.lifeFrac * 100 <= e.executeThreshold) {
    pct += e.executeDamagePct;
  }
  if (target.shocked) pct += e.vsShockedPct;
  if (e.missingManaPct > 0 && (e.missingManaType === null || e.missingManaType === type)) {
    const missingTenths = Math.max(0, (1 - self.manaFrac) * 10);
    pct += Math.min(e.missingManaCap, e.missingManaPct * missingTenths);
  }
  // Hemotoxin reads the *target's* missing life, not the player's.
  if (e.vsMissingLifePct > 0) {
    pct += Math.max(0, (1 - target.lifeFrac) * 10) * e.vsMissingLifePct;
  }
  // Crimson Covenant pays out while you are running on empty.
  if (e.lowManaDamagePct > 0 && self.manaFrac * 100 < (e.lowManaThreshold || 50)) pct += e.lowManaDamagePct;
  // Souls banked from recent kills.
  if (e.soulDamagePct > 0 && (self.souls ?? 0) > 0) {
    pct += Math.min(e.soulMaxStacks, self.souls ?? 0) * e.soulDamagePct;
  }
  // Death's Embrace turns a deep life pool into damage.
  if (e.damagePer400Life > 0) pct += ((self.maxLife ?? 0) / 400) * e.damagePer400Life;
  if (e.maxManaPct > 0) {
    pct += Math.min(e.maxManaCap, e.maxManaPct * (self.maxMana / 200));
  }
  // Momentum: metres banked in the last few seconds turn into damage.
  if (e.momentumDamageShare > 0 && (self.moving ?? 0) > 0) {
    pct += Math.min(e.momentumMoveCap, self.moving ?? 0) * e.momentumDamageShare * 100;
  }
  return 1 + pct / 100;
}
