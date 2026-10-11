/**
 * SLAY — the town's building kit.
 *
 * Every static piece of the town (houses, the smithy, stalls, the palisade,
 * the trees, the clutter) goes into one `TownBatch`, which merges everything
 * that shares a material into a single mesh. The town is a few thousand parts
 * and comes out as a few dozen draw calls.
 *
 * Materials are the prop library's (`propMat`), so a town barrel is the same
 * barrel as a dungeon barrel, and the town's timber, thatch and stone wear
 * the same photo scans as the props.
 */
import * as THREE from 'three';
import type { Rng } from '../../../types';
import { biomeArt } from '../../../world/Biomes';
import { PropKit, box, clean, merge, shade, xf, type Shade, type Xf } from '../Kit';
import { makeCtx, paletteFor, type BuildCtx, type PropPalette } from '../Ctx';
import { libraryTemplate } from '../Library';
import { propMat } from '../PropMats';

/** The town's own palette: warm timber, grey stone, iron, homespun. */
export const TOWN_PAL: PropPalette = {
  ...paletteFor('darkForest'),
  stone: 'prop.masonry',
  stoneTint: undefined,
  rock: 'stone.granite',
  rockTint: 0x9a968c,
  wood: 'prop.timber',
  planks: 'prop.planks',
  bark: 'wood.bark',
  iron: 'prop.iron',
  fine: 'prop.bronze',
  cloth: 'cloth.homespun',
  clothTint: 0x5a4632,
  stain: 0x4a4a34,
  stainAmt: 0.45,
  flame: 0xffa050,
};

/** A build context for town pieces: forest light and weather, town materials. */
export function townCtx(rng: Rng, variant = 0): BuildCtx {
  const c = makeCtx(biomeArt('darkForest'), rng, variant);
  return { ...c, pal: TOWN_PAL, outdoor: true };
}

/** The town's surfaces by role. All shared and cached: never dispose one. */
export const TM = {
  timber: () => propMat('prop.timber', { grime: 0.8 }),
  timberDark: () => propMat('prop.timber.dark', { grime: 0.8 }),
  planks: () => propMat('prop.planks', { grime: 0.9 }),
  plaster: () => propMat('tex.plaster', { base: 0x9c8e76, grime: 1, grimeHeight: 0.9 }),
  thatch: () => propMat('prop.thatch', { grime: 0, side: THREE.DoubleSide }),
  slate: () => propMat('prop.slate', { grime: 0 }),
  stone: () => propMat('prop.masonry', { grime: 1, grimeHeight: 0.8 }),
  stoneDark: () => propMat('prop.masonry.dark', { grime: 1, grimeHeight: 0.8 }),
  rubble: () => propMat('stone.granite', { tint: 0x9a968c, grime: 1 }),
  iron: () => propMat('prop.iron', { grime: 0.4 }),
  rust: () => propMat('prop.iron.rust', { grime: 0.4 }),
  bark: () => propMat('wood.bark', { grime: 0.6 }),
  canvas: () => propMat('cloth.undyed', { base: 0x6a5e4a, side: THREE.DoubleSide, grime: 0.9 }),
  cloth: (base: number) => propMat('cloth.homespun', { base, side: THREE.DoubleSide, grime: 0.6 }),
  needles: () => propMat('foliage.pine', { base: 0x2c3a26, side: THREE.DoubleSide, grime: 0 }),
  straw: () => propMat('prop.thatch.old', { grime: 0.3 }),
  leather: () => propMat('leather.worn', { grime: 0.5 }),
  hide: () => propMat('leather.worn', { base: 0x6a5440, side: THREE.DoubleSide, grime: 0.4 }),
  herb: () => propMat('foliage.pine', { base: 0x4a5a30, grime: 0 }),
  bronze: () => propMat('prop.bronze', { grime: 0.3 }),
  banner: () => propMat('cloth.banner', { side: THREE.DoubleSide, grime: 0.5 }),
  rope: () => propMat('leather.worn', { base: 0x6a5a44, grime: 0.2 }),
  linen: () => propMat('cloth.linen', { side: THREE.DoubleSide, grime: 0.3 }),
  wax: () => propMat('cloth.linen', { base: 0xd8c8a0, grime: 0 }),
};

export type Collider = { x: number; z: number; w: number; d: number };

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function placement(x: number, y: number, z: number, ry: number, s: number): THREE.Matrix4 {
  _e.set(0, ry, 0);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.setScalar(s);
  return _m.compose(_p, _q, _s);
}

/**
 * Collects the whole town's static geometry per material and merges it.
 * Pieces are built in place (world coordinates) or built at the origin and
 * dropped in with `kit` / `template`.
 */
export class TownBatch {
  private readonly buckets = new Map<string, { mat: THREE.Material; cast: boolean; list: THREE.BufferGeometry[] }>();
  readonly colliders: Collider[] = [];

  /** Adds a shape under a material after a transform and a tone. */
  add(mat: THREE.Material, geo: THREE.BufferGeometry, t?: Xf, tone?: Shade, cast = true): this {
    xf(geo, t);
    clean(geo);
    if (tone !== undefined) shade(geo, tone);
    this.push(mat, geo, cast);
    return this;
  }

  /** Drops a finished PropKit (built about its own origin) at a spot. */
  kit(k: PropKit, x: number, y: number, z: number, ry = 0, s = 1, cast = true): this {
    const m = placement(x, y, z, ry, s);
    const out = k.done();
    for (const l of out.layers) this.push(l.material, l.geometry.applyMatrix4(m), cast && !l.ghost);
    if (out.flame) this.push(out.flame.material, out.flame.geometry.applyMatrix4(m.clone().multiply(new THREE.Matrix4().makeTranslation(0, out.flame.y, out.flame.forward))), false);
    return this;
  }

  /** Drops a prop library kind (the dungeon's own model) at a spot. */
  template(kind: string, variant: number, x: number, z: number, ry = 0, s = 1, y = 0): this {
    const t = libraryTemplate(kind, biomeArt('darkForest'), 0, variant);
    const m = placement(x, y, z, ry, s);
    for (const l of t.layers) this.push(l.material, l.geometry.clone().applyMatrix4(m), t.castShadow && !l.ghost);
    if (t.flame) {
      const f = t.flame;
      const fm = m.clone().multiply(new THREE.Matrix4().makeTranslation(0, f.y, f.forward));
      this.push(f.material, f.geometry.clone().applyMatrix4(fm), false);
    }
    return this;
  }

  /**
   * A solid footprint: a `w` x `d` rectangle at (x, z) turned by `ry`.
   * Square-on it is one exact box. Turned, it is covered by small boxes that
   * each stay inside the rectangle, so a turned house never grows invisible
   * corners.
   */
  solid(x: number, z: number, w: number, d: number, ry = 0): this {
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    const q = Math.abs(((ry % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2));
    if (q < 0.01 || Math.PI / 2 - q < 0.01) {
      this.colliders.push({ x, z, w: Math.abs(w * c) + Math.abs(d * s), d: Math.abs(w * s) + Math.abs(d * c) });
      return this;
    }
    // Fine enough that a turned corner never pokes more than ~10 cm past its boxes.
    const cell = 0.5;
    const nx = Math.max(1, Math.ceil(w / cell));
    const nz = Math.max(1, Math.ceil(d / cell));
    const cw = w / nx;
    const cd = d / nz;
    const a = Math.min(cw, cd) / (Math.abs(c) + Math.abs(s));
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const lx = -w / 2 + (i + 0.5) * cw;
        const lz = -d / 2 + (j + 0.5) * cd;
        // Same yaw convention as three.js `rotation.y`.
        this.colliders.push({ x: x + lx * c + lz * s, z: z - lx * s + lz * c, w: a, d: a });
      }
    }
    return this;
  }

  /** Merges every bucket into one mesh under `root`; returns the geometries made. */
  flush(root: THREE.Object3D): THREE.BufferGeometry[] {
    const made: THREE.BufferGeometry[] = [];
    for (const b of this.buckets.values()) {
      if (b.list.length === 0) continue;
      const geo = merge(b.list);
      for (const g of b.list) g.dispose();
      made.push(geo);
      const mesh = new THREE.Mesh(geo, b.mat);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = true;
      // Merged bounds span the town; culling would be all or nothing anyway.
      mesh.frustumCulled = false;
      mesh.name = 'town:merged';
      root.add(mesh);
    }
    this.buckets.clear();
    return made;
  }

  private push(mat: THREE.Material, geo: THREE.BufferGeometry, cast: boolean): void {
    // Shadow casters and non-casters of one material go in separate meshes.
    const key = `${mat.uuid}|${cast ? 1 : 0}`;
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = { mat, cast, list: [] }));
    b.list.push(geo);
  }
}

/** A builder of one piece about its own origin. */
export type PieceBuilder = (k: PropKit, c: BuildCtx) => void;

/** Builds a piece with its own seeded stream and drops it into the batch. */
export function piece(batch: TownBatch, rng: Rng, build: PieceBuilder, x: number, z: number, ry = 0, s = 1, y = 0, variant = 0): void {
  const r = rng.fork(`piece:${x.toFixed(2)},${z.toFixed(2)}`);
  const k = new PropKit(r);
  build(k, townCtx(r, variant));
  batch.kit(k, x, y, z, ry, s);
}

// ---------------------------------------------------------------------------
// Building in a turned frame
// ---------------------------------------------------------------------------

/**
 * A building's own frame: local +Z is its front, local X runs along it.
 * Shapes, kits, templates and footprints given in local coordinates land in
 * the batch turned and moved into the town.
 */
export class Site {
  readonly c: number;
  readonly s: number;

  constructor(readonly batch: TownBatch, readonly x: number, readonly z: number, readonly ry = 0, readonly y = 0) {
    this.c = Math.cos(ry);
    this.s = Math.sin(ry);
  }

  /** World position of a local point. */
  wx(lx: number, lz: number): number {
    return this.x + lx * this.c + lz * this.s;
  }

  wz(lx: number, lz: number): number {
    return this.z - lx * this.s + lz * this.c;
  }

  world(lx: number, ly: number, lz: number): THREE.Vector3 {
    return new THREE.Vector3(this.wx(lx, lz), this.y + ly, this.wz(lx, lz));
  }

  private t(t: Xf = {}): Xf {
    const lx = t.x ?? 0;
    const lz = t.z ?? 0;
    return { ...t, x: this.wx(lx, lz), y: this.y + (t.y ?? 0), z: this.wz(lx, lz), ry: this.ry + (t.ry ?? 0) };
  }

  add(mat: THREE.Material, geo: THREE.BufferGeometry, t?: Xf, tone?: Shade, cast = true): this {
    this.batch.add(mat, geo, this.t(t), tone, cast);
    return this;
  }

  /** A chamfered box whose bottom sits at `t.y`. */
  box(mat: THREE.Material, w: number, h: number, d: number, t: Xf = {}, tone?: Shade, bevel = 0.025, cast = true): this {
    return this.add(mat, box(w, h, d, bevel), { ...t, y: (t.y ?? 0) + (h / 2) * (t.sy ?? t.s ?? 1) }, tone, cast);
  }

  kit(k: PropKit, lx: number, lz: number, ry = 0, s = 1, ly = 0, cast = true): this {
    this.batch.kit(k, this.wx(lx, lz), this.y + ly, this.wz(lx, lz), this.ry + ry, s, cast);
    return this;
  }

  template(kind: string, variant: number, lx: number, lz: number, ry = 0, s = 1, ly = 0): this {
    this.batch.template(kind, variant, this.wx(lx, lz), this.wz(lx, lz), this.ry + ry, s, this.y + ly);
    return this;
  }

  /** A solid footprint in local coordinates (`ry` turns it further). */
  solid(lx: number, lz: number, w: number, d: number, ry = 0): this {
    this.batch.solid(this.wx(lx, lz), this.wz(lx, lz), w, d, this.ry + ry);
    return this;
  }

  /**
   * One square-on box inside a turned square `size` across (a chimney, a
   * stack): small things read better as one box than as a handful of slivers.
   */
  block(lx: number, lz: number, size: number): this {
    // A touch past inscribed: the faces poke out under 10 cm, the corners in under 25.
    const k = Math.min(size, (1.2 * size) / (Math.abs(this.c) + Math.abs(this.s)));
    this.batch.solid(this.wx(lx, lz), this.wz(lx, lz), k, k);
    return this;
  }
}

/**
 * A gable: a triangle `w` wide and `h` tall standing on y = 0, `t` thick
 * along Z, centred. The end wall under a pitched roof.
 */
export function gable(w: number, h: number, t: number): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, 0);
  sh.lineTo(w / 2, 0);
  sh.lineTo(0, h);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  return g;
}

/** A lantern a building carries: Town.ts turns each into a bulb, and a light when `lit`. */
export interface LanternSpec {
  x: number;
  y: number;
  z: number;
  color: number;
  intensity: number;
  distance: number;
  flicker: number;
  radius: number;
  lit: boolean;
}

/** Cloth that moves in the wind: Town.ts swings it on its shared gust. */
export interface SwayItem {
  obj: THREE.Object3D;
  phase: number;
  amp: number;
  axis: 'x' | 'z';
}
