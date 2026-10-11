/**
 * Entry point for `tools/check-dressing.mjs`: generates real runs and looks at
 * what each zone was dressed with.
 */
import { generateRun } from '../src/world/DungeonGen';
import { propDef } from '../src/world/Props';
import { isOutdoorBiome } from '../src/world/Biomes';
import { T_RUIN } from '../src/world/Layouts';
import { dressingFor } from '../src/art/props/Dressing';
import type { BiomeId, DungeonLevel, PropPlacement } from '../src/types';

interface BiomeRow {
  biome: string;
  outdoor: boolean;
  zones: number;
  floor: number;
  lights: number;
  clutter: number;
  detail: number;
  wall: number;
  /** Zones that ended up with no light at all. */
  dark: number;
  kinds: Record<string, number>;
}

const rows = new Map<string, BiomeRow>();
const fails: string[] = [];
const warns: string[] = [];
/** Props maps plants after dressing (event props, a guaranteed chest). */
const planted = new Set(['chest', 'shrine', 'bonepile', 'altar', 'barrel', 'crate', 'urn']);

function zoneOf(level: DungeonLevel, x: number, y: number): number {
  if (!level.zoneOf || !level.zones || level.zones.length < 2) return 0;
  return level.zoneOf[y * level.width + x] ?? 0;
}

function zoneBiome(level: DungeonLevel, z: number): { biome: BiomeId; outdoor: boolean } {
  const zone = level.zones?.[z];
  return zone ? { biome: zone.biome, outdoor: zone.outdoor } : { biome: level.biome, outdoor: isOutdoorBiome(level.biome) };
}

/** The tile a wall prop hangs on, from its rotation (see `wallRuns`). */
function wallTile(p: PropPlacement): [number, number] {
  const r = ((p.rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (Math.abs(r) < 0.1 || Math.abs(r - Math.PI * 2) < 0.1) return [p.x, p.y - 1];
  if (Math.abs(r - Math.PI) < 0.1) return [p.x, p.y + 1];
  if (Math.abs(r - Math.PI / 2) < 0.1) return [p.x - 1, p.y];
  return [p.x + 1, p.y];
}

let levels = 0;
for (const depth of [1, 2, 4, 7, 11, 16, 24]) {
  for (let s = 0; s < 4; s++) {
    const run = generateRun(depth, (depth * 6151 + s * 92821) >>> 0, 'warden');
    for (const level of run.levels) {
      levels++;
      const nz = Math.max(1, level.zones?.length ?? 1);
      const lit = new Array<number>(nz).fill(0);
      const floorOf = new Array<number>(nz).fill(0);
      for (let i = 0; i < level.tiles.length; i++) {
        const v = level.tiles[i]!;
        if (v === 1 || v === 9) floorOf[zoneOf(level, i % level.width, (i / level.width) | 0)]!++;
      }
      for (let z = 0; z < nz; z++) {
        const { biome, outdoor } = zoneBiome(level, z);
        const key = `${biome}${outdoor ? ' (out)' : ''}`;
        let r = rows.get(key);
        if (!r) {
          r = { biome: key, outdoor, zones: 0, floor: 0, lights: 0, clutter: 0, detail: 0, wall: 0, dark: 0, kinds: {} };
          rows.set(key, r);
        }
        r.zones++;
        r.floor += floorOf[z]!;
      }
      let vaults = 0;
      let levers = 0;
      for (const p of level.props) {
        const def = propDef(p.kind);
        const z = zoneOf(level, p.x, p.y);
        const { biome, outdoor } = zoneBiome(level, z);
        const r = rows.get(`${biome}${outdoor ? ' (out)' : ''}`)!;
        r.kinds[p.kind] = (r.kinds[p.kind] ?? 0) + 1;
        if (def.light) {
          r.lights++;
          lit[z]!++;
        }
        if (def.placement === 'detail') r.detail++;
        else if (def.placement === 'wall') r.wall++;
        else r.clutter++;
        if (def.placement === 'wall' && outdoor) {
          const [wx, wy] = wallTile(p);
          const v = level.tiles[wy * level.width + wx];
          if (v !== T_RUIN) fails.push(`depth ${depth} ${biome}: ${p.kind} hangs on open ground at ${p.x},${p.y} (tile ${v})`);
        }
        if (p.interact === 'chest.vault') vaults++;
        if (p.interact === 'lever.vault') levers++;
        if (p.interact?.startsWith('chest.')) {
          const want = p.interact === 'chest.vault' ? 'chestVault' : p.interact === 'chest.rare' ? 'chestRare' : 'chest';
          if (p.kind !== want && !(p.kind === 'chest' && p.interact !== 'chest.vault')) fails.push(`depth ${depth}: ${p.interact} drawn as ${p.kind}`);
          if (p.kind === 'chest' && p.interact === 'chest.rare') warns.push(`chest.rare drawn as a plain chest (planted after dressing)`);
        }
        const names = (variant?: string): boolean => {
          const d = dressingFor(biome, variant);
          return (
            p.kind === d.wallLight ||
            p.kind === d.pillar ||
            [d.standLight, d.clutter, d.wall, d.edge, d.feature, d.landmark, d.detail, d.liquid, d.breakables].some((pool) => pool.some((e) => e.kind === p.kind))
          );
        };
        const fixed = p.interact || p.kind.startsWith('chest') || p.kind.endsWith('Seal') || ['candleCluster', 'goldHoard', 'gibbet', 'lever', 'bookcase', 'brazier'].includes(p.kind);
        if (!fixed && !planted.has(p.kind) && !names(level.variant)) {
          if (names(undefined)) warns.push(`variant dressing not applied: level.variant is set after placeProps (DungeonGen)`);
          else warns.push(`${biome}: ${p.kind} is not in its dressing`);
        }
      }
      if (vaults > levers) fails.push(`depth ${depth}: ${vaults} vault chest(s) but ${levers} lever(s): barred for ever`);
      for (let z = 0; z < nz; z++) {
        if (floorOf[z]! < 60) continue;
        if (lit[z] === 0) {
          const { biome, outdoor } = zoneBiome(level, z);
          rows.get(`${biome}${outdoor ? ' (out)' : ''}`)!.dark++;
        }
      }
    }
  }
}

console.log(JSON.stringify({ levels, rows: [...rows.values()], fails, warns: [...new Set(warns)] }));
