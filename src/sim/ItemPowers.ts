/**
 * SLAY — item powers.
 *
 * Eighty-five uniques were written with a `special` id naming the one thing
 * that made each of them worth wearing — "all damage becomes fire", "once
 * every ninety seconds, death is declined", "enemies you kill explode" — and
 * nothing in the game read a single one. Every unique was a stat stick with a
 * promise printed on it.
 *
 * A *power* is that promise, made real. One table maps a power id to what it
 * does, at a magnitude (1 = the unique's own strength). Powers reach the game
 * through four doors, each owned by the system that already answers that
 * question:
 *
 *   - `passive`  folds into `PassiveEffects`, so a power that is really "a
 *                passive skill on an item" (cheat death, overkill, arcs)
 *                rides the hooks combat already runs for skills.
 *   - `stats`    transforms the finished stat sheet in `computeStats`
 *                (life per level, energy into elemental damage, the pact).
 *   - `runtime`  fills a flat `PowerEffects` record that the dungeon's power
 *                runtime (`scenes/PowerRuntime.ts`) reads at the moments a
 *                stat cannot express: a hit landing, a hit taken, a kill.
 *   - `affix`    lets the same power roll, weaker, on a magic or rare item —
 *                which is what makes a rare a build piece rather than numbers.
 *
 * Sources of powers on a character:
 *   - a unique's `special`
 *   - a full (or partial) set bonus's `power`
 *   - an item's rolled `powers` (power affixes)
 *
 * Everything in this file is pure. It reads a character and returns numbers.
 */

import type {
  Character,
  DamagePacket,
  EquipSlot,
  Item,
  ItemCategory,
  ItemPowerRoll,
  ItemRarity,
  Rng,
  Stats,
} from '../types';
import type { PassiveEffects } from './Passives';
import { getUnique } from '../data/uniques';
import { getSet } from '../data/sets';

// ---------------------------------------------------------------------------
// The runtime record
// ---------------------------------------------------------------------------

/**
 * What the power runtime needs to know, flattened. Percentages are whole
 * numbers. Everything defaults to zero, and zero means "this does nothing".
 */
export interface PowerEffects {
  // --- outgoing, before mitigation ------------------------------------
  /** Physical damage converted wholesale to fire. 0 or 100. */
  convertFirePct: number;
  /** Physical damage split between cold and arcane. 0 or 100. */
  convertColdArcanePct: number;
  /** More damage by damage type. */
  fireMorePct: number;
  coldMorePct: number;
  lightningMorePct: number;
  elementalMorePct: number;
  poisonMorePct: number;
  /** More damage on a critical strike. */
  critMorePct: number;
  /** More damage against a family. */
  vsUndeadPct: number;
  vsDemonPct: number;
  vsBeastPct: number;
  /** Less damage against everything that is not undead. */
  vsLivingPenaltyPct: number;
  /** Extra knockback on every hit. */
  knockback: number;
  /** Seconds of stagger a critical strike inflicts. */
  critStaggerSec: number;
  /** More damage against a staggered target. */
  vsStaggeredPct: number;

  // --- outgoing, after the hit lands ----------------------------------
  /** Critical strikes do not leech. */
  noCritLeech: number;
  /** Chance (%) to drain the target: deal and heal a share of the blow. */
  lifeTapChance: number;
  lifeTapPct: number;
  /** Chance (%) per hit to chill, weaken or terrify. */
  chillChance: number;
  weakenChance: number;
  fearDemonChance: number;
  /** Ignite everything within this radius of the struck target. */
  igniteRadius: number;
  /** A melee hit splashes this share onto everything near the target. */
  cleavePct: number;
  cleaveRadius: number;
  /** A ranged hit carries on to one more target at this share. */
  pierceChainPct: number;
  /** A ranged hit strikes the same target again on the way back. */
  returnHitPct: number;
  /** A skill hit repeats itself, a beat later, at this share. */
  echoHitPct: number;
  /** Mana restored per lightning hit, % of maximum. */
  manaOnLightningPct: number;
  /** Mana restored per fire hit while below half mana, % of maximum. */
  manaOnFireLowPct: number;
  /** Chance (%) to curse a target to drop an extra item. */
  wishCurseChance: number;

  // --- incoming ---------------------------------------------------------
  /** Share of damage taken that is paid from mana instead. */
  manaShieldPct: number;
  /** Less damage from ranged attacks and spells. */
  rangedTakenLessPct: number;
  /** Less poison damage taken. */
  poisonTakenLessPct: number;
  /** Poison taken restores mana instead of only hurting. */
  poisonFeedsPct: number;
  /** Immune to chill and freeze. */
  freezeImmune: number;
  /** Immune to stun, knockdown and knockback. */
  unstoppable: number;
  /** Mana restored on block, % of maximum. */
  manaOnBlockPct: number;
  /** Below this life %, a hit teleports you away. */
  panicBlinkPct: number;
  panicBlinkCooldown: number;
  /** A ward of this % of maximum life builds while at full life. */
  wardPct: number;

  // --- economy ----------------------------------------------------------
  /** Life restored per gold pickup, % of maximum. */
  goldToLifePct: number;

  // --- ticking ----------------------------------------------------------
  /** A rotting aura poisons everything within this radius each second. */
  rotAuraRadius: number;
  rotAuraPct: number;
  /** Iron sentries strike the nearest enemy every few seconds. */
  sentryPct: number;
  sentryInterval: number;

  // --- on kill ----------------------------------------------------------
  /** Cold kills shatter, freezing everything within this radius. */
  shatterRadius: number;
  /** Kills leave burning ground at this weapon percentage. */
  pyreKillPct: number;

  // --- on the move ------------------------------------------------------
  /** Footsteps leave burning prints that hurt what stands on them. */
  emberPrintPct: number;

  // --- set signatures -----------------------------------------------------
  /** Blocks store toll; the next melee skill hit spends it as a shockwave, per toll. */
  tollPct: number;
  tollMax: number;
  /** Each skill cast adds a planet; at nine, each fires a bolt for this share. */
  orreryPct: number;
  /** A kill hides you for this long, and the next hit crits. */
  unseenSec: number;
  /** Standing still a second, ranged hits carry into three more for this share. */
  stillPiercePct: number;
  /** Kills raise a grave that bursts a moment later for this share. */
  gravePct: number;
  /** A lit ring round you burns what stands in it, each second. */
  ringPct: number;
  ringRadius: number;
  /** Changing form leaves a wax double that holds foes, then bursts. */
  waxPct: number;
  /** Mud, water and frost do not slow you. */
  sureFooted: number;
  /** Nine casts heal this share of life and mana. */
  ninefoldPct: number;
  /** Fire you take charges a nova of this share. */
  kilnPct: number;
  /** A dodged hit bursts into shards for this share. */
  shardPct: number;
  /** Every few hits a bell rings round you for this share. */
  bellEvery: number;
  bellPct: number;
  /** An elite's death crowns you: more damage, less taken, for this long. */
  crownSec: number;
  crownPct: number;
  /** Chance an elite you kill drops one more item. */
  eliteDropChance: number;
}

export function emptyPowerEffects(): PowerEffects {
  return {
    convertFirePct: 0,
    convertColdArcanePct: 0,
    fireMorePct: 0,
    coldMorePct: 0,
    lightningMorePct: 0,
    elementalMorePct: 0,
    poisonMorePct: 0,
    critMorePct: 0,
    vsUndeadPct: 0,
    vsDemonPct: 0,
    vsBeastPct: 0,
    vsLivingPenaltyPct: 0,
    knockback: 0,
    critStaggerSec: 0,
    vsStaggeredPct: 0,
    noCritLeech: 0,
    lifeTapChance: 0,
    lifeTapPct: 0,
    chillChance: 0,
    weakenChance: 0,
    fearDemonChance: 0,
    igniteRadius: 0,
    cleavePct: 0,
    cleaveRadius: 0,
    pierceChainPct: 0,
    returnHitPct: 0,
    echoHitPct: 0,
    manaOnLightningPct: 0,
    manaOnFireLowPct: 0,
    wishCurseChance: 0,
    manaShieldPct: 0,
    rangedTakenLessPct: 0,
    poisonTakenLessPct: 0,
    poisonFeedsPct: 0,
    freezeImmune: 0,
    unstoppable: 0,
    manaOnBlockPct: 0,
    panicBlinkPct: 0,
    panicBlinkCooldown: 0,
    wardPct: 0,
    goldToLifePct: 0,
    rotAuraRadius: 0,
    rotAuraPct: 0,
    sentryPct: 0,
    sentryInterval: 0,
    shatterRadius: 0,
    pyreKillPct: 0,
    emberPrintPct: 0,
    tollPct: 0,
    tollMax: 0,
    orreryPct: 0,
    unseenSec: 0,
    stillPiercePct: 0,
    gravePct: 0,
    ringPct: 0,
    ringRadius: 0,
    waxPct: 0,
    sureFooted: 0,
    ninefoldPct: 0,
    kilnPct: 0,
    shardPct: 0,
    bellEvery: 0,
    bellPct: 0,
    crownSec: 0,
    crownPct: 0,
    eliteDropChance: 0,
  };
}

// ---------------------------------------------------------------------------
// Power definitions
// ---------------------------------------------------------------------------

/** What a stat transform may look at besides the sheet itself. */
export interface PowerStatContext {
  level: number;
}

/** Which kind of item a power affix may roll on. */
export type PowerSlotKind = 'weapon' | 'melee' | 'ranged' | 'caster' | 'armor' | 'shield' | 'jewelry';

export interface PowerAffix {
  /** Item kinds it may roll on. */
  on: PowerSlotKind[];
  /** Rolled magnitude range. */
  min: number;
  max: number;
  /** Lowest item level that can roll it. */
  ilvl: number;
  weight: number;
  /** Name word for a magic item ("of Embers"). */
  word: string;
}

export interface PowerDef {
  id: string;
  /** Short name, shown in bold. */
  name: string;
  /** Exact mechanical text at magnitude `m`. */
  desc: (m: number) => string;
  passive?: (e: PassiveEffects, m: number) => void;
  stats?: (s: Stats, ctx: PowerStatContext, m: number) => void;
  runtime?: (p: PowerEffects, m: number) => void;
  /** Present when the power can roll as an affix. */
  affix?: PowerAffix;
}

const pct = (n: number) => `${Math.round(n)}%`;
const r1 = (n: number) => (Math.round(n * 10) / 10).toString();

const DEFS: PowerDef[] = [
  // =========================================================================
  // Passive-backed: these ride hooks combat already runs for skills.
  // =========================================================================
  {
    id: 'cheatDeath',
    name: 'Declined',
    desc: (m) => `Once every ${Math.round(90 / m)} seconds, a killing blow is declined: you are healed to half life and untouchable for 2 seconds.`,
    passive: (e, m) => {
      const cd = Math.round(90 / m);
      e.cheatDeathCooldown = e.cheatDeathCooldown > 0 ? Math.min(e.cheatDeathCooldown, cd) : cd;
      e.cheatDeathHealPct = Math.max(e.cheatDeathHealPct, 50);
      e.cheatDeathInvuln = Math.max(e.cheatDeathInvuln, 2);
      e.cheatDeathRadius = Math.max(e.cheatDeathRadius, 6);
    },
  },
  {
    id: 'overkillSplash',
    name: 'Overflow',
    desc: (m) => `Overkill damage carries on at ${pct(50 * m)} to up to 3 enemies within 6 metres.`,
    passive: (e, m) => {
      e.overkillCarryPct += 50 * m;
      e.overkillChains = Math.max(e.overkillChains, 3);
      e.overkillRadius = Math.max(e.overkillRadius, 6);
    },
    affix: { on: ['weapon'], min: 0.3, max: 0.6, ilvl: 30, weight: 40, word: 'of Overflow' },
  },
  {
    id: 'corpseBurst',
    name: 'Corpse Burst',
    desc: (m) => `Enemies you kill explode for ${pct(60 * m)} of your weapon damage in a 3.5 metre blast.`,
    passive: (e, m) => {
      e.killExplodePct += 60 * m;
      e.killExplodeRadius = Math.max(e.killExplodeRadius, 3.5);
    },
    affix: { on: ['weapon', 'armor'], min: 0.35, max: 0.7, ilvl: 18, weight: 60, word: 'of Bursting' },
  },
  {
    id: 'momentum',
    name: 'Momentum',
    desc: (m) => `Each hit you land grants ${r1(4 * m)}% attack speed, stacking 8 times. Stacks fade when you stop hitting.`,
    passive: (e, m) => {
      e.hitStackAttackSpeed += 4 * m;
      e.hitStackMax = Math.max(e.hitStackMax, 8);
    },
    affix: { on: ['melee', 'armor'], min: 0.5, max: 1, ilvl: 16, weight: 55, word: 'of Momentum' },
  },
  {
    id: 'chainLightning',
    name: 'Forking',
    desc: (m) => `${pct(Math.min(100, 35 * m))} chance on hit to arc to another enemy within 7 metres for half damage.`,
    passive: (e, m) => {
      e.arcChance = Math.min(100, e.arcChance + 35 * m);
      e.arcRadius = Math.max(e.arcRadius, 7);
      e.arcDamagePct = Math.max(e.arcDamagePct, 50);
    },
    affix: { on: ['weapon', 'jewelry'], min: 0.3, max: 0.6, ilvl: 12, weight: 70, word: 'of Arcing' },
  },
  {
    id: 'fireSpread',
    name: 'Wildfire',
    desc: () => 'Every 2 seconds your burns leap to an enemy within 5 metres.',
    passive: (e) => {
      if (e.dotSpreadInterval === 0) e.dotSpreadInterval = 2;
      e.dotSpreadRadius = Math.max(e.dotSpreadRadius, 5);
      e.dotSpreadStacks += 1;
    },
  },
  {
    id: 'poisonPierce',
    name: 'Venom Through',
    desc: (m) => `Your poison ignores ${pct(Math.min(100, 80 * m))} of enemy poison resistance.`,
    passive: (e, m) => {
      e.resistPiercePct = Math.max(e.resistPiercePct, Math.min(100, 80 * m));
    },
  },
  {
    id: 'poisonStacks',
    name: 'Bottomless Venom',
    desc: (m) => `Afflictions you apply stack ${Math.round(8 * m)} times higher.`,
    passive: (e, m) => {
      e.dotMaxStacks += Math.round(8 * m);
    },
  },
  {
    id: 'slowAura',
    name: 'Mire',
    desc: (m) => `Enemies within 6 metres are slowed by ${pct(25 * m)} and weakened.`,
    passive: (e, m) => {
      e.auraDebuffRadius = Math.max(e.auraDebuffRadius, 6);
      e.auraSlowPct += 25 * m;
    },
  },
  {
    id: 'bloodMagic',
    name: 'Blood Magic',
    desc: () => 'When mana runs out, skills are paid for with life instead.',
    passive: (e) => {
      e.lifePerMana = Math.max(e.lifePerMana, 1.5);
    },
  },
  {
    id: 'summonGlass',
    name: 'Glass Servants',
    desc: () => 'Your summons deal 60% more damage but last half as long.',
    passive: (e) => {
      e.minionDamagePct += 60;
      e.minionDurationPct -= 50;
    },
  },
  {
    id: 'hymnAura',
    name: 'Shared Hymn',
    desc: (m) => `Your summons have ${pct(50 * m)} more life and leech ${r1(3 * m)}% of the damage they deal.`,
    passive: (e, m) => {
      e.minionLifePct += 50 * m;
      e.minionLeechPct += 3 * m;
    },
  },
  {
    id: 'convertLightning',
    name: 'Stormbound',
    desc: () => 'Your physical, fire and cold damage is dealt as lightning.',
    passive: (e) => {
      e.convertToLightningPct = Math.max(e.convertToLightningPct, 100);
    },
  },
  {
    id: 'culling',
    name: 'Culling',
    desc: (m) => `${pct(30 * m)} more damage to enemies below 20% life.`,
    passive: (e, m) => {
      e.executeThreshold = Math.max(e.executeThreshold, 20);
      e.executeDamagePct += 30 * m;
    },
    affix: { on: ['weapon'], min: 0.5, max: 1.2, ilvl: 10, weight: 80, word: 'of Culling' },
  },
  {
    id: 'killLife',
    name: 'Feast',
    desc: (m) => `Each kill restores ${r1(2 * m)}% of your maximum life.`,
    passive: (e, m) => {
      e.killLifePct += 2 * m;
    },
    affix: { on: ['weapon', 'armor', 'jewelry'], min: 0.5, max: 1.5, ilvl: 6, weight: 100, word: 'of the Feast' },
  },
  {
    id: 'killMana',
    name: 'Soul Sip',
    desc: (m) => `Each kill restores ${r1(3 * m)}% of your maximum mana.`,
    passive: (e, m) => {
      e.killManaPct += 3 * m;
    },
    affix: { on: ['caster', 'armor', 'jewelry'], min: 0.5, max: 1.5, ilvl: 6, weight: 90, word: 'of Sipping' },
  },
  {
    id: 'critBleed',
    name: 'Serrated',
    desc: (m) => `Critical strikes inflict ${Math.max(1, Math.round(2 * m))} stacks of Bleeding.`,
    passive: (e, m) => {
      e.critBleedStacks = Math.max(e.critBleedStacks, Math.max(1, Math.round(2 * m)));
    },
    affix: { on: ['melee', 'ranged'], min: 0.5, max: 1.5, ilvl: 14, weight: 60, word: 'of Serration' },
  },
  {
    id: 'critVulnerable',
    name: 'Exposing',
    desc: (m) => `Critical strikes leave the target Vulnerable for ${r1(4 * m)} seconds.`,
    passive: (e, m) => {
      e.critVulnerableSec = Math.max(e.critVulnerableSec, 4 * m);
    },
    affix: { on: ['weapon', 'jewelry'], min: 0.6, max: 1.4, ilvl: 20, weight: 50, word: 'of Exposure' },
  },
  {
    id: 'thorns',
    name: 'Thorns',
    desc: (m) => `Melee attackers take ${pct(20 * m)} of the damage they deal you.`,
    passive: (e, m) => {
      e.thornsMeleePct += 20 * m;
    },
    affix: { on: ['armor', 'shield'], min: 0.5, max: 1.5, ilvl: 4, weight: 90, word: 'of Thorns' },
  },
  {
    id: 'blockReflect',
    name: 'Answering Blow',
    desc: (m) => `Blocking returns ${pct(40 * m)} of the blow to the attacker and restores ${r1(4 * m)}% of your mana.`,
    passive: (e, m) => {
      e.thornsBlockPct += 40 * m;
    },
    runtime: (p, m) => {
      p.manaOnBlockPct += 4 * m;
    },
    affix: { on: ['shield'], min: 0.5, max: 1.2, ilvl: 10, weight: 70, word: 'of Answering' },
  },

  // =========================================================================
  // Runtime-backed: the power runtime acts on these at the moment they fire.
  // =========================================================================
  {
    id: 'convertFire',
    name: 'Kindled',
    desc: () => 'All physical damage you deal is dealt as fire.',
    runtime: (p) => {
      p.convertFirePct = 100;
    },
  },
  {
    id: 'convertColdArcane',
    name: 'Rimeweave',
    desc: () => 'Physical damage you deal becomes cold or arcane, split evenly.',
    runtime: (p) => {
      p.convertColdArcanePct = 100;
    },
  },
  {
    id: 'convertFirePierce',
    name: 'Pyre Pact',
    desc: (m) => `All physical damage you deal becomes fire, and your fire damage is ${pct(25 * m)} greater.`,
    runtime: (p, m) => {
      p.convertFirePct = 100;
      p.fireMorePct += 25 * m;
    },
  },
  {
    id: 'undeadSlayer',
    name: 'Undead Bane',
    desc: (m) => `${pct(100 * m)} more damage to undead, 15% less to everything else.`,
    runtime: (p, m) => {
      p.vsUndeadPct += 100 * m;
      p.vsLivingPenaltyPct = Math.max(p.vsLivingPenaltyPct, 15);
    },
  },
  {
    id: 'slayer.undead',
    name: 'Graveward',
    desc: (m) => `${pct(30 * m)} more damage to undead.`,
    runtime: (p, m) => {
      p.vsUndeadPct += 30 * m;
    },
    affix: { on: ['weapon', 'jewelry'], min: 0.6, max: 1.3, ilvl: 3, weight: 70, word: 'of the Graveward' },
  },
  {
    id: 'slayer.demon',
    name: 'Hellbane',
    desc: (m) => `${pct(30 * m)} more damage to demons.`,
    runtime: (p, m) => {
      p.vsDemonPct += 30 * m;
    },
    affix: { on: ['weapon', 'jewelry'], min: 0.6, max: 1.3, ilvl: 3, weight: 70, word: 'of Hellbane' },
  },
  {
    id: 'slayer.beast',
    name: 'Huntsman',
    desc: (m) => `${pct(30 * m)} more damage to beasts.`,
    runtime: (p, m) => {
      p.vsBeastPct += 30 * m;
    },
    affix: { on: ['weapon', 'jewelry'], min: 0.6, max: 1.3, ilvl: 3, weight: 70, word: 'of the Huntsman' },
  },
  {
    id: 'demonFear',
    name: 'Dread of Hell',
    desc: (m) => `${pct(40 * m)} more damage to demons, and your hits make demons flee.`,
    runtime: (p, m) => {
      p.vsDemonPct += 40 * m;
      p.fearDemonChance = Math.max(p.fearDemonChance, 35);
    },
  },
  {
    id: 'lightningFloor',
    name: 'Full Charge',
    desc: (m) => `Your lightning damage is ${pct(25 * m)} greater.`,
    runtime: (p, m) => {
      p.lightningMorePct += 25 * m;
    },
    affix: { on: ['caster', 'jewelry'], min: 0.4, max: 0.9, ilvl: 15, weight: 50, word: 'of Full Charge' },
  },
  {
    id: 'coldPierce',
    name: 'Deep Frost',
    desc: (m) => `Your cold damage is ${pct(35 * m)} greater.`,
    runtime: (p, m) => {
      p.coldMorePct += 35 * m;
    },
    affix: { on: ['caster', 'jewelry'], min: 0.4, max: 0.8, ilvl: 15, weight: 50, word: 'of Deep Frost' },
  },
  {
    id: 'emberHeart',
    name: 'Ember Heart',
    desc: (m) => `Your fire damage is ${pct(25 * m)} greater.`,
    runtime: (p, m) => {
      p.fireMorePct += 25 * m;
    },
    affix: { on: ['caster', 'jewelry'], min: 0.4, max: 0.9, ilvl: 15, weight: 50, word: 'of the Ember Heart' },
  },
  {
    id: 'elePierce',
    name: 'Elemental Edge',
    desc: (m) => `Your fire, cold, lightning and arcane damage is ${pct(20 * m)} greater.`,
    runtime: (p, m) => {
      p.elementalMorePct += 20 * m;
    },
  },
  {
    id: 'unblockableCrit',
    name: 'Through the Guard',
    desc: (m) => `Critical strikes slip past armour and deal ${pct(30 * m)} more damage.`,
    runtime: (p, m) => {
      p.critMorePct += 30 * m;
    },
    affix: { on: ['weapon'], min: 0.4, max: 0.8, ilvl: 22, weight: 45, word: 'of the Gap' },
  },
  {
    id: 'noCritLeech',
    name: 'Clean Kill',
    desc: () => 'Critical strikes deal 40% more damage, but cannot leech life.',
    runtime: (p) => {
      p.critMorePct += 40;
      p.noCritLeech = 1;
    },
  },
  {
    id: 'critStagger',
    name: 'Stagger',
    desc: (m) => `Critical strikes stagger for ${r1(0.6 * m)}s. Staggered enemies take ${pct(30 * m)} more damage.`,
    runtime: (p, m) => {
      p.critStaggerSec = Math.max(p.critStaggerSec, 0.6 * m);
      p.vsStaggeredPct += 30 * m;
    },
  },
  {
    id: 'knockback',
    name: 'Heavy Shot',
    desc: () => 'Every hit knocks its target back.',
    runtime: (p, m) => {
      p.knockback = Math.max(p.knockback, 3 * m);
    },
    affix: { on: ['ranged', 'melee'], min: 0.7, max: 1.2, ilvl: 8, weight: 40, word: 'of Force' },
  },
  {
    id: 'lifeTap',
    name: 'Life Tap',
    desc: (m) => `${pct(12 * m)} chance on hit to drain the target: deal 50% more and heal for it.`,
    runtime: (p, m) => {
      p.lifeTapChance += 12 * m;
      p.lifeTapPct = Math.max(p.lifeTapPct, 50);
    },
    affix: { on: ['weapon', 'jewelry'], min: 0.4, max: 1, ilvl: 16, weight: 55, word: 'of the Leech' },
  },
  {
    id: 'chillOnHit',
    name: 'Rime',
    desc: (m) => `${pct(Math.min(100, 100 * m))} chance on hit to Chill the target.`,
    runtime: (p, m) => {
      p.chillChance = Math.min(100, p.chillChance + 100 * m);
    },
    affix: { on: ['weapon'], min: 0.15, max: 0.35, ilvl: 6, weight: 70, word: 'of Rime' },
  },
  {
    id: 'decrepify',
    name: 'Decrepify',
    desc: (m) => `${pct(Math.min(100, 100 * m))} chance on hit to Weaken the target, cutting its damage by a third.`,
    runtime: (p, m) => {
      p.weakenChance = Math.min(100, p.weakenChance + 100 * m);
    },
    affix: { on: ['weapon', 'shield'], min: 0.15, max: 0.35, ilvl: 12, weight: 55, word: 'of Withering' },
  },
  {
    id: 'groundFire',
    name: 'Kindling Step',
    desc: () => 'Your hits ignite everything within 2.5 metres of the target.',
    runtime: (p, m) => {
      p.igniteRadius = Math.max(p.igniteRadius, 2.5 * m);
    },
  },
  {
    id: 'moltenTrail',
    name: 'Molten Slag',
    desc: () => 'Your hits splash molten slag, igniting everything within 3.5 metres of the target.',
    runtime: (p, m) => {
      p.igniteRadius = Math.max(p.igniteRadius, 3.5 * m);
    },
  },
  {
    id: 'worldCleave',
    name: 'World Cleave',
    desc: (m) => `Melee hits cleave ${pct(60 * m)} of their damage into everything within 3.5 metres and stagger it.`,
    runtime: (p, m) => {
      p.cleavePct += 60 * m;
      p.cleaveRadius = Math.max(p.cleaveRadius, 3.5);
    },
  },
  {
    id: 'cleave',
    name: 'Cleaving',
    desc: (m) => `Melee hits cleave ${pct(30 * m)} of their damage into everything within 2.5 metres.`,
    runtime: (p, m) => {
      p.cleavePct += 30 * m;
      p.cleaveRadius = Math.max(p.cleaveRadius, 2.5);
    },
    affix: { on: ['melee'], min: 0.5, max: 1.1, ilvl: 8, weight: 70, word: 'of Cleaving' },
  },
  {
    id: 'pierce',
    name: 'Piercing',
    desc: (m) => `Ranged hits carry on into another enemy within 6 metres for ${pct(70 * m)} damage.`,
    runtime: (p, m) => {
      p.pierceChainPct += 70 * m;
    },
    affix: { on: ['ranged'], min: 0.5, max: 1, ilvl: 10, weight: 60, word: 'of Piercing' },
  },
  {
    id: 'returning',
    name: 'Returning',
    desc: (m) => `Ranged hits strike the target a second time on the way back, for ${pct(50 * m)} damage.`,
    runtime: (p, m) => {
      p.returnHitPct += 50 * m;
    },
  },
  {
    id: 'echo',
    name: 'Echo',
    desc: (m) => `Every skill hit lands a second time a beat later, at ${pct(50 * m)} strength.`,
    runtime: (p, m) => {
      p.echoHitPct += 50 * m;
    },
    affix: { on: ['caster'], min: 0.2, max: 0.4, ilvl: 24, weight: 40, word: 'of Echoes' },
  },
  {
    id: 'manaldHeal',
    name: 'Grounding',
    desc: (m) => `Every lightning hit restores ${r1(1 * m)}% of your maximum mana.`,
    runtime: (p, m) => {
      p.manaOnLightningPct += 1 * m;
    },
  },
  {
    id: 'fireFree',
    name: 'Self-Stoking',
    desc: (m) => `While below half mana, every fire hit restores ${r1(2 * m)}% of your maximum mana.`,
    runtime: (p, m) => {
      p.manaOnFireLowPct += 2 * m;
    },
  },
  {
    id: 'wishCurse',
    name: 'Covetous',
    desc: (m) => `${pct(20 * m)} chance on hit to curse the target: when it dies it drops an extra item.`,
    runtime: (p, m) => {
      p.wishCurseChance += 20 * m;
    },
    affix: { on: ['jewelry'], min: 0.3, max: 0.6, ilvl: 20, weight: 35, word: 'of Wanting' },
  },
  {
    id: 'manaShield',
    name: 'Mana Shield',
    desc: (m) => `${pct(Math.min(100, 50 * m))} of damage taken is paid from your mana instead, while you have it.`,
    runtime: (p, m) => {
      p.manaShieldPct = Math.min(100, Math.max(p.manaShieldPct, 50 * m));
    },
  },
  {
    id: 'mythicManaShield',
    name: 'Mind Over Flesh',
    desc: () => 'All damage taken is paid from your mana while you have any. Poison cannot touch you.',
    runtime: (p) => {
      p.manaShieldPct = 100;
      p.poisonTakenLessPct = Math.max(p.poisonTakenLessPct, 100);
    },
  },
  {
    id: 'rangedDR',
    name: 'Turning Aside',
    desc: (m) => `You take ${pct(30 * m)} less damage from projectiles and spells.`,
    runtime: (p, m) => {
      p.rangedTakenLessPct = Math.min(75, p.rangedTakenLessPct + 30 * m);
    },
    affix: { on: ['shield', 'armor'], min: 0.3, max: 0.6, ilvl: 14, weight: 50, word: 'of Turning' },
  },
  {
    id: 'poisonImmuneFeedback',
    name: 'Venom Blood',
    desc: () => 'Poison deals you 60% less damage, and what it does deal restores mana.',
    runtime: (p) => {
      p.poisonTakenLessPct = Math.max(p.poisonTakenLessPct, 60);
      p.poisonFeedsPct = Math.max(p.poisonFeedsPct, 100);
    },
  },
  {
    id: 'poisonOvercap',
    name: 'Venomproof',
    desc: () => 'Poison deals you 35% less damage, beyond any resistance.',
    runtime: (p) => {
      p.poisonTakenLessPct = Math.max(p.poisonTakenLessPct, 35);
    },
  },
  {
    id: 'freezeImmune',
    name: 'Unfreezing',
    desc: () => 'You cannot be chilled or frozen.',
    runtime: (p) => {
      p.freezeImmune = 1;
    },
  },
  {
    id: 'unstoppable',
    name: 'Unstoppable',
    desc: () => 'You cannot be stunned, knocked down or knocked back.',
    runtime: (p) => {
      p.unstoppable = 1;
    },
  },
  {
    id: 'panicBlink',
    name: 'Panic Blink',
    desc: () => 'When a hit leaves you below 30% life, you blink away. Once every 15 seconds.',
    runtime: (p) => {
      p.panicBlinkPct = Math.max(p.panicBlinkPct, 30);
      p.panicBlinkCooldown = p.panicBlinkCooldown > 0 ? Math.min(p.panicBlinkCooldown, 15) : 15;
    },
  },
  {
    id: 'overhealShield',
    name: 'Overflowing Ward',
    desc: (m) => `While at full life you build a ward worth ${pct(25 * m)} of your life that absorbs damage.`,
    runtime: (p, m) => {
      p.wardPct += 25 * m;
    },
    affix: { on: ['armor'], min: 0.3, max: 0.6, ilvl: 24, weight: 40, word: 'of Warding' },
  },
  {
    id: 'goldToLife',
    name: 'Gilded Blood',
    desc: (m) => `Picking up gold restores ${r1(4 * m)}% of your maximum life.`,
    runtime: (p, m) => {
      p.goldToLifePct += 4 * m;
    },
    affix: { on: ['jewelry'], min: 0.5, max: 1, ilvl: 5, weight: 50, word: 'of Gilded Blood' },
  },
  {
    id: 'emberPrints',
    name: 'Warm Prints',
    desc: (m) =>
      `Your footsteps burn on the stone for 3 seconds. Anything standing in one takes ${pct(30 * m)} weapon damage as fire every half second and catches light.`,
    runtime: (p, m) => {
      p.emberPrintPct += 30 * m;
    },
  },
  {
    id: 'poisonNova',
    name: 'Rot Cyclone',
    desc: (m) => `A cyclone of rot poisons everything within 5 metres each second for ${pct(30 * m)} weapon damage.`,
    runtime: (p, m) => {
      p.rotAuraRadius = Math.max(p.rotAuraRadius, 5);
      p.rotAuraPct += 30 * m;
    },
  },
  {
    id: 'ironGolems',
    name: 'Iron Sentries',
    desc: (m) => `Two iron sentries fight beside you, each striking the nearest enemy every 2.5 seconds for ${pct(80 * m)} weapon damage.`,
    runtime: (p, m) => {
      p.sentryPct += 80 * m;
      p.sentryInterval = 2.5;
    },
  },
  {
    id: 'shatter',
    name: 'Shatter',
    desc: () => 'Chilled or frozen enemies shatter when they die, freezing everything within 4 metres.',
    runtime: (p, m) => {
      p.shatterRadius = Math.max(p.shatterRadius, 4 * m);
    },
  },
  {
    id: 'pyreKills',
    name: 'Pyre',
    desc: (m) => `Kills leave burning ground that deals ${pct(50 * m)} weapon damage as fire.`,
    runtime: (p, m) => {
      p.pyreKillPct += 50 * m;
    },
    affix: { on: ['weapon', 'armor'], min: 0.4, max: 0.8, ilvl: 18, weight: 45, word: 'of the Pyre' },
  },

  // Set signatures: each one the reason a full set is worth wearing.
  {
    id: 'tollgate',
    name: 'The Toll',
    desc: (m) => `Each block stores a toll, up to 5. Your next melee skill hit spends them all in a shockwave: ${pct(45 * m)} weapon damage per toll to everything within 4 metres, and a stagger.`,
    runtime: (p, m) => {
      p.tollPct += 45 * m;
      p.tollMax = 5;
    },
  },
  {
    id: 'orrery',
    name: 'The Ninth Hour',
    desc: (m) => `Each skill you cast sets a planet turning round you. At nine, all nine fly at your foes, each for ${pct(80 * m)} weapon damage as arcane.`,
    runtime: (p, m) => {
      p.orreryPct += 80 * m;
    },
  },
  {
    id: 'lampblack',
    name: 'Soot',
    desc: (m) => `A kill hides you in soot for ${r1(2 * m)} seconds: you take half damage, and your next hit is a critical strike.`,
    runtime: (p, m) => {
      p.unseenSec = Math.max(p.unseenSec, 2 * m);
    },
  },
  {
    id: 'heronwatch',
    name: 'Heron\'s Patience',
    desc: (m) => `Stand still for a second and your ranged hits carry on into three more enemies within 8 metres, for ${pct(70 * m)} damage each.`,
    runtime: (p, m) => {
      p.stillPiercePct += 70 * m;
    },
  },
  {
    id: 'pallbearer',
    name: 'Graves Dug',
    desc: (m) => `Every kill digs a grave. A moment later it bursts for ${pct(70 * m)} weapon damage as arcane within 3 metres, and you heal 2% of your life for each foe it strikes.`,
    runtime: (p, m) => {
      p.gravePct += 70 * m;
    },
  },
  {
    id: 'lanternRing',
    name: 'The Lit Ring',
    desc: (m) => `A ring of lamplight 5 metres wide burns round you. Enemies in it take ${pct(35 * m)} weapon damage as fire each second and are slowed.`,
    runtime: (p, m) => {
      p.ringPct += 35 * m;
      p.ringRadius = Math.max(p.ringRadius, 5);
    },
  },
  {
    id: 'waxDouble',
    name: 'Wax Double',
    desc: (m) => `Changing form leaves a wax double where you stood. Enemies near it are held for 2 seconds, and after 3 it melts in a burst of ${pct(120 * m)} weapon damage as fire.`,
    runtime: (p, m) => {
      p.waxPct += 120 * m;
    },
  },
  {
    id: 'sureFooted',
    name: 'Sure-Footed',
    desc: () => 'Nothing slows you: not mud, not water, not frost, not a snare.',
    runtime: (p) => {
      p.sureFooted = 1;
    },
  },
  {
    id: 'ninefold',
    name: 'Ninefold Hymn',
    desc: (m) => `Each skill you cast rings a note. On the ninth you heal ${pct(20 * m)} of your life and mana.`,
    runtime: (p, m) => {
      p.ninefoldPct += 20 * m;
    },
  },
  {
    id: 'kilnborn',
    name: 'Fired',
    desc: (m) => `Fire that hurts you fills the kiln. When it has taken a fifth of your life, it bursts round you for ${pct(150 * m)} weapon damage as fire.`,
    runtime: (p, m) => {
      p.kilnPct += 150 * m;
    },
  },
  {
    id: 'glasswing',
    name: 'Glass Shards',
    desc: (m) => `A hit you dodge bursts into glass: ${pct(60 * m)} weapon damage to everything within 3 metres, and they bleed.`,
    runtime: (p, m) => {
      p.shardPct += 60 * m;
    },
  },
  {
    id: 'drownedBell',
    name: 'The Drowned Bell',
    desc: (m) => `Every 10th hit rings a bell: ${pct(50 * m)} weapon damage to everything within 4 metres, which are knocked back and stunned for a moment.`,
    runtime: (p, m) => {
      p.bellEvery = 10;
      p.bellPct += 50 * m;
    },
  },
  {
    id: 'pretender',
    name: 'The Borrowed Crown',
    desc: (m) => `Killing a champion, elite or rare foe crowns you for 10 seconds: ${pct(35 * m)} more damage and 20% less damage taken.`,
    runtime: (p, m) => {
      p.crownSec = 10;
      p.crownPct += 35 * m;
    },
  },
  {
    id: 'cartographer',
    name: 'Marked on the Map',
    desc: (m) => `Champions, elites and rares you kill have a ${pct(Math.min(100, 35 * m))} chance to drop one more item.`,
    runtime: (p, m) => {
      p.eliteDropChance = Math.min(100, p.eliteDropChance + 35 * m);
    },
  },
  {
    id: 'hollowmere',
    name: 'The Last Lamp',
    desc: (m) => `Your light is a weapon. Enemies within 6 metres take ${pct(40 * m)} weapon damage as fire each second, catch light and are slowed.`,
    runtime: (p, m) => {
      p.ringPct += 40 * m;
      p.ringRadius = Math.max(p.ringRadius, 6);
    },
  },

  // =========================================================================
  // Stat transforms: resolved into the sheet by `computeStats`.
  // =========================================================================
  {
    id: 'eleFromEnergy',
    name: 'Channelled Mind',
    desc: (m) => `Gain ${r1(0.6 * m)}% elemental damage per point of Energy.`,
    stats: (s, _c, m) => {
      s.elementalDamagePct += s.energy * 0.6 * m;
    },
  },
  {
    id: 'manaScale',
    name: 'Deep Well',
    desc: (m) => `Gain 1% elemental damage per ${Math.round(25 / m)} maximum mana.`,
    stats: (s, _c, m) => {
      s.elementalDamagePct += (s.mana / 25) * m;
    },
  },
  {
    id: 'lifePerLevel',
    name: 'Growing Vigour',
    desc: (m) => `Gain ${Math.round(4 * m)} maximum life per character level.`,
    stats: (s, c, m) => {
      s.life += c.level * 4 * m;
    },
    affix: { on: ['armor', 'jewelry'], min: 0.3, max: 0.6, ilvl: 12, weight: 45, word: 'of Growing' },
  },
  {
    id: 'critPerLevel',
    name: 'Practised Eye',
    desc: (m) => `Gain ${r1(0.12 * m)}% critical strike chance per character level.`,
    stats: (s, c, m) => {
      s.critChance += c.level * 0.12 * m;
    },
  },
  {
    id: 'combatRegen',
    name: 'Battle Mending',
    desc: (m) => `Regenerate ${r1(0.8 * m)}% of your maximum life every second, in or out of combat.`,
    stats: (s, _c, m) => {
      s.lifeRegen += s.life * 0.008 * m;
    },
    affix: { on: ['armor'], min: 0.3, max: 0.6, ilvl: 20, weight: 40, word: 'of Mending' },
  },
  {
    id: 'runManaRegen',
    name: 'Wind Drinker',
    desc: (m) => `Gain ${r1(4 * m)} mana regeneration, plus ${r1(0.4 * m)} more per 1% movement speed.`,
    stats: (s, _c, m) => {
      s.manaRegen += (4 + Math.max(0, s.moveSpeed) * 0.4) * m;
    },
  },
  {
    id: 'voidCooldown',
    name: 'Void Clock',
    desc: (m) => `Your cooldowns recover ${pct(15 * m)} faster.`,
    stats: (s, _c, m) => {
      s.cooldownReduction += 15 * m;
    },
  },
  {
    id: 'fanaticism',
    name: 'Fanaticism',
    desc: (m) => `+${pct(20 * m)} attack speed, +${pct(15 * m)} cast speed and +${pct(10 * m)} movement speed.`,
    stats: (s, _c, m) => {
      s.attackSpeed += 20 * m;
      s.castSpeed += 15 * m;
      s.moveSpeed += 10 * m;
    },
  },
  {
    id: 'werebear',
    name: 'Bearform',
    desc: () => 'Your maximum life is 50% higher and your defense 30% higher, but you cast 20% slower.',
    stats: (s) => {
      s.life *= 1.5;
      s.defense *= 1.3;
      s.castSpeed -= 20;
    },
  },
  {
    id: 'hollowPact',
    name: 'Hollow Pact',
    desc: () => 'Your maximum life is 40% lower. Everything else is greater: +100% damage, +25% attack and cast speed, +20% all resistances.',
    stats: (s) => {
      s.life *= 0.6;
      s.enhancedDamage += 100;
      s.attackSpeed += 25;
      s.castSpeed += 25;
      s.fireResist += 20;
      s.coldResist += 20;
      s.lightningResist += 20;
      s.poisonResist += 20;
      s.arcaneResist += 20;
    },
  },

  // =========================================================================
  // Trades: a big gift with a real cost, for the depth plan's uniques. Each
  // reads as one plain line: what you get, then what it costs.
  // =========================================================================
  {
    id: 'glassJaw',
    name: 'Glass Jaw',
    desc: (m) => `+${pct(60 * m)} damage. Your defense is halved and you lose 15% damage reduction.`,
    stats: (s, _c, m) => {
      s.enhancedDamage += 60 * m;
      s.defense *= 0.5;
      s.damageReduction -= 15;
    },
  },
  {
    id: 'heavyTread',
    name: 'Heavy Tread',
    desc: (m) => `${pct(25 * m)} more life and ${pct(40 * m)} more defense, but you move 15% slower.`,
    stats: (s, _c, m) => {
      s.life *= 1 + 0.25 * m;
      s.defense *= 1 + 0.4 * m;
      s.moveSpeed -= 15;
    },
  },
  {
    id: 'featherweight',
    name: 'Featherweight',
    desc: (m) => `+${pct(18 * m)} movement speed and +${pct(12 * m)} attack speed. Your defense is 40% lower and your life 10% lower.`,
    stats: (s, _c, m) => {
      s.moveSpeed += 18 * m;
      s.attackSpeed += 12 * m;
      s.defense *= 0.6;
      s.life *= 0.9;
    },
  },
  {
    id: 'emberBargain',
    name: 'Ember Bargain',
    desc: (m) => `Your fire damage is ${pct(40 * m)} greater. Your cold resistance falls by 30.`,
    runtime: (p, m) => {
      p.fireMorePct += 40 * m;
    },
    stats: (s) => {
      s.coldResist -= 30;
    },
  },
  {
    id: 'frostBargain',
    name: 'Frost Bargain',
    desc: (m) => `Your cold damage is ${pct(40 * m)} greater. Your fire resistance falls by 30.`,
    runtime: (p, m) => {
      p.coldMorePct += 40 * m;
    },
    stats: (s) => {
      s.fireResist -= 30;
    },
  },
  {
    id: 'stormBargain',
    name: 'Storm Bargain',
    desc: (m) => `Your lightning damage is ${pct(40 * m)} greater. Your poison resistance falls by 30.`,
    runtime: (p, m) => {
      p.lightningMorePct += 40 * m;
    },
    stats: (s) => {
      s.poisonResist -= 30;
    },
  },
  {
    id: 'rotBargain',
    name: 'Rot Bargain',
    desc: (m) => `Your poison damage is ${pct(40 * m)} greater. You do not regenerate life.`,
    runtime: (p, m) => {
      p.poisonMorePct += 40 * m;
    },
    stats: (s) => {
      s.lifeRegen = Math.min(s.lifeRegen, 0);
    },
  },
  {
    id: 'miserPact',
    name: "Miser's Pact",
    desc: (m) => `+${pct(100 * m)} gold found and +${pct(40 * m)} magic find. Your damage is 25% lower.`,
    stats: (s, _c, m) => {
      s.goldFind += 100 * m;
      s.magicFind += 40 * m;
      s.enhancedDamage -= 25;
    },
  },
  {
    id: 'slowBlood',
    name: 'Slow Blood',
    desc: (m) => `Regenerate ${r1(1.2 * m)}% of your maximum life each second. You attack and cast 12% slower.`,
    stats: (s, _c, m) => {
      s.lifeRegen += s.life * 0.012 * m;
      s.attackSpeed -= 12;
      s.castSpeed -= 12;
    },
  },
  {
    id: 'leechHunger',
    name: 'Leech Hunger',
    desc: (m) => `+${r1(5 * m)}% life stolen from every hit. You do not regenerate life.`,
    stats: (s, _c, m) => {
      s.lifeSteal += 5 * m;
      s.lifeRegen = Math.min(s.lifeRegen, 0);
    },
  },
  {
    id: 'quietMind',
    name: 'Quiet Mind',
    desc: (m) => `Your mana regenerates ${pct(100 * m)} faster. Your maximum mana is 25% lower.`,
    stats: (s, _c, m) => {
      s.manaRegen *= 1 + m;
      s.mana *= 0.75;
    },
  },
  {
    id: 'stoneSkin',
    name: 'Stone Skin',
    desc: (m) => `+${r1(12 * m)}% damage reduction. You attack and cast 15% slower and move 8% slower.`,
    stats: (s, _c, m) => {
      s.damageReduction += 12 * m;
      s.attackSpeed -= 15;
      s.castSpeed -= 15;
      s.moveSpeed -= 8;
    },
  },
  {
    id: 'wildSwing',
    name: 'Wild Swing',
    desc: (m) => `+${r1(10 * m)}% critical strike chance and +${pct(40 * m)} critical damage. Your attack rating is 35% lower.`,
    stats: (s, _c, m) => {
      s.critChance += 10 * m;
      s.critDamage += 40 * m;
      s.attackRating *= 0.65;
    },
  },
  {
    id: 'narrowEdge',
    name: 'Narrow Edge',
    desc: (m) => `+${pct(50 * m)} damage. Your area damage is 40% lower.`,
    stats: (s, _c, m) => {
      s.enhancedDamage += 50 * m;
      s.areaDamagePct -= 40;
    },
  },
  {
    id: 'broadStroke',
    name: 'Broad Stroke',
    desc: (m) => `+${pct(45 * m)} area damage. Your other damage is 20% lower.`,
    stats: (s, _c, m) => {
      s.areaDamagePct += 45 * m;
      s.enhancedDamage -= 20;
    },
  },
  {
    id: 'spellward',
    name: 'Spellward',
    desc: (m) => `+${pct(25 * m)} to every elemental resistance. Your physical resistance falls by 15 and your defense by 30%.`,
    stats: (s, _c, m) => {
      s.fireResist += 25 * m;
      s.coldResist += 25 * m;
      s.lightningResist += 25 * m;
      s.poisonResist += 25 * m;
      s.arcaneResist += 25 * m;
      s.physicalResist -= 15;
      s.defense *= 0.7;
    },
  },
  {
    id: 'ironHide',
    name: 'Iron Hide',
    desc: (m) => `+${pct(15 * m)} physical resistance and ${pct(50 * m)} more defense. Every elemental resistance falls by 15.`,
    stats: (s, _c, m) => {
      s.physicalResist += 15 * m;
      s.defense *= 1 + 0.5 * m;
      s.fireResist -= 15;
      s.coldResist -= 15;
      s.lightningResist -= 15;
      s.poisonResist -= 15;
      s.arcaneResist -= 15;
    },
  },
  {
    id: 'deepWell',
    name: 'Deep Well',
    desc: (m) => `${pct(50 * m)} more maximum mana. Your maximum life is 15% lower.`,
    stats: (s, _c, m) => {
      s.mana *= 1 + 0.5 * m;
      s.life *= 0.85;
    },
  },
  {
    id: 'borrowedCraft',
    name: 'Borrowed Craft',
    desc: (m) => `+${Math.max(1, Math.round(m))} to all skills. Your maximum life is 20% lower.`,
    stats: (s, _c, m) => {
      s.skillLevels += Math.max(1, Math.round(m));
      s.life *= 0.8;
    },
  },
  {
    id: 'shortFuse',
    name: 'Short Fuse',
    desc: (m) => `Your cooldowns are ${pct(18 * m)} shorter. Your mana regenerates half as fast.`,
    stats: (s, _c, m) => {
      s.cooldownReduction += 18 * m;
      s.manaRegen *= 0.5;
    },
  },
  {
    id: 'warmBlood',
    name: 'Warm Blood',
    desc: (m) => `You cannot be chilled or frozen, and gain +${pct(30 * m)} cold resistance. Your fire resistance falls by 25.`,
    runtime: (p) => {
      p.freezeImmune = 1;
    },
    stats: (s, _c, m) => {
      s.coldResist += 30 * m;
      s.fireResist -= 25;
    },
  },
  {
    id: 'anchor',
    name: 'Anchor',
    desc: (m) => `You cannot be stunned, knocked down or knocked back, and gain +${r1(6 * m)}% damage reduction. You move 20% slower.`,
    runtime: (p) => {
      p.unstoppable = 1;
    },
    stats: (s, _c, m) => {
      s.damageReduction += 6 * m;
      s.moveSpeed -= 20;
    },
  },
  {
    id: 'thinAir',
    name: 'Thin Air',
    desc: (m) => `You take ${pct(30 * m)} less damage from projectiles and spells. Your maximum life is 15% lower.`,
    runtime: (p, m) => {
      p.rangedTakenLessPct += 30 * m;
    },
    stats: (s) => {
      s.life *= 0.85;
    },
  },
  {
    id: 'inkskin',
    name: 'Inkskin',
    desc: (m) => `${pct(Math.min(100, 30 * m))} of damage taken is paid from your mana instead. Your mana regenerates 40% slower.`,
    runtime: (p, m) => {
      p.manaShieldPct = Math.min(100, p.manaShieldPct + 30 * m);
    },
    stats: (s) => {
      s.manaRegen *= 0.6;
    },
  },
  {
    id: 'coldHands',
    name: 'Cold Hands',
    desc: (m) => `+${pct(20 * m)} cast speed. You attack 20% slower.`,
    stats: (s, _c, m) => {
      s.castSpeed += 20 * m;
      s.attackSpeed -= 20;
    },
  },
  {
    id: 'brightBurn',
    name: 'Bright Burn',
    desc: (m) => `+${pct(25 * m)} elemental damage and +${pct(15 * m)} cast speed. Your mana regenerates half as fast.`,
    stats: (s, _c, m) => {
      s.elementalDamagePct += 25 * m;
      s.castSpeed += 15 * m;
      s.manaRegen *= 0.5;
    },
  },
  {
    id: 'hardHead',
    name: 'Hard Head',
    desc: (m) => `${pct(20 * m)} more life. You cast 25% slower.`,
    stats: (s, _c, m) => {
      s.life *= 1 + 0.2 * m;
      s.castSpeed -= 25;
    },
  },
];

export const POWERS: readonly PowerDef[] = DEFS;
const BY_ID = new Map<string, PowerDef>(DEFS.map((d) => [d.id, d]));

export function getPower(id: string): PowerDef | undefined {
  return BY_ID.get(id);
}

/** Power affixes: the subset of powers that can roll on magic and rare items. */
export const POWER_AFFIXES: readonly PowerDef[] = DEFS.filter((d) => !!d.affix);

// ---------------------------------------------------------------------------
// Where powers come from
// ---------------------------------------------------------------------------

const EQUIP_SLOTS: readonly EquipSlot[] = [
  'mainHand', 'offHand', 'helm', 'chest', 'gloves', 'legs', 'boots', 'belt', 'amulet', 'ring1', 'ring2',
];

/** Every power one item carries on its own, with magnitude. */
export function itemPowers(item: Item): ItemPowerRoll[] {
  const out: ItemPowerRoll[] = [];
  if (item.uniqueId) {
    const def = getUnique(item.uniqueId);
    if (def?.special && BY_ID.has(def.special)) out.push({ id: def.special, mag: def.specialMag ?? 1 });
  }
  if (Array.isArray(item.powers)) {
    for (const p of item.powers) {
      if (p && typeof p.id === 'string' && BY_ID.has(p.id) && Number.isFinite(p.mag)) out.push(p);
    }
  }
  return out;
}

/** Set-bonus powers currently active, given everything worn. */
export function setPowers(equipment: Partial<Record<EquipSlot, Item>>): ItemPowerRoll[] {
  const counts = new Map<string, Set<string>>();
  for (const slot of EQUIP_SLOTS) {
    const item = equipment[slot];
    if (!item?.setId) continue;
    const seen = counts.get(item.setId) ?? new Set<string>();
    seen.add(item.uniqueId ?? item.baseId);
    counts.set(item.setId, seen);
  }
  const out: ItemPowerRoll[] = [];
  for (const [setId, seen] of counts) {
    const def = getSet(setId);
    if (!def) continue;
    for (const bonus of def.bonuses) {
      if (bonus.power && seen.size >= bonus.pieces && BY_ID.has(bonus.power)) {
        out.push({ id: bonus.power, mag: bonus.powerMag ?? 1 });
      }
    }
  }
  return out;
}

/** Every power a character has active, from every source. */
export function characterPowers(c: Pick<Character, 'equipment'>): ItemPowerRoll[] {
  const eq = c.equipment;
  if (!eq) return [];
  const out: ItemPowerRoll[] = [];
  for (const slot of EQUIP_SLOTS) {
    const item = eq[slot];
    if (item) out.push(...itemPowers(item));
  }
  out.push(...setPowers(eq));
  return out;
}

/** Folds passive-backed powers into a passive record. Called by `passiveEffects`. */
export function applyPowerPassives(c: Pick<Character, 'equipment'>, e: PassiveEffects): void {
  for (const p of characterPowers(c)) BY_ID.get(p.id)?.passive?.(e, p.mag);
}

/** Applies stat-transform powers to a finished sheet. Called by `computeStats`. */
export function applyPowerStats(c: Pick<Character, 'equipment' | 'level'>, s: Stats): void {
  const ctx: PowerStatContext = { level: Math.max(1, c.level ?? 1) };
  for (const p of characterPowers(c)) BY_ID.get(p.id)?.stats?.(s, ctx, p.mag);
}

/** The flat runtime record for a character. */
export function powerEffects(c: Pick<Character, 'equipment'>): PowerEffects {
  const out = emptyPowerEffects();
  for (const p of characterPowers(c)) BY_ID.get(p.id)?.runtime?.(out, p.mag);
  return out;
}

// ---------------------------------------------------------------------------
// Power affixes
// ---------------------------------------------------------------------------

const MELEE_CATS: ItemCategory[] = ['sword', 'axe', 'mace', 'dagger', 'spear'];
const RANGED_CATS: ItemCategory[] = ['bow', 'crossbow'];
const CASTER_CATS: ItemCategory[] = ['wand', 'staff', 'scepter', 'orb'];
const ARMOR_CATS: ItemCategory[] = ['helm', 'chest', 'gloves', 'pants', 'boots', 'belt'];
const JEWELRY_CATS: ItemCategory[] = ['ring', 'amulet'];

/** The kinds an item category counts as, for power-affix eligibility. */
export function powerKindsOf(category: ItemCategory): PowerSlotKind[] {
  const out: PowerSlotKind[] = [];
  if (MELEE_CATS.includes(category)) out.push('weapon', 'melee');
  if (RANGED_CATS.includes(category)) out.push('weapon', 'ranged');
  if (CASTER_CATS.includes(category)) out.push('weapon', 'caster');
  if (ARMOR_CATS.includes(category)) out.push('armor');
  if (category === 'shield') out.push('shield', 'armor');
  if (category === 'quiver') out.push('ranged');
  if (JEWELRY_CATS.includes(category)) out.push('jewelry');
  return out;
}

/**
 * What the main hand makes the character, for powers that care whether a hit
 * was a swing or a shot. Mirrors `SkillRunner.weaponStyle` without importing
 * the scene layer, so the power runtime stays testable under Node.
 */
export function weaponKind(category: ItemCategory | undefined): 'melee' | 'ranged' | 'caster' | 'unarmed' {
  if (!category) return 'unarmed';
  if (MELEE_CATS.includes(category)) return 'melee';
  if (RANGED_CATS.includes(category)) return 'ranged';
  if (CASTER_CATS.includes(category)) return 'caster';
  return 'unarmed';
}

/** Chance that an item of this rarity and level rolls a power affix. */
export function powerAffixChance(rarity: ItemRarity, ilvl: number): number {
  if (rarity === 'rare') return ilvl >= 10 ? Math.min(0.22, 0.08 + ilvl * 0.0015) : 0;
  if (rarity === 'magic') return ilvl >= 15 ? 0.035 : 0;
  return 0;
}

/** The power affixes that could roll on this category at this level. */
export function powerAffixPool(category: ItemCategory, ilvl: number): PowerDef[] {
  const kinds = powerKindsOf(category);
  if (kinds.length === 0) return [];
  return POWER_AFFIXES.filter((d) => d.affix!.ilvl <= ilvl && d.affix!.on.some((k) => kinds.includes(k)));
}

/**
 * Rolls one power affix for an item, or nothing. Magnitude rises with item
 * level inside the affix's range, so a deep drop is a better version of the
 * same power rather than a different thing.
 */
export function rollPowerAffix(
  category: ItemCategory,
  rarity: ItemRarity,
  ilvl: number,
  rng: Rng,
  force = false,
): ItemPowerRoll | null {
  if (!force && !rng.chance(powerAffixChance(rarity, ilvl))) return null;
  const pool = powerAffixPool(category, ilvl);
  if (pool.length === 0) return null;
  const def = rng.weighted(pool, (d) => d.affix!.weight);
  const a = def.affix!;
  // Skew toward the top of the range as item level climbs past the floor.
  const depthBias = Math.min(1, Math.max(0, (ilvl - a.ilvl) / 60));
  const t = Math.min(1, rng.next() * (1 - depthBias * 0.5) + depthBias * 0.5);
  const mag = Math.round((a.min + (a.max - a.min) * t) * 100) / 100;
  return { id: def.id, mag };
}

/** The name word a magic item takes from its power affix. */
export function powerWord(id: string): string | undefined {
  return BY_ID.get(id)?.affix?.word;
}

/** Tooltip lines for an item's powers. */
export function powerLines(item: Item): Array<{ name: string; text: string; source: 'unique' | 'affix' }> {
  const out: Array<{ name: string; text: string; source: 'unique' | 'affix' }> = [];
  if (item.uniqueId) {
    const def = getUnique(item.uniqueId);
    const p = def?.special ? BY_ID.get(def.special) : undefined;
    if (p) out.push({ name: p.name, text: p.desc(def?.specialMag ?? 1), source: 'unique' });
  }
  for (const roll of item.powers ?? []) {
    const p = BY_ID.get(roll.id);
    if (p) out.push({ name: p.name, text: p.desc(roll.mag), source: 'affix' });
  }
  return out;
}

/** Rough gold worth of a power affix, for pricing. */
export function powerValue(item: Item): number {
  let v = 0;
  for (const roll of item.powers ?? []) v += 900 * roll.mag;
  return v;
}

// ---------------------------------------------------------------------------
// Hook registry
// ---------------------------------------------------------------------------

/**
 * The seam between the entity layer and the power runtime.
 *
 * `Enemy.takeDamage` calls these for every packet the player threw; the
 * dungeon's power runtime installs them on entry and clears them on exit. The
 * types are deliberately loose here so the sim layer never imports entities.
 */
export const powerHooks: {
  outgoing: ((target: unknown, packet: DamagePacket, ctx: unknown) => DamagePacket) | null;
  afterHit: ((target: unknown, packet: DamagePacket, taken: number, ctx: unknown) => void) | null;
} = { outgoing: null, afterHit: null };
