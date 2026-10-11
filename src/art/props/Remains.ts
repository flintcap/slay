/**
 * SLAY — what is left after you use something.
 *
 * Placed props are instanced, so a used one is hidden by collapsing its
 * instance. This puts its used look in its place: a chest with the lid thrown
 * back, a shrine gone dark, a lever pulled down, a shelf searched. A smashed
 * barrel, crate or urn bursts into its own pieces (staves and hoops, planks
 * and battens, clay shards) that tumble, bounce and stay on the floor.
 *
 * Debris is one instanced mesh per piece shape, filled as a ring, so a floor
 * of broken barrels costs a handful of draw calls however many you break.
 */
import * as THREE from 'three';
import type { Rng } from '../../types';
import type { BiomeArt } from '../../world/Biomes';
import { hashString, streamFor } from '../../core/RNG';
import { remainsTemplate, scaleFor, variantFor } from './Library';
import { M, makeCtx, type BuildCtx } from './Ctx';
import { clean, jag, mottle, plank, shade } from './Kit';
import { propMat } from './PropMats';

/** The used look each family leaves behind. Families not listed keep their placed look. */
const STATE: Record<string, string> = {
  chest: 'open',
  chestRare: 'open',
  chestVault: 'open',
  shrine: 'spent',
  lever: 'pulled',
  altar: 'spent',
  bookcase: 'searched',
};

/** Kinds that break into pieces instead of leaving a used look. */
const BREAKS = new Set(['barrel', 'crate', 'urn']);

export interface UsedProp {
  propKind: string;
  tileX: number;
  tileY: number;
  /** Where it is drawn (world). */
  x: number;
  y: number;
  z: number;
}

interface PieceShape {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Half its thickness, so it rests on the floor rather than in it. */
  rest: number;
  mesh: THREE.InstancedMesh | null;
  next: number;
}

interface Piece {
  shape: PieceShape;
  slot: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  floor: number;
  /** Lies flat side up (0) or down (PI) once it settles. */
  flip: number;
  settled: boolean;
}

/** Pieces of one shape kept on the floor before the oldest are reused. */
const CAP = 120;
const GRAVITY = 14;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);

export class PropRemains {
  readonly root = new THREE.Group();
  /** The art of the zone a tile lies in. */
  private readonly artAt: (tileX: number, tileY: number) => BiomeArt;
  private readonly rng: Rng;
  private readonly shapes = new Map<string, PieceShape[]>();
  private readonly pieces: Piece[] = [];
  private readonly owned: THREE.BufferGeometry[] = [];

  constructor(artAt: (tileX: number, tileY: number) => BiomeArt, rng: Rng) {
    this.artAt = artAt;
    this.rng = rng;
    this.root.name = 'remains';
  }

  /** True when this kind breaks into pieces rather than leaving a used look. */
  static breaks(kind: string): boolean {
    return BREAKS.has(kind);
  }

  /**
   * Puts the used look of `it` where it stood. `rotation` is the placement's
   * yaw. Returns false for kinds with no used look (they stay hidden).
   */
  used(it: UsedProp, rotation: number): boolean {
    const state = STATE[it.propKind];
    if (!state) return false;
    let tmpl;
    try {
      tmpl = remainsTemplate(it.propKind, this.artAt(it.tileX, it.tileY), variantFor(it.propKind, it.tileX, it.tileY), state);
    } catch {
      return false;
    }
    const g = new THREE.Group();
    for (const l of tmpl.layers) {
      const m = new THREE.Mesh(l.geometry, l.material);
      m.castShadow = tmpl.castShadow && !l.ghost;
      m.receiveShadow = tmpl.receiveShadow;
      g.add(m);
    }
    g.position.set(it.x, it.y, it.z);
    g.rotation.y = rotation;
    g.scale.setScalar(scaleFor(it.propKind, it.tileX, it.tileY));
    g.name = `remains:${it.propKind}`;
    this.root.add(g);
    return true;
  }

  /**
   * Bursts a breakable into its pieces. `from` is where the blow came from
   * (the hero); pieces fly away from it.
   */
  smash(it: UsedProp, rotation: number, from?: { x: number; z: number }): void {
    const shapes = this.shapesFor(it.propKind, this.artAt(it.tileX, it.tileY));
    if (shapes.length === 0) return;
    const s = scaleFor(it.propKind, it.tileX, it.tileY);
    let ax = 0;
    let az = 0;
    if (from) {
      ax = it.x - from.x;
      az = it.z - from.z;
      const l = Math.hypot(ax, az) || 1;
      ax /= l;
      az /= l;
    }
    const counts = it.propKind === 'urn' ? [4, 3, 3] : it.propKind === 'crate' ? [7, 4] : [8, 3, 1];
    for (let si = 0; si < shapes.length; si++) {
      const shape = shapes[si]!;
      const n = counts[si] ?? 2;
      for (let i = 0; i < n; i++) {
        const a = this.rng.range(0, Math.PI * 2);
        const out = this.rng.range(1.2, 3.4);
        const h = this.rng.range(0.1, it.propKind === 'urn' ? 0.4 : 0.7) * s;
        const pos = new THREE.Vector3(it.x + Math.cos(a) * 0.18 * s, it.y + h, it.z + Math.sin(a) * 0.18 * s);
        const vel = new THREE.Vector3(Math.cos(a) * out + ax * 2.2, this.rng.range(2.2, 4.6), Math.sin(a) * out + az * 2.2);
        const rot = new THREE.Euler(this.rng.range(0, 6.28), rotation + this.rng.range(0, 6.28), this.rng.range(0, 6.28));
        const spin = new THREE.Vector3(this.rng.range(-12, 12), this.rng.range(-6, 6), this.rng.range(-12, 12));
        this.addPiece(shape, { pos, vel, rot, spin, floor: it.y, flip: this.rng.chance(0.5) ? 0 : Math.PI, settled: false });
      }
    }
  }

  update(dt: number): void {
    if (this.pieces.length === 0) return;
    const step = Math.min(dt, 1 / 30);
    const dirty = new Set<THREE.InstancedMesh>();
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i]!;
      p.vel.y -= GRAVITY * step;
      p.pos.addScaledVector(p.vel, step);
      p.rot.x += p.spin.x * step;
      p.rot.y += p.spin.y * step;
      p.rot.z += p.spin.z * step;
      const floor = p.floor + p.shape.rest;
      if (p.pos.y <= floor) {
        p.pos.y = floor;
        if (Math.abs(p.vel.y) > 1.6) {
          // Bounce: lose most of it, scrape along.
          p.vel.y = -p.vel.y * 0.3;
          p.vel.x *= 0.55;
          p.vel.z *= 0.55;
          p.spin.multiplyScalar(0.5);
        } else {
          // Settle flat where it landed.
          p.rot.x = p.flip;
          p.rot.z = 0;
          p.settled = true;
        }
      }
      this.write(p);
      dirty.add(p.shape.mesh!);
      if (p.settled) this.pieces.splice(i, 1);
    }
    for (const m of dirty) m.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const list of this.shapes.values()) for (const s of list) s.mesh?.dispose();
    for (const g of this.owned) g.dispose();
    this.owned.length = 0;
    this.shapes.clear();
    this.pieces.length = 0;
    this.root.clear();
  }

  private addPiece(shape: PieceShape, p: Omit<Piece, 'shape' | 'slot'>): void {
    if (!shape.mesh) {
      shape.mesh = new THREE.InstancedMesh(shape.geometry, shape.material, CAP);
      shape.mesh.count = 0;
      shape.mesh.castShadow = false;
      shape.mesh.receiveShadow = true;
      shape.mesh.frustumCulled = false;
      shape.mesh.name = 'debris';
      this.root.add(shape.mesh);
    }
    const slot = shape.next % CAP;
    shape.next++;
    shape.mesh.count = Math.min(CAP, shape.next);
    // A reused slot may still be flying: drop the old piece.
    const old = this.pieces.findIndex((q) => q.shape === shape && q.slot === slot);
    if (old >= 0) this.pieces.splice(old, 1);
    const piece: Piece = { ...p, shape, slot };
    this.pieces.push(piece);
    this.write(piece);
    shape.mesh.instanceMatrix.needsUpdate = true;
  }

  private write(p: Piece): void {
    _q.setFromEuler(p.rot);
    _m.compose(p.pos, _q, _s);
    p.shape.mesh!.setMatrixAt(p.slot, _m);
  }

  /** The piece shapes of a breakable, built once per biome from the same materials as the prop. */
  private shapesFor(kind: string, art: BiomeArt): PieceShape[] {
    const key = `${kind}|${art.id}`;
    const hit = this.shapes.get(key);
    if (hit) return hit;
    const rng = streamFor(hashString(`debris|${kind}|${art.id}`), 'prop');
    const c = makeCtx(art, rng, 0);
    const list = kind === 'barrel' ? barrelPieces(c, rng) : kind === 'crate' ? cratePieces(c, rng) : kind === 'urn' ? urnPieces(c, rng) : [];
    for (const s of list) this.owned.push(s.geometry);
    this.shapes.set(key, list);
    return list;
  }
}

function shapeOf(geo: THREE.BufferGeometry, material: THREE.Material, rest: number, tone = 0.85): PieceShape {
  clean(geo);
  shade(geo, tone);
  return { geometry: geo, material, rest, mesh: null, next: 0 };
}

/** A curved stave, a bent hoop, half a lid. */
function barrelPieces(c: BuildCtx, rng: Rng): PieceShape[] {
  const stave = new THREE.BoxGeometry(0.13, 0.035, 0.8, 1, 1, 6);
  const p = stave.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = p.getZ(i) / 0.4;
    p.setY(i, p.getY(i) + (1 - t * t) * 0.05);
  }
  stave.computeVertexNormals();
  jag(stave, rng, 0.006, 8);
  const hoop = new THREE.TorusGeometry(0.27, 0.012, 4, 12, Math.PI * 0.9);
  hoop.rotateX(Math.PI / 2);
  hoop.scale(1, 1, 0.8);
  const lidSolid = new THREE.ExtrudeGeometry(new THREE.Shape(semicircle(0.24, 10)), { depth: 0.03, bevelEnabled: false });
  lidSolid.rotateX(-Math.PI / 2);
  lidSolid.translate(0, -0.015, 0);
  return [shapeOf(stave, M.wood(c), 0.03, 0.8), shapeOf(hoop, M.iron(c), 0.012, 0.75), shapeOf(lidSolid, M.wood(c), 0.015, 0.7)];
}

/** A broken slat and a frame batten. */
function cratePieces(c: BuildCtx, rng: Rng): PieceShape[] {
  const slat = plank(0.62, 0.15, 0.03, rng, 0.5);
  slat.rotateX(Math.PI / 2);
  // Snapped end.
  const p = slat.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) if (p.getX(i) > 0.25) p.setX(i, 0.25 + (p.getX(i) - 0.25) * rng.range(0.2, 1));
  slat.computeVertexNormals();
  const batten = new THREE.BoxGeometry(0.66, 0.06, 0.07);
  return [shapeOf(slat, M.planks(c), 0.075, 0.85), shapeOf(batten, M.wood(c), 0.03, 0.75)];
}

/** Curved clay shards of three sizes. */
function urnPieces(c: BuildCtx, rng: Rng): PieceShape[] {
  const clay = propMat('stone.brick', { base: c.biome === 'desert' || c.biome === 'desertTomb' ? 0x8a6448 : 0x6a5040, rough: 0.9, side: THREE.DoubleSide });
  const out: PieceShape[] = [];
  for (const [r, arc] of [
    [0.2, 1.1],
    [0.18, 0.7],
    [0.15, 0.45],
  ] as const) {
    const g = new THREE.SphereGeometry(r, 5, 3, 0, arc, Math.PI * 0.3, arc * 0.6);
    // Lay the shard's hollow up, centred on its own middle.
    g.computeBoundingBox();
    const b = g.boundingBox!;
    g.translate(-(b.min.x + b.max.x) / 2, -(b.min.y + b.max.y) / 2, -(b.min.z + b.max.z) / 2);
    g.rotateX(Math.PI / 2);
    jag(g, rng, 0.008, 9);
    mottle(g, rng, 0.4, 5);
    out.push(shapeOf(g, clay, 0.02, rng.range(0.7, 0.9)));
  }
  return out;
}

function semicircle(r: number, seg: number): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  return pts;
}

