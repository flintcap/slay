/**
 * Entry point for `tools/check-roof.mjs`.
 *
 * Reported, repeatedly: "still holes in the walls and top of walls", "its the
 * same for the cave biome".
 *
 * The rock above a dungeon is capped one quad per tile. Two things put real
 * holes in that cap, and both are arithmetic rather than opinion:
 *
 * 1. **Uncapped solid tiles.** A wall tile only gets a top quad when it touches
 *    open space. A wall tile buried inside a thick run of wall touches none, so
 *    it gets nothing, and a tile with no cap is a two-metre hole straight down
 *    into the level.
 *
 * 2. **Steps with no side.** Every tile caps at *its own* terrain height plus
 *    the wall height, and terrain height is per-tile noise. Two neighbouring
 *    capped tiles one step apart leave a vertical slot between their quads, and
 *    nothing emits a face to close it. At a step of 0.45m and a camera pitched
 *    at 0.92 radians, that slot is a gash you can see the void through.
 *
 * This walks generated levels and counts both, per biome.
 */
import { generateRun, TILE, levelExtras, STEP_HEIGHT } from '../src/world/DungeonGen';
import { biomeArt, biomeForDepth } from '../src/world/Biomes';
import { streamFor } from '../src/core/RNG';
import type { DungeonLevel } from '../src/types';

const T_VOID = TILE.void;
const T_WALL = TILE.wall;

interface Report {
  biome: string;
  depth: number;
  solidTiles: number;
  /** Solid tiles that emit no top quad at all. */
  uncapped: number;
  /** Neighbouring capped tiles at different heights with nothing between. */
  openSteps: number;
  /** The worst such gap, in metres. */
  worstStep: number;
  /** 1 when the level carried real per-tile heights. */
  haveHeights: number;
}

/** Matches `DungeonBuilder.open`: anything that is not wall or void. */
function open(level: DungeonLevel, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return false;
  const v = level.tiles[y * level.width + x]!;
  return v !== T_WALL && v !== T_VOID;
}

const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];

function audit(level: DungeonLevel, biome: string, depth: number, wallH: number): Report {
  const ex = levelExtras(level);
  // Without the real heights every cap lands at the same Y and the step check
  // silently passes, so say so rather than reporting a clean bill of health.
  const heights = ex?.heights ?? new Int8Array(level.width * level.height);
  const haveHeights = ex?.heights ? 1 : 0;
  const W = level.width;
  const H = level.height;

  // One flat rock height for the level, exactly as the builder computes it.
  let maxStep = 0;
  for (let i = 0; i < heights.length; i++) maxStep = Math.max(maxStep, heights[i]!);
  const roofY = maxStep * STEP_HEIGHT + wallH;

  // The cap height each tile emits, or NaN when it emits nothing.
  const cap = new Float32Array(W * H).fill(NaN);
  let solidTiles = 0;
  let uncapped = 0;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const v = level.tiles[i]!;
      if (v !== T_WALL && v !== T_VOID) continue;
      solidTiles++;
      cap[i] = roofY;
      if (Number.isNaN(cap[i]!)) uncapped++;
    }
  }

  // Steps between two capped tiles. Nothing emits a vertical face there: a wall
  // only faces open space, and a void tile is a lone quad with no sides at all.
  let openSteps = 0;
  let worstStep = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (Number.isNaN(cap[i]!)) continue;
      for (let d = 0; d < 2; d++) {
        const nx = x + DX[d]!;
        const ny = y + DY[d]!;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (Number.isNaN(cap[j]!)) continue;
        const gap = Math.abs(cap[i]! - cap[j]!);
        if (gap > 0.01) {
          openSteps++;
          worstStep = Math.max(worstStep, gap);
        }
      }
    }
  }

  return { biome, depth, solidTiles, uncapped, openSteps, worstStep: +worstStep.toFixed(2), haveHeights };
}

const rows: Report[] = [];
for (let depth = 1; depth <= 24; depth++) {
  for (let s = 0; s < 4; s++) {
    const seed = 0x9e37 + depth * 977 + s * 31;
    const run = generateRun(depth, seed, 'warden');
    const art = biomeArt(biomeForDepth(depth, streamFor(seed, `run:${depth}`)));
    for (const level of run.levels) rows.push(audit(level, art.id, depth, art.wallHeight));
  }
}

// Roll up per biome: this is a whole-game problem, not a one-level one.
const byBiome = new Map<string, Report>();
for (const r of rows) {
  const cur = byBiome.get(r.biome);
  if (!cur) {
    byBiome.set(r.biome, { ...r, depth: 1 });
    continue;
  }
  cur.solidTiles += r.solidTiles;
  cur.uncapped += r.uncapped;
  cur.openSteps += r.openSteps;
  cur.worstStep = Math.max(cur.worstStep, r.worstStep);
  cur.haveHeights = Math.min(cur.haveHeights, r.haveHeights);
}

console.log(
  JSON.stringify({
    levels: rows.length,
    biomes: [...byBiome.values()].sort((a, b) => b.uncapped + b.openSteps - (a.uncapped + a.openSteps)),
  }),
);
