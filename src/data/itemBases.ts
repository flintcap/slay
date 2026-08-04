/**
 * SLAY — item bases.
 *
 * Every droppable object in the game starts life here. Bases carry the *shape*
 * of an item (damage band, speed, defence, requirements, implicit properties)
 * and the declarative `visual` block that `art/ItemModels.ts` turns into a
 * mesh. Affixes, uniques and sets all layer on top of a base — nothing rolls
 * out of thin air.
 *
 * ## The balance curve
 *
 * Weapons are authored against a single target-DPS ladder so that no family is
 * accidentally dominant:
 *
 *     targetDps(levelReq) = 5.5 + 0.9 * levelReq
 *
 * Each family multiplies that by a role factor and then divides by its own
 * attack speed to get an average damage, which is spread into a min/max band:
 *
 *     one-hand sword 1.00   two-hand sword 1.50   bow      1.20
 *     one-hand axe   1.03   two-hand axe   1.55   crossbow 1.30
 *     one-hand mace  1.03   two-hand mace  1.60   staff    1.05
 *     dagger         0.80   polearm        1.52   scepter  0.95
 *     wand           0.70
 *
 * So a two-handed maul and a dagger of the same level land on roughly the same
 * DPS, but the maul does it in enormous, slow, wide-band hits and the dagger
 * does it in a blur of small ones — which is the whole point, because attack
 * speed interacts with on-hit effects and the dagger's implicit crit does not
 * care how big the base hit was.
 *
 * Armour follows `baseDefense = (flat + slope * levelReq) * familyFactor`,
 * where the family factor trades defence against attribute requirement: robes
 * are 0.55x with almost no strength requirement, sacred plate is 1.3x and will
 * eat half your stat points.
 *
 * Tiers mirror D2: **normal** (levels 1-20), **exceptional** (22-50),
 * **elite** (46-76) and a fourth **sacred** tier (78-90) that only exists so
 * that depth-90 drops have somewhere to go.
 */

import type { CharClassId, EquipSlot, ItemBase, ItemCategory, ItemVisual, StatKey } from '../types';
import { GEMS, RUNES } from './gems';
import { MATERIALS } from './materials';

type Implicit = { stat: StatKey; min: number; max: number };

interface Opts {
  ornate?: number;
  glow?: number;
  imp?: Implicit[];
  classes?: CharClassId[];
  block?: number;
}

const bases: ItemBase[] = [];

/** Weapon. `hands` 1 = mainHand, 2 = twoHand. */
function wpn(
  id: string,
  name: string,
  category: ItemCategory,
  hands: 1 | 2,
  levelReq: number,
  strReq: number,
  dexReq: number,
  min: number,
  max: number,
  speed: number,
  shape: string,
  palette: string,
  o: Opts = {},
): ItemBase {
  const visual: ItemVisual = { shape, palette, ornate: o.ornate ?? 0.1 };
  if (o.glow !== undefined) visual.glow = o.glow;
  const b: ItemBase = {
    id,
    name,
    category,
    slot: hands === 2 ? 'twoHand' : 'mainHand',
    levelReq,
    strReq,
    dexReq,
    baseMinDamage: min,
    baseMaxDamage: max,
    baseSpeed: speed,
    visual,
  };
  if (o.imp) b.implicits = o.imp;
  if (o.classes) b.classes = o.classes;
  bases.push(b);
  return b;
}

/** Armour and shields. */
function arm(
  id: string,
  name: string,
  category: ItemCategory,
  slot: EquipSlot,
  levelReq: number,
  strReq: number,
  dexReq: number,
  def: number,
  shape: string,
  palette: string,
  o: Opts = {},
): ItemBase {
  const visual: ItemVisual = { shape, palette, ornate: o.ornate ?? 0.12 };
  if (o.glow !== undefined) visual.glow = o.glow;
  const b: ItemBase = {
    id,
    name,
    category,
    slot,
    levelReq,
    strReq,
    dexReq,
    baseDefense: def,
    visual,
  };
  if (o.block !== undefined) b.baseBlock = o.block;
  if (o.imp) b.implicits = o.imp;
  if (o.classes) b.classes = o.classes;
  bases.push(b);
  return b;
}

/** Jewellery, charms, consumables and other things with no defence value. */
function misc(
  id: string,
  name: string,
  category: ItemCategory,
  slot: ItemBase['slot'],
  levelReq: number,
  shape: string,
  palette: string,
  o: Opts = {},
): ItemBase {
  const visual: ItemVisual = { shape, palette, ornate: o.ornate ?? 0.3 };
  if (o.glow !== undefined) visual.glow = o.glow;
  const b: ItemBase = { id, name, category, slot, levelReq, visual };
  if (o.imp) b.implicits = o.imp;
  if (o.classes) b.classes = o.classes;
  bases.push(b);
  return b;
}

const CASTERS: CharClassId[] = ['pyromancer', 'stormcaller', 'revenant'];

// ===========================================================================
// SWORDS — the reference weapon. Narrow damage band, middling speed.
// ===========================================================================

wpn('sword.short', 'Short Sword', 'sword', 1, 1, 15, 10, 3, 6, 1.4, 'sword.short', 'metal.iron');
wpn('sword.gladius', 'Gladius', 'sword', 1, 25, 45, 28, 13, 27, 1.4, 'sword.short', 'metal.steel', { ornate: 0.2 });
wpn('sword.falchion', 'Falchion', 'sword', 1, 50, 78, 45, 23, 49, 1.4, 'sword.short', 'metal.silver', { ornate: 0.32 });
wpn('sword.phase', 'Phase Blade', 'sword', 1, 78, 105, 80, 35, 73, 1.4, 'sword.short', 'crystal.gem', {
  ornate: 0.5,
  glow: 0x6fa8ff,
  imp: [{ stat: 'attackSpeed', min: 6, max: 12 }],
});

wpn('sword.broad', 'Broad Sword', 'sword', 1, 8, 30, 12, 7, 14, 1.2, 'sword.broad', 'metal.iron');
wpn('sword.tusk', 'Tusk Sword', 'sword', 1, 33, 62, 30, 19, 40, 1.2, 'sword.broad', 'bone.pale', { ornate: 0.24 });
wpn('sword.conquest', 'Conquest Sword', 'sword', 1, 58, 95, 48, 31, 65, 1.2, 'sword.broad', 'metal.gold', { ornate: 0.4 });

wpn('sword.rapier', 'Rapier', 'sword', 1, 4, 12, 22, 4, 8, 1.55, 'sword.thin', 'metal.iron', {
  imp: [{ stat: 'attackRating', min: 10, max: 25 }],
});
wpn('sword.foil', 'Foil', 'sword', 1, 29, 26, 55, 14, 27, 1.55, 'sword.thin', 'metal.steel', {
  ornate: 0.22,
  imp: [{ stat: 'attackRating', min: 45, max: 90 }],
});
wpn('sword.estoc', 'Estoc', 'sword', 1, 54, 42, 92, 24, 46, 1.55, 'sword.thin', 'metal.silver', {
  ornate: 0.34,
  imp: [{ stat: 'attackRating', min: 110, max: 200 }],
});

wpn('sword.great', 'Great Sword', 'sword', 2, 12, 50, 18, 19, 39, 0.85, 'sword.great', 'metal.iron');
wpn('sword.zweihander', 'Zweihander', 'sword', 2, 37, 92, 32, 45, 92, 0.85, 'sword.great', 'metal.steel', { ornate: 0.26 });
wpn('sword.colossus', 'Colossus Blade', 'sword', 2, 62, 140, 52, 70, 146, 0.85, 'sword.great', 'metal.dark', { ornate: 0.42 });
wpn('sword.godslayer', 'Godslayer', 'sword', 2, 84, 182, 70, 93, 193, 0.85, 'sword.great', 'metal.mithril', {
  ornate: 0.6,
  glow: 0xffd24a,
  imp: [{ stat: 'critDamage', min: 15, max: 30 }],
});
wpn('sword.sunblade', 'Sunblade', 'sword', 1, 84, 120, 105, 42, 88, 1.25, 'sword.broad', 'metal.gold', {
  ornate: 0.55,
  glow: 0xffb040,
  imp: [{ stat: 'fireDamage', min: 20, max: 45 }],
});

// ===========================================================================
// AXES — wide damage bands. Big top end, unreliable bottom end.
// ===========================================================================

wpn('axe.hand', 'Hand Axe', 'axe', 1, 1, 17, 8, 3, 8, 1.25, 'axe.hand', 'metal.iron');
wpn('axe.cleaver', 'Cleaver', 'axe', 1, 25, 48, 22, 13, 33, 1.25, 'axe.hand', 'metal.steel', { ornate: 0.18 });
wpn('axe.tomahawk', 'Tomahawk', 'axe', 1, 50, 82, 38, 23, 60, 1.25, 'axe.hand', 'metal.dark', { ornate: 0.3 });

wpn('axe.war', 'War Axe', 'axe', 1, 10, 36, 12, 7, 20, 1.1, 'axe.war', 'metal.iron');
wpn('axe.naga', 'Naga', 'axe', 1, 35, 68, 26, 19, 50, 1.1, 'axe.war', 'metal.steel', { ornate: 0.22 });
wpn('axe.berserker', 'Berserker Axe', 'axe', 1, 60, 104, 42, 31, 81, 1.1, 'axe.war', 'metal.dark', {
  ornate: 0.38,
  imp: [{ stat: 'critChance', min: 3, max: 6 }],
});

wpn('axe.battle', 'Battle Axe', 'axe', 2, 14, 58, 14, 19, 51, 0.8, 'axe.great', 'metal.iron');
wpn('axe.ettin', 'Ettin Axe', 'axe', 2, 39, 100, 28, 43, 114, 0.8, 'axe.great', 'metal.steel', { ornate: 0.24 });
wpn('axe.glorious', 'Glorious Axe', 'axe', 2, 64, 148, 46, 67, 177, 0.8, 'axe.great', 'metal.gold', { ornate: 0.44 });

wpn('axe.greataxe', 'Great Axe', 'axe', 2, 20, 72, 16, 29, 75, 0.7, 'axe.broad', 'metal.iron');
wpn('axe.gothic', 'Gothic Axe', 'axe', 2, 45, 116, 30, 56, 148, 0.7, 'axe.broad', 'metal.dark', { ornate: 0.3 });
wpn('axe.decapitator', 'Decapitator', 'axe', 2, 70, 162, 48, 83, 220, 0.7, 'axe.broad', 'metal.dark', {
  ornate: 0.48,
  imp: [{ stat: 'critDamage', min: 20, max: 40 }],
});

wpn('axe.rune', 'Rune Axe', 'axe', 1, 80, 128, 55, 38, 101, 1.15, 'axe.war', 'metal.mithril', {
  ornate: 0.55,
  glow: 0xd8a860,
  imp: [{ stat: 'lifeSteal', min: 2, max: 4 }],
});
wpn('axe.worldcleaver', 'Worldcleaver', 'axe', 2, 88, 200, 60, 111, 293, 0.65, 'axe.broad', 'metal.mithril', {
  ornate: 0.65,
  glow: 0xff5a33,
  imp: [{ stat: 'areaDamagePct', min: 15, max: 30 }],
});

// ===========================================================================
// MACES — armour-breakers. Slowest swings, flattest requirement curve on dex.
// ===========================================================================

wpn('mace.club', 'Club', 'mace', 1, 1, 16, 0, 3, 8, 1.2, 'mace.club', 'wood.oak');
wpn('mace.cudgel', 'Cudgel', 'mace', 1, 24, 46, 0, 14, 33, 1.2, 'mace.club', 'wood.ash', { ornate: 0.16 });
wpn('mace.truncheon', 'Truncheon', 'mace', 1, 49, 80, 0, 26, 60, 1.2, 'mace.club', 'metal.dark', { ornate: 0.28 });

wpn('mace.mace', 'Mace', 'mace', 1, 9, 34, 0, 8, 19, 1.05, 'mace.flanged', 'metal.iron');
wpn('mace.flanged', 'Flanged Mace', 'mace', 1, 34, 66, 0, 21, 50, 1.05, 'mace.flanged', 'metal.steel', { ornate: 0.24 });
wpn('mace.devilstar', 'Devil Star', 'mace', 1, 59, 102, 0, 35, 81, 1.05, 'mace.flanged', 'metal.dark', {
  ornate: 0.4,
  imp: [{ stat: 'physicalResist', min: 2, max: 5 }],
});

wpn('mace.warhammer', 'War Hammer', 'mace', 2, 15, 62, 0, 21, 50, 0.85, 'hammer.war', 'metal.iron');
wpn('mace.battlehammer', 'Battle Hammer', 'mace', 2, 40, 104, 0, 47, 109, 0.85, 'hammer.war', 'metal.steel', { ornate: 0.26 });
wpn('mace.legendhammer', 'Legend Hammer', 'mace', 2, 65, 150, 0, 72, 169, 0.85, 'hammer.war', 'metal.gold', { ornate: 0.44 });

wpn('mace.maul', 'Maul', 'mace', 2, 21, 78, 0, 38, 88, 0.62, 'maul.great', 'stone.crypt');
wpn('mace.greatmaul', 'Great Maul', 'mace', 2, 46, 122, 0, 73, 169, 0.62, 'maul.great', 'stone.crypt', { ornate: 0.28 });
wpn('mace.thundermaul', 'Thunder Maul', 'mace', 2, 71, 172, 0, 107, 251, 0.62, 'maul.great', 'metal.dark', {
  ornate: 0.46,
  glow: 0xf0e05a,
  imp: [{ stat: 'lightningDamage', min: 10, max: 60 }],
});

wpn('mace.sanctified', 'Sanctified Mace', 'mace', 1, 80, 126, 20, 44, 102, 1.1, 'mace.flanged', 'metal.gold', {
  ornate: 0.56,
  glow: 0xffe8b0,
  imp: [{ stat: 'lifeRegen', min: 8, max: 18 }],
});
wpn('mace.ruinhammer', 'Ruinhammer', 'mace', 2, 88, 208, 0, 140, 327, 0.58, 'maul.great', 'metal.mithril', {
  ornate: 0.66,
  glow: 0xff5a33,
  imp: [{ stat: 'areaDamagePct', min: 20, max: 40 }],
});

// ===========================================================================
// DAGGERS — lowest raw DPS in the game, highest attack rate and native crit.
// ===========================================================================

wpn('dagger.dagger', 'Dagger', 'dagger', 1, 1, 8, 14, 2, 4, 1.65, 'dagger', 'metal.iron', {
  imp: [{ stat: 'critChance', min: 2, max: 4 }],
});
wpn('dagger.dirk', 'Dirk', 'dagger', 1, 22, 20, 42, 9, 16, 1.65, 'dagger', 'metal.steel', {
  ornate: 0.2,
  imp: [{ stat: 'critChance', min: 3, max: 6 }],
});
wpn('dagger.boneknife', 'Bone Knife', 'dagger', 1, 47, 32, 74, 16, 30, 1.65, 'dagger', 'bone.pale', {
  ornate: 0.32,
  imp: [{ stat: 'critChance', min: 5, max: 9 }],
});

wpn('dagger.kris', 'Kris', 'dagger', 1, 11, 14, 26, 6, 11, 1.5, 'dagger.wavy', 'metal.iron', {
  imp: [{ stat: 'critDamage', min: 8, max: 16 }],
});
wpn('dagger.blade', 'Blade', 'dagger', 1, 36, 28, 58, 14, 26, 1.5, 'dagger.wavy', 'metal.steel', {
  ornate: 0.24,
  imp: [{ stat: 'critDamage', min: 16, max: 30 }],
});
wpn('dagger.fanged', 'Fanged Knife', 'dagger', 1, 61, 40, 96, 23, 42, 1.5, 'dagger.wavy', 'bone.pale', {
  ornate: 0.4,
  glow: 0x7ec24a,
  imp: [{ stat: 'critDamage', min: 26, max: 48 }],
});

wpn('dagger.stiletto', 'Stiletto', 'dagger', 1, 6, 6, 20, 3, 6, 1.75, 'dagger.needle', 'metal.iron', {
  imp: [{ stat: 'attackSpeed', min: 3, max: 6 }],
});
wpn('dagger.poignard', 'Poignard', 'dagger', 1, 31, 18, 52, 11, 20, 1.75, 'dagger.needle', 'metal.silver', {
  ornate: 0.22,
  imp: [{ stat: 'attackSpeed', min: 5, max: 10 }],
});
wpn('dagger.nightblade', 'Nightblade', 'dagger', 1, 56, 30, 88, 18, 33, 1.75, 'dagger.needle', 'metal.dark', {
  ornate: 0.36,
  glow: 0x8a4fd8,
  imp: [{ stat: 'attackSpeed', min: 8, max: 14 }],
});

wpn('dagger.mindrender', 'Mindrender', 'dagger', 1, 80, 46, 120, 27, 50, 1.6, 'dagger.wavy', 'crystal.void', {
  ornate: 0.6,
  glow: 0xc060ff,
  imp: [
    { stat: 'critChance', min: 8, max: 14 },
    { stat: 'critDamage', min: 30, max: 60 },
  ],
});

// ===========================================================================
// SPEARS & POLEARMS — reach weapons. Native attack rating, two-handed.
// ===========================================================================

wpn('spear.spear', 'Spear', 'spear', 2, 5, 26, 20, 8, 18, 1.15, 'spear', 'wood.oak', {
  imp: [{ stat: 'attackRating', min: 15, max: 35 }],
});
wpn('spear.warspear', 'War Spear', 'spear', 2, 30, 58, 46, 27, 59, 1.15, 'spear', 'wood.ash', {
  ornate: 0.2,
  imp: [{ stat: 'attackRating', min: 60, max: 120 }],
});
wpn('spear.hyperion', 'Hyperion Spear', 'spear', 2, 55, 92, 72, 45, 100, 1.15, 'spear', 'metal.silver', {
  ornate: 0.34,
  imp: [{ stat: 'attackRating', min: 140, max: 260 }],
});

wpn('spear.pike', 'Pike', 'spear', 2, 13, 46, 28, 17, 38, 0.95, 'pike', 'wood.oak');
wpn('spear.lance', 'Lance', 'spear', 2, 38, 84, 52, 39, 88, 0.95, 'pike', 'metal.steel', { ornate: 0.22 });
wpn('spear.ghost', 'Ghost Spear', 'spear', 2, 63, 122, 78, 62, 137, 0.95, 'pike', 'crystal.gem', {
  ornate: 0.4,
  glow: 0x9fd8ff,
  imp: [{ stat: 'arcaneDamage', min: 10, max: 40 }],
});

wpn('spear.halberd', 'Halberd', 'spear', 2, 18, 60, 24, 24, 54, 0.85, 'halberd', 'metal.iron');
wpn('spear.bardiche', 'Bardiche', 'spear', 2, 43, 106, 40, 49, 109, 0.85, 'halberd', 'metal.steel', { ornate: 0.26 });
wpn('spear.thresher', 'Giant Thresher', 'spear', 2, 68, 156, 58, 74, 165, 0.85, 'halberd', 'metal.dark', {
  ornate: 0.42,
  imp: [{ stat: 'areaDamagePct', min: 10, max: 22 }],
});

wpn('spear.trident', 'Trident', 'spear', 2, 26, 68, 34, 27, 61, 1.0, 'trident', 'metal.iron');
wpn('spear.brandistock', 'Brandistock', 'spear', 2, 51, 108, 56, 48, 108, 1.0, 'trident', 'metal.steel', { ornate: 0.3 });
wpn('spear.mancatcher', 'Mancatcher', 'spear', 2, 74, 158, 76, 68, 151, 1.0, 'trident', 'metal.dark', { ornate: 0.44 });

wpn('spear.worldspine', 'Worldspine Pike', 'spear', 2, 86, 190, 92, 87, 193, 0.9, 'pike', 'bone.pale', {
  ornate: 0.62,
  glow: 0xc060ff,
  imp: [
    { stat: 'attackRating', min: 250, max: 480 },
    { stat: 'enhancedDamage', min: 15, max: 30 },
  ],
});

// ===========================================================================
// BOWS — two-handed, dex-gated, pair with a quiver in the off-hand.
// ===========================================================================

wpn('bow.short', 'Short Bow', 'bow', 2, 1, 6, 18, 4, 8, 1.35, 'bow.short', 'wood.oak');
wpn('bow.hunters', "Hunter's Bow", 'bow', 2, 24, 14, 48, 16, 32, 1.35, 'bow.short', 'wood.ash', { ornate: 0.18 });
wpn('bow.spider', 'Spider Bow', 'bow', 2, 49, 24, 82, 30, 58, 1.35, 'bow.short', 'bone.pale', { ornate: 0.32 });

wpn('bow.long', 'Long Bow', 'bow', 2, 8, 10, 30, 9, 18, 1.15, 'bow.long', 'wood.oak');
wpn('bow.composite', 'Composite Bow', 'bow', 2, 33, 20, 62, 25, 48, 1.15, 'bow.long', 'wood.ash', { ornate: 0.2 });
wpn('bow.shadow', 'Shadow Bow', 'bow', 2, 58, 30, 96, 41, 79, 1.15, 'bow.long', 'wood.dark', {
  ornate: 0.36,
  glow: 0x8a4fd8,
  imp: [{ stat: 'critChance', min: 4, max: 8 }],
});

wpn('bow.war', 'War Bow', 'bow', 2, 16, 18, 40, 16, 32, 1.0, 'bow.war', 'wood.ash');
wpn('bow.double', 'Double Bow', 'bow', 2, 41, 30, 72, 35, 67, 1.0, 'bow.war', 'metal.steel', { ornate: 0.24 });
wpn('bow.diamond', 'Diamond Bow', 'bow', 2, 66, 42, 108, 53, 103, 1.0, 'bow.war', 'crystal.gem', {
  ornate: 0.42,
  glow: 0xdff0ff,
});

wpn('bow.great', 'Great Bow', 'bow', 2, 22, 26, 46, 24, 47, 0.85, 'bow.great', 'wood.oak');
wpn('bow.rune', 'Rune Bow', 'bow', 2, 47, 40, 80, 46, 89, 0.85, 'bow.great', 'wood.dark', { ornate: 0.3 });
wpn('bow.hydra', 'Hydra Bow', 'bow', 2, 72, 54, 116, 67, 131, 0.85, 'bow.great', 'bone.pale', {
  ornate: 0.46,
  glow: 0x35c05a,
  imp: [{ stat: 'poisonDamage', min: 15, max: 60 }],
});

wpn('bow.matron', 'Grand Matron Bow', 'bow', 2, 82, 60, 140, 59, 114, 1.1, 'bow.long', 'metal.mithril', {
  ornate: 0.6,
  glow: 0xffd24a,
  imp: [
    { stat: 'attackSpeed', min: 8, max: 15 },
    { stat: 'critDamage', min: 20, max: 40 },
  ],
});

// ===========================================================================
// CROSSBOWS — slower and heavier than bows, but the highest per-shot numbers.
// ===========================================================================

wpn('xbow.light', 'Light Crossbow', 'crossbow', 2, 3, 16, 20, 8, 14, 1.0, 'crossbow.light', 'wood.oak', {
  imp: [{ stat: 'critDamage', min: 5, max: 12 }],
});
wpn('xbow.arbalest', 'Arbalest', 'crossbow', 2, 27, 44, 44, 28, 50, 1.0, 'crossbow.light', 'wood.ash', {
  ornate: 0.2,
  imp: [{ stat: 'critDamage', min: 12, max: 24 }],
});
wpn('xbow.pellet', 'Pellet Bow', 'crossbow', 2, 52, 74, 70, 49, 87, 1.0, 'crossbow.light', 'metal.steel', {
  ornate: 0.34,
  imp: [{ stat: 'critDamage', min: 22, max: 42 }],
});

wpn('xbow.crossbow', 'Crossbow', 'crossbow', 2, 11, 32, 26, 18, 32, 0.8, 'crossbow.heavy', 'wood.oak');
wpn('xbow.siege', 'Siege Crossbow', 'crossbow', 2, 36, 66, 50, 44, 79, 0.8, 'crossbow.heavy', 'metal.iron', { ornate: 0.22 });
wpn('xbow.ballista', 'Ballista', 'crossbow', 2, 61, 106, 76, 71, 126, 0.8, 'crossbow.heavy', 'metal.dark', {
  ornate: 0.38,
  imp: [{ stat: 'areaDamagePct', min: 8, max: 18 }],
});

wpn('xbow.repeating', 'Repeating Crossbow', 'crossbow', 2, 19, 30, 44, 18, 31, 1.2, 'crossbow.repeat', 'wood.ash', {
  imp: [{ stat: 'attackSpeed', min: 4, max: 8 }],
});
wpn('xbow.chukonu', 'Chu-Ko-Nu', 'crossbow', 2, 44, 54, 78, 35, 63, 1.2, 'crossbow.repeat', 'metal.steel', {
  ornate: 0.26,
  imp: [{ stat: 'attackSpeed', min: 8, max: 14 }],
});
wpn('xbow.demon', 'Demon Crossbow', 'crossbow', 2, 69, 84, 112, 53, 94, 1.2, 'crossbow.repeat', 'metal.dark', {
  ornate: 0.44,
  glow: 0xe04a20,
  imp: [{ stat: 'attackSpeed', min: 12, max: 20 }],
});

wpn('xbow.colossus', 'Colossus Crossbow', 'crossbow', 2, 83, 130, 130, 107, 191, 0.7, 'crossbow.heavy', 'metal.mithril', {
  ornate: 0.6,
  glow: 0xff5a33,
  imp: [{ stat: 'critDamage', min: 40, max: 80 }],
});

// ===========================================================================
// WANDS — the worst melee weapons and the best spell conduits.
// ===========================================================================

wpn('wand.wand', 'Wand', 'wand', 1, 1, 4, 4, 2, 4, 1.45, 'wand', 'wood.oak', {
  classes: CASTERS,
  imp: [{ stat: 'castSpeed', min: 3, max: 6 }],
});
wpn('wand.yew', 'Yew Wand', 'wand', 1, 23, 8, 8, 8, 17, 1.45, 'wand', 'wood.ash', {
  ornate: 0.2,
  classes: CASTERS,
  imp: [{ stat: 'castSpeed', min: 6, max: 11 }],
});
wpn('wand.burnt', 'Burnt Wand', 'wand', 1, 48, 12, 12, 15, 32, 1.45, 'wand', 'wood.dark', {
  ornate: 0.34,
  glow: 0xd8632a,
  classes: CASTERS,
  imp: [{ stat: 'castSpeed', min: 11, max: 18 }],
});

// The bottom of the necromantic wand ladder. The Revenant starts holding this
// one: `wand.bone` sits at level 10 and the class was being handed a weapon it
// could not equip for its first nine levels.
wpn('wand.femur', 'Femur Wand', 'wand', 1, 1, 4, 4, 2, 5, 1.3, 'wand.bone', 'bone.pale', {
  classes: CASTERS,
  imp: [{ stat: 'manaRegen', min: 1, max: 2 }],
});
wpn('wand.bone', 'Bone Wand', 'wand', 1, 10, 6, 6, 5, 11, 1.3, 'wand.bone', 'bone.pale', {
  classes: CASTERS,
  imp: [{ stat: 'skillLevels', min: 1, max: 1 }],
});
wpn('wand.grim', 'Grim Wand', 'wand', 1, 35, 10, 10, 13, 27, 1.3, 'wand.bone', 'bone.pale', {
  ornate: 0.26,
  classes: CASTERS,
  imp: [{ stat: 'skillLevels', min: 1, max: 1 }, { stat: 'arcaneDamage', min: 6, max: 16 }],
});
wpn('wand.lich', 'Lich Wand', 'wand', 1, 60, 14, 14, 21, 43, 1.3, 'wand.bone', 'crystal.void', {
  ornate: 0.44,
  glow: 0xc060ff,
  classes: CASTERS,
  imp: [{ stat: 'skillLevels', min: 1, max: 2 }, { stat: 'arcaneDamage', min: 18, max: 44 }],
});

wpn('wand.tomb', 'Tomb Wand', 'wand', 1, 17, 6, 6, 6, 13, 1.55, 'wand.crystal', 'crystal.gem', {
  classes: CASTERS,
  imp: [{ stat: 'mana', min: 15, max: 30 }],
});
wpn('wand.grave', 'Grave Wand', 'wand', 1, 42, 10, 10, 13, 26, 1.55, 'wand.crystal', 'crystal.gem', {
  ornate: 0.28,
  glow: 0x6f8cff,
  classes: CASTERS,
  imp: [{ stat: 'mana', min: 40, max: 80 }, { stat: 'manaRegen', min: 8, max: 16 }],
});
wpn('wand.unearthed', 'Unearthed Wand', 'wand', 1, 67, 14, 14, 19, 40, 1.55, 'wand.crystal', 'crystal.void', {
  ornate: 0.46,
  glow: 0x8a4fd8,
  classes: CASTERS,
  imp: [{ stat: 'mana', min: 90, max: 160 }, { stat: 'manaRegen', min: 18, max: 34 }],
});

wpn('wand.heartstone', 'Heartstone Wand', 'wand', 1, 81, 18, 18, 25, 53, 1.4, 'wand.crystal', 'crystal.void', {
  ornate: 0.65,
  glow: 0xff8adf,
  classes: CASTERS,
  imp: [
    { stat: 'skillLevels', min: 2, max: 2 },
    { stat: 'elementalDamagePct', min: 12, max: 25 },
  ],
});

// ===========================================================================
// STAVES — two-handed caster weapons. Real melee damage, real spell support.
// ===========================================================================

wpn('staff.short', 'Short Staff', 'staff', 2, 1, 10, 0, 4, 9, 1.0, 'staff', 'wood.oak', {
  imp: [{ stat: 'mana', min: 10, max: 20 }],
});
wpn('staff.long', 'Long Staff', 'staff', 2, 12, 18, 0, 10, 24, 1.0, 'staff', 'wood.oak', {
  ornate: 0.16,
  imp: [{ stat: 'mana', min: 25, max: 50 }],
});
wpn('staff.gnarled', 'Gnarled Staff', 'staff', 2, 26, 28, 0, 18, 42, 1.0, 'staff', 'wood.ash', {
  ornate: 0.26,
  imp: [{ stat: 'mana', min: 50, max: 90 }, { stat: 'skillLevels', min: 1, max: 1 }],
});

wpn('staff.battle', 'Battle Staff', 'staff', 2, 20, 30, 0, 16, 38, 0.9, 'staff.battle', 'wood.ash');
wpn('staff.war', 'War Staff', 'staff', 2, 40, 52, 0, 29, 68, 0.9, 'staff.battle', 'metal.iron', { ornate: 0.24 });
wpn('staff.elder', 'Elder Staff', 'staff', 2, 64, 78, 0, 44, 103, 0.9, 'staff.battle', 'metal.dark', {
  ornate: 0.42,
  imp: [{ stat: 'skillLevels', min: 1, max: 1 }],
});

wpn('staff.cedar', 'Cedar Staff', 'staff', 2, 32, 26, 0, 20, 46, 1.1, 'staff.rune', 'wood.ash', {
  ornate: 0.3,
  glow: 0x6f8cff,
  imp: [{ stat: 'castSpeed', min: 8, max: 15 }],
});
wpn('staff.archon', 'Archon Staff', 'staff', 2, 56, 40, 0, 32, 75, 1.1, 'staff.rune', 'crystal.gem', {
  ornate: 0.44,
  glow: 0x8fa8ff,
  imp: [{ stat: 'castSpeed', min: 14, max: 24 }, { stat: 'skillLevels', min: 1, max: 2 }],
});
wpn('staff.eldritch', 'Eldritch Staff', 'staff', 2, 76, 56, 0, 42, 99, 1.1, 'staff.rune', 'crystal.void', {
  ornate: 0.56,
  glow: 0xc060ff,
  imp: [{ stat: 'castSpeed', min: 20, max: 32 }, { stat: 'skillLevels', min: 2, max: 2 }],
});

wpn('staff.worldtree', 'Worldtree Staff', 'staff', 2, 87, 70, 0, 56, 130, 0.95, 'staff.rune', 'wood.dark', {
  ornate: 0.7,
  glow: 0x35c05a,
  imp: [
    { stat: 'skillLevels', min: 2, max: 3 },
    { stat: 'elementalDamagePct', min: 15, max: 30 },
    { stat: 'manaRegen', min: 25, max: 45 },
  ],
});

// ===========================================================================
// SCEPTERS — one-handed caster weapons; shield-compatible, support-flavoured.
// ===========================================================================

wpn('scepter.scepter', 'Scepter', 'scepter', 1, 2, 14, 6, 4, 8, 1.2, 'scepter', 'metal.iron', {
  imp: [{ stat: 'lifeRegen', min: 2, max: 5 }],
});
wpn('scepter.grand', 'Grand Scepter', 'scepter', 1, 25, 36, 16, 14, 31, 1.2, 'scepter', 'metal.silver', {
  ornate: 0.24,
  imp: [{ stat: 'lifeRegen', min: 6, max: 13 }],
});
wpn('scepter.war', 'War Scepter', 'scepter', 1, 50, 62, 28, 25, 55, 1.2, 'scepter', 'metal.gold', {
  ornate: 0.38,
  imp: [{ stat: 'lifeRegen', min: 14, max: 26 }],
});

wpn('scepter.sprinkler', 'Holy Water Sprinkler', 'scepter', 1, 14, 26, 10, 10, 23, 1.05, 'scepter.orbed', 'metal.silver', {
  ornate: 0.3,
  glow: 0xffe8b0,
  imp: [{ stat: 'skillLevels', min: 1, max: 1 }],
});
wpn('scepter.divine', 'Divine Scepter', 'scepter', 1, 39, 48, 20, 23, 51, 1.05, 'scepter.orbed', 'metal.gold', {
  ornate: 0.42,
  glow: 0xffd24a,
  imp: [{ stat: 'skillLevels', min: 1, max: 1 }, { stat: 'manaRegen', min: 10, max: 20 }],
});
wpn('scepter.caduceus', 'Caduceus', 'scepter', 1, 64, 74, 32, 35, 79, 1.05, 'scepter.orbed', 'metal.gold', {
  ornate: 0.56,
  glow: 0xffd24a,
  imp: [{ stat: 'skillLevels', min: 1, max: 2 }, { stat: 'manaRegen', min: 22, max: 38 }],
});

wpn('scepter.wrath', 'Rod of Wrath', 'scepter', 1, 28, 34, 22, 13, 30, 1.35, 'scepter.spiked', 'metal.dark', {
  ornate: 0.3,
  glow: 0xd8632a,
  imp: [{ stat: 'fireDamage', min: 6, max: 20 }],
});
wpn('scepter.mirrored', 'Mirrored Scepter', 'scepter', 1, 53, 56, 36, 23, 52, 1.35, 'scepter.spiked', 'metal.silver', {
  ornate: 0.44,
  glow: 0xdff0ff,
  imp: [{ stat: 'blockChance', min: 3, max: 7 }],
});
wpn('scepter.solar', 'Solar Scepter', 'scepter', 1, 73, 82, 46, 31, 69, 1.35, 'scepter.spiked', 'metal.gold', {
  ornate: 0.58,
  glow: 0xffb040,
  imp: [{ stat: 'fireDamage', min: 30, max: 80 }],
});

wpn('scepter.judgement', 'Judgement Scepter', 'scepter', 1, 85, 96, 54, 42, 93, 1.15, 'scepter.orbed', 'metal.mithril', {
  ornate: 0.72,
  glow: 0xfff0c0,
  imp: [
    { stat: 'skillLevels', min: 2, max: 2 },
    { stat: 'critChance', min: 5, max: 10 },
  ],
});

// ===========================================================================
// SHIELDS — defence plus block. Heavier families block more and cost strength.
// ===========================================================================

arm('shield.buckler', 'Buckler', 'shield', 'offHand', 1, 12, 0, 6, 'shield.buckler', 'wood.oak', { block: 0.14 });
arm('shield.defender', 'Defender', 'shield', 'offHand', 24, 42, 0, 32, 'shield.buckler', 'metal.iron', {
  block: 0.16,
  ornate: 0.2,
});
arm('shield.heater', 'Heater', 'shield', 'offHand', 49, 72, 0, 60, 'shield.buckler', 'metal.steel', {
  block: 0.18,
  ornate: 0.32,
});

arm('shield.small', 'Small Shield', 'shield', 'offHand', 5, 20, 0, 12, 'shield.round', 'wood.oak', { block: 0.18 });
arm('shield.round', 'Round Shield', 'shield', 'offHand', 28, 50, 0, 41, 'shield.round', 'metal.iron', {
  block: 0.2,
  ornate: 0.22,
});
arm('shield.luna', 'Luna', 'shield', 'offHand', 53, 80, 0, 73, 'shield.round', 'metal.silver', {
  block: 0.22,
  ornate: 0.36,
  glow: 0xdff0ff,
});

arm('shield.kite', 'Kite Shield', 'shield', 'offHand', 12, 34, 0, 24, 'shield.kite', 'metal.iron', { block: 0.22 });
arm('shield.dragon', 'Dragon Shield', 'shield', 'offHand', 35, 66, 0, 59, 'shield.kite', 'metal.steel', {
  block: 0.24,
  ornate: 0.26,
});
arm('shield.monarch', 'Monarch', 'shield', 'offHand', 60, 106, 0, 96, 'shield.kite', 'metal.gold', {
  block: 0.26,
  ornate: 0.42,
});

arm('shield.tower', 'Tower Shield', 'shield', 'offHand', 18, 52, 0, 41, 'shield.tower', 'metal.iron', {
  block: 0.26,
  imp: [{ stat: 'damageReduction', min: 1, max: 3 }],
});
arm('shield.pavise', 'Pavise', 'shield', 'offHand', 42, 96, 0, 86, 'shield.tower', 'metal.steel', {
  block: 0.28,
  ornate: 0.28,
  imp: [{ stat: 'damageReduction', min: 3, max: 6 }],
});
arm('shield.aegis', 'Aegis', 'shield', 'offHand', 66, 142, 0, 131, 'shield.tower', 'metal.dark', {
  block: 0.3,
  ornate: 0.44,
  imp: [{ stat: 'damageReduction', min: 5, max: 10 }],
});

arm('shield.bone', 'Bone Shield', 'shield', 'offHand', 9, 24, 0, 18, 'shield.bone', 'bone.pale', {
  block: 0.19,
  imp: [{ stat: 'lifeRegen', min: 2, max: 5 }],
});
arm('shield.grim', 'Grim Shield', 'shield', 'offHand', 32, 52, 0, 49, 'shield.bone', 'bone.pale', {
  block: 0.21,
  ornate: 0.26,
  imp: [{ stat: 'lifeRegen', min: 6, max: 12 }],
});
arm('shield.trollnest', 'Troll Nest', 'shield', 'offHand', 57, 82, 0, 82, 'shield.bone', 'flesh.rotted', {
  block: 0.23,
  ornate: 0.4,
  imp: [{ stat: 'lifeRegen', min: 14, max: 28 }],
});

arm('shield.aeons', 'Ward of Aeons', 'shield', 'offHand', 84, 170, 0, 172, 'shield.tower', 'metal.mithril', {
  block: 0.32,
  ornate: 0.66,
  glow: 0xfff0c0,
  imp: [
    { stat: 'damageReduction', min: 8, max: 14 },
    { stat: 'blockChance', min: 4, max: 8 },
  ],
});

// ===========================================================================
// ORBS — caster off-hands. No block, all utility.
// ===========================================================================

arm('orb.eagle', 'Eagle Orb', 'orb', 'offHand', 8, 0, 0, 0, 'orb', 'crystal.gem', {
  classes: CASTERS,
  glow: 0x6f8cff,
  imp: [{ stat: 'mana', min: 15, max: 30 }, { stat: 'castSpeed', min: 3, max: 7 }],
});
arm('orb.sacred', 'Sacred Globe', 'orb', 'offHand', 16, 0, 0, 0, 'orb', 'crystal.gem', {
  classes: CASTERS,
  glow: 0x8fa8ff,
  ornate: 0.3,
  imp: [{ stat: 'mana', min: 30, max: 55 }, { stat: 'skillLevels', min: 1, max: 1 }],
});
arm('orb.smoked', 'Smoked Sphere', 'orb', 'offHand', 24, 0, 0, 0, 'orb', 'crystal.void', {
  classes: CASTERS,
  glow: 0x8a4fd8,
  ornate: 0.34,
  imp: [{ stat: 'arcaneDamage', min: 8, max: 22 }, { stat: 'castSpeed', min: 6, max: 12 }],
});

arm('orb.crystalline', 'Crystalline Globe', 'orb', 'offHand', 32, 0, 0, 0, 'orb.faceted', 'crystal.gem', {
  classes: CASTERS,
  glow: 0x9fd8ff,
  ornate: 0.38,
  imp: [{ stat: 'mana', min: 60, max: 100 }, { stat: 'manaRegen', min: 10, max: 20 }],
});
arm('orb.glowing', 'Glowing Orb', 'orb', 'offHand', 40, 0, 0, 0, 'orb.faceted', 'crystal.gem', {
  classes: CASTERS,
  glow: 0xffe8b0,
  ornate: 0.42,
  imp: [{ stat: 'elementalDamagePct', min: 6, max: 14 }, { stat: 'skillLevels', min: 1, max: 1 }],
});
arm('orb.heavenly', 'Heavenly Stone', 'orb', 'offHand', 50, 0, 0, 0, 'orb.faceted', 'metal.gold', {
  classes: CASTERS,
  glow: 0xffd24a,
  ornate: 0.5,
  imp: [{ stat: 'mana', min: 100, max: 160 }, { stat: 'skillLevels', min: 1, max: 2 }],
});

arm('orb.eldritch', 'Eldritch Orb', 'orb', 'offHand', 58, 0, 0, 0, 'orb.rune', 'crystal.void', {
  classes: CASTERS,
  glow: 0xc060ff,
  ornate: 0.52,
  imp: [{ stat: 'arcaneDamage', min: 30, max: 70 }, { stat: 'castSpeed', min: 12, max: 20 }],
});
arm('orb.demonheart', 'Demon Heart', 'orb', 'offHand', 66, 0, 0, 0, 'orb.rune', 'flesh.rotted', {
  classes: CASTERS,
  glow: 0xe04a20,
  ornate: 0.56,
  imp: [{ stat: 'fireDamage', min: 40, max: 95 }, { stat: 'lifeSteal', min: 2, max: 4 }],
});
arm('orb.vortex', 'Vortex Orb', 'orb', 'offHand', 74, 0, 0, 0, 'orb.rune', 'crystal.void', {
  classes: CASTERS,
  glow: 0x8a4fd8,
  ornate: 0.6,
  imp: [{ stat: 'skillLevels', min: 2, max: 2 }, { stat: 'cooldownReduction', min: 5, max: 10 }],
});

arm('orb.void', 'Void Sphere', 'orb', 'offHand', 84, 0, 0, 0, 'orb.rune', 'crystal.void', {
  classes: CASTERS,
  glow: 0xff8adf,
  ornate: 0.75,
  imp: [
    { stat: 'skillLevels', min: 2, max: 3 },
    { stat: 'elementalDamagePct', min: 15, max: 28 },
    { stat: 'manaRegen', min: 25, max: 45 },
  ],
});

// ===========================================================================
// QUIVERS — bow/crossbow off-hands.
// ===========================================================================

misc('quiver.ragged', 'Ragged Quiver', 'quiver', 'offHand', 1, 'quiver', 'leather.worn', {
  imp: [{ stat: 'maxDamage', min: 1, max: 3 }, { stat: 'attackRating', min: 10, max: 25 }],
});
misc('quiver.hunters', "Hunter's Quiver", 'quiver', 'offHand', 20, 'quiver', 'leather.worn', {
  ornate: 0.25,
  imp: [
    { stat: 'minDamage', min: 2, max: 5 },
    { stat: 'maxDamage', min: 5, max: 12 },
    { stat: 'attackRating', min: 40, max: 90 },
  ],
});
misc('quiver.runic', 'Runic Quiver', 'quiver', 'offHand', 45, 'quiver', 'leather.dark', {
  ornate: 0.4,
  glow: 0xd8a860,
  imp: [
    { stat: 'minDamage', min: 6, max: 12 },
    { stat: 'maxDamage', min: 14, max: 28 },
    { stat: 'critChance', min: 3, max: 6 },
  ],
});
misc('quiver.endless', 'Quiver of the Endless Hunt', 'quiver', 'offHand', 70, 'quiver', 'metal.mithril', {
  ornate: 0.6,
  glow: 0x35c05a,
  imp: [
    { stat: 'minDamage', min: 14, max: 26 },
    { stat: 'maxDamage', min: 30, max: 58 },
    { stat: 'critChance', min: 6, max: 11 },
    { stat: 'attackSpeed', min: 5, max: 10 },
  ],
});

// ===========================================================================
// HELMS
// ===========================================================================

arm('helm.cap', 'Cap', 'helm', 'helm', 1, 8, 0, 5, 'helm.cap', 'leather.worn');
arm('helm.skullcap', 'Skull Cap', 'helm', 'helm', 16, 24, 0, 21, 'helm.cap', 'metal.iron', { ornate: 0.18 });
arm('helm.casque', 'Casque', 'helm', 'helm', 41, 44, 0, 49, 'helm.cap', 'metal.steel', { ornate: 0.3 });

arm('helm.helm', 'Helm', 'helm', 'helm', 8, 28, 0, 20, 'helm.full', 'metal.iron');
arm('helm.full', 'Full Helm', 'helm', 'helm', 30, 62, 0, 61, 'helm.full', 'metal.steel', { ornate: 0.24 });
arm('helm.great', 'Great Helm', 'helm', 'helm', 55, 104, 0, 107, 'helm.full', 'metal.dark', { ornate: 0.38 });

arm('helm.bone', 'Bone Helm', 'helm', 'helm', 12, 26, 0, 23, 'helm.horned', 'bone.pale', {
  imp: [{ stat: 'mana', min: 8, max: 18 }],
});
arm('helm.grim', 'Grim Helm', 'helm', 'helm', 36, 52, 0, 60, 'helm.horned', 'bone.pale', {
  ornate: 0.28,
  imp: [{ stat: 'mana', min: 25, max: 48 }],
});
arm('helm.spired', 'Spired Helm', 'helm', 'helm', 62, 88, 0, 99, 'helm.horned', 'metal.dark', {
  ornate: 0.44,
  imp: [{ stat: 'mana', min: 55, max: 95 }],
});

arm('helm.circlet', 'Circlet', 'helm', 'helm', 14, 0, 0, 16, 'helm.circlet', 'metal.silver', {
  ornate: 0.4,
  glow: 0x8fa8ff,
  imp: [{ stat: 'skillLevels', min: 1, max: 1 }],
});
arm('helm.coronet', 'Coronet', 'helm', 'helm', 38, 0, 0, 40, 'helm.circlet', 'metal.gold', {
  ornate: 0.5,
  glow: 0xffd24a,
  imp: [{ stat: 'skillLevels', min: 1, max: 1 }, { stat: 'castSpeed', min: 4, max: 9 }],
});
arm('helm.diadem', 'Diadem', 'helm', 'helm', 64, 0, 0, 64, 'helm.circlet', 'metal.mithril', {
  ornate: 0.62,
  glow: 0xdff0ff,
  imp: [{ stat: 'skillLevels', min: 1, max: 2 }, { stat: 'castSpeed', min: 8, max: 15 }],
});

arm('helm.corona', 'Corona', 'helm', 'helm', 86, 150, 0, 171, 'helm.full', 'metal.mithril', {
  ornate: 0.7,
  glow: 0xfff0c0,
  imp: [
    { stat: 'skillLevels', min: 1, max: 2 },
    { stat: 'damageReduction', min: 5, max: 10 },
  ],
});

// ===========================================================================
// BODY ARMOUR
// ===========================================================================

arm('chest.quilted', 'Quilted Armor', 'chest', 'chest', 1, 10, 0, 7, 'chest.robe', 'cloth.linen');
arm('chest.ghost', 'Ghost Armor', 'chest', 'chest', 25, 24, 0, 50, 'chest.robe', 'cloth.silk', {
  ornate: 0.24,
  imp: [{ stat: 'mana', min: 20, max: 40 }],
});
arm('chest.dusk', 'Dusk Shroud', 'chest', 'chest', 52, 40, 0, 97, 'chest.robe', 'cloth.silk', {
  ornate: 0.4,
  glow: 0x8a4fd8,
  imp: [{ stat: 'mana', min: 55, max: 100 }],
});

arm('chest.leather', 'Leather Armor', 'chest', 'chest', 5, 20, 0, 21, 'chest.leather', 'leather.worn');
arm('chest.studded', 'Studded Leather', 'chest', 'chest', 28, 48, 0, 80, 'chest.leather', 'leather.worn', { ornate: 0.2 });
arm('chest.wyrmhide', 'Wyrmhide', 'chest', 'chest', 56, 84, 0, 151, 'chest.leather', 'leather.dark', {
  ornate: 0.36,
  imp: [{ stat: 'fireResist', min: 8, max: 16 }],
});

arm('chest.ringmail', 'Ring Mail', 'chest', 'chest', 10, 34, 0, 42, 'chest.mail', 'metal.iron');
arm('chest.chainmail', 'Chain Mail', 'chest', 'chest', 33, 76, 0, 116, 'chest.mail', 'metal.iron', { ornate: 0.2 });
arm('chest.boneweave', 'Boneweave', 'chest', 'chest', 60, 122, 0, 202, 'chest.mail', 'bone.pale', {
  ornate: 0.4,
  imp: [{ stat: 'physicalResist', min: 3, max: 7 }],
});

arm('chest.scale', 'Scale Mail', 'chest', 'chest', 14, 44, 0, 49, 'chest.scale', 'metal.bronze');
arm('chest.splint', 'Splint Mail', 'chest', 'chest', 38, 88, 0, 118, 'chest.scale', 'metal.steel', { ornate: 0.22 });
arm('chest.kraken', 'Kraken Shell', 'chest', 'chest', 64, 134, 0, 193, 'chest.scale', 'metal.dark', {
  ornate: 0.42,
  imp: [{ stat: 'coldResist', min: 10, max: 20 }],
});

arm('chest.plate', 'Plate Mail', 'chest', 'chest', 18, 62, 0, 85, 'chest.plate', 'metal.iron');
arm('chest.gothic', 'Gothic Plate', 'chest', 'chest', 44, 118, 0, 189, 'chest.plate', 'metal.steel', { ornate: 0.3 });
arm('chest.sacred', 'Sacred Armor', 'chest', 'chest', 68, 178, 0, 285, 'chest.plate', 'metal.gold', {
  ornate: 0.5,
  glow: 0xffd24a,
  imp: [{ stat: 'damageReduction', min: 4, max: 8 }],
});

arm('chest.archon', 'Archon Plate', 'chest', 'chest', 85, 220, 0, 366, 'chest.plate', 'metal.mithril', {
  ornate: 0.68,
  glow: 0xfff0c0,
  imp: [
    { stat: 'damageReduction', min: 8, max: 14 },
    { stat: 'physicalResist', min: 5, max: 10 },
  ],
});
arm('chest.aeonshroud', 'Shroud of Aeons', 'chest', 'chest', 82, 60, 0, 163, 'chest.robe', 'cloth.silk', {
  ornate: 0.68,
  glow: 0xc060ff,
  imp: [
    { stat: 'skillLevels', min: 1, max: 2 },
    { stat: 'mana', min: 120, max: 200 },
  ],
});

// ===========================================================================
// GLOVES
// ===========================================================================

arm('gloves.leather', 'Leather Gloves', 'gloves', 'gloves', 2, 8, 0, 3, 'gloves.light', 'leather.worn');
arm('gloves.heavy', 'Heavy Gloves', 'gloves', 'gloves', 22, 26, 0, 16, 'gloves.light', 'leather.worn', { ornate: 0.18 });
arm('gloves.bramble', 'Bramble Mitts', 'gloves', 'gloves', 48, 46, 0, 32, 'gloves.light', 'leather.dark', {
  ornate: 0.32,
  imp: [{ stat: 'attackSpeed', min: 3, max: 7 }],
});

arm('gloves.gauntlets', 'Gauntlets', 'gloves', 'gloves', 12, 30, 0, 17, 'gloves.plate', 'metal.iron');
arm('gloves.war', 'War Gauntlets', 'gloves', 'gloves', 36, 62, 0, 43, 'gloves.plate', 'metal.steel', { ornate: 0.24 });
arm('gloves.ogre', 'Ogre Gauntlets', 'gloves', 'gloves', 60, 102, 0, 68, 'gloves.plate', 'metal.dark', {
  ornate: 0.4,
  imp: [{ stat: 'strength', min: 4, max: 9 }],
});

arm('gloves.silk', 'Silk Gloves', 'gloves', 'gloves', 6, 0, 0, 4, 'gloves.silk', 'cloth.silk', {
  imp: [{ stat: 'manaRegen', min: 2, max: 5 }],
});
arm('gloves.vampirebone', 'Vampirebone Gloves', 'gloves', 'gloves', 30, 12, 0, 15, 'gloves.silk', 'bone.pale', {
  ornate: 0.28,
  imp: [{ stat: 'manaSteal', min: 1, max: 3 }],
});
arm('gloves.sorcerer', "Sorcerer's Wraps", 'gloves', 'gloves', 58, 20, 0, 28, 'gloves.silk', 'cloth.silk', {
  ornate: 0.42,
  glow: 0x8fa8ff,
  imp: [{ stat: 'castSpeed', min: 6, max: 12 }],
});

arm('gloves.eclipse', 'Gauntlets of the Eclipse', 'gloves', 'gloves', 83, 138, 0, 97, 'gloves.plate', 'metal.mithril', {
  ornate: 0.62,
  glow: 0xc060ff,
  imp: [
    { stat: 'attackSpeed', min: 8, max: 15 },
    { stat: 'critChance', min: 4, max: 8 },
  ],
});

// ===========================================================================
// BOOTS — every boot rolls movement speed.
// ===========================================================================

arm('boots.boots', 'Boots', 'boots', 'boots', 2, 8, 0, 3, 'boots.light', 'leather.worn', {
  imp: [{ stat: 'moveSpeed', min: 3, max: 6 }],
});
arm('boots.heavy', 'Heavy Boots', 'boots', 'boots', 20, 26, 0, 15, 'boots.light', 'leather.worn', {
  ornate: 0.18,
  imp: [{ stat: 'moveSpeed', min: 5, max: 9 }],
});
arm('boots.sharkskin', 'Sharkskin Boots', 'boots', 'boots', 46, 46, 0, 33, 'boots.light', 'leather.dark', {
  ornate: 0.32,
  imp: [{ stat: 'moveSpeed', min: 8, max: 13 }],
});

arm('boots.greaves', 'Greaves', 'boots', 'boots', 14, 34, 0, 20, 'boots.plate', 'metal.iron', {
  imp: [{ stat: 'moveSpeed', min: 2, max: 5 }],
});
arm('boots.war', 'War Boots', 'boots', 'boots', 38, 68, 0, 47, 'boots.plate', 'metal.steel', {
  ornate: 0.24,
  imp: [{ stat: 'moveSpeed', min: 4, max: 8 }],
});
arm('boots.myrmidon', 'Myrmidon Greaves', 'boots', 'boots', 62, 110, 0, 74, 'boots.plate', 'metal.dark', {
  ornate: 0.4,
  imp: [{ stat: 'moveSpeed', min: 6, max: 11 }, { stat: 'damageReduction', min: 2, max: 5 }],
});

arm('boots.slippers', 'Slippers', 'boots', 'boots', 4, 0, 0, 3, 'boots.silk', 'cloth.silk', {
  imp: [{ stat: 'moveSpeed', min: 4, max: 8 }],
});
arm('boots.scarabshell', 'Scarabshell Boots', 'boots', 'boots', 32, 14, 0, 17, 'boots.silk', 'leather.dark', {
  ornate: 0.28,
  imp: [{ stat: 'moveSpeed', min: 7, max: 12 }, { stat: 'manaRegen', min: 4, max: 9 }],
});
arm('boots.wyrmhide', 'Wyrmhide Boots', 'boots', 'boots', 56, 22, 0, 28, 'boots.silk', 'leather.dark', {
  ornate: 0.42,
  glow: 0xd8632a,
  imp: [{ stat: 'moveSpeed', min: 10, max: 16 }, { stat: 'fireResist', min: 8, max: 16 }],
});

arm('boots.gale', 'Striders of the Gale', 'boots', 'boots', 80, 60, 0, 87, 'boots.light', 'metal.mithril', {
  ornate: 0.62,
  glow: 0xf0e05a,
  imp: [
    { stat: 'moveSpeed', min: 15, max: 24 },
    { stat: 'attackSpeed', min: 5, max: 10 },
  ],
});

// ===========================================================================
// BELTS
// ===========================================================================

arm('belt.sash', 'Sash', 'belt', 'belt', 2, 4, 0, 2, 'belt.sash', 'cloth.linen', {
  imp: [{ stat: 'life', min: 4, max: 10 }],
});
arm('belt.light', 'Light Belt', 'belt', 'belt', 18, 16, 0, 9, 'belt.sash', 'leather.worn', {
  ornate: 0.18,
  imp: [{ stat: 'life', min: 14, max: 28 }],
});
arm('belt.spiderweb', 'Spiderweb Sash', 'belt', 'belt', 44, 28, 0, 21, 'belt.sash', 'cloth.silk', {
  ornate: 0.34,
  glow: 0x8a4fd8,
  imp: [{ stat: 'mana', min: 30, max: 60 }, { stat: 'manaRegen', min: 6, max: 14 }],
});

arm('belt.belt', 'Belt', 'belt', 'belt', 10, 22, 0, 10, 'belt.plate', 'leather.worn', {
  imp: [{ stat: 'life', min: 10, max: 20 }],
});
arm('belt.war', 'War Belt', 'belt', 'belt', 34, 58, 0, 28, 'belt.plate', 'metal.iron', {
  ornate: 0.24,
  imp: [{ stat: 'life', min: 32, max: 60 }],
});
arm('belt.troll', 'Troll Belt', 'belt', 'belt', 58, 98, 0, 46, 'belt.plate', 'leather.dark', {
  ornate: 0.38,
  imp: [{ stat: 'life', min: 60, max: 105 }, { stat: 'lifeRegen', min: 6, max: 14 }],
});

arm('belt.girdle', 'Girdle', 'belt', 'belt', 24, 46, 0, 26, 'belt.chain', 'metal.steel', {
  ornate: 0.3,
  imp: [{ stat: 'strength', min: 3, max: 7 }],
});
arm('belt.vampirefang', 'Vampirefang Belt', 'belt', 'belt', 48, 82, 0, 49, 'belt.chain', 'metal.dark', {
  ornate: 0.42,
  glow: 0xa02c30,
  imp: [{ stat: 'lifeSteal', min: 1, max: 3 }, { stat: 'life', min: 40, max: 75 }],
});
arm('belt.colossus', 'Colossus Girdle', 'belt', 'belt', 70, 128, 0, 71, 'belt.chain', 'metal.gold', {
  ornate: 0.52,
  imp: [{ stat: 'strength', min: 8, max: 15 }, { stat: 'life', min: 80, max: 140 }],
});

arm('belt.worldheart', 'Cord of the Worldheart', 'belt', 'belt', 82, 150, 0, 86, 'belt.chain', 'metal.mithril', {
  ornate: 0.68,
  glow: 0xff8adf,
  imp: [
    { stat: 'life', min: 130, max: 220 },
    { stat: 'lifeRegen', min: 20, max: 36 },
    { stat: 'damageReduction', min: 4, max: 8 },
  ],
});

// ===========================================================================
// JEWELLERY — no implicits worth speaking of; these are pure affix platforms.
// ===========================================================================

misc('amulet.amulet', 'Amulet', 'amulet', 'amulet', 5, 'amulet', 'metal.bronze');
misc('amulet.talisman', 'Talisman', 'amulet', 'amulet', 25, 'amulet', 'metal.silver', { ornate: 0.4 });
misc('amulet.reliquary', 'Reliquary', 'amulet', 'amulet', 45, 'amulet', 'metal.gold', { ornate: 0.5, glow: 0xffd24a });
misc('amulet.sigil', 'Sigil', 'amulet', 'amulet', 65, 'amulet', 'crystal.void', { ornate: 0.6, glow: 0x8a4fd8 });
misc('amulet.heartstone', 'Heartstone', 'amulet', 'amulet', 85, 'amulet', 'metal.mithril', {
  ornate: 0.8,
  glow: 0xff8adf,
  imp: [{ stat: 'skillLevels', min: 1, max: 1 }],
});

misc('ring.ring', 'Ring', 'ring', 'ring1', 3, 'ring', 'metal.bronze');
misc('ring.signet', 'Signet', 'ring', 'ring1', 20, 'ring', 'metal.silver', { ornate: 0.35 });
misc('ring.band', 'Band', 'ring', 'ring1', 38, 'ring', 'metal.gold', { ornate: 0.45 });
misc('ring.circle', 'Circle', 'ring', 'ring1', 56, 'ring', 'metal.dark', { ornate: 0.55, glow: 0x6f8cff });
misc('ring.halo', 'Halo', 'ring', 'ring1', 74, 'ring', 'crystal.gem', { ornate: 0.65, glow: 0xdff0ff });
misc('ring.eternity', 'Eternity Loop', 'ring', 'ring1', 88, 'ring', 'metal.mithril', {
  ornate: 0.85,
  glow: 0xff8adf,
  imp: [{ stat: 'skillLevels', min: 1, max: 1 }],
});

misc('charm.small', 'Small Charm', 'charm', 'none', 1, 'charm.small', 'crystal.gem', { glow: 0x6f8cff });
misc('charm.large', 'Large Charm', 'charm', 'none', 12, 'charm.large', 'crystal.gem', { glow: 0x6f8cff });
misc('charm.grand', 'Grand Charm', 'charm', 'none', 25, 'charm.grand', 'crystal.gem', { glow: 0x8fa8ff });
misc('charm.sacred', 'Sacred Charm', 'charm', 'none', 50, 'charm.grand', 'metal.gold', { ornate: 0.6, glow: 0xffd24a });
misc('charm.eternal', 'Eternal Charm', 'charm', 'none', 75, 'charm.grand', 'crystal.void', {
  ornate: 0.8,
  glow: 0xc060ff,
  imp: [{ stat: 'skillLevels', min: 1, max: 1 }],
});

// ===========================================================================
// CONSUMABLES
// ===========================================================================

/** Restore amounts and effects, resolved by whoever handles the use action. */
export interface PotionEffect {
  /** Flat life restored, or a fraction of max life if `lifePct` is set. */
  life?: number;
  lifePct?: number;
  mana?: number;
  manaPct?: number;
  /** Seconds over which the restore ticks. 0 = instant. */
  over?: number;
  /** Temporary stat buff applied for `buffDuration` seconds. */
  buff?: Partial<Record<StatKey, number>>;
  buffDuration?: number;
  /** Status effect ids cleansed on use. */
  cleanse?: string[];
}

export const POTION_EFFECTS: Record<string, PotionEffect> = {
  'potion.heal.minor': { life: 45, over: 2 },
  'potion.heal.light': { life: 110, over: 2 },
  'potion.heal.greater': { life: 260, over: 2.5 },
  'potion.heal.super': { life: 620, over: 3 },
  'potion.heal.full': { lifePct: 0.6, over: 3 },
  'potion.mana.minor': { mana: 40, over: 2 },
  'potion.mana.light': { mana: 100, over: 2 },
  'potion.mana.greater': { mana: 240, over: 2.5 },
  'potion.mana.super': { mana: 560, over: 3 },
  'potion.rejuv.lesser': { lifePct: 0.35, manaPct: 0.35, over: 0 },
  'potion.rejuv.full': { lifePct: 1, manaPct: 1, over: 0 },
  'potion.antidote': { cleanse: ['poison', 'plague'], buff: { poisonResist: 50 }, buffDuration: 30 },
  'potion.thawing': { cleanse: ['chill', 'freeze'], buff: { coldResist: 50 }, buffDuration: 30 },
  'potion.stamina': { buff: { moveSpeed: 25, attackSpeed: 10 }, buffDuration: 25 },
  'potion.oil.fire': { buff: { fireDamage: 40, elementalDamagePct: 15 }, buffDuration: 60 },
  'potion.oil.venom': { buff: { poisonDamage: 45, critChance: 5 }, buffDuration: 60 },
};

misc('potion.heal.minor', 'Minor Healing Potion', 'potion', 'consumable', 1, 'potion.flask', 'crystal.gem', {
  glow: 0xe0323c,
});
misc('potion.heal.light', 'Light Healing Potion', 'potion', 'consumable', 10, 'potion.flask', 'crystal.gem', {
  glow: 0xe0323c,
});
misc('potion.heal.greater', 'Greater Healing Potion', 'potion', 'consumable', 26, 'potion.flask', 'crystal.gem', {
  glow: 0xe0323c,
});
misc('potion.heal.super', 'Super Healing Potion', 'potion', 'consumable', 48, 'potion.flask', 'crystal.gem', {
  glow: 0xe0323c,
});
misc('potion.heal.full', 'Elixir of Renewal', 'potion', 'consumable', 70, 'potion.round', 'crystal.gem', {
  glow: 0xff8adf,
});
misc('potion.mana.minor', 'Minor Mana Potion', 'potion', 'consumable', 1, 'potion.flask', 'crystal.gem', {
  glow: 0x3a6ce0,
});
misc('potion.mana.light', 'Light Mana Potion', 'potion', 'consumable', 10, 'potion.flask', 'crystal.gem', {
  glow: 0x3a6ce0,
});
misc('potion.mana.greater', 'Greater Mana Potion', 'potion', 'consumable', 26, 'potion.flask', 'crystal.gem', {
  glow: 0x3a6ce0,
});
misc('potion.mana.super', 'Super Mana Potion', 'potion', 'consumable', 48, 'potion.flask', 'crystal.gem', {
  glow: 0x3a6ce0,
});
misc('potion.rejuv.lesser', 'Rejuvenation Potion', 'potion', 'consumable', 20, 'potion.round', 'crystal.gem', {
  glow: 0x9a52d8,
});
misc('potion.rejuv.full', 'Full Rejuvenation Potion', 'potion', 'consumable', 55, 'potion.round', 'crystal.gem', {
  glow: 0xc060ff,
});
misc('potion.antidote', 'Antidote', 'potion', 'consumable', 6, 'potion.vial', 'crystal.gem', { glow: 0x35c05a });
misc('potion.thawing', 'Thawing Draught', 'potion', 'consumable', 6, 'potion.vial', 'crystal.gem', { glow: 0x74c2e0 });
misc('potion.stamina', 'Stamina Tonic', 'potion', 'consumable', 4, 'potion.vial', 'crystal.gem', { glow: 0xf0e05a });
misc('potion.oil.fire', 'Blazing Oil', 'potion', 'consumable', 30, 'potion.vial', 'crystal.gem', { glow: 0xd8632a });
misc('potion.oil.venom', 'Venom Oil', 'potion', 'consumable', 30, 'potion.vial', 'crystal.gem', { glow: 0x7ec24a });

// ===========================================================================
// GENERATED BASES — gems, runes and materials are items too.
// ===========================================================================

for (const gem of GEMS) {
  bases.push({
    id: gem.id,
    name: gem.name,
    category: 'gem',
    slot: 'none',
    levelReq: gem.levelReq,
    visual: { shape: `gem.${gem.family}`, palette: 'crystal.gem', ornate: 0.5 + gem.qualityIndex * 0.08, glow: gem.color },
  });
}

for (const rune of RUNES) {
  bases.push({
    id: rune.id,
    name: rune.name,
    category: 'rune',
    slot: 'none',
    levelReq: rune.levelReq,
    visual: { shape: 'rune.stone', palette: 'stone.crypt', ornate: 0.4, glow: rune.color },
  });
}

for (const mat of MATERIALS) {
  bases.push({
    id: mat.id,
    name: mat.name,
    category: 'material',
    slot: 'none',
    levelReq: 1,
    visual: { shape: `material.${mat.kind}`, palette: 'crystal.gem', ornate: 0.2 + mat.tier * 0.1, glow: mat.color },
  });
}

// ===========================================================================
// Exports and lookup helpers
// ===========================================================================

/**
 * Handedness normalisation.
 *
 * Nothing in the authored data was ever marked two-handed, so every greatsword,
 * maul, bow and staff behaved as a one-hander and could be paired with a
 * shield. Rather than hand-editing 150 entries, handedness is derived once here
 * from the category and the base's own name, which is where the information
 * actually lives.
 */
const ALWAYS_TWO_HANDED = new Set<ItemCategory>(['bow', 'crossbow', 'staff', 'spear']);

/** Name fragments that mark an otherwise one-handed weapon family as a two-hander. */
const TWO_HANDED_WORDS = [
  'great', 'giant', 'huge', 'massive', 'maul', 'two-hand', 'twohand', 'zweihander',
  'claymore', 'flamberge', 'bardiche', 'halberd', 'poleaxe', 'glaive', 'pike',
  'warhammer', 'battle staff', 'longstaff', 'executioner', 'colossus', 'titan',
];

const ONE_HANDED_CATEGORIES = new Set<ItemCategory>([
  'sword', 'axe', 'mace', 'dagger', 'wand', 'scepter',
]);

/** True when this base needs both hands. */
export function isTwoHandedBase(base: ItemBase): boolean {
  if (base.slot === 'twoHand') return true;
  if (ALWAYS_TWO_HANDED.has(base.category)) return true;
  if (!ONE_HANDED_CATEGORIES.has(base.category)) return false;
  const hay = `${base.id} ${base.name}`.toLowerCase();
  return TWO_HANDED_WORDS.some((w) => hay.includes(w));
}

/** Melee categories that a dual-wielding class may hold in either hand. */
export const ONE_HAND_MELEE = new Set<ItemCategory>(['sword', 'axe', 'mace', 'dagger']);

for (const b of bases) {
  if (b.slot === 'mainHand' && isTwoHandedBase(b)) {
    b.slot = 'twoHand';
    // Two-handers hit harder and demand more of the wielder.
    if (b.baseMinDamage !== undefined) b.baseMinDamage = Math.round(b.baseMinDamage * 1.45);
    if (b.baseMaxDamage !== undefined) b.baseMaxDamage = Math.round(b.baseMaxDamage * 1.5);
    if (b.strReq) b.strReq = Math.round(b.strReq * 1.15);
  }
}

export const ITEM_BASES: ItemBase[] = bases;

const BY_ID = new Map<string, ItemBase>(bases.map((b) => [b.id, b]));

export function findBase(id: string): ItemBase | undefined {
  return BY_ID.get(id);
}

const BY_CATEGORY = new Map<ItemCategory, ItemBase[]>();
for (const b of bases) {
  const list = BY_CATEGORY.get(b.category);
  if (list) list.push(b);
  else BY_CATEGORY.set(b.category, [b]);
}

export function basesInCategory(category: ItemCategory): ItemBase[] {
  return BY_CATEGORY.get(category) ?? [];
}

/** Categories a monster drop table is allowed to produce. */
export const EQUIPMENT_CATEGORIES: ItemCategory[] = [
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
  'shield',
  'orb',
  'quiver',
  'helm',
  'chest',
  'gloves',
  'boots',
  'belt',
  'amulet',
  'ring',
  'charm',
];

export const WEAPON_CATEGORIES: ItemCategory[] = [
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

export const ARMOR_CATEGORIES: ItemCategory[] = ['helm', 'chest', 'gloves', 'boots', 'belt', 'shield'];
export const JEWELRY_CATEGORIES: ItemCategory[] = ['amulet', 'ring', 'charm'];

export function isWeapon(base: ItemBase): boolean {
  return base.baseMinDamage !== undefined;
}

export function isArmor(base: ItemBase): boolean {
  return ARMOR_CATEGORIES.includes(base.category);
}

export function isEquippable(base: ItemBase): boolean {
  return base.slot !== 'none' && base.slot !== 'consumable';
}

export function isStackableCategory(category: ItemCategory): boolean {
  return category === 'potion' || category === 'material' || category === 'gem' || category === 'rune';
}

/**
 * How many sockets a base is allowed to hold. Two-handers get the most, which
 * is the counterweight to giving up a shield.
 */
export function maxSockets(base: ItemBase): number {
  if (!isEquippable(base)) return 0;
  switch (base.category) {
    case 'ring':
    case 'amulet':
    case 'charm':
    case 'quiver':
      return 0;
    case 'gloves':
    case 'boots':
    case 'belt':
      return base.levelReq >= 40 ? 2 : 1;
    case 'helm':
      return base.levelReq >= 30 ? 3 : 2;
    case 'chest':
      return base.levelReq >= 40 ? 4 : base.levelReq >= 20 ? 3 : 2;
    case 'shield':
    case 'orb':
      return base.levelReq >= 40 ? 4 : base.levelReq >= 20 ? 3 : 2;
    default:
      break;
  }
  if (base.slot === 'twoHand') return base.levelReq >= 40 ? 6 : base.levelReq >= 18 ? 5 : 3;
  return base.levelReq >= 40 ? 4 : base.levelReq >= 18 ? 3 : 2;
}

/**
 * Class weighting for drop rolls. Not a hard restriction (a warden can pick up
 * a staff and sell it) — it just biases the table so most of what you find is
 * something you could plausibly use.
 */
const CLASS_PREFERENCE: Record<CharClassId, Partial<Record<ItemCategory, number>>> = {
  warden: { sword: 2.2, axe: 2.2, mace: 2.2, spear: 1.8, shield: 2.4, chest: 1.5, helm: 1.3, dagger: 0.5, wand: 0.15, staff: 0.25, orb: 0.15, bow: 0.6, crossbow: 0.6, scepter: 0.9 },
  pyromancer: { wand: 2.4, staff: 2.4, orb: 2.4, scepter: 1.4, dagger: 1.0, sword: 0.5, axe: 0.3, mace: 0.4, spear: 0.3, bow: 0.3, crossbow: 0.3, shield: 0.7, chest: 0.9 },
  shadowblade: { dagger: 2.6, sword: 1.6, bow: 1.8, crossbow: 1.6, gloves: 1.5, boots: 1.5, axe: 0.8, mace: 0.5, staff: 0.3, wand: 0.5, orb: 0.4, spear: 0.8, shield: 0.7 },
  stormcaller: { staff: 2.2, wand: 2.0, orb: 2.2, spear: 1.4, scepter: 1.3, boots: 1.6, sword: 0.6, axe: 0.4, mace: 0.4, dagger: 0.8, bow: 0.6, crossbow: 0.5, shield: 0.7 },
  revenant: { wand: 2.4, scepter: 2.0, orb: 2.0, dagger: 1.4, staff: 1.6, shield: 1.2, amulet: 1.3, sword: 0.7, axe: 0.5, mace: 0.6, spear: 0.5, bow: 0.35, crossbow: 0.35 },
  ranger: { bow: 3.0, crossbow: 2.8, quiver: 2.4, gloves: 1.5, boots: 1.6, dagger: 1.2, sword: 0.9, spear: 0.9, axe: 0.5, mace: 0.2, staff: 0.2, wand: 0.2, orb: 0.2, shield: 0.15 },
};

export function classAffinity(base: ItemBase, classId?: CharClassId): number {
  if (base.classes && classId && !base.classes.includes(classId)) return 0.05;
  if (!classId) return 1;
  return CLASS_PREFERENCE[classId][base.category] ?? 1;
}

/**
 * Drop weight for a base at a given item level. Bases become available a few
 * levels early, peak, then slowly fade so the table keeps churning instead of
 * hard-swapping between tiers.
 */
export function baseDropWeight(base: ItemBase, ilvl: number): number {
  if (base.levelReq > ilvl + 2) return 0;
  const over = ilvl - base.levelReq;
  if (over < 0) return 0.25;
  // Full weight for ~28 levels, then decay — never quite to zero.
  if (over <= 28) return 1;
  return Math.max(0.06, 1 - (over - 28) * 0.028);
}

/** Rough gold value of the base before any affixes. Feeds `vendorPrice`. */
export function baseValue(base: ItemBase): number {
  let v = 8 + base.levelReq * 4;
  if (base.baseMinDamage !== undefined && base.baseMaxDamage !== undefined) {
    v += (base.baseMinDamage + base.baseMaxDamage) * 1.6;
  }
  if (base.baseDefense) v += base.baseDefense * 1.1;
  if (base.baseBlock) v += base.baseBlock * 120;
  if (base.implicits) v += base.implicits.length * (6 + base.levelReq * 0.8);
  if (base.slot === 'twoHand') v *= 1.15;
  if (base.category === 'gem' || base.category === 'rune' || base.category === 'material') v = 0;
  return Math.round(v);
}
