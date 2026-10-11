/**
 * SLAY — elementals: ember, lightning and void wisps, frost shards, fire and
 * obsidian walkers, the magma hulk, the ice revenant and the glacier titan,
 * the storm djinn, the living gale and the tide caller.
 *
 * Each is one element given a body, so each reads by what it is made of:
 * charcoal cracked over fire, black glass with a molten seam, blue ice over
 * frozen stone, a storm with a man in it, a wave with a woman in it. The
 * light comes from inside (cracks, a heart, a burning crown), never painted
 * across the whole skin.
 */
import * as THREE from 'three';
import { bipedRig, floaterRig, flyerRig, specterRig, swarmRig, type BipedShape } from './Rig';
import type { CreatureLook } from './Creature';
import type { LookCtx, LookFactory } from './Looks';
import type { CMat, PaintSpec, RGB, Sculpt } from './Sculpt';
import { bladeGeo, boxGeo, ringGeo, spikeGeo, tubeGeo } from './Sculpt';
import { V, claws, fleshArms, fleshLegs, lerpV, quatAlong, seq, trunk } from './Kit';
import { demonWings } from './LookDemon';
import type { MotionStyle } from './Motion';
import type { Surface } from './Materials';

const FIRE: RGB = [1.25, 0.55, 0.18];
const FROST: RGB = [0.7, 0.95, 1.3];
const SPARK: RGB = [1.3, 1.2, 0.6];
const VOID: RGB = [0.85, 0.35, 1.3];
const GLASS: RGB = [0.12, 0.1, 0.12];
const ICE: RGB = [0.8, 0.92, 1.05];

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

/** A jagged bolt from a to b: a thin glowing tube that zigzags. */
function bolt(s: Sculpt, bone: string, a: THREE.Vector3, b: THREE.Vector3, r: number, seed: number, col: RGB = SPARK, kinks = 5): void {
  const rnd = seq(seed);
  const d = b.clone().sub(a);
  const len = d.length();
  const pts: THREE.Vector3[] = [a.clone()];
  for (let i = 1; i < kinks; i++) {
    const p = lerpV(a, b, i / kinks);
    p.add(V((rnd() - 0.5) * len * 0.25, (rnd() - 0.5) * len * 0.25, (rnd() - 0.5) * len * 0.25));
    pts.push(p);
  }
  pts.push(b.clone());
  s.hard(bone, tubeGeo(pts, () => r, 4, true), 'skin', col, 1);
}

/** A cluster of crystals growing out of a point, mostly along `up`. */
function crystals(s: Sculpt, bone: string, c: THREE.Vector3, n: number, len: number, r: number, seed: number, up: THREE.Vector3 = V(0, 1, 0), spread = 0.8, mat: CMat = 'alt', col?: RGB, glow?: number): void {
  const rnd = seq(seed);
  const u = up.clone().normalize();
  for (let i = 0; i < n; i++) {
    const d = u.clone().add(V((rnd() - 0.5) * 2 * spread, (rnd() - 0.5) * 2 * spread, (rnd() - 0.5) * 2 * spread)).normalize();
    const l = len * (0.55 + rnd() * 0.7);
    const b = c.clone().addScaledVector(d, -l * 0.15);
    s.hard(bone, spikeGeo(b, b.clone().addScaledVector(d, l), r * (0.7 + rnd() * 0.6), 5, undefined, 1), mat, col, glow);
  }
}

/** A faceted block (black glass, glacier ice) turned by a seeded twist. */
function facet(s: Sculpt, bone: string, c: THREE.Vector3, half: THREE.Vector3, seed: number, mat: CMat = 'skin', k = 0.004): void {
  const rnd = seq(seed);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.5, rnd() * Math.PI, (rnd() - 0.5) * 0.5));
  s.box(bone, c, half, { mat, k, round: Math.min(half.x, half.y, half.z) * 0.15, q });
}

/** A faceted limb: a long prism along a to b. */
function prism(s: Sculpt, bone: string, a: THREE.Vector3, b: THREE.Vector3, w: number, d: number, mat: CMat = 'skin', k = 0.004): void {
  const dir = b.clone().sub(a);
  const q = quatAlong(dir).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI / 4));
  s.box(bone, lerpV(a, b, 0.5), V(w, dir.length() * 0.55, d), { mat, k, round: Math.min(w, d) * 0.2, q });
}

/** Drips of molten rock hanging from a point. */
function drips(s: Sculpt, bone: string, c: THREE.Vector3, n: number, len: number, r: number, seed: number, col: RGB = FIRE): void {
  const rnd = seq(seed);
  for (let i = 0; i < n; i++) {
    const b = c.clone().add(V((rnd() - 0.5) * r * 6, 0, (rnd() - 0.5) * r * 6));
    s.hard(bone, spikeGeo(b, b.clone().add(V(0, -len * (0.5 + rnd()), 0)), r, 4, undefined, 2), 'skin', col, 0.9);
  }
}

/**
 * Fire: many thin licking tongues from a disc, of mixed heights, curling back
 * and wavering, the tall ones paler. Reads as flame where one cone of spikes
 * reads as a fan.
 */
function fire(s: Sculpt, bone: string, c: THREE.Vector3, n: number, len: number, spread: number, seed: number, col: RGB = FIRE, back = 0.35): void {
  const rnd = seq(seed);
  const pale: RGB = [Math.min(1.6, col[0] * 1.15 + 0.2), Math.min(1.6, col[1] * 1.3 + 0.25), Math.min(1.6, col[2] * 1.2 + 0.15)];
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996 + rnd();
    const rr = spread * Math.sqrt((i + 0.5) / n);
    const b = c.clone().add(V(Math.sin(a) * rr, 0, Math.cos(a) * rr));
    const l = len * (0.35 + rnd() * 0.65) * (1 - 0.4 * (rr / Math.max(1e-6, spread)));
    const ph = rnd() * 6;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      pts.push(b.clone().add(V(Math.sin(a) * rr * 0.4 * t + Math.sin(ph + t * 5) * l * 0.08 * t, l * t, -back * l * t * t + Math.cos(a) * rr * 0.3 * t)));
    }
    const w = Math.max(spread * 0.25, len * 0.07) * (0.7 + rnd() * 0.5);
    s.hard(bone, tubeGeo(pts, (t) => w * (1 - t) * (0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, t * 1.6 + 0.2))), 5, true), 'skin', l > len * 0.7 ? pale : col, 0.85);
  }
}

// ---------------------------------------------------------------------------
// Upright elementals
// ---------------------------------------------------------------------------

interface WalkOpt {
  height: number;
  kind?: 'biped' | 'brute' | 'giant';
  rig?: Partial<BipedShape>;
  skin: { surface: Surface; tint: number };
  alt?: { surface: Surface; tint: number };
  metal?: { surface: Surface; tint: number };
  sculpt: (s: Sculpt, H: number) => void;
  paint?: Partial<Record<CMat, PaintSpec>>;
  soft?: Partial<Record<CMat, number>>;
  lumps?: { amp: number; scale: number };
  glowIntensity?: number;
  style: Partial<MotionStyle>;
  size?: number;
}

function walkLook(c: LookCtx, o: WalkOpt): CreatureLook {
  const H = o.height;
  const kind = o.kind ?? 'biped';
  const glow = c.visual.glow ?? 0xff7722;
  return {
    key: `id:${c.id}`,
    size: o.size,
    tier: kind === 'giant' ? 'big' : 'normal',
    rig: () => bipedRig(kind, { height: H, hip: 0.5, hunch: 0.1, ...o.rig }),
    sculpt: (s) => {
      s.soft.skin = o.soft?.skin ?? 0.014;
      s.soft.alt = o.soft?.alt ?? 0.02;
      s.k = 0.014;
      o.sculpt(s, H);
      s.paint.skin = o.paint?.skin ?? { grime: 0.45, ao: 0.85 };
      s.paint.alt = o.paint?.alt ?? { grime: 0.2, ao: 0.7 };
      s.paint.metal = o.paint?.metal ?? { grime: 0.3, ao: 0.7 };
      if (o.lumps) s.lumps.skin = o.lumps;
    },
    mats: {
      skin: { surface: o.skin.surface, tint: o.skin.tint, glow, glowIntensity: o.glowIntensity },
      alt: { surface: o.alt?.surface ?? 'crystal', tint: o.alt?.tint ?? 0x9ad8ff, glow, glowIntensity: o.glowIntensity },
      metal: { surface: o.metal?.surface ?? 'gold', tint: o.metal?.tint ?? 0xc8a050, glow },
    },
    style: {
      heavy: kind === 'giant' ? 0.85 : 0.3,
      spawn: 'rise',
      death: kind === 'giant' ? 'crash' : 'collapse',
      idle: 'breathe',
      gait: kind === 'giant' ? 'lumber' : 'stalk',
      armed: 'none',
      ...o.style,
    },
  };
}

/** Charcoal cracked over fire, a crown of flame, burning blades for hands. */
function fireWalker(s: Sculpt, H: number): void {
  trunk(s, { chest: [0.1, 0.075, 0.095], pelvis: [0.07, 0.06, 0.055], shoulders: 0.04 });
  fleshArms(s, { r: 0.03, swell: 0.012 });
  fleshLegs(s, { r: 0.04, swell: 0.014 });
  // The waist burns thin: a glowing seam between chest and hips.
  s.boil('chest', s.j('chest').add(V(0, 0.0, 0.085 * H)), 0.026 * H, 1, [1.4, 0.75, 0.25]);
  // Head: a charred skull shape with slits for eyes, flame for hair.
  const h = s.j('head').add(V(0, 0.04 * H, 0.01 * H));
  s.ball('head', h, V(0.05 * H, 0.06 * H, 0.055 * H), { k: 0.012 * H });
  s.ball('head', h.clone().add(V(0, -0.03 * H, 0.025 * H)), V(0.035 * H, 0.025 * H, 0.035 * H), { k: 0.01 * H });
  s.pair((_side, x) => s.hard('head', boxGeo(h.clone().add(V(x * 0.02 * H, 0.005 * H, 0.053 * H)), V(0.024 * H, 0.006 * H, 0.006 * H), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, x * 0.25))), 'skin', [1.5, 0.9, 0.4], 1));
  fire(s, 'head', h.clone().add(V(0, 0.03 * H, -0.01 * H)), 14, 0.2 * H, 0.045 * H, 41);
  // Flames trail off the shoulders and the back.
  s.pair((side, x) => fire(s, `arm${side}`, s.j(`arm${side}`).add(V(x * 0.01 * H, 0.03 * H, -0.01 * H)), 6, 0.1 * H, 0.025 * H, 43 + x));
  fire(s, 'chest', s.j('chest').add(V(0, 0.04 * H, -0.075 * H)), 9, 0.13 * H, 0.06 * H, 47, FIRE, 0.6);
  // Burning blades grow out of the fists.
  s.pair((side, x) => {
    const w = s.j(`hand${side}`);
    const t = s.j(`hand${side}Tip`);
    const dir = t.clone().sub(w).normalize();
    const a = lerpV(w, t, 0.5);
    s.hard(`hand${side}`, bladeGeo(a, a.clone().addScaledVector(dir, 0.22 * H).add(V(0, 0, 0.03 * H)), 0.03 * H, 0.006 * H, V(x, 0, 0.4).normalize(), 0.4), 'skin', [1.4, 0.7, 0.25], 1);
  });
  // The legs burn down to flame at the shins.
  s.pair((side) => {
    const k = s.j(`shin${side}`);
    const f = s.j(`foot${side}`);
    fire(s, `shin${side}`, lerpV(k, f, 0.55), 6, 0.09 * H, 0.03 * H, 51);
  });
}

/** Black glass in slabs and shards, a molten seam down the middle. */
function glassWalker(s: Sculpt, H: number): void {
  const ch = s.j('chest');
  const hp = s.j('hips');
  facet(s, 'chest', ch.clone().add(V(0, 0.01 * H, 0)), V(0.1 * H, 0.085 * H, 0.07 * H), 3);
  facet(s, 'chest', ch.clone().add(V(0, -0.06 * H, 0.01 * H)), V(0.075 * H, 0.06 * H, 0.06 * H), 5);
  facet(s, 'spine', s.j('spine'), V(0.055 * H, 0.05 * H, 0.045 * H), 7);
  facet(s, 'hips', hp.clone().add(V(0, 0.01 * H, 0)), V(0.08 * H, 0.05 * H, 0.055 * H), 9);
  s.pair((side, x) => {
    const a = s.j(`arm${side}`);
    const e = s.j(`fore${side}`);
    const w = s.j(`hand${side}`);
    const t = s.j(`hand${side}Tip`);
    facet(s, `arm${side}`, a.clone().add(V(x * 0.01 * H, 0.015 * H, 0)), V(0.05 * H, 0.04 * H, 0.045 * H), 11 + x);
    prism(s, `arm${side}`, lerpV(a, e, 0.1), lerpV(a, e, 0.95), 0.026 * H, 0.024 * H);
    prism(s, `fore${side}`, lerpV(e, w, 0.05), lerpV(e, w, 0.95), 0.024 * H, 0.022 * H);
    prism(s, `hand${side}`, w, lerpV(w, t, 0.8), 0.02 * H, 0.012 * H);
    // A glass blade along each forearm, past the fist.
    const dir = w.clone().sub(e).normalize();
    s.hard(`fore${side}`, bladeGeo(lerpV(e, w, 0.3).add(V(x * 0.02 * H, 0, 0)), w.clone().addScaledVector(dir, 0.2 * H).add(V(x * 0.02 * H, 0, 0.02 * H)), 0.035 * H, 0.006 * H, V(x, 0, 0.3).normalize(), 0.5), 'skin', GLASS);
    const l = s.j(`leg${side}`);
    const k = s.j(`shin${side}`);
    const f = s.j(`foot${side}`);
    prism(s, `leg${side}`, lerpV(l, k, 0.05), lerpV(l, k, 0.95), 0.036 * H, 0.034 * H);
    prism(s, `shin${side}`, lerpV(k, f, 0.05), lerpV(k, f, 0.95), 0.03 * H, 0.028 * H);
    s.box(`foot${side}`, lerpV(f, s.j(`toe${side}`), 0.5).add(V(0, -0.01 * H, 0)), V(0.028 * H, 0.016 * H, 0.06 * H), { k: 0.004 * H, round: 0.004 * H });
    // Glowing seams at the joints.
    s.boil(`fore${side}`, e, 0.018 * H, 0.9, FIRE);
    s.boil(`shin${side}`, k, 0.02 * H, 0.9, FIRE);
    // Shards off the shoulders.
    crystals(s, `arm${side}`, a.clone().add(V(x * 0.02 * H, 0.03 * H, -0.01 * H)), 4, 0.14 * H, 0.02 * H, 13 + x, V(x * 0.6, 1, -0.3), 0.35, 'skin', GLASS);
  });
  // The molten seam down the chest and a heart behind the glass.
  for (let i = 0; i < 4; i++) s.boil('chest', ch.clone().add(V((i % 2 ? 1 : -1) * 0.008 * H, 0.05 * H - i * 0.035 * H, 0.075 * H - i * 0.004 * H)), 0.014 * H, 1, FIRE);
  s.boil('chest', ch.clone().add(V(0, -0.01 * H, 0.068 * H)), 0.032 * H, 1, [1.4, 0.6, 0.2]);
  // A ridge of shards down the back.
  for (let i = 0; i < 5; i++) {
    const p = ch.clone().add(V(0, 0.06 * H - i * 0.04 * H, -0.07 * H));
    s.hard(i < 3 ? 'chest' : 'spine', spikeGeo(p, p.clone().add(V(0, 0.06 * H, -(0.08 + (2 - Math.abs(i - 2)) * 0.03) * H)), 0.02 * H, 4, undefined, 1), 'skin', GLASS);
  }
  // Head: a sharp wedge with one burning slit.
  const h = s.j('head').add(V(0, 0.035 * H, 0.01 * H));
  s.box('head', h, V(0.04 * H, 0.06 * H, 0.045 * H), { k: 0.004 * H, round: 0.004 * H, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, Math.PI / 4, 0)) });
  s.hard('head', spikeGeo(h.clone().add(V(0, 0.04 * H, -0.01 * H)), h.clone().add(V(0, 0.13 * H, -0.06 * H)), 0.025 * H, 4, undefined, 1), 'skin', GLASS);
  s.hard('head', boxGeo(h.clone().add(V(0, 0.005 * H, 0.058 * H)), V(0.05 * H, 0.007 * H, 0.006 * H)), 'skin', [1.5, 0.75, 0.3], 1);
}

/** A hunched mound of cooling rock, molten under the crust, a furnace mouth in the chest. */
function magmaHulk(s: Sculpt, H: number): void {
  trunk(s, { chest: [0.17, 0.12, 0.13], pelvis: [0.11, 0.08, 0.075], shoulders: 0.08, hump: 0.09 });
  fleshArms(s, { r: 0.055, swell: 0.025 });
  fleshLegs(s, { r: 0.06, swell: 0.022, footW: 0.07 });
  const ch = s.j('chest');
  // Boulders heaped on the back and shoulders.
  const r = seq(61);
  for (let i = 0; i < 7; i++) {
    const p = ch.clone().add(V((r() - 0.5) * 0.26 * H, (0.04 + r() * 0.1) * H, -(0.06 + r() * 0.06) * H));
    s.ball('chest', p, (0.045 + r() * 0.035) * H, { k: 0.02 * H });
  }
  s.pair((side, x) => {
    s.ball(`arm${side}`, s.j(`arm${side}`).add(V(x * 0.02 * H, 0.05 * H, -0.01 * H)), V(0.075 * H, 0.06 * H, 0.07 * H), { k: 0.02 * H });
    // Fists like boulders, knuckles cracked with fire.
    const w = s.j(`hand${side}`);
    const t = s.j(`hand${side}Tip`);
    s.ball(`hand${side}`, lerpV(w, t, 0.45), V(0.06 * H, 0.065 * H, 0.06 * H), { k: 0.02 * H });
    drips(s, `fore${side}`, lerpV(s.j(`fore${side}`), w, 0.5).add(V(0, -0.03 * H, 0)), 2, 0.07 * H, 0.012 * H, 63 + x);
  });
  // The mouth: a furnace slot in the chest with a burning throat.
  const m = ch.clone().add(V(0, -0.01 * H, 0.12 * H));
  s.ball('chest', m, V(0.07 * H, 0.03 * H, 0.04 * H), { sub: true, k: 0.01 * H });
  s.boil('chest', m.clone().add(V(0, 0, -0.025 * H)), 0.045 * H, 1, [1.5, 0.7, 0.2]);
  for (let i = 0; i < 6; i++) {
    const x = (i / 5 - 0.5) * 0.11 * H;
    s.hard('chest', spikeGeo(m.clone().add(V(x, 0.03 * H, 0.008 * H)), m.clone().add(V(x, 0.005 * H, 0.012 * H)), 0.007 * H, 4, undefined, 1), 'skin', [0.2, 0.15, 0.12]);
    s.hard('spine', spikeGeo(m.clone().add(V(x, -0.03 * H, 0.008 * H)), m.clone().add(V(x, -0.008 * H, 0.012 * H)), 0.007 * H, 4, undefined, 1), 'skin', [0.2, 0.15, 0.12]);
  }
  drips(s, 'spine', m.clone().add(V(0, -0.035 * H, 0.005 * H)), 3, 0.06 * H, 0.01 * H, 67);
  // A small head sunk between the shoulders, two coals for eyes.
  const h = s.j('head').add(V(0, 0.02 * H, 0.01 * H));
  s.ball('head', h, V(0.05 * H, 0.04 * H, 0.05 * H), { k: 0.02 * H });
  s.pair((_side, x) => s.eye('head', h.clone().add(V(x * 0.022 * H, 0.005 * H, 0.045 * H)), 0.01 * H, 1.8));
  // Smoke vents on the hump.
  for (let i = 0; i < 3; i++) s.boil('chest', ch.clone().add(V((i - 1) * 0.07 * H, 0.13 * H, -0.1 * H)), 0.016 * H, 1, FIRE);
}

/** A dead knight frozen into a giant: ice plate, an ice blade for a right arm. */
function iceRevenant(s: Sculpt, H: number): void {
  trunk(s, { chest: [0.13, 0.09, 0.11], pelvis: [0.085, 0.065, 0.065], shoulders: 0.05, ribs: 0.6 });
  fleshArms(s, { r: 0.036, swell: 0.012, claws: 0.05, clawCol: ICE });
  fleshLegs(s, { r: 0.045, swell: 0.014 });
  const ch = s.j('chest');
  // Ice plate over the chest and belly.
  facet(s, 'chest', ch.clone().add(V(0, 0.02 * H, 0.03 * H)), V(0.12 * H, 0.08 * H, 0.07 * H), 21, 'alt', 0.006 * H);
  facet(s, 'spine', s.j('spine').add(V(0, 0, 0.03 * H)), V(0.08 * H, 0.05 * H, 0.05 * H), 23, 'alt', 0.006 * H);
  s.pair((side, x) => {
    // Pauldrons of ice, icicles bristling up.
    const a = s.j(`arm${side}`);
    facet(s, `arm${side}`, a.clone().add(V(x * 0.02 * H, 0.025 * H, 0)), V(0.065 * H, 0.04 * H, 0.06 * H), 25 + x, 'alt', 0.006 * H);
    crystals(s, `arm${side}`, a.clone().add(V(x * 0.03 * H, 0.05 * H, -0.01 * H)), 5, 0.15 * H, 0.022 * H, 27 + x, V(x * 0.4, 1, -0.2), 0.35);
    // Greaves.
    const k = s.j(`shin${side}`);
    const f = s.j(`foot${side}`);
    prism(s, `shin${side}`, lerpV(k, f, 0.0), lerpV(k, f, 0.85), 0.04 * H, 0.04 * H, 'alt', 0.006 * H);
  });
  // The right arm ends in a great blade of ice.
  const w = s.j('handR');
  const e = s.j('foreR');
  const dir = w.clone().sub(e).normalize();
  s.hard('handR', bladeGeo(w.clone().addScaledVector(dir, 0.02 * H), w.clone().addScaledVector(dir, 0.55 * H).add(V(0, 0, 0.05 * H)), 0.07 * H, 0.012 * H, V(-1, 0, 0.3).normalize(), 0.3), 'alt', ICE);
  s.ball('foreR', lerpV(e, w, 0.7), V(0.05 * H, 0.06 * H, 0.05 * H), { mat: 'alt', k: 0.008 * H });
  // A frozen face behind a crown of icicles, a beard of ice.
  const h = s.j('head').add(V(0, 0.035 * H, 0.01 * H));
  s.ball('head', h, V(0.048 * H, 0.06 * H, 0.055 * H), { k: 0.012 * H });
  s.ball('head', h.clone().add(V(0, 0.01 * H, -0.005 * H)), V(0.058 * H, 0.055 * H, 0.062 * H), { mat: 'alt', k: 0.006 * H });
  s.ball('head', h.clone().add(V(0, -0.005 * H, 0.03 * H)), V(0.045 * H, 0.04 * H, 0.04 * H), { mat: 'alt', sub: true, k: 0.006 * H });
  s.pair((_side, x) => s.eye('head', h.clone().add(V(x * 0.02 * H, 0.008 * H, 0.05 * H)), 0.009 * H, 1.8));
  crystals(s, 'head', h.clone().add(V(0, 0.055 * H, -0.01 * H)), 7, 0.11 * H, 0.016 * H, 31, V(0, 1, -0.2), 0.4);
  for (let i = 0; i < 5; i++) {
    const x = (i / 4 - 0.5) * 0.06 * H;
    const p = h.clone().add(V(x, -0.04 * H, 0.04 * H));
    s.hard('head', spikeGeo(p, p.clone().add(V(x * 0.3, -(0.07 + (2 - Math.abs(i - 2)) * 0.02) * H, 0.005 * H)), 0.01 * H, 4, undefined, 1), 'alt', ICE);
  }
  s.boil('chest', ch.clone().add(V(0, 0.01 * H, 0.1 * H)), 0.028 * H, 0.9, FROST);
}

/** A walking glacier: a mountain of ice on its back, frozen stone beneath, a blue heart. */
function glacierTitan(s: Sculpt, H: number): void {
  trunk(s, { chest: [0.17, 0.12, 0.13], pelvis: [0.11, 0.08, 0.08], shoulders: 0.075, hump: 0.07 });
  fleshArms(s, { r: 0.052, swell: 0.022 });
  fleshLegs(s, { r: 0.062, swell: 0.02, footW: 0.075 });
  const ch = s.j('chest');
  // The glacier: slabs of ice piled across the shoulders and back.
  const r = seq(71);
  for (let i = 0; i < 6; i++) {
    const p = ch.clone().add(V((r() - 0.5) * 0.28 * H, (0.05 + r() * 0.08) * H, -(0.05 + r() * 0.08) * H));
    s.ball('chest', p, V((0.05 + r() * 0.04) * H, (0.035 + r() * 0.03) * H, (0.05 + r() * 0.03) * H), { mat: 'alt', k: 0.015 * H });
  }
  crystals(s, 'chest', ch.clone().add(V(0, 0.12 * H, -0.1 * H)), 14, 0.26 * H, 0.04 * H, 79, V(0, 1, -0.5), 0.55);
  s.pair((side, x) => {
    const a = s.j(`arm${side}`);
    s.ball(`arm${side}`, a.clone().add(V(x * 0.03 * H, 0.04 * H, -0.01 * H)), V(0.075 * H, 0.055 * H, 0.07 * H), { mat: 'alt', k: 0.01 * H });
    crystals(s, `arm${side}`, a.clone().add(V(x * 0.04 * H, 0.06 * H, -0.01 * H)), 9, 0.17 * H, 0.032 * H, 83 + x, V(x * 0.6, 1, -0.2), 0.5);
    // Fists sheathed in ice.
    const w = s.j(`hand${side}`);
    const t = s.j(`hand${side}Tip`);
    facet(s, `hand${side}`, lerpV(w, t, 0.45), V(0.055 * H, 0.06 * H, 0.055 * H), 85 + x, 'alt', 0.008 * H);
    crystals(s, `fore${side}`, lerpV(s.j(`fore${side}`), w, 0.5).add(V(x * 0.03 * H, 0, -0.02 * H)), 3, 0.09 * H, 0.018 * H, 87 + x, V(x, 0.3, -0.4), 0.3);
  });
  // A crack in the chest shows the blue heart.
  const hc = ch.clone().add(V(0.02 * H, 0, 0.12 * H));
  s.ball('chest', hc, V(0.035 * H, 0.06 * H, 0.03 * H), { sub: true, k: 0.008 * H });
  s.boil('chest', hc.clone().add(V(0, 0, -0.02 * H)), 0.04 * H, 1, FROST);
  // A small head low between the shoulders under a brow of ice.
  const h = s.j('head').add(V(0, 0.02 * H, 0.02 * H));
  s.ball('head', h, V(0.048 * H, 0.042 * H, 0.05 * H), { k: 0.02 * H });
  facet(s, 'head', h.clone().add(V(0, 0.025 * H, 0.015 * H)), V(0.06 * H, 0.02 * H, 0.04 * H), 89, 'alt', 0.004 * H);
  s.pair((_side, x) => s.eye('head', h.clone().add(V(x * 0.02 * H, 0.002 * H, 0.048 * H)), 0.009 * H, 1.7));
  for (let i = 0; i < 4; i++) {
    const p = h.clone().add(V((i / 3 - 0.5) * 0.06 * H, -0.03 * H, 0.04 * H));
    s.hard('head', spikeGeo(p, p.clone().add(V(0, -0.06 * H, 0.01 * H)), 0.012 * H, 4, undefined, 1), 'alt', ICE);
  }
}

// ---------------------------------------------------------------------------
// Floating elementals
// ---------------------------------------------------------------------------

interface WispOpt {
  hover: number;
  radius: number;
  orbs: number;
  tendrils?: number;
  sculpt: (s: Sculpt, R: number) => void;
  skin: { surface: Surface; tint: number };
  alt?: { surface: Surface; tint: number };
  paint?: Partial<Record<CMat, PaintSpec>>;
  glowIntensity?: number;
  style: Partial<MotionStyle>;
  size?: number;
}

function wispLook(c: LookCtx, o: WispOpt): CreatureLook {
  const glow = c.visual.glow ?? 0xffaa44;
  return {
    key: `id:${c.id}`,
    size: o.size,
    tier: 'normal',
    rig: () => floaterRig({ hover: o.hover, radius: o.radius, orbs: o.orbs, tendrils: o.tendrils ?? 0, segments: 3 }),
    sculpt: (s) => {
      s.soft.skin = 0.01;
      s.soft.alt = 0.03;
      s.k = 0.012;
      o.sculpt(s, o.radius);
      s.paint.skin = o.paint?.skin ?? { grime: 0.2, ao: 0.7 };
      s.paint.alt = o.paint?.alt ?? { grime: 0.1, ao: 0.6 };
    },
    mats: {
      skin: { surface: o.skin.surface, tint: o.skin.tint, glow, glowIntensity: o.glowIntensity },
      alt: { surface: o.alt?.surface ?? 'crystal', tint: o.alt?.tint ?? 0x9ad8ff, glow, glowIntensity: o.glowIntensity },
      metal: { surface: 'steel', tint: 0x8a8e96, glow },
    },
    style: { heavy: 0.05, attacks: ['lunge'], spawn: 'form', death: 'collapse', idle: 'hover', gait: 'glide', armed: 'none', ...o.style },
  };
}

// ---------------------------------------------------------------------------

const ELEMENTAL: Record<string, LookFactory> = {
  ember_wisp: (c) =>
    wispLook(c, {
      hover: 1.0,
      radius: 0.2,
      orbs: 3,
      skin: { surface: 'basalt', tint: 0x2a2220 },
      sculpt: (s, R) => {
        // A lump of coal, split and burning, flame streaming up.
        const c0 = s.j('core');
        s.ball('core', c0, V(R * 0.75, R * 0.68, R * 0.72), { k: R * 0.1 });
        s.boil('core', c0.clone().add(V(0, 0, R * 0.25)), R * 0.62, 1, [1.4, 0.7, 0.2]);
        const r = seq(91);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          s.ball('core', c0.clone().add(V(Math.sin(a) * R * 0.55, (r() - 0.4) * R * 0.5, Math.cos(a) * R * 0.45)), R * (0.28 + r() * 0.12), { k: R * 0.06 });
        }
        fire(s, 'crown', s.j('crown').add(V(0, -R * 0.5, 0)), 16, R * 1.5, R * 0.55, 93, FIRE, 0.5);
        s.pair((_side, x) => s.eye('eye', s.j('eye').add(V(x * R * 0.25, R * 0.1, R * 0.15)), R * 0.1, 1.8));
        for (let i = 0; i < 3; i++) {
          const p = s.j(`orb${i}`);
          s.boil(`orb${i}`, p, R * 0.13, 1, FIRE);
          fire(s, `orb${i}`, p, 3, R * 0.4, R * 0.08, 95 + i);
        }
      },
      paint: { skin: { grime: 0.2, ao: 0.8, veins: { scale: 14, cut: 0.94, glow: 0.6, col: FIRE } } },
      style: { attacks: ['lunge'], idle: 'jitter', spawn: 'form' },
    }),
  fire_elemental: (c) =>
    walkLook(c, {
      height: 1.85,
      rig: { shoulders: 0.13, hips: 0.06, arms: 1.08, hunch: 0.15 },
      skin: { surface: 'basalt', tint: 0x2a1c18 },
      sculpt: fireWalker,
      paint: { skin: { grime: 0.3, ao: 0.85, veins: { scale: 10, cut: 0.95, glow: 0.6, col: FIRE } } },
      lumps: { amp: 0.006, scale: 9 },
      style: { heavy: 0.2, attacks: ['claw', 'thrust', 'swing'], idle: 'jitter', gait: 'stalk', spawn: 'rise', death: 'collapse' },
    }),
  magma_hulk: (c) =>
    walkLook(c, {
      height: 1.8,
      kind: 'giant',
      rig: { hip: 0.4, shoulders: 0.22, hips: 0.09, arms: 1.35, hunch: 0.55, head: 0.6, armOut: 0.45 },
      skin: { surface: 'basalt', tint: 0x3a302c },
      sculpt: magmaHulk,
      paint: { skin: { grime: 0.4, ao: 0.9, veins: { scale: 9, cut: 0.96, glow: 0.5, col: FIRE }, top: { amount: 0.15, col: [1.2, 1.15, 1.1] } } },
      lumps: { amp: 0.016, scale: 6 },
      style: { heavy: 0.9, attacks: ['slam', 'stomp', 'swing'], idle: 'breathe', gait: 'lumber', spawn: 'rise', death: 'crash' },
    }),
  frost_shard: (c) =>
    wispLook(c, {
      hover: 1.3,
      radius: 0.26,
      orbs: 4,
      size: 1.35,
      skin: { surface: 'crystal', tint: 0xb8e4ff },
      alt: { surface: 'ice', tint: 0x9ad0f0 },
      sculpt: (s, R) => {
        // A star of ice crystals round a cold blue heart.
        const c0 = s.j('core');
        s.ball('core', c0, R * 0.5, { k: R * 0.1, mat: 'alt' });
        crystals(s, 'core', c0, 9, R * 1.5, R * 0.18, 101, V(0, 1, 0), 1.3, 'skin');
        crystals(s, 'core', c0, 4, R * 1.3, R * 0.16, 103, V(0, -1, 0), 0.5, 'skin');
        s.eye('eye', s.j('eye'), R * 0.22, 1.6);
        for (let i = 0; i < 4; i++) {
          const p = s.j(`orb${i}`);
          s.hard(`orb${i}`, spikeGeo(p.clone().add(V(0, -R * 0.35, 0)), p.clone().add(V(0, R * 0.35, 0)), R * 0.1, 5, undefined, 1), 'skin', ICE);
          s.hard(`orb${i}`, spikeGeo(p.clone().add(V(0, R * 0.3, 0)), p.clone().add(V(0, -R * 0.3, 0)), R * 0.1, 5, undefined, 1), 'skin', ICE);
        }
      },
      paint: { skin: { grime: 0.05, ao: 0.5, top: { amount: 0.3, col: [1.2, 1.25, 1.3] }, tips: { amount: 0.5, col: [1.3, 1.4, 1.5] } }, alt: { grime: 0, ao: 0.4 } },
      style: { attacks: ['lash'], ranged: true, castBoth: true, idle: 'hover', spawn: 'form', death: 'collapse' },
    }),
  ice_revenant: (c) =>
    walkLook(c, {
      height: 1.85,
      kind: 'giant',
      rig: { hip: 0.46, shoulders: 0.17, hips: 0.075, arms: 1.15, hunch: 0.25, head: 0.8, armOut: 0.36 },
      skin: { surface: 'rot', tint: 0xa8bccc },
      alt: { surface: 'ice', tint: 0xd8f0ff },
      sculpt: iceRevenant,
      paint: {
        skin: { grime: 0.45, ao: 0.9, mottle: { scale: 6, amount: 0.4, col: [0.55, 0.62, 0.72] }, top: { amount: 0.35, col: [1.3, 1.35, 1.4] } },
        alt: { base: [1.35, 1.45, 1.55], grime: 0.1, ao: 0.5, top: { amount: 0.4, col: [1.3, 1.35, 1.4] } },
      },
      soft: { alt: 0.008 },
      style: { heavy: 0.65, attacks: ['chop', 'swing', 'slam'], armed: 'one', idle: 'breathe', gait: 'march', spawn: 'rise', death: 'crash' },
    }),
  lightning_wisp: (c) =>
    wispLook(c, {
      hover: 1.05,
      radius: 0.18,
      orbs: 3,
      skin: { surface: 'crystal', tint: 0x6a90c8 },
      sculpt: (s, R) => {
        // A crackling ball of light in a cage of its own arcs.
        const c0 = s.j('core');
        s.boil('core', c0, R * 0.55, 1, [1.4, 1.35, 0.9]);
        s.ball('core', c0, R * 0.7, { k: R * 0.1 });
        const r = seq(111);
        for (let i = 0; i < 9; i++) {
          const d = V(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
          bolt(s, i % 3 === 0 ? 'crown' : 'core', c0.clone().addScaledVector(d, R * 0.55), c0.clone().addScaledVector(d, R * (1.4 + r() * 0.6)), R * 0.04, 113 + i);
        }
        s.eye('eye', s.j('eye').add(V(0, 0, R * 0.1)), R * 0.14, 1.8);
        for (let i = 0; i < 3; i++) {
          const p = s.j(`orb${i}`);
          s.boil(`orb${i}`, p, R * 0.12, 1, SPARK);
          bolt(s, `orb${i}`, p.clone().add(V(0, R * 0.25, 0)), p.clone().add(V(0, -R * 0.25, 0)), R * 0.03, 121 + i, SPARK, 3);
        }
      },
      paint: { skin: { grime: 0, ao: 0.4, veins: { scale: 12, cut: 0.93, glow: 0.7, col: SPARK } } },
      glowIntensity: 3,
      style: { attacks: ['lunge'], idle: 'jitter', spawn: 'form', death: 'collapse' },
    }),
  storm_djinn: (c) => djinnLook(c),
  living_gale: (c) => galeLook(c),
  obsidian_elemental: (c) =>
    walkLook(c, {
      height: 1.9,
      rig: { shoulders: 0.14, hips: 0.06, arms: 1.1, hunch: 0.18 },
      skin: { surface: 'crystal', tint: 0x4a4250 },
      sculpt: glassWalker,
      paint: { skin: { grime: 0.2, ao: 0.7, top: { amount: 0.35, col: [1.5, 1.45, 1.55] }, veins: { scale: 13, cut: 0.955, glow: 0.45, col: FIRE } } },
      soft: { skin: 0.006 },
      style: { heavy: 0.3, attacks: ['swing', 'thrust', 'chop'], idle: 'still', gait: 'stalk', spawn: 'rise', death: 'scatter' },
    }),
  tide_caller: (c) => tideLook(c),
  void_ember: (c) =>
    wispLook(c, {
      hover: 1.35,
      radius: 0.3,
      orbs: 4,
      tendrils: 5,
      skin: { surface: 'shade', tint: 0x1a1220 },
      alt: { surface: 'crystal', tint: 0x2a1a3a },
      sculpt: (s, R) => {
        // A black flame: a husk of dark glass round a hole, purple fire rising, smoke hanging.
        const c0 = s.j('core');
        s.ball('core', c0, V(R * 0.8, R * 0.85, R * 0.8), { k: R * 0.1 });
        s.ball('core', c0.clone().add(V(0, 0, R * 0.6)), R * 0.45, { sub: true, k: R * 0.1 });
        crystals(s, 'core', c0, 7, R * 1.0, R * 0.14, 131, V(0, 0.4, -1), 0.9, 'alt');
        s.eye('eye', s.j('eye').add(V(0, 0, -R * 0.15)), R * 0.32, 1.4);
        s.hard('eye', ringGeo(s.j('eye').add(V(0, 0, -R * 0.05)), R * 0.38, R * 0.05, V(0, 0, 1), 18), 'alt', [0.3, 0.15, 0.4], 0.6);
        fire(s, 'crown', s.j('crown').add(V(0, -R * 0.4, -R * 0.1)), 16, R * 1.3, R * 0.6, 133, VOID, 0.5);
        for (let i = 0; i < 4; i++) {
          const p = s.j(`orb${i}`);
          crystals(s, `orb${i}`, p, 3, R * 0.45, R * 0.07, 135 + i, V(0, 1, 0), 1.2, 'alt', [0.4, 0.2, 0.55], 0.5);
        }
        for (let i = 0; i < 5; i++) {
          let prev = 'core';
          for (let k = 1; k <= 3; k++) {
            const n = `ten${i}_${k}`;
            s.limb(n, s.j(prev), s.j(n), R * 0.18 / k, R * 0.14 / k, { k: R * 0.06 });
            prev = n;
          }
          s.limb(prev, s.j(prev), s.j(`ten${i}Tip`), R * 0.05, R * 0.01, { k: R * 0.03 });
        }
      },
      paint: { skin: { grime: 0, ao: 0.6, tips: { amount: 0.7, col: [0.05, 0.03, 0.08] } }, alt: { grime: 0, ao: 0.5, veins: { scale: 10, cut: 0.94, glow: 0.6, col: VOID } } },
      glowIntensity: 2.6,
      style: { attacks: ['lash'], ranged: true, castBoth: true, idle: 'hover', spawn: 'form', death: 'fade' },
    }),
  glacier_titan: (c) =>
    walkLook(c, {
      height: 1.85,
      kind: 'giant',
      rig: { hip: 0.41, shoulders: 0.23, hips: 0.095, arms: 1.3, hunch: 0.45, head: 0.65, armOut: 0.45 },
      skin: { surface: 'ice', tint: 0x587898 },
      alt: { surface: 'ice', tint: 0xd0ecff },
      sculpt: glacierTitan,
      paint: {
        skin: { grime: 0.45, ao: 0.9, mottle: { scale: 5, amount: 0.4, col: [0.45, 0.5, 0.6] }, top: { amount: 0.55, col: [1.7, 1.75, 1.8] } },
        alt: { base: [1.35, 1.45, 1.55], grime: 0.05, ao: 0.5, top: { amount: 0.5, col: [1.4, 1.45, 1.5] } },
      },
      soft: { alt: 0.008 },
      lumps: { amp: 0.014, scale: 5 },
      style: { heavy: 0.95, attacks: ['slam', 'stomp', 'swing'], idle: 'breathe', gait: 'lumber', spawn: 'rise', death: 'crash' },
    }),
};

/** A blue giant from the waist up, storm-cloud wings, a whirlwind for legs. */
function djinnLook(c: LookCtx): CreatureLook {
  const glow = c.visual.glow ?? 0xffee66;
  return {
    key: `id:${c.id}`,
    tier: 'normal',
    size: 1.15,
    rig: () => flyerRig({ body: 1.0, hover: 1.25, span: 2.3, upright: true, arms: true, neck: 0.1 }),
    sculpt: (s) => {
      s.k = 0.014;
      const ch = s.j('chest');
      const bd = s.j('body');
      // A broad bare chest and a narrow waist.
      s.ball('chest', ch.clone().add(V(0, 0.03, 0)), V(0.17, 0.15, 0.11), { k: 0.04 });
      s.pair((_side, x) => s.ball('chest', ch.clone().add(V(x * 0.06, 0.04, 0.06)), V(0.065, 0.055, 0.04), { k: 0.03 }));
      s.limb('chest', ch.clone().add(V(0, -0.05, 0)), bd.clone().add(V(0, 0.06, 0)), 0.1, 0.08, { k: 0.04 });
      // The whirlwind: a cone of cloud winding down to a point, ringed with gusts.
      s.limb('body', bd.clone().add(V(0, 0.05, 0)), bd.clone().add(V(0, -0.35, -0.04)), 0.12, 0.07, { mat: 'alt', k: 0.05 });
      s.limb('body', bd.clone().add(V(0, -0.35, -0.04)), bd.clone().add(V(0, -0.95, -0.12)), 0.07, 0.015, { mat: 'alt', k: 0.04 });
      for (let i = 0; i < 6; i++) {
        const t = i / 6;
        const p = bd.clone().add(V(Math.sin(i * 2.1) * 0.02, -0.1 - t * 0.75, -0.02 - t * 0.1));
        s.hard('body', ringGeo(p, 0.15 * (1 - t * 0.8), 0.012 * (1 - t * 0.5), V(0.1 * Math.sin(i), 1, 0.15).normalize(), 16), 'alt');
      }
      for (let i = 0; i < 3; i++) bolt(s, 'body', bd.clone().add(V((i - 1) * 0.08, -0.1, 0.05)), bd.clone().add(V((i - 1) * 0.03, -0.75, -0.06)), 0.008, 141 + i);
      // Gold bracers, a gold collar, a belt sash.
      s.limb('chest', s.j('neck').add(V(0, -0.03, 0)), s.j('neck').add(V(0, -0.01, 0.01)), 0.075, 0.06, { mat: 'metal', k: 0.005 });
      s.ball('body', bd.clone().add(V(0, 0.07, 0)), V(0.11, 0.035, 0.09), { mat: 'metal', k: 0.005 });
      // Head: bald, heavy brow, a beard of lightning, a topknot crackling up.
      s.limb('neck', s.j('neck'), s.j('head'), 0.05, 0.045, { k: 0.02 });
      const h = s.j('head');
      s.ball('head', h.clone().add(V(0, 0.03, 0)), V(0.065, 0.08, 0.072), { k: 0.02 });
      s.ball('head', h.clone().add(V(0, 0.055, 0.045)), V(0.055, 0.018, 0.03), { k: 0.012 });
      s.ball('jaw', s.j('jaw').add(V(0, -0.005, 0.01)), V(0.045, 0.03, 0.045), { k: 0.015 });
      s.pair((_side, x) => {
        s.eye('head', h.clone().add(V(x * 0.026, 0.04, 0.068)), 0.011, 1.8);
        s.hard('head', ringGeo(h.clone().add(V(x * 0.068, 0.01, 0.0)), 0.016, 0.004, V(1, 0, 0), 10), 'metal');
        // Pointed ears.
        s.hard('head', spikeGeo(h.clone().add(V(x * 0.06, 0.04, -0.01)), h.clone().add(V(x * 0.11, 0.08, -0.04)), 0.016, 4, undefined, 2), 'skin');
      });
      bolt(s, 'head', h.clone().add(V(0, 0.1, -0.03)), h.clone().add(V(0.02, 0.32, -0.12)), 0.01, 145);
      bolt(s, 'head', h.clone().add(V(0, 0.1, -0.03)), h.clone().add(V(-0.04, 0.28, -0.14)), 0.008, 146);
      s.ball('head', h.clone().add(V(0, 0.1, -0.03)), V(0.02, 0.025, 0.02), { mat: 'metal', k: 0.004 });
      for (let i = 0; i < 5; i++) bolt(s, 'jaw', s.j('jaw').add(V((i - 2) * 0.015, -0.02, 0.03)), s.j('jaw').add(V((i - 2) * 0.02, -0.15 - (2 - Math.abs(i - 2)) * 0.03, 0.04)), 0.006, 147 + i);
      // Arms: thick, gold-cuffed, storm balls in the hands.
      s.pair((side) => {
        s.ball(`arm${side}`, s.j(`arm${side}`).add(V(0, 0.01, 0)), V(0.06, 0.055, 0.06), { k: 0.03 });
        s.limb(`arm${side}`, s.j(`arm${side}`), s.j(`fore${side}`), 0.05, 0.04, { k: 0.02 });
        s.limb(`fore${side}`, s.j(`fore${side}`), s.j(`hand${side}`), 0.04, 0.03, { k: 0.015 });
        s.limb(`fore${side}`, lerpV(s.j(`fore${side}`), s.j(`hand${side}`), 0.5), lerpV(s.j(`fore${side}`), s.j(`hand${side}`), 0.95), 0.043, 0.036, { mat: 'metal', k: 0.004 });
        s.ball(`hand${side}`, lerpV(s.j(`hand${side}`), s.j(`hand${side}Tip`), 0.4), V(0.026, 0.04, 0.018), { k: 0.008 });
        claws(s, `hand${side}`, `hand${side}Tip`, 4, 0.04, 0.005, 'skin', undefined, 0.5);
        const p = lerpV(s.j(`hand${side}`), s.j(`hand${side}Tip`), 0.9).add(V(0, 0.02, 0.05));
        s.boil(`hand${side}`, p, 0.04, 1, SPARK);
        for (let i = 0; i < 3; i++) bolt(s, `hand${side}`, p, p.clone().add(V(Math.sin(i * 2.1) * 0.1, 0.06 + i * 0.03, Math.cos(i * 2.1) * 0.08)), 0.005, 151 + i * 3 + (side === 'L' ? 0 : 1), SPARK, 3);
      });
      // Wings of storm cloud, lightning in the spars.
      demonWings(s, { mat: 'alt', trail: V(0, -0.3, -1), thick: 1.2 });
      s.pair((side) => bolt(s, `wing${side}2`, s.j(`wing${side}2`), s.j(`wing${side}Tip`), 0.008, side === 'L' ? 155 : 156));
      s.paint.skin = { grime: 0.25, ao: 0.85, mottle: { scale: 6, amount: 0.3, col: [0.5, 0.6, 0.85] }, top: { amount: 0.2, col: [1.2, 1.25, 1.35] } };
      s.paint.alt = { base: [1.4, 1.4, 1.5], grime: 0.1, ao: 0.6, mottle: { scale: 3, amount: 0.5, col: [0.55, 0.6, 0.7] }, tips: { amount: 0.6, col: [0.5, 0.55, 0.65] } };
      s.soft.alt = 0.06;
    },
    mats: {
      skin: { surface: 'ice', tint: 0x6a9ad8, glow, glowIntensity: 2.6, rough: 0.55 },
      alt: { surface: 'shade', tint: 0x7a8498, glow, glowIntensity: 2.6 },
      metal: { surface: 'gold', tint: 0xd0a850, glow },
    },
    style: { heavy: 0.2, attacks: ['hurl', 'lash'], ranged: true, castBoth: true, spawn: 'swoop', death: 'crash', idle: 'hover', gait: 'glide', armed: 'none' },
  };
}

/** A whirlwind full of grit, leaves and ice: a funnel of wind and the debris it carries. */
function galeLook(c: LookCtx): CreatureLook {
  const glow = c.visual.glow ?? 0xaaffff;
  const N = 20;
  return {
    key: `id:${c.id}`,
    tier: 'normal',
    rig: () => swarmRig({ hover: 1.0, radius: 0.55, motes: N }),
    sculpt: (s) => {
      const c0 = s.j('core');
      // The funnel: rings of wind widening upward, streaks winding round.
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const p = c0.clone().add(V(Math.sin(i * 1.3) * 0.03, -0.9 + t * 1.5, 0));
        s.hard('core', ringGeo(p, 0.06 + t * t * 0.5, 0.007 + t * 0.008, V(0.08 * Math.sin(i * 2.3), 1, 0.08 * Math.cos(i * 1.7)).normalize(), 20), 'alt');
      }
      for (let k = 0; k < 2; k++) {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 18; i++) {
          const t = i / 18;
          const a = k * Math.PI + t * Math.PI * 3;
          const r = 0.05 + t * t * 0.48;
          pts.push(c0.clone().add(V(Math.sin(a) * r, -0.9 + t * 1.5, Math.cos(a) * r)));
        }
        s.hard('core', tubeGeo(pts, (t) => 0.006 + 0.008 * t, 4, true), 'alt');
      }
      s.boil('core', c0.clone().add(V(0, 0.1, 0)), 0.06, 0.8, [0.9, 1.3, 1.4]);
      // Debris: stones, leaves and shards of ice, one on each mote.
      const r = seq(161);
      for (let i = 0; i < N; i++) {
        const p = s.j(`mote${i}`);
        const kind = i % 3;
        if (kind === 0) s.hard(`mote${i}`, boxGeo(p, V(0.05 + r() * 0.04, 0.04 + r() * 0.03, 0.05 + r() * 0.03), new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3))), 'skin');
        else if (kind === 1) s.hard(`mote${i}`, bladeGeo(p, p.clone().add(V(0.05, 0.02, 0.07)), 0.04, 0.004, V(1, 0, -0.5).normalize(), 0.5), 'skin', [0.45, 0.5, 0.25]);
        else s.hard(`mote${i}`, spikeGeo(p.clone().add(V(0, -0.05, 0)), p.clone().add(V(0.02, 0.06, 0.01)), 0.02, 5, undefined, 1), 'alt', ICE, 0.3);
      }
      s.paint.skin = { grime: 0.3, ao: 0.6 };
      s.paint.alt = { grime: 0, ao: 0.3 };
    },
    mats: {
      skin: { surface: 'stone', tint: 0x7a7468, glow },
      alt: { surface: 'shade', tint: 0x9ab0bc, glow, glowIntensity: 2 },
      metal: { surface: 'steel', tint: 0x8a8e96, glow },
    },
    style: { heavy: 0, attacks: ['lunge', 'engulf'], spawn: 'form', death: 'scatter', idle: 'hover', gait: 'glide', armed: 'none' },
  };
}

/** A woman of water rising out of a standing wave, a coral crown, a pearl of light. */
function tideLook(c: LookCtx): CreatureLook {
  const glow = c.visual.glow ?? 0x40d0ff;
  const H = 1.9;
  return {
    key: `id:${c.id}`,
    tier: 'normal',
    rig: () => specterRig({ height: H, arms: 1.15, hem: 0.0 }),
    sculpt: (s) => {
      const ch = s.j('chest');
      s.ball('chest', ch.clone().add(V(0, 0.01 * H, 0)), V(0.085 * H, 0.08 * H, 0.06 * H), { k: 0.03 * H });
      s.limb('spine', ch.clone().add(V(0, -0.03 * H, 0)), s.j('hips').add(V(0, 0.03 * H, 0)), 0.06 * H, 0.07 * H, { k: 0.04 * H });
      s.pair((_side, x) => s.ball('chest', ch.clone().add(V(x * 0.035 * H, 0.0, 0.04 * H)), 0.03 * H, { k: 0.02 * H }));
      s.limb('neck', s.j('neck').add(V(0, -0.02 * H, 0)), s.j('head'), 0.026 * H, 0.022 * H, { k: 0.02 * H });
      const h = s.j('head');
      s.ball('head', h.clone().add(V(0, 0.02 * H, 0)), V(0.046 * H, 0.056 * H, 0.05 * H), { k: 0.014 * H });
      s.pair((_side, x) => s.eye('head', h.clone().add(V(x * 0.016 * H, 0.025 * H, 0.04 * H)), 0.006 * H, 1.6));
      // Hair of water streaming back in long curls.
      for (let i = 0; i < 9; i++) {
        const a = (i / 8 - 0.5) * 2.2;
        const b = h.clone().add(V(Math.sin(a) * 0.035 * H, 0.05 * H, -0.01 * H));
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 8; k++) {
          const t = k / 8;
          pts.push(b.clone().add(V(Math.sin(a) * t * 0.06 * H, -t * 0.2 * H + Math.sin(t * 3) * 0.04 * H, -t * 0.12 * H - Math.sin(t * Math.PI) * 0.03 * H)));
        }
        s.hard('head', tubeGeo(pts, (t) => 0.012 * H * (1 - 0.8 * t), 5, true), 'skin');
      }
      // A crown of coral.
      const r = seq(171);
      for (let i = 0; i < 6; i++) {
        const a = (i / 5 - 0.5) * 2.0;
        const b = h.clone().add(V(Math.sin(a) * 0.04 * H, 0.06 * H, Math.cos(a) * 0.02 * H));
        s.hard('head', spikeGeo(b, b.clone().add(V(Math.sin(a) * 0.03 * H, (0.05 + r() * 0.05) * H, -0.01 * H)), 0.008 * H, 4, V(Math.sin(a) * 0.01 * H, 0, 0), 2), 'metal');
      }
      s.pair((side) => {
        s.limb(`arm${side}`, s.j(`arm${side}`), s.j(`fore${side}`), 0.022 * H, 0.017 * H, { k: 0.012 * H });
        s.limb(`fore${side}`, s.j(`fore${side}`), s.j(`hand${side}`), 0.017 * H, 0.012 * H, { k: 0.01 * H });
        s.ball(`hand${side}`, lerpV(s.j(`hand${side}`), s.j(`hand${side}Tip`), 0.35), V(0.012 * H, 0.02 * H, 0.008 * H), { k: 0.005 * H });
        claws(s, `hand${side}`, `hand${side}Tip`, 4, 0.03, 0.003, 'skin', undefined, 0.3);
        // Water runs off the arms.
        s.hard(`fore${side}`, spikeGeo(lerpV(s.j(`fore${side}`), s.j(`hand${side}`), 0.3), lerpV(s.j(`fore${side}`), s.j(`hand${side}`), 0.3).add(V(0, -0.14 * H, -0.04 * H)), 0.014 * H, 4, undefined, 2), 'alt');
      });
      // A pearl of light held in the left hand.
      s.boil('handL', lerpV(s.j('handL'), s.j('handLTip'), 0.9).add(V(0, 0.03 * H, 0.02 * H)), 0.03 * H, 1, [0.7, 1.2, 1.4]);
      // The standing wave: four streams pouring from the hips to the floor.
      s.ball('hips', s.j('hips').add(V(0, 0.02 * H, 0)), V(0.1 * H, 0.07 * H, 0.09 * H), { mat: 'alt', k: 0.04 * H });
      s.limb('hips', s.j('hips'), V(0, 0.02 * H, -0.06 * H), 0.085 * H, 0.15 * H, { mat: 'alt', k: 0.06 * H });
      for (const n of ['F', 'B', 'L', 'R']) {
        const a = s.j(`robe${n}1`);
        const m = s.j(`robe${n}2`);
        const e = s.j(`robe${n}Tip`);
        s.limb(`robe${n}1`, a, m, 0.05 * H, 0.045 * H, { mat: 'alt', k: 0.07 * H });
        s.limb(`robe${n}2`, m, e, 0.045 * H, 0.06 * H, { mat: 'alt', k: 0.07 * H });
      }
      // A crest of foam curling over at the back.
      const bk = s.j('robeB2');
      for (let i = 0; i < 5; i++) {
        const x = (i / 4 - 0.5) * 0.25 * H;
        const b = bk.clone().add(V(x, 0.1 * H, -0.02 * H));
        s.hard('robeB2', spikeGeo(b, b.clone().add(V(x * 0.3, 0.12 * H, 0.08 * H)), 0.03 * H, 4, V(0, 0.03 * H, 0.05 * H), 3), 'alt');
      }
      s.paint.skin = { grime: 0, ao: 0.5, top: { amount: 0.3, col: [1.2, 1.35, 1.4] } };
      s.paint.alt = { grime: 0, ao: 0.4, tips: { amount: 0.7, col: [1.6, 1.7, 1.75] }, top: { amount: 0.3, col: [1.3, 1.4, 1.45] } };
      s.paint.metal = { grime: 0.2, ao: 0.6 };
      s.soft.alt = 0.07;
    },
    mats: {
      skin: { surface: 'slime', tint: 0x4a90c0, glow, glowIntensity: 2.4 },
      alt: { surface: 'slime', tint: 0x2a6a9a, glow, glowIntensity: 2.4 },
      metal: { surface: 'bone', tint: 0xd07a6a, glow },
    },
    style: { heavy: 0.15, attacks: ['lash'], ranged: true, castBoth: true, spawn: 'rise', death: 'fade', idle: 'hover', gait: 'glide', armed: 'none' },
  };
}

export { ELEMENTAL, bolt, crystals, facet, prism, drips, fire, walkLook, wispLook };
