/**
 * SLAY — what the Ranger's moves share: the host the runner lends them, one
 * press of a skill, and the lists that say which skills a passive touches.
 *
 * `SkillRunner.cast` hands a skill in `RANGER_MOVES` to `castRanger`
 * (`RangerMoves.ts`). Every arrow, trap and stoop lands through the host,
 * so it is tuned, felt and counted like any other blow.
 */
import type * as THREE from 'three';
import type { DamagePacket, SkillDef, StatusApplication } from '../../types';
import type { CombatContext, Enemy } from '../../entities/Enemy';
import type { Boss } from '../../entities/Boss';
import type { Player } from '../../entities/Player';
import type { HitKind } from '../../fx/CombatFeel';
import type { EffectSystem, School } from '../../fx/Effects';

export type Target = Enemy | Boss;

/** The fight a move happens in. */
export interface RangerWorld {
  ctx: CombatContext;
  enemies: Enemy[];
  boss: Boss | null;
  player: Player;
}

/** What the runner lends a Ranger move. */
export interface RangerHost {
  readonly effects: EffectSystem;
  /**
   * Lands one tuned blow on one target through the whole hit pipeline
   * (passives, coats, feel, kill credit). `sure` skips the attack roll (a
   * volley falling from the sky, a shaft through a line). Returns the packet
   * that landed: amount 0 on a miss.
   */
  land(t: Target, packet: DamagePacket, kind: HitKind, fromX: number, fromZ: number, world: RangerWorld, sure?: boolean): DamagePacket;
  /** Lands damage already reckoned (a scattered arrow's share), with no passives on top. True when it landed. */
  strike(t: Target, packet: DamagePacket, kind: HitKind, fromX: number, fromZ: number, world: RangerWorld): boolean;
  /** How far a body goes from `from` along `dir` before a wall, up to `max`. */
  clear(from: THREE.Vector3, dir: THREE.Vector3, max: number, ctx: CombatContext, radius: number): number;
  /** Runs `fn` after `seconds` (the runner's contact queue). */
  later(seconds: number, fn: () => void): void;
  /** Runs `fn` on the release frame of the hero's current action. */
  atRelease(player: Player, fn: () => void): void;
  /** Real seconds after the first release at which a gesture's later loosings come; null without cuts. */
  cutTimes(skillId: string, span: number, first: number): number[] | null;
  /** Plays a skill sound at a point. */
  sound(id: string | null, x: number, z: number): void;
  /** Grants the skill's own buff to the hero (`SELF_POWER`). */
  buff(player: Player, def: SkillDef, rank: number, num: (k: string, d: number) => number, color: number): void;
  /** Shakes off one hold or slow. */
  cleanse(player: Player): void;
  /** A fresh packet for another of the hero's skills at its own rank (Lay of the Land's Spike Traps); null unlearned. */
  skillPacket(player: Player, skillId: string, ctx: CombatContext): ((mult?: number) => DamagePacket) | null;
  /** The fight as it stands this frame; null before the scene hands it over. */
  live(): { ctx: CombatContext; enemies: Enemy[]; boss: Boss | null } | null;
  /** Seconds since the run began, the runner's clock. */
  now(): number;
  /** The hero who cast last. */
  hero(): Player | null;
}

/** One press of a Ranger skill. */
export interface RangerCast {
  def: SkillDef;
  rank: number;
  player: Player;
  /** Where the press aimed, on the floor. */
  aim: THREE.Vector3;
  /** Facing toward the aim, flat, unit. */
  dir: THREE.Vector3;
  world: RangerWorld;
  /** A fresh rolled packet at `mult` times the skill's damage, riders on. */
  packet: (mult?: number) => DamagePacket;
  /** What the skill leaves on what it strikes (its power table, its named status, its settings). */
  riders: () => StatusApplication[];
  num: (key: string, dflt: number) => number;
  school: School;
  color: number;
  /** Seconds this use takes (`sim/Speed.ts`). */
  actTime: number;
  /** The body clip (the skill's own gesture). */
  clip: string;
  /** The skill's sounds: the bow or the hands (played here, on the release), and where it lands. */
  castSound: string | null;
  hitSound: string | null;
  /** The skill's particle wake and burst (`fx/SkillLooks.ts`). */
  shed?: string;
  burst: string;
  density: number;
  /** Critical damage multiplier, for a blow that must crit. */
  critX: number;
}

/** Skills `castRanger` runs: every Ranger active. */
export const RANGER_MOVES: ReadonlySet<string> = new Set([
  // Marksman
  'pierceShot', 'huntersMark', 'aimedShot', 'bleedingArrow', 'crippling', 'splinterShot', 'bankShot', 'quarrysEnd', 'oneShot',
  // Wildcraft
  'rollAway', 'snareTrap', 'spikeTrap', 'thornBarrier', 'disengage', 'venomCoat', 'camouflage', 'tripwire', 'waspNest', 'kestrel', 'theWholeFloor',
  // Volley
  'twinShot', 'scattershot', 'arrowRain', 'ricochet', 'fanFire', 'suppressing', 'explosiveTip', 'creepingBarrage', 'openQuiver', 'arrowWheel', 'darkenTheSky',
]);

/** Skills loosed from the bow: Fletcher's Art, Endless Quiver and Roll Away's nocked arrow count these. */
export const RANGER_BOW: ReadonlySet<string> = new Set([
  'pierceShot', 'aimedShot', 'bleedingArrow', 'crippling', 'splinterShot', 'bankShot', 'quarrysEnd', 'oneShot', 'disengage',
  'twinShot', 'scattershot', 'arrowRain', 'ricochet', 'fanFire', 'suppressing', 'explosiveTip', 'creepingBarrage', 'arrowWheel', 'darkenTheSky',
]);

/** Skills that loose several arrows, and the rains (Arrowsmith). */
export const MULTI: ReadonlySet<string> = new Set([
  'twinShot', 'scattershot', 'fanFire', 'suppressing', 'arrowWheel', 'arrowRain', 'creepingBarrage', 'darkenTheSky',
]);

/** Skills that loose more arrows with Volley Mastery and Open Quiver. */
export const EXTRA: ReadonlySet<string> = new Set(['twinShot', 'scattershot', 'fanFire', 'suppressing', 'arrowWheel']);

/** Single arrows Through and Through makes pierce (the plain shot too, `basicShot`). */
export const PIERCE_ALL: ReadonlySet<string> = new Set(['aimedShot', 'bleedingArrow', 'crippling', 'disengage', 'quarrysEnd']);

/** Traps, Thorn Barrier and the kestrel: what Lay of the Land and Huntcraft strengthen. */
export const TRAPPY: ReadonlySet<string> = new Set(['spikeTrap', 'snareTrap', 'tripwire', 'waspNest', 'thornBarrier', 'kestrel', 'theWholeFloor']);

/** Most arrows one use may loose, whatever adds to it. */
export const MOST_ARROWS = 12;
