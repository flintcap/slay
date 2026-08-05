/**
 * Entry point for `tools/check-openness.mjs`.
 *
 * Asked: "Are the Caverns supposed to be a giant open map?"
 *
 * Measures, per layout kind, how much of a level is open floor and how that
 * floor is shaped. Two numbers say whether a level is a place or a field:
 *
 *  - **floor share** — walkable tiles as a fraction of the level's area.
 *  - **wide-open share** — walkable tiles whose whole 5x5 neighbourhood is also
 *    walkable. That is a tile at least two tiles from any wall in every
 *    direction, which is the middle of a big empty space rather than a room or
 *    a passage. A dungeon made of rooms and corridors scores low here even
 *    though its rooms are large, because rooms have walls close by.
 *
 * Also reports the widest single open run, in tiles, so "giant" gets a size.
 */
import { generateRun, isWalkable } from '../src/world/DungeonGen';

interface Report {
  layout: string;
  levels: number;
  area: number;
  floor: number;
  wideOpen: number;
  /** Largest square of fully walkable tiles found, in tiles across. */
  widestSquare: number;
}

const byLayout = new Map<string, Report>();

for (const depth of [1, 2, 4, 6, 9, 13, 18, 25, 30]) {
  for (let s = 0; s < 4; s++) {
    const run = generateRun(depth, (depth * 7919 + s * 104729) >>> 0, 'warden');
    for (const level of run.levels) {
      const kind = level.layout ?? 'unknown';
      let rep = byLayout.get(kind);
      if (!rep) {
        rep = { layout: kind, levels: 0, area: 0, floor: 0, wideOpen: 0, widestSquare: 0 };
        byLayout.set(kind, rep);
      }
      rep.levels++;
      const W = level.width;
      const H = level.height;
      rep.area += W * H;

      // Largest all-walkable square, by the standard dynamic program: the
      // square ending at a tile is one more than the smallest of its three
      // neighbours' squares.
      const dp = new Int32Array(W * H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (!isWalkable(level, x, y)) continue;
          rep.floor++;
          const i = y * W + x;
          dp[i] =
            x === 0 || y === 0
              ? 1
              : 1 + Math.min(dp[i - 1]!, dp[i - W]!, dp[i - W - 1]!);
          if (dp[i]! > rep.widestSquare) rep.widestSquare = dp[i]!;

          // Two tiles of clearance in every direction.
          let open = true;
          for (let dy = -2; dy <= 2 && open; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              if (!isWalkable(level, x + dx, y + dy)) {
                open = false;
                break;
              }
            }
          }
          if (open) rep.wideOpen++;
        }
      }
    }
  }
}

console.log(JSON.stringify({ layouts: [...byLayout.values()] }));
