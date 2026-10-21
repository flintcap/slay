/**
 * SLAY — the Mage's spells that are more than their effect family.
 *
 * `SkillRunner.castNow` hands a skill listed in `SPELLS` to `MageSpells.cast`
 * with a small host that lands blows through the runner's own pipeline
 * (tune, strike, afterHit: passives, hit feel, kill credit), so a Mage blow
 * is tuned, felt and counted like any other.
 *
 * What flies, rolls or lingers is kept here and moved by `update`, which
 * the runner calls every frame. A rolling orb strikes what it passes when it
 * passes it, a bolt strikes what it meets when it meets it, and a brand that
 * outlives its target jumps on. Other classes' skills that share an effect
 * family (a projectile, a chain, a field) never come here: the table is
 * keyed by skill id.
 */
import * as THREE from 'three';
import type { DamagePacket, DamageType, SkillDef, StatusApplication } from '../../types';
import type { CombatContext, Enemy } from '../../entities/Enemy';
import type { Boss } from '../../entities/Boss';
import type { Player } from '../../entities/Player';
import type { HitKind } from '../../fx/CombatFeel';
import type { EffectHandle, EffectSystem, School } from '../../fx/Effects';
import { atRank, boostRank } from '../../fx/kit/Boost';
import { SKILL_BY_ID } from '../../data/skills';

type Target = Enemy | Boss;

/** The fight a spell lands in. The runner refreshes it each frame. */
export interface SpellWorld {
  ctx: CombatContext;
  enemies: Enemy[];
  boss: Boss | null;
  player: Player;
}

/** What the runner lends the Mage's spells. */
export interface SpellHost {
  readonly effects: EffectSystem;
  /** Tunes, lands and follows through one blow. Null when it did not land. */
  hit(t: Target, packet: DamagePacket, kind: HitKind, fromX: number, fromZ: number, world: SpellWorld): DamagePacket | null;
  /** Every target within `radius` of `centre`, with the runner's falloff. Returns what it dealt. */
  area(centre: THREE.Vector3, radius: number, packet: (m?: number) => DamagePacket, world: SpellWorld, kind?: HitKind): number;
  /** Runs `fn` after `seconds`, at the rank it was cast at. */
  later(seconds: number, fn: () => void): void;
  /** Plays a skill sound at a point. */
  sound(id: string | null, x: number, z: number): void;
  /** How far from `from` along `dir` before a wall or a prop, up to `max`. */
  clear(from: THREE.Vector3, dir: THREE.Vector3, max: number, ctx: CombatContext, radius: number): number;
  /** The fight as it stands this frame, or null between levels. */
  live(): { ctx: CombatContext; enemies: Enemy[]; boss: Boss | null } | null;
}

/** One press of a spell. */
export interface SpellCast {
  def: SkillDef;
  rank: number;
  player: Player;
  /** Where the press aimed, on the floor. */
  aim: THREE.Vector3;
  /** The casting hand. */
  origin: THREE.Vector3;
  /** Flat and unit length: from the hero towards the aim. */
  dir: THREE.Vector3;
  world: SpellWorld;
  /** A fresh rolled packet at `mult` times the skill's damage, riders on. */
  packet: (mult?: number) => DamagePacket;
  /** What the skill leaves on what it touches, for a spell that marks without a blow. */
  riders: () => StatusApplication[];
  num: (key: string, dflt: number) => number;
  type: DamageType;
  school: School;
  color: number;
  clip: string;
  /** The skill's own gesture, when it has one. */
  own: string | null;
  /** Seconds this use takes (`sim/Speed.ts`). */
  actTime: number;
  /** The hand already flared on the release frame. */
  released: boolean;
  hitSound: string | null;
  /** The skill's own particles (`fx/SkillLooks.ts`). */
  sig: { emitter: string; trail: string; density: number; size: number };
  /** Set by the spell: where it lands, for the skill's motif. */
  landAt?: THREE.Vector3;
}

/** Something in flight: a bolt, a lance, a rolling orb. */
interface Mover {
  rank: number;
  world: SpellWorld;
  ox: number;
  oz: number;
  y: number;
  dx: number;
  dz: number;
  speed: number;
  /** How far it goes, walls already counted. */
  length: number;
  gone: number;
  /** What it strikes: its distance from the body, before the target's own size. */
  reach: number;
  /** How many it may strike before it stops; Infinity rolls through everything. */
  hits: number;
  struck: Set<Target>;
  /** Sideways wobble in metres (Sparkbolt), and where in the wobble it starts. */
  jink: number;
  phase: number;
  body: EffectHandle;
  /** The tree's wake (`fx/mage/looks.ts`), shed every `WAKE_STEP` metres. */
  trail: string;
  wakeAt: number;
  kind: HitKind;
  packet: () => DamagePacket;
  hitSound: string | null;
  onStrike: ((t: Target, x: number, z: number) => void) | null;
  onEnd: ((x: number, z: number) => void) | null;
}

/** A Pyre Brand burning on one enemy. */
interface Brand {
  t: Target;
  until: number;
  leap: number;
  burn: StatusApplication;
  color: number;
  rank: number;
}

/** Ionize's marked ground. */
interface MarkField {
  x: number;
  z: number;
  radius: number;
  left: number;
  acc: number;
  marks: StatusApplication[];
}

/** How often a marked field re-marks what stands in it, and how long each mark holds after. */
const MARK_EVERY = 0.5;
const MARK_HOLD = 1.0;
/** The longest step a mover takes between strike checks, so nothing slips between frames. */
const SUBSTEP = 0.5;
/** Metres between two puffs of a mover's wake, and how big they are. */
const WAKE_STEP = 0.6;
const WAKE = { count: 12, scale: 0.6 };

const UP = new THREE.Vector3(0, 1, 0);

function ground(a: THREE.Vector3, x: number, z: number): number {
  return Math.hypot(a.x - x, a.z - z);
}

/** The Mage's spells and what they leave in the world. One per runner. */
export class MageSpells {
  private movers: Mover[] = [];
  private brands: Brand[] = [];
  private fields: MarkField[] = [];
  private time = 0;
  private launches = 0;
  private readonly at = new THREE.Vector3();

  constructor(readonly host: SpellHost) {}

  /** True for a skill this module casts. */
  static casts(id: string): boolean {
    return Object.hasOwn(SPELLS, id);
  }

  cast(s: SpellCast): void {
    SPELLS[s.def.id]?.(s, this);
  }

  /** Brings a world captured at the cast up to this frame's lists. */
  fresh(w: SpellWorld): SpellWorld {
    const live = this.host.live();
    if (live) {
      w.ctx = live.ctx;
      w.enemies = live.enemies;
      w.boss = live.boss;
    }
    return w;
  }

  /** Draws without the drawing making its own sound: the skill already has one. */
  quiet(fn: () => void): void {
    this.host.effects.beginQuiet();
    try {
      fn();
    } finally {
      this.host.effects.endQuiet();
    }
  }

  /** Sends something flying along `dir` from the casting hand. */
  launch(s: SpellCast, dir: THREE.Vector3, o: {
    speed: number;
    range: number;
    reach: number;
    size: number;
    hits: number;
    kind: HitKind;
    packet: () => DamagePacket;
    y?: number;
    jink?: number;
    flare?: boolean;
    /** The flying body's shape, when the school's own is not the one. */
    shape?: 'orb';
    onStrike?: (t: Target, x: number, z: number) => void;
    onEnd?: (x: number, z: number) => void;
  }): void {
    const y = o.y ?? s.origin.y;
    const from = new THREE.Vector3(s.origin.x, y, s.origin.z);
    const length = this.host.clear(from, dir, Math.max(0.5, o.range), s.world.ctx, Math.min(0.5, o.reach));
    const to = from.clone().addScaledVector(dir, length);
    const body = this.host.effects.projectile(from, to, {
      element: s.school,
      color: s.color,
      size: o.size * s.sig.size,
      shed: s.sig.trail,
      shape: o.shape,
      carried: true,
      flare: (o.flare ?? true) && !s.released,
      maxLife: length / Math.max(1, o.speed) + 0.5,
    });
    this.movers.push({
      rank: boostRank(),
      world: s.world,
      ox: from.x,
      oz: from.z,
      y,
      dx: dir.x,
      dz: dir.z,
      speed: Math.max(1, o.speed),
      length,
      gone: 0,
      reach: o.reach,
      hits: o.hits,
      struck: new Set(),
      jink: o.jink ?? 0,
      phase: (this.launches++ * 2.39996) % (Math.PI * 2),
      body,
      trail: s.sig.trail,
      wakeAt: 0,
      kind: o.kind,
      packet: o.packet,
      hitSound: s.hitSound,
      onStrike: o.onStrike ?? null,
      onEnd: o.onEnd ?? null,
    });
  }

  /** Brands `t`: if it dies while the burn has time left, the burn jumps on. */
  brand(t: Target, burn: StatusApplication, leap: number, color: number): void {
    this.brands = this.brands.filter((b) => b.t !== t);
    this.brands.push({ t, until: this.time + burn.duration, leap, burn, color, rank: boostRank() });
  }

  /** Marks the ground: what stands in it carries `marks` while it does. */
  mark(x: number, z: number, radius: number, duration: number, marks: StatusApplication[]): void {
    const held = marks.map((a) => ({ ...a, duration: MARK_HOLD }));
    this.fields.push({ x, z, radius, left: duration, acc: MARK_EVERY, marks: held });
  }

  /**
   * Splintering Frost: a Frozen or Brittle enemy that dies bursts into ice,
   * a share of its life as cold damage to everything near, Chilling it.
   */
  splinter(player: Player, at: THREE.Vector3, maxLife: number): void {
    const e = player.passives;
    const live = this.host.live();
    if (!live || e.shatterPct <= 0 || e.shatterRadius <= 0 || maxLife <= 0) return;
    const world: SpellWorld = { ...live, player };
    const radius = e.shatterRadius;
    const amount = maxLife * (e.shatterPct / 100);
    const chill: StatusApplication[] = e.shatterChill > 0 ? [{ id: 'chilled', duration: e.shatterChill, magnitude: 1 }] : [];
    const name = SKILL_BY_ID.splinteringFrost?.name;
    const spot = new THREE.Vector3(at.x, 0, at.z);
    this.host.effects.explosion(spot.x, 0.8, spot.z, { radius, element: 'cold', color: 0xbfe8ff });
    this.host.effects.fx.burst('mg.shatter', spot.x, 0.9, spot.z, { scale: Math.max(1, radius / 2.5) });
    this.host.area(spot, radius, () => ({
      amount, type: 'cold', crit: false, source: 'player', ability: name, ...(chill.length ? { applies: chill } : {}),
    }), world, 'proc');
  }

  update(dt: number): void {
    const live = this.host.live();
    if (!live) return;
    this.time += dt;
    this.moveAll(dt, live);
    this.burnAll(live);
    this.markAll(dt, live);
  }

  /** Forgets everything in flight and on the floor: a new level. */
  clear(): void {
    for (const m of this.movers) m.body.stop();
    this.movers.length = 0;
    this.brands.length = 0;
    this.fields.length = 0;
  }

  private moveAll(dt: number, live: { ctx: CombatContext; enemies: Enemy[]; boss: Boss | null }): void {
    for (let i = this.movers.length - 1; i >= 0; i--) {
      const m = this.movers[i]!;
      m.world.ctx = live.ctx;
      m.world.enemies = live.enemies;
      m.world.boss = live.boss;
      let left = m.speed * dt;
      const before = m.gone;
      let done = false;
      while (left > 0 && !done) {
        const step = Math.min(SUBSTEP, left, m.length - m.gone);
        left -= step;
        m.gone += step;
        this.place(m);
        done = this.strikeAround(m) || m.gone >= m.length - 1e-4;
        if (step <= 0) done = true;
      }
      m.body.setEndpoint?.(this.at);
      m.wakeAt += m.gone - before;
      if (m.wakeAt >= WAKE_STEP) {
        m.wakeAt = 0;
        this.host.effects.fx.burst(m.trail, this.at.x, this.at.y, this.at.z, WAKE);
      }
      if (!done) continue;
      this.movers.splice(i, 1);
      m.body.stop();
      const x = this.at.x;
      const z = this.at.z;
      if (m.onEnd) {
        const end = m.onEnd;
        atRank(m.rank, () => this.quiet(() => end(x, z)));
      }
    }
  }

  /** Where a mover is now, into `this.at`. */
  private place(m: Mover): void {
    let x = m.ox + m.dx * m.gone;
    let z = m.oz + m.dz * m.gone;
    if (m.jink > 0) {
      // A jittering path: two wobbles out of step, growing as it leaves the hand.
      const ramp = Math.min(1, m.gone / 2);
      const side = (Math.sin(m.phase + m.gone * 1.7) + 0.5 * Math.sin(m.phase * 2 + m.gone * 4.3)) * m.jink * 0.5 * ramp;
      x += -m.dz * side;
      z += m.dx * side;
    }
    this.at.set(x, m.y, z);
  }

  /** Strikes what the mover touches now. True when it has struck all it may. */
  private strikeAround(m: Mover): boolean {
    const w = m.world;
    for (const e of w.enemies) if (this.touch(m, e)) return true;
    if (w.boss && this.touch(m, w.boss)) return true;
    return false;
  }

  private touch(m: Mover, t: Target): boolean {
    if (t.life <= 0 || m.struck.has(t)) return false;
    const x = this.at.x;
    const z = this.at.z;
    if (ground(t.root.position, x, z) > m.reach + t.hitRadius) return false;
    m.struck.add(t);
    const sx = x - m.dx;
    const sz = z - m.dz;
    this.host.hit(t, m.packet(), m.kind, sx, sz, m.world);
    this.host.sound(m.hitSound, t.root.position.x, t.root.position.z);
    if (m.onStrike) {
      const on = m.onStrike;
      atRank(m.rank, () => this.quiet(() => on(t, x, z)));
      // The callback may draw: put the body back where it is.
      this.at.set(x, m.y, z);
    }
    return m.struck.size >= m.hits;
  }

  private burnAll(live: { ctx: CombatContext; enemies: Enemy[]; boss: Boss | null }): void {
    for (let i = this.brands.length - 1; i >= 0; i--) {
      const b = this.brands[i]!;
      const left = b.until - this.time;
      if (left <= 0.05) {
        this.brands.splice(i, 1);
        continue;
      }
      if (b.t.life > 0) continue;
      // It died burning: the brand leaps to the nearest enemy in reach, with the time it had left.
      const from = b.t.root.position;
      let to: Target | null = null;
      let best = Infinity;
      const n = live.enemies.length;
      for (let k = 0; k <= n; k++) {
        const o: Target | null = k < n ? live.enemies[k]! : live.boss;
        if (!o || o === b.t || o.life <= 0) continue;
        const d = ground(o.root.position, from.x, from.z) - o.hitRadius;
        if (d <= b.leap && d < best) {
          best = d;
          to = o;
        }
      }
      if (!to) {
        this.brands.splice(i, 1);
        continue;
      }
      to.applyStatuses([{ ...b.burn, duration: left }], live.ctx);
      const a = new THREE.Vector3(from.x, 1.0, from.z);
      const c = new THREE.Vector3(to.root.position.x, 1.0, to.root.position.z);
      atRank(b.rank, () => this.quiet(() => {
        this.host.effects.projectile(a, c, { element: 'fire', color: b.color, size: 0.2, speed: 18, arc: 0.8 });
      }));
      b.t = to;
    }
  }

  private markAll(dt: number, live: { ctx: CombatContext; enemies: Enemy[]; boss: Boss | null }): void {
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const f = this.fields[i]!;
      f.left -= dt;
      if (f.left <= 0) {
        this.fields.splice(i, 1);
        continue;
      }
      f.acc += dt;
      if (f.acc < MARK_EVERY) continue;
      f.acc = 0;
      for (const e of live.enemies) {
        if (e.life > 0 && ground(e.root.position, f.x, f.z) <= f.radius + e.hitRadius) e.applyStatuses(f.marks, live.ctx);
      }
      const boss = live.boss;
      if (boss && boss.life > 0 && ground(boss.root.position, f.x, f.z) <= f.radius + boss.hitRadius) boss.applyStatuses(f.marks, live.ctx);
    }
  }
}

// --- helpers --------------------------------------------------------------------

/** Every target alive in the world. */
function targets(w: SpellWorld): Target[] {
  const out: Target[] = [];
  for (const e of w.enemies) if (e.life > 0) out.push(e);
  if (w.boss && w.boss.life > 0) out.push(w.boss);
  return out;
}

/** A number that grows with rank: `key` at rank 1, plus `perKey` each rank after. */
function ranked(s: SpellCast, key: string, base: number, perKey: string): number {
  return s.num(key, base) + s.num(perKey, 0) * Math.max(0, s.rank - 1);
}

/** True when the hero can see `t` from where they stand (walls and props). */
function inSight(m: MageSpells, s: SpellCast, t: Target): boolean {
  const p = s.player.position;
  const d = ground(t.root.position, p.x, p.z);
  if (d < 0.01) return true;
  const way = new THREE.Vector3(t.root.position.x - p.x, 0, t.root.position.z - p.z).normalize();
  return m.host.clear(p, way, d, s.world.ctx, 0.3) >= d - t.hitRadius - 0.5;
}

// --- the spells -------------------------------------------------------------------

type Spell = (s: SpellCast, m: MageSpells) => void;

/** Lobbed and heavy: it lands where you aim (or as far as it can) and bursts there. */
const fireball: Spell = (s, m) => {
  s.player.beginAction(s.clip, s.actTime);
  const want = Math.min(s.num('range', 18), Math.max(1, ground(s.aim, s.origin.x, s.origin.z)));
  const size = s.num('size', 0.55);
  const go = m.host.clear(s.origin, s.dir, want, s.world.ctx, size);
  const land = new THREE.Vector3(s.origin.x + s.dir.x * go, 0, s.origin.z + s.dir.z * go);
  const radius = ranked(s, 'radius', 3.2, 'radiusPerRank');
  s.landAt = land;
  const world = s.world;
  m.host.effects.projectile(s.origin, new THREE.Vector3(land.x, 0.5, land.z), {
    element: s.school,
    color: s.color,
    size: size * s.sig.size,
    speed: s.num('speed', 16),
    arc: s.num('lob', 1.8),
    shed: s.sig.trail,
    flare: !s.released,
    onHit: () => {
      m.fresh(world);
      m.quiet(() => {
        m.host.effects.explosion(land.x, 0.8, land.z, { radius, element: s.school, color: s.color });
        m.host.effects.nova(land.x, land.z, radius, { element: s.school, color: s.color, emitter: s.sig.emitter, density: s.sig.density });
        m.host.effects.fx.burst(s.sig.emitter, land.x, 0.6, land.z, { scale: Math.max(1, radius / 2.5) });
      });
      m.host.area(land, radius, (k = 1) => s.packet(k), world);
      m.host.sound(s.hitSound, land.x, land.z);
    },
  });
};

/** A fast bolt that jinks as it flies, rolls wide, and pierces one enemy. Forked splits it. */
const sparkbolt: Spell = (s, m) => {
  s.player.beginAction(s.clip, s.actTime);
  const lo = s.num('rollMin', 40);
  const hi = Math.max(lo, s.num('rollMax', 110));
  const mid = Math.max(1, (lo + hi) / 2);
  const rng = s.world.ctx.rng;
  const pierce = Math.max(0, Math.floor(s.num('pierce', 1)));
  const fp = s.player.passives;
  const forks = Math.max(0, Math.floor(fp.forkCount));
  const reach = s.num('radius', 0.35);
  const speed = s.num('speed', 34);
  const size = s.num('size', 0.3);
  const jink = s.num('jink', 0.7);
  for (let i = 0; i <= forks; i++) {
    const fork = i > 0;
    const a = fork ? (i - 1 - (forks - 1) / 2) * (fp.forkSpread || 0.35) + (forks > 1 ? 0 : 0.35) : 0;
    const scale = fork ? fp.forkDamagePct / 100 : 1;
    const d = a === 0 ? s.dir : s.dir.clone().applyAxisAngle(UP, a);
    m.launch(s, d, {
      speed, range: s.num('range', 18), reach, size, jink,
      hits: pierce + 1,
      kind: 'projectile',
      flare: i === 0,
      packet: () => s.packet(((lo + (hi - lo) * rng.next()) / mid) * scale),
    });
  }
};

/** A slow ember dart: brands the first enemy it meets, and the brand outlives it. */
const pyreBrand: Spell = (s, m) => {
  s.player.beginAction(s.clip, s.actTime);
  const burn = s.riders().find((a) => a.id === 'immolated');
  const leap = ranked(s, 'leap', 6, 'leapPerRank');
  m.launch(s, s.dir, {
    speed: s.num('speed', 14),
    range: s.num('range', 16),
    reach: s.num('radius', 0.45),
    size: s.num('size', 0.3),
    hits: 1,
    kind: 'projectile',
    packet: () => s.packet(),
    onStrike: (t) => {
      if (burn) m.brand(t, burn, leap, s.color);
    },
    onEnd: (x, z) => {
      m.host.effects.impact(s.school, x, 1.0, z, { scale: 0.7, color: s.color });
      m.host.effects.fx.burst(s.sig.emitter, x, 1.0, z, { scale: 0.6 });
    },
  });
};

/** A roaring stream of flame: everything in a narrow cone, as long as it is held. */
const infernoStream: Spell = (s, m) => {
  s.player.beginAction(s.own ?? 'channel', s.actTime);
  const reach = s.num('range', 7);
  const half = (s.num('arc', 25) * Math.PI) / 360;
  const p = s.player.position;
  m.host.effects.cone(new THREE.Vector3(p.x, 1.0, p.z), s.dir, half, reach, {
    element: s.school, color: s.color, emitter: s.sig.emitter, density: s.sig.density,
  });
  const slope = Math.tan(half);
  for (const t of targets(s.world)) {
    const dx = t.root.position.x - p.x;
    const dz = t.root.position.z - p.z;
    const along = dx * s.dir.x + dz * s.dir.z;
    if (along < -t.hitRadius || along > reach + t.hitRadius) continue;
    const perp = Math.abs(dx * s.dir.z - dz * s.dir.x);
    if (perp > slope * Math.max(0, along) + t.hitRadius) continue;
    if (!inSight(m, s, t)) continue;
    m.host.hit(t, s.packet(), 'beam', p.x, p.z, s.world);
  }
};

/** The air gathers at the point for a breath, then everything goes off at once. */
const annihilate: Spell = (s, m) => {
  s.player.beginAction(s.clip, s.actTime);
  const at = new THREE.Vector3(s.aim.x, 0, s.aim.z);
  const radius = s.num('radius', 5);
  const gather = Math.max(0, s.num('gather', 0.45));
  s.landAt = at;
  m.host.effects.field(at.x, at.z, radius, gather + 0.15, { school: s.school, color: s.color, skill: s.def.id, rank: s.rank });
  m.host.effects.castFlare(s.school, at.x, 0.6, at.z, { scale: 1.6 });
  const world = s.world;
  m.host.later(gather, () => {
    m.fresh(world);
    m.quiet(() => {
      m.host.effects.explosion(at.x, 0.8, at.z, { radius, element: s.school, color: s.color, shake: 0.4 });
      m.host.effects.nova(at.x, at.z, radius, { element: s.school, color: s.color, emitter: s.sig.emitter, density: s.sig.density });
      m.host.effects.fx.burst(s.sig.emitter, at.x, 0.8, at.z, { count: 24, scale: Math.max(1.2, radius / 2.5) });
    });
    m.host.area(at, radius, (k = 1) => s.packet(k), world);
    m.host.sound(s.hitSound, at.x, at.z);
  });
};

/**
 * Leaps from the hand to the enemy nearest the aim (in reach and in sight),
 * then arcs on, losing a share each jump. Every arc is a full hit.
 */
const chainLightning: Spell = (s, m) => {
  s.player.beginAction(s.clip, s.actTime);
  const p = s.player.position;
  const reach = s.num('reach', 14);
  const hop = s.num('range', 9);
  const every = s.num('chainsPerRanks', 0);
  const jumps = Math.floor(s.num('chains', 4)) + (every > 0 ? Math.floor(s.rank / every) : 0);
  const keep = Math.max(0, 1 - s.num('falloff', 12) / 100);
  const pool = targets(s.world);
  let at: Target | null = null;
  let best = Infinity;
  for (const t of pool) {
    if (ground(t.root.position, p.x, p.z) > reach + t.hitRadius) continue;
    const d = ground(t.root.position, s.aim.x, s.aim.z);
    if (d >= best || !inSight(m, s, t)) continue;
    best = d;
    at = t;
  }
  if (!at) {
    // Nothing in reach: the arc cracks out towards the aim and dies.
    const span = Math.min(reach * 0.5, Math.max(1.5, ground(s.aim, p.x, p.z)));
    m.host.effects.beam(s.origin, s.origin.clone().addScaledVector(s.dir, span), { element: s.school, color: s.color, width: 0.3, duration: 0.14, endBurst: true });
    return;
  }
  s.landAt = at.root.position.clone().setY(0);
  const points = [s.origin.clone()];
  const struck = new Set<Target>();
  let from = s.origin;
  for (let j = 0; j < jumps && at; j++) {
    const t: Target = at;
    struck.add(t);
    const to = new THREE.Vector3(t.root.position.x, t.centerY, t.root.position.z);
    points.push(to);
    const pk = s.packet();
    pk.amount *= Math.pow(keep, j);
    m.host.hit(t, pk, 'chain', from.x, from.z, s.world);
    m.host.sound(s.hitSound, to.x, to.z);
    m.host.effects.fx.burst(s.sig.emitter, to.x, to.y, to.z, { scale: 0.6 });
    from = to;
    let next: Target | null = null;
    let near = Infinity;
    for (const o of pool) {
      if (struck.has(o) || o.life <= 0) continue;
      const d = ground(o.root.position, to.x, to.z);
      if (d <= hop && d < near) {
        near = d;
        next = o;
      }
    }
    at = next;
  }
  m.host.effects.chainLightning(points, { color: s.color, silent: true });
};

/** You become a bolt and strike a point: everything along the path is struck as you pass. */
const stormstride: Spell = (s, m) => {
  const p = s.player.position;
  const range = ranked(s, 'range', 9, 'rangePerRank');
  const want = Math.min(range, ground(s.aim, p.x, p.z));
  const from = new THREE.Vector3(p.x, 0, p.z);
  const go = want > 0.2 ? m.host.clear(from, s.dir, want, s.world.ctx, 0.5) : 0;
  const land = from.clone().addScaledVector(s.dir, go);
  const speed = Math.max(1, s.num('boltSpeed', 32));
  s.player.beginAction(s.own ?? 'blink', Math.max(0.2, Math.min(s.actTime, go / speed + 0.12)));
  const width = s.num('width', 1.6);
  const world = s.world;
  for (const t of targets(world)) {
    const dx = t.root.position.x - from.x;
    const dz = t.root.position.z - from.z;
    const along = dx * s.dir.x + dz * s.dir.z;
    if (along < -t.hitRadius || along > go + t.hitRadius) continue;
    const perp = Math.abs(dx * s.dir.z - dz * s.dir.x);
    if (perp > width * 0.5 + t.hitRadius) continue;
    m.host.later(Math.max(0, along) / speed, () => {
      m.fresh(world);
      if (t.life > 0) m.host.hit(t, s.packet(), 'beam', t.root.position.x - s.dir.x, t.root.position.z - s.dir.z, world);
    });
  }
  m.host.effects.teleportOut(from.x, 0.9, from.z, s.color);
  m.host.effects.beam(new THREE.Vector3(from.x, 0.9, from.z), new THREE.Vector3(land.x, 0.9, land.z), {
    element: s.school, color: s.color, width: Math.max(0.3, width * 0.35), duration: 0.18, endBurst: true, emitter: s.sig.emitter,
  });
  s.player.position.set(land.x, 0, land.z);
  m.host.effects.teleportIn(land.x, 0.9, land.z, s.color);
  m.host.effects.fx.burst(s.sig.emitter, land.x, 0.4, land.z, { scale: 1 });
  m.host.sound(s.hitSound, land.x, land.z);
  s.landAt = land;
};

/** A crawling sphere that strikes everything it rolls past, once each. */
const ballLightning: Spell = (s, m) => {
  s.player.beginAction(s.clip, s.actTime);
  m.launch(s, s.dir, {
    speed: s.num('speed', 6),
    range: s.num('range', 14),
    reach: s.num('radius', 3),
    size: s.num('size', 0.7),
    y: 0.8,
    hits: Infinity,
    kind: 'area',
    packet: () => s.packet(),
    onStrike: (t, x, z) => {
      m.host.effects.beam(new THREE.Vector3(x, 0.8, z), new THREE.Vector3(t.root.position.x, t.centerY, t.root.position.z), {
        element: s.school, color: s.color, width: 0.25, duration: 0.12, endBurst: true,
      });
    },
  });
};

/** A lance of ice that flies its length and pierces everything in its path. */
const iceLance: Spell = (s, m) => {
  s.player.beginAction(s.clip, s.actTime);
  m.launch(s, s.dir, {
    speed: s.num('speed', 30),
    range: s.num('length', 14),
    reach: s.num('width', 1.2) * 0.5,
    size: s.num('size', 0.42),
    hits: Infinity,
    kind: 'projectile',
    packet: () => s.packet(),
    onEnd: (x, z) => {
      m.host.effects.impact(s.school, x, 1.0, z, { scale: 0.8, color: s.color });
      m.host.effects.fx.burst(s.sig.emitter, x, 1.0, z, { scale: 0.8 });
    },
  });
};

/** A slow orb of ice that chills what it rolls past and cracks open at the end, Freezing. */
const frozenOrb: Spell = (s, m) => {
  s.player.beginAction(s.clip, s.actTime);
  const crack = s.num('crack', 3);
  const freeze: StatusApplication[] = [{ id: 'frozen', duration: s.num('freeze', 1), magnitude: 1 }];
  const world = s.world;
  m.launch(s, s.dir, {
    speed: s.num('speed', 8),
    range: s.num('range', 16),
    reach: s.num('radius', 1.6),
    size: s.num('size', 0.75),
    y: 0.8,
    shape: 'orb',
    hits: Infinity,
    kind: 'area',
    packet: () => s.packet(),
    onEnd: (x, z) => {
      m.host.effects.nova(x, z, crack, { element: s.school, color: s.color, emitter: s.sig.emitter, density: s.sig.density, mark: true });
      for (const t of targets(world)) {
        if (ground(t.root.position, x, z) <= crack + t.hitRadius) t.applyStatuses(freeze, world.ctx);
      }
    },
  });
};

/** Marks the ground: what stands in it is Shocked and opened to lightning. No damage of its own. */
const ionize: Spell = (s, m) => {
  s.player.beginAction(s.clip, s.actTime);
  const at = new THREE.Vector3(s.aim.x, 0, s.aim.z);
  const radius = s.num('radius', 7);
  const duration = s.num('duration', 10);
  m.mark(at.x, at.z, radius, duration, s.riders());
  m.host.effects.field(at.x, at.z, radius, duration, { school: s.school, color: s.color, skill: s.def.id, rank: s.rank });
  m.host.effects.nova(at.x, at.z, radius, { element: s.school, color: s.color, emitter: s.sig.emitter, density: s.sig.density });
  s.landAt = at;
};

const SPELLS: Readonly<Record<string, Spell>> = {
  fireball,
  sparkbolt,
  pyreBrand,
  infernoStream,
  annihilate,
  chainLightning,
  stormstride,
  ballLightning,
  iceLance,
  frozenOrb,
  ionize,
};
