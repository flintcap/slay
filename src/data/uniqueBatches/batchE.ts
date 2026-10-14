/**
 * SLAY — depth uniques, batch E: belts, boots, legs, rings and amulets.
 *
 * Sixty-one pieces. Fourteen bend a skill: the Knight's Battle Cry, the
 * Paladin's Consecrated Ground and Mercy Stroke, the Rogue's Noxious Cloud,
 * Void Walk and Assassinate, the Ranger's The Whole Floor Is A Trap, the
 * Mage's Frost Nova and Ice Lance, the Revenant's Amplify Damage and
 * Skeletal Mage, and the Shapeshifter's Worry, Rattling Roar and Bear Hug.
 * Most of the floor wardens and the bosses with few drops of their own get
 * one or two here.
 */
import type { UniqueDef } from '../uniques';
import { D, U } from './kit';

export const BATCH_E: UniqueDef[] = [
  // ===========================================================================
  // Belts
  // ===========================================================================
  U('uq.ratcatcherscord', "Ratcatcher's Cord", 'belt.sash', 3,
    'A length of rope with six knots in it, one for each rat Pell swore he would catch that night. He caught more.',
    [['dexterity', 1], ['life', 0.7], ['poisonResist', 0.8]],
    { hook: 'Beasts fall faster to you.', power: 'slayer.beast', mag: 0.8,
      look: D('cloth.homespun|0x6a5a40', undefined, 'metal.iron', ['tatters'], 0.85, { finish: 'matte' }),
      from: 'pell_dunmarrow' }),

  U('uq.vaultkeepersgirth', "Vaultkeeper's Girth", 'belt.belt', 12,
    'Calix hung every key to the vault on this belt. The keys are gone. The weight is not.',
    [['defense', 1], ['vitality', 1], ['goldFind', 0.8]],
    { hook: 'Nothing knocks you off your feet, and you stand like a wall.', power: 'anchor', mag: 0.8,
      look: D('leather.dark', undefined, 'metal.brass', ['rivets', 'chains'], 0.5, {}),
      from: 'warden_calix' }),

  U('uq.inkpotbelt', 'The Inkpot Belt', 'belt.light', 18,
    'Six little pots of ink ride on it, all of them stoppered, one of them still warm.',
    [['energy', 1], ['mana', 1], ['castSpeed', 0.6]],
    { hook: 'Some of the harm done to you is paid in ink and mana.', power: 'inkskin', mag: 0.8,
      look: D('leather.fine|0x1a1a24', undefined, 'metal.silver', ['runes', 'eyes'], 0.35, {}),
      from: 'warden_hesper' }),

  U('uq.gravelinesash', 'Graveline Sash', 'belt.light', 19,
    'Cassia measured each grave with it before she dug. It is exactly the length of a tall man.',
    [['vitality', 1], ['life', 1], ['physicalResist', 0.6]],
    { hook: 'Each kill puts a little life back.', power: 'killLife', mag: 0.8,
      look: D('cloth.undyed|0x4a4034', undefined, 'bone.old', ['bones', 'tatters'], 0.75, {}),
      from: 'warden_cassia' }),

  U('uq.foglinecinch', 'Fogline Cinch', 'belt.girdle', 25,
    'A belt of oiled rags, stuffed with dried bog herbs. Wear it upwind of your friends.',
    [['poisonDamage', 1], ['dexterity', 0.8], ['poisonResist', 0.8]],
    { classId: 'shadowblade', bend: { skill: 'noxiousCloud', more: 20, grow: { radius: 30, duration: 25 }, add: { poisonStacks: 1 } },
      look: D('cloth.rags|0x4a5a34', 'leather.worn', 'metal.verdigris', ['smoke', 'tatters'], 0.7, {}) }),

  U('uq.tallowgirdle', 'Tallow Girdle', 'belt.girdle', 21,
    'Thick, soft and pale, and it smells of the candle shop. The Shepherd\'s flock wore their wicks through it.',
    [['life', 1.2], ['fireResist', 1], ['lifeRegen', 0.6]],
    { hook: 'You heal slowly and always, but your hands are slower for it.', power: 'slowBlood', mag: 0.8,
      look: D('leather.fine|0xe8dcc0', undefined, 'metal.brass', ['flames', 'gilded'], 0.4, { finish: 'satin' }),
      from: 'tallow_shepherd' }),

  U('uq.hedgewitchknot', "Hedge-Witch's Knot", 'belt.war', 34,
    'Maudry wove it from bramble and her own grey hair. It is still growing.',
    [['vitality', 1], ['life', 0.9], ['poisonResist', 1], ['lifeRegen', 0.7]],
    { hook: 'Things that strike you bleed for it.', power: 'thorns', mag: 1,
      look: D('wood.bark|0x4a3a28', 'cloth.tattered|0x8a8a7a', undefined, ['thorns', 'vines', 'leaves'], 0.7, {}),
      from: 'warden_maudry' }),

  U('uq.trapperslastbelt', "The Trapper's Last Belt", 'belt.war', 40,
    'Every pouch on it holds a different trap, and every trap has a name. The trapper is buried with the one that got him.',
    [['dexterity', 1], ['attackRating', 0.8], ['life', 0.7]],
    { classId: 'ranger', bend: { skill: 'theWholeFloor', more: 20, add: { count: 3 }, grow: { duration: 25 }, names: { count: 'traps' } },
      look: D('leather.studded|0x5a4030', undefined, 'metal.iron', ['spikes', 'chains'], 0.6, {}) }),

  U('uq.mooringline', 'Mooring Line', 'belt.vampirefang', 48,
    'Hollis tied his ferry up with this every night for a hundred years. The rope is wet and will not dry.',
    [['life', 1], ['coldResist', 1], ['lightningResist', 0.8], ['manaRegen', 0.7]],
    { hook: 'The deep pays some of your hurts in mana.', power: 'manaShield', mag: 0.5,
      look: D('cloth.rags|0x3a4a4a', undefined, 'metal.verdigris', ['barnacles', 'chains'], 0.8, {}),
      from: 'warden_hollis' }),

  U('uq.huggerscinch', "The Hugger's Cinch", 'belt.troll', 58,
    'A belt cut from the hide of a bear that was itself famous for not letting go.',
    [['strength', 1], ['life', 1.2], ['damageReduction', 0.7]],
    { classId: 'shapeshifter', bend: { skill: 'bearHug', more: 25, add: { squeezes: 2 }, grow: { heal: 50 }, names: { heal: 'healing' } },
      look: D('leather.hide|0x4a3424', undefined, 'bone.old', ['claws', 'teeth'], 0.7, {}) }),

  U('uq.gulletchain', 'Gullet Chain', 'belt.colossus', 72,
    'One link of the chain that held Vorrowmaw. It was the link that broke.',
    [['strength', 1], ['vitality', 1], ['life', 1], ['defense', 0.7]],
    { hook: 'You heal from what you strike, but never on your own.', power: 'leechHunger', mag: 1,
      look: D('metal.blackiron', undefined, 'metal.rusted', ['chains', 'teeth'], 0.75, { finish: 'blackened', glow: 0xd04030 }),
      from: 'vorrowmaw' }),

  U('uq.worldsgirth', "The World's Girth", 'belt.worldheart', 86,
    'A plain belt of stone links. Each link was cut from a different floor of the deep, top to bottom.',
    [['vitality', 1.2], ['life', 1.2], ['physicalResist', 0.8], ['fireResist', 0.6], ['coldResist', 0.6]],
    { hook: 'More life than anyone should have, and a slower step.', power: 'heavyTread', mag: 1.2,
      look: D('stone.granite|0x6a6a70', undefined, 'metal.mithril', ['runes', 'cracks'], 0.4, { glow: 0xffc070, stone: 0xffc070 }) }),

  // ===========================================================================
  // Boots
  // ===========================================================================
  U('uq.lampthiefstreads', "Lamp-Thief's Treads", 'boots.slippers', 4,
    'Felt soles, soft as a cat. Mott stole the lamp off the shrine in these and nobody heard.',
    [['moveSpeed', 1], ['dexterity', 1], ['magicFind', 0.6]],
    { hook: 'Quick on your feet, quick with your hands, and thin of skin.', power: 'featherweight', mag: 0.6,
      look: D('cloth.wool|0x2a2a30', 'leather.worn', undefined, ['tatters'], 0.6, { finish: 'matte' }),
      from: 'warden_mott' }),

  U('uq.debtorswalk', "The Debtor's Walk", 'boots.boots', 7,
    'Brannoch took these off a man who owed him. The man walked home barefoot, which was the point.',
    [['goldFind', 1.2], ['moveSpeed', 0.8], ['vitality', 0.7]],
    { hook: 'Coin you pick up puts life back in you.', power: 'goldToLife', mag: 0.8,
      look: D('leather.worn|0x5a3a24', undefined, 'metal.brass', ['coins', 'rivets'], 0.7, {}),
      from: 'warden_brannoch' }),

  U('uq.kennelboots', 'Kennel Boots', 'boots.greaves', 15,
    'Old Rook\'s boots. The dogs know the sound of them and come running, or run away.',
    [['defense', 1], ['life', 0.8], ['moveSpeed', 0.6]],
    { classId: 'shapeshifter', bend: { skill: 'worry', more: 25, add: { shakes: 2 }, grow: { knockback: 30 } },
      look: D('leather.hide|0x4a3a2a', undefined, 'metal.iron', ['teeth', 'rivets'], 0.8, {}),
      from: 'warden_rook' }),

  U('uq.ropewalkers', 'Ropewalkers', 'boots.heavy', 20,
    'Tamsin danced on a wire over the pit for nine years. She wore through a hundred pairs and kept the last.',
    [['dexterity', 1.2], ['moveSpeed', 1], ['attackSpeed', 0.6]],
    { hook: 'You hit faster the longer you keep hitting.', power: 'momentum', mag: 0.8,
      look: D('leather.fine|0x8a2a2a', 'cloth.silk|0xd8c080', 'metal.gold', ['tatters', 'bells'], 0.3, { finish: 'lacquer' }),
      from: 'warden_tamsin' }),

  U('uq.cindersole', 'Cindersole', 'boots.heavy', 23,
    'Brother Ash walks the cloister with his censer, and his boots leave a grey line behind him that does not wash out.',
    [['fireDamage', 1], ['fireResist', 1], ['life', 0.6]],
    { hook: 'Your footprints burn.', power: 'emberPrints', mag: 0.9,
      look: D('leather.dark|0x2a2420', undefined, 'metal.dark', ['smoke', 'cracks'], 0.6, { finish: 'blackened' }),
      from: 'warden_brother_ash' }),

  U('uq.hallowedtread', 'The Hallowed Tread', 'boots.scarabshell', 33,
    'Plain grey boots, worn by the sisters who walked the bounds of the churchyard every dusk to keep the dead in it.',
    [['vitality', 1], ['defense', 0.8], ['lightningResist', 0.8]],
    { classId: 'paladin', bend: { skill: 'consecratedGround', more: 25, grow: { radius: 30, slow: 25, drag: 40 } },
      look: D('metal.silver|0xb0b0a8', 'cloth.white', 'metal.gold', ['laurels', 'runes'], 0.3, {}) }),

  U('uq.frostfletcherstrail', "Frost-Fletcher's Trail", 'boots.scarabshell', 30,
    'Orrin Vael walked out on the frozen lake to fletch his arrows where the wind was still. These are the boots he walked back in.',
    [['dexterity', 1], ['coldResist', 1.2], ['moveSpeed', 0.7]],
    { hook: 'You cannot be chilled or frozen.', power: 'freezeImmune',
      look: D('leather.fine|0xd0d8e0', undefined, 'metal.silver', ['frost', 'feathers'], 0.3, {}),
      from: 'warden_orrin_vael' }),

  U('uq.doorstep', 'Doorstep', 'boots.war', 45,
    'Vey of the Many Doors stood in a doorway in these boots, and nothing came through that doorway again.',
    [['defense', 1], ['vitality', 1], ['blockChance', 0.7], ['life', 0.6]],
    { hook: 'Nothing moves you.', power: 'anchor', mag: 1.1,
      look: D('metal.iron|0x5a5a5e', undefined, 'metal.brass', ['rivets', 'chains'], 0.6, {}),
      from: 'warden_vey' }),

  U('uq.unseenstep', 'Unseen Step', 'boots.sharkskin', 50,
    'You do not walk in them so much as leave a space where you were.',
    [['dexterity', 1], ['moveSpeed', 1], ['critChance', 0.6]],
    { classId: 'shadowblade', bend: { skill: 'voidWalk', more: 20, add: { hops: 2 }, grow: { window: 40, range: 25 } },
      look: D('leather.dark|0x101018', undefined, 'metal.voidgold', ['moons', 'smoke'], 0.2, {}) }),

  U('uq.magmawalkers', 'Magmawalkers', 'boots.wyrmhide', 56,
    'Ixthar\'s servants wore these to cross the floor of its hall. The ones who did not are still there.',
    [['fireResist', 1.2], ['fireDamage', 1], ['moveSpeed', 0.8], ['life', 0.6]],
    { hook: 'You leave a trail of fire, and the fire leaves little else.', power: 'moltenTrail',
      look: D('stone.obsidian|0x2a1a14', undefined, 'metal.bloodgold', ['cracks', 'flames'], 0.5, { glow: 0xff6020 }),
      from: 'magma_sovereign' }),

  U('uq.galestride', 'Galestride', 'boots.gale', 82,
    'Woven of something like cloud. You can see your feet through them if you look, which you should not.',
    [['moveSpeed', 1.3], ['dexterity', 1], ['attackSpeed', 0.8], ['lightningResist', 0.8]],
    { hook: 'Faster at everything, and lighter than you should be.', power: 'fanaticism', mag: 0.8,
      look: D('cloth.silk|0xd8e8f8', undefined, 'metal.silver', ['feathers', 'wings'], 0.1, { glow: 0xb0d8ff, stone: 0xb0d8ff }) }),

  // ===========================================================================
  // Legs
  // ===========================================================================
  U('uq.squiresbreeches', "Squire's Breeches", 'pants.chausses', 12,
    'Ysolde wore these to every duel. They have been mended at the knee eleven times, once for each fall.',
    [['strength', 1], ['dexterity', 0.8], ['attackRating', 0.8]],
    { hook: 'Your crits make the next blow land harder.', power: 'critStagger', mag: 0.8,
      look: D('cloth.banner|0x2a3a6a', 'leather.fine', 'metal.steel', ['rivets'], 0.5, {}),
      from: 'warden_ysolde' }),

  U('uq.boilermansleggings', "Boilerman's Leggings", 'pants.studded', 22,
    'Thick padded wool sewn with iron studs. The men who tended Kettle wore them, and a few of them lived.',
    [['defense', 1], ['fireResist', 1], ['coldResist', 0.8]],
    { hook: 'More life. Your spells come slower.', power: 'hardHead', mag: 0.9,
      look: D('cloth.wool|0x4a3a2a', undefined, 'metal.iron', ['rivets', 'smoke'], 0.7, {}),
      from: 'kettle' }),

  U('uq.glassmothsilks', "Glass Moth's Silks", 'pants.mystic', 30,
    'Selk\'s silks catch the light like a moth\'s wing. Under a lamp they are nearly gone.',
    [['energy', 1], ['castSpeed', 0.8], ['arcaneResist', 1]],
    { hook: 'Spells and arrows find less of you, and there is less of you to find.', power: 'thinAir', mag: 0.9,
      look: D('cloth.silk|0xd0e0f0', undefined, 'metal.silver', ['wings', 'crystals'], 0.15, { finish: 'pearl' }),
      from: 'warden_selk' }),

  U('uq.ashmongersapron', "The Ashmonger's Apron", 'pants.cuisses', 36,
    'Teodric sold ash by the bucket. He sold it from the houses he burned, and he wore this when he did.',
    [['fireDamage', 1.1], ['strength', 0.8], ['fireResist', 0.8]],
    { hook: 'Fire burns hotter on you. Frost bites deeper.', power: 'emberBargain', mag: 1,
      look: D('leather.dark|0x3a2a20', 'cloth.rags|0x5a4a40', 'metal.dark', ['smoke', 'cracks'], 0.8, { finish: 'weathered' }),
      from: 'teodric_ashmonger' }),

  U('uq.ferrymanswaders', "Ferryman's Waders", 'pants.drakeskin', 50,
    'Leather that has been in the black water longer than you have been alive. It is full of it still.',
    [['life', 1], ['coldResist', 1], ['poisonResist', 0.8], ['vitality', 0.7]],
    { hook: 'You heal from every hit you land, but never on your own.', power: 'leechHunger', mag: 0.7,
      look: D('leather.hide|0x2a3430', undefined, 'metal.verdigris', ['barnacles', 'scales'], 0.85, {}),
      from: 'warden_hollis' }),

  // ===========================================================================
  // Rings
  // ===========================================================================
  U('uq.ratbitering', 'Ratbite Ring', 'ring.ring', 6,
    'A copper ring with two little dents in it, the marks of the rat that tried to take it from Pell\'s finger.',
    [['dexterity', 0.8], ['poisonResist', 1], ['life', 0.6]],
    { hook: 'Each kill puts a little life back.', power: 'killLife', mag: 0.6,
      look: D('metal.copper', undefined, undefined, ['teeth'], 0.6, {}),
      from: 'pell_dunmarrow' }),

  U('uq.vaultseal', 'The Vault Seal', 'ring.ring', 8,
    'The ring that sealed the vault door. Calix wore it for so long that his finger grew round it.',
    [['vitality', 1], ['defense', 0.8], ['magicFind', 0.8]],
    { hook: 'More gold and better finds, and a weaker arm.', power: 'miserPact', mag: 0.5,
      look: D('metal.brass', undefined, 'metal.iron', ['runes'], 0.5, { stone: 0x8a6a3a }),
      from: 'warden_calix' }),

  U('uq.mercysband', "Mercy's Band", 'ring.signet', 21,
    'Given to the sisters who sat with the dying. The seal on it is a closed eye.',
    [['strength', 1], ['life', 0.7], ['lifeRegen', 0.7]],
    { classId: 'paladin', bend: { skill: 'mercyStroke', more: 30, grow: { threshold: 25, reach: 20 } },
      look: D('metal.silver', undefined, 'metal.gold', ['halo'], 0.3, { stone: 0xf0e8d0 }) }),

  U('uq.mudsignet', 'Mud Signet', 'ring.signet', 20,
    'A ring the Sovereign Mass gave back. It gave back nothing else it took.',
    [['life', 1], ['poisonResist', 1], ['lifeRegen', 0.8]],
    { hook: 'You heal slowly and always, but your hands are slower for it.', power: 'slowBlood', mag: 0.6,
      look: D('metal.bronze|0x5a6a3a', undefined, undefined, ['cracks'], 0.8, { stone: 0x6a8a3a }),
      from: 'ooze_sovereign' }),

  U('uq.inkwellring', 'Inkwell Ring', 'ring.signet', 24,
    'A ring with a hollow stone. There is a drop of black ink in it that moves when you are not looking.',
    [['energy', 1], ['manaRegen', 1], ['mana', 0.6]],
    { hook: 'Your mana comes back fast, but there is less of it.', power: 'quietMind', mag: 0.8,
      look: D('metal.dark', undefined, 'metal.silver', ['eyes'], 0.3, { stone: 0x1a1a2a }),
      from: 'warden_hesper' }),

  U('uq.wickring', 'Wick Ring', 'ring.signet', 26,
    'Melted down from a candlestick. The Shepherd\'s flock each wore one, so they would know each other in the dark.',
    [['fireResist', 1], ['fireDamage', 0.8], ['life', 0.6]],
    { hook: 'Your fire burns hotter.', power: 'emberHeart', mag: 0.8,
      look: D('metal.brass|0xd8c080', undefined, undefined, ['flames'], 0.4, { stone: 0xffa040 }),
      from: 'tallow_shepherd' }),

  U('uq.cuttersring', "The Cutter's Ring", 'ring.band', 40,
    'A thin black band. It was made for one job, and it does that job once.',
    [['dexterity', 1], ['critDamage', 1], ['critChance', 0.6]],
    { classId: 'shadowblade', bend: { skill: 'assassinate', more: 30, grow: { threshold: 30 } },
      look: D('metal.black', undefined, 'metal.silver', ['moons'], 0.15, { stone: 0x5a1010 }) }),

  U('uq.wintersprong', "Winter's Prong", 'ring.band', 42,
    'A ring with a spike of ice set in it where a stone should be. It has not melted in all the years since it was made.',
    [['coldDamage', 1], ['energy', 1], ['castSpeed', 0.6]],
    { classId: 'mage', bend: { skill: 'frostNova', more: 25, grow: { radius: 30, duration: 40 } },
      look: D('metal.silver|0xd0e0f0', undefined, undefined, ['frost', 'crystals'], 0.2, { stone: 0x9ad0ff }) }),

  U('uq.devourersknuckle', "The Devourer's Knuckle", 'ring.band', 44,
    'A ring made from one of Ghaal\'s teeth, ground hollow. The tooth is still sharp on the inside.',
    [['strength', 1], ['lifeSteal', 1], ['life', 0.6]],
    { hook: 'Your blows drain the life from what they strike.', power: 'lifeTap', mag: 1,
      look: D('bone.old|0xd8c8a0', undefined, 'metal.bloodgold', ['teeth'], 0.6, {}),
      from: 'first_devourer' }),

  U('uq.lockring', 'The Lock-Ring', 'ring.circle', 58,
    'Vey wore a ring for every door that held. This was the ring of the first.',
    [['vitality', 1], ['blockChance', 0.8], ['damageReduction', 0.8], ['life', 0.6]],
    { hook: 'Blocking returns the blow and pays you in mana.', power: 'blockReflect', mag: 1,
      look: D('metal.iron', undefined, 'metal.gold', ['chains', 'runes'], 0.4, { stone: 0xd8a040 }),
      from: 'warden_vey' }),

  U('uq.bonechoirring', 'Bonechoir Ring', 'ring.circle', 60,
    'A ring of finger bones, small ones, strung on silver wire. They hum when your dead are near.',
    [['energy', 1], ['mana', 0.8], ['poisonResist', 0.8]],
    { classId: 'revenant', bend: { skill: 'skeletalMage', more: 20, add: { baseCap: 2 }, grow: { lifePct: 30, range: 25 } },
      look: D('bone.bleached', undefined, 'metal.silver', ['bones', 'skulls'], 0.5, { stone: 0x60e090 }) }),

  U('uq.cogwheel', 'Cogwheel', 'ring.circle', 62,
    'A brass cog from the great clock in the cloister. It turns on your finger, one tooth an hour.',
    [['attackSpeed', 1], ['castSpeed', 0.8], ['cooldownReduction', 0.8]],
    { hook: 'Your skills come back sooner, and your mana slower.', power: 'shortFuse', mag: 1,
      look: D('metal.brass', undefined, 'metal.copper', ['coils', 'runes'], 0.3, { stone: 0xffd870 }),
      from: 'warden_cog' }),

  U('uq.heraldssilence', "The Herald's Silence", 'ring.halo', 76,
    'A black band set with nothing at all. There is a hole where the stone should be, and the hole goes further than the ring.',
    [['arcaneDamage', 1.1], ['energy', 1], ['arcaneResist', 1], ['skillLevels', 1, 1]],
    { hook: 'Your cooldowns come back faster.', power: 'voidCooldown', mag: 1.2,
      look: D('metal.voidgold|0x1a1028', undefined, undefined, ['moons', 'stars'], 0.1, { glow: 0x9a60ff, stone: 0x9a60ff }),
      from: 'void_herald_shessi' }),

  U('uq.eternalround', 'The Eternal Round', 'ring.eternity', 89,
    'A ring with no join in it, no maker\'s mark and no beginning. It fits every finger.',
    [['strength', 0.8], ['dexterity', 0.8], ['vitality', 0.8], ['energy', 0.8], ['life', 1], ['mana', 1]],
    { hook: 'Each kill fills your mana back up.', power: 'killMana', mag: 1.4,
      look: D('metal.gold|0xf0e0b0', undefined, 'metal.mithril', ['gilded', 'stars'], 0.05, { glow: 0xffe8a0, stone: 0xffe8a0 }) }),

  // ===========================================================================
  // Amulets
  // ===========================================================================
  U('uq.lampwick', 'Lampwick', 'amulet.amulet', 5,
    'The wick from the shrine lamp Mott stole, knotted on a thong. It still lights if you blow on it.',
    [['magicFind', 1], ['fireResist', 0.8], ['mana', 0.6]],
    { hook: 'More gold and better finds, and a weaker arm.', power: 'miserPact', mag: 0.4,
      look: D('cloth.homespun|0xd8c8a0', 'leather.worn', 'metal.brass', ['flames'], 0.6, { stone: 0xffb040 }),
      from: 'warden_mott' }),

  U('uq.iouamulet', 'The IOU', 'amulet.amulet', 9,
    'A copper disc stamped with a number. It is how much you owe Brannoch, and the number goes up.',
    [['goldFind', 1.4], ['life', 0.7], ['strength', 0.6]],
    { hook: 'Each kill puts a little life back.', power: 'killLife', mag: 0.7,
      look: D('metal.copper', 'leather.worn', undefined, ['coins'], 0.6, {}),
      from: 'warden_brannoch' }),

  U('uq.boilerplate', 'Boilerplate', 'amulet.amulet', 10,
    'A rivet head as big as a coin, taken from Kettle\'s chest. It is warm, and always will be.',
    [['vitality', 1], ['fireResist', 1], ['defense', 0.6]],
    { hook: 'Frost cannot hold you. Fire finds you easier.', power: 'warmBlood', mag: 0.7,
      look: D('metal.iron|0x6a5a4a', 'metal.chain', 'metal.copper', ['rivets', 'smoke'], 0.7, { stone: 0xff7030 }),
      from: 'kettle' }),

  U('uq.oozestone', 'Oozestone', 'amulet.amulet', 14,
    'A lump of green glass that the Mass left behind. If you hold it to your ear it gurgles.',
    [['poisonResist', 1.2], ['poisonDamage', 1], ['life', 0.6]],
    { hook: 'Poison hurts you less.', power: 'poisonOvercap',
      look: D('crystal.gem|0x6aa040', 'cloth.linen', 'metal.verdigris', ['crystals'], 0.5, { stone: 0x6aa040 }),
      from: 'ooze_sovereign' }),

  U('uq.thegaze', 'The Gaze', 'amulet.amulet', 16,
    'One of Uln\'s thousand eyes, set in silver. It looks where you look, and somewhere else besides.',
    [['critChance', 1], ['attackRating', 0.8], ['magicFind', 0.8]],
    { hook: 'Your crits leave the target open.', power: 'critVulnerable', mag: 0.8,
      look: D('metal.silver', 'leather.dark', undefined, ['eyes'], 0.4, { stone: 0xd0c040 }),
      from: 'gaze_of_uln' }),

  U('uq.houndwhistle', 'Houndwhistle', 'amulet.amulet', 13,
    'A bone whistle on a cord. Rook used it to call the dogs in. Some of them still come.',
    [['dexterity', 1], ['life', 0.8], ['attackSpeed', 0.6]],
    { hook: 'Beasts fall faster to you.', power: 'slayer.beast', mag: 1,
      look: D('bone.old', 'leather.hide', undefined, ['teeth'], 0.6, {}),
      from: 'warden_rook' }),

  U('uq.gravedirtlocket', 'Gravedirt Locket', 'amulet.amulet', 17,
    'A locket with earth in it instead of a portrait. Cassia kept a pinch from every grave she ever filled.',
    [['vitality', 1], ['poisonResist', 0.8], ['life', 0.8]],
    { hook: 'More damage to the dead.', power: 'slayer.undead', mag: 1,
      look: D('metal.dark', 'cloth.undyed', 'metal.silver', ['skulls'], 0.6, { stone: 0x5a4a30 }),
      from: 'warden_cassia' }),

  U('uq.wingscale', 'Wingscale', 'amulet.talisman', 26,
    'One scale from the wing of the Glass Moth, as clear as a window and as thin as breath.',
    [['energy', 1], ['castSpeed', 0.8], ['lightningResist', 0.8]],
    { hook: 'Your spells come faster. Your arm comes slower.', power: 'coldHands', mag: 0.9,
      look: D('crystal.ice|0xe0f0ff', 'cloth.silk', 'metal.silver', ['wings', 'crystals'], 0.1, { stone: 0xe0f0ff }),
      from: 'warden_selk' }),

  U('uq.highwire', 'Highwire', 'amulet.talisman', 28,
    'A loop of the wire Tamsin danced on, wound tight. It hums when you move fast.',
    [['dexterity', 1], ['moveSpeed', 0.8], ['critChance', 0.7]],
    { hook: 'When a blow brings you low, you are already somewhere else.', power: 'panicBlink',
      look: D('metal.steel', undefined, 'metal.gold', ['coils', 'bells'], 0.3, { stone: 0xd04040 }),
      from: 'warden_tamsin' }),

  U('uq.censerchain', 'Censer Chain', 'amulet.talisman', 30,
    'A chain from Brother Ash\'s censer, with a lump of resin still stuck in the last link.',
    [['fireDamage', 1], ['energy', 0.8], ['mana', 0.8]],
    { hook: 'Your burns leap to whatever stands near.', power: 'fireSpread',
      look: D('metal.chain|0x5a5040', undefined, 'metal.brass', ['smoke', 'chains'], 0.6, { stone: 0xe08030 }),
      from: 'warden_brother_ash' }),

  U('uq.warcrier', 'The War-Crier', 'amulet.talisman', 32,
    'A brass horn the size of a thumb. The man who wore it was the one who shouted first and loudest, and the rest followed.',
    [['strength', 1], ['life', 0.8], ['attackRating', 0.8]],
    { classId: 'warden', bend: { skill: 'battleCry', more: 20, grow: { radius: 30, duration: 30, damagePct: 30 }, names: { damagePct: 'war cry damage' } },
      look: D('metal.brass', 'leather.fine', 'metal.iron', ['horns'], 0.5, { stone: 0xd08030 }) }),

  U('uq.cronestooth', "Crone's Tooth", 'amulet.talisman', 29,
    'Maudry gave it to you. You did not ask where she got it, and you do not want to know.',
    [['poisonDamage', 1], ['energy', 0.8], ['poisonResist', 0.8]],
    { hook: 'Your poisons and burns stack far higher.', power: 'poisonStacks', mag: 0.6,
      look: D('bone.rotted', 'cloth.tattered', undefined, ['teeth', 'thorns'], 0.75, {}),
      from: 'warden_maudry' }),

  U('uq.fletchersicicle', "Fletcher's Icicle", 'amulet.talisman', 32,
    'Orrin Vael tied an icicle to a cord and wore it through the summer, to see if it would melt. It did not.',
    [['coldDamage', 1], ['dexterity', 0.8], ['coldResist', 0.8]],
    { hook: 'Your cold bites deeper.', power: 'coldPierce', mag: 0.8,
      look: D('crystal.ice', 'cloth.white', 'metal.silver', ['frost'], 0.1, { stone: 0x9ad0ff }),
      from: 'warden_orrin_vael' }),

  U('uq.lancersshard', "Lancer's Shard", 'amulet.reliquary', 46,
    'A splinter of the ice that came down off the mountain in the long winter. It points north no matter how you hang it.',
    [['coldDamage', 1.1], ['energy', 1], ['castSpeed', 0.6]],
    { classId: 'mage', bend: { skill: 'iceLance', more: 25, grow: { length: 30, width: 40, duration: 30 } },
      look: D('crystal.frost', 'metal.chain', 'metal.silver', ['frost', 'crystals'], 0.15, { stone: 0x80c0ff }) }),

  U('uq.mawrelic', 'Maw Relic', 'amulet.reliquary', 40,
    'A sealed reliquary of black iron. Something inside it chews. It has been chewing for a long time.',
    [['life', 1], ['strength', 1], ['lifeSteal', 0.8]],
    { hook: 'Each kill puts life back.', power: 'killLife', mag: 1.2,
      look: D('metal.blackiron', 'metal.chain', 'metal.bloodgold', ['teeth', 'runes'], 0.6, { stone: 0xa02020 }),
      from: 'first_devourer' }),

  U('uq.cursesreliquary', "The Curser's Reliquary", 'amulet.reliquary', 52,
    'A bone box on a chain. The name written on the lid has been scratched out so many times there is a hole.',
    [['energy', 1], ['mana', 0.8], ['arcaneResist', 0.8]],
    { classId: 'revenant', bend: { skill: 'amplifyDamage', more: 20, grow: { radius: 30, duration: 30, amplify: 30 } },
      look: D('bone.pale', 'metal.chain', 'metal.dark', ['skulls', 'runes'], 0.5, { stone: 0x8a40c0 }) }),

  U('uq.roarstone', 'Roarstone', 'amulet.sigil', 66,
    'A river stone worn smooth, with a single tooth mark in it. Something bit down on it and roared.',
    [['strength', 1], ['life', 1], ['vitality', 0.8]],
    { classId: 'shapeshifter', bend: { skill: 'rattlingRoar', more: 20, grow: { radius: 30, duration: 30, weaken: 40 } },
      look: D('stone.cavern|0x6a6050', 'leather.hide', undefined, ['teeth', 'claws'], 0.6, {}) }),

  U('uq.gulletcharm', 'The Swallowed Key', 'amulet.sigil', 70,
    'Vorrowmaw swallowed the key to its own chain. This is it, and it was not easy to get.',
    [['life', 1], ['strength', 0.8], ['damageReduction', 0.8], ['skillLevels', 1, 1]],
    { hook: 'Nothing knocks you off your feet, and you stand like a wall.', power: 'anchor', mag: 1.2,
      look: D('metal.rusted|0x6a4a30', 'metal.chain', 'metal.bloodgold', ['chains', 'teeth'], 0.7, { glow: 0xd04030, stone: 0xd04030 }) }),

  U('uq.heartofthefloor', 'Heart of the Floor', 'amulet.heartstone', 87,
    'A red stone the size of a fist that beats. They found it under the lowest floor anyone has ever reached.',
    [['life', 1.3], ['vitality', 1], ['skillLevels', 1, 1], ['fireResist', 0.7], ['coldResist', 0.7], ['lightningResist', 0.7]],
    { hook: 'You heal steadily, in a fight or out of it.', power: 'combatRegen', mag: 1.3,
      look: D('crystal.gem|0xc01020', 'metal.chain', 'metal.bloodgold', ['runes', 'gilded'], 0.1, { glow: 0xff3040, stone: 0xff3040 }) }),
];
