/**
 * Entry point for `tools/check-maps.mjs --maps=N`. Bundled and run under
 * Node: whole maps through `generateRun`, the way a town portal makes them.
 *
 * For every map: the zone chain is 3 to 5 zones in at most 4 areas, the boss
 * zone is last and holds the arena, every area is connected, every zone has
 * ground the hero can reach, the way on is where it should be, the waypoint
 * stands on open ground, and generation stays inside its time budget. Also
 * gathers wide-open share per layout (check-openness's measure) and monster
 * counts per map.
 *
 * argv: [maps]
 */
import { generateRun, setMonsterCatalog, isWalkable } from '../src/world/DungeonGen';
import { pickMonstersForDepth } from '../src/data/monsters';
import { MONSTER_AFFIXES } from '../src/data/monsterAffixes';
import { pickBossForDepth } from '../src/data/bosses';
import type { DungeonLevel } from '../src/types';

declare const process: { argv: string[] };

setMonsterCatalog({
  pick: (depth, biome, rng, count) => pickMonstersForDepth(depth, biome, rng, count).map((m) => m.id),
  affixes: (depth, rng, count) => {
    const pool = MONSTER_AFFIXES.filter((a) => a.minDepth <= depth);
    const out: string[] = [];
    for (let i = 0; i < count && i < pool.length; i++) out.push(rng.pick(pool).id);
    return out;
  },
  bossFor: (depth, biome, rng) => pickBossForDepth(depth, biome, rng).id,
});

const N = Number(process.argv[2] ?? 200);
const TIERS = [1, 2, 3, 5, 8, 12, 16, 20, 25, 30, 40, 50, 65, 80, 100];

interface MapRow {
  tier: number;
  seed: number;
  name: string;
  theme: string;
  zones: number;
  areas: number;
  ms: number;
  mobs: number;
  maxSide: number;
  walk: number;
  fails: string[];
}

const wide = new Map<string, { floor: number; wide: number }>();

function reach(level: DungeonLevel): Uint8Array {
  const W = level.width;
  const seen = new Uint8Array(W * level.height);
  const q = [level.entry.y * W + level.entry.x];
  seen[q[0]!] = 1;
  while (q.length) {
    const i = q.pop()!;
    const x = i % W;
    const y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const xx = x + dx;
      const yy = y + dy;
      if (!isWalkable(level, xx, yy)) continue;
      const j = yy * W + xx;
      if (seen[j]) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return seen;
}

const rows: MapRow[] = [];
for (let k = 0; k < N; k++) {
  const tier = TIERS[k % TIERS.length]!;
  const seed = (0x9e3779b1 ^ (k * 2654435761)) >>> 0;
  const t0 = performance.now();
  const run = generateRun(tier, seed, 'warden');
  const ms = performance.now() - t0;
  const fails: string[] = [];
  const info = run.map;
  const zones = info?.zones.length ?? 0;
  if (!info) fails.push('no map info');
  if (zones < 3 || zones > 5) fails.push(`${zones} zones`);
  if (run.levels.length > 4) fails.push(`${run.levels.length} areas`);
  let mobs = 0;
  let maxSide = 0;
  let walk = 0;
  let order = 0;
  run.levels.forEach((level, li) => {
    const tag = `area ${li}`;
    const last = li === run.levels.length - 1;
    maxSide = Math.max(maxSide, level.width, level.height);
    mobs += level.spawns.length;
    const W = level.width;
    const seen = reach(level);
    let lost = 0;
    const zoneGround = new Map<number, number>();
    for (let i = 0; i < level.tiles.length; i++) {
      if (!isWalkable(level, i % W, (i / W) | 0)) continue;
      walk++;
      if (!seen[i]) lost++;
      else {
        const z = level.zoneOf?.[i] ?? 0;
        zoneGround.set(z, (zoneGround.get(z) ?? 0) + 1);
      }
    }
    if (lost > 0) fails.push(`${tag}: ${lost} walkable tiles unreachable`);
    for (const z of level.zones ?? []) {
      if (z.order !== order++) fails.push(`${tag}: zone ${z.name} out of order`);
      if ((zoneGround.get(z.id) ?? 0) < 400) fails.push(`${tag}: zone ${z.name} has ${zoneGround.get(z.id) ?? 0} reachable tiles`);
    }
    if (!seen[level.exit.y * W + level.exit.x]) fails.push(`${tag}: exit unreachable`);
    const ex = level.exits?.[0];
    if (!ex) fails.push(`${tag}: no exit record`);
    else {
      if (ex.x !== level.exit.x || ex.y !== level.exit.y) fails.push(`${tag}: exit record is not at the exit`);
      if (last ? ex.to !== 'town' : ex.to !== li + 1) fails.push(`${tag}: exit leads to ${ex.to}`);
      if (!Number.isFinite(ex.facing)) fails.push(`${tag}: exit facing ${ex.facing}`);
    }
    if (last) {
      const boss = level.zones?.[level.zones.length - 1];
      if (!level.isBossLevel || boss?.role !== 'boss') fails.push(`${tag}: last area holds no boss zone`);
      const ar = level.arena;
      if (!ar) fails.push(`${tag}: no arena`);
      else {
        if (!seen[ar.gate.y * W + ar.gate.x]) fails.push(`${tag}: arena gate unreachable`);
        let ways = 0;
        for (let y = ar.y - 1; y <= ar.y + ar.h; y++) {
          for (let x = ar.x - 1; x <= ar.x + ar.w; x++) {
            const ring = x === ar.x - 1 || y === ar.y - 1 || x === ar.x + ar.w || y === ar.y + ar.h;
            if (ring && isWalkable(level, x, y)) ways++;
          }
        }
        if (ways !== 3) fails.push(`${tag}: arena has ${ways} ways in`);
      }
    } else if (level.isBossLevel) fails.push(`${tag}: boss before the last area`);
    if (li === 0) {
      const wp = level.waypoint;
      if (!wp) fails.push('no waypoint');
      else {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!isWalkable(level, wp.x + dx, wp.y + dy)) fails.push('waypoint not on open ground');
        if (!seen[wp.y * W + wp.x]) fails.push('waypoint unreachable');
      }
    } else if (level.waypoint) fails.push(`${tag}: a waypoint past the first area`);

    // check-openness's measure, per zone layout, arena left out.
    const ar = level.arena;
    for (let y = 2; y < level.height - 2; y++) {
      for (let x = 2; x < W - 2; x++) {
        if (!isWalkable(level, x, y)) continue;
        if (ar && x >= ar.x && y >= ar.y && x < ar.x + ar.w && y < ar.y + ar.h) continue;
        const z = level.zones?.[level.zoneOf?.[y * W + x] ?? 0];
        const key = z?.layout ?? level.layout ?? '?';
        let rec = wide.get(key);
        if (!rec) wide.set(key, (rec = { floor: 0, wide: 0 }));
        rec.floor++;
        let open = true;
        for (let dy = -2; dy <= 2 && open; dy++) for (let dx = -2; dx <= 2; dx++) if (!isWalkable(level, x + dx, y + dy)) { open = false; break; }
        if (open) rec.wide++;
      }
    }
  });
  rows.push({ tier, seed, name: info?.name ?? '?', theme: info?.theme ?? '?', zones, areas: run.levels.length, ms, mobs, maxSide, walk, fails });
}

console.log(JSON.stringify({ rows, wide: Object.fromEntries(wide) }));
