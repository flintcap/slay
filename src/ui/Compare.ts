/**
 * Is this item better than what I wear? One answer, used by the tooltip's
 * "Versus equipped" strip and by the green arrow on item slots, so the two
 * never disagree.
 *
 * The rule is the tooltip's: compare the item's own stats with the worn
 * piece's, key by key. No line worse and at least one better is an upgrade.
 * An empty slot the hero can fill is an upgrade too. Items the hero cannot
 * wear (class, level, strength, dexterity) never get an arrow.
 */
import type { Character, DamageType, EquipSlot, Item, StatKey, Stats } from '../types';
import { save } from '../core/Save';
import { itemStats, setBonusesFor } from '../sim/Loot';
import { equipPlan, meetsRequirements, slotsFor } from '../sim/Character';
import { computeStats, STAT_KEYS } from '../sim/Stats';
import { effectiveLife, resistAgainst } from '../sim/Combat';
import { powerLines } from '../sim/ItemPowers';
import { estimateAttack } from './AttackEstimate';
import { tr } from '../core/I18n';

/** The stats players weigh first, in the order the tooltip lists them. */
const LEAD_KEYS: StatKey[] = [
  'minDamage',
  'maxDamage',
  'enhancedDamage',
  'attackSpeed',
  'critChance',
  'critDamage',
  'defense',
  'enhancedDefense',
  'blockChance',
  'life',
  'mana',
  'strength',
  'dexterity',
  'vitality',
  'energy',
  'fireResist',
  'coldResist',
  'lightningResist',
  'poisonResist',
  'arcaneResist',
  'lifeSteal',
  'moveSpeed',
  'magicFind',
  'goldFind',
  'skillLevels',
];

/** Every stat, the lead ones first: a line an item can roll is a line it is compared on. */
export const COMPARE_KEYS: StatKey[] = [...LEAD_KEYS, ...STAT_KEYS.filter((k) => !LEAD_KEYS.includes(k))];

export type Verdict = 'upgrade' | 'downgrade' | 'tradeoff' | 'same';

export interface StatDelta {
  key: StatKey;
  delta: number;
}

/**
 * Every stat that differs between `item` and what it would replace, and the
 * one-word verdict. `worn` is a list when one item takes off two (a
 * two-hander against a weapon and a shield).
 */
export function compareItems(item: Item, worn: Item | readonly Item[]): { deltas: StatDelta[]; verdict: Verdict } {
  let a: Partial<Stats> = {};
  const b: Partial<Stats> = {};
  try {
    a = itemStats(item);
    const list: readonly Item[] = Array.isArray(worn) ? worn : [worn as Item];
    for (const w of list) {
      const ws = itemStats(w);
      for (const k of Object.keys(ws) as StatKey[]) b[k] = (b[k] ?? 0) + (ws[k] ?? 0);
    }
  } catch {
    return { deltas: [], verdict: 'same' };
  }
  const deltas: StatDelta[] = [];
  let ups = 0;
  let downs = 0;
  for (const key of COMPARE_KEYS) {
    const d = (a[key] ?? 0) - (b[key] ?? 0);
    if (Math.abs(d) < 0.005) continue;
    if (d > 0) ups++;
    else downs++;
    deltas.push({ key, delta: d });
  }
  const verdict: Verdict = !deltas.length ? 'same' : downs === 0 ? 'upgrade' : ups === 0 ? 'downgrade' : 'tradeoff';
  return { deltas, verdict };
}

// One cache per state of the hero's gear and attributes: answers stay valid
// until something worn, the level or the spent points change.
let cacheSig = '';
let cacheStats: Stats | null = null;
const cache = new Map<string, boolean>();

function heroSig(c: Character): string {
  let s = `${c.id}|${c.level}|${c.allocated.strength}|${c.allocated.dexterity}`;
  for (const k of Object.keys(c.equipment) as EquipSlot[]) {
    const it = c.equipment[k];
    if (it) s += `|${k}:${it.uid}:${it.upgrade}`;
  }
  return s;
}

/** True when wearing `item` would be a clear step up for the current hero. */
export function isUpgrade(item: Item): boolean {
  const c = save.account.current;
  if (!c) return false;
  const sig = heroSig(c);
  if (sig !== cacheSig) {
    cacheSig = sig;
    cacheStats = null;
    cache.clear();
  }
  const key = `${item.uid}|${item.upgrade}|${item.sockets.map((s) => s.gemId ?? '').join(',')}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let out = false;
  try {
    out = judge(c, item);
  } catch {
    out = false;
  }
  cache.set(key, out);
  return out;
}

function judge(c: Character, item: Item): boolean {
  // Something worn already: never call it an upgrade over itself.
  for (const k of Object.keys(c.equipment) as EquipSlot[]) if (c.equipment[k]?.uid === item.uid) return false;
  const choices = compareChoices(c, item);
  if (!choices) return false;
  cacheStats ??= computeStats(c);
  if (!meetsRequirements(c, item, cacheStats).ok) return false;
  // An empty slot it can fill outright is an upgrade.
  if (!choices.length) return true;
  return choices.some((worn) => compareItems(item, worn).verdict === 'upgrade');
}

/**
 * What wearing `item` would be weighed against: one list per choice the
 * player has. Usually a single list, the pieces equipping it takes off (both
 * hands for a two-hander over a weapon and shield; the two-hander for a shield
 * held under one). With both rings worn there are two choices, one per ring.
 * An empty list means it goes into a free slot and replaces nothing. Null when
 * it cannot be worn at all.
 */
export function compareChoices(c: Character, item: Item): Item[][] | null {
  const plan = equipPlan(c, item);
  if (!plan) return null;
  const ring1 = c.equipment.ring1;
  const ring2 = c.equipment.ring2;
  if ((plan.target === 'ring1' || plan.target === 'ring2') && ring1 && ring2) return [[ring1], [ring2]];
  const worn = plan.displaced.filter((w) => w.uid !== item.uid);
  return worn.length ? [worn] : [];
}

// ---------------------------------------------------------------------------
// What wearing it does to the hero
// ---------------------------------------------------------------------------

const ELEMENTS: Array<{ type: DamageType; label: string }> = [
  { type: 'fire', label: tr('Fire') },
  { type: 'cold', label: tr('Cold') },
  { type: 'lightning', label: tr('Lightning') },
  { type: 'poison', label: tr('Poison') },
  { type: 'arcane', label: tr('Arcane') },
];
const ALL_TYPES: DamageType[] = ['physical', 'fire', 'cold', 'lightning', 'poison', 'arcane'];

export interface SwapSummary {
  /** The right-click attack's damage a second, or null when there is none either side. */
  dps: { before: number; after: number } | null;
  life: { before: number; after: number };
  /**
   * How many hits of any kind the hero takes to fall, as one number: life
   * with armour, block, resistances and damage reduction counted, averaged
   * over the six damage kinds.
   */
  toughness: { before: number; after: number };
  /** Resistances after the cap curve, only the ones that change. */
  resists: Array<{ label: string; before: number; after: number }>;
  powersGained: Array<{ name: string; text: string }>;
  powersLost: Array<{ name: string; text: string }>;
  setsGained: string[];
  setsLost: string[];
}

/** Life against hits of every kind, as one number (see `SwapSummary.toughness`). */
export function toughnessOf(st: Stats): number {
  let sum = 0;
  for (const t of ALL_TYPES) sum += Math.min(effectiveLife(st, 100, t), st.life * 20);
  return sum / ALL_TYPES.length;
}

/**
 * The hero as they would be wearing `item` in place of `worn`: damage, life,
 * toughness and resistances before and after, the item powers gained and
 * lost, and the set bonuses that wake or go quiet. Null when it cannot be
 * worn.
 */
export function swapSummary(c: Character, item: Item, worn: readonly Item[]): SwapSummary | null {
  const plan = equipPlan(c, item);
  if (!plan) return null;
  let target: EquipSlot = plan.target;
  let remove: readonly Item[] = plan.displaced;
  // One of two worn rings (or another pair): wear it in that one's place.
  const first = worn[0];
  if (worn.length === 1 && first && plan.displaced.length) {
    const at = (Object.keys(c.equipment) as EquipSlot[]).find((k) => c.equipment[k]?.uid === first.uid);
    if (at && at !== target && slotsFor(item, c.classId).includes(at)) {
      target = at;
      remove = [first];
    }
  }
  const equipment = { ...c.equipment };
  for (const k of Object.keys(equipment) as EquipSlot[]) {
    const it = equipment[k];
    if (it && (it.uid === item.uid || remove.some((r) => r.uid === it.uid))) delete equipment[k];
  }
  equipment[target] = item;
  const next: Character = { ...c, equipment };

  const a = computeStats(c);
  const b = computeStats(next);
  const ea = estimateAttack(c, a);
  const eb = estimateAttack(next, b);

  const resists: SwapSummary['resists'] = [];
  for (const e of ELEMENTS) {
    const before = resistAgainst(a, e.type);
    const after = resistAgainst(b, e.type);
    if (Math.abs(after - before) >= 0.5) resists.push({ label: e.label, before, after });
  }

  const lines = (list: readonly Item[]) => list.flatMap((it) => powerLines(it));
  const had = lines(remove);
  const gets = powerLines(item);
  const key = (p: { name: string; text: string }) => `${p.name}|${p.text}`;
  const hadKeys = new Set(had.map(key));
  const getKeys = new Set(gets.map(key));

  const setLines = (eq: Character['equipment']) =>
    new Map(
      setBonusesFor(Object.values(eq))
        .lines.filter((l) => l.active)
        .map((l) => [`${l.setId}|${l.required}`, `${l.setName} (${l.required}): ${l.desc}`] as const),
    );
  const setsBefore = setLines(c.equipment);
  const setsAfter = setLines(equipment);

  return {
    dps: ea || eb ? { before: ea?.dps ?? 0, after: eb?.dps ?? 0 } : null,
    life: { before: a.life, after: b.life },
    toughness: { before: toughnessOf(a), after: toughnessOf(b) },
    resists,
    powersGained: gets.filter((p) => !hadKeys.has(key(p))),
    powersLost: had.filter((p) => !getKeys.has(key(p))),
    setsGained: [...setsAfter].filter(([k]) => !setsBefore.has(k)).map(([, v]) => v),
    setsLost: [...setsBefore].filter(([k]) => !setsAfter.has(k)).map(([, v]) => v),
  };
}
