/**
 * SLAY — the loot filter.
 *
 * Monster counts are high on purpose, and every one of them can drop. By depth
 * ten the floor after a pack is a carpet of grey swords nobody will ever pick
 * up, and the one rare is somewhere underneath. The filter decides what the
 * floor shows you. Hidden drops are still there: hold Shift (the show-items
 * key) and they appear, labels and all.
 *
 * Pure: it reads an item and the account's settings and returns a yes or no.
 */

import type { AccountSave, CharClassId, Item, ItemRarity, LootFilterSettings } from '../types';
export type { LootFilterSettings };
import { RARITY_ORDER } from '../types';
import { getBase, affixTierRank } from './Loot';


export const DEFAULT_LOOT_FILTER: LootFilterSettings = {
  enabled: true,
  minRarity: 'normal',
  keepPowers: true,
  keepTopTier: true,
  keepSockets: 3,
  hideOtherClasses: false,
  showGems: true,
  showRunes: true,
  showPotions: true,
};

/** One-click starting points. Each is a full settings block. */
export const LOOT_FILTER_PRESETS: Array<{ id: string; label: string; hint: string; settings: LootFilterSettings }> = [
  {
    id: 'all',
    label: 'Everything',
    hint: 'Show every drop.',
    settings: { ...DEFAULT_LOOT_FILTER, minRarity: 'normal' },
  },
  {
    id: 'nojunk',
    label: 'No junk',
    hint: 'Hide plain gear unless it has sockets worth having.',
    settings: { ...DEFAULT_LOOT_FILTER, minRarity: 'magic' },
  },
  {
    id: 'rares',
    label: 'Rares up',
    hint: 'Rares, sets and uniques, plus anything with a power or a T1 roll.',
    settings: { ...DEFAULT_LOOT_FILTER, minRarity: 'rare', keepSockets: 4, hideOtherClasses: true },
  },
  {
    id: 'strict',
    label: 'Strict',
    hint: 'Sets and uniques only. Powers still show. Potions hidden.',
    settings: {
      ...DEFAULT_LOOT_FILTER,
      minRarity: 'set',
      keepTopTier: false,
      keepSockets: 0,
      hideOtherClasses: true,
      showPotions: false,
    },
  },
];

const RANK = (r: ItemRarity) => RARITY_ORDER.indexOf(r);

/** The account's filter, repaired in place if missing or partial. */
export function lootFilterOf(account: AccountSave): LootFilterSettings {
  const raw = account.lootFilter;
  const merged: LootFilterSettings = { ...DEFAULT_LOOT_FILTER, ...(raw ?? {}) };
  if (!RARITY_ORDER.includes(merged.minRarity)) merged.minRarity = 'normal';
  if (!Number.isFinite(merged.keepSockets)) merged.keepSockets = 0;
  account.lootFilter = merged;
  return merged;
}

/** True when a drop should be shown on the floor. */
export function passesFilter(item: Item, f: LootFilterSettings, classId?: CharClassId): boolean {
  if (!f.enabled) return true;
  let base;
  try {
    base = getBase(item.baseId);
  } catch {
    return true;
  }
  switch (base.category) {
    case 'gem':
      return f.showGems;
    case 'rune':
      return f.showRunes;
    case 'potion':
      return f.showPotions;
    case 'material':
      return true;
    default:
      break;
  }
  // The rarest things always show. Nobody wants to filter out an ancient.
  if (RANK(item.rarity) >= RANK('unique')) return true;
  if (f.hideOtherClasses && classId && base.classes?.length && !base.classes.includes(classId)) return false;
  if (RANK(item.rarity) >= RANK(f.minRarity)) return true;
  if (f.keepPowers && (item.powers?.length ?? 0) > 0) return true;
  if (f.keepTopTier && item.mods.some((m) => affixTierRank(m)?.rank === 1)) return true;
  if (f.keepSockets > 0 && item.sockets.length >= f.keepSockets) return true;
  return false;
}

/** A sentence describing the current rules, for the panel and tooltips. */
export function describeFilter(f: LootFilterSettings): string {
  if (!f.enabled) return 'Filter off: every drop shows.';
  const parts: string[] = [];
  parts.push(f.minRarity === 'normal' ? 'All gear shows' : `Gear below ${f.minRarity} is hidden`);
  const keeps: string[] = [];
  if (f.keepPowers) keeps.push('a power');
  if (f.keepTopTier) keeps.push('a T1 roll');
  if (f.keepSockets > 0) keeps.push(`${f.keepSockets}+ sockets`);
  if (f.minRarity !== 'normal' && keeps.length) parts.push(`unless it has ${keeps.join(', or ')}`);
  if (f.hideOtherClasses) parts.push("Other classes' gear is hidden");
  const hidden: string[] = [];
  if (!f.showGems) hidden.push('gems');
  if (!f.showRunes) hidden.push('runes');
  if (!f.showPotions) hidden.push('potions');
  if (hidden.length) parts.push(`Hidden: ${hidden.join(', ')}`);
  return parts.join('. ') + '. Hold Shift to see everything.';
}
