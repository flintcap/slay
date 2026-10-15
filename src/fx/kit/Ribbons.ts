/**
 * SLAY vfx kit: ribbons. Weapon swing arcs, projectile trails and lightning
 * bolts, every one of them in a single batched mesh and one draw call.
 *
 * A ribbon is a short history of points. Each point is two edge vertices:
 *  - `swing`: the edges are the weapon's hilt and tip, so the ribbon is the
 *    surface the blade swept. Bright, hot leading edge; streaks along the arc;
 *    gone in a fifth of a second.
 *  - `trail`: the edges straddle a centre line, turned to face the camera.
 *  - `bolt`: like trail but thin, white-hot and flickering.
 *
 * Slots are allocated once. A frame writes only the live ribbons' vertices,
 * and nothing is allocated after construction.
 */

import * as THREE from 'three/webgpu';
import { Discard, If, abs, attribute, clamp, float, floor, fract, mix, pow, sin, smoothstep, uniform } from 'three/tsl';
import { premultiplied } from './Particles';
import { unpackRGB, packLinear, ramp, mixHex, darken, type School } from './Palette';
import { kitMaterial, kitOut, slot } from './Nodes';
import { vary, type F, type V4 } from '../../core/Tsl';

export type RibbonKind = 'swing' | 'trail' | 'bolt';
const KIND_ID: Record<RibbonKind, number> = { swing: 0, trail: 1, bolt: 2 };

function h1(n: F): F {
  return fract(sin(n).mul(43758.5453));
}

function n1(x: F): F {
  const i = floor(x);
  const f = fract(x);
  return mix(h1(i), h1(i.add(1.0)), f.mul(f).mul(f.mul(-2.0).add(3.0)));
}

/** The ribbon shader: heat and cover by kind, through the ramp. */
function ribbonMaterial(uTime: F): THREE.MeshBasicNodeMaterial {
  // along (0 tail .. 1 head), across (0 .. 1)
  const vUv = vary(attribute<'vec2'>('aUv', 'vec2'));
  // fade (0..1), emit, kind, seed
  const vLook = vary(attribute<'vec4'>('aLook', 'vec4'));
  // core, body, tail (packed)
  const aCol = attribute<'vec3'>('aCol', 'vec3');
  const vCore = vary(unpackRGB(aCol.x));
  const vBody = vary(unpackRGB(aCol.y));
  const vTail = vary(unpackRGB(aCol.z));
  const frag = (): V4 => {
    const fade = vLook.x.toVar();
    Discard(fade.lessThanEqual(0.001));
    const kind = vLook.z;
    const seed = vLook.w;
    const u = vUv.x.toVar();
    const v = vUv.y.toVar();
    const heat = slot();
    const cov = slot();
    If(kind.lessThan(0.5), () => {
      // Swing: the swept surface. Hottest at the tip edge and at the head.
      const tip = smoothstep(0.15, 1.0, v).mul(0.65).add(0.35).toVar();
      const streak = n1(v.mul(7.0).add(seed.mul(31.0))).mul(0.22).add(0.78).toVar();
      const head = smoothstep(0.55, 1.0, u);
      heat.assign(clamp(fade.mul(tip).mul(head.mul(0.6).add(0.6)).mul(streak), 0.0, 1.0));
      cov.assign(smoothstep(0.0, 0.25, v).mul(fade).mul(tip).mul(streak).mul(smoothstep(0.0, 0.15, u)));
    })
      .ElseIf(kind.lessThan(1.5), () => {
        // Trail: a soft tube, hot down the middle.
        const c = abs(v.mul(2.0).sub(1.0)).oneMinus().toVar();
        const breakup = n1(u.mul(14.0).sub(uTime.mul(9.0)).add(seed.mul(17.0))).mul(0.35).add(0.65).toVar();
        heat.assign(clamp(fade.mul(pow(c, 1.5)).mul(breakup).mul(1.1), 0.0, 1.0));
        cov.assign(smoothstep(0.0, 0.6, c).mul(fade).mul(breakup));
      })
      .Else(() => {
        // Bolt: a white-hot hairline in a narrow glow, flickering.
        const c = abs(v.mul(2.0).sub(1.0)).oneMinus().toVar();
        const flick = h1(floor(uTime.mul(30.0)).add(seed.mul(13.0))).mul(0.4).add(0.6).toVar();
        heat.assign(clamp(pow(c, 3.0).mul(1.4).mul(flick), 0.0, 1.0).mul(fade));
        cov.assign(pow(c, 6.0).add(pow(c, 1.5).mul(0.45)).mul(fade).mul(flick));
      });
    // Ribbons are light: they hide only a touch of what is behind them.
    return kitOut({ core: vCore, body: vBody, tail: vTail, emit: vLook.y, D: vLook }, heat, clamp(cov, 0.0, 1.0), float(0.12));
  };
  return kitMaterial('fx-ribbons', frag);
}

/** A handle to a live ribbon. Stale handles are ignored. */
export interface RibbonHandle {
  readonly slot: number;
  readonly gen: number;
}

export interface RibbonOpts {
  /** Seconds a point lives. */
  life?: number;
  /** Width for trails and bolts (metres). */
  width?: number;
  school?: School;
  /** Body colour override (sRGB hex). */
  color?: number;
  /** Emission multiplier on top of the school's glow. */
  emit?: number;
}

const _side = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _toCam = new THREE.Vector3();
const _camPos = new THREE.Vector3();

export class RibbonBatch {
  readonly mesh: THREE.Mesh;
  private readonly R: number;
  private readonly N: number;
  private geo: THREE.BufferGeometry;
  private mat: THREE.MeshBasicNodeMaterial;
  private uTime = uniform(0);
  private pos: Float32Array;
  private uv: Float32Array;
  private look: Float32Array;
  private col: Float32Array;
  private posAttr: THREE.BufferAttribute;
  private uvAttr: THREE.BufferAttribute;
  private lookAttr: THREE.BufferAttribute;
  private colAttr: THREE.BufferAttribute;
  private attrList: THREE.BufferAttribute[];

  // Per-ribbon state.
  private live: Uint8Array;
  private retired: Uint8Array;
  private gen: Int32Array;
  private kind: Uint8Array;
  private life: Float32Array;
  private width: Float32Array;
  private emit: Float32Array;
  private colors: Float32Array; // core, body, tail packed
  private seed: Float32Array;
  private head: Int32Array; // next write index in the point ring
  private count: Int32Array; // points stored
  // Per-point ring: ax ay az bx by bz born
  private pts: Float32Array;
  private time = 0;
  private seedCounter = 0;
  private wasDrawn = false;

  constructor(ribbons = 40, points = 20) {
    this.R = ribbons;
    this.N = points;
    const verts = ribbons * points * 2;
    this.pos = new Float32Array(verts * 3);
    this.uv = new Float32Array(verts * 2);
    this.look = new Float32Array(verts * 4);
    this.col = new Float32Array(verts * 3);
    const idx: number[] = [];
    for (let r = 0; r < ribbons; r++) {
      for (let p = 0; p < points - 1; p++) {
        const a = (r * points + p) * 2;
        idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.uvAttr = new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage);
    this.lookAttr = new THREE.BufferAttribute(this.look, 4).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aUv', this.uvAttr);
    geo.setAttribute('aLook', this.lookAttr);
    geo.setAttribute('aCol', this.colAttr);
    this.attrList = [this.posAttr, this.uvAttr, this.lookAttr, this.colAttr];
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    this.geo = geo;

    this.mat = ribbonMaterial(this.uTime);
    premultiplied(this.mat);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.name = 'fx:ribbons';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 21;
    this.mesh.visible = false;

    this.live = new Uint8Array(ribbons);
    this.retired = new Uint8Array(ribbons);
    this.gen = new Int32Array(ribbons);
    this.kind = new Uint8Array(ribbons);
    this.life = new Float32Array(ribbons);
    this.width = new Float32Array(ribbons);
    this.emit = new Float32Array(ribbons);
    this.colors = new Float32Array(ribbons * 3);
    this.seed = new Float32Array(ribbons);
    this.head = new Int32Array(ribbons);
    this.count = new Int32Array(ribbons);
    this.pts = new Float32Array(ribbons * points * 7);
  }

  /** Starts a ribbon. Steals the oldest retired one when every slot is busy. */
  start(kind: RibbonKind, o: RibbonOpts = {}): RibbonHandle {
    let slot = -1;
    for (let i = 0; i < this.R; i++) if (!this.live[i]) { slot = i; break; }
    if (slot < 0) {
      for (let i = 0; i < this.R; i++) if (this.retired[i]) { slot = i; break; }
    }
    if (slot < 0) slot = this.seedCounter % this.R;
    this.live[slot] = 1;
    this.retired[slot] = 0;
    this.gen[slot] = (this.gen[slot]! + 1) | 0;
    this.kind[slot] = KIND_ID[kind];
    this.life[slot] = o.life ?? (kind === 'swing' ? 0.16 : kind === 'bolt' ? 0.12 : 0.25);
    this.width[slot] = o.width ?? (kind === 'bolt' ? 0.12 : 0.3);
    const r = ramp(o.school);
    const body = o.color ?? r.body;
    const core = o.color !== undefined ? mixHex(body, 0xffffff, 0.6) : r.core;
    const tail = o.color !== undefined ? darken(body, 0.55) : r.tail;
    this.colors[slot * 3] = packLinear(core);
    this.colors[slot * 3 + 1] = packLinear(body);
    this.colors[slot * 3 + 2] = packLinear(tail);
    this.emit[slot] = (o.emit ?? 1) * r.glow;
    this.seed[slot] = (this.seedCounter++ % 97) / 97;
    this.head[slot] = 0;
    this.count[slot] = 0;
    return { slot, gen: this.gen[slot]! };
  }

  private ok(h: RibbonHandle | null): h is RibbonHandle {
    return !!h && this.live[h.slot] === 1 && this.gen[h.slot] === h.gen;
  }

  /**
   * Adds a point given both edges (swing: hilt and tip). `age` back-dates the
   * point, so a swing replayed from history fades from its oldest end first.
   */
  pushEdges(h: RibbonHandle | null, ax: number, ay: number, az: number, bx: number, by: number, bz: number, age = 0): void {
    if (!this.ok(h) || this.retired[h.slot]) return;
    const s = h.slot;
    const i = this.head[s]!;
    const o = (s * this.N + i) * 7;
    const P = this.pts;
    P[o] = ax; P[o + 1] = ay; P[o + 2] = az;
    P[o + 3] = bx; P[o + 4] = by; P[o + 5] = bz;
    P[o + 6] = this.time - age;
    this.head[s] = (i + 1) % this.N;
    if (this.count[s]! < this.N) this.count[s]!++;
  }

  /** Adds a centre point (trail, bolt). Edges are found at draw time. */
  pushPoint(h: RibbonHandle | null, x: number, y: number, z: number): void {
    this.pushEdges(h, x, y, z, x, y, z);
  }

  /** Drops every point but keeps the slot and look: a flickering bolt redraws its path. */
  reset(h: RibbonHandle | null): void {
    if (!this.ok(h)) return;
    this.head[h.slot] = 0;
    this.count[h.slot] = 0;
  }

  /** Points stop being added; the ribbon fades out and frees itself. */
  retire(h: RibbonHandle | null): void {
    if (!this.ok(h)) return;
    this.retired[h.slot] = 1;
  }

  /** Kills a ribbon at once. */
  kill(h: RibbonHandle | null): void {
    if (!this.ok(h)) return;
    this.live[h.slot] = 0;
    this.retired[h.slot] = 0;
  }

  update(dt: number, camera: THREE.Camera | null): void {
    this.time += dt;
    this.uTime.value = this.time;
    if (camera) camera.getWorldPosition(_camPos);
    let maxSlot = -1;
    const N = this.N;
    for (let s = 0; s < this.R; s++) {
      if (!this.live[s]) continue;
      const life = this.life[s]!;
      const cnt = this.count[s]!;
      const head = this.head[s]!;
      // Expire old points: count only the young ones.
      let young = 0;
      for (let k = 0; k < cnt; k++) {
        const idx = (head - 1 - k + N * 2) % N;
        if (this.time - this.pts[(s * N + idx) * 7 + 6]! < life) young++;
        else break;
      }
      if (young === 0 && this.retired[s]) {
        this.live[s] = 0;
        this.retired[s] = 0;
        this.collapse(s);
        continue;
      }
      maxSlot = s;
      this.write(s, young);
    }
    const drawn = maxSlot >= 0;
    if (drawn || this.wasDrawn) {
      const verts = (maxSlot + 1) * N * 2;
      this.geo.setDrawRange(0, Math.max(0, (maxSlot + 1) * (N - 1) * 6));
      for (const a of this.attrList) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, Math.max(1, verts) * a.itemSize);
        a.needsUpdate = true;
      }
    }
    this.mesh.visible = drawn;
    this.wasDrawn = drawn;
  }

  /** Writes a ribbon's vertices, oldest point first; unused points collapse. */
  private write(s: number, young: number): void {
    const N = this.N;
    const kind = this.kind[s]!;
    const life = this.life[s]!;
    const halfW = this.width[s]! * 0.5;
    const head = this.head[s]!;
    const base = s * N * 2;
    const cc = this.colors[s * 3]!;
    const cb = this.colors[s * 3 + 1]!;
    const ct = this.colors[s * 3 + 2]!;
    const emit = this.emit[s]!;
    const seed = this.seed[s]!;
    const P = this.pts;
    for (let k = 0; k < N; k++) {
      const v0 = base + k * 2;
      if (k >= young) {
        // Collapse onto the oldest valid point with zero fade.
        this.look[v0 * 4] = 0;
        this.look[(v0 + 1) * 4] = 0;
        continue;
      }
      // k = 0 is the oldest young point.
      const idx = (head - young + k + N * 2) % N;
      const o = (s * N + idx) * 7;
      const age = this.time - P[o + 6]!;
      const fade = Math.max(0, 1 - age / life);
      const along = young > 1 ? k / (young - 1) : 1;
      let ax = P[o]!;
      let ay = P[o + 1]!;
      let az = P[o + 2]!;
      let bx = P[o + 3]!;
      let by = P[o + 4]!;
      let bz = P[o + 5]!;
      if (kind !== 0) {
        // Centre line: build edges across the camera view.
        const kn = k < young - 1 ? k + 1 : k;
        const kp = k > 0 ? k - 1 : k;
        const on = (s * N + ((head - young + kn + N * 2) % N)) * 7;
        const op = (s * N + ((head - young + kp + N * 2) % N)) * 7;
        _tan.set(P[on]! - P[op]!, P[on + 1]! - P[op + 1]!, P[on + 2]! - P[op + 2]!);
        if (_tan.lengthSq() < 1e-10) _tan.set(1, 0, 0);
        _toCam.set(_camPos.x - ax, _camPos.y - ay, _camPos.z - az);
        _side.crossVectors(_tan, _toCam);
        if (_side.lengthSq() < 1e-10) _side.set(0, 1, 0);
        // Taper toward the tail.
        const w = halfW * (kind === 2 ? 1 : 0.35 + 0.65 * along);
        _side.normalize().multiplyScalar(w);
        bx = ax + _side.x; by = ay + _side.y; bz = az + _side.z;
        ax -= _side.x; ay -= _side.y; az -= _side.z;
      }
      const p0 = v0 * 3;
      this.pos[p0] = ax; this.pos[p0 + 1] = ay; this.pos[p0 + 2] = az;
      this.pos[p0 + 3] = bx; this.pos[p0 + 4] = by; this.pos[p0 + 5] = bz;
      const u0 = v0 * 2;
      this.uv[u0] = along; this.uv[u0 + 1] = 0;
      this.uv[u0 + 2] = along; this.uv[u0 + 3] = 1;
      const l0 = v0 * 4;
      this.look[l0] = fade; this.look[l0 + 1] = emit; this.look[l0 + 2] = kind; this.look[l0 + 3] = seed;
      this.look[l0 + 4] = fade; this.look[l0 + 5] = emit; this.look[l0 + 6] = kind; this.look[l0 + 7] = seed;
      const c0 = v0 * 3;
      this.col[c0] = cc; this.col[c0 + 1] = cb; this.col[c0 + 2] = ct;
      this.col[c0 + 3] = cc; this.col[c0 + 4] = cb; this.col[c0 + 5] = ct;
    }
    // Pin collapsed vertices onto the newest point so no sliver stretches.
    if (young < N && young > 0) {
      const last = base + (young - 1) * 2;
      for (let k = young; k < N; k++) {
        const v0 = base + k * 2;
        for (let e = 0; e < 2; e++) {
          this.pos[(v0 + e) * 3] = this.pos[(last + e) * 3]!;
          this.pos[(v0 + e) * 3 + 1] = this.pos[(last + e) * 3 + 1]!;
          this.pos[(v0 + e) * 3 + 2] = this.pos[(last + e) * 3 + 2]!;
        }
      }
    }
  }

  private collapse(s: number): void {
    const N = this.N;
    const base = s * N * 2;
    for (let k = 0; k < N * 2; k++) this.look[(base + k) * 4] = 0;
  }

  /** Live ribbons right now. */
  get liveCount(): number {
    let n = 0;
    for (let i = 0; i < this.R; i++) n += this.live[i]!;
    return n;
  }

  clear(): void {
    this.live.fill(0);
    this.retired.fill(0);
    this.look.fill(0);
    this.lookAttr.needsUpdate = true;
    this.geo.setDrawRange(0, 0);
    this.mesh.visible = false;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
