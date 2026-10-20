/**
 * SLAY — the Ranger's skills (class id `ranger`), run whole.
 *
 * `SkillRunner.castNow` hands every Ranger active here (`RANGER_MOVES`). The
 * bow skills are in `Shots.ts`, the traps, brambles and the kestrel in
 * `Traps.ts`; this file runs the rest and what lasts on the hero:
 *
 *  - Hunter's Mark: on what you point at (Open Season: and more near it),
 *    and when the marked dies the mark jumps on with the time it had left.
 *  - Roll Away and Disengage: Slip Free's shaken hold first, Lay of the
 *    Land's spike trap where the feet left the floor, the roll or the leap;
 *    Roll Away comes up with an arrow nocked (the next bow skill crits),
 *    Disengage looses its arrow as it goes.
 *  - Venom Coat, Camouflage, Open Quiver: their buffs (`data/skillPower.ts`).
 *    Camouflage veils the hero after a moment standing still, and the first
 *    arrow from hiding crits harder.
 *  - Bolt-Hole: a blow that drops the hero low heals over a few seconds and
 *    lends the legs speed, on its own cooldown.
 *
 * Every skill sounds only its own recordings: the cast on its release, the
 * hit where it lands. Damage per hit is the skill's own: speed never changes it.
 */
import * as THREE from 'three';
import type { StatusApplication } from '../../types';
import type { Player } from '../../entities/Player';
import { SKILL_BY_ID } from '../../data/skills';
import { getStatus, synthesizeSkillBuff } from '../../data/statuses';
import { tr } from '../../core/I18n';
import { clearRangerFX, feathers, glint, leaves, markSpark, tickRangerFX } from '../../fx/ranger/RangerFX';
import {
  bowHand, castShot, clearShots, disengageArrow, draw, flat, hiddenCrit, nearestTo, quiet, setHiddenCrit, setQuiverArrows,
  targets, tickShots, volleyOf, type Volley,
} from './Shots';
import { clearTraps, footTrap, kestrel, setTrap, thornBarrier, tickTraps, wholeFloor } from './Traps';
import { MULTI, RANGER_BOW, RANGER_MOVES, TRAPPY, type RangerCast, type RangerHost, type Target } from './RangerTypes';

export { RANGER_MOVES, RANGER_BOW } from './RangerTypes';
export { basicShot } from './Shots';

const _d = new THREE.Vector3();

// ---------------------------------------------------------------------------
// What lasts on the hero
// ---------------------------------------------------------------------------

/** Roll Away's nocked arrow: until when (the runner's clock), a hero. */
const nocked = new Map<Player, number>();

/** Camouflage running on a hero: how long still before the veil, and what the veil adds to a crit. */
interface Camo {
  player: Player;
  still: number;
  stillFor: number;
  critDamage: number;
  x: number;
  z: number;
  /** Whether the veil on the hero is this one's, and the action it was laid in. */
  veiled: boolean;
  action: number;
}
const camos: Camo[] = [];

/** A mark that jumps on when what it marks dies. */
interface Mark {
  t: Target;
  left: number;
  jump: number;
  riders: StatusApplication[];
  player: Player;
}
const marks: Mark[] = [];
/** Most marks followed at once (Open Season's spread is small). */
const MOST_MARKS = 12;

/** Bolt-Hole: when it is ready again, and the life share last frame. */
const bolt = { ready: 0, lastPct: 100, healLeft: 0, healPer: 0, acc: 0, player: null as Player | null };
const BOLT_STATUS = 'skill.boltHole';

// Camouflage's harder crit from hiding (`Shots.arrowHit` reads it).
setHiddenCrit((player) => {
  if (!player.status.has('veiled')) return 0;
  const c = camos.find((x) => x.player === player);
  return c && player.status.has('skill.camouflage') ? c.critDamage : 0;
});

// ---------------------------------------------------------------------------
// One press
// ---------------------------------------------------------------------------

/** Runs one Ranger skill. False when `r.def.id` is not one. */
export function castRanger(host: RangerHost, r: RangerCast): boolean {
  const id = r.def.id;
  if (!RANGER_MOVES.has(id)) return false;
  const bow = RANGER_BOW.has(id);
  // Roll Away's nocked arrow goes with the next bow skill.
  let nock = false;
  if (bow) {
    const until = nocked.get(r.player) ?? 0;
    if (until > host.now()) nock = true;
    nocked.delete(r.player);
  }
  const hidden = bow ? hiddenCrit(r.player) : 0;
  const v = volleyOf(host, r, { nocked: nock, hidden, bow, multi: MULTI.has(id), trap: TRAPPY.has(id) });
  if (castShot(v, r)) return true;
  switch (id) {
    case 'huntersMark': huntersMark(host, r); return true;
    case 'rollAway': rollAway(host, r); return true;
    case 'disengage': disengage(host, r, v); return true;
    case 'venomCoat':
    case 'camouflage':
    case 'openQuiver': selfBuff(host, r); return true;
    case 'snareTrap':
    case 'spikeTrap':
    case 'tripwire':
    case 'waspNest': setTrap(host, r, v); return true;
    case 'thornBarrier': thornBarrier(host, r, v); return true;
    case 'kestrel': kestrel(host, r, v); return true;
    case 'theWholeFloor': wholeFloor(host, r, v); return true;
  }
  return false;
}

/** Hunter's Mark: on what you point at, and with Open Season on more near it. */
function huntersMark(host: RangerHost, r: RangerCast): void {
  const reach = r.num('reach', 3);
  const jump = r.num('jump', 10);
  const e = r.player.passives.rgr;
  draw(r, host, () => {
    const first = nearestTo(r.world, r.aim, reach, r.player.position, 40);
    if (!first) return;
    const riders = r.riders();
    const list: Target[] = [first];
    if (e.openExtra > 0) {
      const near = targets(r.world)
        .filter((t) => t !== first && flat(t.root.position, first.root.position) <= e.openSpread + t.hitRadius)
        .sort((a, b) => flat(a.root.position, first.root.position) - flat(b.root.position, first.root.position));
      for (let i = 0; i < Math.min(near.length, Math.floor(e.openExtra)); i++) list.push(near[i]!);
    }
    for (const t of list) {
      t.applyStatuses(riders, r.world.ctx);
      markSpark(host.effects, t.root.position.x, 1.9, t.root.position.z);
      follow(t, jump, riders, r.player);
    }
    host.sound(r.hitSound, first.root.position.x, first.root.position.z);
  });
}

function follow(t: Target, jump: number, riders: StatusApplication[], player: Player): void {
  const was = marks.findIndex((m) => m.t === t);
  if (was >= 0) marks.splice(was, 1);
  if (marks.length >= MOST_MARKS) marks.shift();
  marks.push({ t, left: t.statusLeft('marked'), jump, riders, player });
}

/** Marks that outlive what they marked jump to the nearest enemy unmarked. */
function tickMarks(host: RangerHost, dt: number): void {
  const live = host.live();
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i]!;
    if (m.t.life > 0) {
      m.left = m.t.statusLeft('marked');
      if (m.left <= 0) marks.splice(i, 1);
      continue;
    }
    m.left -= dt;
    marks.splice(i, 1);
    if (!live || m.left <= 0.1) continue;
    const at = m.t.root.position;
    let next: Target | null = null;
    let best = Infinity;
    for (const t of targets(live)) {
      if (t.hasStatus('marked')) continue;
      const d = flat(t.root.position, at);
      if (d <= m.jump + t.hitRadius && d < best) {
        best = d;
        next = t;
      }
    }
    if (!next) continue;
    const left = m.left;
    next.applyStatuses(m.riders.map((a) => (a.id === 'marked' ? { ...a, duration: left } : a)), live.ctx);
    markSpark(host.effects, next.root.position.x, 1.9, next.root.position.z);
    marks.push({ t: next, left, jump: m.jump, riders: m.riders, player: m.player });
  }
}

/** Roll Away: a roll, untouchable a moment, quicker after, an arrow nocked. */
function rollAway(host: RangerHost, r: RangerCast): void {
  const p = r.player;
  const e = p.passives.rgr;
  const k = Math.max(0, r.rank - 1);
  if (e.slipFree > 0) host.cleanse(p);
  const start = p.position.clone();
  const lane = host.clear(_d.copy(start).setY(0.5), r.dir, r.num('distance', 6), r.world.ctx, 0.4);
  if (e.footTraps > 0) footTrap(host, p, start, r.world);
  host.sound(r.castSound, start.x, start.z);
  p.dodge(r.dir.x, r.dir.z, true, r.clip, { distance: lane > 0.3 ? lane : undefined, skill: true, span: 0.42 });
  if (r.num('iframes', 0.3) > 0) p.grantInvulnerability(r.num('iframes', 0.3));
  host.buff(p, r.def, r.rank, r.num, r.color);
  nocked.set(p, host.now() + r.num('nocked', 2) + r.num('nockedPerRank', 0.05) * k);
  host.later(0.42, () => {
    if (!p.alive) return;
    const hand = bowHand(p, r.dir);
    glint(host.effects, hand.x, hand.y, hand.z);
  });
}

/** Disengage: a leap backwards, eyes on them, an arrow loosed at what you left. */
function disengage(host: RangerHost, r: RangerCast, v: Volley): void {
  const p = r.player;
  const e = p.passives.rgr;
  if (e.slipFree > 0) host.cleanse(p);
  const back = r.dir.clone().negate();
  const start = p.position.clone();
  const lane = host.clear(_d.copy(start).setY(0.5), back, r.num('distance', 8), r.world.ctx, 0.4);
  if (e.footTraps > 0) footTrap(host, p, start, r.world);
  r.num('backwards', 1);
  host.sound(r.castSound, start.x, start.z);
  p.dodge(back.x, back.z, true, r.clip, { distance: lane > 0.3 ? lane : undefined, skill: true, span: 0.45 });
  // Eyes stay on them: a leap backwards, not a turn and run.
  p.faceTowards(r.aim.x, r.aim.z);
  const id = p.actionId;
  const aim = r.aim.clone();
  host.later(0.14, () => {
    if (p.actionId !== id || !p.alive) return;
    const dir = new THREE.Vector3(aim.x - p.position.x, 0, aim.z - p.position.z);
    if (dir.lengthSq() < 1e-4) dir.copy(r.dir);
    dir.normalize();
    quiet(host, () => disengageArrow(v, r, dir));
  });
}

/** Venom Coat, Camouflage, Open Quiver: the buff, on a short gesture. */
function selfBuff(host: RangerHost, r: RangerCast): void {
  const p = r.player;
  const k = Math.max(0, r.rank - 1);
  p.beginAction(r.clip, r.actTime);
  host.sound(r.castSound, p.position.x, p.position.z);
  host.buff(p, r.def, r.rank, r.num, r.color);
  if (r.def.id === 'camouflage') {
    const was = camos.findIndex((c) => c.player === p);
    if (was >= 0) camos.splice(was, 1);
    camos.push({
      player: p, still: r.num('still', 0.6), stillFor: 0, x: p.position.x, z: p.position.z, veiled: false, action: p.actionId,
      critDamage: r.num('critDamage', 30) + r.num('critDamagePerRank', 5) * k,
    });
    leaves(host.effects, p.position.x, p.position.z);
  } else if (r.def.id === 'openQuiver') {
    setQuiverArrows(Math.floor(r.num('arrows', 2)));
    feathers(host.effects, p.position.x, p.position.z);
  }
}

/** Camouflage: still a moment, you vanish; moving or acting brings you back. */
function tickCamo(host: RangerHost, dt: number): void {
  for (let i = camos.length - 1; i >= 0; i--) {
    const c = camos[i]!;
    const p = c.player;
    if (!p.alive || !p.status.has('skill.camouflage')) {
      if (c.veiled) unveil(p);
      camos.splice(i, 1);
      continue;
    }
    const moved = Math.hypot(p.position.x - c.x, p.position.z - c.z) > 0.03;
    c.x = p.position.x;
    c.z = p.position.z;
    if (c.veiled && !p.status.has('veiled')) c.veiled = false;
    if (moved || (c.veiled && p.actionId !== c.action)) {
      c.stillFor = 0;
      if (c.veiled) {
        unveil(p);
        c.veiled = false;
      }
      continue;
    }
    if (c.veiled) continue;
    c.stillFor += dt;
    if (c.stillFor >= c.still && !p.status.has('veiled') && getStatus('veiled')) {
      const left = p.status.get('skill.camouflage')?.remaining ?? 5;
      if (p.applyStatus('veiled', Math.max(0.5, left), 1, 1)) {
        c.veiled = true;
        c.action = p.actionId;
        leaves(host.effects, p.position.x, p.position.z);
      }
    }
  }
}

function unveil(p: Player): void {
  if (!p.status.has('veiled')) return;
  p.status.remove('veiled');
  p.refreshStats();
}

/** Bolt-Hole: a blow takes you below the line, and you heal and run. */
function tickBolt(host: RangerHost, dt: number): void {
  const p = host.hero();
  if (bolt.healLeft > 0 && bolt.player) {
    bolt.acc += dt;
    while (bolt.acc >= 0.5 && bolt.healLeft > 0) {
      bolt.acc -= 0.5;
      bolt.healLeft -= 0.5;
      if (bolt.player.alive) bolt.player.heal(bolt.healPer);
    }
  }
  if (!p || !p.alive) return;
  const e = p.passives.rgr;
  const pct = (p.life / Math.max(1, p.stats.life)) * 100;
  const was = bolt.lastPct;
  bolt.lastPct = pct;
  if (e.boltBelow <= 0 || pct >= e.boltBelow || was < e.boltBelow || host.now() < bolt.ready) return;
  bolt.ready = host.now() + Math.max(1, e.boltCd);
  const over = Math.max(0.5, e.boltOver);
  bolt.player = p;
  bolt.healLeft = over;
  bolt.acc = 0;
  bolt.healPer = (p.stats.life * (e.boltHeal / 100)) / Math.max(1, Math.round(over / 0.5));
  if (!getStatus(BOLT_STATUS)) synthesizeSkillBuff('boltHole', SKILL_BY_ID.boltHole?.name ?? tr('Bolt-Hole'), 0x7fc46a, 'sparkle', 3);
  p.applyStatus(BOLT_STATUS, 3, 1, 1, { mods: { moveSpeed: e.boltRun } });
  leaves(host.effects, p.position.x, p.position.z);
}

// ---------------------------------------------------------------------------
// Every frame
// ---------------------------------------------------------------------------

export function tickRanger(host: RangerHost, dt: number): void {
  tickShots(host, dt);
  tickTraps(host, dt);
  tickMarks(host, dt);
  tickCamo(host, dt);
  tickBolt(host, dt);
  tickRangerFX(host.effects, dt);
}

/** Ends everything running (a new floor). */
export function clearRanger(host: RangerHost): void {
  clearShots();
  clearTraps(host);
  marks.length = 0;
  camos.length = 0;
  nocked.clear();
  bolt.healLeft = 0;
  bolt.player = null;
  bolt.lastPct = 100;
  clearRangerFX(host.effects);
}

