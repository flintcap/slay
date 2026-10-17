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
import type { Player } from '../entities/Player';
import type { CombatContext, Enemy } from '../entities/Enemy';
import type { Boss } from '../entities/Boss';
import type { EffectSystem } from '../fx/Effects';
import type { HitKind } from '../fx/CombatFeel';
import type { BeastForm } from '../art/hero/forms/BeastBody';
import { FORM_OF_TREE, FORM_SKILL } from '../entities/Shapeshift';
import { ClawFX, FeralFX, TeethFX, formChange } from '../fx/shifter/ShifterFX';
import { SHIFTER_SELF_POWER, bristleReflect, ursaLifePct } from '../data/shifterPower';
import { getSkill } from '../data/skills';
import { effectiveSkillRank } from '../sim/Character';
import { heroPower } from '../sim/HeroPower';
import { audio } from '../audio/Audio';
import { skillSound } from '../audio/SkillSounds';
import '../data/shifterStatuses';

export type ShiftTarget = Enemy | Boss;

/** The monster each Shapeshifter summon wears (`SkillRunner.MINION_MONSTER`). */
export const SHIFTER_MINIONS: Readonly<Record<string, string>> = { callThePack: 'gorge_wolf' };

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
  /** Puts this skill's buff on at its rank (`SELF_POWER`), with its heal if it has one. */
  buff(): void;
  /** Raises one of this skill's creatures at (x, z): it bites with `packet` and has `life`. */
  raise(x: number, z: number, o: { packet: (m?: number) => DamagePacket; life: number; rate: number; range: number }): void;
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
  /** Seconds a basic attack takes at the hero's speed. */
  attackTime: number;
  castTime: number;
  makePacket: (mult?: number) => DamagePacket;
  num: (k: string, d: number) => number;
  /** Plays the skill's hit sound at a point. */
  hitAt: (p: { x: number; z: number }) => void;
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

/** How much further a bear's swipes reach under Ursa Major (1 without it). */
function ursaReach(c: ShiftCast): number {
  if (!c.player.status.has('ss.ursaMajor')) return 1;
  const v = getSkill('ursaMajor')?.params?.reach;
  return 1 + (typeof v === 'number' ? v : 40) / 100;
}

/** A rank of another skill the hero holds, with +skills (0 if unlearned). */
function rankOf(c: ShiftCast, id: string): number {
  const ch = c.player.character;
  return ch.skills[id] ? effectiveSkillRank(ch, id, c.player.stats) : 0;
}

const st = (id: string, duration: number, stacks = 1, magnitude = 1): StatusApplication => ({ id, duration, magnitude, stacks });

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
// Feral (the black cat: one enemy, fast)
// ---------------------------------------------------------------------------

/**
 * Rake: three quick swipes at the one enemy you aimed at, paws turn about.
 * The third opens it up and leaves it Bleeding.
 */
const rake: Handler = (k, c) => {
  const hits = Math.max(1, Math.floor(c.num('hits', 3)));
  const reach = c.num('reach', 2.4);
  const time = c.attackTime * 1.25;
  c.player.beginAction(c.clip, time);
  const focus = { x: c.target.x, z: c.target.z };
  const facing = c.dir.clone();
  const bleed = st('bleeding', c.num('duration', 4));
  const fx = k.effects;
  const bones = c.player.bones;
  const first = c.player.contactIn;
  const gap = Math.min(0.11, (time * 0.7) / hits);
  const blow = (i: number) => {
    const side = i % 2 === 0 ? 'R' : 'L';
    FeralFX.rakeStroke(fx, bones, side, 0.12);
    const packet = (m = 1): DamagePacket => {
      const p = c.makePacket(m);
      return i === hits - 1 ? withStatus(p, bleed) : p;
    };
    k.swing(facing, 1.4, reach, packet, { most: 1, focus, now: i > 0 });
    const t = prey(k, c, reach + 0.6);
    if (t) FeralFX.rakeHit(fx, t.root.position, facing, side);
  };
  k.later(Math.max(0, first - 0.08), () => FeralFX.rakeStroke(fx, bones, 'R', 0.12));
  k.swing(facing, 1.4, reach, (m = 1) => (hits === 1 ? withStatus(c.makePacket(m), bleed) : c.makePacket(m)), { most: 1, focus });
  k.later(first, () => {
    const t = prey(k, c, reach + 0.6);
    if (t) FeralFX.rakeHit(fx, t.root.position, facing, 'R');
  });
  for (let i = 1; i < hits; i++) k.later(first + gap * i, () => blow(i));
};

/**
 * Pounce: a leap of up to 9m in an arc onto one enemy, claws first. Lands
 * with the blow and a short stun.
 */
const pounce: Handler = (k, c) => {
  const range = c.num('range', 9);
  const t = prey(k, c, range);
  const aim = t ? flat(t.root.position) : flat(c.target);
  const dir = toward(c, aim);
  const want = Math.max(0, Math.hypot(aim.x - c.player.position.x, aim.z - c.player.position.z) - (t ? 0.9 : 0));
  const dist = Math.min(want, range, k.wallStop(c.player.position, dir, range, 0.4));
  const time = 0.22 + dist * 0.03;
  c.player.beginAction(c.clip, time + 0.3);
  const fx = k.effects;
  FeralFX.pounceLeap(fx, c.player.bones, time);
  const to = c.player.position.clone().addScaledVector(dir, dist);
  c.player.shape.travel(to, time, 0.6 + dist * 0.08, {
    ease: 1,
    land: () => {
      if (!c.player.alive) return;
      const focus = t ? { x: t.root.position.x, z: t.root.position.z } : { x: to.x + dir.x, z: to.z + dir.z };
      k.swing(dir, 1.8, c.num('reach', 1.8) + 0.4, (m = 1) => withStatus(c.makePacket(m), st('stunned', c.num('stun', 0.8))), { most: 1, focus, now: true });
      FeralFX.pounceLand(fx, focus, dir);
      c.hitAt(focus);
    },
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
  c.player.beginAction(c.clip, c.attackTime * 1.15);
  const t = prey(k, c, reach + 1);
  const focus = t ? { x: t.root.position.x, z: t.root.position.z } : { x: c.target.x, z: c.target.z };
  const dur = c.num('duration', 4);
  FeralFX.hamstringStroke(k.effects, c.player.bones, c.player.contactIn + 0.12);
  k.swing(c.dir, 1.2, reach, (m = 1) => withStatus(c.makePacket(m), st('crippled', dur), st('bleeding', dur, Math.max(1, Math.floor(c.num('bleed', 2))))), { most: 1, focus });
  k.later(c.player.contactIn, () => FeralFX.hamstringHit(k.effects, focus, c.dir));
};

/**
 * Throat Tear: the jaws on one throat. A wounded enemy (under the execute
 * line) takes far more and is left with a Hemorrhage.
 */
const throatTear: Handler = (k, c) => {
  const reach = c.num('reach', 2);
  c.player.beginAction(c.clip, c.attackTime * 1.3);
  const t = prey(k, c, reach + 1);
  const focus = t ? { x: t.root.position.x, z: t.root.position.z } : { x: c.target.x, z: c.target.z };
  const dir = toward(c, focus);
  const line = c.num('execute', 30) / 100;
  // Read at the bite, not the cast: a target that dropped under the line on the way in still counts.
  const exec = () => !!t && t.alive && t.lifeFraction <= line;
  k.swing(dir, 1.1, reach + 0.3, (m = 1) => {
    if (!exec()) return c.makePacket(m);
    return withStatus(c.makePacket(m * c.num('executeMult', 2.5)), st('hemorrhage', c.num('duration', 5)));
  }, { most: 1, focus });
  const executing = exec();
  k.later(c.player.contactIn, () => FeralFX.throatTear(k.effects, focus, dir, executing));
};

/**
 * Killing Dance: the cat circles one enemy, striking from a new side each
 * time, faster and faster. Leaves a shadow where it was.
 */
const killingDance: Handler = (k, c) => {
  const reach = c.num('reach', 2.4);
  const t = prey(k, c, reach + 2);
  const hits = Math.max(1, Math.floor(c.num('hits', 6) + Math.floor(c.rank / Math.max(1, c.num('perRanks', 5)))));
  const ring = c.num('radius', 1.5);
  const gaps: number[] = [];
  let gap = Math.max(0.09, c.attackTime * 0.5);
  let total = c.player.contactIn;
  for (let i = 0; i < hits; i++) {
    gaps.push(total);
    total += gap;
    gap = Math.max(0.06, gap * 0.86);
  }
  c.player.beginAction(c.clip, total + 0.2);
  const fx = k.effects;
  const bones = c.player.bones;
  const centre = () => (t && t.alive ? flat(t.root.position) : flat(c.target));
  const start = Math.atan2(c.player.position.x - centre().x, c.player.position.z - centre().z);
  for (let i = 0; i < hits; i++) {
    k.later(gaps[i]!, () => {
      const m = centre();
      // Round the target, a little over a third of the circle a step.
      const a = start + i * 2.3;
      const out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const r = Math.min(ring, k.wallStop(m, out, ring, 0.35));
      FeralFX.dancePoint(fx, c.player.position.clone());
      const side = i % 2 === 0 ? 'R' : 'L';
      FeralFX.danceStroke(fx, bones, side, 0.1);
      const to = m.clone().addScaledVector(out, r);
      c.player.shape.travel(to, 0.05, 0.1, {
        land: () => {
          c.player.faceTowards(m.x, m.z);
          const dir = toward(c, m);
          k.swing(dir, 1.4, reach, (q = 1) => c.makePacket(q), { most: 1, focus: { x: m.x, z: m.z }, now: true });
        },
      });
    });
  }
};

/** Night Hunt: the dark runs with you. Feral skills cost nothing while it lasts (`runShift`). */
const nightHunt: Handler = (k, c) => {
  c.player.beginAction(c.clip, c.castTime * 1.2);
  k.buff();
  FeralFX.nightHunt(k.effects, c.player.root, rk(c, 'duration', 8));
};

// ---------------------------------------------------------------------------
// Teeth (the grey wolf: bite, and feed the pack's frenzy)
// ---------------------------------------------------------------------------

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
  c.player.beginAction(c.clip, c.attackTime * 0.85);
  const t = prey(k, c, reach + 0.8);
  const focus = t ? { x: t.root.position.x, z: t.root.position.z } : { x: c.target.x, z: c.target.z };
  const dir = toward(c, focus);
  k.swing(dir, 1.0, reach, (m = 1) => c.makePacket(m), { most: 1, focus });
  k.later(c.player.contactIn, () => TeethFX.snap(k.effects, focus, dir));
  frenzy(c, 1, c.num('duration', 6));
};

/** Hunting Howl: the hunt is called. More damage, a surer bite. */
const huntingHowl: Handler = (k, c) => {
  c.player.beginAction(c.clip, c.castTime * 1.6);
  k.buff();
  TeethFX.howl(k.effects, c.player.position, c.num('radius', 10));
};

/** Lunge: a straight rush, bite at the end, and the thing bitten thrown back. */
const lunge: Handler = (k, c) => {
  const range = c.num('range', 8);
  const t = prey(k, c, range);
  const aim = t ? flat(t.root.position) : flat(c.target);
  const dir = toward(c, aim);
  const want = Math.hypot(aim.x - c.player.position.x, aim.z - c.player.position.z) - (t ? 0.8 : 0);
  const dist = Math.max(0, Math.min(want, range, k.wallStop(c.player.position, dir, range, 0.45)));
  const time = 0.1 + dist / 24;
  c.player.beginAction(c.clip, time + 0.25);
  TeethFX.lungeRun(k.effects, c.player.bones, time);
  const to = c.player.position.clone().addScaledVector(dir, dist);
  c.player.shape.travel(to, time, 0.12, {
    ease: -1,
    land: () => {
      if (!c.player.alive) return;
      const focus = t ? { x: t.root.position.x, z: t.root.position.z } : { x: to.x + dir.x, z: to.z + dir.z };
      k.swing(dir, 1.1, c.num('reach', 2) + 0.3, (m = 1) => {
        const p = c.makePacket(m);
        p.knockback = Math.max(p.knockback ?? 0, c.num('knockback', 1.5));
        return p;
      }, { most: 1, focus, now: true });
      TeethFX.lungeBite(k.effects, focus, dir);
    },
  });
};

/** Worry: clamp on, hold it, shake it side to side, throw it away. */
const worry: Handler = (k, c) => {
  const reach = c.num('reach', 2);
  const shakes = Math.max(1, Math.floor(c.num('shakes', 4)));
  const t = prey(k, c, reach + 0.8);
  const focus = () => (t && t.alive ? { x: t.root.position.x, z: t.root.position.z } : { x: c.target.x, z: c.target.z });
  const gap = 0.17;
  c.player.beginAction(c.clip, c.player.contactIn + gap * shakes + 0.15);
  const hold = st('stunned', c.num('stun', 1.2));
  for (let i = 0; i < shakes; i++) {
    const last = i === shakes - 1;
    const beat = () => {
      const f = focus();
      const dir = toward(c, f);
      k.swing(dir, 1.0, reach + 0.4, (m = 1) => {
        const p = c.makePacket(m);
        if (i === 0) withStatus(p, hold);
        if (last) p.knockback = Math.max(p.knockback ?? 0, c.num('knockback', 2.5));
        return p;
      }, { most: 1, focus: f, now: i > 0 });
      TeethFX.worryShake(k.effects, f, dir, i % 2 === 0 ? 1 : -1);
    };
    if (i === 0) {
      beat();
    } else {
      k.later(c.player.contactIn + gap * i, beat);
    }
  }
};

/** Call the Pack: grey wolves out of the fog to fight beside you. */
const callThePack: Handler = (k, c) => {
  c.player.beginAction(c.clip, c.castTime * 1.4);
  const count = Math.max(1, Math.floor(c.num('count', 2) + Math.floor(c.rank / Math.max(1, c.num('perRanks', 6)))));
  // At the limit a cast still does something: the oldest wolf goes back to the dark.
  let room = count - k.pack();
  if (room <= 0) {
    k.trim(count - 1);
    room = 1;
  }
  const share = rk(c, 'minionScale', 0.45);
  const life = Math.max(20, (c.player.stats.life * rk(c, 'lifePct', 30)) / 100);
  const p = c.player.position;
  TeethFX.callFog(k.effects, p);
  for (let i = 0; i < room; i++) {
    const a = Math.atan2(c.dir.x, c.dir.z) + Math.PI + (i - (room - 1) / 2) * 0.9;
    k.raise(p.x + Math.sin(a) * 1.6, p.z + Math.cos(a) * 1.6, {
      packet: (m = 1) => c.makePacket(m * share),
      life,
      rate: c.num('attackRate', 1.0),
      range: c.num('range', 2.4),
    });
  }
};

/** Blood Howl: heals you and the pack at once, and every hit drinks while it lasts. */
const bloodHowl: Handler = (k, c) => {
  c.player.beginAction(c.clip, c.castTime * 1.5);
  k.buff();
  TeethFX.bloodHowl(k.effects, c.player.position);
};

/** Go for the Throat: drop low and spring at the throat. Hemorrhage, and Weakened. */
const goForTheThroat: Handler = (k, c) => {
  const range = c.num('range', 4);
  const t = prey(k, c, range + 0.5);
  const aim = t ? flat(t.root.position) : flat(c.target);
  const dir = toward(c, aim);
  const want = Math.hypot(aim.x - c.player.position.x, aim.z - c.player.position.z) - (t ? 0.8 : 0);
  const dist = Math.max(0, Math.min(want, range, k.wallStop(c.player.position, dir, range, 0.4)));
  // A crouch first, then the spring.
  const crouch = 0.14;
  const time = 0.16 + dist * 0.035;
  c.player.beginAction(c.clip, crouch + time + 0.3);
  const fx = k.effects;
  const to = c.player.position.clone().addScaledVector(dir, dist);
  k.later(crouch, () => {
    TeethFX.throatSpring(fx, c.player.bones, time);
    c.player.shape.travel(to, time, 0.9, {
      ease: 1,
      land: () => {
        if (!c.player.alive) return;
        const focus = t ? { x: t.root.position.x, z: t.root.position.z } : { x: to.x + dir.x, z: to.z + dir.z };
        k.swing(dir, 1.0, 1.9, (m = 1) => withStatus(c.makePacket(m), st('hemorrhage', c.num('duration', 6)), st('weakened', c.num('weaken', 4))), { most: 1, focus, now: true });
        TeethFX.throatHit(fx, focus, dir);
        c.hitAt(focus);
      },
    });
  }, true);
};

/** Bloodmoon: Pack Frenzy goes full and stays full; more damage; every hit drinks deep. */
const bloodmoon: Handler = (k, c) => {
  c.player.beginAction(c.clip, c.castTime * 1.6);
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
  c.player.beginAction(c.clip, c.attackTime * 1.3, maulSide);
  ClawFX.maulStroke(k.effects, c.player.bones, maulSide, c.player.contactIn + 0.14);
  k.swing(c.dir, c.num('arc', 2.4), reach, (m = 1) => c.makePacket(m), { kind: 'heavy' });
  k.later(c.player.contactIn, () => ClawFX.maulGrit(k.effects, c.player.position, c.dir));
};

/** Rattling Roar: everything near flinches, and is Rattled (it hits softer). */
const rattlingRoar: Handler = (k, c) => {
  c.player.beginAction(c.clip, c.castTime * 1.5);
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

/** Hammerfall: both paws up and down on the floor ahead. Knocks down what is near. */
const hammerfall: Handler = (k, c) => {
  const range = c.num('range', 3.5);
  const radius = c.num('radius', 3.2) * ursaReach(c);
  const p = c.player.position;
  const d = new THREE.Vector3(c.target.x - p.x, 0, c.target.z - p.z);
  const len = Math.min(range, d.length(), k.wallStop(p, c.dir, range, 0.3));
  const at = p.clone().addScaledVector(c.dir, Math.max(1.2, len)).setY(0);
  c.player.beginAction(c.clip, c.attackTime * 1.7);
  k.later(c.player.contactIn, () => {
    k.area(at, radius, () => withStatus(c.makePacket(), st('knockedDown', c.num('knockdown', 0.8))), 'heavy');
    ClawFX.hammerfall(k.effects, at, c.dir, radius);
    c.hitAt(at);
  });
};

/** Bristle: spines up. Less damage taken, and melee attackers take a share of it back. */
const bristle: Handler = (k, c) => {
  c.player.beginAction(c.clip, c.castTime * 1.2);
  k.buff();
  // The status's own reflect is the reference (30%); its magnitude scales it to this rank.
  const a = c.player.status.get('ss.bristle');
  if (a) a.magnitude = bristleReflect(Math.max(0, c.rank - 1), c.num) / 0.3;
  ClawFX.bristle(k.effects, c.player.root, rk(c, 'duration', 8));
};

/** Overrun: a charge on all fours, everything in the way run down and thrown aside. */
const overrun: Handler = (k, c) => {
  const range = c.num('range', 8);
  const width = c.num('width', 1.8) * ursaReach(c);
  const from = c.player.position.clone().setY(0);
  const dir = c.dir.clone();
  const dist = Math.max(0.5, Math.min(range, k.wallStop(from, dir, range, 0.5)));
  const time = 0.12 + dist / 15;
  c.player.beginAction(c.clip, time + 0.3);
  ClawFX.overrunRun(k.effects, c.player.bones, time);
  const to = from.clone().addScaledVector(dir, dist);
  const seg = 2;
  let done = 0;
  const hit = (upTo: number) => {
    while (done + 1e-3 < upTo) {
      const a = done;
      const b = Math.min(upTo, done + seg);
      const o = from.clone().addScaledVector(dir, a);
      k.line(o, dir, b - a, width, () => {
        const p = c.makePacket();
        p.knockback = Math.max(p.knockback ?? 0, c.num('knockback', 3));
        return p;
      }, 'heavy');
      ClawFX.overrunToss(k.effects, from.clone().addScaledVector(dir, b));
      done = b;
    }
  };
  c.player.shape.travel(to, time, 0, {
    ease: -1,
    step: (_at, u) => {
      // Hits land as the bear gets there, a stride at a time.
      if (u * dist - done >= seg) hit(Math.floor((u * dist) / seg) * seg);
    },
    land: () => {
      hit(dist);
      c.hitAt(to);
      ClawFX.overrunFurrow(k.effects, from, to);
    },
  });
};

/** Reaping Swipe: a full turn with both paws out. More for every enemy it catches. */
const reapingSwipe: Handler = (k, c) => {
  const radius = c.num('radius', 3.4) * ursaReach(c);
  const time = c.attackTime * 1.6;
  c.player.beginAction(c.clip, time);
  const start = Math.atan2(c.dir.x, c.dir.z);
  k.later(Math.max(0, c.player.contactIn - 0.12), () => ClawFX.reap(k.effects, c.player.position.clone(), radius, 0.26, start));
  k.later(c.player.contactIn, () => {
    const at = c.player.position.clone().setY(0);
    let n = 0;
    for (const t of k.targets()) if (t.alive && t.root.position.distanceTo(at) <= radius) n++;
    const bonus = 1 + (c.num('perTarget', 8) * Math.min(n, c.num('maxTargets', 5))) / 100;
    k.area(at, radius, () => c.makePacket(bonus), 'heavy');
    if (n > 0) c.hitAt(at);
  });
};

/** Bear Hug: one enemy held and crushed. Each squeeze heals you. */
const bearHug: Handler = (k, c) => {
  const reach = c.num('reach', 2);
  const squeezes = Math.max(1, Math.floor(c.num('squeezes', 3)));
  const t = prey(k, c, reach + 0.8);
  const focus = () => (t && t.alive ? { x: t.root.position.x, z: t.root.position.z } : { x: c.target.x, z: c.target.z });
  const gap = 0.32;
  c.player.beginAction(c.clip, c.player.contactIn + gap * squeezes + 0.2);
  const hold = st('stunned', c.num('stun', 2));
  const heal = c.num('heal', 2) / 100;
  for (let i = 0; i < squeezes; i++) {
    const beat = () => {
      const f = focus();
      k.swing(toward(c, f), 1.0, reach + 0.4, (m = 1) => (i === 0 ? withStatus(c.makePacket(m), hold) : c.makePacket(m)), { most: 1, focus: f, now: i > 0 });
      if (t && t.alive) c.player.heal(c.player.stats.life * heal);
      ClawFX.hug(k.effects, f);
    };
    if (i === 0) beat();
    else k.later(c.player.contactIn + gap * i, beat);
  }
};

/** Ursa Major: the great bear of the old stories. Bigger, harder, wider swipes. */
const ursaMajor: Handler = (k, c) => {
  c.player.beginAction(c.clip, c.castTime * 1.8);
  const kk = Math.max(0, c.rank - 1);
  const power = SHIFTER_SELF_POWER.ursaMajor!(kk, c.num);
  // A share of the bear's life as flat life, and that much more of it filled.
  // Flat life shows on the sheet times the hero's level power, so a recast
  // takes off what the last one shows, not its flat number (or it compounds).
  const mul = heroPower(c.player.character.level).life || 1;
  const given = c.player.status.get('ss.ursaMajor')?.mods?.life ?? 0;
  const life = Math.round(((c.player.stats.life - given * mul) * ursaLifePct(kk, c.num)) / 100 / mul);
  c.player.applyStatus('ss.ursaMajor', power.duration ?? 12, 1, 1, { mods: { ...(power.mods ?? {}), life } });
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
  goForTheThroat,
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
  const own = getSkill(FORM_SKILL[form])?.name ?? 'your form skill';
  return `${def.name} cannot be used in ${form} form. Change form, or press ${own} to stand up.`;
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
  if (c.def.treeId === 'feral' && sub !== 'form') {
    const s = c.player.status;
    // Night Hunt: Feral skills cost nothing while it lasts.
    if (sub !== 'nightHunt' && s.has('ss.nightHunt')) {
      const cost = c.def.manaCost ? c.def.manaCost(c.rank) : 0;
      c.player.mana = Math.min(c.player.stats.mana, c.player.mana + cost);
    }
    // Slink: the next Feral skill is an ambush, and the slink ends.
    if (sub !== 'slink' && s.has('ss.slink')) {
      const slinkDef = getSkill('slink');
      const sr = Math.max(1, rankOf(c, 'slink'));
      const p = slinkDef?.params ?? {};
      const base = typeof p.ambush === 'number' ? p.ambush : 60;
      const step = typeof p.ambushR === 'number' ? p.ambushR : 16;
      const amb = 1 + (base + step * (sr - 1)) / 100;
      const make = c.makePacket;
      cast = { ...c, makePacket: (m = 1) => make(m * amb) };
      s.remove('ss.slink');
      c.player.refreshStats();
    }
  }
  h(k, cast);
  return true;
}
