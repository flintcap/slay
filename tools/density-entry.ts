/**
 * Entry point for `tools/check-density.mjs`.
 *
 * Reported: "the maps feel empty, aside from the few lootable objects there is
 * nothing to them but empty rooms and halls", and "add MORE monsters to each
 * run, we need a LOT more".
 *
 * Both are density questions and both have numbers. This measures, per layout
 * shape and per biome:
 *
 *  - walkable tiles on a floor, so everything else can be per-area
 *  - props per hundred walkable tiles, and how much of the floor is *bare* —
 *    the share of walkable tiles with nothing within three tiles of them, which
 *    is the number that matches the feeling of walking through an empty box
 *  - monsters per hundred walkable tiles
 *
 * The bare share is the one to watch. Total prop count says a floor has three
 * hundred things on it; the bare share says you can still walk for twenty
 * metres without passing one.
 */
import { generateRun, setMonsterCatalog, isWalkable } from '../src/world/DungeonGen';
import { MONSTERS, pickMonstersForDepth } from '../src/data/monsters';
import { MONSTER_AFFIXES } from '../src/data/monsterAffixes';
import { pickBossForDepth } from '../src/data/bosses';
import { namedRaresFor } from '../src/data/namedRares';
import type { DungeonLevel } from '../src/types';

setMonsterCatalog({
  pick: (depth, biome, rng, count) => pickMonstersForDepth(depth, biome, rng, count).map((m) => m.id),
  affixes: (depth, rng, count) => {
    const pool = MONSTER_AFFIXES.filter((a) => a.minDepth <= depth);
    const out: string[] = [];
    const taken = new Set<string>();
    for (let i = 0; i < count && taken.size < pool.length; i++) {
      const legal = pool.filter((a) => !taken.has(a.id) && !(a.excludes ?? []).some((x) => taken.has(x)));
      if (legal.length === 0) break;
      const chosen = rng.weighted(legal, (a) => a.weight);
      taken.add(chosen.id);
      out.push(chosen.id);
    }
    return out;
  },
  bossFor: (depth, biome, rng) => pickBossForDepth(depth, biome, rng).id,
  nameFor: (monsterId, biome, depth, rng) => {
    const def = MONSTERS.find((m) => m.id === monsterId);
    if (!def) return null;
    const pool = namedRaresFor(def.family, monsterId, biome, depth);
    return pool.length ? rng.weighted(pool, (n) => n.weight).id : null;
  },
});

/** How far a prop still dresses the ground around it, in tiles. */
const DRESS_RADIUS = 3;

interface Sample {
  layout: string;
  biome: string;
  depth: number;
  walkable: number;
  props: number;
  monsters: number;
  bare: number;
}

function sample(level: DungeonLevel, depth: number): Sample {
  const W = level.width;
  const H = level.height;
  const walk: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) if (isWalkable(level, x, y)) walk.push(y * W + x);
  }

  // Distance transform, capped: mark every tile within DRESS_RADIUS of a prop.
  const dressed = new Uint8Array(W * H);
  const queue: number[] = [];
  for (const p of level.props) {
    const i = p.y * W + p.x;
    if (i < 0 || i >= dressed.length) continue;
    if (dressed[i] === 0) {
      dressed[i] = 1;
      queue.push(i);
    }
  }
  let front = queue;
  for (let step = 0; step < DRESS_RADIUS; step++) {
    const next: number[] = [];
    for (const i of front) {
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as Array<[number, number]>) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (dressed[j]) continue;
        dressed[j] = 1;
        next.push(j);
      }
    }
    front = next;
  }

  let bare = 0;
  for (const i of walk) if (!dressed[i]) bare++;

  return {
    layout: level.layout,
    biome: level.biome,
    depth,
    walkable: walk.length,
    props: level.props.length,
    monsters: level.spawns.length,
    bare,
  };
}

const samples: Sample[] = [];
for (let i = 0; i < 200; i++) {
  const depth = 1 + (i % 30);
  const run = generateRun(depth, 0x1d05 + i * 5171, 'warden');
  for (const level of run.levels) samples.push(sample(level, depth));
}

function roll(key: (s: Sample) => string): Array<Record<string, number | string>> {
  const groups = new Map<string, Sample[]>();
  for (const s of samples) {
    const k = key(s);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(s);
  }
  return [...groups.entries()]
    .map(([k, list]) => {
      const walk = list.reduce((n, s) => n + s.walkable, 0);
      const props = list.reduce((n, s) => n + s.props, 0);
      const mons = list.reduce((n, s) => n + s.monsters, 0);
      const bare = list.reduce((n, s) => n + s.bare, 0);
      return {
        key: k,
        floors: list.length,
        tiles: Math.round(walk / list.length),
        props: Math.round(props / list.length),
        propsPer100: +((props / Math.max(1, walk)) * 100).toFixed(1),
        monsters: Math.round(mons / list.length),
        monstersPer100: +((mons / Math.max(1, walk)) * 100).toFixed(1),
        barePct: +((bare / Math.max(1, walk)) * 100).toFixed(1),
      };
    })
    .sort((a, b) => (b.barePct as number) - (a.barePct as number));
}

console.log(
  JSON.stringify({
    floors: samples.length,
    byLayout: roll((s) => s.layout),
    byBiome: roll((s) => s.biome),
    byDepth: roll((s) => `depth ${Math.ceil(s.depth / 10) * 10 - 9}-${Math.ceil(s.depth / 10) * 10}`),
  }),
);
