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
 *
 * i18n-ignore-file: words that name what a skill draws, never shown to a player.
 */

import type { MotifShape, MotifMotion } from './Motifs';
import type { School } from './kit/Palette';
import { SHIFTER_DRAWING, SHIFTER_MOTIFS } from './shifter/motifs';
import { PALADIN_DRAWING, PALADIN_MOTIFS } from './paladin/motifs';
import { mageParticles } from './mage/looks';

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
 *
 * Weapon skills that swing the real weapon (`plainMove` in
 * `art/hero/SkillActions.ts`) have none, by the owner's call: a blade skill
 * draws only its swing, never a spell shape.
 */
export const SKILL_MOTIFS: Readonly<Record<string, SkillMotif>> = {
  // Warden: Bulwark.
  shieldWall: m('domes', 'wall'),
  guardStance: m('aura rings', 'pulse'),
  aegis: m('hex sigils', 'orbit'),
  fortressStance: m('cracks', 'ring'),
  shieldThrow: m('shock rings', 'zigzag'),
  // Warden: Carnage.
  gorefeast: m('blood spray', 'converge'),
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
  pyreBrand: m('sigil brands', 'arch'),
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
  stormstride: m('fork burns', 'trail'),
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
  coatBlades: m('globs', 'drip', 'self'),
  venomDart: m('globs', 'fan'),
  noxiousCloud: m('spore clouds', 'scatter'),
  plagueVial: m('globs', 'arch'),
  envenomBurst: m('globs', 'shatter'),
  viperGod: m('fangs', 'helix'),
  // Shadowblade: Shadowcraft.
  shadowStep: m('smoke puffs', 'trail'),
  veil: m('smoke puffs', 'converge'),
  smokeBomb: m('smoke clouds', 'burst'),
  shadowClone: m('void orbs', 'pulse'),
  vanish: m('smoke puffs', 'burst'),
  nightfall: m('void pools', 'scatter'),
  voidWalk: m('void orbs', 'trail'),
  // Shadowblade: Bladework.
  fanOfKnives: m('knives', 'burst'),
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

// ---------------------------------------------------------------------------
// Particle signatures
// ---------------------------------------------------------------------------

/**
 * Each skill's own burst and wake, drawn from its school's pool and keyed off
 * its id, plus a small spread of density and size: two fire skills are still
 * both plainly fire, never the same spell.
 *
 * Keyed on the school, not the damage type: an untyped curse of the Tempest
 * tree draws as lightning, bone magic as bone. Pools stay inside their
 * element, and none throws meat: a skill gores nothing by itself (bodies
 * bleed by their own material, `fx/Materials.ts`).
 */
const PARTICLE_POOLS: Readonly<Record<School, { burst: readonly string[]; trail: readonly string[] }>> = {
  physical: { burst: ['hit.physical', 'sparks', 'dust', 'impact'], trail: ['sparks', 'dust', 'smoke'] },
  fire: { burst: ['hit.fire', 'fire', 'embers', 'explosion', 'ash'], trail: ['fire', 'embers', 'smoke'] },
  cold: { burst: ['hit.cold', 'frost', 'steam', 'shieldHit'], trail: ['frost', 'steam'] },
  lightning: { burst: ['hit.lightning', 'shock', 'sparks', 'explosion'], trail: ['shock', 'sparks'] },
  poison: { burst: ['hit.poison', 'poison', 'dissolve', 'steam'], trail: ['poison', 'dissolve'] },
  arcane: { burst: ['hit.arcane', 'arcane', 'teleport', 'portal', 'void'], trail: ['arcane', 'summon', 'void'] },
  bone: { burst: ['hit.bone', 'chips.bone', 'dust'], trail: ['dust', 'smoke'] },
};

export interface ParticleSig {
  emitter: string;
  trail: string;
  density: number;
  size: number;
}

/** Stable small integer from a skill id. */
function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A skill's own burst, wake, density and size in its school. */
export function skillParticles(skillId: string, school: School): ParticleSig {
  const pool = PARTICLE_POOLS[school] ?? PARTICLE_POOLS.physical;
  const h = hashId(skillId);
  // A Mage skill draws in its tree's own look (`fx/mage/looks.ts`).
  const mage = mageParticles(skillId, h);
  return {
    emitter: mage?.emitter ?? pool.burst[h % pool.burst.length]!,
    trail: mage?.trail ?? pool.trail[(h >>> 4) % pool.trail.length]!,
    // Small, deliberate spread: enough to feel different, not enough to make
    // one skill read as twice the spell another is.
    density: 0.75 + ((h >>> 8) % 9) * 0.09,
    size: 0.82 + ((h >>> 12) % 8) * 0.055,
  };
}

// ---------------------------------------------------------------------------
// Rank
// ---------------------------------------------------------------------------

// The per-rank lift lives with the effect kit, which applies it to every
// layer, core and light a skill's drawing makes (`fx/kit/Boost.ts`).
export { rankSize, rankDensity, rankGlow } from './kit/Boost';

// ---------------------------------------------------------------------------
// Fields and thrown things
// ---------------------------------------------------------------------------

/** How a lingering spell field looks while it lasts (`fx/Fields.ts`). */
export type FieldLook =
  | 'fire' | 'firestorm' | 'frost' | 'blizzard' | 'storm' | 'pillar' | 'venom' | 'smoke' | 'void' | 'bone' | 'dust'
  // monster traps (`fx/MonsterFX.ts` HAZARD_LOOK)
  | 'rubble' | 'web' | 'roots';

/** Fields with a look of their own; any other field draws as its school. */
export const FIELD_LOOKS: Readonly<Record<string, FieldLook>> = {
  pyroclasm: 'fire',
  firestorm: 'firestorm',
  rimeField: 'frost',
  blizzard: 'blizzard',
  ionize: 'storm',
  heavensGate: 'pillar',
  eyeOfTheStorm: 'storm',
  noxiousCloud: 'venom',
  smokeBomb: 'smoke',
  nightfall: 'void',
  boneCage: 'bone',
};

const FIELD_OF_SCHOOL: Readonly<Record<School, FieldLook>> = {
  physical: 'dust', fire: 'fire', cold: 'frost', lightning: 'storm', poison: 'venom', arcane: 'void', bone: 'bone',
};

/** The look of a field cast by `skillId` in `school`. */
export function fieldLook(skillId: string | undefined, school: School): FieldLook {
  return (skillId ? FIELD_LOOKS[skillId] : undefined) ?? FIELD_OF_SCHOOL[school] ?? 'dust';
}

/** What a thrown skill throws, where it is not an arrow or a spell's own body. */
export const THROWN_SHAPES: Readonly<Record<string, 'knife' | 'shield' | 'needle' | 'vial'>> = {
  fanOfKnives: 'knife',
  throwingSpree: 'knife',
  venomDart: 'needle',
  plagueVial: 'vial',
  shieldThrow: 'shield',
};
