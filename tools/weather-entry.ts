/**
 * Entry point for `tools/check-weather.mjs`.
 *
 * Runs `world/Weather.ts` against a stand-in particle system on real
 * generated levels, and checks:
 *
 *   - nothing that falls from the sky is rolled under a roof (the frozen
 *     vault's rime is the one exception);
 *   - every layer scales with quality (more than two per emit: the kit never
 *     thins a one- or two-sprite layer);
 *   - what it asks for per second stays inside a fair share of the field;
 *   - the biomes meant to have weather get it: snow, rain, ash and drips all
 *     turn up somewhere (fog banks were taken out with the fog).
 */
import './depth-catalog';
import { generateRun } from '../src/world/DungeonGen';
import { Random } from '../src/core/RNG';
import { Weather, weatherFor, type WeatherFx, type WeatherKind } from '../src/world/Weather';
import { BIOMES } from '../src/world/Biomes';
import type { Layer } from '../src/fx/kit/Emitters';

const problems: string[] = [];
const SKY = new Set<WeatherKind>(['snow', 'rain', 'ash', 'cinders', 'grit']);
const seenKinds = new Set<WeatherKind>();

// Recipes: every biome, under sky and under a roof, a few rolls each.
for (const b of BIOMES) {
  for (const outdoor of [true, false]) {
    for (let s = 0; s < 8; s++) {
      const r = weatherFor(b.id, outdoor, undefined, new Random(s * 977 + 3));
      for (const f of r.falls) {
        seenKinds.add(f.kind);
        if (!outdoor && SKY.has(f.kind) && !(b.id === 'frostvault' && f.kind === 'snow')) problems.push(`${b.id} indoors: ${f.kind} falls under a roof`);
        if (!(f.rate > 0)) problems.push(`${b.id}: ${f.kind} has rate ${f.rate}`);
      }
      if (r.wind < 0 || r.wind > 1) problems.push(`${b.id}: wind ${r.wind}`);
    }
  }
}
for (const k of ['snow', 'rain', 'ash', 'drip'] as WeatherKind[]) if (!seenKinds.has(k)) problems.push(`${k} never turns up`);

// Running: count what a level asks the particle system for.
let peak = 0;
let peakTag = '';
let levels = 0;
let withWeather = 0;
const thin = new Set<number>();
for (const depth of [1, 9, 30]) {
  for (let s = 0; s < 6; s++) {
    const seed = (depth * 6007 + s * 92821 + 5) >>> 0;
    const run = generateRun(depth, seed, 'warden');
    for (const level of run.levels) {
      levels++;
      let asked = 0;
      const fx: WeatherFx = {
        rng: new Random(seed ^ 0x5eed),
        emit: (layer: Layer, _school, _x, y, _z, _o, mul = 1) => {
          if (layer.count <= 2) thin.add(layer.sprite);
          if (!Number.isFinite(y)) problems.push(`depth ${depth} seed ${seed}: emit at y ${y}`);
          asked += layer.count * mul;
        },
      };
      const w = new Weather(fx, level);
      if (w.kinds().length > 0) withWeather++;
      // Walk the hero through every zone for 4 s each.
      const zones = level.zones && level.zones.length > 0 ? level.zones : null;
      const stops = zones ? zones.map((z) => ({ x: z.bounds.x + (z.bounds.w >> 1), y: z.bounds.y + (z.bounds.h >> 1) })) : [level.entry];
      let t = 0;
      for (const p of stops) {
        asked = 0;
        for (let f = 0; f < 240; f++) {
          t += 1 / 60;
          w.update(1 / 60, t, p.x * 2, 0, p.y * 2, p.x, p.y);
        }
        // Per second at full quality, over the last 4 s (eased in by then).
        const perSec = asked / 4;
        if (perSec > peak) {
          peak = perSec;
          peakTag = `depth ${depth} seed ${seed} ${level.biome}`;
        }
      }
    }
  }
}
for (const s of thin) problems.push(`a weather layer (sprite ${s}) has two or fewer per emit, so quality never thins it`);
// A 32k field at high quality; weather may take about a tenth of it in
// flight. Rain lives about half a second, so 600 a second is ~300 alive.
if (peak > 600) problems.push(`weather asks for ${peak.toFixed(0)} particles a second (${peakTag}), over 600`);

console.log(
  JSON.stringify({
    report: {
      kinds: [...seenKinds].sort().join(', '),
      levels,
      withWeather,
      peakPerSec: `${peak.toFixed(0)} (${peakTag})`,
    },
    problems: problems.slice(0, 20),
  }),
);
