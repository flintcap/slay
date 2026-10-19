/**
 * Entry point for `tools/check-status.mjs`.
 *
 * One rule book for statuses: every catalogue entry is put on a hero and on a
 * real monster the same way, and the two must agree on the name it lands
 * under, its stacks, its time, its strength and its damage per second. Holds
 * must fade the same on both, and a poison that kills the hero must name the
 * monster that gave it.
 */
import { arena, caseLog, ofRole } from './combat-arena';
import { StatusContainer } from '../src/sim/Status';
import { STATUSES } from '../src/data/statuses';
import { isHold } from '../src/sim/StatusRules';
import type { Enemy } from '../src/entities/Enemy';
import type { StatusApplication } from '../src/types';

const { cases, check } = caseLog();
const melee = ofRole('melee', 1)[0]!;

interface Seen {
  stacks: number;
  time: number;
  magnitude: number;
  dps: number;
}

const onHero = (h: StatusContainer, id: string): Seen | null => {
  const s = h.get(id);
  return s ? { stacks: s.stacks, time: s.remaining, magnitude: s.magnitude, dps: s.dotPerSecond } : null;
};
const onMonster = (e: Enemy, id: string): Seen | null => {
  const s = (e as unknown as { statuses: Array<{ id: string; stacks: number; time: number; magnitude: number; dotPerSecond: number }> }).statuses.find(
    (x) => x.id === id,
  );
  return s ? { stacks: s.stacks, time: s.time, magnitude: s.magnitude, dps: s.dotPerSecond } : null;
};
const same = (a: Seen | null, b: Seen | null): boolean =>
  !!a &&
  !!b &&
  a.stacks === b.stacks &&
  Math.abs(a.time - b.time) < 1e-6 &&
  Math.abs(a.magnitude - b.magnitude) < 1e-6 &&
  Math.abs(a.dps - b.dps) <= 1e-6 * Math.max(1, a.dps);
const show = (s: Seen | null): string => (s ? `${s.stacks}x ${s.time.toFixed(2)}s m${s.magnitude} ${s.dps.toFixed(1)}/s` : 'none');

// --- every entry lands and resolves the same on both ------------------------
{
  const depth = 12;
  const a = arena({ seed: 5, depth });
  const waves: StatusApplication[] = [
    { id: '', duration: 3, magnitude: 0.5, stacks: 1 },
    { id: '', duration: 2, magnitude: 0.8, stacks: 2 },
    { id: '', duration: 0, magnitude: 0.3, stacks: 1 },
  ];
  const wrong: string[] = [];
  let i = 0;
  for (const def of STATUSES) {
    const hero = new StatusContainer(`hero-${def.id}`);
    hero.depth = depth;
    const e = a.spawn(melee, (i++ % 20) * 3, 40 + Math.floor(i / 20) * 3);
    for (const w of waves) {
      const app = { ...w, id: def.id };
      hero.apply(app, 'x');
      e.applyStatuses([{ ...app }], a.ctx);
      const h = onHero(hero, def.id);
      const m = onMonster(e, def.id);
      if (!same(h, m)) {
        wrong.push(`${def.id}: hero ${show(h)} vs monster ${show(m)}`);
        break;
      }
    }
  }
  check('every status resolves the same on both', wrong.length === 0, wrong.length ? wrong.slice(0, 4).join('; ') : `${STATUSES.length} entries, three applications each`);
}

// --- short names land on the hero -------------------------------------------
{
  const a = arena({ seed: 6 });
  const shorts: Array<[string, string]> = [
    ['poison', 'poisoned'],
    ['burn', 'burning'],
    ['bleed', 'bleeding'],
    ['chill', 'chilled'],
    ['root', 'rooted'],
    ['stun', 'stunned'],
    ['slow', 'slowed'],
  ];
  const missed: string[] = [];
  for (const [short, full] of shorts) {
    const hero = new StatusContainer(`hero-${short}`);
    const e = a.spawn(melee, 0, 20);
    hero.apply({ id: short, duration: 2, magnitude: 1 }, 'x');
    e.applyStatuses([{ id: short, duration: 2, magnitude: 1 }], a.ctx);
    if (!hero.has(full) || !e.hasStatus(full)) missed.push(short);
  }
  check('monster short names land on the hero', missed.length === 0, missed.length ? `missed: ${missed.join(', ')}` : shorts.map((s) => s[0]).join(', '));
}

// --- damage over time grows with depth the same way -------------------------
{
  const rates: string[] = [];
  let ok = true;
  let first = 0;
  let last = 0;
  for (const depth of [1, 20, 40]) {
    const a = arena({ seed: 7, depth });
    const hero = new StatusContainer('hero');
    hero.depth = depth;
    const e = a.spawn(melee, 0, 20);
    hero.apply({ id: 'poison', duration: 4, magnitude: 1 }, 'x');
    e.applyStatuses([{ id: 'poison', duration: 4, magnitude: 1 }], a.ctx);
    const h = hero.get('poisoned')?.dotPerSecond ?? 0;
    const m = onMonster(e, 'poisoned')?.dps ?? -1;
    ok &&= Math.abs(h - m) < 1e-6 * Math.max(1, h);
    if (depth === 1) first = h;
    last = h;
    rates.push(`d${depth} ${h.toFixed(1)}/${m.toFixed(1)}`);
  }
  check('poison grows with depth on both', ok && last > first * 100, `hero/monster per second: ${rates.join(', ')}`);
}

// --- holds fade the same, across kinds ---------------------------------------
{
  const a = arena({ seed: 8 });
  const hero = new StatusContainer('hero');
  const e = a.spawn(melee, 0, 20);
  const hold = (id: string): [number, number] => {
    hero.apply({ id, duration: 2, magnitude: 1 }, 'x');
    e.applyStatuses([{ id, duration: 2, magnitude: 1 }], a.ctx);
    return [hero.get(id)?.remaining ?? 0, onMonster(e, id)?.time ?? 0];
  };
  const [h1, m1] = hold('stunned');
  const [h2, m2] = hold('frozen');
  const [h3, m3] = hold('rooted');
  check(
    'every hold shortens the next, of any kind',
    isHold(STATUSES.find((s) => s.id === 'frozen')!) && h1 === m1 && h2 === m2 && h3 === m3 && h2 < h1 && h3 < h2 && h3 > 0.3,
    `hero ${h1.toFixed(2)} ${h2.toFixed(2)} ${h3.toFixed(2)}s, monster ${m1.toFixed(2)} ${m2.toFixed(2)} ${m3.toFixed(2)}s`,
  );
  // The fatigue drains: ten quiet seconds and a hold is whole again.
  for (let t = 0; t < 10; t += 1 / 30) hero.update(1 / 30);
  a.step(10);
  const [h4, m4] = hold('stunned');
  check('hold fatigue wears off on both', h4 === 2 && m4 === 2, `after ten seconds: hero ${h4.toFixed(2)}s, monster ${m4.toFixed(2)}s`);
  check('a held monster stays held as long as its stun', e.rootTimer >= m4 - 1e-6, `stun ${m4.toFixed(2)}s, held ${e.rootTimer.toFixed(2)}s`);
}

// --- strength scales the same ------------------------------------------------
{
  const a = arena({ seed: 9 });
  const hero = new StatusContainer('hero');
  const e = a.spawn(melee, 0, 20);
  const speed = (): number => (e as unknown as { actionSpeed(): number }).actionSpeed();
  const before = speed();
  hero.apply({ id: 'chilled', duration: 4, magnitude: 0.4 }, 'x');
  e.applyStatuses([{ id: 'chilled', duration: 4, magnitude: 0.4 }], a.ctx);
  const pct = hero.statMods().attackSpeed ?? 0;
  const ratio = speed() / before;
  check('a weak chill slows both by the same share', pct < 0 && Math.abs(ratio - (1 + pct / 100)) < 1e-6, `hero ${pct.toFixed(1)}% attack speed, monster x${ratio.toFixed(3)}`);
}

// --- a poison names its giver ------------------------------------------------
{
  const hero = new StatusContainer('hero');
  hero.depth = 10;
  hero.apply({ id: 'poison', duration: 4, magnitude: 1 }, 'enemy_7');
  const res = hero.update(1);
  const tick = res.damage.find((d) => d.statusId === 'poisoned');
  check('a poison tick carries the monster that gave it', tick?.sourceId === 'enemy_7', `tick from ${tick?.sourceId ?? 'nothing'}`);
}

console.log(JSON.stringify({ cases }));
