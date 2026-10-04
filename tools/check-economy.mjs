/**
 * The systems half of balance: what a descent pays against what the camp
 * charges, the level curve against the monsters, and loot against depth.
 *
 *   node tools/check-economy.mjs
 *
 * See `tools/economy-entry.ts`.
 */
import { runEntry, finish } from './depth-ssr.mjs';

const r = await runEntry('economy');
const pad = (s, n) => String(s).padStart(n);
for (const [cls, list] of Object.entries(r.rows)) {
  console.log(`\n${cls}`);
  console.log('  depth  lvl  mlvl     gold  gamble reforge  imbue  usable  avgValue  items');
  for (const x of list) {
    console.log(
      `  ${pad(x.depth, 5)} ${pad(x.level, 4)} ${pad(x.monsterLevel, 5)} ${pad(x.gold, 8)} ${pad(x.gamble, 7)} ${pad(x.reforge, 7)} ${pad(x.imbue, 6)} ${pad(x.usable, 7)} ${pad(x.avgValue, 9)}  ${JSON.stringify(x.items)}`,
    );
  }
}
finish(r.problems, 'a descent pays for the camp, levels keep pace, and loot improves with depth.');
