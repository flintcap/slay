/**
 * SLAY — what every player skill sounds like.
 *
 * One recording per skill per stage, chosen here by hand, so a skill sounds
 * the same every time it is used. Every id below is a `skill.*` bank id with
 * exactly one take (`tools/audio/recipe.mjs`); the engine adds only a little
 * pitch and volume jitter. No two active skills share a recording
 * (`tools/check-unique.mjs`): every skill is one of one.
 *
 * Stages, played by `scenes/SkillRunner.ts`:
 *   cast    once, when the skill goes off. For a nova, curse, buff, beam or
 *           cone this is the whole sound: it lands the moment it is cast.
 *   hit     where it lands: a projectile arriving, a blow connecting (once per
 *           swing that connects), a rock or bolt striking, a chain jumping.
 *   minion  each time a summon it raised attacks.
 *
 * While a skill runs, the effects it is drawn with make no sound of their own
 * (`EffectSystem.beginQuiet`) and a skill's blow plays no weapon-hit layer, so
 * nothing else is heard in place of these. The monster struck still answers
 * with its own body and voice.
 */

import type { CharClassId } from '../types';
import { skillsForClass } from '../data/skills';
import { SHIFTER_SOUNDS } from './shifterSounds';
import { PALADIN_SOUNDS } from './PaladinSounds';

export interface SkillSound {
  cast: string | null;
  hit: string | null;
  minion: string | null;
}

const s = (cast: string | null, hit: string | null = null, minion: string | null = null): SkillSound => ({ cast, hit, minion });

/** Skill id -> its sounds. Every active skill has a row; `tools/check-skillsound.mjs` proves it. */
export const SKILL_SOUNDS: Readonly<Record<string, SkillSound>> = {
  ...PALADIN_SOUNDS,
  // --- Ranger: bows, traps and the wild ------------------------------------
  pierceShot: s('skill.bow.pierce', 'skill.arrow.hit'),
  huntersMark: s('skill.bow.mark', 'skill.arrow.mark'),
  aimedShot: s('skill.bow.heavy', 'skill.arrow.heavy'),
  bleedingArrow: s('skill.bow', 'skill.arrow.barb'),
  crippling: s('skill.bow.cripple', 'skill.arrow.cripple'),
  oneShot: s('skill.bow.grave', 'skill.arrow.grave'),
  twinShot: s('skill.bow.twin', 'skill.arrow.twin'),
  fanFire: s('skill.bow.fanFire', 'skill.arrow.fan'),
  scattershot: s('skill.bow.fan'),
  ricochet: s('skill.bow.ricochet', 'skill.arrow.ricochet'),
  explosiveTip: s('skill.bow.fire', 'skill.fire.burst'),
  suppressing: s('skill.bow.stream'),
  arrowRain: s('skill.bow.sky', 'skill.arrow.rain'),
  darkenTheSky: s('skill.bow.darken', 'skill.arrow.storm'),
  rollAway: s('skill.roll'),
  disengage: s('skill.leap.back'),
  snareTrap: s('skill.trap.snare'),
  spikeTrap: s('skill.trap.spike'),
  theWholeFloor: s('skill.trap.field'),
  thornBarrier: s('skill.thorns'),
  venomCoat: s('skill.coat.arrows'),
  camouflage: s('skill.camo'),

  // --- Knight: shield, steel and voice -------------------------------------
  shieldWall: s('skill.shield.wall'),
  shieldBash: s('skill.swing.shield', 'skill.shield.bash'),
  guardStance: s('skill.stance.guard'),
  shieldCharge: s('skill.charge', 'skill.charge.hit'),
  aegis: s('skill.ward.aegis'),
  fortressStance: s('skill.stance.fortress'),
  shieldThrow: s('skill.shield.throw', 'skill.shield.ring'),
  cleave: s('skill.swing.wide', 'skill.hit.cleave'),
  rend: s('skill.swing.blade', 'skill.hit.rend'),
  gash: s('skill.swing.gash', 'skill.hit.gash'),
  overhead: s('skill.swing.heavy', 'skill.hit.crush'),
  sunder: s('skill.swing.sunder', 'skill.hit.sunder'),
  maim: s('skill.swing.maim', 'skill.hit.maim'),
  whirlwind: s('skill.whirlwind', 'skill.hit.whirl'),
  gorefeast: s('skill.gorefeast'),
  massacre: s('skill.swing.flurry', 'skill.hit.massacre'),
  ruin: s('skill.swing.ruin', 'skill.hit.ruin'),
  battleCry: s('skill.shout.battle'),
  rallyingHorn: s('skill.shout.rally'),
  intimidate: s('skill.shout.fear'),
  tauntingRoar: s('skill.shout.taunt'),
  heraldOfRuin: s('skill.shout.herald'),
  bannerOfTheGate: s('skill.banner'),
  // A passive, but the brother it raises with the banner fights.
  swornBrother: s(null, null, 'skill.clone.strike'),
  warStomp: s('skill.stomp'),
  earthshatter: s('skill.quake'),

  // --- Mage, fire: roars and whoomps ---------------------------------------
  firebolt: s('skill.fire.bolt', 'skill.fire.hit'),
  emberNova: s('skill.fire.nova'),
  pyreBrand: s('skill.fire.lance'),
  fireball: s('skill.fire.ball', 'skill.fire.blast'),
  infernoStream: s('skill.fire.stream'),
  blastWave: s('skill.fire.wave'),
  pyroclasm: s('skill.fire.erupt'),
  firestorm: s('skill.fire.storm'),
  dragonsBreath: s('skill.fire.breath'),
  annihilate: s('skill.fire.annihilate'),

  // --- Rogue: quick steel, hiss and shadow ----------------------------------
  viperStrike: s('skill.swing.viper', 'skill.hit.viper'),
  coatBlades: s('skill.coat.venom'),
  venomDart: s('skill.throw.dart', 'skill.poison.dart'),
  noxiousCloud: s('skill.poison.cloud'),
  plagueVial: s('skill.throw.vial', 'skill.poison.vial'),
  envenomBurst: s('skill.poison.burst'),
  deathLotus: s('skill.swing.lotus', 'skill.hit.lotus'),
  viperGod: s('skill.viper', null, 'skill.viper.bite'),
  shadowStep: s('skill.shadowStep', 'skill.hit.backstab'),
  veil: s('skill.veil'),
  smokeBomb: s('skill.smoke'),
  shadowClone: s('skill.clone', null, 'skill.clone.strike'),
  umbralAmbush: s('skill.swing.shadow', 'skill.hit.ambush'),
  vanish: s('skill.vanish'),
  nightfall: s('skill.nightfall'),
  voidWalk: s('skill.voidWalk', 'skill.hit.void'),
  assassinate: s('skill.swing.assassin', 'skill.hit.execute'),
  preciseCut: s('skill.swing.quick', 'skill.hit.precise'),
  fanOfKnives: s('skill.throw.fan', 'skill.knife.hit'),
  crippleTendon: s('skill.swing.tendon', 'skill.hit.tendon'),
  doubleStrike: s('skill.swing.double', 'skill.hit.double'),
  whirlingBlades: s('skill.dash.blades', 'skill.hit.blades'),
  throwingSpree: s('skill.throw.knife', 'skill.knife.spree'),
  knifeHalo: s('skill.knife.halo'),
  steelWaltz: s('skill.swing.waltz', 'skill.hit.waltz'),

  // --- Mage, lightning: snaps and thunder ----------------------------------
  sparkbolt: s('skill.storm.spark', 'skill.storm.sparkHit'),
  shockNova: s('skill.storm.nova'),
  chainLightning: s('skill.storm.chain', 'skill.storm.arc'),
  thunderclap: s('skill.storm.clap'),
  lightningStrike: s('skill.storm.call', 'skill.storm.strike'),
  stormstride: s('skill.storm.orbHit', 'skill.storm.orb'),
  ballLightning: s('skill.storm.ball', 'skill.storm.ballHit'),
  thunderstorm: s('skill.storm.gather'),
  skyLance: s('skill.storm.lance'),
  ionize: s('skill.storm.ionize'),
  eyeOfTheStorm: s('skill.storm.eye'),
  heavensGate: s('skill.storm.pillar'),

  // --- Mage, cold: cracks, hiss and shattering glass ------------------------
  frostShard: s('skill.cold.shard', 'skill.cold.shardHit'),
  frostNova: s('skill.cold.nova'),
  iceLance: s('skill.cold.lance'),
  iceArmor: s('skill.cold.armor'),
  glacialSpike: s('skill.cold.spike', 'skill.cold.spikeHit'),
  rimeField: s('skill.cold.rime'),
  blizzard: s('skill.cold.blizzard'),
  // Owner: "a blink should be a quick air sound".
  frostStep: s('skill.cold.step'),
  frozenOrb: s('skill.cold.orb', 'skill.cold.orbHit'),
  wintersBreath: s('skill.cold.breath'),
  glacialComet: s('skill.cold.cometCall', 'skill.cold.comet'),

  // --- Revenant: bone, earth, rot and the dead ------------------------------
  boneSpear: s('skill.bone.spear', 'skill.bone.spearHit'),
  raiseSkeleton: s('skill.bone.raise', null, 'skill.bone.slash'),
  boneArmor: s('skill.bone.armor'),
  skeletalMage: s('skill.bone.mage', null, 'skill.bone.bolt'),
  boneSpirit: s('skill.bone.spirit', 'skill.bone.spiritHit'),
  claySentinel: s('skill.clay.raise', null, 'skill.clay.slam'),
  boneCage: s('skill.bone.cage'),
  boneStorm: s('skill.bone.storm'),
  reassemble: s('skill.bone.reassemble', null, 'skill.bone.hack'),
  boneNova: s('skill.bone.nova'),
  grandOssuary: s('skill.bone.host', null, 'skill.bone.horde'),
  weaken: s('skill.curse.weaken'),
  amplifyDamage: s('skill.curse.amplify'),
  terror: s('skill.curse.terror'),
  doomBrand: s('skill.curse.doom'),
  massConfusion: s('skill.curse.confuse'),
  lowerResist: s('skill.curse.lower'),
  blightBolt: s('skill.blight.bolt', 'skill.blight.hit'),
  poisonNova: s('skill.blight.nova'),
  pestilence: s('skill.blight.aura'),
  corpseExplosion: s('skill.corpse.burst'),
  siphonLife: s('skill.drain.siphon'),
  exsanguinate: s('skill.drain.blood'),
  bloodPact: s('skill.blood.pact'),
  sanguineNova: s('skill.blood.nova'),
  gravechill: s('skill.cold.grave'),
  soulCage: s('skill.soul.cage'),
  soulTether: s('skill.soul.tether'),
  revenantForm: s('skill.revenant.form'),
  reaping: s('skill.reap'),

  // --- Shapeshifter (audio/shifterSounds.ts) ------------------------------------
  ...SHIFTER_SOUNDS,
};

const SILENT: SkillSound = { cast: null, hit: null, minion: null };

/** A skill's sounds; an unknown skill is silent rather than borrowing another's. */
export function skillSound(skillId: string | undefined): SkillSound {
  return (skillId && SKILL_SOUNDS[skillId]) || SILENT;
}

const ids = (sounds: Iterable<SkillSound>): string[] => {
  const out = new Set<string>();
  for (const s of sounds) for (const id of [s.cast, s.hit, s.minion]) if (id) out.add(id);
  return [...out];
};

/**
 * The skill sounds a class can make (`own`) and every other class's
 * (`others`), so the sound engine keeps only the hero's in memory
 * (`SampleEngine.setLoadout`).
 */
export function classSkillSounds(classId: CharClassId): { own: string[]; others: string[] } {
  const own = ids(skillsForClass(classId).map((d) => skillSound(d.id)));
  const mine = new Set(own);
  return { own, others: ids(Object.values(SKILL_SOUNDS)).filter((id) => !mine.has(id)) };
}
