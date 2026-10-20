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

export const SOLID = {
  arrow: 0, shard: 1, spear: 2, rock: 3, spike: 4,
  // Skill motif pieces (`fx/Motifs.ts`).
  blade: 5, thorn: 6, crystal: 7, cinder: 8, fang: 9, saw: 10, feather: 11,
  // Thrown weapons.
  buckler: 12,
  // The Rogue's thrown things: a venom needle, a glass vial.
  needle: 13, vial: 14,
} as const;
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

/** Vertex-colours a part, for shapes built from differently coloured pieces. */
function tint(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const g2 = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex);
  const n = g2.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g2.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g2.deleteAttribute('uv');
  return g2;
}

/** A thrown knife: a steel blade, a dark grip, a brass guard. */
function bladeGeo(): THREE.BufferGeometry {
  const edge = new THREE.BoxGeometry(0.07, 0.012, 0.52);
  edge.translate(0, 0, 0.12);
  const tip = new THREE.ConeGeometry(0.05, 0.16, 4);
  tip.rotateX(Math.PI / 2);
  tip.scale(1, 0.25, 1);
  tip.translate(0, 0, 0.46);
  const guard = new THREE.BoxGeometry(0.16, 0.03, 0.03);
  guard.translate(0, 0, -0.15);
  const grip = new THREE.CylinderGeometry(0.022, 0.026, 0.28, 6);
  grip.rotateX(Math.PI / 2);
  grip.translate(0, 0, -0.3);
  const parts = [tint(edge, 0xc8ccd4), tint(tip, 0xe0e4ea), tint(guard, 0x9a7a3a), tint(grip, 0x2a1c14)];
  const g = mergeGeometries(parts, false)!;
  for (const q of parts) q.dispose();
  return g;
}

/** Bends a +Z shape sideways along its length, like a thorn or a fang. */
function hook(g: THREE.BufferGeometry, amount: number): THREE.BufferGeometry {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i) + 0.5;
    p.setY(i, p.getY(i) + amount * z * z);
  }
  g.computeVertexNormals();
  return g;
}

function thornGeo(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(0.11, 1, 5, 4);
  g.rotateX(Math.PI / 2);
  return hook(g, 0.28);
}

function crystalGeo(): THREE.BufferGeometry {
  const mid = new THREE.CylinderGeometry(0.15, 0.15, 0.5, 6, 1, true);
  const top = new THREE.ConeGeometry(0.15, 0.25, 6);
  top.translate(0, 0.375, 0);
  const bot = new THREE.ConeGeometry(0.15, 0.25, 6);
  bot.rotateX(Math.PI);
  bot.translate(0, -0.375, 0);
  const parts = [mid.toNonIndexed(), top.toNonIndexed(), bot.toNonIndexed()];
  for (const q of parts) q.deleteAttribute('uv');
  const g = mergeGeometries(parts, false)!;
  for (const q of [mid, top, bot, ...parts]) q.dispose();
  g.rotateX(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

function fangGeo(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(0.13, 1, 7, 4);
  g.rotateX(Math.PI / 2);
  g.scale(1, 0.75, 1);
  return hook(g, -0.22);
}

/** A toothed wheel, its face to +Z: rolled about its length, it spins like a saw. */
function sawGeo(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 24, 1);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 0.4) continue;
    const a = Math.atan2(z, x);
    const tooth = Math.round((a / (Math.PI * 2)) * 24) % 2 === 0 ? 1 : 0.78;
    p.setX(i, x * tooth);
    p.setZ(i, z * tooth);
  }
  g.rotateX(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/** A thrown round shield, lying flat: a wooden face, an iron rim and boss. */
function bucklerGeo(): THREE.BufferGeometry {
  const face = new THREE.CylinderGeometry(0.46, 0.46, 0.05, 18, 1);
  const rim = new THREE.TorusGeometry(0.47, 0.035, 4, 18);
  rim.rotateX(Math.PI / 2);
  const boss = new THREE.SphereGeometry(0.11, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  boss.translate(0, 0.02, 0);
  const parts = [tint(face, 0x4a301a), tint(rim, 0x7a7c84), tint(boss, 0xa8a8b0)];
  const g = mergeGeometries(parts, false)!;
  for (const q of parts) q.dispose();
  return g;
}

/** A venom needle: a long steel spike, its tip dipped green, a dark wrapped end. */
function needleGeo(): THREE.BufferGeometry {
  const shaft = new THREE.CylinderGeometry(0.008, 0.016, 0.62, 5, 1);
  shaft.rotateX(Math.PI / 2);
  shaft.translate(0, 0, -0.02);
  const tip = new THREE.ConeGeometry(0.009, 0.24, 5);
  tip.rotateX(Math.PI / 2);
  tip.translate(0, 0, 0.4);
  const wrap = new THREE.CylinderGeometry(0.022, 0.022, 0.12, 6);
  wrap.rotateX(Math.PI / 2);
  wrap.translate(0, 0, -0.38);
  const parts = [tint(shaft, 0xc4c8d0), tint(tip, 0x7cff6a), tint(wrap, 0x1e2a18)];
  const g = mergeGeometries(parts, false)!;
  for (const q of parts) q.dispose();
  return g;
}

/** A glass vial of plague: a round belly, a neck and a cork, along +Z. */
function vialGeo(): THREE.BufferGeometry {
  const belly = new THREE.SphereGeometry(0.2, 10, 8);
  belly.scale(1, 1, 1.15);
  const neck = new THREE.CylinderGeometry(0.06, 0.08, 0.2, 8);
  neck.rotateX(Math.PI / 2);
  neck.translate(0, 0, 0.29);
  const cork = new THREE.CylinderGeometry(0.07, 0.065, 0.09, 8);
  cork.rotateX(Math.PI / 2);
  cork.translate(0, 0, 0.42);
  const parts = [belly.toNonIndexed(), neck.toNonIndexed(), cork.toNonIndexed()];
  for (const q of parts) q.deleteAttribute('uv');
  const g = mergeGeometries(parts, false)!;
  for (const q of [belly, neck, cork, ...parts]) q.dispose();
  g.computeVertexNormals();
  return g;
}

function featherGeo(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(0.12, 1, 4, 3);
  g.rotateX(-Math.PI / 2);
  g.scale(1, 0.12, 1);
  return hook(g, 0.08);
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
      // blade, thorn, crystal, cinder, fang, saw, feather
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.75 }),
      new THREE.MeshStandardMaterial({ color: 0x2e3c18, emissive: 0x58a020, emissiveIntensity: 0.55, roughness: 0.55 }),
      new THREE.MeshStandardMaterial({ color: 0xc8a8ff, emissive: 0x7038e0, emissiveIntensity: 1.1, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85 }),
      new THREE.MeshStandardMaterial({ color: 0x2a1a12, emissive: 0xff5a14, emissiveIntensity: 1.5, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0xdce6a8, emissive: 0x5ec41a, emissiveIntensity: 0.85, roughness: 0.45 }),
      new THREE.MeshStandardMaterial({ color: 0x8e9098, roughness: 0.35, metalness: 0.85 }),
      new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 0.8, side: THREE.DoubleSide }),
    ];
    // The buckler shares the arrow's material (vertex-coloured, same layout),
    // so it draws with a shader already built. The needle shares the knife's
    // (vertex-coloured steel); the vial the fang's pale venom glow.
    mats.push(mats[0]!, mats[5]!, mats[9]!);
    const geos = [arrowGeo(), shardGeo(), spearGeo(), rockGeo(), spikeGeo(), bladeGeo(), thornGeo(), crystalGeo(), rockGeo(), fangGeo(), sawGeo(), featherGeo(), bucklerGeo(), needleGeo(), vialGeo()];
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

  /**
   * One tiny instance of every shape, for the scene's warm-up, so no solid
   * builds its shader on the frame it is first thrown. Shares geometry and
   * material; only the stand-ins' own instance buffers are new.
   */
  standIns(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    const m = new THREE.Matrix4().makeScale(1e-3, 1e-3, 1e-3);
    for (const s of this.shapes) {
      const w = new THREE.InstancedMesh(s.mesh.geometry, s.mesh.material, 1);
      w.setMatrixAt(0, m);
      w.frustumCulled = false;
      w.castShadow = false;
      w.receiveShadow = false;
      w.name = `${s.mesh.name}:warm`;
      out.push(w);
    }
    return out;
  }

  clear(): void {
    for (const s of this.shapes) {
      s.live.fill(0);
      s.mesh.count = 0;
      s.mesh.visible = false;
    }
  }

  dispose(): void {
    const done = new Set<THREE.Material>();
    for (const s of this.shapes) {
      this.scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      const m = s.mesh.material as THREE.Material;
      if (!done.has(m)) m.dispose();
      done.add(m);
      s.mesh.dispose();
    }
    this.shapes.length = 0;
  }
}
