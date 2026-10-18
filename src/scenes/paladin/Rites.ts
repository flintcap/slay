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
import { SELF_POWER } from '../../data/skillPower';

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
  /** How far a body can travel from `from` along `dir` before a wall, up to `max`. */
  clear(from: THREE.Vector3, dir: THREE.Vector3, max: number, ctx: CombatContext): number;
}

/** One press of a rite. */
export interface RiteCast {
  def: SkillDef;
  rank: number;
  player: Player;
  /** Where the press aimed, on the floor. */
  aim: THREE.Vector3;
  /** Set by the cast: where the blow will land, for the skill's motif. */
  landAt?: THREE.Vector3;
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

/** Which weapon a skill wants in hand. `any` is the censer, which hangs off the belt. */
type Grip = 'blunt' | 'blade' | 'shield' | 'any';

const BLUNT: ItemCategory[] = ['mace', 'scepter'];
const BLADE: ItemCategory[] = ['sword'];

interface Rite {
  grip: Grip;
  /** A step before the blow: to his side of the target, or round behind it. */
  step?: 'flank' | 'behind';
  /** The body clip until the skill has a gesture of its own. */
  clip: string;
  /** Action length as a multiple of one swing. */
  time: number;
  kind: HitKind;
  /** How far the blow reaches from the hero, before the target's body. */
  reach: number;
  /** A shield rush: he closes this far on the target before the blow lands. */
  rush?: number;
  /** Needs no target: it is something he does to himself. */
  self?: boolean;
  /** What happens at the contact frame, on the chosen target (null when it whiffs). */
  land(r: RiteCast, host: RiteHost, t: Target | null): void;
}

const v3 = new THREE.Vector3();
const dirV = new THREE.Vector3();

/** A status application. */
function status(id: string, duration: number, stacks = 1, magnitude = 1): StatusApplication {
  return { id, duration, magnitude, stacks };
}

/** A number that grows with rank: `key` at rank 1, plus `key + 'PerRank'` each rank after. */
function ranked(r: RiteCast, key: string, base: number, perRank: number): number {
  return r.num(key, base) + r.num(`${key}PerRank`, perRank) * Math.max(0, r.rank - 1);
}

// --- the Paladin's own passives, spent on each blow ---------------------------

/** Mace blows landed since the last Toll (The Last Bell), per hero. */
const tolls = new WeakMap<Player, number>();

/** True when the target has been broken open: Staggered, Rung or Dented. */
function broken(t: Target): boolean {
  return t.hasStatus('staggered') || t.hasStatus('rung') || t.stacksOf('dented') > 0;
}

/**
 * Lands `mult` times the skill on `t`, with `extra` riders, from the hero.
 * Crushing Weight and The Last Bell are read here, so every Mace blow
 * honours them without each skill remembering to.
 */
function blow(r: RiteCast, host: RiteHost, t: Target, mult = 1, extra: StatusApplication[] = [], kind?: HitKind, knockback = 0, opens = 0): DamagePacket {
  const pal = r.player.passives.pal;
  let m = mult;
  const riders = [...extra];
  if (pal.vsBrokenPct > 0 && broken(t)) m *= 1 + pal.vsBrokenPct / 100;
  if (pal.vsOpenedPct > 0 && t.hasStatus('opened')) m *= 1 + pal.vsOpenedPct / 100;
  if (pal.tollEvery > 0 && r.def.treeId === 'palMace') {
    const n = (tolls.get(r.player) ?? 0) + 1;
    if (n >= pal.tollEvery) {
      tolls.set(r.player, 0);
      m *= 1 + pal.tollPct / 100;
      riders.push(status('rung', pal.tollRingSec));
    } else {
      tolls.set(r.player, n);
    }
  }
  const p = r.packet(m);
  if (opens > 0) riders.push(opened(r, p.amount, opens));
  if (riders.length) p.applies = [...(p.applies ?? []), ...riders];
  if (knockback > 0) p.knockback = Math.max(p.knockback ?? 0, knockback);
  const rite = RITES[r.def.id];
  const landed = host.land(t, p, kind ?? rite?.kind ?? 'melee', r.player.position.x, r.player.position.z, r);
  host.sound(r.hitSound, t.root.position.x, t.root.position.z);
  // Red Rosary: a critical cut opens the vein on its own.
  if (landed.crit && pal.critOpens > 0 && t.life > 0) t.applyStatuses([opened(r, landed.amount, pal.critOpens)], r.ctx);
  return landed;
}

/**
 * An Opened wound from a cut of `amount`: it bleeds a share of the cut each
 * second, per stack, so a deep cut runs deeper than the depth curve alone.
 */
function opened(r: RiteCast, amount: number, stacks: number): StatusApplication {
  return { id: 'opened', duration: r.num('bleedTime', 5), magnitude: 1, stacks, power: amount * r.num('bleedShare', 0.12) };
}

/** `n` blows, `gap` seconds apart, the first now. `each(i)` lands blow `i`. */
function flurry(host: RiteHost, r: RiteCast, t: Target, n: number, gap: number, each: (i: number) => void): void {
  each(0);
  for (let i = 1; i < n; i++) {
    host.later(gap * i, () => {
      if (t.life <= 0 || !r.player.alive) return;
      each(i);
    });
  }
}

/** Ends every dent on the target and says how many there were. */
function spendDents(t: Target): number {
  return t.consumeStatus('dented');
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
  shieldCrack: {
    grip: 'shield',
    clip: 'lunge',
    time: 0.9,
    kind: 'heavy',
    reach: 2.2,
    land(r, host, t) {
      if (!t) return;
      blow(r, host, t, 1, [status('rung', ranked(r, 'stun', 1, 0.03))], 'heavy', r.num('knockback', 1.5));
    },
  },
  anvilfall: {
    grip: 'blunt',
    clip: 'slam',
    time: 1.55,
    kind: 'heavy',
    reach: 2.7,
    land(r, host, t) {
      if (!t) return;
      blow(r, host, t, 1, [status('dented', r.num('duration', 6), Math.round(r.num('dents', 2)))]);
    },
  },
  doorbreaker: {
    grip: 'shield',
    clip: 'lunge',
    time: 1.1,
    kind: 'heavy',
    reach: 2.2,
    rush: 9,
    land(r, host, t) {
      if (!t) return;
      blow(r, host, t, 1, [status('staggered', r.num('duration', 2))], 'heavy', r.num('knockback', 3));
    },
  },
  knell: {
    grip: 'blunt',
    clip: 'slam',
    time: 1.35,
    kind: 'heavy',
    reach: 2.6,
    land(r, host, t) {
      if (!t) return;
      blow(r, host, t, 1);
      // The iron is still ringing: a second, smaller blow from inside the helm.
      host.later(r.num('echoDelay', 0.55), () => {
        if (t.life <= 0 || !r.player.alive) return;
        blow(r, host, t, r.num('echo', 0.5), [status('rung', ranked(r, 'ring', 0.6, 0.02))], 'melee');
      });
    },
  },
  pilgrimsMaul: {
    grip: 'blunt',
    clip: 'slam',
    time: 1.7,
    kind: 'heavy',
    reach: 2.7,
    land(r, host, t) {
      if (!t) return;
      const dents = spendDents(t);
      blow(r, host, t, 1 + dents * r.num('perDent', 0.3));
    },
  },
  barTheDoor: {
    grip: 'shield',
    clip: 'cast',
    time: 0.8,
    kind: 'melee',
    reach: 0,
    self: true,
    land(r) {
      // How much it holds at this rank lives with every other buff's numbers.
      const pw = SELF_POWER.barTheDoor?.(Math.max(0, r.rank - 1), r.num) ?? {};
      r.player.applyStatus('barred', pw.duration ?? ranked(r, 'duration', 5, 0.15), 1, 1, { mods: pw.mods });
    },
  },
  hurlCenser: {
    grip: 'any',
    clip: 'hurl',
    time: 1.1,
    kind: 'heavy',
    reach: 14,
    land(r, host, t) {
      if (!t) return;
      const from = r.player.position.clone().setY(1.3);
      const to = t.root.position.clone().setY(1.0);
      const speed = r.num('speed', 18);
      // The censer is drawn in flight; the blow lands when it would arrive.
      host.effects.projectile(from, to, { element: 'fire', color: 0xd08a40, speed, arc: 1.2, impact: false });
      host.later(from.distanceTo(to) / speed, () => {
        if (t.life <= 0) return;
        blow(r, host, t, 1, [status('smoked', ranked(r, 'duration', 4, 0.1))]);
      });
    },
  },
  relicBash: {
    grip: 'shield',
    clip: 'lunge',
    time: 1.0,
    kind: 'heavy',
    reach: 2.2,
    land(r, host, t) {
      if (!t) return;
      const dents = spendDents(t);
      const each = ranked(r, 'healPct', 3, 0.15);
      blow(r, host, t, 1);
      if (dents > 0) r.player.heal(r.player.stats.life * ((each * dents) / 100));
    },
  },
  ironVerdict: {
    grip: 'blunt',
    clip: 'slam',
    time: 2.0,
    kind: 'heavy',
    reach: 2.8,
    land(r, host, t) {
      if (!t) return;
      // Rings longer the more of its armour is already beaten in.
      const ring = Math.min(r.num('ringCap', 2.5), r.num('ring', 0.4) + r.num('ringPerDent', 0.4) * t.stacksOf('dented'));
      blow(r, host, t, 1, [status('rung', ring)]);
    },
  },
  // ----------------------------------------------------------------- Blade
  oathCut: {
    grip: 'blade',
    clip: 'thrust',
    time: 0.8,
    kind: 'melee',
    reach: 2.5,
    land(r, host, t) {
      if (!t) return;
      blow(r, host, t, 1, [], 'melee', 0, 1);
    },
  },
  turnTheBlade: {
    grip: 'blade',
    clip: 'thrust',
    time: 0.7,
    kind: 'heavy',
    reach: 2.6,
    self: true,
    land(r, host) {
      // Blade up for a moment, then the answer, at whoever is closest in front.
      const window = r.num('window', 1.2);
      r.player.applyStatus('parrying', window);
      host.later(window, () => {
        if (!r.player.alive) return;
        const t = pickOne(r.player, r.player.position.clone().add(forward(r.player, 1.5)), r.enemies, r.boss, 2.6);
        if (!t) return;
        r.player.faceTowards(t.root.position.x, t.root.position.z);
        blow(r, host, t, 1, [status('exposed', r.num('duration', 3))], 'heavy');
      });
    },
  },
  twinVerse: {
    grip: 'blade',
    clip: 'attack2',
    time: 1.0,
    kind: 'melee',
    reach: 2.5,
    land(r, host, t) {
      if (!t) return;
      flurry(host, r, t, 2, r.num('gap', 0.16), () => blow(r, host, t, 1, [], 'melee', 0, 1));
    },
  },
  feint: {
    grip: 'blade',
    clip: 'thrust',
    time: 0.9,
    kind: 'melee',
    reach: 2.5,
    step: 'flank',
    land(r, host, t) {
      if (!t) return;
      blow(r, host, t, 1, [status('exposed', ranked(r, 'duration', 4, 0.1))]);
    },
  },
  litany: {
    grip: 'blade',
    clip: 'attack1',
    time: 1.5,
    kind: 'melee',
    reach: 2.5,
    land(r, host, t) {
      if (!t) return;
      flurry(host, r, t, Math.round(r.num('cuts', 5)), r.num('gap', 0.12), () => blow(r, host, t, 1, [], 'melee', 0, 1));
    },
  },
  confessionThrust: {
    grip: 'blade',
    clip: 'lunge',
    time: 1.1,
    kind: 'heavy',
    reach: 2.5,
    rush: 5,
    land(r, host, t) {
      if (!t) return;
      // Every open wound confesses at once.
      const cuts = t.consumeStatus('opened');
      blow(r, host, t, 1 + cuts * r.num('perCut', 0.4), [], 'heavy');
    },
  },
  crosswise: {
    grip: 'blade',
    clip: 'attack2',
    time: 1.1,
    kind: 'melee',
    reach: 2.5,
    land(r, host, t) {
      if (!t) return;
      flurry(host, r, t, 2, r.num('gap', 0.2), (i) => blow(r, host, t, 1, i === 1 ? [status('exposed', r.num('duration', 5))] : [], i === 1 ? 'heavy' : 'melee'));
    },
  },
  mercyStroke: {
    grip: 'blade',
    clip: 'thrust',
    time: 1.0,
    kind: 'heavy',
    reach: 2.5,
    land(r, host, t) {
      if (!t) return;
      // Below the line, a lesser thing is simply finished. Bosses are never small enough.
      const line = ranked(r, 'threshold', 15, 0.5) / 100;
      const mult = r.num('mercyMult', 8);
      const mercy = t !== r.boss && t.life / Math.max(1, t.maxLife) <= line;
      blow(r, host, t, mercy ? mult : 1, [], 'heavy');
    },
  },
  sevenfold: {
    grip: 'blade',
    clip: 'attack1',
    time: 1.6,
    kind: 'melee',
    reach: 2.5,
    land(r, host, t) {
      if (!t) return;
      const n = Math.round(r.num('cuts', 7));
      flurry(host, r, t, n, r.num('gap', 0.09), (i) =>
        i === n - 1 ? blow(r, host, t, 1, [status('exposed', r.num('duration', 5))], 'heavy', 0, 2) : blow(r, host, t, 1));
    },
  },
  lastRites: {
    grip: 'blade',
    clip: 'lunge',
    time: 1.3,
    kind: 'heavy',
    reach: 2.5,
    step: 'behind',
    land(r, host, t) {
      if (!t) return;
      blow(r, host, t, 1, [status('exposed', r.num('duration', 6))], 'heavy', 0, Math.round(r.num('opens', 3)));
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

/** Carries the hero up to the target over `seconds`, stopping at walls and short of its body. */
function rushTo(host: RiteHost, r: RiteCast, t: Target, seconds: number): void {
  const p = r.player;
  const from = p.position.clone();
  dirV.set(t.root.position.x - from.x, 0, t.root.position.z - from.z);
  const gap = dirV.length();
  if (gap < 0.01) return;
  dirV.divideScalar(gap);
  const want = Math.max(0, gap - t.hitRadius - 0.9);
  const go = Math.min(want, host.clear(from, dirV, want, r.ctx));
  if (go <= 0.2) return;
  const dir = dirV.clone();
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    host.later((seconds * i) / steps, () => {
      if (!p.alive) return;
      const k = i / steps;
      p.position.set(from.x + dir.x * go * k, p.position.y, from.z + dir.z * go * k);
    });
  }
}

/** One metre (times `d`) the way the hero faces. */
function forward(p: Player, d: number): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(p.root.rotation.y) * d, 0, Math.cos(p.root.rotation.y) * d);
}

/**
 * A quick step before the blow: `flank` to the side of the target (a feint),
 * `behind` round to its back. Walls cut it short; it never leaves reach.
 */
function stepTo(host: RiteHost, r: RiteCast, t: Target, how: 'flank' | 'behind', seconds: number): void {
  const p = r.player;
  const from = p.position.clone();
  const tp = t.root.position;
  dirV.set(tp.x - from.x, 0, tp.z - from.z);
  const gap = dirV.length();
  if (gap < 0.01) return;
  dirV.divideScalar(gap);
  const want = new THREE.Vector3();
  if (how === 'behind') {
    want.set(tp.x + dirV.x * (t.hitRadius + 0.9), 0, tp.z + dirV.z * (t.hitRadius + 0.9));
  } else {
    // Left or right, whichever side the cursor is on.
    const side = (r.aim.x - from.x) * dirV.z - (r.aim.z - from.z) * dirV.x >= 0 ? 1 : -1;
    const off = t.hitRadius + 1.0;
    want.set(tp.x - dirV.x * off * 0.6 + dirV.z * off * side, 0, tp.z - dirV.z * off * 0.6 - dirV.x * off * side);
  }
  const move = want.clone().sub(from).setY(0);
  const len = move.length();
  if (len < 0.2) return;
  move.divideScalar(len);
  const go = Math.min(len, host.clear(from, move, len, r.ctx));
  const steps = 5;
  for (let i = 1; i <= steps; i++) {
    host.later((seconds * i) / steps, () => {
      if (!p.alive) return;
      const k = i / steps;
      p.position.set(from.x + move.x * go * k, p.position.y, from.z + move.z * go * k);
      if (t.life > 0) p.faceTowards(t.root.position.x, t.root.position.z);
    });
  }
}

/** Runs one press of a rite. The runner has already paid for it. */
/** The aimed point, brought in to arm's reach: where a blow that found no one lands. */
function inReach(p: Player, aim: THREE.Vector3, reach: number): THREE.Vector3 {
  const dx = aim.x - p.position.x;
  const dz = aim.z - p.position.z;
  const d = Math.hypot(dx, dz);
  const k = d > reach ? reach / d : 1;
  return new THREE.Vector3(p.position.x + dx * k, 0, p.position.z + dz * k);
}

export function castRite(host: RiteHost, r: RiteCast): void {
  const rite = RITES[r.def.id];
  if (!rite) return;
  const p = r.player;
  // The tree's own numbers: how far the blow reaches, and how far a rush (or a throw) carries.
  const rush = rite.rush === undefined ? undefined : r.num('range', rite.rush);
  const reach = rite.self ? 0 : r.num('reach', rush === undefined ? r.num('range', rite.reach) : rite.reach);
  const target = rite.self ? null : pickOne(p, r.aim, r.enemies, r.boss, rush ?? reach);
  if (target) p.faceTowards(target.root.position.x, target.root.position.z);
  if (!rite.self) r.landAt = target ? target.root.position.clone().setY(0) : inReach(p, r.aim, reach);
  p.beginAction(skillAction(r.def.id) ?? rite.clip, r.attackTime * rite.time);
  const id = p.actionId;
  if (target && rush) rushTo(host, r, target, p.contactIn * 0.9);
  if (target && rite.step) stepTo(host, r, target, rite.step, p.contactIn * 0.8);
  host.later(p.contactIn, () => {
    if (p.actionId !== id || !p.alive) return;
    if (rite.self) {
      rite.land(r, host, null);
      return;
    }
    // Still there, still in reach at the moment the blow arrives.
    const t = target && target.life > 0 && Math.hypot(target.root.position.x - p.position.x, target.root.position.z - p.position.z) - target.hitRadius <= reach + 0.6 ? target : null;
    rite.land(r, host, t);
  });
}

/**
 * Bellguard: a blow turned on the Paladin's shield leaves the attacker
 * Staggered. Called by the dungeon's passive defence when a hit is blocked.
 */
export function paladinBlocked(player: Player, attacker: Target, ctx: CombatContext): void {
  const sec = player.passives.pal.blockStaggerSec;
  if (sec > 0 && attacker.life > 0) attacker.applyStatuses([status('staggered', sec)], ctx);
}
