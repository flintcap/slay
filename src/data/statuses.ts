/**
 * SLAY — status effect catalogue.
 *
 * Every buff, debuff, damage-over-time and hard crowd-control the game can
 * apply lives here. `src/sim/Status.ts` owns the runtime container; this file
 * is pure data.
 *
 * Design rules:
 *  - `mods` are FLAT stat deltas applied while the effect is active. Percentage
 *    style stats (`enhancedDamage`, `moveSpeed`, resistances, ...) are already
 *    expressed in percent by `Stats`, so a -30 on `moveSpeed` is -30%.
 *  - `dot.perSecond` is the damage per second at magnitude 1. The runtime
 *    multiplies by the application's `magnitude` and by the stack count.
 *  - `maxStacks` of 1 means a re-application refreshes instead of stacking.
 *  - `stacking` tells the runtime how a re-application of an already-present
 *    effect resolves. `strongest` keeps the higher magnitude, `extend` sums the
 *    remaining duration, `refresh` resets the timer, `stack` adds a stack.
 *  - `tags` drive immunity: a monster or player with immunity tag `cold` shrugs
 *    off every effect tagged `cold`. `control` is the hard-CC family that
 *    diminishing returns applies to.
 */

import type { StatusEffectDef, StatKey, DamageType } from '../types';

export type StatusTag =
  | 'dot'
  | 'control'
  | 'movement'
  | 'curse'
  | 'physical'
  | 'fire'
  | 'cold'
  | 'lightning'
  | 'poison'
  | 'arcane'
  | 'buff'
  | 'aura'
  | 'elite'
  | 'boss'
  | 'shred'
  | 'drain';

export type StatusStacking = 'refresh' | 'extend' | 'stack' | 'strongest';

/**
 * Extends the shared `StatusEffectDef` with the runtime metadata the status
 * system needs. Still assignable to `StatusEffectDef` everywhere.
 */
export interface StatusDef extends StatusEffectDef {
  desc: string;
  tags: readonly StatusTag[];
  stacking: StatusStacking;
  /** Hard crowd control obeys diminishing returns on repeat application. */
  diminishing?: boolean;
  /** Prevents all action while active (used by AI + player controller). */
  incapacitates?: boolean;
  /** Prevents movement but not attacks. */
  immobilises?: boolean;
  /** Life regenerated per second at magnitude 1 (heal-over-time side). */
  hot?: number;
  /** Mana restored per second at magnitude 1. */
  manaPerSecond?: number;
  /** Damage reflected to the attacker, as a fraction of the hit at magnitude 1. */
  reflect?: number;
  /** Absorbs this much damage per point of magnitude before expiring. */
  absorb?: number;
  /** Default duration in seconds when the applier does not specify one. */
  baseDuration: number;
}

function def(
  id: string,
  name: string,
  polarity: 1 | -1,
  o: Partial<StatusDef> & { desc: string; color: number; icon: string; tags: readonly StatusTag[] },
): StatusDef {
  return {
    id,
    name,
    polarity,
    maxStacks: o.maxStacks ?? 1,
    mods: o.mods,
    dot: o.dot,
    color: o.color,
    icon: o.icon,
    desc: o.desc,
    tags: o.tags,
    stacking: o.stacking ?? (o.maxStacks && o.maxStacks > 1 ? 'stack' : 'refresh'),
    diminishing: o.diminishing,
    incapacitates: o.incapacitates,
    immobilises: o.immobilises,
    hot: o.hot,
    manaPerSecond: o.manaPerSecond,
    reflect: o.reflect,
    absorb: o.absorb,
    baseDuration: o.baseDuration ?? 5,
  };
}

const dot = (type: DamageType, perSecond: number): { type: DamageType; perSecond: number } => ({
  type,
  perSecond,
});

const mods = (m: Partial<Record<StatKey, number>>): Partial<Record<StatKey, number>> => m;

// ---------------------------------------------------------------------------
// Elemental damage over time
// ---------------------------------------------------------------------------

export const STATUSES: StatusDef[] = [
  def('burning', 'Burning', -1, {
    desc: 'Seared flesh. Takes fire damage each second; stacks up to five times.',
    dot: dot('fire', 6),
    maxStacks: 5,
    stacking: 'stack',
    baseDuration: 4,
    color: 0xff6a1e,
    icon: 'flame',
    tags: ['dot', 'fire'],
  }),
  def('scorched', 'Scorched', -1, {
    desc: 'Charred armour. -25% fire resistance and -10% defense.',
    mods: mods({ fireResist: -25, enhancedDefense: -10 }),
    baseDuration: 8,
    color: 0xd94a12,
    icon: 'char',
    tags: ['fire', 'shred'],
  }),
  def('immolated', 'Immolated', -1, {
    desc: 'Wreathed in flame. Heavy fire damage over time that spreads on death.',
    dot: dot('fire', 22),
    maxStacks: 3,
    stacking: 'stack',
    baseDuration: 6,
    color: 0xffab20,
    icon: 'pyre',
    tags: ['dot', 'fire'],
  }),
  def('chilled', 'Chilled', -1, {
    desc: 'Numbed limbs. -30% movement speed and -15% attack speed.',
    mods: mods({ moveSpeed: -30, attackSpeed: -15 }),
    maxStacks: 1,
    stacking: 'strongest',
    baseDuration: 5,
    color: 0x7fd8ff,
    icon: 'snowflake',
    tags: ['cold', 'movement'],
  }),
  def('frozen', 'Frozen', -1, {
    desc: 'Locked in ice. Cannot act. Breaks early on heavy physical damage.',
    mods: mods({ enhancedDefense: -40, coldResist: -20 }),
    incapacitates: true,
    immobilises: true,
    diminishing: true,
    baseDuration: 2.5,
    color: 0xa8ecff,
    icon: 'ice-block',
    tags: ['cold', 'control'],
  }),
  def('frostbite', 'Frostbite', -1, {
    desc: 'Deep cold gnaws the bone: cold damage over time and -20% cold resistance.',
    dot: dot('cold', 7),
    mods: mods({ coldResist: -20 }),
    maxStacks: 4,
    stacking: 'stack',
    baseDuration: 6,
    color: 0x5fb7ff,
    icon: 'frost',
    tags: ['dot', 'cold', 'shred'],
  }),
  def('brittle', 'Brittle', -1, {
    desc: 'Frozen solid then thawed. Takes +18% damage from critical strikes.',
    mods: mods({ physicalResist: -12, coldResist: -12 }),
    baseDuration: 6,
    color: 0xc9f2ff,
    icon: 'crack',
    tags: ['cold', 'shred'],
  }),
  def('shocked', 'Shocked', -1, {
    desc: 'Nerves misfiring. -20% lightning resistance and erratic movement.',
    mods: mods({ lightningResist: -20, defense: -40 }),
    maxStacks: 3,
    stacking: 'stack',
    baseDuration: 4,
    color: 0x9fd0ff,
    icon: 'spark',
    tags: ['lightning', 'shred'],
  }),
  def('electrified', 'Electrified', -1, {
    desc: 'Arcing current. Lightning damage each second, and arcs to nearby foes.',
    dot: dot('lightning', 11),
    maxStacks: 3,
    stacking: 'stack',
    baseDuration: 4,
    color: 0x6fa8ff,
    icon: 'arc',
    tags: ['dot', 'lightning'],
  }),
  def('static', 'Static Charge', -1, {
    desc: 'Charge builds with every hit. At 10 stacks it detonates for lightning damage.',
    maxStacks: 10,
    stacking: 'stack',
    baseDuration: 8,
    color: 0xbfe4ff,
    icon: 'coil',
    tags: ['lightning'],
  }),
  def('poisoned', 'Poisoned', -1, {
    desc: 'Venom in the blood. Poison damage over time; also cuts healing by 30%.',
    dot: dot('poison', 5),
    mods: mods({ lifeRegen: -3 }),
    maxStacks: 6,
    stacking: 'stack',
    baseDuration: 8,
    color: 0x8fd44a,
    icon: 'droplet',
    tags: ['dot', 'poison'],
  }),
  def('envenomed', 'Envenomed', -1, {
    desc: 'A killing dose. Heavy poison damage that ramps the longer it runs.',
    dot: dot('poison', 16),
    maxStacks: 3,
    stacking: 'stack',
    baseDuration: 10,
    color: 0x6fbf2a,
    icon: 'vial',
    tags: ['dot', 'poison'],
  }),
  def('plagued', 'Plagued', -1, {
    desc: 'Contagious rot. Spreads to a nearby enemy every 2 seconds.',
    dot: dot('poison', 9),
    mods: mods({ enhancedDefense: -15 }),
    baseDuration: 12,
    color: 0x6d8a3a,
    icon: 'miasma',
    tags: ['dot', 'poison', 'curse'],
  }),
  def('corroded', 'Corroded', -1, {
    desc: 'Acid eats through plate: -35% defense while it lasts.',
    mods: mods({ enhancedDefense: -35 }),
    baseDuration: 8,
    color: 0xaacc3a,
    icon: 'acid',
    tags: ['poison', 'shred'],
  }),
  def('bleeding', 'Bleeding', -1, {
    desc: 'Open wound. Physical damage over time, doubled while the target moves.',
    dot: dot('physical', 8),
    maxStacks: 8,
    stacking: 'stack',
    baseDuration: 6,
    color: 0xb52020,
    icon: 'blood',
    tags: ['dot', 'physical'],
  }),
  def('hemorrhage', 'Hemorrhage', -1, {
    desc: 'A severed artery. Massive bleed that bursts for 40% of its remaining damage on expiry.',
    dot: dot('physical', 26),
    baseDuration: 5,
    color: 0x8e0f0f,
    icon: 'gash',
    tags: ['dot', 'physical'],
  }),
  def('rent', 'Rent', -1, {
    desc: 'Flesh laid open. Bleed effects on this target deal +30% damage.',
    mods: mods({ physicalResist: -15 }),
    baseDuration: 8,
    color: 0xd04040,
    icon: 'claw',
    tags: ['physical', 'shred'],
  }),
  def('soulburn', 'Soulburn', -1, {
    desc: 'Arcane fire in the spirit. Arcane damage over time that ignores 25% of resistance.',
    dot: dot('arcane', 13),
    maxStacks: 3,
    stacking: 'stack',
    baseDuration: 6,
    color: 0xc060ff,
    icon: 'sigil',
    tags: ['dot', 'arcane'],
  }),
  def('unmade', 'Unmade', -1, {
    desc: 'Reality frays around the target: -30% arcane resistance, -20% all other resists.',
    mods: mods({
      arcaneResist: -30,
      fireResist: -20,
      coldResist: -20,
      lightningResist: -20,
      poisonResist: -20,
    }),
    baseDuration: 6,
    color: 0xa03cff,
    icon: 'rift',
    tags: ['arcane', 'shred', 'curse'],
  }),

  // -------------------------------------------------------------------------
  // Hard and soft crowd control
  // -------------------------------------------------------------------------
  def('stunned', 'Stunned', -1, {
    desc: 'Reeling. Cannot act or move.',
    incapacitates: true,
    immobilises: true,
    diminishing: true,
    baseDuration: 1.6,
    color: 0xffe066,
    icon: 'stars',
    tags: ['control'],
  }),
  def('feared', 'Feared', -1, {
    desc: 'Flees blindly from the source of terror and cannot attack.',
    mods: mods({ moveSpeed: 20, enhancedDamage: -50 }),
    diminishing: true,
    baseDuration: 3,
    color: 0x9a67c9,
    icon: 'skull',
    tags: ['control'],
  }),
  def('slowed', 'Slowed', -1, {
    desc: '-35% movement speed.',
    mods: mods({ moveSpeed: -35 }),
    stacking: 'strongest',
    baseDuration: 4,
    color: 0x8899aa,
    icon: 'anchor',
    tags: ['movement'],
  }),
  def('rooted', 'Rooted', -1, {
    desc: 'Held fast. Cannot move, but may still attack and cast.',
    immobilises: true,
    diminishing: true,
    baseDuration: 3,
    color: 0x6f8a3a,
    icon: 'vine',
    tags: ['control', 'movement'],
  }),
  def('entangled', 'Entangled', -1, {
    desc: 'Grasping roots: -50% movement speed and -20% attack speed.',
    mods: mods({ moveSpeed: -50, attackSpeed: -20 }),
    baseDuration: 5,
    color: 0x5d7f2e,
    icon: 'bramble',
    tags: ['movement', 'poison'],
  }),
  def('blinded', 'Blinded', -1, {
    desc: 'Cannot see: -60% attack rating and greatly reduced aggro range.',
    mods: mods({ attackRating: -60, critChance: -15 }),
    baseDuration: 5,
    color: 0xdedede,
    icon: 'eye-closed',
    tags: ['control'],
  }),
  def('silenced', 'Silenced', -1, {
    desc: 'Cannot cast skills that cost mana.',
    diminishing: true,
    baseDuration: 3,
    color: 0x7a5fa8,
    icon: 'mute',
    tags: ['control'],
  }),
  def('disarmed', 'Disarmed', -1, {
    desc: 'Weapon knocked wide: -70% weapon damage.',
    mods: mods({ enhancedDamage: -70 }),
    baseDuration: 4,
    color: 0xb08040,
    icon: 'broken-sword',
    tags: ['control'],
  }),
  def('petrified', 'Petrified', -1, {
    desc: 'Turned to stone. Cannot act, but takes 40% less damage.',
    mods: mods({ damageReduction: 40 }),
    incapacitates: true,
    immobilises: true,
    diminishing: true,
    baseDuration: 3,
    color: 0x9a9284,
    icon: 'stone',
    tags: ['control'],
  }),
  def('confused', 'Confused', -1, {
    desc: 'Attacks the nearest creature, friend or foe.',
    diminishing: true,
    baseDuration: 4,
    color: 0xc678dd,
    icon: 'swirl',
    tags: ['control'],
  }),
  def('knockedDown', 'Knocked Down', -1, {
    desc: 'Flat on the floor. Cannot act until it stands.',
    incapacitates: true,
    immobilises: true,
    diminishing: true,
    baseDuration: 1.2,
    color: 0xd8c090,
    icon: 'fallen',
    tags: ['control', 'physical'],
  }),

  // -------------------------------------------------------------------------
  // Curses and shreds
  // -------------------------------------------------------------------------
  def('cursed', 'Cursed', -1, {
    desc: 'A hex settles in: -20% to all resistances and -10% defense.',
    mods: mods({
      fireResist: -20,
      coldResist: -20,
      lightningResist: -20,
      poisonResist: -20,
      arcaneResist: -20,
      enhancedDefense: -10,
    }),
    baseDuration: 12,
    color: 0x6c3fa0,
    icon: 'hex',
    tags: ['curse', 'shred'],
  }),
  def('weakened', 'Weakened', -1, {
    desc: 'Strength bleeds away: -35% damage dealt.',
    mods: mods({ enhancedDamage: -35 }),
    baseDuration: 10,
    color: 0x7a7f8c,
    icon: 'wilt',
    tags: ['curse'],
  }),
  def('vulnerable', 'Vulnerable', -1, {
    desc: 'Guard broken: takes +25% damage from every source.',
    mods: mods({
      physicalResist: -25,
      fireResist: -15,
      coldResist: -15,
      lightningResist: -15,
      poisonResist: -15,
      arcaneResist: -15,
    }),
    baseDuration: 8,
    color: 0xff8080,
    icon: 'target',
    tags: ['curse', 'shred'],
  }),
  def('sundered', 'Sundered', -1, {
    desc: 'Armour split apart: -45% defense and -12% physical resistance.',
    mods: mods({ enhancedDefense: -45, physicalResist: -12 }),
    maxStacks: 3,
    stacking: 'stack',
    baseDuration: 8,
    color: 0xc98f3a,
    icon: 'shard',
    tags: ['shred', 'physical'],
  }),
  def('marked', 'Marked', -1, {
    desc: 'Hunted. Attackers gain +15% critical strike chance against this target.',
    baseDuration: 10,
    color: 0xff4d6a,
    icon: 'crosshair',
    tags: ['curse'],
  }),
  def('doomed', 'Doomed', -1, {
    desc: 'Death is scheduled. When the timer ends the target takes a burst of arcane damage.',
    baseDuration: 6,
    color: 0x4b2f6e,
    icon: 'hourglass',
    tags: ['curse', 'arcane'],
  }),
  def('manaburn', 'Mana Burn', -1, {
    desc: 'Drains mana each second; drained mana is dealt as arcane damage.',
    dot: dot('arcane', 4),
    mods: mods({ manaRegen: -6 }),
    baseDuration: 6,
    color: 0x4f7ad6,
    icon: 'drain',
    tags: ['drain', 'arcane'],
  }),
  def('exhausted', 'Exhausted', -1, {
    desc: 'Muscles seize: -25% attack speed and -25% cast speed.',
    mods: mods({ attackSpeed: -25, castSpeed: -25 }),
    baseDuration: 8,
    color: 0x8d7f6a,
    icon: 'lungs',
    tags: ['curse'],
  }),
  def('crippled', 'Crippled', -1, {
    desc: 'Hamstrung: -45% movement speed and -20% dodge.',
    mods: mods({ moveSpeed: -45, defense: -80 }),
    baseDuration: 6,
    color: 0x9c5a2a,
    icon: 'hamstring',
    tags: ['movement', 'physical'],
  }),
  def('lifelink', 'Lifelinked', -1, {
    desc: 'Bound to a caster. A share of all damage it takes is drained as life.',
    baseDuration: 10,
    color: 0xa02040,
    icon: 'link',
    tags: ['drain', 'curse'],
  }),

  // -------------------------------------------------------------------------
  // Elite / boss inflicted
  // -------------------------------------------------------------------------
  def('grasped', 'Grasped', -1, {
    desc: 'Held by grave-hands. Rooted and taking physical damage each second.',
    dot: dot('physical', 10),
    immobilises: true,
    baseDuration: 3,
    color: 0x4a3a55,
    icon: 'hand',
    tags: ['control', 'elite'],
  }),
  def('hexbrand', 'Hexbrand', -1, {
    desc: "An elite's sigil burns on your chest: -40% life regeneration and -20% healing received.",
    mods: mods({ lifeRegen: -40 }),
    baseDuration: 15,
    color: 0x8a2be2,
    icon: 'brand',
    tags: ['elite', 'curse'],
  }),
  def('dreadaura', 'Dread', -1, {
    desc: 'The presence of something far larger. -15% damage and -10% movement speed.',
    mods: mods({ enhancedDamage: -15, moveSpeed: -10 }),
    baseDuration: 3,
    color: 0x241a2e,
    icon: 'shroud',
    tags: ['boss', 'aura'],
  }),
  def('voidtouched', 'Void-Touched', -1, {
    desc: 'Unravelling. Arcane damage over time and -1 to all skill levels.',
    dot: dot('arcane', 18),
    mods: mods({ skillLevels: -1 }),
    baseDuration: 10,
    color: 0x2a0f3d,
    icon: 'void',
    tags: ['boss', 'dot', 'arcane'],
  }),
  def('bossEnrage', 'Enraged', -1, {
    desc: 'The boss is out of patience: +60% damage, +25% attack speed.',
    mods: mods({ enhancedDamage: 60, attackSpeed: 25 }),
    baseDuration: 9999,
    color: 0xff2d2d,
    icon: 'rage',
    tags: ['boss'],
  }),

  // -------------------------------------------------------------------------
  // Buffs
  // -------------------------------------------------------------------------
  def('haste', 'Haste', 1, {
    desc: '+25% attack speed, +25% cast speed, +15% movement speed.',
    mods: mods({ attackSpeed: 25, castSpeed: 25, moveSpeed: 15 }),
    baseDuration: 12,
    color: 0xffe27a,
    icon: 'wing',
    tags: ['buff'],
  }),
  def('might', 'Might', 1, {
    desc: '+30% damage and +40 attack rating.',
    mods: mods({ enhancedDamage: 30, attackRating: 40 }),
    baseDuration: 20,
    color: 0xff9a3c,
    icon: 'fist',
    tags: ['buff', 'aura'],
  }),
  def('fortitude', 'Fortitude', 1, {
    desc: '+40% defense and +15 flat damage reduction.',
    mods: mods({ enhancedDefense: 40, damageReduction: 15 }),
    baseDuration: 20,
    color: 0x9ac6ff,
    icon: 'tower',
    tags: ['buff'],
  }),
  def('shielded', 'Shielded', 1, {
    desc: 'A ward absorbs incoming damage until it is spent.',
    absorb: 1,
    baseDuration: 12,
    color: 0x6fd0ff,
    icon: 'bubble',
    tags: ['buff'],
  }),
  def('regenerating', 'Regenerating', 1, {
    desc: 'Wounds knit closed — life restored every second.',
    hot: 8,
    baseDuration: 10,
    color: 0x5fd97a,
    icon: 'leaf',
    tags: ['buff'],
  }),
  def('empowered', 'Empowered', 1, {
    desc: '+35% elemental damage and +1 to all skills.',
    mods: mods({ elementalDamagePct: 35, skillLevels: 1 }),
    baseDuration: 10,
    color: 0xd0a0ff,
    icon: 'star',
    tags: ['buff'],
  }),
  def('thorns', 'Thorns', 1, {
    desc: 'Returns a share of every melee hit taken to the attacker.',
    reflect: 0.25,
    baseDuration: 15,
    color: 0x88a03a,
    icon: 'spike',
    tags: ['buff'],
  }),
  def('warded', 'Warded', 1, {
    desc: '+30 to all elemental resistances.',
    mods: mods({
      fireResist: 30,
      coldResist: 30,
      lightningResist: 30,
      poisonResist: 30,
      arcaneResist: 30,
    }),
    baseDuration: 20,
    color: 0x7ad0c0,
    icon: 'ward',
    tags: ['buff', 'aura'],
  }),
  def('evasion', 'Evasion', 1, {
    desc: '+60% defense and +10% movement speed.',
    mods: mods({ enhancedDefense: 60, moveSpeed: 10 }),
    baseDuration: 8,
    color: 0xa8ffd0,
    icon: 'feather',
    tags: ['buff'],
  }),
  def('focus', 'Focus', 1, {
    desc: '+8 mana regeneration and -15% skill cooldowns.',
    mods: mods({ manaRegen: 8, cooldownReduction: 15 }),
    baseDuration: 15,
    color: 0x6fa8ff,
    icon: 'lens',
    tags: ['buff'],
  }),
  def('frenzy', 'Frenzy', 1, {
    desc: 'Every kill feeds the next: +6% attack speed and +5% damage per stack.',
    mods: mods({ attackSpeed: 6, enhancedDamage: 5 }),
    maxStacks: 8,
    stacking: 'stack',
    baseDuration: 6,
    color: 0xff5a3c,
    icon: 'blade-storm',
    tags: ['buff'],
  }),
  def('bloodlust', 'Bloodlust', 1, {
    desc: '+8% life steal and +20% damage while it lasts.',
    mods: mods({ lifeSteal: 8, enhancedDamage: 20 }),
    baseDuration: 8,
    color: 0xc42b3a,
    icon: 'chalice',
    tags: ['buff', 'drain'],
  }),
  def('stoneform', 'Stoneform', 1, {
    desc: 'Immovable: +25 damage reduction, +20% physical resistance, -20% movement speed.',
    mods: mods({ damageReduction: 25, physicalResist: 20, moveSpeed: -20 }),
    baseDuration: 10,
    color: 0xa39786,
    icon: 'granite',
    tags: ['buff'],
  }),
  def('phasing', 'Phasing', 1, {
    desc: 'Half here, half elsewhere: +40% movement speed and passes through enemies.',
    mods: mods({ moveSpeed: 40 }),
    baseDuration: 4,
    color: 0xb0d0ff,
    icon: 'ghost',
    tags: ['buff', 'movement'],
  }),
  def('veiled', 'Veiled', 1, {
    desc: 'Unseen. Enemies lose track of you; the next attack is a guaranteed critical.',
    mods: mods({ moveSpeed: 15, critChance: 100 }),
    baseDuration: 6,
    color: 0x3a3f55,
    icon: 'cloak',
    tags: ['buff'],
  }),
  def('soulharvest', 'Soul Harvest', 1, {
    desc: 'Each soul reaped grants +3% damage and +2 mana regeneration.',
    mods: mods({ enhancedDamage: 3, manaRegen: 2 }),
    maxStacks: 15,
    stacking: 'stack',
    baseDuration: 30,
    color: 0x74d6c0,
    icon: 'wisp',
    tags: ['buff', 'drain'],
  }),
  def('overcharged', 'Overcharged', 1, {
    desc: '+45% lightning damage, and attacks arc to a second target.',
    mods: mods({ lightningDamage: 12, elementalDamagePct: 25 }),
    baseDuration: 8,
    color: 0x9fe0ff,
    icon: 'bolt',
    tags: ['buff', 'lightning'],
  }),
  def('inspired', 'Inspired', 1, {
    desc: '+2 to all skill levels.',
    mods: mods({ skillLevels: 2 }),
    baseDuration: 20,
    color: 0xffd98a,
    icon: 'banner',
    tags: ['buff', 'aura'],
  }),
  def('treasureSense', 'Treasure Sense', 1, {
    desc: '+60% magic find and +80% gold find.',
    mods: mods({ magicFind: 60, goldFind: 80 }),
    baseDuration: 45,
    color: 0xf5d76e,
    icon: 'coin',
    tags: ['buff'],
  }),
  def('sanctified', 'Sanctified', 1, {
    desc: 'Shrine-blessed: +20% to all damage, +20% defense, +15 all resistances.',
    mods: mods({
      enhancedDamage: 20,
      enhancedDefense: 20,
      fireResist: 15,
      coldResist: 15,
      lightningResist: 15,
      poisonResist: 15,
      arcaneResist: 15,
    }),
    baseDuration: 60,
    color: 0xfff0c0,
    icon: 'chalice-light',
    tags: ['buff'],
  }),
  def('secondWind', 'Second Wind', 1, {
    desc: 'Pulled back from the edge — heavy life regeneration, but it only fires once a minute.',
    hot: 30,
    mods: mods({ damageReduction: 20 }),
    baseDuration: 6,
    color: 0xffb0b0,
    icon: 'heart',
    tags: ['buff'],
  }),
  def('siphoning', 'Siphoning', 1, {
    desc: 'Life flows from the wounded to you: +12% life steal.',
    mods: mods({ lifeSteal: 12 }),
    baseDuration: 10,
    color: 0x8a2a5a,
    icon: 'siphon',
    tags: ['buff', 'drain'],
  }),
];

export const STATUS_BY_ID: Record<string, StatusDef> = Object.create(null);
for (const s of STATUSES) STATUS_BY_ID[s.id] = s;

export function getStatus(id: string): StatusDef | undefined {
  return STATUS_BY_ID[id];
}

/**
 * Registers a status at runtime. Used for skill-granted buffs so the icon and
 * timer on the HUD carry the skill's own name instead of a generic label.
 * Never overwrites an authored status.
 */
export function registerStatus(d: StatusDef): StatusDef {
  const existing = STATUS_BY_ID[d.id];
  if (existing) return existing;
  STATUS_BY_ID[d.id] = d;
  STATUSES.push(d);
  return d;
}

/** Builds a buff definition for a skill that has no authored status. */
export function synthesizeSkillBuff(
  skillId: string,
  name: string,
  color: number,
  icon: string,
  baseDuration: number,
): StatusDef {
  return registerStatus(
    def(`skill.${skillId}`, name, 1, {
      desc: `Granted by ${name}.`,
      color,
      icon,
      tags: ['buff'],
      baseDuration,
      stacking: 'refresh',
    }),
  );
}

/** All ids carrying a given tag — used to build immunity sets. */
export function statusesWithTag(tag: StatusTag): StatusDef[] {
  return STATUSES.filter((s) => s.tags.includes(tag));
}

/** Hard crowd control, for diminishing-returns bookkeeping. */
export const CONTROL_STATUSES: readonly string[] = STATUSES.filter((s) => s.tags.includes('control')).map(
  (s) => s.id,
);

export const DOT_STATUSES: readonly string[] = STATUSES.filter((s) => s.dot).map((s) => s.id);

/**
 * Diminishing returns table for repeated hard CC on the same target inside the
 * DR window. Fourth and later applications are fully resisted.
 */
export const CC_DIMINISHING: readonly number[] = [1, 0.5, 0.25, 0];
export const CC_DR_WINDOW = 12;
