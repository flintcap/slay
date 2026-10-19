/**
 * SLAY — skill benders: uniques that change one named skill.
 *
 * A bend is read where the skill is cast (`scenes/SkillRunner.ts`): it makes
 * the skill hit harder, grows the knobs its handler reads (area, reach,
 * count, time), and can lay a second status on what it hits. The skill's
 * own rank ladder is untouched, so every rank still buys more; the bend is
 * on top.
 *
 * The tooltip line is written from the numbers here (`bendText`), so the
 * words can never drift from what the item does. `tools/check-uniques.mjs`
 * fails a bend whose skill or knob does not exist.
 *
 * Pure data. No Three.js.
 */
import type { CharClassId, Character, Item } from '../types';
import { getSkill } from './skills';
import { tr } from '../core/I18n';

export interface SkillBend {
  /** The skill it changes. */
  skill: string;
  /** More damage for this skill, percent. */
  more?: number;
  /** Knobs grown by a share: `{ radius: 30 }` is 30% more radius. */
  grow?: Record<string, number>;
  /** Knobs raised by a flat amount: `{ count: 2 }` is two more. */
  add?: Record<string, number>;
  /** A status every hit of the skill also leaves, for this many seconds. */
  applies?: { status: string; duration: number; label: string };
  /** Words for a knob when the shared ones would read wrong (`count` of wolves, not projectiles). */
  names?: Record<string, string>;
}

/** Plain words for the knobs a bend may touch. */
const KNOB: Record<string, string> = {
  radius: 'area',
  range: 'range',
  length: 'length',
  reach: 'reach',
  arc: 'arc',
  width: 'width',
  duration: 'duration',
  count: 'projectiles',
  hits: 'hits',
  bounces: 'bounces',
  chains: 'chains',
  pierce: 'pierces',
  bursts: 'bursts',
  ticks: 'waves',
  cuts: 'cuts',
  hops: 'hops',
  shards: 'shards',
  stun: 'stun',
  root: 'root',
  fear: 'fear',
  slow: 'slow',
  knockback: 'knockback',
  burnStacks: tr('burn stacks'),
  poisonStacks: tr('poison stacks'),
  shockStacks: tr('shock stacks'),
  bleedStacks: tr('bleed stacks'),
  poisonPerHit: tr('poison per hit'),
  bleedPerHit: tr('bleed per hit'),
  healPct: 'healing',
  lifePct: tr('minion life'),
  damagePct: tr('minion damage'),
  baseCap: tr('most at once'),
  targets: 'targets',
  targetsPerTick: tr('targets each pulse'),
  squeezes: 'squeezes',
  shakes: 'shakes',
  maxTargets: 'targets',
  amplify: tr('damage taken'),
  critBonus: tr('crit chance'),
  speed: 'speed',
  distance: 'distance',
  dents: 'dents',
  ring: 'ring',
  echo: 'echo',
  executeBelow: tr('execute threshold'),
  threshold: tr('execute threshold'),
  shred: tr('resist shred'),
  regen: 'regeneration',
  ward: 'ward',
  def: 'defense',
  dr: tr('damage reduction'),
  dmg: 'damage',
  weaken: 'weaken',
  absorb: 'absorb',
  interval: 'interval',
  rings: 'rings',
  splash: 'splash',
  moveSpeed: tr('movement speed'),
  bleedShare: 'bleeding',
  echoDelay: tr('echo delay'),
  perDent: tr('damage per dent'),
  perCut: tr('damage per cut'),
  opens: 'wounds',
  ringPerDent: tr('ring per dent'),
  every: tr('time between peals'),
  tick: tr('time between pulses'),
  window: 'window',
  leap: 'leap',
  drag: 'pull',
  minionScale: tr('pack size'),
  blockScale: tr('shield weight'),
  burnChance: tr('burn chance'),
  shockChance: tr('shock chance'),
  spread: 'spread',
  plagued: 'plague',
  spacing: 'spacing',
  executeThreshold: tr('execute threshold'),
  lifeCostPct: tr('life cost'),
  leechPct: 'leech',
  sharePct: tr('shared damage'),
  block: tr('block chance'),
};

export function knobLabel(key: string): string | undefined {
  return KNOB[key];
}

/** The tooltip line for a bend, from its own numbers. */
export function bendText(b: SkillBend): string {
  const name = getSkill(b.skill)?.name ?? b.skill;
  const parts: string[] = [];
  if (b.more) parts.push(tr('{0}% more damage', b.more));
  const word = (k: string) => b.names?.[k] ?? KNOB[k] ?? k;
  for (const [k, v] of Object.entries(b.grow ?? {})) parts.push(v < 0 ? tr('{0}% less {1}', -v, word(k)) : tr('{0}% more {1}', v, word(k)));
  for (const [k, v] of Object.entries(b.add ?? {})) parts.push(`${v > 0 ? '+' : ''}${v} ${word(k)}`);
  if (b.applies) parts.push(tr('its hits {0} for {1} seconds', b.applies.label, b.applies.duration));
  return `${name}: ${parts.join(', ')}.`;
}

/** The class a bend's skill belongs to. */
export function bendClass(b: SkillBend, classOfTree: (treeId: string) => CharClassId | undefined): CharClassId | undefined {
  const s = getSkill(b.skill);
  return s ? classOfTree(s.treeId) : undefined;
}

// ---------------------------------------------------------------------------
// Reading bends off a character
// ---------------------------------------------------------------------------

type BendLookup = (uniqueId: string) => SkillBend | undefined;

let lookup: BendLookup = () => undefined;

/** `data/uniques.ts` registers how to find a unique's bend (it owns the table). */
export function setBendLookup(fn: BendLookup): void {
  lookup = fn;
}

/** Every bend the worn gear puts on one skill, folded into one. */
export function bendFor(c: Pick<Character, 'equipment'>, skillId: string): SkillBend | null {
  const eq = c.equipment as Record<string, Item | undefined> | undefined;
  if (!eq) return null;
  let out: SkillBend | null = null;
  for (const item of Object.values(eq)) {
    if (!item?.uniqueId) continue;
    const b = lookup(item.uniqueId);
    if (!b || b.skill !== skillId) continue;
    if (!out) out = { skill: skillId, more: 0, grow: {}, add: {} };
    out.more = (out.more ?? 0) + (b.more ?? 0);
    for (const [k, v] of Object.entries(b.grow ?? {})) out.grow![k] = (out.grow![k] ?? 0) + v;
    for (const [k, v] of Object.entries(b.add ?? {})) out.add![k] = (out.add![k] ?? 0) + v;
    if (b.applies && !out.applies) out.applies = b.applies;
    if (b.names) out.names = { ...out.names, ...b.names };
  }
  return out;
}

/** A skill's knob, as the bend changes it. */
export function bentKnob(b: SkillBend | null, key: string, v: number): number {
  if (!b) return v;
  const g = b.grow?.[key];
  const a = b.add?.[key];
  let out = v;
  if (g) out *= 1 + g / 100;
  if (a) out += a;
  return out;
}
