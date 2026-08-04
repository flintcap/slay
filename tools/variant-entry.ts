/**
 * Entry point for `tools/check-variants.mjs`.
 *
 * A variant that never rolls, or one whose patch changes nothing you can see,
 * is the same dead data as a skill nothing casts. This checks both:
 *
 *  - every variant of every biome actually appears over many runs, at a share
 *    close to the weight it asked for;
 *  - every variant's patch changes at least a few art fields, and specifically
 *    something that reads at a glance — light, liquid, veins or clutter;
 *  - a run wears one variant across all its floors, not a different one each.
 */
import { generateRun } from '../src/world/DungeonGen';
import { BIOMES, biomeArt, biomeVariants } from '../src/world/Biomes';
import type { BiomeArt } from '../src/world/Biomes';

/** Fields a player notices from the game camera without being told to look. */
const LOUD: Array<keyof BiomeArt> = [
  'lightColor',
  'lightIntensity',
  'liquid',
  'liquidColor',
  'veinDensity',
  'veinColor',
  'puddles',
  'shaftDensity',
  'bounceColor',
  'ceiling',
];

interface Row {
  biome: string;
  variant: string;
  name: string;
  weight: number;
  minDepth: number;
  /** How many art fields the patch actually changes. */
  changed: number;
  /** How many of those are ones you notice at a glance. */
  loud: number;
  /** Times it rolled across the sample. */
  rolled: number;
}

const rows: Row[] = [];
for (const b of BIOMES) {
  const base = biomeArt(b.id);
  for (const v of biomeVariants(b.id)) {
    const art = biomeArt(b.id, v.id);
    let changed = 0;
    let loud = 0;
    for (const k of Object.keys(base) as Array<keyof BiomeArt>) {
      if (art[k] === base[k]) continue;
      changed++;
      if (LOUD.includes(k)) loud++;
    }
    rows.push({
      biome: b.id,
      variant: v.id,
      name: v.name,
      weight: v.weight,
      minDepth: v.minDepth ?? 0,
      changed,
      loud,
      rolled: 0,
    });
  }
}

// Roll a lot of runs and see what actually comes up.
const byKey = new Map<string, Row>();
for (const r of rows) byKey.set(`${r.biome}|${r.variant}`, r);

let splitRuns = 0;
const RUNS = 900;
for (let i = 0; i < RUNS; i++) {
  const depth = 1 + (i % 30);
  const run = generateRun(depth, 0x3c71 + i * 6151, 'warden');
  const key = `${run.biome}|${run.variant ?? 'plain'}`;
  const row = byKey.get(key);
  if (row) row.rolled++;
  // Every floor of a run must wear the same variant, or the descent reads as
  // three different places bolted together.
  if (run.levels.some((l) => (l.variant ?? 'plain') !== (run.variant ?? 'plain'))) splitRuns++;
}

console.log(
  JSON.stringify({
    runs: RUNS,
    splitRuns,
    rows: rows.sort((a, b) => a.biome.localeCompare(b.biome) || b.weight - a.weight),
  }),
);
