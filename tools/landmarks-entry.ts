/**
 * Entry point for `tools/check-landmarks.mjs`.
 *
 * Generates whole maps at several depths and seeds and checks every landmark
 * set piece (`world/Landmarks.ts`, placed by `world/Props.ts`):
 *
 *   - its heart prop stands where `level.landmark` says;
 *   - its reward (a rare chest or a shrine) is there and can be walked up
 *     to from the arrival, with blocking props treated as walls;
 *   - it is outside the boss arena and its kind fits the zone's biome.
 *
 * Reports how often an area keeps one and which ones turn up.
 */
import './depth-catalog';
import { generateRun, isWalkable } from '../src/world/DungeonGen';
import { propDef } from '../src/world/Props';
import { SET_PIECES } from '../src/world/Landmarks';
import type { DungeonLevel } from '../src/types';

const problems: string[] = [];
let areas = 0;
let kept = 0;
let rewards = 0;
let rewardsMissing = 0;
const byId: Record<string, number> = {};

/** Tiles reachable from the arrival, blocking props as walls. */
function reach(level: DungeonLevel): Uint8Array {
  const W = level.width;
  const H = level.height;
  const blocked = new Uint8Array(W * H);
  for (const p of level.props) if (propDef(p.kind).blocks) blocked[p.y * W + p.x] = 1;
  const seen = new Uint8Array(W * H);
  const q: number[] = [level.entry.y * W + level.entry.x];
  seen[q[0]!] = 1;
  while (q.length) {
    const c = q.pop()!;
    const x = c % W;
    const y = (c / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (seen[n] || blocked[n] || !isWalkable(level, nx, ny)) continue;
      seen[n] = 1;
      q.push(n);
    }
  }
  return seen;
}

for (const depth of [1, 4, 9, 18, 40, 90]) {
  for (let s = 0; s < 12; s++) {
    const seed = (depth * 7919 + s * 104729 + 17) >>> 0;
    const run = generateRun(depth, seed, 'warden');
    run.levels.forEach((level, li) => {
      areas++;
      const lm = level.landmark;
      if (!lm) return;
      kept++;
      byId[lm.id] = (byId[lm.id] ?? 0) + 1;
      const tag = `depth ${depth} seed ${seed} area ${li} ${lm.id}`;
      const sp = SET_PIECES.find((p) => p.id === lm.id);
      if (!sp) {
        problems.push(`${tag}: unknown set piece`);
        return;
      }
      const heart = level.props.find((p) => p.x === lm.x && p.y === lm.y && p.kind === sp.heart);
      if (!heart) problems.push(`${tag}: no ${sp.heart} at its heart`);
      const zi = level.zoneOf ? level.zoneOf[lm.y * level.width + lm.x] ?? 0 : 0;
      const biome = level.zones?.[zi]?.biome ?? level.biome;
      if (!sp.biomes.includes(biome)) problems.push(`${tag}: does not belong in ${biome}`);
      const ar = level.arena;
      if (ar && lm.x >= ar.x && lm.y >= ar.y && lm.x < ar.x + ar.w && lm.y < ar.y + ar.h) problems.push(`${tag}: inside the arena`);
      if (sp.reward === 'none') return;
      rewards++;
      const near = (p: { x: number; y: number }): boolean => Math.max(Math.abs(p.x - lm.x), Math.abs(p.y - lm.y)) <= 4;
      const prize = level.props.find((p) => near(p) && (sp.reward === 'chest' ? p.interact === 'chest.rare' : p.interact?.startsWith('shrine.')));
      if (!prize) {
        rewardsMissing++;
        return;
      }
      const seen = reach(level);
      let ok = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = prize.x + dx;
        const ny = prize.y + dy;
        if (nx >= 0 && ny >= 0 && nx < level.width && ny < level.height && seen[ny * level.width + nx]) ok = true;
      }
      if (!ok) problems.push(`${tag}: its ${sp.reward} cannot be reached`);
    });
  }
}

const rate = kept / Math.max(1, areas);
if (rate < 0.15 || rate > 0.5) problems.push(`landmarks in ${(rate * 100).toFixed(0)}% of areas (want 15 to 50%)`);
if (rewardsMissing > rewards * 0.1) problems.push(`${rewardsMissing} of ${rewards} rewards failed to place`);
for (const sp of SET_PIECES) if (!byId[sp.id]) problems.push(`${sp.id} never turned up`);

console.log(
  JSON.stringify({
    report: {
      areas,
      landmarks: kept,
      share: `${(rate * 100).toFixed(1)}%`,
      rewards: `${rewards - rewardsMissing}/${rewards}`,
      byId: JSON.stringify(byId),
    },
    problems: problems.slice(0, 20),
  }),
);
