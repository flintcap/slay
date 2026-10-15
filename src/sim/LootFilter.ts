/**
 * SLAY — the loot filter.
 *
 * Monster counts are high on purpose, and every one of them can drop. By depth
 * ten the floor after a pack is a carpet of grey swords nobody will ever pick
 * up, and the one rare is somewhere underneath. The filter decides what the
 * floor shows you. Hidden drops are still there: hold Shift (the show-items
 * key) and they appear, labels and all.
 *
 * The rules, in the order they are asked:
 *   1. Uniques and better always show.
 *   2. Gear for another class hides, if asked.
 *   3. Keep rules: a power, a T1 roll, enough sockets, or the stats you want.
 *   4. Plain and magic gear on an outgrown base hides.
 *   5. Otherwise the item's group sets the rarity bar.
 *
 * Pure: it reads an item and the account's settings and returns a yes or no.
 */

import type { AccountSave, CharClassId, Item, ItemCategory, ItemRarity, LootFilterGroup, LootFilterSettings, StatKey } from '../types';
export type { LootFilterGroup, LootFilterSettings };
import { RARITY_ORDER } from '../types';
import { getBase, affixTierRank } from './Loot';
import { getGem, getRune } from '../data/gems';

export const FILTER_GROUPS: Array<{ id: LootFilterGroup; label: string }> = [
  { id: 'weapons', label: 'Weapons' },
  { id: 'armour', label: 'Armour' },
  { id: 'jewellery', label: 'Rings & amulets' },
  { id: 'charms', label: 'Charms' },
];

const GROUP_OF: Partial<Record<ItemCategory, LootFilterGroup>> = {
  sword: 'weapons', axe: 'weapons', mace: 'weapons', dagger: 'weapons', spear: 'weapons',
  bow: 'weapons', crossbow: 'weapons', wand: 'weapons', staff: 'weapons', scepter: 'weapons',
  orb: 'weapons', quiver: 'weapons',
  amulet: 'jewellery', ring: 'jewellery',
  charm: 'charms',
};

export function filterGroupOf(category: ItemCategory): LootFilterGroup {
  return GROUP_OF[category] ?? 'armour';
}

/** Stat groups the filter can keep gear for. One chip can cover several stats. */
export const STAT_CHIPS: Array<{ id: string; label: string; stats: StatKey[] }> = [
  { id: 'skills', label: '+Skills', stats: ['skillLevels'] },
  { id: 'life', label: 'Life', stats: ['life', 'vitality', 'lifeRegen'] },
  { id: 'mana', label: 'Mana', stats: ['mana', 'energy', 'manaRegen'] },
  { id: 'res', label: 'Resists', stats: ['fireResist', 'coldResist', 'lightningResist', 'poisonResist', 'arcaneResist', 'physicalResist'] },
  { id: 'move', label: 'Move speed', stats: ['moveSpeed'] },
  { id: 'mf', label: 'Magic find', stats: ['magicFind'] },
  { id: 'gold', label: 'Gold find', stats: ['goldFind'] },
  { id: 'aspd', label: 'Attack speed', stats: ['attackSpeed'] },
  { id: 'cspd', label: 'Cast speed', stats: ['castSpeed'] },
  { id: 'crit', label: 'Crit', stats: ['critChance', 'critDamage'] },
  { id: 'leech', label: 'Leech', stats: ['lifeSteal', 'manaSteal'] },
  { id: 'dmg', label: 'Damage %', stats: ['enhancedDamage', 'elementalDamagePct', 'areaDamagePct'] },
  { id: 'flat', label: 'Added damage', stats: ['minDamage', 'maxDamage', 'fireDamage', 'coldDamage', 'lightningDamage', 'poisonDamage', 'arcaneDamage'] },
  { id: 'def', label: 'Defence', stats: ['enhancedDefense', 'defense', 'damageReduction', 'blockChance'] },
  { id: 'attr', label: 'Str / Dex', stats: ['strength', 'dexterity'] },
  { id: 'cdr', label: 'Cooldown', stats: ['cooldownReduction'] },
];
const CHIP_OF_STAT = new Map<StatKey, string>();
for (const c of STAT_CHIPS) for (const st of c.stats) CHIP_OF_STAT.set(st, c.id);

const allGroups = (r: ItemRarity): Record<LootFilterGroup, ItemRarity> => ({ weapons: r, armour: r, jewellery: r, charms: r });

export const DEFAULT_LOOT_FILTER: LootFilterSettings = {
  enabled: true,
  rarityBy: allGroups('normal'),
  keepPowers: true,
  keepTopTier: true,
  keepSockets: 3,
  keepStats: [],
  keepStatsMin: 1,
  hideOldBases: 0,
  hideOtherClasses: false,
  showGems: true,
  minGemQuality: 0,
  showRunes: true,
  minRuneOrder: 1,
  showPotions: true,
  minPotionTier: 0,
};

/** One-click starting points. Each is a full settings block. */
export const LOOT_FILTER_PRESETS: Array<{ id: string; label: string; hint: string; settings: LootFilterSettings }> = [
  {
    id: 'all',
    label: 'Everything',
    hint: 'Show every drop.',
    settings: { ...DEFAULT_LOOT_FILTER },
  },
  {
    id: 'nojunk',
    label: 'No junk',
    hint: 'Hide plain gear unless it has sockets worth having.',
    settings: { ...DEFAULT_LOOT_FILTER, rarityBy: allGroups('magic') },
  },
  {
    id: 'rares',
    label: 'Rares up',
    hint: 'Rare gear, any magic ring or amulet, and blues with two stats you want. Old bases and chipped gems hidden.',
    settings: {
      ...DEFAULT_LOOT_FILTER,
      rarityBy: { weapons: 'rare', armour: 'rare', jewellery: 'magic', charms: 'magic' },
      keepSockets: 4,
      keepStats: ['skills', 'move', 'mf', 'res'],
      keepStatsMin: 2,
      hideOldBases: 20,
      hideOtherClasses: true,
      minGemQuality: 1,
      minPotionTier: 1,
    },
  },
  {
    id: 'strict',
    label: 'Strict',
    hint: 'Sets and uniques, rare jewellery and charms. Powers still show. Small gems, low runes and potions hidden.',
    settings: {
      ...DEFAULT_LOOT_FILTER,
      rarityBy: { weapons: 'set', armour: 'set', jewellery: 'rare', charms: 'rare' },
      keepTopTier: false,
      keepSockets: 0,
      keepStats: ['skills', 'move', 'mf'],
      keepStatsMin: 2,
      hideOldBases: 15,
      hideOtherClasses: true,
      minGemQuality: 3,
      minRuneOrder: 10,
      showPotions: false,
    },
  },
  {
    id: 'chase',
    label: 'Chase',
    hint: 'Uniques and better, plus rares with three stats you want. Only high gems and runes.',
    settings: {
      ...DEFAULT_LOOT_FILTER,
      rarityBy: allGroups('unique'),
      keepTopTier: false,
      keepSockets: 0,
      keepStats: ['skills', 'move', 'mf', 'res', 'life'],
      keepStatsMin: 3,
      hideOldBases: 10,
      hideOtherClasses: true,
      minGemQuality: 4,
      minRuneOrder: 18,
      showPotions: false,
    },
  },
];

const RANK = (r: ItemRarity) => RARITY_ORDER.indexOf(r);
const clampInt = (v: unknown, lo: number, hi: number, dflt: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : dflt;

/** The account's filter, repaired in place if missing, partial or from before the groups. */
export function lootFilterOf(account: AccountSave): LootFilterSettings {
  const raw = account.lootFilter;
  const merged: LootFilterSettings = { ...DEFAULT_LOOT_FILTER, ...(raw ?? {}) };
  const legacy = raw?.minRarity && RARITY_ORDER.includes(raw.minRarity) ? raw.minRarity : 'normal';
  const by = { ...allGroups(legacy), ...(raw?.rarityBy ?? {}) };
  for (const g of FILTER_GROUPS) if (!RARITY_ORDER.includes(by[g.id])) by[g.id] = 'normal';
  merged.rarityBy = by;
  delete merged.minRarity;
  merged.keepSockets = clampInt(merged.keepSockets, 0, 6, 0);
  merged.keepStats = Array.isArray(merged.keepStats) ? merged.keepStats.filter((id) => STAT_CHIPS.some((c) => c.id === id)) : [];
  merged.keepStatsMin = clampInt(merged.keepStatsMin, 1, 3, 1);
  merged.hideOldBases = clampInt(merged.hideOldBases, 0, 99, 0);
  merged.minGemQuality = clampInt(merged.minGemQuality, 0, 5, 0);
  merged.minRuneOrder = clampInt(merged.minRuneOrder, 1, 33, 1);
  merged.minPotionTier = clampInt(merged.minPotionTier, 0, 3, 0);
  account.lootFilter = merged;
  return merged;
}

const POTION_TIER: Record<string, number> = { minor: 0, light: 1, greater: 2, super: 3 };

/** Size of a healing or mana potion, or -1 for anything else (rejuvenations). */
function potionTier(baseId: string): number {
  const size = baseId.split('.')[2];
  return baseId.startsWith('potion.heal.') || baseId.startsWith('potion.mana.') ? POTION_TIER[size ?? ''] ?? 0 : -1;
}

/** How many of the wanted stat groups an item's own rolls touch. */
export function wantedStatCount(item: Item, wanted: readonly string[]): number {
  if (wanted.length === 0) return 0;
  const hit = new Set<string>();
  for (const m of item.mods) {
    if (m.kind === 'implicit') continue;
    const chip = CHIP_OF_STAT.get(m.stat);
    if (chip && wanted.includes(chip)) hit.add(chip);
  }
  return hit.size;
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
      return f.showGems && (getGem(item.baseId)?.qualityIndex ?? 5) >= f.minGemQuality;
    case 'rune':
      return f.showRunes && (getRune(item.baseId)?.order ?? 33) >= f.minRuneOrder;
    case 'potion':
    {
      const t = potionTier(item.baseId);
      return f.showPotions && (t < 0 || t >= f.minPotionTier);
    }
    case 'material':
      return true;
    default:
      break;
  }
  // The rarest things always show. Nobody wants to filter out an ancient.
  if (RANK(item.rarity) >= RANK('unique')) return true;
  if (f.hideOtherClasses && classId && base.classes?.length && !base.classes.includes(classId)) return false;
  if (f.keepPowers && (item.powers?.length ?? 0) > 0) return true;
  if (f.keepTopTier && item.mods.some((m) => affixTierRank(m)?.rank === 1)) return true;
  if (f.keepSockets > 0 && item.sockets.length >= f.keepSockets) return true;
  if (f.keepStats.length && wantedStatCount(item, f.keepStats) >= Math.min(f.keepStatsMin, f.keepStats.length)) return true;
  if (f.hideOldBases > 0 && RANK(item.rarity) < RANK('rare') && item.ilvl - base.levelReq > f.hideOldBases) return false;
  const bar = f.rarityBy?.[filterGroupOf(base.category)] ?? 'normal';
  return RANK(item.rarity) >= RANK(bar);
}

const RARITY_WORD: Record<ItemRarity, string> = {
  normal: 'everything', magic: 'magic up', rare: 'rare up', set: 'set up', unique: 'uniques only', mythic: 'uniques only', ancient: 'uniques only',
};

/** A sentence describing the current rules, for the panel and tooltips. */
export function describeFilter(f: LootFilterSettings): string {
  if (!f.enabled) return 'Filter off: every drop shows.';
  const parts: string[] = [];
  const bars = FILTER_GROUPS.map((g) => `${g.label.toLowerCase()} ${RARITY_WORD[f.rarityBy[g.id]]}`);
  parts.push(`Showing ${bars.join(', ')}`);
  const keeps: string[] = [];
  if (f.keepPowers) keeps.push('a power');
  if (f.keepTopTier) keeps.push('a T1 roll');
  if (f.keepSockets > 0) keeps.push(`${f.keepSockets}+ sockets`);
  if (f.keepStats.length) {
    const names = f.keepStats.map((id) => STAT_CHIPS.find((c) => c.id === id)?.label ?? id);
    const need = Math.min(f.keepStatsMin, names.length);
    keeps.push(need > 1 ? `${need} of: ${names.join(', ')}` : `any of: ${names.join(', ')}`);
  }
  if (keeps.length) parts.push(`Also kept: ${keeps.join('; ')}`);
  if (f.hideOldBases > 0) parts.push(`Plain and magic gear ${f.hideOldBases}+ levels behind is hidden`);
  if (f.hideOtherClasses) parts.push("Other classes' gear is hidden");
  const hidden: string[] = [];
  if (!f.showGems) hidden.push('gems');
  else if (f.minGemQuality > 0) hidden.push('small gems');
  if (!f.showRunes) hidden.push('runes');
  else if (f.minRuneOrder > 1) hidden.push(`runes below #${f.minRuneOrder}`);
  if (!f.showPotions) hidden.push('potions');
  else if (f.minPotionTier > 0) hidden.push('small potions');
  if (hidden.length) parts.push(`Hidden: ${hidden.join(', ')}`);
  return parts.join('. ') + '. Hold Shift to see everything.';
}
