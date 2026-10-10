/**
 * SLAY — outdoor ground.
 *
 * An outdoor area is not rooms cut out of rock. It is one continuous ground: a
 * heightfield that stays flat where you walk and rises into the biome's own
 * edge where you cannot (a tree line, reed beds, dunes, cliffs, slag). The
 * ground blends up to four photo layers per vertex (`aSplat`): a base cover, a
 * trodden layer down the middle of the open ground, rock on the steep parts,
 * and a special layer at water banks, ice and lava.
 *
 * Two outdoor zones in one area share one ground: their layers go in the same
 * material and the weights cross-fade over a few tiles at the seam, so there
 * is no line where one biome stops.
 *
 * Walkable tiles keep exactly their floor height (props and entities ground on
 * `DungeonMesh.floorHeight`), with only millimetres of relief on top.
 */

import * as THREE from 'three';
import type { BiomeId, DungeonLevel, Rng } from '../types';
import { Noise, clamp } from '../art/Noise';
import { worldMaterial, addWorldCutaway, WORLD_ENV_ATTRIBUTE, WORLD_SPLAT_ATTRIBUTE, type WorldLayer } from '../art/WorldMaterial';
import { surfaceVariant } from '../art/Materials';
import { STEP_HEIGHT, TILE_SIZE } from './DungeonGen';
import {
  T_VOID,
  T_WATER,
  T_LAVA,
  T_CHASM,
  T_RUIN,
  T_DEEP_WATER,
  T_ICE,
  T_BRIDGE,
  isWalkableValue,
} from './Layouts';
import { isOutdoorBiome } from './Biomes';

// ---------------------------------------------------------------------------
// Looks
// ---------------------------------------------------------------------------

/** What a blocked tile turns into outdoors. */
export type EdgeKind = 'trees' | 'deadTrees' | 'dunes' | 'cliff' | 'rock';

export interface TerrainLook {
  /** base cover, trodden ground, steep rock, special (banks, ice, lava rims). */
  base: WorldLayer;
  trodden: WorldLayer;
  rock: WorldLayer;
  special: WorldLayer;
  edge: EdgeKind;
  /** Grime colour and damp, as for indoor floors. */
  grime: number;
  wet: number;
}

const L = (key: string, tint?: number, extra: Partial<WorldLayer> = {}): WorldLayer => ({ key, tint, ...extra });

const LOOKS: Partial<Record<BiomeId, TerrainLook>> = {
  darkForest: {
    base: L('tex.leaves', 0x8a8478),
    trodden: L('tex.dirt', 0x9a9088),
    rock: L('tex.cave', 0x8a8a84),
    special: L('tex.roots', 0x8a8478),
    edge: 'trees',
    grime: 0x1a1a12,
    wet: 0.25,
  },
  swamp: {
    base: L('tex.mud', 0x8c9078),
    trodden: L('tex.tracks', 0x9a9480),
    rock: L('tex.roots', 0x7a7a68),
    special: L('tex.moss', 0x8a9070),
    edge: 'deadTrees',
    grime: 0x141a10,
    wet: 0.7,
  },
  desert: {
    base: L('tex.sand'),
    trodden: L('tex.cracked', 0xd8c8b0),
    rock: L('tex.sandstone', 0xc8b49a),
    special: L('tex.stony_dirt', 0xc8a888),
    edge: 'dunes',
    grime: 0x3a2a1a,
    wet: 0,
  },
  tundra: {
    base: L('tex.snow'),
    trodden: L('tex.path', 0x9aa0a8),
    rock: L('tex.cliff', 0x8a8a90),
    special: L('tex.ice', 0xc0d8e8, { rough: 0.4 }),
    edge: 'cliff',
    grime: 0x2a3038,
    wet: 0.1,
  },
  ashwaste: {
    base: L('tex.ash'),
    trodden: L('tex.cracked', 0x6a5a50),
    rock: L('tex.basalt'),
    special: L('tex.lava_crust', undefined, { emissive: 0xff5a1a, emissiveIntensity: 1.6 }),
    edge: 'rock',
    grime: 0x140e0a,
    wet: 0,
  },
  hell: {
    base: L('tex.ash', 0xa07060),
    trodden: L('tex.cracked', 0x7a3a2a),
    rock: L('tex.obsidian', 0xa08080),
    special: L('tex.lava_crust', undefined, { emissive: 0xff3a0a, emissiveIntensity: 2.0 }),
    edge: 'cliff',
    grime: 0x1a0606,
    wet: 0,
  },
};

/** The ground look of an outdoor biome (indoor ones borrow the closest). */
export function terrainLook(biome: BiomeId): TerrainLook {
  return LOOKS[biome] ?? LOOKS.darkForest!;
}

/** True when the level is open sky: every zone (or its biome) is outdoor. */
export function isOutdoorLevel(level: DungeonLevel): boolean {
  if (level.zones && level.zones.length > 0) return level.zones.every((z) => z.outdoor);
  return isOutdoorBiome(level.biome);
}

// ---------------------------------------------------------------------------
// The field
// ---------------------------------------------------------------------------

/** Tiles of margin drawn past the level edge, so the ground never just stops. */
const MARGIN = 10;
/** Vertices per tile along each axis. */
const SUB = 2;
/** Terrain chunk size in tiles. */
const CHUNK = 24;

type Role = 'base' | 'trodden' | 'rock' | 'special';

interface Slot {
  layer: WorldLayer;
}

export interface TerrainChunk {
  mesh: THREE.Mesh;
  center: THREE.Vector3;
  radius: number;
}

export interface TerrainBuild {
  chunks: TerrainChunk[];
  /** Edge dressing (trees, reeds, stones): a few instanced meshes. */
  dressing: THREE.Object3D[];
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  /** Ground height at a world point (for things standing on blocked ground). */
  heightAt(wx: number, wz: number): number;
}

/**
 * Builds the outdoor ground for a level. `heights` is the level's step field
 * (per tile, in steps).
 */
export function buildTerrain(level: DungeonLevel, heights: Int8Array, rng: Rng): TerrainBuild {
  const W = level.width;
  const H = level.height;
  const GW = W + MARGIN * 2;
  const GH = H + MARGIN * 2;
  const noise = new Noise((level.seed ^ 0x7e44a1) >>> 0);
  const halfW = W / 2;
  const halfH = H / 2;

  // Zones and their looks.
  const zoneBiome: BiomeId[] = level.zones && level.zones.length ? level.zones.map((z) => z.biome) : [level.biome];
  const looks = zoneBiome.map((b) => terrainLook(b));
  const zoneAtTile = (x: number, y: number): number => {
    if (!level.zoneOf || level.zones === undefined || level.zones.length < 2) return 0;
    const cx = clamp(x, 0, W - 1);
    const cy = clamp(y, 0, H - 1);
    return level.zoneOf[cy * W + cx] ?? 0;
  };

  // Material slots: both zones' base layers first, then rock, trodden, special.
  const slots: Slot[] = [];
  const slotOf: Array<Record<Role, number>> = [];
  const take = (layer: WorldLayer): number => {
    const k = `${layer.key}|${layer.tint ?? ''}`;
    const i = slots.findIndex((s) => `${s.layer.key}|${s.layer.tint ?? ''}` === k);
    if (i >= 0) return i;
    if (slots.length >= 4) return -1;
    slots.push({ layer });
    return slots.length - 1;
  };
  for (let z = 0; z < looks.length; z++) slotOf.push({ base: take(looks[z]!.base), trodden: -1, rock: -1, special: -1 });
  for (const role of ['rock', 'trodden', 'special'] as const) {
    for (let z = 0; z < looks.length; z++) slotOf[z]![role] = take(looks[z]![role]);
  }
  for (const so of slotOf) {
    for (const role of ['rock', 'trodden', 'special'] as const) if (so[role] < 0) so[role] = so.base;
  }

  // --- tiles on the padded grid -------------------------------------------
  const raw = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= W || y >= H) return T_VOID;
    return level.tiles[y * W + x]!;
  };
  const isOpen = (v: number): boolean => isWalkableValue(v) || v === T_LAVA || v === T_DEEP_WATER || v === T_CHASM || v === T_RUIN;
  const baseHeight = (x: number, y: number, v: number): number => {
    const h = x >= 0 && y >= 0 && x < W && y < H ? heights[y * W + x]! * STEP_HEIGHT : 0;
    if (v === T_WATER) return h - 0.45;
    if (v === T_DEEP_WATER) return h - 1.25;
    if (v === T_LAVA) return h - 0.4;
    if (v === T_CHASM) return h - 3;
    // A bridge's deck is built at walking height; the ground under it is a riverbed.
    if (v === T_BRIDGE) return h - 1.1;
    return h;
  };

  // Distance (in tiles) from every blocked tile to the nearest open one, and
  // the floor height of that open tile, by a two-pass chamfer sweep.
  const N = GW * GH;
  const dist = new Float32Array(N).fill(1e6);
  const near = new Float32Array(N);
  const openDist = new Float32Array(N).fill(1e6);
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      const v = raw(gx - MARGIN, gy - MARGIN);
      const i = gy * GW + gx;
      if (isOpen(v)) {
        dist[i] = 0;
        near[i] = baseHeight(gx - MARGIN, gy - MARGIN, v);
      } else openDist[i] = 0;
    }
  }
  const chamfer = (d: Float32Array, carry: Float32Array | null): void => {
    const D1 = 1;
    const D2 = Math.SQRT2;
    const relax = (i: number, j: number, c: number): void => {
      const nd = d[j]! + c;
      if (nd < d[i]!) {
        d[i] = nd;
        if (carry) carry[i] = carry[j]!;
      }
    };
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        const i = y * GW + x;
        if (x > 0) relax(i, i - 1, D1);
        if (y > 0) {
          relax(i, i - GW, D1);
          if (x > 0) relax(i, i - GW - 1, D2);
          if (x < GW - 1) relax(i, i - GW + 1, D2);
        }
      }
    }
    for (let y = GH - 1; y >= 0; y--) {
      for (let x = GW - 1; x >= 0; x--) {
        const i = y * GW + x;
        if (x < GW - 1) relax(i, i + 1, D1);
        if (y < GH - 1) {
          relax(i, i + GW, D1);
          if (x < GW - 1) relax(i, i + GW + 1, D2);
          if (x > 0) relax(i, i + GW - 1, D2);
        }
      }
    }
  };
  chamfer(dist, near);
  chamfer(openDist, null);

  // Seam weight: share of zone 1 in a 7x7 tile window, smoothed.
  const zoneW = new Float32Array(N);
  if (looks.length > 1) {
    const ind = new Float32Array(N);
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) ind[gy * GW + gx] = zoneAtTile(gx - MARGIN, gy - MARGIN) === 1 ? 1 : 0;
    const tmp = new Float32Array(N);
    const R = 3;
    for (let gy = 0; gy < GH; gy++) {
      for (let gx = 0; gx < GW; gx++) {
        let s = 0;
        let n = 0;
        for (let k = -R; k <= R; k++) {
          const xx = gx + k;
          if (xx < 0 || xx >= GW) continue;
          s += ind[gy * GW + xx]!;
          n++;
        }
        tmp[gy * GW + gx] = s / n;
      }
    }
    for (let gy = 0; gy < GH; gy++) {
      for (let gx = 0; gx < GW; gx++) {
        let s = 0;
        let n = 0;
        for (let k = -R; k <= R; k++) {
          const yy = gy + k;
          if (yy < 0 || yy >= GH) continue;
          s += tmp[yy * GW + gx]!;
          n++;
        }
        const t = s / n;
        zoneW[gy * GW + gx] = t * t * (3 - 2 * t);
      }
    }
  }

  // --- vertex heights ------------------------------------------------------
  const VW = GW * SUB + 1;
  const VH = GH * SUB + 1;
  const vh = new Float32Array(VW * VH);
  const vdist = new Float32Array(VW * VH);
  const vopen = new Float32Array(VW * VH);
  const vzone = new Float32Array(VW * VH);
  const vspecial = new Float32Array(VW * VH);

  const tileAt = (gx: number, gy: number): number => raw(gx - MARGIN, gy - MARGIN);
  const g = (gx: number, gy: number): number => clamp(gy, 0, GH - 1) * GW + clamp(gx, 0, GW - 1);

  for (let j = 0; j < VH; j++) {
    for (let i = 0; i < VW; i++) {
      // Tiles this vertex touches: one at a tile centre, two on an edge, four at a corner.
      const ux = i / SUB;
      const uy = j / SUB;
      const xs = Number.isInteger(ux) ? [ux - 1, ux] : [Math.floor(ux)];
      const ys = Number.isInteger(uy) ? [uy - 1, uy] : [Math.floor(uy)];
      let openSum = 0;
      let openN = 0;
      let dmin = 1e6;
      let nearH = 0;
      let od = 0;
      let zw = 0;
      let zn = 0;
      let special = 0;
      for (const ty of ys) {
        for (const tx of xs) {
          const gi = g(tx, ty);
          const v = tileAt(tx, ty);
          zw += zoneW[gi]!;
          zn++;
          od += openDist[gi]!;
          if (isOpen(v)) {
            openSum += baseHeight(tx - MARGIN, ty - MARGIN, v);
            openN++;
          } else if (dist[gi]! < dmin) {
            dmin = dist[gi]!;
            nearH = near[gi]!;
          }
          if (v === T_ICE || v === T_LAVA || v === T_WATER || v === T_DEEP_WATER) special = 1;
        }
      }
      const vi = j * VW + i;
      const wx = (ux - MARGIN - halfW) * TILE_SIZE;
      const wz = (uy - MARGIN - halfH) * TILE_SIZE;
      vzone[vi] = zw / zn;
      vopen[vi] = od / zn;
      vspecial[vi] = special;
      if (openN > 0) {
        vh[vi] = openSum / openN + noise.simplex2(wx * 0.7, wz * 0.7) * 0.025;
        vdist[vi] = 0;
      } else {
        const d = Math.max(0.5, dmin - 0.5);
        vdist[vi] = d;
        const z = vzone[vi]! > 0.5 ? 1 : 0;
        vh[vi] = nearH + rise(looks[z]!.edge, d, wx, wz, noise);
      }
    }
  }

  const heightAt = (wx: number, wz: number): number => {
    const fi = (wx / TILE_SIZE + halfW + MARGIN) * SUB;
    const fj = (wz / TILE_SIZE + halfH + MARGIN) * SUB;
    const i0 = clamp(Math.floor(fi), 0, VW - 2);
    const j0 = clamp(Math.floor(fj), 0, VH - 2);
    const tx = clamp(fi - i0, 0, 1);
    const ty = clamp(fj - j0, 0, 1);
    const a = vh[j0 * VW + i0]!;
    const b = vh[j0 * VW + i0 + 1]!;
    const c = vh[(j0 + 1) * VW + i0]!;
    const d = vh[(j0 + 1) * VW + i0 + 1]!;
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };

  // --- material -----------------------------------------------------------
  const look0 = looks[0]!;
  const mat = worldMaterial({
    kind: 'terrain',
    layers: slots.map((s) => s.layer),
    grime: look0.grime,
    grimeAmount: 0.5,
    wet: look0.wet,
    variation: 0.9,
    contact: 0.75,
  });
  const materials: THREE.Material[] = [mat];
  const geometries: THREE.BufferGeometry[] = [];

  // --- chunks -------------------------------------------------------------
  const chunks: TerrainChunk[] = [];
  const step = TILE_SIZE / SUB;
  for (let cy = 0; cy < GH; cy += CHUNK) {
    for (let cx = 0; cx < GW; cx += CHUNK) {
      const i0 = cx * SUB;
      const j0 = cy * SUB;
      const i1 = Math.min(GW, cx + CHUNK) * SUB;
      const j1 = Math.min(GH, cy + CHUNK) * SUB;
      const cols = i1 - i0 + 1;
      const rows = j1 - j0 + 1;
      const pos = new Float32Array(cols * rows * 3);
      const nor = new Float32Array(cols * rows * 3);
      const env = new Float32Array(cols * rows);
      const splat = new Float32Array(cols * rows * 3);
      let k = 0;
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const vi = j * VW + i;
          const wx = (i / SUB - MARGIN - halfW) * TILE_SIZE;
          const wz = (j / SUB - MARGIN - halfH) * TILE_SIZE;
          const y = vh[vi]!;
          pos[k * 3] = wx;
          pos[k * 3 + 1] = y;
          pos[k * 3 + 2] = wz;
          // Central differences over the whole field, so chunk edges match.
          const hl = vh[j * VW + Math.max(0, i - 1)]!;
          const hr = vh[j * VW + Math.min(VW - 1, i + 1)]!;
          const hd = vh[Math.max(0, j - 1) * VW + i]!;
          const hu = vh[Math.min(VH - 1, j + 1) * VW + i]!;
          const nx = (hl - hr) / (2 * step);
          const nz = (hd - hu) / (2 * step);
          const inv = 1 / Math.hypot(nx, 1, nz);
          nor[k * 3] = nx * inv;
          nor[k * 3 + 1] = inv;
          nor[k * 3 + 2] = nz * inv;

          // Layer weights.
          const slope = 1 - inv;
          const d = vdist[vi]!;
          const zw = vzone[vi]!;
          const wsum = [0, 0, 0, 0];
          for (let z = 0; z < looks.length; z++) {
            const zf = looks.length > 1 ? (z === 1 ? zw : 1 - zw) : 1;
            if (zf <= 0.001) continue;
            const so = slotOf[z]!;
            const lk = looks[z]!;
            const rock = smooth(0.28, 0.55, slope) * (lk.edge === 'trees' || lk.edge === 'deadTrees' ? 0.6 : 1);
            const pn = noise.fbm(wx * 0.045 + 3.1, wz * 0.045, 3) * 0.5 + 0.5;
            // Trodden down the middle of open ground, broken by noise.
            const trod = d > 0 ? 0 : smooth(1.2, 2.6, vopen[vi]! + (pn - 0.5) * 2.2) * 0.9;
            const spec = vspecial[vi]! * 0.9 + (lk.edge === 'rock' || lk.edge === 'cliff' ? smooth(0.62, 0.8, pn) * 0.35 : 0);
            const rest = Math.max(0, 1 - rock);
            wsum[so.rock] += rock * zf;
            wsum[so.special] += rest * spec * zf;
            wsum[so.trodden] += rest * (1 - spec) * trod * zf;
            wsum[so.base] += rest * (1 - spec) * (1 - trod) * zf;
          }
          const tot = wsum[0]! + wsum[1]! + wsum[2]! + wsum[3]! || 1;
          splat[k * 3] = wsum[1]! / tot;
          splat[k * 3 + 1] = wsum[2]! / tot;
          splat[k * 3 + 2] = wsum[3]! / tot;
          // Shade gathers under the edge: the first metres of a tree line or
          // the foot of a cliff are darker than open ground.
          env[k] = d > 0 ? clamp(0.35 + d * 0.25, 0, 1) : clamp(1.2 - vopen[vi]! * 0.6, 0, 0.6);
          k++;
        }
      }
      const idx: number[] = [];
      for (let j = 0; j < rows - 1; j++) {
        for (let i = 0; i < cols - 1; i++) {
          const a = j * cols + i;
          const b = a + 1;
          const c = a + cols;
          const d = c + 1;
          // Split each quad along the flatter diagonal so ridges stay ridges.
          const ha = pos[a * 3 + 1]!;
          const hb = pos[b * 3 + 1]!;
          const hc = pos[c * 3 + 1]!;
          const hd = pos[d * 3 + 1]!;
          if (Math.abs(ha - hd) < Math.abs(hb - hc)) idx.push(a, c, d, a, d, b);
          else idx.push(a, c, b, b, c, d);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute(WORLD_ENV_ATTRIBUTE, new THREE.BufferAttribute(env, 1));
      geo.setAttribute(WORLD_SPLAT_ATTRIBUTE, new THREE.BufferAttribute(splat, 3));
      geo.setIndex(cols * rows > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      geometries.push(geo);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'terrain';
      mesh.receiveShadow = true;
      mesh.castShadow = looks.some((l) => l.edge === 'cliff' || l.edge === 'rock' || l.edge === 'dunes');
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      const bb = geo.boundingBox!;
      const center = bb.getCenter(new THREE.Vector3());
      chunks.push({ mesh, center, radius: bb.getSize(new THREE.Vector3()).length() * 0.5 });
    }
  }

  // --- edge dressing --------------------------------------------------------
  const dressing: THREE.Object3D[] = [];
  const treeSites: Array<{ x: number; y: number; z: number; s: number; r: number; zone: number }> = [];
  const drng = rng.fork('terrain:dressing');
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      const gi = gy * GW + gx;
      const d = dist[gi]!;
      if (d < 1 || d > 7) continue;
      const z = zoneW[gi]! > 0.5 ? 1 : 0;
      const edge = looks[z]!.edge;
      if (edge !== 'trees' && edge !== 'deadTrees') continue;
      // Dense at the front of the tree line, thinning behind it.
      const p = edge === 'trees' ? (d < 2.5 ? 0.85 : 0.45) : d < 2.5 ? 0.45 : 0.18;
      if (!drng.chance(p)) continue;
      const tx = gx - MARGIN + drng.range(0.15, 0.85);
      const ty = gy - MARGIN + drng.range(0.15, 0.85);
      const wx = (tx - halfW) * TILE_SIZE;
      const wz = (ty - halfH) * TILE_SIZE;
      treeSites.push({ x: wx, y: heightAt(wx, wz) - 0.1, z: wz, s: drng.range(0.8, 1.25) * (d < 2 ? 0.9 : 1.1), r: drng.range(0, Math.PI * 2), zone: z });
    }
  }
  if (treeSites.length) {
    const forest = treeSites.filter((t) => looks[t.zone]!.edge === 'trees');
    const dead = treeSites.filter((t) => looks[t.zone]!.edge === 'deadTrees');
    if (forest.length) dressing.push(...instancedTrees(forest, 'trees', drng, geometries, materials));
    if (dead.length) dressing.push(...instancedTrees(dead, 'deadTrees', drng, geometries, materials));
  }

  return { chunks, dressing, geometries, materials, heightAt };
}

// ---------------------------------------------------------------------------
// Edge profiles
// ---------------------------------------------------------------------------

function smooth(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Height of blocked ground `d` tiles in from the open edge. */
function rise(edge: EdgeKind, d: number, wx: number, wz: number, noise: Noise): number {
  const n = noise.fbm(wx * 0.06, wz * 0.06, 3);
  const crag = noise.ridged(wx * 0.21 + 5, wz * 0.21, 3);
  switch (edge) {
    case 'trees':
      // A low bank the trunks stand on; the trees do the walling.
      return Math.min(d, 3) * 0.32 + (n * 0.5 + 0.5) * 0.4 * smooth(0.5, 2, d);
    case 'deadTrees':
      return Math.min(d, 3) * 0.18 + (n * 0.5 + 0.5) * 0.25 * smooth(0.5, 2, d);
    case 'dunes':
      // Long soft ridges that keep rising further out.
      return smooth(0, 4.5, d) * 3.2 + Math.max(0, n) * 2.4 * smooth(1, 4, d) + Math.min(d, 12) * 0.12;
    case 'cliff':
      // Near vertical for the first metres, then broken shelves.
      return Math.min(d * 3.1, 7.5) + crag * 1.6 * smooth(0.4, 1.4, d) + Math.max(0, d - 3) * 0.6 + n * 0.8;
    case 'rock':
    default:
      return Math.min(d * 1.9, 5.5) + crag * 1.2 * smooth(0.4, 1.4, d) + n * 0.6;
  }
}

// ---------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------

/**
 * The tree line: a few tree shapes, each one instanced mesh per material.
 * Trunk, root flare and a canopy of lumpy clumps for living trees; bare
 * forked trunks for dead ones. Private material copies carry the wall
 * cutaway, so a tree between camera and hero opens like a wall does.
 */
function instancedTrees(
  sites: Array<{ x: number; y: number; z: number; s: number; r: number }>,
  kind: 'trees' | 'deadTrees',
  rng: Rng,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
): THREE.Object3D[] {
  const VARIANTS = 3;
  const bark = addWorldCutaway(surfaceVariant('wood.bark', { repeat: 2, tint: kind === 'deadTrees' ? 0x8a8478 : 0x9a9088 }));
  const leaf = kind === 'trees' ? addWorldCutaway(surfaceVariant('foliage.pine', { repeat: 2.5, tint: 0x6a7a5a, side: THREE.DoubleSide })) : null;
  materials.push(bark);
  if (leaf) materials.push(leaf);
  const out: THREE.Object3D[] = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (let v = 0; v < VARIANTS; v++) {
    const mine = sites.filter((_, i) => i % VARIANTS === v);
    if (!mine.length) continue;
    const vr = rng.fork(`tree${v}`);
    const trunkGeo = trunk(vr, kind);
    geometries.push(trunkGeo);
    const tm = new THREE.InstancedMesh(trunkGeo, bark, mine.length);
    tm.castShadow = true;
    tm.receiveShadow = true;
    tm.name = `${kind}:trunk`;
    let cm: THREE.InstancedMesh | null = null;
    if (leaf) {
      const cg = canopy(vr);
      geometries.push(cg);
      cm = new THREE.InstancedMesh(cg, leaf, mine.length);
      cm.castShadow = true;
      cm.receiveShadow = true;
      cm.name = `${kind}:canopy`;
    }
    mine.forEach((t, i) => {
      q.setFromAxisAngle(up, t.r);
      m4.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s, t.s * (0.9 + (i % 3) * 0.08), t.s));
      tm.setMatrixAt(i, m4);
      cm?.setMatrixAt(i, m4);
    });
    tm.instanceMatrix.needsUpdate = true;
    tm.computeBoundingSphere();
    out.push(tm);
    if (cm) {
      cm.instanceMatrix.needsUpdate = true;
      cm.computeBoundingSphere();
      out.push(cm);
    }
  }
  return out;
}

function lump(geo: THREE.BufferGeometry, rng: Rng, amount: number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const n = new Noise(rng.int(1, 1 << 30));
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 1 + n.simplex3(v.x * 1.7, v.y * 1.7, v.z * 1.7) * amount;
    pos.setXYZ(i, v.x * k, v.y * (1 + (k - 1) * 0.6), v.z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

function trunk(rng: Rng, kind: 'trees' | 'deadTrees'): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const h = kind === 'trees' ? rng.range(6.5, 9) : rng.range(4, 6);
  const r = kind === 'trees' ? rng.range(0.26, 0.36) : rng.range(0.18, 0.26);
  const main = new THREE.CylinderGeometry(r * 0.45, r, h, 9, 6, true);
  main.translate(0, h / 2, 0);
  // A slight lean and wobble along the height.
  const pos = main.getAttribute('position') as THREE.BufferAttribute;
  const lean = rng.range(-0.25, 0.25);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = y / h;
    pos.setX(i, pos.getX(i) + lean * t * t * 2 + Math.sin(t * 7 + lean * 9) * 0.06);
  }
  parts.push(main);
  // Root flare.
  const flare = new THREE.CylinderGeometry(r * 1.05, r * 1.9, 0.6, 9, 1, true);
  flare.translate(0, 0.25, 0);
  parts.push(flare);
  // Branches: a few for living trees (under the canopy), crooked forks for dead ones.
  const nb = kind === 'trees' ? 3 : 5;
  for (let b = 0; b < nb; b++) {
    const bl = kind === 'trees' ? rng.range(1.2, 2.0) : rng.range(1.4, 2.6);
    const br = r * rng.range(0.25, 0.4);
    const g = new THREE.CylinderGeometry(br * 0.35, br, bl, 6, 1, true);
    g.translate(0, bl / 2, 0);
    g.rotateZ(rng.range(0.6, 1.1));
    g.rotateY(rng.range(0, Math.PI * 2));
    g.translate(0, h * rng.range(0.45, 0.85), 0);
    parts.push(g);
  }
  return mergeParts(parts);
}

function canopy(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = rng.int(4, 6);
  for (let i = 0; i < n; i++) {
    const s = rng.range(1.1, 1.8);
    const g = lump(new THREE.IcosahedronGeometry(s, 2), rng.fork(`c${i}`), 0.28);
    const a = rng.range(0, Math.PI * 2);
    const rr = i === 0 ? 0 : rng.range(0.6, 1.5);
    g.scale(1, 0.75, 1);
    g.translate(Math.cos(a) * rr, rng.range(5.2, 7.4), Math.sin(a) * rr);
    parts.push(g);
  }
  return mergeParts(parts);
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0;
  for (const p of parts) count += p.getAttribute('position').count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const idx: number[] = [];
  let off = 0;
  for (const p of parts) {
    const pa = p.getAttribute('position') as THREE.BufferAttribute;
    if (!p.getAttribute('normal')) p.computeVertexNormals();
    const na = p.getAttribute('normal') as THREE.BufferAttribute;
    const ua = p.getAttribute('uv') as THREE.BufferAttribute | undefined;
    for (let i = 0; i < pa.count; i++) {
      pos[(off + i) * 3] = pa.getX(i);
      pos[(off + i) * 3 + 1] = pa.getY(i);
      pos[(off + i) * 3 + 2] = pa.getZ(i);
      nor[(off + i) * 3] = na.getX(i);
      nor[(off + i) * 3 + 1] = na.getY(i);
      nor[(off + i) * 3 + 2] = na.getZ(i);
      uv[(off + i) * 2] = ua ? ua.getX(i) : 0;
      uv[(off + i) * 2 + 1] = ua ? ua.getY(i) : 0;
    }
    if (p.index) for (let i = 0; i < p.index.count; i++) idx.push(p.index.getX(i) + off);
    else for (let i = 0; i < pa.count; i++) idx.push(i + off);
    off += pa.count;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(count > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}
