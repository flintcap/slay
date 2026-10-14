/**
 * SLAY — the depth plan's seventeen sets.
 *
 * Seven class sets, one per class, each built round one of that class's
 * trees, and ten open sets from the first floors to the relic band. A single
 * piece is a little weaker than a unique of its level (`setMods`); the set
 * pays in its bonuses, and the full set grants a power that changes how you
 * fight (`sim/ItemPowers.ts`, the set signatures). Every set has one look all
 * its pieces share (`art/items/Designs.ts`, `SET_MOTIFS`).
 */
import type { StatKey } from '../types';
import { setMods, type ModSpec } from './uniqueBatches/kit';

export interface DepthSet {
  id: string;
  name: string;
  blurb: string;
  ilvl: number;
  weight: number;
  pieces: Array<[id: string, name: string, baseId: string, mods: Array<[StatKey, number, number]>]>;
  bonuses: Array<[pieces: number, desc: string, mods: Array<[StatKey, number]>]>;
  /** The full set's power: pieces needed, power id, magnitude. */
  power: [number, string, number];
}

type Piece = [string, string, string, ModSpec[]];

function S(
  id: string,
  name: string,
  blurb: string,
  ilvl: number,
  pieces: Piece[],
  bonuses: DepthSet['bonuses'],
  power: DepthSet['power'],
  weight = 100,
): DepthSet {
  return { id, name, blurb, ilvl, weight, pieces: pieces.map(([a, b, c, m]) => [a, b, c, setMods(ilvl, m)]), bonuses, power };
}

export const DEPTH_SETS: DepthSet[] = [
  // ===========================================================================
  // Class sets
  // ===========================================================================
  S('set.tollgate', 'The Tollgate Oath',
    'The wardens of the old bridge took a coin from everyone who crossed. From the things that came up out of the river, they took more.',
    34,
    [
      ['set.tollgate.helm', 'Tollkeeper\'s Visor', 'helm.full', [['defense', 1], ['vitality', 0.8], ['blockChance', 0.5]]],
      ['set.tollgate.chest', 'Tollkeeper\'s Hauberk', 'chest.chainmail', [['defense', 1], ['life', 0.9], ['physicalResist', 0.6]]],
      ['set.tollgate.shield', 'The Bridge Gate', 'shield.round', [['blockChance', 1], ['defense', 0.8], ['strength', 0.6]]],
      ['set.tollgate.gloves', 'Toll-Taker\'s Grip', 'gloves.vampirebone', [['strength', 1], ['attackRating', 0.8], ['defense', 0.5]]],
      ['set.tollgate.boots', 'Bridgewalker Sabatons', 'boots.scarabshell', [['vitality', 1], ['defense', 0.8], ['moveSpeed', 0.5]]],
    ],
    [
      [2, '+15% Block Chance, +40 Life', [['blockChance', 15], ['life', 40]]],
      [3, '+80% Enhanced Defense, +10% Damage Reduction', [['enhancedDefense', 80], ['damageReduction', 10]]],
      [4, '+60% Enhanced Damage, +20 Strength', [['enhancedDamage', 60], ['strength', 20]]],
      [5, '+1 to All Skills, +120 Life, +10% Block Chance', [['skillLevels', 1], ['life', 120], ['blockChance', 10]]],
    ],
    [5, 'tollgate', 1]),

  S('set.orrery', 'Orrery of the Ninth Hour',
    'A brass clock of the heavens that a mage wore piece by piece, so that she would always know what hour it was in the sky.',
    52,
    [
      ['set.orrery.orb', 'The Ninth Sphere', 'orb.heavenly', [['energy', 1], ['arcaneDamage', 1], ['castSpeed', 0.6]]],
      ['set.orrery.helm', 'Star-Dial Circlet', 'helm.coronet', [['mana', 1], ['energy', 0.8], ['arcaneResist', 0.6]]],
      ['set.orrery.chest', 'Robe of Turning Rings', 'chest.dusk', [['defense', 0.8], ['mana', 1], ['coldResist', 0.6], ['lightningResist', 0.6]]],
      ['set.orrery.ring', 'The Hour Ring', 'ring.band', [['castSpeed', 1], ['manaRegen', 0.8], ['energy', 0.5]]],
      ['set.orrery.amulet', 'The Little Sun', 'amulet.reliquary', [['elementalDamagePct', 1], ['mana', 0.8], ['fireResist', 0.6]]],
    ],
    [
      [2, '+20% Cast Speed, +80 Mana', [['castSpeed', 20], ['mana', 80]]],
      [3, '+25% Elemental Damage, +25% Mana Regeneration', [['elementalDamagePct', 25], ['manaRegen', 25]]],
      [4, '+1 to All Skills, +15% Cooldown Reduction', [['skillLevels', 1], ['cooldownReduction', 15]]],
      [5, '+1 to All Skills, +150 Mana, +40 Arcane Damage', [['skillLevels', 1], ['mana', 150], ['arcaneDamage', 40]]],
    ],
    [5, 'orrery', 1]),

  S('set.lampblack', 'The Lampblack Covenant',
    'The chimney sweeps of the old town went where nobody else could. Some of them were paid to come down a chimney and not go back up it.',
    26,
    [
      ['set.lampblack.dagger', 'The Flue-Knife', 'dagger.kris', [['maxDamage', 1], ['critChance', 0.8], ['attackSpeed', 0.6]]],
      ['set.lampblack.helm', 'Sweep\'s Soot-Hood', 'helm.skullcap', [['dexterity', 1], ['defense', 0.8], ['critDamage', 0.6]]],
      ['set.lampblack.gloves', 'Brass-Button Mitts', 'gloves.heavy', [['attackSpeed', 1], ['dexterity', 0.8], ['lifeSteal', 0.5]]],
      ['set.lampblack.boots', 'Rooftop Treads', 'boots.heavy', [['moveSpeed', 1], ['dexterity', 0.8], ['defense', 0.5]]],
    ],
    [
      [2, '+15% Movement Speed, +5% Critical Strike Chance', [['moveSpeed', 15], ['critChance', 5]]],
      [3, '+20% Attack Speed, +50% Critical Strike Damage', [['attackSpeed', 20], ['critDamage', 50]]],
      [4, '+1 to All Skills, +20 Dexterity, +60 Life', [['skillLevels', 1], ['dexterity', 20], ['life', 60]]],
    ],
    [4, 'lampblack', 1]),

  S('set.heronwatch', 'The Heronwatch',
    'Marsh hunters who stood in the reeds so still and so long that the herons came and stood beside them.',
    38,
    [
      ['set.heronwatch.bow', 'Reedstring', 'bow.composite', [['enhancedDamage', 1], ['dexterity', 0.8], ['attackRating', 0.6]]],
      ['set.heronwatch.helm', 'Heron-Crest Cap', 'helm.coronet', [['dexterity', 1], ['defense', 0.7], ['critChance', 0.5]]],
      ['set.heronwatch.chest', 'Reed-Woven Coat', 'chest.splint', [['defense', 1], ['life', 0.8], ['coldResist', 0.6]]],
      ['set.heronwatch.belt', 'Fowler\'s Belt', 'belt.war', [['life', 1], ['dexterity', 0.7], ['poisonResist', 0.6]]],
      ['set.heronwatch.boots', 'Marsh-Still Boots', 'boots.war', [['defense', 0.8], ['dexterity', 0.8], ['poisonResist', 0.6]]],
    ],
    [
      [2, '+150 Attack Rating, +15 Dexterity', [['attackRating', 150], ['dexterity', 15]]],
      [3, '+20% Attack Speed, +6% Critical Strike Chance', [['attackSpeed', 20], ['critChance', 6]]],
      [4, '+70% Enhanced Damage, +60% Critical Strike Damage', [['enhancedDamage', 70], ['critDamage', 60]]],
      [5, '+1 to All Skills, +25 Dexterity, +100 Life', [['skillLevels', 1], ['dexterity', 25], ['life', 100]]],
    ],
    [5, 'heronwatch', 1]),

  S('set.pallbearer', 'Pallbearer\'s Due',
    'The funeral guild of the lower town carried every coffin to the crypt. When the dead stopped staying in them, the guild carried on.',
    44,
    [
      ['set.pallbearer.wand', 'The Bier-Rod', 'wand.grave', [['energy', 1], ['arcaneDamage', 0.8], ['skillLevels', 1, 1]]],
      ['set.pallbearer.helm', 'Mourner\'s Veil', 'helm.grim', [['mana', 1], ['energy', 0.8], ['poisonResist', 0.6]]],
      ['set.pallbearer.chest', 'Black Velvet Pall', 'chest.gothic', [['defense', 0.9], ['life', 1], ['arcaneResist', 0.6]]],
      ['set.pallbearer.gloves', 'Silver-Nail Gloves', 'gloves.war', [['energy', 1], ['castSpeed', 0.7], ['defense', 0.5]]],
      ['set.pallbearer.belt', 'Lily-Knot Sash', 'belt.spiderweb', [['life', 1], ['mana', 0.8], ['lifeRegen', 0.6]]],
    ],
    [
      [2, '+80 Mana, +20% Mana Regeneration', [['mana', 80], ['manaRegen', 20]]],
      [3, '+20% Cast Speed, +30 Arcane Damage', [['castSpeed', 20], ['arcaneDamage', 30]]],
      [4, '+1 to All Skills, +15% Cooldown Reduction', [['skillLevels', 1], ['cooldownReduction', 15]]],
      [5, '+1 to All Skills, +150 Life, +10% Damage Reduction', [['skillLevels', 1], ['life', 150], ['damageReduction', 10]]],
    ],
    [5, 'pallbearer', 1]),

  S('set.lanternwright', 'The Lanternwright Vigil',
    'The lamp makers kept a light in every window of the chapel through the long dark. They were never once asked to. They were never once thanked.',
    48,
    [
      ['set.lanternwright.mace', 'The Lamp-Iron', 'mace.battlehammer', [['enhancedDamage', 1], ['fireDamage', 0.8], ['strength', 0.6]]],
      ['set.lanternwright.shield', 'Lamp-Cage Ward', 'shield.pavise', [['blockChance', 1], ['defense', 0.8], ['fireResist', 0.6]]],
      ['set.lanternwright.helm', 'Wick-Crown', 'helm.casque', [['defense', 1], ['vitality', 0.8], ['lightningResist', 0.6]]],
      ['set.lanternwright.chest', 'White-Enamel Plate', 'chest.gothic', [['defense', 1], ['life', 0.9], ['fireResist', 0.6]]],
      ['set.lanternwright.boots', 'Vigil-Keeper\'s Boots', 'boots.sharkskin', [['defense', 0.8], ['vitality', 0.8], ['moveSpeed', 0.6]]],
    ],
    [
      [2, '+12% Block Chance, +60 Life', [['blockChance', 12], ['life', 60]]],
      [3, '+30% Fire Resistance, +30% Lightning Resistance', [['fireResist', 30], ['lightningResist', 30]]],
      [4, '+60% Enhanced Damage, +60 Fire Damage', [['enhancedDamage', 60], ['fireDamage', 60]]],
      [5, '+1 to All Skills, +150 Life, +10% Damage Reduction', [['skillLevels', 1], ['life', 150], ['damageReduction', 10]]],
    ],
    [5, 'lanternRing', 1]),

  S('set.tallowmoon', 'Skin of the Tallow Moon',
    'The moon cult on the hill made masks of tallow and wore the skins of what they hunted. When the moon was full, it was hard to say which was which.',
    40,
    [
      ['set.tallowmoon.helm', 'Tallow Mask', 'helm.bone', [['life', 1], ['strength', 0.8], ['defense', 0.5]]],
      ['set.tallowmoon.chest', 'Cream-Fur Mantle', 'chest.studded', [['life', 1], ['vitality', 0.8], ['coldResist', 0.6]]],
      ['set.tallowmoon.gloves', 'Moon-Claw Wraps', 'gloves.war', [['attackSpeed', 1], ['strength', 0.8], ['lifeSteal', 0.5]]],
      ['set.tallowmoon.pants', 'Moonhide Leggings', 'pants.cuisses', [['vitality', 1], ['defense', 0.8], ['moveSpeed', 0.5]]],
    ],
    [
      [2, '+80 Life, +10 Strength', [['life', 80], ['strength', 10]]],
      [3, '+20% Attack Speed, +4% Life Stolen per Hit', [['attackSpeed', 20], ['lifeSteal', 4]]],
      [4, '+1 to All Skills, +150 Life, +60% Enhanced Damage', [['skillLevels', 1], ['life', 150], ['enhancedDamage', 60]]],
    ],
    [4, 'waxDouble', 1]),

  // ===========================================================================
  // Open sets
  // ===========================================================================
  S('set.cutpurse', 'The Cutpurse\'s Bargain',
    'A stolen ring and a stolen pendant, threaded on a bit of string that was also stolen.',
    6,
    [
      ['set.cutpurse.ring', 'The Lifted Ring', 'ring.ring', [['goldFind', 1], ['dexterity', 0.8]]],
      ['set.cutpurse.amulet', 'The Lifted Locket', 'amulet.amulet', [['magicFind', 1], ['life', 0.6]]],
    ],
    [
      [2, '+40% Gold Found, +15% Magic Find, +10 Dexterity', [['goldFind', 40], ['magicFind', 15], ['dexterity', 10]]],
    ],
    [2, 'wishCurse', 0.8], 130),

  S('set.tinker', 'Tinker\'s Patchwork',
    'Patched leather and copper rivets, none of it matching, all of it mended by a tinker who could fix anything but his own luck.',
    9,
    [
      ['set.tinker.helm', 'Patchwork Cap', 'helm.helm', [['defense', 1], ['vitality', 0.8]]],
      ['set.tinker.gloves', 'Riveted Mitts', 'gloves.leather', [['strength', 0.8], ['attackSpeed', 0.8], ['defense', 0.5]]],
      ['set.tinker.belt', 'Tool Belt', 'belt.belt', [['life', 1], ['goldFind', 0.6]]],
    ],
    [
      [2, '+40 Defense, +25 Life', [['defense', 40], ['life', 25]]],
      [3, '+30% Enhanced Damage, +10% Attack Speed', [['enhancedDamage', 30], ['attackSpeed', 10]]],
    ],
    [3, 'ironGolems', 0.6], 125),

  S('set.saltmarsh', 'Saltmarsh Wayfarer',
    'Oilcloth gear for the road across the salt flats, rimmed white where the sea dried on it.',
    14,
    [
      ['set.saltmarsh.boots', 'Wading Boots', 'boots.greaves', [['moveSpeed', 1], ['coldResist', 0.8]]],
      ['set.saltmarsh.pants', 'Oilcloth Breeches', 'pants.chausses', [['defense', 1], ['poisonResist', 0.8]]],
      ['set.saltmarsh.belt', 'Salt-Rimmed Belt', 'belt.belt', [['life', 1], ['lifeRegen', 0.6]]],
    ],
    [
      [2, '+12% Movement Speed, +20% Cold Resistance', [['moveSpeed', 12], ['coldResist', 20]]],
      [3, '+50 Life, +20% Poison Resistance, +8 Life Regeneration', [['life', 50], ['poisonResist', 20], ['lifeRegen', 8]]],
    ],
    [3, 'sureFooted', 1], 120),

  S('set.ninefold', 'The Ninefold Choir',
    'Nine little silver bells, one for each voice in the choir that sang the town to sleep in the winter of the long night.',
    34,
    [
      ['set.ninefold.amulet', 'The First Voice', 'amulet.talisman', [['energy', 1], ['mana', 0.8], ['castSpeed', 0.5]]],
      ['set.ninefold.ring1', 'The Low Bell', 'ring.signet', [['manaRegen', 1], ['life', 0.7]]],
      ['set.ninefold.ring2', 'The High Bell', 'ring.signet', [['castSpeed', 1], ['mana', 0.7]]],
      ['set.ninefold.helm', 'Choirmaster\'s Coronet', 'helm.coronet', [['energy', 1], ['defense', 0.7], ['lightningResist', 0.6]]],
    ],
    [
      [2, '+60 Mana, +20% Mana Regeneration', [['mana', 60], ['manaRegen', 20]]],
      [3, '+15% Cast Speed, +20% Elemental Damage', [['castSpeed', 15], ['elementalDamagePct', 20]]],
      [4, '+1 to All Skills, +80 Life', [['skillLevels', 1], ['life', 80]]],
    ],
    [4, 'ninefold', 1], 110),

  S('set.kilnborn', 'Kilnborn Regalia',
    'Armour of glazed red clay, fired in the great kiln and lined in gold where it cracked. It was made for someone who meant to walk into the fire.',
    38,
    [
      ['set.kilnborn.helm', 'Glazed Brow', 'helm.grim', [['fireResist', 1], ['defense', 0.8], ['vitality', 0.6]]],
      ['set.kilnborn.chest', 'Fired-Clay Cuirass', 'chest.splint', [['defense', 1], ['fireResist', 0.9], ['life', 0.7]]],
      ['set.kilnborn.gloves', 'Potter\'s Gauntlets', 'gloves.war', [['fireDamage', 1], ['strength', 0.7], ['defense', 0.5]]],
      ['set.kilnborn.boots', 'Kiln-Floor Boots', 'boots.war', [['fireResist', 1], ['moveSpeed', 0.6], ['defense', 0.6]]],
    ],
    [
      [2, '+30% Fire Resistance, +60 Life', [['fireResist', 30], ['life', 60]]],
      [3, '+50 Fire Damage, +10% Damage Reduction', [['fireDamage', 50], ['damageReduction', 10]]],
      [4, '+1 to All Skills, +100 Life, +20% Elemental Damage', [['skillLevels', 1], ['life', 100], ['elementalDamagePct', 20]]],
    ],
    [4, 'kilnborn', 1]),

  S('set.glasswing', 'Glasswing Raiment',
    'Light cloth set with panes of crystal like a moth\'s wings. It shatters, and it is meant to.',
    42,
    [
      ['set.glasswing.helm', 'Glasswing Circlet', 'helm.coronet', [['dexterity', 1], ['energy', 0.7], ['arcaneResist', 0.6]]],
      ['set.glasswing.chest', 'Pane-Set Robe', 'chest.ghost', [['defense', 0.9], ['dexterity', 0.8], ['moveSpeed', 0.5]]],
      ['set.glasswing.gloves', 'Crystal-Knuckle Gloves', 'gloves.vampirebone', [['attackSpeed', 1], ['critChance', 0.7], ['dexterity', 0.5]]],
      ['set.glasswing.boots', 'Wingstep Slippers', 'boots.scarabshell', [['moveSpeed', 1], ['dexterity', 0.8], ['lightningResist', 0.6]]],
    ],
    [
      [2, '+15% Movement Speed, +15 Dexterity', [['moveSpeed', 15], ['dexterity', 15]]],
      [3, '+20% Attack Speed, +6% Critical Strike Chance', [['attackSpeed', 20], ['critChance', 6]]],
      [4, '+1 to All Skills, +60% Critical Strike Damage, +80 Life', [['skillLevels', 1], ['critDamage', 60], ['life', 80]]],
    ],
    [4, 'glasswing', 1]),

  S('set.drownedbell', 'The Drowned Bell Company',
    'A company of marines who went down with the bell-ship. On still nights you can hear them ringing for a muster that will never come.',
    50,
    [
      ['set.drownedbell.helm', 'Bell-Ship Sallet', 'helm.casque', [['defense', 1], ['coldResist', 0.8], ['vitality', 0.6]]],
      ['set.drownedbell.chest', 'Sea-Green Brigandine', 'chest.gothic', [['defense', 1], ['life', 0.9], ['lightningResist', 0.6]]],
      ['set.drownedbell.belt', 'Rope-Knot Belt', 'belt.vampirefang', [['life', 1], ['strength', 0.7], ['coldResist', 0.6]]],
      ['set.drownedbell.boots', 'Deck Boots', 'boots.sharkskin', [['moveSpeed', 0.8], ['defense', 0.8], ['poisonResist', 0.6]]],
      ['set.drownedbell.sword', 'The Muster-Blade', 'sword.falchion', [['enhancedDamage', 1], ['attackSpeed', 0.7], ['maxDamage', 0.6]]],
    ],
    [
      [2, '+30% Cold Resistance, +80 Life', [['coldResist', 30], ['life', 80]]],
      [3, '+20% Attack Speed, +200 Attack Rating', [['attackSpeed', 20], ['attackRating', 200]]],
      [4, '+80% Enhanced Damage, +10% Damage Reduction', [['enhancedDamage', 80], ['damageReduction', 10]]],
      [5, '+1 to All Skills, +150 Life, +20 Strength', [['skillLevels', 1], ['life', 150], ['strength', 20]]],
    ],
    [5, 'drownedBell', 1]),

  S('set.pretender', 'The Pretender\'s Claim',
    'A whole king\'s kit, stolen from the treasury on the night the old king died. It does not quite fit. Nothing about the claim quite fits.',
    64,
    [
      ['set.pretender.helm', 'The Borrowed Crown', 'helm.diadem', [['skillLevels', 1, 1], ['life', 0.8], ['magicFind', 0.6]]],
      ['set.pretender.chest', 'Ill-Fitting Ermine', 'chest.kraken', [['defense', 1], ['life', 0.9], ['strength', 0.6]]],
      ['set.pretender.amulet', 'The Seal of a Dead King', 'amulet.sigil', [['strength', 0.8], ['dexterity', 0.8], ['vitality', 0.8]]],
      ['set.pretender.ring', 'The Stolen Signet', 'ring.circle', [['critChance', 1], ['life', 0.7], ['goldFind', 0.6]]],
      ['set.pretender.sword', 'Usurper\'s Blade', 'sword.conquest', [['enhancedDamage', 1], ['critDamage', 0.8], ['attackSpeed', 0.6]]],
      ['set.pretender.shield', 'The False Arms', 'shield.monarch', [['blockChance', 1], ['defense', 0.8], ['vitality', 0.6]]],
    ],
    [
      [2, '+100 Life, +20 Strength', [['life', 100], ['strength', 20]]],
      [3, '+25% Attack Speed, +8% Critical Strike Chance', [['attackSpeed', 25], ['critChance', 8]]],
      [4, '+100% Enhanced Damage, +80% Critical Strike Damage', [['enhancedDamage', 100], ['critDamage', 80]]],
      [5, '+30% Magic Find, +15% Damage Reduction', [['magicFind', 30], ['damageReduction', 15]]],
      [6, '+2 to All Skills, +250 Life', [['skillLevels', 2], ['life', 250]]],
    ],
    [6, 'pretender', 1], 90),

  S('set.cartographer', 'The Carrion Cartographer',
    'A map-maker who mapped only the dead: where they lay, and where they went after. The ink on his fingers never came off.',
    60,
    [
      ['set.cartographer.gloves', 'Ink-Stained Gloves', 'gloves.sorcerer', [['dexterity', 1], ['magicFind', 0.8], ['attackRating', 0.6]]],
      ['set.cartographer.pants', 'Surveyor\'s Breeches', 'pants.legion', [['defense', 1], ['moveSpeed', 0.7], ['poisonResist', 0.6]]],
      ['set.cartographer.boots', 'Long-Road Boots', 'boots.wyrmhide', [['moveSpeed', 1], ['vitality', 0.8], ['coldResist', 0.6]]],
      ['set.cartographer.belt', 'Compass-Brass Belt', 'belt.troll', [['life', 1], ['goldFind', 0.8], ['lightningResist', 0.6]]],
      ['set.cartographer.amulet', 'The Dead Reckoning', 'amulet.reliquary', [['magicFind', 1], ['energy', 0.7], ['arcaneResist', 0.6]]],
    ],
    [
      [2, '+15% Movement Speed, +80 Life', [['moveSpeed', 15], ['life', 80]]],
      [3, '+40% Magic Find, +60% Gold Found', [['magicFind', 40], ['goldFind', 60]]],
      [4, '+60% Enhanced Damage, +10% Damage Reduction', [['enhancedDamage', 60], ['damageReduction', 10]]],
      [5, '+1 to All Skills, +40% Magic Find', [['skillLevels', 1], ['magicFind', 40]]],
    ],
    [5, 'cartographer', 1], 95),

  S('set.hollowmere', 'The Last Lamp of Hollowmere',
    'Hollowmere drowned in a night, and the lamp lighter went round every street lighting the lamps under the water. This is all of his kit. One lamp is still lit.',
    76,
    [
      ['set.hollowmere.helm', 'Lamplighter\'s Hood', 'helm.spired', [['skillLevels', 1, 1], ['life', 0.8], ['fireResist', 0.6]]],
      ['set.hollowmere.chest', 'Wick-Stained Coat', 'chest.sacred', [['defense', 1], ['life', 0.9], ['coldResist', 0.6]]],
      ['set.hollowmere.gloves', 'Taper Gloves', 'gloves.ogre', [['fireDamage', 1], ['castSpeed', 0.7], ['attackSpeed', 0.6]]],
      ['set.hollowmere.belt', 'Oil-Flask Belt', 'belt.colossus', [['life', 1], ['vitality', 0.8], ['lightningResist', 0.6]]],
      ['set.hollowmere.boots', 'Drowned-Street Boots', 'boots.myrmidon', [['moveSpeed', 1], ['coldResist', 0.8], ['defense', 0.6]]],
      ['set.hollowmere.pants', 'Lamplighter\'s Leggings', 'pants.legion', [['defense', 1], ['vitality', 0.8], ['poisonResist', 0.6]]],
      ['set.hollowmere.amulet', 'The Last Lamp', 'amulet.sigil', [['skillLevels', 1, 1], ['fireDamage', 1], ['energy', 0.6]]],
    ],
    [
      [2, '+150 Life, +30% Fire Resistance', [['life', 150], ['fireResist', 30]]],
      [3, '+30% Cast Speed, +30% Attack Speed', [['castSpeed', 30], ['attackSpeed', 30]]],
      [4, '+120 Fire Damage, +30% Elemental Damage', [['fireDamage', 120], ['elementalDamagePct', 30]]],
      [5, '+15% Damage Reduction, +30% Cold Resistance', [['damageReduction', 15], ['coldResist', 30]]],
      [6, '+1 to All Skills, +250 Life', [['skillLevels', 1], ['life', 250]]],
      [7, '+2 to All Skills, +20% Movement Speed', [['skillLevels', 2], ['moveSpeed', 20]]],
    ],
    [7, 'hollowmere', 1.2], 70),
];
