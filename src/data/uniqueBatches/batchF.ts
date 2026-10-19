/**
 * SLAY — depth uniques, batch F: charms and mythics.
 *
 * Twenty-four charms, carried in the pack, each an odd mix no worn piece
 * would give you: a little of two things that do not usually go together.
 * Charms cannot carry a power or a bend, so the mix is the reason to keep one.
 *
 * Ten mythics, one at a time: while you own one, that one cannot drop again.
 * Each is carried by one of the deepest bosses, and each wears its light.
 */
import type { UniqueDef } from '../uniques';
import { D, U } from './kit';
import { tr } from '../../core/I18n';

export const BATCH_F: UniqueDef[] = [
  // ===========================================================================
  // Small charms
  // ===========================================================================
  U('uq.charm.ratstail', tr("A Rat's Tail"), 'charm.small', 4,
    tr('Tied in a knot for luck. It was not lucky for the rat.'),
    [['moveSpeed', 1], ['poisonResist', 1], ['goldFind', 0.8]],
    { look: D('leather.worn|0x6a5a4a', 'leather.fine|0x8a2a1a', undefined, ['tatters'], 0.8, { aura: 'motes', glow: 0xd8c8a0 }) }),

  U('uq.charm.chalkstub', tr('Stub of Chalk'), 'charm.small', 12,
    tr('Hesper drew her circles with it. What is left is too short to draw with, and still too long to throw away.'),
    [['manaRegen', 1], ['lightningResist', 1], ['attackRating', 0.6]],
    { look: D('stone.town|0xe8e4d8', 'cloth.linen|0x2a4a8a', undefined, ['runes'], 0.4, { aura: 'soft', glow: 0xf0f0ff }) }),

  U('uq.charm.tinbell', tr('Tin Bell'), 'charm.small', 20,
    tr('A goat bell with the clapper wrapped in rag so it makes no sound. You can still feel it ring.'),
    [['blockChance', 1], ['coldResist', 1], ['magicFind', 0.6]],
    { look: D('metal.iron|0x9a9a90', 'cloth.rag|0x8a7a4a', undefined, ['bells'], 0.6, { aura: 'soft', glow: 0xe0e0d0 }) }),

  U('uq.charm.waxseal', tr('Broken Wax Seal'), 'charm.small', 36,
    tr('From a letter nobody read. The crest on it belongs to a house that no longer stands.'),
    [['fireResist', 1], ['critChance', 1], ['mana', 0.6]],
    { look: D('stone.town|0x8a1a14', 'cloth.silk|0xa01a1a', undefined, ['cracks', 'crowns'], 0.5, { aura: 'embers', glow: 0xff6040 }) }),

  U('uq.charm.lockpick', tr('Bent Lockpick'), 'charm.small', 46,
    tr('It opened one of Vey\'s doors, once. It has not been straight since.'),
    [['dexterity', 1], ['arcaneResist', 1], ['lifeRegen', 0.6]],
    { look: D('metal.steel', 'leather.dark|0x1a1a1a', undefined, ['chains'], 0.5, { aura: 'sparkles', glow: 0xd0c0ff }) }),

  U('uq.charm.ferrycoin', tr("The Ferry's Coin"), 'charm.small', 54,
    tr('The fare for the black water. Hollis never takes it. He only ever looks at it.'),
    [['life', 1], ['manaSteal', 1], ['coldResist', 0.6]],
    { look: D('metal.verdigris', 'cloth.linen|0x1a5a5a', undefined, ['coins', 'skulls'], 0.7, { aura: 'drips', glow: 0x60c0b0 }) }),

  U('uq.charm.lastemberstone', tr('The Coal That Kept'), 'charm.small', 78,
    tr('A coal from the hearth of the first house in the town. Someone has carried it down every floor since.'),
    [['fireDamage', 1], ['coldResist', 1], ['cooldownReduction', 0.8]],
    { look: D('stone.obsidian|0x5a2010', 'leather.fine|0x3a2a5a', undefined, ['flames', 'cracks'], 0.3, { aura: 'embers', glow: 0xff7020, glowStyle: 'pulse' }) }),

  // ===========================================================================
  // Medium charms
  // ===========================================================================
  U('uq.charm.spoolofwire', tr('Spool of Wire'), 'charm.medium', 10,
    tr('The wire Tamsin learned on, before the long one over the pit. It is tangled in a way that looks deliberate.'),
    [['attackSpeed', 1], ['vitality', 1], ['lightningResist', 0.8]],
    { look: D('metal.copper', 'cloth.silk|0xb08a3a', undefined, ['coils'], 0.5, { aura: 'sparks', glow: 0xffc080 }) }),

  U('uq.charm.moleskinpurse', tr('Moleskin Purse'), 'charm.medium', 28,
    tr('Soft, small and empty. Whatever you put in it is gone by morning, and something else is in its place.'),
    [['goldFind', 1.2], ['physicalResist', 1], ['energy', 0.8]],
    { look: D('leather.fine|0x3a3030', 'leather.fine|0x4a3a5a', 'metal.brass', ['coins'], 0.6, { aura: 'shine', glow: 0xffd870 }) }),

  U('uq.charm.saintsknuckle', tr("A Saint's Knuckle"), 'charm.medium', 50,
    tr('Sold at the church door to every pilgrim for a copper. This one, by some mistake, is real.'),
    [['blockChance', 1], ['poisonDamage', 1], ['life', 0.8]],
    { look: D('bone.bleached', 'cloth.silk|0xe8e0c8', 'metal.gold', ['halo'], 0.4, { aura: 'soft', glow: 0xfff0c0 }) }),

  U('uq.charm.frozenmoth', tr('Moth in Ice'), 'charm.medium', 74,
    tr('A moth caught in a chip of ice that will not melt. Its wings still move, very slowly.'),
    [['coldDamage', 1], ['moveSpeed', 1], ['manaRegen', 0.8]],
    { look: D('crystal.ice', 'cloth.silk|0x2a5a8a', undefined, ['wings', 'frost'], 0.1, { aura: 'frost', glow: 0xa0d8ff }) }),

  U('uq.charm.gallowsnail', tr('Gallows Nail'), 'charm.medium', 84,
    tr('One of the nails from the old gallows on the hill. It has held up worse things than a rope.'),
    [['critDamage', 1], ['defense', 1], ['arcaneResist', 0.8]],
    { look: D('metal.rusted', 'cloth.rag|0x3a1a10', undefined, ['blood', 'cracks'], 0.8, { aura: 'smoke', glow: 0xa04040 }) }),

  // ===========================================================================
  // Large charms
  // ===========================================================================
  U('uq.charm.kennelcollar', tr('Kennel Collar'), 'charm.large', 20,
    tr('Too big for any dog you have ever seen. Old Rook says it was for a small one.'),
    [['strength', 1], ['magicFind', 1], ['poisonResist', 0.8]],
    { look: D('leather.studded|0x4a3424', 'leather.fine|0x7a2a10', 'metal.iron', ['spikes', 'rivets'], 0.7, { aura: 'ash', glow: 0xd0a060 }) }),

  U('uq.charm.prayerwheel', tr('Little Prayer Wheel'), 'charm.large', 38,
    tr('A wheel of prayers, small enough for a pocket. If you turn it, you hear the cloister clock tick.'),
    [['castSpeed', 1], ['damageReduction', 1], ['goldFind', 0.8]],
    { look: D('metal.brass', 'cloth.silk|0xd08a2a', undefined, ['runes', 'coils'], 0.4, { aura: 'motes', glow: 0xffe0a0 }) }),

  U('uq.charm.witchbottle', tr('Witch Bottle'), 'charm.large', 56,
    tr('Pins, hair, and something wet, all sealed in a green bottle. Maudry made it to keep something out. You hope it was not you.'),
    [['poisonDamage', 1], ['blockChance', 1], ['mana', 0.8], ['fireResist', 0.6]],
    { look: D('crystal.gem|0x4a7a3a', 'cloth.wool|0x2a4a1a', undefined, ['thorns', 'eyes'], 0.6, { aura: 'drips', glow: 0x8ad050 }) }),

  U('uq.charm.mapofnowhere', tr('Map of Nowhere'), 'charm.large', 80,
    tr('A map of the deep, drawn by someone who went all the way down. Every floor on it is the same floor.'),
    [['moveSpeed', 1], ['magicFind', 1], ['lifeSteal', 0.8], ['energy', 0.6]],
    { look: D('cloth.linen|0xd8c8a0', 'leather.fine|0x6a5a2a', 'metal.dark', ['runes', 'stars'], 0.6, { aura: 'wisp', glow: 0xc0b0ff }) }),

  U('uq.charm.ninthfloorkey', tr('Key to the Ninth Floor Down'), 'charm.large', 90,
    tr('Nobody remembers which ninth floor. The key remembers.'),
    [['skillLevels', 1, 1], ['coldResist', 1], ['attackRating', 1], ['manaRegen', 0.8]],
    { look: D('metal.blackiron', 'cloth.velvet|0x2a1a4a', 'metal.gold', ['chains', 'runes'], 0.3, { aura: 'souls', glow: 0xd0d8ff, glowStyle: 'spectral' }) }),

  // ===========================================================================
  // Grand charms
  // ===========================================================================
  U('uq.charm.rookstally', tr("Rook's Tally"), 'charm.grand', 32,
    tr('A stick with a notch for every dog Rook ever lost. It is a long stick.'),
    [['skillLevels', 1, 1], ['dexterity', 1], ['fireResist', 0.8], ['goldFind', 0.8]],
    { look: D('wood.oak', 'cloth.wool|0x1a1a2a', undefined, ['teeth', 'tatters'], 0.7, { aura: 'ash', glow: 0xffb060 }) }),

  U('uq.charm.unsentletter', tr('The Unsent Letter'), 'charm.grand', 46,
    tr('Sealed, stamped and never sent. You have not opened it. You know whose name is inside.'),
    [['skillLevels', 1, 1], ['manaRegen', 1], ['physicalResist', 0.8], ['critChance', 0.6]],
    { look: D('cloth.white|0xe8dcc0', 'cloth.silk|0xa04a6a', 'metal.bloodgold', ['runes'], 0.5, { aura: 'souls', glow: 0xf0d0c0 }) }),

  U('uq.charm.drownedbell', tr('The Drowned Bell'), 'charm.grand', 54,
    tr('It rang under the water for a hundred years before anyone thought to pull it up.'),
    [['skillLevels', 1, 1], ['lifeRegen', 1], ['lightningResist', 0.8], ['blockChance', 0.8]],
    { look: D('metal.verdigris', 'cloth.linen|0x2a6a5a', undefined, ['bells', 'barnacles'], 0.8, { aura: 'drips', glow: 0x60c8c0, glowStyle: 'pulse' }) }),

  U('uq.charm.firstcandle', tr('The First Candle'), 'charm.grand', 60,
    tr('The Tallow Shepherd lit it the night the flock first walked. It has been burning since and is no shorter.'),
    [['skillLevels', 1, 1], ['fireDamage', 1], ['coldResist', 1], ['magicFind', 0.6]],
    { look: D('bone.pale|0xf0e8d0', 'cloth.silk|0xe8c060', 'metal.brass', ['flames'], 0.3, { aura: 'embers', glow: 0xffa040, glowStyle: 'flame' }),
      from: 'tallow_shepherd' }),

  U('uq.charm.clockheart', tr('Clockheart'), 'charm.grand', 74,
    tr('The spring from the heart of the cloister clock. Wound once, and running still.'),
    [['skillLevels', 1, 1], ['attackSpeed', 1], ['castSpeed', 1], ['poisonResist', 0.8]],
    { look: D('metal.brass', 'leather.fine|0x3a5a6a', 'metal.copper', ['coils', 'runes'], 0.2, { aura: 'sparks', glow: 0xffd070 }),
      from: 'warden_cog' }),

  U('uq.charm.foundlingsmitten', tr("A Foundling's Mitten"), 'charm.grand', 80,
    tr('One small wool mitten, found on the lowest stair. Nobody has ever found the other.'),
    [['skillLevels', 1, 1], ['life', 1.2], ['moveSpeed', 0.8], ['arcaneResist', 0.8]],
    { look: D('cloth.wool|0xa03030', 'cloth.wool|0xc05a7a', undefined, ['tatters'], 0.6, { aura: 'soft', glow: 0xffd0c0 }) }),

  U('uq.charm.namewithout', tr('A Name Without a Face'), 'charm.grand', 92,
    tr('Written on a scrap of bone in a hand that is not quite a hand. You can read it. You must not say it.'),
    [['skillLevels', 1, 1], ['strength', 0.8], ['energy', 0.8], ['critDamage', 1], ['lifeSteal', 0.8], ['manaSteal', 0.8]],
    { look: D('bone.old|0x2a2028', 'cloth.silk|0x6a6a7a', 'metal.voidgold', ['runes', 'eyes'], 0.3, { aura: 'smoke', glow: 0x9a60ff, glowStyle: 'void' }),
      from: 'deeps_own_name' }),

  // ===========================================================================
  // Mythics
  // ===========================================================================
  U('my.lastlight', tr('The Last Light'), 'sword.sunblade', 86,
    tr('The sword of the knight who went down after the sun. It was found on the lowest floor, still lit, with nobody holding it.'),
    [['enhancedDamage', 1.2], ['fireDamage', 1.1], ['skillLevels', 2, 2], ['attackSpeed', 1], ['life', 0.8], ['fireResist', 0.8]],
    { hook: tr('Your hits light everything near the target.'), power: 'groundFire', rarity: 'mythic', chase: true, sockets: 2,
      look: D('metal.gold|0xffe8a0', 'leather.fine|0x6a1a10', 'metal.bloodgold', ['flames', 'halo', 'gilded'], 0, { aura: 'embers', glow: 0xffc050, glowStyle: 'flame', cut: { tip: 'flame', guard: 3, ridge: true } }),
      from: 'saint_ossery' }),

  U('my.unwrittenpage', tr('The Unwritten Page'), 'orb.void', 88,
    tr('The one page in the deep library with nothing on it. The Archivist Below has been trying to write on it for a thousand years.'),
    [['skillLevels', 2, 2], ['arcaneDamage', 1.2], ['energy', 1], ['mana', 1], ['castSpeed', 1], ['manaRegen', 0.8]],
    { hook: tr('Every spell lands a second time, a beat later.'), power: 'echo', mag: 1.1, rarity: 'mythic', chase: true,
      look: D('cloth.white|0xf0ece0', undefined, 'metal.voidgold', ['runes', 'ghost', 'stars'], 0, { aura: 'souls', glow: 0xd8d0ff, glowStyle: 'spectral' }),
      from: 'archivist_below' }),

  U('my.camebackwrong', tr('Came Back Wrong'), 'gloves.eclipse', 82,
    tr('Gloves made from a hand that climbed out of the pit by itself, with the rest of the climber nowhere to be seen. They fit you a little too well.'),
    [['dexterity', 1.2], ['critChance', 1], ['critDamage', 1.2], ['attackSpeed', 1], ['lifeSteal', 0.8], ['skillLevels', 1, 1]],
    { hook: tr('Your crits open wounds that keep bleeding.'), power: 'critBleed', mag: 1.5, rarity: 'mythic', chase: true,
      look: D('bone.pale|0xc8c0b0', 'leather.dark', 'metal.black', ['claws', 'cracks', 'ghost'], 0.2, { aura: 'souls', glow: 0xb0e0d0, glowStyle: 'spectral' }),
      from: 'came_up_instead' }),

  U('my.choirsthroat', tr("The Choir's Throat"), 'scepter.judgement', 86,
    tr('A brass scepter with an open mouth for a head, and the mouth is always singing. It sings in fire.'),
    [['skillLevels', 2, 2], ['fireDamage', 1.2], ['castSpeed', 1], ['energy', 1], ['fireResist', 1], ['life', 0.8]],
    { hook: tr('Your fire burns far hotter, and frost bites you deeper.'), power: 'emberBargain', mag: 1.6, rarity: 'mythic', chase: true,
      look: D('metal.brass|0xd8a040', undefined, 'metal.bloodgold', ['flames', 'teeth', 'runes'], 0.1, { aura: 'embers', glow: 0xff8030, glowStyle: 'flame' }),
      from: 'furnace_choir' }),

  U('my.corvidcrown', tr('The Corvid Crown'), 'helm.corona', 84,
    tr('A crown of black feathers, every one from a different crow. Corvus Hale has never been seen without one on his shoulder.'),
    [['skillLevels', 2, 2], ['dexterity', 1], ['critChance', 1], ['magicFind', 1.2], ['moveSpeed', 0.8], ['defense', 0.8]],
    { hook: tr('Your crits leave the target open to everything.'), power: 'critVulnerable', mag: 1.5, rarity: 'mythic', chase: true, sockets: 1,
      look: D('metal.black|0x14141a', 'cloth.velvet|0x1a1428', 'metal.silver', ['feathers', 'crowns', 'eyes'], 0, { aura: 'smoke', glow: 0x8a90ff, glowStyle: 'void' }),
      from: 'corvus_hale' }),

  U('my.gauntmantle', tr('The Gaunt Mantle'), 'chest.aeonshroud', 84,
    tr('The robe of a king who ruled by needing nothing. It is very thin. It is enough.'),
    [['life', 1.2], ['skillLevels', 1, 1], ['damageReduction', 1], ['physicalResist', 1], ['coldResist', 1], ['poisonResist', 1]],
    { hook: tr('You heal from every blow you land, and never on your own.'), power: 'leechHunger', mag: 1.6, rarity: 'mythic', chase: true, sockets: 2,
      look: D('cloth.tattered|0x2a2a30', 'cloth.silk|0x8a8aa0', 'metal.voidgold', ['bones', 'crowns', 'tatters'], 0.3, { aura: 'souls', glow: 0xc0d0ff, glowStyle: 'spectral' }),
      from: 'the_gaunt_king' }),

  U('my.thawingpoint', tr('The Thawing Point'), 'staff.worldtree', 88,
    tr('Grandmother Thaw keeps the winter in a staff. When she leans on it, the frost runs out across the floor.'),
    [['skillLevels', 2, 2], ['coldDamage', 1.2], ['energy', 1], ['castSpeed', 1], ['coldResist', 1], ['mana', 1]],
    { hook: tr('Frozen things shatter when they die and freeze everything near them.'), power: 'shatter', rarity: 'mythic', chase: true,
      look: D('wood.ash|0xd8e0e8', undefined, 'metal.silver', ['frost', 'crystals', 'leaves'], 0.1, { aura: 'frost', glow: 0xa0e0ff, glowStyle: 'frost' }),
      from: 'grandmother_thaw' }),

  U('my.gulletlock', tr('Gullet Lock'), 'shield.aeons', 86,
    tr('The lock that held Vorrowmaw\'s jaw shut, worked into a shield. It snaps shut on anything that hits it.'),
    [['blockChance', 1.2], ['defense', 1.2], ['life', 1], ['vitality', 1], ['damageReduction', 0.8], ['skillLevels', 1, 1]],
    { hook: tr('Blocking bites back hard and pays you in mana.'), power: 'blockReflect', mag: 2, rarity: 'mythic', chase: true,
      look: D('metal.blackiron', 'leather.dark', 'metal.bloodgold', ['chains', 'teeth', 'spikes'], 0.4, { aura: 'smoke', glow: 0xe04030, glowStyle: 'pulse' }),
      from: 'vorrowmaw' }),

  U('my.deepsowntongue', tr("The Deep's Own Tongue"), 'bow.hydra', 90,
    tr('A bow strung with something long and wet that is not a string. When you draw it, the deep says your name.'),
    [['skillLevels', 2, 2], ['enhancedDamage', 1.2], ['dexterity', 1.2], ['attackSpeed', 1], ['arcaneDamage', 1], ['critDamage', 1]],
    { hook: tr('Every arrow carries on into another, and another.'), power: 'pierce', mag: 1.6, rarity: 'mythic', chase: true,
      look: D('bone.old|0x2a1a2a', 'leather.dark|0x3a1028', 'metal.voidgold', ['eyes', 'serpents', 'ghost'], 0, { aura: 'smoke', glow: 0xc040ff, glowStyle: 'void' }),
      from: 'deeps_own_name' }),

  U('my.bottomstair', tr('The Bottom Stair'), 'boots.gale', 92,
    tr('Every stair has a last step. These boots are cut from the stone of the last one there is.'),
    [['moveSpeed', 1.3], ['life', 1], ['skillLevels', 1, 1], ['fireResist', 1], ['coldResist', 1], ['lightningResist', 1], ['poisonResist', 1]],
    { hook: tr('Once in a long while, death passes you by.'), power: 'cheatDeath', mag: 0.8, rarity: 'mythic', chase: true,
      look: D('stone.granite|0x3a3a44', 'leather.dark', 'metal.mithril', ['runes', 'stars', 'cracks'], 0.2, { aura: 'motes', glow: 0xfff0c0, glowStyle: 'shimmer' }),
      from: 'deeps_own_name' }),
];
