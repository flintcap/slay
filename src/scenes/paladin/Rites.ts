/**
 * SLAY — the Paladin's weapon skills: the `rite` handler family.
 *
 * Nearly every Mace and Blade skill is about ONE enemy: the one under the
 * cursor, or the nearest one in front of him when the cursor is on the
 * floor. Riders (a short shove, a stagger, a dent in the armour) ride on
 * that one blow. Two reach a crowd in their own tree's way: Pilgrim's Maul
 * breaks the floor round its target, Crosswise opens with a wide sweep.
 *
 * `SkillRunner.cast` hands a skill whose effect family is `rite` to
 * `castRite`, with a small host that lands blows through the runner's own
 * pipeline (passives, hit feel, kill credit), so a Paladin blow is tuned,
 * felt and counted like any other. Crushing Weight and Red Rosary live in
 * that tuning, so they count on every hit he lands, not just a rite's.
 *
 * Timing follows skillcore (`sim/Speed.ts`): a blow lands on its gesture's
 * contact, a flurry's later cuts on the gesture's own cuts (they follow the
 * hero's speed), and a rush or a step covers its ground at a running or
 * stepping speed (`travelTime`), with the blow on arrival. A dodge or a new
 * action stops whatever has not landed yet.
 *
 * What each skill does lives in `RITES`, keyed by skill id; what each blow
 * leaves on the enemy and the floor is `fx/paladin/RiteLooks.ts`.
 */
import * as THREE from 'three';
import type { DamagePacket, ItemCategory, SkillDef, StatusApplication } from '../../types';
import type { CombatContext, Enemy } from '../../entities/Enemy';
import type { Boss } from '../../entities/Boss';
import type { Player } from '../../entities/Player';
import type { HitKind } from '../../fx/CombatFeel';
import type { EffectSystem, School } from '../../fx/Effects';
import type { BurstOpts } from '../../fx/Particles';
import { getBase } from '../../sim/Loot';
import { RUSH_SPEED, ownAttackShare, travelTime } from '../../sim/Speed';
import { skillAction } from '../../art/hero/SkillActions';
import { SELF_POWER } from '../../data/skillPower';
import { paladinFX, riteLook, type RiteMark } from '../../fx/paladin/RiteLooks';
import { skillSound } from '../../audio/SkillSounds';
import { tr } from '../../core/I18n';
import { addBonus } from '../../sim/Combat';

type Target = Enemy | Boss;

/** What the runner lends a rite. */
export interface RiteHost {
  readonly effects: EffectSystem;
  /** Lands one tuned blow on one target. Returns the packet that landed (amount 0 on a miss). */
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
  /** Runs `fn` on the release frame of the action the hero is playing (`SkillRunner.atRelease`). */
  atRelease(player: Player, fn: () => void): void;
  /** Real seconds after a gesture's first blow at which its later cuts land; null without cuts. */
  cutTimes(skillId: string, span: number, first: number): number[] | null;
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
  /** Seconds one use takes at the hero's attack speed (the skill's own `attackTime` swings, `sim/Speed.ts`). */
  attackTime: number;
  hitSound: string | null;
}

/** Which weapon a skill wants in hand. `any` is the censer, which hangs off the belt. */
type Grip = 'blunt' | 'blade' | 'shield' | 'any';

const BLUNT: ItemCategory[] = ['mace', 'scepter'];
const BLADE: ItemCategory[] = ['sword'];

/** How the hero reaches the target before the blow: a shield rush, a lunge, a step to its side or round behind it. */
type Move = 'rush' | 'lunge' | 'flank' | 'behind';

/** The action one press is playing: its id, its length, its first blow, its clip and the blow's reach. */
interface Swing {
  id: number;
  span: number;
  first: number;
  clip: string;
  reach: number;
}

interface Rite {
  grip: Grip;
  /** The body clip when the skill has no gesture of its own. */
  clip: string;
  kind: HitKind;
  /** How far the blow reaches from the hero, before the target's body. */
  reach: number;
  /** Ground covered before the blow (the range of a rush or lunge is the skill's `range`). */
  move?: Move;
  /** Needs no target: it is something he does to himself. */
  self?: boolean;
  /** What happens at the contact frame, on the chosen target (null when it whiffs). */
  land(r: RiteCast, host: RiteHost, t: Target | null, s: Swing): void;
}

/** Metres a second: a shield rush at a run, a fencer's lunge, a quick step. */
const MOVE_SPEED: Record<Move, number> = { rush: RUSH_SPEED, lunge: 12, flank: 10, behind: 10 };
/** Seconds between arriving and the blow. */
const ARRIVE_BEAT = 0.05;
/** The share of the skill's own use that follows the blow after a move. */
const FOLLOW = 0.65;
/** The most of a moving action that comes before its blow, so a move order cannot cut the run short. */
const LAND_SHARE = 0.5;
/** Metres past its reach a target may have stepped and still be struck. */
const SLACK = 0.6;
/** Turn the Blade's answer, in swings of the hero's own weapon. */
const ANSWER_SWINGS = 0.8;
/** The bell's own toll, heard on a Toll (The Last Bell). */
const TOLL_SOUND = skillSound('tollingBell').hit;

const ASH_BURST: BurstOpts = { count: 16, scale: 1.2, color: 0x6a625a };
const COAL_BURST: BurstOpts = { count: 14, scale: 1, color: 0xff8a30 };

const dirV = new THREE.Vector3();
const legDir = new THREE.Vector3();
const legA = new THREE.Vector3();
const legB = new THREE.Vector3();
const aheadV = new THREE.Vector3();
const hurlFrom = new THREE.Vector3();
const hurlTo = new THREE.Vector3();

/** A status application. */
function status(id: string, duration: number, stacks = 1, magnitude = 1): StatusApplication {
  return { id, duration, magnitude, stacks };
}

/** A number that grows with rank: `key` at rank 1, plus `key + 'PerRank'` each rank after. */
function ranked(r: RiteCast, key: string, base: number, perRank: number): number {
  return r.num(key, base) + r.num(`${key}PerRank`, perRank) * Math.max(0, r.rank - 1);
}

/** Metres from the hero to the target's body. */
function gapTo(p: Player, t: Target): number {
  return Math.hypot(t.root.position.x - p.position.x, t.root.position.z - p.position.z) - t.hitRadius;
}

/** True while `t` lives and stands within `reach` of the hero (and a little). */
function stillThere(p: Player, t: Target, reach: number): boolean {
  return t.life > 0 && gapTo(p, t) <= reach + SLACK;
}

/** Draws what a blow leaves on `t`, seen from where the hero stands. */
function look(r: RiteCast, host: RiteHost, mark: RiteMark, t: Target, k = 0): void {
  riteLook(host.effects, mark, r.player.position.x, r.player.position.z, t.root.position.x, t.root.position.z, k);
}

// --- one blow -----------------------------------------------------------------

/** Mace blows landed since the last Toll (The Last Bell), per hero. */
const tolls = new WeakMap<Player, number>();

interface Blow {
  /** Times the skill's damage. */
  mult?: number;
  riders?: StatusApplication[];
  kind?: HitKind;
  knockback?: number;
  /** Opened stacks the blow leaves. */
  opens?: number;
  /**
   * The skill's own blow (true) or one it throws off (an echo, a shock, a
   * sweep's other bodies): only its own blow counts toward a Toll, carries on
   * (Saint's Reach) and plays the hit sound.
   */
  main?: boolean;
  /** What it leaves, drawn when it lands. */
  mark?: RiteMark;
  k?: number;
}

/**
 * Lands one blow of the skill on `t`, from the hero. The Last Bell is counted
 * here and Saint's Reach carries a Blade cut on, so every rite honours them
 * without each skill remembering to.
 */
function blow(r: RiteCast, host: RiteHost, t: Target, o: Blow = {}): DamagePacket {
  const pal = r.player.passives.pal;
  const rite = RITES[r.def.id];
  const main = o.main ?? true;
  const m = o.mult ?? 1;
  const riders = o.riders ? [...o.riders] : [];
  let toll = false;
  if (main && pal.tollEvery > 0 && r.def.treeId === 'palMace') {
    const n = (tolls.get(r.player) ?? 0) + 1;
    toll = n >= pal.tollEvery;
    tolls.set(r.player, toll ? 0 : n);
    if (toll) riders.push(status('rung', pal.tollRingSec));
  }
  const p = r.packet(m);
  // The Toll's bonus joins the hit's one pile rather than multiplying it.
  if (toll) ({ amount: p.amount, pile: p.pile } = addBonus(p.amount, p.pile ?? 1, pal.tollPct));
  const opens = o.opens ?? 0;
  if (opens > 0) riders.push(opened(r, p.amount, opens));
  if (riders.length) p.applies = [...(p.applies ?? []), ...riders];
  const knockback = o.knockback ?? 0;
  if (knockback > 0) p.knockback = Math.max(p.knockback ?? 0, knockback);
  const landed = host.land(t, p, o.kind ?? rite?.kind ?? 'melee', r.player.position.x, r.player.position.z, r);
  if (main) host.sound(r.hitSound, t.root.position.x, t.root.position.z);
  if (landed.amount <= 0) return landed;
  if (o.mark) look(r, host, o.mark, t, o.k ?? 0);
  if (toll) {
    // The Toll is seen and heard: a bronze ring off the target and the bell's own note.
    look(r, host, 'lastBell', t);
    host.sound(TOLL_SOUND, t.root.position.x, t.root.position.z);
  }
  // Saint's Reach carries a share of the cut, but not past double a plain
  // cut's: Mercy Stroke's finishing x8 is for the one it finishes.
  if (main && pal.carryPct > 0 && rite?.grip === 'blade') carryOn(r, host, t, Math.min(o.mult ?? 1, CARRY_MULT_CAP) * (pal.carryPct / 100));
  return landed;
}

/**
 * Saint's Reach: the cut goes on through `t` into the nearest enemy behind it
 * (on the far side from the hero), within the passive's carry, for `mult`.
 */
/** The most of a cut's own multiplier that Saint's Reach carries on. */
const CARRY_MULT_CAP = 2;

function carryOn(r: RiteCast, host: RiteHost, t: Target, mult: number): void {
  const me = r.player.position;
  const tp = t.root.position;
  let dx = tp.x - me.x;
  let dz = tp.z - me.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-3) return;
  dx /= len;
  dz /= len;
  const range = r.player.passives.pal.carryRange;
  let best: Target | null = null;
  let bestD = range;
  const n = r.enemies.length;
  for (let i = 0; i <= n; i++) {
    const e: Target | null = i < n ? r.enemies[i]! : r.boss;
    if (!e || e === t || e.life <= 0) continue;
    const ox = e.root.position.x - tp.x;
    const oz = e.root.position.z - tp.z;
    if (ox * dx + oz * dz <= 0) continue;
    const d = Math.hypot(ox, oz) - e.hitRadius - t.hitRadius;
    if (d <= bestD) {
      bestD = d;
      best = e;
    }
  }
  if (!best) return;
  const next: Target = best;
  blow(r, host, next, { mult, kind: 'melee', main: false });
  riteLook(host.effects, 'cut', tp.x, tp.z, next.root.position.x, next.root.position.z, 1);
}

/**
 * An Opened wound from a cut of `amount`: it bleeds a share of the cut each
 * second, per stack, so a deep cut runs deeper than the depth curve alone.
 */
function opened(r: RiteCast, amount: number, stacks: number): StatusApplication {
  return { id: 'opened', duration: r.num('bleedTime', 5), magnitude: 1, stacks, power: amount * r.num('bleedShare', 0.12) };
}

/**
 * Real seconds after the first blow at which blows 2..n land: the gesture's
 * own cuts (they follow the hero's speed). Any more than it draws (a rank or
 * a unique past its cuts) follow on at its last beat.
 */
function cutDelays(host: RiteHost, r: RiteCast, n: number, s: Swing): number[] {
  const at = host.cutTimes(r.def.id, s.span, s.first) ?? [];
  const last = at.length;
  const beat = last >= 2
    ? Math.max(0.05, at[last - 1]! - at[last - 2]!)
    : last === 1
      ? Math.max(0.05, at[0]!)
      : Math.max(0.06, ((s.span - s.first) * 0.6) / Math.max(1, n));
  const out: number[] = [];
  for (let i = 0; i < n - 1; i++) out.push(i < last ? at[i]! : (out[i - 1] ?? 0) + beat);
  return out;
}

/**
 * `n` blows on `t`, the first now and the rest on the gesture's cuts.
 * Tied to the action: a dodge or a new action stops the rest, and a cut
 * lands only while the target is still in reach.
 */
function flurry(host: RiteHost, r: RiteCast, t: Target, n: number, s: Swing, each: (i: number) => void): void {
  const p = r.player;
  each(0);
  if (n <= 1) return;
  const at = cutDelays(host, r, n, s);
  for (let i = 1; i < n; i++) {
    host.later(at[i - 1]!, () => {
      if (p.actionId !== s.id || !p.alive || !stillThere(p, t, s.reach)) return;
      p.faceTowards(t.root.position.x, t.root.position.z);
      p.animator.strike(s.clip, 'R');
      each(i);
    });
  }
}

/** Ends every dent on the target and says how many there were. */
function spendDents(t: Target): number {
  return t.consumeStatus('dented');
}

/** Every living body but `t` within `radius` metres of it (to their bodies' edge). */
function round(r: RiteCast, t: Target, radius: number): Target[] {
  const out: Target[] = [];
  const tp = t.root.position;
  const n = r.enemies.length;
  for (let i = 0; i <= n; i++) {
    const e: Target | null = i < n ? r.enemies[i]! : r.boss;
    if (!e || e === t || e.life <= 0) continue;
    if (Math.hypot(e.root.position.x - tp.x, e.root.position.z - tp.z) - e.hitRadius <= radius) out.push(e);
  }
  return out;
}

/**
 * Every living body but `t` within `radius` of the hero and inside the cone
 * `arc` radians wide that points at `t`: what a flat sweep at it passes through.
 */
function inArc(r: RiteCast, t: Target, radius: number, arc: number): Target[] {
  const out: Target[] = [];
  const me = r.player.position;
  const ax = t.root.position.x - me.x;
  const az = t.root.position.z - me.z;
  const al = Math.hypot(ax, az) || 1;
  const cosHalf = Math.cos(arc / 2);
  const n = r.enemies.length;
  for (let i = 0; i <= n; i++) {
    const e: Target | null = i < n ? r.enemies[i]! : r.boss;
    if (!e || e === t || e.life <= 0) continue;
    const ex = e.root.position.x - me.x;
    const ez = e.root.position.z - me.z;
    const el = Math.hypot(ex, ez);
    if (el - e.hitRadius > radius) continue;
    if (el > 0.3 && (ax * ex + az * ez) / (al * el) < cosHalf) continue;
    out.push(e);
  }
  return out;
}

// --- Turn the Blade -------------------------------------------------------------

/** A raised guard, waiting for the first blow it turns. */
interface Guard {
  r: RiteCast;
  host: RiteHost;
  /** The guard's own action: the answer may cut it short, never another skill. */
  guard: number;
  done: boolean;
  /** The answer's reach and how long it leaves the target Exposed, read when the guard goes up. */
  reach: number;
  exposed: number;
}

const GUARDS = new WeakMap<Player, Guard>();

/**
 * Turn the Blade's answer: its own riposte, a real action, at whoever was
 * turned (or the nearest in front when the guard dropped with nothing turned).
 */
function answer(g: Guard, attacker: Target | null): void {
  const { r, host } = g;
  const p = r.player;
  g.done = true;
  if (!p.alive || p.incapacitated) return;
  // Already into another skill: the blade is busy elsewhere, and the answer goes.
  if (p.isBusy && p.actionId !== g.guard) return;
  const reach = g.reach;
  let t = attacker && stillThere(p, attacker, reach) ? attacker : null;
  if (!t) {
    const rot = p.root.rotation.y;
    aheadV.set(p.position.x + Math.sin(rot) * 1.5, 0, p.position.z + Math.cos(rot) * 1.5);
    t = pickOne(p, aheadV, r.enemies, r.boss, reach);
  }
  if (!t) return;
  const target = t;
  p.faceTowards(target.root.position.x, target.root.position.z);
  const swing = r.attackTime / Math.max(0.1, ownAttackShare(r.def));
  p.beginAction(skillAction('turnTheBlade.answer') ?? 'thrust', swing * ANSWER_SWINGS);
  const id = p.actionId;
  host.later(p.contactIn, () => {
    if (p.actionId !== id || !p.alive || !stillThere(p, target, reach)) return;
    p.faceTowards(target.root.position.x, target.root.position.z);
    blow(r, host, target, { riders: [status('exposed', g.exposed)], kind: 'heavy', mark: 'thrust', k: 4 });
  });
}

// --- the rites --------------------------------------------------------------------

const RITES: Record<string, Rite> = {
  // ------------------------------------------------------------------ Mace
  tollingBlow: {
    grip: 'blunt',
    clip: 'slam',
    kind: 'heavy',
    reach: 2.6,
    land(r, host, t) {
      if (!t) return;
      blow(r, host, t, { riders: [status('staggered', r.num('duration', 2))], mark: 'toll' });
    },
  },
  shieldCrack: {
    grip: 'shield',
    clip: 'lunge',
    kind: 'heavy',
    reach: 2.2,
    land(r, host, t) {
      if (!t) return;
      blow(r, host, t, { riders: [status('rung', ranked(r, 'stun', 1, 0.03))], kind: 'heavy', knockback: r.num('knockback', 1.5), mark: 'crack' });
    },
  },
  anvilfall: {
    grip: 'blunt',
    clip: 'slam',
    kind: 'heavy',
    reach: 2.7,
    land(r, host, t) {
      if (!t) return;
      const dents = Math.round(r.num('dents', 2));
      blow(r, host, t, { riders: [status('dented', r.num('duration', 6), dents)], mark: 'anvil', k: dents });
    },
  },
  doorbreaker: {
    grip: 'shield',
    clip: 'lunge',
    kind: 'heavy',
    reach: 2.2,
    move: 'rush',
    land(r, host, t) {
      if (!t) return;
      blow(r, host, t, { riders: [status('staggered', r.num('duration', 2))], kind: 'heavy', knockback: r.num('knockback', 3), mark: 'door' });
    },
  },
  knell: {
    grip: 'blunt',
    clip: 'slam',
    kind: 'heavy',
    reach: 2.6,
    land(r, host, t) {
      if (!t) return;
      blow(r, host, t, { mark: 'knell' });
      // The iron is still ringing: a second, smaller blow from inside the helm.
      // A free echo: it rings whatever the hero does next.
      host.later(r.num('echoDelay', 0.55), () => {
        if (t.life <= 0 || !r.player.alive) return;
        blow(r, host, t, { mult: r.num('echo', 0.5), riders: [status('rung', ranked(r, 'ring', 0.6, 0.02))], kind: 'melee', main: false, mark: 'echo' });
        host.sound(r.hitSound, t.root.position.x, t.root.position.z);
      });
    },
  },
  pilgrimsMaul: {
    grip: 'blunt',
    clip: 'slam',
    kind: 'heavy',
    reach: 2.7,
    land(r, host, t) {
      if (!t) return;
      const perDent = r.num('perDent', 0.3);
      const radius = ranked(r, 'shockRadius', 3, 0.05);
      blow(r, host, t, { mult: 1 + spendDents(t) * perDent, mark: 'maul', k: radius });
      // The floor breaks round it: every other body near takes a share of the
      // blow, its own Dents beaten flat the same way.
      const shock = r.num('shock', 0.2);
      for (const e of round(r, t, radius)) blow(r, host, e, { mult: shock * (1 + spendDents(e) * perDent), kind: 'area', main: false });
    },
  },
  barTheDoor: {
    grip: 'shield',
    clip: 'cast',
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
    kind: 'heavy',
    reach: 14,
    // Thrown, not swung: `hurl` lands it when the censer arrives.
    land() {},
  },
  relicBash: {
    grip: 'shield',
    clip: 'lunge',
    kind: 'heavy',
    reach: 2.2,
    land(r, host, t) {
      if (!t) return;
      // It reads the Dents and leaves them for the next blow.
      const dents = t.stacksOf('dented');
      blow(r, host, t, { mark: 'relic', k: dents });
      if (dents > 0) r.player.heal(r.player.stats.life * ((ranked(r, 'healPct', 3, 0.15) * dents) / 100));
    },
  },
  ironVerdict: {
    grip: 'blunt',
    clip: 'slam',
    kind: 'heavy',
    reach: 2.8,
    land(r, host, t) {
      if (!t) return;
      // Rings longer the more of its armour is already beaten in.
      const ring = Math.min(r.num('ringCap', 2.5), r.num('ring', 0.4) + r.num('ringPerDent', 0.4) * t.stacksOf('dented'));
      blow(r, host, t, { riders: [status('rung', ring)], mark: 'verdict' });
    },
  },
  // ----------------------------------------------------------------- Blade
  oathCut: {
    grip: 'blade',
    clip: 'thrust',
    kind: 'melee',
    reach: 2.5,
    land(r, host, t) {
      if (!t) return;
      blow(r, host, t, { opens: 1, mark: 'thrust' });
    },
  },
  turnTheBlade: {
    grip: 'blade',
    clip: 'thrust',
    kind: 'heavy',
    reach: 2.6,
    self: true,
    land(r, host, _t, s) {
      // Blade up and turned. The first blow it turns is answered at once
      // (`paladinBlocked`); with none, the answer comes as the guard drops.
      const p = r.player;
      const window = ranked(r, 'window', 1.2, 0.03);
      p.applyStatus('parrying', window);
      const g: Guard = {
        r, host, guard: s.id, done: false,
        reach: r.num('reach', 2.6) + p.passives.pal.reachBonus,
        exposed: r.num('duration', 3),
      };
      GUARDS.set(p, g);
      host.later(window, () => {
        if (GUARDS.get(p) !== g) return;
        GUARDS.delete(p);
        if (!g.done) answer(g, null);
      });
    },
  },
  twinVerse: {
    grip: 'blade',
    clip: 'attack2',
    kind: 'melee',
    reach: 2.5,
    land(r, host, t, s) {
      if (!t) return;
      flurry(host, r, t, 2, s, (i) => blow(r, host, t, { opens: 1, mark: 'cut', k: i }));
    },
  },
  feint: {
    grip: 'blade',
    clip: 'thrust',
    kind: 'melee',
    reach: 2.5,
    move: 'flank',
    land(r, host, t) {
      if (!t) return;
      blow(r, host, t, { riders: [status('exposed', ranked(r, 'duration', 4, 0.1))], mark: 'cut', k: 1 });
    },
  },
  litany: {
    grip: 'blade',
    clip: 'attack1',
    kind: 'melee',
    reach: 2.5,
    land(r, host, t, s) {
      if (!t) return;
      flurry(host, r, t, Math.round(r.num('cuts', 5)), s, (i) => blow(r, host, t, { opens: 1, mark: 'cut', k: i }));
    },
  },
  confessionThrust: {
    grip: 'blade',
    clip: 'lunge',
    kind: 'heavy',
    reach: 2.5,
    move: 'lunge',
    land(r, host, t) {
      if (!t) return;
      // Every open wound confesses at once.
      const cuts = t.consumeStatus('opened');
      blow(r, host, t, { mult: 1 + cuts * r.num('perCut', 0.4), kind: 'heavy', mark: 'confess', k: cuts });
    },
  },
  crosswise: {
    grip: 'blade',
    clip: 'attack2',
    kind: 'melee',
    reach: 2.5,
    land(r, host, t, s) {
      if (!t) return;
      const arc = (r.num('arc', 150) * Math.PI) / 180;
      const radius = r.num('radius', 3) + r.player.passives.pal.reachBonus;
      flurry(host, r, t, 2, s, (i) => {
        if (i === 0) {
          // Flat across: every body in the sweep is cut, the one it aims at first.
          blow(r, host, t, { mark: 'sweep', k: arc });
          for (const e of inArc(r, t, radius, arc)) blow(r, host, e, { main: false });
          return;
        }
        // Then straight down through the one in the middle.
        blow(r, host, t, { riders: [status('exposed', r.num('duration', 5))], kind: 'heavy', mark: 'cross' });
      });
    },
  },
  mercyStroke: {
    grip: 'blade',
    clip: 'thrust',
    kind: 'heavy',
    reach: 2.5,
    land(r, host, t) {
      if (!t) return;
      // Below the line, a lesser thing is simply finished. Bosses are never small enough.
      const line = ranked(r, 'threshold', 15, 0.5) / 100;
      const mercy = t !== r.boss && t.life / Math.max(1, t.maxLife) <= line;
      blow(r, host, t, { mult: mercy ? r.num('mercyMult', 8) : 1, kind: 'heavy', mark: 'mercy', k: mercy ? 1 : 0 });
    },
  },
  sevenfold: {
    grip: 'blade',
    clip: 'attack1',
    kind: 'melee',
    reach: 2.5,
    land(r, host, t, s) {
      if (!t) return;
      const n = Math.round(r.num('cuts', 7));
      flurry(host, r, t, n, s, (i) => {
        if (i === n - 1) blow(r, host, t, { riders: [status('exposed', r.num('duration', 5))], kind: 'heavy', opens: 2, mark: 'thrust', k: 6 });
        else blow(r, host, t, { mark: 'thrust' });
      });
    },
  },
  lastRites: {
    grip: 'blade',
    clip: 'lunge',
    kind: 'heavy',
    reach: 2.5,
    move: 'behind',
    land(r, host, t) {
      if (!t) return;
      blow(r, host, t, { riders: [status('exposed', r.num('duration', 6))], kind: 'heavy', opens: Math.round(r.num('opens', 3)), mark: 'rites' });
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
 * Why a rite cannot be used with what is in the hero's hands (or with his
 * feet held), or null when it can. Checked before any mana is spent.
 */
export function riteRefusal(def: SkillDef, player: Player): string | null {
  const rite = RITES[def.id];
  if (!rite) return null;
  const main = categoryIn(player, 'mainHand');
  if (rite.grip === 'blunt' && !(main && BLUNT.includes(main))) return tr('{0} needs a mace or a scepter.', def.name);
  if (rite.grip === 'blade' && !(main && BLADE.includes(main))) return tr('{0} needs a sword.', def.name);
  if (rite.grip === 'shield' && categoryIn(player, 'offHand') !== 'shield') return tr('{0} needs a shield.', def.name);
  if ((rite.move === 'rush' || rite.move === 'lunge') && player.immobilised) return tr('Rooted: {0} cannot move you.', def.name);
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
  const n = enemies.length;
  for (let i = 0; i <= n; i++) {
    const t: Target | null = i < n ? enemies[i]! : boss;
    if (!t || t.life <= 0) continue;
    const p = t.root.position;
    const dx = p.x - me.x;
    const dz = p.z - me.z;
    const dl = Math.hypot(dx, dz);
    if (dl - t.hitRadius > reach) continue;
    const fromAim = Math.hypot(p.x - aim.x, p.z - aim.z) - t.hitRadius;
    // In front, not behind: a blow aimed one way does not land the other.
    const facing = dl > 1e-4 ? (fx * dx + fz * dz) / dl : 1;
    const score = fromAim + (facing < 0.2 ? 6 : 0);
    if (score < bestD) {
      bestD = score;
      best = t;
    }
  }
  return best;
}

// --- ground covered before the blow ------------------------------------------------

/** Brings `to` in to the first wall between `from` and it; returns the leg's length. */
function clipLeg(host: RiteHost, r: RiteCast, from: THREE.Vector3, to: THREE.Vector3): number {
  legDir.set(to.x - from.x, 0, to.z - from.z);
  const len = legDir.length();
  if (len < 1e-3) return 0;
  legDir.divideScalar(len);
  const go = Math.min(len, host.clear(from, legDir, len, r.ctx));
  to.set(from.x + legDir.x * go, 0, from.z + legDir.z * go);
  return go;
}

/**
 * Where a move takes the hero: `legA` (and `legB`, round behind). Returns the
 * number of legs, 0 when there is nowhere worth going. A rush or lunge goes
 * straight in and stops short of the body; a flank steps to the side of it the
 * cursor is on; behind goes to that side, then round to its back. Walls cut
 * each leg short.
 */
function pathTo(host: RiteHost, r: RiteCast, move: Move, t: Target): number {
  const from = r.player.position;
  const tp = t.root.position;
  dirV.set(tp.x - from.x, 0, tp.z - from.z);
  const gap = dirV.length();
  if (gap < 0.01) return 0;
  dirV.divideScalar(gap);
  const hr = t.hitRadius;
  if (move === 'rush' || move === 'lunge') {
    const want = gap - hr - 0.9;
    if (want <= 0.2) return 0;
    legA.set(from.x + dirV.x * want, 0, from.z + dirV.z * want);
    return clipLeg(host, r, from, legA) > 0.2 ? 1 : 0;
  }
  // Left or right, whichever side of the line the cursor is on.
  const side = (r.aim.x - from.x) * dirV.z - (r.aim.z - from.z) * dirV.x >= 0 ? 1 : -1;
  const off = hr + 1.0;
  const px = dirV.z * side;
  const pz = -dirV.x * side;
  if (move === 'flank') {
    legA.set(tp.x - dirV.x * off * 0.6 + px * off, 0, tp.z - dirV.z * off * 0.6 + pz * off);
    return clipLeg(host, r, from, legA) > 0.2 ? 1 : 0;
  }
  // Round behind: to its side first, then to its back.
  legB.set(tp.x + dirV.x * (hr + 0.9), 0, tp.z + dirV.z * (hr + 0.9));
  legA.set(tp.x + px * off, 0, tp.z + pz * off);
  if (clipLeg(host, r, from, legA) <= 0.2) {
    // Already at its side: straight round to its back.
    legA.copy(legB);
    return clipLeg(host, r, from, legA) > 0.2 ? 1 : 0;
  }
  return clipLeg(host, r, legA, legB) > 0.2 ? 2 : 1;
}

/**
 * Bodies in a shield rush's lane are shoved aside as he reaches them: a small
 * blow each (`shove` of the skill) and a knock away, once each. Dust is
 * kicked up from his heels all the way.
 */
function laneShove(host: RiteHost, r: RiteCast, target: Target, id: number, travel: number): void {
  const p = r.player;
  const hit = new Set<Target>([target]);
  const shove = r.num('shove', 0.25);
  let left = travel;
  const poll = (): void => {
    if (p.actionId !== id || !p.alive) return;
    const px = p.position.x;
    const pz = p.position.z;
    const n = r.enemies.length;
    for (let i = 0; i <= n; i++) {
      const e: Target | null = i < n ? r.enemies[i]! : r.boss;
      if (!e || e.life <= 0 || hit.has(e)) continue;
      const reach = 1.1 + e.hitRadius;
      const dx = e.root.position.x - px;
      const dz = e.root.position.z - pz;
      if (dx * dx + dz * dz > reach * reach) continue;
      hit.add(e);
      blow(r, host, e, { mult: shove, kind: 'melee', knockback: 2.5, main: false, mark: 'crack' });
    }
    riteLook(host.effects, 'heels', px, pz, target.root.position.x, target.root.position.z);
    left -= 0.05;
    if (left > 0) host.later(0.05, poll);
  };
  host.later(0.05, poll);
}

/**
 * Starts a press that covers ground first: the hero carried along the path at
 * the move's speed (`travelTime`), the gesture's blow timed to his arrival,
 * and the action long enough that its blow comes before a move order may cut
 * it. Returns the press's swing; a held hero (or nowhere to go) swings where
 * he stands.
 */
function approach(host: RiteHost, r: RiteCast, move: Move, t: Target, clip: string, reach: number): Swing {
  const p = r.player;
  const legs = p.immobilised ? 0 : pathTo(host, r, move, t);
  if (legs === 0) {
    p.beginAction(clip, r.attackTime);
    return { id: p.actionId, span: r.attackTime, first: p.contactIn, clip, reach };
  }
  const fromX = p.position.x;
  const fromZ = p.position.z;
  const ax = legA.x - fromX;
  const az = legA.z - fromZ;
  const lenA = Math.hypot(ax, az);
  const bx = legs > 1 ? legB.x - legA.x : 0;
  const bz = legs > 1 ? legB.z - legA.z : 0;
  const lenB = Math.hypot(bx, bz);
  const travel = travelTime(lenA + lenB, MOVE_SPEED[move]);
  const hitAt = travel + ARRIVE_BEAT;
  const span = Math.max(hitAt + r.attackTime * FOLLOW, hitAt / LAND_SHARE);
  p.beginAction(clip, span);
  // The gesture's blow lands when he arrives.
  p.animator.play(clip, { fade: 0.06, span, restart: true, contact: hitAt });
  const tA = travel * (lenA / (lenA + lenB));
  const tB = travel - tA;
  p.carry(ax, az, lenA / tA, tA);
  const id = p.actionId;
  if (legs > 1) {
    host.later(tA, () => {
      if (p.actionId !== id || !p.alive) return;
      if (t.life > 0) p.faceTowards(t.root.position.x, t.root.position.z);
      p.carry(bx, bz, lenB / tB, tB);
    });
  }
  if (move === 'rush') laneShove(host, r, t, id, travel);
  else riteLook(host.effects, 'heels', fromX, fromZ, legA.x, legA.z);
  return { id, span, first: hitAt, clip, reach };
}

/** The aimed point, brought in to arm's reach: where a blow that found no one lands. */
function inReach(p: Player, aim: THREE.Vector3, reach: number): THREE.Vector3 {
  const dx = aim.x - p.position.x;
  const dz = aim.z - p.position.z;
  const d = Math.hypot(dx, dz);
  const k = d > reach ? reach / d : 1;
  return new THREE.Vector3(p.position.x + dx * k, 0, p.position.z + dz * k);
}

/**
 * Hurl the Censer: it leaves the hand on the gesture's throw frame, flies its
 * arc on the chain, and the blow lands when it arrives (ash and coals where
 * it bursts). With no one to hit it is thrown at the aimed floor.
 */
function hurl(host: RiteHost, r: RiteCast, target: Target | null, clip: string): void {
  const p = r.player;
  p.beginAction(clip, r.attackTime, undefined, { release: true });
  const aim = r.landAt ?? inReach(p, r.aim, 6);
  host.atRelease(p, () => {
    const t = target && target.life > 0 ? target : null;
    hurlFrom.set(p.position.x, 1.3, p.position.z);
    if (t) hurlTo.set(t.root.position.x, 1.0, t.root.position.z);
    else hurlTo.set(aim.x, 0.3, aim.z);
    const flight = hurlFrom.distanceTo(hurlTo) / Math.max(1, r.num('speed', 18));
    paladinFX(host.effects).censer.hurl(hurlFrom, hurlTo, flight, p.root, host.effects.fx, 1.2);
    const lx = hurlTo.x;
    const ly = hurlTo.y;
    const lz = hurlTo.z;
    host.later(flight, () => {
      host.effects.fx.burst('ash', lx, ly, lz, ASH_BURST);
      host.effects.fx.burst('embers', lx, ly, lz, COAL_BURST);
      host.effects.decals.add('ash', lx, lz, 1.2);
      if (t && t.life > 0) blow(r, host, t, { riders: [status('smoked', ranked(r, 'duration', 4, 0.1))] });
    });
  });
}

/** Runs one press of a rite. The runner has already paid for it. */
export function castRite(host: RiteHost, r: RiteCast): void {
  const rite = RITES[r.def.id];
  if (!rite) return;
  const p = r.player;
  // Saint's Reach: a Blade skill reaches further.
  const bonus = rite.grip === 'blade' ? p.passives.pal.reachBonus : 0;
  // The tree's own numbers: how far the blow reaches, and how far a rush, lunge (or throw) carries.
  const travels = rite.move === 'rush' || rite.move === 'lunge';
  const reach = rite.self ? 0 : (travels ? r.num('reach', rite.reach) : r.num('reach', r.num('range', rite.reach))) + bonus;
  const seek = travels ? r.num('range', 9) + bonus : reach;
  const target = rite.self ? null : pickOne(p, r.aim, r.enemies, r.boss, seek);
  if (target) p.faceTowards(target.root.position.x, target.root.position.z);
  if (!rite.self) r.landAt = target ? target.root.position.clone().setY(0) : inReach(p, r.aim, reach);
  const clip = skillAction(r.def.id) ?? rite.clip;
  if (r.def.id === 'hurlCenser') {
    hurl(host, r, target, clip);
    return;
  }
  let s: Swing;
  if (target && rite.move) {
    s = approach(host, r, rite.move, target, clip, reach);
  } else {
    p.beginAction(clip, r.attackTime);
    s = { id: p.actionId, span: r.attackTime, first: p.contactIn, clip, reach };
  }
  const swing = s;
  host.later(swing.first, () => {
    if (p.actionId !== swing.id || !p.alive) return;
    if (rite.self) {
      rite.land(r, host, null, swing);
      return;
    }
    // Still there, still in reach at the moment the blow arrives.
    const t = target && stillThere(p, target, reach) ? target : null;
    if (t) p.faceTowards(t.root.position.x, t.root.position.z);
    rite.land(r, host, t, swing);
  });
}

/**
 * A blow turned on the Paladin's shield or blade. Bellguard leaves the
 * attacker Staggered; a raised Turn the Blade answers it at once. Called by
 * the dungeon's passive defence when a hit is blocked.
 */
export function paladinBlocked(player: Player, attacker: Target, ctx: CombatContext): void {
  const sec = player.passives.pal.blockStaggerSec;
  if (sec > 0 && attacker.life > 0) attacker.applyStatuses([status('staggered', sec)], ctx);
  const g = GUARDS.get(player);
  if (!g || g.done) return;
  const me = player.position;
  riteLook(g.host.effects, 'parry', me.x, me.z, attacker.root.position.x, attacker.root.position.z);
  answer(g, attacker);
}
