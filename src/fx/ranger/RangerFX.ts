/**
 * SLAY — the Ranger's own looks (class id `ranger`).
 *
 * A Ranger's work is wood, gut, steel and feather: nothing of his glows but a
 * fire arrow. What is drawn here:
 *
 *  - The rains: a ring on the floor where the volley will come down, the
 *    shafts falling into it a beat later, dust where they strike; Darken The
 *    Sky dims the floor first (`rainVolley`).
 *  - Thicket of Shafts: arrows left standing in the floor (`thicketStand`).
 *  - Splinter Shot: the shaft bursting in the enemy, splinters flying on
 *    (`shatter`, `splinterFly`).
 *  - Pierce Shot: torn air down its line (the `rn.wake` motif) and the
 *    shaft punching out of the far side of each enemy (`punchThrough`).
 *  - The traps: a noose, a plate, a wire on two stakes, a hanging nest, each
 *    with a glint as it arms and its own burst as it goes (`trapLook`,
 *    `trapSpring`); spikes driven up through the floor (`spikesUp`); the
 *    swarm (`swarm`).
 *  - Thorn Barrier: brambles standing in a line (`brambleWall`).
 *  - The kestrel: a bird of two feathers wheeling over the hero and stooping
 *    on what it hunts (`kestrelUp`, `kestrelStoop`).
 *  - Small bursts: leaves for hiding and the bolt-hole, a glint for the
 *    nocked arrow, feathers for the open quiver, the mark's spark.
 *
 * Everything draws through pipelines already built at load: the shared
 * particle field, the solids (arrows, thorns, spikes, feathers, rock), the
 * floor's glow layer and the beam pool (the wire). Every piece comes from a
 * small fixed pool, so nothing here allocates per frame; past a pool's size
 * the oldest piece goes.
 *
 * Every id starts `rn.` and no other class fires one.
 */
import * as THREE from 'three';
import { SPRITE } from '../kit/Atlas';
import { registerEmitters, type Emitter, type Layer } from '../kit/Emitters';
import type { EffectHandle, EffectSystem } from '../Effects';
import type { BurstOpts } from '../Particles';
import type { SolidHandle } from '../kit/Solids';
import type { GroundHandle } from '../kit/Ground';
import { Random } from '../../core/RNG';

const DEFAULTS: Layer = {
  sprite: SPRITE.glow, variants: 1, count: 10, speed: [1, 3], spread: 1, up: 0, radius: 0.05, disc: false,
  life: [0.3, 0.6], size: [0.15, 0.25], grow: 0.5, ramp: 'school', emit: 1, occl: 0.15, heat: [1, 0.3],
  gravity: 0, drag: 2, turb: 0, spin: 0, stretch: 0, flat: false, fade: 1.5, stagger: 0, ground: false, bounce: 0.32,
  converge: false, tint: true,
};
const L = (o: Partial<Layer>): Layer => ({ ...DEFAULTS, ...o });

/** Bone and fletching: the shafts. */
const BONE = [0xf6f0e0, 0xd8ccb0, 0x5a5040] as const;
/** Dust kicked off a dungeon floor. */
const DUST = [0xcfc4ac, 0x8a7e66, 0x2e2a22] as const;
/** Leaf and moss: the class green. */
const LEAF = [0xd8f0b0, 0x7fc46a, 0x22401a] as const;
/** Bark and dry thorn. */
const BARK = [0xc8a070, 0x6b4a2e, 0x1e140c] as const;
/** Amber: wasps, a trap's glint. */
const AMBER = [0xfff0b0, 0xd89a2a, 0x4a2a08] as const;
/** Steel and sky grey: the volley's glints. */
const STEEL = [0xf4f8fc, 0xb8c4cc, 0x3a4650] as const;
/** Hunter's red: the mark. */
const MARK = [0xffd0c0, 0xb8322a, 0x3a0a08] as const;

const EM: Record<string, Emitter> = {
  /** Shafts falling out of the sky: long streaks, head down, gone as they strike. */
  'rn.rain': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.glint, variants: 4, count: 12, ramp: BONE, speed: [22, 28], spread: 0.04, radius: 0.2, size: [0.05, 0.08], grow: 1, life: [0.24, 0.3], heat: [0.8, 0.5], emit: 0.7, occl: 0.6, stretch: 3.2, drag: 0, fade: 3, ground: true, bounce: 0, tint: false }),
    ],
  },
  /** Where a volley strikes: dust thrown low, chips of shaft. */
  'rn.dust': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.smoke, count: 8, ramp: DUST, speed: [0.8, 2.2], up: 0.25, disc: true, radius: 0.5, size: [0.35, 0.6], grow: 2, life: [0.6, 1.0], heat: [0.05, 0], emit: 0.04, occl: 0.6, gravity: -0.3, drag: 2.6, turb: 0.2, spin: 0.5, fade: 1.1, tint: false }),
      L({ sprite: SPRITE.shard, count: 6, ramp: BONE, speed: [1.5, 3.5], up: 0.9, radius: 0.3, size: [0.03, 0.05], grow: 0.8, life: [0.35, 0.6], heat: [0.6, 0.3], emit: 0.6, occl: 0.6, gravity: -11, drag: 0.8, spin: 8, ground: true, bounce: 0.2, tint: false, rich: true }),
    ],
  },
  /** A shaft bursting inside what it struck: splinters and a puff of dust. */
  'rn.shatter': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.shard, count: 12, ramp: BONE, speed: [3, 6], spread: 0.5, up: 0.2, radius: 0.1, size: [0.035, 0.06], grow: 0.7, life: [0.3, 0.5], heat: [0.8, 0.4], emit: 0.7, occl: 0.6, gravity: -9, drag: 1.2, spin: 10, ground: true, bounce: 0.2, tint: false }),
      L({ sprite: SPRITE.smoke, count: 3, ramp: DUST, speed: [0.4, 1], radius: 0.15, size: [0.25, 0.4], grow: 1.8, life: [0.4, 0.6], heat: [0.05, 0], emit: 0.04, occl: 0.5, drag: 2, tint: false }),
    ],
  },
  /**
   * Pierce Shot's wake: thin streaks of torn air rushing on after the shaft,
   * and a breath of dust it drags behind. Thrown along the shot.
   */
  'rn.wake': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.glint, variants: 4, count: 4, ramp: STEEL, speed: [7, 12], spread: 0.06, radius: 0.22, size: [0.018, 0.03], grow: 0.6, life: [0.12, 0.2], heat: [0.6, 0.2], emit: 0.35, occl: 0.3, stretch: 4.5, drag: 7, fade: 2.2, tint: false }),
      L({ sprite: SPRITE.smoke, count: 1, ramp: DUST, speed: [1.5, 2.5], spread: 0.3, radius: 0.15, size: [0.25, 0.35], grow: 1.6, life: [0.35, 0.55], heat: [0.04, 0], emit: 0.03, occl: 0.4, drag: 3, turb: 0.2, fade: 1.3, tint: false }),
    ],
  },
  /** Pierce Shot going through what it struck: splinters, grit and a streak out of the far side. */
  'rn.punch': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.glint, variants: 4, count: 5, ramp: STEEL, speed: [9, 15], spread: 0.12, radius: 0.08, size: [0.025, 0.04], grow: 0.5, life: [0.08, 0.14], heat: [1, 0.5], emit: 0.9, occl: 0.2, stretch: 3.5, drag: 5, fade: 2.4, tint: false }),
      L({ sprite: SPRITE.shard, count: 8, ramp: BONE, speed: [4, 8], spread: 0.35, up: 0.15, radius: 0.1, size: [0.03, 0.05], grow: 0.7, life: [0.3, 0.5], heat: [0.7, 0.3], emit: 0.6, occl: 0.6, gravity: -9, drag: 1.2, spin: 10, ground: true, bounce: 0.2, tint: false }),
      L({ sprite: SPRITE.smoke, count: 2, ramp: DUST, speed: [1.2, 2.4], spread: 0.45, radius: 0.15, size: [0.25, 0.4], grow: 1.8, life: [0.35, 0.6], heat: [0.05, 0], emit: 0.04, occl: 0.5, drag: 2.4, fade: 1.2, tint: false }),
    ],
  },
  /** A trap snapping shut: cord and leaf thrown up. */
  'rn.snap': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.glint, variants: 4, count: 6, ramp: BARK, speed: [2, 4], up: 0.8, radius: 0.2, size: [0.03, 0.05], grow: 0.4, life: [0.15, 0.25], heat: [1, 0.5], emit: 0.8, occl: 0.4, stretch: 1.4, drag: 3, fade: 2, tint: false }),
      L({ sprite: SPRITE.flake, count: 6, ramp: LEAF, speed: [1, 2.5], up: 1.2, radius: 0.3, size: [0.05, 0.08], grow: 0.8, life: [0.7, 1.1], heat: [0.4, 0.2], emit: 0.3, occl: 0.7, gravity: -3, drag: 2, turb: 0.6, spin: 6, ground: true, bounce: 0, tint: false }),
    ],
  },
  /** Spikes driven up through the floor: grit and stone thrown up. */
  'rn.spring': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.rock, count: 10, ramp: DUST, speed: [2.5, 5], up: 1.4, disc: true, radius: 0.6, size: [0.04, 0.08], grow: 0.8, life: [0.45, 0.75], heat: [0.4, 0.2], emit: 0.3, occl: 0.8, gravity: -12, drag: 0.6, spin: 6, ground: true, bounce: 0.25, tint: false }),
      L({ sprite: SPRITE.smoke, count: 6, ramp: DUST, speed: [0.6, 1.6], up: 0.4, disc: true, radius: 0.7, size: [0.4, 0.7], grow: 1.8, life: [0.7, 1.1], heat: [0.05, 0], emit: 0.04, occl: 0.6, gravity: -0.2, drag: 2.4, turb: 0.2, fade: 1.1, tint: false }),
    ],
  },
  /** The swarm: amber motes that jink and hang. */
  'rn.wasp': {
    school: 'poison',
    layers: [
      L({ sprite: SPRITE.mote, count: 10, ramp: AMBER, speed: [1.5, 3], up: 0.3, radius: 0.8, size: [0.03, 0.05], grow: 0.8, life: [0.35, 0.6], heat: [0.9, 0.5], emit: 0.7, occl: 0.5, drag: 1, turb: 3, fade: 1.6, tint: false }),
    ],
  },
  /** Bramble torn up: thorn and leaf. */
  'rn.bramble': {
    school: 'poison',
    layers: [
      L({ sprite: SPRITE.flake, count: 6, ramp: LEAF, speed: [0.8, 2], up: 1, radius: 0.4, size: [0.05, 0.08], grow: 0.8, life: [0.6, 1.0], heat: [0.4, 0.2], emit: 0.3, occl: 0.7, gravity: -2.5, drag: 2, turb: 0.5, spin: 5, ground: true, bounce: 0, tint: false }),
      L({ sprite: SPRITE.shard, count: 4, ramp: BARK, speed: [1, 2.5], up: 0.8, radius: 0.3, size: [0.03, 0.05], grow: 0.8, life: [0.3, 0.5], heat: [0.4, 0.2], emit: 0.3, occl: 0.8, gravity: -9, drag: 1, spin: 8, ground: true, bounce: 0.2, tint: false }),
    ],
  },
  /** Leaves shaken loose: hiding, the bolt-hole. */
  'rn.leaves': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.flake, count: 12, ramp: LEAF, speed: [0.6, 1.8], up: 0.9, radius: 0.5, size: [0.05, 0.09], grow: 0.8, life: [0.9, 1.4], heat: [0.4, 0.2], emit: 0.3, occl: 0.7, gravity: -1.6, drag: 2, turb: 0.8, spin: 5, fade: 1.2, ground: true, bounce: 0, tint: false }),
    ],
  },
  /** A glint: a trap armed, an arrow nocked, steel catching the light. */
  'rn.glint': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.flare, count: 1, ramp: STEEL, speed: [0, 0], radius: 0, size: [0.22, 0.3], grow: 0.6, life: [0.14, 0.2], heat: [1, 0.6], emit: 1.4, occl: 0, fade: 2.2, tint: true }),
      L({ sprite: SPRITE.glint, variants: 4, count: 3, ramp: STEEL, speed: [0.4, 1], radius: 0.03, size: [0.02, 0.035], grow: 0.4, life: [0.12, 0.2], heat: [1, 0.6], emit: 1.4, occl: 0, stretch: 1.5, drag: 4, fade: 2, tint: true }),
    ],
  },
  /** Feathers: the open quiver, the kestrel. */
  'rn.feather': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.flake, count: 8, ramp: BONE, speed: [0.6, 1.6], up: 0.8, radius: 0.4, size: [0.05, 0.09], grow: 0.9, life: [0.9, 1.4], heat: [0.4, 0.2], emit: 0.3, occl: 0.75, gravity: -1.2, drag: 2.4, turb: 0.9, spin: 4, fade: 1.2, tint: false }),
    ],
  },
  /** The mark: a red spark that pricks and fades. */
  'rn.mark': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.flare, count: 1, ramp: MARK, speed: [0, 0], radius: 0, size: [0.35, 0.45], grow: 0.5, life: [0.18, 0.25], heat: [1, 0.6], emit: 1.2, occl: 0, fade: 2, tint: false }),
      L({ sprite: SPRITE.spark, count: 6, ramp: MARK, speed: [1, 2.5], radius: 0.1, size: [0.03, 0.05], grow: 0.4, life: [0.2, 0.35], heat: [1, 0.5], emit: 1, occl: 0, drag: 3, fade: 1.8, tint: false }),
    ],
  },
};

registerEmitters(EM);

/** Every Ranger emitter id, for the checkers. */
export const RANGER_EMITTERS: readonly string[] = Object.keys(EM);

/** Cosmetic only: where a shaft stands, how a thorn leans. */
const rng = new Random(0x7a39e1);
const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
/** Burst options for the bursts made from a tick, kept so none allocates. */
const SWARM_OPTS: BurstOpts = { count: 10, scatter: 1 };
const GLINT_OPTS: BurstOpts = { count: 12 };
const STRIKE_OPTS: BurstOpts = { count: 6 };

const BARK_GLOW = 0x8a6a3e;
const AMBER_GLOW = 0xd89a2a;
const BRAMBLE_GLOW = 0x3c5a22;

// ---------------------------------------------------------------------------
// The rains
// ---------------------------------------------------------------------------

/** How high the falling shafts start. */
const RAIN_Y = 6.5;
/** Seconds the shafts take to fall from there. */
const RAIN_DROP = 0.26;

/**
 * A volley loosed high that comes down across (x, z) within `radius`,
 * `fall` seconds from now. `density` is how thick it falls (1 a rain); the
 * particle field trims the shafts to the quality ladder on its own.
 */
export function rainVolley(effects: EffectSystem, x: number, z: number, radius: number, density: number, fall: number, color: number): void {
  const r = Math.max(0.5, radius);
  // Where it will land, drawn the moment it is loosed.
  effects.decals.glow('auraRing', x, z, r, fall + 0.12, color, 0.7);
  // The sky darkens over a great volley.
  if (fall >= 0.6) effects.decals.glow('shadow', x, z, r * 1.1, fall + 0.9, 0x000000, 0);
  const shafts = Math.round(Math.min(36, Math.max(10, r * 3.2 * Math.max(0.4, density))));
  effects.delay(Math.max(0, fall - RAIN_DROP), () => {
    effects.fx.burst('rn.rain', x, RAIN_Y, z, { count: shafts, dir: DOWN, scatter: r * 0.85 });
  });
  effects.delay(fall, () => {
    effects.fx.burst('rn.dust', x, 0.1, z, { count: Math.min(30, 6 + r * 2), ring: r * 0.55 });
    effects.fx.burst('rn.dust', x, 0.1, z, { count: 8, scatter: r * 0.3 });
    effects.decals.glow('scuff', x, z, r * 0.9, 6, 0x2e2a22, 0, rng.range(0, Math.PI * 2));
  });
}

// ---------------------------------------------------------------------------
// Thicket of Shafts
// ---------------------------------------------------------------------------

interface Stuck {
  h: SolidHandle | null;
  left: number;
}
/** Shafts standing in the floor at once, every thicket together. */
const STUCK: Stuck[] = Array.from({ length: 14 }, () => ({ h: null, left: 0 }));
let stuckNext = 0;
let solidsOf: EffectSystem | null = null;

/** Arrows left standing where a rain came down, for `sec` seconds. */
export function thicketStand(effects: EffectSystem, x: number, z: number, radius: number, sec: number): void {
  solidsOf = effects;
  const r = Math.max(0.5, radius);
  effects.decals.glow('auraRing', x, z, r, sec, 0x8a7e66, 0.35);
  const n = Math.min(7, Math.max(3, Math.round(r * 1.2)));
  for (let i = 0; i < n; i++) {
    const s = STUCK[stuckNext]!;
    stuckNext = (stuckNext + 1) % STUCK.length;
    effects.solids.free(s.h);
    s.h = effects.solids.alloc('arrow');
    s.left = sec;
    const a = rng.range(0, Math.PI * 2);
    const d = Math.sqrt(rng.next()) * r * 0.9;
    // Head down in the floor, leaning a little off true.
    _v.set(rng.range(-0.35, 0.35), -1, rng.range(-0.35, 0.35));
    effects.solids.place(s.h, x + Math.cos(a) * d, 0.32, z + Math.sin(a) * d, _v.x, _v.y, _v.z, rng.range(0, 3), 0.9, 1);
  }
}

export function clearThickets(): void {
  for (const s of STUCK) {
    solidsOf?.solids.free(s.h);
    s.h = null;
    s.left = 0;
  }
}

function stuckTick(dt: number): void {
  if (!solidsOf) return;
  for (const s of STUCK) {
    if (!s.h) continue;
    s.left -= dt;
    if (s.left <= 0) {
      solidsOf.solids.free(s.h);
      s.h = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Splinter Shot
// ---------------------------------------------------------------------------

/** The shaft bursting inside what it struck at (x, z), thrown on along `dir`. */
export function shatter(effects: EffectSystem, x: number, z: number, dir: THREE.Vector3): void {
  effects.fx.burst('rn.shatter', x, 1.1, z, { count: 14, dir });
}

/** Pierce Shot passing through what stands at (x, z), going on along `dir`. */
export function punchThrough(effects: EffectSystem, x: number, z: number, dir: THREE.Vector3): void {
  effects.fx.burst('rn.punch', x + dir.x * 0.35, 1.15, z + dir.z * 0.35, { count: 15, dir });
}

/** One splinter flying `stop` metres from `from` along `dir`. */
export function splinterFly(effects: EffectSystem, from: THREE.Vector3, dir: THREE.Vector3, stop: number): void {
  const to = from.clone().addScaledVector(dir, Math.max(0.3, stop));
  effects.projectile(from, to, { element: 'physical', color: BONE[1], shape: 'needle', flare: false, impact: false, speed: 32, size: 0.16 });
}

// ---------------------------------------------------------------------------
// The traps
// ---------------------------------------------------------------------------

export type TrapKind = 'snare' | 'spike' | 'wire' | 'wasp';

interface Look {
  live: boolean;
  kind: TrapKind;
  glow: GroundHandle | null;
  a: SolidHandle | null;
  b: SolidHandle | null;
  wire: EffectHandle | null;
  readonly p: THREE.Vector3;
  readonly q: THREE.Vector3;
  readonly getP: () => THREE.Vector3;
  readonly getQ: () => THREE.Vector3;
}

function makeLook(): Look {
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  return { live: false, kind: 'snare', glow: null, a: null, b: null, wire: null, p, q, getP: () => p, getQ: () => q };
}

/** Traps drawn at once. */
const LOOKS: Look[] = Array.from({ length: 14 }, makeLook);
let lookNext = 0;

/**
 * Draws a trap lying in wait at (x, z) for `life` seconds: a noose, a plate,
 * a wire `size` metres long across (dirX, dirZ), or a hanging nest. Returns
 * its slot for `trapArmed` and `trapEnd`.
 */
export function trapLook(effects: EffectSystem, kind: TrapKind, x: number, z: number, dirX: number, dirZ: number, size: number, life: number): number {
  solidsOf = effects;
  const slot = lookNext;
  lookNext = (lookNext + 1) % LOOKS.length;
  const k = LOOKS[slot]!;
  endLook(effects, k);
  k.live = true;
  k.kind = kind;
  const s = effects.solids;
  const yaw = Math.atan2(dirX, dirZ);
  if (kind === 'snare') {
    // A noose of cord on the floor, a bent stake to spring it.
    k.glow = effects.decals.glow('auraRing', x, z, Math.max(0.5, size * 0.4), life, BARK_GLOW, 0.3);
    k.a = s.alloc('thorn');
    s.place(k.a, x + 0.35, 0.22, z, 0.3, 1, 0, 0, 0.5, 1.2);
  } else if (kind === 'spike') {
    // A plate of old boards over the pit.
    k.glow = effects.decals.glow('runeCircle', x, z, Math.max(0.5, size), life, BARK_GLOW, 0.25, yaw, 0.2);
  } else if (kind === 'wire') {
    // Two stakes and a wire between them, shin high.
    const hx = (dirX * size) / 2;
    const hz = (dirZ * size) / 2;
    k.p.set(x - hx, 0.32, z - hz);
    k.q.set(x + hx, 0.32, z + hz);
    k.a = s.alloc('spike');
    k.b = s.alloc('spike');
    s.place(k.a, k.p.x, 0.2, k.p.z, 0, 1, 0, 0, 0.45, 0.8);
    s.place(k.b, k.q.x, 0.2, k.q.z, 0, 1, 0, 0, 0.45, 0.8);
    k.wire = effects.tether(k.getP, k.getQ, { color: STEEL[1], element: 'physical', width: 0.012, jitter: 0 });
  } else {
    // A papery nest hung low, amber light under it.
    k.a = s.alloc('rock');
    s.place(k.a, x, 0.55, z, 0, 1, 0, rng.range(0, 3), 0.5, 0.9);
    k.glow = effects.decals.glow('lightPool', x, z, 0.7, life, AMBER_GLOW, 0.35);
  }
  return slot;
}

/** The trap in `slot` is armed: a glint. */
export function trapArmed(effects: EffectSystem, slot: number, x: number, z: number): void {
  const k = LOOKS[slot];
  if (!k || !k.live) return;
  effects.fx.burst('rn.glint', x, k.kind === 'wasp' ? 0.6 : 0.3, z, GLINT_OPTS);
}

/** The trap in `slot` is gone (sprung, run out, replaced). */
export function trapEnd(effects: EffectSystem, slot: number): void {
  const k = LOOKS[slot];
  if (k) endLook(effects, k);
}

function endLook(effects: EffectSystem, k: Look): void {
  if (!k.live) return;
  k.live = false;
  effects.decals.glows.end(k.glow);
  effects.solids.free(k.a);
  effects.solids.free(k.b);
  k.wire?.stop();
  k.glow = null;
  k.a = null;
  k.b = null;
  k.wire = null;
}

/** A trap going off at (x, z): its own burst, over `size` metres (a wire's length along (dirX, dirZ)). */
export function trapSpring(effects: EffectSystem, kind: TrapKind, x: number, z: number, dirX: number, dirZ: number, size: number): void {
  const fx = effects.fx;
  if (kind === 'snare') {
    fx.burst('rn.snap', x, 0.3, z, { count: 16 });
    effects.decals.glow('shockRing', x, z, Math.max(0.6, size), 0.35, BARK_GLOW, 0.8);
  } else if (kind === 'spike') {
    spikesUp(effects, x, z, size);
  } else if (kind === 'wire') {
    const n = 4;
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1) - 0.5) * size;
      fx.burst('rn.snap', x + dirX * u, 0.3, z + dirZ * u, { count: 8 });
    }
  } else {
    fx.burst('rn.bramble', x, 0.6, z, { count: 10 });
    swarm(effects, x, z, size);
  }
}

/** One beat of the swarm over (x, z) within `radius`. */
export function swarm(effects: EffectSystem, x: number, z: number, radius: number): void {
  SWARM_OPTS.scatter = Math.max(0.5, radius * 0.7);
  SWARM_OPTS.count = Math.min(30, 8 + radius * 3);
  effects.fx.burst('rn.wasp', x, 1.0, z, SWARM_OPTS);
}

interface Spike {
  h: SolidHandle | null;
  t: number;
  x: number;
  z: number;
  lean: number;
  turn: number;
}
/** Spikes up at once. */
const SPIKES: Spike[] = Array.from({ length: 18 }, () => ({ h: null, t: 0, x: 0, z: 0, lean: 0, turn: 0 }));
let spikeNext = 0;
/** A spike's life: out of the floor, held, back down. */
const SPIKE_UP = 0.08;
const SPIKE_HOLD = 0.45;
const SPIKE_DOWN = 0.25;

/** Spikes driven up through the floor across (x, z) within `radius`. */
export function spikesUp(effects: EffectSystem, x: number, z: number, radius: number): void {
  solidsOf = effects;
  const r = Math.max(0.6, radius);
  effects.fx.burst('rn.spring', x, 0.1, z, { count: 16, scatter: r * 0.5 });
  effects.decals.glow('crack', x, z, r, 8, 0x1e140c, 0, rng.range(0, Math.PI * 2));
  const n = Math.min(9, Math.max(5, Math.round(r * 2.5)));
  for (let i = 0; i < n; i++) {
    const s = SPIKES[spikeNext]!;
    spikeNext = (spikeNext + 1) % SPIKES.length;
    effects.solids.free(s.h);
    s.h = effects.solids.alloc('spike');
    s.t = -rng.range(0, 0.06);
    const a = (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const d = i === 0 ? 0 : Math.sqrt(rng.range(0.15, 1)) * r * 0.85;
    s.x = x + Math.cos(a) * d;
    s.z = z + Math.sin(a) * d;
    s.lean = rng.range(0, 0.3);
    s.turn = a;
  }
}

function spikeTick(effects: EffectSystem, dt: number): void {
  for (const s of SPIKES) {
    if (!s.h) continue;
    s.t += dt;
    const t = s.t;
    if (t > SPIKE_UP + SPIKE_HOLD + SPIKE_DOWN) {
      effects.solids.free(s.h);
      s.h = null;
      continue;
    }
    const out = t < 0 ? 0 : t < SPIKE_UP ? t / SPIKE_UP : t < SPIKE_UP + SPIKE_HOLD ? 1 : 1 - (t - SPIKE_UP - SPIKE_HOLD) / SPIKE_DOWN;
    const len = 1.1;
    _v.set(Math.cos(s.turn) * s.lean, 1, Math.sin(s.turn) * s.lean);
    effects.solids.place(s.h, s.x, -len * 0.5 + out * len * 0.55, s.z, _v.x, _v.y, _v.z, 0, len, 1.1);
  }
}

// ---------------------------------------------------------------------------
// Thorn Barrier
// ---------------------------------------------------------------------------

interface Thorn {
  h: SolidHandle | null;
  left: number;
  t: number;
  x: number;
  z: number;
  dx: number;
  dz: number;
  len: number;
}
const THORNS: Thorn[] = Array.from({ length: 16 }, () => ({ h: null, left: 0, t: 0, x: 0, z: 0, dx: 0, dz: 0, len: 1 }));
let thornNext = 0;
/** Seconds the brambles take to come up. */
const THORN_GROW = 0.25;

/** Brambles standing from (ax, az) to (bx, bz) for `sec` seconds, `width` thick. */
export function brambleWall(effects: EffectSystem, ax: number, az: number, bx: number, bz: number, width: number, sec: number): void {
  solidsOf = effects;
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.min(8, Math.max(3, Math.round(len * 1.1)));
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    const x = ax + (bx - ax) * u + rng.range(-0.2, 0.2) * width;
    const z = az + (bz - az) * u + rng.range(-0.2, 0.2) * width;
    const t = THORNS[thornNext]!;
    thornNext = (thornNext + 1) % THORNS.length;
    effects.solids.free(t.h);
    t.h = effects.solids.alloc('thorn');
    t.left = sec;
    t.t = -u * 0.12;
    t.x = x;
    t.z = z;
    const a = rng.range(0, Math.PI * 2);
    t.dx = Math.cos(a) * 0.45;
    t.dz = Math.sin(a) * 0.45;
    t.len = rng.range(0.9, 1.3);
    effects.decals.glow('poisonPool', x, z, width * 0.75, sec, BRAMBLE_GLOW, 0.25, a);
    effects.fx.burst('rn.bramble', x, 0.2, z, { count: 8 });
  }
}

/** Something forced through the brambles at (x, z). */
export function brambleTouch(effects: EffectSystem, x: number, z: number): void {
  effects.fx.burst('rn.bramble', x, 0.7, z, { count: 6 });
}

function thornTick(effects: EffectSystem, dt: number): void {
  for (const t of THORNS) {
    if (!t.h) continue;
    t.left -= dt;
    t.t += dt;
    if (t.left <= 0) {
      effects.solids.free(t.h);
      t.h = null;
      continue;
    }
    const grow = Math.max(0, Math.min(1, t.t / THORN_GROW)) * Math.min(1, t.left / 0.3);
    effects.solids.place(t.h, t.x, grow * t.len * 0.4, t.z, t.dx, 1, t.dz, 0, Math.max(0.05, grow * t.len), 1.4);
  }
}

// ---------------------------------------------------------------------------
// The kestrel
// ---------------------------------------------------------------------------

/** What the kestrel circles. */
export interface Perch {
  readonly position: THREE.Vector3;
  readonly alive: boolean;
}

const bird = {
  live: false,
  left: 0,
  over: null as Perch | null,
  wingL: null as SolidHandle | null,
  wingR: null as SolidHandle | null,
  angle: 0,
  /** Seconds into a stoop; <0 when circling. */
  stoop: -1,
  pos: new THREE.Vector3(),
  from: new THREE.Vector3(),
  prey: new THREE.Vector3(),
};
/** Seconds from the stoop's start to its strike, and back up. */
export const STOOP = 0.22;
const CLIMB = 0.35;
const CIRCLE_R = 2.4;
const CIRCLE_Y = 3.4;

/** The kestrel takes the air over `over` for `sec` seconds. */
export function kestrelUp(effects: EffectSystem, over: Perch, sec: number): void {
  solidsOf = effects;
  if (!bird.live) {
    bird.wingL = effects.solids.alloc('feather');
    bird.wingR = effects.solids.alloc('feather');
    bird.angle = rng.range(0, Math.PI * 2);
    bird.pos.copy(over.position).setY(CIRCLE_Y);
  }
  bird.live = true;
  bird.left = sec;
  bird.over = over;
  bird.stoop = -1;
  effects.fx.burst('rn.feather', over.position.x, 2.2, over.position.z, { count: 10 });
}

/** The kestrel stoops on (x, z): its talons strike `STOOP` seconds from now. */
export function kestrelStoop(x: number, z: number): void {
  if (!bird.live) return;
  bird.stoop = 0;
  bird.from.copy(bird.pos);
  bird.prey.set(x, 1.0, z);
}

/** The kestrel is gone. */
export function kestrelDown(effects: EffectSystem): void {
  if (!bird.live) return;
  bird.live = false;
  effects.fx.burst('rn.feather', bird.pos.x, bird.pos.y, bird.pos.z, { count: 8 });
  effects.solids.free(bird.wingL);
  effects.solids.free(bird.wingR);
  bird.wingL = null;
  bird.wingR = null;
  bird.over = null;
}

function birdTick(effects: EffectSystem, dt: number): void {
  if (!bird.live) return;
  bird.left -= dt;
  const over = bird.over;
  if (bird.left <= 0 || !over || !over.alive) {
    kestrelDown(effects);
    return;
  }
  bird.angle += dt * 1.6;
  const cx = over.position.x + Math.cos(bird.angle) * CIRCLE_R;
  const cz = over.position.z + Math.sin(bird.angle) * CIRCLE_R;
  const px = bird.pos.x;
  const py = bird.pos.y;
  const pz = bird.pos.z;
  if (bird.stoop >= 0) {
    bird.stoop += dt;
    if (bird.stoop < STOOP) {
      const u = bird.stoop / STOOP;
      bird.pos.lerpVectors(bird.from, bird.prey, u * u);
    } else if (bird.stoop < STOOP + CLIMB) {
      if (bird.stoop - dt < STOOP) effects.fx.burst('rn.feather', bird.prey.x, 1.1, bird.prey.z, STRIKE_OPTS);
      const u = (bird.stoop - STOOP) / CLIMB;
      bird.pos.set(bird.prey.x + (cx - bird.prey.x) * u, bird.prey.y + (CIRCLE_Y - bird.prey.y) * u, bird.prey.z + (cz - bird.prey.z) * u);
    } else bird.stoop = -1;
  } else {
    // Back on its circle, easing in if it was elsewhere.
    const k = Math.min(1, dt * 6);
    bird.pos.set(px + (cx - px) * k, py + (CIRCLE_Y + Math.sin(bird.angle * 2) * 0.2 - py) * k, pz + (cz - pz) * k);
  }
  // Two feathers swept back from the body, beating.
  let dx = bird.pos.x - px;
  let dy = bird.pos.y - py;
  let dz = bird.pos.z - pz;
  const d = Math.hypot(dx, dy, dz);
  if (d < 1e-5) {
    dx = -Math.sin(bird.angle);
    dy = 0;
    dz = Math.cos(bird.angle);
  } else {
    dx /= d;
    dy /= d;
    dz /= d;
  }
  const beat = bird.stoop >= 0 && bird.stoop < STOOP ? 0.15 : Math.sin(bird.angle * 9) * 0.5;
  const sx = dz;
  const sz = -dx;
  effects.solids.place(bird.wingL, bird.pos.x + sx * 0.14, bird.pos.y, bird.pos.z + sz * 0.14, dx - sx * 0.8, dy + beat, dz - sz * 0.8, 0.4, 0.55, 1.2);
  effects.solids.place(bird.wingR, bird.pos.x - sx * 0.14, bird.pos.y, bird.pos.z - sz * 0.14, dx + sx * 0.8, dy + beat, dz + sz * 0.8, -0.4, 0.55, 1.2);
}

// ---------------------------------------------------------------------------
// Small bursts
// ---------------------------------------------------------------------------

/** Leaves shaken loose round (x, z): the hero vanishing, the bolt-hole. */
export function leaves(effects: EffectSystem, x: number, z: number): void {
  effects.fx.burst('rn.leaves', x, 1.0, z, { count: 14 });
}

/** A glint at a point: the nocked arrow, a trap armed. */
export function glint(effects: EffectSystem, x: number, y: number, z: number, color?: number): void {
  effects.fx.burst('rn.glint', x, y, z, color === undefined ? GLINT_OPTS : { count: 12, color });
}

/** Feathers thrown round the hero: the open quiver. */
export function feathers(effects: EffectSystem, x: number, z: number): void {
  effects.fx.burst('rn.feather', x, 1.3, z, { count: 14, dir: UP });
}

/** The mark lands on, or jumps to, what stands at (x, z). */
export function markSpark(effects: EffectSystem, x: number, y: number, z: number): void {
  effects.fx.burst('rn.mark', x, y, z, { count: 12 });
}

// ---------------------------------------------------------------------------
// Every frame
// ---------------------------------------------------------------------------

export function tickRangerFX(effects: EffectSystem, dt: number): void {
  stuckTick(dt);
  spikeTick(effects, dt);
  thornTick(effects, dt);
  birdTick(effects, dt);
}

/** Ends everything running (a new floor). */
export function clearRangerFX(effects: EffectSystem): void {
  clearThickets();
  for (const k of LOOKS) endLook(effects, k);
  for (const s of SPIKES) {
    effects.solids.free(s.h);
    s.h = null;
  }
  for (const t of THORNS) {
    effects.solids.free(t.h);
    t.h = null;
  }
  kestrelDown(effects);
}
