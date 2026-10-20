/**
 * SLAY — sockets, gems, runes and runewords.
 *
 * The same gem does a *different* job depending on what you put it in. A
 * ruby is damage in a sword, life in a breastplate, and fire resist in a ring,
 * so the interesting decision is never "which gem is best", it is "which of my
 * sockets needs this most".
 *
 * Gems come in eleven families x six qualities (66 total). Runes are a separate,
 * rarer track: four veins, six cuts each. Runes in the right vein order spell
 * runewords, and deeper cuts make the same word stronger.
 */

import type { ItemCategory, StatKey } from '../types';
import { tr, trc } from '../core/I18n';

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
  /** The family's name alone: "Ruby". */
  familyName: string;
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
  chipped: tr('Chipped'),
  flawed: tr('Flawed'),
  normal: '',
  flawless: tr('Flawless'),
  perfect: tr('Perfect'),
  divine: tr('Divine'),
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
    name: tr('Ruby'),
    color: 0xe0323c,
    weapon: [{ stat: 'fireDamage', v: [3, 7, 13, 22, 36, 58] }],
    armor: [{ stat: 'life', v: [8, 18, 32, 55, 92, 150] }],
    jewelry: [{ stat: 'fireResist', v: [8, 13, 19, 26, 34, 44] }],
  },
  {
    family: 'sapphire',
    name: tr('Sapphire'),
    color: 0x3a6ce0,
    weapon: [{ stat: 'coldDamage', v: [3, 6, 11, 19, 32, 52] }],
    armor: [{ stat: 'mana', v: [9, 20, 36, 62, 104, 170] }],
    jewelry: [{ stat: 'coldResist', v: [8, 13, 19, 26, 34, 44] }],
  },
  {
    family: 'topaz',
    name: tr('Topaz'),
    color: 0xf0d038,
    weapon: [{ stat: 'lightningDamage', v: [4, 9, 17, 29, 48, 78] }],
    armor: [{ stat: 'magicFind', v: [4, 7, 11, 16, 22, 30] }],
    jewelry: [{ stat: 'lightningResist', v: [8, 13, 19, 26, 34, 44] }],
  },
  {
    family: 'emerald',
    name: tr('Emerald'),
    color: 0x35c05a,
    weapon: [{ stat: 'poisonDamage', v: [4, 9, 16, 27, 45, 72] }],
    armor: [{ stat: 'dexterity', v: [3, 6, 10, 15, 22, 32] }],
    jewelry: [{ stat: 'poisonResist', v: [8, 13, 19, 26, 34, 44] }],
  },
  {
    family: 'amethyst',
    name: tr('Amethyst'),
    color: 0x9a52d8,
    weapon: [{ stat: 'arcaneDamage', v: [3, 7, 13, 23, 38, 62] }],
    armor: [{ stat: 'strength', v: [3, 6, 10, 15, 22, 32] }],
    jewelry: [{ stat: 'arcaneResist', v: [8, 13, 19, 26, 34, 44] }],
  },
  {
    family: 'diamond',
    name: tr('Diamond'),
    color: 0xdff0ff,
    weapon: [{ stat: 'attackRating', v: [18, 42, 78, 135, 220, 350] }],
    armor: [{ stat: 'defense', v: [12, 27, 48, 82, 138, 225] }],
    jewelry: [{ stat: 'physicalResist', v: [2, 4, 6, 8, 11, 15] }],
  },
  {
    family: 'skull',
    name: tr('Skull'),
    color: 0xd6cdb4,
    weapon: [{ stat: 'lifeSteal', v: [1, 2, 3, 4, 6, 8] }],
    armor: [{ stat: 'lifeRegen', v: [2, 4, 7, 12, 19, 30] }],
    jewelry: [{ stat: 'manaSteal', v: [1, 2, 3, 4, 5, 7] }],
  },
  {
    family: 'onyx',
    name: tr('Onyx'),
    color: 0x241f2e,
    weapon: [{ stat: 'critDamage', v: [8, 15, 24, 36, 52, 75] }],
    armor: [{ stat: 'damageReduction', v: [1, 2, 3, 5, 7, 10] }],
    jewelry: [{ stat: 'critChance', v: [1, 2, 3, 4, 6, 8] }],
  },
  {
    family: 'opal',
    name: tr('Opal'),
    color: 0xb8e0d8,
    weapon: [{ stat: 'castSpeed', v: [2, 3, 4, 6, 8, 10] }],
    armor: [{ stat: 'manaRegen', v: [3, 6, 10, 16, 25, 38] }],
    jewelry: [{ stat: 'energy', v: [3, 6, 10, 15, 22, 32] }],
  },
  {
    family: 'garnet',
    name: tr('Garnet'),
    color: 0xa8202c,
    weapon: [{ stat: 'attackSpeed', v: [2, 3, 4, 6, 8, 10] }],
    armor: [{ stat: 'vitality', v: [3, 6, 10, 15, 22, 32] }],
    jewelry: [{ stat: 'lifeSteal', v: [1, 1, 2, 3, 4, 6] }],
  },
  {
    family: 'citrine',
    name: tr('Citrine'),
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
        name: prefix ? trc('gem name: quality, then stone', '{0} {1}', prefix, fam.name) : fam.name,
        family: fam.family,
        familyName: fam.name,
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

/**
 * SLAY's runes come from four veins, each cut six ways. A vein is a theme you
 * can read at a glance; a cut is how deep in the dark it was found. Runewords
 * are spelled by vein, not by one exact stone, so a low cut works early and a
 * deeper cut of the same vein makes the same word stronger.
 */
export type RuneVein = 'ember' | 'rime' | 'marrow' | 'umbra';

export const RUNE_VEINS: readonly RuneVein[] = ['ember', 'rime', 'marrow', 'umbra'];

export const VEIN_INFO: Record<RuneVein, { name: string; color: number; theme: string }> = {
  ember: { name: tr('Ember'), color: 0xd8642a, theme: tr('Fire and fury') },
  rime: { name: tr('Rime'), color: 0x86c4e8, theme: tr('Frost, storm and the mind') },
  marrow: { name: tr('Marrow'), color: 0xd8ccaa, theme: tr('Bone, blood and endurance') },
  umbra: { name: tr('Umbra'), color: 0x9a68d8, theme: tr('Venom, void and fortune') },
};

/** How many cuts each vein has. */
export const RUNE_CUTS = 6;

export interface RuneDef {
  id: string;
  name: string;
  vein: RuneVein;
  /** 1..6 — how deep the cut. Drives drop rarity and runeword strength. */
  cut: number;
  /** 1..24 — position on the whole ladder, cut first, then vein. */
  order: number;
  levelReq: number;
  color: number;
  value: number;
  minDepth: number;
  weapon: GemBonus[];
  armor: GemBonus[];
  jewelry: GemBonus[];
}

/** [name, vein, cut, weaponStat, wVal, armorStat, aVal, jewelStat, jVal] */
type RuneRow = [string, RuneVein, number, StatKey, number, StatKey, number, StatKey, number];

const RUNE_ROWS: RuneRow[] = [
  // Ember: fire and fury.
  [tr('Krae'), 'ember', 1, 'fireDamage', 5, 'strength', 3, 'attackSpeed', 2],
  [tr('Torvek'), 'ember', 2, 'enhancedDamage', 15, 'fireResist', 15, 'fireDamage', 8],
  [tr('Ashmar'), 'ember', 3, 'fireDamage', 18, 'strength', 8, 'critChance', 3],
  [tr('Brannoc'), 'ember', 4, 'attackSpeed', 6, 'enhancedDefense', 25, 'strength', 12],
  [tr('Skarth'), 'ember', 5, 'fireDamage', 40, 'fireResist', 30, 'enhancedDamage', 25],
  [tr('Ignavar'), 'ember', 6, 'enhancedDamage', 45, 'strength', 18, 'attackSpeed', 7],
  // Rime: frost, storm and the mind.
  [tr('Sile'), 'rime', 1, 'coldDamage', 4, 'mana', 15, 'manaRegen', 5],
  [tr('Vessa'), 'rime', 2, 'manaSteal', 2, 'coldResist', 15, 'castSpeed', 3],
  [tr('Hollin'), 'rime', 3, 'lightningDamage', 16, 'energy', 8, 'mana', 40],
  [tr('Neveth'), 'rime', 4, 'castSpeed', 6, 'lightningResist', 25, 'cooldownReduction', 4],
  [tr('Caelith'), 'rime', 5, 'coldDamage', 34, 'coldResist', 30, 'manaRegen', 30],
  [tr('Ilvren'), 'rime', 6, 'cooldownReduction', 8, 'energy', 18, 'castSpeed', 8],
  // Marrow: bone, blood and endurance.
  [tr('Grod'), 'marrow', 1, 'minDamage', 2, 'defense', 12, 'life', 10],
  [tr('Osk'), 'marrow', 2, 'lifeSteal', 1, 'vitality', 4, 'lifeRegen', 4],
  [tr('Durgan'), 'marrow', 3, 'maxDamage', 8, 'life', 35, 'physicalResist', 3],
  [tr('Ossuan'), 'marrow', 4, 'lifeSteal', 3, 'damageReduction', 4, 'vitality', 10],
  [tr('Gorrath'), 'marrow', 5, 'maxDamage', 22, 'life', 90, 'lifeRegen', 14],
  [tr('Morvagh'), 'marrow', 6, 'lifeSteal', 5, 'physicalResist', 8, 'life', 120],
  // Umbra: venom, void and fortune.
  [tr('Thes'), 'umbra', 1, 'poisonDamage', 6, 'poisonResist', 15, 'goldFind', 20],
  [tr('Vyx'), 'umbra', 2, 'critChance', 2, 'arcaneResist', 15, 'magicFind', 6],
  [tr('Nhal'), 'umbra', 3, 'arcaneDamage', 16, 'dexterity', 8, 'critDamage', 10],
  [tr('Xoreth'), 'umbra', 4, 'critDamage', 20, 'moveSpeed', 5, 'dexterity', 12],
  [tr('Sablon'), 'umbra', 5, 'critChance', 6, 'magicFind', 18, 'critDamage', 25],
  [tr('Umbrael'), 'umbra', 6, 'critDamage', 50, 'moveSpeed', 8, 'skillLevels', 1],
];

/** Level and depth where each cut starts. Veins of one cut stagger by a level. */
const CUT_LEVEL = [1, 10, 20, 30, 42, 54];
const CUT_DEPTH = [1, 9, 20, 32, 46, 62];

export const RUNES: RuneDef[] = RUNE_ROWS.map((row) => {
  const [name, vein, cut, ws, wv, as, av, js, jv] = row;
  const v = RUNE_VEINS.indexOf(vein);
  const lift = 1 + (cut - 1) * 0.06;
  const c = VEIN_INFO[vein].color;
  const ch = (shift: number) => Math.min(255, Math.round(((c >> shift) & 255) * lift));
  return {
    id: `rune.${name.toLowerCase()}`,
    name: tr('{0} Rune', name),
    vein,
    cut,
    order: (cut - 1) * RUNE_VEINS.length + v + 1,
    levelReq: CUT_LEVEL[cut - 1]! + v,
    color: (ch(16) << 16) | (ch(8) << 8) | ch(0),
    value: Math.round(60 * Math.pow(4.5, cut - 1)),
    minDepth: CUT_DEPTH[cut - 1]!,
    weapon: [{ stat: ws, value: wv }],
    armor: [{ stat: as, value: av }],
    jewelry: [{ stat: js, value: jv }],
  };
}).sort((a, b) => a.order - b.order);

/**
 * Runes from before SLAY cut its own, by their old ids. Each takes the new
 * rune at the same height on the ladder, so a saved stash keeps its worth.
 */
const OLD_RUNE_IDS = [
  'el', 'eld', 'tir', 'nef', 'eth', 'ith', 'tal', 'ral', 'ort', 'thul', 'amn',
  'sol', 'shael', 'dol', 'hel', 'io', 'lum', 'ko', 'fal', 'lem', 'pul', 'um',
  'mal', 'ist', 'gul', 'vex', 'ohm', 'lo', 'sur', 'ber', 'jah', 'cham', 'zod',
];
export const LEGACY_RUNE_IDS: Record<string, string> = Object.fromEntries(
  OLD_RUNE_IDS.map((old, i) => {
    const at = Math.min(RUNES.length, Math.max(1, Math.round(((i + 1) * RUNES.length) / OLD_RUNE_IDS.length)));
    return [`rune.${old}`, RUNES[at - 1]!.id];
  }),
);

// ---------------------------------------------------------------------------
// Runewords
// ---------------------------------------------------------------------------

/** One runeword line: its value with first-cut runes, and what each deeper cut adds. */
export interface RunewordMod {
  stat: StatKey;
  base: number;
  perCut: number;
}

export interface RunewordDef {
  id: string;
  name: string;
  /** The veins, in socket order. Any cut of a vein counts. */
  veins: RuneVein[];
  /** Categories the host base must belong to. */
  categories: ItemCategory[];
  flavor: string;
  mods: RunewordMod[];
}

/** `perCut` 0 keeps a line as written at every cut (skill levels). */
function rw(
  id: string,
  name: string,
  veins: RuneVein[],
  categories: ItemCategory[],
  flavor: string,
  mods: Array<[StatKey, number, number]>,
): RunewordDef {
  return { id, name, veins, categories, flavor, mods: mods.map(([stat, base, perCut]) => ({ stat, base, perCut })) };
}

const E: RuneVein = 'ember';
const R: RuneVein = 'rime';
const M: RuneVein = 'marrow';
const U: RuneVein = 'umbra';

const MELEE: ItemCategory[] = ['sword', 'axe', 'mace', 'dagger', 'spear'];
const RANGED: ItemCategory[] = ['bow', 'crossbow'];
const CASTER: ItemCategory[] = ['wand', 'staff', 'scepter', 'orb'];
const BODY: ItemCategory[] = ['chest'];
const HEAD: ItemCategory[] = ['helm'];
const SHIELDS: ItemCategory[] = ['shield'];
const LEGS: ItemCategory[] = ['pants'];
const HANDS_FEET: ItemCategory[] = ['gloves', 'boots', 'belt'];

export const RUNEWORDS: RunewordDef[] = [
  // --- melee ----------------------------------------------------------------
  rw('rw.kindling', tr('Spark and Tinder'), [E, E], MELEE, tr('Two sparks, struck close, and the blade remembers being in the forge.'), [
    ['fireDamage', 8, 8],
    ['attackSpeed', 6, 1],
  ]),
  rw('rw.red-tithe', tr('Red Tithe'), [E, M], MELEE, tr('Every cut pays something back. Nobody asks to whom.'), [
    ['enhancedDamage', 20, 12],
    ['lifeSteal', 2, 1],
  ]),
  rw('rw.hoarfang', tr('Hoarfang'), [R, M], MELEE, tr('The wound frosts over before it can bleed.'), [
    ['coldDamage', 7, 7],
    ['damageReduction', 2, 1],
  ]),
  rw('rw.splinter', tr('Splinter'), [U, E], ['dagger', 'sword', 'spear'], tr('It breaks off inside, and keeps working.'), [
    ['critChance', 3, 1],
    ['critDamage', 10, 8],
  ]),
  rw('rw.gravedigger', tr('Gravedigger'), [M, M, M], ['mace', 'axe'], tr('Heavy enough to dig with. It has.'), [
    ['maxDamage', 10, 8],
    ['enhancedDamage', 30, 15],
    ['strength', 5, 3],
  ]),
  rw('rw.widows-wake', tr("Widow's Wake"), [U, U, E], MELEE, tr('Black veils, and somebody always dressed for it in advance.'), [
    ['critDamage', 25, 12],
    ['critChance', 3, 1],
    ['poisonDamage', 10, 8],
  ]),
  rw('rw.last-rites', tr('Last Rites'), [M, U, M, U], MELEE, tr('Said quickly, and only ever over the other man.'), [
    ['skillLevels', 1, 0],
    ['lifeSteal', 3, 1],
    ['enhancedDamage', 40, 20],
    ['vitality', 6, 3],
  ]),
  rw('rw.pyre-saint', tr('Pyre Saint'), [E, R, E, M], ['sword', 'axe', 'mace', 'spear'], tr('Burned once for heresy. Came back to argue the point.'), [
    ['fireDamage', 20, 14],
    ['coldDamage', 12, 9],
    ['enhancedDamage', 30, 18],
    ['life', 30, 20],
  ]),
  // --- ranged ---------------------------------------------------------------
  rw('rw.gutter-wind', tr('Gutter Wind'), [U, E], RANGED, tr('It smells of the street, and it never misses the gutter.'), [
    ['attackSpeed', 8, 1.4],
    ['critChance', 2, 1],
  ]),
  rw('rw.grey-fletch', tr('Grey Fletch'), [R, U, R], RANGED, tr('Feathers from a bird nobody has seen alive.'), [
    ['coldDamage', 10, 8],
    ['dexterity', 6, 3],
    ['moveSpeed', 4, 1],
  ]),
  rw('rw.thousand-nails', tr('Thousand Nails'), [E, U, E, U], RANGED, tr('Count them as they land. You will run out of numbers.'), [
    ['skillLevels', 1, 0],
    ['enhancedDamage', 40, 20],
    ['critDamage', 20, 10],
    ['attackSpeed', 8, 1.4],
  ]),
  // --- casters --------------------------------------------------------------
  rw('rw.banked-coals', tr('Banked Coals'), [R, E], CASTER, tr('Cold on top. Lift the ash and see.'), [
    ['fireDamage', 6, 6],
    ['castSpeed', 5, 1.2],
    ['manaRegen', 8, 4],
  ]),
  rw('rw.hollow-choir', tr('Hollow Choir'), [R, U, R], CASTER, tr('Voices in the wood, singing a half beat ahead of you.'), [
    ['skillLevels', 1, 0],
    ['mana', 30, 20],
    ['castSpeed', 7, 1.4],
  ]),
  rw('rw.ash-psalm', tr('Ash Psalm'), [E, U, E], CASTER, tr('Read aloud, it leaves soot on the tongue.'), [
    ['fireDamage', 12, 10],
    ['critChance', 2, 1],
    ['cooldownReduction', 3, 1],
  ]),
  rw('rw.drowned-psalm', tr('Drowned Psalm'), [R, R, M, R], ['staff', 'orb'], tr('Sung under the lake, where the bells still ring.'), [
    ['skillLevels', 2, 0],
    ['coldDamage', 14, 10],
    ['manaRegen', 20, 8],
    ['life', 25, 15],
  ]),
  // --- chest ----------------------------------------------------------------
  rw('rw.bone-cage', tr('Bone Cage'), [M, M], BODY, tr('Ribs over your ribs. Something still breathes inside.'), [
    ['life', 25, 20],
    ['damageReduction', 3, 1],
  ]),
  rw('rw.ember-mantle', tr('Ember Mantle'), [E, M, E], BODY, tr('Warm in the coldest crypt. Too warm, some nights.'), [
    ['fireResist', 15, 5],
    ['strength', 6, 3],
    ['enhancedDefense', 40, 20],
  ]),
  rw('rw.pale-vigil', tr('Pale Vigil'), [R, U, M], BODY, tr('Kept by someone who stopped sleeping a long time ago.'), [
    ['fireResist', 12, 4],
    ['coldResist', 12, 4],
    ['lightningResist', 12, 4],
    ['poisonResist', 12, 4],
    ['arcaneResist', 12, 4],
  ]),
  rw('rw.grave-wedding', tr('Grave Wedding'), [U, M, U, M], BODY, tr('Till death, the vows said. Nobody said whose.'), [
    ['skillLevels', 1, 0],
    ['life', 40, 25],
    ['moveSpeed', 6, 1],
    ['critChance', 2, 1],
  ]),
  // --- helm -----------------------------------------------------------------
  rw('rw.crow-hood', tr('Crow Hood'), [U, R], HEAD, tr('It sees what glitters first, and tells you second.'), [
    ['magicFind', 8, 4],
    ['energy', 4, 2],
    ['lightningResist', 12, 4],
  ]),
  rw('rw.iron-halo', tr('Iron Halo'), [M, E, M], HEAD, tr('A saint wore it. The saint did not get it back.'), [
    ['life', 20, 15],
    ['strength', 5, 3],
    ['physicalResist', 3, 1],
  ]),
  // --- shield ---------------------------------------------------------------
  rw('rw.shut-door', tr('Shut Door'), [M, R], SHIELDS, tr('Whatever is knocking can wait outside.'), [
    ['blockChance', 6, 2],
    ['defense', 20, 15],
    ['coldResist', 12, 5],
  ]),
  rw('rw.wall-of-teeth', tr('Wall of Teeth'), [M, E, M], SHIELDS, tr('It bites the hand that strikes it.'), [
    ['blockChance', 8, 2],
    ['enhancedDefense', 40, 20],
    ['maxDamage', 5, 4],
  ]),
  // --- legs, hands, feet ----------------------------------------------------
  rw('rw.long-road', tr('Long Road'), [U, M], LEGS, tr('Walked once by a pilgrim who never stopped.'), [
    ['moveSpeed', 5, 1],
    ['vitality', 4, 2],
    ['poisonResist', 12, 4],
  ]),
  rw('rw.coal-walker', tr('Coal Walker'), [E, R, E], LEGS, tr('Barefoot over the fire pits, on a dare, every night.'), [
    ['fireResist', 15, 5],
    ['coldResist', 15, 5],
    ['life', 20, 15],
  ]),
  rw('rw.knucklebones', tr('Knucklebones'), [M], HANDS_FEET, tr('Rolled for luck. Worn for the same reason.'), [
    ['minDamage', 2, 2],
    ['goldFind', 15, 8],
  ]),
  rw('rw.quickfrost', tr('Quickfrost'), [R, E], HANDS_FEET, tr('Cold feet, hot hands, and no time to think.'), [
    ['attackSpeed', 4, 1],
    ['castSpeed', 4, 1],
    ['moveSpeed', 3, 1],
  ]),
];

/** The cut each socketed rune has, or null when a socket is empty or holds a gem. */
function cutsOf(socketIds: ReadonlyArray<string | null>): number[] | null {
  const cuts: number[] = [];
  for (const id of socketIds) {
    const rune = id ? RUNE_BY_ID.get(id) : undefined;
    if (!rune) return null;
    cuts.push(rune.cut);
  }
  return cuts;
}

/**
 * A runeword's lines for the runes actually socketed: each line grows with
 * the average cut, so the same word spelled in deeper runes hits harder.
 */
export function runewordBonuses(word: RunewordDef, socketIds: ReadonlyArray<string | null>): GemBonus[] {
  const cuts = cutsOf(socketIds) ?? [1];
  const avg = cuts.reduce((a, b) => a + b, 0) / cuts.length;
  return word.mods.map((m) => ({ stat: m.stat, value: Math.round(m.base + m.perCut * (avg - 1)) }));
}

/** Level needed to wear a runeword: its highest rune's. */
export function runewordLevel(socketIds: ReadonlyArray<string | null>): number {
  let lvl = 1;
  for (const id of socketIds) lvl = Math.max(lvl, (id && RUNE_BY_ID.get(id)?.levelReq) || 1);
  return lvl;
}

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
 * Detects a runeword from a socket layout: every socket holds a rune, the
 * veins run in the word's order, the socket count matches exactly, and the
 * host category is legal. Any cut of a vein counts.
 */
export function matchRuneword(socketIds: Array<string | null>, category: ItemCategory): RunewordDef | null {
  if (socketIds.length === 0) return null;
  const veins: RuneVein[] = [];
  for (const id of socketIds) {
    const rune = id ? RUNE_BY_ID.get(id) : undefined;
    if (!rune) return null;
    veins.push(rune.vein);
  }
  for (const word of RUNEWORDS) {
    if (word.veins.length !== veins.length) continue;
    if (!word.categories.includes(category)) continue;
    if (word.veins.every((v, i) => v === veins[i])) return word;
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
    // Four veins share a cut, so each rune takes a quarter of the cut's share.
    const rune = RUNE_BY_ID.get(def.id);
    const cut = rune ? rune.cut : 1;
    return 10 / Math.pow(4.4, cut - 1);
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

/** Three runes of one kind make the next cut of the same vein. */
export function runeUpgradeRecipe(runeId: string): { from: string; count: number; to: string } | null {
  const rune = RUNE_BY_ID.get(runeId);
  if (!rune || rune.cut >= RUNE_CUTS) return null;
  const next = RUNES.find((r) => r.vein === rune.vein && r.cut === rune.cut + 1);
  return next ? { from: rune.id, count: 3, to: next.id } : null;
}
