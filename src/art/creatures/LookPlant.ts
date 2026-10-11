/**
 * SLAY — plants: spore pods, thorn creepers and strangler vines, the bloom
 * cannon, the fungal shambler and the deathcap priest, the blight flower and
 * the corpse bloom, the ancient treant and the root horror.
 *
 * Grown, not built: bark that splits, moss in the hollows, caps and gills,
 * thorns, petals that are too fleshy. The light is sickly (spores, sap, a
 * glow deep in a flower's throat), never clean.
 */
import * as THREE from 'three';
import { floaterRig, oozeRig, serpentRig } from './Rig';
import type { CreatureLook } from './Creature';
import type { LookCtx, LookFactory } from './Looks';
import type { CMat, PaintSpec, RGB, Sculpt } from './Sculpt';
import { ballGeo, bladeGeo, spikeGeo, tubeGeo } from './Sculpt';
import { V, claws, fleshArms, fleshLegs, lerpV, seq, skirt, trunk } from './Kit';
import { WEAPON_DIR, weapon } from './Arms';
import { serpentBody } from './LookBeast';
import { walkLook } from './LookElemental';
import { eyeball, hangers, maw, tentacle } from './LookAberration';
import type { MotionStyle } from './Motion';
import type { Surface } from './Materials';

const LEAF: RGB = [0.45, 0.62, 0.3];
const DEADLEAF: RGB = [0.5, 0.42, 0.25];
const THORN: RGB = [0.35, 0.28, 0.2];
const SPORE: RGB = [0.8, 1.2, 0.4];
const SAP: RGB = [1.0, 0.85, 0.3];
const TOOTH: RGB = [0.8, 0.75, 0.55];
const WART: RGB = [0.95, 0.9, 0.8];

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

/** A mushroom cap: a dome over a hollow, gills underneath, spots on top. */
function cap(s: Sculpt, bone: string, c: THREE.Vector3, r: number, h: number, o: { mat?: CMat; spots?: RGB; n?: number; glow?: number; tilt?: THREE.Vector3; stem?: number } = {}): void {
  const mat = o.mat ?? 'metal';
  const up = (o.tilt ?? V(0, 1, 0)).clone().normalize();
  if (o.stem) s.limb(bone, c.clone().addScaledVector(up, -o.stem), c, r * 0.22, r * 0.18, { mat: 'skin', k: r * 0.1 });
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), up);
  s.ball(bone, c, V(r, h, r), { mat, k: r * 0.08, q });
  s.ball(bone, c.clone().addScaledVector(up, -h * 0.75), V(r * 0.92, h * 0.8, r * 0.92), { mat, sub: true, k: r * 0.06, q });
  if (o.spots) {
    const rnd = seq(Math.round(r * 997 + c.x * 131));
    const n = o.n ?? 6;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const e = 0.25 + rnd() * 0.55;
      const d = V(Math.cos(a) * Math.sin(e * 1.4), Math.cos(e * 1.4), Math.sin(a) * Math.sin(e * 1.4)).applyQuaternion(q);
      s.boil(bone, c.clone().add(V(d.x * r * 0.95, d.y * h * 0.95, d.z * r * 0.95)), r * (0.07 + rnd() * 0.06), o.glow ?? 0, o.spots);
    }
  }
}

/** A leaf: a flat blade from a, along dir, its face toward `face`. */
function leaf(s: Sculpt, bone: string, a: THREE.Vector3, dir: THREE.Vector3, len: number, w: number, col: RGB = LEAF, mat: CMat = 'alt'): void {
  const d = dir.clone().normalize();
  const side = V(0, 1, 0).cross(d);
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  s.hard(bone, bladeGeo(a, a.clone().addScaledVector(d, len), w, w * 0.08, side.normalize(), 0.45), mat, col);
}

/** Thorns standing out round a bone's segment. */
function thorns(s: Sculpt, bone: string, at: THREE.Vector3, r: number, n: number, len: number, seed: number, col: RGB = THORN): void {
  const rnd = seq(seed);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const d = V(Math.cos(a), Math.sin(a) * 0.8 + 0.3, (rnd() - 0.6) * 0.8).normalize();
    const p = at.clone().addScaledVector(d, r * 0.85);
    s.hard(bone, spikeGeo(p, p.clone().addScaledVector(d, len * (0.6 + rnd() * 0.6)).add(V(0, 0, -len * 0.3)), len * 0.18, 4, undefined, 1), 'skin', col);
  }
}

/** A branch: a crooked tapering tube that forks once or twice. */
function branch(s: Sculpt, bone: string, a: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, seed: number, depth = 2, leaves = 0, col?: RGB): void {
  const rnd = seq(seed);
  const d = dir.clone().normalize();
  const pts: THREE.Vector3[] = [a.clone()];
  let p = a.clone();
  for (let i = 1; i <= 4; i++) {
    p = p.clone().addScaledVector(d, len / 4).add(V((rnd() - 0.5) * len * 0.12, (rnd() - 0.3) * len * 0.08, (rnd() - 0.5) * len * 0.12));
    pts.push(p);
  }
  s.hard(bone, tubeGeo(pts, (t) => r * (1 - 0.75 * t), 5, true), 'skin', col);
  if (depth > 0) {
    for (let k = 0; k < 2; k++) {
      const from = pts[2 + k]!;
      const nd = d.clone().add(V((rnd() - 0.5) * 1.4, rnd() * 0.6, (rnd() - 0.5) * 1.4)).normalize();
      branch(s, bone, from, nd, len * 0.55, r * 0.55, seed * 7 + k + 1, depth - 1, leaves, col);
    }
  } else if (leaves > 0) {
    for (let k = 0; k < leaves; k++) s.ball(bone, p.clone().add(V((rnd() - 0.5) * len * 0.3, (rnd() - 0.2) * len * 0.25, (rnd() - 0.5) * len * 0.3)), len * (0.18 + rnd() * 0.12), { mat: 'alt', k: len * 0.06 });
  }
}

/** A flower: petals in a ring round `c`, facing `n`, curling back at the tips. */
function petals(s: Sculpt, bone: string, c: THREE.Vector3, n: THREE.Vector3, count: number, len: number, w: number, col: RGB, mat: CMat = 'metal', curl = 0.35, seed = 1): void {
  const d = n.clone().normalize();
  const u = (Math.abs(d.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0)).cross(d).normalize();
  const v = d.clone().cross(u).normalize();
  const rnd = seq(seed);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rnd() * 0.2;
    const out = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
    const l = len * (0.85 + rnd() * 0.3);
    const tip = c.clone().addScaledVector(out, l).addScaledVector(d, -curl * l);
    const mid = c.clone().addScaledVector(out, l * 0.5).addScaledVector(d, l * 0.08);
    const pts = [c.clone().addScaledVector(out, l * 0.08), mid, tip];
    // A thick fleshy petal: a flattened tube, widest in the middle.
    const geo = tubeGeo(pts, (t) => w * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.9)) * 0.5 + w * 0.06, 6, true);
    // Flatten across the petal's face.
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const tmp = new THREE.Vector3();
    for (let k = 0; k < pos.count; k++) {
      tmp.fromBufferAttribute(pos, k).sub(c);
      const along = tmp.dot(d);
      tmp.addScaledVector(d, -along * 0.75);
      pos.setXYZ(k, c.x + tmp.x, c.y + tmp.y, c.z + tmp.z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    s.hard(bone, geo, mat, col);
  }
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

interface VineOpt {
  length: number;
  girth: number;
  front?: number;
  rear?: number;
  rise?: number;
  sculpt: (s: Sculpt, g: number) => void;
  skin: { surface: Surface; tint: number };
  alt?: { surface: Surface; tint: number };
  metal?: { surface: Surface; tint: number };
  paint?: Partial<Record<CMat, PaintSpec>>;
  style: Partial<MotionStyle>;
  size?: number;
}

function vineLook(c: LookCtx, o: VineOpt): CreatureLook {
  const glow = c.visual.glow ?? 0x88ff44;
  return {
    key: `id:${c.id}`,
    size: o.size,
    tier: 'normal',
    rig: () => serpentRig({ length: o.length, girth: o.girth, front: o.front ?? 4, rear: o.rear ?? 5, rise: o.rise ?? 0.7, head: 0.1 }),
    sculpt: (s) => {
      s.soft.skin = 0.03;
      o.sculpt(s, o.girth);
      s.paint.skin = o.paint?.skin ?? { grime: 0.45, ao: 0.9, mottle: { scale: 7, amount: 0.35, col: [0.4, 0.45, 0.3] }, top: { amount: 0.15, col: [1.1, 1.15, 1.0] } };
      s.paint.alt = o.paint?.alt ?? { grime: 0.2, ao: 0.8, tips: { amount: 0.4, col: [0.55, 0.45, 0.25] } };
      s.paint.metal = o.paint?.metal ?? { grime: 0.2, ao: 0.8 };
    },
    mats: {
      skin: { surface: o.skin.surface, tint: o.skin.tint, glow },
      alt: { surface: o.alt?.surface ?? 'moss', tint: o.alt?.tint ?? 0x5a7a3a, glow },
      metal: { surface: o.metal?.surface ?? 'flesh', tint: o.metal?.tint ?? 0x9a3a40, glow },
    },
    style: { heavy: 0.35, attacks: ['bite', 'lash'], spawn: 'emerge', death: 'coil', idle: 'sway', gait: 'slither', stride: 2.8, armed: 'none', ...o.style },
  };
}

interface BloomOpt {
  hover: number;
  radius: number;
  tendrils?: number;
  sculpt: (s: Sculpt, R: number) => void;
  skin: { surface: Surface; tint: number };
  alt?: { surface: Surface; tint: number };
  metal?: { surface: Surface; tint: number };
  paint?: Partial<Record<CMat, PaintSpec>>;
  style: Partial<MotionStyle>;
  size?: number;
}

function bloomLook(c: LookCtx, o: BloomOpt): CreatureLook {
  const glow = c.visual.glow ?? 0xccff44;
  return {
    key: `id:${c.id}`,
    size: o.size,
    tier: 'normal',
    rig: () => floaterRig({ hover: o.hover, radius: o.radius, tendrils: o.tendrils ?? 5, segments: 3 }),
    sculpt: (s) => {
      s.soft.skin = 0.03;
      s.k = 0.015;
      o.sculpt(s, o.radius);
      s.paint.skin = o.paint?.skin ?? { grime: 0.4, ao: 0.9, mottle: { scale: 7, amount: 0.35, col: [0.45, 0.5, 0.3] } };
      s.paint.alt = o.paint?.alt ?? { grime: 0.2, ao: 0.8, tips: { amount: 0.4, col: [0.55, 0.45, 0.25] } };
      s.paint.metal = o.paint?.metal ?? { grime: 0.2, ao: 0.85, tips: { amount: 0.4, col: [0.5, 0.3, 0.35] } };
    },
    mats: {
      skin: { surface: o.skin.surface, tint: o.skin.tint, glow },
      alt: { surface: o.alt?.surface ?? 'moss', tint: o.alt?.tint ?? 0x5a7a3a, glow },
      metal: { surface: o.metal?.surface ?? 'flesh', tint: o.metal?.tint ?? 0xa04a60, glow },
    },
    style: { heavy: 0.25, attacks: ['lash'], ranged: true, castBoth: true, spawn: 'emerge', death: 'collapse', idle: 'hover', gait: 'glide', armed: 'none', ...o.style },
  };
}

interface MoundOpt {
  height: number;
  radius: number;
  lobes?: number;
  sculpt: (s: Sculpt, H: number, R: number) => void;
  skin: { surface: Surface; tint: number };
  alt?: { surface: Surface; tint: number };
  metal?: { surface: Surface; tint: number };
  paint?: Partial<Record<CMat, PaintSpec>>;
  style: Partial<MotionStyle>;
  size?: number;
  tier?: CreatureLook['tier'];
}

function moundLook(c: LookCtx, o: MoundOpt): CreatureLook {
  const glow = c.visual.glow ?? 0x88dd44;
  return {
    key: `id:${c.id}`,
    size: o.size,
    tier: o.tier ?? 'normal',
    rig: () => oozeRig({ height: o.height, radius: o.radius, lobes: o.lobes ?? 5, pods: true }),
    sculpt: (s) => {
      s.k = 0.025;
      s.soft.skin = 0.04;
      o.sculpt(s, o.height, o.radius);
      s.paint.skin = o.paint?.skin ?? { grime: 0.5, ao: 0.9, mottle: { scale: 6, amount: 0.4, col: [0.4, 0.45, 0.3] } };
      s.paint.alt = o.paint?.alt ?? { grime: 0.3, ao: 0.85 };
      s.paint.metal = o.paint?.metal ?? { grime: 0.2, ao: 0.8 };
    },
    mats: {
      skin: { surface: o.skin.surface, tint: o.skin.tint, glow },
      alt: { surface: o.alt?.surface ?? 'moss', tint: o.alt?.tint ?? 0x5a7a3a, glow },
      metal: { surface: o.metal?.surface ?? 'flesh', tint: o.metal?.tint ?? 0xc8b8a0, glow },
    },
    style: { heavy: 0.5, attacks: ['engulf', 'lash'], spawn: 'emerge', death: 'splat', idle: 'breathe', gait: 'roll', armed: 'none', ...o.style },
  };
}

/** Moss in hanging beards and patches. */
function mossBeard(s: Sculpt, bone: string, at: THREE.Vector3, w: number, len: number, n: number, seed: number): void {
  const rnd = seq(seed);
  for (let i = 0; i < n; i++) {
    const p = at.clone().add(V((i / Math.max(1, n - 1) - 0.5) * w, 0, (rnd() - 0.5) * w * 0.2));
    s.hard(bone, spikeGeo(p, p.clone().add(V((rnd() - 0.5) * len * 0.2, -len * (0.6 + rnd() * 0.5), len * 0.05)), w * 0.12, 3, undefined, 2), 'alt');
  }
}

// ---------------------------------------------------------------------------

/** A humanoid of rot and fungus: caps sprouting from it, a cap for a head. */
function shambler(s: Sculpt, H: number): void {
  trunk(s, { chest: [0.11, 0.08, 0.1], pelvis: [0.075, 0.06, 0.06], shoulders: 0.04, hump: 0.04 });
  fleshArms(s, { r: 0.032, swell: 0.014, claws: 0.035, clawCol: THORN });
  fleshLegs(s, { r: 0.042, swell: 0.014 });
  const ch = s.j('chest');
  // Head: a lumpen stalk under a broad cap, two spore-lit eyes in the gills.
  const h = s.j('head').add(V(0, 0.03 * H, 0.01 * H));
  s.ball('head', h, V(0.045 * H, 0.05 * H, 0.045 * H), { k: 0.015 * H });
  cap(s, 'head', h.clone().add(V(0, 0.05 * H, -0.005 * H)), 0.1 * H, 0.05 * H, { spots: [0.9, 0.85, 0.7], n: 7, tilt: V(0.15, 1, 0.1) });
  s.pair((_side, x) => s.eye('head', h.clone().add(V(x * 0.02 * H, 0.0, 0.042 * H)), 0.008 * H, 1.4));
  // Caps sprouting from the shoulders and back.
  const r = seq(301);
  s.pair((side, x) => {
    const a = s.j(`arm${side}`);
    cap(s, `arm${side}`, a.clone().add(V(x * 0.02 * H, 0.05 * H, -0.01 * H)), 0.045 * H, 0.022 * H, { tilt: V(x * 0.5, 1, 0), stem: 0.03 * H });
    cap(s, `arm${side}`, a.clone().add(V(x * 0.05 * H, 0.03 * H, 0.02 * H)), 0.028 * H, 0.014 * H, { tilt: V(x, 0.8, 0.3), stem: 0.02 * H });
  });
  for (let i = 0; i < 5; i++) {
    const p = ch.clone().add(V((r() - 0.5) * 0.14 * H, (r() - 0.3) * 0.12 * H, -0.08 * H));
    cap(s, 'chest', p, (0.025 + r() * 0.025) * H, (0.012 + r() * 0.01) * H, { tilt: V((r() - 0.5) * 0.6, 0.6, -0.8), stem: 0.015 * H, spots: SPORE, n: 3, glow: 0.7 });
  }
  // Shelf fungus up a thigh and a forearm.
  for (let i = 0; i < 3; i++) cap(s, 'legL', lerpV(s.j('legL'), s.j('shinL'), 0.3 + i * 0.2).add(V(0.035 * H, 0, 0.01 * H)), 0.03 * H, 0.008 * H, { tilt: V(0.3, 1, 0) });
  for (let i = 0; i < 2; i++) cap(s, 'foreR', lerpV(s.j('foreR'), s.j('handR'), 0.3 + i * 0.3).add(V(-0.025 * H, 0, 0)), 0.025 * H, 0.007 * H, { tilt: V(-0.3, 1, 0) });
  // Glowing spore boils in the rotten flesh.
  for (let i = 0; i < 4; i++) s.boil(i < 2 ? 'chest' : 'spine', (i < 2 ? ch : s.j('spine')).clone().add(V((r() - 0.5) * 0.12 * H, (r() - 0.5) * 0.06 * H, 0.075 * H)), 0.011 * H, 0.9, SPORE);
  mossBeard(s, 'chest', ch.clone().add(V(0, -0.04 * H, 0.09 * H)), 0.12 * H, 0.08 * H, 6, 303);
  weapon(s, 'sword', { steel: [0.45, 0.35, 0.25], size: 1.0 });
}

/** A robed priest under a huge deathcap, a staff topped with a glowing toadstool. */
function deathcapPriest(s: Sculpt, H: number): void {
  trunk(s, { chest: [0.1, 0.075, 0.1], pelvis: [0.075, 0.06, 0.06], shoulders: 0.035 });
  fleshArms(s, { r: 0.028, swell: 0.01, claws: 0.03, clawCol: [0.6, 0.55, 0.45] });
  fleshLegs(s, { r: 0.038 });
  skirt(s, { len: 0.95, flare: 0.08, top: 0.04, thick: 0.012 });
  const ch = s.j('chest');
  s.ball('chest', ch.clone().add(V(0, 0.02 * H, -0.005 * H)), V(0.105 * H, 0.09 * H, 0.085 * H), { mat: 'alt', k: 0.01 * H });
  // A shawl of ragged moss.
  mossBeard(s, 'chest', ch.clone().add(V(0, 0.08 * H, 0.06 * H)), 0.18 * H, 0.1 * H, 8, 311);
  mossBeard(s, 'chest', ch.clone().add(V(0, 0.08 * H, -0.08 * H)), 0.2 * H, 0.14 * H, 8, 313);
  // Head: a pale face in the shade of the cap, burning pink eyes.
  const h = s.j('head').add(V(0, 0.035 * H, 0.01 * H));
  s.ball('head', h, V(0.042 * H, 0.052 * H, 0.046 * H), { k: 0.012 * H });
  s.pair((_side, x) => s.eye('head', h.clone().add(V(x * 0.018 * H, 0.008 * H, 0.043 * H)), 0.008 * H, 1.7));
  cap(s, 'head', h.clone().add(V(0, 0.07 * H, -0.01 * H)), 0.15 * H, 0.085 * H, { spots: WART, n: 10, tilt: V(0, 1, -0.1) });
  // Gills under the brim.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const p = h.clone().add(V(Math.sin(a) * 0.08 * H, 0.025 * H, Math.cos(a) * 0.08 * H - 0.01 * H));
    s.hard('head', tubeGeo([p, p.clone().add(V(Math.sin(a) * 0.05 * H, 0.015 * H, Math.cos(a) * 0.05 * H))], () => 0.004 * H, 3), 'skin', [0.75, 0.6, 0.55]);
  }
  weapon(s, 'staff', { steel: [0.35, 0.28, 0.2], wood: [0.35, 0.28, 0.2], glow: 0 });
}

/** An old tree walking: a crown of branches and leaves, a beard of moss, roots for toes. */
function treant(s: Sculpt, H: number): void {
  trunk(s, { chest: [0.15, 0.11, 0.13], pelvis: [0.1, 0.075, 0.075], shoulders: 0.065, hump: 0.06 });
  fleshArms(s, { r: 0.05, swell: 0.02 });
  fleshLegs(s, { r: 0.06, swell: 0.018, footW: 0.07 });
  const ch = s.j('chest');
  const r = seq(321);
  // Branches out of the shoulders and the back, in leaf.
  s.pair((side, x) => {
    const a = s.j(`arm${side}`);
    branch(s, `arm${side}`, a.clone().add(V(x * 0.03 * H, 0.05 * H, -0.02 * H)), V(x * 0.6, 1, -0.3), 0.32 * H, 0.03 * H, 331 + x, 2, 3);
    // Twig fingers.
    claws(s, `hand${side}`, `hand${side}Tip`, 4, 0.1, 0.01, 'skin', undefined, 0.4);
    // Roots instead of toes.
    const f = s.j(`foot${side}`);
    for (let i = 0; i < 4; i++) {
      const a2 = (i / 3 - 0.5) * 1.6;
      const p = f.clone().add(V(Math.sin(a2) * 0.03 * H, -0.01 * H, 0.02 * H));
      s.hard(`foot${side}`, spikeGeo(p, p.clone().add(V(Math.sin(a2) * 0.09 * H, -0.02 * H, Math.cos(a2) * 0.09 * H)), 0.014 * H, 4, V(0, 0.01 * H, 0), 2), 'skin');
    }
  });
  branch(s, 'chest', ch.clone().add(V(0, 0.1 * H, -0.08 * H)), V(0.1, 1, -0.5), 0.36 * H, 0.035 * H, 335, 2, 3);
  branch(s, 'chest', ch.clone().add(V(-0.06 * H, 0.06 * H, -0.1 * H)), V(-0.5, 0.8, -0.6), 0.26 * H, 0.025 * H, 337, 1, 3);
  // A gnarled face in the trunk: brow, knot eyes, a split mouth, a moss beard.
  const h = s.j('head').add(V(0, 0.02 * H, 0.02 * H));
  s.ball('head', h, V(0.055 * H, 0.06 * H, 0.05 * H), { k: 0.02 * H });
  s.ball('head', h.clone().add(V(0, 0.03 * H, 0.03 * H)), V(0.06 * H, 0.018 * H, 0.03 * H), { k: 0.012 * H });
  s.pair((_side, x) => {
    s.ball('head', h.clone().add(V(x * 0.022 * H, 0.012 * H, 0.045 * H)), 0.014 * H, { sub: true, k: 0.004 * H });
    s.eye('head', h.clone().add(V(x * 0.022 * H, 0.012 * H, 0.038 * H)), 0.009 * H, 1.6);
  });
  s.ball('head', h.clone().add(V(0, -0.025 * H, 0.045 * H)), V(0.03 * H, 0.008 * H, 0.02 * H), { sub: true, k: 0.004 * H });
  mossBeard(s, 'head', h.clone().add(V(0, -0.035 * H, 0.04 * H)), 0.08 * H, 0.14 * H, 7, 339);
  mossBeard(s, 'chest', ch.clone().add(V(0, 0.0, 0.12 * H)), 0.14 * H, 0.1 * H, 5, 341);
  // Moss on the shoulders, a sap wound glowing in the chest.
  s.pair((side, x) => s.ball(`arm${side}`, s.j(`arm${side}`).add(V(x * 0.02 * H, 0.05 * H, 0)), V(0.06 * H, 0.03 * H, 0.06 * H), { mat: 'alt', k: 0.02 * H }));
  s.boil('chest', ch.clone().add(V(0.04 * H, -0.02 * H, 0.12 * H)), 0.018 * H, 0.8, SAP);
  for (let i = 0; i < 3; i++) s.boil('chest', ch.clone().add(V((r() - 0.5) * 0.2 * H, (r() - 0.5) * 0.1 * H, 0.11 * H)), 0.008 * H, 0.7, SPORE);
}

const PLANT: Record<string, LookFactory> = {
  spore_pod: (c) =>
    moundLook(c, {
      height: 0.8,
      radius: 0.42,
      lobes: 5,
      skin: { surface: 'flesh', tint: 0x8a9a5a },
      metal: { surface: 'flesh', tint: 0xb0a080 },
      sculpt: (s, H, R) => {
        // A swollen puffball on a skirt of roots, caps on top, spore vents glowing.
        const b = s.j('body');
        const t = s.j('top');
        s.ball('body', b, V(R * 0.85, H * 0.32, R * 0.85));
        s.ball('top', t, V(R * 0.7, H * 0.36, R * 0.7), { k: R * 0.2 });
        for (let i = 0; i < 5; i++) {
          const l = s.j(`lobe${i}`);
          s.ball(`lobe${i}`, l, R * 0.22, { k: R * 0.12 });
          const d = V(l.x, 0, l.z).normalize();
          s.hard(`lobe${i}`, spikeGeo(l, l.clone().addScaledVector(d, R * 0.5).add(V(0, -H * 0.1, 0)), R * 0.08, 4, V(0, -H * 0.03, 0), 2), 'skin', THORN);
        }
        const r = seq(351);
        for (let i = 0; i < 7; i++) {
          const a = r() * Math.PI * 2;
          const e = 0.3 + r() * 0.8;
          const p = t.clone().add(V(Math.cos(a) * Math.sin(e) * R * 0.7, Math.cos(e) * H * 0.36, Math.sin(a) * Math.sin(e) * R * 0.7));
          s.boil('top', p, R * (0.07 + r() * 0.05), 1, SPORE);
        }
        cap(s, 'top', t.clone().add(V(R * 0.2, H * 0.38, 0)), R * 0.32, R * 0.16, { tilt: V(0.3, 1, 0), stem: R * 0.2, spots: WART, n: 4 });
        cap(s, 'top', t.clone().add(V(-R * 0.25, H * 0.32, -R * 0.1)), R * 0.22, R * 0.11, { tilt: V(-0.4, 1, -0.2), stem: R * 0.15 });
        s.pair((side) => {
          s.limb(`pod${side}`, s.j(`pod${side}`), s.j(`pod${side}2`), R * 0.08, R * 0.06, { k: R * 0.06 });
          s.limb(`pod${side}2`, s.j(`pod${side}2`), s.j(`pod${side}Tip`), R * 0.06, R * 0.02, { k: R * 0.04 });
        });
      },
      paint: { skin: { grime: 0.4, ao: 0.9, mottle: { scale: 8, amount: 0.5, col: [0.55, 0.6, 0.3] } }, metal: { grime: 0.2, ao: 0.8, mottle: { scale: 6, amount: 0.3, col: [0.7, 0.6, 0.45] } } },
      style: { heavy: 0.2, attacks: ['engulf', 'hurl'], spawn: 'emerge', death: 'splat', idle: 'breathe', gait: 'roll' },
    }),
  thorn_creeper: (c) =>
    vineLook(c, {
      length: 2.6,
      girth: 0.1,
      rise: 0.75,
      skin: { surface: 'bark', tint: 0x5a5a32 },
      metal: { surface: 'flesh', tint: 0xa03a3a },
      sculpt: (s, g) => {
        serpentBody(s, { girth: g });
        const all = ['body', 'f1', 'f2', 'f3', 'f4', 't1', 't2', 't3', 't4', 't5'];
        all.forEach((n, i) => {
          thorns(s, n, s.j(n), g * (n.startsWith('t') ? 1 - 0.12 * Number(n.slice(1)) : 0.9), 4, g * 0.9, 361 + i);
          if (i % 2 === 0) leaf(s, n, s.j(n).add(V(g * 0.7, g * 0.3, 0)), V(1, 0.5, -0.4), g * 2.2, g * 1.0);
          else leaf(s, n, s.j(n).add(V(-g * 0.7, g * 0.3, 0)), V(-1, 0.5, -0.4), g * 2.2, g * 1.0);
        });
        // Head: a trap of two toothed lobes, red inside.
        const h = s.j('head');
        const sn = s.j('snout');
        const fwd = sn.clone().sub(h).normalize();
        const w = g * 1.6;
        s.ball('head', h.clone().addScaledVector(fwd, w * 0.6).add(V(0, w * 0.25, 0)), V(w * 0.9, w * 0.35, w * 1.0), { k: w * 0.15 });
        s.ball('head', h.clone().addScaledVector(fwd, w * 0.6).add(V(0, w * 0.12, 0)), V(w * 0.75, w * 0.18, w * 0.85), { mat: 'metal', k: w * 0.05 });
        s.ball('jaw', s.j('jaw').addScaledVector(fwd, w * 0.5).add(V(0, -w * 0.1, 0)), V(w * 0.85, w * 0.3, w * 0.95), { k: w * 0.15 });
        s.ball('jaw', s.j('jaw').addScaledVector(fwd, w * 0.5).add(V(0, 0.0, 0)), V(w * 0.7, w * 0.15, w * 0.8), { mat: 'metal', k: w * 0.05 });
        for (let i = 0; i < 9; i++) {
          const a = (i / 8 - 0.5) * Math.PI * 1.2;
          const rim = V(Math.sin(a) * w * 0.85, 0, Math.cos(a) * w * 0.95);
          const pu = h.clone().addScaledVector(fwd, w * 0.6).add(rim).add(V(0, w * 0.1, 0));
          s.hard('head', spikeGeo(pu, pu.clone().add(V(rim.x * 0.15, -w * 0.45, rim.z * 0.15)), w * 0.06, 4, undefined, 1), 'skin', TOOTH);
          const pl = s.j('jaw').addScaledVector(fwd, w * 0.5).add(rim).add(V(0, 0.0, 0));
          s.hard('jaw', spikeGeo(pl, pl.clone().add(V(rim.x * 0.15, w * 0.4, rim.z * 0.15)), w * 0.06, 4, undefined, 1), 'skin', TOOTH);
        }
        s.glow(h.clone().addScaledVector(fwd, w * 0.6), w * 0.5, 0.5, [0.8, 0.2, 0.2]);
        s.pair((_side, x) => leaf(s, 'head', h.clone().add(V(x * w * 0.6, w * 0.1, -w * 0.2)), V(x, 0.3, -0.8), w * 1.6, w * 0.6));
      },
      style: { heavy: 0.3, attacks: ['bite', 'lash'], spawn: 'emerge', death: 'coil', idle: 'sway', gait: 'slither' },
    }),
  strangler_vine: (c) =>
    vineLook(c, {
      length: 3.0,
      girth: 0.12,
      rise: 0.85,
      front: 5,
      rear: 6,
      skin: { surface: 'bark', tint: 0x7a8a52 },
      sculpt: (s, g) => {
        serpentBody(s, { girth: g });
        const front = ['body', 'f1', 'f2', 'f3', 'f4', 'f5'];
        const rear = ['t1', 't2', 't3', 't4', 't5', 't6'];
        // Two thinner vines twisting round the main one.
        const all = [...front, ...rear];
        all.forEach((n, i) => {
          const p = s.j(n);
          const next = i + 1 < front.length ? s.j(front[i + 1]!) : n.startsWith('t') && i + 1 < all.length ? s.j(all[i + 1]!) : p.clone().add(V(0, 0, 0.2));
          const d = next.clone().sub(p);
          const len = d.length();
          const dn = d.normalize();
          const u = V(0, 1, 0).cross(dn).normalize();
          const v = dn.clone().cross(u);
          for (let k = 0; k < 2; k++) {
            const pts: THREE.Vector3[] = [];
            for (let j = 0; j <= 6; j++) {
              const t = j / 6;
              const a = (i + t) * Math.PI + k * Math.PI;
              pts.push(p.clone().addScaledVector(dn, len * t).addScaledVector(u, Math.cos(a) * g * 0.95).addScaledVector(v, Math.sin(a) * g * 0.95));
            }
            s.hard(n, tubeGeo(pts, () => g * 0.3, 5), 'skin');
          }
          if (i % 2 === 1) leaf(s, n, p.clone().add(V(0, g * 0.8, 0)), V((i % 4) - 1.5, 0.8, -0.4), g * 2.4, g * 1.1);
        });
        // Head: a clutch of curling tendrils round a glowing seed.
        const h = s.j('head');
        const sn = s.j('snout');
        const fwd = sn.clone().sub(h).normalize();
        s.ball('head', h, g * 0.9, { k: g * 0.3 });
        s.boil('head', h.clone().addScaledVector(fwd, g * 0.7), g * 0.4, 1, SPORE);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const out = V(Math.cos(a), Math.sin(a), 0);
          const base = h.clone().add(out.clone().multiplyScalar(g * 0.6)).addScaledVector(fwd, g * 0.3);
          tentacle(s, i < 3 ? 'head' : 'jaw', base, out.clone().multiplyScalar(0.6).add(fwd), g * 4.2, g * 0.3, out.clone().multiplyScalar(-g * 1.2).addScaledVector(fwd, g * 0.5));
        }
      },
      style: { heavy: 0.4, attacks: ['lash', 'bite'], spawn: 'emerge', death: 'coil', idle: 'sway', gait: 'slither' },
    }),
  bloom_cannon: (c) =>
    bloomLook(c, {
      hover: 1.1,
      radius: 0.24,
      tendrils: 5,
      size: 1.2,
      skin: { surface: 'bark', tint: 0x4a5c30 },
      alt: { surface: 'moss', tint: 0x6a8a3a },
      metal: { surface: 'flesh', tint: 0xc8b040 },
      sculpt: (s, R) => {
        // A bulb buoyed by a gas sac, a long flower barrel aimed forward, roots trailing.
        const c0 = s.j('core');
        s.ball('core', c0, V(R * 0.8, R * 0.75, R * 0.85), { k: R * 0.1 });
        s.ball('crown', s.j('crown').add(V(0, R * 0.25, -R * 0.15)), V(R * 0.7, R * 0.6, R * 0.7), { mat: 'alt', k: R * 0.15 });
        const e = s.j('eye');
        // The barrel: a flaring trumpet, hollow, glowing at the bottom.
        s.limb('eye', e.clone().add(V(0, 0, -R * 0.2)), e.clone().add(V(0, R * 0.1, R * 1.2)), R * 0.3, R * 0.42, { mat: 'metal', k: R * 0.08 });
        s.limb('eye', e.clone().add(V(0, R * 0.05, R * 0.3)), e.clone().add(V(0, R * 0.12, R * 1.4)), R * 0.16, R * 0.34, { mat: 'metal', sub: true, k: R * 0.04 });
        s.boil('eye', e.clone().add(V(0, R * 0.05, R * 0.35)), R * 0.17, 1, SPORE);
        petals(s, 'eye', e.clone().add(V(0, R * 0.1, R * 1.15)), V(0, 0.1, 1), 6, R * 0.6, R * 0.35, [0.85, 0.75, 0.25], 'metal', 0.5, 371);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          leaf(s, 'core', c0.clone().add(V(Math.sin(a) * R * 0.6, -R * 0.4, Math.cos(a) * R * 0.6)), V(Math.sin(a), -0.4, Math.cos(a)), R * 1.2, R * 0.45);
        }
        hangers(s, 5, R * 0.12);
      },
      paint: { metal: { grime: 0.2, ao: 0.8, tips: { amount: 0.5, col: [0.9, 0.4, 0.2] } } },
      style: { attacks: ['lash'], ranged: true, idle: 'hover', spawn: 'emerge', death: 'collapse' },
    }),
  fungal_shambler: (c) =>
    walkLook(c, {
      height: 1.8,
      rig: { shoulders: 0.13, hips: 0.065, arms: 1.12, hunch: 0.35 },
      skin: { surface: 'rot', tint: 0x7a8a5a },
      alt: { surface: 'moss', tint: 0x5a7a3a },
      metal: { surface: 'flesh', tint: 0xb0986a },
      sculpt: shambler,
      paint: {
        skin: { grime: 0.5, ao: 0.9, mottle: { scale: 6, amount: 0.5, col: [0.5, 0.55, 0.35] } },
        metal: { grime: 0.3, ao: 0.85, mottle: { scale: 9, amount: 0.3, col: [0.6, 0.5, 0.35] } },
      },
      style: { heavy: 0.35, attacks: ['chop', 'swing'], armed: 'one', idle: 'sway', gait: 'shamble', spawn: 'rise', death: 'collapse' },
    }),
  deathcap_priest: (c) =>
    walkLook(c, {
      height: 1.8,
      rig: { shoulders: 0.12, hips: 0.06, arms: 1.05, hunch: 0.2 },
      skin: { surface: 'flesh', tint: 0xb8b0a0 },
      alt: { surface: 'cloth', tint: 0x2a3020 },
      metal: { surface: 'flesh', tint: 0xa02a2a },
      sculpt: (s, H) => {
        deathcapPriest(s, H);
        // The staff head: a toadstool glowing pink.
        const top = lerpV(s.j('handR'), s.j('handRTip'), 0.55).addScaledVector(WEAPON_DIR, 0.64 * 0.9 * H);
        cap(s, 'handR', top, 0.05 * H, 0.03 * H, { spots: [1.3, 0.7, 1.0], n: 5, glow: 1, tilt: WEAPON_DIR });
        s.boil('handR', top.clone().add(V(0, -0.02 * H, 0)), 0.018 * H, 1, [1.3, 0.6, 0.9]);
      },
      paint: {
        skin: { grime: 0.4, ao: 0.85, mottle: { scale: 7, amount: 0.35, col: [0.65, 0.6, 0.5] } },
        alt: { grime: 0.5, ao: 0.85, tips: { amount: 0.5, col: [0.3, 0.32, 0.2] } },
        metal: { grime: 0.15, ao: 0.8, top: { amount: 0.2, col: [1.2, 1.1, 1.1] } },
      },
      style: { heavy: 0.2, attacks: ['hurl', 'lash'], ranged: true, castBoth: true, armed: 'staff', idle: 'sway', gait: 'walk', spawn: 'rise', death: 'collapse' },
    }),
  blight_flower: (c) =>
    bloomLook(c, {
      hover: 1.35,
      radius: 0.28,
      tendrils: 6,
      size: 1.15,
      skin: { surface: 'bark', tint: 0x3a2a30 },
      alt: { surface: 'moss', tint: 0x4a5a2a },
      metal: { surface: 'flesh', tint: 0xb04a9a },
      sculpt: (s, R) => {
        // A great sick flower facing its prey: petals round an eye in a toothed throat.
        const c0 = s.j('core');
        s.ball('core', c0.clone().add(V(0, 0, -R * 0.2)), V(R * 0.7, R * 0.7, R * 0.6), { k: R * 0.1 });
        const e = s.j('eye');
        petals(s, 'eye', e.clone().add(V(0, 0, -R * 0.1)), V(0, 0.05, 1), 8, R * 1.5, R * 0.75, [0.55, 0.2, 0.5], 'metal', 0.25, 381);
        petals(s, 'eye', e.clone().add(V(0, 0, 0.0)), V(0, 0.05, 1), 6, R * 0.9, R * 0.5, [0.75, 0.3, 0.6], 'metal', 0.4, 383);
        maw(s, 'eye', e.clone().add(V(0, 0, R * 0.15)), R * 0.32, V(0, 0, 1), 10, 0.3);
        eyeball(s, 'eye', e.clone().add(V(0, 0, R * 0.02)), R * 0.2, V(0, 0, 1), [1.2, 0.5, 1.3], false);
        // Thorny sepals behind, and roots hanging.
        thorns(s, 'core', c0.clone().add(V(0, 0, -R * 0.35)), R * 0.6, 7, R * 0.5, 385);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          leaf(s, 'core', c0.clone().add(V(Math.sin(a) * R * 0.5, Math.cos(a) * R * 0.5, -R * 0.4)), V(Math.sin(a), Math.cos(a), -0.6), R * 1.0, R * 0.4, DEADLEAF);
        }
        hangers(s, 6, R * 0.11);
      },
      paint: { metal: { grime: 0.2, ao: 0.85, mottle: { scale: 8, amount: 0.4, col: [0.4, 0.15, 0.35] }, tips: { amount: 0.6, col: [0.25, 0.3, 0.12] } } },
      style: { heavy: 0.3, attacks: ['lash', 'hurl'], ranged: true, castBoth: true, idle: 'hover', spawn: 'emerge', death: 'collapse' },
    }),
  ancient_treant: (c) =>
    walkLook(c, {
      height: 1.9,
      kind: 'giant',
      rig: { hip: 0.44, shoulders: 0.2, hips: 0.085, arms: 1.35, hunch: 0.3, head: 0.75, armOut: 0.4 },
      skin: { surface: 'bark', tint: 0xa08a68 },
      alt: { surface: 'moss', tint: 0x6a8a3a },
      sculpt: treant,
      paint: { skin: { grime: 0.5, ao: 0.95, mottle: { scale: 5, amount: 0.35, col: [0.45, 0.5, 0.35] }, top: { amount: 0.2, col: [0.9, 1.1, 0.8] } }, alt: { grime: 0.3, ao: 0.85, tips: { amount: 0.4, col: [0.6, 0.5, 0.25] } } },
      lumps: { amp: 0.012, scale: 9 },
      soft: { skin: 0.02 },
      style: { heavy: 0.9, attacks: ['slam', 'swing', 'stomp'], idle: 'breathe', gait: 'lumber', spawn: 'rise', death: 'crash' },
    }),
  root_horror: (c) =>
    moundLook(c, {
      height: 1.0,
      radius: 0.55,
      lobes: 6,
      skin: { surface: 'bark', tint: 0x5a4a32 },
      alt: { surface: 'moss', tint: 0x4a6a2a },
      metal: { surface: 'bone', tint: 0xc8b898 },
      sculpt: (s, H, R) => {
        // A knot of roots and earth heaved up out of the floor, a wooden maw, knot-hole eyes.
        const b = s.j('body');
        const t = s.j('top');
        s.ball('body', b, V(R * 0.85, H * 0.3, R * 0.8));
        s.ball('top', t, V(R * 0.55, H * 0.3, R * 0.5), { k: R * 0.15 });
        for (let i = 0; i < 6; i++) s.ball(`lobe${i}`, s.j(`lobe${i}`), R * 0.25, { k: R * 0.12 });
        maw(s, 'top', t.clone().add(V(0, -H * 0.04, R * 0.45)), R * 0.22, V(0, 0, 1), 9, 0.1);
        s.pair((_side, x) => {
          const p = t.clone().add(V(x * R * 0.25, H * 0.12, R * 0.4));
          s.ball('top', p, R * 0.07, { sub: true, k: R * 0.02 });
          s.eye('top', p.clone().add(V(0, 0, -R * 0.02)), R * 0.045, 1.6);
        });
        // Roots everywhere: off the lobes into the floor, up off the back, and the pods.
        const r = seq(391);
        for (let i = 0; i < 6; i++) {
          const l = s.j(`lobe${i}`);
          const d = V(l.x, 0, l.z).normalize();
          for (let k = 0; k < 2; k++) {
            const dd = d.clone().add(V((r() - 0.5) * 0.6, -0.3, (r() - 0.5) * 0.6)).normalize();
            tentacle(s, `lobe${i}`, l.clone().addScaledVector(d, R * 0.1), dd, R * (0.7 + r() * 0.5), R * 0.07, V(0, -H * 0.12, 0));
          }
        }
        for (let i = 0; i < 5; i++) {
          const a = (i / 4 - 0.5) * 2.4;
          branch(s, 'top', t.clone().add(V(Math.sin(a) * R * 0.35, H * 0.15, -R * 0.3)), V(Math.sin(a) * 0.7, 1, -0.5), R * 0.8, R * 0.06, 393 + i, 1, 0);
        }
        s.pair((side) => {
          s.limb(`pod${side}`, s.j(`pod${side}`), s.j(`pod${side}2`), R * 0.12, R * 0.09, { k: R * 0.06 });
          s.limb(`pod${side}2`, s.j(`pod${side}2`), s.j(`pod${side}Tip`), R * 0.09, R * 0.03, { k: R * 0.04 });
          claws(s, `pod${side}2`, `pod${side}Tip`, 3, 0.14, 0.012, 'skin', THORN, 0.6);
        });
        // Moss in patches, a bone or two caught in the roots.
        for (let i = 0; i < 4; i++) s.ball('body', b.clone().add(V((r() - 0.5) * R * 1.4, H * 0.18, (r() - 0.5) * R * 1.2)), R * (0.15 + r() * 0.1), { mat: 'alt', k: R * 0.08 });
        s.hard('body', ballGeo(b.clone().add(V(R * 0.55, H * 0.12, R * 0.5)), R * 0.1, 1), 'metal');
        s.hard('body', tubeGeo([b.clone().add(V(-R * 0.6, H * 0.05, R * 0.4)), b.clone().add(V(-R * 0.3, H * 0.2, R * 0.65))], () => R * 0.025, 5), 'metal');
      },
      paint: { skin: { grime: 0.55, ao: 0.95, mottle: { scale: 5, amount: 0.4, col: [0.4, 0.38, 0.3] } }, alt: { grime: 0.3, ao: 0.85 } },
      style: { heavy: 0.6, attacks: ['engulf', 'lash', 'swing'], spawn: 'emerge', death: 'splat', idle: 'breathe', gait: 'roll' },
    }),
  corpse_bloom: (c) =>
    bloomLook(c, {
      hover: 1.3,
      radius: 0.3,
      tendrils: 5,
      size: 1.15,
      skin: { surface: 'rot', tint: 0x6f7a4a },
      alt: { surface: 'moss', tint: 0x4a5a2a },
      metal: { surface: 'flesh', tint: 0x9a3a3a },
      sculpt: (s, R) => {
        // A carrion flower: five thick warty petals round a deep toothed well, a skull caught in its roots.
        const c0 = s.j('core');
        s.ball('core', c0, V(R * 0.7, R * 0.55, R * 0.7), { k: R * 0.1 });
        const top = c0.clone().add(V(0, R * 0.35, R * 0.1));
        petals(s, 'core', top, V(0, 1, 0.35), 5, R * 1.6, R * 1.0, [0.65, 0.2, 0.18], 'metal', 0.15, 401);
        const r = seq(403);
        for (let i = 0; i < 18; i++) {
          const a = r() * Math.PI * 2;
          const d = r() * R * 1.3 + R * 0.3;
          s.boil('core', top.clone().add(V(Math.cos(a) * d, R * 0.05 - d * 0.1, Math.sin(a) * d * 0.9 + d * 0.05)), R * (0.04 + r() * 0.04), 0, WART);
        }
        maw(s, 'core', top.clone().add(V(0, R * 0.05, 0)), R * 0.35, V(0, 1, 0.35), 12, 0.35);
        s.boil('core', top.clone().add(V(0, -R * 0.15, -R * 0.05)), R * 0.15, 1, [1.2, 0.5, 0.7]);
        // A skull and ribs held in the roots under it.
        const sk = c0.clone().add(V(R * 0.2, -R * 0.75, R * 0.15));
        s.hard('core', ballGeo(sk, R * 0.18, 1), 'skin', [0.85, 0.8, 0.65]);
        s.pair((_side, x) => s.hard('core', ballGeo(sk.clone().add(V(x * R * 0.07, R * 0.02, R * 0.15)), R * 0.05, 0), 'skin', [0.05, 0.04, 0.03]));
        for (let i = 0; i < 3; i++) s.hard('core', tubeGeo([sk.clone().add(V(-R * 0.3, -R * 0.15 - i * R * 0.1, 0)), sk.clone().add(V(-R * 0.1, -R * 0.3 - i * R * 0.1, R * 0.15)), sk.clone().add(V(R * 0.15, -R * 0.2 - i * R * 0.1, R * 0.05))], () => R * 0.025, 4), 'skin', [0.8, 0.75, 0.6]);
        hangers(s, 5, R * 0.12);
      },
      paint: {
        skin: { grime: 0.5, ao: 0.9, mottle: { scale: 7, amount: 0.45, col: [0.45, 0.4, 0.3] } },
        metal: { grime: 0.3, ao: 0.9, mottle: { scale: 6, amount: 0.5, col: [0.5, 0.2, 0.2] }, tips: { amount: 0.4, col: [0.35, 0.25, 0.15] } },
      },
      style: { heavy: 0.35, attacks: ['lash', 'hurl'], ranged: true, castBoth: true, idle: 'hover', spawn: 'emerge', death: 'collapse' },
    }),
};

export { PLANT, cap, leaf, thorns, branch, petals, mossBeard };
