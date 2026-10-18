import * as THREE from 'three';
import { bendFor, bentKnob } from '../data/skillBends';
import { FOE_POWER, SELF_POWER, burstGrowth, grownMods, minionLifeGrowth, scaleMods, scaleShred } from '../data/skillPower';
import { reportError } from '../core/Engine';
import type { DamagePacket, DamageType, StatusApplication } from '../types';
import { events } from '../core/Events';
import { audio } from '../audio/Audio';
import { skillSound } from '../audio/SkillSounds';
import { SKILLS } from '../data/skills';
import { rollDamage, skillDamageScale } from '../sim/Combat';
import { skillRank } from '../sim/Character';

/** A summon's hits and life at a skill rank, in any unit: only the ratio between ranks is used. */
export type SummonGrowth = (rank: number) => { damage: number; life: number };
import { releaseShadowDouble, type Player } from '../entities/Player';
import type { HeroAnimator } from '../art/hero/Animator';
import { canStandAt, lineClear, stepBody, type WalkWorld } from '../world/BodyWalk';
import { Enemy, type CombatContext } from '../entities/Enemy';
import { installMonsterAudio } from '../audio/MonsterAudio';
import type { MinionTarget } from '../entities/Abilities';
import type { Boss } from '../entities/Boss';
import { EffectSystem, ELEMENTS, type School } from '../fx/Effects';
import { CombatFeel, type HitKind, type WeaponSound } from '../fx/CombatFeel';
import type { EffectHandle } from '../fx/Effects';
import { getStatus, synthesizeSkillBuff } from '../data/statuses';
import { getBase } from '../sim/Loot';
import type { ItemCategory } from '../types';
import { buildMonsterModel, monsterArchetype, releaseMonsterModel, RigAnimator, type RigAction } from '../entities/MonsterModels';
import { MONSTERS } from '../data/monsters';
import type { PlateData } from '../ui/Nameplates';
import { Random } from '../core/RNG';
import { damageMultiplier } from '../sim/Passives';
import { releasesAt, skillAction, weaponSwing } from '../art/hero/gestures';
import { formRefusal, runShift, SHIFTER_MINIONS, type ShiftKit } from './ShifterRunner';
import { castRite, riteRefusal, type RiteCast, type RiteHost } from './paladin/Rites';
import { castVigil, snuffVigil, tickVigils, type VigilCast, type VigilHost } from './paladin/Vigils';
import { SKILL_MOTIFS, motifAt, rankSize, skillParticles, THROWN_SHAPES } from '../fx/SkillLooks';

/**
 * What a summon actually looks like.
 *
 * Summons used to be a glowing ring on the floor that fired bolts. For a skill
 * called Raise Skeleton that reads, correctly, as the skill not working: you
 * press it and no skeleton appears. Each summoning skill now names a real
 * monster from the bestiary, and the minion is built from that monster's own
 * model and rig — a skeleton that walks, swings and rots away when its time is
 * up. Totems keep no body on purpose; a totem is an object, not a creature.
 */
const MINION_NAME: Record<string, string> = {
  raiseSkeleton: 'Skeleton',
  skeletalMage: 'Skeletal Mage',
  grandOssuary: 'Bone Warden',
  claySentinel: 'Clay Sentinel',
  swornBrother: 'Sworn Brother',
  shadowClone: 'Shadow',
};

/** The monster body each summoning skill raises (read by the scene's warm-up too). */
export const MINION_MONSTER: Readonly<Record<string, string>> = {
  ...SHIFTER_MINIONS,
  raiseSkeleton: 'skeleton_rattler',
  skeletalMage: 'skeleton_archer',
  grandOssuary: 'skeleton_warden',
  claySentinel: 'animated_armor',
  swornBrother: 'bandit_cutthroat',
  shadowClone: 'bandit_cutthroat',
};

/**
 * How many of each summon may stand at once, and the ceiling it grows toward.
 *
 * Summons used to expire on a timer, which is not a limit — it is a chore. You
 * could hold as many as you could click, and the only thing stopping you was
 * having to recast. A real cap makes the summon a resource: it rises with
 * ranks and with the minion passives, and stops at a number the fight is
 * balanced around. Casting at the cap replaces your oldest, so the button is
 * never dead.
 *
 * Totems are absent on purpose. A totem is an object with a lifetime the skill
 * itself describes, not a creature you keep.
 */
const SUMMON_HARD_CAP: Record<string, number> = {
  raiseSkeleton: 12,
  skeletalMage: 8,
  claySentinel: 3,
  shadowClone: 6,
  swornBrother: 3,
  viperGod: 2,
  grandOssuary: 16,
};

/** Nothing may hold more than this many bodies at once, whatever the maths. */
const SUMMON_ABSOLUTE_CAP = 20;

/** How far a minion will chase before it comes back to you. */
const MINION_LEASH = 16;
const MINION_SPEED = 3.4;
/** How close a minion heels when there is nothing to fight. */
const MINION_FOLLOW = 3.2;
/**
 * How far from you a summon will fight. Past it, it leaves the fight and
 * comes back; well past it (stuck behind a wall, left behind), it steps out
 * of the dark at your side.
 */
const MINION_TETHER = 9;
const SHADOW_TETHER = 7;
const MINION_RECALL = 18;
/** A summon's body, for walls and props. */
const MINION_RADIUS = 0.3;

/** How the equipped main hand wants to be fought with. */
export type WeaponStyle = 'melee' | 'ranged' | 'caster' | 'unarmed';

const MELEE_CATEGORIES: ItemCategory[] = ['sword', 'axe', 'mace', 'dagger', 'spear'];
const RANGED_CATEGORIES: ItemCategory[] = ['bow', 'crossbow'];
const CASTER_CATEGORIES: ItemCategory[] = ['wand', 'staff', 'scepter', 'orb'];

/** Resolves the style of whatever is in the character's main hand. */
/**
 * Two blades: the hands take turns, one blow per swing, every DUAL_SWING
 * seconds (one blade swings every 0.42 s). At 0.21 s, twice a single weapon's
 * rate, the hero flailed at five swings a second; slower swings that each hit
 * harder keep the same damage per second: both weapons' worth (main hand
 * 100%, off hand 62%) every 0.42 s, as a share of the sheet, which carries
 * both weapons.
 */
const DUAL_SWING = 0.32;
const DUAL_BLOW_SCALE = ((1 + 0.62) * DUAL_SWING) / 0.42;
/** With two blades, the main hand's share of a one-blow melee skill; the off hand lands the rest. */
const DUAL_SKILL_MAIN = 0.6;
/**
 * A melee skill with two blades takes this much longer than with one, so the
 * left blade's swing finishes before the next cast; its blows hit harder by
 * the same factor, so damage per second is unchanged.
 */
const DUAL_SKILL_TIME = 1.35;

/**
 * True when both hands hold a melee weapon.
 *
 * Not simply "has an off-hand": a shield, an orb or a quiver in that slot is
 * not something you hit with.
 */
export function isDualWielding(player: Player): boolean {
  const eq = player.character.equipment;
  if (!eq.mainHand || !eq.offHand) return false;
  try {
    const main = getBase(eq.mainHand.baseId)?.category;
    const off = getBase(eq.offHand.baseId)?.category;
    return !!main && !!off && MELEE_CATEGORIES.includes(main) && MELEE_CATEGORIES.includes(off);
  } catch {
    return false;
  }
}

/**
 * The animation a skill should play.
 *
 * Keyed on the effect id first — a `nova` stomps, a `beam` is channelled, a
 * `shout` is roared — then narrowed by what is in your hands, because the same
 * skill is a draw with a bow and a throw without one. This is the whole reason
 * skills stopped looking alike: the delivery families already differed, but
 * every one of them played the same two clips.
 */
// A skill's own particle signature lives in `fx/SkillLooks.ts` (`skillParticles`).

/**
 * The authored status a skill inflicts.
 *
 * Both halves of this were already written and neither knew about the other:
 * `data/skills.ts` describes a curse that weakens, and `data/statuses.ts`
 * defines `weakened` with its modifiers and icon. Nothing joined them, so every
 * curse synthesized a nameless placeholder buff instead of applying the real
 * effect its own description promises.
 *
 * A skill that names `statusId` in its params still wins over this table.
 */
/**
 * Self-buff skills joined to the player status they are meant to grant.
 *
 * `applyBuff` looked for a `statusId` in a skill's params, but the params type
 * only holds numbers, so no skill could ever name one. Every self-buff fell
 * through to a synthesized placeholder carrying the skill's name and no
 * modifiers at all — which is why Veil put an icon on the bar and changed
 * nothing. These statuses were all authored with real numbers already.
 */
const SELF_BUFF_STATUS: Record<string, string> = {
  veil: 'veiled',
  camouflage: 'veiled',
  vanish: 'veiled',
  shieldWall: 'stoneform',
  fortressStance: 'stoneform',
  guardStance: 'fortitude',
  aegis: 'shielded',
  iceArmor: 'shielded',
  boneArmor: 'shielded',
  thunderstorm: 'overcharged',
  bloodPact: 'siphoning',
  revenantForm: 'frenzy',
};

/** Coat Blades, for its poison chance (read on every coated blow). */
const COAT = SKILLS.find((s) => s.id === 'coatBlades');
/**
 * Every active skill's name, which its damage packets carry as `ability`.
 * Passives are left out: Riposte and Superconductor are passives whose procs
 * hit under the same name and keep their weapon sound.
 */
const SKILL_NAMES = new Set(SKILLS.filter((s) => s.targeting !== 'passive').map((s) => s.name));
const UMBRAL_AMBUSH = SKILLS.find((s) => s.id === 'umbralAmbush')?.name ?? 'Umbral Ambush';

const SKILL_STATUS: Record<string, string> = {
  // Curses and marks
  weaken: 'weakened',
  intimidate: 'weakened',
  amplifyDamage: 'vulnerable',
  terror: 'feared',
  doomBrand: 'doomed',
  massConfusion: 'confused',
  lowerResist: 'unmade',
  huntersMark: 'marked',
  soulCage: 'grasped',
  soulTether: 'lifelink',
  boneCage: 'grasped',
  tauntingRoar: 'weakened',

  // Maiming and shredding
  crippling: 'crippled',
  crippleTendon: 'crippled',
  maim: 'crippled',
  sunder: 'brittle',
  rend: 'rent',
  gash: 'hemorrhage',
  bleedingArrow: 'hemorrhage',
  suppressing: 'exhausted',

  // Blinding smoke and darkness
  nightfall: 'blinded',
  smokeBomb: 'blinded',
  scattershot: 'blinded',

  // Elemental afflictions named outright by the skill
  noxiousCloud: 'envenomed',
  envenomBurst: 'envenomed',
  plagueVial: 'plagued',

  // Cold: a chill on the light spells, a freeze on the heavy ones
  frostShard: 'chilled',
  frostNova: 'chilled',
  rimeField: 'chilled',
  blizzard: 'chilled',
  frozenOrb: 'chilled',
  iceLance: 'brittle',
  glacialSpike: 'frozen',
  frostStep: 'frozen',
  wintersBreath: 'frozen',
  glacialComet: 'frozen',

  // Traps and impacts
  snareTrap: 'rooted',
  thornBarrier: 'slowed',
  spikeTrap: 'bleeding',
  shieldBash: 'stunned',
  warStomp: 'knockedDown',
  earthshatter: 'knockedDown',
};

/**
 * The school a tree draws in when a skill names no damage type of its own:
 * buffs, wards and curses still need a colour and a sound.
 */
const TREE_SCHOOL: Record<string, School> = {
  conflagration: 'fire',
  venom: 'poison', blight: 'poison',
  tempest: 'lightning', frost: 'cold',
  ossuary: 'bone', gravepact: 'arcane', shadowcraft: 'arcane',
};

/**
 * What a skill looks and sounds like. Usually its damage type; bone magic is
 * physical damage drawn as bone, and an untyped skill borrows its tree's.
 */
export function schoolOf(def: { treeId: string; damageType?: DamageType }): School {
  const t = def.damageType;
  if (def.treeId === 'ossuary' && (t === undefined || t === 'physical')) return 'bone';
  if (t) return t;
  return TREE_SCHOOL[def.treeId] ?? 'physical';
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

/**
 * Rotates a colour a little way around the wheel, keeping it in its own family.
 * A +/-8% shift is enough to tell two skills apart and small enough that fire
 * never turns green.
 */
function shiftHue(hex: number, seed: number): number {
  const shift = (((seed >>> 6) % 17) - 8) / 100;
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return hex;
  const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h / 6 + shift + 1) % 1;
  const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
  const pp = 2 * l - q;
  const ch = (tv: number): number => {
    const tt = (tv + 1) % 1;
    if (tt < 1 / 6) return pp + (q - pp) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return pp + (q - pp) * (2 / 3 - tt) * 6;
    return pp;
  };
  const to = (v: number): number => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (to(ch(h + 1 / 3)) << 16) | (to(ch(h)) << 8) | to(ch(h - 1 / 3));
}

/** Hero clips whose animation has a release frame (see `art/hero/Actions.ts`). */
const RELEASE_CLIPS = new Set(['cast', 'point', 'hurl', 'plant', 'roar', 'blink', 'shoot', 'snapshot', 'skyshot']);

/**
 * Families whose handler in `cast` plays a clip of its own rather than the one
 * `clipFor` picks. Kept beside `clipFor` so `bodyClip` can tell the audit what
 * the body really does.
 */
const HANDLER_CLIP: Record<string, string> = {
  whirlwind: 'attack2', slam: 'attack2', channel: 'channel', wave: 'slam',
  leap: 'dodge', teleport: 'blink', dash: 'dodge',
  summon: 'point', minion: 'point', curse: 'point', debuff: 'point', apply: 'point',
};

/** The clip the body actually plays for a skill, for audits. */
export function bodyClip(effect: string | undefined, holding: WeaponStyle, skillId: string): string {
  const family = (effect ?? 'melee').split('.')[0] ?? 'melee';
  return skillAction(skillId) ?? HANDLER_CLIP[family] ?? clipFor(effect, holding, skillId);
}

/**
 * The animation a skill plays.
 *
 * `skillId` is what splits skills that share an effect family. Five warden
 * strike skills all have the effect `melee.strike`, so hashing the effect gave
 * all five the same gesture — which is the thing this was meant to stop. The
 * id is the only part that differs, so the id is what decides.
 */
export function clipFor(effect: string | undefined, holding: WeaponStyle, skillId = ''): string {
  // A skill with a gesture of its own (`art/hero/SkillActions.ts`) plays it.
  const own = skillAction(skillId);
  if (own) return own;
  const raw = (effect ?? 'melee').toLowerCase();
  const [family, sub] = raw.split('.');
  const f = family ?? 'melee';
  const s2 = sub ?? '';

  // Sub-effects that override their family outright.
  //
  // `strike` used to send every one of them to `thrust`, so a warden with five
  // strike skills jabbed identically five times. Alternate the two stabs by the
  // skill's own name so each keeps a fixed, distinct gesture.
  const pick = hashId(skillId || raw);
  if (s2 === 'strike') return pick % 2 === 0 ? 'thrust' : 'lunge';
  if (s2 === 'lunge') return 'lunge';
  if (s2 === 'slam' || s2 === 'smash') return 'slam';
  if (s2 === 'stream' || s2 === 'channel') return 'channel';
  // Anything thrown at the floor is thrown, not conjured.
  if (s2 === 'cloud' || s2 === 'explode' || s2 === 'vial' || s2 === 'bomb') return 'hurl';
  // Vanishing is not a two-handed conjuring gesture.
  if (f === 'teleport' || s2 === 'stealth' || s2 === 'reset' || s2 === 'blink') return 'blink';

  switch (f) {
    case 'melee':
      return 'attack1';
    case 'cleave':
    case 'whirlwind':
      return 'attack2';
    case 'slam':
      return 'slam';
    case 'meteor':
      // An archer calling arrows down draws and looses upward. Everyone else
      // brings something heavy down from overhead.
      return holding === 'ranged' ? 'skyshot' : 'slam';
    case 'wave':
      // A line of broken ground comes from striking it, not from a hand wave.
      return 'slam';
    case 'nova':
      // Traps and wards are set down by hand. Only a caster or a bruiser makes
      // a ring by stamping on the floor.
      return holding === 'ranged' ? 'plant' : 'stomp';
    case 'trap':
    case 'ward':
      return 'plant';
    case 'ground':
      return 'hurl';
    case 'beam':
      return 'channel';
    case 'cone':
      return holding === 'ranged' ? 'snapshot' : 'channel';
    case 'chain':
    case 'summon':
    case 'corpse':
    case 'curse':
      return 'point';
    case 'banner':
      // Planting a standard is planting something, not shouting.
      return 'plant';
    case 'shout':
      return 'roar';
    case 'dash':
      return 'dodge';
    case 'projectile':
    case 'bolt':
      // Split the bow's eleven skills across a full draw and a snap shot, by
      // the skill's own id so each one always plays the same one.
      if (holding === 'ranged') return pick % 2 === 0 ? 'shoot' : 'snapshot';
      return f === 'projectile' ? 'hurl' : 'point';
    case 'detonate':
      return 'point';
    case 'aoe':
      return holding === 'ranged' ? 'plant' : 'stomp';
    case 'aura':
    case 'stance':
    case 'buff':
    case 'self':
    case 'absorb':
    case 'heal':
      return 'cast';
    default:
      return holding === 'ranged' ? 'snapshot' : 'cast';
  }
}

export function weaponStyle(player: Player): WeaponStyle {
  // A beast fights with what it grew, whatever is in the pack.
  if (player.shape?.form) return 'melee';
  const item = player.character.equipment.mainHand;
  if (!item) return 'unarmed';
  try {
    const cat = getBase(item.baseId)?.category;
    if (!cat) return 'unarmed';
    if (RANGED_CATEGORIES.includes(cat)) return 'ranged';
    // A Paladin's scepter is a short mace with a reliquary on the end.
    if (cat === 'scepter' && player.character.classId === 'paladin') return 'melee';
    if (CASTER_CATEGORIES.includes(cat)) return 'caster';
    if (MELEE_CATEGORIES.includes(cat)) return 'melee';
  } catch {
    /* fall through */
  }
  return 'unarmed';
}

/** True when the off hand holds a caster's focus (an orb, a wand). */
export function casterOffHand(player: Player): boolean {
  const item = player.character.equipment.offHand;
  if (!item) return false;
  const cat = getBase(item.baseId)?.category;
  return !!cat && CASTER_CATEGORIES.includes(cat);
}

/** What the main hand sounds like when it lands. */
export function weaponSoundOf(player: Player): WeaponSound {
  const item = player.character.equipment.mainHand;
  if (!item) return 'fist';
  try {
    switch (getBase(item.baseId)?.category) {
      case 'sword': return 'blade';
      case 'dagger': return 'blade';
      case 'axe': return 'axe';
      case 'mace': case 'staff': case 'scepter': case 'wand': case 'orb': return 'blunt';
      case 'spear': case 'bow': case 'crossbow': return 'pierce';
      default: return 'blade';
    }
  } catch {
    return 'blade';
  }
}

/** Effect families that swing a weapon and therefore need one in hand. */
const MELEE_EFFECTS = new Set([
  // A dash or a leap is footwork, not a swing: gating them on a melee weapon
  // meant an archer could not roll out of a pack. The variants that do end in a
  // hit are caught by their `.strike` suffix, which is in this set already.
  'melee', 'cleave', 'whirlwind', 'strike', 'heavy', 'multislash',
]);

/**
 * True when a skill physically swings the main hand. Spells are deliberately
 * exempt: a caster with a bow can still cast, the same way Diablo II allowed.
 */
export function needsMeleeWeapon(effect: string | undefined, damageType: string | undefined): boolean {
  const raw = (effect ?? 'melee').toLowerCase();
  const [family, sub] = raw.split('.');
  const hit = MELEE_EFFECTS.has(family ?? '') || MELEE_EFFECTS.has(sub ?? '');
  // Only physical swings are gated; an elemental "cleave" is a spell shaped
  // like a swing and should not demand a sword.
  return hit && (damageType ?? 'physical') === 'physical';
}

const HEAT_BY_RANK: Record<string, number> = { normal: 0.1, champion: 0.18, elite: 0.24, rare: 0.34, boss: 1 };

/** 0..1: how much awake, nearby trouble the hero is in. */
export function combatHeat(at: THREE.Vector3, enemies: readonly Enemy[]): number {
  let heat = 0;
  for (const e of enemies) {
    if (!e.alive || e.ai?.isDormant) continue;
    const dx = e.root.position.x - at.x;
    const dz = e.root.position.z - at.z;
    if (dx * dx + dz * dz > 22 * 22) continue;
    heat += HEAT_BY_RANK[e.rank] ?? 0.1;
  }
  return Math.min(1, heat);
}

/** Anything the player can hit. Enemy and Boss both satisfy this. */
type Target = Enemy | Boss;

/**
 * Executes player skills: cost and cooldown checks, hit resolution, and the
 * visual/audio payload. Enemy abilities live in entities/Abilities.ts — this is
 * the player half only.
 *
 * Travel and timing for projectiles belong to EffectSystem; this class supplies
 * the damage callback it fires on impact.
 */
export class SkillRunner {
  private effects: EffectSystem;
  /**
   * Who is casting right now.
   *
   * Every damage applier below needs the caster's passives to tune a packet
   * against the specific thing it is about to hit, and threading the player
   * through six call signatures would be noise. `cast` and `basicAttack` set
   * this before they resolve anything.
   */
  private caster: Player | null = null;
  /** When Paralytic Toxin last stunned each target, for its internal cooldown. */
  private poisonStunAt = new Map<string, number>();
  private tmp = new THREE.Vector3();
  /** Which swing of the basic combo is next; with two blades, which hand. */
  private swingParity = 0;
  private tmp2 = new THREE.Vector3();
  private tmp3 = new THREE.Vector3();

  /** Flash, knockback and layered sound for every blow that lands. */
  readonly feel: CombatFeel;
  /** What the caster's main hand sounds like when it connects. */
  private weaponSound: WeaponSound = 'fist';

  constructor(effects: EffectSystem) {
    this.effects = effects;
    this.feel = new CombatFeel(effects);
    // Monsters voice their own wind-ups, swings and spells through the
    // documented `notifyAbility` hook.
    installMonsterAudio(Enemy.prototype as never);
    this.riteHost = {
      effects,
      land: (t, packet, kind, fromX, fromZ, world) => this.landRite(t, packet, kind, fromX, fromZ, world),
      later: (seconds, fn) => this.pendingSwings.push({ t: seconds, run: fn }),
      sound: (id, x, z) => { if (id) audio.play(id, { x, z }); },
      clear: (from, dir, max, ctx) => this.wallStop(from, dir, max, ctx, 0.5),
    };
    this.vigilHost = {
      ...this.riteHost,
      area: (centre, radius, packet, ctx, enemies, boss, kind) => this.areaDamage(centre, radius, packet, ctx, enemies, boss, kind),
    };
  }

  /** What the Paladin's Aura skills borrow from the runner (`paladin/Vigils.ts`). */
  private readonly vigilHost: VigilHost;
  /** The hero whose vigils burn between presses, set by the scene. */
  keeper: Player | null = null;

  /** What the Paladin's weapon skills borrow from the runner (`paladin/Rites.ts`). */
  private readonly riteHost: RiteHost;

  /** One Paladin blow on one target, through the whole hit pipeline. */
  private landRite(
    t: Target, packet: DamagePacket, kind: HitKind, fromX: number, fromZ: number,
    world: { ctx: CombatContext; enemies: Enemy[]; boss: Boss | null; player: Player },
  ): DamagePacket {
    this.caster = world.player;
    const tuned = this.tune(packet, t);
    this.atContact = true;
    try {
      this.strike(t, tuned, world.ctx, kind, fromX, fromZ);
      this.afterHit(tuned, t, world.ctx, world.enemies, world.boss);
      this.effects.meleeHit(t.root.position.x, 1.0, t.root.position.z, {
        element: this.swingSchool, sfx: null, shake: 0, crit: tuned.crit,
      });
    } finally {
      this.atContact = false;
    }
    return tuned;
  }

  /**
   * Lands one blow and reports it to the feel layer.
   *
   * Every player hit in this file goes through here, so a blow cannot connect
   * without flashing, stopping, shoving and sounding like it did. `fromX/Z` is
   * where the blow came from, which decides which way the body is knocked and
   * the camera kicks.
   */
  private strike(t: Target, packet: DamagePacket, ctx: CombatContext, kind: HitKind, fromX: number, fromZ: number): void {
    packet = this.coated(packet, kind, ctx);
    const before = t.life;
    t.takeDamage(packet, ctx);
    this.veilAfterHit(packet, kind, before > 0 && t.life <= 0);
    try {
      this.feel.hit(t, packet, {
        kind, fromX, fromZ, lifeBefore: before, weapon: this.weaponSound,
        skill: packet.ability !== undefined && SKILL_NAMES.has(packet.ability),
      }, ctx.nav);
    } catch (err) {
      // Presentation must never take the hit itself down with it.
      console.warn('[feel] hit report failed', err);
    }
  }

  /**
   * Striking from the veil gives you away: the blow lands (with the veil's
   * guaranteed critical) and the veil drops at the end of the frame, so every
   * target of the same swing or volley still gets that critical. A kill by
   * Umbral Ambush keeps it; with The Unseen Blade any kill keeps it and adds
   * time. Minions, procs and damage over time do not reveal you.
   */
  private veilAfterHit(packet: DamagePacket, kind: HitKind, killed: boolean): void {
    const p = this.caster;
    if (!p || kind === 'minion' || kind === 'proc' || packet.source !== 'player') return;
    const veil = p.status.get('veiled');
    if (!veil) return;
    const e = p.passives;
    if (killed && (packet.ability === UMBRAL_AMBUSH || e.veilKillExtendSec > 0)) {
      if (e.veilKillExtendSec > 0) veil.remaining = Math.min(Math.max(veil.remaining, e.veilKillCapSec), veil.remaining + e.veilKillExtendSec);
      return;
    }
    this.veilBreak = true;
  }

  /**
   * Coat Blades: while the coat is on, a weapon blow may leave Poisoned.
   *
   * The coat's flat poison has always ridden on every hit (it is the skill's
   * stat table), but the poison itself never did: the hit stayed physical, so
   * a coated blade never poisoned anything and the 25% in the tooltip was
   * read by nothing.
   */
  private coated(packet: DamagePacket, kind: HitKind, ctx: CombatContext): DamagePacket {
    const p = this.caster;
    if (!p || packet.source !== 'player' || (kind !== 'melee' && kind !== 'heavy')) return packet;
    if (!p.status.has('skill.coatBlades')) return packet;
    const rank = skillRank(p.character, 'coatBlades');
    if (rank <= 0) return packet;
    const params = COAT?.params ?? {};
    const n = (k: string, d: number): number => (typeof params[k] === 'number' ? (params[k] as number) : d);
    const chance = n('poisonChance', 25) + n('chancePerRank', 3) * (rank - 1);
    if (!ctx.rng.chance(Math.min(1, chance / 100))) return packet;
    const e = p.passives;
    const poison: StatusApplication = {
      id: 'poisoned',
      duration: 8 + e.dotDurationSec,
      magnitude: 1 + e.dotDamagePct / 100,
      stacks: 1,
      maxStacks: Math.floor(e.dotMaxStacks),
      tickScale: 1 + e.dotTickPct / 100,
    };
    return { ...packet, applies: [...(packet.applies ?? []), poison] };
  }

  /** Attempt to cast. Returns false if on cooldown, unaffordable, or busy. */
  cast(
    skillId: string,
    player: Player,
    target: THREE.Vector3,
    ctx: CombatContext,
    enemies: Enemy[],
    boss: Boss | null
  ): boolean {
    if (player.isBusy || !player.alive) return false;
    this.setCaster(player, enemies, boss);

    // Resonance: a lightning skill sometimes goes off a second time, weaker and
    // free. Queued rather than recursed so it cannot stack on itself, and it
    // bypasses the busy and cost checks because it is not a second press.
    const echo = player.passives;
    if (!this.echoing && echo.echoChance > 0 && ctx.rng.chance(Math.min(1, echo.echoChance / 100))) {
      const def = SKILLS.find((s) => s.id === skillId);
      if (def?.damageType === 'lightning') {
        this.pendingEcho = { skillId, target: target.clone(), scale: echo.echoDamagePct / 100 };
      }
    }

    const def = SKILLS.find((s) => s.id === skillId);
    if (!def || def.targeting === 'passive') return false;

    const rank = skillRank(player.character, skillId);
    if (rank <= 0) return false;
    if (player.isOnCooldown(skillId)) return false;

    // A bow cannot swing. Blocking this here is what makes weapon choice a
    // real decision rather than a stat stick.
    if (needsMeleeWeapon(def.effect, def.damageType)) {
      const style = weaponStyle(player);
      if (style === 'ranged' || style === 'caster') {
        events.emit('toast', {
          text: `${def.name} needs a melee weapon.`,
          kind: 'bad',
        });
        audio.play('ui.error');
        return false;
      }
    }

    // A Paladin skill wants its own weapon: a mace or a sword, or a shield.
    // In a beast form only that beast's skills work (ShifterRunner.ts).
    const refusal = riteRefusal(def, player) ?? formRefusal(def, player);
    if (refusal) {
      events.emit('toast', { text: refusal, kind: 'bad' });
      audio.play('ui.error');
      return false;
    }
    // A burning vigil pressed again is put out, free (paladin/Vigils.ts).
    if (snuffVigil(def, player)) return true;

    const cost = def.manaCost ? def.manaCost(rank) : 0;
    if (cost > 0 && !player.spendMana(cost)) {
      // Say so. A skill that silently refuses reads as a broken button, which
      // is exactly how being out of mana was being reported as a bug.
      events.emit('toast', { text: `Not enough mana for ${def.name}.`, kind: 'bad' });
      audio.play('ui.error');
      return false;
    }

    const cd = def.cooldown ? def.cooldown(rank) : 0;
    if (cd > 0) player.startCooldown(skillId, cd);

    player.faceTowards(target.x, target.z);
    events.emit('skill:cast', { skillId: def.id, type: def.damageType ?? 'physical' });

    // Rank with +skills, and the synergies the tree shows (combat's `skillDamageScale`).
    const params = def.params ?? {};
    // A skill-bending unique grows this skill's knobs and damage (data/skillBends.ts).
    const bend = bendFor(player.character, def.id);
    const num = (k: string, d: number): number => {
      const v = params[k];
      return bentKnob(bend, k, typeof v === 'number' ? v : d);
    };
    // A skill with no damage ladder (a detonation, a drain, a summon's blows)
    // still hits harder a rank: `data/skillPower.ts` says how much.
    const scale =
      skillDamageScale(player.character.skills, player.stats.skillLevels, def.id) *
      (def.damageScale ? 1 : burstGrowth(def.id, Math.max(0, rank - 1), num)) *
      (1 + (bend?.more ?? 0) / 100);
    const type: DamageType = def.damageType ?? 'physical';
    // Every skill of a damage type used the one element colour, so a whole
    // tree of fire skills was the same orange on screen. Shift it by a hash of
    // the skill's own id: still unmistakably fire, no longer indistinguishable
    // from the fire skill next to it.
    const school = schoolOf(def);
    const color = shiftHue(ELEMENTS[school]?.body ?? 0xc9a070, hashId(def.id));

    const makePacket = (mult = 1): DamagePacket => {
      const p = rollDamage(player.stats, ctx.rng, {
        scale: scale * mult,
        type,
        ability: def.name,
        source: 'player',
      });
      const r = rider();
      if (r.length) p.applies = r;
      return p;
    };

    const attackTime = 0.42 / Math.max(0.4, 1 + player.attackSpeedPct / 100);
    const castTime = 0.5 / Math.max(0.4, 1 + player.stats.castSpeed / 100);

    // Whatever this skill inflicts rides on every packet it produces, so a
    // maiming strike maims whether the runner delivered it as a swing, a
    // projectile or a nova. Attaching it in the individual branches would mean
    // remembering to, in twenty places, forever. Computed once, lazily, because
    // `num` has to exist first.
    let riderCache: StatusApplication[] | null = null;
    const rider = (): StatusApplication[] =>
      (riderCache ??= bend?.applies
        ? [...this.statusFor(def, num, color, true), { id: bend.applies.status, duration: bend.applies.duration, magnitude: 1 }]
        : this.statusFor(def, num, color, true));

    const origin = player.position.clone().setY(1.05);
    const dir = this.tmp.copy(target).sub(player.position).setY(0).normalize().clone();

    // Skill effects are dotted families ('buff.self', 'aura.damage'); switch on
    // the family so every variant lands on the right handler.
    const family = (def.effect ?? 'melee').split('.')[0] ?? 'melee';
    // What the body does when a skill fires depends on what is in your hands,
    // not only on the skill: the same volley is a draw with a bow and a throw
    // without one.
    const holding = weaponStyle(player);
    const rangedClip: 'shoot' | 'cast' = holding === 'ranged' ? 'shoot' : 'cast';
    // What the body does for this specific skill. Everything used to collapse
    // onto `cast` or `attack1`, so a ground slam, a war cry, a channelled beam
    // and a thrown bolt were all the same gesture.
    const clip = clipFor(def.effect, holding, def.id);
    // Branches below that pick their own clip still defer to a skill's own gesture.
    const own = skillAction(def.id);
    const sig = skillParticles(def.id, school);

    // The cast beat. Projectiles flare themselves as they leave the hand, and a
    // plain weapon swing's beat is the swing itself; everything else gathers
    // its school's power at the caster first, so no spell starts in mid-air.
    //
    // A clip with a release frame (cast, point, hurl, shoot...) flares at the
    // casting hand on that frame instead (`BodyFX` reads `releaseSchool`), so
    // the flash lands when the hand opens, not when the button is pressed.
    const selfCast = def.targeting === 'self';
    const swing = family === 'melee' || family === 'cleave' || family === 'whirlwind' || family === 'dash';
    // A weapon skill swinging the real weapon gathers nothing in the hands,
    // whatever its school: it is a blow, not a spell.
    const blow = weaponSwing(def.id);
    const released = RELEASE_CLIPS.has(clip) || releasesAt(clip);
    this.releaseSchool = released && !blow && !(school === 'physical' && (holding === 'ranged' || swing)) ? school : null;
    if (!released && !blow && family !== 'projectile' && family !== 'bolt' && !(swing && school === 'physical')) {
      this.effects.castFlare(school, origin.x, selfCast ? 1.0 : origin.y, origin.z, {
        scale: selfCast ? 1.25 : 0.9,
        dir: selfCast ? undefined : dir,
      });
    }

    // The skill's own sound, and only that: one recording per stage, picked
    // in audio/SkillSounds.ts. The effects drawn below stay silent, and so do
    // the sounds they would make later as they land.
    const sound = skillSound(def.id);
    if (sound.cast) audio.play(sound.cast, { x: origin.x, z: origin.z });
    const hitAt = (p: { x: number; z: number }): void => {
      if (sound.hit) audio.play(sound.hit, { x: p.x, z: p.z });
    };

    this.casting = true;
    this.effects.beginQuiet();
    try {
      switch (family) {
        case 'melee':
        case 'cleave': {
          const dual = isDualWielding(player);
          const k = dual ? DUAL_SKILL_TIME : 1;
          const skillTime = attackTime * k;
          const blowPacket = dual ? (m = 1): DamagePacket => makePacket(m * k) : makePacket;
          player.beginAction(clip, skillTime);
          const wide = (def.effect ?? '').includes('cleave') || (def.effect ?? '').includes('multiSlash');
          // A committed single-target skill lands like one: heavier stop, harder
          // shove. Wide sweeps hit many things and stay crisp instead.
          const heavy = !wide && (scale >= 1.6 || /heavy|smash|crush|execute/i.test(def.effect ?? ''));
          // `radius` is how far the skill says it reaches (Cleave 2.8m, Death
          // Lotus 4m); it was never read, so every swing reached 2.3m.
          const reach = num('reach', num('radius', 2.3));
          const arc = num('arc', wide ? 2.2 : 1.3);
          const kind: HitKind = heavy ? 'heavy' : 'melee';
          // Multi-hit skills: Double Strike's two, Massacre's five, Death Lotus's
          // eight. `hits` was never read, so each landed once.
          const hits = Math.max(1, Math.floor(num('hits', 1)));
          // A skill written against one enemy hits one enemy: the one you aimed at.
          const single = num('single', 0) > 0;
          const most = single ? 1 : Infinity;
          const focus = single ? { x: target.x, z: target.z } : null;
          // Two blades: the off hand answers once the main hand lands, so a
          // skill strikes with both. A one-blow skill splits its damage across
          // the two blades (same total, a hit from each); a multi-hit skill's
          // blows keep their damage and the left blade swings among them.
          const split = dual && hits === 1;
          const mainPacket = split ? (m = 1): DamagePacket => blowPacket(m * DUAL_SKILL_MAIN) : blowPacket;
          this.meleeSwing(player, dir, arc, reach, mainPacket, ctx, enemies, boss, type, true, kind, sound.hit, most, focus);
          if (dual) {
            const facing = dir.clone();
            // The left blade swings in what is left of the skill's time.
            const leftTime = Math.max(0.15, skillTime - player.contactIn);
            this.pendingSwings.push({
              t: player.contactIn,
              run: () => {
                if (!player.alive) return;
                // A skill's own gesture strikes with both blades itself; the
                // off hand's blow lands a beat after the main hand's. A real
                // weapon swing (`plainMove`) moves one arm, so the left blade
                // swings on its own, as it does in a basic attack.
                const gesture = own?.startsWith('skill.') ? own : null;
                const contact = gesture ? Math.min(0.12, leftTime * 0.4) : player.handBlow('L', leftTime);
                if (gesture) {
                  this.pendingSwings.push({
                    t: contact,
                    run: () => {
                      if (player.alive) player.animator.strike(gesture, 'L');
                    },
                  });
                }
                if (!split) return;
                this.pendingSwings.push({
                  t: contact,
                  // Lands even if a new action has started: it is half the skill's damage.
                  run: () => {
                    if (!player.alive) return;
                    this.atContact = true;
                    this.caster = player;
                    try {
                      const off = (m = 1): DamagePacket => blowPacket(m * (1 - DUAL_SKILL_MAIN));
                      this.meleeSwing(player, facing, arc, reach, off, ctx, enemies, boss, type, true, kind, sound.hit, most, focus);
                    } finally {
                      this.atContact = false;
                    }
                  },
                });
              },
            });
          }
          if (hits > 1) {
            const id = player.actionId;
            const first = player.contactIn;
            const gap = Math.min(0.08, (skillTime * 0.8) / hits);
            const facing = dir.clone();
            for (let i = 1; i < hits; i++) {
              this.pendingSwings.push({
                t: first + gap * i,
                run: () => {
                  if (player.actionId !== id || !player.alive) return;
                  this.atContact = true;
                  this.caster = player;
                  try {
                    this.meleeSwing(player, facing, arc, reach, blowPacket, ctx, enemies, boss, type, true, kind, sound.hit, most, focus);
                  } finally {
                    this.atContact = false;
                  }
                },
              });
            }
          }
          break;
        }

        case 'whirlwind': {
          player.beginAction(own ?? 'attack2', attackTime * 1.4);
          this.meleeSwing(player, dir, Math.PI * 2, num('reach', 2.8), makePacket, ctx, enemies, boss, type, true, 'melee', sound.hit);
          break;
        }

        case 'projectile':
        case 'bolt': {
          player.beginAction(clip, castTime);
          const range = num('range', 18);
          const count = Math.max(1, Math.floor(num('count', 1)));
          const spread = num('spread', 0.16);
          const pierce = Math.floor(num('pierce', 0));
          const splash = num('splash', 0);

          // Forked Bolt adds shots either side of the original at reduced power.
          const fp = player.passives;
          const forks = type === 'lightning' ? Math.floor(fp.forkCount) : 0;
          const shots = count + forks;
          for (let i = 0; i < shots; i++) {
            const isFork = i >= count;
            const a = isFork
              ? (i - count - (forks - 1) / 2) * (fp.forkSpread || 0.35) + (forks > 1 ? 0 : 0.35)
              : count === 1
                ? 0
                : (i - (count - 1) / 2) * spread;
            const forkScale = isFork ? fp.forkDamagePct / 100 : 1;
            const d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
            const from = origin.clone();
            // A piercing shot does not stop at the first body — it flies until a
            // wall stops it. Using the first-hit distance meant `pierce` changed
            // nothing: the arrow ended at the same monster, and the line damage
            // it applied covered only the stretch up to that monster. Pierce Shot
            // and every skill built on it pierced exactly one target.
            //
            // Anything else stops at the first thing it would actually hit, so
            // the visual lands on the target instead of sailing through it.
            const stop =
              pierce > 0
                ? this.wallStop(from, d, range, ctx, num('radius', 0.42))
                : this.firstHitAlong(from, d, range, enemies, boss, num('radius', 0.42), ctx);
            const to = from.clone().addScaledVector(d, stop);

            this.effects.projectile(from, to, {
              element: school,
              color,
              shape: THROWN_SHAPES[def.id],
              shed: sig.trail,
              flare: i === 0 && !released,
              speed: num('speed', 17),
              size: num('radius', 0.42) * sig.size,
              onHit: (p) => {
                const hit = (m = 1): DamagePacket => makePacket(m * forkScale);
                if (pierce > 0) {
                  // Piercing shots damage everything along the flight path.
                  this.lineDamage(from, d, stop, num('radius', 0.42) * 2, hit, ctx, enemies, boss);
                } else if (splash > 0) {
                  this.areaDamage(p, splash, hit, ctx, enemies, boss);
                } else {
                  this.pointDamage(p, num('radius', 0.42), hit, ctx, enemies, boss, 'projectile', from);
                }
                hitAt(p);
              },
            });
          }
          break;
        }

        case 'nova': {
          player.beginAction(clip, castTime);
          const radius = num('radius', 5.2);
          this.effects.nova(player.position.x, player.position.z, radius, {
            element: school,
            color,
            emitter: sig.emitter,
            density: sig.density,
            mark: true,
          });
          this.areaDamage(player.position, radius, makePacket, ctx, enemies, boss);
          break;
        }

        case 'slam': {
          player.beginAction(own ?? 'attack2', attackTime * 1.5);
          const radius = num('radius', 4.0);
          const at = target.clone().setY(0);
          // The wind-up is what gives a slam weight; damage lands on the beat.
          this.effects.slam(at.x, at.z, radius, {
            element: school,
            color,
            emitter: sig.emitter,
            density: sig.density,
            windup: num('windup', 0.25),
            onFire: () => {
              this.areaDamage(at, radius, () => makePacket(1.25), ctx, enemies, boss, 'heavy');
              hitAt(at);
            },
          });
          break;
        }

        case 'meteor': {
          player.beginAction(clip, castTime);
          const radius = num('radius', 3.4);
          const at = target.clone().setY(0);
          // The cast sound is the call going up (an archer looses skyward, a
          // caster's gather); the hit sound is the sky answering.
          this.effects.meteor(at.x, at.z, {
            radius,
            element: school,
            color,
            emitter: sig.emitter,
            density: sig.density,
            onHit: (p) => {
              this.areaDamage(p, radius, () => makePacket(1.4), ctx, enemies, boss);
              hitAt(p);
            },
          });
          break;
        }

        case 'beam': {
          player.beginAction(clip, castTime);
          const length = num('length', 12);
          const to = origin.clone().addScaledVector(dir, length);
          this.effects.beam(origin, to, {
            element: school,
            color,
            width: num('width', 1.1) * sig.size,
            endBurst: true,
            emitter: sig.emitter,
          });
          this.lineDamage(player.position, dir, length, num('width', 1.1), makePacket, ctx, enemies, boss);
          break;
        }

        case 'cone': {
          player.beginAction(clip, castTime);
          const reach = num('reach', 6.5);
          const half = num('arc', 1.1) * 0.5;
          this.effects.cone(player.position.clone().setY(1.0), dir, half, reach, {
            element: school,
            color,
            emitter: sig.emitter,
            density: sig.density,
          });
          this.meleeSwing(player, dir, half * 2, reach, makePacket, ctx, enemies, boss, type, false, 'melee', sound.hit);
          break;
        }

        case 'chain': {
          player.beginAction(clip, castTime);
          this.chainLightning(player, target, Math.floor(num('jumps', 4)), num('range', 7), makePacket, ctx, enemies, boss, type, color, sound.hit);
          break;
        }

        case 'dash': {
          // The dodge's own move, under the skill's own gesture when it has one.
          player.dodge(dir.x, dir.z, true, own ?? 'dodge');
          this.meleeSwing(player, dir, Math.PI, num('reach', 2.4), makePacket, ctx, enemies, boss, type, true, 'melee', sound.hit);
          break;
        }

        case 'heal': {
          player.beginAction(clip, castTime * 0.7);
          player.heal(num('amount', 30) * (1 + rank * 0.15));
          this.effects.impact('arcane', player.position.x, 1.0, player.position.z, {
            color: 0x7dffb0,
            decal: false,
            shake: 0,
            sfx: null,
          });
          break;
        }

        case 'buff':
        case 'aura':
        case 'stance':
        case 'shout':
        case 'banner':
        case 'self':
        case 'absorb': {
          player.beginAction(clip, castTime * 0.7);
          // Commanding Presence and Standard Bearer widen and strengthen what an
          // oath, aura or banner does. `applyBuff` reads the same numbers.
          this.applyBuff(player, def, rank, num, color);
          // A war cry reaches the monsters around you too: fear, weakness, taunt.
          if (family === 'shout' && FOE_POWER[def.id]) {
            const applies = this.statusFor(def, num, color);
            const reach = num('radius', 8) + (ctx.auraRadiusBonus ?? 0);
            for (const t of this.allTargets(enemies, boss)) {
              if (this.groundDistance(t.root.position, player.position) > reach + t.hitRadius) continue;
              t.applyStatuses(applies, ctx);
            }
          }
          // A shout with a damage ladder (Herald of Ruin) is a blast as well.
          if (family === 'shout' && def.damageScale) {
            const at = player.position.clone().setY(0);
            this.areaDamage(at, num('radius', 8) + (ctx.auraRadiusBonus ?? 0), makePacket, ctx, enemies, boss);
          }
          // A damage aura (Bone Storm, Pestilence, Gravechill) hurts what stands
          // in it for as long as it lasts, and moves with you.
          if (family === 'aura' && def.damageScale) {
            for (let i = this.zones.length - 1; i >= 0; i--) {
              if (this.zones[i]!.skillId !== def.id) continue;
              this.zones[i]!.fx?.stop();
              this.zones.splice(i, 1);
            }
            const radius = num('radius', 4) + (ctx.auraRadiusBonus ?? 0);
            this.addZone(
              player.position.x, player.position.z, radius, num('duration', 30), num('tickRate', 0.5),
              makePacket, type, color, sig.emitter, this.statusFor(def, num, color, true),
            );
            const zone = this.zones[this.zones.length - 1]!;
            zone.fx?.stop();
            zone.fx = this.effects.aura(player.root, { radius, color, element: school, groundRing: true });
            zone.follow = player.root;
            zone.skillId = def.id;
          }
          // Sworn Brother: a spectral Knight rises where the standard goes in.
          if (family === 'banner') this.raiseSwornBrother(player, target, ctx);
          // Power rising from the caster (a stance plants, a shout roars out),
          // not an impact drawn on their own chest.
          this.effects.selfCast(
            family === 'shout' ? 'shout' : family === 'banner' ? 'banner' : family === 'stance' ? 'stance' : 'rise',
            school, player.position.x, player.position.z,
            {
              color, emitter: sig.emitter, density: sig.density, rank,
              radius: family === 'shout' ? num('radius', 8) + (ctx.auraRadiusBonus ?? 0) : undefined,
            },
          );
          break;
        }

        // -- persistent ground ------------------------------------------------
        // Fifteen skills across four classes describe leaving something burning,
        // choking or freezing on the floor. None of them left anything: the
        // family had no handler, so every one fired a plain bolt.
        case 'ground':
        case 'trap':
        case 'ward': {
          player.beginAction(clip, castTime);
          // Scorched Earth and Standard Bearer both make what you leave on the
          // floor last longer and hit harder.
          const groundLife = 1 + player.passives.groundDurationPct / 100;
          const groundHit = 1 + player.passives.groundDamagePct / 100;
          const radius = num('radius', 3.2) + (ctx.auraRadiusBonus ?? 0);
          const duration = num('duration', 6) * groundLife;
          const at = target.clone().setY(0);
          this.addZone(
            at.x, at.z, radius, duration,
            num('tickRate', 0.5),
            // Ticking damage is a fraction of the hit it would be as a burst, or
            // standing in a field would out-damage every direct skill in the game.
            (m = 1) => makePacket(m * num('tickScale', 0.28) * groundHit),
            type, color, sig.emitter,
            this.statusFor(def, num, color),
            def.id, school, rank,
          );
          this.effects.nova(at.x, at.z, radius, { element: school, color, emitter: sig.emitter, density: sig.density });
          break;
        }

        // -- summons ----------------------------------------------------------
        // Nine skills summon. Nothing was ever summoned. A minion here is a
        // guardian that holds its ground and fights: a real presence with a real
        // lifetime, without a full pet AI it would have to path and follow.
        case 'summon':
        case 'minion': {
          player.beginAction(own ?? 'point', castTime);
          // Reassemble mends the host rather than adding to it.
          if (def.effect === 'minion.heal') {
            this.healAll(player, num('healPct', 40) + num('perRank', 3) * Math.max(0, rank - 1), true);
            this.effects.nova(player.position.x, player.position.z, num('radius', 10), {
              element: school, color, emitter: sig.emitter, density: sig.density * 0.5,
            });
            break;
          }
          // A creature stays until something kills it; only a totem runs down.
          const isTotem = (def.effect ?? '').includes('totem');
          // Bone Mastery, Marrow Feast and the minion capstones all land here.
          const mp = player.passives;
          // Shadow Legion and Mirror Gambit only touch the clone summons; every
          // other summon keeps the minion numbers.
          const isClone = (def.effect ?? '').includes('clone');
          const count = Math.max(1, Math.floor(num('count', 1)));
          // Only a totem has a lifetime. A creature is permanent.
          const life = isTotem
            ? num('duration', 20) * (1 + mp.minionDurationPct / 100)
            : Infinity;

          // The cap: what the skill grants, plus ranks, plus the minion passives,
          // stopped at the number the fight is balanced around.
          const cap = Math.min(
            SUMMON_ABSOLUTE_CAP,
            SUMMON_HARD_CAP[def.id] ?? 6,
            Math.max(1, num('baseCap', 1))
              + Math.floor(rank / Math.max(1, num('maxPerRanks', 99)))
              + Math.floor(isClone ? mp.cloneCount : mp.minionCapBonus),
          );
          const minionPower = 1 + (isClone ? mp.clonePowerPct : mp.minionDamagePct) / 100;
          // Skeletal Knight and Death Knight upgrade the first few summons.
          const elites = Math.floor(mp.minionEliteCount);
          const elitePower = 1 + mp.minionElitePowerPct / 100;
          const swingRate = 1 / (1 + mp.minionAttackSpeedPct / 100);
          // A Shadow Clone is you in shadow, so it fights with your blades.
          const melee = (def.effect ?? '').includes('minion') || (def.effect ?? '').includes('sentinel') || def.id === 'shadowClone';
          // Make room before raising anything. Oldest of this skill goes first, so
          // pressing the button at the cap always does something visible.
          if (!isTotem) this.trimSummons(def.id, Math.max(0, cap - count));

          const room = isTotem ? count : Math.max(0, cap - this.countSummons(def.id));
          if (room === 0) {
            events.emit('toast', { text: `${def.name} is at its limit.`, kind: 'info' });
            break;
          }
          for (let i = 0; i < Math.min(count, room); i++) {
            const a = (i / count) * Math.PI * 2;
            const spread = 1.2 + count * 0.25;
            this.addTurret(
              player.position.x + Math.cos(a) * spread,
              player.position.z + Math.sin(a) * spread,
              life,
              num('attackRate', melee ? 1.1 : 1.6) * swingRate,
              num('range', melee ? 2.6 : 11),
              (m = 1) => makePacket(m * num('minionScale', 0.5) * minionPower * (i < elites ? elitePower : 1)),
              type, color, melee, def.id,
              // A share of your own pool, which is how the skill descriptions
              // read it — "40% of your life" and so on.
              Math.max(20, player.stats.life * (num('lifePct', 40) / 100) * minionLifeGrowth(def.id, Math.max(0, rank - 1), num) * (1 + mp.minionLifePct / 100)),
              // Sentinels and clones are written to pull aggro; the rest hold a
              // line only by standing in the way.
              num('taunts', num('taunt', 0)) > 0,
              // How many it can hold. A Shadow Clone pulls one, not the room.
              num('tauntHold', Infinity),
              (r) => ({
                damage: def.damageScale ? def.damageScale(r) : burstGrowth(def.id, Math.max(0, r - 1), num),
                life: minionLifeGrowth(def.id, Math.max(0, r - 1), num),
              }),
            );
          }
          break;
        }

        // -- curses and debuffs -----------------------------------------------
        // Nine skills between them, and all nine only dealt damage. A curse that
        // deals damage is not a curse.
        case 'curse':
        case 'debuff':
        case 'apply': {
          player.beginAction(own ?? 'point', castTime);
          const radius = num('radius', family === 'apply' ? 0.9 : 4.5);
          const at = target.clone().setY(0);
          const applies = this.statusFor(def, num, color);
          let touched = 0;
          for (const t of this.allTargets(enemies, boss)) {
            if (this.groundDistance(t.root.position, at) > radius + t.hitRadius) continue;
            t.applyStatuses(applies, ctx);
            this.effects.impact(school, t.root.position.x, 1.0, t.root.position.z, {
              color, emitter: sig.emitter, density: sig.density * 0.6, decal: false, shake: 0, sfx: null,
            });
            touched++;
          }
          this.effects.nova(at.x, at.z, radius, {
            element: school, color, emitter: sig.emitter, density: sig.density * 0.5, particles: touched > 0,
          });
          // A curse that names no status still has to do something, or ranking it
          // is a wasted point.
          if (applies.length === 0) this.areaDamage(at, radius, makePacket, ctx, enemies, boss);
          // Doom Brand: the brand goes off on everything it marked when the
          // time runs out, wherever the marked have walked to.
          if (def.effect === 'curse.delayedBurst') {
            const marked = this.allTargets(enemies, boss).filter(
              (t) => this.groundDistance(t.root.position, at) <= radius + t.hitRadius,
            );
            this.pendingSwings.push({
              t: num('delay', 6),
              run: () => {
                for (const t of marked) {
                  if (t.life <= 0) continue;
                  const p = t.root.position;
                  this.effects.explosion(p.x, 0.9, p.z, { radius: 1.6, element: school, color });
                  this.pointDamage(p.clone().setY(0), 0.6, makePacket, ctx, enemies, boss, 'area');
                }
              },
            });
          }
          break;
        }

        // -- channelled tethers -------------------------------------------------
        case 'channel': {
          player.beginAction(own ?? 'channel', castTime * 1.6);
          const range = num('range', 12);
          const stop = this.firstHitAlong(origin, dir, range, enemies, boss, 0.5, ctx);
          const end = origin.clone().addScaledVector(dir, stop);
          this.effects.beam(origin, end, {
            element: school, color, width: num('width', 0.5),
            duration: num('duration', 0.5), endBurst: true,
            emitter: sig.emitter, density: sig.density,
          });
          this.lineDamage(origin, dir, stop, num('width', 0.9), makePacket, ctx, enemies, boss);
          break;
        }

        // -- strike from above --------------------------------------------------
        case 'sky': {
          player.beginAction(clip, castTime);
          const at = target.clone().setY(0);
          const radius = num('radius', 2.6);
          this.effects.meteor(at.x, at.z, {
            radius, color, element: school, emitter: sig.emitter, density: sig.density,
            onHit: (p) => {
              this.areaDamage(p, radius, makePacket, ctx, enemies, boss);
              hitAt(p);
            },
          });
          break;
        }

        // -- a line of broken ground --------------------------------------------
        case 'wave': {
          player.beginAction(own ?? 'slam', attackTime);
          const range = num('range', 9);
          const width = num('width', 2.2);
          this.effects.cone(origin, dir, 0.22, range, {
            element: school, color, emitter: sig.emitter, density: sig.density,
          });
          this.lineDamage(player.position, dir, range, width, makePacket, ctx, enemies, boss, 'heavy');
          this.effects.slam(player.position.x, player.position.z, width * 0.8, {
            element: school, color, windup: 0, emitter: sig.emitter, density: sig.density,
          });
          break;
        }

        // -- leaps and blinks ---------------------------------------------------
        case 'leap': {
          player.beginAction(own ?? 'dodge', 0.34);
          const range = num('range', 7);
          const stop = this.wallStop(player.position, dir, range, ctx, 0.5);
          // "Leap to a point up to N metres away": the point clicked, not always
          // the full distance. Landing past the pack it was aimed at meant the
          // blow came down on empty floor.
          const reach = Math.min(stop, Math.max(1.5, this.groundDistance(target, player.position)));
          const land = player.position.clone().addScaledVector(dir, reach);
          this.effects.teleportOut(player.position.x, 0.6, player.position.z, color);
          player.position.set(land.x, 0, land.z);
          this.effects.teleportIn(land.x, 0.6, land.z, color);
          const radius = num('radius', 2.8);
          this.effects.slam(land.x, land.z, radius, {
            element: school, color, windup: 0, emitter: sig.emitter, density: sig.density,
          });
          this.areaDamage(land, radius, makePacket, ctx, enemies, boss, 'heavy');
          break;
        }

        case 'teleport': {
          player.beginAction(own ?? 'blink', 0.26);
          const range = num('range', 9);
          const stop = this.wallStop(player.position, dir, Math.min(range, dir.length() > 0 ? range : range), ctx, 0.5);
          const want = target.clone().setY(0);
          const reach = Math.min(stop, this.groundDistance(want, player.position));
          const land = player.position.clone().addScaledVector(dir, reach);
          // Blink's parting gift: a burst where you were standing.
          if (num('exitBurst', 0) > 0) {
            const from = player.position.clone().setY(0);
            const r = num('radius', 3);
            this.effects.explosion(from.x, 0.8, from.z, { radius: r, element: school, color });
            this.areaDamage(from, r, makePacket, ctx, enemies, boss);
          }
          this.effects.teleportOut(player.position.x, 0.9, player.position.z, color);
          player.position.set(land.x, 0, land.z);
          this.effects.teleportIn(land.x, 0.9, land.z, color);
          // A strike teleport arrives swinging.
          if ((def.effect ?? '').includes('strike') || (def.effect ?? '').includes('chain')) {
            const single = num('single', 0) > 0;
            this.meleeSwing(
              player, dir, 2.4, num('radius', 2.6), makePacket, ctx, enemies, boss, type, false, 'melee', sound.hit,
              single ? 1 : Infinity, single ? { x: land.x, z: land.z } : null,
            );
          }
          break;
        }

        // -- detonations and corpse work ----------------------------------------
        // These consume something already on the field: a stack of damage over
        // time, or a body. Both land as a burst centred on what they consume.
        case 'detonate':
        case 'corpse':
        case 'point':
        case 'aoe':
        case 'capstone': {
          player.beginAction(clip, castTime);
          const radius = num('radius', family === 'point' ? 1.2 : 4);
          const at = family === 'aoe' || family === 'capstone' ? player.position.clone().setY(0) : target.clone().setY(0);
          this.effects.explosion(at.x, 0.8, at.z, { radius, element: school, color });
          this.effects.nova(at.x, at.z, radius, {
            element: school, color, emitter: sig.emitter, density: sig.density,
          });
          const dealt = this.areaDamage(at, radius, (m = 1) => makePacket(m * num('burstScale', 1)), ctx, enemies, boss);
          // Gorefeast drinks what it tears open: a share of the burst, more a rank.
          const drink = num('healPct', 0) + num('healPerRank', 0) * Math.max(0, rank - 1);
          if (drink > 0 && dealt > 0) player.heal(dealt * drink / 100);
          // A capstone is the top of a tree; it leaves the ground burning too.
          if (family === 'capstone') {
            this.addZone(
              at.x, at.z, radius, num('duration', 5), 0.5,
              (m = 1) => makePacket(m * 0.3), type, color, sig.emitter,
              undefined, def.id, school, rank,
            );
          }
          this.applyBuff(player, def, rank, num, color);
          break;
        }

        // The Shapeshifter's skills (scenes/ShifterRunner.ts).
        case 'shift': {
          runShift(this.shiftKit(player, ctx, enemies, boss, type, sound.hit, def, num, color, rank), {
            def, rank, player, target, dir, origin, ctx, type, color, clip, attackTime, castTime, makePacket, num, hitAt,
          });
          break;
        }

        // The Paladin's weapon skills: one enemy, one blow (paladin/Rites.ts).
        case 'rite': {
          this.swingSchool = 'physical';
          const rc: RiteCast = {
            def, rank, player, aim: target.clone().setY(0), ctx, enemies, boss,
            packet: makePacket, num, school, color, attackTime, hitSound: sound.hit,
          };
          castRite(this.riteHost, rc);
          if (rc.landAt) target = rc.landAt;
          break;
        }

        // The Paladin's auras, vows and censures (paladin/Vigils.ts).
        case 'vigil': {
          const vc: VigilCast = {
            def, rank, player, aim: target.clone().setY(0), ctx, enemies, boss,
            packet: makePacket, num, school, color, attackTime, castTime, hitSound: sound.hit,
          };
          castVigil(this.vigilHost, vc);
          if (vc.landAt) target = vc.landAt;
          break;
        }

        default: {
          // An unknown effect id falls back to a delivery the character can
          // actually perform, rather than always to a swing: falling back to
          // melee put every bow user through a sword animation, hitting nothing,
          // on every cast of anything the runner did not recognise.
          if (holding === 'ranged' || holding === 'caster') {
            player.beginAction(clip, castTime);
            const from = player.position.clone().setY(holding === 'ranged' ? 1.28 : 1.05);
            const stop = this.firstHitAlong(from, dir, 18, enemies, boss, 0.4, ctx);
            this.effects.projectile(from, from.clone().addScaledVector(dir, stop), {
              element: school,
              color,
              shed: sig.trail,
              speed: holding === 'ranged' ? 30 : 20,
              size: holding === 'ranged' ? 0.24 : 0.36,
              onHit: (pt) => {
                this.pointDamage(pt, 0.6, makePacket, ctx, enemies, boss, 'projectile', from);
                hitAt(pt);
              },
            });
          } else {
            player.beginAction(clip, attackTime);
            this.meleeSwing(player, dir, 1.4, 2.3, makePacket, ctx, enemies, boss, type, true, 'melee', sound.hit);
          }
          break;
        }
      }
      // The skill's own drawing on top of its family's (`fx/SkillLooks.ts`).
      this.drawMotif(def.id, family, def.targeting, origin, target, dir, school, color, player.contactIn, num('radius', 2.5), rank);
    } finally {
      this.effects.endQuiet();
      this.casting = false;
    }

    return true;
  }

  /**
   * Draws a skill's motif: its own shape in its own motion, at the caster,
   * the point aimed at or just in front, landing with the blow or the release.
   */
  private drawMotif(id: string, family: string, targeting: string | undefined, origin: THREE.Vector3, target: THREE.Vector3, dir: THREE.Vector3, school: School, color: number, contactIn: number, radius: number, rank = 1): void {
    const motif = SKILL_MOTIFS[id];
    if (!motif) return;
    const at = motifAt(family, targeting, motif);
    const front = family === 'projectile' || family === 'bolt' ? 0.6 : 1.1;
    const x = at === 'self' ? origin.x : at === 'target' ? target.x : origin.x + dir.x * front;
    const z = at === 'self' ? origin.z : at === 'target' ? target.z : origin.z + dir.z * front;
    const fx = Math.abs(dir.x) + Math.abs(dir.z) > 1e-4 ? dir.x : 0;
    const fz = Math.abs(dir.x) + Math.abs(dir.z) > 1e-4 ? dir.z : 1;
    const lead = family === 'dash' || family === 'teleport' ? 0 : contactIn > 0 ? contactIn : 0.1;
    this.effects.motif(motif.shape, motif.motion, {
      x, z, fx, fz, ox: origin.x, oz: origin.z, tx: target.x, tz: target.z,
      radius: Math.max(1.2, Math.min(4, radius)),
    }, { element: school, color, delay: lead, size: (motif.size ?? 1) * rankSize(rank) });
  }

  /**
   * The free basic attack. No rank, no mana, no cooldown — this is the floor
   * that guarantees left click always does something, whatever the player has
   * (or has not) bound.
   */
  basicAttack(
    player: Player,
    target: THREE.Vector3,
    ctx: CombatContext,
    enemies: Enemy[],
    boss: Boss | null
  ): boolean {
    if (player.isBusy || !player.alive) return false;
    const style = weaponStyle(player);
    // A wand, a staff or a focus does not hit anything by itself: every bolt a
    // caster throws is a spell.
    if (style === 'caster' || (style === 'unarmed' && casterOffHand(player))) return false;
    this.setCaster(player, enemies, boss);

    player.faceTowards(target.x, target.z);
    const dir = this.tmp.copy(target).sub(player.position).setY(0).normalize().clone();

    const packet = (mult = 1): DamagePacket =>
      rollDamage(player.stats, ctx.rng, {
        scale: mult,
        type: 'physical',
        ability: 'Attack',
        source: 'player',
      });

    // The weapon decides what a basic attack even is.
    if (style === 'ranged') {
      const castTime = 0.46 / Math.max(0.4, 1 + player.attackSpeedPct / 100);
      // A bow is drawn and loosed. Sharing the casting animation put archers
      // through a two-handed overhead gesture with a bow in their hands.
      player.beginAction('shoot', castTime);
      this.releaseSchool = null;
      // Arrows leave the bow hand, offset to the bow side so the shot lines up
      // with the weapon.
      const from = player.position.clone().setY(1.28);
      from.addScaledVector(this.tmp.set(dir.z, 0, -dir.x), 0.16);
      const stop = this.firstHitAlong(from, dir, 20, enemies, boss, 0.4, ctx);
      const to = from.clone().addScaledVector(dir, stop);

      this.effects.projectile(from, to, {
        element: 'physical',
        color: 0xd8c9a0,
        speed: 30,
        size: 0.24,
        flare: false,
        onHit: (p) => this.pointDamage(p, 0.5, packet, ctx, enemies, boss, 'projectile', from),
      });
      audio.play('cast.physical');
      return true;
    }

    const dual = isDualWielding(player);
    // Two blades take turns, right then left, each swing half as long as a
    // single weapon's (see DUAL_BLOW_SCALE).
    const attackTime = (dual ? DUAL_SWING : 0.42) / Math.max(0.4, 1 + player.attackSpeedPct / 100);
    // Basic melee alternates its two swings, so holding the button reads as a
    // combo rather than one animation stuttering. With two blades the right
    // blade opens and the left answers.
    this.swingParity = (this.swingParity + 1) % 2;
    const side = dual ? (this.swingParity === 0 ? 'R' : 'L') : undefined;
    player.beginAction(this.swingParity === 0 ? 'attack1' : 'attack2', attackTime, side);
    const blow = dual ? (mult = 1): DamagePacket => packet(mult * DUAL_BLOW_SCALE) : packet;
    this.meleeSwing(player, dir, 1.5, 2.4, blow, ctx, enemies, boss, 'physical');
    return true;
  }

  /**
   * True when something is close enough for a basic swing to connect. Called
   * every frame the attack button is held, so it walks the arrays directly and
   * compares squared distances rather than building a target list.
   */
  hasTargetInReach(player: Player, enemies: Enemy[], boss: Boss | null, reach = 2.4): boolean {
    // Bows and staves reach across the room; they always have a shot.
    const style = weaponStyle(player);
    if (style === 'ranged' || style === 'caster') return true;
    const px = player.position.x;
    const pz = player.position.z;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!;
      if (e.life <= 0) continue;
      const r = reach + e.hitRadius;
      const dx = e.root.position.x - px;
      const dz = e.root.position.z - pz;
      if (dx * dx + dz * dz <= r * r) return true;
    }
    if (boss && boss.life > 0) {
      const r = reach + boss.hitRadius;
      const dx = boss.root.position.x - px;
      const dz = boss.root.position.z - pz;
      if (dx * dx + dz * dz <= r * r) return true;
    }
    return false;
  }

  /**
   * Applies a skill's buff so it shows on the HUD with a running timer.
   * Most buff skills declare their duration in `params.duration`; anything
   * without one gets a sensible default rather than no feedback at all.
   */
  /**
   * The debuff a curse, field or trap lays on whatever it catches.
   *
   * Prefers a status the skill names outright. Failing that it synthesizes one
   * under the skill's own id so the effect is real and the tooltip reads — a
   * curse with no registered status used to be a curse that did nothing at all.
   */
  private statusFor(
    def: { id: string; name: string; params?: Record<string, number | number[] | string> },
    num: (k: string, d: number) => number,
    color: number,
    /**
     * True when this is the rider attached to every packet the skill throws.
     * A rider only fires when the skill genuinely names an effect: synthesizing
     * a placeholder for all 163 skills would put a meaningless icon on every
     * monster in the game.
     */
    riderOnly = false,
  ): StatusApplication[] {
    const e = this.caster?.passives;
    // Passives that scale what the player puts on a monster land here, because
    // this is the one function that builds those applications. Dot passives
    // lengthen and strengthen afflictions; curse passives do the same for
    // control and shred.
    const dotBonus = 1 + (e?.dotDamagePct ?? 0) / 100;
    const curseBonus = 1 + (e?.curseEffectPct ?? 0) / 100;
    const duration =
      (num('duration', 8) + (e?.dotDurationSec ?? 0)) * (1 + (e?.curseDurationPct ?? 0) / 100);
    const magnitude =
      num('amp', num('magnitude', num('slow', 1))) * Math.max(dotBonus, curseBonus);
    const extraStacks = Math.floor(e?.dotMaxStacks ?? 0);
    const tickScale = 1 + (e?.dotTickPct ?? 0) / 100;
    const named = typeof def.params?.statusId === 'string' ? (def.params.statusId as string) : null;
    // What this rank leaves on a monster (`data/skillPower.ts`).
    const foe = FOE_POWER[def.id];
    if (foe) {
      const rank = this.caster ? skillRank(this.caster.character, def.id) : 1;
      const power = foe(Math.max(0, rank - 1), num);
      const id = power.status ?? named ?? SKILL_STATUS[def.id] ?? null;
      if (id && getStatus(id)) {
        const longer = e?.dotDurationSec ?? 0;
        const stretch = 1 + (e?.curseDurationPct ?? 0) / 100;
        const out: StatusApplication[] = [{
          id,
          duration: ((power.duration ?? num('duration', 8)) + longer) * stretch,
          magnitude: (power.magnitude ?? 1) * Math.max(dotBonus, curseBonus),
          stacks: 1,
          maxStacks: extraStacks,
          tickScale,
          ...(power.mods ? { mods: curseBonus !== 1 ? scaleShred(power.mods, curseBonus) : power.mods } : {}),
        }];
        if (power.also && getStatus(power.also.status)) {
          out.push({ id: power.also.status, duration: power.also.duration * stretch, magnitude: 1, stacks: 1, ...(power.also.mods ? { mods: power.also.mods } : {}) });
        }
        return out;
      }
    }
    if (named && getStatus(named)) {
      return [{ id: named, duration, magnitude, stacks: 1, maxStacks: extraStacks, tickScale }];
    }
    // The authored effect this skill is describing, if the two tables can be
    // joined. This is what makes a curse actually curse.
    const mapped = SKILL_STATUS[def.id];
    if (mapped && getStatus(mapped)) {
      return [{ id: mapped, duration, magnitude, stacks: 1, maxStacks: extraStacks, tickScale }];
    }
    // Poison skills say how many stacks of Poisoned they leave: Viper Strike
    // three, Venom Dart four, Death Lotus one a hit. Nothing read the number,
    // so they poisoned only on the element's own chance, a stack at a time.
    const poisonStacks = Math.floor(num('poisonStacks', num('poisonPerHit', 0)));
    if (poisonStacks > 0 && getStatus('poisoned')) {
      const rank = this.caster ? skillRank(this.caster.character, def.id) : 1;
      const longer = num('durationPerRank', 0) * Math.max(0, rank - 1);
      return [{ id: 'poisoned', duration: duration + longer, magnitude, stacks: poisonStacks, maxStacks: extraStacks, tickScale }];
    }
    if (riderOnly) return [];
    const id = `skill.${def.id}`;
    if (!getStatus(id)) synthesizeSkillBuff(def.id, def.name, color, 'sparkle', duration);
    return [{ id, duration, magnitude, stacks: 1 }];
  }

  private applyBuff(
    player: Player,
    def: { id: string; name: string; params?: Record<string, number | number[]> },
    rank: number,
    num: (k: string, d: number) => number,
    color: number
  ): void {
    const e = player.passives;
    const auraScale = 1 + e.auraStrengthPct / 100;
    // What this rank buys (`data/skillPower.ts`): the stats, the ward, the time.
    const k = Math.max(0, rank - 1);
    const power = SELF_POWER[def.id]?.(k, num) ?? {};
    const duration =
      (power.duration ?? num('duration', 10) + num('durationPerRank', 0) * k) * (1 + e.groundDurationPct / 100);

    // Prefer the authored status this skill is meant to grant, so the buff
    // carries real modifiers instead of being a decorative icon. Only skills
    // with nothing authored fall back to a synthesized placeholder named after
    // the skill, which at least reads correctly in the tooltip.
    const authored = power.status ?? SELF_BUFF_STATUS[def.id] ?? null;
    const id = authored && getStatus(authored) ? authored : `skill.${def.id}`;
    if (!getStatus(id)) {
      synthesizeSkillBuff(def.id, def.name, color, 'sparkle', duration);
    }
    // Commanding Presence and Standard Bearer strengthen every number here too.
    const raw = power.mods ?? grownMods(getStatus(id)?.mods, k);
    const mods = raw && auraScale !== 1 ? scaleMods(raw, auraScale) : raw;
    const absorb =
      power.absorb !== undefined || power.absorbLifePct !== undefined
        ? ((power.absorb ?? 0) + player.stats.life * (power.absorbLifePct ?? 0) / 100) * auraScale
        : undefined;
    player.applyStatus(id, Math.max(1, duration), auraScale, 1, { mods, absorb });
    if (power.healPct) this.healAll(player, power.healPct * auraScale);
  }

  /** Heals you and every minion you have standing, by a share of maximum life. */
  private healAll(player: Player, pct: number, minionsOnly = false): void {
    if (!minionsOnly) player.heal(player.stats.life * pct / 100);
    for (const t of this.turrets) {
      if (t.life <= 0) continue;
      t.life = Math.min(t.maxLife, t.life + t.maxLife * pct / 100);
    }
  }

  /** Distance along `dir` to the nearest target, or `max` if nothing is hit. */
  /**
   * How far a shot travels before something stops it.
   *
   * Walls count. Enemy projectiles have always tested line of sight, but the
   * player's never did, so every arrow, bolt and firebolt flew straight through
   * the level geometry and hit things in the next room.
   */
  private firstHitAlong(
    from: THREE.Vector3,
    dir: THREE.Vector3,
    max: number,
    enemies: Enemy[],
    boss: Boss | null,
    radius: number,
    ctx?: CombatContext
  ): number {
    const wall = this.wallStop(from, dir, max, ctx, radius);
    let best = Infinity;
    const consider = (t: Target) => {
      if (t.life <= 0) return;
      const to = this.tmp2.copy(t.root.position).sub(from).setY(0);
      const along = to.dot(dir);
      if (along <= 0 || along > max || along >= best) return;
      const perp = Math.sqrt(Math.max(0, to.lengthSq() - along * along));
      if (perp > radius + t.hitRadius) return;
      // A monster is not rejected merely for sitting past the wall stop.
      //
      // `NavGrid.lineOfSight` is deliberately conservative about diagonal
      // steps, so a ray aimed at something backed against a wall clips the wall
      // tile up to a metre before reaching it. Requiring the monster's *centre*
      // to be in front of that point is exactly why shots at anything standing
      // against a wall stopped short and dealt nothing. What the shot meets is
      // the near edge of the body, plus half a metre of slack for the grid.
      // Anything in the next room is metres past the wall and still excluded.
      if (along - t.hitRadius - 0.5 > wall) return;
      best = along;
    };
    for (const e of enemies) consider(e);
    if (boss) consider(boss);
    return best === Infinity ? wall : best;
  }

  /**
   * Walks the ray in short steps and stops at the first blocked point. Stepping
   * rather than solving is deliberate: the nav grid already answers "can these
   * two points see each other" exactly, and props are boxes the grid does not
   * know about, so one loop covers both.
   */
  private wallStop(
    from: THREE.Vector3,
    dir: THREE.Vector3,
    max: number,
    ctx: CombatContext | undefined,
    radius: number
  ): number {
    if (!ctx) return max;
    const STEP = 0.5;
    const bl = ctx.blockers;
    let travelled = 0;
    let px = from.x;
    let pz = from.z;
    while (travelled < max) {
      const step = Math.min(STEP, max - travelled);
      const nx = px + dir.x * step;
      const nz = pz + dir.z * step;
      if (ctx.nav && !ctx.nav.lineOfSight(px, pz, nx, nz)) return travelled;
      if (bl) {
        for (let i = 0; i < bl.length; i++) {
          const b = bl[i]!;
          if (
            Math.abs(nx - b.x) < b.w * 0.5 + radius * 0.5 &&
            Math.abs(nz - b.z) < b.d * 0.5 + radius * 0.5
          ) {
            return travelled;
          }
        }
      }
      px = nx;
      pz = nz;
      travelled += step;
    }
    return max;
  }

  /**
   * One free swing at whatever just hit you. Riposte's counterattack.
   *
   * Lives here rather than in the scene because it is a player attack and has
   * to go through the same packet pipeline as every other one, conditional
   * passives included.
   */
  counterAttack(player: Player, target: Target, ctx: CombatContext, scale: number): void {
    this.caster = player;
    const packet = rollDamage(player.stats, ctx.rng, {
      scale,
      type: 'physical',
      ability: 'Riposte',
      source: 'player',
    });
    this.strike(target, this.tune(packet, target), ctx, 'melee', player.position.x, player.position.z);
    this.effects.meleeHit(target.root.position.x, 1.0, target.root.position.z, {
      sfx: null,
      shake: 0,
    });
  }

  /**
   * A blast a passive fires rather than a skill. Phoenix Heart's rebirth nova.
   */
  passiveNova(
    player: Player,
    at: THREE.Vector3,
    radius: number,
    scale: number,
    type: DamageType,
    ctx: CombatContext,
    enemies: Enemy[],
    boss: Boss | null,
  ): void {
    this.setCaster(player, enemies, boss);
    const packet = (): DamagePacket =>
      rollDamage(player.stats, ctx.rng, { scale, type, ability: 'Rebirth', source: 'player' });
    this.areaDamage(at, radius, packet, ctx, enemies, boss);
  }

  private allTargets(enemies: Enemy[], boss: Boss | null): Target[] {
    const list: Target[] = [];
    for (const e of enemies) if (e.life > 0) list.push(e);
    if (boss && boss.life > 0) list.push(boss);
    return list;
  }

  /** The school of the last weapon swing, for the swing ribbon (fx/BodyFX). */
  swingSchool: School = 'physical';
  /** The school the hero's next release frame flares in; null for none. */
  releaseSchool: School | null = null;

  private meleeSwing(
    player: Player,
    facing: THREE.Vector3,
    arc: number,
    reach: number,
    packet: (m?: number) => DamagePacket,
    ctx: CombatContext,
    enemies: Enemy[],
    boss: Boss | null,
    type: DamageType,
    playVisual = true,
    kind: HitKind = 'melee',
    hitSfx: string | null = null,
    /** A single-target skill hits this many, nearest `focus` first. */
    maxTargets = Infinity,
    focus: { x: number; z: number } | null = null,
  ): void {
    const origin = player.position;
    const half = arc * 0.5;
    let hits = 0;
    let firstX = 0;
    let firstZ = 0;
    if (playVisual && !this.atContact) this.swingSchool = type in ELEMENTS ? (type as School) : 'physical';
    // The swing is heard whether or not it connects: whoosh, then impact.
    // A skill's swing is its own cast sound instead (audio/SkillSounds.ts).
    if (playVisual && !this.atContact && !this.casting) {
      audio.play(kind === 'heavy' ? 'swing.heavy' : `swing.${this.weaponSound}`, {
        x: origin.x, z: origin.z, volume: 0.9,
      });
    }
    // A weapon swing connects at its contact frame. Dodging out first cancels it.
    const wait = playVisual && !this.atContact ? player.contactIn : 0;
    if (wait > 0.01) {
      const id = player.actionId;
      const dir = facing.clone();
      const echo = this.echoScale;
      this.pendingSwings.push({
        t: wait,
        run: () => {
          if (player.actionId !== id || !player.alive) return;
          const prev = this.echoScale;
          this.atContact = true;
          this.echoScale = echo;
          try {
            this.meleeSwing(player, dir, arc, reach, packet, ctx, enemies, boss, type, playVisual, kind, hitSfx, maxTargets, focus);
          } finally {
            this.atContact = false;
            this.echoScale = prev;
          }
        },
      });
      return;
    }

    let caught = this.allTargets(enemies, boss).filter((t) => {
      const to = this.tmp2.copy(t.root.position).sub(origin).setY(0);
      const dist = to.length();
      if (dist > reach + t.hitRadius) return false;
      // Standing inside its body (a step that lands on the one you clicked)
      // is in front of you whichever way you face.
      if (dist <= t.hitRadius) return true;
      if (arc < Math.PI * 1.99) {
        to.normalize();
        if (facing.dot(to) < Math.cos(half)) return false;
      }
      return true;
    });
    // A single-target skill takes the one you aimed at, not the whole arc.
    if (caught.length > maxTargets) {
      const fx = focus?.x ?? origin.x;
      const fz = focus?.z ?? origin.z;
      const d2 = (t: Target): number => (t.root.position.x - fx) ** 2 + (t.root.position.z - fz) ** 2;
      caught = caught.sort((a, b) => d2(a) - d2(b)).slice(0, maxTargets);
    }
    for (const t of caught) {
      const mp = this.tune(packet(), t);
      this.strike(t, mp, ctx, kind, origin.x, origin.z);
      this.afterHit(mp, t, ctx, enemies, boss);
      // Sound and camera come from the feel layer, which knows the weapon and
      // the body it met; the impact here is the picture only.
      this.effects.meleeHit(t.root.position.x, 1.0, t.root.position.z, {
        dir: facing, element: this.swingSchool, sfx: null, shake: 0, crit: mp.crit,
      });
      if (hits === 0) {
        firstX = t.root.position.x;
        firstZ = t.root.position.z;
      }
      hits++;
    }

    // A skill blow that connects is heard once, at the first body it met.
    if (hits > 0 && hitSfx) audio.play(hitSfx, { x: firstX, z: firstZ });
  }

  /**
   * Distance on the floor, ignoring height.
   *
   * Every hit test in this game is really a 2D one: monsters are pinned to the
   * ground and `root.position` is at their feet, while the points effects
   * happen at are at chest or head height. Measuring in 3D silently adds that
   * height difference to every range check — an arrow leaves the bow at 1.28m,
   * so a hit test with a half-metre radius could never succeed no matter how
   * squarely the shot landed. That is ranged attacks doing no damage.
   */
  private groundDistance(a: THREE.Vector3, b: THREE.Vector3): number {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /**
   * Applies the caster's conditional passives to one packet against one target.
   *
   * This is the single choke point for "more damage when...". Executioner,
   * Blood Scent, Ember Soul, Hemotoxin and Momentum all land here, because all
   * of them need the attacker and the victim at the same moment and nowhere
   * else in the pipeline has both.
   */
  private tune(packet: DamagePacket, t: Target): DamagePacket {
    const p = this.caster;
    if (!p) return packet;
    const e = p.passives;
    // Transformer converts part of every other school into lightning, which is
    // the school the Mage's lightning tree scales.
    if (
      e.convertToLightningPct > 0 &&
      (packet.type === 'fire' || packet.type === 'cold' || packet.type === 'physical')
    ) {
      packet = { ...packet, type: 'lightning', parts: undefined };
    }
    const mul = damageMultiplier(
      e,
      {
        lifeFrac: t.life / Math.max(1, t.maxLife),
        bleeding: t.isBleeding,
        debuffed: t.isDebuffed,
      },
      {
        manaFrac: p.mana / Math.max(1, p.stats.mana),
        maxMana: p.stats.mana,
        lifeFrac: p.life / Math.max(1, p.stats.life),
        nearby: this.nearbyCount,
        moving: p.passiveState.moving,
        souls: p.passiveState.souls,
        maxLife: p.stats.life,
      },
    );
    const st = p.passiveState;
    let amount = packet.amount * mul * this.echoScale;

    // Perfect Form: every Nth blow is a guaranteed critical, and hits harder
    // for being one. Counted per landed blow, not per press, so a whirlwind
    // does not burn the counter on a swing that touched nothing.
    let crit = packet.crit;
    if (e.guaranteedCritEvery > 0) {
      st.swings++;
      if (st.swings >= e.guaranteedCritEvery) {
        st.swings = 0;
        crit = true;
        amount *= 1 + e.guaranteedCritBonusPct / 100;
      }
    }
    // Blood Toxin: poison that ignores part of the resistance meant to stop it.
    // Applied as raw damage rather than a resistance edit, which is the same
    // arithmetic and keeps mitigation a pure function.
    if (e.resistPiercePct > 0 && packet.type === 'poison') {
      amount *= 1 + e.resistPiercePct / 200;
    }
    if (crit !== packet.crit || amount !== packet.amount) {
      return { ...packet, amount, crit };
    }

    // Retribution: blocks build a charge and the next blow spends it.
    if (st.retribution > 0 && e.retributionRadius > 0) {
      amount *= 1 + st.retribution / 100;
      st.retribution = 0;
    }
    if (amount === packet.amount) return packet;
    return { ...packet, amount };
  }

  /**
   * Everything that happens after a blow has landed on one target.
   *
   * Arc Weave throws a smaller copy at a second enemy, and Superconductor
   * shares lightning between everything already Shocked. Both need the hit to
   * have resolved first, so neither can live in `tune`.
   */
  private afterHit(packet: DamagePacket, t: Target, ctx: CombatContext, enemies: Enemy[], boss: Boss | null): void {
    const p = this.caster;
    if (!p || this.arcing) return;
    const e = p.passives;
    // Every section below checks its own passive, so there is no early-out
    // here: one used to skip the lot unless Arc Weave or Superconductor was
    // taken, which silently switched off crit riders, Flurry and the leeches.
    this.landedHits++;

    this.arcing = true;
    try {
      // --- what a critical strike leaves behind --------------------------
      if (packet.crit) {
        const riders: StatusApplication[] = [];
        if (e.critVulnerableSec > 0) {
          riders.push({ id: 'vulnerable', duration: e.critVulnerableSec, magnitude: 1, stacks: 1 });
        }
        if (e.critBleedStacks > 0) {
          riders.push({
            id: 'bleeding',
            duration: 6,
            magnitude: 1,
            stacks: Math.floor(e.critBleedStacks),
          });
        }
        if (riders.length) t.applyStatuses(riders, ctx);

        // Phantom Blades: a spectral copy flies at somebody else.
        if (e.critBladeChance > 0 && ctx.rng.chance(Math.min(1, e.critBladeChance / 100))) {
          let mark: Target | null = null;
          let markD = Infinity;
          for (const other of this.allTargets(enemies, boss)) {
            if (other === t || other.life <= 0) continue;
            const d = this.groundDistance(other.root.position, t.root.position);
            if (d < markD && d <= e.critBladeRange) {
              markD = d;
              mark = other;
            }
          }
          if (mark) {
            this.strike(
              mark,
              { ...packet, amount: packet.amount * (e.critBladePct / 100), ability: 'Phantom Blade' },
              ctx, 'proc', t.root.position.x, t.root.position.z,
            );
            this.effects.projectile(
              t.root.position.clone().setY(1.1),
              mark.root.position.clone().setY(1.1),
              { element: 'physical', color: 0xbfc8e0, speed: 40, size: 0.16 },
            );
          }
        }
      }

      // --- Corrosive Edge, Scorch: an element's hits leave a mark --------
      for (const h of e.onHitStatuses) {
        if (packet.type !== h.type || t.life <= 0) continue;
        if (ctx.rng.chance(Math.min(1, h.chance / 100))) {
          t.applyStatuses([{ id: h.id, duration: h.duration, magnitude: 1, stacks: 1 }], ctx);
        }
      }

      // --- Paralytic Toxin ------------------------------------------------
      // It counted Envenomed alone, which stacks to three, so "at 5 stacks"
      // never came. Poisoned is the venom tree's stack; both count.
      const venom = t.stacksOf('poisoned') + t.stacksOf('envenomed');
      if (e.poisonSlows && venom > 0 && t.life > 0) {
        t.applyStatuses([{ id: 'slowed', duration: 2, magnitude: 1, stacks: 1 }], ctx);
      }
      if (e.poisonStunStacks > 0 && venom >= e.poisonStunStacks && t.life > 0) {
        const last = this.poisonStunAt.get(t.id) ?? -Infinity;
        if (ctx.elapsed - last >= e.poisonStunCd) {
          this.poisonStunAt.set(t.id, ctx.elapsed);
          t.applyStatuses([{ id: 'stunned', duration: e.poisonStunSec, magnitude: 1 }], ctx);
        }
      }

      // --- Blood Curse ----------------------------------------------------
      if (e.curseLeechPct > 0 && t.isDebuffed) {
        const back = packet.amount * (e.curseLeechPct / 100);
        p.life = Math.min(p.stats.life, p.life + back);
        p.mana = Math.min(p.stats.mana, p.mana + back * 0.5);
      }

      // --- Undying's leech while low --------------------------------------
      if (e.lowLifeLeechPct > 0 && p.life / Math.max(1, p.stats.life) * 100 <= e.lowLifeThreshold) {
        p.life = Math.min(p.stats.life, p.life + packet.amount * (e.lowLifeLeechPct / 100));
      }

      // --- Flurry ----------------------------------------------------------
      if (e.hitStackAttackSpeed > 0) {
        p.passiveState.hitStacks = Math.min(e.hitStackMax, p.passiveState.hitStacks + 1);
      }
      if (e.arcChance > 0 && e.arcRadius > 0 && ctx.rng.chance(Math.min(1, e.arcChance / 100))) {
        let best: Target | null = null;
        let bestD = Infinity;
        for (const other of this.allTargets(enemies, boss)) {
          if (other === t || other.life <= 0) continue;
          const d = this.groundDistance(other.root.position, t.root.position);
          if (d < bestD && d <= e.arcRadius) {
            bestD = d;
            best = other;
          }
        }
        if (best) {
          this.strike(
            best,
            { ...packet, amount: packet.amount * (e.arcDamagePct / 100), ability: 'Arc' },
            ctx, 'proc', t.root.position.x, t.root.position.z,
          );
          this.effects.beam(
            t.root.position.clone().setY(1.1),
            best.root.position.clone().setY(1.1),
            { element: 'lightning', color: ELEMENTS.lightning?.body ?? 0x6aa8ff, duration: 0.16, width: 0.1 },
          );
        }
      }

      // Superconductor: a Shocked enemy passes a share to every other Shocked
      // enemy nearby. Only lightning, and only between the already-afflicted.
      if (e.conductSharePct > 0 && packet.type === 'lightning' && t.hasStatus('shocked')) {
        const share = packet.amount * (e.conductSharePct / 100);
        for (const other of this.allTargets(enemies, boss)) {
          if (other === t || other.life <= 0 || !other.hasStatus('shocked')) continue;
          if (this.groundDistance(other.root.position, t.root.position) > e.conductRadius) continue;
          this.strike(other, { ...packet, amount: share, ability: 'Superconductor' }, ctx, 'proc', t.root.position.x, t.root.position.z);
        }
      }
    } finally {
      this.arcing = false;
    }
  }

  /** Guards the arc and conduct hooks against recursing into themselves. */
  private arcing = false;
  /**
   * Blows the hero has landed, counted in `afterHit`. The scene watches it to
   * keep Flurry's stacks alive while hits keep connecting.
   */
  landedHits = 0;
  /** A blow landed from the veil this frame; the veil drops next update. */
  private veilBreak = false;
  /** Increments per summon so a pack fans out rather than stacking. */
  private summonSerial = 0;
  /** A Resonance repeat waiting for the next frame. */
  private pendingEcho: { skillId: string; target: THREE.Vector3; scale: number } | null = null;
  /**
   * Weapon swings waiting for their contact frame (`Player.contactIn`, combat):
   * a blow lands when the blade arrives, not on the click.
   */
  private pendingSwings: Array<{ t: number; run: () => void }> = [];
  /** True while `cast` runs, so a skill's swing plays its own sound, not the weapon's. */
  private casting = false;
  private atContact = false;
  private echoing = false;
  /** What the echo pays, applied to every packet it throws. */
  private echoScale = 1;

  /** Enemies close to the caster, refreshed per cast for the crowd passives. */
  private nearbyCount = 0;

  /**
   * Records who is acting and how surrounded they are.
   *
   * Counted once per cast rather than per target: a whirlwind hitting eight
   * monsters should not walk the whole enemy list eight times to answer the
   * same question.
   */
  private setCaster(player: Player, enemies: Enemy[], boss: Boss | null): void {
    this.caster = player;
    this.weaponSound = weaponSoundOf(player);
    if (player.passives.crowdDamagePct <= 0) {
      this.nearbyCount = 0;
      return;
    }
    let n = 0;
    for (const e of enemies) {
      if (e.life <= 0) continue;
      if (this.groundDistance(e.root.position, player.position) <= 8) n++;
    }
    if (boss && boss.life > 0 && this.groundDistance(boss.root.position, player.position) <= 8) n++;
    this.nearbyCount = n;
  }

  private pointDamage(
    at: THREE.Vector3,
    radius: number,
    packet: () => DamagePacket,
    ctx: CombatContext,
    enemies: Enemy[],
    boss: Boss | null,
    kind: HitKind = 'projectile',
    from?: THREE.Vector3,
  ): void {
    let closest: Target | null = null;
    let bestD = Infinity;
    for (const t of this.allTargets(enemies, boss)) {
      const d = this.groundDistance(t.root.position, at) - t.hitRadius;
      if (d < bestD && d <= radius) {
        bestD = d;
        closest = t;
      }
    }
    if (closest) {
      const hp = this.tune(packet(), closest);
      const src = from ?? this.caster?.position ?? at;
      this.strike(closest, hp, ctx, kind, src.x, src.z);
      this.afterHit(hp, closest, ctx, enemies, boss);
    }
  }

  private areaDamage(
    center: THREE.Vector3,
    radius: number,
    packet: () => DamagePacket,
    ctx: CombatContext,
    enemies: Enemy[],
    boss: Boss | null,
    kind: HitKind = 'area',
  ): number {
    let dealt = 0;
    for (const t of this.allTargets(enemies, boss)) {
      // On the floor, not through the air: a meteor lands from above, and its
      // blast should not shrink because the impact was measured from height.
      const d = this.groundDistance(t.root.position, center);
      if (d > radius + t.hitRadius) continue;
      // Falloff so the centre of a nova genuinely rewards positioning.
      const p = packet();
      p.amount *= 1 - Math.min(1, d / (radius + t.hitRadius)) * 0.35;
      const ap = this.tune(p, t);
      // Knocked away from the middle of the blast.
      this.strike(t, ap, ctx, kind, center.x, center.z);
      this.afterHit(ap, t, ctx, enemies, boss);
      dealt += ap.amount;
    }
    return dealt;
  }

  private lineDamage(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    length: number,
    width: number,
    packet: () => DamagePacket,
    ctx: CombatContext,
    enemies: Enemy[],
    boss: Boss | null,
    kind: HitKind = 'beam',
  ): void {
    for (const t of this.allTargets(enemies, boss)) {
      const to = this.tmp2.copy(t.root.position).sub(origin).setY(0);
      const along = to.dot(dir);
      if (along < 0 || along > length) continue;
      const perp = Math.sqrt(Math.max(0, to.lengthSq() - along * along));
      if (perp > width * 0.5 + t.hitRadius) continue;
      const lp = this.tune(packet(), t);
      // Pushed along the line, as if the beam carried them.
      this.strike(t, lp, ctx, kind, t.root.position.x - dir.x, t.root.position.z - dir.z);
      this.afterHit(lp, t, ctx, enemies, boss);
    }
  }

  private chainLightning(
    player: Player,
    target: THREE.Vector3,
    jumps: number,
    range: number,
    packet: () => DamagePacket,
    ctx: CombatContext,
    enemies: Enemy[],
    boss: Boss | null,
    type: DamageType,
    color: number,
    hitSfx: string | null = null,
  ): void {
    const pool = this.allTargets(enemies, boss);
    if (pool.length === 0) return;

    let from = player.position.clone().setY(1.1);
    const struck = new Set<Target>();

    for (let j = 0; j < jumps; j++) {
      let best: Target | null = null;
      let bestD = Infinity;
      const anchor = j === 0 ? target : from;
      for (const t of pool) {
        if (struck.has(t)) continue;
        // Anchors are at chest height; monsters are measured at their feet.
        const d = this.groundDistance(t.root.position, anchor);
        if (d < bestD && d <= range) {
          bestD = d;
          best = t;
        }
      }
      if (!best) break;
      struck.add(best);
      const to = best.root.position.clone().setY(1.0);
      this.effects.beam(from, to, { element: type, color, width: 0.35, duration: 0.16, endBurst: true });
      // Each jump loses punch, or chain skills trivialise every pack.
      const p = packet();
      p.amount *= Math.pow(0.82, j);
      this.strike(best, this.tune(p, best), ctx, 'chain', from.x, from.z);
      if (hitSfx) audio.play(hitSfx, { x: to.x, z: to.z });
      from = to;
    }
  }

  // -- persistent effects ---------------------------------------------------

  /**
   * Ground zones and summons, ticked by the scene.
   *
   * Sixteen effect families had no handler at all and fell through to a plain
   * bolt, so a wall of flame left nothing on the floor and a raised skeleton
   * fought nothing. Both need something that outlives the cast, which is what
   * these two lists are: a patch of ground that hurts what stands in it, and a
   * thing that shoots on its own.
   */
  private zones: Array<{
    x: number;
    z: number;
    radius: number;
    left: number;
    tick: number;
    accum: number;
    packet: (m?: number) => DamagePacket;
    type: DamageType;
    color: number;
    emitter: string;
    /** Applied to anything caught in it, for slows, fear and the like. */
    applies?: StatusApplication[];
    fx: EffectHandle | null;
    /** A damage aura rides on its caster rather than staying put. */
    follow?: THREE.Object3D;
    /** The skill that laid it, so a recast replaces it. */
    skillId?: string;
  }> = [];

  private turrets: Array<{
    x: number;
    z: number;
    left: number;
    cd: number;
    accum: number;
    range: number;
    packet: (m?: number) => DamagePacket;
    type: DamageType;
    color: number;
    /** Melee guardians swing instead of shooting. */
    melee: boolean;
    fx: EffectHandle | null;
    /** A summoned creature's body. Null for a totem, which is just a spot. */
    body: THREE.Object3D | null;
    /** Stable slot, so a pack fans out instead of stacking on one point. */
    index: number;
    /** What the skill was called, for the HUD chip. */
    skillId: string;
    life: number;
    maxLife: number;
    anim: RigAnimator | null;
    facing: number;
    /** 0..1, drives the walk cycle. */
    gait: number;
    action: RigAction;
    actionT: number;
    /** Pulls monsters off you well past the nearest-target rule. */
    taunt: boolean;
    /** How many monsters the taunt can hold at once. */
    tauntHold: number;
    /** A Shadow Clone's hero body is driven by the hero's own animator. */
    hero: HeroAnimator | null;
    /** Waypoints round whatever stands between it and where it is going. */
    route: Array<{ x: number; y: number }>;
    replanIn: number;
    /** The skill's rank when this one was raised, or last grown. */
    rank: number;
    /** How hard it hits and how much life it has at a rank, against rank 1. */
    grow: SummonGrowth | null;
    /** Its hits, times what ranks bought since it was raised. */
    power: number;
  }> = [];
  /** Seconds to the next look for ranks spent on standing summons. */
  private growIn = 0;

  /** The level's walls and props, so summons walk round them (set by the scene). */
  private walk: WalkWorld | null = null;

  setWalkWorld(w: WalkWorld | null): void {
    this.walk = w;
  }

  private heatTimer = 0;

  /** Wall clock for the tick, so rigs breathe and bob. */
  private runTime = 0;

  /** Context for the tick. Set every frame by the scene. */
  private tickCtx: {
    ctx: CombatContext;
    enemies: Enemy[];
    boss: Boss | null;
  } | null = null;

  /**
   * The pack, shaped so the nameplate layer can draw a bar over each one.
   *
   * Minions are effects with a body, not `Enemy` instances, so they cannot be
   * handed to the plate layer directly. This adapts them.
   */
  minionPlates(): Array<{ root: THREE.Object3D; life: number; nameplate: PlateData; plateHeight: number }> {
    const out: Array<{ root: THREE.Object3D; life: number; nameplate: PlateData; plateHeight: number }> = [];
    for (const t of this.turrets) {
      if (!t.body || t.maxLife <= 0 || t.life <= 0) continue;
      out.push({
        root: t.body,
        life: t.life,
        plateHeight: 1.7,
        nameplate: {
          name: MINION_NAME[t.skillId] ?? 'Minion',
          rank: 'normal',
          affixes: [],
          life: t.life,
          maxLife: t.maxLife,
          color: 0x8fd67a,
          level: 0,
        },
      });
    }
    return out;
  }

  /**
   * What is currently fighting for you, for the HUD.
   *
   * A summoned pack you cannot see the state of is a pack you cannot play
   * around: you need to know how many are left and how long they have.
   */
  minionSummary(): Array<{ skillId: string; count: number; left: number; life: number; maxLife: number }> {
    const bySkill = new Map<string, { skillId: string; count: number; left: number; life: number; maxLife: number }>();
    for (const t of this.turrets) {
      if (!t.body) continue;
      const row = bySkill.get(t.skillId);
      // `left` is Infinity for a permanent creature. The HUD reads it as "no
      // timer" rather than trying to sweep an endless arc.
      if (row) {
        row.count++;
        row.left = Math.max(row.left, t.left);
        row.life += t.life;
        row.maxLife += t.maxLife;
      } else {
        bySkill.set(t.skillId, {
          skillId: t.skillId,
          count: 1,
          left: t.left,
          life: t.life,
          maxLife: t.maxLife,
        });
      }
    }
    return [...bySkill.values()];
  }

  /**
   * Splash damage from an enemy attack, shared out over the pack.
   *
   * Minions are not `Enemy` instances and never will be — they are effects with
   * a body — so they cannot be hit by the normal path. The scene forwards what
   * lands near them instead.
   */
  damageMinionsNear(x: number, z: number, radius: number, amount: number): void {
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const t = this.turrets[i]!;
      if (!t.body || t.maxLife <= 0) continue;
      const dx = t.body.position.x - x;
      const dz = t.body.position.z - z;
      if (Math.hypot(dx, dz) > radius) continue;
      t.life -= amount;
      if (t.life <= 0) {
        // Falls apart rather than vanishing: the last second plays the collapse.
        t.left = Math.min(t.left, 0.55);
        t.life = 0;
      }
    }
  }

  /**
   * The pack as something monsters can decide to fight.
   *
   * Summons were invisible to enemy AI: every brain only ever looked at
   * `playerPos`, so a wall of skeletons was scenery that monsters jogged
   * around on their way to you. This is what makes them a line.
   */
  minionTargets(): MinionTarget[] {
    const out: MinionTarget[] = [];
    for (const t of this.turrets) {
      if (!t.body || t.maxLife <= 0 || t.life <= 0 || t.left <= 0) continue;
      out.push({ id: t.index, x: t.body.position.x, z: t.body.position.z, taunt: t.taunt, tauntHold: t.tauntHold });
    }
    return out;
  }

  /** Hits one minion by id. False if it was already gone. */
  damageMinion(id: number, amount: number): boolean {
    const t = this.turrets.find((q) => q.index === id);
    if (!t || !t.body || t.maxLife <= 0 || t.life <= 0) return false;
    t.life -= amount;
    this.effects.impact('physical', t.body.position.x, 1.0, t.body.position.z, {
      color: 0xc85a4a, scale: 0.6, shake: 0,
    });
    if (t.life <= 0) {
      t.life = 0;
      t.left = Math.min(t.left, 0.55);
    }
    return true;
  }

  /** Handed the live combat state so persistent effects can act on it. */
  setContext(ctx: CombatContext, enemies: Enemy[], boss: Boss | null): void {
    this.tickCtx = { ctx, enemies, boss };
  }

  update(dt: number): void {
    const live = this.tickCtx;
    if (!live) return;
    this.runTime += dt;
    if (this.veilBreak) {
      this.veilBreak = false;
      this.caster?.status.remove('veiled');
    }

    for (let i = this.pendingSwings.length - 1; i >= 0; i--) {
      const sw = this.pendingSwings[i]!;
      sw.t -= dt;
      if (sw.t > 0) continue;
      this.pendingSwings.splice(i, 1);
      try {
        sw.run();
      } catch (err) {
        reportError('skill.contact', err);
      }
    }

    // Fire a queued Resonance echo one frame after the original, so the two
    // read as a stutter rather than one doubled hit.
    const pe = this.pendingEcho;
    if (pe && this.caster) {
      this.pendingEcho = null;
      this.echoing = true;
      this.echoScale = pe.scale;
      try {
        const p = this.caster;
        const lock = p.isBusy;
        void lock;
        this.cast(pe.skillId, p, pe.target, live.ctx, live.enemies, live.boss);
      } catch {
        /* an echo must never break the frame */
      } finally {
        this.echoing = false;
        this.echoScale = 1;
      }
    }
    this.spreadTick(dt, live.ctx, live.enemies, live.boss);
    const keeper = this.caster ?? this.keeper;
    if (keeper) tickVigils(this.vigilHost, keeper, dt, live);
    const { ctx, enemies, boss } = live;

    // How hot the fight is, for the score: monsters awake and near, weighted
    // by how dangerous they are. Twice a second is plenty for music.
    this.heatTimer -= dt;
    if (this.heatTimer <= 0 && this.caster) {
      this.heatTimer = 0.5;
      audio.setCombatFloor(combatHeat(this.caster.position, enemies));
    }

    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i]!;
      if (z.follow) {
        z.x = z.follow.position.x;
        z.z = z.follow.position.z;
      }
      z.left -= dt;
      z.accum += dt;
      if (z.accum >= z.tick) {
        z.accum = 0;
        const centre = this.tmp3.set(z.x, 0, z.z);
        // A field ticking is not a blow: no flash or stop, or a burning floor
        // would strobe everything standing in it.
        this.areaDamage(centre, z.radius, z.packet, ctx, enemies, boss, 'proc');
        if (z.applies?.length) {
          for (const t of this.allTargets(enemies, boss)) {
            if (this.groundDistance(t.root.position, centre) > z.radius + t.hitRadius) continue;
            t.applyStatuses(z.applies, ctx);
          }
        }
      }
      if (z.left <= 0) {
        z.fx?.stop();
        this.zones.splice(i, 1);
      }
    }

    this.growIn -= dt;
    if (this.growIn <= 0) {
      this.growIn = 0.5;
      this.growSummons();
    }

    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const t = this.turrets[i]!;
      // A permanent creature carries `Infinity`; only totems and the dying tick
      // down. Guarding here rather than storing a flag keeps one source of
      // truth for "is this thing on a clock".
      if (Number.isFinite(t.left)) t.left -= dt;
      t.accum += dt;

      // A summoned creature walks. Totems have no body and stay put.
      if (t.body) {
        const owner = this.caster;
        const tether = t.hero ? SHADOW_TETHER : MINION_TETHER;
        const ownerGap = owner ? Math.hypot(owner.position.x - t.body.position.x, owner.position.z - t.body.position.z) : 0;
        // Left far behind, or stuck where it cannot get back: it steps out of
        // the dark beside you rather than being lost.
        if (owner && ownerGap > MINION_RECALL) {
          const a = (t.index * 2.39996) % (Math.PI * 2);
          let rx = owner.position.x + Math.cos(a) * 1.4;
          let rz = owner.position.z + Math.sin(a) * 1.4;
          if (this.walk && !canStandAt(this.walk, rx, rz, MINION_RADIUS)) {
            rx = owner.position.x;
            rz = owner.position.z;
          }
          t.body.position.x = rx;
          t.body.position.z = rz;
          t.route = [];
          // Drawn like a summon's arrival but heard as the skill that raised
          // it: the generic teleport hum is not what a Shadow Clone sounds like.
          this.effects.beginQuiet();
          try {
            this.effects.teleportIn(rx, 0.1, rz, t.color);
          } finally {
            this.effects.endQuiet();
          }
          const voice = skillSound(t.skillId).cast;
          if (voice) events.emit('sfx', { id: voice, x: rx, z: rz });
        }

        // Only what is near you is worth a fight: a summon that chases across
        // the floor is a summon you never see.
        let chase: Target | null = null;
        let chaseD = Infinity;
        for (const e of this.allTargets(enemies, boss)) {
          const d = this.groundDistance(e.root.position, t.body.position);
          if (owner && this.groundDistance(e.root.position, owner.position) > tether) continue;
          if (d < chaseD && d <= MINION_LEASH) {
            chaseD = d;
            chase = e;
          }
        }
        // Close to just inside its own reach, then hold. Walking through the
        // thing you are hitting looks worse than stopping short of it.
        const stand = t.melee ? Math.max(1.2, t.range * 0.7) : t.range * 0.75;
        let moving = 0;

        // No enemy in reach: heel. A summon that plants itself where it was
        // raised is useless the moment you walk on, which is exactly how the
        // skeletons read before this.
        let goalX = chase ? chase.root.position.x : owner?.position.x ?? t.body.position.x;
        let goalZ = chase ? chase.root.position.z : owner?.position.z ?? t.body.position.z;
        let hold = chase ? stand : MINION_FOLLOW;
        if (!chase && owner) {
          // Spread out around the owner rather than stacking on one point.
          const spread = (t.index / Math.max(1, this.turrets.length)) * Math.PI * 2;
          goalX += Math.cos(spread) * MINION_FOLLOW * 0.6;
          goalZ += Math.sin(spread) * MINION_FOLLOW * 0.6;
          hold = 0.6;
        }

        const dx = goalX - t.body.position.x;
        const dz = goalZ - t.body.position.z;
        const gap = Math.hypot(dx, dz);
        if (gap > 0.05) t.facing = Math.atan2(dx, dz);
        if (gap > hold) {
          // Toward the goal, or the next waypoint round what is in the way.
          let wx = goalX;
          let wz = goalZ;
          const w = this.walk;
          if (w) {
            t.replanIn -= dt;
            const px = t.body.position.x;
            const pz = t.body.position.z;
            // Looked at a few times a second, not every frame: a straight-line
            // test against the floor's colliders for each of a dozen summons
            // was most of their cost.
            if (t.replanIn <= 0) {
              t.replanIn = 0.3 + (t.index % 4) * 0.03;
              if (lineClear(w, px, pz, goalX, goalZ, MINION_RADIUS)) t.route = [];
              else if (w.path) t.route = w.path(px, pz, goalX, goalZ);
            }
            while (t.route.length && Math.hypot(t.route[0]!.x - px, t.route[0]!.y - pz) < 0.45) t.route.shift();
            if (t.route.length) {
              wx = t.route[0]!.x;
              wz = t.route[0]!.y;
            }
          }
          const sx = wx - t.body.position.x;
          const sz = wz - t.body.position.z;
          const sgap = Math.max(0.0001, Math.hypot(sx, sz));
          if (t.route.length && sgap > 0.05) t.facing = Math.atan2(sx, sz);
          // A minion that cannot keep up is a minion you never see again, so it
          // runs harder the further behind it falls.
          const speed = chase ? MINION_SPEED : MINION_SPEED * (gap > 8 ? 1.8 : 1.15);
          const step = Math.min(speed * dt, t.route.length ? sgap : gap - hold);
          const ox = t.body.position.x;
          const oz = t.body.position.z;
          if (w) {
            const to = stepBody(w, ox, oz, (sx / sgap) * step, (sz / sgap) * step, MINION_RADIUS);
            t.body.position.x = to.x;
            t.body.position.z = to.z;
          } else {
            t.body.position.x += (sx / sgap) * step;
            t.body.position.z += (sz / sgap) * step;
          }
          moving = Math.hypot(t.body.position.x - ox, t.body.position.z - oz) > step * 0.2 ? 1 : 0;
        }
        const fy = this.walk?.floorY?.(t.body.position.x, t.body.position.z);
        if (fy !== undefined) t.body.position.y += (fy - t.body.position.y) * Math.min(1, dt * 16);
        t.x = t.body.position.x;
        t.z = t.body.position.z;
        t.body.rotation.y = t.facing;
        t.gait += (moving - t.gait) * Math.min(1, dt * 8);

        if (t.actionT > 0) {
          t.actionT = Math.max(0, t.actionT - dt * 2.6);
          if (t.actionT === 0) t.action = 'idle';
        }
        // Fade out over the last second rather than blinking away.
        const fade = Number.isFinite(t.left) ? Math.min(1, Math.max(0, t.left)) : 1;
        t.body.scale.setScalar(t.body.scale.x > 0 ? t.body.scale.x : 1);
        t.body.visible = t.left > 0;
        if (t.hero) {
          // Between blows it walks, runs or stands as you do.
          if (t.actionT <= 0 && t.life > 0) {
            const sp = moving ? (chase ? MINION_SPEED : MINION_SPEED * 1.4) : 0;
            if (sp > 0) t.hero.play(sp > 4 ? 'run' : 'walk', { fade: 0.14, speed: sp / 4.2 });
            else t.hero.play('idle', { fade: 0.2 });
          }
          if (t.life <= 0 && t.left > 0 && t.action !== 'death') {
            t.action = 'death';
            t.hero.play('death', { fade: 0.1, once: true, hold: true, force: true });
          }
          t.hero.update(dt);
        }
        t.anim?.update(dt, {
          locomotion: t.gait,
          action: t.action,
          actionT: 1 - t.actionT,
          time: this.runTime,
          deathT: Number.isFinite(t.left) && t.left < 0.6 ? 1 - fade / 0.6 : 0,
        });
      }

      if (t.accum >= t.cd) {
        t.accum = 0;
        const from = this.tmp3.set(t.x, t.melee ? 1.0 : 1.2, t.z);
        let best: Target | null = null;
        let bestD = Infinity;
        for (const e of this.allTargets(enemies, boss)) {
          const d = this.groundDistance(e.root.position, from);
          if (d < bestD && d <= t.range) {
            bestD = d;
            best = e;
          }
        }
        if (best) {
          if (t.body) {
            t.action = t.melee ? 'attack' : 'cast';
            t.actionT = 1;
            // The double swings your weapon, the blow landing as the hit does.
            if (t.hero) {
              const bx = best.root.position.x - t.x;
              const bz = best.root.position.z - t.z;
              t.facing = Math.atan2(bx, bz);
              t.body.rotation.y = t.facing;
              t.hero.play('attack1', { fade: 0.06, restart: true, speed: 1.3, contact: 0.12 });
            }
          }
          // Marrow Feast: what the army bites, you swallow.
          const owner = this.caster;
          if (owner && owner.passives.minionLeechPct > 0) {
            owner.life = Math.min(
              owner.stats.life,
              owner.life + t.packet().amount * (owner.passives.minionLeechPct / 100),
            );
          }
          const to = best.root.position.clone().setY(1.0);
          // One voice per summon: the sound its skill gives it, nothing else.
          const voice = skillSound(t.skillId).minion;
          if (voice) audio.play(voice, { x: t.x, z: t.z });
          this.effects.beginQuiet();
          try {
            if (t.melee) {
              this.strike(best, t.packet(), ctx, 'minion', t.x, t.z);
              this.effects.impact(t.type, to.x, to.y, to.z, { color: t.color, scale: 0.7, shake: 0, sfx: null });
            } else {
              this.effects.projectile(from.clone(), to, {
                element: t.type,
                color: t.color,
                speed: 26,
                size: 0.18,
                onHit: (p) => this.pointDamage(p, 0.9, t.packet, ctx, enemies, boss, 'minion'),
              });
            }
          } finally {
            this.effects.endQuiet();
          }
        }
      }
      if (t.left <= 0) {
        t.fx?.stop();
        this.removeBody(t.body);
        this.turrets.splice(i, 1);
      }
    }
  }

  /** Leaves a patch of ground that keeps hurting whatever stands in it. */
  private addZone(
    x: number,
    z: number,
    radius: number,
    duration: number,
    tick: number,
    packet: (m?: number) => DamagePacket,
    type: DamageType,
    color: number,
    emitter: string,
    applies?: StatusApplication[],
    skill?: string,
    school?: School,
    rank = 1,
  ): void {
    // A cap, because a build that stacks ten fields should cost frames, not
    // the whole run.
    if (this.zones.length >= 12) {
      this.zones[0]!.fx?.stop();
      this.zones.shift();
    }
    // The field draws as what it is: burning ground, a blizzard, a cloud.
    const fx = this.effects.field(x, z, radius, duration, { school: school ?? (type as School), color, skill, rank });
    this.zones.push({ x, z, radius, left: duration, tick, accum: tick, packet, type, color, emitter, applies, fx });
  }

  /** Leaves something standing that fights for you until its time runs out. */
  /**
   * A summon stays until it falls, so it used to keep the rank it was raised
   * at: a point in Shadow Clone did nothing to the clone already at your side.
   * Now the ones standing take every rank spent since, hits and life alike
   * (the wound keeps its share of the body).
   */
  private growSummons(): void {
    const owner = this.caster;
    if (!owner) return;
    for (const t of this.turrets) {
      if (!t.grow || !t.skillId || t.life <= 0) continue;
      const r = skillRank(owner.character, t.skillId);
      if (r <= 0 || r === t.rank) continue;
      const was = t.grow(t.rank);
      const now = t.grow(r);
      t.power *= now.damage / Math.max(1e-6, was.damage);
      const f = now.life / Math.max(1e-6, was.life);
      t.maxLife *= f;
      t.life *= f;
      t.rank = r;
    }
  }

  private addTurret(
    x: number,
    z: number,
    duration: number,
    cd: number,
    range: number,
    packet: (m?: number) => DamagePacket,
    type: DamageType,
    color: number,
    melee: boolean,
    skillId?: string,
    /** How much punishment the body can take before it falls apart. */
    minionLife = 0,
    /** Whether this one actively pulls monsters off you. */
    taunt = false,
    /** How many monsters the taunt can hold at once. */
    tauntHold = Infinity,
    /** What a rank buys it, so a point spent later grows it where it stands. */
    grow: SummonGrowth | null = null,
  ): void {
    // A backstop only. Per-skill caps do the real work; this stops a runaway
    // from ever building an unbounded list.
    if (this.turrets.length >= SUMMON_ABSOLUTE_CAP + 8) {
      const oldest = this.turrets[0]!;
      oldest.fx?.stop();
      this.removeBody(oldest.body);
      this.turrets.shift();
    }
    // Raised where it can stand: not inside a wall or a barrel.
    const w = this.walk;
    const owner = this.caster;
    if (w && owner && !canStandAt(w, x, z, MINION_RADIUS)) {
      x = owner.position.x;
      z = owner.position.z;
    }
    // The circle marks the raising. A creature walks off it and lives on, so
    // its circle fades after the arrival; only a totem keeps its ring.
    const fx = this.effects.summonCircle(x, z, melee ? 0.7 : 0.55, Number.isFinite(duration) ? duration : 1.6, color);
    this.effects.teleportIn(x, 0.1, z, color);

    // Give it a body if the skill names one.
    let body: THREE.Object3D | null = null;
    let anim: RigAnimator | null = null;
    let hero: HeroAnimator | null = null;
    // Shadow Clone raises a dark double of the hero, not a monster.
    if (skillId === 'shadowClone' && this.caster) {
      try {
        const d = this.caster.shadowDouble();
        d.root.position.set(x, this.walk?.floorY?.(x, z) ?? 0, z);
        d.root.rotation.y = this.caster.root.rotation.y;
        this.effects.scene.add(d.root);
        body = d.root;
        hero = d.animator;
      } catch {
        body = null;
        hero = null;
      }
    }
    const monsterId = skillId && !body ? MINION_MONSTER[skillId] : undefined;
    const mdef = monsterId ? MONSTERS.find((m) => m.id === monsterId) : undefined;
    if (mdef) {
      try {
        // Seeded from the summon count, not the wall clock: same run, same pack.
        const rng = new Random((0x5a11 + this.summonSerial * 7919) >>> 0);
        const model = buildMonsterModel(mdef.visual, rng, (mdef.scale ?? 1) * 0.92);
        model.root.position.set(x, 0, z);
        this.effects.scene.add(model.root);
        anim = new RigAnimator(model.root, model.bones, monsterArchetype(mdef.visual.body), rng);
        body = model.root;
      } catch {
        // A missing rig must not swallow the cast; it just falls back to a
        // bodiless guardian rather than throwing mid-spell.
        body = null;
        anim = null;
      }
    }

    const t = {
      x, z, left: duration, cd, accum: cd * 0.5, range, packet, type, color, melee, fx,
      body, anim, facing: 0, gait: 0, action: 'spawn' as RigAction, actionT: 1,
      index: this.summonSerial++, skillId: skillId ?? '', life: minionLife, maxLife: minionLife,
      taunt, tauntHold, hero, route: [], replanIn: 0,
      rank: owner && skillId ? skillRank(owner.character, skillId) : 1,
      grow,
      power: 1,
    };
    t.packet = (m = 1) => packet(m * t.power);
    this.turrets.push(t);
  }

  /**
   * Afflictions that travel between monsters.
   *
   * Wildfire passes a burn to the nearest enemy on a timer, Plague of Embers
   * removes the target limit and decays the magnitude per jump instead, and the
   * Warden's Blood Tide does the same for bleeds while amplifying them. All
   * three are the same shape — a periodic hop from an afflicted monster to a
   * clean one nearby — so they share one tick rather than three.
   */
  private spreadTick(dt: number, ctx: CombatContext, enemies: Enemy[], boss: Boss | null): void {
    const p = this.caster;
    if (!p) return;
    const e = p.passives;
    const wantsFire = e.dotSpreadInterval > 0 && e.dotSpreadRadius > 0;
    const wantsBlood = e.bloodTideChains > 0 && e.bloodTideRadius > 0;
    if (!wantsFire && !wantsBlood) return;

    const st = p.passiveState;
    st.spreadTimer -= dt;
    if (st.spreadTimer > 0) return;
    st.spreadTimer = wantsFire ? e.dotSpreadInterval : 2;

    const pool = this.allTargets(enemies, boss);
    // Unlimited hops when Plague of Embers is allocated, otherwise one per tick
    // per source, which is what the base skill describes.
    const budget = e.dotSpreadDecay > 0 ? pool.length : Math.max(1, e.bloodTideChains);
    let made = 0;

    for (const src of pool) {
      if (made >= budget) break;
      const fire = wantsFire && src.hasStatus('immolated');
      const blood = wantsBlood && src.isBleeding;
      if (!fire && !blood) continue;
      const radius = fire ? e.dotSpreadRadius : e.bloodTideRadius;

      let best: Target | null = null;
      let bestD = Infinity;
      for (const t of pool) {
        if (t === src || t.life <= 0) continue;
        if (fire && t.hasStatus('immolated')) continue;
        const d = this.groundDistance(t.root.position, src.root.position);
        if (d < bestD && d <= radius) {
          bestD = d;
          best = t;
        }
      }
      if (!best) continue;

      // Each jump loses magnitude when the decay rule is allocated, and gains
      // it when Blood Tide is amplifying instead.
      const decay = e.dotSpreadDecay > 0 ? 1 - e.dotSpreadDecay : 1;
      const amplify = blood ? 1 + e.bloodTideAmplifyPct / 100 : 1;
      best.applyStatuses(
        [
          {
            id: fire ? 'immolated' : 'bleeding',
            duration: 6,
            magnitude: Math.max(0.15, decay * amplify),
            stacks: Math.max(1, Math.floor(e.dotSpreadStacks || 1)),
          },
        ],
        ctx,
      );
      this.effects.impact(fire ? 'fire' : 'physical', best.root.position.x, 1.0, best.root.position.z, {
        scale: 0.45, shake: 0, decal: false, sfx: null,
      });
      made++;
    }
  }

  /**
   * Sworn Brother is ranked as a passive, so it is never cast: its Knight rises
   * whenever a banner is planted. It used to only raise minion stats, and the
   * Knight has no other minion, so the tier-6 capstone did nothing at all.
   * Up to `baseCap` (+1 per `maxPerRanks` ranks) stand at once; planting at the
   * cap recycles the oldest, like every other summon.
   */
  private raiseSwornBrother(player: Player, target: THREE.Vector3, ctx: CombatContext): void {
    const rank = skillRank(player.character, 'swornBrother');
    if (rank <= 0) return;
    const def = SKILLS.find((s) => s.id === 'swornBrother');
    if (!def) return;
    const p = def.params ?? {};
    const num = (k: string, d: number): number => (typeof p[k] === 'number' ? (p[k] as number) : d);
    const cap = Math.min(
      SUMMON_HARD_CAP.swornBrother ?? 3,
      num('baseCap', 2) + Math.floor(rank / Math.max(1, num('maxPerRanks', 10))) + Math.floor(player.passives.minionCapBonus),
    );
    this.trimSummons(def.id, cap - 1);
    // Beside the hero on the side of the banner, so it never rises in a wall.
    const dx = target.x - player.position.x;
    const dz = target.z - player.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const step = Math.min(1.6, len);
    const x = player.position.x + (dx / len) * step + (-dz / len) * 0.9;
    const z = player.position.z + (dz / len) * step + (dx / len) * 0.9;
    // "60% of your damage (+4% per rank)", "140% of your life". The passive's
    // minion bonus is that same 60%, so it is not applied a second time.
    const share = (num('damagePct', 60) + num('perRank', 4) * (rank - 1)) / 100;
    const scale = skillDamageScale(player.character.skills, player.stats.skillLevels, def.id) * share;
    const packet = (m = 1): DamagePacket =>
      rollDamage(player.stats, ctx.rng, { scale: scale * m, type: 'physical', ability: def.name, source: 'player' });
    const color = shiftHue(ELEMENTS.physical?.body ?? 0xc9a070, hashId(def.id));
    const swingRate = 1 / (1 + player.passives.minionAttackSpeedPct / 100);
    this.addTurret(
      x, z, Infinity, 1.1 * swingRate, 2.6, packet, 'physical', color, true, def.id,
      Math.max(20, player.stats.life * (num('lifePct', 140) / 100)),
      false,
      Infinity,
      (r) => ({ damage: num('damagePct', 60) + num('perRank', 4) * (r - 1), life: 1 }),
    );
  }

  /** How many bodies this skill currently has standing. */
  /** This runner's hit helpers, bound to one Shapeshifter cast (scenes/ShifterRunner.ts). */
  private shiftKit(
    player: Player,
    ctx: CombatContext,
    enemies: Enemy[],
    boss: Boss | null,
    type: DamageType,
    hitSfx: string | null,
    def: { id: string; name: string; params?: Record<string, number | number[] | string> },
    num: (k: string, d: number) => number,
    color: number,
    rank: number,
  ): ShiftKit {
    return {
      effects: this.effects,
      swing: (facing, arc, reach, packet, o = {}) => {
        const now = o.now ?? false;
        const prev = this.atContact;
        if (now) {
          this.atContact = true;
          this.caster = player;
        }
        try {
          this.meleeSwing(player, facing, arc, reach, packet, ctx, enemies, boss, type, o.visual ?? true, o.kind ?? 'melee', hitSfx, o.most ?? Infinity, o.focus ?? null);
        } finally {
          this.atContact = prev;
        }
      },
      area: (center, radius, packet, kind) => {
        this.caster = player;
        this.areaDamage(center, radius, packet, ctx, enemies, boss, kind);
      },
      line: (origin, dir, length, width, packet, kind) => {
        this.caster = player;
        this.lineDamage(origin, dir, length, width, packet, ctx, enemies, boss, kind);
      },
      point: (at, radius, packet, kind) => {
        this.caster = player;
        this.pointDamage(at, radius, packet, ctx, enemies, boss, kind);
      },
      targets: () => this.allTargets(enemies, boss),
      later: (t, run, keep = false) => {
        // The action that is playing when the beat is queued, not when the kit was made.
        const id = player.actionId;
        this.pendingSwings.push({
          t,
          run: () => {
            if (!player.alive || (!keep && player.actionId !== id)) return;
            this.caster = player;
            run();
          },
        });
      },
      wallStop: (from, dir, max, radius) => this.wallStop(from, dir, max, ctx, radius),
      statuses: (riderOnly) => this.statusFor(def, num, color, riderOnly),
      buff: () => this.applyBuff(player, def as { id: string; name: string; params?: Record<string, number | number[]> }, rank, num, color),
      raise: (x, z, o) => {
        this.caster = player;
        this.addTurret(x, z, Infinity, o.rate, o.range, o.packet, type, color, true, def.id, o.life, false, Infinity, o.grow ?? null);
      },
      pack: () => this.countSummons(def.id),
      trim: (keep) => this.trimSummons(def.id, keep),
    };
  }

  private countSummons(skillId: string): number {
    let n = 0;
    for (const t of this.turrets) if (t.skillId === skillId && t.body) n++;
    return n;
  }

  /**
   * Cuts a skill's pack down to `keep`, oldest first.
   *
   * Casting at the cap should never be a dead button — it recycles. Oldest is
   * the right one to lose: it is the one furthest from where you are fighting
   * now, and the one whose life is most likely already gone.
   */
  private trimSummons(skillId: string, keep: number): void {
    for (let i = 0; i < this.turrets.length && this.countSummons(skillId) > keep; ) {
      const t = this.turrets[i]!;
      if (t.skillId !== skillId || !t.body) {
        i++;
        continue;
      }
      t.fx?.stop();
      this.removeBody(t.body);
      this.turrets.splice(i, 1);
    }
  }

  /** Takes a minion's body out of the scene and frees what it owns. */
  private removeBody(body: THREE.Object3D | null): void {
    if (!body) return;
    if (body.userData.shadowDouble) {
      releaseShadowDouble(body);
      this.feel.forget(body);
      return;
    }
    body.parent?.remove(body);
    // Geometry and materials are shared prototypes owned by the model cache and
    // released by `disposeMonsterModels`; each clone owns only its skeleton's
    // bone texture, which leaks unless it is released here.
    releaseMonsterModel(body);
    this.feel.forget(body);
  }

  dispose(): void {
    for (const z of this.zones) z.fx?.stop();
    for (const t of this.turrets) {
      t.fx?.stop();
      this.removeBody(t.body);
    }
    this.zones.length = 0;
    this.turrets.length = 0;
    this.pendingSwings.length = 0;
    this.tickCtx = null;
    this.feel.clear();
  }
}
