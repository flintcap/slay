/**
 * SLAY vfx kit: solid things that fly. Arrows, ice shards, bone spears and
 * thrown rock are objects, not light, so they are real lit meshes: the room's
 * torches catch them and they cast the eye's attention like a prop would.
 *
 * One InstancedMesh per shape, each a single draw call, written from the CPU
 * every frame (there are only ever tens of them). A mesh with nothing live is
 * hidden and costs nothing.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const SOLID = { arrow: 0, shard: 1, spear: 2, rock: 3, spike: 4 } as const;
export type SolidShape = keyof typeof SOLID;

export interface SolidHandle {
  readonly shape: number;
  readonly slot: number;
  readonly gen: number;
}

/** All shapes point down +Z, one metre long, centred on the origin. */
function arrowGeo(): THREE.BufferGeometry {
  const shaft = new THREE.CylinderGeometry(0.018, 0.018, 0.86, 5, 1);
  shaft.rotateX(Math.PI / 2);
  shaft.translate(0, 0, -0.04);
  const head = new THREE.ConeGeometry(0.05, 0.16, 4);
  head.rotateX(Math.PI / 2);
  head.translate(0, 0, 0.44);
  const f1 = new THREE.BoxGeometry(0.004, 0.09, 0.16);
  f1.translate(0, 0.03, -0.38);
  const f2 = new THREE.BoxGeometry(0.004, 0.09, 0.16);
  f2.translate(0, 0.03, -0.38);
  f2.rotateZ((Math.PI * 2) / 3);
  const f3 = new THREE.BoxGeometry(0.004, 0.09, 0.16);
  f3.translate(0, 0.03, -0.38);
  f3.rotateZ((-Math.PI * 2) / 3);
  // Colour by part through vertex colours: steel head, wood shaft, pale fletching.
  const paint = (g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry => {
    const g2 = g.index ? g.toNonIndexed() : g;
    const c = new THREE.Color(hex);
    const n = g2.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g2.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g2.deleteAttribute('uv');
    return g2;
  };
  const parts = [paint(shaft, 0x6a4a2a), paint(head, 0xb8b8c0), paint(f1, 0xd8d0c0), paint(f2, 0xd8d0c0), paint(f3, 0x9a2a1a)];
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return g;
}

function shardGeo(): THREE.BufferGeometry {
  const g = new THREE.OctahedronGeometry(0.5, 0);
  g.scale(0.22, 0.22, 1);
  return g;
}

function spearGeo(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(0.09, 1, 6, 3);
  g.rotateX(Math.PI / 2);
  // Knuckled like a bone: bulge the rings a little.
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const k = 1 + 0.25 * Math.max(0, Math.cos(z * Math.PI * 6));
    p.setX(i, p.getX(i) * k);
    p.setY(i, p.getY(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

function rockGeo(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.5, 0);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const k = 0.8 + 0.4 * Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

function spikeGeo(): THREE.BufferGeometry {
  // Ground spike: base at the origin, point up +Y (rotated to +Z for the shared layout).
  const g = new THREE.ConeGeometry(0.22, 1, 5);
  g.translate(0, 0.5, 0);
  g.rotateX(Math.PI / 2);
  return g;
}

interface ShapeState {
  mesh: THREE.InstancedMesh;
  live: Uint8Array;
  gen: Int32Array;
  /** Per slot: x y z, qx qy qz qw, sx sy sz. */
  xf: Float32Array;
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _f = new THREE.Vector3(0, 0, 1);
const _d = new THREE.Vector3();
const _e = new THREE.Quaternion();

export class SolidPool {
  private shapes: ShapeState[] = [];
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene, capacity: number) {
    this.scene = scene;
    const mats: THREE.Material[] = [
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.2 }),
      new THREE.MeshStandardMaterial({ color: 0xcfeeff, emissive: 0x3a90e0, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88 }),
      new THREE.MeshStandardMaterial({ color: 0xe8dcc0, emissive: 0x6a7040, emissiveIntensity: 0.35, roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: 0x5e554c, roughness: 0.95 }),
      new THREE.MeshStandardMaterial({ color: 0xe0d4b8, roughness: 0.6, emissive: 0x302810, emissiveIntensity: 0.3 }),
    ];
    const geos = [arrowGeo(), shardGeo(), spearGeo(), rockGeo(), spikeGeo()];
    for (let k = 0; k < geos.length; k++) {
      const mesh = new THREE.InstancedMesh(geos[k]!, mats[k]!, capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.name = `fx:solid-${Object.keys(SOLID)[k]}`;
      scene.add(mesh);
      this.shapes.push({ mesh, live: new Uint8Array(capacity), gen: new Int32Array(capacity), xf: new Float32Array(capacity * 10) });
    }
  }

  /** Claims a slot of a shape, or null when full. */
  alloc(shape: SolidShape): SolidHandle | null {
    const k = SOLID[shape];
    const s = this.shapes[k]!;
    for (let i = 0; i < s.live.length; i++) {
      if (s.live[i]) continue;
      s.live[i] = 1;
      s.gen[i] = (s.gen[i]! + 1) | 0;
      const o = i * 10;
      s.xf.fill(0, o, o + 10);
      s.xf[o + 6] = 1;
      return { shape: k, slot: i, gen: s.gen[i]! };
    }
    return null;
  }

  ok(h: SolidHandle | null): h is SolidHandle {
    if (!h) return false;
    const s = this.shapes[h.shape]!;
    return s.live[h.slot] === 1 && s.gen[h.slot] === h.gen;
  }

  free(h: SolidHandle | null): void {
    if (this.ok(h)) this.shapes[h.shape]!.live[h.slot] = 0;
  }

  /**
   * Places a solid at (x, y, z) pointing along (dx, dy, dz), rolled by `roll`
   * radians about its length, `len` long and `girth` thick (multipliers).
   */
  place(h: SolidHandle | null, x: number, y: number, z: number, dx: number, dy: number, dz: number, roll: number, len: number, girth: number): void {
    if (!this.ok(h)) return;
    const s = this.shapes[h.shape]!;
    _d.set(dx, dy, dz);
    if (_d.lengthSq() < 1e-8) _d.set(0, 0, 1);
    _d.normalize();
    _q.setFromUnitVectors(_f, _d);
    if (roll !== 0) _q.multiply(_e.setFromAxisAngle(_f, roll));
    const o = h.slot * 10;
    const X = s.xf;
    X[o] = x; X[o + 1] = y; X[o + 2] = z;
    X[o + 3] = _q.x; X[o + 4] = _q.y; X[o + 5] = _q.z; X[o + 6] = _q.w;
    X[o + 7] = girth; X[o + 8] = girth; X[o + 9] = len;
  }

  get liveCount(): number {
    let n = 0;
    for (const s of this.shapes) for (let i = 0; i < s.live.length; i++) n += s.live[i]!;
    return n;
  }

  /** Uploads live instances, packed to the front. */
  flush(): void {
    for (const s of this.shapes) {
      let k = 0;
      const X = s.xf;
      for (let i = 0; i < s.live.length; i++) {
        if (!s.live[i]) continue;
        const o = i * 10;
        _p.set(X[o]!, X[o + 1]!, X[o + 2]!);
        _q.set(X[o + 3]!, X[o + 4]!, X[o + 5]!, X[o + 6]!);
        _s.set(X[o + 7]!, X[o + 8]!, X[o + 9]!);
        _m.compose(_p, _q, _s);
        s.mesh.setMatrixAt(k++, _m);
      }
      const was = s.mesh.count;
      s.mesh.count = k;
      s.mesh.visible = k > 0;
      if (k > 0 || was > 0) s.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  clear(): void {
    for (const s of this.shapes) {
      s.live.fill(0);
      s.mesh.count = 0;
      s.mesh.visible = false;
    }
  }

  dispose(): void {
    for (const s of this.shapes) {
      this.scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      (s.mesh.material as THREE.Material).dispose();
      s.mesh.dispose();
    }
    this.shapes.length = 0;
  }
}
