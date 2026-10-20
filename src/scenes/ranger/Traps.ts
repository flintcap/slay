/**
 * SLAY — what the Ranger leaves on the floor: the traps, Thorn Barrier, the
 * kestrel, and The Whole Floor Is A Trap.
 *
 * A trap is set where the press aimed (up to its range, never through a
 * wall) on its gesture's release, arms after its arming time and waits. The
 * first enemy close enough springs it. Lay of the Land arms them at once and
 * lets one more of each wait; Huntcraft makes them catch from farther; both
 * make them hit harder (`Volley.trap`, `Shots.arrowHit`). Past the most a
 * kind may have out, the oldest goes.
 *
 * Every blow here lands through the runner's pipeline like an arrow does
 * (`arrowHit`). Traps and the kestrel act for the hero (`minion`), so they
 * do not give a hidden hero away; the swarm's stings and the brambles are
 * side effects (`proc`). Damage per hit is the skill's own: speed never
 * changes it.
 */
import * as THREE from 'three';
import type { DamagePacket, StatusApplication } from '../../types';
import type { Player } from '../../entities/Player';
import { SKILL_BY_ID } from '../../data/skills';
import { skillRank } from '../../sim/Character';
import {
  brambleTouch, brambleWall, kestrelDown, kestrelStoop, kestrelUp, STOOP, swarm, trapArmed, trapEnd, trapLook, trapSpring, type TrapKind,
} from '../../fx/ranger/RangerFX';
import { arrowHit, draw, flat, quiet, rainBlow, targets, type Volley } from './Shots';
import type { RangerCast, RangerHost, RangerWorld, Target } from './RangerTypes';

const _a = new THREE.Vector3();

/** One trap lying in wait. */
interface Trap {
  kind: TrapKind;
  skill: string;
  player: Player;
  x: number;
  z: number;
  /** A wire's line, unit, and its length. */
  dirX: number;
  dirZ: number;
  len: number;
  /** How close an enemy must come to spring it. */
  catchR: number;
  /** How far what it does reaches. */
  radius: number;
  armIn: number;
  left: number;
  look: number;
  v: Volley;
  /** What it leaves on what it catches. */
  riders: StatusApplication[];
  /** Seconds of swarm it lets loose (Wasp Nest). */
  swarm: number;
  tick: number;
}

/** A swarm let loose, stinging everything near it. */
interface Swarm {
  x: number;
  z: number;
  radius: number;
  left: number;
  acc: number;
  tick: number;
  v: Volley;
}

/** Thorn Barrier standing. */
interface Bramble {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  half: number;
  left: number;
  acc: number;
  tick: number;
  v: Volley;
  slow: StatusApplication[];
  bleed: StatusApplication[];
  touched: Set<Target>;
}

/** The kestrel on the wing. */
interface Bird {
  player: Player;
  left: number;
  acc: number;
  every: number;
  reach: number;
  v: Volley;
}

/** What one runner has out on its floor. Each runner keeps its own, so a test arena or an old floor never reaches into this one. */
interface Field {
  traps: Trap[];
  swarms: Swarm[];
  brambles: Bramble[];
  bird: Bird | null;
}
const FIELDS = new WeakMap<RangerHost, Field>();

function fieldOf(host: RangerHost): Field {
  let f = FIELDS.get(host);
  if (!f) {
    f = { traps: [], swarms: [], brambles: [], bird: null };
    FIELDS.set(host, f);
  }
  return f;
}

/** Most of each thing out at once, whatever adds to it (fixed pools behind them). */
const MOST_SWARMS = 6;
const MOST_BRAMBLES = 3;

/** Where a thing thrown at `aim` comes to rest: within `range`, short of a wall. */
function placeAt(host: RangerHost, r: RangerCast, range: number): THREE.Vector3 {
  const p = r.player.position;
  const want = Math.min(range, flat(r.aim, p));
  const lane = host.clear(_a.copy(p).setY(0.5), r.dir, want, r.world.ctx, 0.3);
  return new THREE.Vector3(p.x + r.dir.x * lane, 0, p.z + r.dir.z * lane);
}

/** The fight now, with `player` in it (a trap waits longer than a frame). */
function liveWorld(host: RangerHost, v: Volley): boolean {
  const live = host.live();
  if (!live) return false;
  v.world = { ctx: live.ctx, enemies: live.enemies, boss: live.boss, player: v.player };
  return true;
}

/** Distance on the floor from (x, z) to the segment through (cx, cz) along (dx, dz), `len` long. */
function toSegment(x: number, z: number, cx: number, cz: number, dx: number, dz: number, len: number): number {
  const ox = x - cx;
  const oz = z - cz;
  const along = Math.max(-len / 2, Math.min(len / 2, ox * dx + oz * dz));
  return Math.hypot(ox - dx * along, oz - dz * along);
}

function addTrap(tr: Trap): void {
  const e = tr.player.passives.rgr;
  const def = SKILL_BY_ID[tr.skill];
  const most = Math.max(1, Math.floor(typeof def?.params?.most === 'number' ? def.params.most : 3)) + Math.floor(e.trapExtra);
  const f = fieldOf(tr.v.host);
  const mine = f.traps.filter((o) => o.skill === tr.skill && o.player === tr.player);
  for (let i = 0; i <= mine.length - most; i++) dropTrap(tr.v.host, mine[i]!);
  f.traps.push(tr);
}

function dropTrap(host: RangerHost, tr: Trap): void {
  const list = fieldOf(host).traps;
  const i = list.indexOf(tr);
  if (i >= 0) list.splice(i, 1);
  trapEnd(host.effects, tr.look);
}

/** Snare Trap, Spike Trap, Tripwire and Wasp Nest: set where the press aimed, on the gesture's release. */
export function setTrap(host: RangerHost, r: RangerCast, v: Volley): void {
  const kind: TrapKind = r.def.id === 'snareTrap' ? 'snare' : r.def.id === 'spikeTrap' ? 'spike' : r.def.id === 'tripwire' ? 'wire' : 'wasp';
  const e = r.player.passives.rgr;
  const reach = 1 + e.trapReachPct / 100;
  const k = Math.max(0, r.rank - 1);
  const range = r.num('range', 12);
  const armTime = r.num('arm', 0.5);
  const arm = e.armNow > 0 ? 0 : armTime;
  const life = r.num('life', 25);
  const riders = [...r.riders()];
  let catchR = 2;
  let radius = 2;
  let len = 0;
  let swarmFor = 0;
  let tick = 0.5;
  if (kind === 'snare') {
    radius = r.num('radius', 2) * reach;
    catchR = radius;
  } else if (kind === 'spike') {
    catchR = r.num('plate', 1.2) * reach;
    radius = Math.max(catchR, r.num('radius', 2.6));
  } else if (kind === 'wire') {
    len = r.num('length', 8);
    radius = r.num('width', 1);
    catchR = (radius / 2) * reach;
    riders.push({ id: 'knockedDown', duration: r.num('trip', 1.2) + r.num('tripPerRank', 0.05) * k, magnitude: 1, stacks: 1 });
  } else {
    catchR = r.num('catch', 2) * reach;
    radius = r.num('radius', 3.5);
    swarmFor = r.num('swarm', 5);
    tick = Math.max(0.2, r.num('tick', 0.5));
    // Each sting's poison is its rider (`poisonStacks`).
    r.num('poisonStacks', 1);
  }
  r.num('most', 3);
  draw(r, host, () => {
    const at = placeAt(host, r, range);
    // A wire runs across the line you threw it on.
    const dirX = -r.dir.z;
    const dirZ = r.dir.x;
    const tr: Trap = {
      kind, skill: r.def.id, player: r.player, x: at.x, z: at.z, dirX, dirZ, len, catchR, radius,
      armIn: arm, left: life, look: trapLook(host.effects, kind, at.x, at.z, dirX, dirZ, kind === 'wire' ? len : kind === 'spike' ? catchR : radius, life),
      v, riders, swarm: swarmFor, tick,
    };
    if (arm <= 0) trapArmed(host.effects, tr.look, at.x, at.z);
    addTrap(tr);
  });
}

/**
 * Lay of the Land: an armed Spike Trap where the hero's feet left the floor,
 * at the hero's Spike Trap rank. Nothing without a point in it.
 */
export function footTrap(host: RangerHost, player: Player, at: THREE.Vector3, world: RangerWorld): void {
  const def = SKILL_BY_ID.spikeTrap;
  if (!def || skillRank(player.character, 'spikeTrap') <= 0) return;
  const packet = host.skillPacket(player, 'spikeTrap', world.ctx);
  if (!packet) return;
  const p = def.params ?? {};
  const n = (key: string, d: number): number => (typeof p[key] === 'number' ? (p[key] as number) : d);
  const e = player.passives.rgr;
  const catchR = n('plate', 1.2) * (1 + e.trapReachPct / 100);
  const life = n('life', 25);
  const v: Volley = {
    host, player, world, id: 'spikeTrap', packet, critX: Math.max(100, player.stats.critDamage) / 100,
    school: 'physical', color: 0x8a6a3e, hitSound: 'skill.trap.spring', hits: new Map(), nocked: false, hidden: 0,
    bow: false, multi: false, trap: true, fullLife: 0, heard: false,
  };
  const tr: Trap = {
    kind: 'spike', skill: 'spikeTrap', player, x: at.x, z: at.z, dirX: 1, dirZ: 0, len: 0, catchR,
    radius: Math.max(catchR, n('radius', 2.6)), armIn: 0, left: life,
    look: trapLook(host.effects, 'spike', at.x, at.z, 1, 0, catchR, life), v, riders: [], swarm: 0, tick: 0.5,
  };
  trapArmed(host.effects, tr.look, at.x, at.z);
  addTrap(tr);
}

/** A trap goes off: what it does to what is near it. */
function spring(host: RangerHost, tr: Trap): void {
  dropTrap(host, tr);
  const v = tr.v;
  if (!liveWorld(host, v)) return;
  trapSpring(host.effects, tr.kind, tr.x, tr.z, tr.dirX, tr.dirZ, tr.kind === 'wire' ? tr.len : tr.radius);
  host.sound(v.hitSound, tr.x, tr.z);
  v.heard = true;
  quiet(host, () => {
    if (tr.kind === 'snare') {
      // A noose holds; it does not cut.
      for (const t of targets(v.world)) {
        if (flat(t.root.position, tr) > tr.radius + t.hitRadius) continue;
        t.applyStatuses(tr.riders, v.world.ctx);
      }
    } else if (tr.kind === 'spike') {
      rainBlow(v, tr.x, tr.z, tr.radius, 1, 'minion', false);
    } else if (tr.kind === 'wire') {
      for (const t of targets(v.world)) {
        const d = toSegment(t.root.position.x, t.root.position.z, tr.x, tr.z, tr.dirX, tr.dirZ, tr.len);
        if (d > tr.radius + t.hitRadius) continue;
        const pk = v.packet(1);
        pk.applies = [...(pk.applies ?? []), ...tr.riders.filter((a) => !(pk.applies ?? []).some((b) => b.id === a.id))];
        arrowHit(v, t, pk, { kind: 'minion', fromX: tr.x, fromZ: tr.z, sure: true, arrow: false });
      }
    } else {
      const swarms = fieldOf(host).swarms;
      if (swarms.length >= MOST_SWARMS) swarms.shift();
      swarms.push({ x: tr.x, z: tr.z, radius: tr.radius, left: tr.swarm, acc: tr.tick, tick: tr.tick, v });
    }
  });
}

/** One sting of a swarm over everything in it. */
function sting(host: RangerHost, s: Swarm): void {
  const v = s.v;
  if (!liveWorld(host, v)) return;
  swarm(host.effects, s.x, s.z, s.radius);
  quiet(host, () => {
    for (const t of targets(v.world)) {
      if (flat(t.root.position, s) > s.radius + t.hitRadius) continue;
      arrowHit(v, t, v.packet(1), { kind: 'proc', fromX: s.x, fromZ: s.z, sure: true, arrow: false });
    }
  });
}

/** Thorn Barrier: brambles in a wall across the aimed point. */
export function thornBarrier(host: RangerHost, r: RangerCast, v: Volley): void {
  const k = Math.max(0, r.rank - 1);
  const range = r.num('range', 14);
  const len = r.num('length', 7);
  const width = r.num('width', 1.4);
  const sec = r.num('duration', 6) + r.num('durationPerRank', 0.2) * k;
  const tick = Math.max(0.2, r.num('tick', 0.5));
  const slowPct = r.num('slow', 30);
  r.num('bleedStacks', 2);
  // Its riders: the slow held only while in it, the bleed on its first touch.
  const riders = r.riders();
  const slow: StatusApplication[] = riders.filter((a) => a.id === 'slowed').map((a) => ({ ...a, duration: tick + 0.4 }));
  if (!slow.length) slow.push({ id: 'slowed', duration: tick + 0.4, magnitude: 1, stacks: 1, mods: { moveSpeed: -slowPct } });
  const bleed = riders.filter((a) => a.id !== 'slowed');
  draw(r, host, () => {
    const at = placeAt(host, r, range);
    const dx = -r.dir.z;
    const dz = r.dir.x;
    const b: Bramble = {
      ax: at.x - dx * len / 2, az: at.z - dz * len / 2, bx: at.x + dx * len / 2, bz: at.z + dz * len / 2,
      half: width / 2, left: sec, acc: tick, tick, v, slow, bleed, touched: new Set(),
    };
    const brambles = fieldOf(host).brambles;
    if (brambles.length >= MOST_BRAMBLES) brambles.shift();
    brambles.push(b);
    brambleWall(host.effects, b.ax, b.az, b.bx, b.bz, width, sec);
    host.sound(v.hitSound, at.x, at.z);
    v.heard = true;
  });
}

function thornTick(host: RangerHost, b: Bramble): void {
  const v = b.v;
  if (!liveWorld(host, v)) return;
  const cx = (b.ax + b.bx) / 2;
  const cz = (b.az + b.bz) / 2;
  const len = Math.hypot(b.bx - b.ax, b.bz - b.az);
  const dx = len > 0 ? (b.bx - b.ax) / len : 1;
  const dz = len > 0 ? (b.bz - b.az) / len : 0;
  quiet(host, () => {
    for (const t of targets(v.world)) {
      const d = toSegment(t.root.position.x, t.root.position.z, cx, cz, dx, dz, len);
      if (d > b.half + t.hitRadius) continue;
      const first = !b.touched.has(t);
      b.touched.add(t);
      const pk: DamagePacket = v.packet(1);
      pk.applies = first ? [...b.slow, ...b.bleed] : b.slow;
      arrowHit(v, t, pk, { kind: 'proc', fromX: t.root.position.x, fromZ: t.root.position.z, sure: true, arrow: false });
      if (first) brambleTouch(host.effects, t.root.position.x, t.root.position.z);
    }
  });
}

/** Kestrel: a bird over the hero that stoops on what you hunt. Cast again, it stays on longer. */
export function kestrel(host: RangerHost, r: RangerCast, v: Volley): void {
  const k = Math.max(0, r.rank - 1);
  const sec = r.num('duration', 30) + r.num('durationPerRank', 1) * k;
  const every = Math.max(0.3, r.num('every', 1.4));
  const reach = r.num('reach', 14);
  r.player.beginAction(r.clip, r.actTime);
  host.sound(r.castSound, r.player.position.x, r.player.position.z);
  fieldOf(host).bird = { player: r.player, left: sec, acc: every * 0.5, every, reach, v };
  kestrelUp(host.effects, r.player, sec);
}

/** The bird's next stoop: marked prey first, then the nearest. */
function stoop(host: RangerHost, b: Bird): void {
  const v = b.v;
  if (!liveWorld(host, v)) return;
  const p = b.player.position;
  let best: Target | null = null;
  let bestD = Infinity;
  for (const t of targets(v.world)) {
    const d = flat(t.root.position, p) - t.hitRadius;
    if (d > b.reach) continue;
    const score = d - (t.hasStatus('marked') ? 1000 : 0);
    if (score < bestD) {
      bestD = score;
      best = t;
    }
  }
  if (!best) return;
  const prey = best;
  kestrelStoop(prey.root.position.x, prey.root.position.z);
  host.later(STOOP, () => {
    if (prey.life <= 0 || !b.player.alive || !liveWorld(host, v)) return;
    v.heard = false;
    quiet(host, () => arrowHit(v, prey, v.packet(1), { kind: 'minion', fromX: p.x, fromZ: p.z, arrow: false }));
  });
}

/**
 * The Whole Floor Is A Trap: every trap you have out goes off at once, and
 * steel bursts round you.
 */
export function wholeFloor(host: RangerHost, r: RangerCast, v: Volley): void {
  const radius = r.num('radius', 8);
  draw(r, host, () => {
    for (const tr of fieldOf(host).traps.filter((o) => o.player === r.player)) spring(host, tr);
    const p = r.player.position;
    trapSpring(host.effects, 'spike', p.x, p.z, 1, 0, radius * 0.6);
    host.sound(r.hitSound, p.x, p.z);
    v.heard = true;
    rainBlow(v, p.x, p.z, radius, 1, 'area', false);
  });
}

/** The traps' waits, the swarms, the brambles and the bird. */
export function tickTraps(host: RangerHost, dt: number): void {
  const live = host.live();
  const f = fieldOf(host);
  const { traps, swarms, brambles } = f;
  for (let i = traps.length - 1; i >= 0; i--) {
    const tr = traps[i];
    // Springing one can set off or drop others (The Whole Floor).
    if (!tr) continue;
    tr.left -= dt;
    if (tr.left <= 0 || !tr.player.alive) {
      dropTrap(host, tr);
      continue;
    }
    if (tr.armIn > 0) {
      tr.armIn -= dt;
      if (tr.armIn <= 0) trapArmed(host.effects, tr.look, tr.x, tr.z);
      continue;
    }
    if (!live) continue;
    let caught = false;
    for (const t of targets(live)) {
      const d = tr.kind === 'wire'
        ? toSegment(t.root.position.x, t.root.position.z, tr.x, tr.z, tr.dirX, tr.dirZ, tr.len)
        : flat(t.root.position, tr);
      if (d <= tr.catchR + t.hitRadius) {
        caught = true;
        break;
      }
    }
    if (caught) spring(host, tr);
  }
  for (let i = swarms.length - 1; i >= 0; i--) {
    const s = swarms[i]!;
    s.left -= dt;
    s.acc += dt;
    if (s.acc >= s.tick) {
      s.acc -= s.tick;
      sting(host, s);
    }
    if (s.left <= 0) swarms.splice(i, 1);
  }
  for (let i = brambles.length - 1; i >= 0; i--) {
    const b = brambles[i]!;
    b.left -= dt;
    b.acc += dt;
    if (b.acc >= b.tick) {
      b.acc -= b.tick;
      thornTick(host, b);
    }
    if (b.left <= 0) brambles.splice(i, 1);
  }
  if (f.bird) {
    const b = f.bird;
    b.left -= dt;
    b.acc += dt;
    if (b.left <= 0 || !b.player.alive) {
      f.bird = null;
      kestrelDown(host.effects);
    } else if (b.acc >= b.every) {
      b.acc -= b.every;
      stoop(host, b);
    }
  }
}

/** Ends everything on the floor (a new floor). */
export function clearTraps(host: RangerHost): void {
  const f = fieldOf(host);
  for (const tr of f.traps) trapEnd(host.effects, tr.look);
  f.traps.length = 0;
  f.swarms.length = 0;
  f.brambles.length = 0;
  f.bird = null;
}
