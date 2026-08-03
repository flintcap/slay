/**
 * Entry point for `tools/check-props.mjs`.
 *
 * Playtesters report clutter "floating next to the wall". A prop is drawn at
 * its own tile's height, so anything standing where the floor around it sits
 * lower reads as hovering over a lip. This finds those, plus props sitting on
 * tiles that are not floor at all.
 */
import { generateRun, levelExtras, isWalkable, propGroundHeight, TILE } from '../src/world/DungeonGen';
import { propDef } from '../src/world/Props';

interface Bad {
  depth: number;
  kind: string;
  placement: string;
  x: number;
  y: number;
  ownHeight: number;
  lowestNeighbour: number;
  onFloor: boolean;
}

const bad: Bad[] = [];
let props = 0;
let levels = 0;
/** How many props sit on a step and are pulled down by the new rule. */
let lipped = 0;

for (const depth of [1, 2, 3, 5, 8, 12, 20, 30]) {
  for (let s = 0; s < 5; s++) {
    const run = generateRun(depth, (depth * 7919 + s * 104729) >>> 0, 'warden');
    for (const level of run.levels) {
      const ex = levelExtras(level);
      if (!ex) continue;
      levels++;
      const W = level.width;
      const h = (x: number, y: number) =>
        x < 0 || y < 0 || x >= level.width || y >= level.height ? 0 : ex.heights[y * W + x];
      for (const p of level.props) {
        props++;
        const def = propDef(p.kind);
        const onFloor = isWalkable(level, p.x, p.y);
        const own = h(p.x, p.y);
        let lowest = own;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as Array<[number, number]>) {
          if (!isWalkable(level, p.x + dx, p.y + dy)) continue;
          lowest = Math.min(lowest, h(p.x + dx, p.y + dy));
        }
        // A wall-mounted prop is meant to hang, so only floor props count.
        const floorish = def.placement !== 'wall' && def.placement !== 'liquid';
        // The builder now draws floor props at `propGroundHeight`, so what makes
        // a prop wrong is standing off floor, or the builder disagreeing with
        // the lowest floor its tile touches.
        const drawnAt = floorish ? propGroundHeight(level, p.x, p.y) : own;
        if (floorish && lowest < own) lipped++;
        if (floorish && (!onFloor || drawnAt !== lowest)) {
          bad.push({
            depth,
            kind: p.kind,
            placement: def.placement ?? 'floor',
            x: p.x,
            y: p.y,
            ownHeight: own,
            lowestNeighbour: lowest,
            onFloor,
          });
        }
      }
    }
  }
}

void TILE;
console.log(JSON.stringify({ levels, props, bad, lipped }));
