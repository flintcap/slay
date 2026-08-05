/**
 * Entry point for `tools/check-decalheight.mjs`.
 *
 * Counts how much walkable floor sits above the lowest height band, per biome.
 * That is exactly the floor on which a decal pinned to world zero landed in the
 * wrong place.
 */
import { generateRun, levelExtras, isWalkable, STEP_HEIGHT } from '../src/world/DungeonGen';

interface Report {
  biome: string;
  floorTiles: number;
  /** Walkable tiles whose floor is not at world zero. */
  raised: number;
  /** The highest floor found, in metres. */
  tallest: number;
}

const byBiome = new Map<string, Report>();
let levels = 0;

for (const depth of [1, 2, 4, 6, 9, 13, 18, 25, 30]) {
  for (let s = 0; s < 3; s++) {
    const run = generateRun(depth, (depth * 7919 + s * 104729) >>> 0, 'warden');
    for (const level of run.levels) {
      const ex = levelExtras(level);
      if (!ex) continue;
      levels++;
      let rep = byBiome.get(level.biome);
      if (!rep) {
        rep = { biome: level.biome, floorTiles: 0, raised: 0, tallest: 0 };
        byBiome.set(level.biome, rep);
      }
      for (let y = 0; y < level.height; y++) {
        for (let x = 0; x < level.width; x++) {
          if (!isWalkable(level, x, y)) continue;
          rep.floorTiles++;
          const h = ex.heights[y * level.width + x]! * STEP_HEIGHT;
          if (h > 0.001) rep.raised++;
          if (h > rep.tallest) rep.tallest = h;
        }
      }
    }
  }
}

console.log(JSON.stringify({ levels, biomes: [...byBiome.values()] }));
