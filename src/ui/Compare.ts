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
import type { Character, EquipSlot, Item, StatKey, Stats } from '../types';
import { save } from '../core/Save';
import { itemStats, getBase } from '../sim/Loot';
import { meetsRequirements, slotsFor } from '../sim/Character';
import { computeStats } from '../sim/Stats';

/** Stats compared, in the order the tooltip lists them. */
export const COMPARE_KEYS: StatKey[] = [
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

export type Verdict = 'upgrade' | 'downgrade' | 'tradeoff' | 'same';

export interface StatDelta {
  key: StatKey;
  delta: number;
}

/** Every stat that differs between `item` and `worn`, and the one-word verdict. */
export function compareItems(item: Item, worn: Item): { deltas: StatDelta[]; verdict: Verdict } {
  let a: Partial<Stats> = {};
  let b: Partial<Stats> = {};
  try {
    a = itemStats(item);
    b = itemStats(worn);
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

function twoHanded(it: Item | undefined): boolean {
  if (!it) return false;
  try {
    return getBase(it.baseId).slot === 'twoHand';
  } catch {
    return false;
  }
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
  const slots = slotsFor(item, c.classId);
  if (!slots.length) return false;
  // Something worn already: never call it an upgrade over itself.
  for (const s of slots) if (c.equipment[s]?.uid === item.uid) return false;
  cacheStats ??= computeStats(c);
  if (!meetsRequirements(c, item, cacheStats).ok) return false;

  const main = c.equipment.mainHand;
  const off = c.equipment.offHand;
  if (twoHanded(item)) {
    // It would take the off hand too; one arrow cannot weigh that trade.
    if (off) return false;
    return !main || compareItems(item, main).verdict === 'upgrade';
  }
  for (const s of slots) {
    const worn = c.equipment[s];
    if (!worn) {
      // An off hand held by a two-handed weapon is not free.
      if (s === 'offHand' && twoHanded(main)) continue;
      return true;
    }
    if (compareItems(item, worn).verdict === 'upgrade') return true;
  }
  return false;
}
