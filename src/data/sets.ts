/**
 * SLAY — item sets.
 *
 * Sets are the game's answer to "what do I do with the gear I find at level
 * 30?". A single piece already beats a good rare of its level (it stays at
 * the set's own item level, see `buildSetPiece` in `sim/Loot.ts`), and the set
 * pays again in its partial bonuses, so a set asks you to commit slots to a
 * plan and rewards you along the way.
 *
 * Every set escalates at 2 / 3 / 4 (/ 5 / full) pieces, and every set pushes a
 * specific playstyle hard enough that the full bonus reads as a build, not a
 * stat stick — attack speed engines, block walls, poison stacking, mana-as-life
 * casters, magic-find farmers.
 */

import type { StatKey } from '../types';
import { applySetText } from './story/uniqueText';
import { DEPTH_SETS } from './setsDepth';
import { ITEM_BASES } from './itemBases';
import { tr } from '../core/I18n';

export interface SetModRoll {
  stat: StatKey;
  min: number;
  max: number;
}

export interface SetPieceDef {
  id: string;
  name: string;
  setId: string;
  baseId: string;
  /** Lowest item level at which this piece can drop. */
  ilvl: number;
  levelReq: number;
  mods: SetModRoll[];
  sockets?: number;
  /** Relative weight inside the set drop pool. */
  weight: number;
}

export interface SetBonusTier {
  /** Pieces of the set that must be equipped. */
  pieces: number;
  desc: string;
  mods: Array<{ stat: StatKey; value: number }>;
  /** A signature power this tier grants (see `sim/ItemPowers.ts`). */
  power?: string;
  /** The power's magnitude; 1 when omitted. */
  powerMag?: number;
}

export interface SetDef {
  id: string;
  name: string;
  blurb: string;
  levelReq: number;
  ilvl: number;
  weight: number;
  pieces: SetPieceDef[];
  bonuses: SetBonusTier[];
}

type PieceSpec = [string, string, string, Array<[StatKey, number, number]>, number?];
type BonusSpec = [number, string, Array<[StatKey, number]>];

const ALL: SetDef[] = [];

function set(
  id: string,
  name: string,
  blurb: string,
  levelReq: number,
  ilvl: number,
  weight: number,
  pieces: PieceSpec[],
  bonuses: BonusSpec[],
): SetDef {
  const def: SetDef = {
    id,
    name,
    blurb,
    levelReq,
    ilvl,
    weight,
    pieces: pieces.map(([pieceId, pieceName, baseId, mods, sockets]) => {
      const piece: SetPieceDef = {
        id: pieceId,
        name: pieceName,
        setId: id,
        baseId,
        ilvl,
        levelReq,
        mods: mods.map(([stat, min, max]) => ({ stat, min, max })),
        weight: 100,
      };
      if (sockets) piece.sockets = sockets;
      return piece;
    }),
    bonuses: bonuses.map(([count, desc, mods]) => ({
      pieces: count,
      desc,
      mods: mods.map(([stat, value]) => ({ stat, value })),
    })),
  };
  ALL.push(def);
  return def;
}

// ===========================================================================
// EARLY SETS — levels 8-25. Three pieces, cheap to complete, obviously good.
// ===========================================================================

set(
  'set.bloodied',
  tr('The Bloodied Hand'),
  tr('Three pieces of a mercenary company that stopped taking prisoners.'),
  8,
  10,
  120,
  [
    ['set.bloodied.axe', tr("Redgrip, the Bloodied Hand"), 'axe.hand', [['enhancedDamage', 30, 45], ['maxDamage', 4, 7], ['lifeSteal', 1, 2]]],
    ['set.bloodied.gloves', tr('Redgrip Mitts'), 'gloves.leather', [['attackSpeed', 5, 8], ['strength', 4, 7], ['defense', 8, 14]]],
    ['set.bloodied.belt', tr('Redgrip Cinch'), 'belt.sash', [['life', 18, 30], ['lifeRegen', 3, 6], ['defense', 6, 12]]],
  ],
  [
    [2, tr('+13% Attack Speed, +3% Life Stolen per Hit'), [['attackSpeed', 13], ['lifeSteal', 3]]],
    [3, tr('+60% Enhanced Damage, +40 Life, +8% Critical Strike Chance'), [['enhancedDamage', 60], ['life', 40], ['critChance', 8]]],
  ],
);

set(
  'set.kindled',
  tr('Vestments of the Kindled'),
  tr('A novice mage burned down her own order. These are what was left.'),
  12,
  14,
  115,
  [
    ['set.kindled.wand', tr('Kindling'), 'wand.bone', [['fireDamage', 10, 20], ['castSpeed', 5, 8], ['skillLevels', 1, 1]]],
    ['set.kindled.chest', tr('Kindled Robe'), 'chest.quilted', [['mana', 25, 45], ['fireResist', 15, 25], ['enhancedDefense', 30, 50]]],
    ['set.kindled.helm', tr('Kindled Cowl'), 'helm.cap', [['energy', 5, 9], ['manaRegen', 12, 20], ['fireDamage', 6, 14]]],
    ['set.kindled.legs', tr('Kindled Breeches'), 'pants.silk', [['mana', 20, 35], ['fireResist', 15, 25], ['castSpeed', 4, 7]]],
  ],
  [
    [2, tr('+11% Cast Speed, +25% Fire Resistance'), [['castSpeed', 11], ['fireResist', 25]]],
    [3, tr('+1 to All Skills, +25% Elemental Damage, Adds 30 Fire Damage'), [['skillLevels', 1], ['elementalDamagePct', 25], ['fireDamage', 30]]],
    [4, tr('+13% Cast Speed, +60 Mana, +10 Mana Regeneration'), [['castSpeed', 13], ['mana', 60], ['manaRegen', 10]]],
  ],
);

set(
  'set.quickstep',
  tr('Trail of the Quick'),
  tr('Nobody in this set has ever been hit. Nobody in this set has ever been hit twice.'),
  18,
  20,
  110,
  [
    ['set.quickstep.boots', tr('Quickstep Treads'), 'boots.heavy', [['moveSpeed', 10, 15], ['dexterity', 6, 10], ['defense', 12, 20]]],
    ['set.quickstep.dagger', tr('Quickstep Fang'), 'dagger.dirk', [['attackSpeed', 7, 10], ['critChance', 4, 7], ['maxDamage', 6, 11]]],
    ['set.quickstep.gloves', tr('Quickstep Wraps'), 'gloves.heavy', [['attackSpeed', 7, 9], ['dexterity', 5, 9], ['maxDamage', 5, 9]]],
    ['set.quickstep.legs', tr('Quickstep Leggings'), 'pants.studded', [['moveSpeed', 6, 10], ['dexterity', 6, 10], ['defense', 18, 28]]],
  ],
  [
    [2, tr('+18% Movement Speed, +12 Dexterity'), [['moveSpeed', 18], ['dexterity', 12]]],
    [3, tr('+15% Attack Speed, +10% Critical Strike Chance, +45% Critical Strike Damage'), [['attackSpeed', 15], ['critChance', 10], ['critDamage', 45]]],
    [4, tr('+12% Movement Speed, +20 Dexterity, +80 Life'), [['moveSpeed', 12], ['dexterity', 20], ['life', 80]]],
  ],
);

// ===========================================================================
// MID SETS — levels 22-50. Four and five pieces, real build commitments.
// ===========================================================================

set(
  'set.bonefetter',
  tr('Bonefetter Regalia'),
  tr('Worn by a revenant who kept his household staff on after their deaths.'),
  22,
  24,
  105,
  [
    ['set.bonefetter.wand', tr('Bonefetter Rod'), 'wand.grim', [['skillLevels', 1, 1], ['arcaneDamage', 15, 30], ['manaSteal', 1, 3]]],
    ['set.bonefetter.helm', tr('Bonefetter Crown'), 'helm.bone', [['mana', 40, 70], ['manaRegen', 18, 28], ['enhancedDefense', 50, 80]]],
    ['set.bonefetter.chest', tr('Bonefetter Shroud'), 'chest.ghost', [['enhancedDefense', 60, 95], ['life', 45, 75], ['poisonResist', 20, 32]]],
    ['set.bonefetter.shield', tr('Bonefetter Ward'), 'shield.grim', [['blockChance', 5, 9], ['lifeRegen', 8, 14], ['arcaneResist', 20, 32]]],
  ],
  [
    [2, tr('+60 Mana, +30% Mana Regeneration'), [['mana', 60], ['manaRegen', 30]]],
    [3, tr('+1 to All Skills, +5% Mana Stolen per Hit'), [['skillLevels', 1], ['manaSteal', 5]]],
    [4, tr('+2 to All Skills, +120 Life, +35% Cooldown Reduction — your summons inherit your regeneration'), [['skillLevels', 2], ['life', 120], ['cooldownReduction', 35], ['lifeRegen', 25]]],
  ],
);

set(
  'set.gravewarden',
  tr("Grave Warden's Watch"),
  tr('Four hundred nights on a wall, and not one thing got past.'),
  28,
  30,
  100,
  [
    ['set.gravewarden.shield', tr("Warden's Vigil"), 'shield.dragon', [['blockChance', 8, 12], ['enhancedDefense', 70, 110], ['damageReduction', 3, 5]]],
    ['set.gravewarden.chest', tr("Warden's Carapace"), 'chest.chainmail', [['enhancedDefense', 90, 140], ['life', 70, 115], ['physicalResist', 3, 6]]],
    ['set.gravewarden.helm', tr("Warden's Casque"), 'helm.full', [['enhancedDefense', 70, 110], ['vitality', 10, 17], ['damageReduction', 2, 4]]],
    ['set.gravewarden.boots', tr("Warden's Stand"), 'boots.greaves', [['enhancedDefense', 60, 95], ['moveSpeed', 5, 9], ['coldResist', 20, 32]]],
  ],
  [
    [2, tr('+80 Defense, +8% Block Chance'), [['defense', 80], ['blockChance', 8]]],
    [3, tr('+10% Damage Reduction, +180 Life'), [['damageReduction', 10], ['life', 180]]],
    [4, tr('+120% Enhanced Defense, +12% Physical Resistance, +30 Life Regeneration'), [['enhancedDefense', 120], ['physicalResist', 12], ['lifeRegen', 30]]],
  ],
);

set(
  'set.frostwrought',
  tr('Frostwrought Panoply'),
  tr('Forged in a vault where the forge itself had to be kept warm.'),
  34,
  36,
  100,
  [
    ['set.frostwrought.sword', tr('Frostwrought Edge'), 'sword.tusk', [['coldDamage', 40, 75], ['enhancedDamage', 70, 110], ['coldResist', 20, 32]]],
    ['set.frostwrought.chest', tr('Frostwrought Plate'), 'chest.splint', [['enhancedDefense', 100, 155], ['coldResist', 25, 40], ['life', 80, 130]]],
    ['set.frostwrought.gloves', tr('Frostwrought Grips'), 'gloves.war', [['coldDamage', 25, 50], ['attackSpeed', 7, 10], ['strength', 8, 14]]],
    ['set.frostwrought.helm', tr('Frostwrought Visor'), 'helm.grim', [['coldResist', 25, 40], ['enhancedDefense', 80, 125], ['critDamage', 25, 45]]],
    ['set.frostwrought.legs', tr('Frostwrought Chausses'), 'pants.chausses', [['coldResist', 25, 40], ['enhancedDefense', 90, 140], ['vitality', 10, 16]]],
  ],
  [
    [2, tr('Adds 60 Cold Damage, +30% Cold Resistance'), [['coldDamage', 60], ['coldResist', 30]]],
    [3, tr('+35% Elemental Damage, +60% Critical Strike Damage'), [['elementalDamagePct', 35], ['critDamage', 60]]],
    [4, tr('Adds 160 Cold Damage, +40% Cold Resistance, +11% Attack Speed — chilled enemies shatter on death'), [['coldDamage', 160], ['coldResist', 40], ['attackSpeed', 11], ['areaDamagePct', 35]]],
    [5, tr('+180 Life, +10% Damage Reduction, +40% Elemental Damage'), [['life', 180], ['damageReduction', 10], ['elementalDamagePct', 40]]],
  ],
);

set(
  'set.stormbound',
  tr('The Stormbound Circuit'),
  tr('Five conductors in a ring. Whatever is inside the ring does not stay standing.'),
  40,
  42,
  95,
  [
    ['set.stormbound.staff', tr('Stormbound Rod'), 'staff.war', [['lightningDamage', 20, 130], ['skillLevels', 1, 1], ['castSpeed', 9, 12]]],
    ['set.stormbound.helm', tr('Stormbound Circlet'), 'helm.coronet', [['lightningResist', 25, 40], ['manaRegen', 25, 40], ['castSpeed', 8, 11]]],
    ['set.stormbound.chest', tr('Stormbound Weave'), 'chest.studded', [['enhancedDefense', 90, 140], ['mana', 90, 145], ['lightningResist', 25, 40]]],
    ['set.stormbound.boots', tr('Stormbound Striders'), 'boots.war', [['moveSpeed', 10, 16], ['lightningDamage', 10, 90], ['enhancedDefense', 70, 110]]],
    ['set.stormbound.amulet', tr('Stormbound Sigil'), 'amulet.talisman', [['skillLevels', 1, 1], ['lightningDamage', 15, 110], ['energy', 10, 17]]],
  ],
  [
    [2, tr('Adds 40 Lightning Damage, +13% Cast Speed'), [['lightningDamage', 40], ['castSpeed', 13]]],
    [3, tr('+1 to All Skills, +40% Lightning Resistance'), [['skillLevels', 1], ['lightningResist', 40]]],
    [4, tr('+40% Elemental Damage, +18% Cooldown Reduction'), [['elementalDamagePct', 40], ['cooldownReduction', 18]]],
    [5, tr('+2 to All Skills, Adds 320 Lightning Damage, +25% Movement Speed — your lightning arcs to a second target'), [['skillLevels', 2], ['lightningDamage', 320], ['moveSpeed', 25], ['areaDamagePct', 40]]],
  ],
);

set(
  'set.venomthread',
  tr('Venomthread Weave'),
  tr('Not woven. Extruded. The weaver is still under the floorboards.'),
  45,
  47,
  95,
  [
    ['set.venomthread.dagger', tr('Venomthread Fang'), 'dagger.blade', [['poisonDamage', 60, 110], ['critChance', 6, 10], ['attackSpeed', 8, 11]]],
    ['set.venomthread.gloves', tr('Venomthread Grasp'), 'gloves.bramble', [['attackSpeed', 9, 12], ['poisonDamage', 40, 75], ['dexterity', 12, 20]]],
    ['set.venomthread.boots', tr('Venomthread Steps'), 'boots.sharkskin', [['moveSpeed', 14, 21], ['poisonResist', 25, 40], ['critChance', 4, 7]]],
    ['set.venomthread.chest', tr('Venomthread Shroud'), 'chest.dusk', [['enhancedDefense', 110, 170], ['poisonResist', 30, 45], ['dexterity', 14, 22]]],
  ],
  [
    [2, tr('+13% Attack Speed, Adds 90 Poison Damage'), [['attackSpeed', 13], ['poisonDamage', 90]]],
    [3, tr('+12% Critical Strike Chance, +40% Poison Resistance'), [['critChance', 12], ['poisonResist', 40]]],
    [4, tr('Adds 280 Poison Damage, +110% Critical Strike Damage, +30% Movement Speed — poison you apply stacks without limit'), [['poisonDamage', 280], ['critDamage', 110], ['moveSpeed', 30]]],
  ],
);

// ===========================================================================
// LATE SETS — levels 52-70. Five pieces, and they carry a whole character.
// ===========================================================================

set(
  'set.ironvow',
  tr('Aegis of the Iron Vow'),
  tr('The vow was short: nothing gets through. It has been kept.'),
  52,
  54,
  90,
  [
    ['set.ironvow.shield', tr('Vowbearer'), 'shield.pavise', [['blockChance', 12, 18], ['enhancedDefense', 130, 200], ['damageReduction', 5, 9], ['vitality', 10, 16]]],
    ['set.ironvow.chest', tr('Vowplate'), 'chest.gothic', [['enhancedDefense', 160, 240], ['life', 140, 220], ['physicalResist', 5, 9]]],
    ['set.ironvow.helm', tr('Vowhelm'), 'helm.great', [['enhancedDefense', 120, 190], ['vitality', 18, 28], ['damageReduction', 4, 7]]],
    ['set.ironvow.mace', tr('Vowbreaker'), 'mace.truncheon', [['enhancedDamage', 130, 200], ['lifeSteal', 3, 5], ['areaDamagePct', 15, 25]]],
    ['set.ironvow.belt', tr('Vowcord'), 'belt.vampirefang', [['life', 120, 190], ['damageReduction', 3, 6], ['lifeRegen', 20, 32]]],
    ['set.ironvow.legs', tr('Vowguard'), 'pants.cuisses', [['enhancedDefense', 140, 210], ['vitality', 16, 26], ['blockChance', 4, 7]]],
  ],
  [
    [2, tr('+12% Block Chance, +150 Defense'), [['blockChance', 12], ['defense', 150]]],
    [3, tr('+14% Damage Reduction, +250 Life'), [['damageReduction', 14], ['life', 250]]],
    [4, tr('+15% Physical Resistance, +45 Life Regeneration'), [['physicalResist', 15], ['lifeRegen', 45]]],
    [5, tr('+200% Enhanced Defense, +25% Block Chance, +8% Life Stolen per Hit — blocking reflects the blow'), [['enhancedDefense', 200], ['blockChance', 25], ['lifeSteal', 8], ['critDamage', 60]]],
    [6, tr('+350 Life, +10% Damage Reduction, +20% Physical Resistance'), [['life', 350], ['damageReduction', 10], ['physicalResist', 20]]],
  ],
);

set(
  'set.ashwalker',
  tr("Ashwalker's Legacy"),
  tr('He walked out of the Ashwaste after nine years. Nothing followed him out.'),
  58,
  60,
  88,
  [
    ['set.ashwalker.axe', tr("Ashwalker's Cleaver"), 'axe.berserker', [['fireDamage', 90, 160], ['enhancedDamage', 160, 240], ['attackSpeed', 8, 11]]],
    ['set.ashwalker.chest', tr("Ashwalker's Hide"), 'chest.wyrmhide', [['enhancedDefense', 160, 250], ['fireResist', 30, 48], ['life', 150, 240]]],
    ['set.ashwalker.boots', tr("Ashwalker's Tread"), 'boots.wyrmhide', [['moveSpeed', 15, 23], ['fireResist', 25, 40], ['fireDamage', 45, 85]]],
    ['set.ashwalker.helm', tr("Ashwalker's Mask"), 'helm.spired', [['enhancedDefense', 130, 200], ['fireDamage', 60, 110], ['strength', 15, 25]]],
    ['set.ashwalker.gloves', tr("Ashwalker's Grip"), 'gloves.ogre', [['attackSpeed', 9, 13], ['strength', 18, 28], ['critDamage', 50, 85]]],
  ],
  [
    [2, tr('Adds 120 Fire Damage, +35% Fire Resistance'), [['fireDamage', 120], ['fireResist', 35]]],
    [3, tr('+15% Attack Speed, +6% Life Stolen per Hit'), [['attackSpeed', 15], ['lifeSteal', 6]]],
    [4, tr('+45% Elemental Damage, +50% Area Damage'), [['elementalDamagePct', 45], ['areaDamagePct', 50]]],
    [5, tr('Adds 480 Fire Damage, +200% Enhanced Damage, +130% Critical Strike Damage — kills leave burning ground'), [['fireDamage', 480], ['enhancedDamage', 200], ['critDamage', 130]]],
  ],
);

set(
  'set.gilded',
  tr('The Gilded Compact'),
  tr('An agreement between four thieves, none of whom trusted the other three.'),
  62,
  64,
  85,
  [
    ['set.gilded.helm', tr('Gilded Circlet'), 'helm.diadem', [['magicFind', 30, 48], ['goldFind', 90, 150], ['skillLevels', 1, 1]]],
    ['set.gilded.gloves', tr('Gilded Touch'), 'gloves.sorcerer', [['magicFind', 25, 40], ['goldFind', 80, 130], ['castSpeed', 8, 11]]],
    ['set.gilded.boots', tr('Gilded Stride'), 'boots.wyrmhide', [['magicFind', 25, 40], ['moveSpeed', 14, 22], ['goldFind', 80, 130]]],
    ['set.gilded.ring', tr('Gilded Circle'), 'ring.circle', [['magicFind', 28, 45], ['goldFind', 100, 160], ['life', 90, 150]]],
  ],
  [
    [2, tr('+50% Magic Find, +150% Gold Find'), [['magicFind', 50], ['goldFind', 150]]],
    [3, tr('+20% Movement Speed, +200 Life'), [['moveSpeed', 20], ['life', 200]]],
    [4, tr('+140% Magic Find, +400% Gold Find, +1 to All Skills — gold you pick up restores life'), [['magicFind', 140], ['goldFind', 400], ['skillLevels', 1], ['lifeRegen', 40]]],
  ],
);

set(
  'set.nightfall',
  tr('Nightfall Communion'),
  tr('Five people met once, at dusk, and agreed on something. Nobody knows what.'),
  68,
  70,
  82,
  [
    ['set.nightfall.dagger', tr('Nightfall Whisper'), 'dagger.fanged', [['critChance', 10, 16], ['critDamage', 110, 170], ['attackSpeed', 10, 14]]],
    ['set.nightfall.chest', tr('Nightfall Shroud'), 'chest.wyrmhide', [['enhancedDefense', 180, 270], ['dexterity', 22, 34], ['arcaneResist', 30, 48]]],
    ['set.nightfall.boots', tr('Nightfall Passage'), 'boots.myrmidon', [['moveSpeed', 18, 27], ['critChance', 6, 10], ['enhancedDefense', 140, 220]]],
    ['set.nightfall.gloves', tr('Nightfall Clutch'), 'gloves.eclipse', [['attackSpeed', 11, 15], ['critDamage', 90, 140], ['dexterity', 20, 30]]],
    ['set.nightfall.amulet', tr('Nightfall Oath'), 'amulet.sigil', [['skillLevels', 1, 2], ['critChance', 8, 13], ['arcaneDamage', 90, 160]]],
  ],
  [
    [2, tr('+12% Critical Strike Chance, +15% Attack Speed'), [['critChance', 12], ['attackSpeed', 15]]],
    [3, tr('+150% Critical Strike Damage, +30 Dexterity'), [['critDamage', 150], ['dexterity', 30]]],
    [4, tr('+30% Movement Speed, +10% Cooldown Reduction, +9% Life Stolen per Hit'), [['moveSpeed', 30], ['cooldownReduction', 10], ['lifeSteal', 9]]],
    [5, tr('+2 to All Skills, +22% Critical Strike Chance, +260% Critical Strike Damage — criticals cannot be blocked'), [['skillLevels', 2], ['critChance', 22], ['critDamage', 260]]],
  ],
);

// ===========================================================================
// ENDGAME SETS — six pieces, level 76+. These are the finish line.
// ===========================================================================

set(
  'set.sunderedsky',
  tr('Regalia of the Sundered Sky'),
  tr('Assembled from six different disasters, each of which was survived by exactly one person.'),
  76,
  78,
  70,
  [
    ['set.sunderedsky.staff', tr('Sundering'), 'staff.eldritch', [['skillLevels', 2, 2], ['castSpeed', 15, 19], ['elementalDamagePct', 35, 50]], 2],
    ['set.sunderedsky.helm', tr('Crown of the Sundered Sky'), 'helm.diadem', [['skillLevels', 1, 2], ['mana', 220, 340], ['castSpeed', 11, 15]], 1],
    ['set.sunderedsky.chest', tr('Mantle of the Sundered Sky'), 'chest.aeonshroud', [['enhancedDefense', 200, 300], ['mana', 260, 400], ['arcaneResist', 40, 60]], 2],
    ['set.sunderedsky.orb', tr('Eye of the Sundered Sky'), 'orb.vortex', [['skillLevels', 1, 2], ['cooldownReduction', 12, 20], ['elementalDamagePct', 25, 40]]],
    ['set.sunderedsky.boots', tr('Path of the Sundered Sky'), 'boots.gale', [['moveSpeed', 20, 30], ['manaRegen', 60, 95], ['enhancedDefense', 170, 260]]],
    ['set.sunderedsky.amulet', tr('Vow of the Sundered Sky'), 'amulet.heartstone', [['skillLevels', 1, 2], ['manaRegen', 70, 110], ['mana', 240, 370]]],
  ],
  [
    [2, tr('+1 to All Skills, +15% Cast Speed'), [['skillLevels', 1], ['castSpeed', 15]]],
    [3, tr('+300 Mana, +60% Mana Regeneration'), [['mana', 300], ['manaRegen', 60]]],
    [4, tr('+50% Elemental Damage, +20% Cooldown Reduction'), [['elementalDamagePct', 50], ['cooldownReduction', 20]]],
    [5, tr('+2 to All Skills, +45% All Resistances'), [['skillLevels', 2], ['fireResist', 45], ['coldResist', 45], ['lightningResist', 45], ['poisonResist', 45], ['arcaneResist', 45]]],
    [6, tr('+3 to All Skills, +80% Elemental Damage, +600 Mana — spells cost life when mana runs dry'), [['skillLevels', 3], ['elementalDamagePct', 80], ['mana', 600], ['manaRegen', 100], ['castSpeed', 15]]],
  ],
);

set(
  'set.lastlegion',
  tr('Warplate of the Last Legion'),
  tr('The Legion held a gate for six days. This is the sixth day.'),
  80,
  82,
  68,
  [
    ['set.lastlegion.sword', tr('Last Word'), 'sword.godslayer', [['enhancedDamage', 300, 420], ['critDamage', 140, 210], ['lifeSteal', 6, 9]], 2],
    ['set.lastlegion.chest', tr('Last Stand'), 'chest.archon', [['enhancedDefense', 280, 400], ['life', 300, 450], ['physicalResist', 8, 13]], 2],
    ['set.lastlegion.helm', tr('Last Vigil'), 'helm.corona', [['enhancedDefense', 220, 330], ['damageReduction', 8, 13], ['strength', 25, 40]], 1],
    ['set.lastlegion.gloves', tr('Last Grip'), 'gloves.eclipse', [['attackSpeed', 12, 16], ['critChance', 8, 13], ['strength', 22, 35]]],
    ['set.lastlegion.boots', tr('Last March'), 'boots.gale', [['moveSpeed', 18, 28], ['enhancedDefense', 200, 300], ['attackSpeed', 7, 10]]],
    ['set.lastlegion.belt', tr('Last Cord'), 'belt.worldheart', [['life', 280, 420], ['damageReduction', 6, 10], ['lifeRegen', 50, 80]]],
    ['set.lastlegion.legs', tr('Last Ground'), 'pants.legion', [['enhancedDefense', 240, 360], ['vitality', 30, 45], ['physicalResist', 6, 10]], 2],
  ],
  [
    [2, tr('+17% Attack Speed, +200% Enhanced Damage'), [['attackSpeed', 17], ['enhancedDamage', 200]]],
    [3, tr('+400 Life, +12% Damage Reduction'), [['life', 400], ['damageReduction', 12]]],
    [4, tr('+15% Critical Strike Chance, +180% Critical Strike Damage'), [['critChance', 15], ['critDamage', 180]]],
    [5, tr('+15% Physical Resistance, +12% Life Stolen per Hit'), [['physicalResist', 15], ['lifeSteal', 12]]],
    [6, tr('+2 to All Skills, +350% Enhanced Damage, +300% Enhanced Defense — you cannot be knocked back or stunned'), [['skillLevels', 2], ['enhancedDamage', 350], ['enhancedDefense', 300], ['areaDamagePct', 70]]],
    [7, tr('+600 Life, +15% Damage Reduction, +250% Enhanced Damage'), [['life', 600], ['damageReduction', 15], ['enhancedDamage', 250]]],
  ],
);

set(
  'set.hollowking',
  tr("The Hollow King's Court"),
  tr('A crown, a hand, a heel, and a heart. The king himself is not included.'),
  86,
  88,
  55,
  [
    ['set.hollowking.helm', tr("Hollow King's Crown"), 'helm.corona', [['skillLevels', 2, 2], ['damageReduction', 12, 18], ['magicFind', 50, 80]], 2],
    ['set.hollowking.gloves', tr("Hollow King's Hand"), 'gloves.eclipse', [['critChance', 10, 16], ['attackSpeed', 13, 17], ['lifeSteal', 5, 8]]],
    ['set.hollowking.boots', tr("Hollow King's Heel"), 'boots.gale', [['moveSpeed', 25, 36], ['cooldownReduction', 10, 16], ['enhancedDefense', 240, 350]]],
    ['set.hollowking.amulet', tr("Hollow King's Heart"), 'amulet.heartstone', [['skillLevels', 2, 2], ['life', 350, 520], ['critDamage', 180, 260]]],
    ['set.hollowking.ring', tr("Hollow King's Signet"), 'ring.eternity', [['skillLevels', 1, 2], ['cooldownReduction', 15, 24], ['magicFind', 60, 95]]],
  ],
  [
    [2, tr('+2 to All Skills, +17% Attack Speed'), [['skillLevels', 2], ['attackSpeed', 17]]],
    [3, tr('+25% Cooldown Reduction, +35% Movement Speed'), [['cooldownReduction', 25], ['moveSpeed', 35]]],
    [4, tr('+200% Magic Find, +18% Critical Strike Chance'), [['magicFind', 200], ['critChance', 18]]],
    [5, tr('+3 to All Skills, +400% Critical Strike Damage, +25% Damage Reduction — once per minute, death is declined'), [['skillLevels', 3], ['critDamage', 400], ['damageReduction', 25], ['life', 500]]],
  ],
);

// ===========================================================================
// THE DEPTH PLAN'S SETS — seventeen more, written in `setsDepth.ts`.
// ===========================================================================

const BASE_REQ = new Map<string, number>(ITEM_BASES.map((b) => [b.id, b.levelReq ?? 1]));
for (const d of DEPTH_SETS) {
  const req = Math.min(d.ilvl, Math.max(Math.round(d.ilvl * 0.92), ...d.pieces.map((p) => BASE_REQ.get(p[2]) ?? 1)));
  set(d.id, d.name, d.blurb, req, d.ilvl, d.weight, d.pieces.map(([id, name, base, mods]) => [id, name, base, mods] as PieceSpec), d.bonuses);
}

// ===========================================================================
// Exports and lookup
// ===========================================================================

/**
 * Signature powers. Most full-set bonuses always *said* they did something a
 * stat cannot ("chilled enemies shatter on death"), and none of them did. The
 * power ids resolve in `sim/ItemPowers.ts`; a phrase is appended to the bonus
 * text only when the authored text does not already describe it.
 */
const SET_POWERS: Array<[setId: string, pieces: number, power: string, mag: number, phrase?: string]> = [
  ['set.bloodied', 3, 'killLife', 1, tr('kills restore 2% life')],
  ['set.kindled', 3, 'emberHeart', 0.6, tr('your fire burns 15% hotter')],
  ['set.quickstep', 3, 'momentum', 0.75, tr('each hit you land quickens the next')],
  ['set.bonefetter', 4, 'hymnAura', 1],
  ['set.gravewarden', 4, 'blockReflect', 0.8, tr('blocks answer the blow')],
  ['set.frostwrought', 4, 'shatter', 1],
  ['set.stormbound', 5, 'chainLightning', 2],
  ['set.venomthread', 4, 'poisonStacks', 1.5],
  ['set.ironvow', 5, 'blockReflect', 1.2],
  ['set.ashwalker', 5, 'pyreKills', 1.2],
  ['set.gilded', 4, 'goldToLife', 1.5],
  ['set.nightfall', 5, 'unblockableCrit', 1.5],
  ['set.sunderedsky', 6, 'bloodMagic', 1],
  ['set.lastlegion', 6, 'unstoppable', 1],
  ['set.hollowking', 5, 'cheatDeath', 1.5],
];
for (const d of DEPTH_SETS) SET_POWERS.push([d.id, d.power[0], d.power[1], d.power[2]]);
for (const [setId, pieces, power, mag, phrase] of SET_POWERS) {
  const def = ALL.find((x) => x.id === setId);
  const tier = def?.bonuses.find((b) => b.pieces === pieces);
  if (!tier) continue;
  tier.power = power;
  if (mag !== 1) tier.powerMag = mag;
  if (phrase && !tier.desc.includes('—')) tier.desc = `${tier.desc} — ${phrase}`;
}

// Names and blurbs come from the story (data/story/uniqueText.ts).
applySetText(ALL);

export const SETS: SetDef[] = ALL;

const SET_BY_ID = new Map<string, SetDef>(SETS.map((s) => [s.id, s]));
const PIECE_BY_ID = new Map<string, SetPieceDef>();
for (const s of SETS) for (const p of s.pieces) PIECE_BY_ID.set(p.id, p);

export const SET_PIECES: SetPieceDef[] = Array.from(PIECE_BY_ID.values());

export function getSet(id: string): SetDef | undefined {
  return SET_BY_ID.get(id);
}

export function getSetPiece(id: string): SetPieceDef | undefined {
  return PIECE_BY_ID.get(id);
}

export function setOfPiece(pieceId: string): SetDef | undefined {
  const piece = PIECE_BY_ID.get(pieceId);
  return piece ? SET_BY_ID.get(piece.setId) : undefined;
}

/** Pieces eligible to drop at this item level. */
export function setPool(ilvl: number): SetPieceDef[] {
  return SET_PIECES.filter((p) => p.ilvl <= ilvl + 4);
}

/**
 * Drop weight for one piece. Like uniques, old sets fade rather than vanish so
 * that the deep drop table stays dominated by things worth wearing.
 */
export function setPieceDropWeight(piece: SetPieceDef, ilvl: number): number {
  if (piece.ilvl > ilvl + 4) return 0;
  const parent = SET_BY_ID.get(piece.setId);
  const base = piece.weight * ((parent?.weight ?? 100) / 100);
  const over = ilvl - piece.ilvl;
  if (over <= 22) return base;
  return Math.max(base * 0.05, base * (1 - (over - 22) * 0.035));
}

export const SET_COUNT = SETS.length;
