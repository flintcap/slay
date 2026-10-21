/**
 * SLAY — the Ranger's arrows: every shot from the bow, and what happens to
 * each arrow where it lands.
 *
 * An arrow leaves the bow on its gesture's release frame and strikes each
 * enemy on its line when it gets there, nearest first (`loose`). Where it
 * lands, `arrowHit` adds what the Ranger's passives say before the blow goes
 * through the runner's pipeline: Fletcher's Art, Arrowsmith and Huntcraft's
 * more damage, Long Eye's range, Through and Through's pierce, Close
 * Grouping, Clean Kill's and Roll Away's sure crits, Open Season's and
 * Camouflage's harder crits; and after it, Murmuration's split.
 *
 * Rains fall as one blow a beat after the loose, where they come down.
 * Damage per hit is the skill's own: speed never changes it.
 */
import * as THREE from 'three';
import type { DamagePacket, StatusApplication } from '../../types';
import type { Player } from '../../entities/Player';
import type { HitKind } from '../../fx/CombatFeel';
import type { School } from '../../fx/Effects';
import { tr } from '../../core/I18n';
import { addBonus } from '../../sim/Combat';
import { rainVolley, shatter, splinterFly, thicketStand, clearThickets } from '../../fx/ranger/RangerFX';
import { EXTRA, PIERCE_ALL, type RangerCast, type RangerHost, type RangerWorld, type Target } from './RangerTypes';

const UP = new THREE.Vector3(0, 1, 0);
const _to = new THREE.Vector3();

/** "Two more (+1 every 7 ranks)". */
export const perRanks = (base: number, per: number, rank: number): number => base + (per > 0 ? Math.floor(rank / per) : 0);

/** Every living target in the fight. */
export function targets(world: { enemies: RangerWorld['enemies']; boss: RangerWorld['boss'] }): Target[] {
  const list: Target[] = [];
  for (const e of world.enemies) if (e.life > 0) list.push(e);
  if (world.boss && world.boss.life > 0) list.push(world.boss);
  return list;
}

/** Every living target, into `out` (cleared first): for per-frame code, which must not allocate. */
export function targetsInto(world: { enemies: RangerWorld['enemies']; boss: RangerWorld['boss'] }, out: Target[]): Target[] {
  out.length = 0;
  for (const e of world.enemies) if (e.life > 0) out.push(e);
  if (world.boss && world.boss.life > 0) out.push(world.boss);
  return out;
}

/** Runs `fn` with the effects silent: a skill sounds only its own recordings. */
export function quiet<T>(host: RangerHost, fn: () => T): T {
  host.effects.beginQuiet();
  try {
    return fn();
  } finally {
    host.effects.endQuiet();
  }
}

/** Where an arrow leaves the bow: chest high, a hand to the bow side. */
export function bowHand(player: Player, dir: THREE.Vector3): THREE.Vector3 {
  return player.position.clone().setY(1.28).addScaledVector(_to.set(dir.z, 0, -dir.x), 0.16);
}

/** Flat ground distance. */
export const flat = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

// ---------------------------------------------------------------------------
// One use of a skill, and what each of its arrows adds where it lands
// ---------------------------------------------------------------------------

/** One use of a skill (or one plain shot): what every arrow of it shares. */
export interface Volley {
  host: RangerHost;
  player: Player;
  world: RangerWorld;
  /** The skill, or null for a plain shot. */
  id: string | null;
  packet: (mult?: number) => DamagePacket;
  critX: number;
  school: School;
  color: number;
  shed?: string;
  hitSound: string | null;
  /** Close Grouping: arrows of this use that have struck each enemy. */
  hits: Map<Target, number>;
  /** Roll Away's nocked arrow: every arrow of this use is a critical hit. */
  nocked: boolean;
  /** Camouflage: loosed from hiding, for this much more critical damage (0 when not). */
  hidden: number;
  /** Fletcher's Art, Arrowsmith and Huntcraft count it. */
  bow: boolean;
  multi: boolean;
  trap: boolean;
  /** One Shot, One Grave: more damage, in percent, to an enemy at full life. */
  fullLife: number;
  /** The hit sound plays once a use. */
  heard: boolean;
}

/** What one runner's shots leave behind: the thickets standing, Murmuration's arrows in the air. */
interface ShotField {
  thickets: Thicket[];
  scattered: number;
}
const SHOT_FIELDS = new WeakMap<RangerHost, ShotField>();

function shotsOf(host: RangerHost): ShotField {
  let f = SHOT_FIELDS.get(host);
  if (!f) {
    f = { thickets: [], scattered: 0 };
    SHOT_FIELDS.set(host, f);
  }
  return f;
}

export interface HitOpts {
  kind?: HitKind;
  fromX: number;
  fromZ: number;
  /** Enemies this arrow has already passed through (Through and Through). */
  passes?: number;
  /** A blow that cannot miss: a volley from the sky, a shaft down a line, a splinter. */
  sure?: boolean;
  /** An arrow (Long Eye, Clean Kill, Murmuration): false for a trap or a stoop. */
  arrow?: boolean;
  /** How many times this arrow has scattered already (Murmuration). */
  depth?: number;
  /** Who this scattering has struck, so a split never doubles back. */
  chain?: Set<Target>;
}

/**
 * One blow of the Ranger's on one target, with his passives on it, through
 * the runner's pipeline. Returns what landed (amount 0 on a miss).
 */
export function arrowHit(v: Volley, t: Target, pk: DamagePacket, o: HitOpts): DamagePacket {
  if (t.life <= 0) return { ...pk, amount: 0, crit: false };
  const e = v.player.passives;
  const g = e.rgr;
  const arrow = o.arrow !== false;
  // His bonuses add into the hit's one pile (`addBonus`), never on top of it.
  let bonus = 0;
  if (v.bow) bonus += e.rgr.bowPct;
  if (v.multi) bonus += g.multiPct;
  if (v.trap) bonus += g.trapPct;
  // Long Eye: further is harder, up to its cap.
  if (arrow && g.longPerM > 0) {
    const d = flat(v.player.position, t.root.position) - t.hitRadius;
    bonus += Math.min(g.longCap, g.longPerM * Math.max(0, d - g.longFrom));
  }
  // Through and Through: each enemy already passed drives it harder.
  if (g.pierceAll > 0 && (o.passes ?? 0) > 0) bonus += Math.min(g.passCap, g.passPct * (o.passes ?? 0));
  // Close Grouping: arrows of one use after the first into the same enemy.
  if (g.groupPct > 0 && v.id) {
    const n = v.hits.get(t) ?? 0;
    if (n > 0) bonus += g.groupPct;
    v.hits.set(t, n + 1);
  }
  const whole = t.life >= t.maxLife * 0.999;
  if (v.fullLife > 0 && whole) bonus += v.fullLife;

  const piled = addBonus(pk.amount, pk.pile ?? 1, bonus);
  let amount = piled.amount;
  let crit = pk.crit;
  const force = (): void => {
    if (crit) return;
    crit = true;
    amount *= v.critX;
  };
  let more = 0;
  if (v.nocked) force();
  if (v.hidden > 0) {
    force();
    more += v.hidden;
  }
  // Clean Kill: the first arrow into an enemy at full life.
  if (arrow && g.cleanCritDmg > 0 && whole) {
    force();
    more += g.cleanCritDmg;
  }
  // Arrowsmith: a little more critical chance with volleys and rains.
  if (v.multi && g.multiCrit > 0 && !crit && v.world.ctx.rng.chance(Math.min(1, g.multiCrit / 100))) force();
  if (crit && g.openCritDmg > 0 && t.hasStatus('marked')) more += g.openCritDmg;
  if (crit && more > 0) amount *= (v.critX + more / 100) / v.critX;

  const before = t.life;
  const landed = v.host.land(t, amount === pk.amount && crit === pk.crit ? pk : { ...pk, amount, crit, pile: piled.pile }, o.kind ?? 'projectile', o.fromX, o.fromZ, v.world, o.sure);
  if (landed.amount > 0 && !v.heard) {
    v.heard = true;
    v.host.sound(v.hitSound, t.root.position.x, t.root.position.z);
  }
  // Murmuration: an arrow that kills scatters.
  if (arrow && before > 0 && t.life <= 0 && landed.amount > 0 && g.murmurShare > 0 && (o.depth ?? 0) < g.murmurDepth) {
    scatter(v, t, landed.amount * (g.murmurShare / 100), (o.depth ?? 0) + 1, o.chain ?? new Set([t]));
  }
  return landed;
}

/** Seconds a scattered arrow flies a metre. */
const SCATTER_SPEED = 30;

/** Murmuration: the killing arrow splits into arrows at the nearest enemies still standing. */
function scatter(v: Volley, dead: Target, share: number, depth: number, chain: Set<Target>): void {
  const g = v.player.passives.rgr;
  const at = dead.root.position.clone();
  const near = targets(v.world)
    .filter((t) => !chain.has(t) && flat(t.root.position, at) <= g.murmurReach + t.hitRadius)
    .sort((a, b) => flat(a.root.position, at) - flat(b.root.position, at));
  const n = Math.min(near.length, Math.max(0, Math.floor(g.murmurSplit)));
  const field = shotsOf(v.host);
  for (let i = 0; i < n; i++) {
    if (field.scattered >= g.murmurMost) return;
    const t = near[i]!;
    chain.add(t);
    field.scattered++;
    const from = at.clone().setY(1.1);
    const to = t.root.position.clone().setY(1.0);
    quiet(v.host, () => v.host.effects.projectile(from, to, {
      element: v.school, color: v.color, shape: 'arrow', flare: false, speed: SCATTER_SPEED, size: 0.24, impact: false,
    }));
    v.host.later(flat(from, to) / SCATTER_SPEED, () => {
      field.scattered = Math.max(0, field.scattered - 1);
      if (t.life <= 0 || !v.player.alive) return;
      const before = t.life;
      const pk: DamagePacket = { amount: share, type: 'physical', crit: false, source: 'player', ability: tr('Murmuration') };
      if (!v.host.strike(t, pk, 'proc', at.x, at.z, v.world)) return;
      if (before > 0 && t.life <= 0 && depth < g.murmurDepth) scatter(v, t, share * (g.murmurShare / 100), depth + 1, chain);
    });
  }
}

/** A Volley for one press of a skill. */
export function volleyOf(host: RangerHost, r: RangerCast, flags: { nocked: boolean; hidden: number; bow: boolean; multi: boolean; trap: boolean }): Volley {
  return {
    host, player: r.player, world: r.world, id: r.def.id, packet: r.packet, critX: r.critX,
    school: r.school, color: r.color, shed: r.shed, hitSound: r.hitSound, hits: new Map(),
    nocked: flags.nocked, hidden: flags.hidden, bow: flags.bow, multi: flags.multi, trap: flags.trap,
    fullLife: r.num('fullLife', 0), heard: false,
  };
}

// ---------------------------------------------------------------------------
// One arrow down its line
// ---------------------------------------------------------------------------

/** One arrow: where it starts, how it flies, what it passes through. */
export interface Loose {
  from: THREE.Vector3;
  dir: THREE.Vector3;
  range: number;
  speed: number;
  /** How many enemies it passes through before it stops in the next (99: the whole line). */
  pierce: number;
  /** Lane width in metres. */
  width?: number;
  size?: number;
  sure?: boolean;
  mult?: number;
  /** It strikes nothing itself: it stops in the first enemy and `onEnd` does the work (a burst). */
  harmless?: boolean;
  /** Enemies this arrow will not strike (a bank's leg, a splinter's own enemy). */
  skip?: ReadonlySet<Target>;
  /** Seconds it has already flown before `from` (a bank's later leg). */
  delay?: number;
  /** After each enemy it strikes lands. */
  onStrike?: (t: Target, landed: DamagePacket, i: number) => void;
  /** When it arrives where it stops, and the enemy it stopped in (null for a wall or its range). */
  onEnd?: (at: THREE.Vector3, stopped: Target | null) => void;
  /** Riders in place of the skill's own. */
  applies?: StatusApplication[];
  element?: School;
  color?: number;
  shed?: string;
}

/** Enemies on a lane from `from` along `dir`, nearest first, with how far along each is met. */
export function onLane(world: RangerWorld, from: THREE.Vector3, dir: THREE.Vector3, lane: number, width: number, skip?: ReadonlySet<Target>): Array<{ t: Target; at: number }> {
  const out: Array<{ t: Target; at: number }> = [];
  for (const t of targets(world)) {
    if (skip?.has(t)) continue;
    _to.copy(t.root.position).sub(from).setY(0);
    const along = _to.dot(dir);
    if (along < 0 || along > lane + t.hitRadius) continue;
    const perp = Math.sqrt(Math.max(0, _to.lengthSq() - along * along));
    if (perp > width * 0.5 + t.hitRadius) continue;
    out.push({ t, at: Math.max(0, along - t.hitRadius) });
  }
  out.sort((a, b) => a.at - b.at);
  return out;
}

/**
 * Looses one arrow. It passes through `pierce` enemies and stops in the
 * next, striking each as it gets there; with nothing left to hit it flies on
 * to the wall or its range. Returns where it stops and whom it will strike.
 */
export function loose(v: Volley, o: Loose): { stop: number; struck: Target[] } {
  const host = v.host;
  const lane = host.clear(o.from, o.dir, o.range, v.world.ctx, 0.3);
  const most = 1 + Math.max(0, Math.floor(o.pierce));
  const hits = onLane(v.world, o.from, o.dir, lane, o.width ?? 0.6, o.skip);
  if (hits.length > most) hits.length = most;
  const stopped = hits.length === most ? hits[most - 1]!.t : null;
  const stop = stopped ? Math.min(lane, hits[most - 1]!.at + 0.3) : lane;
  const speed = Math.max(1, o.speed);
  const delay = o.delay ?? 0;
  const from = o.from.clone();
  const dir = o.dir.clone();
  const to = from.clone().addScaledVector(dir, stop);
  const fly = (): void => {
    quiet(host, () => host.effects.projectile(from, to, {
      element: o.element ?? v.school, color: o.color ?? v.color, shape: 'arrow', shed: o.shed ?? v.shed, flare: false, speed, size: o.size ?? 0.28,
    }));
  };
  if (delay > 0) host.later(delay, fly);
  else fly();
  if (!o.harmless) hits.forEach(({ t, at }, i) => {
    host.later(delay + at / speed, () => {
      if (t.life <= 0 || !v.player.alive) return;
      const pk = v.packet(o.mult ?? 1);
      if (o.applies) pk.applies = o.applies;
      const landed = quiet(host, () => arrowHit(v, t, pk, { fromX: from.x, fromZ: from.z, passes: i, sure: o.sure }));
      o.onStrike?.(t, landed, i);
    });
  });
  if (o.onEnd) {
    const end = o.onEnd;
    host.later(delay + stop / speed, () => quiet(host, () => end(to.clone(), stopped && stopped.life > 0 ? stopped : null)));
  }
  return { stop, struck: hits.map((h) => h.t) };
}

/** Pierce for a single arrow: Through and Through makes it pass through all. */
function singlePierce(v: Volley): number {
  return v.player.passives.rgr.pierceAll > 0 ? 99 : 0;
}

// ---------------------------------------------------------------------------
// The shots
// ---------------------------------------------------------------------------

/** The share of a heavy draw at which the string goes. */
const AIMED_RELEASE = 0.55;
const GRAVE_RELEASE = 0.6;

/**
 * Begins the shot's action, its string let go on its gesture's release, and
 * runs `fn` there with the seconds from the action's start to that release
 * (a gesture's later loosings count from it, `cutTimes`).
 */
export function draw(r: RangerCast, host: RangerHost, fn: (first: number) => void, share?: number): void {
  r.player.beginAction(r.clip, r.actTime, undefined, { release: true, ...(share ? { releaseShare: share } : {}) });
  const first = r.player.releaseIn;
  // A heavy draw's recording starts with the creak of the draw: begun early,
  // its string goes with the release.
  const lead = DRAW_LEAD[r.castSound ?? ''] ?? 0;
  if (lead > 0) {
    const id = r.player.actionId;
    host.later(Math.max(0, first - lead), () => {
      if (r.player.actionId !== id || !r.player.alive) return;
      host.sound(r.castSound, r.player.position.x, r.player.position.z);
    });
  }
  host.atRelease(r.player, () => {
    const p = r.player.position;
    if (lead <= 0) host.sound(r.castSound, p.x, p.z);
    quiet(host, () => fn(first));
  });
}

/** Seconds into each heavy draw's recording that its string goes (`tools/audio`). */
const DRAW_LEAD: Readonly<Record<string, number>> = {
  'skill.bow.heavy': 0.38,
  'skill.bow.grave': 0.42,
  'skill.bow.quarry': 0.38,
};

/** Pierce Shot and One Shot, One Grave: one shaft through the whole line. */
function lineShot(v: Volley, r: RangerCast, share?: number): void {
  const dir = r.dir.clone();
  draw(r, v.host, () => {
    loose(v, {
      from: bowHand(r.player, dir), dir, range: r.num('range', 22), speed: r.num('speed', 40),
      pierce: Math.floor(r.num('pierce', 99)), width: 0.6, sure: true, size: r.def.id === 'oneShot' ? 0.36 : 0.3,
    });
  }, share);
}

/** Aimed Shot, Bleeding Arrow, Crippling Shot: one arrow into the first enemy on its line. */
function singleShot(v: Volley, r: RangerCast, share?: number): void {
  const dir = r.dir.clone();
  draw(r, v.host, () => {
    loose(v, {
      from: bowHand(r.player, dir), dir, range: r.num('range', 20), speed: r.num('speed', 38),
      pierce: PIERCE_ALL.has(r.def.id) ? singlePierce(v) : 0, size: r.def.id === 'aimedShot' ? 0.34 : 0.28,
    });
  }, share);
}

/** Splinter Shot: it shatters in the first enemy, and splinters spray on through a cone behind it. */
function splinterShot(v: Volley, r: RangerCast): void {
  const dir = r.dir.clone();
  const count = Math.max(1, Math.floor(r.num('splinters', 6)));
  const cone = r.num('cone', 0.7);
  const reach = r.num('reach', 6);
  const share = r.num('splinterShare', 35) / 100;
  draw(r, v.host, () => {
    loose(v, {
      from: bowHand(r.player, dir), dir, range: r.num('range', 20), speed: r.num('speed', 36), pierce: 0,
      onEnd: (at, stopped) => {
        if (!stopped) return;
        shatter(v.host.effects, at.x, at.z, dir);
        const skip = new Set<Target>([stopped]);
        const from = at.clone().setY(1.1);
        for (let i = 0; i < count; i++) {
          const a = count === 1 ? 0 : (i / (count - 1) - 0.5) * cone;
          const d = dir.clone().applyAxisAngle(UP, a);
          const lane = v.host.clear(from, d, reach, v.world.ctx, 0.2);
          const hit = onLane(v.world, from, d, lane, 0.5, skip)[0];
          const stop = hit ? hit.at + 0.2 : lane;
          splinterFly(v.host.effects, from, d, stop);
          if (!hit) continue;
          skip.add(hit.t);
          v.host.later(stop / 32, () => {
            if (hit.t.life <= 0) return;
            quiet(v.host, () => arrowHit(v, hit.t, v.packet(share), { fromX: from.x, fromZ: from.z, sure: true }));
          });
        }
      },
    });
  });
}

/** Bank Shot: off the walls, striking everything on every leg. */
function bankShot(v: Volley, r: RangerCast): void {
  const dir0 = r.dir.clone();
  const banks = Math.max(0, Math.floor(perRanks(r.num('banks', 2), r.num('banksPerRanks', 7), r.rank)));
  const total = r.num('range', 26);
  const speed = Math.max(1, r.num('speed', 38));
  const pierce = Math.floor(r.num('pierce', 99));
  draw(r, v.host, () => {
    let from = bowHand(r.player, dir0);
    const dir = dir0.clone();
    let left = total;
    let flown = 0;
    for (let leg = 0; leg <= banks && left > 0.5; leg++) {
      const asked = left;
      const { stop } = loose(v, { from, dir: dir.clone(), range: asked, speed, pierce, sure: true, delay: flown / speed });
      left -= stop;
      flown += stop;
      // It flew its whole range, or stopped in an enemy: no wall to glance off.
      if (stop >= asked - 0.05 || left <= 0.5 || leg === banks) break;
      if (v.host.clear(from, dir, asked, v.world.ctx, 0.3) > stop + 0.05) break;
      // Off the wall: which way it faces is the way a short step can still go.
      const at = from.clone().addScaledVector(dir, Math.max(0, stop - 0.25));
      const fx = _to.set(-dir.x, 0, dir.z);
      const xOpen = v.host.clear(at, fx, 0.8, v.world.ctx, 0.2) > 0.6;
      const fz = new THREE.Vector3(dir.x, 0, -dir.z);
      const zOpen = v.host.clear(at, fz, 0.8, v.world.ctx, 0.2) > 0.6;
      if (xOpen && !zOpen) dir.x = -dir.x;
      else if (zOpen && !xOpen) dir.z = -dir.z;
      else {
        dir.x = -dir.x;
        dir.z = -dir.z;
      }
      from = at;
    }
  });
}

/** Quarry's End: an arrow at every marked enemy in reach, each a critical hit that spends the mark. */
function quarrysEnd(v: Volley, r: RangerCast): void {
  const range = r.num('range', 25);
  const most = Math.max(1, Math.floor(r.num('most', 6)));
  const speed = r.num('speed', 40);
  const p = r.player.position;
  let quarry = targets(r.world)
    .filter((t) => t.hasStatus('marked') && flat(t.root.position, p) <= range + t.hitRadius)
    .sort((a, b) => flat(a.root.position, p) - flat(b.root.position, p));
  if (!quarry.length) {
    const aimed = nearestTo(r.world, r.aim, 3, p, range);
    quarry = aimed ? [aimed] : [];
  }
  if (quarry.length > most) quarry.length = most;
  const pierce = singlePierce(v);
  draw(r, v.host, () => {
    if (!quarry.length) {
      // Nothing to hunt: the arrow goes where it was aimed.
      loose(v, { from: bowHand(r.player, r.dir), dir: r.dir.clone(), range, speed, pierce: 0 });
      return;
    }
    quarry.forEach((t, i) => {
      v.host.later(i * 0.05, () => {
        if (t.life <= 0 || !r.player.alive) return;
        const d = _to.copy(t.root.position).sub(r.player.position).setY(0);
        if (d.lengthSq() < 1e-6) d.copy(r.dir);
        d.normalize();
        const dir = d.clone();
        const reach = flat(t.root.position, r.player.position) + t.hitRadius;
        // It flies over the rest to its own quarry, or through them with Through and Through.
        const skip = pierce > 0 ? undefined : new Set(targets(r.world).filter((o) => o !== t));
        quiet(v.host, () => loose(v, {
          from: bowHand(r.player, dir), dir, range: reach, speed, pierce, skip,
          onStrike: (struck) => {
            if (struck === t) t.consumeStatus('marked');
          },
        }));
      });
    });
  });
}

/** The enemy nearest `at` within `radius`, no further than `reach` from the hero. */
export function nearestTo(world: RangerWorld, at: { x: number; z: number }, radius: number, hero: { x: number; z: number }, reach: number): Target | null {
  let best: Target | null = null;
  let bestD = Infinity;
  for (const t of targets(world)) {
    if (flat(t.root.position, hero) - t.hitRadius > reach) continue;
    const d = flat(t.root.position, at) - t.hitRadius;
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best && bestD <= radius ? best : null;
}

/** How many arrows a volley looses: its own, Volley Mastery's and Open Quiver's. */
export function arrowsOf(r: RangerCast, base: number): number {
  if (!EXTRA.has(r.def.id)) return base;
  const quiver = r.player.status.has('skill.openQuiver') ? (quiverArrows.get(r.player) ?? 0) : 0;
  const extra = Math.floor(r.player.passives.extraArrows) + quiver;
  return Math.min(base + extra, base + 6, 24);
}

/** Open Quiver's extra arrows on each hero, read from the skill when cast. */
const quiverArrows = new WeakMap<Player, number>();
export function setQuiverArrows(player: Player, n: number): void {
  quiverArrows.set(player, n);
}

/** Twin Shot: arrows a breath apart, side by side. */
function twinShot(v: Volley, r: RangerCast): void {
  const dir = r.dir.clone();
  const n = arrowsOf(r, Math.max(1, Math.floor(r.num('count', 2))));
  const spread = r.num('spread', 0.14);
  const range = r.num('range', 20);
  const speed = r.num('speed', 36);
  draw(r, v.host, (first) => {
    // The draw's own action: a new one (a roll, another skill) stops the rest.
    const id = r.player.actionId;
    const cuts = v.host.cutTimes(r.def.id, r.actTime, first) ?? [0.12];
    for (let i = 0; i < n; i++) {
      // Half on the first loose, half on the second, each pair a touch apart.
      const wave = i % 2;
      const at = wave === 0 ? 0 : (cuts[0] ?? 0.12);
      const a = (i - (n - 1) / 2) * spread;
      v.host.later(at, () => {
        if (r.player.actionId !== id || !r.player.alive) return;
        const d = dir.clone().applyAxisAngle(UP, a);
        quiet(v.host, () => loose(v, { from: bowHand(r.player, d), dir: d, range, speed, pierce: 0 }));
      });
    }
  });
}

/** Fan Fire and Arrow Wheel: arrows fanned across an arc in one sweep, each into the first enemy it meets. */
function fan(v: Volley, r: RangerCast, count: number, arc: number, range: number, speed: number, whole: boolean): void {
  const dir = r.dir.clone();
  draw(r, v.host, () => {
    for (let i = 0; i < count; i++) {
      const a = whole ? (i / count) * Math.PI * 2 : count === 1 ? 0 : (i / (count - 1) - 0.5) * arc;
      const d = dir.clone().applyAxisAngle(UP, a);
      const go = (): void => {
        loose(v, { from: whole ? r.player.position.clone().setY(1.2) : bowHand(r.player, d), dir: d, range, speed, pierce: 0 });
      };
      if (i === 0) go();
      else v.host.later(i * (whole ? 0.012 : 0.025), () => quiet(v.host, go));
    }
  });
}

/** Scattershot: short arrows sprayed from the hip, each into the first enemy it meets. */
function scattershot(v: Volley, r: RangerCast): void {
  const dir = r.dir.clone();
  const n = arrowsOf(r, Math.max(1, Math.floor(r.num('arrows', 6))));
  const arc = r.num('arc', 0.8);
  const range = r.num('range', 8);
  const rng = r.world.ctx.rng;
  draw(r, v.host, () => {
    for (let i = 0; i < n; i++) {
      const a = (n === 1 ? 0 : (i / (n - 1) - 0.5) * arc) + rng.range(-0.04, 0.04);
      const d = dir.clone().applyAxisAngle(UP, a);
      loose(v, { from: bowHand(r.player, d), dir: d, range: range * rng.range(0.9, 1), speed: 30, pierce: 0, size: 0.22 });
    }
  });
}

/** Suppressing Fire: arrows one after another down the line, each striking all it passes. */
function suppressing(v: Volley, r: RangerCast): void {
  const dir = r.dir.clone();
  const n = arrowsOf(r, Math.max(1, Math.floor(r.num('arrows', 3))));
  const range = r.num('range', 18);
  draw(r, v.host, (first) => {
    const id = r.player.actionId;
    const cuts = v.host.cutTimes(r.def.id, r.actTime, first) ?? [0.08, 0.16, 0.24];
    const gap = cuts.length ? cuts[0]! : 0.08;
    for (let i = 0; i < n; i++) {
      const at = i === 0 ? 0 : (cuts[i - 1] ?? (cuts[cuts.length - 1] ?? 0) + gap * (i - cuts.length));
      v.host.later(at, () => {
        if (r.player.actionId !== id || !r.player.alive) return;
        const d = dir.clone().applyAxisAngle(UP, (i % 2 === 0 ? 1 : -1) * 0.015 * Math.ceil(i / 2));
        quiet(v.host, () => loose(v, { from: bowHand(r.player, d), dir: d, range, speed: 42, pierce: 99, sure: true, size: 0.24 }));
      });
    }
  });
}

/** Explosive Tip: a burning arrow that bursts on the first enemy or at the end of its flight. */
function explosiveTip(v: Volley, r: RangerCast): void {
  const dir = r.dir.clone();
  const radius = r.num('radius', 3);
  draw(r, v.host, () => {
    loose(v, {
      from: bowHand(r.player, dir), dir, range: r.num('range', 20), speed: r.num('speed', 34), pierce: 0, harmless: true,
      onEnd: (at) => {
        const x = at.x;
        const z = at.z;
        v.host.effects.explosion(x, 0.6, z, { radius, element: 'fire', color: r.color });
        v.host.sound(r.hitSound, x, z);
        v.heard = true;
        rainBlow(v, x, z, radius, 1);
      },
    });
  });
}

/**
 * Everything within `radius` of (x, z) takes one blow, a little less at the
 * edge, sure to land (a volley falls, a tip bursts).
 */
export function rainBlow(v: Volley, x: number, z: number, radius: number, mult: number, kind?: HitKind, arrow = true, applies?: StatusApplication[]): number {
  let dealt = 0;
  for (const t of targets(v.world)) {
    const d = Math.hypot(t.root.position.x - x, t.root.position.z - z);
    if (d > radius + t.hitRadius) continue;
    const edge = 1 - Math.min(1, d / (radius + t.hitRadius)) * 0.35;
    const pk = v.packet(mult * edge);
    if (applies) pk.applies = applies;
    const landed = arrowHit(v, t, pk, { fromX: x, fromZ: z, sure: true, kind, arrow });
    dealt += landed.amount;
  }
  return dealt;
}

/** Thicket of Shafts: where a rain fell the floor bristles and slows what wades through. */
interface Thicket {
  x: number;
  z: number;
  radius: number;
  left: number;
  acc: number;
  /** The slow it lays, made once with the thicket. */
  readonly slowing: StatusApplication[];
}

function thicket(v: Volley, x: number, z: number, radius: number): void {
  const g = v.player.passives.rgr;
  if (g.thicketSec <= 0) return;
  const thickets = shotsOf(v.host).thickets;
  if (thickets.length >= 8) thickets.shift();
  const slowing: StatusApplication[] = [{ id: 'slowed', duration: 0.8, magnitude: 1, stacks: 1, mods: { moveSpeed: -g.thicketSlow } }];
  thickets.push({ x, z, radius, left: g.thicketSec, acc: 1, slowing });
  thicketStand(v.host.effects, x, z, radius, g.thicketSec);
}

/** Seconds a rain takes to come down after the loose. */
const RAIN_FALL = 0.45;
const SKY_FALL = 0.75;

/**
 * Arrow Rain and Darken The Sky: loosed high, a beat later the volley comes
 * down across the circle. `density` is how thick the fall looks (1 a rain).
 */
function rain(v: Volley, r: RangerCast, fall: number, density: number): void {
  const reach = r.num('range', 20);
  const radius = r.num('radius', 4.5);
  const p = r.player.position;
  const d = Math.min(reach, flat(r.aim, p));
  const dir = r.dir.clone();
  const x = p.x + dir.x * d;
  const z = p.z + dir.z * d;
  draw(r, v.host, () => {
    rainVolley(v.host.effects, x, z, radius, density, fall, r.color);
    v.host.later(fall, () => quiet(v.host, () => {
      // It is heard where it comes down, on something or not.
      v.host.sound(r.hitSound, x, z);
      v.heard = true;
      rainBlow(v, x, z, radius, 1);
      thicket(v, x, z, radius);
    }));
  });
}

/** Creeping Barrage: falls in a walk from in front of you toward the aimed point. */
function creepingBarrage(v: Volley, r: RangerCast): void {
  const falls = Math.max(1, Math.floor(perRanks(r.num('falls', 5), r.num('fallsPerRanks', 6), r.rank)));
  const step = r.num('step', 2.2);
  const gap = r.num('gap', 0.2);
  const radius = r.num('radius', 1.5);
  const dir = r.dir.clone();
  const p = r.player.position.clone();
  draw(r, v.host, () => {
    for (let i = 0; i < falls; i++) {
      const x = p.x + dir.x * (1.5 + step * i);
      const z = p.z + dir.z * (1.5 + step * i);
      const when = RAIN_FALL * 0.8 + gap * i;
      rainVolley(v.host.effects, x, z, radius, 0.4, when, r.color);
      v.host.later(when, () => quiet(v.host, () => {
        if (i === 0) {
          v.host.sound(r.hitSound, x, z);
          v.heard = true;
        }
        rainBlow(v, x, z, radius, 1);
        thicket(v, x, z, radius);
      }));
    }
  });
}

/** Carom Shot: an arrow that flies on from enemy to enemy, weaker each leg. */
function carom(v: Volley, r: RangerCast): void {
  const dir = r.dir.clone();
  const legs = 1 + Math.max(0, Math.floor(perRanks(r.num('bounces', 2), r.num('bouncesPerRanks', 4), r.rank)));
  const hop = r.num('range', 8);
  const falloff = r.num('falloff', 18) / 100;
  const speed = Math.max(1, r.num('speed', 34));
  const reach = r.num('reach', 20);
  draw(r, v.host, () => {
    const from = bowHand(r.player, dir);
    const first = onLane(v.world, from, dir, v.host.clear(from, dir, reach, v.world.ctx, 0.3), 0.7)[0];
    if (!first) {
      loose(v, { from, dir, range: reach, speed, pierce: 0, harmless: true });
      return;
    }
    const struck = new Set<Target>([first.t]);
    const path: Target[] = [first.t];
    let at = first.t;
    for (let i = 1; i < legs; i++) {
      let next: Target | null = null;
      let best = Infinity;
      for (const t of targets(v.world)) {
        if (struck.has(t)) continue;
        const d = flat(t.root.position, at.root.position);
        if (d <= hop + t.hitRadius && d < best) {
          best = d;
          next = t;
        }
      }
      if (!next) break;
      struck.add(next);
      path.push(next);
      at = next;
    }
    let t0 = 0;
    let prev = from.clone();
    path.forEach((t, i) => {
      const to = t.root.position.clone().setY(1.05);
      const leg = flat(prev, to);
      const start = t0;
      const a = prev.clone();
      t0 += leg / speed;
      prev = to;
      const fly = (): void => void quiet(v.host, () => v.host.effects.projectile(a, to, {
        element: v.school, color: v.color, shape: 'arrow', shed: v.shed, flare: false, speed, size: 0.28,
      }));
      // The first leg leaves with the string, the rest as the arrow glances on.
      if (start <= 0) fly();
      else v.host.later(start, fly);
      v.host.later(t0, () => {
        if (t.life <= 0 || !r.player.alive) return;
        quiet(v.host, () => arrowHit(v, t, v.packet(Math.pow(1 - falloff, i)), { fromX: a.x, fromZ: a.z, sure: true }));
      });
    });
  });
}

/** Disengage's arrow, loosed at what you left as you leap. */
export function disengageArrow(v: Volley, r: RangerCast, dir: THREE.Vector3): void {
  loose(v, {
    from: bowHand(r.player, dir), dir, range: r.num('range', 18), speed: r.num('speed', 40), pierce: singlePierce(v),
  });
}

/** Runs one of the bow skills. False when `id` is not one. */
export function castShot(v: Volley, r: RangerCast): boolean {
  switch (r.def.id) {
    case 'pierceShot': lineShot(v, r); return true;
    case 'oneShot': lineShot(v, r, GRAVE_RELEASE); return true;
    case 'aimedShot': singleShot(v, r, AIMED_RELEASE); return true;
    case 'bleedingArrow':
    case 'crippling': singleShot(v, r); return true;
    case 'splinterShot': splinterShot(v, r); return true;
    case 'bankShot': bankShot(v, r); return true;
    case 'quarrysEnd': quarrysEnd(v, r); return true;
    case 'twinShot': twinShot(v, r); return true;
    case 'scattershot': scattershot(v, r); return true;
    case 'fanFire': {
      const n = arrowsOf(r, Math.max(1, Math.floor(r.num('count', 5))));
      const spread = r.num('spread', 0.2);
      fan(v, r, n, spread * Math.max(1, n - 1), r.num('range', 18), r.num('speed', 34), false);
      return true;
    }
    case 'arrowWheel': {
      const n = arrowsOf(r, Math.max(1, Math.floor(perRanks(r.num('arrows', 10), r.num('arrowsPerRanks', 4), r.rank))));
      fan(v, r, n, Math.PI * 2, r.num('range', 10), r.num('speed', 32), true);
      return true;
    }
    case 'suppressing': suppressing(v, r); return true;
    case 'explosiveTip': explosiveTip(v, r); return true;
    // The particle field trims both to the quality ladder.
    case 'arrowRain': rain(v, r, RAIN_FALL, 1); return true;
    case 'darkenTheSky': rain(v, r, SKY_FALL, 3); return true;
    case 'creepingBarrage': creepingBarrage(v, r); return true;
    case 'ricochet': carom(v, r); return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// The plain shot
// ---------------------------------------------------------------------------

/**
 * The bow's plain shot: drawn and loosed on the release frame, striking the
 * first enemy on its line as it gets there (through them all with Through and
 * Through), with the Ranger's passives on it.
 */
export function basicShot(host: RangerHost, player: Player, dir: THREE.Vector3, world: RangerWorld, packet: (m?: number) => DamagePacket, time: number): void {
  player.beginAction('shoot', time, undefined, { release: true });
  const d = dir.clone();
  // Loosed from hiding: read on the press, as the veil may drop before the string goes.
  const hidden = player.status.has('veiled') ? hiddenCrit(host, player) : 0;
  host.atRelease(player, () => {
    const v: Volley = {
      host, player, world, id: null, packet, critX: Math.max(100, player.stats.critDamage) / 100,
      school: 'physical', color: 0xd8c9a0, hitSound: null, hits: new Map(), nocked: false,
      hidden, bow: false, multi: false, trap: false, fullLife: 0, heard: true,
    };
    host.sound('cast.physical', player.position.x, player.position.z);
    quiet(host, () => loose(v, { from: bowHand(player, d), dir: d, range: 20, speed: 30, pierce: singlePierce(v), size: 0.24, width: 0.8 }));
  });
}

/** Camouflage's harder crit from hiding, for the hero now (0 without it). */
let camoCrit: (host: RangerHost, player: Player) => number = () => 0;
export function setHiddenCrit(fn: (host: RangerHost, player: Player) => number): void {
  camoCrit = fn;
}
export function hiddenCrit(host: RangerHost, player: Player): number {
  return camoCrit(host, player);
}

// ---------------------------------------------------------------------------
// Every frame
// ---------------------------------------------------------------------------

/** The thickets' list of who stands in them, kept so a frame allocates nothing. */
const _inThicket: Target[] = [];

/** The thickets slow what stands in them. */
export function tickShots(host: RangerHost, dt: number): void {
  const live = host.live();
  const thickets = shotsOf(host).thickets;
  for (let i = thickets.length - 1; i >= 0; i--) {
    const th = thickets[i]!;
    th.left -= dt;
    th.acc += dt;
    if (live && th.acc >= 0.5) {
      th.acc = 0;
      for (const t of targetsInto(live, _inThicket)) {
        if (Math.hypot(t.root.position.x - th.x, t.root.position.z - th.z) > th.radius + t.hitRadius) continue;
        t.applyStatuses(th.slowing, live.ctx);
      }
    }
    if (th.left <= 0) thickets.splice(i, 1);
  }
}

export function clearShots(host: RangerHost): void {
  const f = shotsOf(host);
  f.thickets.length = 0;
  f.scattered = 0;
  clearThickets();
}
