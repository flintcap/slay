/**
 * Entry point for `tools/check-polish.mjs`.
 *
 * Map polish, headless, across depths and seeds:
 *
 *   - dead ends: a side room you walk into and back out of should hold
 *     something (monsters, a chest or a shrine, a feature, a landmark, a
 *     few breakables). Reports how many are bare; fails over 15%.
 *   - no prop stands on a bridge (often the only way over, and a deck is
 *     not ground to stand clutter on).
 *   - no prop of one zone's biome stands in another zone (seams).
 */
import './depth-catalog';
import { generateRun } from '../src/world/DungeonGen';
import { propDef } from '../src/world/Props';
import { dressingFor } from '../src/art/props/Dressing';
import { runTheme, themeFits, themedDressing } from '../src/world/Themes';
import type { DungeonLevel } from '../src/types';

const T_BRIDGE = 12;

const problems: string[] = [];
let deadEnds = 0;
let bare = 0;
let onCrossing = 0;
let crossingTag = '';
let foreign = 0;
let foreignTag = '';
const foreignKinds: Record<string, number> = {};
const bareTags: string[] = [];
const byLayout: Record<string, [number, number]> = {};

function zoneIndex(level: DungeonLevel, x: number, y: number): number {
  return level.zoneOf ? level.zoneOf[y * level.width + x] ?? 0 : 0;
}

/** Every prop kind a biome's dressing (any variant) can place. */
const kindsCache = new Map<string, Set<string>>();
function biomeKinds(biome: string, variant: string | undefined, themeId: string | undefined): Set<string> {
  const key = `${biome}|${variant ?? ''}|${themeId ?? ''}`;
  let s = kindsCache.get(key);
  if (!s) {
    const theme = runTheme(themeId);
    const base = dressingFor(biome as never, variant);
    const d = themeFits(theme, biome as never) ? themedDressing(base, `${biome}|${variant ?? ''}`, theme) : base;
    s = new Set<string>([d.wallLight]);
    for (const pool of [d.standLight, d.clutter, d.wall, d.edge, d.feature, d.landmark, d.detail, d.liquid, d.breakables]) for (const e of pool) s.add(e.kind);
    if (d.pillar) s.add(d.pillar);
    kindsCache.set(key, s);
  }
  return s;
}

for (const depth of [2, 8, 20, 45]) {
  for (let s = 0; s < 8; s++) {
    const seed = (depth * 3571 + s * 65537 + 29) >>> 0;
    const run = generateRun(depth, seed, 'warden');
    run.levels.forEach((level, li) => {
      const tag = `depth ${depth} seed ${seed} area ${li}`;
      const W = level.width;
      for (const room of level.rooms) {
        if (room.kind !== 'normal' || room.links.length !== 1) continue;
        // Only real side rooms: off the arrival and the exit.
        const inRoom = (p: { x: number; y: number }): boolean => p.x >= room.x && p.y >= room.y && p.x < room.x + room.w && p.y < room.y + room.h;
        if (inRoom(level.entry) || inRoom(level.exit)) continue;
        if (room.w * room.h < 20) continue;
        deadEnds++;
        const zi = zoneIndex(level, Math.round(room.center.x), Math.round(room.center.y));
        const layout = level.zones?.[zi]?.layout ?? level.layout;
        const bl = (byLayout[layout] ??= [0, 0]);
        bl[0]++;
        const monsters = level.spawns.some(inRoom) || (level.warden && level.warden.room === room.id);
        const props = level.props.filter(inRoom);
        const worth = props.some((p) => p.interact || propDef(p.kind).placement === 'feature' || propDef(p.kind).light);
        const lm = level.landmark?.room === room.id;
        const ev = (level.events ?? []).some((e) => inRoom(e));
        if (!monsters && !worth && !lm && !ev) {
          bare++;
          bl[1]++;
          if (bareTags.length < 6) bareTags.push(`${tag} room ${room.id} (${room.w}x${room.h}, ${layout})`);
        }
      }
      for (const p of level.props) {
        const t = level.tiles[p.y * W + p.x];
        if (t === T_BRIDGE && propDef(p.kind).placement !== 'liquid') {
          onCrossing++;
          if (!crossingTag) crossingTag = `${tag}: ${p.kind} at ${p.x},${p.y}`;
        }
        // Seams: a dressing prop that no dressing of its zone's biome holds,
        // but the other zone's does.
        if (!level.zones || level.zones.length < 2 || p.interact) continue;
        // Room-kind pieces (an ambush room's gibbets, a hoard) belong to the
        // room, whatever the biome.
        const rid = level.rooms.find((r) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h);
        if (rid && rid.kind !== 'normal') continue;
        const zi = zoneIndex(level, p.x, p.y);
        const mine = biomeKinds(level.zones[zi]!.biome, level.variant, level.runTheme);
        if (mine.has(p.kind)) continue;
        const other = level.zones.some((z, k) => k !== zi && biomeKinds(z.biome, level.variant, level.runTheme).has(p.kind));
        if (other) {
          foreign++;
          foreignKinds[p.kind] = (foreignKinds[p.kind] ?? 0) + 1;
          if (!foreignTag) foreignTag = `${tag}: ${p.kind} at ${p.x},${p.y} in ${level.zones[zi]!.biome}`;
        }
      }
    });
  }
}

const bareShare = bare / Math.max(1, deadEnds);
if (bareShare > 0.15) problems.push(`${bare} of ${deadEnds} dead ends are bare (${(bareShare * 100).toFixed(0)}%, want 15% or less): ${bareTags.join('; ')}`);
if (onCrossing > 0) problems.push(`${onCrossing} props stand on bridges (first: ${crossingTag})`);
if (foreign > 0) problems.push(`${foreign} props of one zone's biome stand in the other zone (first: ${foreignTag})`);

console.log(
  JSON.stringify({
    report: {
      deadEnds,
      bare: `${bare} (${(bareShare * 100).toFixed(1)}%)`,
      byLayout: Object.entries(byLayout)
        .map(([k, [n, b]]) => `${k} ${b}/${n}`)
        .join(', '),
      onCrossing,
      foreign: `${foreign} ${JSON.stringify(foreignKinds)}`,
    },
    problems,
  }),
);
