/**
 * SLAY — hair, brows, beards, hoods and masks.
 *
 * Each is a shell grown from the head's own field, like the undergarments:
 * pushed out by its thickness, cut to its line (hairline, beard line, the
 * face opening of a hood) and, for hair that hangs, given extra shapes. The
 * shell skins from the body's field, so hair over the back follows the back.
 * Strands are a normal map painted in code and projected in the bind pose.
 */
import * as THREE from 'three';
import { G } from './Anatomy';
import type { BodyMesh } from './Body';
import { garment, type GarmentSpec } from './Garment';
import { FieldBuilder, rot } from './Sdf';
import type { Clip } from './Mesher';
import type { HeroLook } from './Looks';
import { fabricMaterial, hairMaterial } from './HeroMaterials';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Distance to a rounded box, centred at c with half size b. */
function sdBox(x: number, y: number, z: number, c: THREE.Vector3, b: THREE.Vector3, r: number): number {
  const qx = Math.abs(x - c.x) - b.x + r;
  const qy = Math.abs(y - c.y) - b.y + r;
  const qz = Math.abs(z - c.z) - b.z + r;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  const oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

/** Distance to an ellipsoid (approximate, fine for cuts). */
function sdEll(x: number, y: number, z: number, c: THREE.Vector3, r: THREE.Vector3): number {
  const dx = (x - c.x) / r.x;
  const dy = (y - c.y) / r.y;
  const dz = (z - c.z) / r.z;
  const k = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return (k - 1) * Math.min(r.x, r.y, r.z);
}

function sdSphere(x: number, y: number, z: number, c: THREE.Vector3, r: number): number {
  return Math.hypot(x - c.x, y - c.y, z - c.z) - r;
}

const smooth = (a: number, b: number, t: number) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** Small clumps so a shell reads as hair, not a cap. */
function clumps(h: number, base: number, top: number, lump: number): (x: number, y: number, z: number) => number {
  return (x, y, z) => {
    const t = smooth(6.85 * h, 7.4 * h, y);
    const n = Math.sin(x * 160 + Math.sin(z * 90) * 1.6) * Math.sin(z * 140 + y * 60) * Math.sin(y * 120 + x * 50);
    return base + (top - base) * t + lump * n;
  };
}

type F3 = (x: number, y: number, z: number) => number;

/**
 * Thins a shell toward its cut lines so it grows out of the skin instead of
 * stopping at a hard edge. Each `inside` is positive within the kept region.
 */
function taper(base: F3, inside: F3[], band: number): F3 {
  return (x, y, z) => {
    let k = 1;
    for (const f of inside) k = Math.min(k, smooth(0, band, f(x, y, z)));
    return 0.0005 + (base(x, y, z) - 0.0005) * k;
  };
}

export interface HeroPart {
  name: string;
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
}

/** Every head part a look wears: hair, brows, beard, hood, mask. */
export function headParts(body: BodyMesh, look: HeroLook): HeroPart[] {
  const h = body.anatomy.h;
  const H = (x: number, y: number, z: number) => V(x * h, y * h, z * h);
  const out: HeroPart[] = [];
  const hair = hairMaterial(look.hair.color);
  const grow = (name: string, spec: GarmentSpec, mat: THREE.Material) => out.push({ name, geo: garment(body, name, spec), mat });

  // Cuts shared by scalp hair: the face, under the hairline, and the ears.
  const face: Clip = { cut: (x, y, z) => sdBox(x, y, z, H(0, 6.5, 0.6), H(0.34, 0.72, 0.48), 0.14 * h) };
  const ears: Clip = {
    cut: (x, y, z) => Math.min(sdSphere(x, y, z, H(0.38, 6.92, -0.05), 0.15 * h), sdSphere(x, y, z, H(-0.38, 6.92, -0.05), 0.15 * h)),
  };
  // The hairline drops from the brow to the nape.
  const n = V(0, -1, 0.62).normalize();
  const nape = (y: number): Clip => ({ n, d: n.dot(H(0, y, -0.42)) });
  const faceIn: F3 = (x, y, z) => (face as { cut: F3 }).cut(x, y, z);
  const earsIn: F3 = (x, y, z) => (ears as { cut: F3 }).cut(x, y, z);
  const napeIn = (y0: number): F3 => {
    const d0 = n.dot(H(0, y0, -0.42));
    return (x, y, z) => d0 - (n.x * x + n.y * y + n.z * z);
  };
  const cut = look.hair.cut;
  const hooded = !!look.hood;

  if (!hooded && cut !== 'none') {
    const F = new FieldBuilder();
    F.group = G.head;
    let spec: GarmentSpec;
    if (cut === 'long') {
      // Hangs behind the shoulders and over the ears.
      F.ellipsoid(H(0, 6.62, -0.3), V(0.38 * h, 0.62 * h, 0.2 * h), 0.12 * h);
      F.cone(H(0, 6.9, -0.36), H(0, 5.55, -0.4), 0.3 * h, 0.2 * h, 0.12 * h);
      for (const s of [1, -1]) F.cone(H(s * 0.3, 6.95, -0.1), H(s * 0.3, 6.15, -0.16), 0.1 * h, 0.07 * h, 0.08 * h);
      spec = {
        groups: [G.head],
        thickness: taper(clumps(h, 0.01, 0.016, 0.003), [faceIn], 0.05 * h),
        clips: [face, { n: V(0, -1, 0), d: -5.5 * h }],
        extra: F.prims,
        skinGroups: [G.head, G.torso],
        cell: 0.0055,
        tris: 3200,
        yRange: [5.4 * h, 7.7 * h],
      };
    } else {
      const thick = cut === 'shaved' ? [0.0025, 0.003, 0.0005] : cut === 'crop' ? [0.004, 0.009, 0.0015] : [0.005, 0.009, 0.002];
      if (cut === 'ponytail') {
        F.ellipsoid(H(0, 7.08, -0.43), V(0.07 * h, 0.07 * h, 0.06 * h), 0.03 * h);
        F.cone(H(0, 7.04, -0.47), H(0, 6.5, -0.56), 0.085 * h, 0.06 * h, 0.04 * h);
        F.cone(H(0, 6.5, -0.56), H(0, 6.05, -0.5), 0.06 * h, 0.025 * h, 0.04 * h);
      } else if (cut === 'knot') {
        F.ellipsoid(H(0, 7.3, -0.36), V(0.13 * h, 0.12 * h, 0.12 * h), 0.05 * h);
      } else if (cut === 'braids') {
        for (const s of [1, -1]) {
          for (let i = 0; i < 9; i++) {
            const t = i / 8;
            const c = H(s * (0.34 + 0.02 * Math.sin(i * 1.7)), 6.86 - t * 1.05, -0.16 + t * 0.12);
            F.ellipsoid(c, V(0.045 * h * (1 - 0.3 * t), 0.06 * h, 0.042 * h * (1 - 0.3 * t)), 0.02 * h, rot(0, 0, s * (i % 2 ? 0.4 : -0.4)));
          }
        }
      }
      spec = {
        groups: [G.head],
        thickness: taper(clumps(h, thick[0], thick[1], thick[2]), [faceIn, earsIn, napeIn(cut === 'braids' ? 6.62 : 6.72)], 0.06 * h),
        clips: [face, ears, nape(cut === 'braids' ? 6.62 : 6.72)],
        extra: F.prims.length ? F.prims : undefined,
        skinGroups: [G.head, G.torso],
        cell: 0.0045,
        tris: cut === 'shaved' ? 1600 : 2600,
        yRange: [(cut === 'braids' ? 5.8 : cut === 'ponytail' ? 5.95 : 6.55) * h, 7.7 * h],
      };
      // Hanging extras (tail, braids, knot) are spared the ear and nape cuts.
      if (spec.extra) {
        const ex = F.build();
        const d0 = n.dot(H(0, cut === 'braids' ? 6.62 : 6.72, -0.42));
        const earCut = (ears as { cut: (x: number, y: number, z: number) => number }).cut;
        spec.clips = [face, { cut: (x, y, z) => (ex.eval(x, y, z) < 0.012 ? 1 : Math.min(earCut(x, y, z), d0 - (n.x * x + n.y * y + n.z * z))) }];
      }
    }
    grow(`hair-${cut}`, spec, hair);
  }

  // Brows, unless the face is a skull.
  if (!look.face.skull) {
    const fem = look.shape.sex === 'female';
    const boxes = [1, -1].map((s) => ({ c: H(s * 0.15, 7.115 + (fem ? 0.01 : 0), 0.4), b: H(0.1, fem ? 0.016 : 0.024, 0.16) }));
    grow(
      'brows',
      {
        groups: [G.head],
        thickness: fem ? 0.0022 : 0.0032,
        clips: [{ cut: (x, y, z) => -Math.min(...boxes.map((q) => sdBox(x, y - (Math.abs(x) - 0.12 * h) * -0.18, z, q.c, q.b, 0.012 * h))) }],
        cell: 0.0028,
        tris: 500,
        yRange: [7.0 * h, 7.25 * h],
      },
      hairMaterial(look.hair.brows ?? look.hair.color),
    );
  }

  // Beards: full (2) or short (1), with the mouth left clear.
  if (look.hair.beard) {
    const full = look.hair.beard === 2;
    const top = V(0, 1, 0.58).normalize();
    grow(
      `beard-${look.hair.beard}`,
      {
        groups: [G.head],
        thickness: taper(
          (x, y, z) => {
            // Fuller at the chin, thinner up the cheeks.
            const chin = 1 - smooth(6.45 * h, 6.8 * h, y);
            const lump = 0.0012 * Math.sin(x * 220) * Math.sin(y * 260 + z * 80);
            return (full ? 0.004 + 0.008 * chin : 0.003 + 0.0025 * chin) + lump;
          },
          [
            (x, y, z) => top.dot(H(0, 6.94, 0.02)) - (top.y * y + top.z * z),
            (x, y, z) => z + 0.02 * h,
            (x, y, z) => sdBox(x, y, z, H(0, 6.7, 0.46), H(0.1, 0.034, 0.1), 0.025 * h),
          ],
          0.07 * h,
        ),
        clips: [
          { n: top, d: top.dot(H(0, 6.94, 0.02)) },
          { n: V(0, 0, -1), d: 0.02 * h },
          { n: V(0, -1, 0), d: -(full ? 6.36 : 6.44) * h },
          { cut: (x, y, z) => sdBox(x, y, z, H(0, 6.7, 0.46), H(0.1, 0.034, 0.1), 0.025 * h) },
        ],
        cell: 0.0042,
        tris: full ? 1800 : 1300,
        yRange: [6.3 * h, 7.0 * h],
      },
      hair,
    );
  }

  // A hood over the head and shoulders, the face left open.
  if (hooded) {
    const F = new FieldBuilder();
    F.group = G.head;
    F.ellipsoid(H(0, 7.12, -0.1), V(0.42 * h, 0.5 * h, 0.52 * h), 0.12 * h);
    F.cone(H(0, 7.3, -0.3), H(0, 7.0, -0.7), 0.16 * h, 0.03 * h, 0.12 * h);
    grow(
      'hood',
      {
        groups: [G.head, G.torso],
        thickness: (x, y, z) => 0.016 + 0.004 * Math.sin(x * 40 + z * 25) * Math.sin(y * 30),
        clips: [{ cut: (x, y, z) => sdEll(x, y, z, H(0, 6.86, 0.5), H(0.27, 0.42, 0.42)) }, { n: V(0, -1, 0), d: -5.72 * h }],
        extra: F.prims,
        skinGroups: [G.head, G.torso],
        cell: 0.007,
        tris: 2600,
        yRange: [5.6 * h, 7.8 * h],
      },
      fabricMaterial('wool', look.cloth, 0.95),
    );
  }
  if (look.mask) {
    grow(
      'mask',
      {
        groups: [G.head],
        thickness: 0.006,
        clips: [{ n: V(0, 1, 0), d: 6.94 * h }, { n: V(0, 0, -1), d: -0.02 * h }, { n: V(0, -1, 0), d: -6.2 * h }],
        cell: 0.005,
        tris: 1400,
        yRange: [6.1 * h, 7.0 * h],
      },
      fabricMaterial('linen', look.cloth, 0.95),
    );
  }
  return out;
}
