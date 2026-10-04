/**
 * Entry point for `tools/check-kills.mjs`.
 *
 * One kill, one event. Kills a plain monster, a Soul Bound elite (which gets
 * back up once), a splitter, and a boss, and counts what the bus hears.
 * Anything counting kills (bounties, renown, quests, run stats) trusts this.
 */
import { arena, caseLog, ofRole, type Arena } from './combat-arena';
import { Boss } from '../src/entities/Boss';
import { BOSSES } from '../src/data/bosses';
import { events } from '../src/core/Events';
import { Random } from '../src/core/RNG';
import type { Enemy } from '../src/entities/Enemy';

const { cases, check } = caseLog();
const killed: string[] = [];
const bosses: string[] = [];
events.on('enemy:killed', (p) => killed.push(p.id));
events.on('boss:killed', (p) => bosses.push(p.name));

function kill(a: Arena, e: Enemy): void {
  for (let i = 0; i < 6 && e.alive; i++) {
    e.takeDamage({ amount: e.maxLife * 5, type: 'arcane', crit: false, source: 'player' }, a.ctx);
    a.step(0.5);
  }
  a.step(1);
}

const count = (id: string): number => killed.filter((x) => x === id).length;

{
  const a = arena({ seed: 3 });
  const e = a.spawn(ofRole('melee', 1)[0]!, 0, 3);
  kill(a, e);
  check('a plain kill is heard once', count(e.id) === 1, `${count(e.id)} enemy:killed events`);
}
{
  const a = arena({ seed: 4 });
  const e = a.spawn(ofRole('melee', 1)[0]!, 0, 3, { rank: 'elite', affixes: ['soul_bound'] });
  e.takeDamage({ amount: e.maxLife * 5, type: 'arcane', crit: false, source: 'player' }, a.ctx);
  a.step(0.5);
  const afterFirst = count(e.id);
  kill(a, e);
  check(
    'Soul Bound: rising is not a kill, the real one is',
    afterFirst === 0 && count(e.id) === 1,
    `${afterFirst} after rising, ${count(e.id)} after the real kill`,
  );
}
{
  const a = arena({ seed: 5 });
  const e = a.spawn(ofRole('brute', 1)[0]!, 0, 3, { rank: 'elite', affixes: ['splitter'] });
  kill(a, e);
  const spawned = a.enemies.filter((x) => x !== e);
  for (const s of spawned) kill(a, s);
  const each = [e, ...spawned].map((x) => count(x.id));
  check('a splitter and each of its halves: once each', each.every((n) => n === 1), `${each.length} bodies, counts ${each.join(',')}`);
}
{
  const a = arena({ seed: 6 });
  const def = BOSSES[0]!;
  const boss = new Boss(def, def.minDepth + 2, new Random(6));
  boss.root.position.set(0, 0, 6);
  a.enemies.push(boss);
  boss.engage(a.ctx);
  for (let i = 0; i < 400 && boss.alive; i++) {
    // Clear the adds too: a guarded boss cannot be hurt while its guards stand.
    for (const e of a.enemies) {
      if (e !== boss && e.alive) e.takeDamage({ amount: e.maxLife * 5, type: 'arcane', crit: false, source: 'player' }, a.ctx);
    }
    boss.takeDamage({ amount: boss.maxLife * 0.12, type: 'arcane', crit: false, source: 'player' }, a.ctx);
    a.step(0.5);
  }
  const bk = bosses.filter((n) => n === def.name).length;
  check(
    'a boss kill is heard once, as a kill and as a boss',
    !boss.alive && count(boss.id) === 1 && bk === 1,
    `alive ${boss.alive}, enemy:killed ${count(boss.id)}, boss:killed ${bk}`,
  );
}

console.log(JSON.stringify({ cases }));
