/**
 * Entry point for `tools/check-themes.mjs`.
 *
 * Generates the same maps with no run theme and with each theme forced
 * (`forceRunTheme`), and checks that a theme:
 *
 *   - never makes monsters fewer or weaker: the same spawn count, the same
 *     ranks and affix counts slot for slot, and every monster legal at the
 *     depth;
 *   - moves the mix towards its favoured families in the zones it fits;
 *   - adds its own props, and leaves unfitting zones alone;
 *   - adds no sky weather under a roof.
 *
 * Also reports how often a theme rolls on its own.
 */
import './depth-catalog';
import { generateRun } from '../src/world/DungeonGen';
import { getMonster } from '../src/data/monsters';
import { RUN_THEMES, forceRunTheme, themeFits, type RunThemeId } from '../src/world/Themes';
import { weatherFor, withTheme, type WeatherKind } from '../src/world/Weather';
import { Random } from '../src/core/RNG';
import type { DungeonLevel, DungeonRun } from '../src/types';

const problems: string[] = [];
const SKY = new Set<WeatherKind>(['snow', 'rain', 'ash', 'cinders', 'grit']);

function zoneBiome(level: DungeonLevel, x: number, y: number): string {
  const zi = level.zoneOf ? level.zoneOf[y * level.width + x] ?? 0 : 0;
  return level.zones?.[zi]?.biome ?? level.biome;
}

const report: Record<string, string> = {};
const seeds: Array<[number, number]> = [];
for (const depth of [4, 12, 30, 70]) for (let s = 0; s < 5; s++) seeds.push([depth, (depth * 4441 + s * 70001 + 11) >>> 0]);

forceRunTheme(null);
const base = new Map<string, DungeonRun>();
for (const [d, seed] of seeds) base.set(`${d}:${seed}`, generateRun(d, seed, 'warden'));

for (const t of RUN_THEMES) {
  forceRunTheme(t.id as RunThemeId);
  let favBase = 0;
  let favThemed = 0;
  let fitSlots = 0;
  let themedProps = 0;
  let fitLevels = 0;
  const themeKinds = new Set(Object.values(t.dress).flatMap((p) => p.map((e) => e.kind)));
  for (const [d, seed] of seeds) {
    const a = base.get(`${d}:${seed}`)!;
    const b = generateRun(d, seed, 'warden');
    if (b.runTheme !== t.id) problems.push(`${t.id}: forced but run says ${b.runTheme}`);
    a.levels.forEach((la, li) => {
      const lb = b.levels[li]!;
      const tag = `${t.id} depth ${d} seed ${seed} area ${li}`;
      // A floor warden clears its room of monsters, and whether it finds
      // standing room there hangs on the props, which a theme changes. Its
      // room is left out on both sides; everything else must match.
      const rects = [la.warden?.rect, lb.warden?.rect].filter((r): r is { x: number; y: number; w: number; h: number } => !!r);
      const out = (s: { x: number; y: number }): boolean => rects.some((r) => s.x >= r.x && s.y >= r.y && s.x < r.x + r.w && s.y < r.y + r.h);
      const sas = la.spawns.filter((s) => !out(s));
      const sbs = lb.spawns.filter((s) => !out(s));
      if (sbs.length !== sas.length) {
        problems.push(`${tag}: ${sbs.length} monsters, ${sas.length} without the theme`);
        return;
      }
      for (let i = 0; i < sas.length; i++) {
        const sa = sas[i]!;
        const sb = sbs[i]!;
        if (sa.rank !== sb.rank || sa.affixes.length !== sb.affixes.length || sa.x !== sb.x || sa.y !== sb.y) {
          problems.push(`${tag}: slot ${i} changed rank, affixes or place`);
          break;
        }
        const def = getMonster(sb.monsterId);
        if (def && def.minDepth > d) problems.push(`${tag}: ${sb.monsterId} is below its depth (${def.minDepth})`);
        if (!themeFits(t, zoneBiome(lb, sb.x, sb.y) as never)) {
          if (sa.monsterId !== sb.monsterId) problems.push(`${tag}: slot ${i} changed in a zone the theme does not fit`);
          continue;
        }
        fitSlots++;
        const fa = getMonster(sa.monsterId)?.family;
        const fb = getMonster(sb.monsterId)?.family;
        if (fa && (t.favour[fa] ?? 1) > 1) favBase++;
        if (fb && (t.favour[fb] ?? 1) > 1) favThemed++;
      }
      let fits = false;
      for (const p of lb.props) {
        if (!themeKinds.has(p.kind)) continue;
        if (themeFits(t, zoneBiome(lb, p.x, p.y) as never)) {
          themedProps++;
          fits = true;
        }
      }
      if (fits) fitLevels++;
    });
  }
  if (fitSlots > 50 && favThemed < favBase) problems.push(`${t.id}: favoured families fell from ${favBase} to ${favThemed} of ${fitSlots}`);
  if (fitLevels === 0) problems.push(`${t.id}: its props never turned up`);
  // Weather: nothing from the sky under a roof.
  for (const z of ['crypt', 'caverns', 'swamp', 'darkForest', 'hell'] as const) {
    const r = withTheme(weatherFor(z, false, undefined, new Random(7)), t, false);
    for (const f of r.falls) if (SKY.has(f.kind)) problems.push(`${t.id}: ${f.kind} under a roof in ${z}`);
  }
  report[t.id] = `favoured ${favBase} -> ${favThemed} of ${fitSlots} slots, ${themedProps} theme props`;
}

// How often a theme rolls on its own.
forceRunTheme(undefined);
let themed = 0;
let runs = 0;
for (let s = 0; s < 60; s++) {
  const run = generateRun(10, (s * 31337 + 5) >>> 0, 'warden');
  runs++;
  if (run.runTheme) themed++;
}
report.rolled = `${themed} of ${runs} maps at tier 10`;
if (themed === 0 || themed > runs * 0.6) problems.push(`themes rolled on ${themed} of ${runs} maps`);

console.log(JSON.stringify({ report, problems: problems.slice(0, 20) }));
