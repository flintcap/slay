/**
 * Entry point for `tools/check-townprops.mjs`.
 *
 * Builds the town exactly as TownScene does (same seed) and measures it with
 * no renderer:
 *
 *   - Draw cost: meshes in the colour pass, shadow casters (the moon is the
 *     one shadow pass), triangles, distinct materials.
 *   - Lights with intensity (the hemisphere excluded), against check-perf's
 *     budget of 24 less the hero's own light.
 *   - Ghost colliders: a footprint with nothing drawn at body height inside it
 *     (an invisible wall).
 *   - Walk-through solids: something tall drawn at body height with no
 *     footprint round it (a wall the hero walks into and through).
 *
 * Body height is sampled from every triangle of every opaque static mesh, so
 * merged geometry is judged by what it draws, not by its bounding box.
 */
import * as THREE from 'three';
import { Random } from '../src/core/RNG';
import { buildTown } from '../src/world/Town';

const problems: string[] = [];
const town = buildTown(new Random(0x70b6));
town.root.updateMatrixWorld(true);

let meshes = 0;
let casters = 0;
let tris = 0;
const mats = new Set<string>();
let lights = 0;
const CELL = 0.2;
const low = new Set<string>();
const what = new Map<string, string>();
const high = new Set<string>();
const any = new Set<string>();
const key = (x: number, z: number): string => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const p = new THREE.Vector3();

function visible(o: THREE.Object3D): boolean {
  for (let q: THREE.Object3D | null = o; q; q = q.parent) if (!q.visible) return false;
  return true;
}

town.root.traverse((o) => {
  const l = o as THREE.Light;
  if (l.isLight && !(l as THREE.HemisphereLight).isHemisphereLight && l.intensity > 0) lights++;
  const m = o as THREE.Mesh;
  if (!m.isMesh || !visible(m)) return;
  meshes++;
  if (m.castShadow) casters++;
  const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material;
  mats.add(mat.uuid);
  const geo = m.geometry;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  if (!pos) return;
  const idx = geo.getIndex();
  const n = idx ? idx.count : pos.count;
  tris += n / 3;
  // Light, glass and the living are not walls.
  if ((m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return;
  if (mat.transparent || (mat as THREE.MeshBasicMaterial).isMeshBasicMaterial && mat.blending !== THREE.NormalBlending) return;
  if ((mat as THREE.ShaderMaterial).isShaderMaterial) return;
  const mw = m.matrixWorld;
  for (let i = 0; i < n; i += 3) {
    const i0 = idx ? idx.getX(i) : i;
    const i1 = idx ? idx.getX(i + 1) : i + 1;
    const i2 = idx ? idx.getX(i + 2) : i + 2;
    a.fromBufferAttribute(pos, i0).applyMatrix4(mw);
    b.fromBufferAttribute(pos, i1).applyMatrix4(mw);
    c.fromBufferAttribute(pos, i2).applyMatrix4(mw);
    const minY = Math.min(a.y, b.y, c.y);
    const maxY = Math.max(a.y, b.y, c.y);
    if (maxY < 0.25 || minY > 1.6) continue;
    const edge = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
    const steps = Math.min(80, Math.max(1, Math.ceil(edge / 0.12)));
    for (let u = 0; u <= steps; u++) {
      for (let v = 0; v <= steps - u; v++) {
        const w = steps - u - v;
        p.set(0, 0, 0).addScaledVector(a, u / steps).addScaledVector(b, v / steps).addScaledVector(c, w / steps);
        if (p.y < 0.25 || p.y > 1.6) continue;
        const k = key(p.x, p.z);
        any.add(k);
        if (p.y < 0.6) low.add(k);
        if (!what.has(k)) what.set(k, mat.name || m.name || m.type);
        if (p.y > 1.0) high.add(k);
      }
    }
  }
});

// Residents carry their own 0.8 m footprints; they are judged elsewhere.
const cols = town.colliders.filter((q) => !(Math.abs(q.w - 0.8) < 1e-6 && Math.abs(q.d - 0.8) < 1e-6));
// A footprint is honest when what is drawn inside it at body height spans
// most of it both ways. Hollow things (a tower, a log) count by their walls.
const ghosts: string[] = [];
for (const q of cols) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  const i0 = Math.floor((q.x - q.w / 2) / CELL);
  const i1 = Math.floor((q.x + q.w / 2) / CELL);
  const j0 = Math.floor((q.z - q.d / 2) / CELL);
  const j1 = Math.floor((q.z + q.d / 2) / CELL);
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      if (!any.has(`${i},${j}`)) continue;
      x0 = Math.min(x0, i * CELL);
      x1 = Math.max(x1, (i + 1) * CELL);
      z0 = Math.min(z0, j * CELL);
      z1 = Math.max(z1, (j + 1) * CELL);
    }
  }
  const fx = x1 > x0 ? Math.min(x1, q.x + q.w / 2) - Math.max(x0, q.x - q.w / 2) : 0;
  const fz = z1 > z0 ? Math.min(z1, q.z + q.d / 2) - Math.max(z0, q.z - q.d / 2) : 0;
  const cover = Math.min(fx / q.w, fz / q.d);
  if (cover < 0.6) ghosts.push(`${q.x.toFixed(2)},${q.z.toFixed(2)} ${q.w.toFixed(2)}x${q.d.toFixed(2)} (drawn across ${Math.round(cover * 100)}%)`);
}

// Tall things inside the walkable ring with no footprint round them.
const walkable = (x: number, z: number): boolean => Math.hypot(x, z) < 21.4 || (z < -15 && z > -24 && Math.abs(x) < 5.5);
const loose: Array<[number, number, string]> = [];
for (const k of low) {
  if (!high.has(k)) continue;
  const [i, j] = k.split(',').map(Number) as [number, number];
  const x = (i + 0.5) * CELL;
  const z = (j + 0.5) * CELL;
  if (!walkable(x, z)) continue;
  const pad = 0.25;
  if (town.colliders.some((q) => Math.abs(q.x - x) < q.w / 2 + pad && Math.abs(q.z - z) < q.d / 2 + pad)) continue;
  loose.push([x, z, what.get(k) ?? '?']);
}
// Cluster the loose cells so one shed wall reads as one problem.
const clusters: Array<{ x: number; z: number; n: number; m: Set<string> }> = [];
for (const [x, z, mn] of loose) {
  const hit = clusters.find((q) => Math.hypot(q.x - x, q.z - z) < 1.2);
  if (hit) {
    hit.x = (hit.x * hit.n + x) / (hit.n + 1);
    hit.z = (hit.z * hit.n + z) / (hit.n + 1);
    hit.n++;
    hit.m.add(mn);
  } else clusters.push({ x, z, n: 1, m: new Set([mn]) });
}
const solidLoose = clusters.filter((q) => q.n >= 3);

const draws = meshes + casters;
if (lights > 23) problems.push(`${lights} lights in town; check-perf allows 24 with the hero's`);
if (draws > 600) problems.push(`about ${draws} draws (colour + moon shadow) before AO; the town's budget is 900 measured`);
for (const g of ghosts) problems.push(`ghost collider at ${g}`);
for (const q of solidLoose) problems.push(`walk-through solid near ${q.x.toFixed(1)},${q.z.toFixed(1)} (${q.n} cells: ${[...q.m].join(', ')})`);

console.log(JSON.stringify({
  report: {
    meshes,
    shadowCasters: casters,
    drawsEstimate: draws,
    triangles: Math.round(tris),
    materials: mats.size,
    lights,
    colliders: town.colliders.length,
    smoke: town.smokeSpots.length,
  },
  problems,
}));
town.dispose();
