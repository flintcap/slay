/**
 * SLAY — the depth plan's seventeen sets.
 *
 * Seven class sets, one per class, each built round one of that class's
 * trees, and ten open sets from the first floors to the relic band. A single
 * piece is written a little under a unique of its level (`setMods`), then
 * lifted to beat a good rare of that level (`buildSetPiece` in `sim/Loot.ts`);
 * the set pays again in its bonuses, and the full set grants a power that changes how you
 * fight (`sim/ItemPowers.ts`, the set signatures). Every set has one look all
 * its pieces share (`art/items/Designs.ts`, `SET_MOTIFS`).
 */
import type { StatKey } from '../types';
import { setMods, type ModSpec } from './uniqueBatches/kit';
import { tr } from '../core/I18n';

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
  S('set.tollgate', tr('The Tollgate Oath'),
    tr('The wardens of the old bridge took a coin from everyone who crossed. From the things that came up out of the river, they took more.'),
    34,
    [
      ['set.tollgate.helm', tr('Tollkeeper\'s Visor'), 'helm.full', [['defense', 1], ['vitality', 0.8], ['blockChance', 0.5]]],
      ['set.tollgate.chest', tr('Tollkeeper\'s Hauberk'), 'chest.chainmail', [['defense', 1], ['life', 0.9], ['physicalResist', 0.6]]],
      ['set.tollgate.shield', tr('The Bridge Gate'), 'shield.round', [['blockChance', 1], ['defense', 0.8], ['strength', 0.6]]],
      ['set.tollgate.gloves', tr('Toll-Taker\'s Grip'), 'gloves.vampirebone', [['strength', 1], ['attackRating', 0.8], ['defense', 0.5]]],
      ['set.tollgate.boots', tr('Bridgewalker Sabatons'), 'boots.scarabshell', [['vitality', 1], ['defense', 0.8], ['moveSpeed', 0.5]]],
    ],
    [
      [2, tr('+15% Block Chance, +40 Life'), [['blockChance', 15], ['life', 40]]],
      [3, tr('+80% Enhanced Defense, +10% Damage Reduction'), [['enhancedDefense', 80], ['damageReduction', 10]]],
      [4, tr('+60% Enhanced Damage, +20 Strength'), [['enhancedDamage', 60], ['strength', 20]]],
      [5, tr('+1 to All Skills, +120 Life, +10% Block Chance'), [['skillLevels', 1], ['life', 120], ['blockChance', 10]]],
    ],
    [5, 'tollgate', 1]),

  S('set.orrery', tr('Orrery of the Ninth Hour'),
    tr('A brass clock of the heavens that a mage wore piece by piece, so that she would always know what hour it was in the sky.'),
    52,
    [
      ['set.orrery.orb', tr('The Ninth Sphere'), 'orb.heavenly', [['energy', 1], ['arcaneDamage', 1], ['castSpeed', 0.6]]],
      ['set.orrery.helm', tr('Star-Dial Circlet'), 'helm.coronet', [['mana', 1], ['energy', 0.8], ['arcaneResist', 0.6]]],
      ['set.orrery.chest', tr('Robe of Turning Rings'), 'chest.dusk', [['defense', 0.8], ['mana', 1], ['coldResist', 0.6], ['lightningResist', 0.6]]],
      ['set.orrery.ring', tr('The Hour Ring'), 'ring.band', [['castSpeed', 1], ['manaRegen', 0.8], ['energy', 0.5]]],
      ['set.orrery.amulet', tr('The Little Sun'), 'amulet.reliquary', [['elementalDamagePct', 1], ['mana', 0.8], ['fireResist', 0.6]]],
    ],
    [
      [2, tr('+13% Cast Speed, +80 Mana'), [['castSpeed', 13], ['mana', 80]]],
      [3, tr('+25% Elemental Damage, +25% Mana Regeneration'), [['elementalDamagePct', 25], ['manaRegen', 25]]],
      [4, tr('+1 to All Skills, +15% Cooldown Reduction'), [['skillLevels', 1], ['cooldownReduction', 15]]],
      [5, tr('+1 to All Skills, +150 Mana, +40 Arcane Damage'), [['skillLevels', 1], ['mana', 150], ['arcaneDamage', 40]]],
    ],
    [5, 'orrery', 1]),

  S('set.lampblack', tr('The Lampblack Covenant'),
    tr('The chimney sweeps of the old town went where nobody else could. Some of them were paid to come down a chimney and not go back up it.'),
    26,
    [
      ['set.lampblack.dagger', tr('The Flue-Knife'), 'dagger.kris', [['maxDamage', 1], ['critChance', 0.8], ['attackSpeed', 0.6]]],
      ['set.lampblack.helm', tr('Sweep\'s Soot-Hood'), 'helm.skullcap', [['dexterity', 1], ['defense', 0.8], ['critDamage', 0.6]]],
      ['set.lampblack.gloves', tr('Brass-Button Mitts'), 'gloves.heavy', [['attackSpeed', 1], ['dexterity', 0.8], ['lifeSteal', 0.5]]],
      ['set.lampblack.boots', tr('Rooftop Treads'), 'boots.heavy', [['moveSpeed', 1], ['dexterity', 0.8], ['defense', 0.5]]],
    ],
    [
      [2, tr('+15% Movement Speed, +5% Critical Strike Chance'), [['moveSpeed', 15], ['critChance', 5]]],
      [3, tr('+13% Attack Speed, +50% Critical Strike Damage'), [['attackSpeed', 13], ['critDamage', 50]]],
      [4, tr('+1 to All Skills, +20 Dexterity, +60 Life'), [['skillLevels', 1], ['dexterity', 20], ['life', 60]]],
    ],
    [4, 'lampblack', 1]),

  S('set.heronwatch', tr('The Heronwatch'),
    tr('Marsh hunters who stood in the reeds so still and so long that the herons came and stood beside them.'),
    38,
    [
      ['set.heronwatch.bow', tr('Reedstring'), 'bow.composite', [['enhancedDamage', 1], ['dexterity', 0.8], ['attackRating', 0.6]]],
      ['set.heronwatch.helm', tr('Heron-Crest Cap'), 'helm.coronet', [['dexterity', 1], ['defense', 0.7], ['critChance', 0.5]]],
      ['set.heronwatch.chest', tr('Reed-Woven Coat'), 'chest.splint', [['defense', 1], ['life', 0.8], ['coldResist', 0.6]]],
      ['set.heronwatch.belt', tr('Fowler\'s Belt'), 'belt.war', [['life', 1], ['dexterity', 0.7], ['poisonResist', 0.6]]],
      ['set.heronwatch.boots', tr('Marsh-Still Boots'), 'boots.war', [['defense', 0.8], ['dexterity', 0.8], ['poisonResist', 0.6]]],
    ],
    [
      [2, tr('+150 Attack Rating, +15 Dexterity'), [['attackRating', 150], ['dexterity', 15]]],
      [3, tr('+13% Attack Speed, +6% Critical Strike Chance'), [['attackSpeed', 13], ['critChance', 6]]],
      [4, tr('+70% Enhanced Damage, +60% Critical Strike Damage'), [['enhancedDamage', 70], ['critDamage', 60]]],
      [5, tr('+1 to All Skills, +25 Dexterity, +100 Life'), [['skillLevels', 1], ['dexterity', 25], ['life', 100]]],
    ],
    [5, 'heronwatch', 1]),

  S('set.pallbearer', tr('Pallbearer\'s Due'),
    tr('The funeral guild of the lower town carried every coffin to the crypt. When the dead stopped staying in them, the guild carried on.'),
    44,
    [
      ['set.pallbearer.wand', tr('The Bier-Rod'), 'wand.grave', [['energy', 1], ['arcaneDamage', 0.8], ['skillLevels', 1, 1]]],
      ['set.pallbearer.helm', tr('Mourner\'s Veil'), 'helm.grim', [['mana', 1], ['energy', 0.8], ['poisonResist', 0.6]]],
      ['set.pallbearer.chest', tr('Black Velvet Pall'), 'chest.gothic', [['defense', 0.9], ['life', 1], ['arcaneResist', 0.6]]],
      ['set.pallbearer.gloves', tr('Silver-Nail Gloves'), 'gloves.war', [['energy', 1], ['castSpeed', 0.7], ['defense', 0.5]]],
      ['set.pallbearer.belt', tr('Lily-Knot Sash'), 'belt.spiderweb', [['life', 1], ['mana', 0.8], ['lifeRegen', 0.6]]],
    ],
    [
      [2, tr('+80 Mana, +20% Mana Regeneration'), [['mana', 80], ['manaRegen', 20]]],
      [3, tr('+13% Cast Speed, +30 Arcane Damage'), [['castSpeed', 13], ['arcaneDamage', 30]]],
      [4, tr('+1 to All Skills, +15% Cooldown Reduction'), [['skillLevels', 1], ['cooldownReduction', 15]]],
      [5, tr('+1 to All Skills, +150 Life, +10% Damage Reduction'), [['skillLevels', 1], ['life', 150], ['damageReduction', 10]]],
    ],
    [5, 'pallbearer', 1]),

  S('set.lanternwright', tr('The Lanternwright Vigil'),
    tr('The lamp makers kept a light in every window of the chapel through the long dark. They were never once asked to. They were never once thanked.'),
    48,
    [
      ['set.lanternwright.mace', tr('The Lamp-Iron'), 'mace.battlehammer', [['enhancedDamage', 1], ['fireDamage', 0.8], ['strength', 0.6]]],
      ['set.lanternwright.shield', tr('Lamp-Cage Ward'), 'shield.pavise', [['blockChance', 1], ['defense', 0.8], ['fireResist', 0.6]]],
      ['set.lanternwright.helm', tr('Wick-Crown'), 'helm.casque', [['defense', 1], ['vitality', 0.8], ['lightningResist', 0.6]]],
      ['set.lanternwright.chest', tr('White-Enamel Plate'), 'chest.gothic', [['defense', 1], ['life', 0.9], ['fireResist', 0.6]]],
      ['set.lanternwright.boots', tr('Vigil-Keeper\'s Boots'), 'boots.sharkskin', [['defense', 0.8], ['vitality', 0.8], ['moveSpeed', 0.6]]],
    ],
    [
      [2, tr('+12% Block Chance, +60 Life'), [['blockChance', 12], ['life', 60]]],
      [3, tr('+30% Fire Resistance, +30% Lightning Resistance'), [['fireResist', 30], ['lightningResist', 30]]],
      [4, tr('+60% Enhanced Damage, +60 Fire Damage'), [['enhancedDamage', 60], ['fireDamage', 60]]],
      [5, tr('+1 to All Skills, +150 Life, +10% Damage Reduction'), [['skillLevels', 1], ['life', 150], ['damageReduction', 10]]],
    ],
    [5, 'lanternRing', 1]),

  S('set.tallowmoon', tr('Skin of the Tallow Moon'),
    tr('The moon cult on the hill made masks of tallow and wore the skins of what they hunted. When the moon was full, it was hard to say which was which.'),
    40,
    [
      ['set.tallowmoon.helm', tr('Tallow Mask'), 'helm.bone', [['life', 1], ['strength', 0.8], ['defense', 0.5]]],
      ['set.tallowmoon.chest', tr('Cream-Fur Mantle'), 'chest.studded', [['life', 1], ['vitality', 0.8], ['coldResist', 0.6]]],
      ['set.tallowmoon.gloves', tr('Moon-Claw Wraps'), 'gloves.war', [['attackSpeed', 1], ['strength', 0.8], ['lifeSteal', 0.5]]],
      ['set.tallowmoon.pants', tr('Moonhide Leggings'), 'pants.cuisses', [['vitality', 1], ['defense', 0.8], ['moveSpeed', 0.5]]],
    ],
    [
      [2, tr('+80 Life, +10 Strength'), [['life', 80], ['strength', 10]]],
      [3, tr('+13% Attack Speed, +4% Life Stolen per Hit'), [['attackSpeed', 13], ['lifeSteal', 4]]],
      [4, tr('+1 to All Skills, +150 Life, +60% Enhanced Damage'), [['skillLevels', 1], ['life', 150], ['enhancedDamage', 60]]],
    ],
    [4, 'waxDouble', 1]),

  // ===========================================================================
  // Open sets
  // ===========================================================================
  S('set.cutpurse', tr('The Cutpurse\'s Bargain'),
    tr('A stolen ring and a stolen pendant, threaded on a bit of string that was also stolen.'),
    6,
    [
      ['set.cutpurse.ring', tr('The Lifted Ring'), 'ring.ring', [['goldFind', 1], ['dexterity', 0.8], ['critChance', 0.7]]],
      ['set.cutpurse.amulet', tr('The Lifted Locket'), 'amulet.amulet', [['magicFind', 1], ['life', 0.6], ['moveSpeed', 0.6]]],
    ],
    [
      [2, tr('+40% Gold Found, +15% Magic Find, +10 Dexterity'), [['goldFind', 40], ['magicFind', 15], ['dexterity', 10]]],
    ],
    [2, 'wishCurse', 0.8], 130),

  S('set.tinker', tr('Tinker\'s Patchwork'),
    tr('Patched leather and copper rivets, none of it matching, all of it mended by a tinker who could fix anything but his own luck.'),
    9,
    [
      ['set.tinker.helm', tr('Patchwork Cap'), 'helm.helm', [['defense', 1], ['vitality', 0.8], ['lifeRegen', 0.7]]],
      ['set.tinker.gloves', tr('Riveted Mitts'), 'gloves.leather', [['strength', 0.8], ['attackSpeed', 0.8], ['defense', 0.5]]],
      ['set.tinker.belt', tr('Tool Belt'), 'belt.belt', [['life', 1], ['goldFind', 0.6], ['strength', 0.7]]],
    ],
    [
      [2, tr('+40 Defense, +25 Life'), [['defense', 40], ['life', 25]]],
      [3, tr('+30% Enhanced Damage, +8% Attack Speed'), [['enhancedDamage', 30], ['attackSpeed', 8]]],
    ],
    [3, 'ironGolems', 0.6], 125),

  S('set.saltmarsh', tr('Saltmarsh Wayfarer'),
    tr('Oilcloth gear for the road across the salt flats, rimmed white where the sea dried on it.'),
    14,
    [
      ['set.saltmarsh.boots', tr('Wading Boots'), 'boots.greaves', [['moveSpeed', 1], ['coldResist', 0.8], ['life', 0.6]]],
      ['set.saltmarsh.pants', tr('Oilcloth Breeches'), 'pants.chausses', [['defense', 1], ['poisonResist', 0.8], ['vitality', 0.6]]],
      ['set.saltmarsh.belt', tr('Salt-Rimmed Belt'), 'belt.belt', [['life', 1], ['lifeRegen', 0.6], ['lightningResist', 0.7]]],
    ],
    [
      [2, tr('+12% Movement Speed, +20% Cold Resistance'), [['moveSpeed', 12], ['coldResist', 20]]],
      [3, tr('+50 Life, +20% Poison Resistance, +8 Life Regeneration'), [['life', 50], ['poisonResist', 20], ['lifeRegen', 8]]],
    ],
    [3, 'sureFooted', 1], 120),

  S('set.ninefold', tr('The Ninefold Choir'),
    tr('Nine little silver bells, one for each voice in the choir that sang the town to sleep in the winter of the long night.'),
    34,
    [
      ['set.ninefold.amulet', tr('The First Voice'), 'amulet.talisman', [['energy', 1], ['mana', 0.8], ['castSpeed', 0.5]]],
      ['set.ninefold.ring1', tr('The Low Bell'), 'ring.signet', [['manaRegen', 1], ['life', 0.7], ['energy', 0.7]]],
      ['set.ninefold.ring2', tr('The High Bell'), 'ring.signet', [['castSpeed', 1], ['mana', 0.7], ['elementalDamagePct', 0.6]]],
      ['set.ninefold.helm', tr('Choirmaster\'s Coronet'), 'helm.coronet', [['energy', 1], ['defense', 0.7], ['lightningResist', 0.6]]],
    ],
    [
      [2, tr('+60 Mana, +20% Mana Regeneration'), [['mana', 60], ['manaRegen', 20]]],
      [3, tr('+11% Cast Speed, +20% Elemental Damage'), [['castSpeed', 11], ['elementalDamagePct', 20]]],
      [4, tr('+1 to All Skills, +80 Life'), [['skillLevels', 1], ['life', 80]]],
    ],
    [4, 'ninefold', 1], 110),

  S('set.kilnborn', tr('Kilnborn Regalia'),
    tr('Armour of glazed red clay, fired in the great kiln and lined in gold where it cracked. It was made for someone who meant to walk into the fire.'),
    38,
    [
      ['set.kilnborn.helm', tr('Glazed Brow'), 'helm.grim', [['fireResist', 1], ['defense', 0.8], ['vitality', 0.6]]],
      ['set.kilnborn.chest', tr('Fired-Clay Cuirass'), 'chest.splint', [['defense', 1], ['fireResist', 0.9], ['life', 0.7]]],
      ['set.kilnborn.gloves', tr('Potter\'s Gauntlets'), 'gloves.war', [['fireDamage', 1], ['strength', 0.7], ['defense', 0.5]]],
      ['set.kilnborn.boots', tr('Kiln-Floor Boots'), 'boots.war', [['fireResist', 1], ['moveSpeed', 0.6], ['defense', 0.6]]],
    ],
    [
      [2, tr('+30% Fire Resistance, +60 Life'), [['fireResist', 30], ['life', 60]]],
      [3, tr('+50 Fire Damage, +10% Damage Reduction'), [['fireDamage', 50], ['damageReduction', 10]]],
      [4, tr('+1 to All Skills, +100 Life, +20% Elemental Damage'), [['skillLevels', 1], ['life', 100], ['elementalDamagePct', 20]]],
    ],
    [4, 'kilnborn', 1]),

  S('set.glasswing', tr('Glasswing Raiment'),
    tr('Light cloth set with panes of crystal like a moth\'s wings. It shatters, and it is meant to.'),
    42,
    [
      ['set.glasswing.helm', tr('Glasswing Circlet'), 'helm.coronet', [['dexterity', 1], ['energy', 0.7], ['arcaneResist', 0.6]]],
      ['set.glasswing.chest', tr('Pane-Set Robe'), 'chest.ghost', [['defense', 0.9], ['dexterity', 0.8], ['moveSpeed', 0.5]]],
      ['set.glasswing.gloves', tr('Crystal-Knuckle Gloves'), 'gloves.vampirebone', [['attackSpeed', 1], ['critChance', 0.7], ['dexterity', 0.5]]],
      ['set.glasswing.boots', tr('Wingstep Slippers'), 'boots.scarabshell', [['moveSpeed', 1], ['dexterity', 0.8], ['lightningResist', 0.6]]],
    ],
    [
      [2, tr('+15% Movement Speed, +15 Dexterity'), [['moveSpeed', 15], ['dexterity', 15]]],
      [3, tr('+13% Attack Speed, +6% Critical Strike Chance'), [['attackSpeed', 13], ['critChance', 6]]],
      [4, tr('+1 to All Skills, +60% Critical Strike Damage, +80 Life'), [['skillLevels', 1], ['critDamage', 60], ['life', 80]]],
    ],
    [4, 'glasswing', 1]),

  S('set.drownedbell', tr('The Drowned Bell Company'),
    tr('A company of marines who went down with the bell-ship. On still nights you can hear them ringing for a muster that will never come.'),
    50,
    [
      ['set.drownedbell.helm', tr('Bell-Ship Sallet'), 'helm.casque', [['defense', 1], ['coldResist', 0.8], ['vitality', 0.6]]],
      ['set.drownedbell.chest', tr('Sea-Green Brigandine'), 'chest.gothic', [['defense', 1], ['life', 0.9], ['lightningResist', 0.6]]],
      ['set.drownedbell.belt', tr('Rope-Knot Belt'), 'belt.vampirefang', [['life', 1], ['strength', 0.7], ['coldResist', 0.6]]],
      ['set.drownedbell.boots', tr('Deck Boots'), 'boots.sharkskin', [['moveSpeed', 0.8], ['defense', 0.8], ['poisonResist', 0.6]]],
      ['set.drownedbell.sword', tr('The Muster-Blade'), 'sword.falchion', [['enhancedDamage', 1], ['attackSpeed', 0.7], ['maxDamage', 0.6]]],
    ],
    [
      [2, tr('+30% Cold Resistance, +80 Life'), [['coldResist', 30], ['life', 80]]],
      [3, tr('+13% Attack Speed, +200 Attack Rating'), [['attackSpeed', 13], ['attackRating', 200]]],
      [4, tr('+80% Enhanced Damage, +10% Damage Reduction'), [['enhancedDamage', 80], ['damageReduction', 10]]],
      [5, tr('+1 to All Skills, +150 Life, +20 Strength'), [['skillLevels', 1], ['life', 150], ['strength', 20]]],
    ],
    [5, 'drownedBell', 1]),

  S('set.pretender', tr('The Pretender\'s Claim'),
    tr('A whole king\'s kit, stolen from the treasury on the night the old king died. It does not quite fit. Nothing about the claim quite fits.'),
    64,
    [
      ['set.pretender.helm', tr('The Borrowed Crown'), 'helm.diadem', [['skillLevels', 1, 1], ['life', 0.8], ['magicFind', 0.6]]],
      ['set.pretender.chest', tr('Ill-Fitting Ermine'), 'chest.kraken', [['defense', 1], ['life', 0.9], ['strength', 0.6]]],
      ['set.pretender.amulet', tr('The Seal of a Dead King'), 'amulet.sigil', [['strength', 0.8], ['dexterity', 0.8], ['vitality', 0.8]]],
      ['set.pretender.ring', tr('The Stolen Signet'), 'ring.circle', [['critChance', 1], ['life', 0.7], ['goldFind', 0.6]]],
      ['set.pretender.sword', tr('Usurper\'s Blade'), 'sword.conquest', [['enhancedDamage', 1], ['critDamage', 0.8], ['attackSpeed', 0.6]]],
      ['set.pretender.shield', tr('The False Arms'), 'shield.monarch', [['blockChance', 1], ['defense', 0.8], ['vitality', 0.6]]],
    ],
    [
      [2, tr('+100 Life, +20 Strength'), [['life', 100], ['strength', 20]]],
      [3, tr('+15% Attack Speed, +8% Critical Strike Chance'), [['attackSpeed', 15], ['critChance', 8]]],
      [4, tr('+100% Enhanced Damage, +80% Critical Strike Damage'), [['enhancedDamage', 100], ['critDamage', 80]]],
      [5, tr('+30% Magic Find, +15% Damage Reduction'), [['magicFind', 30], ['damageReduction', 15]]],
      [6, tr('+2 to All Skills, +250 Life'), [['skillLevels', 2], ['life', 250]]],
    ],
    [6, 'pretender', 1], 90),

  S('set.cartographer', tr('The Carrion Cartographer'),
    tr('A map-maker who mapped only the dead: where they lay, and where they went after. The ink on his fingers never came off.'),
    60,
    [
      ['set.cartographer.gloves', tr('Ink-Stained Gloves'), 'gloves.sorcerer', [['dexterity', 1], ['magicFind', 0.8], ['attackRating', 0.6]]],
      ['set.cartographer.pants', tr('Surveyor\'s Breeches'), 'pants.legion', [['defense', 1], ['moveSpeed', 0.7], ['poisonResist', 0.6]]],
      ['set.cartographer.boots', tr('Long-Road Boots'), 'boots.wyrmhide', [['moveSpeed', 1], ['vitality', 0.8], ['coldResist', 0.6]]],
      ['set.cartographer.belt', tr('Compass-Brass Belt'), 'belt.troll', [['life', 1], ['goldFind', 0.8], ['lightningResist', 0.6]]],
      ['set.cartographer.amulet', tr('The Dead Reckoning'), 'amulet.reliquary', [['magicFind', 1], ['energy', 0.7], ['arcaneResist', 0.6]]],
    ],
    [
      [2, tr('+15% Movement Speed, +80 Life'), [['moveSpeed', 15], ['life', 80]]],
      [3, tr('+40% Magic Find, +60% Gold Found'), [['magicFind', 40], ['goldFind', 60]]],
      [4, tr('+60% Enhanced Damage, +10% Damage Reduction'), [['enhancedDamage', 60], ['damageReduction', 10]]],
      [5, tr('+1 to All Skills, +40% Magic Find'), [['skillLevels', 1], ['magicFind', 40]]],
    ],
    [5, 'cartographer', 1], 95),

  S('set.hollowmere', tr('The Last Lamp of Hollowmere'),
    tr('Hollowmere drowned in a night, and the lamp lighter went round every street lighting the lamps under the water. This is all of his kit. One lamp is still lit.'),
    76,
    [
      ['set.hollowmere.helm', tr('Lamplighter\'s Hood'), 'helm.spired', [['skillLevels', 1, 1], ['life', 0.8], ['fireResist', 0.6]]],
      ['set.hollowmere.chest', tr('Wick-Stained Coat'), 'chest.sacred', [['defense', 1], ['life', 0.9], ['coldResist', 0.6]]],
      ['set.hollowmere.gloves', tr('Taper Gloves'), 'gloves.ogre', [['fireDamage', 1], ['castSpeed', 0.7], ['attackSpeed', 0.6]]],
      ['set.hollowmere.belt', tr('Oil-Flask Belt'), 'belt.colossus', [['life', 1], ['vitality', 0.8], ['lightningResist', 0.6]]],
      ['set.hollowmere.boots', tr('Drowned-Street Boots'), 'boots.myrmidon', [['moveSpeed', 1], ['coldResist', 0.8], ['defense', 0.6]]],
      ['set.hollowmere.pants', tr('Lamplighter\'s Leggings'), 'pants.legion', [['defense', 1], ['vitality', 0.8], ['poisonResist', 0.6]]],
      ['set.hollowmere.amulet', tr('The Last Lamp'), 'amulet.sigil', [['skillLevels', 1, 1], ['fireDamage', 1], ['energy', 0.6]]],
    ],
    [
      [2, tr('+150 Life, +30% Fire Resistance'), [['life', 150], ['fireResist', 30]]],
      [3, tr('+17% Cast Speed, +17% Attack Speed'), [['castSpeed', 17], ['attackSpeed', 17]]],
      [4, tr('+120 Fire Damage, +30% Elemental Damage'), [['fireDamage', 120], ['elementalDamagePct', 30]]],
      [5, tr('+15% Damage Reduction, +30% Cold Resistance'), [['damageReduction', 15], ['coldResist', 30]]],
      [6, tr('+1 to All Skills, +250 Life'), [['skillLevels', 1], ['life', 250]]],
      [7, tr('+2 to All Skills, +20% Movement Speed'), [['skillLevels', 2], ['moveSpeed', 20]]],
    ],
    [7, 'hollowmere', 1.2], 70),
];
