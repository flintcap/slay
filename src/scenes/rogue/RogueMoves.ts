/**
 * SLAY — the Rogue's moves that the shared families could not time.
 *
 * Throws that leave the hand on its release frame (Venom Dart, Plague Vial,
 * Fan of Knives, Throwing Spree), the threads torn out of the poisoned
 * (Envenom Burst), a dash that cuts what it passes (Razor Dash), the escape
 * (Vanish), the knives that circle you (Knife Halo), the dance round one
 * enemy (Steel Waltz), and the clones answering your blows (Mirror Gambit).
 * `rogueLook` draws the Rogue's own looks over skills the shared families
 * run (Death Lotus, Nightfall), and `tickRogue` drips the coated blades
 * (`fx/rogue/RogueFX.ts`).
 *
 * `SkillRunner.cast` hands a skill in `ROGUE_MOVES` to `castRogue`, with a
 * small host that lands blows through the runner's own pipeline (passives,
 * hit feel, kill credit), so a Rogue blow is tuned, felt and counted like
 * any other. `tickRogue` runs every frame from `SkillRunner.update`.
 *
 * Timing goes through `sim/Speed.ts` (the cast hands over `actTime`); a
 * gesture's later throws and cuts land on its own keys (`cutTimes`).
 * Damage per hit is the skill's own: speed never changes it.
 */
import * as THREE from 'three';
import type { DamagePacket, SkillDef, StatusApplication } from '../../types';
import type { CombatContext, Enemy } from '../../entities/Enemy';
import type { Boss } from '../../entities/Boss';
import type { Player } from '../../entities/Player';
import type { HitKind } from '../../fx/CombatFeel';
import type { EffectSystem, School } from '../../fx/Effects';
import type { SolidHandle } from '../../fx/kit/Solids';
import { travelTime } from '../../sim/Speed';
import { tr } from '../../core/I18n';
import { clearRogueFX, envenomThread, lotusPetal, nightfallCurtain, tickRogueFX } from '../../fx/rogue/RogueFX';

type Target = Enemy | Boss;

/** The fight a move happens in. */
export interface RogueWorld {
  ctx: CombatContext;
  enemies: Enemy[];
  boss: Boss | null;
  player: Player;
}

/** A Shadow Clone standing, as Mirror Gambit sees it. */
export interface CloneBody {
  body: THREE.Object3D;
  x: number;
  z: number;
  facing: number;
  color: number;
  /** Plays the clone's swing. */
  swing(): void;
}

/** What the runner lends a Rogue move. */
export interface RogueHost {
  readonly effects: EffectSystem;
  /** Lands one tuned blow on one target. Returns the packet that landed (amount 0 on a miss). */
  land(t: Target, packet: DamagePacket, kind: HitKind, fromX: number, fromZ: number, world: RogueWorld): DamagePacket;
  /**
   * Lands damage already reckoned (a poison stack going off), with no
   * passives on top. True when it landed.
   */
  strike(t: Target, packet: DamagePacket, kind: HitKind, fromX: number, fromZ: number, world: RogueWorld): boolean;
  /** A blow on everything within `radius` of `centre`; returns what it dealt. */
  area(centre: THREE.Vector3, radius: number, packet: (m?: number) => DamagePacket, world: RogueWorld, kind?: HitKind): number;
  /** The nearest target within `radius` of `at` takes one blow. */
  point(at: THREE.Vector3, radius: number, packet: (m?: number) => DamagePacket, world: RogueWorld, kind: HitKind, from: THREE.Vector3): void;
  /** How far a body goes from `from` along `dir` before a wall, up to `max`. */
  clear(from: THREE.Vector3, dir: THREE.Vector3, max: number, ctx: CombatContext, radius: number): number;
  /** Distance along `dir` to the first target or wall, up to `max`. */
  firstHit(from: THREE.Vector3, dir: THREE.Vector3, max: number, radius: number, world: RogueWorld): number;
  /** Runs `fn` after `seconds` (the runner's contact queue). */
  later(seconds: number, fn: () => void): void;
  /** Runs `fn` on the release frame of the hero's current action. */
  atRelease(player: Player, fn: () => void): void;
  /**
   * Real seconds after the first blow (or throw) at which a gesture's later
   * cuts land, played over `span` seconds with the first at `first`; null
   * for a gesture without cuts.
   */
  cutTimes(skillId: string, span: number, first: number): number[] | null;
  /** Plays a skill sound at a point. */
  sound(id: string | null, x: number, z: number): void;
  /** Grants the skill's own buff to the hero (`SELF_POWER`). */
  buff(player: Player, def: SkillDef, rank: number, num: (k: string, d: number) => number, color: number): void;
  /** Shakes off one hold or slow. */
  cleanse(player: Player): void;
  /** Your Shadow Clones standing now. */
  clones(): Iterable<CloneBody>;
  /** Seconds since the run began, the runner's clock. */
  now(): number;
  /** The hero who cast last, for what their body shows (the coated blades). */
  hero(): Player | null;
}

/** One press of a Rogue move. */
export interface RogueCast {
  def: SkillDef;
  rank: number;
  player: Player;
  /** Where the press aimed, on the floor. */
  aim: THREE.Vector3;
  /** Facing toward the aim, flat, unit. */
  dir: THREE.Vector3;
  world: RogueWorld;
  /** A fresh rolled packet at `mult` times the skill's damage, riders on. */
  packet: (mult?: number) => DamagePacket;
  /** The same with two blades: a melee skill swung with both hits harder. */
  blowPacket: (mult?: number) => DamagePacket;
  num: (key: string, dflt: number) => number;
  school: School;
  color: number;
  /** Seconds this use takes (`sim/Speed.ts`). */
  actTime: number;
  /** The body clip (the skill's own gesture). */
  clip: string;
  hitSound: string | null;
  /** The skill's particle wake for what it throws. */
  shed?: string;
  /** The skill's own burst (`fx/SkillLooks.ts`) and how thick it is drawn. */
  burst: string;
  density: number;
  /** Critical damage multiplier, for a blow that must crit. */
  critX: number;
}

/** Skills `castRogue` runs. */
export const ROGUE_MOVES: ReadonlySet<string> = new Set([
  'venomDart', 'plagueVial', 'envenomBurst', 'fanOfKnives', 'throwingSpree', 'whirlingBlades', 'vanish', 'knifeHalo', 'steelWaltz',
]);

const UP = new THREE.Vector3(0, 1, 0);
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();

/** "Five blades (+1 per 7 ranks)". */
const perRanks = (base: number, per: number, rank: number): number => base + (per > 0 ? Math.floor(rank / per) : 0);

/** Where a throw leaves the hand. */
function hand(player: Player): THREE.Vector3 {
  return player.position.clone().setY(1.25);
}

// ---------------------------------------------------------------------------
// Moves running over several frames
// ---------------------------------------------------------------------------

/** Razor Dash: what it has cut so far, as the hero runs its lane. */
interface Dash {
  player: Player;
  left: number;
  width: number;
  cut: Set<Target>;
  packet: (m?: number) => DamagePacket;
  world: RogueWorld;
  hitSound: string | null;
  heard: boolean;
}

/** Knife Halo: six knives turning round the hero. */
interface Halo {
  player: Player;
  left: number;
  tick: number;
  accum: number;
  radius: number;
  angle: number;
  knives: Array<SolidHandle | null>;
  packet: (m?: number) => DamagePacket;
  world: RogueWorld;
}

/** Steel Waltz: the hero carried a quarter turn round the enemy between cuts. */
interface Glide {
  player: Player;
  target: Target;
  /** Angle round the target, start and end, and the distance kept. */
  from: number;
  to: number;
  gap: number;
  t: number;
  span: number;
  action: number;
  ctx: CombatContext;
}

const dashes: Dash[] = [];
const halos: Halo[] = [];
const glides: Glide[] = [];
/** When each clone last answered a blow (Mirror Gambit). */
const mirrored = new WeakMap<THREE.Object3D, number>();

/** Seconds between a halo's cuts, and its turn. */
const HALO_TURN = 0.9;
const HALO_KNIVES = 6;

// ---------------------------------------------------------------------------
// The moves
// ---------------------------------------------------------------------------

/**
 * A thin venom needle, loosed with the flick. It passes through `pierce`
 * enemies (nearest first) and stops in the next, striking each as it gets
 * there; with nothing left to hit it flies on to the wall or its range.
 */
function venomDart(r: RogueCast, host: RogueHost): void {
  const { player, num } = r;
  const dir = r.dir.clone();
  player.beginAction(r.clip, r.actTime, undefined, { release: true });
  host.atRelease(player, () => {
    const from = hand(player);
    const range = num('range', 16);
    const speed = Math.max(1, num('speed', 30));
    const most = 1 + Math.max(0, Math.floor(num('pierce', 0)));
    const width = 0.5;
    const lane = host.clear(from, dir, range, r.world.ctx, 0.3);
    const struck: Array<{ t: Target; at: number }> = [];
    for (const t of targets(r.world)) {
      v1.copy(t.root.position).sub(from).setY(0);
      const along = v1.dot(dir);
      if (along < 0 || along > lane + t.hitRadius) continue;
      const perp = Math.sqrt(Math.max(0, v1.lengthSq() - along * along));
      if (perp > width * 0.5 + t.hitRadius) continue;
      struck.push({ t, at: Math.max(0, along - t.hitRadius) });
    }
    struck.sort((a, b) => a.at - b.at);
    if (struck.length > most) struck.length = most;
    const stop = struck.length === most ? Math.min(lane, struck[most - 1]!.at + 0.3) : lane;
    host.effects.projectile(from, from.clone().addScaledVector(dir, stop), {
      element: r.school, color: r.color, shape: 'needle', shed: r.shed, flare: false, speed, size: 0.32,
    });
    // Each enemy is struck as the needle reaches it.
    struck.forEach(({ t, at }, i) => {
      host.later(at / speed, () => {
        if (t.life <= 0) return;
        const landed = host.land(t, r.packet(), 'projectile', from.x, from.z, r.world);
        if (i === 0 && landed.amount > 0) host.sound(r.hitSound, t.root.position.x, t.root.position.z);
      });
    });
  });
}

/** A glass vial lobbed to the aimed spot, turning in the air, shattering in a green splash. */
function plagueVial(r: RogueCast, host: RogueHost): void {
  const { player, num } = r;
  const dir = r.dir.clone();
  const reach = Math.min(num('range', 14), Math.hypot(r.aim.x - player.position.x, r.aim.z - player.position.z));
  player.beginAction(r.clip, r.actTime, undefined, { release: true });
  host.atRelease(player, () => {
    const from = hand(player);
    const lane = host.clear(from, dir, Math.max(0.5, reach), r.world.ctx, 0.3);
    const to = from.clone().addScaledVector(dir, lane).setY(0.15);
    const splash = num('splash', num('radius', 4));
    host.effects.projectile(from, to, {
      element: r.school, color: r.color, shape: 'vial', shed: r.shed, flare: false,
      speed: Math.max(1, num('speed', 14)), size: 0.32, arc: Math.max(1.1, lane * 0.22),
      onHit: (p) => {
        const dealt = host.area(p.setY(0), splash, r.packet, r.world);
        if (dealt > 0) host.sound(r.hitSound, p.x, p.z);
      },
    });
  });
}

/** Seconds a thread takes to reel in from a body to the burst. */
const REEL = 0.18;

/**
 * Envenom Burst: with the yank of the fist, a thread of venom tears out of
 * every Poisoned enemy in reach of the aimed point and is reeled into it.
 * As the threads arrive the point bursts, and every Poisoned stack in reach
 * goes off at once for a share of all it had left to deal.
 */
function envenomBurst(r: RogueCast, host: RogueHost): void {
  const { player, num, rank } = r;
  const at = r.aim.clone().setY(0);
  player.beginAction(r.clip, r.actTime, undefined, { release: true });
  host.atRelease(player, () => {
    const radius = num('radius', 3);
    let reel = 0;
    for (const t of targets(r.world)) {
      const p = t.root.position;
      if (!t.hasStatus('poisoned') || Math.hypot(p.x - at.x, p.z - at.z) > radius + t.hitRadius) continue;
      envenomThread(host.effects, p.x, p.y + 1 + t.hitRadius * 0.5, p.z, at.x, 0.9, at.z, REEL, t.stacksOf('poisoned'));
      reel = REEL;
    }
    host.later(reel, () => {
      host.effects.explosion(at.x, 0.8, at.z, { radius, element: r.school, color: r.color });
      host.effects.nova(at.x, at.z, radius, { element: r.school, color: r.color, emitter: r.burst, density: r.density });
      host.area(at, radius, r.packet, r.world);
      const pct = num('pctPerStack', 45) + num('perRank', 6) * Math.max(0, rank - 1);
      for (const t of targets(r.world)) {
        const p = t.root.position;
        if (Math.hypot(p.x - at.x, p.z - at.z) > radius + t.hitRadius) continue;
        const left = (t.drainStatus('poisoned') * pct) / 100;
        if (left <= 0) continue;
        host.strike(t, { amount: left, type: 'poison', crit: false, source: 'player', ability: r.def.name }, 'proc', at.x, at.z, r.world);
      }
    });
  });
}

/** Knives fanned flat from both hands on the sweep's release. */
function fanOfKnives(r: RogueCast, host: RogueHost): void {
  const { player, num, rank } = r;
  const dir = r.dir.clone();
  player.beginAction(r.clip, r.actTime, undefined, { release: true });
  host.atRelease(player, () => {
    const count = Math.max(1, Math.floor(perRanks(num('count', 5), num('countPerRanks', 0), rank)));
    const arc = (num('arc', 45) * Math.PI) / 180;
    const step = count > 1 ? arc / (count - 1) : 0;
    const range = num('range', 10);
    for (let i = 0; i < count; i++) {
      const d = dir.clone().applyAxisAngle(UP, count === 1 ? 0 : (i - (count - 1) / 2) * step);
      throwKnife(r, host, d, range, i === 0);
    }
  });
}

/** One thrown knife along `d`, stopping at the first body. */
function throwKnife(r: RogueCast, host: RogueHost, d: THREE.Vector3, range: number, loud: boolean): void {
  const from = hand(r.player);
  const stop = host.firstHit(from, d, range, 0.4, r.world);
  const to = from.clone().addScaledVector(d, stop);
  host.effects.projectile(from, to, {
    element: r.school, color: r.color, shape: 'knife', shed: r.shed, flare: false,
    speed: Math.max(1, r.num('speed', 28)), size: 0.4,
    onHit: (p) => {
      host.point(p, 0.4, r.packet, r.world, 'projectile', from);
      if (loud) host.sound(r.hitSound, p.x, p.z);
    },
  });
}

/** Six knives, hand after hand, each leaving on its own throw of the gesture. */
function throwingSpree(r: RogueCast, host: RogueHost): void {
  const { player, num } = r;
  const dir = r.dir.clone();
  const count = Math.max(1, Math.floor(num('count', 6)));
  const spread = num('spread', 0.08);
  const range = num('range', 14);
  player.beginAction(r.clip, r.actTime, undefined, { release: true });
  const id = player.actionId;
  const first = player.releaseIn;
  const throws = host.cutTimes(r.def.id, r.actTime, first) ?? [];
  const at = (i: number): number => (i === 0 ? 0 : throws[Math.min(throws.length - 1, i - 1)] ?? 0.1 * i);
  host.atRelease(player, () => {
    for (let i = 0; i < count; i++) {
      host.later(at(i), () => {
        if (player.actionId !== id || !player.alive) return;
        // A tight fan: each knife a touch off the line, alternating sides.
        const a = (i % 2 === 0 ? 1 : -1) * spread * Math.ceil(i / 2);
        throwKnife(r, host, dir.clone().applyAxisAngle(UP, a), range, i === 0);
      });
    }
  });
}

/** Razor Dash: one spin down the lane, cutting each enemy as the hero reaches it. */
function razorDash(r: RogueCast, host: RogueHost): void {
  const { player, num } = r;
  const dir = r.dir.clone();
  const from = player.position.clone();
  const lane = host.clear(from, dir, num('range', 8), r.world.ctx, 0.4);
  const span = travelTime(lane);
  player.dodge(dir.x, dir.z, true, r.clip, { distance: lane > 0.3 ? lane : undefined, skill: true, span });
  if (num('iframes', 0) > 0) player.grantInvulnerability(num('iframes', 0));
  for (let i = dashes.length - 1; i >= 0; i--) if (dashes[i]!.player === player) dashes.splice(i, 1);
  dashes.push({
    player, left: span + 0.06, width: num('width', 1.8), cut: new Set(), packet: r.blowPacket, world: r.world,
    hitSound: r.hitSound, heard: false,
  });
}

/** Vanish: a back-spring out of reach, a smoke puff left where you stood, then the veil. */
function vanish(r: RogueCast, host: RogueHost): void {
  const { player, num, rank, world } = r;
  const back = r.dir.clone().negate();
  const start = player.position.clone();
  const lane = host.clear(start, back, num('distance', 5), world.ctx, 0.4);
  player.dodge(back.x, back.z, true, r.clip, { distance: lane > 0.3 ? lane : undefined, skill: true, span: 0.42 });
  // Eyes stay on them: a spring backwards, not a turn and run.
  player.faceTowards(r.aim.x, r.aim.z);
  const blind: StatusApplication = {
    id: 'blinded',
    duration: num('blind', 2) + num('blindPerRank', 0.1) * Math.max(0, rank - 1),
    magnitude: 1,
  };
  const puff = num('puffRadius', 3);
  for (const t of targets(world)) {
    if (Math.hypot(t.root.position.x - start.x, t.root.position.z - start.z) > puff + t.hitRadius) continue;
    t.applyStatuses([blind], world.ctx);
  }
  if (num('cleanse', 0) > 0) host.cleanse(player);
  if (num('resetSkills', 0) > 0) player.resetCooldown('shadowStep');
  host.buff(player, r.def, rank, num, r.color);
}

/** Knife Halo: six knives circle the hero, cutting what comes near. */
function knifeHalo(r: RogueCast, host: RogueHost): void {
  const { player, num, rank } = r;
  player.beginAction(r.clip, r.actTime);
  for (let i = halos.length - 1; i >= 0; i--) {
    if (halos[i]!.player !== player) continue;
    for (const k of halos[i]!.knives) host.effects.solids.free(k);
    halos.splice(i, 1);
  }
  const knives: Array<SolidHandle | null> = [];
  for (let i = 0; i < HALO_KNIVES; i++) knives.push(host.effects.solids.alloc('blade'));
  halos.push({
    player,
    left: num('duration', 8) + num('durationPerRank', 0.25) * Math.max(0, rank - 1),
    tick: Math.max(0.2, num('tickRate', 0.5)),
    accum: 0,
    radius: num('radius', 2.6),
    angle: 0,
    knives,
    packet: r.packet,
    world: r.world,
  });
}

/** The enemy a single-target blow means: the one nearest the mark, within reach. */
function marked(r: RogueCast, reach: number): Target | null {
  let best: Target | null = null;
  let bestD = Infinity;
  const p = r.player.position;
  for (const t of targets(r.world)) {
    const fromHero = Math.hypot(t.root.position.x - p.x, t.root.position.z - p.z) - t.hitRadius;
    if (fromHero > reach) continue;
    const d = Math.hypot(t.root.position.x - r.aim.x, t.root.position.z - r.aim.z);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

/**
 * Steel Waltz: five cuts round one enemy. Between cuts the hero is carried a
 * quarter turn round it; the fifth, both blades driven in, always crits.
 */
function steelWaltz(r: RogueCast, host: RogueHost): void {
  const { player, num } = r;
  const reach = num('reach', 2.6);
  const target = marked(r, reach + 0.6);
  if (target) player.faceTowards(target.root.position.x, target.root.position.z);
  player.beginAction(r.clip, r.actTime);
  const id = player.actionId;
  const first = player.contactIn;
  const cuts = host.cutTimes(r.def.id, r.actTime, first) ?? [0.15, 0.3, 0.45, 0.6];
  const count = Math.max(1, Math.floor(num('hits', 5)));
  const times = [first];
  for (let i = 1; i < count; i++) times.push(first + (cuts[Math.min(cuts.length - 1, i - 1)] ?? 0.15 * i));
  // Turns the way the blades go: right, round to the left.
  const turn = Math.PI / 2;
  for (let i = 0; i < count; i++) {
    const last = i === count - 1;
    host.later(times[i]!, () => {
      if (player.actionId !== id || !player.alive) return;
      if (i > 0) player.animator.strike(r.clip, i % 2 === 1 ? 'L' : 'R');
      const t = target && target.life > 0 ? target : null;
      if (t && Math.hypot(t.root.position.x - player.position.x, t.root.position.z - player.position.z) <= reach + t.hitRadius + 0.6) {
        let pk = r.blowPacket();
        if (last && !pk.crit) pk = { ...pk, crit: true, amount: pk.amount * r.critX };
        const landed = host.land(t, pk, last ? 'heavy' : 'melee', player.position.x, player.position.z, r.world);
        if (landed.amount > 0 && (i === 0 || last)) host.sound(r.hitSound, t.root.position.x, t.root.position.z);
      }
      // Carried round to the next cut.
      if (!last && t) {
        const gap = Math.max(1.1, Math.hypot(player.position.x - t.root.position.x, player.position.z - t.root.position.z));
        const now = Math.atan2(player.position.x - t.root.position.x, player.position.z - t.root.position.z);
        const span = Math.max(0.06, (times[i + 1]! - times[i]!) * 0.75);
        glides.push({ player, target: t, from: now, to: now + turn, gap, t: 0, span, action: id, ctx: r.world.ctx });
      }
    });
  }
}

/** Starts a Rogue move. */
export function castRogue(host: RogueHost, r: RogueCast): void {
  switch (r.def.id) {
    case 'venomDart': return venomDart(r, host);
    case 'plagueVial': return plagueVial(r, host);
    case 'envenomBurst': return envenomBurst(r, host);
    case 'fanOfKnives': return fanOfKnives(r, host);
    case 'throwingSpree': return throwingSpree(r, host);
    case 'whirlingBlades': return razorDash(r, host);
    case 'vanish': return vanish(r, host);
    case 'knifeHalo': return knifeHalo(r, host);
    case 'steelWaltz': return steelWaltz(r, host);
  }
}

// ---------------------------------------------------------------------------
// Looks over the shared families
// ---------------------------------------------------------------------------

/** A Rogue skill the shared families ran, for its own look on top. */
export interface RogueLook {
  def: SkillDef;
  player: Player;
  /** Where the press aimed, on the floor. */
  aim: THREE.Vector3;
  /** Facing toward the aim, flat, unit. */
  dir: THREE.Vector3;
  /** Seconds this use takes. */
  actTime: number;
  num: (key: string, dflt: number) => number;
}

/** Draws what a Rogue skill shows of its own over its family's drawing (`fx/rogue/RogueFX.ts`). */
export function rogueLook(host: RogueHost, l: RogueLook): void {
  switch (l.def.id) {
    case 'deathLotus': return lotusLook(host, l);
    case 'nightfall': return nightfallLook(host, l);
  }
}

/**
 * Death Lotus: a petal on the floor with each cut, on the gesture's cuts as
 * the runner lands them. The first turn lays a cross, the second the
 * diagonals between, so the lotus is whole on the last cut.
 */
function lotusLook(host: RogueHost, l: RogueLook): void {
  const { player, num } = l;
  const hits = Math.max(1, Math.floor(num('hits', 8)));
  const reach = num('reach', num('radius', 2.3));
  const first = player.contactIn;
  const cuts = host.cutTimes(l.def.id, l.actTime, first);
  const gap = Math.min(0.08, (l.actTime * 0.8) / hits);
  const id = player.actionId;
  const yaw0 = Math.atan2(l.dir.x, l.dir.z);
  const turns = Math.ceil(hits / 4);
  for (let i = 0; i < hits; i++) {
    // The same keys the runner lands the blows on (`SkillRunner.cast`, melee).
    const at = i === 0 ? 0 : !cuts ? gap * i : cuts.length === hits - 1 ? cuts[i - 1]! : (cuts[cuts.length - 1]! * i) / (hits - 1);
    const yaw = yaw0 + (Math.PI / 2) * ((i % 4) + 1) + (Math.floor(i / 4) * (Math.PI / 2)) / turns;
    host.later(first + at, () => {
      if (player.actionId !== id || !player.alive) return;
      lotusPetal(host.effects, player.position.x, player.position.z, yaw, reach);
    });
  }
}

/**
 * Nightfall: the curtain of shadow falls as the hands come down. Its
 * gesture's key lands on the release frame (the animator lands it there),
 * and the field is laid on that frame (`SkillRunner`, `RELEASE_CLASSES`).
 */
function nightfallLook(host: RogueHost, l: RogueLook): void {
  const x = l.aim.x;
  const z = l.aim.z;
  const radius = l.num('radius', 9);
  host.later(l.player.releaseIn, () => nightfallCurtain(host.effects, x, z, radius));
}

// ---------------------------------------------------------------------------
// Mirror Gambit
// ---------------------------------------------------------------------------

/**
 * A skill's melee blow just landed on `t` for `amount`: each Shadow Clone
 * within reach blinks beside it and strikes it for `pct`% of the blow, at
 * most once a second each.
 */
export function mirrorStrike(host: RogueHost, world: RogueWorld, t: Target, amount: number, pct: number): void {
  if (amount <= 0 || pct <= 0 || t.life <= 0) return;
  const now = host.now();
  const tx = t.root.position.x;
  const tz = t.root.position.z;
  let n = 0;
  for (const c of host.clones()) {
    if (Math.hypot(c.x - tx, c.z - tz) > 12) continue;
    if (now - (mirrored.get(c.body) ?? -9) < 1) continue;
    mirrored.set(c.body, now);
    // Out of the dark on the far side of it, a little round for each clone.
    const a = Math.atan2(world.player.position.x - tx, world.player.position.z - tz) + Math.PI + (n - 0.5) * 1.1;
    n++;
    const gap = t.hitRadius + 0.9;
    host.effects.teleportOut(c.x, 0.9, c.z, c.color);
    c.x = tx + Math.sin(a) * gap;
    c.z = tz + Math.cos(a) * gap;
    c.body.position.set(c.x, c.body.position.y, c.z);
    c.facing = Math.atan2(tx - c.x, tz - c.z);
    c.body.rotation.y = c.facing;
    host.effects.teleportIn(c.x, 0.9, c.z, c.color);
    c.swing();
    if (t.life <= 0) continue;
    host.land(t, { amount: amount * pct / 100, type: 'physical', crit: false, source: 'player', ability: tr('Mirror Gambit') }, 'minion', c.x, c.z, world);
  }
}

// ---------------------------------------------------------------------------
// Every frame
// ---------------------------------------------------------------------------

function targets(world: RogueWorld): Target[] {
  const list: Target[] = [];
  for (const e of world.enemies) if (e.life > 0) list.push(e);
  if (world.boss && world.boss.life > 0) list.push(world.boss);
  return list;
}

/** Razor Dash cuts `t` the first time the hero comes within reach of it. */
function dashCut(host: RogueHost, d: Dash, t: Target): void {
  if (t.life <= 0 || d.cut.has(t)) return;
  const p = d.player.position;
  if (Math.hypot(t.root.position.x - p.x, t.root.position.z - p.z) > d.width * 0.5 + t.hitRadius + 0.35) return;
  d.cut.add(t);
  const landed = host.land(t, d.packet(), 'melee', p.x, p.z, d.world);
  if (landed.amount > 0 && !d.heard) {
    d.heard = true;
    host.sound(d.hitSound, t.root.position.x, t.root.position.z);
  }
}

/** Cuts what the dash reaches; turns the halo; carries the waltz; drips the coated blades. */
export function tickRogue(host: RogueHost, dt: number): void {
  tickRogueFX(host.effects, host.hero(), dt);
  for (let i = dashes.length - 1; i >= 0; i--) {
    const d = dashes[i]!;
    d.left -= dt;
    if (d.player.alive) {
      for (const e of d.world.enemies) dashCut(host, d, e);
      if (d.world.boss) dashCut(host, d, d.world.boss);
    }
    if (d.left <= 0 || !d.player.alive) dashes.splice(i, 1);
  }

  for (let i = halos.length - 1; i >= 0; i--) {
    const h = halos[i]!;
    h.left -= dt;
    h.accum += dt;
    h.angle = (h.angle + (dt * Math.PI * 2) / HALO_TURN) % (Math.PI * 2);
    const p = h.player.position;
    const ring = h.radius * 0.72;
    for (let k = 0; k < h.knives.length; k++) {
      const a = h.angle + (k * Math.PI * 2) / h.knives.length;
      const s = Math.sin(a);
      const c = Math.cos(a);
      // Point first round the ring, tilted a little, bobbing out of step.
      host.effects.solids.place(h.knives[k]!, p.x + s * ring, 1.05 + 0.12 * Math.sin(a * 3 + h.left * 4), p.z + c * ring, c, -0.12, -s, 0.6, 0.9, 0.9);
    }
    if (h.accum >= h.tick && h.player.alive) {
      h.accum = 0;
      host.area(v2.set(p.x, 0, p.z), h.radius, h.packet, h.world, 'proc');
    }
    if (h.left <= 0 || !h.player.alive) {
      for (const k of h.knives) host.effects.solids.free(k);
      halos.splice(i, 1);
    }
  }

  for (let i = glides.length - 1; i >= 0; i--) {
    const g = glides[i]!;
    if (g.player.actionId !== g.action || !g.player.alive || g.target.life <= 0) {
      glides.splice(i, 1);
      continue;
    }
    g.t = Math.min(g.span, g.t + dt);
    const u = g.t / g.span;
    const e = u * u * (3 - 2 * u);
    const a = g.from + (g.to - g.from) * e;
    const tx = g.target.root.position.x;
    const tz = g.target.root.position.z;
    const nx = tx + Math.sin(a) * g.gap;
    const nz = tz + Math.cos(a) * g.gap;
    // Only where the floor goes: a wall stops the step.
    const p = g.player.position;
    v1.set(nx - p.x, 0, nz - p.z);
    const len = v1.length();
    if (len > 1e-4) {
      v1.multiplyScalar(1 / len);
      if (host.clear(p, v1, len, g.ctx, 0.4) >= len - 0.01) p.set(nx, p.y, nz);
    }
    g.player.faceTowards(tx, tz);
    if (u >= 1) glides.splice(i, 1);
  }
}

/** Ends everything running (a new floor, a death). */
export function clearRogue(host: RogueHost): void {
  for (const h of halos) for (const k of h.knives) host.effects.solids.free(k);
  halos.length = 0;
  dashes.length = 0;
  glides.length = 0;
  clearRogueFX();
}
