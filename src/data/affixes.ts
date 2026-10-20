/**
 * SLAY — the affix pool.
 *
 * Every magic, rare, crafted and (partly) mythic item is built out of these.
 * The design rules, all of which the roller in `sim/Loot.ts` enforces:
 *
 * 1. **Tiers, not ranges.** Each affix is a ladder of 5-8 tiers. A tier only
 *    unlocks once the item level reaches its `ilvl`, and lower tiers become
 *    *ineligible* once you are far enough past them (see `eligibleTiers` in
 *    Loot.ts) — that is what makes a depth-100 drop feel different from a
 *    depth-10 drop rather than just luckier.
 *
 * 2. **Groups.** An item never carries two affixes from the same `group`, so
 *    you cannot stack "+Life" four times. Prefix and suffix variants of the
 *    same stat deliberately share a group: they exist for name variety, not to
 *    be doubled up.
 *
 * 3. **Greater ladders.** Most stats have a third, high-ilvl, rare-only affix
 *    ("Tyrant's", "Colossal", "of the Godslayer") sharing the same group. It is
 *    strictly better than the common ladder and it is the thing you are
 *    actually hoping for when a yellow beam comes off a depth-90 elite.
 *
 * 4. **Restrictions.** `categories` keeps enhanced-damage off boots and block
 *    chance off swords. Anything with no `categories` can land on any
 *    equippable item.
 *
 * Weights fall off ~42% per tier, so the top tier of a ladder is roughly 1 in
 * 45 rolls of that affix even when it is fully unlocked.
 */

import type { AffixDef, AffixTier, ItemCategory, ItemRarity, StatKey } from '../types';
import { tr } from '../core/I18n';

// ---------------------------------------------------------------------------
// Category sets
// ---------------------------------------------------------------------------

const WEAPONS: ItemCategory[] = [
  'sword',
  'axe',
  'mace',
  'dagger',
  'spear',
  'bow',
  'crossbow',
  'wand',
  'staff',
  'scepter',
];
const MELEE: ItemCategory[] = ['sword', 'axe', 'mace', 'dagger', 'spear'];
const RANGED: ItemCategory[] = ['bow', 'crossbow'];
const CASTER: ItemCategory[] = ['wand', 'staff', 'scepter', 'orb'];
const ARMOR: ItemCategory[] = ['helm', 'chest', 'gloves', 'pants', 'boots', 'belt', 'shield'];
const SHIELD_ONLY: ItemCategory[] = ['shield'];
// Charms roll their own ladders (see CHARMS below), never jewellery's.
const JEWELRY: ItemCategory[] = ['ring', 'amulet'];
const BOOTS_JEWELRY: ItemCategory[] = ['boots', 'ring', 'amulet'];
const HANDS: ItemCategory[] = ['gloves', 'ring', 'amulet'];
/** Anything that can carry offensive properties: weapons plus jewellery. */
const OFFENSIVE: ItemCategory[] = [...WEAPONS, ...JEWELRY];
const DEFENSIVE: ItemCategory[] = [...ARMOR, 'orb', 'quiver', ...JEWELRY];

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/** [ilvl, min, max] — one rung of a ladder. */
type Rung = [number, number, number];

interface AffixOpts {
  categories?: ItemCategory[];
  minRarity?: ItemRarity;
  /** Multiplier on the whole ladder's selection weight. */
  rarity?: number;
}

const AFFIX_LIST: AffixDef[] = [];

function ladder(rungs: Rung[], rarityMul: number): AffixTier[] {
  return rungs.map(([ilvl, min, max], i) => ({
    tier: i + 1,
    ilvl,
    min,
    max,
    weight: Math.max(1, Math.round(1000 * Math.pow(0.58, i) * rarityMul)),
  }));
}

function mk(
  kind: 'prefix' | 'suffix',
  id: string,
  label: string,
  stat: StatKey,
  group: string,
  rungs: Rung[],
  o: AffixOpts = {},
): AffixDef {
  const def: AffixDef = {
    id,
    label,
    stat,
    kind,
    group,
    tiers: ladder(rungs, o.rarity ?? 1),
  };
  if (o.categories) def.categories = o.categories;
  if (o.minRarity) def.minRarity = o.minRarity;
  AFFIX_LIST.push(def);
  return def;
}

const pre = (id: string, label: string, stat: StatKey, group: string, rungs: Rung[], o?: AffixOpts) =>
  mk('prefix', id, label, stat, group, rungs, o);
const suf = (id: string, label: string, stat: StatKey, group: string, rungs: Rung[], o?: AffixOpts) =>
  mk('suffix', id, label, stat, group, rungs, o);

/**
 * Magic-item naming. `label` is the tooltip line; these are the words that get
 * glued onto the base name to make "Fiery Broad Sword of the Leech".
 */
const NAME_WORDS = new Map<string, string>();
function named(def: AffixDef, word: string): AffixDef {
  NAME_WORDS.set(def.id, word);
  return def;
}

export function affixNameWord(affixId: string): string | undefined {
  return NAME_WORDS.get(affixId);
}

// ===========================================================================
// CORE ATTRIBUTES
// ===========================================================================

const ATTR: Rung[] = [
  [1, 1, 3],
  [8, 4, 6],
  [16, 7, 10],
  [26, 11, 15],
  [38, 16, 21],
  [50, 22, 29],
  [62, 30, 38],
  [76, 39, 50],
];
const ATTR_GREAT: Rung[] = [
  [55, 42, 55],
  [66, 56, 70],
  [76, 71, 86],
  [84, 87, 105],
  [92, 106, 130],
];

named(pre('pre.strength', tr('+{v} to Strength'), 'strength', 'strength', ATTR), tr('Strong'));
named(suf('suf.strength', tr('+{v} to Strength'), 'strength', 'strength', ATTR), tr('of Might'));
named(suf('suf.strength.great', tr('+{v} to Strength'), 'strength', 'strength', ATTR_GREAT, { minRarity: 'rare', rarity: 0.35 }), tr('of the Titan'));

named(pre('pre.dexterity', tr('+{v} to Dexterity'), 'dexterity', 'dexterity', ATTR), tr('Nimble'));
named(suf('suf.dexterity', tr('+{v} to Dexterity'), 'dexterity', 'dexterity', ATTR), tr('of Skill'));
named(suf('suf.dexterity.great', tr('+{v} to Dexterity'), 'dexterity', 'dexterity', ATTR_GREAT, { minRarity: 'rare', rarity: 0.35 }), tr('of the Panther'));

named(pre('pre.vitality', tr('+{v} to Vitality'), 'vitality', 'vitality', ATTR), tr('Rugged'));
named(suf('suf.vitality', tr('+{v} to Vitality'), 'vitality', 'vitality', ATTR), tr('of Vigor'));
named(suf('suf.vitality.great', tr('+{v} to Vitality'), 'vitality', 'vitality', ATTR_GREAT, { minRarity: 'rare', rarity: 0.35 }), tr('of the Behemoth'));

named(pre('pre.energy', tr('+{v} to Energy'), 'energy', 'energy', ATTR), tr('Wise'));
named(suf('suf.energy', tr('+{v} to Energy'), 'energy', 'energy', ATTR), tr('of the Mind'));
named(suf('suf.energy.great', tr('+{v} to Energy'), 'energy', 'energy', ATTR_GREAT, { minRarity: 'rare', rarity: 0.35 }), tr('of the Archmage'));

// ===========================================================================
// LIFE, MANA AND REGENERATION
// ===========================================================================

const LIFE: Rung[] = [
  [1, 5, 12],
  [8, 13, 24],
  [16, 25, 40],
  [26, 41, 62],
  [38, 63, 92],
  [50, 93, 130],
  [62, 131, 180],
  [76, 181, 240],
];
const LIFE_GREAT: Rung[] = [
  [56, 200, 280],
  [66, 281, 380],
  [76, 381, 500],
  [85, 501, 650],
  [92, 651, 850],
];
const MANA: Rung[] = [
  [1, 6, 14],
  [8, 15, 28],
  [16, 29, 48],
  [26, 49, 74],
  [38, 75, 108],
  [50, 109, 152],
  [62, 153, 210],
  [76, 211, 280],
];
const MANA_GREAT: Rung[] = [
  [56, 240, 330],
  [66, 331, 440],
  [76, 441, 580],
  [85, 581, 760],
  [92, 761, 980],
];

named(pre('pre.life', tr('+{v} to Life'), 'life', 'lifeFlat', LIFE), tr('Hale'));
named(suf('suf.life', tr('+{v} to Life'), 'life', 'lifeFlat', LIFE), tr('of Sustenance'));
named(pre('pre.life.great', tr('+{v} to Life'), 'life', 'lifeFlat', LIFE_GREAT, { minRarity: 'rare', rarity: 0.35 }), tr('Colossal'));

named(pre('pre.mana', tr('+{v} to Mana'), 'mana', 'manaFlat', MANA), tr('Arcane'));
named(suf('suf.mana', tr('+{v} to Mana'), 'mana', 'manaFlat', MANA), tr('of the Wellspring'));
named(pre('pre.mana.great', tr('+{v} to Mana'), 'mana', 'manaFlat', MANA_GREAT, { minRarity: 'rare', rarity: 0.35 }), tr('Abyssal'));

const LREGEN: Rung[] = [
  [1, 1, 3],
  [10, 4, 7],
  [20, 8, 12],
  [32, 13, 19],
  [44, 20, 28],
  [58, 29, 40],
  [72, 41, 56],
];
const MREGEN: Rung[] = [
  [1, 3, 6],
  [10, 7, 12],
  [20, 13, 20],
  [32, 21, 30],
  [44, 31, 44],
  [58, 45, 62],
  [72, 63, 85],
];

named(pre('pre.liferegen', tr('+{v} Life Regeneration'), 'lifeRegen', 'lifeRegen', LREGEN), tr('Mending'));
named(suf('suf.liferegen', tr('+{v} Life Regeneration'), 'lifeRegen', 'lifeRegen', LREGEN), tr('of Regrowth'));
named(suf('suf.liferegen.great', tr('+{v} Life Regeneration'), 'lifeRegen', 'lifeRegen', [
  [58, 50, 70],
  [70, 71, 95],
  [80, 96, 125],
  [90, 126, 165],
], { minRarity: 'rare', rarity: 0.3 }), tr('of the Troll'));

named(pre('pre.manaregen', tr('+{v}% Mana Regeneration'), 'manaRegen', 'manaRegen', MREGEN), tr('Flowing'));
named(suf('suf.manaregen', tr('+{v}% Mana Regeneration'), 'manaRegen', 'manaRegen', MREGEN), tr('of Meditation'));
named(suf('suf.manaregen.great', tr('+{v}% Mana Regeneration'), 'manaRegen', 'manaRegen', [
  [58, 80, 105],
  [70, 106, 140],
  [80, 141, 185],
  [90, 186, 240],
], { minRarity: 'rare', rarity: 0.3 }), tr('of the Deep Well'));

// ===========================================================================
// FLAT WEAPON DAMAGE AND ATTACK RATING
// ===========================================================================

const MINDMG: Rung[] = [
  [1, 1, 2],
  [8, 3, 4],
  [16, 5, 7],
  [26, 8, 11],
  [38, 12, 16],
  [50, 17, 23],
  [62, 24, 33],
  [76, 34, 46],
];
const MAXDMG: Rung[] = [
  [1, 2, 4],
  [8, 5, 8],
  [16, 9, 14],
  [26, 15, 22],
  [38, 23, 33],
  [50, 34, 48],
  [62, 49, 68],
  [76, 69, 95],
];

named(pre('pre.mindmg', tr('+{v} to Minimum Damage'), 'minDamage', 'minDamage', MINDMG, { categories: OFFENSIVE }), tr('Heavy'));
named(suf('suf.mindmg', tr('+{v} to Minimum Damage'), 'minDamage', 'minDamage', MINDMG, { categories: OFFENSIVE }), tr('of Ire'));
named(pre('pre.mindmg.great', tr('+{v} to Minimum Damage'), 'minDamage', 'minDamage', [
  [55, 40, 55],
  [66, 56, 74],
  [76, 75, 98],
  [86, 99, 130],
], { categories: OFFENSIVE, minRarity: 'rare', rarity: 0.3 }), tr('Titanic'));

named(pre('pre.maxdmg', tr('+{v} to Maximum Damage'), 'maxDamage', 'maxDamage', MAXDMG, { categories: OFFENSIVE }), tr('Sharp'));
named(suf('suf.maxdmg', tr('+{v} to Maximum Damage'), 'maxDamage', 'maxDamage', MAXDMG, { categories: OFFENSIVE }), tr('of Carnage'));
named(pre('pre.maxdmg.great', tr('+{v} to Maximum Damage'), 'maxDamage', 'maxDamage', [
  [55, 85, 115],
  [66, 116, 155],
  [76, 156, 205],
  [86, 206, 270],
], { categories: OFFENSIVE, minRarity: 'rare', rarity: 0.3 }), tr('Ruinous'));

const AR: Rung[] = [
  [1, 8, 20],
  [8, 21, 45],
  [16, 46, 80],
  [26, 81, 130],
  [38, 131, 200],
  [50, 201, 300],
  [62, 301, 430],
  [76, 431, 600],
];

named(pre('pre.ar', tr('+{v} to Attack Rating'), 'attackRating', 'attackRating', AR, { categories: OFFENSIVE }), tr('Bronze'));
named(suf('suf.ar', tr('+{v} to Attack Rating'), 'attackRating', 'attackRating', AR, { categories: OFFENSIVE }), tr('of Accuracy'));
named(pre('pre.ar.great', tr('+{v} to Attack Rating'), 'attackRating', 'attackRating', [
  [55, 520, 700],
  [66, 701, 900],
  [76, 901, 1150],
  [86, 1151, 1500],
], { categories: OFFENSIVE, minRarity: 'rare', rarity: 0.32 }), tr('Unerring'));

// ===========================================================================
// ENHANCED DAMAGE / DEFENCE — the percentage multipliers.
// ===========================================================================

const ED: Rung[] = [
  [1, 8, 15],
  [8, 16, 25],
  [16, 26, 40],
  [26, 41, 60],
  [38, 61, 85],
  [50, 86, 115],
  [62, 116, 150],
  [76, 151, 200],
];
const ED_GREAT: Rung[] = [
  [58, 200, 250],
  [68, 251, 310],
  [78, 311, 380],
  [86, 381, 460],
  [93, 461, 560],
];

named(pre('pre.ed', tr('+{v}% Enhanced Damage'), 'enhancedDamage', 'enhancedDamage', ED, { categories: WEAPONS }), tr('Jagged'));
named(suf('suf.ed', tr('+{v}% Enhanced Damage'), 'enhancedDamage', 'enhancedDamage', ED, { categories: WEAPONS }), tr('of Slaying'));
named(pre('pre.ed.great', tr('+{v}% Enhanced Damage'), 'enhancedDamage', 'enhancedDamage', ED_GREAT, {
  categories: WEAPONS,
  minRarity: 'rare',
  rarity: 0.28,
}), tr("Tyrant's"));

const EDEF: Rung[] = [
  [1, 10, 20],
  [8, 21, 35],
  [16, 36, 55],
  [26, 56, 80],
  [38, 81, 110],
  [50, 111, 150],
  [62, 151, 200],
  [76, 201, 260],
];
const EDEF_GREAT: Rung[] = [
  [58, 260, 320],
  [68, 321, 390],
  [78, 391, 470],
  [86, 471, 560],
  [93, 561, 680],
];

named(pre('pre.edef', tr('+{v}% Enhanced Defense'), 'enhancedDefense', 'enhancedDefense', EDEF, { categories: ARMOR }), tr('Reinforced'));
named(suf('suf.edef', tr('+{v}% Enhanced Defense'), 'enhancedDefense', 'enhancedDefense', EDEF, { categories: ARMOR }), tr('of the Bulwark'));
named(pre('pre.edef.great', tr('+{v}% Enhanced Defense'), 'enhancedDefense', 'enhancedDefense', EDEF_GREAT, {
  categories: ARMOR,
  minRarity: 'rare',
  rarity: 0.28,
}), tr('Adamantine'));

const DEF: Rung[] = [
  [1, 4, 10],
  [8, 11, 22],
  [16, 23, 40],
  [26, 41, 65],
  [38, 66, 100],
  [50, 101, 150],
  [62, 151, 220],
  [76, 221, 320],
];

named(pre('pre.def', tr('+{v} Defense'), 'defense', 'flatDefense', DEF, { categories: DEFENSIVE }), tr('Sturdy'));
named(suf('suf.def', tr('+{v} Defense'), 'defense', 'flatDefense', DEF, { categories: DEFENSIVE }), tr('of Protection'));
named(pre('pre.def.great', tr('+{v} Defense'), 'defense', 'flatDefense', [
  [58, 300, 400],
  [68, 401, 520],
  [78, 521, 670],
  [88, 671, 860],
], { categories: DEFENSIVE, minRarity: 'rare', rarity: 0.3 }), tr('Impenetrable'));

// ===========================================================================
// SPEED
// ===========================================================================

// Sized like the reference games: about 3 to 20% a line on gear, a little
// more on a weapon's or gloves' own lines, never a blur when stacked (the
// game turns the sum into real speed with diminishing returns and a
// ceiling, `sim/Speed.ts`). A save from before this scale moves its rolls
// onto it, keeping their place in the range (`rescaleOldSpeed`, sim/Loot.ts).
const ASPD: Rung[] = [
  [1, 3, 5],
  [10, 6, 8],
  [20, 9, 11],
  [32, 12, 13],
  [44, 14, 16],
  [58, 17, 18],
  [72, 19, 20],
];
const CSPD: Rung[] = [
  [1, 3, 5],
  [10, 6, 8],
  [20, 9, 11],
  [32, 12, 13],
  [44, 14, 16],
  [58, 17, 18],
  [72, 19, 20],
];

named(pre('pre.aspd', tr('+{v}% Attack Speed'), 'attackSpeed', 'attackSpeed', ASPD, { categories: [...WEAPONS, 'gloves', 'ring', 'amulet'] }), tr('Quick'));
named(suf('suf.aspd', tr('+{v}% Attack Speed'), 'attackSpeed', 'attackSpeed', ASPD, { categories: [...WEAPONS, 'gloves', 'ring', 'amulet'] }), tr('of Alacrity'));
named(suf('suf.aspd.great', tr('+{v}% Attack Speed'), 'attackSpeed', 'attackSpeed', [
  [58, 21, 22],
  [70, 23, 24],
  [82, 25, 26],
], { categories: [...WEAPONS, 'gloves', 'ring', 'amulet'], minRarity: 'rare', rarity: 0.22 }), tr('of Frenzy'));

named(pre('pre.cspd', tr('+{v}% Cast Speed'), 'castSpeed', 'castSpeed', CSPD, { categories: [...CASTER, ...JEWELRY, 'gloves', 'helm'] }), tr('Fluent'));
named(suf('suf.cspd', tr('+{v}% Cast Speed'), 'castSpeed', 'castSpeed', CSPD, { categories: [...CASTER, ...JEWELRY, 'gloves', 'helm'] }), tr('of Focus'));
named(suf('suf.cspd.great', tr('+{v}% Cast Speed'), 'castSpeed', 'castSpeed', [
  [58, 21, 22],
  [70, 23, 24],
  [82, 25, 26],
], { categories: [...CASTER, ...JEWELRY, 'gloves', 'helm'], minRarity: 'rare', rarity: 0.22 }), tr('of Celerity'));

const MOVE: Rung[] = [
  [1, 3, 5],
  [12, 6, 9],
  [24, 10, 13],
  [38, 14, 18],
  [52, 19, 24],
  [68, 25, 30],
];

named(pre('pre.move', tr('+{v}% Movement Speed'), 'moveSpeed', 'moveSpeed', MOVE, { categories: BOOTS_JEWELRY }), tr('Swift'));
named(suf('suf.move', tr('+{v}% Movement Speed'), 'moveSpeed', 'moveSpeed', MOVE, { categories: BOOTS_JEWELRY }), tr('of Haste'));
named(suf('suf.move.great', tr('+{v}% Movement Speed'), 'moveSpeed', 'moveSpeed', [
  [60, 32, 38],
  [72, 39, 46],
  [84, 47, 56],
], { categories: BOOTS_JEWELRY, minRarity: 'rare', rarity: 0.24 }), tr('of the Gale'));

const CDR: Rung[] = [
  [12, 2, 4],
  [24, 5, 7],
  [38, 8, 11],
  [52, 12, 15],
  [68, 16, 20],
];

named(pre('pre.cdr', tr('+{v}% Cooldown Reduction'), 'cooldownReduction', 'cooldownReduction', CDR, {
  categories: [...JEWELRY, 'helm', 'belt', 'orb'],
}), tr('Attuned'));
named(suf('suf.cdr', tr('+{v}% Cooldown Reduction'), 'cooldownReduction', 'cooldownReduction', CDR, {
  categories: [...JEWELRY, 'helm', 'belt', 'orb'],
}), tr('of Readiness'));
named(suf('suf.cdr.great', tr('+{v}% Cooldown Reduction'), 'cooldownReduction', 'cooldownReduction', [
  [62, 22, 26],
  [74, 27, 32],
  [86, 33, 40],
], { categories: [...JEWELRY, 'helm', 'belt', 'orb'], minRarity: 'rare', rarity: 0.2 }), tr('of Timelessness'));

// ===========================================================================
// CRITICAL STRIKES
// ===========================================================================

const CRITC: Rung[] = [
  [1, 1, 2],
  [10, 3, 4],
  [20, 5, 6],
  [32, 7, 9],
  [44, 10, 12],
  [58, 13, 16],
  [72, 17, 20],
];
const CRITD: Rung[] = [
  [1, 5, 12],
  [8, 13, 22],
  [16, 23, 35],
  [26, 36, 50],
  [38, 51, 70],
  [50, 71, 95],
  [62, 96, 125],
  [76, 126, 160],
];

named(pre('pre.critc', tr('+{v}% Critical Strike Chance'), 'critChance', 'critChance', CRITC, { categories: OFFENSIVE }), tr('Keen'));
named(suf('suf.critc', tr('+{v}% Critical Strike Chance'), 'critChance', 'critChance', CRITC, { categories: OFFENSIVE }), tr('of Precision'));
named(pre('pre.critc.great', tr('+{v}% Critical Strike Chance'), 'critChance', 'critChance', [
  [58, 22, 26],
  [70, 27, 32],
  [82, 33, 40],
], { categories: OFFENSIVE, minRarity: 'rare', rarity: 0.2 }), tr("Executioner's"));

named(pre('pre.critd', tr('+{v}% Critical Strike Damage'), 'critDamage', 'critDamage', CRITD, { categories: OFFENSIVE }), tr('Cruel'));
named(suf('suf.critd', tr('+{v}% Critical Strike Damage'), 'critDamage', 'critDamage', CRITD, { categories: OFFENSIVE }), tr('of Ruin'));
named(suf('suf.critd.great', tr('+{v}% Critical Strike Damage'), 'critDamage', 'critDamage', [
  [58, 175, 220],
  [70, 221, 275],
  [80, 276, 340],
  [90, 341, 420],
], { categories: OFFENSIVE, minRarity: 'rare', rarity: 0.24 }), tr('of the Godslayer'));

// ===========================================================================
// LEECH
// ===========================================================================

const LSTEAL: Rung[] = [
  [6, 1, 1],
  [16, 2, 2],
  [26, 3, 3],
  [38, 4, 5],
  [52, 6, 7],
  [66, 8, 9],
  [80, 10, 12],
];
const MSTEAL: Rung[] = [
  [6, 1, 1],
  [16, 2, 2],
  [26, 3, 3],
  [38, 4, 4],
  [52, 5, 6],
  [66, 7, 8],
  [80, 9, 10],
];

named(pre('pre.lsteal', tr('{v}% of Damage Stolen as Life'), 'lifeSteal', 'lifeSteal', LSTEAL, { categories: OFFENSIVE }), tr('Bloodthirsty'));
named(suf('suf.lsteal', tr('{v}% of Damage Stolen as Life'), 'lifeSteal', 'lifeSteal', LSTEAL, { categories: OFFENSIVE }), tr('of the Leech'));
named(suf('suf.lsteal.great', tr('{v}% of Damage Stolen as Life'), 'lifeSteal', 'lifeSteal', [
  [64, 13, 15],
  [76, 16, 18],
  [88, 19, 22],
], { categories: OFFENSIVE, minRarity: 'rare', rarity: 0.18 }), tr('of the Vampire'));

named(pre('pre.msteal', tr('{v}% of Damage Stolen as Mana'), 'manaSteal', 'manaSteal', MSTEAL, { categories: OFFENSIVE }), tr('Siphoning'));
named(suf('suf.msteal', tr('{v}% of Damage Stolen as Mana'), 'manaSteal', 'manaSteal', MSTEAL, { categories: OFFENSIVE }), tr('of the Lamprey'));
named(suf('suf.msteal.great', tr('{v}% of Damage Stolen as Mana'), 'manaSteal', 'manaSteal', [
  [64, 11, 13],
  [76, 14, 16],
  [88, 17, 20],
], { categories: OFFENSIVE, minRarity: 'rare', rarity: 0.18 }), tr('of the Devourer'));

// ===========================================================================
// FLAT ELEMENTAL DAMAGE
// ===========================================================================

const FIRE: Rung[] = [
  [1, 2, 5],
  [8, 6, 12],
  [16, 13, 24],
  [26, 25, 42],
  [38, 43, 68],
  [50, 69, 105],
  [62, 106, 160],
  [76, 161, 240],
];
const COLD: Rung[] = [
  [1, 2, 4],
  [8, 5, 10],
  [16, 11, 20],
  [26, 21, 36],
  [38, 37, 58],
  [50, 59, 90],
  [62, 91, 138],
  [76, 139, 205],
];
const LIGHT: Rung[] = [
  [1, 1, 7],
  [8, 4, 16],
  [16, 9, 31],
  [26, 17, 54],
  [38, 30, 88],
  [50, 48, 136],
  [62, 74, 208],
  [76, 112, 312],
];
const POISON: Rung[] = [
  [1, 3, 6],
  [8, 7, 14],
  [16, 15, 28],
  [26, 29, 50],
  [38, 51, 80],
  [50, 81, 124],
  [62, 125, 190],
  [76, 191, 285],
];
const ARCANE: Rung[] = [
  [1, 2, 5],
  [10, 6, 13],
  [20, 14, 26],
  [30, 27, 46],
  [42, 47, 74],
  [54, 75, 114],
  [66, 115, 175],
  [80, 176, 262],
];

named(pre('pre.fire', tr('Adds {v} Fire Damage'), 'fireDamage', 'fireDamage', FIRE, { categories: OFFENSIVE }), tr('Fiery'));
named(suf('suf.fire', tr('Adds {v} Fire Damage'), 'fireDamage', 'fireDamage', FIRE, { categories: OFFENSIVE }), tr('of Flame'));
named(pre('pre.fire.great', tr('Adds {v} Fire Damage'), 'fireDamage', 'fireDamage', [
  [58, 260, 340],
  [70, 341, 450],
  [82, 451, 600],
], { categories: OFFENSIVE, minRarity: 'rare', rarity: 0.26 }), tr('Infernal'));

named(pre('pre.cold', tr('Adds {v} Cold Damage'), 'coldDamage', 'coldDamage', COLD, { categories: OFFENSIVE }), tr('Chilling'));
named(suf('suf.cold', tr('Adds {v} Cold Damage'), 'coldDamage', 'coldDamage', COLD, { categories: OFFENSIVE }), tr('of Frost'));
named(pre('pre.cold.great', tr('Adds {v} Cold Damage'), 'coldDamage', 'coldDamage', [
  [58, 225, 295],
  [70, 296, 390],
  [82, 391, 520],
], { categories: OFFENSIVE, minRarity: 'rare', rarity: 0.26 }), tr('Hibernal'));

named(pre('pre.light', tr('Adds {v} Lightning Damage'), 'lightningDamage', 'lightningDamage', LIGHT, { categories: OFFENSIVE }), tr('Static'));
named(suf('suf.light', tr('Adds {v} Lightning Damage'), 'lightningDamage', 'lightningDamage', LIGHT, { categories: OFFENSIVE }), tr('of Thunder'));
named(pre('pre.light.great', tr('Adds {v} Lightning Damage'), 'lightningDamage', 'lightningDamage', [
  [58, 170, 440],
  [70, 250, 590],
  [82, 360, 790],
], { categories: OFFENSIVE, minRarity: 'rare', rarity: 0.26 }), tr('Fulminating'));

named(pre('pre.poison', tr('Adds {v} Poison Damage'), 'poisonDamage', 'poisonDamage', POISON, { categories: OFFENSIVE }), tr('Septic'));
named(suf('suf.poison', tr('Adds {v} Poison Damage'), 'poisonDamage', 'poisonDamage', POISON, { categories: OFFENSIVE }), tr('of Venom'));
named(pre('pre.poison.great', tr('Adds {v} Poison Damage'), 'poisonDamage', 'poisonDamage', [
  [58, 310, 405],
  [70, 406, 535],
  [82, 536, 710],
], { categories: OFFENSIVE, minRarity: 'rare', rarity: 0.26 }), tr('Pestilent'));

named(pre('pre.arcane', tr('Adds {v} Arcane Damage'), 'arcaneDamage', 'arcaneDamage', ARCANE, { categories: OFFENSIVE }), tr('Eldritch'));
named(suf('suf.arcane', tr('Adds {v} Arcane Damage'), 'arcaneDamage', 'arcaneDamage', ARCANE, { categories: OFFENSIVE }), tr('of the Void'));
named(pre('pre.arcane.great', tr('Adds {v} Arcane Damage'), 'arcaneDamage', 'arcaneDamage', [
  [60, 285, 375],
  [72, 376, 495],
  [84, 496, 655],
], { categories: OFFENSIVE, minRarity: 'rare', rarity: 0.26 }), tr('Unreal'));

// ===========================================================================
// DAMAGE MULTIPLIERS
// ===========================================================================

const ELEPCT: Rung[] = [
  [6, 3, 6],
  [16, 7, 11],
  [28, 12, 17],
  [40, 18, 24],
  [54, 25, 32],
  [68, 33, 42],
  [80, 43, 55],
];
const AREA: Rung[] = [
  [10, 4, 8],
  [22, 9, 14],
  [34, 15, 22],
  [48, 23, 32],
  [62, 33, 45],
  [76, 46, 60],
];

named(pre('pre.elepct', tr('+{v}% Elemental Damage'), 'elementalDamagePct', 'elementalPct', ELEPCT, { categories: OFFENSIVE }), tr('Prismatic'));
named(suf('suf.elepct', tr('+{v}% Elemental Damage'), 'elementalDamagePct', 'elementalPct', ELEPCT, { categories: OFFENSIVE }), tr('of the Elements'));
named(pre('pre.elepct.great', tr('+{v}% Elemental Damage'), 'elementalDamagePct', 'elementalPct', [
  [62, 58, 72],
  [74, 73, 90],
  [86, 91, 115],
], { categories: OFFENSIVE, minRarity: 'rare', rarity: 0.22 }), tr('Cataclysmic'));

named(pre('pre.area', tr('+{v}% Area Damage'), 'areaDamagePct', 'areaDamage', AREA, { categories: OFFENSIVE }), tr('Sweeping'));
named(suf('suf.area', tr('+{v}% Area Damage'), 'areaDamagePct', 'areaDamage', AREA, { categories: OFFENSIVE }), tr('of Devastation'));
named(suf('suf.area.great', tr('+{v}% Area Damage'), 'areaDamagePct', 'areaDamage', [
  [64, 64, 80],
  [76, 81, 100],
  [88, 101, 128],
], { categories: OFFENSIVE, minRarity: 'rare', rarity: 0.22 }), tr('of the Maelstrom'));

// ===========================================================================
// RESISTANCES AND MITIGATION
// ===========================================================================

const RES: Rung[] = [
  [1, 5, 10],
  [10, 11, 17],
  [20, 18, 25],
  [32, 26, 34],
  [44, 35, 44],
  [58, 45, 55],
  [72, 56, 70],
];
const RES_GREAT: Rung[] = [
  [62, 62, 74],
  [74, 75, 88],
  [86, 89, 105],
];

function resistPair(
  key: string,
  stat: StatKey,
  group: string,
  label: string,
  preWord: string,
  sufWord: string,
  greatWord: string,
): void {
  named(pre(`pre.${key}`, label, stat, group, RES, { categories: DEFENSIVE }), preWord);
  named(suf(`suf.${key}`, label, stat, group, RES, { categories: DEFENSIVE }), sufWord);
  named(
    suf(`suf.${key}.great`, label, stat, group, RES_GREAT, { categories: DEFENSIVE, minRarity: 'rare', rarity: 0.3 }),
    greatWord,
  );
}

resistPair('fireres', 'fireResist', 'fireResist', tr('+{v}% Fire Resistance'), tr('Emberwarded'), tr('of the Salamander'), tr('of the Phoenix'));
resistPair('coldres', 'coldResist', 'coldResist', tr('+{v}% Cold Resistance'), tr('Frostwarded'), tr('of the Bear'), tr('of the Glacier'));
resistPair('lightres', 'lightningResist', 'lightningResist', tr('+{v}% Lightning Resistance'), tr('Stormwarded'), tr('of the Tempest'), tr('of the Thunderhead'));
resistPair('poisonres', 'poisonResist', 'poisonResist', tr('+{v}% Poison Resistance'), tr('Blightwarded'), tr('of the Serpent'), tr('of the Hydra'));
resistPair('arcaneres', 'arcaneResist', 'arcaneResist', tr('+{v}% Arcane Resistance'), tr('Nullwarded'), tr('of the Null'), tr('of the Silence'));

const PHYSRES: Rung[] = [
  [8, 1, 3],
  [20, 4, 6],
  [32, 7, 9],
  [46, 10, 13],
  [60, 14, 17],
  [74, 18, 22],
];
named(pre('pre.physres', tr('+{v}% Physical Resistance'), 'physicalResist', 'physicalResist', PHYSRES, { categories: DEFENSIVE }), tr('Stonebound'));
named(suf('suf.physres', tr('+{v}% Physical Resistance'), 'physicalResist', 'physicalResist', PHYSRES, { categories: DEFENSIVE }), tr('of Stone'));
named(suf('suf.physres.great', tr('+{v}% Physical Resistance'), 'physicalResist', 'physicalResist', [
  [64, 24, 28],
  [78, 29, 34],
  [90, 35, 42],
], { categories: DEFENSIVE, minRarity: 'rare', rarity: 0.18 }), tr('of the Mountain'));

const DR: Rung[] = [
  [6, 1, 2],
  [18, 3, 4],
  [30, 5, 6],
  [44, 7, 9],
  [58, 10, 12],
  [72, 13, 16],
];
named(pre('pre.dr', tr('{v}% Damage Reduction'), 'damageReduction', 'damageReduction', DR, { categories: DEFENSIVE }), tr('Padded'));
named(suf('suf.dr', tr('{v}% Damage Reduction'), 'damageReduction', 'damageReduction', DR, { categories: DEFENSIVE }), tr('of Absorption'));
named(suf('suf.dr.great', tr('{v}% Damage Reduction'), 'damageReduction', 'damageReduction', [
  [66, 18, 21],
  [78, 22, 26],
  [90, 27, 32],
], { categories: DEFENSIVE, minRarity: 'rare', rarity: 0.16 }), tr('of the Aegis'));

const BLOCK: Rung[] = [
  [1, 2, 4],
  [12, 5, 7],
  [24, 8, 11],
  [38, 12, 15],
  [52, 16, 20],
  [68, 21, 26],
];
named(pre('pre.block', tr('+{v}% Block Chance'), 'blockChance', 'blockChance', BLOCK, { categories: SHIELD_ONLY }), tr('Guarding'));
named(suf('suf.block', tr('+{v}% Block Chance'), 'blockChance', 'blockChance', BLOCK, { categories: SHIELD_ONLY }), tr('of Deflection'));
named(suf('suf.block.great', tr('+{v}% Block Chance'), 'blockChance', 'blockChance', [
  [62, 28, 33],
  [76, 34, 40],
  [88, 41, 48],
], { categories: SHIELD_ONLY, minRarity: 'rare', rarity: 0.2 }), tr('of the Sentinel'));

// ===========================================================================
// FIND
// ===========================================================================

const MF: Rung[] = [
  [1, 4, 8],
  [10, 9, 15],
  [20, 16, 24],
  [32, 25, 35],
  [46, 36, 50],
  [60, 51, 70],
  [76, 71, 95],
];
const GF: Rung[] = [
  [1, 10, 20],
  [10, 21, 40],
  [20, 41, 65],
  [32, 66, 95],
  [46, 96, 135],
  [60, 136, 190],
  [76, 191, 260],
];

named(pre('pre.mf', tr('+{v}% Magic Find'), 'magicFind', 'magicFind', MF), tr('Lucky'));
named(suf('suf.mf', tr('+{v}% Magic Find'), 'magicFind', 'magicFind', MF), tr('of Fortune'));
named(pre('pre.mf.great', tr('+{v}% Magic Find'), 'magicFind', 'magicFind', [
  [62, 105, 130],
  [76, 131, 165],
  [88, 166, 210],
], { minRarity: 'rare', rarity: 0.18 }), tr("Kingsmark"));

named(pre('pre.gf', tr('+{v}% Gold Find'), 'goldFind', 'goldFind', GF), tr('Greedy'));
named(suf('suf.gf', tr('+{v}% Gold Find'), 'goldFind', 'goldFind', GF), tr('of Wealth'));
named(pre('pre.gf.great', tr('+{v}% Gold Find'), 'goldFind', 'goldFind', [
  [62, 290, 360],
  [76, 361, 450],
  [88, 451, 580],
], { minRarity: 'rare', rarity: 0.2 }), tr("Midas'"));

// ===========================================================================
// SKILL LEVELS — the rarest and most build-defining line in the pool.
// ===========================================================================

const SKILLS: Rung[] = [
  [18, 1, 1],
  [34, 1, 1],
  [50, 2, 2],
  [66, 2, 2],
  [82, 3, 3],
];

named(pre('pre.skills', tr('+{v} to All Skills'), 'skillLevels', 'skillLevels', SKILLS, {
  categories: [...CASTER, ...JEWELRY, 'helm', 'chest'],
  minRarity: 'rare',
  rarity: 0.12,
}), tr('Mystic'));
named(suf('suf.skills', tr('+{v} to All Skills'), 'skillLevels', 'skillLevels', SKILLS, {
  categories: [...CASTER, ...JEWELRY, 'helm', 'chest'],
  minRarity: 'rare',
  rarity: 0.12,
}), tr('of the Ascendant'));
named(suf('suf.skills.great', tr('+{v} to All Skills'), 'skillLevels', 'skillLevels', [
  [70, 3, 3],
  [84, 4, 4],
  [94, 5, 5],
], { categories: [...CASTER, ...JEWELRY], minRarity: 'rare', rarity: 0.04 }), tr('of the Ancients'));

// ===========================================================================
// SPECIALIST AFFIXES — narrow slots, unusually strong for their ilvl.
// ===========================================================================

named(pre('pre.melee.brutal', tr('+{v}% Enhanced Damage'), 'enhancedDamage', 'enhancedDamage', [
  [20, 45, 70],
  [34, 71, 100],
  [48, 101, 140],
  [62, 141, 190],
  [78, 191, 250],
], { categories: MELEE, rarity: 0.5 }), tr('Brutal'));

named(pre('pre.ranged.piercing', tr('+{v}% Critical Strike Damage'), 'critDamage', 'critDamage', [
  [16, 40, 60],
  [30, 61, 88],
  [44, 89, 124],
  [58, 125, 170],
  [74, 171, 230],
], { categories: RANGED, rarity: 0.5 }), tr('Piercing'));

named(suf('suf.caster.channeled', tr('+{v}% Elemental Damage'), 'elementalDamagePct', 'elementalPct', [
  [18, 14, 20],
  [32, 21, 28],
  [46, 29, 38],
  [60, 39, 50],
  [76, 51, 66],
], { categories: CASTER, rarity: 0.5 }), tr('of Channeling'));

named(pre('pre.shield.wall', tr('+{v} Defense'), 'defense', 'flatDefense', [
  [14, 55, 85],
  [28, 86, 130],
  [42, 131, 195],
  [58, 196, 285],
  [74, 286, 410],
], { categories: SHIELD_ONLY, rarity: 0.5 }), tr('Wallbound'));

named(suf('suf.gloves.grip', tr('+{v}% Attack Speed'), 'attackSpeed', 'attackSpeed', [
  [14, 9, 11],
  [28, 12, 14],
  [42, 15, 17],
  [58, 18, 20],
  [76, 21, 22],
], { categories: HANDS, rarity: 0.45 }), tr('of the Iron Grip'));

named(pre('pre.helm.crown', tr('+{v} to Life'), 'life', 'lifeFlat', [
  [16, 60, 95],
  [30, 96, 145],
  [44, 146, 210],
  [60, 211, 300],
  [78, 301, 420],
], { categories: ['helm', 'chest'], rarity: 0.45 }), tr('Crowned'));

named(suf('suf.belt.gird', tr('{v}% Damage Reduction'), 'damageReduction', 'damageReduction', [
  [20, 4, 6],
  [34, 7, 9],
  [48, 10, 13],
  [64, 14, 18],
  [80, 19, 24],
], { categories: ['belt', 'shield'], rarity: 0.4 }), tr('of Girding'));

named(pre('pre.boots.tread', tr('+{v}% Movement Speed'), 'moveSpeed', 'moveSpeed', [
  [16, 12, 17],
  [30, 18, 23],
  [44, 24, 30],
  [60, 31, 38],
  [78, 39, 48],
], { categories: ['boots'], rarity: 0.4 }), tr('Windborne'));

named(suf('suf.amulet.oracle', tr('+{v}% Cooldown Reduction'), 'cooldownReduction', 'cooldownReduction', [
  [22, 8, 11],
  [36, 12, 15],
  [50, 16, 20],
  [66, 21, 26],
  [82, 27, 34],
], { categories: ['amulet', 'orb'], rarity: 0.35 }), tr('of the Oracle'));

named(pre('pre.ring.serpent', tr('+{v} to Mana'), 'mana', 'manaFlat', [
  [18, 90, 130],
  [32, 131, 185],
  [46, 186, 260],
  [62, 261, 360],
  [80, 361, 500],
], { categories: ['ring', 'amulet'], rarity: 0.4 }), tr("Serpent's"));

named(suf('suf.dagger.assassin', tr('+{v}% Critical Strike Chance'), 'critChance', 'critChance', [
  [14, 6, 8],
  [28, 9, 11],
  [42, 12, 15],
  [58, 16, 19],
  [76, 20, 24],
], { categories: ['dagger', 'bow', 'crossbow'], rarity: 0.4 }), tr("Assassin's"));

named(suf('suf.twohand.reaver', tr('+{v}% Area Damage'), 'areaDamagePct', 'areaDamage', [
  [20, 18, 26],
  [34, 27, 36],
  [48, 37, 48],
  [64, 49, 62],
  [80, 63, 80],
], { categories: ['axe', 'mace', 'spear'], rarity: 0.4 }), tr('of the Reaver'));


named(suf('suf.quiver.hunt', tr('+{v} to Maximum Damage'), 'maxDamage', 'maxDamage', [
  [10, 12, 20],
  [24, 21, 34],
  [40, 35, 55],
  [56, 56, 84],
  [74, 85, 125],
], { categories: ['quiver'], rarity: 0.6 }), tr('of the Hunt'));

named(pre('pre.orb.conduit', tr('+{v}% Cast Speed'), 'castSpeed', 'castSpeed', [
  [16, 10, 12],
  [30, 13, 15],
  [44, 16, 18],
  [60, 19, 21],
  [78, 22, 23],
], { categories: ['orb', 'wand'], rarity: 0.4 }), tr('Conduit'));

named(suf('suf.weapon.vorpal', tr('+{v} to Maximum Damage'), 'maxDamage', 'maxDamage', [
  [24, 30, 46],
  [38, 47, 68],
  [52, 69, 98],
  [68, 99, 138],
  [84, 139, 195],
], { categories: MELEE, rarity: 0.35 }), tr('of Vorpal Edge'));

named(pre('pre.armor.warded', tr('+{v}% Arcane Resistance'), 'arcaneResist', 'arcaneResist', [
  [24, 28, 38],
  [38, 39, 50],
  [52, 51, 64],
  [68, 65, 80],
  [84, 81, 100],
], { categories: ARMOR, rarity: 0.3 }), tr('Nullforged'));

named(suf('suf.armor.thorned', tr('+{v} to Minimum Damage'), 'minDamage', 'minDamage', [
  [12, 6, 10],
  [26, 11, 17],
  [40, 18, 27],
  [56, 28, 41],
  [74, 42, 62],
], { categories: ['gloves', 'shield', 'chest'], rarity: 0.35 }), tr('of Thorns'));

named(pre('pre.jewel.opulent', tr('+{v}% Gold Find'), 'goldFind', 'goldFind', [
  [12, 60, 95],
  [26, 96, 145],
  [40, 146, 210],
  [58, 211, 300],
  [76, 301, 420],
], { categories: JEWELRY, rarity: 0.4 }), tr('Opulent'));

named(suf('suf.jewel.seeker', tr('+{v}% Magic Find'), 'magicFind', 'magicFind', [
  [12, 22, 32],
  [26, 33, 46],
  [40, 47, 64],
  [58, 65, 88],
  [76, 89, 120],
], { categories: JEWELRY, rarity: 0.35 }), tr("of the Seeker"));

named(pre('pre.weapon.leeching', tr('{v}% of Damage Stolen as Life'), 'lifeSteal', 'lifeSteal', [
  [28, 5, 6],
  [42, 7, 8],
  [56, 9, 11],
  [72, 12, 14],
  [86, 15, 18],
], { categories: MELEE, rarity: 0.3 }), tr('Sanguine'));

named(suf('suf.weapon.unbound', tr('+{v}% Enhanced Damage'), 'enhancedDamage', 'enhancedDamage', [
  [30, 95, 130],
  [44, 131, 175],
  [58, 176, 230],
  [74, 231, 300],
  [88, 301, 390],
], { categories: WEAPONS, rarity: 0.3 }), tr('of the Unbound'));

named(pre('pre.armor.eternal', tr('+{v}% Enhanced Defense'), 'enhancedDefense', 'enhancedDefense', [
  [30, 120, 165],
  [44, 166, 220],
  [58, 221, 290],
  [74, 291, 380],
  [88, 381, 490],
], { categories: ARMOR, rarity: 0.3 }), tr('Everlasting'));

named(suf('suf.any.pilgrim', tr('+{v} to Vitality'), 'vitality', 'vitality', [
  [20, 18, 26],
  [34, 27, 36],
  [50, 37, 48],
  [66, 49, 62],
  [82, 63, 80],
], { rarity: 0.35 }), tr("of the Pilgrim"));

named(pre('pre.any.blessed', tr('+{v} Life Regeneration'), 'lifeRegen', 'lifeRegen', [
  [18, 14, 20],
  [32, 21, 29],
  [48, 30, 40],
  [64, 41, 54],
  [80, 55, 72],
], { rarity: 0.35 }), tr('Blessed'));

named(suf('suf.any.arcanum', tr('+{v}% Mana Regeneration'), 'manaRegen', 'manaRegen', [
  [18, 26, 36],
  [32, 37, 50],
  [48, 51, 68],
  [64, 69, 90],
  [80, 91, 120],
], { rarity: 0.35 }), tr('of the Arcanum'));

named(pre('pre.any.warlord', tr('+{v} to Strength'), 'strength', 'strength', [
  [24, 26, 34],
  [38, 35, 45],
  [52, 46, 58],
  [68, 59, 74],
  [84, 75, 95],
], { categories: [...ARMOR, ...JEWELRY, ...MELEE], rarity: 0.3 }), tr("Warlord's"));

named(suf('suf.any.falcon', tr('+{v} to Dexterity'), 'dexterity', 'dexterity', [
  [24, 26, 34],
  [38, 35, 45],
  [52, 46, 58],
  [68, 59, 74],
  [84, 75, 95],
], { categories: [...ARMOR, ...JEWELRY, ...RANGED, 'dagger'], rarity: 0.3 }), tr('of the Falcon'));

// ===========================================================================
// CHARMS
// ===========================================================================
//
// A charm works from the pack, so a full pack of them is the strongest build
// in the game unless each one is small. Every charm ladder is a jewellery
// ladder cut down for the charm's size: a Small Charm holds about a third of
// a ring's line, a Grand Charm most of one. Per cell of pack the small ones
// are the most efficient; only Grand Charms can hold the lines that change a
// build (skills, crits, cast speed), which is what their six cells pay for.

const CHARM_SIZES: Array<{ base: string; scale: number; from: number }> = [
  { base: 'charm.small', scale: 0.3, from: 1 },
  { base: 'charm.medium', scale: 0.45, from: 8 },
  { base: 'charm.large', scale: 0.6, from: 16 },
  { base: 'charm.grand', scale: 0.8, from: 28 },
];

/**
 * Speed lines on a charm take half the charm's usual share (a Grand Charm's
 * attack or cast speed is 1 to 8%), because charms stack in the pack and
 * speed is the one line that turns a hero into a blur. Unique charms follow
 * the same rule (`uniqueBatches/kit.ts`).
 */
export const CHARM_SPEED_SHARE = 0.5;

/** Lines any charm can hold. */
const CHARM_STATS: StatKey[] = [
  'life', 'mana', 'strength', 'dexterity', 'vitality', 'energy', 'attackRating', 'minDamage', 'maxDamage',
  'fireDamage', 'coldDamage', 'lightningDamage', 'poisonDamage', 'fireResist', 'coldResist',
  'lightningResist', 'poisonResist', 'arcaneResist', 'magicFind', 'goldFind', 'lifeRegen', 'manaRegen',
  'defense', 'moveSpeed',
];
/** Lines only a Grand Charm can hold. */
const GRAND_STATS: StatKey[] = ['critChance', 'critDamage', 'elementalDamagePct', 'enhancedDamage', 'attackSpeed', 'castSpeed'];

function charmLadders(): void {
  const jewel = (a: AffixDef): boolean =>
    !a.categories || a.categories.length === 0 || a.categories.includes('ring') || a.categories.includes('amulet');
  const source = new Map<string, AffixDef>();
  for (const a of AFFIX_LIST) {
    if (!jewel(a) || a.slots) continue;
    const key = a.stat;
    if (!source.has(key)) source.set(key, a);
  }
  for (const [i, size] of CHARM_SIZES.entries()) {
    const stats = size.base === 'charm.grand' ? [...CHARM_STATS, ...GRAND_STATS] : CHARM_STATS;
    for (const stat of stats) {
      const src = source.get(stat);
      if (!src) continue;
      const scale = size.scale * (stat === 'attackSpeed' || stat === 'castSpeed' ? CHARM_SPEED_SHARE : 1);
      const tiers: AffixTier[] = src.tiers.map((t) => {
        const min = Math.max(1, Math.round(t.min * scale));
        return { ...t, ilvl: Math.max(t.ilvl, size.from), min, max: Math.max(min, Math.round(t.max * scale)) };
      });
      const def: AffixDef = {
        id: `charm.${i}.${stat}`,
        label: src.label,
        stat,
        kind: src.kind,
        group: `charm.${stat}`,
        tiers,
        categories: ['charm'],
        bases: [size.base],
      };
      AFFIX_LIST.push(def);
      const word = NAME_WORDS.get(src.id);
      if (word) NAME_WORDS.set(def.id, word);
    }
  }
  // The rarest line in the pack: one more rank to every skill, Grand only.
  const hallowed = pre('charm.3.skillLevels', tr('+{v} to All Skills'), 'skillLevels', 'charm.skillLevels', [[45, 1, 1]], {
    categories: ['charm'],
    minRarity: 'magic',
    rarity: 0.12,
  });
  hallowed.bases = ['charm.grand'];
  NAME_WORDS.set(hallowed.id, 'Hallowed');
}
charmLadders();

// ===========================================================================
// Export
// ===========================================================================

export const AFFIXES: AffixDef[] = AFFIX_LIST;

const AFFIX_BY_ID = new Map<string, AffixDef>(AFFIXES.map((a) => [a.id, a]));

export function getAffix(id: string): AffixDef | undefined {
  return AFFIX_BY_ID.get(id);
}

export const PREFIXES: AffixDef[] = AFFIXES.filter((a) => a.kind === 'prefix');
export const SUFFIXES: AffixDef[] = AFFIXES.filter((a) => a.kind === 'suffix');

/** Every distinct affix group, for tooling and sanity checks. */
export function affixGroups(): string[] {
  return Array.from(new Set(AFFIXES.map((a) => a.group))).sort();
}
