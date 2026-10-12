/**
 * SLAY — what monsters hold.
 *
 * Built by the creatures stream for monsters only (hero gear is items').
 * A weapon is hard geometry bound to the hand bone, so it costs no meshing.
 * In the bind pose a right-hand weapon points forward and a little up
 * (`WEAPON_DIR`); its cutting edge faces the way a chop travels. Bows sit in
 * the left hand, stave along the forearm's forward line, string toward the
 * archer.
 */
import * as THREE from 'three';
import type { CMat, RGB, Sculpt } from './Sculpt';
import { ballGeo, bladeGeo, boxGeo, slabGeo, spikeGeo, tubeGeo } from './Sculpt';
import { V, lerpV, quatAlong } from './Kit';

export const WEAPON_DIR = V(0, 0.36, 0.93).normalize();
/** The way a chop's edge faces in the bind pose. */
const EDGE = V(0, -0.93, 0.36).normalize();
const X = V(1, 0, 0);

export type WeaponKind = 'sword' | 'axe' | 'greataxe' | 'mace' | 'dagger' | 'spear' | 'staff' | 'bow' | 'crossbow' | 'cleaver' | 'scythe' | 'hammer';

export interface WeaponOpt {
  /** Size multiple (1 = sized for the body). */
  size?: number;
  /** Paint on the metal (rust, black iron, bronze). */
  steel?: RGB;
  /** Wood and leather colour of hafts and grips. */
  wood?: RGB;
  /** A glowing head or runes (staffs, cursed blades). */
  glow?: number;
  /** Which hand (default right; bows go left). */
  side?: 'L' | 'R';
  mat?: CMat;
}

const KIND_SIZE: Partial<Record<WeaponKind, number>> = {
  sword: 0.72,
  dagger: 0.8,
  cleaver: 0.8,
  axe: 0.66,
  mace: 0.72,
  greataxe: 0.78,
  hammer: 0.85,
  scythe: 0.85,
  spear: 0.9,
  staff: 0.9,
};

const WOOD: RGB = [0.32, 0.22, 0.14];
const STEEL: RGB = [0.62, 0.6, 0.56];

/** Puts a weapon in a hand. */
export function weapon(s: Sculpt, kind: WeaponKind, o: WeaponOpt = {}): void {
  const H = s.rig.height;
  // Sized for the body: one-handers about 0.4 of body height long, polearms near it.
  const k = (o.size ?? 1) * H * (KIND_SIZE[kind] ?? 1);
  const side = o.side ?? (kind === 'bow' ? 'L' : 'R');
  const handB = `hand${side}`;
  if (!s.has(handB)) return;
  const tip = s.j(`${handB}Tip`);
  const g = lerpV(s.j(handB), tip, 0.55);
  const d = WEAPON_DIR;
  const steel = o.steel ?? STEEL;
  const wood = o.wood ?? WOOD;
  const mat = o.mat ?? 'metal';
  const at = (t: number) => g.clone().addScaledVector(d, t * k);
  const haft = (a: number, b: number, r: number, col = wood) => s.hard(handB, tubeGeo([at(a), at(b)], () => r * k, 6), mat, col);
  switch (kind) {
    case 'sword': {
      haft(-0.07, 0.05, 0.011);
      s.hard(handB, ballGeo(at(-0.08), 0.016 * k), mat, steel);
      s.hard(handB, boxGeo(at(0.055), V(0.13 * k, 0.014 * k, 0.018 * k), quatAlong(d)), mat, steel);
      s.hard(handB, bladeGeo(at(0.06), at(0.6), 0.042 * k, 0.009 * k, EDGE, 0.2), mat, steel, o.glow);
      break;
    }
    case 'dagger': {
      haft(-0.05, 0.04, 0.01);
      s.hard(handB, boxGeo(at(0.045), V(0.08 * k, 0.012 * k, 0.014 * k), quatAlong(d)), mat, steel);
      s.hard(handB, bladeGeo(at(0.05), at(0.26), 0.034 * k, 0.008 * k, EDGE, 0.35), mat, steel, o.glow);
      break;
    }
    case 'cleaver': {
      haft(-0.06, 0.06, 0.012);
      const a = at(0.06);
      const b = at(0.4);
      // A broad slab, the edge leading.
      const c = lerpV(a, b, 0.5).addScaledVector(EDGE, 0.05 * k);
      s.hard(handB, boxGeo(c, V(0.012 * k, 0.12 * k, 0.36 * k), new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, EDGE, d))), mat, steel, o.glow);
      break;
    }
    case 'axe':
    case 'greataxe': {
      const big = kind === 'greataxe' ? 1.45 : 1;
      haft(big > 1 ? -0.3 : -0.06, 0.5 * big, 0.013 * big);
      const top = at(0.44 * big);
      // A bearded head: a wedge flaring from the haft to a wide edge.
      const w = 0.17 * big * k;
      const root = top.clone().addScaledVector(EDGE, 0.01 * k);
      const edge = top.clone().addScaledVector(EDGE, w).addScaledVector(d, -0.02 * big * k);
      s.hard(handB, slabGeo(root, edge, d, 0.07 * big * k, 0.2 * big * k, 0.03 * big * k, 0.006 * k), mat, steel, o.glow);
      if (big > 1) {
        const edge2 = top.clone().addScaledVector(EDGE, -w * 0.8).addScaledVector(d, -0.02 * big * k);
        s.hard(handB, slabGeo(top.clone().addScaledVector(EDGE, -0.01 * k), edge2, d, 0.07 * big * k, 0.17 * big * k, 0.03 * big * k, 0.006 * k), mat, steel, o.glow);
      }
      // Back spike.
      if (big <= 1) s.hard(handB, spikeGeo(top, top.clone().addScaledVector(EDGE, -0.08 * big * k), 0.018 * big * k, 4, undefined, 1), mat, steel);
      break;
    }
    case 'scythe': {
      haft(-0.4, 0.75, 0.011);
      const top = at(0.74);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        pts.push(top.clone().addScaledVector(EDGE, Math.sin(t * 1.4) * 0.38 * k).addScaledVector(d, -t * t * 0.25 * k));
      }
      s.hard(handB, tubeGeo(pts, (t) => (0.02 - 0.017 * t) * k, 4), mat, steel, o.glow);
      break;
    }
    case 'mace':
    case 'hammer': {
      haft(-0.1, 0.4, 0.012);
      const top = at(0.42);
      if (kind === 'hammer') {
        s.hard(handB, boxGeo(top, V(0.08 * k, 0.16 * k, 0.08 * k), new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, EDGE, d))), mat, steel, o.glow);
      } else {
        s.hard(handB, ballGeo(top, 0.05 * k, 1), mat, steel, o.glow);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const dir = X.clone().multiplyScalar(Math.cos(a)).addScaledVector(EDGE, Math.sin(a));
          s.hard(handB, spikeGeo(top.clone().addScaledVector(dir, 0.035 * k), top.clone().addScaledVector(dir, 0.085 * k), 0.016 * k, 4, undefined, 1), mat, steel);
        }
        s.hard(handB, spikeGeo(at(0.45), at(0.52), 0.015 * k, 4, undefined, 1), mat, steel);
      }
      break;
    }
    case 'spear': {
      haft(-0.45, 0.75, 0.011);
      s.hard(handB, bladeGeo(at(0.74), at(0.95), 0.045 * k, 0.012 * k, X, 0.45), mat, steel, o.glow);
      break;
    }
    case 'staff': {
      haft(-0.55, 0.55, 0.013);
      const top = at(0.58);
      // A cage of prongs round a glowing heart.
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const out = X.clone().multiplyScalar(Math.cos(a)).addScaledVector(EDGE, Math.sin(a));
        const pts = [at(0.53), top.clone().addScaledVector(out, 0.045 * k), at(0.7).addScaledVector(out, 0.02 * k)];
        s.hard(handB, tubeGeo(pts, (t) => (0.009 - 0.006 * t) * k, 4), mat, wood);
      }
      s.hard(handB, ballGeo(at(0.61), 0.032 * k, 1), mat, [1, 1, 1], o.glow ?? 1);
      break;
    }
    case 'bow': {
      // Stave along the forearm's forward line, curving back toward the archer at the tips.
      const axis = V(0, 0.07, 1).normalize();
      const up = V(0, 1, 0);
      const pts: THREE.Vector3[] = [];
      const L = 0.42 * k;
      for (let i = 0; i <= 8; i++) {
        const t = i / 4 - 1;
        pts.push(g.clone().addScaledVector(axis, t * L).addScaledVector(up, t * t * 0.09 * k));
      }
      s.hard(handB, tubeGeo(pts, (t) => (0.011 - 0.006 * Math.abs(t - 0.5) * 2) * k + 0.003 * k, 5), mat, wood);
      const nock = lerpV(pts[0]!, pts[8]!, 0.5);
      const freeB = side === 'L' ? 'handR' : 'handL';
      if (s.has(freeB)) {
        // The string's middle is bound to the other hand's fingers, so it
        // runs tip, fingers, tip: straight while the hand rests on it, a V
        // when the hand draws it back.
        const fg = lerpV(s.j(freeB), s.j(`${freeB}Tip`), 0.55);
        s.parts.push({ bone: handB, geo: tubeGeo([pts[0]!, fg, pts[8]!], () => 0.0025 * k, 3), mat, col: [0.75, 0.72, 0.62], pull: { bone: freeB, near: fg, r: 0.01 * k } });
        s.grip = { kind: 'bow', holder: handB, free: side === 'L' ? 'R' : 'L', hold: nock, grip: g.clone(), freeGrip: fg };
      } else {
        s.hard(handB, tubeGeo([pts[0]!, pts[8]!], () => 0.0025 * k, 3), mat, [0.75, 0.72, 0.62]);
      }
      break;
    }
    case 'crossbow': {
      // Stock along the weapon line, a bow across its front.
      haft(-0.12, 0.38, 0.018);
      const front = at(0.34);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 6; i++) {
        const t = i / 3 - 1;
        pts.push(front.clone().addScaledVector(X, t * 0.25 * k).addScaledVector(d, -t * t * 0.07 * k));
      }
      s.hard(handB, tubeGeo(pts, () => 0.012 * k, 5), mat, steel);
      s.hard(handB, tubeGeo([pts[0]!, at(0.18), pts[6]!], () => 0.003 * k, 3), mat, [0.75, 0.72, 0.62]);
      const freeB = side === 'L' ? 'handR' : 'handL';
      // The other hand under the stock, behind the bow.
      if (s.has(freeB)) s.grip = { kind: 'crossbow', holder: handB, free: side === 'L' ? 'R' : 'L', hold: at(0.14), grip: g.clone(), freeGrip: lerpV(s.j(freeB), s.j(`${freeB}Tip`), 0.55) };
      break;
    }
  }
}

/** Maps the data's weapon names onto weapon kinds. */
export function weaponKind(name: string | undefined): WeaponKind | null {
  switch (name) {
    case 'sword':
    case 'axe':
    case 'mace':
    case 'dagger':
    case 'spear':
    case 'staff':
    case 'bow':
      return name;
    default:
      return null;
  }
}
