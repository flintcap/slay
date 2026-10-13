/**
 * SLAY — what each skill draws, for the "every skill is 1 of 1" rule.
 *
 * `SkillRunner.cast` draws a skill with the handler for its effect family (a
 * nova draws an expanding ring, a slam a cratered landing). On its own that
 * makes every nova the same nova in a different hue. A skill's motif is the
 * extra drawing that is its own: a shape laid out in its own motion on top of
 * the family's base drawing. `tools/check-unique.mjs` fails when two active
 * skills anywhere in the game share a signature, so a new skill has to bring
 * a new motif.
 */

import type { MotifShape, MotifMotion } from './Motifs';
import { SHIFTER_DRAWING, SHIFTER_MOTIFS } from './shifter/motifs';
import { PALADIN_DRAWING, PALADIN_MOTIFS } from './paladin/motifs';

/** What each effect family's handler draws, in plain words. Mirrors `SkillRunner.cast`. */
export const FAMILY_DRAWING: Readonly<Record<string, string>> = {
  melee: 'weapon swing', cleave: 'weapon swing', whirlwind: 'spinning swing',
  projectile: 'projectile', bolt: 'projectile',
  nova: 'expanding ring', slam: 'cratered landing', meteor: 'falling strike', sky: 'falling strike',
  beam: 'beam', cone: 'cone spray', chain: 'chained arcs', dash: 'dash swing',
  heal: 'heal burst',
  buff: 'self burst', aura: 'self burst', stance: 'self burst', shout: 'self burst',
  banner: 'self burst', self: 'self burst', absorb: 'self burst',
  ground: 'ground zone', trap: 'ground zone', ward: 'ground zone',
  summon: 'raised minion', minion: 'raised minion',
  curse: 'curse ring', debuff: 'curse ring', apply: 'curse ring',
  channel: 'tether beam', wave: 'ground wave', leap: 'leap landing', teleport: 'blink',
  detonate: 'explosion', corpse: 'explosion', point: 'explosion', aoe: 'explosion', capstone: 'explosion',
  ...SHIFTER_DRAWING,
  ...PALADIN_DRAWING,
};

/** Where a motif is drawn. */
export type MotifAt = 'self' | 'target' | 'front';

/** A skill's own drawing on top of its family's (`fx/Motifs.ts` has the words). */
export interface SkillMotif {
  /** What is drawn: skulls, thrown knives, rune wheels, cracks. */
  shape: MotifShape;
  /** How it moves: bursts out, rains down, spirals, orbits, marches. */
  motion: MotifMotion;
  /** Overrides where it is drawn (the family decides otherwise). */
  at?: MotifAt;
  /** Size multiplier. */
  size?: number;
}

const m = (shape: MotifShape, motion: MotifMotion, at?: MotifAt, size?: number): SkillMotif => ({ shape, motion, at, size });

/**
 * Skill id -> its own motif. Every pair is used once in the whole game, and
 * each fits its school: fire throws embers and pillars, frost shards and
 * rime, lightning arcs and strikes, poison globs and spores, bone spears and
 * skulls, steel knives, cracks and dust.
 */
export const SKILL_MOTIFS: Readonly<Record<string, SkillMotif>> = {
  // Warden: Bulwark.
  shieldWall: m('domes', 'wall'),
  shieldBash: m('shockfronts', 'pulse'),
  guardStance: m('aura rings', 'pulse'),
  shieldCharge: m('dust clouds', 'trail'),
  aegis: m('hex sigils', 'orbit'),
  fortressStance: m('cracks', 'ring'),
  shieldThrow: m('shock rings', 'zigzag'),
  // Warden: Carnage.
  cleave: m('slashes', 'sweep'),
  rend: m('blood spray', 'fan'),
  gash: m('blood pools', 'line'),
  overhead: m('craters', 'pulse'),
  sunder: m('stones', 'shatter'),
  maim: m('slashes', 'cross'),
  whirlwind: m('slashes', 'orbit'),
  gorefeast: m('blood spray', 'converge'),
  massacre: m('slashes', 'scatter'),
  ruin: m('cracks', 'line'),
  // Warden: Oath.
  battleCry: m('shock rings', 'ripple'),
  rallyingHorn: m('light pools', 'ring'),
  intimidate: m('eyes', 'ring'),
  bannerOfTheGate: m('light shafts', 'star'),
  tauntingRoar: m('wedges', 'burst'),
  warStomp: m('stones', 'burst'),
  earthshatter: m('stones', 'line'),
  heraldOfRuin: m('cracks', 'star'),

  // Mage: Conflagration.
  firebolt: m('embers', 'fan'),
  emberNova: m('cinders', 'burst'),
  flameLance: m('fire pillars', 'line'),
  fireball: m('embers', 'converge'),
  infernoStream: m('fire pools', 'fan'),
  blastWave: m('scorch marks', 'ring'),
  pyroclasm: m('cinders', 'fall'),
  firestorm: m('embers', 'rain'),
  dragonsBreath: m('embers', 'sweep'),
  annihilate: m('fire pillars', 'ring'),
  // Mage: Tempest.
  sparkbolt: m('sparks', 'fan'),
  shockNova: m('arcs', 'ring'),
  chainLightning: m('sparks', 'zigzag'),
  thunderclap: m('shock rings', 'pulse'),
  lightningStrike: m('fork burns', 'star'),
  tempestOrb: m('sparks', 'orbit'),
  thunderstorm: m('arcs', 'crown'),
  ballLightning: m('sparks', 'helix'),
  skyLance: m('lightning strikes', 'line'),
  ionize: m('storm fields', 'scatter'),
  eyeOfTheStorm: m('eyes', 'whirlpool'),
  heavensGate: m('lightning strikes', 'star'),
  // Mage: Frost.
  frostShard: m('ice shards', 'fan'),
  frostNova: m('ice shards', 'burst'),
  iceLance: m('ice shards', 'line'),
  iceArmor: m('ice shards', 'orbit'),
  glacialSpike: m('ice shards', 'shatter'),
  rimeField: m('rime', 'scatter'),
  blizzard: m('ice shards', 'rain'),
  frostStep: m('frost fields', 'trail'),
  frozenOrb: m('frost orbs', 'spiral'),
  wintersBreath: m('snowfall', 'fan'),
  glacialComet: m('frost orbs', 'fall'),

  // Shadowblade: Venom.
  viperStrike: m('fangs', 'converge'),
  coatBlades: m('globs', 'drip', 'self'),
  venomDart: m('globs', 'fan'),
  noxiousCloud: m('spore clouds', 'scatter'),
  plagueVial: m('globs', 'arch'),
  envenomBurst: m('globs', 'shatter'),
  deathLotus: m('leaves', 'spiral'),
  viperGod: m('fangs', 'helix'),
  // Shadowblade: Shadowcraft.
  shadowStep: m('smoke puffs', 'trail'),
  veil: m('smoke puffs', 'converge'),
  smokeBomb: m('smoke clouds', 'burst'),
  shadowClone: m('void orbs', 'pulse'),
  umbralAmbush: m('knives', 'converge'),
  vanish: m('smoke puffs', 'burst'),
  nightfall: m('void pools', 'scatter'),
  voidWalk: m('void orbs', 'trail'),
  assassinate: m('skulls', 'pulse'),
  // Shadowblade: Bladework.
  preciseCut: m('slashes', 'pulse'),
  fanOfKnives: m('knives', 'burst'),
  crippleTendon: m('slashes', 'zigzag'),
  doubleStrike: m('crescents', 'pulse'),
  whirlingBlades: m('saws', 'trail'),
  throwingSpree: m('knives', 'fan'),

  // Revenant: Ossuary.
  boneSpear: m('bone spikes', 'line'),
  raiseSkeleton: m('skulls', 'rise'),
  boneArmor: m('bone spears', 'orbit'),
  skeletalMage: m('skulls', 'crown'),
  boneSpirit: m('bone wisps', 'spiral'),
  claySentinel: m('stones', 'converge'),
  boneCage: m('bone spikes', 'ring'),
  boneStorm: m('bone wisps', 'orbit'),
  reassemble: m('bone wisps', 'converge'),
  boneNova: m('bone spears', 'burst'),
  grandOssuary: m('skulls', 'ring'),
  // Revenant: Blight.
  weaken: m('hex sigils', 'drip'),
  blightBolt: m('bubbles', 'fan'),
  amplifyDamage: m('hex sigils', 'star'),
  poisonNova: m('globs', 'burst'),
  terror: m('skulls', 'scatter'),
  corpseExplosion: m('blood spray', 'shatter'),
  doomBrand: m('sigil brands', 'pulse'),
  massConfusion: m('stars', 'crown'),
  pestilence: m('spore clouds', 'ring'),
  lowerResist: m('hex sigils', 'cross'),
  // Revenant: Gravepact.
  siphonLife: m('wisps', 'converge'),
  bloodPact: m('blood pools', 'ring'),
  gravechill: m('frost orbs', 'orbit'),
  soulCage: m('rune wheels', 'pulse'),
  exsanguinate: m('hearts', 'converge'),
  revenantForm: m('skulls', 'helix'),
  sanguineNova: m('blood spray', 'burst'),
  soulTether: m('wisps', 'trail'),
  reaping: m('crescents', 'burst'),

  // Ranger: Marksman.
  pierceShot: m('wedges', 'line'),
  huntersMark: m('hoops', 'pulse', 'target'),
  aimedShot: m('hoops', 'converge', 'target'),
  bleedingArrow: m('blood spray', 'line'),
  crippling: m('scuffs', 'zigzag'),
  oneShot: m('crosses', 'pulse', 'target'),
  // Ranger: Wildcraft.
  rollAway: m('scuffs', 'trail'),
  snareTrap: m('hoops', 'ring'),
  spikeTrap: m('bone spikes', 'rise'),
  thornBarrier: m('thorns', 'wall'),
  disengage: m('leaves', 'trail'),
  venomCoat: m('thorns', 'orbit'),
  camouflage: m('leaves', 'converge'),
  theWholeFloor: m('saws', 'scatter'),
  // Ranger: Volley.
  twinShot: m('feathers', 'fan'),
  scattershot: m('arrows', 'fan'),
  arrowRain: m('arrows', 'rain'),
  ricochet: m('wedges', 'zigzag'),
  fanFire: m('arrows', 'burst'),
  suppressing: m('arrows', 'line'),
  explosiveTip: m('flares', 'shatter'),
  darkenTheSky: m('arrows', 'fall'),
  ...SHIFTER_MOTIFS,
  ...PALADIN_MOTIFS,
};

/** Families drawn at the caster, at the point aimed at, or just in front. */
const AT_SELF = new Set(['nova', 'buff', 'aura', 'stance', 'shout', 'self', 'absorb', 'heal', 'aoe', 'capstone', 'whirlwind', 'minion']);
const AT_FRONT = new Set(['melee', 'cleave', 'projectile', 'bolt', 'beam', 'cone', 'channel', 'chain', 'wave', 'dash']);
/** Motions that circle a body: in front of the caster they belong on the caster. */
const ROUND_BODY = new Set<MotifMotion>(['orbit', 'crown', 'helix']);

/** Where a skill's motif is drawn. */
export function motifAt(family: string, targeting: string | undefined, motif: SkillMotif): MotifAt {
  if (motif.at) return motif.at;
  let at: MotifAt = AT_SELF.has(family) || targeting === 'self' ? 'self' : AT_FRONT.has(family) ? 'front' : 'target';
  if (at === 'front' && ROUND_BODY.has(motif.motion)) at = 'self';
  return at;
}

/** The family half of an effect id. */
export function familyOf(effect: string | undefined): string {
  return (effect ?? 'melee').split('.')[0] ?? 'melee';
}

/**
 * Everything a skill draws that a player could tell apart, without colour or
 * size: two skills with the same signature look like the same spell.
 */
export function visualSignature(skillId: string, effect: string | undefined): string {
  const fam = familyOf(effect);
  const base = FAMILY_DRAWING[fam] ?? 'fallback';
  const m = SKILL_MOTIFS[skillId];
  return m ? `${base} + ${m.shape} ${m.motion}` : base;
}
