/**
 * Entry point for `tools/check-bosssys.mjs`: the boss systems of the depth
 * plan (docs/remake/depth.md, Part 3).
 *
 *   - Sizes: every boss has one, and the resized ones keep their old reach.
 *   - Profiles: data without its own numbers takes them from its profile, and
 *     a duelist hits harder and dies faster than a sponge of the same tier.
 *   - Picking: a life does not meet a boss twice while another fits, and the
 *     account's least-fought bosses come up more.
 *   - Moods: none before tier 15; each one does what its card says.
 */
import { arena, caseLog } from './combat-arena';
import { BOSSES, BOSS_MOODS, MOOD_FROM, bossNumbers, bossSize, pickBossForDepth, rollBossMood, withMood } from '../src/data/bosses';
import { Boss } from '../src/entities/Boss';
import { bossHeight } from '../src/art/creatures/LookBoss';
import { Random, streamFor } from '../src/core/RNG';
import { WARDENS, pickWarden } from '../src/data/wardens';
import { ABILITIES } from '../src/entities/Abilities';
import { MONSTERS } from '../src/data/monsters';
import { generateRun, isWalkable, setMonsterCatalog } from '../src/world/DungeonGen';
import type { BossDef, BossMood, BossSize } from '../src/types';

declare const process: { argv: string[] };
const { cases, check } = caseLog();

// --- sizes -------------------------------------------------------------------
{
  const count: Record<BossSize, number> = { person: 0, tall: 0, large: 0, giant: 0 };
  for (const b of BOSSES) count[bossSize(b)]++;
  check('sizes: person, tall, large and giant all exist', count.person >= 3 && count.tall >= 5 && count.large >= 1 && count.giant >= 1, JSON.stringify(count));
  const h = (k: number): string => bossHeight(k).toFixed(2);
  check('sizes: heights rise with scale', bossHeight(1.1) < bossHeight(1.6) && bossHeight(1.6) < bossHeight(2.4) && bossHeight(2.4) < bossHeight(3.6) && bossHeight(1.1) <= 2.35, `1.1 ${h(1.1)} m, 1.6 ${h(1.6)} m, 2.4 ${h(2.4)} m, 3.6 ${h(3.6)} m`);
  const lost: string[] = [];
  for (const b of BOSSES) {
    if (b.reach === undefined) continue;
    const boss = new Boss(b, b.minDepth + 2, new Random(5));
    const want = b.reach * (boss.sizeScale / b.scale);
    if (Math.abs(boss.reach - want) > 1e-6 || boss.reach < boss.sizeScale) lost.push(b.id);
  }
  check('sizes: a smaller boss keeps its old reach', lost.length === 0, lost.length ? lost.join(', ') : `${BOSSES.filter((b) => b.reach !== undefined).length} resized`);
}

// --- profiles ---------------------------------------------------------------
{
  const base: BossDef = { ...BOSSES[0]!, lifeMul: undefined, damageMul: undefined, minDepth: 10 };
  const duel = bossNumbers({ ...base, profile: 'duelist' });
  const sponge = bossNumbers({ ...base, profile: 'sponge' });
  const bulwark = bossNumbers({ ...base, profile: 'bulwark' });
  check('profiles: a duelist hits harder and dies faster than a sponge', duel.damage > sponge.damage * 2 && duel.life * 4 < sponge.life, `duelist life ${duel.life.toFixed(2)} dmg ${duel.damage.toFixed(2)}, sponge life ${sponge.life.toFixed(2)} dmg ${sponge.damage.toFixed(2)}`);
  check('profiles: a bulwark is the best armoured', bulwark.defense > duel.defense && bulwark.defense > sponge.defense, `bulwark x${bulwark.defense}`);
  const deep = bossNumbers({ ...base, profile: 'bruiser', minDepth: 30 });
  const shallow = bossNumbers({ ...base, profile: 'bruiser', minDepth: 2 });
  check('profiles: deeper bosses climb, life faster than damage', deep.life / shallow.life > deep.damage / shallow.damage && deep.damage > shallow.damage, `tier 2 -> 30: life x${(deep.life / shallow.life).toFixed(2)}, damage x${(deep.damage / shallow.damage).toFixed(2)}`);
  const kept = BOSSES.filter((b) => b.lifeMul !== undefined).every((b) => bossNumbers(b).life === b.lifeMul && bossNumbers(b).damage === b.damageMul);
  check('profiles: bosses with their own numbers keep them', kept, 'the first 24');
}

// --- picking ----------------------------------------------------------------
{
  const depth = 12;
  const biome = 'crypt' as const;
  const met: string[] = [];
  const seen: Record<string, number> = {};
  const order: string[] = [];
  const rng = streamFor(7, 'pick');
  const pool = BOSSES.filter((b) => !b.warden && b.minDepth <= depth);
  for (let i = 0; i < pool.length; i++) {
    const id = pickBossForDepth(depth, biome, rng, { met, seen }).id;
    order.push(id);
    met.push(id);
    seen[id] = (seen[id] ?? 0) + 1;
  }
  const repeats = order.length - new Set(order).size;
  check('picking: one life meets every boss of its depth before any twice', repeats === 0, `${order.length} runs, ${repeats} repeats`);
  // Account memory: one boss fought a lot comes up much less than the rest.
  const heavy = pool[0]!.id;
  const tally = { heavy: 0, other: 0 };
  const r2 = streamFor(11, 'seen');
  const counts: Record<string, number> = {};
  for (const b of pool) counts[b.id] = 0;
  counts[heavy] = 6;
  for (let i = 0; i < 4000; i++) {
    const id = pickBossForDepth(depth, biome, r2, { met: [], seen: counts }).id;
    if (id === heavy) tally.heavy++;
    else tally.other++;
  }
  const fair = 4000 / pool.length;
  check('picking: a boss fought often comes up less', tally.heavy < fair * 0.5, `fought 6 times more: ${tally.heavy} of 4000 (an even share is ${Math.round(fair)})`);
  const plain = pickBossForDepth(depth, biome, streamFor(3, 'x')).id;
  const same = pickBossForDepth(depth, biome, streamFor(3, 'x'), { met: [], seen: {} }).id;
  check('picking: an empty memory changes nothing', plain === same, plain);
}

// --- moods ------------------------------------------------------------------
{
  const def = BOSSES.find((b) => (b.adds?.length ?? 0) > 0 && b.minDepth <= 10)!;
  let early = 0;
  let late = 0;
  const hist: Record<string, number> = {};
  for (let s = 0; s < 400; s++) {
    if (rollBossMood(def, MOOD_FROM - 1, new Random(s))) early++;
    const m = rollBossMood(def, 30, new Random(s));
    if (m) {
      late++;
      hist[m] = (hist[m] ?? 0) + 1;
    }
  }
  check('moods: none before tier 15, every boss by tier 30', early === 0 && late === 400, `tier 14: ${early}/400, tier 30: ${late}/400`);
  check('moods: all five come up', Object.keys(BOSS_MOODS).every((m) => (hist[m] ?? 0) > 40), JSON.stringify(hist));
  const noAdds = BOSSES.find((b) => !(b.adds?.length));
  if (noAdds) {
    let haunted = 0;
    for (let s = 0; s < 300; s++) if (rollBossMood(noAdds, 30, new Random(s)) === 'haunted') haunted++;
    check('moods: a boss with no adds is never haunted', haunted === 0, `${noAdds.id}: ${haunted}`);
  }

  const make = (mood: BossMood | null): Boss => new Boss(def, 20, new Random(9), mood);
  const plain = make(null);
  const wounded = make('wounded');
  check('wounded: less life', Math.abs(wounded.maxLife / plain.maxLife - 0.7) < 0.01, `${Math.round(wounded.maxLife)} of ${Math.round(plain.maxLife)}`);
  const crowned = withMood(def, 'crowned');
  check('crowned: one more phase, last', crowned.phases.length === def.phases.length + 1 && crowned.phases[crowned.phases.length - 1]!.atLife < def.phases[def.phases.length - 1]!.atLife, `${def.phases.length} -> ${crowned.phases.length} phases`);
  const ancient = make('ancient');
  check('ancient: bigger, slower, more life', ancient.sizeScale > plain.sizeScale * 1.15 && ancient.maxLife > plain.maxLife * 1.35 && (ancient as unknown as { buffMul(k: string): number }).buffMul('speed') < 1, `size x${(ancient.sizeScale / plain.sizeScale).toFixed(2)}, life x${(ancient.maxLife / plain.maxLife).toFixed(2)}, speed x${(ancient as unknown as { buffMul(k: string): number }).buffMul('speed').toFixed(2)}`);

  // Wounded hits harder: phase damage times 1.25, through a fight.
  {
    const a = arena({ seed: 50 });
    const b = make('wounded');
    a.enemies.push(b);
    b.engage(a.ctx);
    const p0 = make(null);
    const a2 = arena({ seed: 50 });
    a2.enemies.push(p0);
    p0.engage(a2.ctx);
    check('wounded: hits a quarter harder', Math.abs(b.outgoingMul / p0.outgoingMul - 1.25) < 1e-6, `x${(b.outgoingMul / p0.outgoingMul).toFixed(2)}`);
  }
  // Hungry: heals on a landed blow, at most once a second, never past full.
  {
    const a = arena({ seed: 51 });
    const b = make('hungry');
    a.enemies.push(b);
    b.engage(a.ctx);
    b.takeDamage({ amount: b.maxLife * 0.1, type: 'physical', crit: false, source: 'player' }, a.ctx);
    a.step(1.5);
    const before = b.life;
    b.landed(100);
    const fed = b.life - before;
    b.landed(100);
    const twice = b.life - before;
    check('hungry: heals when it hurts you, once a second', fed > 0 && Math.abs(twice - fed) < 1e-6, `+${Math.round(fed)} life, second blow +${Math.round(twice - fed)}`);
    const full = make('hungry');
    full.landed(100);
    check('hungry: never past full', full.life <= full.maxLife, `${Math.round(full.life)} of ${Math.round(full.maxLife)}`);
  }
  // Haunted: an add it calls rises once after dying. Compared with the same
  // fight unhaunted, so anything else that spawns counts the same in both.
  {
    const run = (mood: BossMood | null): { called: number; first: number; second: number } => {
      const a = arena({ seed: 52 });
      const b = make(mood);
      a.enemies.push(b);
      b.engage(a.ctx);
      a.hero.set(0, 0, 50);
      b.fumble('adds', a.ctx);
      const called = a.enemies.length - 1;
      const killAll = (): void => {
        for (const e of a.enemies) if (e !== b && e.alive) e.takeDamage({ amount: e.maxLife * 10, type: 'physical', crit: false, source: 'player' }, a.ctx);
      };
      killAll();
      const n0 = a.enemies.length;
      a.step(4);
      const first = a.enemies.length - n0;
      killAll();
      const n1 = a.enemies.length;
      a.step(4);
      return { called, first, second: a.enemies.length - n1 };
    };
    const h = run('haunted');
    const p = run(null);
    // In the second wave only what the boss itself called since (p.first of
    // them, in both fights) rises; the risen stay down.
    const twice = h.second - p.second - p.first;
    check('haunted: fallen adds rise once, and only once', h.called > 0 && h.first - p.first === h.called && twice === 0, `${h.called} called, ${h.first - p.first} rose, ${twice} rose twice`);
  }
}

// --- wardens ----------------------------------------------------------------
{
  const abil = new Set(ABILITIES.map((a) => a.id));
  const mons = new Set(MONSTERS.map((m) => m.id));
  const bad: string[] = [];
  for (const w of WARDENS) {
    if (!w.warden) bad.push(`${w.id}: not marked a warden`);
    if (bossSize(w) !== 'person' && bossSize(w) !== 'tall') bad.push(`${w.id}: ${bossSize(w)}`);
    if (w.phases.length > 2) bad.push(`${w.id}: ${w.phases.length} phases`);
    for (const ph of w.phases) for (const a of ph.abilities) if (!abil.has(a)) bad.push(`${w.id}: no ability ${a}`);
    for (const a of w.adds ?? []) if (!mons.has(a)) bad.push(`${w.id}: no monster ${a}`);
  }
  check('wardens: sixteen, small, short, and sound', WARDENS.length === 16 && bad.length === 0, bad.length ? bad.slice(0, 6).join('; ') : `${WARDENS.length} wardens`);
  const asBoss = { ...WARDENS[0]!, warden: false };
  const share = bossNumbers(WARDENS[0]!).life / bossNumbers(asBoss).life;
  check('wardens: a third of a boss of the same kind', share > 0.25 && share < 0.4, `life share ${share.toFixed(2)}`);
  const picked = new Set<string>();
  for (let s = 0; s < 300; s++) {
    const id = pickBossForDepth(40, 'crypt', new Random(s)).id;
    if (WARDENS.some((w) => w.id === id)) picked.add(id);
  }
  check('wardens: never picked as a run\'s boss', picked.size === 0, picked.size ? [...picked].join(', ') : 'none in 300 picks');
  let early = 0;
  for (let s = 0; s < 200; s++) {
    const w = pickWarden(3, 'crypt', new Random(s));
    if (w && w.minDepth > 3) early++;
  }
  check('wardens: none before its tier', early === 0, `${early} too early`);

  // Placement: about a third of the floors that are not the boss's.
  setMonsterCatalog({ wardenFor: (depth, biome, rng) => pickWarden(depth, biome, rng)?.id ?? null });
  let floors = 0;
  let kept = 0;
  const wrong: string[] = [];
  for (let seed = 1; seed <= 24; seed++) {
    const run = generateRun(4 + (seed % 9), seed * 7919, 'warden');
    for (const lv of run.levels) {
      if (lv.isBossLevel) {
        if (lv.warden) wrong.push(`seed ${seed}: warden on the boss floor`);
        continue;
      }
      floors++;
      const w = lv.warden;
      if (!w) continue;
      kept++;
      const r = w.rect;
      const inRoom = (x: number, y: number): boolean => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
      if (!isWalkable(lv, w.x, w.y) || !inRoom(w.x, w.y)) wrong.push(`seed ${seed}: warden off its room`);
      if (!lv.props.some((p) => p.interact === 'chest.warden' && inRoom(p.x, p.y))) wrong.push(`seed ${seed}: no warden chest`);
      if (lv.spawns.some((sp) => inRoom(sp.x, sp.y))) wrong.push(`seed ${seed}: a pack in the warden's room`);
      if (inRoom(lv.entry.x, lv.entry.y) || inRoom(lv.exit.x, lv.exit.y)) wrong.push(`seed ${seed}: warden room on a way through`);
    }
  }
  const rate = kept / Math.max(1, floors);
  check('wardens: about one floor in three', rate > 0.18 && rate < 0.45, `${kept} of ${floors} floors (${Math.round(rate * 100)}%)`);
  check('wardens: in a side room, with a chest, alone', wrong.length === 0, wrong.length ? wrong.slice(0, 4).join('; ') : `${kept} rooms`);
  setMonsterCatalog({});
}

console.log(JSON.stringify({ cases }));
