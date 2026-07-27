/**
 * SLAY — item sets.
 *
 * Sets are the game's answer to "what do I do with the gear I find at level
 * 30?". A single piece is deliberately *worse* than a comparable unique: the
 * value is back-loaded into the partial bonuses, so a set asks you to commit
 * slots to a plan several levels before it pays off.
 *
 * Every set escalates at 2 / 3 / 4 (/ 5 / full) pieces, and every set pushes a
 * specific playstyle hard enough that the full bonus reads as a build, not a
 * stat stick — attack speed engines, block walls, poison stacking, mana-as-life
 * casters, magic-find farmers.
 */

import type { StatKey } from '../types';

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
  'The Bloodied Hand',
  'Three pieces of a mercenary company that stopped taking prisoners.',
  8,
  10,
  120,
  [
    ['set.bloodied.axe', "Redgrip, the Bloodied Hand", 'axe.hand', [['enhancedDamage', 30, 45], ['maxDamage', 4, 7], ['lifeSteal', 1, 2]]],
    ['set.bloodied.gloves', 'Redgrip Mitts', 'gloves.leather', [['attackSpeed', 6, 10], ['strength', 4, 7], ['defense', 8, 14]]],
    ['set.bloodied.belt', 'Redgrip Cinch', 'belt.sash', [['life', 18, 30], ['lifeRegen', 3, 6], ['defense', 6, 12]]],
  ],
  [
    [2, '+20% Attack Speed, +3% Life Stolen per Hit', [['attackSpeed', 20], ['lifeSteal', 3]]],
    [3, '+60% Enhanced Damage, +40 Life, +8% Critical Strike Chance', [['enhancedDamage', 60], ['life', 40], ['critChance', 8]]],
  ],
);

set(
  'set.kindled',
  'Vestments of the Kindled',
  'A novice pyromancer burned down her own order. These are what was left.',
  12,
  14,
  115,
  [
    ['set.kindled.wand', 'Kindling', 'wand.bone', [['fireDamage', 10, 20], ['castSpeed', 6, 10], ['skillLevels', 1, 1]]],
    ['set.kindled.chest', 'Kindled Robe', 'chest.quilted', [['mana', 25, 45], ['fireResist', 15, 25], ['enhancedDefense', 30, 50]]],
    ['set.kindled.helm', 'Kindled Cowl', 'helm.cap', [['energy', 5, 9], ['manaRegen', 12, 20], ['fireDamage', 6, 14]]],
  ],
  [
    [2, '+15% Cast Speed, +25% Fire Resistance', [['castSpeed', 15], ['fireResist', 25]]],
    [3, '+1 to All Skills, +25% Elemental Damage, Adds 30 Fire Damage', [['skillLevels', 1], ['elementalDamagePct', 25], ['fireDamage', 30]]],
  ],
);

set(
  'set.quickstep',
  'Trail of the Quick',
  'Nobody in this set has ever been hit. Nobody in this set has ever been hit twice.',
  18,
  20,
  110,
  [
    ['set.quickstep.boots', 'Quickstep Treads', 'boots.heavy', [['moveSpeed', 10, 15], ['dexterity', 6, 10], ['defense', 12, 20]]],
    ['set.quickstep.dagger', 'Quickstep Fang', 'dagger.dirk', [['attackSpeed', 8, 13], ['critChance', 4, 7], ['maxDamage', 6, 11]]],
    ['set.quickstep.gloves', 'Quickstep Wraps', 'gloves.heavy', [['attackSpeed', 8, 12], ['dexterity', 5, 9], ['maxDamage', 5, 9]]],
  ],
  [
    [2, '+18% Movement Speed, +12 Dexterity', [['moveSpeed', 18], ['dexterity', 12]]],
    [3, '+25% Attack Speed, +10% Critical Strike Chance, +45% Critical Strike Damage', [['attackSpeed', 25], ['critChance', 10], ['critDamage', 45]]],
  ],
);

// ===========================================================================
// MID SETS — levels 22-50. Four and five pieces, real build commitments.
// ===========================================================================

set(
  'set.bonefetter',
  'Bonefetter Regalia',
  'Worn by a revenant who kept his household staff on after their deaths.',
  22,
  24,
  105,
  [
    ['set.bonefetter.wand', 'Bonefetter Rod', 'wand.grim', [['skillLevels', 1, 1], ['arcaneDamage', 15, 30], ['manaSteal', 1, 3]]],
    ['set.bonefetter.helm', 'Bonefetter Crown', 'helm.bone', [['mana', 40, 70], ['manaRegen', 18, 28], ['enhancedDefense', 50, 80]]],
    ['set.bonefetter.chest', 'Bonefetter Shroud', 'chest.ghost', [['enhancedDefense', 60, 95], ['life', 45, 75], ['poisonResist', 20, 32]]],
    ['set.bonefetter.shield', 'Bonefetter Ward', 'shield.grim', [['blockChance', 5, 9], ['lifeRegen', 8, 14], ['arcaneResist', 20, 32]]],
  ],
  [
    [2, '+60 Mana, +30% Mana Regeneration', [['mana', 60], ['manaRegen', 30]]],
    [3, '+1 to All Skills, +5% Mana Stolen per Hit', [['skillLevels', 1], ['manaSteal', 5]]],
    [4, '+2 to All Skills, +120 Life, +35% Cooldown Reduction — your summons inherit your regeneration', [['skillLevels', 2], ['life', 120], ['cooldownReduction', 35], ['lifeRegen', 25]]],
  ],
);

set(
  'set.gravewarden',
  "Grave Warden's Watch",
  'Four hundred nights on a wall, and not one thing got past.',
  28,
  30,
  100,
  [
    ['set.gravewarden.shield', "Warden's Vigil", 'shield.dragon', [['blockChance', 8, 12], ['enhancedDefense', 70, 110], ['damageReduction', 3, 5]]],
    ['set.gravewarden.chest', "Warden's Carapace", 'chest.chainmail', [['enhancedDefense', 90, 140], ['life', 70, 115], ['physicalResist', 3, 6]]],
    ['set.gravewarden.helm', "Warden's Casque", 'helm.full', [['enhancedDefense', 70, 110], ['vitality', 10, 17], ['damageReduction', 2, 4]]],
    ['set.gravewarden.boots', "Warden's Stand", 'boots.greaves', [['enhancedDefense', 60, 95], ['moveSpeed', 5, 9], ['coldResist', 20, 32]]],
  ],
  [
    [2, '+80 Defense, +8% Block Chance', [['defense', 80], ['blockChance', 8]]],
    [3, '+10% Damage Reduction, +180 Life', [['damageReduction', 10], ['life', 180]]],
    [4, '+120% Enhanced Defense, +12% Physical Resistance, +30 Life Regeneration', [['enhancedDefense', 120], ['physicalResist', 12], ['lifeRegen', 30]]],
  ],
);

set(
  'set.frostwrought',
  'Frostwrought Panoply',
  'Forged in a vault where the forge itself had to be kept warm.',
  34,
  36,
  100,
  [
    ['set.frostwrought.sword', 'Frostwrought Edge', 'sword.tusk', [['coldDamage', 40, 75], ['enhancedDamage', 70, 110], ['coldResist', 20, 32]]],
    ['set.frostwrought.chest', 'Frostwrought Plate', 'chest.splint', [['enhancedDefense', 100, 155], ['coldResist', 25, 40], ['life', 80, 130]]],
    ['set.frostwrought.gloves', 'Frostwrought Grips', 'gloves.war', [['coldDamage', 25, 50], ['attackSpeed', 8, 13], ['strength', 8, 14]]],
    ['set.frostwrought.helm', 'Frostwrought Visor', 'helm.grim', [['coldResist', 25, 40], ['enhancedDefense', 80, 125], ['critDamage', 25, 45]]],
  ],
  [
    [2, 'Adds 60 Cold Damage, +30% Cold Resistance', [['coldDamage', 60], ['coldResist', 30]]],
    [3, '+35% Elemental Damage, +60% Critical Strike Damage', [['elementalDamagePct', 35], ['critDamage', 60]]],
    [4, 'Adds 160 Cold Damage, +40% Cold Resistance, +15% Attack Speed — chilled enemies shatter on death', [['coldDamage', 160], ['coldResist', 40], ['attackSpeed', 15], ['areaDamagePct', 35]]],
  ],
);

set(
  'set.stormbound',
  'The Stormbound Circuit',
  'Five conductors in a ring. Whatever is inside the ring does not stay standing.',
  40,
  42,
  95,
  [
    ['set.stormbound.staff', 'Stormbound Rod', 'staff.war', [['lightningDamage', 20, 130], ['skillLevels', 1, 1], ['castSpeed', 12, 18]]],
    ['set.stormbound.helm', 'Stormbound Circlet', 'helm.coronet', [['lightningResist', 25, 40], ['manaRegen', 25, 40], ['castSpeed', 10, 16]]],
    ['set.stormbound.chest', 'Stormbound Weave', 'chest.studded', [['enhancedDefense', 90, 140], ['mana', 90, 145], ['lightningResist', 25, 40]]],
    ['set.stormbound.boots', 'Stormbound Striders', 'boots.war', [['moveSpeed', 10, 16], ['lightningDamage', 10, 90], ['enhancedDefense', 70, 110]]],
    ['set.stormbound.amulet', 'Stormbound Sigil', 'amulet.talisman', [['skillLevels', 1, 1], ['lightningDamage', 15, 110], ['energy', 10, 17]]],
  ],
  [
    [2, 'Adds 40 Lightning Damage, +20% Cast Speed', [['lightningDamage', 40], ['castSpeed', 20]]],
    [3, '+1 to All Skills, +40% Lightning Resistance', [['skillLevels', 1], ['lightningResist', 40]]],
    [4, '+40% Elemental Damage, +18% Cooldown Reduction', [['elementalDamagePct', 40], ['cooldownReduction', 18]]],
    [5, '+2 to All Skills, Adds 320 Lightning Damage, +25% Movement Speed — your lightning arcs to a second target', [['skillLevels', 2], ['lightningDamage', 320], ['moveSpeed', 25], ['areaDamagePct', 40]]],
  ],
);

set(
  'set.venomthread',
  'Venomthread Weave',
  'Not woven. Extruded. The weaver is still under the floorboards.',
  45,
  47,
  95,
  [
    ['set.venomthread.dagger', 'Venomthread Fang', 'dagger.blade', [['poisonDamage', 60, 110], ['critChance', 6, 10], ['attackSpeed', 10, 16]]],
    ['set.venomthread.gloves', 'Venomthread Grasp', 'gloves.bramble', [['attackSpeed', 12, 18], ['poisonDamage', 40, 75], ['dexterity', 12, 20]]],
    ['set.venomthread.boots', 'Venomthread Steps', 'boots.sharkskin', [['moveSpeed', 14, 21], ['poisonResist', 25, 40], ['critChance', 4, 7]]],
    ['set.venomthread.chest', 'Venomthread Shroud', 'chest.dusk', [['enhancedDefense', 110, 170], ['poisonResist', 30, 45], ['dexterity', 14, 22]]],
  ],
  [
    [2, '+20% Attack Speed, Adds 90 Poison Damage', [['attackSpeed', 20], ['poisonDamage', 90]]],
    [3, '+12% Critical Strike Chance, +40% Poison Resistance', [['critChance', 12], ['poisonResist', 40]]],
    [4, 'Adds 280 Poison Damage, +110% Critical Strike Damage, +30% Movement Speed — poison you apply stacks without limit', [['poisonDamage', 280], ['critDamage', 110], ['moveSpeed', 30]]],
  ],
);

// ===========================================================================
// LATE SETS — levels 52-70. Five pieces, and they carry a whole character.
// ===========================================================================

set(
  'set.ironvow',
  'Aegis of the Iron Vow',
  'The vow was short: nothing gets through. It has been kept.',
  52,
  54,
  90,
  [
    ['set.ironvow.shield', 'Vowbearer', 'shield.pavise', [['blockChance', 12, 18], ['enhancedDefense', 130, 200], ['damageReduction', 5, 9]]],
    ['set.ironvow.chest', 'Vowplate', 'chest.gothic', [['enhancedDefense', 160, 240], ['life', 140, 220], ['physicalResist', 5, 9]]],
    ['set.ironvow.helm', 'Vowhelm', 'helm.great', [['enhancedDefense', 120, 190], ['vitality', 18, 28], ['damageReduction', 4, 7]]],
    ['set.ironvow.mace', 'Vowbreaker', 'mace.truncheon', [['enhancedDamage', 130, 200], ['lifeSteal', 3, 5], ['areaDamagePct', 15, 25]]],
    ['set.ironvow.belt', 'Vowcord', 'belt.vampirefang', [['life', 120, 190], ['damageReduction', 3, 6], ['lifeRegen', 20, 32]]],
  ],
  [
    [2, '+12% Block Chance, +150 Defense', [['blockChance', 12], ['defense', 150]]],
    [3, '+14% Damage Reduction, +250 Life', [['damageReduction', 14], ['life', 250]]],
    [4, '+15% Physical Resistance, +45 Life Regeneration', [['physicalResist', 15], ['lifeRegen', 45]]],
    [5, '+200% Enhanced Defense, +25% Block Chance, +8% Life Stolen per Hit — blocking reflects the blow', [['enhancedDefense', 200], ['blockChance', 25], ['lifeSteal', 8], ['critDamage', 60]]],
  ],
);

set(
  'set.ashwalker',
  "Ashwalker's Legacy",
  'He walked out of the Ashwaste after nine years. Nothing followed him out.',
  58,
  60,
  88,
  [
    ['set.ashwalker.axe', "Ashwalker's Cleaver", 'axe.berserker', [['fireDamage', 90, 160], ['enhancedDamage', 160, 240], ['attackSpeed', 10, 16]]],
    ['set.ashwalker.chest', "Ashwalker's Hide", 'chest.wyrmhide', [['enhancedDefense', 160, 250], ['fireResist', 30, 48], ['life', 150, 240]]],
    ['set.ashwalker.boots', "Ashwalker's Tread", 'boots.wyrmhide', [['moveSpeed', 15, 23], ['fireResist', 25, 40], ['fireDamage', 45, 85]]],
    ['set.ashwalker.helm', "Ashwalker's Mask", 'helm.spired', [['enhancedDefense', 130, 200], ['fireDamage', 60, 110], ['strength', 15, 25]]],
    ['set.ashwalker.gloves', "Ashwalker's Grip", 'gloves.ogre', [['attackSpeed', 12, 19], ['strength', 18, 28], ['critDamage', 50, 85]]],
  ],
  [
    [2, 'Adds 120 Fire Damage, +35% Fire Resistance', [['fireDamage', 120], ['fireResist', 35]]],
    [3, '+25% Attack Speed, +6% Life Stolen per Hit', [['attackSpeed', 25], ['lifeSteal', 6]]],
    [4, '+45% Elemental Damage, +50% Area Damage', [['elementalDamagePct', 45], ['areaDamagePct', 50]]],
    [5, 'Adds 480 Fire Damage, +200% Enhanced Damage, +130% Critical Strike Damage — kills leave burning ground', [['fireDamage', 480], ['enhancedDamage', 200], ['critDamage', 130]]],
  ],
);

set(
  'set.gilded',
  'The Gilded Compact',
  'An agreement between four thieves, none of whom trusted the other three.',
  62,
  64,
  85,
  [
    ['set.gilded.helm', 'Gilded Circlet', 'helm.diadem', [['magicFind', 30, 48], ['goldFind', 90, 150], ['skillLevels', 1, 1]]],
    ['set.gilded.gloves', 'Gilded Touch', 'gloves.sorcerer', [['magicFind', 25, 40], ['goldFind', 80, 130], ['castSpeed', 10, 16]]],
    ['set.gilded.boots', 'Gilded Stride', 'boots.wyrmhide', [['magicFind', 25, 40], ['moveSpeed', 14, 22], ['goldFind', 80, 130]]],
    ['set.gilded.ring', 'Gilded Circle', 'ring.circle', [['magicFind', 28, 45], ['goldFind', 100, 160], ['life', 90, 150]]],
  ],
  [
    [2, '+50% Magic Find, +150% Gold Find', [['magicFind', 50], ['goldFind', 150]]],
    [3, '+20% Movement Speed, +200 Life', [['moveSpeed', 20], ['life', 200]]],
    [4, '+140% Magic Find, +400% Gold Find, +1 to All Skills — gold you pick up restores life', [['magicFind', 140], ['goldFind', 400], ['skillLevels', 1], ['lifeRegen', 40]]],
  ],
);

set(
  'set.nightfall',
  'Nightfall Communion',
  'Five people met once, at dusk, and agreed on something. Nobody knows what.',
  68,
  70,
  82,
  [
    ['set.nightfall.dagger', 'Nightfall Whisper', 'dagger.fanged', [['critChance', 10, 16], ['critDamage', 110, 170], ['attackSpeed', 14, 22]]],
    ['set.nightfall.chest', 'Nightfall Shroud', 'chest.wyrmhide', [['enhancedDefense', 180, 270], ['dexterity', 22, 34], ['arcaneResist', 30, 48]]],
    ['set.nightfall.boots', 'Nightfall Passage', 'boots.myrmidon', [['moveSpeed', 18, 27], ['critChance', 6, 10], ['enhancedDefense', 140, 220]]],
    ['set.nightfall.gloves', 'Nightfall Clutch', 'gloves.eclipse', [['attackSpeed', 15, 23], ['critDamage', 90, 140], ['dexterity', 20, 30]]],
    ['set.nightfall.amulet', 'Nightfall Oath', 'amulet.sigil', [['skillLevels', 1, 2], ['critChance', 8, 13], ['arcaneDamage', 90, 160]]],
  ],
  [
    [2, '+12% Critical Strike Chance, +25% Attack Speed', [['critChance', 12], ['attackSpeed', 25]]],
    [3, '+150% Critical Strike Damage, +30 Dexterity', [['critDamage', 150], ['dexterity', 30]]],
    [4, '+30% Movement Speed, +10% Cooldown Reduction, +9% Life Stolen per Hit', [['moveSpeed', 30], ['cooldownReduction', 10], ['lifeSteal', 9]]],
    [5, '+2 to All Skills, +22% Critical Strike Chance, +260% Critical Strike Damage — criticals cannot be blocked', [['skillLevels', 2], ['critChance', 22], ['critDamage', 260]]],
  ],
);

// ===========================================================================
// ENDGAME SETS — six pieces, level 76+. These are the finish line.
// ===========================================================================

set(
  'set.sunderedsky',
  'Regalia of the Sundered Sky',
  'Assembled from six different disasters, each of which was survived by exactly one person.',
  76,
  78,
  70,
  [
    ['set.sunderedsky.staff', 'Sundering', 'staff.eldritch', [['skillLevels', 2, 2], ['castSpeed', 25, 35], ['elementalDamagePct', 35, 50]], 2],
    ['set.sunderedsky.helm', 'Crown of the Sundered Sky', 'helm.diadem', [['skillLevels', 1, 2], ['mana', 220, 340], ['castSpeed', 15, 24]], 1],
    ['set.sunderedsky.chest', 'Mantle of the Sundered Sky', 'chest.aeonshroud', [['enhancedDefense', 200, 300], ['mana', 260, 400], ['arcaneResist', 40, 60]], 2],
    ['set.sunderedsky.orb', 'Eye of the Sundered Sky', 'orb.vortex', [['skillLevels', 1, 2], ['cooldownReduction', 12, 20], ['elementalDamagePct', 25, 40]]],
    ['set.sunderedsky.boots', 'Path of the Sundered Sky', 'boots.gale', [['moveSpeed', 20, 30], ['manaRegen', 60, 95], ['enhancedDefense', 170, 260]]],
    ['set.sunderedsky.amulet', 'Vow of the Sundered Sky', 'amulet.heartstone', [['skillLevels', 1, 2], ['manaRegen', 70, 110], ['mana', 240, 370]]],
  ],
  [
    [2, '+1 to All Skills, +25% Cast Speed', [['skillLevels', 1], ['castSpeed', 25]]],
    [3, '+300 Mana, +60% Mana Regeneration', [['mana', 300], ['manaRegen', 60]]],
    [4, '+50% Elemental Damage, +20% Cooldown Reduction', [['elementalDamagePct', 50], ['cooldownReduction', 20]]],
    [5, '+2 to All Skills, +45% All Resistances', [['skillLevels', 2], ['fireResist', 45], ['coldResist', 45], ['lightningResist', 45], ['poisonResist', 45], ['arcaneResist', 45]]],
    [6, '+3 to All Skills, +80% Elemental Damage, +600 Mana — spells cost life when mana runs dry', [['skillLevels', 3], ['elementalDamagePct', 80], ['mana', 600], ['manaRegen', 100], ['castSpeed', 25]]],
  ],
);

set(
  'set.lastlegion',
  'Warplate of the Last Legion',
  'The Legion held a gate for six days. This is the sixth day.',
  80,
  82,
  68,
  [
    ['set.lastlegion.sword', 'Last Word', 'sword.godslayer', [['enhancedDamage', 300, 420], ['critDamage', 140, 210], ['lifeSteal', 6, 9]], 2],
    ['set.lastlegion.chest', 'Last Stand', 'chest.archon', [['enhancedDefense', 280, 400], ['life', 300, 450], ['physicalResist', 8, 13]], 2],
    ['set.lastlegion.helm', 'Last Vigil', 'helm.corona', [['enhancedDefense', 220, 330], ['damageReduction', 8, 13], ['strength', 25, 40]], 1],
    ['set.lastlegion.gloves', 'Last Grip', 'gloves.eclipse', [['attackSpeed', 18, 27], ['critChance', 8, 13], ['strength', 22, 35]]],
    ['set.lastlegion.boots', 'Last March', 'boots.gale', [['moveSpeed', 18, 28], ['enhancedDefense', 200, 300], ['attackSpeed', 8, 13]]],
    ['set.lastlegion.belt', 'Last Cord', 'belt.worldheart', [['life', 280, 420], ['damageReduction', 6, 10], ['lifeRegen', 50, 80]]],
  ],
  [
    [2, '+30% Attack Speed, +200% Enhanced Damage', [['attackSpeed', 30], ['enhancedDamage', 200]]],
    [3, '+400 Life, +12% Damage Reduction', [['life', 400], ['damageReduction', 12]]],
    [4, '+15% Critical Strike Chance, +180% Critical Strike Damage', [['critChance', 15], ['critDamage', 180]]],
    [5, '+15% Physical Resistance, +12% Life Stolen per Hit', [['physicalResist', 15], ['lifeSteal', 12]]],
    [6, '+2 to All Skills, +350% Enhanced Damage, +300% Enhanced Defense — you cannot be knocked back or stunned', [['skillLevels', 2], ['enhancedDamage', 350], ['enhancedDefense', 300], ['areaDamagePct', 70]]],
  ],
);

set(
  'set.hollowking',
  "The Hollow King's Court",
  'A crown, a hand, a heel, and a heart. The king himself is not included.',
  86,
  88,
  55,
  [
    ['set.hollowking.helm', "Hollow King's Crown", 'helm.corona', [['skillLevels', 2, 2], ['damageReduction', 12, 18], ['magicFind', 50, 80]], 2],
    ['set.hollowking.gloves', "Hollow King's Hand", 'gloves.eclipse', [['critChance', 10, 16], ['attackSpeed', 20, 30], ['lifeSteal', 5, 8]]],
    ['set.hollowking.boots', "Hollow King's Heel", 'boots.gale', [['moveSpeed', 25, 36], ['cooldownReduction', 10, 16], ['enhancedDefense', 240, 350]]],
    ['set.hollowking.amulet', "Hollow King's Heart", 'amulet.heartstone', [['skillLevels', 2, 2], ['life', 350, 520], ['critDamage', 180, 260]]],
    ['set.hollowking.ring', "Hollow King's Signet", 'ring.eternity', [['skillLevels', 1, 2], ['cooldownReduction', 15, 24], ['magicFind', 60, 95]]],
  ],
  [
    [2, '+2 to All Skills, +30% Attack Speed', [['skillLevels', 2], ['attackSpeed', 30]]],
    [3, '+25% Cooldown Reduction, +35% Movement Speed', [['cooldownReduction', 25], ['moveSpeed', 35]]],
    [4, '+200% Magic Find, +18% Critical Strike Chance', [['magicFind', 200], ['critChance', 18]]],
    [5, '+3 to All Skills, +400% Critical Strike Damage, +25% Damage Reduction — once per minute, death is declined', [['skillLevels', 3], ['critDamage', 400], ['damageReduction', 25], ['life', 500]]],
  ],
);

// ===========================================================================
// Exports and lookup
// ===========================================================================

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
