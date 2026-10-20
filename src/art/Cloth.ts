/**
 * SLAY — cloth that moves on the graphics card.
 *
 * A cloth is a grid of points, `cols` across and `rows` down (row-major,
 * row 0 first), with a rest shape in a space of its own. Its owner says,
 * once a frame, where that space stands in the world (`place`): a cape's
 * shoulders, a banner's pole. Points with a pin of 1 stay on their rest
 * place there; the rest fall, trail and fold.
 *
 * One compute pass a frame (a small program the graphics card runs) moves
 * every point, in one workgroup so the points can be kept in its fast shared
 * memory for the whole pass. Each step of it:
 *
 *  - moves each point on from where it was (Verlet), under gravity and air
 *    that pulls it toward the wind's speed, so a running hero's cape trails;
 *  - pulls the grid's edges back to their rest lengths: along, across and
 *    corner to corner, and softly two points apart so it folds rather than
 *    creases. The edges are done in twelve sets that share no point, so
 *    every edge in a set is done at once and each sees the last set's moves;
 *  - keeps each point within its `reach` of its rest place (none at a pin,
 *    a long way at a hem), out of the owner's bodies (capsules: a torso, the
 *    legs) and above the floor.
 *
 * The draw reads the points straight from the pass's buffer: the place, the
 * surface's turn from the neighbours on each side, and last frame's place
 * for the motion the picture's smoothing needs (`ClothMaterial`). The rest
 * shape stays the geometry's own `position`, so a texture laid on by place
 * (the hero's triplanar fabrics) stays on the cloth as it moves.
 */
import * as THREE from 'three/webgpu';
import {
  Fn, If, Loop, clamp, cross, dot, float, instanceIndex, int, length, max, mix, normalLocal, normalize, positionLocal,
  positionPrevious, sin, storage, uint, uniform, uniformArray, vec3, vec4, vertexIndex, workgroupArray, workgroupBarrier,
} from 'three/tsl';
import { copyNodeTextures, drawnFrames, type V3, type V4 } from '../core/Tsl';
import { copyScans } from './Scans';
import { markAll } from '../fx/kit/Upload';
import { hookSeen } from '../core/ThreeHooks';

/** Longest step the pass takes; a slower frame takes more of them. */
const MAX_STEP = 1 / 120;
const MAX_STEPS = 8;
/** Most time one frame moves the cloth (a hitch is not caught up). */
const MAX_FRAME = 1 / 15;
/** Edge passes per step. */
const ITERS = 6;
/** A point never moves faster than this (m/s): a hard hit does not tear it apart. */
const MAX_SPEED = 30;
/** Motion kept from one step to the next (the rest is lost to the cloth's own stiffness). */
const KEEP = 0.998;
/** A frame that jumps further than this (m) is a teleport: the cloth starts again at rest. */
const JUMP = 2.5;
/** Most bodies a cloth is kept out of. */
export const MAX_BODIES = 12;

/** How stiff each kind of edge is: along and across, corner to corner, two apart. */
export interface ClothFeel {
  stretch: number;
  shear: number;
  bend: number;
  /** Air drag, 1/s: how fast a point takes the wind's speed. */
  drag: number;
}

export const CLOTH_FEEL: Record<'cape' | 'banner', ClothFeel> = {
  // Heavy wool: holds its length, folds softly.
  cape: { stretch: 1, shear: 0.6, bend: 0.22, drag: 1.5 },
  // Light silk on a pole: quicker in the air, crisper folds.
  banner: { stretch: 1, shear: 0.5, bend: 0.12, drag: 2.6 },
};

export interface ClothSheet {
  cols: number;
  rows: number;
  /** The grid in its own space: positions, normals and triangles (index). */
  geometry: THREE.BufferGeometry;
  /** Per point: 1 held on its rest place, 0 free. */
  pin: ArrayLike<number>;
  /** Per point: how far (in the sheet's own units) it may stray from its rest place. */
  reach: ArrayLike<number>;
}

/** Where a cloth's sheet stands this frame; false skips the frame (nothing moves). */
export type ClothPlacer = (c: Cloth) => boolean;

/** One of the shared-memory arrays the pass keeps its points in. */
interface Shared<T extends 'vec3' | 'vec4'> {
  element(i: THREE.Node<'uint'>): THREE.Node<T>;
}
const shared = <T extends 'vec3' | 'vec4'>(type: T, n: number): Shared<T> => workgroupArray(type, n) as unknown as Shared<T>;
type U = THREE.Node<'uint'>;

/**
 * The edge sets: a step to the other end, the stiffness, and which starts
 * go in each of the set's two colours (by column or row, one apart or two).
 */
interface EdgeSet {
  dr: number;
  dc: number;
  kind: keyof Omit<ClothFeel, 'drag'>;
  by: 'c' | 'r';
  span: 1 | 2;
}
const EDGE_SETS: EdgeSet[] = [
  { dr: 0, dc: 1, kind: 'stretch', by: 'c', span: 1 },
  { dr: 1, dc: 0, kind: 'stretch', by: 'r', span: 1 },
  { dr: 1, dc: 1, kind: 'shear', by: 'r', span: 1 },
  { dr: 1, dc: -1, kind: 'shear', by: 'r', span: 1 },
  { dr: 0, dc: 2, kind: 'bend', by: 'c', span: 2 },
  { dr: 2, dc: 0, kind: 'bend', by: 'r', span: 2 },
];

/** `values[k]` for a set number `k` worked out in the pass. */
function pick<T extends 'int' | 'float'>(k: THREE.Node<'int'>, values: THREE.Node<T>[]): THREE.Node<T> {
  let out = values[values.length - 1]!;
  for (let v = values.length - 2; v >= 0; v--) out = k.equal(int(v)).select(values[v]!, out) as unknown as THREE.Node<T>;
  return out;
}

let clothIds = 0;

export class Cloth {
  readonly cols: number;
  readonly rows: number;
  readonly count: number;
  /** The drawn sheet. Its world matrix stays identity: the points are in world space. */
  readonly mesh: THREE.Mesh;
  /** The sheet's space in the world this frame (set by the placer). */
  readonly frame = new THREE.Matrix4();
  /** Bodies the cloth stays out of: two per body, end A (xyz, radius) then end B. Set by the placer. */
  readonly bodies = Array.from({ length: MAX_BODIES * 2 }, () => new THREE.Vector4());
  bodyCount = 0;
  /** The floor's height under the cloth (world y). */
  floor = -1e6;
  /** The air: its speed (xyz, m/s) and how much it gusts (w, share). */
  readonly wind = new THREE.Vector4(0.35, 0, 0.2, 0.7);
  place: ClothPlacer | null = null;
  readonly id = ++clothIds;

  private readonly geo: THREE.BufferGeometry;
  private readonly pos: THREE.StorageBufferAttribute;
  private readonly prev: THREE.StorageBufferAttribute;
  private readonly last: THREE.StorageBufferAttribute;
  private readonly rest: THREE.StorageBufferAttribute;
  private readonly aux: THREE.StorageBufferAttribute;
  private readonly group: number;
  private readonly per: number;
  private readonly sim: THREE.ComputeNode;
  private readonly uA = uniform(new THREE.Matrix4());
  private readonly uB = uniform(new THREE.Matrix4());
  private readonly uScale = uniform(1);
  private readonly uH = uniform(MAX_STEP);
  private readonly uSteps = uniform(0, 'int');
  private readonly uReset = uniform(1);
  private readonly uTime = uniform(0);
  private readonly uDrag = uniform(1.5);
  private readonly uWind = uniform(new THREE.Vector4());
  private readonly uFloor = uniform(-1e6);
  private readonly uBodies = uniformArray<'vec4'>(this.bodies, 'vec4');
  private readonly uBodyCount = uniform(0, 'int');
  /** Seconds of motion not yet run, and whether the owner moved on since the last pass. */
  private pending = 0;
  private due = false;
  /** Last frame's pass moved the cloth: the next still frame copies it once, so its motion reads zero. */
  private moved = false;
  private placed = false;
  /** The picture the last pass ran for (`drawnFrames`): one pass a picture, before its first draw of the cloth. */
  private seen = -1;
  private time = 0;
  private readonly was = new THREE.Matrix4();
  /** 1 when the sheet's triangles face along "across, then down", -1 against it. */
  private facing = 1;
  readonly nodes: ClothNodes;

  constructor(sheet: ClothSheet, look: THREE.Material, readonly feel: ClothFeel = CLOTH_FEEL.cape) {
    this.cols = sheet.cols;
    this.rows = sheet.rows;
    const n = (this.count = sheet.cols * sheet.rows);
    this.group = n > 64 ? 128 : 64;
    this.per = Math.ceil(n / this.group);
    const src = sheet.geometry;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setIndex(Array.from(src.index!.array));
    this.pos = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    this.prev = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    this.last = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    this.rest = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    this.aux = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    // Kept on the drawn geometry, unread by its shader, so disposing it frees
    // their GPU copies too (three frees a geometry's attributes). It is never
    // disposed while the cloth lives: a new sheet is copied in (`reshape`).
    geo.setAttribute('slClothPos', this.pos);
    geo.setAttribute('slClothPrev', this.prev);
    geo.setAttribute('slClothLast', this.last);
    geo.setAttribute('slClothRest', this.rest);
    geo.setAttribute('slClothAux', this.aux);
    this.geo = geo;
    this.reshape(sheet);
    this.facing = sheetFacing(sheet);
    this.sim = this.buildSim();
    this.nodes = this.buildDraw();
    this.mesh = new THREE.Mesh(geo, clothMaterial(look, this.nodes));
    this.mesh.name = 'cloth';
    this.mesh.userData.cloth = true;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.matrixWorldAutoUpdate = false;
    // The pass runs just before the cloth is first drawn in a frame (its
    // shadow, as a rule), once, for all the time since the last one.
    this.mesh.onBeforeRender = (renderer) => this.step(renderer as unknown as THREE.WebGPURenderer);
  }

  /** Puts a new sheet of the same grid in (a new cape): the cloth starts again from its rest shape. */
  reshape(sheet: ClothSheet): void {
    const n = this.count;
    if (sheet.cols * sheet.rows !== n) throw new Error('cloth: a sheet of another size');
    const p = sheet.geometry.getAttribute('position') as THREE.BufferAttribute;
    const q = sheet.geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
    const gp = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const gn = this.geo.getAttribute('normal') as THREE.BufferAttribute;
    const R = this.rest.array as Float32Array;
    const A = this.aux.array as Float32Array;
    for (let i = 0; i < n; i++) {
      gp.setXYZ(i, p.getX(i), p.getY(i), p.getZ(i));
      if (q) gn.setXYZ(i, q.getX(i), q.getY(i), q.getZ(i));
      R[i * 4] = p.getX(i);
      R[i * 4 + 1] = p.getY(i);
      R[i * 4 + 2] = p.getZ(i);
      R[i * 4 + 3] = Math.min(1, Math.max(0, sheet.pin[i] ?? 0));
      A[i * 4] = Math.max(0, sheet.reach[i] ?? 0);
    }
    gp.needsUpdate = true;
    gn.needsUpdate = true;
    this.geo.computeBoundingSphere();
    markAll(this.rest);
    markAll(this.aux);
    this.placed = false;
  }

  /** Puts a new look on (the drawn material is the cloth's own copy of `look`). */
  dress(look: THREE.Material): void {
    const old = this.mesh.material as THREE.Material;
    this.mesh.material = clothMaterial(look, this.nodes);
    if (!old.userData.shared) old.dispose();
  }

  /** The owner's clock: call once a frame the cloth's world moves on. */
  tick(dt: number): void {
    if (!(dt > 0)) return;
    this.pending = Math.min(MAX_FRAME, this.pending + dt);
    this.time += dt;
    this.due = true;
  }

  private step(renderer: THREE.WebGPURenderer): void {
    hookSeen('Renderer onBeforeRender, castShadowPositionNode', true);
    // The shadow passes and the picture all draw the cloth; it moves once.
    if (drawnFrames.n === this.seen) return;
    this.seen = drawnFrames.n;
    if (!this.due) {
      // A still frame after a moving one: one pass with no steps copies the
      // points as they are into last frame's, so the cloth's motion reads zero.
      if (!this.moved) return;
      this.moved = false;
      this.uSteps.value = 0;
      this.uReset.value = 0;
      renderer.compute(this.sim);
      return;
    }
    this.due = false;
    if (!this.place || !this.place(this)) {
      this.pending = 0;
      return;
    }
    const f = this.frame.elements;
    const w = this.was.elements;
    const jump = Math.hypot(f[12]! - w[12]!, f[13]! - w[13]!, f[14]! - w[14]!);
    const reset = !this.placed || jump > JUMP;
    this.uA.value.copy(reset ? this.frame : this.was);
    this.uB.value.copy(this.frame);
    this.was.copy(this.frame);
    this.placed = true;
    this.uScale.value = Math.cbrt(Math.abs(this.frame.determinant())) || 1;
    const steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(this.pending / MAX_STEP - 1e-6)));
    this.uSteps.value = steps;
    this.uH.value = Math.max(1e-4, this.pending / steps);
    this.uReset.value = reset ? 1 : 0;
    this.uTime.value = this.time;
    this.uDrag.value = this.feel.drag;
    this.uWind.value.copy(this.wind);
    this.uFloor.value = this.floor;
    this.uBodyCount.value = Math.min(MAX_BODIES, this.bodyCount);
    this.pending = 0;
    this.moved = true;
    renderer.compute(this.sim);
  }

  /**
   * The motion pass: one workgroup moves every point through all the frame's
   * steps. The loops stay loops in the program (not written out once per set
   * and point): a long program with many waits in it is what software
   * graphics (and some drivers) fail to build.
   */
  private buildSim(): THREE.ComputeNode {
    const W = this.cols;
    const H = this.rows;
    const N = this.count;
    const G = this.group;
    const PER = this.per;
    const NP = G * PER;
    const feel = this.feel;
    const posS = storage(this.pos, 'vec4', N);
    const prevS = storage(this.prev, 'vec4', N);
    const lastS = storage(this.last, 'vec4', N);
    const restS = storage(this.rest, 'vec4', N).toReadOnly();
    const auxS = storage(this.aux, 'vec4', N).toReadOnly();
    const P = shared('vec3', NP);
    const R = shared('vec4', NP);
    const { uA, uB, uScale, uH, uSteps, uReset, uTime, uDrag, uWind, uFloor, uBodies, uBodyCount } = this;

    return Fn(() => {
      const t = instanceIndex;
      // Each of this thread's points (every G-th one from its own): its index, row and column.
      const each = (body: (i: U, r: THREE.Node<'int'>, c: THREE.Node<'int'>) => void): void => {
        Loop(PER, ({ i: m }: { i: THREE.Node<'int'> }) => {
          const i = t.add(uint(m).mul(uint(G))).toVar() as unknown as U;
          If(i.lessThan(uint(N)), () => {
            body(i, int(i.div(uint(W))).toVar() as unknown as THREE.Node<'int'>, int(i.mod(uint(W))).toVar() as unknown as THREE.Node<'int'>);
          });
        });
      };
      // A point's rest place in the world at a share `s` of the frame.
      const goalOf = (i: U, s: THREE.Node<'float'>): V3 => {
        const home = vec4(R.element(i).xyz, 1.0);
        return mix(uA.mul(home).xyz, uB.mul(home).xyz, s) as unknown as V3;
      };

      each((i) => {
        const p = posS.element(i).toVar();
        P.element(i).assign(p.xyz);
        R.element(i).assign(restS.element(i));
        lastS.element(i).assign(p);
      });
      workgroupBarrier();

      Loop({ start: int(0), end: uSteps, type: 'int', condition: '<' }, ({ i: k }: { i: THREE.Node<'int'> }) => {
        const s = float(k.add(1)).div(float(uSteps)).toVar() as unknown as THREE.Node<'float'>;
        const now = uTime.sub(float(uSteps.sub(k).sub(1)).mul(uH)).toVar();
        each((i, r, c) => {
          const pin = R.element(i).w.toVar();
          const g = goalOf(i, s).toVar();
          const x = mix(P.element(i), g, uReset).toVar() as unknown as V3;
          const pv = mix(prevS.element(i).xyz, g, uReset).toVar() as unknown as V3;
          const v = x.sub(pv).toVar();
          const vel = v.div(uH);
          // The air: the wind, gusting along and down the cloth in waves.
          const cr = float(c).mul(0.55).add(float(r).mul(0.35));
          const gust = sin(now.mul(2.3).add(cr)).mul(0.6).add(sin(now.mul(5.1).sub(cr.mul(1.7))).mul(0.4));
          const air = uWind.xyz.mul(gust.mul(uWind.w).add(1.0));
          const acc = vec3(0.0, -9.81, 0.0).add(air.sub(vel).mul(uDrag));
          const next = x.add(v.mul(KEEP)).add(acc.mul(uH.mul(uH))).toVar();
          const move = next.sub(x).toVar();
          const far = length(move).toVar();
          const cap = uH.mul(MAX_SPEED);
          const moved = far.greaterThan(cap).select(x.add(move.mul(cap.div(max(far, 1e-6)))), next).uniformFlow();
          prevS.element(i).assign(vec4(x, 1.0));
          P.element(i).assign(mix(moved, g, pin));
        });
        workgroupBarrier();

        Loop(ITERS, () => {
          // Twelve passes: each set's two colours. No two edges in a pass share a point.
          Loop(EDGE_SETS.length * 2, ({ i: ph }: { i: THREE.Node<'int'> }) => {
            const set = ph.div(int(2)).toVar() as unknown as THREE.Node<'int'>;
            const colour = ph.mod(int(2)).toVar();
            const dr = pick(set, EDGE_SETS.map((e) => int(e.dr))).toVar() as unknown as THREE.Node<'int'>;
            const dc = pick(set, EDGE_SETS.map((e) => int(e.dc))).toVar() as unknown as THREE.Node<'int'>;
            const stiff = pick(set, EDGE_SETS.map((e) => float(feel[e.kind]))).toVar();
            each((i, r, c) => {
              const key = pick(set, EDGE_SETS.map((e) => (e.by === 'c' ? c : r).div(int(e.span)).mod(int(2)))).toVar();
              const rj = r.add(dr).toVar();
              const cj = c.add(dc).toVar();
              If(key.equal(colour).and(rj.lessThan(int(H))).and(cj.lessThan(int(W))).and(cj.greaterThanEqual(int(0))), () => {
                const j = uint(rj.mul(int(W)).add(cj)).toVar() as unknown as U;
                const pi = P.element(i).toVar() as unknown as V3;
                const pj = P.element(j).toVar() as unknown as V3;
                const ri = R.element(i).toVar() as unknown as V4;
                const rjv = R.element(j).toVar() as unknown as V4;
                const wi = float(1.0).sub(ri.w).toVar();
                const wj = float(1.0).sub(rjv.w).toVar();
                const len0 = length(ri.xyz.sub(rjv.xyz)).mul(uScale);
                const d = pj.sub(pi).toVar();
                const len = max(length(d), 1e-6).toVar();
                const corr = d.mul(len.sub(len0).div(len.mul(max(wi.add(wj), 1e-6))).mul(stiff)).toVar();
                P.element(i).assign(pi.add(corr.mul(wi)));
                P.element(j).assign(pj.sub(corr.mul(wj)));
              });
            });
            workgroupBarrier();
          });
          // Reach, bodies and the floor.
          each((i) => {
            If(R.element(i).w.lessThan(0.999), () => {
              const g = goalOf(i, s).toVar();
              const x = P.element(i).toVar() as unknown as V3;
              const d = x.sub(g).toVar();
              const dl = length(d).toVar();
              const lim = auxS.element(i).x.mul(uScale).toVar();
              x.assign(dl.greaterThan(lim).select(g.add(d.mul(lim.div(max(dl, 1e-6)))), x).uniformFlow());
              Loop(uBodyCount, ({ i: b }: { i: THREE.Node<'int'> }) => {
                const a = uBodies.element(b.mul(2)).toVar();
                const e = uBodies.element(b.mul(2).add(1)).toVar();
                const ab = e.xyz.sub(a.xyz).toVar();
                const u = clamp(dot(x.sub(a.xyz), ab).div(max(dot(ab, ab), 1e-8)), 0.0, 1.0);
                const q = a.xyz.add(ab.mul(u)).toVar();
                const out = x.sub(q).toVar();
                const ol = length(out).toVar();
                const rad = a.w;
                x.assign(ol.lessThan(rad).and(ol.greaterThan(1e-5)).select(q.add(out.mul(rad.div(max(ol, 1e-5)))), x).uniformFlow());
              });
              x.y.assign(max(x.y, uFloor));
              P.element(i).assign(x);
            });
          });
          workgroupBarrier();
        });
      });

      each((i) => {
        const p = vec4(P.element(i), 1.0).toVar();
        posS.element(i).assign(p);
        // A fresh start is not motion: last frame's place is this one.
        If(uReset.greaterThan(0.5), () => {
          lastS.element(i).assign(p);
        });
      });
    })().compute(G, [G]) as unknown as THREE.ComputeNode;
  }

  /** What the draw reads: each point's place, its surface's turn, and its place last frame. */
  private buildDraw(): ClothNodes {
    const W = this.cols;
    const H = this.rows;
    const N = this.count;
    // The draw only reads: a vertex shader may not write storage.
    const posR = storage(this.pos, 'vec4', N).toReadOnly();
    const lastR = storage(this.last, 'vec4', N).toReadOnly();
    const at = (r: THREE.Node, c: THREE.Node): V3 =>
      posR.element((r as THREE.Node<'uint'>).mul(uint(W)).add(c as THREE.Node<'uint'>)).xyz as unknown as V3;
    const position = posR.element(vertexIndex).xyz as unknown as V3;
    const normal = Fn(() => {
      const i = vertexIndex;
      const r = i.div(uint(W)).toVar();
      const c = i.mod(uint(W)).toVar();
      // The neighbours each side, the point itself at an edge.
      const cl = c.equal(uint(0)).select(c, c.sub(uint(1)));
      const cr = c.equal(uint(W - 1)).select(c, c.add(uint(1)));
      const ru = r.equal(uint(0)).select(r, r.sub(uint(1)));
      const rd = r.equal(uint(H - 1)).select(r, r.add(uint(1)));
      // Across, then down, turned to face where the sheet's triangles face.
      return normalize(cross(at(r, cr).sub(at(r, cl)), at(rd, c).sub(at(ru, c)))).mul(this.facing);
    })() as unknown as V3;
    const previous = lastR.element(vertexIndex).xyz as unknown as V3;
    return { position, normal, previous, id: this.id };
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geo.dispose();
    const m = this.mesh.material as THREE.Material;
    if (!m.userData.shared) m.dispose();
    this.sim.dispose();
    this.place = null;
  }
}

/**
 * Which way the sheet's first triangle faces against "across, then down"
 * at its first point (the draw's normal): 1 along, -1 against.
 */
function sheetFacing(sheet: ClothSheet): number {
  const p = sheet.geometry.getAttribute('position') as THREE.BufferAttribute;
  const idx = sheet.geometry.index!;
  const v = (i: number) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
  const a = v(idx.getX(0));
  const tri = v(idx.getX(1)).sub(a).cross(v(idx.getX(2)).sub(a));
  const W = sheet.cols;
  const across = v(1).sub(v(0)).cross(v(W).sub(v(0)));
  return tri.dot(across) < 0 ? -1 : 1;
}

/** The vertex-stage reads of one cloth (`Cloth.buildDraw`). */
export interface ClothNodes {
  position: V3;
  normal: V3;
  previous: V3;
  id: number;
}

/**
 * A lit material whose vertices come from a cloth's buffers. Copies keep the
 * cloth (a tint or a see-through twin is a clone), and the shadow pass reads
 * the same places (`castShadowPositionNode`).
 */
export class ClothMaterial extends THREE.MeshStandardNodeMaterial {
  cloth: ClothNodes | null = null;

  override setupPosition(builder: THREE.NodeBuilder): THREE.Node {
    const c = this.cloth;
    if (c && hookSeen('VelocityNode positionPrevious', true)) {
      positionLocal.assign(c.position);
      normalLocal.assign(c.normal);
      // Only a pass that writes motion asks for last frame's place.
      if ((builder as unknown as { needsPreviousData(): boolean }).needsPreviousData()) positionPrevious.assign(c.previous);
    }
    return super.setupPosition(builder);
  }

  override copy(source: THREE.Material): this {
    super.copy(source);
    const c = (source as Partial<ClothMaterial>).cloth;
    if (c !== undefined) this.cloth = c;
    return this;
  }
}

/** The cloth's own copy of `look`, drawn from the cloth's buffers. */
export function clothMaterial(look: THREE.Material, nodes: ClothNodes): ClothMaterial {
  const m = new ClothMaterial();
  // A plain (not node) look gives its surface values, not its (missing) nodes.
  if ((look as THREE.NodeMaterial).isNodeMaterial) m.copy(look);
  else if ((look as THREE.MeshStandardMaterial).isMeshStandardMaterial) THREE.MeshStandardMaterial.prototype.copy.call(m, look as THREE.MeshStandardMaterial);
  else THREE.Material.prototype.copy.call(m, look);
  m.userData = { ...look.userData, shared: false, cloth: nodes.id };
  // Textures sampled inside the look's nodes (the hero's scans) go with it.
  copyScans(look, m);
  copyNodeTextures(look, m);
  m.cloth = nodes;
  m.castShadowPositionNode = nodes.position;
  // Both faces show: a cape's lining when it flies, a banner's back.
  m.side = THREE.DoubleSide;
  return m;
}
