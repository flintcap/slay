/**
 * SLAY — map inks for zones and the remake's tile kinds.
 *
 * The minimap (HUD.ts) and the full map (MapPanel.ts) both tint ground by the
 * zone it belongs to, so the seam between two zones of one area reads on the
 * chart. They also colour the tile kinds the map remake added. Kept here so
 * the two charts agree.
 */

import type { DungeonLevel } from '../types';
import { BIOMES } from '../world/DungeonGen';

export const T_RUIN = 10;
export const T_DEEP_WATER = 11;
export const T_BRIDGE = 12;
export const T_ICE = 13;

const cache = new WeakMap<DungeonLevel, Map<string, string[]>>();

/**
 * One ground colour per zone of `level`: `base` (r, g, b) leaned toward each
 * zone's biome accent by `lean`. One zone, or none, gives just the base.
 */
export function zoneInks(level: DungeonLevel, base: [number, number, number], alpha: number, lean = 0.28): string[] {
  const key = `${base.join(',')}|${alpha}|${lean}`;
  let byKey = cache.get(level);
  if (!byKey) {
    byKey = new Map();
    cache.set(level, byKey);
  }
  const hit = byKey.get(key);
  if (hit) return hit;
  const plain = `rgba(${base[0]},${base[1]},${base[2]},${alpha})`;
  const zones = level.zones ?? [];
  const out =
    zones.length <= 1
      ? [plain]
      : zones.map((z) => {
          const accent = BIOMES.find((b) => b.id === z.biome)?.accentColor;
          if (accent === undefined) return plain;
          const ar = (accent >> 16) & 255;
          const ag = (accent >> 8) & 255;
          const ab = accent & 255;
          const mix = (a: number, b: number): number => Math.round(a * (1 - lean) + b * lean);
          return `rgba(${mix(base[0], ar)},${mix(base[1], ag)},${mix(base[2], ab)},${alpha})`;
        });
  byKey.set(key, out);
  return out;
}

/** Ground ink for one tile index: its zone's colour. */
export function zoneInkAt(level: DungeonLevel, inks: string[], idx: number): string {
  if (inks.length === 1 || !level.zoneOf) return inks[0]!;
  return inks[level.zoneOf[idx] ?? 0] ?? inks[0]!;
}

/** Colours for the remake's tile kinds, or null for the older ones. */
export function newKindInk(t: number): string | null {
  switch (t) {
    case T_RUIN:
      return 'rgba(74,62,50,0.92)';
    case T_DEEP_WATER:
      return 'rgba(26,52,86,0.85)';
    case T_BRIDGE:
      return 'rgba(132,96,58,0.85)';
    case T_ICE:
      return 'rgba(170,206,226,0.7)';
    default:
      return null;
  }
}

/**
 * What the charts mark: each way on (gold), the boss arena's gate (red), the
 * town waypoint (a gold ring) and where you arrived (blue). Used by the
 * minimap (HUD.ts) and the full map (MapPanel.ts).
 */
export function wayMarks(level: DungeonLevel): Array<[number, number, string, 'down' | 'up' | 'gate' | 'ring']> {
  const marks: Array<[number, number, string, 'down' | 'up' | 'gate' | 'ring']> = [];
  if (level.exits?.length) {
    for (const ex of level.exits) if (ex.to !== 'town') marks.push([ex.x, ex.y, '#ffd66b', 'down']);
  } else if (level.exit && !level.isBossLevel) {
    marks.push([level.exit.x, level.exit.y, '#ffd66b', 'down']);
  }
  if (level.arena) marks.push([level.arena.gate.x, level.arena.gate.y, '#ff6a4d', 'gate']);
  if (level.waypoint) marks.push([level.waypoint.x, level.waypoint.y, '#ffc861', 'ring']);
  if (level.entry) marks.push([level.entry.x, level.entry.y, '#7fb0ff', 'up']);
  return marks;
}
