/**
 * SLAY — the Paladin's weapon skills: the `rite` handler family.
 *
 * Every Mace and Blade skill hits ONE enemy: the one under the cursor, or
 * the nearest one in front of him when the cursor is on the floor. Riders
 * (a short shove, a stagger, a dent in the armour) ride on that one blow.
 *
 * `SkillRunner.cast` hands a skill whose effect family is `rite` to
 * `castRite`, with a small host that lands blows through the runner's own
 * pipeline (passives, hit feel, kill credit), so a Paladin blow is tuned,
 * felt and counted like any other.
 *
 * What each skill does lives in `RITES`, keyed by skill id.
 */
import * as THREE from 'three';
import type { DamagePacket, ItemCategory, SkillDef, StatusApplication } from '../../types';
import type { CombatContext, Enemy } from '../../entities/Enemy';
import type { Boss } from '../../entities/Boss';
import type { Player } from '../../entities/Player';
import type { HitKind } from '../../fx/CombatFeel';
import type { EffectSystem, School } from '../../fx/Effects';
import { getBase } from '../../sim/Loot';
import { skillAction } from '../../art/hero/SkillActions';

type Target = Enemy | Boss;

/** What the runner lends a rite. */
export interface RiteHost {
  readonly effects: EffectSystem;
  /** Lands one tuned blow on one target. Returns the packet that landed. */
  land(
    t: Target, packet: DamagePacket, kind: HitKind, fromX: number, fromZ: number,
    world: { ctx: CombatContext; enemies: Enemy[]; boss: Boss | null; player: Player },
  ): DamagePacket;
  /** Runs `fn` after `seconds` (the runner's contact queue). */
  later(seconds: number, fn: () => void): void;
  /** Plays a skill sound at a point. */
  sound(id: string | null, x: number, z: number): void;
}

/** One press of a rite. */
export interface RiteCast {
  def: SkillDef;
  rank: number;
  player: Player;
  /** Where the press aimed, on the floor. */
  aim: THREE.Vector3;
  ctx: CombatContext;
  enemies: Enemy[];
  boss: Boss | null;
  /** A fresh rolled packet at `mult` times the skill's damage, riders on. */
  packet: (mult?: number) => DamagePacket;
  num: (key: string, dflt: number) => number;
  school: School;
  color: number;
  /** Seconds one weapon swing takes at the hero's attack speed. */
  attackTime: number;
  hitSound: string | null;
}

/** Which weapon a skill wants in hand. */
type Grip = 'blunt' | 'blade' | 'shield';

const BLUNT: ItemCategory[] = ['mace', 'scepter'];
const BLADE: ItemCategory[] = ['sword'];

interface Rite {
  grip: Grip;
  /** The body clip until the skill has a gesture of its own. */
  clip: string;
  /** Action length as a multiple of one swing. */
  time: number;
  kind: HitKind;
  /** How far the blow reaches from the hero, before the target's body. */
  reach: number;
  /** What happens at the contact frame, on the chosen target (null when it whiffs). */
  land(r: RiteCast, host: RiteHost, t: Target | null): void;
}

const v3 = new THREE.Vector3();

/** A status application built from the skill's own `duration`. */
function status(id: string, duration: number, stacks = 1, magnitude = 1): StatusApplication {
  return { id, duration, magnitude, stacks };
}

/** Lands `mult` times the skill on `t`, with `extra` riders, from the hero. */
function blow(r: RiteCast, host: RiteHost, t: Target, mult = 1, extra: StatusApplication[] = [], kind?: HitKind, knockback = 0): DamagePacket {
  const p = r.packet(mult);
  if (extra.length) p.applies = [...(p.applies ?? []), ...extra];
  if (knockback > 0) p.knockback = Math.max(p.knockback ?? 0, knockback);
  const rite = RITES[r.def.id];
  const landed = host.land(t, p, kind ?? rite?.kind ?? 'melee', r.player.position.x, r.player.position.z, r);
  host.sound(r.hitSound, t.root.position.x, t.root.position.z);
  return landed;
}

const RITES: Record<string, Rite> = {
  // ------------------------------------------------------------------ Mace
  tollingBlow: {
    grip: 'blunt',
    clip: 'slam',
    time: 1.25,
    kind: 'heavy',
    reach: 2.6,
    land(r, host, t) {
      if (!t) return;
      blow(r, host, t, 1, [status('staggered', r.num('duration', 2))]);
    },
  },
};

/** True when the skill is a Paladin rite this module runs. */
export function isRite(skillId: string): boolean {
  return skillId in RITES;
}

function categoryIn(player: Player, slot: 'mainHand' | 'offHand'): ItemCategory | null {
  const item = player.character.equipment[slot];
  if (!item) return null;
  try {
    return getBase(item.baseId)?.category ?? null;
  } catch {
    return null;
  }
}

/**
 * Why a rite cannot be used with what is in the hero's hands, or null when it
 * can. Checked before any mana is spent.
 */
export function riteRefusal(def: SkillDef, player: Player): string | null {
  const rite = RITES[def.id];
  if (!rite) return null;
  const main = categoryIn(player, 'mainHand');
  if (rite.grip === 'blunt' && !(main && BLUNT.includes(main))) return `${def.name} needs a mace or a scepter.`;
  if (rite.grip === 'blade' && !(main && BLADE.includes(main))) return `${def.name} needs a sword.`;
  if (rite.grip === 'shield' && categoryIn(player, 'offHand') !== 'shield') return `${def.name} needs a shield.`;
  return null;
}

/**
 * The one enemy a press is about: whatever is nearest the aim point within
 * reach, else the nearest thing in front of the hero within reach.
 */
export function pickOne(player: Player, aim: THREE.Vector3, enemies: Enemy[], boss: Boss | null, reach: number): Target | null {
  const me = player.position;
  // Which way the press points: at the aim, or the way he faces when the aim is at his feet.
  let fx = aim.x - me.x;
  let fz = aim.z - me.z;
  const len = Math.hypot(fx, fz);
  if (len < 0.3) {
    fx = Math.sin(player.root.rotation.y);
    fz = Math.cos(player.root.rotation.y);
  } else {
    fx /= len;
    fz /= len;
  }
  let best: Target | null = null;
  let bestD = Infinity;
  const consider = (t: Target): void => {
    if (t.life <= 0) return;
    const p = t.root.position;
    const fromMe = Math.hypot(p.x - me.x, p.z - me.z) - t.hitRadius;
    if (fromMe > reach) return;
    const fromAim = Math.hypot(p.x - aim.x, p.z - aim.z) - t.hitRadius;
    // In front, not behind: a blow aimed one way does not land the other.
    v3.set(p.x - me.x, 0, p.z - me.z).normalize();
    const facing = fx * v3.x + fz * v3.z;
    const score = fromAim + (facing < 0.2 ? 6 : 0);
    if (score < bestD) {
      bestD = score;
      best = t;
    }
  };
  for (const e of enemies) consider(e);
  if (boss) consider(boss);
  return best;
}

/** Runs one press of a rite. The runner has already paid for it. */
export function castRite(host: RiteHost, r: RiteCast): void {
  const rite = RITES[r.def.id];
  if (!rite) return;
  const p = r.player;
  const target = pickOne(p, r.aim, r.enemies, r.boss, rite.reach);
  if (target) p.faceTowards(target.root.position.x, target.root.position.z);
  p.beginAction(skillAction(r.def.id) ?? rite.clip, r.attackTime * rite.time);
  const id = p.actionId;
  host.later(p.contactIn, () => {
    if (p.actionId !== id || !p.alive) return;
    // Still there, still in reach at the moment the blow arrives.
    const t = target && target.life > 0 && Math.hypot(target.root.position.x - p.position.x, target.root.position.z - p.position.z) - target.hitRadius <= rite.reach + 0.6 ? target : null;
    rite.land(r, host, t);
  });
}
