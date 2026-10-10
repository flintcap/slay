/**
 * Entry point for `tools/check-maps.mjs`. Bundled and run under Node: pure
 * generation only, no DOM, no Three.js.
 *
 * Builds areas straight from the zone generators (docs/remake/maps.md) and
 * measures each one: is every tile reachable, does the arena have exactly one
 * way in, how open is the ground, how long is the longest narrow run, how big
 * is the grid and how long did it take.
 *
 * argv: [samples, dumpLayout?, dumpSeed?]
 */
import { streamFor } from '../src/core/RNG';
import { getBiome, isOutdoorBiome } from '../src/world/Biomes';
import { T_BRIDGE, T_CHASM, T_DEEP_WATER, T_DOOR, T_FLOOR, T_ICE, T_LAVA, T_RUIN, T_RUBBLE, T_VOID, T_WALL, T_WATER, isWalkableValue } from '../src/world/Layouts';
import { type AreaOut, type ZonePlan, buildArea } from '../src/world/zones/Area';
import type { BiomeId, LayoutKind } from '../src/types';

/** Which biome each layout is measured in (every biome that uses it). */
const CASES: Array<{ layout: LayoutKind; biomes: BiomeId[] }> = [
  { layout: 'forest', biomes: ['darkForest'] },
  { layout: 'swamp', biomes: ['swamp'] },
  { layout: 'dunes', biomes: ['desert'] },
  { layout: 'tundra', biomes: ['tundra'] },
  { layout: 'wastes', biomes: ['ashwaste', 'hell'] },
  { layout: 'crypt', biomes: ['crypt'] },
  { layout: 'cave', biomes: ['caverns', 'frostvault', 'hive'] },
  { layout: 'tomb', biomes: ['desertTomb'] },
  { layout: 'keep', biomes: ['crypt', 'foundry', 'sunkenTemple'] },
  { layout: 'rift', biomes: ['voidspire'] },
];
const DEPTHS = [1, 6, 15, 40, 90];

function zone(biome: BiomeId, layout: LayoutKind, role: ZonePlan['role'], order: number): ZonePlan {
  return { name: getBiome(biome).name, biome, layout, outdoor: isOutdoorBiome(biome), role, order };
}

interface Row {
  layout: string;
  biome: string;
  kind: 'single' | 'pair' | 'boss';
  depth: number;
  w: number;
  h: number;
  ms: number;
  walk: number;
  share: number;
  reached: number;
  entryOk: boolean;
  exitOk: boolean;
  arenaWays: number;
  arenaReached: boolean;
  disc: number;
  narrowShare: number;
  narrowRun: number;
  rooms: number;
  border: number;
  jumps: number;
}

function bfs(a: AreaOut): Int32Array {
  const g = a.grid;
  const n = g.w * g.h;
  const d = new Int32Array(n).fill(-1);
  const q = new Int32Array(n);
  const s = a.entry.y * g.w + a.entry.x;
  if (!isWalkableValue(g.t[s])) return d;
  let head = 0;
  let tail = 0;
  d[s] = 0;
  q[tail++] = s;
  while (head < tail) {
    const c = q[head++];
    const cx = c % g.w;
    for (const nb of [cx > 0 ? c - 1 : -1, cx < g.w - 1 ? c + 1 : -1, c - g.w, c + g.w]) {
      if (nb < 0 || nb >= n || d[nb] >= 0 || !isWalkableValue(g.t[nb])) continue;
      d[nb] = d[c] + 1;
      q[tail++] = nb;
    }
  }
  return d;
}

function measure(a: AreaOut, meta: Pick<Row, 'layout' | 'biome' | 'kind' | 'depth' | 'ms'>): Row {
  const g = a.grid;
  const n = g.w * g.h;
  const d = bfs(a);
  let walk = 0;
  let reached = 0;
  let border = 0;
  for (let i = 0; i < n; i++) {
    if (!isWalkableValue(g.t[i])) continue;
    walk++;
    if (d[i] >= 0) reached++;
    const x = i % g.w;
    const y = (i / g.w) | 0;
    if (x < 2 || y < 2 || x >= g.w - 2 || y >= g.h - 2) border++;
  }
  const at = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < g.w && y < g.h && isWalkableValue(g.t[y * g.w + x]);

  // Arena: walkable tiles on its one-tile shell are the ways in.
  let arenaWays = 0;
  let arenaReached = true;
  if (a.arena) {
    const r = a.arena;
    for (let y = r.y - 1; y <= r.y + r.h; y++) {
      for (let x = r.x - 1; x <= r.x + r.w; x++) {
        const shell = x === r.x - 1 || y === r.y - 1 || x === r.x + r.w || y === r.y + r.h;
        if (shell && at(x, y)) arenaWays++;
      }
    }
    let any = false;
    for (let y = r.y; y < r.y + r.h && !any; y++) for (let x = r.x; x < r.x + r.w; x++) if (d[y * g.w + x] >= 0) { any = true; break; }
    arenaReached = any;
  }

  // Largest open square (Chebyshev distance to anything not walkable).
  const dt = new Int32Array(n);
  for (let i = 0; i < n; i++) dt[i] = isWalkableValue(g.t[i]) ? 9999 : 0;
  const dv = (x: number, y: number): number => (x < 0 || y < 0 || x >= g.w || y >= g.h ? 0 : dt[y * g.w + x]);
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const i = y * g.w + x;
      if (dt[i]) dt[i] = Math.min(dt[i], dv(x - 1, y) + 1, dv(x, y - 1) + 1, dv(x - 1, y - 1) + 1, dv(x + 1, y - 1) + 1);
    }
  }
  let disc = 0;
  for (let y = g.h - 1; y >= 0; y--) {
    for (let x = g.w - 1; x >= 0; x--) {
      const i = y * g.w + x;
      if (dt[i]) dt[i] = Math.min(dt[i], dv(x + 1, y) + 1, dv(x, y + 1) + 1, dv(x + 1, y + 1) + 1, dv(x - 1, y + 1) + 1);
      if (dt[i] > disc) disc = dt[i];
    }
  }

  // Narrow ground: open across by two tiles or fewer on the tighter axis.
  const narrow = new Uint8Array(n);
  let nCount = 0;
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (!at(x, y)) continue;
      let hspan = 1;
      for (let k = 1; k < 4 && at(x - k, y); k++) hspan++;
      for (let k = 1; k < 4 && at(x + k, y); k++) hspan++;
      let vspan = 1;
      for (let k = 1; k < 4 && at(x, y - k); k++) vspan++;
      for (let k = 1; k < 4 && at(x, y + k); k++) vspan++;
      if (Math.min(hspan, vspan) <= 2) {
        narrow[y * g.w + x] = 1;
        nCount++;
      }
    }
  }
  let narrowRun = 0;
  const seen = new Uint8Array(n);
  const st: number[] = [];
  for (let s = 0; s < n; s++) {
    if (!narrow[s] || seen[s]) continue;
    let c = 0;
    st.push(s);
    seen[s] = 1;
    while (st.length) {
      const v = st.pop()!;
      c++;
      const vx = v % g.w;
      for (const nb of [vx > 0 ? v - 1 : -1, vx < g.w - 1 ? v + 1 : -1, v - g.w, v + g.w]) {
        if (nb < 0 || nb >= n || seen[nb] || !narrow[nb]) continue;
        seen[nb] = 1;
        st.push(nb);
      }
    }
    if (c > narrowRun) narrowRun = c;
  }

  // Height jumps of more than one step between walkable neighbours.
  let jumps = 0;
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x + 1 < g.w; x++) {
      if (at(x, y) && at(x + 1, y) && Math.abs(g.height(x, y) - g.height(x + 1, y)) > 1) jumps++;
      if (at(x, y) && at(x, y + 1) && Math.abs(g.height(x, y) - g.height(x, y + 1)) > 1) jumps++;
    }
  }

  return {
    ...meta,
    w: g.w,
    h: g.h,
    walk,
    share: walk / n,
    reached: walk ? reached / walk : 0,
    entryOk: at(a.entry.x, a.entry.y),
    exitOk: at(a.exit.x, a.exit.y) && d[a.exit.y * g.w + a.exit.x] >= 0,
    arenaWays,
    arenaReached,
    disc,
    narrowShare: walk ? nCount / walk : 0,
    narrowRun,
    rooms: a.rooms.length,
    border,
    jumps,
  };
}

const CH: Record<number, string> = {
  [T_VOID]: ' ',
  [T_FLOOR]: '.',
  [T_WALL]: '#',
  [T_DOOR]: '+',
  [T_WATER]: '~',
  [T_LAVA]: '^',
  [T_CHASM]: ':',
  [T_RUBBLE]: ',',
  [T_RUIN]: 'H',
  [T_DEEP_WATER]: 'W',
  [T_BRIDGE]: '=',
  [T_ICE]: '*',
};

function dump(a: AreaOut): string {
  const g = a.grid;
  const lines: string[] = [];
  for (let y = 0; y < g.h; y++) {
    let s = '';
    for (let x = 0; x < g.w; x++) {
      if (x === a.entry.x && y === a.entry.y) s += 'E';
      else if (x === a.exit.x && y === a.exit.y) s += 'X';
      else if (a.arena && x === a.arena.gate.x && y === a.arena.gate.y) s += 'G';
      else s += CH[g.t[y * g.w + x]] ?? '?';
    }
    lines.push(s.replace(/\s+$/, ''));
  }
  return lines.join('\n');
}

declare const process: { argv: string[] };
const samples = Number(process.argv[2] ?? 4);
const dumpLayout = process.argv[3];
const dumpSeed = Number(process.argv[4] ?? 1);

if (dumpLayout) {
  const [layout, biomeArg, kindArg] = dumpLayout.split(':');
  const c = CASES.find((k) => k.layout === layout)!;
  const biome = (biomeArg as BiomeId) || c.biomes[0]!;
  const kind = kindArg ?? 'single';
  const rng = streamFor(dumpSeed, `maps:${layout}`);
  const zs: ZonePlan[] =
    kind === 'pair'
      ? [zone(biome, layout as LayoutKind, 'start', 0), zone(biome, layout as LayoutKind, 'field', 1)]
      : [zone(biome, layout as LayoutKind, kind === 'boss' ? 'boss' : 'start', 0)];
  const a = buildArea({ zones: zs, depth: 10 }, rng);
  console.log(dump(a));
  console.log(JSON.stringify(measure(a, { layout, biome, kind: kind as Row['kind'], depth: 10, ms: 0 })));
} else {
  const rows: Row[] = [];
  for (const c of CASES) {
    for (const biome of c.biomes) {
      for (const depth of DEPTHS) {
        for (let s = 0; s < samples; s++) {
          for (const kind of ['single', 'boss', ...(isOutdoorBiome(biome) ? ['pair'] : [])] as Row['kind'][]) {
            const rng = streamFor(1000 + s * 7919 + depth, `maps:${c.layout}:${biome}:${kind}`);
            const zs: ZonePlan[] =
              kind === 'pair'
                ? [zone(biome, c.layout, 'start', 0), zone(biome, c.layout, 'field', 1)]
                : [zone(biome, c.layout, kind === 'boss' ? 'boss' : 'start', 0)];
            const t0 = performance.now();
            const a = buildArea({ zones: zs, depth }, rng);
            const ms = performance.now() - t0;
            rows.push(measure(a, { layout: c.layout, biome, kind, depth, ms }));
          }
        }
      }
    }
  }
  console.log(JSON.stringify(rows));
}
