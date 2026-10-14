/**
 * SLAY — depth uniques, batch A: swords, axes, maces, daggers and spears.
 *
 * Fifty-six pieces. Eight bend one skill for one class (the Knight's Cleave,
 * Whirlwind and Shield Bash, the Paladin's Litany and Knell, the Rogue's
 * Shadow Step, Fan of Knives and Death Lotus). The rest carry a power, a
 * trade or a stat mix no rare rolls.
 */
import type { UniqueDef } from '../uniques';
import { D, U } from './kit';

export const BATCH_A: UniqueDef[] = [
  // ===========================================================================
  // Swords
  // ===========================================================================
  U('uq.tinkersnip', "Tinker's Snip", 'sword.short', 3,
    "A tinker's offcut ground to a point. He sold pots on the second tier until there was nobody left to sell them to.",
    [['minDamage', 1], ['maxDamage', 1], ['attackSpeed', 1.2], ['goldFind', 1.1]],
    { hook: 'Quick in the hand, and it pays for itself.',
      look: D('metal.iron', 'leather.worn|0x5a4a3a', 'metal.copper', ['rivets', 'coins'], 0.6, { cut: { tip: 'clip', guard: 'bar', wrap: 'cord', pommel: 'disc' }, finish: 'weathered' }) }),

  U('uq.lamplighter', "The Lamplighter's Foil", 'sword.rapier', 7,
    'Mother Wick gave one to every boy who lit the stair lamps. This is the only one that came back up.',
    [['fireDamage', 0.8], ['dexterity', 1], ['fireResist', 0.8]],
    { hook: 'Every thrust lights what it touches.', power: 'groundFire',
      look: D('metal.brass', 'cloth.wool|0x3a2a1a', 'metal.copper', ['flames', 'chains'], 0.45, { cut: { tip: 'needle', guard: 'cup', pommel: 'ball', w: 0.012 }, finish: 'satin' }),
      from: 'mother_wick' }),

  U('uq.droversword', "Drover's Broadsword", 'sword.broad', 12,
    'Carried by the men who drove cattle down to the Mere Ford market, when there were still cattle and still a market.',
    [['life', 1], ['strength', 1], ['attackRating', 0.8]],
    { hook: 'Heavy, slow and very hard to knock down.', power: 'heavyTread', mag: 0.6,
      look: D('metal.steel|0x9a948a', 'leather.hide', 'metal.iron', ['rivets', 'tatters'], 0.75, { cut: { tip: 'round', guard: 'block', wrap: 'leather', pommel: 'wheel', w: 0.05 }, finish: 'matte' }) }),

  U('uq.wideparting', 'The Wide Parting', 'sword.broad', 17,
    'A drill sword from the old barracks yard. The sergeant taught one stroke with it, and taught it wide.',
    [['enhancedDamage', 1], ['strength', 0.8], ['life', 0.6]],
    { classId: 'warden', bend: { skill: 'cleave', more: 25, grow: { arc: 20, radius: 25 } },
      look: D('metal.steel', 'leather.studded', 'metal.bronze', ['rivets', 'laurels'], 0.5, { cut: { tip: 'cleaver', guard: 'winged', pommel: 'fishtail', w: 0.06, backed: true } }),
      from: 'old_gristle' }),

  U('uq.stairmark', 'Stairmark', 'sword.gladius', 27,
    'Every step it was carried down is cut into the grip. There is no room left for more.',
    [['attackRating', 1.2], ['moveSpeed', 1], ['coldResist', 1], ['lifeSteal', 0.8]],
    { hook: 'Made for fighting on the way down.',
      look: D('metal.bronze|0x8a7a5a', 'wood.ash', 'metal.dark', ['runes', 'rivets'], 0.55, { cut: { tip: 'leaf', guard: 'lugs', wrap: 'ribbed', pommel: 'cap' } }) }),

  U('uq.vergerblade', "The Verger's Blade", 'sword.foil', 31,
    'Kept in the vestry behind the hymn books. The verger said it was for the candles. It was not for the candles.',
    [['enhancedDamage', 0.9], ['attackSpeed', 0.8], ['vitality', 0.8]],
    { classId: 'paladin', bend: { skill: 'litany', more: 20, add: { cuts: 2 } },
      look: D('metal.silver|0xd8d4c8', 'cloth.velvet|0x3a1a2a', 'metal.gold', ['laurels', 'runes'], 0.2, { cut: { tip: 'point', guard: 'swept', pommel: 'crown' }, finish: 'polished' }),
      from: 'sister_abelline' }),

  U('uq.saltcutter', 'Saltcutter', 'sword.tusk', 34,
    'Ground from a tooth the saltwyrm shed in the flats. The edge still weeps brine.',
    [['critChance', 1], ['enhancedDamage', 1], ['poisonResist', 1]],
    { hook: 'Its cuts sting long after.', power: 'critBleed', mag: 1.5,
      look: D('bone.pale|0xe8e4d8', 'leather.fine|0x2a3a3a', 'metal.verdigris', ['barnacles', 'teeth'], 0.6, { cut: { tip: 'tusk', guard: 'shell', wrap: 'bone', pommel: 'knob', curve: 0.04 } }),
      from: 'gaellach_saltwyrm' }),

  U('uq.underlid', 'Underlid', 'sword.tusk', 36,
    'A blade with no shine on it at all. The smith blacked it in lamp soot and then blacked the soot.',
    [['critDamage', 1], ['dexterity', 1], ['attackSpeed', 0.6]],
    { classId: 'shadowblade', bend: { skill: 'shadowStep', more: 30, grow: { range: 35 }, applies: { status: 'blinded', duration: 2, label: 'blind the target' } },
      look: D('metal.black|0x16161a', 'cloth.silk|0x0e0e12', 'metal.dark', ['smoke', 'moons'], 0.15, { cut: { tip: 'fang', guard: 'none', pommel: 'none', wrap: 'cloth', backed: true }, finish: 'blackened' }),
      from: 'stalker_prime' }),

  U('uq.secondwatch', 'The Second Watch', 'sword.gladius', 42,
    'The night watch carried two swords: one to fight with, and this one, for when they were too tired to aim.',
    [['enhancedDamage', 1], ['life', 0.6], ['lightningResist', 0.8]],
    { hook: 'Swing first. Aim later.', power: 'wildSwing', mag: 0.8,
      look: D('metal.steel|0x7a8090', 'leather.dark', 'metal.silver', ['chains', 'stars'], 0.65, { cut: { tip: 'spear', guard: 'crescent', pommel: 'ring', serrate: 6 } }) }),

  U('uq.gauntmercy', "The Gaunt King's Mercy", 'sword.falchion', 50,
    'He gave it to the ones he let live. They did not live long, and he wanted it back.',
    [['enhancedDamage', 1.1], ['critChance', 0.8], ['life', 0.7]],
    { hook: 'It finishes what was started.', power: 'culling', mag: 1.5,
      look: D('metal.bloodgold|0x7a3a2a', 'leather.fine|0x2a0e10', 'metal.dark', ['crowns', 'thorns'], 0.35, { cut: { tip: 'clip', guard: 'drooping', pommel: 'skull' }, finish: 'lacquer' }),
      from: 'the_gaunt_king' }),

  U('uq.longargument', 'The Long Argument', 'sword.estoc', 54,
    'Two families settled a boundary with this for three generations. The boundary is under the lake now.',
    [['attackRating', 1.5], ['critDamage', 1.2], ['manaSteal', 1], ['coldResist', 0.8]],
    { hook: 'For the one who always gets the last word.',
      look: D('metal.steel|0xc0c4cc', 'wood.dark', 'metal.brass', ['runes', 'feathers'], 0.3, { cut: { tip: 'needle', guard: 'ringed', pommel: 'gem', ridge: true }, stone: 0x3a6ac8 }) }),

  U('uq.thessalywager', "Thessaly's Wager", 'sword.conquest', 58,
    'She bet the sword on a turn of the vane, and won, and bet it again.',
    [['enhancedDamage', 1], ['attackSpeed', 0.8], ['lightningDamage', 0.8]],
    { hook: 'All on one throw.', power: 'glassJaw', mag: 1.2,
      look: D('metal.silver|0xb8c0d0', 'leather.fine|0x1a2a4a', 'metal.copper', ['coils', 'wings'], 0.25, { cut: { tip: 'flame', waves: 5, guard: 'winged', pommel: 'fishtail' }, finish: 'polished' }),
      from: 'thessaly_vane' }),

  U('uq.spillover', 'Spillover', 'sword.falchion', 63,
    'Forged in the Works from what was left in the crucible after a bigger blade. It has never forgiven the bigger blade.',
    [['enhancedDamage', 1.1], ['areaDamagePct', 1], ['strength', 0.7]],
    { hook: 'What is left of a killing blow goes on to the next one.', power: 'overkillSplash', mag: 1.2,
      look: D('metal.dark|0x3a2a22', 'leather.worn', 'metal.copper', ['cracks', 'rivets'], 0.7, { cut: { tip: 'cleaver', guard: 'block', pommel: 'cap', w: 0.07 }, finish: 'blackened' }),
      from: 'furnace_choir' }),

  U('uq.keyhole', 'Keyhole', 'sword.estoc', 67,
    'The Queen of Hinges keeps a door for every lock. This is what she opens them with.',
    [['critChance', 1.1], ['attackRating', 1], ['dexterity', 0.9]],
    { hook: 'Finds the gap in any armour.', power: 'unblockableCrit', mag: 1.2,
      look: D('metal.iron|0x5a5a60', 'leather.dark', 'metal.brass', ['chains', 'eyes'], 0.4, { cut: { tip: 'needle', guard: 'ringed', pommel: 'ring', square: true } }),
      from: 'queen_of_hinges' }),

  U('uq.twicetold', 'Twice Told', 'sword.phase', 74,
    'A storyteller\'s sword. Every tale he told with it, he told again the next night, word for word.',
    [['enhancedDamage', 1.1], ['skillLevels', 1, 1], ['attackSpeed', 0.8], ['mana', 0.6]],
    { hook: 'Every skill says it twice.', power: 'echo', mag: 0.7,
      look: D('crystal.arcane|0x9a8ad8', 'leather.fine|0x2a1a3a', 'metal.silver', ['runes', 'ghost'], 0.05, { cut: { tip: 'point', guard: 'disc', pommel: 'gem', window: true }, glow: 0xb8a8ff, stone: 0xb8a8ff }) }),

  U('uq.unreturnedloan', 'The Unreturned Loan', 'sword.phase', 82,
    'The Archivist Below lends this to whoever reaches it, and writes the debt down in a book nobody has finished reading.',
    [['enhancedDamage', 1.2], ['critDamage', 1], ['manaSteal', 0.8], ['arcaneResist', 1]],
    { hook: 'More skill than you earned, and a bill for it.', power: 'borrowedCraft', mag: 1,
      look: D('metal.voidgold', 'cloth.silk|0x1a1222', 'metal.gold', ['runes', 'coins', 'eyes'], 0.1, { cut: { tip: 'spear', guard: 'sun', pommel: 'crown', phase: true }, glow: 0xffd070, stone: 0xffd070 }),
      from: 'archivist_below' }),

  // ===========================================================================
  // Axes
  // ===========================================================================
  U('uq.splitwinter', 'Splitwinter', 'axe.hand', 4,
    'The year the fen froze to the bottom, every house on the hill kept one of these by the door.',
    [['strength', 1], ['attackSpeed', 0.8], ['coldResist', 1.2]],
    { hook: 'For splitting wood in a cold year, and whatever comes for the wood.',
      look: D('metal.iron', 'wood.oak', 'metal.dark', ['frost', 'rivets'], 0.6, { cut: { bit: 'bearded', back: 'none', wrap: 'cord' }, finish: 'weathered' }) }),

  U('uq.gristletooth', "Gristle's Tooth", 'axe.war', 11,
    'Old Gristle broke a tooth on a cart axle and somebody hafted it before it stopped twitching.',
    [['enhancedDamage', 0.9], ['life', 0.8], ['lifeSteal', 0.6]],
    { hook: 'Bites, and swallows.', power: 'lifeTap', mag: 0.8,
      look: D('bone.old|0xd8c8a8', 'leather.hide|0x4a3020', 'metal.iron', ['teeth', 'blood'], 0.7, { cut: { bit: 'hooked', back: 'spike', wrap: 'leather', bands: 2 } }),
      from: 'old_gristle' }),

  U('uq.thirstbit', 'Thirstbit', 'axe.war', 18,
    'A butcher\'s axe from the lower shambles. The block it worked on is still stained, and still damp.',
    [['enhancedDamage', 1], ['attackSpeed', 0.6], ['strength', 0.6]],
    { hook: 'It drinks from the cut and not from rest.', power: 'leechHunger', mag: 0.6,
      look: D('metal.steel|0x8a7a78', 'wood.dark', 'metal.bloodgold', ['blood', 'chains'], 0.65, { cut: { bit: 'cleaver', back: 'small', wrap: 'wood' } }),
      from: 'butcher_grell' }),

  U('uq.millwheel', 'Millwheel', 'axe.cleaver', 26,
    'The miller at the falls fought off the river men with it, turning, the way his wheel turned.',
    [['enhancedDamage', 1], ['vitality', 0.8], ['attackSpeed', 0.6]],
    { classId: 'warden', bend: { skill: 'whirlwind', more: 20, grow: { radius: 30, moveSpeed: 20 } },
      look: D('metal.steel', 'wood.oak|0x6a4a2a', 'metal.iron', ['rivets', 'tatters'], 0.55, { cut: { bit: 'fan', back: 'bit', wrap: 'leather', bands: 3 } }) }),

  U('uq.gutterchopper', 'Gutterchopper', 'axe.cleaver', 30,
    'Rusk\'s men cleared the drains with it. They did not always wait for the drains to be empty.',
    [['areaDamagePct', 1.2], ['poisonDamage', 0.8], ['poisonResist', 1]],
    { hook: 'For clearing a crowd that will not clear itself.',
      look: D('metal.rusted', 'cloth.rags|0x3a3a2a', 'metal.dark', ['vines', 'rivets'], 0.95, { cut: { bit: 'broad', back: 'hook', wrap: 'cloth' }, finish: 'matte' }),
      from: 'gutterking_rusk' }),

  U('uq.hewingsong', 'Hewing Song', 'axe.naga', 38,
    'The foresters sang as they cut, so the trees would know it was not personal. The trees did not believe them.',
    [['enhancedDamage', 1.1], ['strength', 0.8], ['life', 0.6]],
    { hook: 'Every swing takes the ones beside it too.', power: 'cleave', mag: 1.3,
      look: D('metal.steel|0x9aa098', 'wood.bark', 'metal.bronze', ['leaves', 'runes'], 0.5, { cut: { bit: 'crescent', back: 'none', wrap: 'cord', top: 'spike' } }),
      from: 'treant_elder_vhoss' }),

  U('uq.wideswath', 'Wideswath', 'axe.naga', 44,
    'A reaper\'s axe for a field nobody planted.',
    [['enhancedDamage', 0.8], ['attackSpeed', 0.8], ['dexterity', 0.8]],
    { hook: 'Wider and weaker, and wider again.', power: 'broadStroke', mag: 1,
      look: D('metal.iron|0x6a6058', 'leather.worn', 'metal.copper', ['laurels', 'rivets'], 0.6, { cut: { bit: 'moon', back: 'small', wrap: 'leather', bw: 0.2 } }) }),

  U('uq.stoppingaxe', 'The Stopping Axe', 'axe.tomahawk', 52,
    'A headsman kept it at the Gate for a hundred years and used it twice. Both times, the crowd went very quiet.',
    [['critChance', 1], ['enhancedDamage', 1.1], ['vitality', 0.8]],
    { hook: 'A clean hit freezes them where they stand.', power: 'critStagger', mag: 1.2,
      look: D('metal.dark|0x2a2a2e', 'wood.polished|0x2a1a12', 'metal.silver', ['skulls', 'chains'], 0.35, { cut: { bit: 'gothic', back: 'spike', wrap: 'wire', langets: true }, finish: 'blackened' }),
      from: 'iron_conqueror' }),

  U('uq.runningtide', 'Running Tide', 'axe.berserker', 64,
    'Taken off a raider who came up the river on the spring flood and went back down it on the next.',
    [['enhancedDamage', 1.1], ['lifeSteal', 0.8], ['coldResist', 0.8]],
    { hook: 'Fast, light, and nothing between you and the blow.', power: 'featherweight', mag: 1.2,
      look: D('metal.verdigris', 'leather.fine|0x1e3a3a', 'metal.bronze', ['barnacles', 'scales'], 0.65, { cut: { bit: 'twin', back: 'bit', wrap: 'cord' } }),
      from: 'tidewarden_nheru' }),

  U('uq.furrow', 'The Furrow', 'axe.rune', 80,
    'Dragged once across the bottom of the world, and the ground has not closed over the line it made.',
    [['enhancedDamage', 1.2], ['strength', 1], ['areaDamagePct', 0.8], ['skillLevels', 1, 1]],
    { hook: 'Every swing splits the ground beside it.', power: 'worldCleave', mag: 0.7,
      look: D('stone.obsidian|0x2a2228', 'wood.charred', 'metal.bloodgold', ['runes', 'cracks'], 0.4, { cut: { bit: 'rune', back: 'hammer', wrap: 'wire' }, glow: 0xff6a30 }),
      from: 'deeps_own_name' }),

  // ===========================================================================
  // Maces
  // ===========================================================================
  U('uq.doorstop', 'Doorstop', 'mace.club', 2,
    'It held the tavern door open for twenty years before anyone thought to swing it.',
    [['strength', 1], ['life', 0.8], ['defense', 0.6]],
    { hook: 'Every hit knocks its target back.', power: 'knockback',
      look: D('wood.oak|0x7a5a3a', 'cloth.homespun', 'metal.iron', ['rivets'], 0.8, { cut: { head: 'cudgel', wrap: 'cord', pommel: 'knob' }, finish: 'matte' }) }),

  U('uq.clapperhead', 'Clapperhead', 'mace.mace', 10,
    'The clapper from the chapel bell, after the bell cracked. It still wants to ring something.',
    [['enhancedDamage', 0.9], ['strength', 0.8], ['blockChance', 0.6]],
    { classId: 'warden', bend: { skill: 'shieldBash', more: 25, add: { stun: 0.5 }, grow: { knockback: 40 } },
      look: D('metal.bronze', 'leather.worn', 'metal.iron', ['bells', 'rivets'], 0.5, { cut: { head: 'club', hs: 0.12, wrap: 'leather', pommel: 'ring' } }),
      from: 'choir_of_rot' }),

  U('uq.abbotsweight', "The Abbot's Weight", 'mace.mace', 15,
    'Corrimund\'s order weighed their bread with it, and their sins, and found both short.',
    [['manaRegen', 1.2], ['lifeRegen', 1.2], ['defense', 1], ['energy', 0.6]],
    { hook: 'For the one who never stops to rest.',
      look: D('metal.brass', 'cloth.wool|0x4a3a2a', 'metal.gold', ['gilded', 'coins'], 0.3, { cut: { head: 'holy', n: 4, wrap: 'wire', pommel: 'disc' }, finish: 'polished' }),
      from: 'brass_abbot' }),

  U('uq.secondpeal', 'The Second Peal', 'mace.cudgel', 25,
    'The bell-ringers\' guild cast it from the metal of a bell that rang once and broke.',
    [['enhancedDamage', 1], ['vitality', 0.8], ['lightningResist', 0.8]],
    { classId: 'paladin', bend: { skill: 'knell', more: 20, grow: { ring: 40, echo: 50 } },
      look: D('metal.bronze|0x9a7a4a', 'wood.polished', 'metal.silver', ['bells', 'runes'], 0.35, { cut: { head: 'knobbed', n: 6, wrap: 'ribbed', pommel: 'crown' } }) }),

  U('uq.mooringpost', 'Mooring Post', 'mace.cudgel', 29,
    'Pulled out of the ferry landing after the ferry stopped. The ring is still on it.',
    [['life', 1], ['strength', 1], ['physicalResist', 0.8]],
    { hook: 'Nothing moves you. You do not move much either.', power: 'anchor', mag: 1,
      look: D('wood.rotted|0x5a4a3a', 'metal.chain', 'metal.rusted', ['chains', 'barnacles'], 0.85, { cut: { head: 'truncheon', wrap: 'cord', pommel: 'ring' }, finish: 'weathered' }),
      from: 'sallow_twins' }),

  U('uq.wearyhead', 'Wearyhead', 'mace.flanged', 37,
    'Mirelle was buried with it, and dug up with it, and she has not let go of it since.',
    [['enhancedDamage', 1], ['coldResist', 1], ['life', 0.7]],
    { hook: 'Whatever it hits is tired before it falls.', power: 'decrepify', mag: 0.4,
      look: D('metal.silver|0x9aa4a8', 'cloth.tattered|0x4a4a50', 'bone.old', ['tatters', 'moons'], 0.7, { cut: { head: 'flanged', n: 5, wrap: 'cloth', pommel: 'skull' } }),
      from: 'mirelle_unburied' }),

  U('uq.kettlelid', "Kettle's Lid", 'mace.flanged', 45,
    'Prised off the top of the thing they call Kettle. It whistles when it is swung, and so does Kettle, looking for it.',
    [['damageReduction', 1], ['strength', 1], ['lightningResist', 1.2], ['attackRating', 0.8]],
    { hook: 'Hard as a boiler plate, and as hot.',
      look: D('metal.copper|0x9a5a3a', 'leather.dark', 'metal.brass', ['rivets', 'coils', 'smoke'], 0.55, { cut: { head: 'hammer', hs: 0.12, wrap: 'wire', pommel: 'cap' } }),
      from: 'kettle' }),

  U('uq.heavyair', 'Heavy Air', 'mace.truncheon', 53,
    'A watchman\'s stick from the Gilt district. Where it is carried, people lower their voices and walk slower.',
    [['enhancedDamage', 1], ['defense', 1], ['dexterity', 0.7]],
    { hook: 'The air around you drags at anything that comes near.', power: 'slowAura', mag: 0.8,
      look: D('metal.gold|0xc8a860', 'leather.fine|0x2a1a10', 'metal.dark', ['coins', 'gilded'], 0.2, { cut: { head: 'truncheon', wrap: 'leather', pommel: 'disc' }, finish: 'gilt' }),
      from: 'gilt_leviathan' }),

  U('uq.ironmongerstar', "Ironmonger's Star", 'mace.devilstar', 62,
    'Malek\'s armourers forged a mace from every helm they took. This one has forty-one.',
    [['enhancedDamage', 1.1], ['strength', 1], ['life', 0.8]],
    { hook: 'Iron in, iron out. Fire and frost find their way through.', power: 'ironHide', mag: 1.2,
      look: D('metal.iron|0x6a6a6e', 'leather.studs', 'metal.steel', ['spikes', 'rivets'], 0.6, { cut: { head: 'star', n: 24, wrap: 'leather', pommel: 'spike' }, finish: 'blackened' }),
      from: 'iron_conqueror' }),

  U('uq.lastsacrament', 'The Last Sacrament', 'mace.sanctified', 84,
    'Saint Ossery carried it into the deep chapel to give the last rites. He gave them, and then he stayed.',
    [['enhancedDamage', 1.2], ['skillLevels', 1, 1], ['life', 1], ['vitality', 0.8]],
    { hook: 'Death asks for you once, and is sent away.', power: 'cheatDeath', mag: 1.2,
      look: D('metal.silver|0xe8e4d8', 'cloth.white', 'metal.gold', ['halo', 'laurels', 'bones'], 0.1, { cut: { head: 'holy', n: 8, wrap: 'wire', pommel: 'crown' }, finish: 'pearl', glow: 0xfff0c0, stone: 0xfff0c0 }),
      from: 'saint_ossery' }),

  // ===========================================================================
  // Daggers
  // ===========================================================================
  U('uq.farriernail', "Farrier's Last Nail", 'dagger.dagger', 2,
    'A horseshoe nail as long as a hand, beaten straight, then not quite straight. The farrier kept it for luck.',
    [['attackSpeed', 1], ['dexterity', 0.8], ['coldResist', 0.6]],
    { hook: 'Its hits drag at the target\'s feet.', power: 'chillOnHit', mag: 0.35,
      look: D('metal.rusted|0x6a4a3a', 'cloth.rag|0x5a4a30', undefined, ['tatters'], 0.85, { cut: { tip: 'needle', guard: 'none', pommel: 'knob', wrap: 'cord', square: true, curve: 0.01 }, finish: 'matte' }),
      from: 'warden_mott' }),

  U('uq.pickpocketpin', "Pickpocket's Pin", 'dagger.stiletto', 8,
    'Found in the lining of a coat in the lost property at the Ford. Nobody has ever come to claim the coat.',
    [['critChance', 1.4], ['moveSpeed', 1], ['magicFind', 1]],
    { hook: 'In and out before anyone looks down.',
      look: D('metal.silver|0xc8c8d0', 'leather.fine|0x3a2a3a', 'metal.gold', ['coins', 'eyes'], 0.3, { cut: { tip: 'needle', guard: 'disc', pommel: 'ball', w: 0.008 }, finish: 'polished' }) }),

  U('uq.fivefold', 'Fivefold', 'dagger.kris', 13,
    'A juggler\'s knife from the spring fair. She threw five and caught five, and one day she did not catch them.',
    [['dexterity', 1], ['attackSpeed', 0.8], ['lifeSteal', 0.6]],
    { classId: 'shadowblade', bend: { skill: 'fanOfKnives', more: 25, add: { count: 2 }, names: { count: 'knives' } },
      look: D('metal.steel|0xb0b4bc', 'cloth.banner|0x7a1a3a', 'metal.brass', ['tatters', 'stars'], 0.35, { cut: { tip: 'flame', waves: 4, guard: 'crescent', pommel: 'fishtail' } }) }),

  U('uq.sickroomdirk', 'Sickroom Dirk', 'dagger.dirk', 23,
    'The plague doctors cut the fever out with it. Ossik showed them what else it could put in.',
    [['poisonDamage', 1.1], ['poisonResist', 1], ['dexterity', 0.7]],
    { hook: 'The rot is stronger for what it costs you.', power: 'rotBargain', mag: 0.8,
      look: D('metal.verdigris|0x5a7a5a', 'leather.worn|0x3a3a28', 'bone.old', ['vines', 'skulls'], 0.6, { cut: { tip: 'spear', guard: 'bar', pommel: 'scent', wrap: 'cord' } }),
      from: 'plaguelord_ossik' }),

  U('uq.ninefoldsting', 'Ninefold Sting', 'dagger.poignard', 33,
    'Cut from the stinger of a hive guard and set in a grip of its own wax.',
    [['poisonDamage', 1], ['attackSpeed', 0.9], ['life', 0.6]],
    { hook: 'Its venom stacks deeper than any other.', power: 'poisonStacks', mag: 0.6,
      look: D('flesh.chitin|0x3a3010', 'leather.fine|0x5a4a10', 'metal.gold', ['spiders', 'web'], 0.4, { cut: { tip: 'fang', guard: 'claw', pommel: 'none', wrap: 'wire' } }),
      from: 'hive_queen_zsarra' }),

  U('uq.lotuspit', 'The Lotus Pit', 'dagger.blade', 39,
    'Pulled from the pool where the water lilies grow so thick you could walk on them. Several people tried.',
    [['poisonDamage', 1], ['dexterity', 1], ['critChance', 0.6]],
    { classId: 'shadowblade', bend: { skill: 'deathLotus', more: 20, add: { hits: 3 }, grow: { radius: 20 } },
      look: D('metal.dark|0x1e2a22', 'cloth.silk|0x2a1a2a', 'metal.silver', ['leaves', 'serpents'], 0.25, { cut: { tip: 'leaf', guard: 'shell', pommel: 'gem' }, stone: 0xc060a0 }) }),

  U('uq.twomouths', 'The Two Mouths', 'dagger.boneknife', 48,
    'One edge for the blood and one for the breath. Whoever made it never made anything else.',
    [['lifeSteal', 1.2], ['manaSteal', 1.2], ['attackSpeed', 1], ['life', -0.5]],
    { hook: 'It feeds on both. It costs a little of you.',
      look: D('bone.bleached', 'leather.fine|0x4a1418', 'metal.dark', ['teeth', 'blood'], 0.5, { cut: { tip: 'spear', guard: 'none', pommel: 'skull', wrap: 'bone', serrate: 8 } }) }),

  U('uq.nulwhisker', "Nul's Whisker", 'dagger.nightblade', 57,
    'Nobody has seen Nul. A great many people have seen this, briefly.',
    [['critChance', 1], ['critDamage', 1.1], ['moveSpeed', 0.6]],
    { hook: 'A clean hit leaves them open to everything.', power: 'critVulnerable', mag: 1.2,
      look: D('metal.black', 'cloth.silk|0x101014', 'metal.voidgold', ['smoke', 'eyes'], 0.1, { cut: { tip: 'needle', guard: 'none', pommel: 'none', curve: 0.03 }, finish: 'blackened' }),
      from: 'stalker_prime' }),

  U('uq.onenameonly', 'One Name Only', 'dagger.fanged', 62,
    'An assassin\'s blade with a single name cut on it. The name was crossed out long ago.',
    [['enhancedDamage', 1.1], ['critChance', 0.9], ['dexterity', 0.8]],
    { hook: 'For one at a time, never a crowd.', power: 'narrowEdge', mag: 1.2,
      look: D('metal.steel|0x8a8e98', 'leather.dark', 'metal.bloodgold', ['runes', 'thorns'], 0.3, { cut: { tip: 'fang', guard: 'drooping', pommel: 'spike' } }),
      from: 'corvus_hale' }),

  U('uq.dowryknife', 'The Dowry Knife', 'dagger.fanged', 68,
    'The Duchess gave one to each of her daughters on their wedding day. None of the husbands lived to their first year.',
    [['magicFind', 1.4], ['goldFind', 1], ['critDamage', 0.8], ['dexterity', 0.6]],
    { hook: 'What it kills leaves something behind.', power: 'wishCurse', mag: 1,
      look: D('metal.gold', 'cloth.velvet|0x5a1a3a', 'metal.silver', ['gilded', 'coins'], 0.05, { cut: { tip: 'flame', waves: 3, guard: 'swept', pommel: 'gem' }, finish: 'gilt', stone: 0xd04080 }),
      from: 'duchess_imeris' }),

  U('uq.quiethour', 'The Quiet Hour', 'dagger.mindrender', 80,
    'The hour before dawn, when the watch is at its most tired. Somebody forged it into a blade.',
    [['critChance', 1.1], ['critDamage', 1.2], ['dexterity', 1], ['skillLevels', 1, 1]],
    { hook: 'It cuts deep and takes nothing back.', power: 'noCritLeech', mag: 1,
      look: D('crystal.shadow|0x2a2a40', 'cloth.silk|0x14141e', 'metal.silver', ['moons', 'stars'], 0, { cut: { tip: 'needle', guard: 'crescent', pommel: 'gem' }, glow: 0x9ab0ff, stone: 0x9ab0ff }) }),

  // ===========================================================================
  // Spears
  // ===========================================================================
  U('uq.ferrymanpole', "Ferryman's Pole", 'spear.spear', 6,
    'Nheru drowned the ferryman and kept the boat. The pole floated home on its own.',
    [['attackRating', 1], ['dexterity', 1], ['fireResist', 1], ['moveSpeed', 0.6]],
    { hook: 'Keeps you moving and keeps them at a distance.',
      look: D('wood.ash|0xb8a888', 'cloth.linen|0x6a7a7a', 'metal.iron', ['barnacles', 'tatters'], 0.7, { cut: { head: 'leaf', butt: 'cap', tassel: true } }),
      from: 'tidewarden_nheru' }),

  U('uq.gannetreach', "Gannet's Reach", 'spear.pike', 14,
    'The cliff fishers speared their catch from the rocks with these, as the gannets do, without stopping.',
    [['attackSpeed', 1], ['dexterity', 1], ['life', 0.6]],
    { hook: 'Each thrust lands quicker than the last.', power: 'momentum', mag: 0.7,
      look: D('wood.ash|0xe0d8c8', 'cloth.white', 'metal.silver', ['feathers', 'wings'], 0.3, { cut: { head: 'awl', butt: 'none', tassel: true } }) }),

  U('uq.gatesanswer', "The Gate's Answer", 'spear.halberd', 20,
    'The Holloway Stair kept one at every landing. When the stair started walking, the halberds went with it.',
    [['defense', 1], ['strength', 1], ['enhancedDamage', 0.8]],
    { hook: 'Plant it and stand.', power: 'heavyTread', mag: 0.8,
      look: D('metal.iron', 'wood.planks', 'metal.bronze', ['rivets', 'chains'], 0.6, { cut: { head: 'halberd', butt: 'spike', bands: 3 } }),
      from: 'holloway_stair' }),

  U('uq.eelspear', 'Eelspear', 'spear.trident', 28,
    'The fen men hunted eels with it in the black water. Some of the eels were not eels.',
    [['lightningDamage', 1], ['lightningResist', 1], ['attackSpeed', 0.6]],
    { hook: 'Its hits jump to the next one.', power: 'chainLightning', mag: 0.7,
      look: D('metal.copper', 'wood.rotted', 'metal.verdigris', ['coils', 'scales'], 0.55, { cut: { head: 'trident', butt: 'ball' } }),
      from: 'stormcrown_azhek' }),

  U('uq.shieldwifespear', "The Shield-Wife's Spear", 'spear.warspear', 34,
    'She held the bridge with this and no shield at all. The spear learned the shield\'s work.',
    [['blockChance', 1], ['defense', 1], ['life', 1], ['strength', 0.6]],
    { hook: 'A spear that blocks like a shield.',
      look: D('metal.steel', 'leather.studded', 'metal.bronze', ['rivets', 'laurels'], 0.45, { cut: { head: 'winged', butt: 'spike', bands: 2 } }) }),

  U('uq.standinglance', 'The Standing Lance', 'spear.lance', 41,
    'A tourney lance from the Duchess\'s lists, reinforced with iron until no horse could carry it.',
    [['enhancedDamage', 1.1], ['vitality', 1], ['strength', 0.8]],
    { hook: 'Strong as a wall, and as slow.', power: 'stoneSkin', mag: 1,
      look: D('metal.steel|0xa8a8b0', 'cloth.banner|0x2a3a7a', 'metal.gold', ['tatters', 'gilded'], 0.3, { cut: { head: 'lance', butt: 'cap' }, finish: 'polished' }),
      from: 'duchess_imeris' }),

  U('uq.burningbanner', 'The Burning Banner', 'spear.brandistock', 52,
    'Kaveh\'s flagbearers carried the ash-banner on these. When the banner burned away, the poles kept burning.',
    [['fireDamage', 1.1], ['enhancedDamage', 1], ['fireResist', 0.8]],
    { hook: 'Its burns leap to whatever stands near.', power: 'fireSpread',
      look: D('metal.dark', 'wood.charred', 'metal.copper', ['flames', 'tatters'], 0.7, { cut: { head: 'brandistock', butt: 'ball', tassel: true } }),
      from: 'ashen_prophet' }),

  U('uq.grandmothersneedle', "Grandmother's Needle", 'spear.ghost', 64,
    'Grandmother Thaw knits with two of these. Nobody has seen what she is knitting, only that it is very long.',
    [['coldDamage', 1.2], ['coldResist', 1], ['manaSteal', 1], ['critDamage', 1]],
    { hook: 'Cold, sharp, and patient.',
      look: D('crystal.frost|0xd8ecff', 'cloth.wool|0x8a9ab0', 'metal.silver', ['frost', 'crystals'], 0.1, { cut: { head: 'awl', butt: 'spike', bands: 4 }, finish: 'frosted' }),
      from: 'grandmother_thaw' }),

  U('uq.collectorshook', "The Collector's Hook", 'spear.mancatcher', 76,
    'The One Who Came Up Instead uses it to take back what the stair owes. It has a long list.',
    [['enhancedDamage', 1.1], ['life', 1], ['lifeSteal', 0.8], ['skillLevels', 1, 1]],
    { hook: 'It drains whatever it catches.', power: 'lifeTap', mag: 1.4,
      look: D('metal.dark|0x2a2228', 'bone.old', 'metal.voidgold', ['claws', 'chains', 'eyes'], 0.4, { cut: { head: 'catcher', butt: 'spike' }, glow: 0x9a60ff, stone: 0x9a60ff }),
      from: 'came_up_instead' }),
];
