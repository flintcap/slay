/**
 * SLAY — the toolkit every worn piece is cut with.
 *
 * A piece is a list of parts. Most are shells of the hero's own body field
 * (see `Garment.ts`): pushed out by a thickness, cut by planes and fields to
 * an outline. The rest are fittings: small solid shapes (pauldron lames, a
 * buckle, rivets, horns) gathered per material and meshed as one part each.
 *
 * `Kit` holds the context of one piece on one body: the item's look, the
 * hero's joints, cut helpers, a ray caster that finds the body's surface (so
 * a rivet sits on a broad knight and a slight mage alike), and the
 * material buckets. The cut tables live in `ArmourChest.ts`,
 * `ArmourHead.ts` and `ArmourLimbs.ts`; unique and set decorations in
 * `ArmourFeatures.ts`.
 */
import * as THREE from 'three';
import type { Feature, ItemLook } from '../ItemLook';
import { keyColor, surfaceFinish } from '../ItemLook';
import { G } from './Anatomy';
import type { BodyMesh } from './Body';
import type { GarmentSpec } from './Garment';
import { fabricMaterial, gearMaterial, glowingTwin, glowMaterial } from './HeroMaterials';
import type { Clip, Inflate } from './Mesher';
import { Field, FieldBuilder, type Prim } from './Sdf';
import type { HeroBone } from './Rig';

export type F3 = (x: number, y: number, z: number) => number;
export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const smooth = (a: number, b: number, t: number) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
export const fract = (v: number) => v - Math.floor(v);

export function sdBox(x: number, y: number, z: number, c: THREE.Vector3, b: THREE.Vector3, r: number): number {
  const qx = Math.abs(x - c.x) - b.x + r;
  const qy = Math.abs(y - c.y) - b.y + r;
  const qz = Math.abs(z - c.z) - b.z + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

/** Distance to an ellipsoid (approximate, fine for cuts). */
export function sdEll(x: number, y: number, z: number, c: THREE.Vector3, r: THREE.Vector3): number {
  const dx = (x - c.x) / r.x;
  const dy = (y - c.y) / r.y;
  const dz = (z - c.z) / r.z;
  return (Math.sqrt(dx * dx + dy * dy + dz * dz) - 1) * Math.min(r.x, r.y, r.z);
}

export interface Part {
  name: string;
  spec: GarmentSpec;
  mat: THREE.Material;
}

/** A point on the body's surface and the way out of it. */
export interface Hit {
  p: THREE.Vector3;
  n: THREE.Vector3;
}

/** Where a decoration may sit: a surface point, its outward normal, which body part carries it. */
export interface Anchor {
  p: THREE.Vector3;
  n: THREE.Vector3;
  /** Skinning group of the body part under it. */
  g: number;
  /** Size of the spot, metres. */
  s: number;
  role: 'shoulder' | 'chest' | 'back' | 'crown' | 'brow' | 'temple' | 'hand' | 'cuff' | 'knee' | 'shin' | 'heel' | 'hip' | 'buckle';
}

export type MatKey =
  | 'main'
  | 'trim'
  | 'strap'
  | 'cloth'
  | 'banner'
  | 'glow'
  | 'ghost'
  | 'gem'
  | 'bone'
  | 'chain'
  | 'iron'
  | 'gold'
  | 'blood'
  | 'leaf'
  | 'wood'
  | 'fur'
  | 'dark'
  | 'void';

let voidMat: THREE.MeshStandardMaterial | null = null;
/** The dark behind a visor's slit or a mask's eye. */
function voidMaterial(): THREE.MeshStandardMaterial {
  if (!voidMat) {
    voidMat = new THREE.MeshStandardMaterial({ color: 0x040404, roughness: 1, metalness: 0 });
    voidMat.name = 'hero-void';
    voidMat.userData.shared = true;
  }
  return voidMat;
}

const fieldCache = new WeakMap<BodyMesh, Map<string, Field>>();

/** The colour capes, tabards and robes are dyed when nothing else names one. */
function bannerColor(look: ItemLook): number {
  if (look.motif) return keyColor(look.motif.second.startsWith('cloth') ? look.motif.second : `cloth.banner|${look.motif.color}`);
  if (look.design?.second?.startsWith('cloth')) return keyColor(look.design.second);
  if (look.design) return new THREE.Color(look.glowColor).multiplyScalar(0.45).getHex();
  switch (look.rarityTier) {
    case 0:
      return 0x5a4a3a;
    case 1:
      return 0x24345e;
    case 2:
      return 0x6a1e1e;
    default:
      return new THREE.Color(look.glowColor).multiplyScalar(0.4).getHex();
  }
}

export class Kit {
  readonly h: number;
  readonly j: BodyMesh['joints'];
  readonly parts: Part[] = [];
  readonly hides: string[] = [];
  /** Things the entry point adds after meshing: a cape, and how long. */
  cape = 0;
  private readonly bits = new Map<MatKey, { fb: FieldBuilder; groups: Set<number>; cell: number }>();
  private readonly mats = new Map<MatKey, THREE.Material>();

  constructor(
    readonly body: BodyMesh,
    readonly look: ItemLook,
    readonly slot: string,
  ) {
    this.h = body.anatomy.h;
    this.j = body.joints;
  }

  get tier(): number {
    return this.look.baseTier;
  }
  /** 0 normal .. 4 mythic. */
  get rarity(): number {
    return this.look.rarityTier;
  }
  /** Uniques, sets and better: the most striking things a hero can wear. */
  get grand(): boolean {
    return this.look.rarityTier >= 3;
  }
  has(f: Feature): boolean {
    return this.look.features.includes(f);
  }
  /** The piece's trim shows: magic and better, sets, gilded uniques. */
  get trimmed(): boolean {
    return this.look.hasTrim || this.has('gilded') || this.rarity >= 1;
  }

  /** Swaps one of the piece's materials for a surface key. */
  setMat(k: MatKey, key: string): void {
    this.mats.set(k, gearMaterial(key));
  }

  /** Which of the piece's slots a material fills, if any. */
  keyOf(m: THREE.Material): MatKey | undefined {
    for (const [k, x] of this.mats) if (x === m) return k;
    return undefined;
  }

  /** Puts a ready material in one of the piece's slots (a patterned twin of what is there). */
  useMat(k: MatKey, m: THREE.Material): void {
    this.mats.set(k, m);
  }

  mat(k: MatKey): THREE.Material {
    let m = this.mats.get(k);
    if (m) return m;
    const L = this.look;
    switch (k) {
      case 'main': {
        m = gearMaterial(L.palette, surfaceFinish(L));
        // Gilt, pearl and frosted finishes carry a faint light of their own.
        if (L.sheen > 0) m = glowingTwin(m, L.glowColor, L.sheen);
        break;
      }
      case 'trim':
        m = gearMaterial(L.trimKey, { tint: L.trimTint, metalness: L.trimKey.startsWith('metal') ? 0.8 : undefined });
        break;
      case 'strap':
        m = gearMaterial(L.keys.second);
        break;
      case 'cloth':
        m = gearMaterial(L.keys.cloth);
        break;
      case 'banner':
        m = fabricMaterial('wool', bannerColor(L), 0.95, true);
        break;
      case 'glow':
        m = glowMaterial(L.glowColor, Math.max(1.2, L.glow));
        break;
      case 'ghost':
        m = glowMaterial(L.glowColor, 0.55);
        break;
      case 'gem':
        m = glowMaterial(L.stone, 0.8 + L.glow * 0.25);
        break;
      case 'bone':
        m = gearMaterial('bone.old');
        break;
      case 'chain':
        // A set's or a unique's mail is links of its own colour, as its icon shows it.
        m = L.design || L.motif
          ? gearMaterial(`metal.chain|0x${L.colors.main.toString(16).padStart(6, '0')}`)
          : gearMaterial('metal.chain', { tint: L.palette.startsWith('metal.gold') ? 0xffd890 : undefined });
        break;
      case 'iron':
        m = gearMaterial('metal.iron');
        break;
      case 'gold':
        m = gearMaterial('metal.gold', { metalness: 0.85 });
        break;
      case 'blood':
        m = gearMaterial('leather.fine|0x4a0808', { roughness: 0.3 });
        break;
      case 'leaf':
        m = fabricMaterial('linen', 0x3c5a26, 0.85);
        break;
      case 'wood':
        m = gearMaterial('wood.dark');
        break;
      case 'fur':
        m = fabricMaterial('wool', 0x6a5a46, 1);
        break;
      case 'dark':
        m = gearMaterial('leather.dark');
        break;
      case 'void':
        m = voidMaterial();
        break;
    }
    this.mats.set(k, m!);
    return m!;
  }

  H(x: number, y: number, z: number): THREE.Vector3 {
    return V(x * this.h, y * this.h, z * this.h);
  }

  // -------------------------------------------------------------------------
  // Cuts
  // -------------------------------------------------------------------------

  /** Keep everything at or below height y (head units). */
  below(y: number): Clip {
    return { n: V(0, 1, 0), d: y * this.h };
  }
  above(y: number): Clip {
    return { n: V(0, -1, 0), d: -y * this.h };
  }
  /**
   * A cut square to a bone, `t` of the way from joint `a` to joint `b`,
   * keeping the `keep` side. Only the limb past the cut is taken away (a
   * capsule `r` heads wide running on from it), so the torso is never touched.
   */
  limb(a: HeroBone, b: HeroBone, t: number, keep: 'a' | 'b', r = 0.4): Clip {
    const A = this.j[a];
    const B = this.j[b];
    const at = A.clone().lerp(B, t);
    const dir = B.clone().sub(A).normalize();
    const away = keep === 'a' ? dir : dir.clone().negate();
    const end = at.clone().addScaledVector(away, 2.6 * this.h);
    const R = r * this.h;
    const d = away.dot(at);
    const sx = end.x - at.x;
    const sy = end.y - at.y;
    const sz = end.z - at.z;
    const ll = sx * sx + sy * sy + sz * sz;
    return {
      cut: (x, y, z) => {
        const px = x - at.x;
        const py = y - at.y;
        const pz = z - at.z;
        const u = Math.min(1, Math.max(0, (px * sx + py * sy + pz * sz) / ll));
        const cap = Math.hypot(px - sx * u, py - sy * u, pz - sz * u) - R;
        return Math.max(cap, d - (away.x * x + away.y * y + away.z * z));
      },
    };
  }
  /**
   * A sleeve's end on one arm. `s` in 0..1 runs shoulder to elbow, 1..2
   * elbow to wrist. 0 leaves the arm bare (a vest).
   */
  sleeve(L: boolean, s: number): Clip {
    const S = L ? 'L' : 'R';
    if (s <= 1) return this.limb(`upperArm${S}` as HeroBone, `foreArm${S}` as HeroBone, Math.max(0.08, s), 'a');
    return this.limb(`foreArm${S}` as HeroBone, `hand${S}` as HeroBone, Math.min(0.95, s - 1), 'a');
  }
  /** A leg cut `t` of the way from hip to knee (1..2 knee to ankle). */
  leg(L: boolean, t: number, r = 0.55): Clip {
    const S = L ? 'L' : 'R';
    if (t <= 1) return this.limb(`thigh${S}` as HeroBone, `shin${S}` as HeroBone, t, 'a', r);
    return this.limb(`shin${S}` as HeroBone, `foot${S}` as HeroBone, t - 1, 'a', r);
  }
  /** The neckline: lower in front than behind. */
  neck(front: number, back: number): Clip {
    const n = V(0, 1, (front - back) / 0.6).normalize();
    return { n, d: n.dot(this.H(0, back, -0.3)) };
  }
  /** Distance inside a clip (positive in the kept region), for tapering. */
  inside(c: Clip): F3 {
    if ('cut' in c) return c.cut;
    return (x, y, z) => c.d - (c.n.x * x + c.n.y * y + c.n.z * z);
  }
  /** A band along the edges of a set of clips. */
  band(clips: Clip[], w: number): Clip {
    const edges = clips.map((c) => this.inside(c));
    return {
      cut: (x, y, z) => {
        let d = Infinity;
        for (const e of edges) d = Math.min(d, e(x, y, z));
        return w * this.h - d;
      },
    };
  }

  // -------------------------------------------------------------------------
  // Finding the body
  // -------------------------------------------------------------------------

  field(groups: number[]): Field {
    let m = fieldCache.get(this.body);
    if (!m) fieldCache.set(this.body, (m = new Map()));
    const key = groups.join(',');
    let f = m.get(key);
    if (!f) {
      const keep = new Set(groups);
      f = this.body.anatomy.field.select((p) => keep.has(p.group));
      m.set(key, f);
    }
    return f;
  }

  /** First surface point along a ray from `from` toward `dir`, or null. */
  hit(groups: number[], from: THREE.Vector3, dir: THREE.Vector3, max = 3): Hit | null {
    return this.hitField(this.field(groups), from, dir, max);
  }

  /** As `hit`, on any field. */
  hitField(f: Field, from: THREE.Vector3, dir: THREE.Vector3, max = 3): Hit | null {
    const d = dir.clone().normalize();
    const step = 0.004;
    const n = Math.ceil((max * this.h) / step);
    const p = from.clone();
    let prev = f.eval(p.x, p.y, p.z);
    if (prev <= 0) return null;
    for (let i = 0; i < n; i++) {
      // Stride by the distance when far away: the field is close to a true distance.
      const adv = Math.max(step, prev * 0.8);
      p.addScaledVector(d, adv);
      const v = f.eval(p.x, p.y, p.z);
      if (v <= 0) {
        let lo = 0;
        let hi = adv;
        for (let k = 0; k < 10; k++) {
          const mid = (lo + hi) / 2;
          const q = p.clone().addScaledVector(d, -mid);
          if (f.eval(q.x, q.y, q.z) <= 0) lo = mid;
          else hi = mid;
        }
        p.addScaledVector(d, -(lo + hi) / 2);
        const nrm = f.grad(p.x, p.y, p.z, 0.002, new THREE.Vector3()).normalize();
        return { p, n: nrm };
      }
      prev = v;
    }
    return null;
  }

  /** The torso's surface at height `y` (head units), `a` radians round from the front. */
  around(y: number, a: number, groups: number[] = [G.torso], cx = 0, cz = -0.04): Hit {
    const c = this.H(cx, y, cz);
    const dir = V(Math.sin(a), 0, Math.cos(a));
    const from = c.clone().addScaledVector(dir, 2.5 * this.h);
    return this.hit(groups, from, dir.clone().negate(), 3) ?? { p: c.clone().addScaledVector(dir, 0.5 * this.h), n: dir };
  }

  /** The surface of a limb `t` along a bone, on the side facing `side`. */
  onLimb(a: HeroBone, b: HeroBone, t: number, side: THREE.Vector3, groups: number[]): Hit {
    const A = this.j[a];
    const B = this.j[b];
    const at = A.clone().lerp(B, t);
    const axis = B.clone().sub(A).normalize();
    const out = side.clone().addScaledVector(axis, -side.dot(axis)).normalize();
    const from = at.clone().addScaledVector(out, 1.5 * this.h);
    return this.hit(groups, from, out.clone().negate(), 2) ?? { p: at.clone().addScaledVector(out, 0.2 * this.h), n: out };
  }

  // -------------------------------------------------------------------------
  // Parts
  // -------------------------------------------------------------------------

  /** A body shell. */
  shell(name: string, mat: MatKey | THREE.Material, spec: GarmentSpec): void {
    this.parts.push({ name, spec, mat: typeof mat === 'string' ? this.mat(mat) : mat });
  }

  /** A body shell and, when the piece is trimmed, a band of trim along its edges. */
  edged(name: string, mat: MatKey, spec: GarmentSpec, w: number, edgeClips?: Clip[], force = false): void {
    this.shell(name, mat, spec);
    if (!this.trimmed && !force) return;
    const t = typeof spec.thickness === 'number' ? spec.thickness : spec.thickness;
    const lift: Inflate = typeof t === 'number' ? t + 0.0028 : (x, y, z) => (t as F3)(x, y, z) + 0.0028;
    this.shell(`${name}-trim`, 'trim', {
      ...spec,
      thickness: lift,
      clips: [...spec.clips, this.band(edgeClips ?? spec.clips, w)],
      tris: Math.round((spec.tris ?? 1800) * 0.35),
    });
  }

  /** A builder for fittings of one material. Prims added go to body group `group`. */
  fit(k: MatKey, group: number, cell = 0.0055): FieldBuilder {
    let b = this.bits.get(k);
    if (!b) this.bits.set(k, (b = { fb: new FieldBuilder(), groups: new Set(), cell }));
    b.cell = Math.min(b.cell, cell);
    b.fb.group = group;
    b.groups.add(group);
    return b.fb;
  }

  /** Turns every fitting bucket into a part. Call once, after the cut. */
  finish(): Part[] {
    for (const [k, b] of this.bits) {
      const prims = b.fb.prims;
      if (!prims.length) continue;
      const box = primBounds(prims);
      const groups = [...b.groups];
      // Skin from the body parts the fittings sit on; the torso holds anything in between.
      const skin = groups.includes(G.torso) || groups.length > 1 ? [...new Set([...groups, G.torso])] : groups;
      this.parts.push({
        name: `fit-${k}`,
        mat: this.mat(k),
        spec: {
          groups: [],
          thickness: 0.0012,
          clips: [],
          extra: prims,
          skinGroups: skin,
          cell: b.cell,
          tris: Math.min(3600, Math.max(400, prims.length * 110)),
          yRange: [box.min.y - 0.02, box.max.y + 0.02],
        },
      });
    }
    this.bits.clear();
    return this.parts;
  }
}

/** Bounds of a list of prims, generous. */
export function primBounds(prims: Prim[]): THREE.Box3 {
  const box = new THREE.Box3();
  for (const p of prims) {
    const r = Math.max(p.r.x, p.r.y, p.r.z) * 1.8 + p.k;
    box.expandByPoint(p.a.clone().addScalar(r));
    box.expandByPoint(p.a.clone().addScalar(-r));
    if (p.b) {
      box.expandByPoint(p.b.clone().addScalar(r));
      box.expandByPoint(p.b.clone().addScalar(-r));
    }
  }
  return box;
}

/** A thickness that thins toward the given edges, so a hem reads as a rolled edge. */
export function hem(t: Inflate, edges: F3[], band: number, under = 0.4): F3 {
  return (x, y, z) => {
    let k = 1;
    for (const e of edges) k = Math.min(k, smooth(0, band, e(x, y, z)));
    const base = typeof t === 'number' ? t : t(x, y, z);
    return base * (under + (1 - under) * k);
  };
}

/** Two unit vectors square to `n`: a frame for placing shapes on a surface. */
export function frame(n: THREE.Vector3, up = V(0, 1, 0)): { u: THREE.Vector3; v: THREE.Vector3 } {
  const ref = Math.abs(n.dot(up)) > 0.9 ? V(0, 0, 1) : up;
  const u = new THREE.Vector3().crossVectors(ref, n).normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();
  return { u, v };
}

/** A rotation taking local X to `x` and local Y to `y` (made square to `x`). */
export function basis(x: THREE.Vector3, y: THREE.Vector3): THREE.Quaternion {
  const X = x.clone().normalize();
  const Y = y.clone().addScaledVector(X, -y.dot(X)).normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
}
