/**
 * SLAY vfx kit: the emitter library. The art direction for every named burst
 * lives here.
 *
 * An emitter is a stack of layers. A fire hit is a white-hot flash, rolling
 * fireball puffs, flame licks, rising embers and black soot that outlives the
 * rest. Layering is what turns "orange dots" into "something exploded".
 *
 * Rules every layer follows:
 * - Light layers (sparks, flashes, embers) occlude nothing (`occl` 0).
 * - Body layers (flame, gas, ice) occlude a little, so they hold their colour.
 * - Matter (smoke, blood, bone, stone) occludes a lot and barely glows.
 * - Debris lands on the floor (`ground`).
 */

import * as THREE from 'three';
import type { Rng } from '../../types';
import { SPRITE } from './Atlas';
import { P, type ParticleField } from './Particles';
import { RAMPS, ramp, packLinear, mixHex, darken, type School } from './Palette';
import { floorAt } from './Floor';

/** Where a layer's three colours come from. */
export type RampSource = 'school' | 'smoke' | 'light' | readonly [number, number, number];

export interface Layer {
  sprite: number;
  /** Pick one of this many consecutive cells per particle (arc, rune). */
  variants: number;
  count: number;
  speed: readonly [number, number];
  /** 0 = straight along the direction, 1 = any direction. */
  spread: number;
  /** Added to the direction's Y before normalising: lift. */
  up: number;
  /** Spawn radius around the point. */
  radius: number;
  /** Spawn in a flat disc (true) instead of a ball. */
  disc: boolean;
  life: readonly [number, number];
  size: readonly [number, number];
  /** End size as a multiple of the start. */
  grow: number;
  ramp: RampSource;
  /** Emission. For school ramps it is multiplied by the school's glow. */
  emit: number;
  /** How much of the background it hides (0 light .. 1 solid). */
  occl: number;
  heat: readonly [number, number];
  gravity: number;
  drag: number;
  turb: number;
  /** Random spin range (rad/s). */
  spin: number;
  /** Stretch along velocity; 0 none. */
  stretch: number;
  /** Lies flat on the ground. */
  flat: boolean;
  /** Fade-out power: higher dies faster at the end. */
  fade: number;
  /** Spread spawn times over this many seconds. */
  stagger: number;
  /** Lands on the floor. */
  ground: boolean;
  /** Starts on a shell and flies inward: gathering power. */
  converge: boolean;
  /** `opts.color` retints this layer. */
  tint: boolean;
}

const DEFAULTS: Layer = {
  sprite: SPRITE.glow, variants: 1, count: 10, speed: [1, 3], spread: 1, up: 0, radius: 0.05, disc: false,
  life: [0.3, 0.6], size: [0.15, 0.25], grow: 0.5, ramp: 'school', emit: 1, occl: 0.15, heat: [1, 0.3],
  gravity: 0, drag: 2, turb: 0, spin: 0, stretch: 0, flat: false, fade: 1.5, stagger: 0, ground: false,
  converge: false, tint: true,
};

function L(o: Partial<Layer>): Layer {
  return { ...DEFAULTS, ...o };
}

export interface Emitter {
  /** The school whose ramp `ramp: 'school'` layers use. */
  school: School;
  layers: Layer[];
  /**
   * Element-keyed emitters (hit.fire, cast.cold...) keep their curated ramp
   * whatever colour a caller passes: an element always reads the same.
   */
  keyed?: boolean;
}

// ---------------------------------------------------------------------------
// Fixed ramps
// ---------------------------------------------------------------------------

const R_BLOOD = [0xb01414, 0x6e0808, 0x260202] as const;
const R_FLESH = [0x9a3a2a, 0x5e1a12, 0x1e0604] as const;
const R_DUST = [0x9a8a74, 0x5e5446, 0x2a251e] as const;
const R_STONE = [0x8a8278, 0x4e4840, 0x1e1c1a] as const;
const R_GOLD = [0xfff2c0, 0xffc23a, 0x8a4800] as const;
const R_HEAL = [0xeaffd8, 0x5ae06a, 0x0e5a1e] as const;
const R_MANA = [0xd8ecff, 0x3a7cff, 0x0a1e6a] as const;
const R_WHITE = [0xffffff, 0xe8eef8, 0x8a96aa] as const;
const R_STEAM = [0xf0f6ff, 0xa8b8c4, 0x505a62] as const;
const R_VOID = [0xe0a0ff, 0x5a18a8, 0x0a0218] as const;
const R_ASH = [0xb0a8a0, 0x5a544e, 0x1a1816] as const;
const R_SPORE = [0xf0ffa0, 0xa8c838, 0x3a4a10] as const;
const R_SNOW = [0xffffff, 0xd8e8f8, 0x8aa0b8] as const;
const R_ICHOR = [0xc8d860, 0x6a7a18, 0x1e2606] as const;

// ---------------------------------------------------------------------------
// Per-school layers
// ---------------------------------------------------------------------------

function flash(size: number, life = 0.12, emit = 0.9): Layer {
  return L({ sprite: SPRITE.glow, count: 1, speed: [0, 0], radius: 0, size: [size, size * 1.1], grow: 1.5, life: [life, life * 1.2], heat: [1, 0.55], emit, occl: 0, fade: 2.2 });
}

const HIT: Record<School, Layer[]> = {
  physical: [
    L({ sprite: SPRITE.spark, count: 16, speed: [4, 10], spread: 0.6, size: [0.05, 0.1], grow: 0.4, life: [0.14, 0.32], heat: [1, 0.45], emit: 1.1, occl: 0, gravity: -14, drag: 4, stretch: 1.5, fade: 1.2 }),
    flash(0.65, 0.08, 0.7),
    L({ sprite: SPRITE.slash, count: 1, speed: [0, 0], radius: 0, size: [0.9, 1.0], grow: 1.25, life: [0.09, 0.12], heat: [1, 0.3], emit: 0.8, occl: 0, spin: 0.5, fade: 2 }),
    L({ sprite: SPRITE.smoke, count: 3, ramp: R_DUST, speed: [0.5, 1.6], spread: 0.9, size: [0.2, 0.32], grow: 2.0, life: [0.4, 0.8], heat: [0.2, 0], emit: 0.25, occl: 0.45, gravity: 0.2, drag: 3, turb: 0.2, tint: false }),
  ],
  fire: [
    flash(1.0, 0.12),
    L({ sprite: SPRITE.fireball, count: 3, speed: [0.4, 1.4], spread: 1, up: 0.6, radius: 0.15, size: [0.55, 0.85], grow: 1.8, life: [0.45, 0.7], heat: [1, 0.1], emit: 0.9, occl: 0.35, gravity: 1.5, drag: 2.5, turb: 0.3, spin: 1 }),
    L({ sprite: SPRITE.flame, count: 6, speed: [1.5, 3.5], spread: 0.8, up: 0.6, size: [0.28, 0.48], grow: 1.2, life: [0.3, 0.5], heat: [1, 0.2], emit: 0.9, occl: 0.25, gravity: 3, drag: 3, turb: 0.4 }),
    L({ sprite: SPRITE.ember, count: 14, speed: [3, 7], spread: 0.9, up: 0.5, size: [0.035, 0.07], grow: 0.4, life: [0.6, 1.3], heat: [1, 0.5], emit: 1.2, occl: 0, gravity: 1.2, drag: 1.4, turb: 0.6, stretch: 0.4, fade: 1.1 }),
    L({ sprite: SPRITE.smoke, count: 3, ramp: 'smoke', speed: [0.4, 1.0], up: 1, radius: 0.2, size: [0.5, 0.8], grow: 2.2, life: [0.9, 1.5], heat: [0.35, 0], emit: 0.5, occl: 0.55, gravity: 0.9, drag: 1.5, turb: 0.25, stagger: 0.08, tint: false }),
  ],
  cold: [
    flash(0.9, 0.12),
    L({ sprite: SPRITE.shard, count: 10, speed: [3, 7], spread: 0.8, up: 0.3, size: [0.1, 0.2], grow: 0.8, life: [0.45, 0.85], heat: [0.9, 0.55], emit: 0.8, occl: 0.4, gravity: -12, drag: 1.5, stretch: 0.6, ground: true }),
    L({ sprite: SPRITE.crystal, count: 4, speed: [0.5, 2], size: [0.22, 0.36], grow: 1.3, life: [0.3, 0.55], heat: [1, 0.35], emit: 0.9, occl: 0.05, spin: 3 }),
    L({ sprite: SPRITE.smoke, count: 4, ramp: 'school', speed: [0.6, 1.6], radius: 0.2, size: [0.45, 0.75], grow: 2.0, life: [0.8, 1.3], heat: [0.35, 0.05], emit: 0.45, occl: 0.32, gravity: -0.4, drag: 2, turb: 0.2 }),
    L({ sprite: SPRITE.ember, count: 10, ramp: R_SNOW, speed: [0.5, 2.2], size: [0.03, 0.05], grow: 0.6, life: [0.8, 1.4], heat: [1, 0.6], emit: 1.0, occl: 0, gravity: -1.2, drag: 1.5, turb: 0.5, tint: false }),
  ],
  lightning: [
    flash(1.2, 0.08, 1.0),
    L({ sprite: SPRITE.arc, variants: 8, count: 4, speed: [0, 0], radius: 0.2, size: [0.7, 1.1], grow: 1.1, life: [0.06, 0.14], heat: [1, 0.8], emit: 1.0, occl: 0, spin: 0, fade: 1 }),
    L({ sprite: SPRITE.spark, count: 14, speed: [5, 11], size: [0.035, 0.06], grow: 0.4, life: [0.12, 0.3], heat: [1, 0.6], emit: 1.1, occl: 0, gravity: -10, drag: 4, stretch: 1.4, fade: 1.2 }),
    L({ sprite: SPRITE.glow, count: 1, speed: [0, 0], radius: 0, size: [0.45, 0.6], grow: 1.2, life: [0.3, 0.45], heat: [0.5, 0.1], emit: 0.6, occl: 0 }),
    L({ sprite: SPRITE.smoke, count: 1, ramp: 'smoke', speed: [0.2, 0.6], up: 1, size: [0.4, 0.6], grow: 2, life: [0.7, 1.0], heat: [0.2, 0], emit: 0.3, occl: 0.35, gravity: 0.6, tint: false }),
  ],
  poison: [
    flash(0.7, 0.1, 0.6),
    L({ sprite: SPRITE.drop, count: 12, speed: [2, 5], spread: 0.7, up: 0.6, size: [0.06, 0.12], grow: 0.8, life: [0.5, 0.9], heat: [0.8, 0.45], emit: 0.8, occl: 0.5, gravity: -11, drag: 1, stretch: 0.3, ground: true }),
    L({ sprite: SPRITE.gas, count: 3, speed: [0.3, 1.0], radius: 0.2, size: [0.6, 0.95], grow: 1.8, life: [1.0, 1.6], heat: [0.6, 0.1], emit: 0.65, occl: 0.42, gravity: 0.2, drag: 2, turb: 0.3, spin: 0.6 }),
    L({ sprite: SPRITE.bubble, count: 6, speed: [0.3, 1.2], up: 1, radius: 0.25, size: [0.06, 0.14], grow: 1.2, life: [0.6, 1.1], heat: [0.8, 0.5], emit: 0.8, occl: 0.1, gravity: 0.8, drag: 1.5, turb: 0.4 }),
  ],
  arcane: [
    flash(0.9, 0.1),
    L({ sprite: SPRITE.flare, count: 1, speed: [0, 0], radius: 0, size: [0.9, 1.1], grow: 1.4, life: [0.12, 0.16], heat: [1, 0.5], emit: 0.9, occl: 0, fade: 2 }),
    L({ sprite: SPRITE.mote, count: 12, speed: [1.5, 4], size: [0.08, 0.16], grow: 0.5, life: [0.5, 0.9], heat: [1, 0.4], emit: 1.0, occl: 0, drag: 3, turb: 0.9 }),
    L({ sprite: SPRITE.rune, variants: 4, count: 2, speed: [0.2, 0.6], up: 0.6, size: [0.32, 0.46], grow: 1.3, life: [0.4, 0.6], heat: [1, 0.3], emit: 0.9, occl: 0, spin: 2 }),
    L({ sprite: SPRITE.ring, count: 1, speed: [0, 0], radius: 0, size: [0.4, 0.4], grow: 4, life: [0.28, 0.32], heat: [1, 0.2], emit: 0.8, occl: 0, flat: true, fade: 1.2 }),
    L({ sprite: SPRITE.gas, count: 2, speed: [0.2, 0.7], radius: 0.2, size: [0.55, 0.8], grow: 1.6, life: [0.7, 1.1], heat: [0.4, 0], emit: 0.5, occl: 0.4, drag: 2, turb: 0.3 }),
  ],
  bone: [
    flash(0.6, 0.1, 0.6),
    L({ sprite: SPRITE.bone, count: 10, speed: [3, 7], spread: 0.8, up: 0.4, size: [0.08, 0.15], grow: 1, life: [0.8, 1.3], heat: [0.8, 0.6], emit: 0.55, occl: 0.9, gravity: -14, drag: 1, spin: 8, ground: true, fade: 3 }),
    L({ sprite: SPRITE.smoke, count: 3, ramp: R_DUST, speed: [0.5, 1.5], radius: 0.15, size: [0.3, 0.5], grow: 2.0, life: [0.6, 1.0], heat: [0.2, 0], emit: 0.25, occl: 0.5, gravity: 0.3, drag: 3, turb: 0.2, tint: false }),
    L({ sprite: SPRITE.skull, count: 1, speed: [0.6, 1.0], spread: 0.2, up: 1, size: [0.45, 0.55], grow: 1.3, life: [0.5, 0.75], heat: [1, 0.2], emit: 0.8, occl: 0.1, drag: 1.5 }),
  ],
};

const CAST: Record<School, Layer[]> = (() => {
  const gather = (count = 10): Layer =>
    L({ sprite: SPRITE.mote, count, speed: [1.6, 2.4], radius: 0.55, converge: true, size: [0.06, 0.11], grow: 0.4, life: [0.18, 0.26], heat: [0.6, 1], emit: 1.0, occl: 0 });
  return {
    physical: [gather(6), L({ sprite: SPRITE.smoke, count: 2, ramp: R_DUST, speed: [0.5, 1.2], disc: true, radius: 0.3, size: [0.25, 0.4], grow: 1.8, life: [0.4, 0.7], heat: [0.2, 0], emit: 0.2, occl: 0.4, tint: false })],
    fire: [gather(), flash(0.55, 0.14), L({ sprite: SPRITE.flame, count: 5, speed: [0.6, 1.6], up: 1, radius: 0.12, size: [0.2, 0.32], grow: 1, life: [0.25, 0.4], heat: [1, 0.2], emit: 0.9, occl: 0.2, gravity: 3, drag: 2 })],
    cold: [gather(), flash(0.5, 0.14), L({ sprite: SPRITE.crystal, count: 3, speed: [0.3, 0.8], size: [0.16, 0.24], grow: 1.3, life: [0.25, 0.4], heat: [1, 0.3], emit: 0.9, occl: 0.05, spin: 4 })],
    lightning: [gather(8), flash(0.6, 0.08, 1.0), L({ sprite: SPRITE.arc, variants: 8, count: 3, speed: [0, 0], radius: 0.15, size: [0.4, 0.6], grow: 1, life: [0.05, 0.1], heat: [1, 0.8], emit: 1.0, occl: 0, fade: 1 })],
    poison: [gather(), flash(0.45, 0.14, 0.6), L({ sprite: SPRITE.drop, count: 6, speed: [0.8, 2], up: 0.6, size: [0.05, 0.08], life: [0.4, 0.7], heat: [0.8, 0.4], emit: 0.8, occl: 0.4, gravity: -9, ground: true })],
    arcane: [gather(12), flash(0.55, 0.14), L({ sprite: SPRITE.rune, variants: 4, count: 1, speed: [0, 0], radius: 0, size: [0.5, 0.5], grow: 1.5, life: [0.3, 0.35], heat: [1, 0.3], emit: 0.9, occl: 0, spin: 3 })],
    bone: [gather(8), flash(0.4, 0.14, 0.5), L({ sprite: SPRITE.bone, count: 4, speed: [0.6, 1.4], size: [0.06, 0.1], life: [0.4, 0.6], heat: [0.8, 0.6], emit: 0.5, occl: 0.85, gravity: -9, spin: 6, ground: true })],
  };
})();

/** Shed by projectiles in flight, at a fixed cadence (not per frame). */
const TRAIL: Record<School, Layer[]> = {
  physical: [L({ sprite: SPRITE.mote, count: 2, ramp: R_DUST, speed: [0.1, 0.4], size: [0.06, 0.1], grow: 1.6, life: [0.25, 0.4], heat: [0.3, 0], emit: 0.2, occl: 0.3, tint: false })],
  fire: [
    L({ sprite: SPRITE.flame, count: 2, speed: [0.2, 0.6], up: 0.8, radius: 0.08, size: [0.26, 0.38], grow: 0.6, life: [0.2, 0.32], heat: [1, 0.2], emit: 0.9, occl: 0.25, gravity: 2, drag: 2 }),
    L({ sprite: SPRITE.ember, count: 2, speed: [0.5, 1.6], up: 0.6, size: [0.03, 0.05], grow: 0.4, life: [0.5, 0.9], heat: [1, 0.5], emit: 1.2, occl: 0, gravity: 1.2, turb: 0.8 }),
    L({ sprite: SPRITE.smoke, count: 1, ramp: 'smoke', speed: [0.1, 0.4], up: 1, size: [0.3, 0.45], grow: 2.2, life: [0.7, 1.1], heat: [0.3, 0], emit: 0.4, occl: 0.5, gravity: 0.8, turb: 0.2, tint: false }),
  ],
  cold: [
    L({ sprite: SPRITE.smoke, count: 1, speed: [0.1, 0.4], size: [0.26, 0.4], grow: 2.0, life: [0.5, 0.8], heat: [0.4, 0.05], emit: 0.45, occl: 0.25, gravity: -0.4 }),
    L({ sprite: SPRITE.ember, count: 2, ramp: R_SNOW, speed: [0.2, 0.8], size: [0.025, 0.045], life: [0.5, 0.9], heat: [1, 0.6], emit: 1.0, occl: 0, gravity: -1.5, turb: 0.4, tint: false }),
  ],
  lightning: [
    L({ sprite: SPRITE.arc, variants: 8, count: 1, speed: [0, 0], radius: 0.1, size: [0.35, 0.5], grow: 1, life: [0.04, 0.08], heat: [1, 0.8], emit: 1.0, occl: 0, fade: 1 }),
    L({ sprite: SPRITE.spark, count: 2, speed: [1.5, 4], size: [0.025, 0.04], life: [0.1, 0.22], heat: [1, 0.6], emit: 1.1, occl: 0, gravity: -6, drag: 3, stretch: 1.2 }),
  ],
  poison: [
    L({ sprite: SPRITE.drip, count: 1, speed: [0.1, 0.4], size: [0.05, 0.08], life: [0.5, 0.8], heat: [0.8, 0.4], emit: 0.8, occl: 0.5, gravity: -9, stretch: 0.3, ground: true }),
    L({ sprite: SPRITE.gas, count: 1, speed: [0.1, 0.3], size: [0.3, 0.45], grow: 1.6, life: [0.6, 1.0], heat: [0.5, 0.05], emit: 0.55, occl: 0.35, turb: 0.3 }),
  ],
  arcane: [
    L({ sprite: SPRITE.mote, count: 2, speed: [0.3, 1.0], size: [0.06, 0.1], grow: 0.4, life: [0.3, 0.55], heat: [1, 0.3], emit: 1.0, occl: 0, drag: 2, turb: 0.9 }),
    L({ sprite: SPRITE.gas, count: 1, speed: [0.05, 0.2], size: [0.26, 0.38], grow: 1.6, life: [0.45, 0.7], heat: [0.4, 0], emit: 0.5, occl: 0.3 }),
  ],
  bone: [
    L({ sprite: SPRITE.mote, count: 1, ramp: R_DUST, speed: [0.1, 0.3], size: [0.1, 0.16], grow: 1.8, life: [0.35, 0.5], heat: [0.3, 0], emit: 0.2, occl: 0.35, tint: false }),
    L({ sprite: SPRITE.glow, count: 1, speed: [0, 0], size: [0.18, 0.24], grow: 0.4, life: [0.25, 0.35], heat: [0.9, 0.3], emit: 0.7, occl: 0 }),
  ],
};

// ---------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------

const E: Record<string, Emitter> = {};
for (const s of Object.keys(HIT) as School[]) {
  E[`hit.${s}`] = { school: s, layers: HIT[s], keyed: true };
  E[`cast.${s}`] = { school: s, layers: CAST[s], keyed: true };
  E[`trail.${s}`] = { school: s, layers: TRAIL[s], keyed: true };
}

// Status looks worn on bodies, fired a few times a second by BodyFX: each
// burst is a handful of large, long-lived sprites rather than a spray.
Object.assign(E, {
  'status.burn': {
    school: 'fire',
    keyed: true,
    layers: [
      L({ sprite: SPRITE.flame, count: 2, speed: [0.2, 0.6], up: 1, radius: 0.06, size: [0.34, 0.52], grow: 0.7, life: [0.35, 0.55], heat: [1, 0.15], emit: 1.0, occl: 0.2, gravity: 3, drag: 2, turb: 0.4 }),
      L({ sprite: SPRITE.ember, count: 2, speed: [0.4, 1.2], up: 1, size: [0.035, 0.06], grow: 0.4, life: [0.6, 1.0], heat: [1, 0.5], emit: 1.3, occl: 0, gravity: 1.5, turb: 0.8 }),
      L({ sprite: SPRITE.smoke, count: 1, ramp: 'smoke', speed: [0.2, 0.5], up: 1, size: [0.35, 0.5], grow: 2, life: [0.8, 1.2], heat: [0.3, 0], emit: 0.4, occl: 0.5, gravity: 0.9, turb: 0.2, tint: false }),
    ],
  },
  'status.chill': {
    school: 'cold',
    keyed: true,
    layers: [
      L({ sprite: SPRITE.smoke, count: 1, speed: [0.1, 0.3], size: [0.35, 0.55], grow: 1.8, life: [0.8, 1.2], heat: [0.5, 0.1], emit: 0.6, occl: 0.2, gravity: -0.35, drag: 2 }),
      L({ sprite: SPRITE.ember, count: 2, ramp: R_SNOW, speed: [0.1, 0.4], size: [0.035, 0.06], life: [0.7, 1.1], heat: [1, 0.6], emit: 1.1, occl: 0, gravity: -0.8, turb: 0.4, tint: false }),
      L({ sprite: SPRITE.crystal, count: 1, speed: [0, 0.1], size: [0.12, 0.18], grow: 1.1, life: [0.35, 0.5], heat: [1, 0.4], emit: 0.9, occl: 0.05, spin: 2 }),
    ],
  },
  'status.shock': {
    school: 'lightning',
    keyed: true,
    layers: [
      L({ sprite: SPRITE.arc, variants: 8, count: 1, speed: [0, 0], radius: 0.05, size: [0.35, 0.5], grow: 1, life: [0.06, 0.1], heat: [1, 0.8], emit: 1.0, occl: 0, fade: 1 }),
      L({ sprite: SPRITE.spark, count: 2, speed: [1.5, 3.5], size: [0.03, 0.05], life: [0.12, 0.25], heat: [1, 0.6], emit: 1.1, occl: 0, gravity: -8, drag: 3, stretch: 1.2 }),
    ],
  },
  'status.poison': {
    school: 'poison',
    keyed: true,
    layers: [
      L({ sprite: SPRITE.drip, count: 2, speed: [0.05, 0.2], size: [0.07, 0.11], life: [0.6, 0.9], heat: [0.8, 0.4], emit: 0.85, occl: 0.5, gravity: -9, stretch: 0.3, ground: true }),
      L({ sprite: SPRITE.bubble, count: 1, speed: [0.1, 0.3], up: 1, size: [0.07, 0.12], grow: 1.2, life: [0.6, 1.0], heat: [0.9, 0.5], emit: 0.9, occl: 0.1, gravity: 0.6, turb: 0.3 }),
      L({ sprite: SPRITE.gas, count: 1, speed: [0.05, 0.2], size: [0.45, 0.65], grow: 1.6, life: [0.9, 1.3], heat: [0.5, 0.05], emit: 0.6, occl: 0.4, turb: 0.3, spin: 0.5 }),
    ],
  },
  'status.bleed': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.drop, count: 3, ramp: R_BLOOD, speed: [0.2, 0.8], spread: 0.4, size: [0.05, 0.09], grow: 0.9, life: [0.5, 0.8], heat: [0.6, 0.4], emit: 0.3, occl: 0.95, gravity: -14, drag: 1, stretch: 0.5, ground: true, fade: 3, tint: false }),
    ],
  },
  'status.curse': {
    school: 'arcane',
    layers: [
      L({ sprite: SPRITE.mote, count: 2, ramp: R_VOID, speed: [0.05, 0.25], size: [0.07, 0.12], grow: 0.6, life: [0.8, 1.2], heat: [1, 0.3], emit: 1.0, occl: 0, gravity: -0.5, drag: 1, turb: 0.4, tint: false }),
      L({ sprite: SPRITE.gas, count: 1, ramp: R_VOID, speed: [0.05, 0.2], size: [0.45, 0.6], grow: 1.5, life: [0.8, 1.2], heat: [0.35, 0], emit: 0.45, occl: 0.55, gravity: -0.2, turb: 0.25, tint: false }),
    ],
  },
});

// What flies off a struck body that does not bleed (fx/Materials.ts).
Object.assign(E, {
  'chips.bone': {
    school: 'bone',
    layers: [
      L({ sprite: SPRITE.bone, count: 7, speed: [2, 5], spread: 0.7, up: 0.4, size: [0.06, 0.12], grow: 1, life: [0.7, 1.1], heat: [0.8, 0.6], emit: 0.5, occl: 0.9, gravity: -14, drag: 1, spin: 9, ground: true, fade: 3 }),
      L({ sprite: SPRITE.smoke, count: 2, ramp: R_DUST, speed: [0.4, 1.2], radius: 0.1, size: [0.22, 0.34], grow: 1.8, life: [0.4, 0.7], heat: [0.2, 0], emit: 0.25, occl: 0.45, gravity: 0.2, drag: 3, tint: false }),
    ],
  },
  'chips.stone': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.rock, count: 7, ramp: R_STONE, speed: [2.5, 6], spread: 0.7, up: 0.4, size: [0.06, 0.12], grow: 1, life: [0.7, 1.1], heat: [0.5, 0.4], emit: 0.3, occl: 1, gravity: -15, drag: 0.8, spin: 8, ground: true, fade: 3, tint: false }),
      L({ sprite: SPRITE.spark, count: 6, speed: [4, 9], spread: 0.6, size: [0.035, 0.06], grow: 0.4, life: [0.1, 0.25], heat: [1, 0.45], emit: 1.1, occl: 0, gravity: -14, drag: 4, stretch: 1.4, fade: 1.2 }),
      L({ sprite: SPRITE.smoke, count: 2, ramp: R_STONE, speed: [0.4, 1.2], radius: 0.1, size: [0.25, 0.38], grow: 2, life: [0.5, 0.8], heat: [0.2, 0], emit: 0.2, occl: 0.5, gravity: 0.2, drag: 3, tint: false }),
    ],
  },
  ichor: {
    school: 'poison',
    layers: [
      L({ sprite: SPRITE.drop, count: 12, ramp: R_ICHOR, speed: [2, 5], spread: 0.6, up: 0.35, size: [0.05, 0.1], grow: 0.9, life: [0.5, 0.9], heat: [0.6, 0.4], emit: 0.35, occl: 0.9, gravity: -14, drag: 1, stretch: 0.5, ground: true, fade: 3, tint: false }),
      L({ sprite: SPRITE.splat, count: 2, ramp: R_ICHOR, speed: [0.4, 1.2], size: [0.18, 0.28], grow: 1.6, life: [0.18, 0.3], heat: [0.5, 0.3], emit: 0.3, occl: 0.7, drag: 4, tint: false }),
    ],
  },
});

Object.assign(E, {
  blood: {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.drop, count: 16, ramp: R_BLOOD, speed: [2, 6], spread: 0.6, up: 0.35, size: [0.06, 0.13], grow: 0.9, life: [0.5, 1.0], heat: [0.7, 0.4], emit: 0.45, occl: 0.95, gravity: -14, drag: 1, stretch: 0.5, ground: true, fade: 3, tint: false }),
      L({ sprite: SPRITE.splat, count: 3, ramp: R_BLOOD, speed: [0.4, 1.2], size: [0.26, 0.4], grow: 1.6, life: [0.2, 0.32], heat: [0.6, 0.3], emit: 0.4, occl: 0.7, drag: 4, tint: false }),
    ],
  },
  gib: {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.rock, count: 8, ramp: R_FLESH, speed: [3, 7], spread: 0.8, up: 0.5, size: [0.08, 0.16], grow: 1, life: [0.9, 1.4], heat: [0.6, 0.5], emit: 0.2, occl: 1, gravity: -15, drag: 0.8, spin: 9, ground: true, fade: 4, tint: false }),
      L({ sprite: SPRITE.drop, count: 10, ramp: R_BLOOD, speed: [2, 5], up: 0.5, size: [0.05, 0.09], life: [0.5, 0.9], heat: [0.6, 0.4], emit: 0.3, occl: 0.95, gravity: -14, ground: true, fade: 3, tint: false }),
    ],
  },
  embers: {
    school: 'fire',
    layers: [L({ sprite: SPRITE.ember, count: 10, speed: [0.5, 2], up: 1, radius: 0.3, size: [0.03, 0.06], grow: 0.4, life: [0.8, 1.6], heat: [1, 0.5], emit: 1.2, occl: 0, gravity: 1.2, drag: 1, turb: 0.7, stretch: 0.3 })],
  },
  dust: {
    school: 'physical',
    layers: [L({ sprite: SPRITE.smoke, count: 6, ramp: R_DUST, speed: [0.6, 1.8], up: 0.2, disc: true, radius: 0.35, size: [0.3, 0.5], grow: 2.2, life: [0.6, 1.1], heat: [0.15, 0], emit: 0.22, occl: 0.5, gravity: 0.2, drag: 3, turb: 0.2, tint: false })],
  },
  footstep: {
    school: 'physical',
    layers: [L({ sprite: SPRITE.smoke, count: 2, ramp: R_DUST, speed: [0.3, 0.8], up: 0.1, disc: true, radius: 0.12, size: [0.16, 0.24], grow: 1.8, life: [0.4, 0.6], heat: [0.1, 0], emit: 0.2, occl: 0.4, drag: 3, tint: false })],
  },
  smoke: {
    school: 'fire',
    layers: [L({ sprite: SPRITE.smoke, count: 6, ramp: 'smoke', speed: [0.3, 1], up: 1, radius: 0.25, size: [0.5, 0.9], grow: 2.4, life: [1.2, 2.0], heat: [0.25, 0], emit: 0.4, occl: 0.6, gravity: 0.6, drag: 1.5, turb: 0.3, tint: false })],
  },
  sparks: {
    school: 'physical',
    layers: [L({ sprite: SPRITE.spark, count: 16, speed: [4, 10], size: [0.035, 0.07], grow: 0.4, life: [0.15, 0.35], heat: [1, 0.45], emit: 1.2, occl: 0, gravity: -14, drag: 3.5, stretch: 1.5, fade: 1.2 })],
  },
  steam: {
    school: 'cold',
    layers: [L({ sprite: SPRITE.smoke, count: 5, ramp: R_STEAM, speed: [0.4, 1.2], up: 1, radius: 0.25, size: [0.4, 0.7], grow: 2.2, life: [0.8, 1.4], heat: [0.4, 0], emit: 0.45, occl: 0.3, gravity: 1, drag: 2, turb: 0.3, tint: false })],
  },
  heal: {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.mote, count: 18, ramp: R_HEAL, speed: [0.4, 1.2], up: 1.5, disc: true, radius: 0.55, size: [0.07, 0.13], grow: 0.4, life: [0.8, 1.4], heat: [1, 0.4], emit: 1.0, occl: 0, gravity: 1.6, drag: 1.5, turb: 0.4 }),
      L({ sprite: SPRITE.flare, count: 1, ramp: R_HEAL, speed: [0, 0], radius: 0, size: [0.7, 0.8], grow: 1.3, life: [0.2, 0.25], heat: [1, 0.4], emit: 0.7, occl: 0 }),
      L({ sprite: SPRITE.ring, count: 1, ramp: R_HEAL, speed: [0, 0], radius: 0, size: [0.5, 0.5], grow: 3.5, life: [0.45, 0.5], heat: [1, 0.2], emit: 0.7, occl: 0, flat: true }),
    ],
  },
  mana: {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.mote, count: 18, ramp: R_MANA, speed: [0.4, 1.2], up: 1.5, disc: true, radius: 0.55, size: [0.07, 0.13], grow: 0.4, life: [0.8, 1.4], heat: [1, 0.4], emit: 1.0, occl: 0, gravity: 1.6, drag: 1.5, turb: 0.4 }),
      L({ sprite: SPRITE.ring, count: 1, ramp: R_MANA, speed: [0, 0], radius: 0, size: [0.5, 0.5], grow: 3.5, life: [0.45, 0.5], heat: [1, 0.2], emit: 0.7, occl: 0, flat: true }),
    ],
  },
  levelup: {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.mote, count: 30, ramp: R_GOLD, speed: [0.6, 2.2], spread: 0.25, up: 3, disc: true, radius: 0.7, size: [0.06, 0.12], grow: 0.4, life: [1.0, 1.8], heat: [1, 0.5], emit: 1.2, occl: 0, gravity: 2.2, drag: 1, turb: 0.5 }),
      L({ sprite: SPRITE.spark, count: 14, ramp: R_GOLD, speed: [6, 11], spread: 0.15, up: 4, size: [0.04, 0.07], life: [0.3, 0.6], heat: [1, 0.5], emit: 1.3, occl: 0, gravity: -6, drag: 2, stretch: 1.6 }),
      L({ sprite: SPRITE.flare, count: 1, ramp: R_GOLD, speed: [0, 0], radius: 0, size: [1.6, 1.8], grow: 1.4, life: [0.3, 0.35], heat: [1, 0.4], emit: 0.9, occl: 0 }),
      L({ sprite: SPRITE.shock, count: 1, ramp: R_GOLD, speed: [0, 0], radius: 0, size: [0.8, 0.8], grow: 5, life: [0.6, 0.65], heat: [1, 0.2], emit: 0.8, occl: 0, flat: true, fade: 1.2 }),
    ],
  },
  crit: {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.flare, count: 1, ramp: R_WHITE, speed: [0, 0], radius: 0, size: [1.2, 1.4], grow: 1.3, life: [0.13, 0.16], heat: [1, 0.5], emit: 1.0, occl: 0, spin: 1 }),
      L({ sprite: SPRITE.spark, count: 10, ramp: R_GOLD, speed: [6, 12], size: [0.04, 0.07], life: [0.15, 0.3], heat: [1, 0.5], emit: 1.3, occl: 0, gravity: -10, drag: 4, stretch: 1.8 }),
    ],
  },
  block: {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.spark, count: 14, ramp: R_GOLD, speed: [4, 9], spread: 0.7, size: [0.035, 0.06], life: [0.15, 0.3], heat: [1, 0.5], emit: 1.2, occl: 0, gravity: -12, drag: 4, stretch: 1.6 }),
      L({ sprite: SPRITE.flare, count: 1, ramp: R_WHITE, speed: [0, 0], radius: 0, size: [0.8, 0.9], grow: 1.3, life: [0.1, 0.12], heat: [1, 0.5], emit: 0.8, occl: 0 }),
    ],
  },
  shieldHit: {
    school: 'cold',
    layers: [
      L({ sprite: SPRITE.hex, count: 6, speed: [0.6, 1.6], size: [0.25, 0.35], grow: 1.2, life: [0.25, 0.4], heat: [1, 0.3], emit: 0.9, occl: 0, spin: 1.5 }),
      L({ sprite: SPRITE.spark, count: 10, ramp: R_WHITE, speed: [3, 7], size: [0.03, 0.05], life: [0.12, 0.25], heat: [1, 0.5], emit: 1.1, occl: 0, gravity: -8, drag: 4, stretch: 1.4, tint: false }),
      flash(0.8, 0.1),
    ],
  },
  dodge: {
    school: 'cold',
    layers: [L({ sprite: SPRITE.mote, count: 12, ramp: R_STEAM, speed: [1, 3], radius: 0.3, size: [0.12, 0.2], grow: 1.6, life: [0.25, 0.45], heat: [0.8, 0.2], emit: 0.6, occl: 0.1, drag: 3, turb: 0.5, tint: false })],
  },
  frost: { school: 'cold', layers: [HIT.cold[2]!, HIT.cold[3]!, L({ sprite: SPRITE.smoke, count: 3, speed: [0.3, 0.9], radius: 0.25, size: [0.4, 0.6], grow: 1.8, life: [0.8, 1.2], heat: [0.35, 0.05], emit: 0.45, occl: 0.3, gravity: -0.3, drag: 2 })] },
  shock: { school: 'lightning', layers: [HIT.lightning[1]!, HIT.lightning[2]!] },
  poison: { school: 'poison', layers: [HIT.poison[2]!, HIT.poison[3]!, TRAIL.poison[0]!] },
  arcane: { school: 'arcane', layers: [HIT.arcane[3]!, HIT.arcane[4]!] },
  fire: { school: 'fire', layers: [HIT.fire[3]!, HIT.fire[4]!] },
  void: {
    school: 'arcane',
    layers: [
      L({ sprite: SPRITE.gas, count: 3, ramp: R_VOID, speed: [0.2, 0.8], radius: 0.3, size: [0.6, 0.9], grow: 1.5, life: [0.8, 1.3], heat: [0.6, 0.05], emit: 0.7, occl: 0.6, drag: 2, turb: 0.4, spin: 1.2 }),
      L({ sprite: SPRITE.mote, count: 10, ramp: R_VOID, speed: [1.2, 2.2], radius: 0.9, converge: true, size: [0.06, 0.1], life: [0.35, 0.5], heat: [0.6, 1], emit: 1.0, occl: 0 }),
    ],
  },
  bossSlam: {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.shock, count: 1, ramp: R_DUST, speed: [0, 0], radius: 0, size: [1.2, 1.2], grow: 5, life: [0.4, 0.45], heat: [0.8, 0.1], emit: 0.5, occl: 0.3, flat: true, fade: 1.2, tint: false }),
      L({ sprite: SPRITE.rock, count: 16, ramp: R_STONE, speed: [4, 9], spread: 0.5, up: 1.2, size: [0.1, 0.22], grow: 1, life: [0.9, 1.5], heat: [0.6, 0.5], emit: 0.2, occl: 1, gravity: -16, drag: 0.6, spin: 8, ground: true, fade: 4, tint: false }),
      L({ sprite: SPRITE.smoke, count: 10, ramp: R_DUST, speed: [2, 5], up: 0.15, disc: true, radius: 0.5, size: [0.6, 1.0], grow: 2.2, life: [0.9, 1.5], heat: [0.2, 0], emit: 0.22, occl: 0.6, gravity: 0.3, drag: 2.5, turb: 0.3, tint: false }),
      flash(1.6, 0.1, 0.5),
    ],
  },
  explosion: {
    school: 'fire',
    layers: [
      flash(2.2, 0.12),
      L({ sprite: SPRITE.fireball, count: 9, speed: [1, 3.5], up: 0.7, radius: 0.35, size: [1.0, 1.6], grow: 1.9, life: [0.5, 0.85], heat: [1, 0.05], emit: 0.85, occl: 0.45, gravity: 2.4, drag: 3, turb: 0.5, spin: 1 }),
      L({ sprite: SPRITE.ember, count: 26, speed: [5, 12], up: 0.4, size: [0.04, 0.08], life: [0.6, 1.4], heat: [1, 0.5], emit: 1.3, occl: 0, gravity: -5, drag: 1.5, stretch: 0.8, ground: true }),
      L({ sprite: SPRITE.smoke, count: 6, ramp: 'smoke', speed: [0.6, 1.8], up: 1, radius: 0.5, size: [0.9, 1.4], grow: 2.2, life: [1.4, 2.2], heat: [0.35, 0], emit: 0.45, occl: 0.6, gravity: 1.0, drag: 1.5, turb: 0.3, stagger: 0.12, tint: false }),
      L({ sprite: SPRITE.shock, count: 1, speed: [0, 0], radius: 0, size: [1.2, 1.2], grow: 4.5, life: [0.3, 0.32], heat: [1, 0.1], emit: 0.4, occl: 0, flat: true, fade: 1.2 }),
    ],
  },
  impact: {
    school: 'physical',
    layers: [HIT.physical[0]!, flash(0.9, 0.1, 0.6), L({ sprite: SPRITE.rock, count: 6, ramp: R_STONE, speed: [2, 5], up: 0.8, size: [0.06, 0.12], life: [0.7, 1.1], heat: [0.5, 0.4], emit: 0.2, occl: 1, gravity: -14, spin: 8, ground: true, fade: 4, tint: false })],
  },
  ash: {
    school: 'fire',
    layers: [
      L({ sprite: SPRITE.flake, count: 10, ramp: R_ASH, speed: [0.5, 1.6], up: 1, radius: 0.3, size: [0.06, 0.12], grow: 1, life: [1.0, 1.8], heat: [0.5, 0], emit: 0.4, occl: 0.6, gravity: -0.6, drag: 1.5, turb: 0.8, spin: 4, tint: false }),
      HIT.fire[3]!,
    ],
  },
  portal: {
    school: 'lightning',
    layers: [
      L({ sprite: SPRITE.mote, count: 16, speed: [1.5, 3], radius: 1.1, converge: true, size: [0.07, 0.12], life: [0.45, 0.7], heat: [0.5, 1], emit: 1.1, occl: 0 }),
      L({ sprite: SPRITE.flare, count: 1, speed: [0, 0], radius: 0, size: [1.1, 1.3], grow: 1.3, life: [0.25, 0.3], heat: [1, 0.4], emit: 0.8, occl: 0 }),
      L({ sprite: SPRITE.shock, count: 1, speed: [0, 0], radius: 0, size: [0.6, 0.6], grow: 4, life: [0.5, 0.55], heat: [1, 0.2], emit: 0.7, occl: 0, flat: true }),
      L({ sprite: SPRITE.gas, count: 2, speed: [0.2, 0.5], radius: 0.4, size: [0.7, 1.0], grow: 1.4, life: [0.8, 1.2], heat: [0.5, 0], emit: 0.55, occl: 0.35, spin: 2 }),
    ],
  },
  teleport: {
    school: 'arcane',
    layers: [
      L({ sprite: SPRITE.mote, count: 14, speed: [1.6, 2.6], radius: 0.9, converge: true, size: [0.06, 0.1], life: [0.25, 0.35], heat: [0.5, 1], emit: 1.1, occl: 0 }),
      L({ sprite: SPRITE.flare, count: 1, speed: [0, 0], radius: 0, size: [1.0, 1.1], grow: 1.3, life: [0.16, 0.2], heat: [1, 0.4], emit: 0.9, occl: 0 }),
      L({ sprite: SPRITE.ring, count: 1, speed: [0, 0], radius: 0, size: [0.4, 0.4], grow: 4, life: [0.3, 0.32], heat: [1, 0.2], emit: 0.8, occl: 0, flat: true }),
    ],
  },
  dissolve: {
    school: 'arcane',
    layers: [
      L({ sprite: SPRITE.flake, count: 14, speed: [0.4, 1.4], up: 1.2, radius: 0.35, size: [0.05, 0.1], grow: 0.8, life: [0.9, 1.6], heat: [1, 0.2], emit: 0.8, occl: 0.2, gravity: 1, drag: 1.5, turb: 0.7, spin: 4 }),
      L({ sprite: SPRITE.mote, count: 8, speed: [0.3, 1.0], up: 1, radius: 0.35, size: [0.06, 0.1], life: [0.6, 1.0], heat: [1, 0.3], emit: 1.0, occl: 0, gravity: 1.2, turb: 0.5 }),
    ],
  },
  summon: {
    school: 'bone',
    layers: [
      L({ sprite: SPRITE.rune, variants: 4, count: 1, speed: [0, 0], radius: 0, size: [1.6, 1.6], grow: 1.15, life: [0.8, 0.9], heat: [1, 0.3], emit: 0.8, occl: 0, flat: true, spin: 0.8 }),
      L({ sprite: SPRITE.mote, count: 14, speed: [0.5, 1.6], up: 2, disc: true, radius: 0.7, size: [0.06, 0.11], life: [0.6, 1.1], heat: [1, 0.3], emit: 1.0, occl: 0, gravity: 1.4, turb: 0.4 }),
      L({ sprite: SPRITE.skull, count: 2, speed: [0.8, 1.3], spread: 0.3, up: 2, radius: 0.4, size: [0.4, 0.5], grow: 1.3, life: [0.6, 0.9], heat: [1, 0.2], emit: 0.8, occl: 0.1, drag: 1 }),
    ],
  },
  itemDrop: {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.ember, count: 8, ramp: 'light', speed: [1, 3], up: 1.2, size: [0.035, 0.06], life: [0.4, 0.8], heat: [1, 0.5], emit: 1.1, occl: 0, gravity: -5, drag: 1.5, stretch: 0.6 }),
      L({ sprite: SPRITE.flare, count: 1, ramp: 'light', speed: [0, 0], radius: 0, size: [0.6, 0.7], grow: 1.3, life: [0.16, 0.2], heat: [1, 0.5], emit: 0.8, occl: 0 }),
    ],
  },
  pickup: {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.mote, count: 10, ramp: 'light', speed: [0.8, 2], up: 2, radius: 0.25, size: [0.05, 0.09], life: [0.35, 0.6], heat: [1, 0.4], emit: 1.1, occl: 0, gravity: 3, drag: 2 }),
      L({ sprite: SPRITE.ring, count: 1, ramp: 'light', speed: [0, 0], radius: 0, size: [0.3, 0.3], grow: 3, life: [0.25, 0.3], heat: [1, 0.3], emit: 0.8, occl: 0, flat: true }),
    ],
  },
  gold: {
    school: 'physical',
    layers: [L({ sprite: SPRITE.flare, count: 6, ramp: R_GOLD, speed: [0.6, 1.8], up: 1, radius: 0.15, size: [0.12, 0.2], grow: 0.3, life: [0.25, 0.45], heat: [1, 0.5], emit: 1.0, occl: 0, gravity: -4, spin: 3 })],
  },
} satisfies Record<string, Emitter>);

/** Every named emitter. */
export const EMITTERS: Readonly<Record<string, Emitter>> = E;

// ---------------------------------------------------------------------------
// Ambient
// ---------------------------------------------------------------------------

export interface Ambient {
  layer: Layer;
  /** Particles per second at full quality. */
  rate: number;
  /** Disc radius around the focus. */
  spread: number;
  yMin: number;
  yMax: number;
}

export const AMBIENT: Readonly<Record<string, Ambient>> = {
  dust: { rate: 7, spread: 14, yMin: 0.2, yMax: 3.5, layer: L({ sprite: SPRITE.mote, ramp: R_DUST, speed: [0.05, 0.25], size: [0.04, 0.08], grow: 1, life: [4, 7], heat: [0.5, 0.3], emit: 0.35, occl: 0.1, drag: 0.2, turb: 0.12, fade: 1, tint: false }) },
  motes: { rate: 6, spread: 14, yMin: 0.4, yMax: 3.5, layer: L({ sprite: SPRITE.mote, ramp: R_WHITE, speed: [0.05, 0.2], size: [0.03, 0.06], grow: 1, life: [4, 7], heat: [0.7, 0.3], emit: 0.5, occl: 0, drag: 0.2, turb: 0.15, fade: 1, tint: false }) },
  embers: { rate: 9, spread: 13, yMin: 0, yMax: 1.5, layer: L({ sprite: SPRITE.ember, ramp: [RAMPS.fire.core, RAMPS.fire.body, RAMPS.fire.tail], speed: [0.1, 0.4], up: 1, size: [0.025, 0.05], grow: 0.5, life: [3, 5], heat: [1, 0.4], emit: 1.2, occl: 0, gravity: 0.35, drag: 0.4, turb: 0.3, fade: 1, tint: false }) },
  snow: { rate: 22, spread: 14, yMin: 4, yMax: 7, layer: L({ sprite: SPRITE.ember, ramp: R_SNOW, speed: [0.05, 0.2], size: [0.035, 0.06], grow: 1, life: [5, 8], heat: [0.8, 0.6], emit: 0.55, occl: 0.25, gravity: -0.18, drag: 0.6, turb: 0.25, fade: 0.8, tint: false }) },
  spores: { rate: 7, spread: 13, yMin: 0.2, yMax: 2.8, layer: L({ sprite: SPRITE.mote, ramp: R_SPORE, speed: [0.05, 0.2], up: 0.4, size: [0.035, 0.07], grow: 1, life: [4, 7], heat: [0.9, 0.4], emit: 0.75, occl: 0, gravity: 0.05, drag: 0.3, turb: 0.25, fade: 1, tint: false }) },
  ash: { rate: 11, spread: 14, yMin: 2.5, yMax: 6, layer: L({ sprite: SPRITE.flake, ramp: R_ASH, speed: [0.05, 0.25], size: [0.04, 0.08], grow: 1, life: [5, 8], heat: [0.4, 0.1], emit: 0.35, occl: 0.5, gravity: -0.15, drag: 0.5, turb: 0.35, spin: 2, fade: 0.8, tint: false }) },
  void: { rate: 8, spread: 13, yMin: 0.2, yMax: 3, layer: L({ sprite: SPRITE.mote, ramp: R_VOID, speed: [0.05, 0.3], up: 0.5, size: [0.04, 0.08], grow: 0.6, life: [3, 6], heat: [1, 0.4], emit: 0.9, occl: 0, gravity: 0.1, drag: 0.3, turb: 0.3, fade: 1, tint: false }) },
  bubbles: { rate: 6, spread: 12, yMin: 0, yMax: 0.4, layer: L({ sprite: SPRITE.bubble, ramp: R_SPORE, speed: [0.1, 0.3], up: 3, size: [0.04, 0.09], grow: 1.2, life: [2, 4], heat: [0.8, 0.4], emit: 0.5, occl: 0.05, gravity: 0.25, drag: 0.5, turb: 0.15, fade: 1, tint: false }) },
};

// ---------------------------------------------------------------------------
// Emission
// ---------------------------------------------------------------------------

export interface EmitOpts {
  /** Count, where 12 means "as authored". */
  count?: number;
  color?: number;
  scale?: number;
  dir?: THREE.Vector3;
  speed?: number;
  life?: number;
  /** Spawn on a ring of this radius (one call draws a whole ring). */
  ring?: number;
  /** Random offset per particle, in metres. */
  scatter?: number;
  /** Override the emitter's school (recolours school layers). */
  school?: School;
}

/** Packed ramps, cached per colour so emission never allocates. */
const packedSchool = new Map<School, { core: number; body: number; tail: number; smoke: number; glow: number }>();
const packedTint = new Map<number, { core: number; body: number; tail: number }>();
const packedFixed = new WeakMap<readonly [number, number, number], { core: number; body: number; tail: number }>();

function schoolPacked(s: School): { core: number; body: number; tail: number; smoke: number; glow: number } {
  let p = packedSchool.get(s);
  if (!p) {
    const r = ramp(s);
    p = { core: packLinear(r.core), body: packLinear(r.body), tail: packLinear(r.tail), smoke: packLinear(r.smoke), glow: r.glow };
    packedSchool.set(s, p);
  }
  return p;
}

function tintPacked(hex: number): { core: number; body: number; tail: number } {
  let p = packedTint.get(hex);
  if (!p) {
    p = { core: packLinear(mixHex(hex, 0xffffff, 0.55)), body: packLinear(hex), tail: packLinear(darken(hex, 0.6)) };
    if (packedTint.size > 512) packedTint.clear();
    packedTint.set(hex, p);
  }
  return p;
}

function fixedPacked(r: readonly [number, number, number]): { core: number; body: number; tail: number } {
  let p = packedFixed.get(r);
  if (!p) {
    p = { core: packLinear(r[0]), body: packLinear(r[1]), tail: packLinear(r[2]) };
    packedFixed.set(r, p);
  }
  return p;
}

const _d = new THREE.Vector3();

/**
 * Writes one layer into the field. `mul` scales the count (quality, pressure,
 * the caller's count). Returns how many particles were written.
 */
export function emitLayer(field: ParticleField, rng: Rng, layer: Layer, school: School, x: number, y: number, z: number, o: EmitOpts | undefined, mul: number, keyed = false): number {
  // Single-sprite layers (flashes, rings) never thin out: one is the effect.
  const want = layer.count <= 2 ? layer.count * Math.max(1, Math.round(mul)) : layer.count * mul;
  let n = Math.floor(want);
  if (rng.next() < want - n) n++;
  if (n <= 0) return 0;

  const scale = o?.scale ?? 1;
  const spMul = (o?.speed ?? 1) * Math.sqrt(scale);
  const lifeMul = o?.life ?? 1;

  // Colours.
  let core: number;
  let body: number;
  let tail: number;
  let emit = layer.emit;
  const tinted = layer.tint && !keyed && o?.color !== undefined;
  if (tinted) {
    const t = tintPacked(o!.color!);
    core = t.core; body = t.body; tail = t.tail;
    emit *= schoolPacked(school).glow;
  } else if (layer.ramp === 'school') {
    const s = schoolPacked(school);
    core = s.core; body = s.body; tail = s.tail;
    emit *= s.glow;
  } else if (layer.ramp === 'smoke') {
    const s = schoolPacked(school);
    core = s.smoke; body = s.smoke; tail = s.smoke;
  } else if (layer.ramp === 'light') {
    const t = tintPacked(0xfff0d0);
    core = t.core; body = t.body; tail = t.tail;
    emit *= 1.6;
  } else {
    const f = fixedPacked(layer.ramp);
    core = f.core; body = f.body; tail = f.tail;
    if (layer.emit >= 0.7) emit *= 1.8;
  }

  const dir = o?.dir;
  let dx = 0;
  let dy = 1;
  let dz = 0;
  if (dir && dir.lengthSq() > 1e-6) {
    _d.copy(dir).normalize();
    dx = _d.x; dy = _d.y; dz = _d.z;
  }
  const spread = dir ? layer.spread : 1;
  const ringR = o?.ring ?? 0;
  const scatter = o?.scatter ?? 0;
  const floorY = layer.ground ? floorAt(x, z) : -999;

  P.fade = layer.fade;
  P.stretch = layer.flat ? -1 : layer.stretch;
  P.core = core; P.body = body; P.tail = tail; P.emit = emit;
  P.gravity = layer.gravity;
  P.drag = layer.drag;
  P.turb = layer.turb;
  P.heat0 = layer.heat[0];
  P.heat1 = layer.heat[1];
  P.occl = layer.occl;
  P.floor = floorY;

  for (let i = 0; i < n; i++) {
    // Random direction in the spread cone around (dx, dy, dz).
    const u = rng.range(-1, 1);
    const phi = rng.next() * Math.PI * 2;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    let rx = s * Math.cos(phi);
    let ry = u;
    let rz = s * Math.sin(phi);
    let vx = dx + (rx - dx) * spread;
    let vy = dy + (ry - dy) * spread + layer.up;
    let vz = dz + (rz - dz) * spread;
    const vl = Math.hypot(vx, vy, vz) || 1;
    vx /= vl; vy /= vl; vz /= vl;

    // Spawn point.
    let px = x;
    let py = y;
    let pz = z;
    if (ringR > 0) {
      const a = rng.next() * Math.PI * 2;
      px += Math.cos(a) * ringR;
      pz += Math.sin(a) * ringR;
    }
    if (scatter > 0) {
      px += rng.range(-scatter, scatter);
      py += rng.range(-scatter, scatter) * 0.5;
      pz += rng.range(-scatter, scatter);
    }
    const rad = layer.radius * scale;
    let sp = rng.range(layer.speed[0], layer.speed[1]) * spMul;
    if (layer.converge) {
      // Start on a shell and fly to the centre, arriving as the life ends.
      rx = vx; ry = vy; rz = vz;
      px += rx * rad; py += ry * rad; pz += rz * rad;
      vx = -rx; vy = -ry; vz = -rz;
    } else if (rad > 0) {
      const rr = rad * Math.cbrt(rng.next());
      if (layer.disc) {
        const a = rng.next() * Math.PI * 2;
        px += Math.cos(a) * rr;
        pz += Math.sin(a) * rr;
      } else {
        px += rx * rr; py += ry * rr; pz += rz * rr;
      }
    }
    const life = rng.range(layer.life[0], layer.life[1]) * lifeMul;
    if (layer.converge) sp = (rad / Math.max(0.05, life)) * 1.1;

    const size0 = rng.range(layer.size[0], layer.size[1]) * scale;
    P.x = px; P.y = py; P.z = pz;
    P.vx = vx * sp; P.vy = vy * sp; P.vz = vz * sp;
    P.delay = layer.stagger > 0 ? rng.next() * layer.stagger : 0;
    P.life = life;
    P.spin = layer.spin === 0 ? 0 : rng.range(-layer.spin, layer.spin);
    P.size0 = size0;
    P.size1 = size0 * layer.grow;
    P.sprite = layer.variants > 1 ? layer.sprite + Math.floor(rng.next() * layer.variants) : layer.sprite;
    P.seed = rng.next();
    field.spawn(P);
  }
  return n;
}

/** Every emitter id, for the checkers. */
export function emitterIds(): string[] {
  return Object.keys(EMITTERS).sort();
}

/** Every ambient kind, for the checkers. */
export function ambientIds(): string[] {
  return Object.keys(AMBIENT).sort();
}
