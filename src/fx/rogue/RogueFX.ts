/**
 * SLAY — the Rogue's own looks (class id `shadowblade`).
 *
 * Venom is wet, green and heavy: it beads, drips and splats. Shadow gives no
 * light: it falls and settles. Ghost steel is pale with the class green at
 * its edge. What is drawn here:
 *
 *  - Coat Blades: while the blades are coated, venom beads on each edge and
 *    drips off near the point, so the buff is seen on the weapon, not only
 *    in the buff bar (`tickRogueFX`, driven by the status).
 *  - Envenom Burst: a green thread torn out of every Poisoned enemy in
 *    reach, reeled into the burst (`envenomThread`).
 *  - Death Lotus: a petal of venom light laid on the floor along each cut,
 *    a full lotus round the hero by the last one (`lotusPetal`).
 *  - Nightfall: a curtain of shadow falling round the field's edge and over
 *    it, settling on the floor as the darkness takes (`nightfallCurtain`).
 *  - Phantom Blades: the ghost knife's wake (`rg.phantomwake`). The knife is
 *    the `phantom` solid (`fx/kit/Solids.ts`).
 *
 * Everything draws through pipelines already built at load: the shared
 * particle field (counts on the quality ladder and the pressure valve,
 * `rich` layers on High and Ultra only), the beam pool (the threads) and the
 * floor's glow layer (the petals). The phantom knife is one more solid, and
 * the solids' stand-ins already warm every shape for `warmup()`. Nothing here
 * allocates per frame: the threads and the blades' measures are kept in
 * small fixed pools.
 *
 * Every id starts `rg.` and no other class fires one.
 */
import * as THREE from 'three';
import { SPRITE } from '../kit/Atlas';
import { registerEmitters, type Emitter, type Layer } from '../kit/Emitters';
import type { EffectHandle, EffectSystem } from '../Effects';
import type { BurstOpts } from '../Particles';
import { Random } from '../../core/RNG';

const DEFAULTS: Layer = {
  sprite: SPRITE.glow, variants: 1, count: 10, speed: [1, 3], spread: 1, up: 0, radius: 0.05, disc: false,
  life: [0.3, 0.6], size: [0.15, 0.25], grow: 0.5, ramp: 'school', emit: 1, occl: 0.15, heat: [1, 0.3],
  gravity: 0, drag: 2, turb: 0, spin: 0, stretch: 0, flat: false, fade: 1.5, stagger: 0, ground: false, bounce: 0.32,
  converge: false, tint: true,
};
const L = (o: Partial<Layer>): Layer => ({ ...DEFAULTS, ...o });

/** Venom: a pale bead, an acid green body, a black-green dark. */
const VENOM = [0xeaffb8, 0x6ed02a, 0x163a08] as const;
/** Shadow that hides: barely lit, violet-black. */
const SHADE = [0x40344e, 0x17111f, 0x050308] as const;
/** The last light caught in the falling dark: pale, with the class green in it. */
const DUSK = [0xe4f4ec, 0x7aa08c, 0x14241c] as const;
/** Ghost steel: nearly white, the class green at the edge. */
const GHOST = [0xf2fff8, 0xa8f0cc, 0x2a6a4a] as const;

/** The petals' venom light on the floor. */
const PETAL = 0x7ad83a;

const EM: Record<string, Emitter> = {
  /** A bead of venom off the blade: it swells, falls and splats. A sheen holds on the edge. */
  'rg.coatdrip': {
    school: 'poison',
    layers: [
      L({ sprite: SPRITE.drip, count: 3, ramp: VENOM, speed: [0.02, 0.15], size: [0.035, 0.06], grow: 0.9, life: [0.55, 0.85], heat: [0.9, 0.4], emit: 0.9, occl: 0.45, gravity: -9, drag: 0.4, stretch: 0.35, ground: true, bounce: 0, tint: false }),
      L({ sprite: SPRITE.mote, count: 3, ramp: VENOM, speed: [0, 0.1], radius: 0.05, size: [0.03, 0.06], grow: 0.6, life: [0.2, 0.35], heat: [1, 0.5], emit: 1.2, occl: 0, drag: 4, fade: 1.8, tint: false }),
      L({ sprite: SPRITE.gas, count: 1, ramp: VENOM, speed: [0.05, 0.2], up: 1, size: [0.1, 0.16], grow: 2.2, life: [0.6, 1.0], heat: [0.4, 0], emit: 0.18, occl: 0.25, gravity: 0.25, drag: 1.5, turb: 0.3, spin: 0.8, tint: false, rich: true }),
    ],
  },
  /** Where a thread tears out of a body: venom spattered off it and a breath of fume. */
  'rg.tear': {
    school: 'poison',
    layers: [
      L({ sprite: SPRITE.glow, count: 1, ramp: VENOM, speed: [0, 0], radius: 0, size: [0.45, 0.55], grow: 1.4, life: [0.1, 0.14], heat: [1, 0.5], emit: 1.1, occl: 0, fade: 2.2, tint: false }),
      L({ sprite: SPRITE.drop, count: 8, ramp: VENOM, speed: [1.5, 3.5], up: 0.6, radius: 0.15, size: [0.04, 0.08], grow: 0.8, life: [0.45, 0.75], heat: [0.9, 0.4], emit: 0.9, occl: 0.4, gravity: -9, drag: 1.2, stretch: 0.5, ground: true, bounce: 0, tint: false }),
      L({ sprite: SPRITE.gas, count: 3, ramp: VENOM, speed: [0.3, 0.8], radius: 0.2, size: [0.25, 0.4], grow: 2, life: [0.5, 0.8], heat: [0.6, 0], emit: 0.3, occl: 0.3, gravity: 0.2, drag: 2, turb: 0.3, tint: false, rich: true }),
    ],
  },
  /** Beads shaken off a thread as it is reeled in. */
  'rg.bead': {
    school: 'poison',
    layers: [
      L({ sprite: SPRITE.drop, count: 3, ramp: VENOM, speed: [0.2, 0.8], radius: 0.05, size: [0.03, 0.05], grow: 0.8, life: [0.35, 0.6], heat: [1, 0.4], emit: 1, occl: 0.3, gravity: -7, drag: 1, stretch: 0.4, ground: true, bounce: 0, tint: false }),
    ],
  },
  /** Venom flung flat along a Death Lotus cut. */
  'rg.petal': {
    school: 'poison',
    layers: [
      L({ sprite: SPRITE.drop, count: 6, ramp: VENOM, speed: [2, 4.5], spread: 0.35, up: 0.15, radius: 0.2, size: [0.04, 0.07], grow: 0.8, life: [0.4, 0.7], heat: [0.9, 0.4], emit: 0.9, occl: 0.4, gravity: -9, drag: 1, stretch: 0.6, ground: true, bounce: 0, tint: false }),
      L({ sprite: SPRITE.gas, count: 2, ramp: VENOM, speed: [0.4, 1], spread: 0.6, radius: 0.3, size: [0.3, 0.45], grow: 1.8, life: [0.5, 0.8], heat: [0.5, 0], emit: 0.25, occl: 0.3, gravity: 0.15, drag: 2, turb: 0.25, tint: false, rich: true }),
    ],
  },
  /** Nightfall's curtain: dark smoke falling from high up, a few pale motes caught in it. */
  'rg.curtain': {
    school: 'arcane',
    layers: [
      L({ sprite: SPRITE.smoke, count: 18, ramp: SHADE, speed: [0.2, 0.7], spread: 0.25, radius: 0.6, size: [0.9, 1.4], grow: 1.8, life: [1.3, 1.9], heat: [0.1, 0], emit: 0.04, occl: 0.85, gravity: -3.2, drag: 1.2, turb: 0.3, spin: 0.4, fade: 1.2, stagger: 0.4, ground: true, bounce: 0, tint: false }),
      L({ sprite: SPRITE.mote, count: 10, ramp: DUSK, speed: [0.4, 1.2], spread: 0.3, radius: 0.8, size: [0.035, 0.06], grow: 0.6, life: [1.0, 1.6], heat: [1, 0.3], emit: 0.9, occl: 0, gravity: -2.5, drag: 0.8, turb: 0.4, fade: 1.2, stagger: 0.4, tint: false }),
      L({ sprite: SPRITE.smoke, count: 6, ramp: SHADE, speed: [0.1, 0.4], spread: 0.3, radius: 0.9, size: [1.2, 1.8], grow: 1.5, life: [1.6, 2.2], heat: [0.05, 0], emit: 0.03, occl: 0.8, gravity: -2.4, drag: 1.4, turb: 0.35, spin: 0.3, fade: 1.1, stagger: 0.5, ground: true, bounce: 0, tint: false, rich: true }),
    ],
  },
  /** Where the curtain lands: shadow lying flat and spreading over the floor. */
  'rg.dusk': {
    school: 'arcane',
    layers: [
      L({ sprite: SPRITE.smoke, count: 10, ramp: SHADE, speed: [0.3, 0.9], disc: true, radius: 1.2, size: [1.4, 2.2], grow: 1.6, life: [2.4, 3.4], heat: [0.05, 0], emit: 0.02, occl: 0.75, gravity: -2, drag: 1.5, turb: 0.15, spin: 0.25, flat: true, fade: 1, ground: true, bounce: 0, tint: false }),
    ],
  },
  /** What a phantom blade leaves in the air: pale motes and a glint of ghost steel. */
  'rg.phantomwake': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.mote, count: 8, ramp: GHOST, speed: [0.1, 0.4], radius: 0.06, size: [0.04, 0.07], grow: 0.5, life: [0.25, 0.45], heat: [1, 0.5], emit: 1.3, occl: 0, drag: 2, turb: 0.2, fade: 1.6, tint: false }),
      L({ sprite: SPRITE.glint, variants: 4, count: 4, ramp: GHOST, speed: [0.5, 1.5], radius: 0.04, size: [0.03, 0.05], grow: 0.3, life: [0.1, 0.2], heat: [1, 0.7], emit: 1.6, occl: 0, drag: 4, stretch: 1.5, fade: 2, tint: false }),
    ],
  },
};

registerEmitters(EM);

/** Every Rogue emitter id, for the checkers. */
export const ROGUE_EMITTERS: readonly string[] = Object.keys(EM);

/** Cosmetic only: where along the blade a bead falls. */
const rng = new Random(0x0a5e1d);
const _v = new THREE.Vector3();
const _box = new THREE.Box3();
const _inv = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const DOWN = new THREE.Vector3(0, -1, 0);
/** Burst options for the bursts made every few frames, kept so none allocates. */
const DRIP_OPTS: BurstOpts = { count: 8, dir: DOWN };
const BEAD_OPTS: BurstOpts = { count: 8 };

// ---------------------------------------------------------------------------
// Coat Blades
// ---------------------------------------------------------------------------

/** The hero as the drip sees it. */
export interface DripHero {
  readonly root: THREE.Object3D;
  readonly alive: boolean;
  readonly status: { has(id: string): boolean };
}

/** One held blade: its node and how long it is along the grip. */
interface Held {
  slot: string;
  node: THREE.Object3D | null;
  len: number;
  seekAt: number;
}

const coat = {
  root: null as THREE.Object3D | null,
  held: [
    { slot: 'hold:mainHand', node: null, len: 0, seekAt: 0 },
    { slot: 'hold:offHand', node: null, len: 0, seekAt: 0 },
  ] as Held[],
  clock: 0,
  acc: 0,
  side: 0,
};

/** Seconds between beads, the two blades taking turns. */
const DRIP_EVERY = 0.16;

/** Finds a held blade again when the hand is re-dressed, and measures it once. */
function heldBlade(h: Held, root: THREE.Object3D): THREE.Object3D | null {
  if (h.node && h.node.parent) return h.node;
  h.node = null;
  // An empty hand is looked for twice a second, not walked every frame.
  if (coat.clock < h.seekAt) return null;
  const node = root.getObjectByName(h.slot) ?? null;
  if (!node) {
    h.seekAt = coat.clock + 0.5;
    return null;
  }
  let maxY = 0;
  node.updateWorldMatrix(true, true);
  _inv.copy(node.matrixWorld).invert();
  node.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    _box.copy(mesh.geometry.boundingBox!).applyMatrix4(_m.multiplyMatrices(_inv, mesh.matrixWorld));
    maxY = Math.max(maxY, _box.max.y);
  });
  // Nothing held long enough to drip from (an empty hand, a fist).
  if (maxY < 0.2) {
    h.seekAt = coat.clock + 0.5;
    return null;
  }
  h.node = node;
  h.len = Math.min(2.2, maxY);
  return node;
}

/** Venom on the coated blades: a bead from one edge, then the other. */
function coatTick(effects: EffectSystem, hero: DripHero | null, dt: number): void {
  coat.clock += dt;
  if (!hero || !hero.alive || !hero.root.visible || !hero.status.has('skill.coatBlades')) {
    coat.acc = 0;
    return;
  }
  if (coat.root !== hero.root) {
    coat.root = hero.root;
    for (const h of coat.held) {
      h.node = null;
      h.seekAt = 0;
    }
  }
  coat.acc += dt;
  if (coat.acc < DRIP_EVERY) return;
  coat.acc = Math.min(coat.acc - DRIP_EVERY, DRIP_EVERY);
  // The blades take turns; with one blade it drips from that one.
  for (let k = 0; k < 2; k++) {
    coat.side = (coat.side + 1) % 2;
    const h = coat.held[coat.side]!;
    const node = heldBlade(h, hero.root);
    if (!node || !node.visible) continue;
    // Near the point, where venom runs off a blade.
    _v.set(0, h.len * rng.range(0.6, 0.98), 0).applyMatrix4(node.matrixWorld);
    effects.fx.burst('rg.coatdrip', _v.x, _v.y, _v.z, DRIP_OPTS);
    return;
  }
}

// ---------------------------------------------------------------------------
// Envenom Burst
// ---------------------------------------------------------------------------

/** A thread torn out of a body and reeled into the burst. */
interface Thread {
  live: boolean;
  t: number;
  dur: number;
  /** The burst: beads on the cord flow toward this end. */
  readonly to: THREE.Vector3;
  readonly from: THREE.Vector3;
  /** The torn end, reeled from `from` to `to`. */
  readonly head: THREE.Vector3;
  handle: EffectHandle | null;
  acc: number;
  readonly getTo: () => THREE.Vector3;
  readonly getHead: () => THREE.Vector3;
}

function makeThread(): Thread {
  const to = new THREE.Vector3();
  const head = new THREE.Vector3();
  return {
    live: false, t: 0, dur: 0, to, from: new THREE.Vector3(), head, handle: null, acc: 0,
    getTo: () => to,
    getHead: () => head,
  };
}

/** At most this many threads at once; past it, the rest tear without a cord. */
const THREADS: Thread[] = Array.from({ length: 8 }, makeThread);

/**
 * A green thread torn out of a body at (fx, fy, fz) and reeled into the burst
 * at (tx, ty, tz) over `reel` seconds; `stacks` thickens the cord.
 */
export function envenomThread(effects: EffectSystem, fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, reel: number, stacks: number): void {
  effects.fx.burst('rg.tear', fx, fy, fz, { count: 12, school: 'poison' });
  const th = THREADS.find((x) => !x.live);
  if (!th) return;
  th.live = true;
  th.t = 0;
  th.dur = Math.max(0.05, reel);
  th.acc = 0;
  th.from.set(fx, fy, fz);
  th.head.copy(th.from);
  th.to.set(tx, ty, tz);
  th.handle = effects.tether(th.getTo, th.getHead, { element: 'poison', color: VENOM[1], width: 0.05 + 0.012 * Math.min(10, stacks) });
}

function threadTick(effects: EffectSystem, dt: number): void {
  for (const th of THREADS) {
    if (!th.live) continue;
    th.t += dt;
    const u = Math.min(1, th.t / th.dur);
    // Torn loose slowly, then snapped in.
    th.head.lerpVectors(th.from, th.to, u * u);
    th.acc += dt;
    if (th.acc >= 0.05) {
      th.acc = 0;
      effects.fx.burst('rg.bead', th.head.x, th.head.y, th.head.z, BEAD_OPTS);
    }
    if (u >= 1) {
      th.handle?.stop();
      th.handle = null;
      th.live = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Death Lotus
// ---------------------------------------------------------------------------

/** Half the width of a petal, in radians. */
const PETAL_HALF = 0.2;

/** One Death Lotus cut: a petal of venom light on the floor along `yaw`, out to `radius`. */
export function lotusPetal(effects: EffectSystem, x: number, z: number, yaw: number, radius: number): void {
  const dx = Math.sin(yaw);
  const dz = Math.cos(yaw);
  effects.decals.glow('wedge', x, z, radius, 1.1, PETAL, 1.4, yaw, PETAL_HALF);
  // Venom flung off the blade along the cut, sideways as it sweeps.
  _v.set(dz, 0, -dx);
  effects.fx.burst('rg.petal', x + dx * radius * 0.55, 0.35, z + dz * radius * 0.55, { count: 12, dir: _v, school: 'poison' });
}

// ---------------------------------------------------------------------------
// Nightfall
// ---------------------------------------------------------------------------

/** How high the curtain starts. */
const CURTAIN_Y = 5.2;

/** A curtain of shadow falling round the field at (x, z) and over it, settling on the floor. */
export function nightfallCurtain(effects: EffectSystem, x: number, z: number, radius: number): void {
  const fx = effects.fx;
  const r = Math.max(1, radius);
  // Round the edge, thick enough to read as a wall coming down.
  const edge = Math.max(12, Math.min(24, r * 2.2));
  fx.burst('rg.curtain', x, CURTAIN_Y, z, { count: edge, dir: DOWN, ring: r * 0.92 });
  fx.burst('rg.curtain', x, CURTAIN_Y, z, { count: edge * 0.6, dir: DOWN, ring: r * 0.6 });
  fx.burst('rg.curtain', x, CURTAIN_Y, z, { count: 10, dir: DOWN, scatter: r * 0.35 });
  // It lands and lies: the floor goes dark from the edge in.
  effects.delay(1.1, () => {
    fx.burst('rg.dusk', x, 0.15, z, { count: 12, ring: r * 0.8 });
    fx.burst('rg.dusk', x, 0.15, z, { count: 8, ring: r * 0.45 });
  });
}

// ---------------------------------------------------------------------------
// Every frame
// ---------------------------------------------------------------------------

/** The coated blades' drip and the reeling threads. `hero` is whoever cast last. */
export function tickRogueFX(effects: EffectSystem, hero: DripHero | null, dt: number): void {
  coatTick(effects, hero, dt);
  threadTick(effects, dt);
}

/** Ends everything running (a new floor). */
export function clearRogueFX(): void {
  for (const th of THREADS) {
    th.live = false;
    th.handle = null;
  }
  coat.root = null;
  coat.acc = 0;
  for (const h of coat.held) {
    h.node = null;
    h.seekAt = 0;
  }
}
