/**
 * SLAY vfx kit: a pool of instanced shapes driven from the CPU each frame.
 *
 * Projectile cores, beams, light columns and shells change every frame (they
 * fly, follow, grow), so their instance data is rewritten each frame. There
 * are few of them (tens), so that costs nothing; the win is that each family
 * is a single draw call, however many are alive, and nothing is allocated
 * after construction.
 *
 * Every family shares one per-instance layout of four vec4s:
 *   iA: x, y, z, size
 *   iB: family-specific (second point, height, squash)
 *   iC: core, body, tail (packed linear rgb), emission
 *   iD: style, fade (0..1), seed, param
 */

import * as THREE from 'three';
import { premultiplied } from './Particles';

export interface SlotHandle {
  readonly slot: number;
  readonly gen: number;
}

export class InstancedPool {
  readonly mesh: THREE.Mesh;
  readonly capacity: number;
  /** CPU state per slot: 16 floats (iA, iB, iC, iD). */
  readonly data: Float32Array;
  private live: Uint8Array;
  private gen: Int32Array;
  private geo: THREE.InstancedBufferGeometry;
  private attrs: THREE.InstancedBufferAttribute[];
  private arrays: Float32Array[];
  readonly material: THREE.ShaderMaterial;
  private drawn = 0;

  constructor(name: string, base: THREE.BufferGeometry, material: THREE.ShaderMaterial, capacity: number, renderOrder: number) {
    this.capacity = capacity;
    this.data = new Float32Array(capacity * 16);
    this.live = new Uint8Array(capacity);
    this.gen = new Int32Array(capacity);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    for (const [k, a] of Object.entries(base.attributes)) geo.setAttribute(k, a);
    this.arrays = [];
    this.attrs = [];
    for (const k of ['iA', 'iB', 'iC', 'iD']) {
      const arr = new Float32Array(capacity * 4);
      const a = new THREE.InstancedBufferAttribute(arr, 4);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(k, a);
      this.arrays.push(arr);
      this.attrs.push(a);
    }
    geo.instanceCount = 0;
    this.geo = geo;
    premultiplied(material);
    this.material = material;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.name = `fx:${name}`;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.visible = false;
  }

  /** Claims a slot, or null when full. */
  alloc(): SlotHandle | null {
    for (let i = 0; i < this.capacity; i++) {
      if (this.live[i]) continue;
      this.live[i] = 1;
      this.gen[i] = (this.gen[i]! + 1) | 0;
      this.data.fill(0, i * 16, i * 16 + 16);
      return { slot: i, gen: this.gen[i]! };
    }
    return null;
  }

  ok(h: SlotHandle | null): h is SlotHandle {
    return !!h && this.live[h.slot] === 1 && this.gen[h.slot] === h.gen;
  }

  free(h: SlotHandle | null): void {
    if (this.ok(h)) this.live[h.slot] = 0;
  }

  /** Writes one vec4 (0 = iA .. 3 = iD) of a slot. */
  set(h: SlotHandle | null, vec: number, x: number, y: number, z: number, w: number): void {
    if (!this.ok(h)) return;
    const o = h.slot * 16 + vec * 4;
    const d = this.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = w;
  }

  /** Writes one float of a slot (vec 0..3, comp 0..3). */
  put(h: SlotHandle | null, vec: number, comp: number, v: number): void {
    if (!this.ok(h)) return;
    this.data[h.slot * 16 + vec * 4 + comp] = v;
  }

  get(h: SlotHandle, vec: number, comp: number): number {
    return this.data[h.slot * 16 + vec * 4 + comp]!;
  }

  get liveCount(): number {
    let n = 0;
    for (let i = 0; i < this.capacity; i++) n += this.live[i]!;
    return n;
  }

  /** Packs live slots to the front of the instance buffers and uploads them. */
  flush(time: number): void {
    let k = 0;
    const d = this.data;
    const [A, B, C, D] = this.arrays as [Float32Array, Float32Array, Float32Array, Float32Array];
    for (let i = 0; i < this.capacity; i++) {
      if (!this.live[i]) continue;
      const s = i * 16;
      const o = k * 4;
      A[o] = d[s]!; A[o + 1] = d[s + 1]!; A[o + 2] = d[s + 2]!; A[o + 3] = d[s + 3]!;
      B[o] = d[s + 4]!; B[o + 1] = d[s + 5]!; B[o + 2] = d[s + 6]!; B[o + 3] = d[s + 7]!;
      C[o] = d[s + 8]!; C[o + 1] = d[s + 9]!; C[o + 2] = d[s + 10]!; C[o + 3] = d[s + 11]!;
      D[o] = d[s + 12]!; D[o + 1] = d[s + 13]!; D[o + 2] = d[s + 14]!; D[o + 3] = d[s + 15]!;
      k++;
    }
    this.geo.instanceCount = k;
    this.mesh.visible = k > 0;
    const u = this.material.uniforms.uTime;
    if (u) u.value = time;
    if (k > 0 || this.drawn > 0) {
      for (const a of this.attrs) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, Math.max(1, k) * 4);
        a.needsUpdate = true;
      }
    }
    this.drawn = k;
  }

  clear(): void {
    this.live.fill(0);
    this.geo.instanceCount = 0;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.geo.dispose();
    this.material.dispose();
  }
}
