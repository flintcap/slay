/**
 * Entry point for `tools/check-mapgen.mjs`. Bundled and run under Node, so it
 * must not touch the DOM or Three.js — only the pure generation layer.
 *
 * Answers three questions with numbers instead of opinions:
 *  1. Which biomes does a player actually see, floor by floor?
 *  2. Which layout shapes do they get?
 *  3. How wide are the corridors they walk down?
 */
import { generateRun, TILE, isWalkable } from '../src/world/DungeonGen';
import { BIOMES, biomeForDepth } from '../src/world/Biomes';
import { streamFor } from '../src/core/RNG';
import type { DungeonLevel } from '../src/types';

/** Use the game's own rule, not a guess: shallow water is walkable, lava is not. */
const walkable = isWalkable;
void TILE;

/**
 * The open width of a tile: how far you can see across it, taking the tighter
 * of the two axes. A 1 means a one-tile corridor, which at TILE_SIZE 2.0 is a
 * two-metre slot the camera cannot look down.
 */
function openWidth(level: DungeonLevel, x: number, y: number): number {
  let h = 1;
  for (let d = 1; d < 12 && walkable(level, x - d, y); d++) h++;
  for (let d = 1; d < 12 && walkable(level, x + d, y); d++) h++;
  let v = 1;
  for (let d = 1; d < 12 && walkable(level, x, y - d); d++) v++;
  for (let d = 1; d < 12 && walkable(level, x, y + d); d++) v++;
  return Math.min(h, v);
}

/** Tiles inside a room rectangle are not corridor; they are meant to be open. */
function roomMask(level: DungeonLevel): Uint8Array {
  const m = new Uint8Array(level.width * level.height);
  for (const r of level.rooms) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (x >= 0 && y >= 0 && x < level.width && y < level.height) m[y * level.width + x] = 1;
      }
    }
  }
  return m;
}

/** Flood from the up-stairs. Anything it cannot reach is content nobody sees. */
function reachability(level: DungeonLevel): { reached: number; exitReached: boolean } {
  const seen = new Uint8Array(level.width * level.height);
  const start = level.entry.y * level.width + level.entry.x;
  const queue = [start];
  seen[start] = 1;
  let reached = 0;
  while (queue.length > 0) {
    const c = queue.pop() as number;
    reached++;
    const x = c % level.width;
    const y = (c - x) / level.width;
    const step = (nx: number, ny: number): void => {
      if (!walkable(level, nx, ny)) return;
      const n = ny * level.width + nx;
      if (seen[n]) return;
      seen[n] = 1;
      queue.push(n);
    };
    step(x + 1, y);
    step(x - 1, y);
    step(x, y + 1);
    step(x, y - 1);
  }
  return { reached, exitReached: seen[level.exit.y * level.width + level.exit.x] === 1 };
}

interface LevelRow {
  depth: number;
  biome: string;
  levelIndex: number;
  layout: string;
  width: number;
  height: number;
  rooms: number;
  floorTiles: number;
  corridorTiles: number;
  /** Index 1..6+ counts of corridor tiles at that open width. */
  widthHist: number[];
  props: number;
  interactables: number;
  propKinds: Record<string, number>;
  shrineRooms: number;
  roomKinds: Record<string, number>;
  reached: number;
  exitReached: boolean;
}

const rows: LevelRow[] = [];
const RUNS_PER_DEPTH = 6;
const DEPTHS = [1, 2, 3, 4, 5, 6, 8, 10, 14, 20, 27, 35, 45, 60];

for (const depth of DEPTHS) {
  for (let s = 0; s < RUNS_PER_DEPTH; s++) {
    const seed = (depth * 7919 + s * 104729) >>> 0;
    const run = generateRun(depth, seed, 'warden');
    run.levels.forEach((level, levelIndex) => {
      const mask = roomMask(level);
      const hist = new Array(8).fill(0);
      let floorTiles = 0;
      let corridorTiles = 0;
      for (let y = 0; y < level.height; y++) {
        for (let x = 0; x < level.width; x++) {
          if (!walkable(level, x, y)) continue;
          floorTiles++;
          if (mask[y * level.width + x]) continue;
          corridorTiles++;
          hist[Math.min(7, openWidth(level, x, y))]++;
        }
      }
      const propKinds: Record<string, number> = {};
      let interactables = 0;
      for (const p of level.props) {
        propKinds[p.kind] = (propKinds[p.kind] ?? 0) + 1;
        if (p.interact) interactables++;
      }
      const roomKinds: Record<string, number> = {};
      for (const r of level.rooms) roomKinds[r.kind] = (roomKinds[r.kind] ?? 0) + 1;
      const reach = reachability(level);

      rows.push({
        depth,
        biome: run.biome,
        levelIndex,
        layout: level.layout,
        width: level.width,
        height: level.height,
        rooms: level.rooms.length,
        floorTiles,
        corridorTiles,
        widthHist: hist,
        props: level.props.length,
        interactables,
        propKinds,
        shrineRooms: level.rooms.filter((r) => r.kind === 'shrine').length,
        roomKinds,
        reached: reach.reached,
        exitReached: reach.exitReached,
      });
    });
  }
}

// How often each biome comes up per depth, sampled far wider than the run loop.
const biomeByDepth: Record<number, Record<string, number>> = {};
for (const depth of DEPTHS) {
  const tally: Record<string, number> = {};
  for (let s = 0; s < 400; s++) {
    const id = biomeForDepth(depth, streamFor(s * 2654435761, `run:${depth}`));
    tally[id] = (tally[id] ?? 0) + 1;
  }
  biomeByDepth[depth] = tally;
}

console.log(
  JSON.stringify({
    rows,
    biomeByDepth,
    biomes: BIOMES.map((b) => ({ id: b.id, name: b.name, minDepth: b.minDepth, layouts: b.layouts })),
  }),
);
