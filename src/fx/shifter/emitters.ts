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
  gravity: 0, drag: 2, turb: 0, spin: 0, stretch: 0, flat: false, fade: 1.5, stagger: 0, ground: false, bounce: 0.32,
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
    layers: [L({ sprite: SPRITE.drop, count: 12, ramp: BLOOD, speed: [3, 7], spread: 0.5, up: 0.35, size: [0.04, 0.08], grow: 0.7, life: [0.35, 0.7], heat: [0.3, 0], emit: 0.1, occl: 0.9, gravity: -14, drag: 1.2, stretch: 1.4, ground: true, bounce: 0, tint: false })],
  },

  // --- Feral -------------------------------------------------------------------
  // Rake: three streaks of blood flung off to the side of the stroke.
  'ss.rake.hit': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.drop, count: 16, ramp: BLOOD, speed: [4, 8], spread: 0.35, up: 0.2, size: [0.035, 0.07], grow: 0.6, life: [0.3, 0.6], heat: [0.3, 0], emit: 0.1, occl: 0.9, gravity: -15, drag: 1, stretch: 2, ground: true, bounce: 0, tint: false }),
      fur(CAT_FUR, 6, [1, 2.5], 0.4, { radius: 0.1, life: [0.4, 0.8] }),
    ],
  },
  // Pounce: the shadow the cat drags through the air, puffed along the arc.
  'ss.pounce.streak': {
    school: 'physical',
    layers: [L({ sprite: SPRITE.smoke, count: 2, ramp: SHADOW, speed: [0.1, 0.4], radius: 0.15, size: [0.35, 0.5], grow: 1.6, life: [0.25, 0.4], heat: [0.3, 0], emit: 0.2, occl: 0.6, drag: 3, tint: false })],
  },
  // Pounce: the landing, dust and shadow blown flat and blood.
  'ss.pounce.land': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.smoke, count: 12, ramp: SHADOW, disc: true, radius: 0.3, speed: [3, 5], up: -0.1, size: [0.4, 0.6], grow: 2.2, life: [0.5, 0.8], heat: [0.3, 0], emit: 0.2, occl: 0.6, drag: 2.6, tint: false }),
      L({ sprite: SPRITE.smoke, count: 6, ramp: DUST, disc: true, radius: 0.3, speed: [2, 3.5], up: -0.1, size: [0.35, 0.5], grow: 2.4, life: [0.6, 1.0], heat: [0.2, 0], emit: 0.2, occl: 0.5, drag: 2.4, tint: false }),
      L({ sprite: SPRITE.drop, count: 10, ramp: BLOOD, speed: [2.5, 5], spread: 0.8, up: 0.8, size: [0.04, 0.08], grow: 0.6, life: [0.4, 0.7], heat: [0.3, 0], emit: 0.1, occl: 0.9, gravity: -14, drag: 1, stretch: 1.4, ground: true, bounce: 0, tint: false }),
    ],
  },
  // Slink: the dark pooling round the feet, lying flat on the floor.
  'ss.slink.pool': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.smoke, count: 10, ramp: SHADOW, disc: true, flat: true, radius: 0.7, speed: [0.2, 0.6], size: [0.7, 1.0], grow: 1.6, life: [1.2, 1.8], heat: [0.2, 0], emit: 0.1, occl: 0.75, drag: 2, turb: 0.2, tint: false }),
      L({ sprite: SPRITE.mote, count: 10, ramp: SHADOW, radius: 0.6, speed: [0.2, 0.6], up: 0.3, size: [0.04, 0.07], grow: 0.6, life: [0.8, 1.4], heat: [1, 0.4], emit: 0.8, occl: 0, drag: 1.5, turb: 0.6, tint: false }),
    ],
  },
  // Slink: what drifts off the slinking cat as it goes.
  'ss.slink.wisp': {
    school: 'physical',
    layers: [L({ sprite: SPRITE.smoke, count: 2, ramp: SHADOW, radius: 0.25, speed: [0.1, 0.4], up: 0.2, size: [0.3, 0.45], grow: 1.8, life: [0.5, 0.8], heat: [0.2, 0], emit: 0.1, occl: 0.55, drag: 2, turb: 0.4, tint: false })],
  },
  // Hamstring: a low spray along the floor and a scuff of dust.
  'ss.hamstring.hit': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.drop, count: 14, ramp: BLOOD, disc: true, speed: [3, 6], spread: 0.5, up: 0.05, size: [0.035, 0.07], grow: 0.6, life: [0.3, 0.55], heat: [0.3, 0], emit: 0.1, occl: 0.9, gravity: -10, drag: 1.4, stretch: 2, ground: true, bounce: 0, tint: false }),
      L({ sprite: SPRITE.smoke, count: 4, ramp: DUST, radius: 0.2, speed: [1, 2], up: -0.2, size: [0.25, 0.4], grow: 2, life: [0.5, 0.8], heat: [0.2, 0], emit: 0.2, occl: 0.45, drag: 2.5, tint: false }),
    ],
  },
  // Throat Tear: a gush of blood thrown up out of the bite.
  'ss.throat.gush': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.drop, count: 22, ramp: BLOOD, speed: [3, 7], spread: 0.45, up: 1.1, radius: 0.08, size: [0.045, 0.09], grow: 0.6, life: [0.5, 0.9], heat: [0.3, 0], emit: 0.1, occl: 0.95, gravity: -13, drag: 0.8, stretch: 1.6, ground: true, bounce: 0, tint: false }),
      L({ sprite: SPRITE.splat, count: 3, ramp: BLOOD, speed: [0.5, 1.5], radius: 0.1, size: [0.25, 0.4], grow: 1.6, life: [0.2, 0.35], heat: [0.4, 0], emit: 0.2, occl: 0.85, tint: false }),
    ],
  },
  // Killing Dance: the shadow the cat leaves where it just was.
  'ss.dance.after': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.smoke, count: 4, ramp: SHADOW, radius: 0.3, speed: [0.1, 0.3], up: 0.1, size: [0.55, 0.8], grow: 1.2, life: [0.3, 0.45], heat: [0.4, 0], emit: 0.25, occl: 0.7, drag: 3, tint: false }),
      L({ sprite: SPRITE.mote, count: 3, ramp: EYE_CAT, radius: 0.2, speed: [0.1, 0.4], up: 0.5, size: [0.04, 0.06], grow: 0.4, life: [0.3, 0.5], heat: [1, 0.5], emit: 1.2, occl: 0, tint: false }),
    ],
  },
  // Night Hunt: the dark rising off the body like smoke off a wick.
  'ss.night.rise': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.smoke, count: 16, ramp: SHADOW, radius: 0.5, speed: [0.6, 1.6], up: 1.2, size: [0.45, 0.7], grow: 2.4, life: [0.9, 1.5], heat: [0.3, 0], emit: 0.15, occl: 0.7, gravity: 1.5, drag: 1.6, turb: 0.5, stagger: 0.2, tint: false }),
      L({ sprite: SPRITE.mote, count: 18, ramp: SHADOW, radius: 0.7, speed: [0.4, 1.2], up: 1, size: [0.04, 0.07], grow: 0.5, life: [0.8, 1.4], heat: [1, 0.4], emit: 1, occl: 0, gravity: 1, drag: 1.2, turb: 0.7, tint: false }),
    ],
  },
  'ss.night.trail': {
    school: 'physical',
    layers: [L({ sprite: SPRITE.smoke, count: 2, ramp: SHADOW, radius: 0.35, speed: [0.1, 0.3], up: 0.6, size: [0.4, 0.55], grow: 1.8, life: [0.5, 0.8], heat: [0.3, 0], emit: 0.15, occl: 0.6, gravity: 0.6, drag: 2, turb: 0.4, tint: false })],
  },

  // --- Teeth -------------------------------------------------------------------
  // Snap: the glint of teeth meeting and a fleck of blood.
  'ss.snap.glint': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.flare, count: 2, ramp: [0xffffff, 0xf0e8d8, 0x8a8070], speed: [0, 0.2], radius: 0.05, size: [0.16, 0.22], grow: 0.3, life: [0.08, 0.12], heat: [1, 0.6], emit: 1.4, occl: 0, fade: 2.6, tint: false }),
      L({ sprite: SPRITE.drop, count: 8, ramp: BLOOD, speed: [2, 4], spread: 0.6, up: 0.4, size: [0.03, 0.06], grow: 0.6, life: [0.3, 0.5], heat: [0.3, 0], emit: 0.1, occl: 0.9, gravity: -14, drag: 1, stretch: 1.2, ground: true, bounce: 0, tint: false }),
    ],
  },
  // Hunting Howl: breath thrown straight up into the air.
  'ss.howl.breath': {
    school: 'physical',
    layers: [breath(12, { speed: [2.5, 4.5], spread: 0.25, up: 0, size: [0.15, 0.25], life: [0.8, 1.3] })],
  },
  // Hunting Howl: gold motes that rise in a ring around the pack.
  'ss.howl.motes': {
    school: 'physical',
    layers: [L({ sprite: SPRITE.mote, count: 20, ramp: EYE_WOLF, radius: 0.1, speed: [0.3, 0.8], up: 1.5, size: [0.05, 0.08], grow: 0.4, life: [0.9, 1.4], heat: [1, 0.5], emit: 1.2, occl: 0, gravity: 1.2, drag: 1, turb: 0.4, stagger: 0.25, tint: false })],
  },
  // Lunge: dust kicked up behind the rush.
  'ss.lunge.dust': {
    school: 'physical',
    layers: [L({ sprite: SPRITE.smoke, count: 3, ramp: DUST, radius: 0.15, speed: [0.5, 1.2], up: 0.1, size: [0.3, 0.45], grow: 2.2, life: [0.5, 0.8], heat: [0.2, 0], emit: 0.2, occl: 0.5, drag: 2.5, tint: false })],
  },
  // Worry: blood flicked off to one side with each shake.
  'ss.worry.flick': {
    school: 'physical',
    layers: [L({ sprite: SPRITE.drop, count: 10, ramp: BLOOD, speed: [3.5, 6], spread: 0.25, up: 0.3, size: [0.035, 0.07], grow: 0.6, life: [0.3, 0.55], heat: [0.3, 0], emit: 0.1, occl: 0.9, gravity: -14, drag: 0.9, stretch: 2, ground: true, bounce: 0, tint: false })],
  },
  // Call the Pack: a dark fog lying on the floor where the wolves come from.
  'ss.pack.fog': {
    school: 'physical',
    layers: [L({ sprite: SPRITE.smoke, count: 8, ramp: [0x3a3a40, 0x1a1a1e, 0x060608], disc: true, flat: true, radius: 0.6, speed: [0.2, 0.5], size: [0.8, 1.1], grow: 1.5, life: [1.4, 2.0], heat: [0.15, 0], emit: 0.05, occl: 0.7, drag: 1.5, turb: 0.2, stagger: 0.3, tint: false })],
  },
  // Blood Howl: a red mist drawn in from the air to the hero.
  'ss.bloodhowl.mist': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.smoke, count: 14, ramp: BLOOD, converge: true, radius: 2.2, speed: [3, 4.5], life: [0.45, 0.65], size: [0.35, 0.5], grow: 0.5, heat: [0.5, 0], emit: 0.4, occl: 0.45, fade: 1.2, tint: false }),
      L({ sprite: SPRITE.mote, count: 16, ramp: BLOOD, converge: true, radius: 2.6, speed: [4, 6], life: [0.4, 0.6], size: [0.05, 0.08], grow: 0.4, heat: [1, 0.5], emit: 1.1, occl: 0, tint: false }),
    ],
  },
  // Go for the Throat: blood thrown up in a fountain from the spring.
  'ss.throat.fountain': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.drop, count: 26, ramp: BLOOD, speed: [4, 8], spread: 0.3, up: 2, radius: 0.06, size: [0.045, 0.09], grow: 0.6, life: [0.6, 1.0], heat: [0.3, 0], emit: 0.1, occl: 0.95, gravity: -14, drag: 0.6, stretch: 1.8, ground: true, bounce: 0, tint: false }),
      L({ sprite: SPRITE.smoke, count: 5, ramp: DUST, disc: true, radius: 0.3, speed: [1.5, 3], up: -0.1, size: [0.3, 0.45], grow: 2.2, life: [0.5, 0.8], heat: [0.2, 0], emit: 0.2, occl: 0.5, drag: 2.5, tint: false }),
    ],
  },
  // Bloodmoon: a red moon hung over the head, and red motes falling from it.
  'ss.moon.disc': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.glow, count: 1, ramp: [0xff8070, 0xc01818, 0x400404], speed: [0, 0], radius: 0, size: [0.9, 0.95], grow: 1.05, life: [1.4, 1.5], heat: [1, 0.7], emit: 1.3, occl: 0, fade: 3, tint: false }),
      L({ sprite: SPRITE.ring, count: 1, ramp: [0xffa090, 0xa01010, 0x300202], speed: [0, 0], radius: 0, size: [1.0, 1.05], grow: 1.6, life: [0.8, 0.9], heat: [1, 0.4], emit: 1, occl: 0, fade: 2, tint: false }),
    ],
  },
  'ss.moon.rain': {
    school: 'physical',
    layers: [L({ sprite: SPRITE.mote, count: 14, ramp: BLOOD, radius: 0.6, speed: [0.2, 0.6], up: -1, size: [0.04, 0.07], grow: 0.5, life: [0.9, 1.4], heat: [1, 0.5], emit: 1, occl: 0, gravity: -2, drag: 1, turb: 0.5, tint: false })],
  },

  // --- Claw --------------------------------------------------------------------
  // Maul: dust and grit thrown off the swipe.
  'ss.maul.grit': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.smoke, count: 5, ramp: DUST, radius: 0.25, speed: [1.5, 3], spread: 0.6, up: 0.1, size: [0.35, 0.5], grow: 2.2, life: [0.5, 0.8], heat: [0.2, 0], emit: 0.2, occl: 0.5, drag: 2.6, tint: false }),
      L({ sprite: SPRITE.rock, count: 5, ramp: STONE, speed: [3, 6], spread: 0.6, up: 0.6, size: [0.04, 0.08], grow: 1, life: [0.4, 0.7], heat: [0.1, 0], emit: 0.05, occl: 1, gravity: -16, drag: 0.8, spin: 8, ground: true, tint: false }),
    ],
  },
  // Rattling Roar: the breath and spit blasted out of the bear's mouth.
  'ss.roar.blast': {
    school: 'physical',
    layers: [
      breath(16, { speed: [5, 9], spread: 0.35, size: [0.2, 0.32], grow: 3.6, life: [0.5, 0.8], drag: 3 }),
      L({ sprite: SPRITE.drop, count: 10, ramp: [0xe8e0d0, 0xa09888, 0x40382e], speed: [5, 8], spread: 0.3, size: [0.02, 0.04], grow: 0.6, life: [0.3, 0.5], heat: [0.3, 0], emit: 0.1, occl: 0.6, gravity: -10, drag: 1, stretch: 1.4, tint: false }),
    ],
  },
  'ss.roar.dust': {
    school: 'physical',
    layers: [L({ sprite: SPRITE.smoke, count: 20, ramp: DUST, disc: true, radius: 0.8, speed: [4, 7], up: -0.1, size: [0.4, 0.6], grow: 2.6, life: [0.7, 1.1], heat: [0.2, 0], emit: 0.2, occl: 0.55, drag: 2.4, turb: 0.3, tint: false })],
  },
  // Hammerfall: stone thrown up out of the two craters.
  'ss.hammer.chunks': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.rock, count: 14, ramp: STONE, radius: 0.4, speed: [3, 7], spread: 0.7, up: 1.6, size: [0.07, 0.14], grow: 1, life: [0.6, 1.0], heat: [0.1, 0], emit: 0.05, occl: 1, gravity: -18, drag: 0.6, spin: 9, ground: true, tint: false }),
      L({ sprite: SPRITE.smoke, count: 12, ramp: DUST, disc: true, radius: 0.6, speed: [2.5, 4.5], up: 0.2, size: [0.5, 0.7], grow: 2.6, life: [0.8, 1.3], heat: [0.2, 0], emit: 0.2, occl: 0.6, drag: 2.2, turb: 0.3, tint: false }),
    ],
  },
  // Bristle: spines standing out of the pelt, all round.
  'ss.bristle.spines': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.shard, count: 26, ramp: BEAR_FUR, radius: 0.45, speed: [0.6, 1.4], spread: 1, size: [0.06, 0.1], grow: 1, life: [0.35, 0.55], heat: [0.2, 0], emit: 0.05, occl: 1, drag: 6, stretch: 2.2, fade: 2.4, tint: false }),
      fur(BEAR_FUR, 16, [1.5, 3], 0.4, { radius: 0.5 }),
    ],
  },
  // Overrun: the dust wake.
  'ss.overrun.wake': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.smoke, count: 4, ramp: DUST, radius: 0.4, speed: [0.8, 2], up: 0.2, size: [0.45, 0.65], grow: 2.4, life: [0.7, 1.1], heat: [0.2, 0], emit: 0.2, occl: 0.6, drag: 2.2, turb: 0.3, tint: false }),
      L({ sprite: SPRITE.rock, count: 2, ramp: STONE, radius: 0.3, speed: [2, 4], up: 1, size: [0.04, 0.08], grow: 1, life: [0.4, 0.7], heat: [0.1, 0], emit: 0.05, occl: 1, gravity: -16, drag: 0.8, spin: 8, ground: true, tint: false }),
    ],
  },
  // Reaping Swipe: a ring of dust thrown off the turn.
  'ss.reap.ring': {
    school: 'physical',
    layers: [L({ sprite: SPRITE.smoke, count: 3, ramp: DUST, radius: 0.1, speed: [1, 2.5], spread: 0.4, up: 0, size: [0.4, 0.55], grow: 2.2, life: [0.6, 0.9], heat: [0.2, 0], emit: 0.2, occl: 0.55, drag: 2.4, tint: false })],
  },
  // Bear Hug: grit squeezed inward, then bone cracking out.
  'ss.hug.crush': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.smoke, count: 8, ramp: DUST, converge: true, radius: 0.9, speed: [2.5, 3.5], life: [0.25, 0.35], size: [0.25, 0.35], grow: 0.6, heat: [0.2, 0], emit: 0.2, occl: 0.5, tint: false }),
      L({ sprite: SPRITE.bone, count: 5, ramp: [0xf0e8d8, 0xc0b49a, 0x5a5040], speed: [2, 4], spread: 1, up: 0.6, size: [0.05, 0.09], grow: 1, life: [0.4, 0.7], heat: [0.1, 0], emit: 0.1, occl: 1, gravity: -14, drag: 1, spin: 10, ground: true, tint: false }),
    ],
  },
  // Ursa Major: one star of the great bear, and the stone it calls up.
  'ss.ursa.star': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.flare, count: 1, ramp: [0xffffff, 0xfff0c0, 0x8a7040], speed: [0, 0], radius: 0, size: [0.3, 0.34], grow: 0.8, life: [1.3, 1.5], heat: [1, 0.7], emit: 1.6, occl: 0, fade: 3, spin: 0.6, tint: false }),
      L({ sprite: SPRITE.mote, count: 3, ramp: [0xffffff, 0xfff0c0, 0x8a7040], radius: 0.05, speed: [0.05, 0.2], size: [0.03, 0.05], grow: 0.4, life: [0.8, 1.2], heat: [1, 0.5], emit: 1.2, occl: 0, tint: false }),
    ],
  },
  'ss.ursa.rise': {
    school: 'physical',
    layers: [
      L({ sprite: SPRITE.rock, count: 14, ramp: STONE, disc: true, radius: 1.4, speed: [0.5, 1.5], up: 3, size: [0.06, 0.12], grow: 1, life: [0.9, 1.4], heat: [0.1, 0], emit: 0.05, occl: 1, gravity: -6, drag: 1.4, spin: 3, ground: true, tint: false }),
      L({ sprite: SPRITE.smoke, count: 14, ramp: DUST, disc: true, radius: 0.8, speed: [3, 5], up: -0.1, size: [0.5, 0.7], grow: 2.6, life: [0.9, 1.4], heat: [0.2, 0], emit: 0.2, occl: 0.55, drag: 2.2, tint: false }),
    ],
  },
};

registerEmitters(EM);

/** Every Shapeshifter emitter id, for tools. */
export const SHIFTER_EMITTERS: readonly string[] = Object.keys(EM);
