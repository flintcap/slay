/**
 * Entry point for `tools/check-fair.mjs`: the fair-fight rules
 * (docs/remake/depth.md, Part 3, and src/sim/FairFight.ts).
 *
 *   - The ledger: one blow, and a burst of blows, take at most the cap; a
 *     hold lasts 1.5 s at most and cannot come back for 3 s.
 *   - The real hero: the same, through `Player.takeDamage`.
 *   - Every boss: heavy moves warn at least 0.8 s ahead, even enraged.
 *   - Fumbles: they cost the boss time, never hurt the hero, and hand the
 *     time back to the fight clock. The pillars blast is a fumble, and the
 *     damage timer hardens the boss instead of making it hit harder.
 *   - The fumbler: a boss whose hero gets every room rule wrong still dies,
 *     in at most twice the time, and never enrages because of it.
 */
import { arena, caseLog } from './combat-arena';
import { FairLedger, bossHitCap, HOLD_MAX, HOLD_IMMUNE, HEAVY_MUL, WARN_MIN } from '../src/sim/FairFight';
import { Boss, softEnrageAfter } from '../src/entities/Boss';
import { BOSSES } from '../src/data/bosses';
import { Player } from '../src/entities/Player';
import { createCharacter } from '../src/sim/Character';
import { getAbility } from '../src/entities/Abilities';
import { Random } from '../src/core/RNG';
import type { BossDef, DamagePacket } from '../src/types';

declare const process: { argv: string[] };
const { cases, check } = caseLog();
const trace = process.argv.includes('--trace');
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;

// --- the ledger --------------------------------------------------------------
{
  const L = new FairLedger();
  const one = L.clamp(5000, 1000, 0.3);
  check('ledger: one huge blow takes the cap', near(one, 300), `took ${one} of 1000 at a 30% cap`);
  L.tick(0.1);
  const more = L.clamp(200, 1000, 0.3);
  check('ledger: a blow in the same burst shares the cap', near(more, 0), `then took ${more}`);
  L.tick(0.7);
  const later = L.clamp(200, 1000, 0.3);
  check('ledger: a later blow has its own cap', near(later, 200), `later took ${later}`);

  const H = new FairLedger();
  const first = H.hold(4);
  check('ledger: a 4 s stun lasts 1.5 s', near(first, HOLD_MAX), `held ${first.toFixed(2)} s`);
  H.tick(1);
  const stacked = H.hold(4);
  check('ledger: a second hold mid-hold cannot pass 1.5 s in all', near(1 + stacked, HOLD_MAX), `held ${stacked.toFixed(2)} s more after 1 s`);
  H.tick(1);
  const immune = H.hold(2);
  check('ledger: no hold again for 3 s after one ends', immune === 0, `held ${immune} s, 0.5 s after the last ended`);
  H.tick(HOLD_IMMUNE);
  const again = H.hold(1);
  check('ledger: holds work again after the immunity', near(again, 1), `held ${again} s`);
  check('caps: 25% to tier 5, 30% to 15, 40% after', bossHitCap(1) === 0.25 && bossHitCap(5) === 0.25 && bossHitCap(6) === 0.3 && bossHitCap(15) === 0.3 && bossHitCap(16) === 0.4 && bossHitCap(90) === 0.4, 'tiers 1, 5, 6, 15, 16, 90');
}

// --- the real hero -----------------------------------------------------------
{
  const c = createCharacter('Fair', 'warden', new Random(3));
  const p = new Player(c, 3);
  const rng = new Random(4);
  // No luck in it: no block, no dodge, so every blow lands.
  p.stats.blockChance = 0;
  (p.stats as { dodgeChance?: number }).dodgeChance = 0;
  const full = p.stats.life;
  const blow = (amount: number, extra: Partial<DamagePacket> = {}): number =>
    p.takeDamage({ amount, type: 'arcane', crit: false, source: 'boss', ability: 'test', fair: 0.25, ...extra }, rng);
  p.life = full;
  const t1 = blow(full * 20);
  check('hero: a boss blow of twenty lives takes a quarter', t1 <= full * 0.25 + 1e-6 && p.life > 0, `took ${Math.round(t1)} of ${Math.round(full)}`);
  p.fair.tick(1);
  p.life = full;
  let sum = 0;
  for (let i = 0; i < 4; i++) sum += blow(full * 0.2);
  check('hero: four blows at once share one cap', sum <= full * 0.25 + 1e-6, `four 20% blows took ${Math.round((sum / full) * 100)}%`);
  p.fair.tick(1);
  p.life = full;
  const plain = p.takeDamage({ amount: full * 0.5, type: 'arcane', crit: false, source: 'mob', ability: 'test' }, rng);
  check('hero: blows from ordinary monsters are not capped', plain > full * 0.3, `an ordinary 50% blow took ${Math.round((plain / full) * 100)}%`);
  p.fair.tick(5);
  p.life = full;
  blow(1, { applies: [{ id: 'stunned', duration: 4, magnitude: 1 }] });
  const stun = p.statuses.find((s) => s.id === 'stunned')?.remaining ?? 0;
  check('hero: a boss stun of 4 s lasts 1.5 s', stun > 0 && stun <= HOLD_MAX + 1e-6, `stunned ${stun.toFixed(2)} s`);
}

// --- every boss: heavy moves warn ------------------------------------------
{
  const late: string[] = [];
  for (const def of BOSSES) {
    const boss = new Boss(def, def.minDepth + 2, new Random(9));
    for (const ph of def.phases) {
      for (const id of ph.abilities) {
        const a = getAbility(id);
        if (!a || a.damageMul < HEAVY_MUL || a.windup <= 0) continue;
        // Fastest the boss can swing: the soft enrage on top of everything.
        const w = (boss as unknown as { windupFor(d: typeof a, s: number): number }).windupFor(a, 1.25 * 1.35);
        if (w < WARN_MIN - 1e-6) late.push(`${def.id}:${id} ${w.toFixed(2)}s`);
      }
    }
  }
  check('bosses: every heavy move warns 0.8 s ahead, even enraged', late.length === 0, late.length ? late.slice(0, 8).join(', ') : 'all heavy moves');
}

// --- fumbles ----------------------------------------------------------------
function arenaBoss(def: BossDef, seed: number): { a: ReturnType<typeof arena>; boss: Boss } {
  const a = arena({ seed });
  const boss = new Boss(def, def.minDepth + 2, new Random(seed));
  boss.root.position.set(0, 0, 0);
  a.enemies.push(boss);
  boss.engage(a.ctx);
  return { a, boss };
}
type Inner = { fightTime: number; shield: number; setArena(k: string | null, c: unknown): void; enrageStacks: number };

{
  const def = BOSSES[0]!;
  for (const cost of ['heal', 'shield', 'hold', 'adds', 'reset'] as const) {
    const { a, boss } = arenaBoss(def, 20);
    a.step(0.5);
    boss.takeDamage({ amount: boss.maxLife * 0.05, type: 'physical', crit: false, source: 'player' }, a.ctx);
    (boss as unknown as Inner).fightTime = 60;
    const hitsBefore = a.hits.length;
    const spent = boss.fumble(cost, a.ctx);
    const clock = (boss as unknown as Inner).fightTime;
    check(`fumble ${cost}: costs time, not life, and gives the clock back`, a.hits.length === hitsBefore && spent > 0 && near(clock, 60 - spent), `${spent.toFixed(1)} s, clock 60 -> ${clock.toFixed(1)}, hits on the hero ${a.hits.length - hitsBefore}`);
  }
  {
    const { boss, a } = arenaBoss(def, 21);
    const life0 = boss.life;
    boss.takeDamage({ amount: boss.maxLife * 0.02, type: 'physical', crit: false, source: 'player' }, a.ctx);
    boss.fumble('heal', a.ctx);
    check('fumble heal: never above where the phase began', boss.life <= life0 + 1e-6, `${Math.round(boss.life)} of ${Math.round(life0)}`);
  }
}

// Pillars: missing the ring is a fumble.
{
  const def = BOSSES.find((b) => b.phases.some((p) => p.arena === 'pillars'))!;
  const { a, boss } = arenaBoss(def, 30);
  (boss as unknown as Inner).setArena('pillars', a.ctx);
  // The hero stands on the boss, outside every ring (rings sit 7 m out).
  a.hero.set(0, 0, 0);
  a.step(4);
  const blast = a.hits.find((h) => h.ability === 'arena.pillars');
  check('pillars: missing the ring wards the boss and hands the clock time', !!blast && boss.fumbles > 0 && (boss as unknown as Inner).shield > 0, `blast ${blast ? 'landed' : 'missing'}, fumbles ${boss.fumbles}, shield ${Math.round((boss as unknown as Inner).shield)}`);
}

// The damage timer hardens instead of hitting harder, and stops at six.
{
  const def = BOSSES.find((b) => b.phases.some((p) => p.arena === 'enrageTimer'))!;
  const { a, boss } = arenaBoss(def, 31);
  (boss as unknown as Inner).setArena('enrageTimer', a.ctx);
  a.hero.set(0, 0, 60);
  a.step(110);
  const stacks = (boss as unknown as Inner).enrageStacks;
  check('damage timer: no damage gain, at most six stacks', boss.buffDamageMul <= 1 + 1e-6 && stacks <= 6 && stacks > 0, `stacks ${stacks}, damage x${boss.buffDamageMul.toFixed(2)}`);
}

// The fumbler: gets the room rule wrong all fight, still wins, no enrage.
{
  const TTK = 45;
  const results: string[] = [];
  let ok = true;
  const list = BOSSES.filter((_, i) => i % 4 === 0);
  for (const def of list) {
    const run = (fumbler: boolean): { t: number; died: boolean; enraged: boolean } => {
      const { a, boss } = arenaBoss(def, 40);
      a.hero.set(0, 0, 40);
      const chunk = (boss.maxLife / TTK) * 0.5;
      let acc = 0;
      let fumbleAcc = 0;
      let t = 0;
      for (; t < 300 && boss.alive; t += 1 / 30) {
        a.step(1 / 30);
        acc += 1 / 30;
        fumbleAcc += 1 / 30;
        if (acc >= 0.5) {
          acc = 0;
          for (const e of a.enemies) if (e !== boss && e.alive) e.takeDamage({ amount: e.maxLife * 0.3, type: 'physical', crit: false, source: 'player' }, a.ctx);
          boss.takeDamage({ amount: chunk, type: 'physical', crit: false, source: 'player' }, a.ctx);
        }
        if (trace && fumbler && Math.abs(t % 10) < 1 / 30) console.error(`${def.id} t=${t.toFixed(0)} life=${(boss.life / boss.maxLife).toFixed(3)} phase=${boss.phaseIndex} shield=${Math.round((boss as unknown as Inner).shield)} fumbles=${boss.fumbles} barrier=${boss.barrierUp}`);
        // Wrong about once every ten seconds, every kind in turn.
        if (fumbler && fumbleAcc >= 10) {
          fumbleAcc = 0;
          boss.fumble((['heal', 'shield', 'hold', 'adds'] as const)[boss.fumbles % 4]!, a.ctx);
        }
      }
      return { t, died: !boss.alive, enraged: boss.softEnraged };
    };
    const clean = run(false);
    const bad = run(true);
    const fine = bad.died && bad.t <= clean.t * 2 + 1 && (!bad.enraged || clean.enraged);
    if (!fine) ok = false;
    results.push(`${def.id} ${clean.t.toFixed(0)}s/${bad.t.toFixed(0)}s${bad.enraged ? ' ENRAGED' : ''}${bad.died ? '' : ' ALIVE'}`);
  }
  const limit = softEnrageAfter(3);
  check('fumbler: wrong all fight, still wins in at most twice the time, never enraged by it', ok, `${results.join(', ')} (clock ${limit}s at 3 phases)`);
}

console.log(JSON.stringify({ cases }));
