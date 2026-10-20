/**
 * SLAY — the Mage's own particles, one look per tree.
 *
 *  - Fire (Conflagration) is heavy and smoky: dark smoke that hangs, rolls
 *    and rises slowly, ragged cinders that fall, a dull red heart.
 *  - Lightning (Tempest) is sharp and bright: forked arcs and white streaks
 *    that live for a blink and are gone, no smoke at all.
 *  - Cold (Frost) is glassy and slow: shards that tumble and fall, frost
 *    crystals that drift and hang in the air, a thin cold mist.
 *
 * Registered into the kit's emitter library on import, so every runner
 * branch that draws with a skill's `emitter` and `trail` (bursts, novas,
 * cones, fields, projectile wakes) draws a Mage skill in its tree's look.
 * Every id starts `mg.` and no other class fires one. They are layers of the
 * shared particle field: one pipeline, already compiled at load, with counts
 * on the quality ladder and the pressure valve. Detail layers marked `rich`
 * draw on High and Ultra only.
 */
import { SPRITE } from '../kit/Atlas';
import { registerEmitters, type Emitter, type Layer } from '../kit/Emitters';
import { SKILL_BY_ID } from '../../data/skills';

const DEFAULTS: Layer = {
  sprite: SPRITE.glow, variants: 1, count: 10, speed: [1, 3], spread: 1, up: 0, radius: 0.05, disc: false,
  life: [0.3, 0.6], size: [0.15, 0.25], grow: 0.5, ramp: 'school', emit: 1, occl: 0.15, heat: [1, 0.3],
  gravity: 0, drag: 2, turb: 0, spin: 0, stretch: 0, flat: false, fade: 1.5, stagger: 0, ground: false, bounce: 0.32,
  converge: false, tint: true,
};
const L = (o: Partial<Layer>): Layer => ({ ...DEFAULTS, ...o });

/** Thick soot, lit from below at its root. */
const SOOT = [0x5a3a2a, 0x2a1c16, 0x0c0908] as const;
/** A banked fire's heart: dull red, not yellow. */
const COALS = [0xffb060, 0xd0401a, 0x4a0c04] as const;
/** White-violet lightning. */
const ARC = [0xffffff, 0xc8b0ff, 0x5a3ab0] as const;
/** Glass ice: nearly white at the edge, deep blue in the body. */
const GLASS = [0xf4fcff, 0x8ad0ff, 0x1a4a7a] as const;
/** A breath of cold air. */
const MIST = [0xdcefff, 0x8aaecc, 0x2a3a4a] as const;

const EM: Record<string, Emitter> = {
  // --- fire: heavy and smoky ------------------------------------------------
  /** A blast: a dark billow that rolls out and hangs, cinders thrown and falling, a red heart. */
  'mg.billow': {
    school: 'fire',
    layers: [
      L({ sprite: SPRITE.smoke, count: 8, ramp: SOOT, speed: [0.8, 2.2], up: 0.6, disc: true, radius: 0.5, size: [0.6, 1.0], grow: 2.8, life: [1.6, 2.6], heat: [0.35, 0], emit: 0.18, occl: 0.8, gravity: 0.35, drag: 2.2, turb: 0.35, spin: 0.6, fade: 1, tint: false }),
      L({ sprite: SPRITE.flame, count: 4, ramp: COALS, speed: [0.4, 1.2], up: 0.8, radius: 0.35, size: [0.4, 0.6], grow: 1.6, life: [0.35, 0.55], heat: [1, 0.3], emit: 1.1, occl: 0.1, gravity: 0.8, drag: 2.5, tint: false }),
      L({ sprite: SPRITE.cinder, variants: 4, count: 14, ramp: COALS, speed: [2, 5], up: 1.2, radius: 0.3, size: [0.03, 0.06], grow: 0.5, life: [0.9, 1.6], heat: [1, 0.4], emit: 1.2, occl: 0, gravity: -6, drag: 1.2, turb: 0.5, stretch: 0.4, ground: true, bounce: 0.2, tint: false }),
      L({ sprite: SPRITE.smoke, count: 4, ramp: SOOT, speed: [0.2, 0.6], up: 1.4, radius: 0.6, size: [0.8, 1.2], grow: 2.2, life: [2.4, 3.4], heat: [0.15, 0], emit: 0.1, occl: 0.7, gravity: 0.5, drag: 1.2, turb: 0.4, fade: 0.9, tint: false, rich: true }),
    ],
  },
  /** A heavier fall of cinders and ash over a low smoke. */
  'mg.cinderfall': {
    school: 'fire',
    layers: [
      L({ sprite: SPRITE.cinder, variants: 4, count: 20, ramp: COALS, speed: [1.5, 4], up: 1.6, radius: 0.4, size: [0.035, 0.07], grow: 0.4, life: [1.0, 1.8], heat: [1, 0.35], emit: 1.1, occl: 0, gravity: -7, drag: 1, turb: 0.6, stretch: 0.3, ground: true, bounce: 0.15, tint: false }),
      L({ sprite: SPRITE.smoke, count: 5, ramp: SOOT, speed: [0.4, 1.2], up: 0.4, disc: true, radius: 0.45, size: [0.5, 0.8], grow: 2.4, life: [1.4, 2.2], heat: [0.3, 0], emit: 0.16, occl: 0.75, gravity: 0.3, drag: 2, turb: 0.3, tint: false }),
    ],
  },
  /** What a fire spell leaves behind it in the air: soot that hangs a while. */
  'mg.sootwake': {
    school: 'fire',
    layers: [
      L({ sprite: SPRITE.smoke, count: 2, ramp: SOOT, speed: [0.1, 0.4], up: 0.6, radius: 0.12, size: [0.25, 0.4], grow: 2.6, life: [1.0, 1.6], heat: [0.4, 0], emit: 0.2, occl: 0.7, gravity: 0.4, drag: 1.6, turb: 0.35, spin: 0.8, tint: false }),
      L({ sprite: SPRITE.cinder, variants: 4, count: 2, ramp: COALS, speed: [0.3, 1], up: 0.4, radius: 0.1, size: [0.025, 0.05], grow: 0.5, life: [0.6, 1.0], heat: [1, 0.4], emit: 1.2, occl: 0, gravity: -3, drag: 1, turb: 0.5, tint: false }),
    ],
  },
  /** Embers shed in flight, falling, with a thread of smoke. */
  'mg.emberwake': {
    school: 'fire',
    layers: [
      L({ sprite: SPRITE.cinder, variants: 4, count: 3, ramp: COALS, speed: [0.3, 1.2], up: 0.2, radius: 0.1, size: [0.03, 0.055], grow: 0.4, life: [0.7, 1.2], heat: [1, 0.45], emit: 1.3, occl: 0, gravity: -4, drag: 1, turb: 0.6, stretch: 0.3, tint: false }),
      L({ sprite: SPRITE.smoke, count: 1, ramp: SOOT, speed: [0.1, 0.3], up: 0.8, radius: 0.08, size: [0.2, 0.3], grow: 2.4, life: [0.8, 1.3], heat: [0.3, 0], emit: 0.18, occl: 0.6, gravity: 0.5, drag: 1.5, turb: 0.3, tint: false }),
    ],
  },

  // --- lightning: sharp and bright --------------------------------------------
  /** A strike: forked arcs flung out and gone in a blink, white streaks, one hard flash. */
  'mg.arcburst': {
    school: 'lightning',
    layers: [
      L({ sprite: SPRITE.fork, variants: 8, count: 6, ramp: ARC, speed: [0, 0.5], radius: 0.5, size: [0.5, 0.9], grow: 1.1, life: [0.08, 0.16], heat: [1, 0.8], emit: 2.2, occl: 0, spin: 0, fade: 2.5, tint: false }),
      L({ sprite: SPRITE.glint, variants: 4, count: 18, ramp: ARC, speed: [6, 13], radius: 0.1, size: [0.03, 0.06], grow: 0.3, life: [0.1, 0.22], heat: [1, 0.6], emit: 1.8, occl: 0, gravity: -6, drag: 4, stretch: 2.2, fade: 2, tint: false }),
      L({ sprite: SPRITE.flare, count: 1, ramp: ARC, speed: [0, 0], radius: 0, size: [0.9, 1.1], grow: 1.4, life: [0.07, 0.1], heat: [1, 1], emit: 1.8, occl: 0, tint: false }),
    ],
  },
  /** A ring of sparks skittering over the floor. */
  'mg.skitter': {
    school: 'lightning',
    layers: [
      L({ sprite: SPRITE.glint, variants: 4, count: 22, ramp: ARC, speed: [4, 9], spread: 0.3, up: 0, disc: true, radius: 0.3, size: [0.03, 0.05], grow: 0.3, life: [0.15, 0.3], heat: [1, 0.5], emit: 1.6, occl: 0, gravity: -10, drag: 3, stretch: 1.8, ground: true, bounce: 0.5, tint: false }),
      L({ sprite: SPRITE.arc, variants: 8, count: 3, ramp: ARC, speed: [0, 0.3], radius: 0.6, size: [0.4, 0.6], grow: 1, life: [0.06, 0.12], heat: [1, 0.8], emit: 2, occl: 0, fade: 2.5, tint: false }),
    ],
  },
  /** Crackle shed in flight: tiny arcs that live a blink. */
  'mg.crackle': {
    school: 'lightning',
    layers: [
      L({ sprite: SPRITE.arc, variants: 8, count: 2, ramp: ARC, speed: [0, 0.4], radius: 0.18, size: [0.18, 0.3], grow: 1, life: [0.05, 0.1], heat: [1, 0.8], emit: 2, occl: 0, fade: 2.5, tint: false }),
      L({ sprite: SPRITE.glint, variants: 4, count: 2, ramp: ARC, speed: [2, 5], radius: 0.05, size: [0.02, 0.04], grow: 0.3, life: [0.08, 0.16], heat: [1, 0.6], emit: 1.6, occl: 0, drag: 4, stretch: 2, fade: 2, tint: false }),
    ],
  },
  /** White streaks thrown off sideways. */
  'mg.sparkwake': {
    school: 'lightning',
    layers: [
      L({ sprite: SPRITE.glint, variants: 4, count: 4, ramp: ARC, speed: [3, 7], radius: 0.06, size: [0.025, 0.045], grow: 0.3, life: [0.08, 0.18], heat: [1, 0.6], emit: 1.7, occl: 0, gravity: -8, drag: 4, stretch: 2, fade: 2, tint: false }),
    ],
  },

  // --- cold: glassy and slow -------------------------------------------------
  /** A break: shards of glass ice tumbling out and falling, crystals hanging, a cold breath. */
  'mg.shatter': {
    school: 'cold',
    layers: [
      L({ sprite: SPRITE.ice, variants: 4, count: 12, ramp: GLASS, speed: [2, 4.5], up: 0.8, radius: 0.25, size: [0.08, 0.16], grow: 0.9, life: [0.9, 1.4], heat: [0.9, 0.5], emit: 0.8, occl: 0.35, gravity: -7, drag: 1.2, spin: 7, ground: true, bounce: 0.3, fade: 1, tint: false }),
      L({ sprite: SPRITE.frost, variants: 4, count: 6, ramp: GLASS, speed: [0.3, 0.9], up: 0.4, radius: 0.5, size: [0.12, 0.2], grow: 1, life: [1.4, 2.2], heat: [0.9, 0.5], emit: 0.9, occl: 0.1, gravity: -0.3, drag: 1.5, turb: 0.2, spin: 1.2, fade: 0.9, tint: false }),
      L({ sprite: SPRITE.smoke, count: 3, ramp: MIST, speed: [0.3, 0.8], up: 0.2, disc: true, radius: 0.4, size: [0.5, 0.8], grow: 2.2, life: [1.4, 2.2], heat: [0.4, 0], emit: 0.35, occl: 0.25, gravity: -0.2, drag: 2, turb: 0.2, fade: 1, tint: false, rich: true }),
    ],
  },
  /** Frost crystals drifting down out of a cold mist. */
  'mg.rimefall': {
    school: 'cold',
    layers: [
      L({ sprite: SPRITE.frost, variants: 4, count: 10, ramp: GLASS, speed: [0.2, 0.7], up: 0.6, radius: 0.7, size: [0.08, 0.15], grow: 1, life: [1.8, 2.8], heat: [0.9, 0.5], emit: 0.85, occl: 0.1, gravity: -0.35, drag: 1.2, turb: 0.25, spin: 1, fade: 0.8, tint: false }),
      L({ sprite: SPRITE.smoke, count: 3, ramp: MIST, speed: [0.2, 0.6], disc: true, radius: 0.5, size: [0.6, 0.9], grow: 1.8, life: [1.6, 2.4], heat: [0.35, 0], emit: 0.3, occl: 0.2, gravity: -0.1, drag: 2, turb: 0.15, tint: false }),
    ],
  },
  /** What a cold spell leaves in the air: crystals that hang and slowly fall. */
  'mg.rimewake': {
    school: 'cold',
    layers: [
      L({ sprite: SPRITE.frost, variants: 4, count: 2, ramp: GLASS, speed: [0.05, 0.25], radius: 0.12, size: [0.06, 0.11], grow: 1, life: [1.2, 1.9], heat: [0.9, 0.5], emit: 0.8, occl: 0.1, gravity: -0.25, drag: 1, turb: 0.15, spin: 1.2, fade: 0.8, tint: false }),
    ],
  },
  /** Glints of ice and a thread of cold mist. */
  'mg.glasswake': {
    school: 'cold',
    layers: [
      L({ sprite: SPRITE.ice, variants: 4, count: 2, ramp: GLASS, speed: [0.2, 0.6], radius: 0.08, size: [0.04, 0.07], grow: 0.8, life: [0.8, 1.2], heat: [0.9, 0.5], emit: 0.8, occl: 0.3, gravity: -2.5, drag: 1, spin: 5, tint: false }),
      L({ sprite: SPRITE.smoke, count: 1, ramp: MIST, speed: [0.05, 0.2], radius: 0.06, size: [0.18, 0.26], grow: 2, life: [0.9, 1.3], heat: [0.3, 0], emit: 0.3, occl: 0.2, gravity: -0.1, drag: 1.5, tint: false }),
    ],
  },
};

registerEmitters(EM);

/** Every Mage emitter id, for the checkers. */
export const MAGE_EMITTERS: readonly string[] = Object.keys(EM);

/** Each Mage tree's bursts and wakes. */
const POOLS: Readonly<Record<string, { burst: readonly string[]; trail: readonly string[] }>> = {
  conflagration: { burst: ['mg.billow', 'mg.cinderfall'], trail: ['mg.sootwake', 'mg.emberwake'] },
  tempest: { burst: ['mg.arcburst', 'mg.skitter'], trail: ['mg.crackle', 'mg.sparkwake'] },
  frost: { burst: ['mg.shatter', 'mg.rimefall'], trail: ['mg.rimewake', 'mg.glasswake'] },
};

/**
 * A Mage skill's own burst and wake, from its tree's look; null for any
 * other skill. `h` is the skill's id hash, so two skills of a tree differ.
 */
export function mageParticles(skillId: string, h: number): { emitter: string; trail: string } | null {
  const pool = POOLS[SKILL_BY_ID[skillId]?.treeId ?? ''];
  if (!pool) return null;
  return { emitter: pool.burst[h % pool.burst.length]!, trail: pool.trail[(h >>> 4) % pool.trail.length]! };
}
