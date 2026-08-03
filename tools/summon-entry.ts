/**
 * Entry point for `tools/check-summons.mjs`.
 *
 * Reported: "right now I can spawn unlimited skeletons". Summons expired on a
 * timer, which is not a limit — you could hold as many as you could click.
 * This reads every summoning skill and reports what it costs, how many it
 * holds at rank 1 and at rank 20, and how tough each body is, so the balance
 * is a table somebody can look at rather than a feeling.
 */
import { SKILLS } from '../src/data/skills';

const HARD_CAP: Record<string, number> = {
  raiseSkeleton: 12,
  skeletalMage: 8,
  claySentinel: 3,
  shadowClone: 6,
  livingFlame: 5,
  swornBrother: 3,
  viperGod: 2,
  grandOssuary: 16,
};

function p(id: string, key: string, dflt: number): number {
  const v = SKILLS.find((s) => s.id === id)?.params?.[key];
  if (typeof v === 'number') return v;
  if (Array.isArray(v) && typeof v[0] === 'number') return v[0];
  return dflt;
}

interface Row {
  id: string;
  name: string;
  effect: string;
  totem: boolean;
  capAt1: number;
  capAt20: number;
  hardCap: number;
  lifePct: number;
  permanent: boolean;
  capped: boolean;
}

const rows: Row[] = [];
for (const s of SKILLS) {
  const fx = s.effect ?? '';
  if (!fx.startsWith('summon')) continue;
  const totem = fx.includes('totem');
  const base = Math.max(1, p(s.id, 'baseCap', 1));
  const per = Math.max(1, p(s.id, 'maxPerRanks', 99));
  const hard = Math.min(20, HARD_CAP[s.id] ?? 6);
  const capAt = (r: number): number => Math.min(hard, base + Math.floor(r / per));
  rows.push({
    id: s.id,
    name: s.name,
    effect: fx,
    totem,
    capAt1: capAt(1),
    capAt20: capAt(20),
    hardCap: hard,
    lifePct: p(s.id, 'lifePct', 0),
    permanent: !totem,
    // A creature must be capped and must not carry a duration; a totem is the
    // other way round.
    capped: totem ? p(s.id, 'duration', 0) > 0 : capAt(20) <= hard && p(s.id, 'duration', 0) === 0,
  });
}

console.log(JSON.stringify({ rows }));
