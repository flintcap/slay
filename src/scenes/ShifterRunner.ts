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
 * what keeps each of them 1 of 1. What a buff gives at a rank is written once,
 * in `data/shifterPower.ts`.
 */
import * as THREE from 'three';
import type { DamagePacket, DamageType, SkillDef, StatusApplication } from '../types';
import type { SummonGrowth } from './SkillRunner';
import type { Player } from '../entities/Player';
import type { CombatContext, Enemy } from '../entities/Enemy';
import type { Boss } from '../entities/Boss';
import type { EffectSystem } from '../fx/Effects';
import type { HitKind } from '../fx/CombatFeel';
import type { BeastForm } from '../art/hero/forms/BeastBody';
import { FORM_OF_TREE, FORM_SKILL } from '../entities/Shapeshift';
import { ClawFX, FeralFX, TeethFX, beastImpact, formChange } from '../fx/shifter/ShifterFX';
import { SHIFTER_SELF_POWER, beastOfSkill, bristleReflect, formHands, ursaLifePct } from '../data/shifterPower';
import { travelTime, type Hands } from '../sim/Speed';
import { getSkill } from '../data/skills';
import { effectiveSkillRank } from '../sim/Character';
import { heroPower } from '../sim/HeroPower';
import { audio } from '../audio/Audio';
import { skillSound } from '../audio/SkillSounds';
import '../data/shifterStatuses';
import { tr } from '../core/I18n';

export type ShiftTarget = Enemy | Boss;

/** The monster each Shapeshifter summon wears (`SkillRunner.MINION_MONSTER`). */
export const SHIFTER_MINIONS: Readonly<Record<string, string>> = { callThePack: 'gorge_wolf' };

/** The runner's own helpers, bound to this cast's world. */
export interface ShiftKit {
  effects: EffectSystem;
  /**
   * A blow in an arc. `now` lands it this frame (on a beat the handler timed);
   * otherwise it waits for the clip's contact frame. Returns how many it hit
   * (0 while it waits). In a form it lands as the beast's claws or teeth
   * (blood and hair, `clawHit`), not a weapon's sparks.
   */
  swing(
    facing: THREE.Vector3,
    arc: number,
    reach: number,
    packet: (m?: number) => DamagePacket,
    opts?: { kind?: HitKind; most?: number; focus?: { x: number; z: number } | null; now?: boolean; visual?: boolean },
  ): number;
  /** Everything within `radius` of `center`, with falloff; `flat` lands it the same to the edge. Returns the damage dealt. */
  area(center: THREE.Vector3, radius: number, packet: () => DamagePacket, kind?: HitKind, flat?: boolean): number;
  /** One body struck now, as if from (fromX, fromZ) (the side its flinch goes from). True when it landed. */
  hit(t: ShiftTarget, packet: () => DamagePacket, kind?: HitKind, fromX?: number, fromZ?: number): boolean;
  /**
   * Seconds after the first blow at which the skill's gesture lands its later
   * blows (`Spec.cuts`), played over `span` seconds with the first at `first`.
   * Null for a gesture without cuts.
   */
  cuts(span: number, first: number): number[] | null;
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
  /** Puts this skill's buff on at its rank (`SELF_POWER`), with its heal if it has one. */
  buff(): void;
  /**
   * Raises one of this skill's creatures at (x, z): it bites with `packet` and
   * has `life`. `grow` lets a point spent later strengthen the ones already
   * standing. No summoning circle: the handler draws its own coming.
   */
  raise(x: number, z: number, o: { packet: (m?: number) => DamagePacket; life: number; rate: number; range: number; grow?: SummonGrowth }): void;
  /** How many of this skill's creatures stand now. */
  pack(): number;
  /** Lets the oldest of this skill's creatures go until `keep` are left. */
  trim(keep: number): void;
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
  /**
   * Seconds this use takes as an attack: the skill's own `attackTime` swings
   * at its beast's pace (`FORM_PACE`) and the hero's attack speed.
   */
  attackTime: number;
  /** Seconds this use takes as a cast: its own `castTime` at the hero's cast speed. */
  castTime: number;
  makePacket: (mult?: number) => DamagePacket;
  num: (k: string, d: number) => number;
  /** Plays the skill's hit sound at a point. */
  hitAt: (p: { x: number; z: number }) => void;
  /**
   * Set by a handler whose blow lands later than the action's contact frame
   * (a leap's landing, the end of a run): seconds from the press, so the
   * skill's motif lands with it.
   */
  lands?: number;
}

type Handler = (k: ShiftKit, c: ShiftCast) => void;

/** A packet that also carries statuses, on top of whatever the skill rides. */
function withStatus(p: DamagePacket, ...a: StatusApplication[]): DamagePacket {
  p.applies = [...(p.applies ?? []), ...a];
  return p;
}

/** A param at this cast's rank: `key` plus `keyR` for each rank past the first. */
function rk(c: ShiftCast, key: string, d: number): number {
  return c.num(key, d) + c.num(`${key}R`, 0) * Math.max(0, c.rank - 1);
}

const flat = (p: { x: number; z: number }) => new THREE.Vector3(p.x, 0, p.z);

/**
 * The enemy the cast is aimed at: the one nearest the aim point, within
 * `max` metres of the hero. Null when nothing is in reach.
 */
function prey(k: ShiftKit, c: ShiftCast, max: number): ShiftTarget | null {
  let best: ShiftTarget | null = null;
  let bd = Infinity;
  const h = c.player.position;
  for (const t of k.targets()) {
    if (!t.alive) continue;
    const p = t.root.position;
    if (Math.hypot(p.x - h.x, p.z - h.z) > max) continue;
    const d = Math.hypot(p.x - c.target.x, p.z - c.target.z);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return best;
}

/** The unit floor direction from the hero to a point (the cast's own if they meet). */
function toward(c: ShiftCast, p: { x: number; z: number }): THREE.Vector3 {
  const d = new THREE.Vector3(p.x - c.player.position.x, 0, p.z - c.player.position.z);
  return d.lengthSq() > 1e-4 ? d.normalize() : c.dir.clone();
}

/** Ursa Major's reach as it was cast, per hero. */
const ursaReaches = new WeakMap<Player, number>();

/** How much further a bear's swipes reach under Ursa Major (1 without it). */
function ursaReach(c: ShiftCast): number {
  if (!c.player.status.has('ss.ursaMajor')) return 1;
  return ursaReaches.get(c.player) ?? 1.4;
}

/** A rank of another skill the hero holds, with +skills (0 if unlearned). */
function rankOf(c: ShiftCast, id: string): number {
  const ch = c.player.character;
  return ch.skills[id] ? effectiveSkillRank(ch, id, c.player.stats) : 0;
}

const st = (id: string, duration: number, stacks = 1, magnitude = 1): StatusApplication => ({ id, duration, magnitude, stacks });

/** A count param as the skill is written (rank 1, no unique), to stretch a use that gains blows. */
function baseNum(c: ShiftCast, key: string, d: number): number {
  const v = c.def.params?.[key];
  return typeof v === 'number' && v > 0 ? v : d;
}

/**
 * How long a multi-blow use takes: its own `attackTime`, longer by the same
 * share when a rank or a unique adds blows, so a blow never comes quicker
 * (damage per blow stays as written).
 */
function stretched(c: ShiftCast, n: number, base: number): number {
  return c.attackTime * Math.max(1, n / Math.max(1, base));
}

/**
 * Seconds from the press at which each of `n` blows lands. The first is the
 * action's contact frame; the next sit on the gesture's own cut keys
 * (`Spec.cuts`), so each lands on its own swipe, bite or squeeze; any past
 * them (a rank's or a unique's extra) follow at the gesture's own spacing.
 * Call it right after `beginAction`.
 */
function blowTimes(k: ShiftKit, c: ShiftCast, total: number, n: number): number[] {
  const first = c.player.contactIn;
  const cuts = k.cuts(total, first) ?? [];
  const step = cuts.length > 0 ? cuts[cuts.length - 1]! / cuts.length : Math.max(0.08, ((total - first) * 0.5) / Math.max(1, n));
  const at = [first];
  for (let i = 1; i < n; i++) at.push(i - 1 < cuts.length ? first + cuts[i - 1]! : at[i - 1]! + step);
  return at;
}

const _fling = new THREE.Vector3();

/**
 * Throws a body `dist` metres along (dx, dz) over `time` seconds, `arc`
 * metres up at the top, stopping short of a wall; a big body goes less far.
 * Bosses, the unstoppable and the furniture hold their ground, and a body
 * already being moved is left to it.
 */
function fling(k: ShiftKit, t: ShiftTarget, dx: number, dz: number, dist: number, time: number, arc: number): void {
  if (!t.alive || t.isBoss || t.def.object || t.motionOverride) return;
  if (t.affixes.some((a) => a.behavior === 'juggernaut')) return;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4 || dist <= 0) return;
  const ux = dx / len;
  const uz = dz / len;
  const q = t.root.position;
  const far = Math.min(dist / Math.max(0.8, t.sizeScale), k.wallStop(q, _fling.set(ux, 0, uz), dist, t.hitRadius));
  if (far < 0.1) return;
  t.motionOverride = { kind: 'knock', fromX: q.x, fromZ: q.z, toX: q.x + ux * far, toZ: q.z + uz * far, t: 0, duration: time, arc };
}

/**
 * The next body a crowd skill (Killing Dance, Ravening) goes for: the one it
 * is on until a blow lands on it, then the nearest within `crowd` metres of
 * that one that has not been struck yet and can be reached; round again
 * (anyone near but the last) when all have been. Alone, the same one again.
 * Null with nothing in reach at all.
 */
function nextInCrowd(k: ShiftKit, c: ShiftCast, last: ShiftTarget | null, done: Set<ShiftTarget>, crowd: number, max: number): ShiftTarget | null {
  const base = last && last.alive ? last : prey(k, c, max);
  if (!base) return null;
  if (!done.has(base)) return base;
  const h = c.player.position;
  const b = base.root.position;
  const pick = (skip: (t: ShiftTarget) => boolean): ShiftTarget | null => {
    let best: ShiftTarget | null = null;
    let bd = Infinity;
    for (const t of k.targets()) {
      if (!t.alive || t === base || skip(t)) continue;
      const q = t.root.position;
      const d = Math.hypot(q.x - b.x, q.z - b.z);
      if (d > crowd + t.hitRadius || d >= bd) continue;
      // Not through a wall.
      const run = Math.hypot(q.x - h.x, q.z - h.z);
      _fling.set(q.x - h.x, 0, q.z - h.z).normalize();
      if (k.wallStop(h, _fling, run, 0.35) < run - 1) continue;
      best = t;
      bd = d;
    }
    return best;
  };
  const fresh = pick((t) => done.has(t));
  if (fresh) return fresh;
  done.clear();
  return pick(() => false) ?? base;
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
  c.player.beginAction(c.clip, c.castTime);
  change(k, c.player, c.dir, to, false);
};

// ---------------------------------------------------------------------------
// Feral (the black cat: one enemy, fast)
// ---------------------------------------------------------------------------

/**
 * Rake: three quick swipes at the one enemy you aimed at: right paw, left
 * paw, then both crossed, each on its own swipe of the gesture. The last
 * opens it up and leaves it Bleeding.
 */
const rake: Handler = (k, c) => {
  const p = c.player;
  const hits = Math.max(1, Math.floor(c.num('hits', 3)));
  const reach = c.num('reach', 2.4);
  const total = stretched(c, hits, baseNum(c, 'hits', 3));
  p.beginAction(c.clip, total);
  const at = blowTimes(k, c, total, hits);
  const t = prey(k, c, reach + 0.6);
  const focus = () => (t && t.alive ? { x: t.root.position.x, z: t.root.position.z } : { x: c.target.x, z: c.target.z });
  const bleed = st('bleeding', c.num('duration', 4));
  const fx = k.effects;
  for (let i = 0; i < hits; i++) {
    const last = i === hits - 1;
    // Right, left, and the last with both paws.
    const both = last && hits >= 3;
    const side: 'L' | 'R' = i % 2 === 0 ? 'R' : 'L';
    // The scores run with the paw from just before the blow.
    k.later(Math.max(0, at[i]! - 0.08), () => {
      if (both || side === 'R') FeralFX.rakeStroke(fx, p.bones, 'R', 0.14);
      if (both || side === 'L') FeralFX.rakeStroke(fx, p.bones, 'L', 0.14);
    });
    k.later(at[i]!, () => {
      const f = focus();
      const dir = toward(c, f);
      const packet = (m = 1): DamagePacket => (last ? withStatus(c.makePacket(m), bleed) : c.makePacket(m));
      if (k.swing(dir, 1.4, reach, packet, { most: 1, focus: f, now: true }) <= 0) return;
      FeralFX.rakeHit(fx, f, dir, side);
      if (both) FeralFX.rakeHit(fx, f, dir, 'L');
    });
  }
};

/** Where a leap or a rush at `t` (or the aim point) ends: `short` metres before the body, never through a wall. */
function lane(k: ShiftKit, c: ShiftCast, t: ShiftTarget | null, range: number, short: number): { dir: THREE.Vector3; dist: number; to: THREE.Vector3 } {
  const aim = t && t.alive ? flat(t.root.position) : flat(c.target);
  const dir = toward(c, aim);
  const h = c.player.position;
  const want = Math.max(0, Math.hypot(aim.x - h.x, aim.z - h.z) - (t ? short : 0));
  const dist = Math.max(0, Math.min(want, range, k.wallStop(h, dir, range, 0.4)));
  return { dir, dist, to: h.clone().addScaledVector(dir, dist) };
}

/**
 * Pounce: the cat coils where it stands, then leaps up to 9m in an arc onto
 * one enemy at a leap's speed (`travelTime`), and lands claws first: the
 * landing is the gesture's blow. A short stun.
 */
const pounce: Handler = (k, c) => {
  const p = c.player;
  const range = c.num('range', 9);
  const t = prey(k, c, range);
  const coil = Math.min(0.22, c.attackTime * 0.4);
  const flight = travelTime(lane(k, c, t, range, 0.9).dist);
  const total = c.attackTime + flight;
  p.beginAction(c.clip, total);
  // The claws land when the body does.
  p.animator.play(c.clip, { fade: 0.06, span: total, restart: true, contact: coil + flight });
  c.lands = coil + flight;
  const fx = k.effects;
  k.later(coil, () => {
    // Aimed again at the spring: it may have stepped while the cat coiled.
    const l = lane(k, c, t, range, 0.9);
    p.steadyLeft = Math.max(p.steadyLeft, flight);
    FeralFX.pounceLeap(fx, p.bones, flight);
    p.shape.travel(l.to, flight, 0.5 + l.dist * 0.08, {
      id: p.actionId,
      land: () => {
        if (!p.alive) return;
        const f = t && t.alive ? { x: t.root.position.x, z: t.root.position.z } : { x: l.to.x + l.dir.x, z: l.to.z + l.dir.z };
        k.swing(l.dir, 1.8, c.num('reach', 1.8) + 0.4, (m = 1) => withStatus(c.makePacket(m), st('stunned', c.num('stun', 0.8))), { most: 1, focus: f, now: true });
        FeralFX.pounceLand(fx, f, l.dir);
      },
    });
  });
};

/** Slink: low and quiet. Faster and sharper, and the next Feral skill is an ambush. */
const slink: Handler = (k, c) => {
  c.player.beginAction(c.clip, c.castTime);
  k.buff();
  FeralFX.slink(k.effects, c.player.root, c.player.bones, rk(c, 'duration', 4));
};

/** Hamstring: one low swipe at the back of the legs. Crippled, and two stacks of Bleeding. */
const hamstring: Handler = (k, c) => {
  const reach = c.num('reach', 2.2);
  c.player.beginAction(c.clip, c.attackTime);
  const t = prey(k, c, reach + 1);
  const focus = () => (t && t.alive ? { x: t.root.position.x, z: t.root.position.z } : { x: c.target.x, z: c.target.z });
  const dur = c.num('duration', 4);
  const bleed = Math.max(1, Math.floor(c.num('bleed', 2)));
  const contact = c.player.contactIn;
  k.later(Math.max(0, contact - 0.1), () => FeralFX.hamstringStroke(k.effects, c.player.bones, 0.2));
  k.later(contact, () => {
    const f = focus();
    const dir = toward(c, f);
    if (k.swing(dir, 1.2, reach, (m = 1) => withStatus(c.makePacket(m), st('crippled', dur), st('bleeding', dur, bleed)), { most: 1, focus: f, now: true }) > 0) {
      FeralFX.hamstringHit(k.effects, f, dir);
    }
  });
};

/**
 * Throat Tear: the jaws on one throat. A wounded enemy (under the execute
 * line) takes far more and is left with a Hemorrhage.
 */
const throatTear: Handler = (k, c) => {
  const reach = c.num('reach', 2);
  c.player.beginAction(c.clip, c.attackTime);
  const t = prey(k, c, reach + 1);
  const line = c.num('execute', 30) / 100;
  // Read at the bite, not the cast: a target that dropped under the line on the way in still counts.
  const exec = () => !!t && t.alive && t.lifeFraction <= line;
  k.later(c.player.contactIn, () => {
    const f = t && t.alive ? { x: t.root.position.x, z: t.root.position.z } : { x: c.target.x, z: c.target.z };
    const dir = toward(c, f);
    const executing = exec();
    const n = k.swing(dir, 1.1, reach + 0.3, (m = 1) => {
      if (!executing) return c.makePacket(m);
      return withStatus(c.makePacket(m * c.num('executeMult', 2.5)), st('hemorrhage', c.num('duration', 5)));
    }, { most: 1, focus: f, now: true });
    if (n > 0) FeralFX.throatTear(k.effects, f, dir, executing);
  });
};

/**
 * Killing Dance: the cat runs round its prey and strikes from a new side
 * each time, faster and faster: a real run to each spot, the swipe on
 * arrival. With other enemies within 3m, each blow goes to the next one not
 * struck yet, so in a pack it cuts through them. A shadow where it was.
 */
const killingDance: Handler = (k, c) => {
  const p = c.player;
  const reach = c.num('reach', 2.4);
  const hits = Math.max(1, Math.floor(c.num('hits', 6) + Math.floor(c.rank / Math.max(1, c.num('perRanks', 5)))));
  const ring = c.num('radius', 1.5);
  const crowd = c.num('crowd', 3);
  const total = stretched(c, hits, baseNum(c, 'hits', 6));
  p.beginAction(c.clip, total);
  // Each gap a step shorter than the last; a short recovery after the end.
  const R = 0.88;
  const g0 = (total * 0.9 * (1 - R)) / (1 - Math.pow(R, hits));
  c.lands = g0 * 0.6;
  const fx = k.effects;
  const done = new Set<ShiftTarget>();
  let on: ShiftTarget | null = null;
  let start = 0;
  for (let i = 0; i < hits; i++) {
    const gap = g0 * Math.pow(R, i);
    const run = gap * 0.6;
    const side: 'L' | 'R' = i % 2 === 0 ? 'R' : 'L';
    k.later(start, () => {
      const was = on;
      const t = nextInCrowd(k, c, on, done, crowd, reach + 2);
      on = t;
      const m = t ? flat(t.root.position) : flat(c.target);
      // Round the same one a little over a third of the circle a step (less
      // when quick, so the run never blurs past ~20 m/s); to a new one, in
      // from the near side.
      const step = t && t === was ? Math.min(2.3, 2 * Math.asin(Math.min(1, (20 * run) / (2 * ring)))) : i % 2 === 0 ? 0.9 : -0.9;
      const a = Math.atan2(p.position.x - m.x, p.position.z - m.z) + step;
      const out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const want = ring + (t ? t.hitRadius * 0.5 : 0);
      const r = Math.min(want, k.wallStop(m, out, want, 0.35));
      const to = m.clone().addScaledVector(out, r);
      FeralFX.dancePoint(fx, p.position.clone());
      FeralFX.danceStroke(fx, p.bones, side, run + 0.08);
      // The gesture again for this blow, its swipe on the landing.
      p.animator.play(c.clip, { fade: 0.04, span: gap, restart: true, contact: run });
      p.shape.travel(to, run, 0.12, {
        id: p.actionId,
        land: () => {
          const f = t && t.alive ? { x: t.root.position.x, z: t.root.position.z } : { x: m.x, z: m.z };
          p.faceTowards(f.x, f.z);
          const dir = toward(c, f);
          if (k.swing(dir, 1.4, reach, (q = 1) => c.makePacket(q), { most: 1, focus: f, now: true }) <= 0) return;
          if (t) done.add(t);
          FeralFX.rakeHit(fx, f, dir, side);
        },
      });
    });
    start += gap;
  }
};

/** Night Hunt: the dark runs with you. Feral skills cost nothing while it lasts (`runShift`). */
const nightHunt: Handler = (k, c) => {
  c.player.beginAction(c.clip, c.castTime);
  k.buff();
  FeralFX.nightHunt(k.effects, c.player.root, rk(c, 'duration', 8));
};

// ---------------------------------------------------------------------------
// Teeth (the grey wolf: bite, and feed the pack's frenzy)
// ---------------------------------------------------------------------------

/** The wolf's run, metres a second (a leap or the bear's charge go at `RUSH_SPEED`). */
const WOLF_RUN = 18;

/** How many Pack Frenzy stacks the hero can hold: Snap's own, and one more every few ranks of Blood Frenzy. */
function frenzyCap(c: ShiftCast): number {
  const snap = getSkill('snap')?.params?.maxStacks;
  const per = getSkill('frenzyMastery')?.params?.perRanks;
  return (typeof snap === 'number' ? snap : 5) + Math.floor(rankOf(c, 'frenzyMastery') / (typeof per === 'number' ? per : 4));
}

/** Adds Pack Frenzy stacks up to the cap, and keeps them for at least `time`. */
function frenzy(c: ShiftCast, add: number, time: number): void {
  const cap = frenzyCap(c);
  const s = c.player.status;
  const now = s.stacks('ss.packFrenzy');
  const more = Math.max(0, Math.min(add, cap - now));
  if (more > 0) c.player.applyStatus('ss.packFrenzy', time, 1, more);
  const a = s.get('ss.packFrenzy');
  if (a) {
    a.remaining = Math.max(a.remaining, time);
    a.duration = Math.max(a.duration, a.remaining);
  }
}

/** Snap: a fast bite that feeds Pack Frenzy. */
const snap: Handler = (k, c) => {
  const reach = c.num('reach', 2.2);
  c.player.beginAction(c.clip, c.attackTime);
  const t = prey(k, c, reach + 0.8);
  k.later(c.player.contactIn, () => {
    const f = t && t.alive ? { x: t.root.position.x, z: t.root.position.z } : { x: c.target.x, z: c.target.z };
    const dir = toward(c, f);
    if (k.swing(dir, 1.0, reach, (m = 1) => c.makePacket(m), { most: 1, focus: f, now: true }) > 0) TeethFX.snap(k.effects, f, dir);
  });
  frenzy(c, 1, c.num('duration', 6));
};

/** Hunting Howl: the hunt is called. More damage, a surer bite. */
const huntingHowl: Handler = (k, c) => {
  c.player.beginAction(c.clip, c.castTime);
  k.buff();
  TeethFX.howl(k.effects, c.player.position, c.num('radius', 10));
};

/**
 * Lunge: a straight rush, low the whole way at a run's speed, the bite on
 * arrival and the thing bitten thrown back.
 */
const lunge: Handler = (k, c) => {
  const p = c.player;
  const range = c.num('range', 8);
  const t = prey(k, c, range);
  const l = lane(k, c, t, range, 0.8);
  const run = travelTime(l.dist, WOLF_RUN);
  const lead = Math.min(0.08, c.attackTime * 0.25);
  const total = c.attackTime + run;
  p.beginAction(c.clip, total);
  // Held in the run, the jaws thrown forward as it arrives.
  p.animator.play(c.clip, { fade: 0.05, span: total, restart: true, contact: lead + run });
  c.lands = lead + run;
  const fx = k.effects;
  k.later(lead, () => {
    TeethFX.lungeRun(fx, p.bones, run);
    p.shape.travel(l.to, run, 0.12, {
      id: p.actionId,
      land: () => {
        if (!p.alive) return;
        const f = t && t.alive ? { x: t.root.position.x, z: t.root.position.z } : { x: l.to.x + l.dir.x, z: l.to.z + l.dir.z };
        const n = k.swing(l.dir, 1.1, c.num('reach', 2) + 0.3, (m = 1) => {
          const pk = c.makePacket(m);
          // The throw below is the knockback, not the blow's own shove.
          delete pk.knockback;
          return pk;
        }, { most: 1, focus: f, now: true });
        TeethFX.lungeBite(fx, f, l.dir);
        if (n > 0 && t) fling(k, t, l.dir.x, l.dir.z, c.num('knockback', 1.5), 0.25, 0.3);
      },
    });
  });
};

/**
 * Worry: clamp on (the first shake holds it), shake it on each of the
 * gesture's wrenches, its body going with the head, then fling it aside on
 * the throw, to the side of the last wrench.
 */
const worry: Handler = (k, c) => {
  const p = c.player;
  const reach = c.num('reach', 2);
  const shakes = Math.max(1, Math.floor(c.num('shakes', 4)));
  const total = stretched(c, shakes, baseNum(c, 'shakes', 4));
  p.beginAction(c.clip, total);
  // The shakes, and the throw after them.
  const at = blowTimes(k, c, total, shakes + 1);
  const t = prey(k, c, reach + 0.8);
  const focus = () => (t && t.alive ? { x: t.root.position.x, z: t.root.position.z } : { x: c.target.x, z: c.target.z });
  const hold = st('stunned', Math.max(c.num('stun', 1.2), at[shakes]! - at[0]! + 0.15));
  let held = false;
  let side: 1 | -1 = 1;
  for (let i = 0; i < shakes; i++) {
    k.later(at[i]!, () => {
      const f = focus();
      const dir = toward(c, f);
      const n = k.swing(dir, 1.0, reach + 0.4, (m = 1) => {
        const pk = c.makePacket(m);
        delete pk.knockback;
        return i === 0 ? withStatus(pk, hold) : pk;
      }, { most: 1, focus: f, now: true });
      if (n <= 0) return;
      if (i === 0) held = true;
      side = i % 2 === 0 ? 1 : -1;
      TeethFX.worryShake(k.effects, f, dir, side);
      // The body goes with the head: a short wrench to that side.
      if (t) fling(k, t, -dir.z * side, dir.x * side, 0.35, 0.1, 0);
    });
  }
  k.later(at[shakes]!, () => {
    if (!held || !t || !t.alive) return;
    const f = focus();
    const dir = toward(c, f);
    // Off to the side it was last wrenched to, and a little away.
    fling(k, t, -dir.z * side + dir.x * 0.5, dir.x * side + dir.z * 0.5, c.num('knockback', 2.5), 0.32, 0.5);
    TeethFX.worryThrow(k.effects, f, dir, side);
  });
};

/** Call the Pack: grey wolves come up out of a low fog, eyes first, to fight beside you. */
const callThePack: Handler = (k, c) => {
  c.player.beginAction(c.clip, c.castTime);
  const count = Math.max(1, Math.floor(c.num('count', 2) + Math.floor(c.rank / Math.max(1, c.num('perRanks', 6)))));
  // At the limit a cast still does something: the oldest wolf goes back to the dark.
  let room = count - k.pack();
  if (room <= 0) {
    k.trim(count - 1);
    room = 1;
  }
  const mp = c.player.passives;
  // The bite's rank share is in the packet already (`BURST_POWER.callThePack`);
  // Alpha's damage and life on top.
  const share = c.num('minionScale', 0.45) * (1 + mp.minionDamagePct / 100);
  const life = Math.max(20, ((c.player.stats.life * rk(c, 'lifePct', 30)) / 100) * (1 + mp.minionLifePct / 100));
  const p = c.player.position;
  const fx = k.effects;
  TeethFX.callFog(fx, p);
  for (let i = 0; i < room; i++) {
    const a = Math.atan2(c.dir.x, c.dir.z) + Math.PI + (i - (room - 1) / 2) * 0.9;
    const x = p.x + Math.sin(a) * 1.6;
    const z = p.z + Math.cos(a) * 1.6;
    TeethFX.wolfRise(fx, { x, z }, i);
    k.raise(x, z, {
      packet: (m = 1) => c.makePacket(m * share),
      life,
      rate: c.num('attackRate', 1.0),
      range: c.num('range', 2.4),
      grow: (r) => ({
        damage: c.num('minionScale', 0.45) + c.num('minionScaleR', 0) * Math.max(0, r - 1),
        life: c.num('lifePct', 30) + c.num('lifePctR', 0) * Math.max(0, r - 1),
      }),
    });
  }
};

/** Blood Howl: heals you and the pack at once, and every hit drinks while it lasts. */
const bloodHowl: Handler = (k, c) => {
  c.player.beginAction(c.clip, c.castTime);
  k.buff();
  TeethFX.bloodHowl(k.effects, c.player.position);
};

/**
 * Ravening: down low and turning, the wolf tears into everything near: each
 * bite on its own snap of the gesture, at the next enemy within 3m not
 * bitten yet (a short step in when it is out of reach). Every bite that
 * lands feeds Pack Frenzy.
 */
const ravening: Handler = (k, c) => {
  const p = c.player;
  const reach = c.num('reach', 2.2);
  const crowd = c.num('crowd', 3);
  const bites = Math.max(1, Math.floor(c.num('bites', 5) + Math.floor(c.rank / Math.max(1, c.num('perRanks', 5)))));
  const total = stretched(c, bites, baseNum(c, 'bites', 5));
  p.beginAction(c.clip, total);
  const at = blowTimes(k, c, total, bites);
  const snapTime = getSkill('snap')?.params?.duration;
  const keep = typeof snapTime === 'number' ? snapTime : 6;
  const done = new Set<ShiftTarget>();
  let on: ShiftTarget | null = null;
  const fx = k.effects;
  for (let i = 0; i < bites; i++) {
    const turn: 1 | -1 = i % 2 === 0 ? 1 : -1;
    k.later(at[i]!, () => {
      const t = nextInCrowd(k, c, on, done, crowd, reach + 2);
      on = t;
      const bite = () => {
        const f = t && t.alive ? { x: t.root.position.x, z: t.root.position.z } : { x: c.target.x, z: c.target.z };
        const dir = toward(c, f);
        p.faceTowards(f.x, f.z);
        if (k.swing(dir, 1.1, reach, (m = 1) => c.makePacket(m), { most: 1, focus: f, now: true }) <= 0) return;
        if (t) done.add(t);
        frenzy(c, 1, keep);
        TeethFX.ravenBite(fx, f, dir, turn);
      };
      if (t) {
        const q = t.root.position;
        const gapTo = Math.hypot(q.x - p.position.x, q.z - p.position.z) - t.hitRadius;
        if (gapTo > reach * 0.8) {
          const dir = toward(c, q);
          const go = Math.min(gapTo - reach * 0.6, 1.6, k.wallStop(p.position, dir, 1.6, 0.4));
          if (go > 0.15) {
            p.shape.travel(p.position.clone().addScaledVector(dir, go), 0.08, 0.05, { id: p.actionId, land: bite });
            return;
          }
        }
      }
      bite();
    });
  }
};

/** Bloodmoon: Pack Frenzy goes full and stays full; more damage; every hit drinks deep. */
const bloodmoon: Handler = (k, c) => {
  c.player.beginAction(c.clip, c.castTime);
  k.buff();
  const dur = rk(c, 'duration', 10);
  frenzy(c, 99, dur);
  TeethFX.bloodmoon(k.effects, c.player.root, dur);
};

// ---------------------------------------------------------------------------
// Claw (the bear: everything in front of it, and the hide to take it back)
// ---------------------------------------------------------------------------

/** Which paw the next maul uses; the bear swings them in turn. */
let maulSide: 'L' | 'R' = 'R';

/** Maul: a wide swipe through everything in front. */
const maul: Handler = (k, c) => {
  const reach = c.num('reach', 2.9) * ursaReach(c);
  maulSide = maulSide === 'R' ? 'L' : 'R';
  c.player.beginAction(c.clip, c.attackTime, maulSide);
  ClawFX.maulStroke(k.effects, c.player.bones, maulSide, c.player.contactIn + 0.14);
  k.swing(c.dir, c.num('arc', 2.4), reach, (m = 1) => c.makePacket(m), { kind: 'heavy' });
  k.later(c.player.contactIn, () => ClawFX.maulGrit(k.effects, c.player.position, c.dir));
};

/** Rattling Roar: everything near flinches, and is Rattled (it hits softer). */
const rattlingRoar: Handler = (k, c) => {
  c.player.beginAction(c.clip, c.castTime);
  const radius = c.num('radius', 7);
  const p = c.player.position;
  // The rank's Rattled (`FOE_POWER.rattlingRoar`), with the curse passives in it.
  const rattled = k.statuses(false);
  const flinch = st('stunned', c.num('stun', 0.6));
  k.later(Math.min(0.2, c.castTime * 0.4), () => {
    for (const t of k.targets()) {
      if (!t.alive) continue;
      const q = t.root.position;
      if (Math.hypot(q.x - p.x, q.z - p.z) > radius) continue;
      t.applyStatuses([...rattled, flinch], c.ctx);
    }
    ClawFX.roar(k.effects, p, c.dir, radius);
  }, true);
};

/** Hammerfall: both paws up and down on the floor ahead, the same to the ring's edge. Knocks down what is near. */
const hammerfall: Handler = (k, c) => {
  const range = c.num('range', 3.5);
  const radius = c.num('radius', 3.2) * ursaReach(c);
  const p = c.player.position;
  const d = new THREE.Vector3(c.target.x - p.x, 0, c.target.z - p.z);
  const len = Math.min(range, d.length(), k.wallStop(p, c.dir, range, 0.3));
  const at = p.clone().addScaledVector(c.dir, Math.max(1.2, len)).setY(0);
  c.player.beginAction(c.clip, c.attackTime);
  k.later(c.player.contactIn, () => {
    k.area(at, radius, () => withStatus(c.makePacket(), st('knockedDown', c.num('knockdown', 0.8))), 'heavy', true);
    ClawFX.hammerfall(k.effects, at, c.dir, radius);
    c.hitAt(at);
  });
};

/** Bristle: spines up. Less damage taken, and melee attackers take a share of it back. */
const bristle: Handler = (k, c) => {
  c.player.beginAction(c.clip, c.castTime);
  k.buff();
  // The status's own reflect is the reference (30%); its magnitude scales it to this rank.
  const a = c.player.status.get('ss.bristle');
  if (a) a.magnitude = bristleReflect(Math.max(0, c.rank - 1), c.num) / 0.3;
  ClawFX.bristle(k.effects, c.player.root, rk(c, 'duration', 8));
};

/**
 * Overrun: a charge on all fours at a charge's speed (`travelTime`). Each
 * body in the lane is run down as the bear reaches it, once a charge, and
 * thrown off the side of the lane it stood on.
 */
const overrun: Handler = (k, c) => {
  const p = c.player;
  const range = c.num('range', 8);
  const half = (c.num('width', 1.8) * ursaReach(c)) / 2;
  const from = p.position.clone().setY(0);
  const dir = c.dir.clone();
  const dist = Math.max(0.5, Math.min(range, k.wallStop(from, dir, range, 0.5)));
  const lead = Math.min(0.12, c.attackTime * 0.3);
  const charge = travelTime(dist);
  const total = c.attackTime + charge;
  p.beginAction(c.clip, total);
  // The pumping run held over the charge, the wide finish after it.
  p.animator.play(c.clip, { fade: 0.05, span: total, restart: true, contact: lead + charge });
  c.lands = lead;
  const to = from.clone().addScaledVector(dir, dist);
  const toss = c.num('knockback', 3);
  const fx = k.effects;
  const packet = (): DamagePacket => {
    const pk = c.makePacket();
    // The throw is the knockback, not the blow's own shove.
    delete pk.knockback;
    return pk;
  };
  k.later(lead, () => {
    const pool = k.targets();
    const hit = new Set<ShiftTarget>();
    let heard = false;
    ClawFX.overrunRun(fx, p.bones, charge);
    p.steadyLeft = Math.max(p.steadyLeft, charge);
    p.shape.travel(to, charge, 0, {
      ease: -1,
      id: p.actionId,
      step: (at) => {
        const done = (at.x - from.x) * dir.x + (at.z - from.z) * dir.z;
        for (let i = 0; i < pool.length; i++) {
          const t = pool[i]!;
          if (!t.alive || hit.has(t)) continue;
          const q = t.root.position;
          const dx = q.x - from.x;
          const dz = q.z - from.z;
          const along = dx * dir.x + dz * dir.z;
          // Struck as the bear's head reaches it.
          if (along < -0.5 || along > done + 1 + t.hitRadius) continue;
          let sx = dx - dir.x * along;
          let sz = dz - dir.z * along;
          const off = Math.hypot(sx, sz);
          if (off > half + t.hitRadius) continue;
          hit.add(t);
          if (off < 0.05) {
            // Dead ahead: left and right in turn.
            const flip = hit.size % 2 ? 1 : -1;
            sx = -dir.z * flip;
            sz = dir.x * flip;
          } else {
            sx /= off;
            sz /= off;
          }
          if (!k.hit(t, packet, 'heavy', q.x - sx * 0.8 - dir.x * 0.5, q.z - sz * 0.8 - dir.z * 0.5)) continue;
          fling(k, t, sx + dir.x * 0.35, sz + dir.z * 0.35, toss, 0.3, 0.6);
          ClawFX.overrunToss(fx, q);
          if (!heard) {
            heard = true;
            c.hitAt(q);
          }
        }
      },
      land: () => ClawFX.overrunFurrow(fx, from, to),
    });
  });
};

/**
 * Reaping Swipe: a full turn with both paws out. The same to everything in
 * reach (the paws are the edge), more for every enemy it catches, and all
 * of it dragged in toward the bear.
 */
const reapingSwipe: Handler = (k, c) => {
  const radius = c.num('radius', 3.4) * ursaReach(c);
  c.player.beginAction(c.clip, c.attackTime);
  const start = Math.atan2(c.dir.x, c.dir.z);
  const pull = rk(c, 'pull', 1.2);
  k.later(Math.max(0, c.player.contactIn - 0.12), () => ClawFX.reap(k.effects, c.player.position.clone(), radius, 0.26, start));
  k.later(c.player.contactIn, () => {
    const at = c.player.position;
    const caught: ShiftTarget[] = [];
    for (const t of k.targets()) {
      const q = t.root.position;
      if (t.alive && Math.hypot(q.x - at.x, q.z - at.z) <= radius + t.hitRadius) caught.push(t);
    }
    const bonus = 1 + (c.num('perTarget', 8) * Math.min(caught.length, c.num('maxTargets', 5))) / 100;
    let any = false;
    for (const t of caught) {
      const q = t.root.position;
      const dx = q.x - at.x;
      const dz = q.z - at.z;
      const d = Math.hypot(dx, dz) || 1;
      // Struck from beyond it, so its flinch goes in with the drag.
      if (!k.hit(t, () => c.makePacket(bonus), 'heavy', q.x + dx / d, q.z + dz / d)) continue;
      any = true;
      const go = Math.min(pull, d - (1 + t.hitRadius));
      if (go > 0.1) fling(k, t, -dx, -dz, go, 0.2, 0);
    }
    if (any) c.hitAt(at);
  });
};

/** Bear Hug: one enemy held and crushed, each squeeze on its own squeeze of the gesture. A squeeze that lands heals you. */
const bearHug: Handler = (k, c) => {
  const p = c.player;
  const reach = c.num('reach', 2);
  const squeezes = Math.max(1, Math.floor(c.num('squeezes', 3)));
  const total = stretched(c, squeezes, baseNum(c, 'squeezes', 3));
  p.beginAction(c.clip, total);
  const at = blowTimes(k, c, total, squeezes);
  const t = prey(k, c, reach + 0.8);
  const focus = () => (t && t.alive ? { x: t.root.position.x, z: t.root.position.z } : { x: c.target.x, z: c.target.z });
  const hold = st('stunned', Math.max(c.num('stun', 2), at[squeezes - 1]! - at[0]! + 0.3));
  const heal = c.num('heal', 2) / 100;
  for (let i = 0; i < squeezes; i++) {
    k.later(at[i]!, () => {
      const f = focus();
      const n = k.swing(toward(c, f), 1.0, reach + 0.4, (m = 1) => (i === 0 ? withStatus(c.makePacket(m), hold) : c.makePacket(m)), { most: 1, focus: f, now: true });
      if (n <= 0) return;
      p.heal(p.stats.life * heal);
      ClawFX.hug(k.effects, f);
    });
  }
};

/** Ursa Major: the great bear of the old stories. Bigger, harder, wider swipes. */
const ursaMajor: Handler = (k, c) => {
  c.player.beginAction(c.clip, c.castTime);
  const kk = Math.max(0, c.rank - 1);
  const power = SHIFTER_SELF_POWER.ursaMajor!(kk, c.num);
  // A share of the bear's life as flat life, and that much more of it filled.
  // Flat life shows on the sheet times the hero's level power, so a recast
  // takes off what the last one shows, not its flat number (or it compounds).
  const mul = heroPower(c.player.character.level).life || 1;
  const given = c.player.status.get('ss.ursaMajor')?.mods?.life ?? 0;
  const life = Math.round(((c.player.stats.life - given * mul) * ursaLifePct(kk, c.num)) / 100 / mul);
  c.player.applyStatus('ss.ursaMajor', power.duration ?? 12, 1, 1, { mods: { ...(power.mods ?? {}), life } });
  ursaReaches.set(c.player, 1 + c.num('reach', 40) / 100);
  c.player.heal(Math.max(0, (life - given) * mul));
  ClawFX.ursa(k.effects, c.player.position, c.dir);
};

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const HANDLERS: Record<string, Handler> = {
  form,
  rake,
  pounce,
  slink,
  hamstring,
  throatTear,
  killingDance,
  nightHunt,
  snap,
  huntingHowl,
  lunge,
  worry,
  callThePack,
  bloodHowl,
  ravening,
  bloodmoon,
  maul,
  rattlingRoar,
  hammerfall,
  bristle,
  overrun,
  reapingSwipe,
  bearHug,
  ursaMajor,
};

/** Shapeshifter effect names that have a handler, for tools. */
export const SHIFT_EFFECTS: readonly string[] = Object.keys(HANDLERS).map((n) => `shift.${n}`);

/**
 * Why a skill cannot be used in the form the hero is in, or null when it can.
 * In a form only that beast's skills work, plus the three form skills: one
 * press changes straight from one beast to another, or stands you up from
 * your own. The basic attack never comes here. Checked before any mana is
 * spent. As a man, a tree skill still changes you first (`runShift`).
 */
export function formRefusal(def: SkillDef, player: Player): string | null {
  const form = player.shape?.form ?? null;
  if (!form || FORM_OF_TREE[def.treeId] === form || def.effect === 'shift.form') return null;
  const own = getSkill(FORM_SKILL[form])?.name ?? tr('your form skill');
  return tr('{0} cannot be used in {1} form. Change form, or press {2} to stand up.', def.name, form, own);
}

/**
 * What the hero swings, at the pace of the beast swinging it (`FORM_PACE`):
 * a Shapeshifter tree skill in its own beast (it always fights in it), the
 * basic attack (no `def`) in the form he is in. Anyone else's hands as they are.
 */
export function shiftHands(player: Player, hands: Hands, def?: SkillDef): Hands {
  return formHands(hands, def ? beastOfSkill(def) : (player.shape?.form ?? null));
}

/**
 * Night Hunt: Feral skills cost no mana while it lasts. Read where the cost
 * is taken (`SkillRunner.cast`), so the pool never needs the mana at all.
 */
export function shiftFree(def: SkillDef, player: Player): boolean {
  return def.treeId === 'feral' && def.id !== 'nightHunt' && !!def.effect?.startsWith('shift.') && player.status.has('ss.nightHunt');
}

/** What each beast's basic attack sounds like in the air (its blows land as flesh, `hit.flesh`). */
const BEAST_WHOOSH: Readonly<Record<BeastForm, string>> = { cat: 'swing.light', wolf: 'monster.beast.attack', bear: 'swing.heavy' };

/** The sound of a beast's swing, for the form the hero is in. */
export function beastWhoosh(player: Player): string {
  const f = player.shape?.form;
  return f ? BEAST_WHOOSH[f] : 'swing.fist';
}

/** Each beast's basic attack: its arc (radians) and reach (metres). The bear's is wide and long. */
const FORM_SWING: Readonly<Record<BeastForm, { arc: number; reach: number }>> = {
  cat: { arc: 1.5, reach: 2.4 },
  wolf: { arc: 1.5, reach: 2.4 },
  bear: { arc: 2.0, reach: 2.7 },
};

/** The basic attack's arc and reach in the form the hero is in; null as a man. */
export function formSwing(player: Player): { arc: number; reach: number } | null {
  const f = player.shape?.form;
  return f ? FORM_SWING[f] : null;
}

/** Where a beast's blow lands on a body: blood and the beast's own hair. */
export function clawHit(fx: EffectSystem, player: Player, at: { x: number; z: number }, dir: THREE.Vector3, crit: boolean): void {
  beastImpact(fx, player.shape?.form ?? 'wolf', at, dir, crit);
}

/**
 * Many Mouths: you and your wolves deal more for each wolf standing (up to
 * its `most`). Kept on as a short status, refreshed twice a second from the
 * runner's tick with the wolves it counts (`SkillRunner.update`), so it shows
 * on the sheet and the wolves' bites (rolled from your sheet) carry it.
 */
export function tickShiftPack(player: Player, wolves: number): void {
  const pct = player.passives?.manyMouthsPct ?? 0;
  const s = player.status;
  const had = s.get('ss.manyMouths');
  const most = getSkill('manyMouths')?.params?.most;
  const want = pct > 0 ? Math.round(pct * Math.min(wolves, typeof most === 'number' ? most : 3) * 10) / 10 : 0;
  if (want <= 0) {
    if (had) {
      s.remove('ss.manyMouths');
      player.refreshStats();
    }
    return;
  }
  if (had && had.mods?.enhancedDamage === want) {
    had.remaining = Math.max(had.remaining, 1.2);
    return;
  }
  player.applyStatus('ss.manyMouths', 1.2, 1, 1, { mods: { enhancedDamage: want } });
}

/** Runs one Shapeshifter skill. Returns false for an effect with no handler. */
export function runShift(k: ShiftKit, c: ShiftCast): boolean {
  const sub = (c.def.effect ?? '').split('.')[1] ?? '';
  const h = HANDLERS[sub];
  if (!h) return false;
  // Every tree skill is fought in its tree's form: out of it, change first.
  const want = FORM_OF_TREE[c.def.treeId];
  if (sub !== 'form' && want && c.player.shape.form !== want) change(k, c.player, c.dir, want, true);
  let cast = c;
  // Slink: the next Feral skill that strikes is an ambush (more damage, and
  // a sure critical strike), and the slink ends. Slink itself, Night Hunt
  // and the cat's own change strike nothing and leave it be.
  const s = c.player.status;
  if (c.def.treeId === 'feral' && c.def.targeting !== 'self' && s.has('ss.slink')) {
    const p = getSkill('slink')?.params ?? {};
    const sr = Math.max(1, rankOf(c, 'slink'));
    const base = typeof p.ambush === 'number' ? p.ambush : 60;
    const step = typeof p.ambushR === 'number' ? p.ambushR : 8;
    const amb = 1 + (base + step * (sr - 1)) / 100;
    const make = c.makePacket;
    const player = c.player;
    cast = {
      ...c,
      makePacket: (m = 1) => {
        const pk = make(m * amb);
        if (!pk.crit) {
          pk.crit = true;
          pk.amount *= Math.max(100, player.stats.critDamage) / 100;
        }
        return pk;
      },
    };
    s.remove('ss.slink');
    c.player.refreshStats();
  }
  h(k, cast);
  // The ambush ran on a copy; what it set goes back to the cast.
  c.lands = cast.lands;
  return true;
}
