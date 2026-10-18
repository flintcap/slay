/**
 * SLAY — the dark, gritty bursts layered on top of the kit library: how a
 * body comes apart by the element that killed it, the floor of a lingering
 * spell field, and the power a self cast lets out. Registered into the kit's
 * emitter library on import (`registerEmitters`), so `fx.burst('death.ash')`
 * finds them. Particles only: every one draws in the one particle field, so
 * none of them adds a shader or a draw call.
 *
 * Ids: `death.*` (CombatFeel.onKill), `field.*` (fx/Fields.ts), `self.*`
 * (EffectSystem.selfCast).
 */
import { SPRITE } from './kit/Atlas';
import { registerEmitters, type Emitter, type Layer } from './kit/Emitters';

const DEFAULTS: Layer = {
  sprite: SPRITE.glow, variants: 1, count: 10, speed: [1, 3], spread: 1, up: 0, radius: 0.05, disc: false,
  life: [0.3, 0.6], size: [0.15, 0.25], grow: 0.5, ramp: 'school', emit: 1, occl: 0.15, heat: [1, 0.3],
  gravity: 0, drag: 2, turb: 0, spin: 0, stretch: 0, flat: false, fade: 1.5, stagger: 0, ground: false, bounce: 0.32,
  converge: false, tint: true,
};
const L = (o: Partial<Layer>): Layer => ({ ...DEFAULTS, ...o });

const flash = (size: number, life = 0.12, emit = 0.9): Layer =>
  L({ sprite: SPRITE.glow, count: 1, speed: [0, 0], radius: 0, size: [size, size * 1.1], grow: 1.5, life: [life, life * 1.2], heat: [1, 0.55], emit, occl: 0, fade: 2.2 });

const ASH = [0xb0a8a0, 0x5a544e, 0x1a1816] as const;
const CHAR = [0x6a5a4e, 0x2a221c, 0x0a0806] as const;
const SNOW = [0xffffff, 0xd8e8f8, 0x8aa0b8] as const;
const ICE = [0xeaf8ff, 0x9ccbe8, 0x3a6a8a] as const;
const SHADOW = [0x6a4a9a, 0x1e1230, 0x050308] as const;
const VOID = [0xe0a0ff, 0x5a18a8, 0x0a0218] as const;
const BLOOD = [0xb01414, 0x6e0808, 0x260202] as const;
const FLESH = [0x9a3a2a, 0x5e1a12, 0x1e0604] as const;
const ICHOR = [0xc8d860, 0x6a7a18, 0x1e2606] as const;
const SMOKE = [0x4a4440, 0x221f1c, 0x0c0b0a] as const;
const DUST = [0x9a8a74, 0x5e5446, 0x2a251e] as const;
const BONE = [0xe8e0c8, 0xa89c80, 0x4a4434] as const;
const STEEL = [0xfff6e0, 0xffc070, 0x7a3a10] as const;

const EM: Record<string, Emitter> = {
  // --- deaths ---------------------------------------------------------------
  // Burned: a sheet of flame climbs off the body, then ash and soot rise in a
  // column while embers drift up out of it.
  'death.ash': {
    school: 'fire',
    keyed: true,
    layers: [
      flash(1.2, 0.12),
      L({ sprite: SPRITE.flame, count: 8, speed: [0.3, 1.0], spread: 0.6, up: 1.6, radius: 0.3, size: [0.35, 0.55], grow: 1.3, life: [0.4, 0.7], heat: [1, 0.2], emit: 0.9, occl: 0.25, gravity: 4, drag: 2.5, turb: 0.5, stagger: 0.1 }),
      L({ sprite: SPRITE.flake, count: 22, ramp: ASH, speed: [0.6, 2], up: 1.4, radius: 0.35, size: [0.05, 0.11], grow: 1, life: [1.4, 2.4], heat: [0.5, 0], emit: 0.3, occl: 0.7, gravity: 0.5, drag: 1.4, turb: 1, spin: 5, stagger: 0.25, tint: false }),
      L({ sprite: SPRITE.ember, count: 18, speed: [1, 3], up: 1.5, radius: 0.3, size: [0.03, 0.06], grow: 0.4, life: [0.8, 1.6], heat: [1, 0.4], emit: 1.2, occl: 0, gravity: 1.4, drag: 1.2, turb: 0.8, stretch: 0.3 }),
      L({ sprite: SPRITE.smoke, count: 5, ramp: SMOKE, speed: [0.3, 0.8], up: 1.5, radius: 0.3, size: [0.6, 0.9], grow: 2.4, life: [1.4, 2.2], heat: [0.2, 0], emit: 0.2, occl: 0.6, gravity: 1.2, drag: 1.5, turb: 0.3, stagger: 0.2, tint: false }),
    ],
  },
  // What is left of a burned body falls in: grey flakes and a puff of soot.
  'death.crumble': {
    school: 'fire',
    keyed: true,
    layers: [
      L({ sprite: SPRITE.flake, count: 16, ramp: CHAR, speed: [0.3, 1.2], up: 0.3, radius: 0.4, size: [0.05, 0.1], grow: 1, life: [1.0, 1.8], heat: [0.3, 0], emit: 0.2, occl: 0.85, gravity: -3, drag: 1.5, turb: 0.6, spin: 6, ground: true, bounce: 0.1, tint: false }),
      L({ sprite: SPRITE.smoke, count: 3, ramp: ASH, speed: [0.4, 1.0], disc: true, radius: 0.4, size: [0.5, 0.8], grow: 2, life: [0.8, 1.3], heat: [0.2, 0], emit: 0.2, occl: 0.55, gravity: 0.3, drag: 2.5, tint: false }),
      L({ sprite: SPRITE.ember, count: 8, speed: [0.4, 1.4], up: 1.2, radius: 0.35, size: [0.025, 0.045], grow: 0.4, life: [0.6, 1.2], heat: [1, 0.3], emit: 1.1, occl: 0, gravity: 1, turb: 0.7 }),
    ],
  },
  // Frozen solid and struck: the body bursts into ice. Chunks fly and skid,
  // glints wink, a cold mist hangs where it stood.
  'death.shatter': {
    school: 'cold',
    keyed: true,
    layers: [
      flash(1.4, 0.1, 1.0),
      L({ sprite: SPRITE.shard, count: 20, ramp: ICE, speed: [3, 8], up: 0.6, radius: 0.3, size: [0.16, 0.32], grow: 0.9, life: [0.7, 1.2], heat: [0.9, 0.5], emit: 0.7, occl: 0.5, gravity: -14, drag: 0.8, spin: 9, stretch: 0.3, ground: true, bounce: 0.35, tint: false }),
      L({ sprite: SPRITE.rock, count: 8, ramp: ICE, speed: [2, 5], up: 0.5, radius: 0.35, size: [0.12, 0.22], grow: 1, life: [0.9, 1.4], heat: [0.7, 0.5], emit: 0.4, occl: 0.9, gravity: -15, drag: 0.6, spin: 8, ground: true, bounce: 0.25, fade: 4, tint: false }),
      L({ sprite: SPRITE.crystal, count: 6, speed: [1, 3], size: [0.25, 0.4], grow: 1.2, life: [0.3, 0.5], heat: [1, 0.35], emit: 0.9, occl: 0.05, spin: 4 }),
      L({ sprite: SPRITE.smoke, count: 5, speed: [0.4, 1.2], radius: 0.4, size: [0.6, 0.9], grow: 2, life: [0.9, 1.4], heat: [0.35, 0.05], emit: 0.45, occl: 0.3, gravity: -0.3, drag: 2, turb: 0.2 }),
      L({ sprite: SPRITE.ember, count: 24, ramp: SNOW, speed: [1, 4], up: 0.3, radius: 0.3, size: [0.03, 0.05], grow: 0.7, life: [0.8, 1.4], heat: [1, 0.45], emit: 0.9, occl: 0, gravity: -6, drag: 2, ground: true, bounce: 0.15, tint: false }),
    ],
  },
  // Killed by the dark: the body gives up black smoke and violet motes that
  // rise and thin out, while the last of its light is drawn inward.
  'death.shadow': {
    school: 'arcane',
    keyed: true,
    layers: [
      L({ sprite: SPRITE.gas, count: 6, ramp: SHADOW, speed: [0.4, 1.2], up: 1.4, radius: 0.35, size: [0.6, 0.9], grow: 1.8, life: [1.0, 1.6], heat: [0.3, 0], emit: 0.35, occl: 0.75, gravity: 1.2, drag: 1.8, turb: 0.5, spin: 1, stagger: 0.15, tint: false }),
      L({ sprite: SPRITE.mote, count: 16, ramp: VOID, speed: [0.6, 1.6], up: 1.6, radius: 0.4, size: [0.05, 0.1], grow: 0.5, life: [0.8, 1.4], heat: [1, 0.3], emit: 1.0, occl: 0, gravity: 1.4, drag: 1.2, turb: 0.6, tint: false }),
      L({ sprite: SPRITE.mote, count: 10, ramp: VOID, speed: [1.2, 2.2], radius: 1.2, converge: true, size: [0.05, 0.09], life: [0.3, 0.45], heat: [0.6, 1], emit: 1.0, occl: 0, tint: false }),
    ],
  },
  // The last of a shadow-killed body comes apart.
  'death.unmake': {
    school: 'arcane',
    keyed: true,
    layers: [
      L({ sprite: SPRITE.shock, count: 1, ramp: VOID, speed: [0, 0], radius: 0, size: [0.6, 0.6], grow: 3.5, life: [0.35, 0.4], heat: [1, 0.2], emit: 0.7, occl: 0, flat: true, fade: 1.2, tint: false }),
      L({ sprite: SPRITE.gas, count: 4, ramp: SHADOW, speed: [0.8, 1.8], disc: true, radius: 0.35, size: [0.5, 0.8], grow: 2, life: [0.7, 1.1], heat: [0.4, 0], emit: 0.35, occl: 0.7, gravity: 0.6, drag: 2.5, turb: 0.4, tint: false }),
      L({ sprite: SPRITE.flake, count: 12, ramp: VOID, speed: [0.6, 1.8], up: 1.4, radius: 0.35, size: [0.05, 0.1], grow: 0.6, life: [0.8, 1.4], heat: [1, 0.2], emit: 0.8, occl: 0.2, gravity: 1.2, turb: 0.7, spin: 4, tint: false }),
    ],
  },
  // Poison: the body sloughs and blooms rot.
  'death.melt': {
    school: 'poison',
    keyed: true,
    layers: [
      L({ sprite: SPRITE.gas, count: 5, speed: [0.3, 1.0], up: 0.5, radius: 0.4, size: [0.7, 1.1], grow: 1.9, life: [1.2, 1.9], heat: [0.6, 0.1], emit: 0.6, occl: 0.45, gravity: 0.3, drag: 2, turb: 0.3, spin: 0.6, stagger: 0.12 }),
      L({ sprite: SPRITE.drop, count: 18, ramp: ICHOR, speed: [1.5, 4], spread: 0.9, up: 0.6, radius: 0.3, size: [0.06, 0.12], grow: 0.9, life: [0.6, 1.0], heat: [0.6, 0.4], emit: 0.4, occl: 0.9, gravity: -12, drag: 1, stretch: 0.4, ground: true, bounce: 0, fade: 3, tint: false }),
      L({ sprite: SPRITE.bubble, count: 10, speed: [0.3, 1.0], up: 1, radius: 0.4, size: [0.07, 0.15], grow: 1.3, life: [0.7, 1.3], heat: [0.8, 0.5], emit: 0.8, occl: 0.1, gravity: 0.7, drag: 1.5, turb: 0.4 }),
    ],
  },
  // Lightning: arcs crawl over the body as it drops, then it smokes.
  'death.cook': {
    school: 'lightning',
    keyed: true,
    layers: [
      flash(1.3, 0.08, 1.0),
      L({ sprite: SPRITE.arc, variants: 8, count: 5, speed: [0, 0], radius: 0.5, size: [0.7, 1.1], grow: 1.1, life: [0.08, 0.18], heat: [1, 0.8], emit: 1.0, occl: 0, fade: 1, stagger: 0.25 }),
      L({ sprite: SPRITE.spark, count: 26, speed: [4, 10], up: 0.3, radius: 0.3, size: [0.035, 0.06], grow: 0.4, life: [0.15, 0.4], heat: [1, 0.6], emit: 1.1, occl: 0, gravity: -12, drag: 3, stretch: 1.4, fade: 1.2, ground: true, bounce: 0.5 }),
      L({ sprite: SPRITE.smoke, count: 4, ramp: SMOKE, speed: [0.3, 0.8], up: 1.5, radius: 0.3, size: [0.45, 0.7], grow: 2.2, life: [1.0, 1.6], heat: [0.2, 0], emit: 0.2, occl: 0.55, gravity: 1, drag: 1.5, turb: 0.3, stagger: 0.15, tint: false }),
    ],
  },
  // A heavy body opened by steel: a mist of blood, thrown drops and meat.
  'death.blood': {
    school: 'physical',
    keyed: true,
    layers: [
      L({ sprite: SPRITE.smoke, count: 4, ramp: BLOOD, speed: [0.6, 1.6], radius: 0.3, size: [0.4, 0.7], grow: 2, life: [0.5, 0.9], heat: [0.4, 0.1], emit: 0.2, occl: 0.6, gravity: -0.4, drag: 3, turb: 0.2, tint: false }),
      L({ sprite: SPRITE.drop, count: 24, ramp: BLOOD, speed: [3, 7], spread: 0.8, up: 0.5, radius: 0.25, size: [0.06, 0.13], grow: 0.9, life: [0.5, 1.0], heat: [0.7, 0.4], emit: 0.45, occl: 0.95, gravity: -14, drag: 1, stretch: 0.5, ground: true, bounce: 0, fade: 3, tint: false }),
      L({ sprite: SPRITE.rock, count: 10, ramp: FLESH, speed: [3, 7], spread: 0.8, up: 0.5, size: [0.08, 0.16], grow: 1, life: [0.9, 1.4], heat: [0.6, 0.5], emit: 0.2, occl: 1, gravity: -15, drag: 0.8, spin: 9, ground: true, fade: 4, tint: false }),
    ],
  },
  // A big body hitting the floor: a ring of grit and dust.
  'death.thud': {
    school: 'physical',
    keyed: true,
    layers: [
      L({ sprite: SPRITE.smoke, count: 8, ramp: DUST, speed: [1.5, 3.5], up: 0.1, disc: true, radius: 0.5, size: [0.5, 0.8], grow: 2.2, life: [0.8, 1.3], heat: [0.2, 0], emit: 0.2, occl: 0.55, gravity: 0.3, drag: 2.5, turb: 0.3, tint: false }),
      L({ sprite: SPRITE.rock, count: 8, ramp: DUST, speed: [2, 4], up: 0.8, radius: 0.4, size: [0.05, 0.1], grow: 1, life: [0.6, 1.0], heat: [0.4, 0.3], emit: 0.2, occl: 1, gravity: -14, spin: 8, ground: true, fade: 4, tint: false }),
    ],
  },

  // --- fields (fx/Fields.ts) -------------------------------------------------
  // Each is one small puff of the field's matter, fired many times a second
  // at random points over the field. No single-sprite layers: everything here
  // thins with the quality.
  'field.flames': {
    school: 'fire',
    keyed: true,
    layers: [
      L({ sprite: SPRITE.flame, count: 4, speed: [0.2, 0.6], up: 2, radius: 0.25, disc: true, size: [0.3, 0.5], grow: 1.2, life: [0.45, 0.8], heat: [1, 0.2], emit: 0.9, occl: 0.22, gravity: 3.5, drag: 2.5, turb: 0.5 }),
      L({ sprite: SPRITE.ember, count: 6, speed: [0.4, 1.4], up: 1.5, radius: 0.3, disc: true, size: [0.025, 0.05], grow: 0.4, life: [1.0, 2.0], heat: [1, 0.4], emit: 1.2, occl: 0, gravity: 1.2, drag: 1, turb: 0.8 }),
    ],
  },
  'field.soot': {
    school: 'fire',
    keyed: true,
    layers: [L({ sprite: SPRITE.smoke, count: 3, ramp: SMOKE, speed: [0.2, 0.6], up: 1, radius: 0.3, disc: true, size: [0.5, 0.8], grow: 2.4, life: [1.4, 2.2], heat: [0.2, 0], emit: 0.2, occl: 0.5, gravity: 1, drag: 1.5, turb: 0.3, tint: false })],
  },
  'field.cinderfall': {
    school: 'fire',
    keyed: true,
    layers: [
      L({ sprite: SPRITE.ember, count: 6, speed: [5, 8], spread: 0.08, radius: 0.6, disc: true, size: [0.05, 0.09], grow: 0.8, life: [0.9, 1.4], heat: [1, 0.3], emit: 1.3, occl: 0, gravity: -6, drag: 0.3, stretch: 1.4, fade: 1.2, ground: true, bounce: 0.2 }),
      L({ sprite: SPRITE.fireball, count: 3, speed: [4, 6], spread: 0.08, radius: 0.5, disc: true, size: [0.22, 0.34], grow: 0.8, life: [0.7, 1.0], heat: [1, 0.3], emit: 0.9, occl: 0.25, gravity: -6, drag: 0.3, spin: 2 }),
    ],
  },
  'field.rime': {
    school: 'cold',
    keyed: true,
    layers: [L({ sprite: SPRITE.smoke, count: 3, speed: [0.15, 0.45], up: 0, radius: 0.4, disc: true, size: [0.7, 1.1], grow: 1.8, life: [1.6, 2.4], heat: [0.3, 0.05], emit: 0.35, occl: 0.3, gravity: -0.05, drag: 1, turb: 0.15 })],
  },
  'field.glitter': {
    school: 'cold',
    keyed: true,
    layers: [
      L({ sprite: SPRITE.ember, count: 5, ramp: SNOW, speed: [0.05, 0.25], up: 0.6, radius: 0.5, disc: true, size: [0.025, 0.045], grow: 0.7, life: [0.8, 1.4], heat: [1, 0.5], emit: 1.0, occl: 0, gravity: 0.1, drag: 1, turb: 0.4, tint: false }),
      L({ sprite: SPRITE.crystal, count: 3, speed: [0.1, 0.3], up: 1, radius: 0.5, disc: true, size: [0.1, 0.18], grow: 1.2, life: [0.5, 0.9], heat: [1, 0.3], emit: 0.8, occl: 0.05, spin: 3 }),
    ],
  },
  'field.snowfall': {
    school: 'cold',
    keyed: true,
    layers: [
      L({ sprite: SPRITE.ember, count: 10, ramp: SNOW, speed: [4, 6], spread: 0.15, radius: 1, disc: true, size: [0.035, 0.06], grow: 0.9, life: [0.8, 1.2], heat: [1, 0.6], emit: 0.8, occl: 0.2, gravity: -2, drag: 0.4, turb: 0.3, stretch: 1.5, ground: true, bounce: 0, tint: false }),
      L({ sprite: SPRITE.shard, count: 3, ramp: ICE, speed: [6, 9], spread: 0.08, radius: 0.8, disc: true, size: [0.08, 0.14], grow: 1, life: [0.6, 0.9], heat: [0.9, 0.5], emit: 0.7, occl: 0.45, gravity: -8, drag: 0.2, stretch: 0.8, ground: true, bounce: 0.2, tint: false }),
    ],
  },
  'field.crawl': {
    school: 'lightning',
    keyed: true,
    layers: [
      L({ sprite: SPRITE.arc, variants: 8, count: 3, speed: [0, 0], radius: 0.6, disc: true, size: [0.5, 0.8], grow: 1.1, life: [0.06, 0.14], heat: [1, 0.8], emit: 1.0, occl: 0, fade: 1 }),
      L({ sprite: SPRITE.spark, count: 5, speed: [1.5, 3.5], up: 0.6, radius: 0.5, disc: true, size: [0.03, 0.05], grow: 0.5, life: [0.3, 0.6], heat: [1, 0.4], emit: 1.2, occl: 0, gravity: -14, drag: 1.5, stretch: 1, fade: 1.3, ground: true, bounce: 0.6 }),
    ],
  },
  'field.strike': {
    school: 'lightning',
    keyed: true,
    layers: [
      L({ sprite: SPRITE.spark, count: 4, speed: [16, 24], spread: 0.04, up: 8, radius: 0.3, disc: true, size: [0.08, 0.12], grow: 0.4, life: [0.12, 0.2], heat: [1, 0.8], emit: 1.4, occl: 0, drag: 0.5, stretch: 4, fade: 1.2 }),
      L({ sprite: SPRITE.arc, variants: 8, count: 3, speed: [2, 4], spread: 0.1, up: 6, radius: 0.2, size: [0.7, 1.0], grow: 1, life: [0.08, 0.14], heat: [1, 0.8], emit: 1.0, occl: 0, fade: 1 }),
    ],
  },
  'field.miasma': {
    school: 'poison',
    keyed: true,
    layers: [L({ sprite: SPRITE.gas, count: 3, speed: [0.1, 0.4], up: 0.3, radius: 0.5, disc: true, size: [0.8, 1.2], grow: 1.6, life: [1.6, 2.6], heat: [0.6, 0.1], emit: 0.5, occl: 0.45, gravity: 0.1, drag: 1.5, turb: 0.3, spin: 0.5 })],
  },
  'field.bubbles': {
    school: 'poison',
    keyed: true,
    layers: [
      L({ sprite: SPRITE.bubble, count: 4, speed: [0.2, 0.6], up: 2, radius: 0.5, disc: true, size: [0.06, 0.12], grow: 1.3, life: [0.6, 1.1], heat: [0.8, 0.5], emit: 0.8, occl: 0.1, gravity: 0.4, drag: 1.5, turb: 0.3 }),
      L({ sprite: SPRITE.drop, count: 3, ramp: ICHOR, speed: [0.8, 1.8], up: 1.4, radius: 0.4, disc: true, size: [0.04, 0.08], grow: 0.9, life: [0.5, 0.8], heat: [0.6, 0.4], emit: 0.4, occl: 0.9, gravity: -10, ground: true, bounce: 0, fade: 3, tint: false }),
    ],
  },
  'field.smoke': {
    school: 'arcane',
    keyed: true,
    layers: [L({ sprite: SPRITE.smoke, count: 4, ramp: [0x5a5550, 0x2c2926, 0x0e0d0c], speed: [0.2, 0.6], up: 0.6, radius: 0.6, disc: true, size: [1.0, 1.5], grow: 1.8, life: [2.0, 3.0], heat: [0.15, 0], emit: 0.15, occl: 0.85, gravity: 0.25, drag: 1.5, turb: 0.25, spin: 0.3, tint: false })],
  },
  'field.dark': {
    school: 'arcane',
    keyed: true,
    layers: [L({ sprite: SPRITE.gas, count: 3, ramp: SHADOW, speed: [0.1, 0.4], up: 0.4, radius: 0.5, disc: true, size: [0.7, 1.0], grow: 1.5, life: [1.4, 2.2], heat: [0.3, 0], emit: 0.3, occl: 0.7, gravity: 0.2, drag: 1.5, turb: 0.4, spin: 0.6, tint: false })],
  },
  'field.motes': {
    school: 'arcane',
    keyed: true,
    layers: [L({ sprite: SPRITE.mote, count: 5, ramp: VOID, speed: [0.2, 0.6], up: 1, radius: 0.5, disc: true, size: [0.04, 0.08], grow: 0.6, life: [1.0, 1.8], heat: [1, 0.3], emit: 1.0, occl: 0, gravity: 0.3, drag: 1, turb: 0.5, tint: false })],
  },
  'field.dust': {
    school: 'physical',
    keyed: true,
    layers: [L({ sprite: SPRITE.smoke, count: 3, ramp: DUST, speed: [0.3, 0.8], up: 0.1, radius: 0.5, disc: true, size: [0.5, 0.8], grow: 2, life: [1.0, 1.6], heat: [0.2, 0], emit: 0.2, occl: 0.5, gravity: 0.1, drag: 2, turb: 0.4, spin: 0.5, tint: false })],
  },
  'field.rattle': {
    school: 'bone',
    keyed: true,
    layers: [L({ sprite: SPRITE.bone, count: 3, ramp: BONE, speed: [1, 2.5], up: 1.5, radius: 0.4, disc: true, size: [0.06, 0.12], grow: 1, life: [0.6, 1.0], heat: [0.6, 0.5], emit: 0.4, occl: 0.9, gravity: -12, drag: 1, spin: 8, ground: true, fade: 3, tint: false })],
  },

  // --- self casts (EffectSystem.selfCast) -----------------------------------
  // Power let out from the body: a ring of the school's light rising round it.
  'self.rise': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.mote, count: 16, speed: [1.2, 2.4], spread: 0.15, up: 2, radius: 0.7, disc: true, size: [0.05, 0.1], grow: 0.4, life: [0.5, 0.9], heat: [1, 0.3], emit: 1.1, occl: 0, gravity: 1.5, drag: 1.2, turb: 0.3, stretch: 0.8 }),
      L({ sprite: SPRITE.spark, count: 8, speed: [4, 7], spread: 0.06, up: 4, radius: 0.55, disc: true, size: [0.05, 0.08], grow: 0.4, life: [0.18, 0.3], heat: [1, 0.6], emit: 1.2, occl: 0, drag: 2, stretch: 2.4, fade: 1.3 }),
      L({ sprite: SPRITE.ring, count: 1, speed: [0, 0], radius: 0, size: [0.5, 0.5], grow: 3.2, life: [0.32, 0.36], heat: [1, 0.2], emit: 0.8, occl: 0, flat: true, fade: 1.2 }),
    ],
  },
  // Grit kicked off the floor round the feet (warrior stances, banners).
  'self.stance': {
    school: 'physical',
    keyed: true,
    layers: [
      L({ sprite: SPRITE.smoke, count: 6, ramp: DUST, speed: [1.6, 3], up: 0.05, disc: true, radius: 0.5, size: [0.4, 0.65], grow: 2.1, life: [0.6, 1.0], heat: [0.2, 0], emit: 0.2, occl: 0.5, gravity: 0.2, drag: 2.8, turb: 0.3, tint: false }),
      L({ sprite: SPRITE.rock, count: 6, ramp: DUST, speed: [1.5, 3], up: 1, radius: 0.4, disc: true, size: [0.04, 0.08], grow: 1, life: [0.5, 0.8], heat: [0.4, 0.3], emit: 0.2, occl: 1, gravity: -14, spin: 8, ground: true, fade: 4, tint: false }),
    ],
  },
  // A roar: a flat shock thrown out along the floor, dust and grit driven before it.
  'self.roar': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.shock, count: 1, speed: [0, 0], radius: 0, size: [1.0, 1.0], grow: 5.5, life: [0.32, 0.36], heat: [1, 0.15], emit: 0.6, occl: 0, flat: true, fade: 1.1 }),
      L({ sprite: SPRITE.smoke, count: 10, ramp: DUST, speed: [3.5, 6], up: 0.04, disc: true, radius: 0.6, size: [0.45, 0.75], grow: 2.2, life: [0.6, 1.0], heat: [0.2, 0], emit: 0.2, occl: 0.5, gravity: 0.2, drag: 3, turb: 0.3, tint: false }),
      L({ sprite: SPRITE.rock, count: 8, ramp: DUST, speed: [3, 6], up: 0.5, radius: 0.5, disc: true, size: [0.04, 0.08], grow: 1, life: [0.5, 0.8], heat: [0.4, 0.3], emit: 0.2, occl: 1, gravity: -14, spin: 8, ground: true, fade: 4, tint: false }),
      L({ sprite: SPRITE.spark, count: 8, ramp: STEEL, speed: [5, 9], spread: 1, up: 0.1, size: [0.035, 0.06], grow: 0.4, life: [0.15, 0.3], heat: [1, 0.5], emit: 1.1, occl: 0, gravity: -8, drag: 3, stretch: 1.6, tint: false }),
    ],
  },
  // A banner planted: a shaft of light climbing from the ground.
  'self.banner': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.spark, count: 10, speed: [8, 14], spread: 0.03, up: 6, radius: 0.35, disc: true, size: [0.07, 0.11], grow: 0.4, life: [0.25, 0.4], heat: [1, 0.6], emit: 1.3, occl: 0, drag: 1, stretch: 3, fade: 1.2 }),
      L({ sprite: SPRITE.mote, count: 12, speed: [0.8, 1.8], up: 3, radius: 0.6, disc: true, size: [0.06, 0.11], grow: 0.5, life: [0.8, 1.3], heat: [1, 0.3], emit: 1.0, occl: 0, gravity: 1.2, turb: 0.4 }),
    ],
  },
};

registerEmitters(EM);

/** The ids this file adds, for checks and warm-ups. */
export const GRIT_EMITTERS: readonly string[] = Object.keys(EM);
