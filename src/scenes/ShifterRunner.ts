/**
 * SLAY — what the Shapeshifter's skills do.
 *
 * Every Shapeshifter active has the effect `shift.<name>`. `SkillRunner.cast`
 * does the shared part of a cast (rank, cost, cooldown, the damage packet, the
 * skill's sound) and then hands the rest here with one `case 'shift'`. The
 * runner's own hit helpers come in as a `ShiftKit`, so this file never reaches
 * into SkillRunner's private state and SkillRunner only grows by one case and
 * the kit.
 *
 * One handler per skill: no two Shapeshifter skills share a handler, which is
 * what keeps each of them 1 of 1.
 */
import * as THREE from 'three';
import type { DamagePacket, DamageType, SkillDef, StatusApplication } from '../types';
import type { Player } from '../entities/Player';
import type { CombatContext, Enemy } from '../entities/Enemy';
import type { Boss } from '../entities/Boss';
import type { EffectSystem } from '../fx/Effects';
import type { HitKind } from '../fx/CombatFeel';
import type { BeastForm } from '../art/hero/forms/BeastBody';
import { FORM_OF_TREE, FORM_SKILL } from '../entities/Shapeshift';
import { formChange } from '../fx/shifter/ShifterFX';
import { audio } from '../audio/Audio';
import { skillSound } from '../audio/SkillSounds';

export type ShiftTarget = Enemy | Boss;

/** The runner's own helpers, bound to this cast's world. */
export interface ShiftKit {
  effects: EffectSystem;
  /**
   * A weapon-style blow in an arc. `now` lands it this frame (a later beat of
   * a multi-blow skill); otherwise it waits for the clip's contact frame.
   */
  swing(
    facing: THREE.Vector3,
    arc: number,
    reach: number,
    packet: (m?: number) => DamagePacket,
    opts?: { kind?: HitKind; most?: number; focus?: { x: number; z: number } | null; now?: boolean; visual?: boolean },
  ): void;
  /** Everything within `radius` of `center`, with falloff. */
  area(center: THREE.Vector3, radius: number, packet: () => DamagePacket, kind?: HitKind): void;
  /** Everything in a strip `width` wide and `length` long. */
  line(origin: THREE.Vector3, dir: THREE.Vector3, length: number, width: number, packet: () => DamagePacket, kind?: HitKind): void;
  /** The nearest one target within `radius` of `at`. */
  point(at: THREE.Vector3, radius: number, packet: () => DamagePacket, kind?: HitKind): void;
  /** Every living enemy and the boss. */
  targets(): ShiftTarget[];
  /** Runs `run` after `t` seconds, if the cast's action is still the one playing. */
  later(t: number, run: () => void, keepIfInterrupted?: boolean): void;
  /** How far along `dir` the hero can go before a wall. */
  wallStop(from: THREE.Vector3, dir: THREE.Vector3, max: number, radius: number): number;
  /** The status a skill names (`params.statusId` or the runner's table). */
  statuses(riderOnly: boolean): StatusApplication[];
}

/** One cast, already paid for. */
export interface ShiftCast {
  def: SkillDef;
  rank: number;
  player: Player;
  target: THREE.Vector3;
  /** Unit vector on the floor, from the hero toward the aim point. */
  dir: THREE.Vector3;
  /** Chest-height point at the hero. */
  origin: THREE.Vector3;
  ctx: CombatContext;
  type: DamageType;
  color: number;
  /** The body clip the skill plays (its own gesture when it has one). */
  clip: string;
  /** Seconds a basic attack takes at the hero's speed. */
  attackTime: number;
  castTime: number;
  makePacket: (mult?: number) => DamagePacket;
  num: (k: string, d: number) => number;
  /** Plays the skill's hit sound at a point. */
  hitAt: (p: { x: number; z: number }) => void;
}

type Handler = (k: ShiftKit, c: ShiftCast) => void;

/** A packet that also carries a status, on top of whatever the skill rides. */
function withStatus(p: DamagePacket, a: StatusApplication): DamagePacket {
  p.applies = [...(p.applies ?? []), a];
  return p;
}

// ---------------------------------------------------------------------------
// Changing shape
// ---------------------------------------------------------------------------

const FORM_INDEX: readonly BeastForm[] = ['cat', 'wolf', 'bear'];

/**
 * Changes the hero's shape with its effect. `sound` plays the form's own
 * change sound (an auto-shift; a form skill's cast already sounds).
 */
function change(k: ShiftKit, player: Player, dir: THREE.Vector3, to: BeastForm | null, sound: boolean): boolean {
  const from = player.shape.form;
  if (!player.shape.become(to)) return false;
  formChange(k.effects, player.position, dir, from, to);
  if (sound) {
    const id = skillSound(FORM_SKILL[to ?? from ?? 'cat']).cast;
    if (id) audio.play(id, { x: player.position.x, z: player.position.z });
  }
  return true;
}

/**
 * A form skill: Shadowcat, Grey Wolf, Great Bear. Changes you into it, or,
 * if you are in it already, back into a man. The body swells into the new
 * shape (`FormBody`), the old pelt is shed, and the form's numbers go on.
 */
const form: Handler = (k, c) => {
  const want = FORM_INDEX[Math.floor(c.num('form', 0))] ?? 'cat';
  const to = c.player.shape.form === want ? null : want;
  c.player.beginAction(c.clip, c.castTime * 1.1);
  change(k, c.player, c.dir, to, false);
};

// ---------------------------------------------------------------------------
// Feral
// ---------------------------------------------------------------------------

/**
 * Rake: three quick swipes at the one enemy you aimed at. The third opens it
 * up and leaves it Bleeding.
 */
const rake: Handler = (k, c) => {
  const hits = Math.max(1, Math.floor(c.num('hits', 3)));
  const reach = c.num('reach', 2.4);
  const time = c.attackTime * 1.25;
  c.player.beginAction(c.clip, time);
  const focus = { x: c.target.x, z: c.target.z };
  const facing = c.dir.clone();
  const bleed: StatusApplication = { id: 'bleeding', duration: c.num('duration', 4), magnitude: 1, stacks: 1 };
  const blow = (i: number) => (m = 1): DamagePacket => {
    const p = c.makePacket(m);
    return i === hits - 1 ? withStatus(p, bleed) : p;
  };
  k.swing(facing, 1.4, reach, blow(0), { most: 1, focus });
  const first = c.player.contactIn;
  const gap = Math.min(0.11, (time * 0.7) / hits);
  for (let i = 1; i < hits; i++) {
    k.later(first + gap * i, () => k.swing(facing, 1.4, reach, blow(i), { most: 1, focus, now: true }));
  }
};

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const HANDLERS: Record<string, Handler> = {
  form,
  rake,
};

/** Shapeshifter effect names that have a handler, for tools. */
export const SHIFT_EFFECTS: readonly string[] = Object.keys(HANDLERS).map((n) => `shift.${n}`);

/** Runs one Shapeshifter skill. Returns false for an effect with no handler. */
export function runShift(k: ShiftKit, c: ShiftCast): boolean {
  const sub = (c.def.effect ?? '').split('.')[1] ?? '';
  const h = HANDLERS[sub];
  if (!h) return false;
  // Every tree skill is fought in its tree's form: out of it, change first.
  const want = FORM_OF_TREE[c.def.treeId];
  if (sub !== 'form' && want && c.player.shape.form !== want) change(k, c.player, c.dir, want, true);
  h(k, c);
  return true;
}
