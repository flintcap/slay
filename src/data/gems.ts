/**
 * SLAY — sockets, gems, runes and runewords.
 *
 * D2's socket system, kept because it is the best "free build slot" ever
 * designed: the same gem does a *different* job depending on what you put it
 * in. A ruby is damage in a sword, life in a breastplate, and fire resist in a
 * ring — so the interesting decision is never "which gem is best", it is
 * "which of my three sockets needs this most".
 *
 * Gems come in eleven families x six qualities (66 total). Runes are a separate,
 * rarer track: individually weak, but combinations spell out runewords whose
 * bonuses are wildly out of line with their level requirement.
 */

import type { ItemCategory, StatKey } from '../types';

export type SocketTarget = 'weapon' | 'armor' | 'jewelry';

export type GemQuality = 'chipped' | 'flawed' | 'normal' | 'flawless' | 'perfect' | 'divine';

export interface GemBonus {
  stat: StatKey;
  value: number;
}

export interface GemDef {
  id: string;
  name: string;
  family: string;
  quality: GemQuality;
  /** 0..5 — index into the quality ladder. */
  qualityIndex: number;
  levelReq: number;
  color: number;
  value: number;
  weapon: GemBonus[];
  armor: GemBonus[];
  jewelry: GemBonus[];
  /** Depth at which this quality starts dropping. */
  minDepth: number;
}

const QUALITIES: GemQuality[] = ['chipped', 'flawed', 'normal', 'flawless', 'perfect', 'divine'];
const QUALITY_PREFIX: Record<GemQuality, string> = {
  chipped: 'Chipped',
  flawed: 'Flawed',
  normal: '',
  flawless: 'Flawless',
  perfect: 'Perfect',
  divine: 'Divine',
};
const QUALITY_LEVEL = [1, 9, 19, 32, 48, 68];
const QUALITY_DEPTH = [1, 8, 18, 30, 46, 70];
const QUALITY_VALUE = [30, 110, 340, 1100, 3800, 14000];

/** Ladder of six values for one socket target. */
type Ladder = [number, number, number, number, number, number];

interface GemFamilySpec {
  family: string;
  name: string;
  color: number;
  weapon: Array<{ stat: StatKey; v: Ladder }>;
  armor: Array<{ stat: StatKey; v: Ladder }>;
  jewelry: Array<{ stat: StatKey; v: Ladder }>;
}

const GEM_FAMILIES: GemFamilySpec[] = [
  {
    family: 'ruby',
    name: 'Ruby',
    color: 0xe0323c,
    weapon: [{ stat: 'fireDamage', v: [3, 7, 13, 22, 36, 58] }],
    armor: [{ stat: 'life', v: [8, 18, 32, 55, 92, 150] }],
    jewelry: [{ stat: 'fireResist', v: [8, 13, 19, 26, 34, 44] }],
  },
  {
    family: 'sapphire',
    name: 'Sapphire',
    color: 0x3a6ce0,
    weapon: [{ stat: 'coldDamage', v: [3, 6, 11, 19, 32, 52] }],
    armor: [{ stat: 'mana', v: [9, 20, 36, 62, 104, 170] }],
    jewelry: [{ stat: 'coldResist', v: [8, 13, 19, 26, 34, 44] }],
  },
  {
    family: 'topaz',
    name: 'Topaz',
    color: 0xf0d038,
    weapon: [{ stat: 'lightningDamage', v: [4, 9, 17, 29, 48, 78] }],
    armor: [{ stat: 'magicFind', v: [4, 7, 11, 16, 22, 30] }],
    jewelry: [{ stat: 'lightningResist', v: [8, 13, 19, 26, 34, 44] }],
  },
  {
    family: 'emerald',
    name: 'Emerald',
    color: 0x35c05a,
    weapon: [{ stat: 'poisonDamage', v: [4, 9, 16, 27, 45, 72] }],
    armor: [{ stat: 'dexterity', v: [3, 6, 10, 15, 22, 32] }],
    jewelry: [{ stat: 'poisonResist', v: [8, 13, 19, 26, 34, 44] }],
  },
  {
    family: 'amethyst',
    name: 'Amethyst',
    color: 0x9a52d8,
    weapon: [{ stat: 'arcaneDamage', v: [3, 7, 13, 23, 38, 62] }],
    armor: [{ stat: 'strength', v: [3, 6, 10, 15, 22, 32] }],
    jewelry: [{ stat: 'arcaneResist', v: [8, 13, 19, 26, 34, 44] }],
  },
  {
    family: 'diamond',
    name: 'Diamond',
    color: 0xdff0ff,
    weapon: [{ stat: 'attackRating', v: [18, 42, 78, 135, 220, 350] }],
    armor: [{ stat: 'defense', v: [12, 27, 48, 82, 138, 225] }],
    jewelry: [{ stat: 'physicalResist', v: [2, 4, 6, 8, 11, 15] }],
  },
  {
    family: 'skull',
    name: 'Skull',
    color: 0xd6cdb4,
    weapon: [{ stat: 'lifeSteal', v: [1, 2, 3, 4, 6, 8] }],
    armor: [{ stat: 'lifeRegen', v: [2, 4, 7, 12, 19, 30] }],
    jewelry: [{ stat: 'manaSteal', v: [1, 2, 3, 4, 5, 7] }],
  },
  {
    family: 'onyx',
    name: 'Onyx',
    color: 0x241f2e,
    weapon: [{ stat: 'critDamage', v: [8, 15, 24, 36, 52, 75] }],
    armor: [{ stat: 'damageReduction', v: [1, 2, 3, 5, 7, 10] }],
    jewelry: [{ stat: 'critChance', v: [1, 2, 3, 4, 6, 8] }],
  },
  {
    family: 'opal',
    name: 'Opal',
    color: 0xb8e0d8,
    weapon: [{ stat: 'castSpeed', v: [4, 7, 11, 15, 20, 27] }],
    armor: [{ stat: 'manaRegen', v: [3, 6, 10, 16, 25, 38] }],
    jewelry: [{ stat: 'energy', v: [3, 6, 10, 15, 22, 32] }],
  },
  {
    family: 'garnet',
    name: 'Garnet',
    color: 0xa8202c,
    weapon: [{ stat: 'attackSpeed', v: [4, 7, 11, 15, 20, 27] }],
    armor: [{ stat: 'vitality', v: [3, 6, 10, 15, 22, 32] }],
    jewelry: [{ stat: 'lifeSteal', v: [1, 1, 2, 3, 4, 6] }],
  },
  {
    family: 'citrine',
    name: 'Citrine',
    color: 0xe0a038,
    weapon: [{ stat: 'goldFind', v: [12, 24, 40, 62, 92, 135] }],
    armor: [{ stat: 'moveSpeed', v: [2, 3, 5, 7, 9, 12] }],
    jewelry: [{ stat: 'goldFind', v: [15, 30, 50, 78, 115, 170] }],
  },
];

function buildGems(): GemDef[] {
  const out: GemDef[] = [];
  for (const fam of GEM_FAMILIES) {
    for (let q = 0; q < QUALITIES.length; q++) {
      const quality = QUALITIES[q];
      const prefix = QUALITY_PREFIX[quality];
      out.push({
        id: `gem.${fam.family}.${quality}`,
        name: prefix ? `${prefix} ${fam.name}` : fam.name,
        family: fam.family,
        quality,
        qualityIndex: q,
        levelReq: QUALITY_LEVEL[q],
        color: fam.color,
        value: QUALITY_VALUE[q],
        minDepth: QUALITY_DEPTH[q],
        weapon: fam.weapon.map((b) => ({ stat: b.stat, value: b.v[q] })),
        armor: fam.armor.map((b) => ({ stat: b.stat, value: b.v[q] })),
        jewelry: fam.jewelry.map((b) => ({ stat: b.stat, value: b.v[q] })),
      });
    }
  }
  return out;
}

export const GEMS: GemDef[] = buildGems();

// ---------------------------------------------------------------------------
// Runes
// ---------------------------------------------------------------------------

export interface RuneDef {
  id: string;
  name: string;
  /** 1..33 — position in the rune ladder, drives drop rarity hard. */
  order: number;
  levelReq: number;
  color: number;
  value: number;
  minDepth: number;
  weapon: GemBonus[];
  armor: GemBonus[];
  jewelry: GemBonus[];
}

/** [name, level, weaponStat, wVal, armorStat, aVal, jewelStat, jVal] */
type RuneRow = [string, number, StatKey, number, StatKey, number, StatKey, number];

const RUNE_ROWS: RuneRow[] = [
  ['El', 1, 'attackRating', 50, 'defense', 15, 'magicFind', 3],
  ['Eld', 3, 'minDamage', 3, 'manaRegen', 5, 'physicalResist', 2],
  ['Tir', 5, 'manaSteal', 1, 'mana', 20, 'manaRegen', 6],
  ['Nef', 7, 'maxDamage', 6, 'defense', 30, 'blockChance', 2],
  ['Eth', 9, 'attackRating', 90, 'manaRegen', 10, 'arcaneResist', 6],
  ['Ith', 11, 'maxDamage', 9, 'damageReduction', 2, 'lifeRegen', 5],
  ['Tal', 13, 'poisonDamage', 12, 'poisonResist', 22, 'poisonResist', 16],
  ['Ral', 15, 'fireDamage', 14, 'fireResist', 22, 'fireResist', 16],
  ['Ort', 17, 'lightningDamage', 18, 'lightningResist', 22, 'lightningResist', 16],
  ['Thul', 19, 'coldDamage', 13, 'coldResist', 22, 'coldResist', 16],
  ['Amn', 21, 'lifeSteal', 3, 'physicalResist', 5, 'lifeSteal', 2],
  ['Sol', 23, 'minDamage', 10, 'damageReduction', 4, 'life', 40],
  ['Shael', 25, 'attackSpeed', 14, 'blockChance', 6, 'moveSpeed', 5],
  ['Dol', 27, 'lifeRegen', 12, 'life', 60, 'lifeRegen', 10],
  ['Hel', 29, 'cooldownReduction', 8, 'cooldownReduction', 8, 'cooldownReduction', 6],
  ['Io', 31, 'vitality', 10, 'vitality', 10, 'vitality', 10],
  ['Lum', 33, 'energy', 10, 'energy', 10, 'energy', 10],
  ['Ko', 35, 'dexterity', 10, 'dexterity', 10, 'dexterity', 10],
  ['Fal', 37, 'strength', 10, 'strength', 10, 'strength', 10],
  ['Lem', 39, 'goldFind', 75, 'goldFind', 50, 'goldFind', 90],
  ['Pul', 41, 'enhancedDamage', 22, 'enhancedDefense', 30, 'strength', 12],
  ['Um', 43, 'critChance', 6, 'physicalResist', 8, 'fireResist', 22],
  ['Mal', 45, 'damageReduction', 5, 'damageReduction', 7, 'physicalResist', 6],
  ['Ist', 47, 'magicFind', 30, 'magicFind', 25, 'magicFind', 35],
  ['Gul', 49, 'attackRating', 250, 'poisonResist', 30, 'maxDamage', 20],
  ['Vex', 51, 'manaSteal', 7, 'manaRegen', 30, 'mana', 100],
  ['Ohm', 53, 'enhancedDamage', 45, 'damageReduction', 9, 'critDamage', 30],
  ['Lo', 55, 'critChance', 12, 'physicalResist', 10, 'critDamage', 40],
  ['Sur', 57, 'mana', 130, 'life', 140, 'manaSteal', 6],
  ['Ber', 59, 'critDamage', 60, 'damageReduction', 12, 'physicalResist', 9],
  ['Jah', 61, 'life', 160, 'life', 180, 'lifeSteal', 6],
  ['Cham', 63, 'attackSpeed', 24, 'coldResist', 38, 'moveSpeed', 12],
  ['Zod', 66, 'skillLevels', 1, 'skillLevels', 1, 'skillLevels', 1],
];

const RUNE_COLORS = [0xd8a860, 0xd89a50, 0xd88c44, 0xd87e38, 0xd8702c, 0xd86220];

export const RUNES: RuneDef[] = RUNE_ROWS.map((row, i) => {
  const [name, levelReq, ws, wv, as, av, js, jv] = row;
  const order = i + 1;
  return {
    id: `rune.${name.toLowerCase()}`,
    name: `${name} Rune`,
    order,
    levelReq,
    color: RUNE_COLORS[Math.min(RUNE_COLORS.length - 1, Math.floor(i / 6))],
    value: Math.round(40 * Math.pow(1.42, order)),
    minDepth: Math.max(1, Math.round(order * 2.6 - 2)),
    weapon: [{ stat: ws, value: wv }],
    armor: [{ stat: as, value: av }],
    jewelry: [{ stat: js, value: jv }],
  };
});

// ---------------------------------------------------------------------------
// Runewords
// ---------------------------------------------------------------------------

export interface RunewordDef {
  id: string;
  name: string;
  /** Rune ids, in the exact socket order required. */
  runes: string[];
  /** Categories the host base must belong to. */
  categories: ItemCategory[];
  levelReq: number;
  flavor: string;
  /** Granted on top of the individual rune bonuses. */
  mods: GemBonus[];
}

function rw(
  id: string,
  name: string,
  runes: string[],
  categories: ItemCategory[],
  flavor: string,
  mods: Array<[StatKey, number]>,
): RunewordDef {
  const levelReq = runes.reduce((m, r) => {
    const def = RUNES.find((x) => x.id === r);
    return Math.max(m, def ? def.levelReq : 1);
  }, 1);
  return { id, name, runes, categories, levelReq, flavor, mods: mods.map(([stat, value]) => ({ stat, value })) };
}

const MELEE: ItemCategory[] = ['sword', 'axe', 'mace', 'dagger', 'spear'];
const ALL_WEAPON: ItemCategory[] = ['sword', 'axe', 'mace', 'dagger', 'spear', 'bow', 'crossbow', 'wand', 'staff', 'scepter'];
const BODY: ItemCategory[] = ['chest'];
const HEAD: ItemCategory[] = ['helm'];
const SHIELDS: ItemCategory[] = ['shield'];
const CASTER: ItemCategory[] = ['wand', 'staff', 'scepter', 'orb'];

export const RUNEWORDS: RunewordDef[] = [
  rw('rw.steel', 'Steel', ['rune.tir', 'rune.el'], ['sword', 'axe', 'mace'], 'The first thing a smith learns to write.', [
    ['enhancedDamage', 25],
    ['attackSpeed', 20],
    ['maxDamage', 3],
  ]),
  rw('rw.nadir', 'Nadir', ['rune.nef', 'rune.tir'], HEAD, 'Worn low, so nothing sees your face.', [
    ['enhancedDefense', 50],
    ['defense', 10],
    ['goldFind', -33],
    ['magicFind', 12],
  ]),
  rw('rw.malice', 'Malice', ['rune.ith', 'rune.el', 'rune.eth'], MELEE, 'It wants the fight more than you do.', [
    ['enhancedDamage', 33],
    ['lifeRegen', -5],
    ['attackRating', 100],
    ['critChance', 4],
  ]),
  rw('rw.stealth', 'Stealth', ['rune.tal', 'rune.eth'], BODY, 'The cloth does not rustle. Nothing about you does.', [
    ['moveSpeed', 12],
    ['castSpeed', 12],
    ['dexterity', 6],
    ['manaRegen', 15],
  ]),
  rw('rw.lore', 'Lore', ['rune.ort', 'rune.sol'], HEAD, 'Whispers the answer half a beat before you need it.', [
    ['skillLevels', 1],
    ['energy', 10],
    ['lightningResist', 30],
    ['damageReduction', 7],
  ]),
  rw('rw.ancients-pledge', "Ancient's Pledge", ['rune.ral', 'rune.ort', 'rune.tal'], SHIELDS, 'Sworn to the wall, not the sword.', [
    ['enhancedDefense', 50],
    ['fireResist', 43],
    ['coldResist', 48],
    ['lightningResist', 48],
    ['poisonResist', 48],
    ['physicalResist', 10],
  ]),
  rw('rw.spirit', 'Spirit', ['rune.tal', 'rune.thul', 'rune.ort', 'rune.amn'], ['sword', 'staff', 'scepter', 'shield'], 'Four notes, and the air holds them.', [
    ['skillLevels', 2],
    ['castSpeed', 30],
    ['mana', 100],
    ['life', 55],
    ['manaRegen', 20],
  ]),
  rw('rw.insight', 'Insight', ['rune.ral', 'rune.tir', 'rune.tal', 'rune.sol'], ['spear', 'staff', 'scepter'], 'A quiet certainty that outlasts your mana bar.', [
    ['manaRegen', 60],
    ['skillLevels', 1],
    ['attackRating', 200],
    ['enhancedDamage', 200],
    ['critChance', 5],
  ]),
  rw('rw.smoke', 'Smoke', ['rune.nef', 'rune.lum'], BODY, 'You were standing right there a moment ago.', [
    ['enhancedDefense', 75],
    ['fireResist', 50],
    ['coldResist', 50],
    ['lightningResist', 50],
    ['poisonResist', 50],
    ['energy', 10],
  ]),
  rw('rw.rhyme', 'Rhyme', ['rune.shael', 'rune.eth'], SHIELDS, 'Every blow answered in kind.', [
    ['blockChance', 20],
    ['magicFind', 25],
    ['goldFind', 50],
    ['poisonResist', 25],
  ]),
  rw('rw.honor', 'Honor', ['rune.amn', 'rune.el', 'rune.ith', 'rune.tir', 'rune.sol'], MELEE, 'You will be told, afterwards, that it was clean.', [
    ['enhancedDamage', 160],
    ['lifeSteal', 7],
    ['strength', 10],
    ['dexterity', 10],
    ['attackRating', 250],
    ['skillLevels', 1],
  ]),
  rw('rw.crescent-moon', 'Crescent Moon', ['rune.shael', 'rune.um', 'rune.tir'], ['sword', 'axe', 'spear'], 'A thin white line where the armour used to be.', [
    ['enhancedDamage', 220],
    ['lightningDamage', 45],
    ['physicalResist', 12],
    ['manaSteal', 9],
    ['critChance', 8],
  ]),
  rw('rw.duress', 'Duress', ['rune.shael', 'rune.um', 'rune.thul'], BODY, 'Pressure applied evenly, from every direction at once.', [
    ['enhancedDefense', 160],
    ['enhancedDamage', 30],
    ['coldDamage', 60],
    ['physicalResist', 15],
    ['critDamage', 40],
  ]),
  rw('rw.chaos', 'Chaos', ['rune.fal', 'rune.ohm', 'rune.um'], ['axe', 'mace', 'sword'], 'It does not swing so much as arrive.', [
    ['enhancedDamage', 290],
    ['attackSpeed', 35],
    ['arcaneDamage', 90],
    ['areaDamagePct', 40],
    ['skillLevels', 1],
  ]),
  rw('rw.call-to-arms', 'Call To Arms', ['rune.amn', 'rune.ral', 'rune.mal', 'rune.ist', 'rune.ohm'], ALL_WEAPON, 'A horn note that reaches the parts of you that had given up.', [
    ['skillLevels', 2],
    ['enhancedDamage', 300],
    ['lifeSteal', 8],
    ['life', 120],
    ['magicFind', 40],
    ['attackSpeed', 40],
  ]),
  rw('rw.enigma', 'Enigma', ['rune.jah', 'rune.ith', 'rune.ber'], BODY, 'Nobody agrees on where it takes you. Everybody agrees it does.', [
    ['skillLevels', 2],
    ['moveSpeed', 45],
    ['strength', 25],
    ['life', 180],
    ['damageReduction', 14],
    ['magicFind', 80],
  ]),
  rw('rw.infinity', 'Infinity', ['rune.ber', 'rune.mal', 'rune.ber', 'rune.ist'], ['spear', 'staff'], 'The far end of it has not been located.', [
    ['enhancedDamage', 320],
    ['lightningDamage', 260],
    ['elementalDamagePct', 55],
    ['skillLevels', 2],
    ['cooldownReduction', 12],
  ]),
  rw('rw.breath-of-the-dying', 'Breath of the Dying', ['rune.vex', 'rune.hel', 'rune.el', 'rune.eld', 'rune.zod', 'rune.eth'], ALL_WEAPON, 'The last thing a great many things ever heard.', [
    ['enhancedDamage', 400],
    ['lifeSteal', 14],
    ['attackRating', 500],
    ['strength', 30],
    ['dexterity', 30],
    ['critDamage', 90],
    ['skillLevels', 1],
  ]),
  rw('rw.hand-of-justice', 'Hand of Justice', ['rune.sur', 'rune.cham', 'rune.amn', 'rune.lo'], ALL_WEAPON, 'It does not care whose hand it is in.', [
    ['enhancedDamage', 360],
    ['attackSpeed', 45],
    ['fireDamage', 220],
    ['critChance', 14],
    ['lifeSteal', 9],
  ]),
  rw('rw.dream', 'Dream', ['rune.io', 'rune.jah', 'rune.pul'], HEAD, 'You wake up already holding the sword.', [
    ['skillLevels', 1],
    ['lightningDamage', 180],
    ['life', 130],
    ['mana', 130],
    ['magicFind', 35],
    ['castSpeed', 30],
  ]),
  rw('rw.grief', 'Grief', ['rune.eth', 'rune.tir', 'rune.lo', 'rune.mal', 'rune.ral'], ['sword', 'axe'], 'Cuts what it is pointed at and a little of what it is not.', [
    ['minDamage', 200],
    ['maxDamage', 240],
    ['attackSpeed', 40],
    ['critDamage', 110],
    ['physicalResist', 10],
  ]),
  rw('rw.heart-of-the-oak', 'Heart of the Oak', ['rune.ko', 'rune.vex', 'rune.pul', 'rune.thul'], CASTER, 'Old wood remembers every winter it survived.', [
    ['skillLevels', 3],
    ['castSpeed', 40],
    ['mana', 160],
    ['manaRegen', 45],
    ['fireResist', 40],
    ['coldResist', 40],
    ['lightningResist', 40],
    ['poisonResist', 40],
  ]),
];

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

const GEM_BY_ID = new Map<string, GemDef>(GEMS.map((g) => [g.id, g]));
const RUNE_BY_ID = new Map<string, RuneDef>(RUNES.map((r) => [r.id, r]));

export function getGem(id: string): GemDef | undefined {
  return GEM_BY_ID.get(id);
}

export function getRune(id: string): RuneDef | undefined {
  return RUNE_BY_ID.get(id);
}

/** Anything socketable: gem or rune, resolved to a common shape. */
export interface SocketableDef {
  id: string;
  name: string;
  levelReq: number;
  color: number;
  value: number;
  minDepth: number;
  weapon: GemBonus[];
  armor: GemBonus[];
  jewelry: GemBonus[];
  isRune: boolean;
}

const SOCKETABLE_BY_ID = new Map<string, SocketableDef>();
for (const g of GEMS) {
  SOCKETABLE_BY_ID.set(g.id, { ...g, isRune: false });
}
for (const r of RUNES) {
  SOCKETABLE_BY_ID.set(r.id, { ...r, isRune: true });
}

export const SOCKETABLES: SocketableDef[] = Array.from(SOCKETABLE_BY_ID.values());

export function getSocketable(id: string): SocketableDef | undefined {
  return SOCKETABLE_BY_ID.get(id);
}

/** Which of the three bonus tables applies to a host item's category. */
export function socketTargetFor(category: ItemCategory): SocketTarget {
  switch (category) {
    case 'sword':
    case 'axe':
    case 'mace':
    case 'dagger':
    case 'spear':
    case 'bow':
    case 'crossbow':
    case 'wand':
    case 'staff':
    case 'scepter':
      return 'weapon';
    case 'ring':
    case 'amulet':
    case 'charm':
    case 'orb':
      return 'jewelry';
    default:
      return 'armor';
  }
}

export function socketBonuses(socketableId: string, category: ItemCategory): GemBonus[] {
  const def = SOCKETABLE_BY_ID.get(socketableId);
  if (!def) return [];
  const target = socketTargetFor(category);
  return target === 'weapon' ? def.weapon : target === 'jewelry' ? def.jewelry : def.armor;
}

/**
 * Detects a runeword from a socket layout. Order matters, the socket count must
 * match exactly, and the host category must be legal.
 */
export function matchRuneword(socketIds: Array<string | null>, category: ItemCategory): RunewordDef | null {
  if (socketIds.length === 0 || socketIds.some((s) => s === null)) return null;
  const ids = socketIds as string[];
  for (const word of RUNEWORDS) {
    if (word.runes.length !== ids.length) continue;
    if (!word.categories.includes(category)) continue;
    let ok = true;
    for (let i = 0; i < ids.length; i++) {
      if (ids[i] !== word.runes[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return word;
  }
  return null;
}

/** Gem/rune pool legal to drop at a depth, weighted toward the low end. */
export function socketableDropPool(depth: number): SocketableDef[] {
  return SOCKETABLES.filter((s) => depth >= s.minDepth);
}

/** Rarity weight for a socketable at a given depth — runes fall off a cliff. */
export function socketableWeight(def: SocketableDef, depth: number): number {
  if (depth < def.minDepth) return 0;
  if (def.isRune) {
    const rune = RUNE_BY_ID.get(def.id);
    const order = rune ? rune.order : 1;
    return 40 / Math.pow(1.34, order - 1);
  }
  const gem = GEM_BY_ID.get(def.id);
  const q = gem ? gem.qualityIndex : 0;
  // Higher qualities become common only well past their unlock depth.
  const maturity = Math.min(1.6, 0.35 + (depth - def.minDepth) / 45);
  return (100 / Math.pow(2.15, q)) * maturity;
}

/** Three gems of the same family and quality make one of the next quality up. */
export function gemUpgradeRecipe(gemId: string): { from: string; count: number; to: string } | null {
  const gem = GEM_BY_ID.get(gemId);
  if (!gem || gem.qualityIndex >= QUALITIES.length - 1) return null;
  return { from: gem.id, count: 3, to: `gem.${gem.family}.${QUALITIES[gem.qualityIndex + 1]}` };
}
