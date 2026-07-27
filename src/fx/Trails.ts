/**
 * SLAY — ribbon trails.
 *
 * A weapon arc is not a particle spray. It is a *surface*: the area swept by
 * the blade between two frames, tapering and fading behind the tip. This module
 * builds that surface as a proper triangle strip with pre-allocated buffers.
 *
 * Two modes:
 *
 *  - `swept`   — the caller supplies both edges of the ribbon (hilt and tip of
 *                a sword, the two rails of a dash). The strip is the real
 *                swept quad, so it reads correctly from any camera angle. This
 *                is the signature ARPG weapon-arc look.
 *  - `ribbon`  — the caller supplies a centre line and a width; the strip is
 *                billboarded around it so it always faces the camera. Right for
 *                projectiles, comet tails and motion streaks.
 *
 * Buffers are allocated once at construction and only ever rewritten in place;
 * `setDrawRange` hides the unused tail.
 */

import * as THREE from 'three';
import { Noise, clamp01 } from '../art/Noise';

// ---------------------------------------------------------------------------
// Ribbon texture
// ---------------------------------------------------------------------------

let ribbonTexture: THREE.Texture | null = null;

/**
 * A 128x64 strip: alpha falls off toward the ribbon edges (V) with a hot
 * spine, and carries a faint lengthwise streak (U) so a fast swing shows
 * internal structure instead of reading as a flat gel band.
 */
function buildRibbonTexture(): THREE.Texture {
  if (ribbonTexture) return ribbonTexture;
  const W = 128;
  const H = 64;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const noise = new Noise(0x7a11);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1);
      const v = (y / (H - 1)) * 2 - 1; // -1..1 across the ribbon
      const across = Math.pow(clamp01(1 - Math.abs(v)), 1.35);
      const spine = Math.exp(-(v * v) * 26);
      const streak = 0.72 + 0.28 * (noise.fbm(u * 7.5, v * 2.2, 3) * 0.5 + 0.5);
      const a = clamp01(across * streak);
      const lum = clamp01(0.55 + spine * 0.45) * 255;
      const o = (y * W + x) * 4;
      d[o] = lum;
      d[o + 1] = lum;
      d[o + 2] = lum;
      d[o + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  ribbonTexture = tex;
  return tex;
}

// ---------------------------------------------------------------------------
// Shader
// ---------------------------------------------------------------------------

const TRAIL_VERT = /* glsl */ `
  attribute vec2 aParam;   // u along length (0 = head), side (-1/+1)

  varying vec2 vUv;
  varying float vU;

  void main() {
    vUv = vec2(aParam.x, aParam.y * 0.5 + 0.5);
    vU = aParam.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TRAIL_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uHead;
  uniform vec3 uTail;
  uniform float uOpacity;
  uniform float uScroll;
  uniform float uSharpen;

  varying vec2 vUv;
  varying float vU;

  void main() {
    vec4 tex = texture2D(uMap, vec2(vUv.x + uScroll, vUv.y));
    // Tail alpha falls off faster than linearly: the head must stay solid or
    // the swing loses its leading edge.
    float lenFade = pow(max(1.0 - vU, 0.0), uSharpen);
    float a = tex.a * lenFade * uOpacity;
    if (a < 0.006) discard;
    vec3 col = mix(uHead, uTail, pow(vU, 0.75)) * tex.rgb;
    gl_FragColor = vec4(col, a);
  }
`;

// ---------------------------------------------------------------------------
// Trail
// ---------------------------------------------------------------------------

export type TrailMode = 'swept' | 'ribbon';

export interface TrailOptions {
  /** Maximum recorded samples. 16-40 covers everything; longer costs memory. */
  segments?: number;
  /** Seconds a sample survives after being recorded. */
  life?: number;
  /** Ribbon half-width for `ribbon` mode, in world units. */
  width?: number;
  headColor?: number;
  tailColor?: number;
  opacity?: number;
  additive?: boolean;
  mode?: TrailMode;
  /** Minimum movement before a new sample is recorded (prevents fan artefacts). */
  minStep?: number;
  /** Tail fade exponent — higher keeps the head hotter. */
  sharpen?: number;
  /** Texture scroll speed along the ribbon. */
  scroll?: number;
  renderOrder?: number;
}

interface Sample {
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  t: number;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _view = new THREE.Vector3();
const _side = new THREE.Vector3();
const _camPos = new THREE.Vector3();

/**
 * One ribbon. Cheap enough to keep several alive per entity; the CPU cost is
 * `segments` vector ops per frame, and the GPU cost is one small draw call.
 */
export class Trail {
  readonly mesh: THREE.Mesh;
  private geo: THREE.BufferGeometry;
  private mat: THREE.ShaderMaterial;

  private posAttr: THREE.BufferAttribute;
  private paramAttr: THREE.BufferAttribute;

  private samples: Sample[] = [];
  private maxSamples: number;
  private life: number;
  private width: number;
  private mode: TrailMode;
  private minStep: number;

  /** While false the trail stops recording and drains away. */
  emitting = true;
  /** Set by TrailSystem when the trail is returned to the pool. */
  active = true;

  private time = 0;
  private targetOpacity: number;
  private fadeOut = 0;
  private scroll = 0;

  constructor(opts: TrailOptions = {}) {
    this.maxSamples = Math.max(3, opts.segments ?? 26);
    this.life = opts.life ?? 0.28;
    this.width = opts.width ?? 0.12;
    this.mode = opts.mode ?? 'swept';
    this.minStep = opts.minStep ?? 0.012;
    this.targetOpacity = opts.opacity ?? 1;

    const verts = this.maxSamples * 2;
    const positions = new Float32Array(verts * 3);
    const params = new Float32Array(verts * 2);
    for (let i = 0; i < this.maxSamples; i++) {
      params[i * 4 + 0] = 0;
      params[i * 4 + 1] = -1;
      params[i * 4 + 2] = 0;
      params[i * 4 + 3] = 1;
    }

    const indices = new Uint16Array((this.maxSamples - 1) * 6);
    for (let i = 0; i < this.maxSamples - 1; i++) {
      const v = i * 2;
      const o = i * 6;
      indices[o] = v;
      indices[o + 1] = v + 1;
      indices[o + 2] = v + 2;
      indices[o + 3] = v + 1;
      indices[o + 4] = v + 3;
      indices[o + 5] = v + 2;
    }

    this.geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(positions, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.paramAttr = new THREE.BufferAttribute(params, 2);
    this.paramAttr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('aParam', this.paramAttr);
    this.geo.setIndex(new THREE.BufferAttribute(indices, 1));
    this.geo.setDrawRange(0, 0);
    // The ribbon lives in world space; a fixed huge sphere avoids per-frame
    // bounds recomputation while keeping it out of the cull.
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: buildRibbonTexture() },
        uHead: { value: new THREE.Color(opts.headColor ?? 0xffffff) },
        uTail: { value: new THREE.Color(opts.tailColor ?? 0x4060ff) },
        uOpacity: { value: this.targetOpacity },
        uScroll: { value: 0 },
        uSharpen: { value: opts.sharpen ?? 1.6 },
      },
      vertexShader: TRAIL_VERT,
      fragmentShader: TRAIL_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    // Slight HDR push so bloom picks up the leading edge of a swing.
    (this.mat.uniforms.uHead!.value as THREE.Color).multiplyScalar(1.7);
    (this.mat.uniforms.uTail!.value as THREE.Color).multiplyScalar(1.1);

    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = opts.renderOrder ?? 11;

    this.scroll = opts.scroll ?? 0;
  }

  get material(): THREE.ShaderMaterial {
    return this.mat;
  }

  setColors(head: number, tail: number, boost = 1.7): void {
    (this.mat.uniforms.uHead!.value as THREE.Color).setHex(head).multiplyScalar(boost);
    (this.mat.uniforms.uTail!.value as THREE.Color).setHex(tail).multiplyScalar(boost * 0.65);
  }

  setOpacity(v: number): void {
    this.targetOpacity = v;
  }

  setWidth(v: number): void {
    this.width = v;
  }

  /** Records an explicit ribbon cross-section (swept mode). */
  pushEdges(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    if (!this.emitting) return;
    const head = this.samples[0];
    if (head) {
      const dx = ax - head.ax;
      const dy = ay - head.ay;
      const dz = az - head.az;
      if (dx * dx + dy * dy + dz * dz < this.minStep * this.minStep) {
        // Below the movement threshold: slide the head instead of stacking
        // coincident samples, which would otherwise fan into z-fighting slivers.
        head.ax = ax; head.ay = ay; head.az = az;
        head.bx = bx; head.by = by; head.bz = bz;
        head.t = this.time;
        return;
      }
    }
    this.samples.unshift({ ax, ay, az, bx, by, bz, t: this.time });
    if (this.samples.length > this.maxSamples) this.samples.length = this.maxSamples;
  }

  /** Records a centre-line point (ribbon mode); edges are derived per frame. */
  pushPoint(x: number, y: number, z: number): void {
    this.pushEdges(x, y, z, x, y, z);
  }

  /** Samples the two ends of an object's local segment — a blade, for example. */
  followSegment(obj: THREE.Object3D, localA: THREE.Vector3, localB: THREE.Vector3): void {
    obj.updateWorldMatrix(true, false);
    _a.copy(localA).applyMatrix4(obj.matrixWorld);
    _b.copy(localB).applyMatrix4(obj.matrixWorld);
    this.pushEdges(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z);
  }

  /** Samples an object's world position as a centre-line point. */
  follow(obj: THREE.Object3D, offset?: THREE.Vector3): void {
    obj.updateWorldMatrix(true, false);
    _a.setFromMatrixPosition(obj.matrixWorld);
    if (offset) _a.add(offset);
    this.pushPoint(_a.x, _a.y, _a.z);
  }

  /** Stops recording and fades the ribbon out over `seconds`. */
  retire(seconds = 0.25): void {
    this.emitting = false;
    this.fadeOut = Math.max(this.fadeOut, seconds);
  }

  /** True once the ribbon has fully drained; the pool then recycles it. */
  get finished(): boolean {
    return !this.emitting && this.samples.length === 0;
  }

  update(dt: number, camera?: THREE.Camera): void {
    this.time += dt;

    // Expire the tail.
    const cutoff = this.time - this.life;
    while (this.samples.length > 0 && this.samples[this.samples.length - 1]!.t < cutoff) {
      this.samples.pop();
    }

    let opacity = this.targetOpacity;
    if (!this.emitting && this.fadeOut > 0) {
      // Extra drain on top of the natural expiry so a retired trail cannot
      // linger visibly when the entity it belonged to is already gone.
      this.fadeOut -= dt;
      opacity *= clamp01(this.fadeOut / Math.max(this.life, 0.05));
      if (this.fadeOut <= 0) this.samples.length = 0;
    }
    this.mat.uniforms.uOpacity!.value = opacity;

    if (this.scroll !== 0) {
      this.mat.uniforms.uScroll!.value = (this.mat.uniforms.uScroll!.value as number) - this.scroll * dt;
    }

    const n = this.samples.length;
    if (n < 2) {
      this.geo.setDrawRange(0, 0);
      return;
    }

    if (camera) camera.getWorldPosition(_camPos);
    const pos = this.posAttr.array as Float32Array;
    const par = this.paramAttr.array as Float32Array;

    for (let i = 0; i < n; i++) {
      const s = this.samples[i]!;
      const u = i / (n - 1);
      // Taper: the ribbon narrows toward the tail. A cubic-ish curve keeps the
      // head broad and pulls the tip to a point.
      const taper = Math.pow(1 - u, 0.55);

      let ax = s.ax, ay = s.ay, az = s.az;
      let bx = s.bx, by = s.by, bz = s.bz;

      if (this.mode === 'ribbon') {
        // Billboard: offset perpendicular to both the tangent and the view ray.
        const prev = this.samples[Math.max(0, i - 1)]!;
        const next = this.samples[Math.min(n - 1, i + 1)]!;
        _tan.set(next.ax - prev.ax, next.ay - prev.ay, next.az - prev.az);
        if (_tan.lengthSq() < 1e-10) _tan.set(0, 0, 1);
        _tan.normalize();
        if (camera) _view.set(s.ax, s.ay, s.az).sub(_camPos).normalize();
        else _view.set(0, -1, 0);
        _side.crossVectors(_tan, _view);
        if (_side.lengthSq() < 1e-10) _side.set(1, 0, 0);
        _side.normalize().multiplyScalar(this.width * taper);
        ax = s.ax - _side.x; ay = s.ay - _side.y; az = s.az - _side.z;
        bx = s.ax + _side.x; by = s.ay + _side.y; bz = s.az + _side.z;
      } else if (taper < 0.999) {
        // Swept: shrink the cross-section toward its own midpoint.
        const mx = (s.ax + s.bx) * 0.5;
        const my = (s.ay + s.by) * 0.5;
        const mz = (s.az + s.bz) * 0.5;
        ax = mx + (s.ax - mx) * taper;
        ay = my + (s.ay - my) * taper;
        az = mz + (s.az - mz) * taper;
        bx = mx + (s.bx - mx) * taper;
        by = my + (s.by - my) * taper;
        bz = mz + (s.bz - mz) * taper;
      }

      const o = i * 6;
      pos[o] = ax; pos[o + 1] = ay; pos[o + 2] = az;
      pos[o + 3] = bx; pos[o + 4] = by; pos[o + 5] = bz;
      const p = i * 4;
      par[p] = u; par[p + 1] = -1;
      par[p + 2] = u; par[p + 3] = 1;
    }

    this.posAttr.clearUpdateRanges();
    this.posAttr.addUpdateRange(0, n * 6);
    this.posAttr.needsUpdate = true;
    this.paramAttr.clearUpdateRanges();
    this.paramAttr.addUpdateRange(0, n * 4);
    this.paramAttr.needsUpdate = true;
    this.geo.setDrawRange(0, (n - 1) * 6);
  }

  reset(): void {
    this.samples.length = 0;
    this.emitting = true;
    this.fadeOut = 0;
    this.time = 0;
    this.geo.setDrawRange(0, 0);
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ---------------------------------------------------------------------------
// Presets + pool
// ---------------------------------------------------------------------------

/** Art-directed defaults so call sites read as intent, not as tuning. */
export const TRAIL_PRESETS: Record<string, TrailOptions> = {
  sword: { mode: 'swept', segments: 22, life: 0.16, headColor: 0xffffff, tailColor: 0x7fa8ff, sharpen: 1.9, opacity: 0.95 },
  axe: { mode: 'swept', segments: 20, life: 0.2, headColor: 0xfff0d8, tailColor: 0xff8a30, sharpen: 1.5, opacity: 1 },
  blunt: { mode: 'swept', segments: 16, life: 0.16, headColor: 0xf0f0f0, tailColor: 0x808898, sharpen: 1.4, opacity: 0.75 },
  dagger: { mode: 'swept', segments: 18, life: 0.12, headColor: 0xe8ffe8, tailColor: 0x50ff90, sharpen: 2.2, opacity: 0.9 },
  fire: { mode: 'ribbon', segments: 30, life: 0.34, width: 0.16, headColor: 0xfff0b0, tailColor: 0xd02000, sharpen: 1.5, scroll: 1.4 },
  frost: { mode: 'ribbon', segments: 30, life: 0.4, width: 0.15, headColor: 0xffffff, tailColor: 0x3f9cff, sharpen: 1.6, scroll: 0.6 },
  lightning: { mode: 'ribbon', segments: 24, life: 0.16, width: 0.13, headColor: 0xffffff, tailColor: 0x3070ff, sharpen: 2.4, scroll: 3.5 },
  poison: { mode: 'ribbon', segments: 30, life: 0.45, width: 0.15, headColor: 0xd8ff80, tailColor: 0x2c7a14, sharpen: 1.4, scroll: 0.5 },
  arcane: { mode: 'ribbon', segments: 30, life: 0.36, width: 0.15, headColor: 0xf0dcff, tailColor: 0x7a2fd0, sharpen: 1.6, scroll: 1.0 },
  shadow: { mode: 'ribbon', segments: 28, life: 0.4, width: 0.18, headColor: 0x8050c0, tailColor: 0x100020, sharpen: 1.3, additive: false, opacity: 0.8 },
  dash: { mode: 'swept', segments: 20, life: 0.24, headColor: 0xc8d8ff, tailColor: 0x203050, sharpen: 1.3, opacity: 0.7 },
  arrow: { mode: 'ribbon', segments: 18, life: 0.14, width: 0.045, headColor: 0xffffff, tailColor: 0xa0b0c0, sharpen: 2.0 },
  gold: { mode: 'ribbon', segments: 22, life: 0.3, width: 0.1, headColor: 0xfff0c0, tailColor: 0xc08010, sharpen: 1.6, scroll: 0.8 },
};

/**
 * Owns every live ribbon in a scene. Recycles retired trails so a hundred
 * sword swings a minute never allocate a second geometry.
 */
export class TrailSystem {
  private scene: THREE.Scene;
  private live: Trail[] = [];
  private free = new Map<string, Trail[]>();
  private cap: number;

  constructor(scene: THREE.Scene, maxLive = 48) {
    this.scene = scene;
    this.cap = maxLive;
  }

  /** Acquires a trail. `preset` keys into TRAIL_PRESETS; `over` refines it. */
  spawn(preset: string, over?: TrailOptions): Trail {
    const base = TRAIL_PRESETS[preset] ?? TRAIL_PRESETS.sword!;
    const opts: TrailOptions = { ...base, ...over };
    const key = `${preset}|${opts.segments ?? 0}|${opts.mode ?? ''}|${opts.additive === false ? 'n' : 'a'}`;
    const bucket = this.free.get(key);
    let trail = bucket?.pop();
    if (!trail) {
      trail = new Trail(opts);
      (trail as unknown as { __key: string }).__key = key;
    }
    trail.reset();
    trail.active = true;
    if (opts.headColor !== undefined && opts.tailColor !== undefined) {
      trail.setColors(opts.headColor, opts.tailColor);
    }
    if (opts.width !== undefined) trail.setWidth(opts.width);
    if (opts.opacity !== undefined) trail.setOpacity(opts.opacity);
    this.scene.add(trail.mesh);
    this.live.push(trail);

    // Hard cap: retire the oldest rather than growing without bound.
    while (this.live.length > this.cap) {
      const oldest = this.live[0]!;
      if (oldest === trail) break;
      oldest.retire(0.08);
      break;
    }
    return trail;
  }

  update(dt: number, camera?: THREE.Camera): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const t = this.live[i]!;
      t.update(dt, camera);
      if (t.finished) {
        this.scene.remove(t.mesh);
        this.live.splice(i, 1);
        const key = (t as unknown as { __key?: string }).__key ?? 'default';
        let bucket = this.free.get(key);
        if (!bucket) {
          bucket = [];
          this.free.set(key, bucket);
        }
        if (bucket.length < 12) bucket.push(t);
        else t.dispose();
      }
    }
  }

  /** Retires everything, e.g. on a scene transition. */
  clear(): void {
    for (const t of this.live) t.retire(0.01);
  }

  dispose(): void {
    for (const t of this.live) {
      this.scene.remove(t.mesh);
      t.dispose();
    }
    this.live.length = 0;
    for (const bucket of this.free.values()) for (const t of bucket) t.dispose();
    this.free.clear();
  }
}
