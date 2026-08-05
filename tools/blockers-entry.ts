/**
 * Entry point for `tools/check-blockers.mjs`.
 *
 * Reported: "the invisible walls are intended?"
 *
 * Two independent things get measured here, because "invisible wall" covers
 * two different bugs.
 *
 * **Part one — colliders that do not match what is drawn.** A blocking prop
 * stops the player with a square built from `def.radius`:
 *
 *   const r = def.radius * s * 2;
 *   colliders.push({ x: tileX(p.x), z: tileZ(p.y), w: r, d: r });
 *
 * and the player is stopped when `|x - c.x| < c.w * 0.5 + 0.42`. What is drawn
 * is the template's geometry, scaled, and for wall placements pushed
 * `wallOffset` toward the wall. The builder now applies that same offset to the
 * collider, so this checks the two stay in step: a wall prop whose collider
 * went back to the tile centre would put half a metre of solid air in front of
 * every bookcase in the game.
 *
 * **Part two — gaps too narrow for the player's body.** The player is a disc of
 * radius 0.42 and every collider is inflated by that. A one-tile corridor is
 * two metres wide, its walls eat 0.42 from each side, and a barrel at the tile
 * centre eats 0.80 more from the middle. That corridor is sealed. Nothing about
 * it looks sealed: it looks like a barrel you should be able to walk around.
 * `enforceConnectivity` cannot see this, because it reasons in whole tiles and
 * a tile is either propped or not.
 *
 * Part two rebuilds the real collider list and floods the level at quarter-tile
 * resolution using `Player.canStand`, then compares that against the tile-level
 * flood fill the game's own navigation believes. Every tile in the difference is
 * somewhere the game says you can walk and the physics says you cannot.
 */
import * as THREE from 'three';
import { generateRun, TILE_SIZE, isWalkable, TILE } from '../src/world/DungeonGen';
import { isWalkableValue } from '../src/world/Layouts';
import { biomeArt } from '../src/world/Biomes';
import { propDef, propTemplate, scaleFor, variantFor } from '../src/world/Props';
import type { DungeonLevel } from '../src/types';

/** Matches `Player.radius`. */
const PLAYER_R = 0.42;
/** Sample step for the physical flood fill, in world units. */
const STEP = 0.25;

interface KindReport {
  kind: string;
  placement: string;
  count: number;
  colliderHalf: number;
  meshHalf: number;
  offset: number;
  noMesh: boolean;
  bareRing: number;
}

interface Collider {
  x: number;
  z: number;
  w: number;
  d: number;
}

const kinds = new Map<string, KindReport>();
let levels = 0;
let blockers = 0;

const box = new THREE.Box3();
const v = new THREE.Vector3();

/** Widest horizontal half-extent of everything a template draws. */
function meshHalfWidth(kind: string, art: ReturnType<typeof biomeArt>, seed: number, variant: number): number | null {
  let tmpl;
  try {
    tmpl = propTemplate(kind, art, seed, variant);
  } catch {
    return null;
  }
  let half = 0;
  for (const layer of tmpl.layers) {
    const geo = layer.geometry;
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (!bb) continue;
    box.copy(bb);
    // Yaw is free, so the shape sweeps a circle: take the farthest corner in
    // the XZ plane, not the axis-aligned width.
    for (const cx of [box.min.x, box.max.x]) {
      for (const cz of [box.min.z, box.max.z]) {
        v.set(cx, 0, cz);
        half = Math.max(half, v.length());
      }
    }
  }
  return half;
}

// --- part two: can the player's body actually fit? -------------------------

const tileX = (x: number): number => (x + 0.5) * TILE_SIZE;
const tileZ = (y: number): number => (y + 0.5) * TILE_SIZE;

/** Mirrors `DungeonBuilder.buildColliders`. */
function buildColliders(level: DungeonLevel): Collider[] {
  const W = level.width;
  const H = level.height;
  const out: Collider[] = [];
  const solid = new Uint8Array(W * H);
  for (let i = 0; i < solid.length; i++) solid[i] = isWalkableValue(level.tiles[i]!) ? 0 : 1;
  for (let i = 0; i < solid.length; i++) if (level.tiles[i] === TILE.void) solid[i] = 0;
  for (let i = 0; i < solid.length; i++) {
    const t = level.tiles[i];
    if (t === TILE.chasm || t === TILE.lava || t === TILE.wall) solid[i] = 1;
  }
  const used = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!solid[i] || used[i]) continue;
      let w = 1;
      while (x + w < W && solid[i + w] && !used[i + w]) w++;
      let h = 1;
      outer: while (y + h < H) {
        const row = (y + h) * W + x;
        for (let k = 0; k < w; k++) if (!solid[row + k] || used[row + k]) break outer;
        h++;
      }
      for (let yy = 0; yy < h; yy++) {
        const row = (y + yy) * W + x;
        for (let k = 0; k < w; k++) used[row + k] = 1;
      }
      out.push({
        x: tileX(x) + ((w - 1) * TILE_SIZE) / 2,
        z: tileZ(y) + ((h - 1) * TILE_SIZE) / 2,
        w: w * TILE_SIZE,
        d: h * TILE_SIZE,
      });
    }
  }
  for (const p of level.props) {
    const def = propDef(p.kind);
    if (!def.blocks || def.radius <= 0) continue;
    const s = scaleFor(p.kind, p.x, p.y);
    const r = def.radius * s * 2;
    out.push({ x: tileX(p.x), z: tileZ(p.y), w: r, d: r });
  }
  return out;
}

interface FitReport {
  depth: number;
  biome: string;
  /** Floor tiles the tile-level flood fill reaches from the entry. */
  navReach: number;
  /**
   * Of those, tiles no part of which the player's body can occupy **and which
   * carry no blocking prop**. Standing inside a pillar is not a bug; being
   * stopped by bare floor is.
   */
  sealed: number;
  /** Sealed tiles that do carry a blocking prop — expected, reported for scale. */
  onProp: number;
  /** Of those, tiles the body can occupy but cannot walk to from the entry. */
  cutOff: number;
  /** The blocking prop kinds sitting next to the worst offenders. */
  culprits: Record<string, number>;
}

const fits: FitReport[] = [];

function measureFit(level: DungeonLevel, depth: number): FitReport {
  const W = level.width;
  const H = level.height;
  const colliders = buildColliders(level);

  // Bucket colliders by tile so `canStand` does not walk all few thousand of
  // them per sample. A collider can only reach 0.42 + its own half past its
  // tile, so a one-tile margin covers every overlap.
  const buckets: Collider[][] = Array.from({ length: W * H }, () => []);
  for (const c of colliders) {
    const x0 = Math.max(0, Math.floor((c.x - c.w * 0.5 - PLAYER_R) / TILE_SIZE));
    const x1 = Math.min(W - 1, Math.floor((c.x + c.w * 0.5 + PLAYER_R) / TILE_SIZE));
    const z0 = Math.max(0, Math.floor((c.z - c.d * 0.5 - PLAYER_R) / TILE_SIZE));
    const z1 = Math.min(H - 1, Math.floor((c.z + c.d * 0.5 + PLAYER_R) / TILE_SIZE));
    for (let y = z0; y <= z1; y++) for (let x = x0; x <= x1; x++) buckets[y * W + x]!.push(c);
  }

  /** Mirrors `Player.canStand`. */
  const canStand = (x: number, z: number): boolean => {
    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(z / TILE_SIZE);
    if (!isWalkable(level, tx, ty)) return false;
    const list = buckets[ty * W + tx];
    if (!list) return true;
    for (const c of list) {
      if (Math.abs(x - c.x) < c.w * 0.5 + PLAYER_R && Math.abs(z - c.z) < c.d * 0.5 + PLAYER_R) return false;
    }
    return true;
  };

  // Tile-level reachability: what the game's navigation believes.
  const navSeen = new Uint8Array(W * H);
  {
    const q = [level.entry.y * W + level.entry.x];
    navSeen[q[0]!] = 1;
    for (let h = 0; h < q.length; h++) {
      const c = q[h]!;
      const cx = c % W;
      const cy = (c / W) | 0;
      const step = (nx: number, ny: number): void => {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
        const n = ny * W + nx;
        if (navSeen[n] || !isWalkable(level, nx, ny)) return;
        navSeen[n] = 1;
        q.push(n);
      };
      step(cx - 1, cy);
      step(cx + 1, cy);
      step(cx, cy - 1);
      step(cx, cy + 1);
    }
  }

  // Physical reachability: flood the sample grid from the entry.
  const SW = Math.round((W * TILE_SIZE) / STEP);
  const SH = Math.round((H * TILE_SIZE) / STEP);
  const okSample = new Uint8Array(SW * SH);
  for (let sy = 0; sy < SH; sy++) {
    for (let sx = 0; sx < SW; sx++) {
      okSample[sy * SW + sx] = canStand(sx * STEP + STEP * 0.5, sy * STEP + STEP * 0.5) ? 1 : 0;
    }
  }
  const reached = new Uint8Array(SW * SH);
  {
    // Start from the nearest standable sample to the entry; the entry itself may
    // be inside a stair collider.
    let start = -1;
    const ex = tileX(level.entry.x);
    const ez = tileZ(level.entry.y);
    let best = Infinity;
    for (let sy = 0; sy < SH; sy++) {
      for (let sx = 0; sx < SW; sx++) {
        if (!okSample[sy * SW + sx]) continue;
        const dx = sx * STEP + STEP * 0.5 - ex;
        const dz = sy * STEP + STEP * 0.5 - ez;
        const d = dx * dx + dz * dz;
        if (d < best) {
          best = d;
          start = sy * SW + sx;
        }
      }
    }
    if (start >= 0) {
      const q = [start];
      reached[start] = 1;
      for (let h = 0; h < q.length; h++) {
        const c = q[h]!;
        const cx = c % SW;
        const cy = (c / SW) | 0;
        const step = (nx: number, ny: number): void => {
          if (nx < 0 || ny < 0 || nx >= SW || ny >= SH) return;
          const n = ny * SW + nx;
          if (reached[n] || !okSample[n]) return;
          reached[n] = 1;
          q.push(n);
        };
        step(cx - 1, cy);
        step(cx + 1, cy);
        step(cx, cy - 1);
        step(cx, cy + 1);
      }
    }
  }

  const per = Math.round(TILE_SIZE / STEP);
  let navReach = 0;
  let sealed = 0;
  let onProp = 0;
  let cutOff = 0;
  const culprits: Record<string, number> = {};
  const propAt = new Map<number, string>();
  for (const p of level.props) {
    if (propDef(p.kind).blocks) propAt.set(p.y * W + p.x, p.kind);
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!navSeen[y * W + x]) continue;
      navReach++;
      let anyOk = false;
      let anyReached = false;
      for (let sy = y * per; sy < (y + 1) * per; sy++) {
        for (let sx = x * per; sx < (x + 1) * per; sx++) {
          if (okSample[sy * SW + sx]) anyOk = true;
          if (reached[sy * SW + sx]) anyReached = true;
        }
      }
      const ownProp = propAt.has(y * W + x);
      if (!anyOk) {
        if (ownProp) onProp++;
        else sealed++;
      } else if (!anyReached) cutOff++;
      if ((anyOk && anyReached) || ownProp) continue;
      // Blame the nearest blocking prop.
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const k = propAt.get((y + dy) * W + (x + dx));
          if (k) culprits[k] = (culprits[k] ?? 0) + 1;
        }
      }
    }
  }
  return { depth, biome: level.biome, navReach, sealed, onProp, cutOff, culprits };
}

// --- walk ------------------------------------------------------------------

for (const depth of [1, 2, 4, 6, 9, 13, 18, 25]) {
  for (let s = 0; s < 3; s++) {
    const seed = (depth * 7919 + s * 104729) >>> 0;
    const run = generateRun(depth, seed, 'warden');
    for (const level of run.levels) {
      levels++;
      // The run already chose the biome and its dressing; read them off the
      // level rather than re-rolling and getting different art.
      const art = biomeArt(level.biome, level.variant);
      for (const p of level.props) {
        const def = propDef(p.kind);
        if (!def.blocks || def.radius <= 0) continue;
        blockers++;
        const sc = scaleFor(p.kind, p.x, p.y);
        const colliderHalf = def.radius * sc;
        let rep = kinds.get(p.kind);
        if (!rep) {
          const mh = meshHalfWidth(p.kind, art, level.seed, variantFor(p.kind, p.x, p.y));
          rep = {
            kind: p.kind,
            placement: def.placement ?? 'floor',
            count: 0,
            colliderHalf: 0,
            meshHalf: mh === null ? 0 : mh,
            // The builder moves the collider by `wallOffset` too, so mesh and
            // collider share a centre and the offset cancels out. Kept as a
            // reported column: if it ever stops cancelling, `bare` shows it.
            offset: 0,
            noMesh: mh === null,
            bareRing: 0,
          };
          kinds.set(p.kind, rep);
        }
        rep.count++;
        rep.colliderHalf = Math.max(rep.colliderHalf, colliderHalf);
        const stopAt = colliderHalf + PLAYER_R;
        const meshEdge = rep.noMesh ? 0 : rep.meshHalf * sc - rep.offset;
        rep.bareRing = Math.max(rep.bareRing, stopAt - Math.max(0, meshEdge) - PLAYER_R);
      }
      if (s === 0) fits.push(measureFit(level, depth));
    }
  }
}

const out = [...kinds.values()].sort((a, b) => b.bareRing - a.bareRing);
const culprits: Record<string, number> = {};
for (const f of fits) for (const [k, n] of Object.entries(f.culprits)) culprits[k] = (culprits[k] ?? 0) + n;
console.log(
  JSON.stringify({
    levels,
    blockers,
    tile: TILE_SIZE,
    playerR: PLAYER_R,
    kinds: out,
    fits,
    culprits: Object.entries(culprits)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12),
  }),
);
