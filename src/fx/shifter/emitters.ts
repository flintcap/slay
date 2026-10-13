/**
 * SLAY — the Shapeshifter's own particles: shed fur, breath, dust, blood
 * spray and the dark of the cat. Registered into the kit's emitter library
 * on import (`registerEmitters`), so `effects.fx.burst('ss.…')` finds them.
 *
 * Every id starts `ss.` and no other skill in the game fires one.
 */
import { SPRITE } from '../kit/Atlas';
import { registerEmitters, type Emitter, type Layer } from '../kit/Emitters';

const DEFAULTS: Layer = {
  sprite: SPRITE.glow, variants: 1, count: 10, speed: [1, 3], spread: 1, up: 0, radius: 0.05, disc: false,
  life: [0.3, 0.6], size: [0.15, 0.25], grow: 0.5, ramp: 'school', emit: 1, occl: 0.15, heat: [1, 0.3],
  gravity: 0, drag: 2, turb: 0, spin: 0, stretch: 0, flat: false, fade: 1.5, stagger: 0, ground: false,
  converge: false, tint: true,
};
const L = (o: Partial<Layer>): Layer => ({ ...DEFAULTS, ...o });

// Pelts, as the three colours a ramp runs through (bright, body, tail).
const CAT_FUR = [0x2a2632, 0x121016, 0x050406] as const;
const WOLF_FUR = [0x9a948a, 0x5c5850, 0x24221e] as const;
const BEAR_FUR = [0x7a5232, 0x4a2e18, 0x1a0e06] as const;
const MAN_SKIN = [0xc89a78, 0x8a5a3e, 0x3a2216] as const;
const SHADOW = [0x5a4a8a, 0x1e1630, 0x050308] as const;
const BREATH = [0xe8eef2, 0xa0aab2, 0x4a5258] as const;
const DUST = [0x9a8a74, 0x5e5446, 0x2a251e] as const;
const STONE = [0x8a8278, 0x4e4840, 0x1e1c1a] as const;
const BLOOD = [0xb01414, 0x6e0808, 0x260202] as const;
const EYE_CAT = [0xf4ffb0, 0xc8d23a, 0x4a5a08] as const;
const EYE_WOLF = [0xfff0c0, 0xe8a428, 0x6a3a04] as const;
const EYE_BEAR = [0xffc890, 0xb05a1a, 0x3a1406] as const;

/** Hair flying off a body: dark, solid flecks that tumble and fall. */
function fur(ramp: readonly [number, number, number], count: number, speed: [number, number], up: number, o: Partial<Layer> = {}): Layer {
  return L({
    sprite: SPRITE.ember, count, ramp, speed, spread: 1, up, radius: 0.35, size: [0.035, 0.075], grow: 0.8,
    life: [0.7, 1.3], heat: [0.15, 0], emit: 0.05, occl: 0.95, gravity: -5, drag: 2.4, turb: 1.1, spin: 6,
    stretch: 0.6, fade: 1.2, tint: false, ...o,
  });
}

/** Breath on cold air, out of a muzzle. */
function breath(count: number, o: Partial<Layer> = {}): Layer {
  return L({
    sprite: SPRITE.smoke, count, ramp: BREATH, speed: [0.8, 2.0], spread: 0.35, up: 0.15, radius: 0.04, size: [0.12, 0.2],
    grow: 3.2, life: [0.6, 1.1], heat: [0.25, 0], emit: 0.15, occl: 0.25, gravity: 0.5, drag: 2.6, turb: 0.5, fade: 1.4, tint: false, ...o,
  });
}

/** Two points of light where the eyes are. */
function eyes(ramp: readonly [number, number, number]): Layer {
  return L({ sprite: SPRITE.flare, count: 2, ramp, speed: [0, 0.1], radius: 0.06, size: [0.12, 0.16], grow: 0.4, life: [0.35, 0.5], heat: [1, 0.6], emit: 1.4, occl: 0, fade: 2.4, tint: false });
}

const EM: Record<string, Emitter> = {
  // --- the changes (form skills and auto-shift) ------------------------------
  // The cat: the dark pulls in round the body, then black hair flies.
  'ss.change.cat': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.smoke, count: 14, ramp: SHADOW, converge: true, radius: 1.3, speed: [2, 3], life: [0.3, 0.45], size: [0.4, 0.6], grow: 0.4, heat: [0.4, 0], emit: 0.3, occl: 0.7, fade: 1.2, tint: false }),
      fur(CAT_FUR, 46, [2.5, 5.5], 0.5, { stagger: 0.12 }),
      L({ sprite: SPRITE.smoke, count: 6, ramp: SHADOW, speed: [0.6, 1.4], radius: 0.4, size: [0.5, 0.8], grow: 2.2, life: [0.8, 1.3], heat: [0.2, 0], emit: 0.15, occl: 0.65, gravity: 0.3, drag: 2, turb: 0.4, stagger: 0.1, tint: false }),
    ],
  },
  // The wolf: grey hair bursts out low in a ring, dust under it.
  'ss.change.wolf': {
    school: 'physical',
    layers: [
      fur(WOLF_FUR, 56, [3, 6.5], 0.25, { disc: true, radius: 0.45 }),
      L({ sprite: SPRITE.smoke, count: 8, ramp: DUST, disc: true, radius: 0.3, speed: [1.5, 3], up: -0.1, size: [0.35, 0.5], grow: 2.4, life: [0.7, 1.1], heat: [0.2, 0], emit: 0.2, occl: 0.5, drag: 2.5, turb: 0.3, tint: false }),
      fur(WOLF_FUR, 18, [0.6, 1.6], 1, { gravity: -2.5, life: [1.0, 1.6], stagger: 0.25 }),
    ],
  },
  // The bear: a thump that throws a ring of dust and stone, brown hair in it.
  'ss.change.bear': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.smoke, count: 18, ramp: DUST, disc: true, radius: 0.5, speed: [3, 5.5], up: -0.15, size: [0.45, 0.7], grow: 2.6, life: [0.8, 1.3], heat: [0.2, 0], emit: 0.2, occl: 0.6, drag: 2.2, turb: 0.3, tint: false }),
      L({ sprite: SPRITE.rock, count: 9, ramp: STONE, disc: true, radius: 0.4, speed: [3, 6], up: 0.9, size: [0.06, 0.12], grow: 1, life: [0.5, 0.9], heat: [0.1, 0], emit: 0.05, occl: 1, gravity: -16, drag: 0.8, spin: 8, ground: true, tint: false }),
      fur(BEAR_FUR, 44, [2.5, 5], 0.6, { size: [0.045, 0.09] }),
    ],
  },
  // Back to a man: the pelt sloughs off and falls, steam rises off the skin.
  'ss.change.man': {
    school: 'physical',
    layers: [
      fur(MAN_SKIN, 10, [0.4, 1], 0.2, { radius: 0.4, gravity: -4, size: [0.03, 0.05] }),
      L({ sprite: SPRITE.smoke, count: 10, ramp: BREATH, radius: 0.45, speed: [0.3, 0.8], up: 1, size: [0.3, 0.5], grow: 2.6, life: [1.0, 1.6], heat: [0.2, 0], emit: 0.12, occl: 0.22, gravity: 1.2, drag: 1.6, turb: 0.6, stagger: 0.25, tint: false }),
    ],
  },
  // The pelt shed when coming out of each form (the colour of what is lost).
  'ss.shed.cat': { school: 'physical', layers: [fur(CAT_FUR, 50, [0.3, 1.2], 0.1, { radius: 0.5, life: [1.0, 1.7], gravity: -3.5, stagger: 0.2 })] },
  'ss.shed.wolf': { school: 'physical', layers: [fur(WOLF_FUR, 50, [0.3, 1.2], 0.1, { radius: 0.5, life: [1.0, 1.7], gravity: -3.5, stagger: 0.2 })] },
  'ss.shed.bear': { school: 'physical', layers: [fur(BEAR_FUR, 50, [0.3, 1.2], 0.1, { radius: 0.55, life: [1.0, 1.7], gravity: -3.5, stagger: 0.2, size: [0.045, 0.09] })] },
  // Breath out of the new muzzle, and the eyes catching the light.
  'ss.breath': { school: 'physical', layers: [breath(7)] },
  'ss.eyes.cat': { school: 'physical', layers: [eyes(EYE_CAT)] },
  'ss.eyes.wolf': { school: 'physical', layers: [eyes(EYE_WOLF)] },
  'ss.eyes.bear': { school: 'physical', layers: [eyes(EYE_BEAR)] },
  // A spray of blood off claws: the base every claw hit adds to.
  'ss.blood': {
    school: 'physical',
    layers: [L({ sprite: SPRITE.drop, count: 12, ramp: BLOOD, speed: [3, 7], spread: 0.5, up: 0.35, size: [0.04, 0.08], grow: 0.7, life: [0.35, 0.7], heat: [0.3, 0], emit: 0.1, occl: 0.9, gravity: -14, drag: 1.2, stretch: 1.4, ground: true, tint: false })],
  },
};

registerEmitters(EM);

/** Every Shapeshifter emitter id, for tools. */
export const SHIFTER_EMITTERS: readonly string[] = Object.keys(EM);
