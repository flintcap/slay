/**
 * Entry point for `tools/check-levels.mjs`.
 *
 * The level curve's promise (`xpForLevel` in `src/sim/Stats.ts`): a hero who
 * clears every depth once, at three quarters of each floor's monsters, stays
 * within a few levels of the depth number and reaches level 99 near depth 100.
 * The same model `tools/curve-entry.ts` uses to pick a hero's level, run with
 * the real generator, the real kill XP and the real `grantXp`.
 *
 *   1. From depth 25 on, the hero's level is between the depth minus five and
 *      the depth plus four, so the gap to the monsters (`depth * 1.05`) never
 *      grows with depth.
 *   2. Level 99 comes between depth 90 and depth 115.
 *   3. The early game is the old curve: levels 1 to 26 cost what they did.
 *   4. Every level costs more than the one before.
 */
import './depth-catalog';
import { Random } from '../src/core/RNG';
import { generateRun } from '../src/world/DungeonGen';
import { createCharacter, grantXp } from '../src/sim/Character';
import { killXp } from '../src/sim/Progression';
import { MAX_LEVEL, xpForLevel } from '../src/sim/Stats';
import { monsterLevelForDepth } from '../src/sim/Difficulty';

const problems: string[] = [];
const report: Record<string, unknown> = {};

const c = createCharacter('Climber', 'warden', new Random(3));
const at: Record<number, number> = {};
let reached99 = 0;
for (let d = 1; d <= 120 && !reached99; d++) {
  const run = generateRun(d, 1000 + d, 'warden');
  let xp = 0;
  for (const lvl of run.levels) for (const s of lvl.spawns) xp += killXp(d, s.rank);
  xp += killXp(d, 'boss');
  grantXp(c, xp * 0.75);
  at[d] = c.level;
  if (c.level >= MAX_LEVEL) reached99 = d;
  if (d >= 25 && !reached99 && (c.level < d - 5 || c.level > d + 4)) {
    problems.push(`depth ${d}: hero is level ${c.level}, outside ${d - 5} to ${d + 4}`);
  }
}
report.gap = Object.entries(at).filter(([d]) => Number(d) >= 25).map(([d, l]) => l - Number(d)).reduce((m, g) => [Math.min(m[0]!, g), Math.max(m[1]!, g)], [99, -99]).join(' to ');
report.levels = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110]
  .filter((d) => at[d] !== undefined)
  .map((d) => `d${d} L${at[d]} (monsters L${monsterLevelForDepth(d)})`)
  .join(', ');
report.level99 = reached99 ? `depth ${reached99}` : 'not by depth 120';
if (!reached99 || reached99 < 90 || reached99 > 115) problems.push(`level 99 at ${report.level99}, not between depth 90 and 115`);

for (let l = 1; l <= 26; l++) {
  const old = Math.floor(50 * l * l * Math.pow(1.06, l));
  if (xpForLevel(l) !== old) problems.push(`level ${l} costs ${xpForLevel(l)}, not the old ${old}`);
}
for (let l = 2; l < MAX_LEVEL; l++) {
  if (!(xpForLevel(l) > xpForLevel(l - 1))) problems.push(`level ${l} costs no more than level ${l - 1}`);
}

console.log(JSON.stringify({ problems, report }));
