/**
 * SLAY — depth uniques, batch C: wands, staves, orbs, scepters and shields.
 *
 * Fifty-four pieces. Caster weapons give no basic attack, so every power on
 * them changes spells. Fifteen bend a skill: six of the Mage's, four of the
 * Revenant's, three of the Paladin's and two of the Knight's.
 */
import type { UniqueDef } from '../uniques';
import { D, U } from './kit';

export const BATCH_C: UniqueDef[] = [
  // ===========================================================================
  // Wands
  // ===========================================================================
  U('uq.mudlantern', 'Mudlantern', 'wand.wand', 2,
    'A clay bulb on a willow stick, with a wick in it that never quite goes out. The fen children carry them home in the dark.',
    [['fireDamage', 0.8], ['mana', 1], ['fireResist', 0.6]],
    { hook: 'Every hit sets the ground round it alight.', power: 'groundFire',
      look: D('stone.brick|0x8a6a4a', 'wood.ash', undefined, ['flames', 'cracks'], 0.6, { cut: { kind: 'burnt', wrap: 'cord' }, finish: 'matte' }) }),

  U('uq.pewbone', 'Pewbone', 'wand.femur', 4,
    'The choir sat on the old bones of the founders for a hundred years. One of the founders wanted his leg back.',
    [['mana', 1], ['manaRegen', 1], ['poisonResist', 1], ['life', 0.5]],
    { hook: 'Small comforts for a long service.',
      look: D('bone.old|0xc8b890', 'cloth.linen', 'metal.iron', ['bones', 'runes'], 0.7, { cut: { kind: 'femur', wrap: 'cloth' } }),
      from: 'choir_of_rot' }),

  U('uq.splinterwand', 'Splinterwand', 'wand.bone', 11,
    'Whittled from a rib that broke into a hundred points when it was dropped. It kept all of them.',
    [['energy', 1], ['mana', 0.8], ['castSpeed', 0.6]],
    { classId: 'revenant', bend: { skill: 'boneSpear', more: 25, grow: { range: 20 }, add: { count: 2, arc: 70 }, names: { count: 'spears', arc: 'degrees wider fan' } },
      look: D('bone.bleached', 'leather.worn|0x3a2a2a', 'bone.old', ['spikes', 'bones'], 0.4, { cut: { kind: 'bone', wrap: 'cord' } }),
      from: 'boneking_gharruth' }),

  U('uq.tombcandle', 'The Tomb Candle', 'wand.tomb', 18,
    'Lit at the head of a grave so the one inside could find the way out. Someone did.',
    [['mana', 1], ['energy', 1], ['coldResist', 0.8]],
    { hook: 'A deeper well of mana, paid for in blood.', power: 'deepWell', mag: 0.8,
      look: D('stone.crypt|0x8a8478', 'cloth.tattered', 'metal.dark', ['skulls', 'smoke'], 0.65, { cut: { kind: 'tomb', wrap: 'cloth' } }),
      from: 'archivist_moln' }),

  U('uq.hearthbrand', 'Hearthbrand', 'wand.yew', 24,
    'Taken from the hearth of the inn the night it burned. The landlord says he did not do it. The wand says otherwise.',
    [['fireDamage', 1], ['energy', 0.8], ['castSpeed', 0.6]],
    { classId: 'mage', bend: { skill: 'fireball', more: 20, grow: { radius: 30 }, add: { burnStacks: 1 } },
      look: D('wood.charred', 'leather.fine|0x4a1a10', 'metal.copper', ['flames', 'cracks'], 0.6, { cut: { kind: 'yew', wrap: 'wire' } }) }),

  U('uq.rollcall', 'The Roll Call', 'wand.grim', 36,
    'The sexton read the names of the dead from it every winter. This winter, some of them answered.',
    [['energy', 1], ['life', 0.8], ['mana', 0.6]],
    { classId: 'revenant', bend: { skill: 'raiseSkeleton', grow: { lifePct: 25, damagePct: 25 }, add: { baseCap: 1 }, names: { baseCap: 'skeletons' } },
      look: D('bone.old', 'cloth.tattered|0x3a3a3a', 'metal.silver', ['skulls', 'chains'], 0.5, { cut: { kind: 'grim', wrap: 'wire' } }),
      from: 'boneking_gharruth' }),

  U('uq.dirgestick', 'Dirge Stick', 'wand.grave', 43,
    'The mourners tapped out the time of the dirge with it. It never lets a song end early.',
    [['energy', 1], ['manaRegen', 1], ['coldResist', 0.8]],
    { hook: 'Each death gives back some of what the spell cost.', power: 'killMana', mag: 1.2,
      look: D('wood.rotted|0x4a4038', 'cloth.velvet|0x1a1a24', 'bone.old', ['bells', 'tatters'], 0.55, { cut: { kind: 'grave', wrap: 'cloth' } }),
      from: 'mirelle_unburied' }),

  U('uq.forkedtwig', 'Forked Twig', 'wand.burnt', 50,
    'Lifted from the oak at the crossroads after lightning split it. It still points two ways at once.',
    [['lightningDamage', 1], ['energy', 0.9], ['lightningResist', 0.8]],
    { classId: 'mage', bend: { skill: 'chainLightning', more: 20, add: { chains: 2 }, grow: { range: 20 } },
      look: D('wood.burnt', 'cloth.linen|0x2a3a5a', 'metal.copper', ['bolts', 'coils'], 0.5, { cut: { kind: 'burnt', wrap: 'wire' } }),
      from: 'stormcrown_azhek' }),

  U('uq.ordrachseal', "Ordrach's Seal", 'wand.lich', 61,
    'One of the seven seals that bound the lich. It did not hold. The other six are still looking for it.',
    [['energy', 1.1], ['castSpeed', 0.8], ['coldResist', 1]],
    { hook: 'Burns hot and fast, and leaves the well dry.', power: 'brightBurn', mag: 1.2,
      look: D('bone.pale', 'cloth.silk|0x2a1a3a', 'metal.voidgold', ['runes', 'chains', 'crowns'], 0.3, { cut: { kind: 'lich', wrap: 'wire' } }),
      from: 'lich_of_seven_seals' }),

  U('uq.duguptwice', 'Dug Up Twice', 'wand.unearthed', 68,
    'Buried with a scholar, dug up by a thief, buried again with the thief, and dug up by his widow.',
    [['energy', 1.3], ['mana', 1], ['manaRegen', 0.8]],
    { hook: 'The more you know, the harder your spells land.', power: 'eleFromEnergy', mag: 1,
      look: D('stone.cave|0x6a5a48', 'leather.worn', 'metal.rusted', ['cracks', 'leaves'], 0.85, { cut: { kind: 'unearthed', wrap: 'leather' } }) }),

  U('uq.wellspring', 'Wellspring', 'wand.heartstone', 82,
    'The spring under the well in the market square, the one that never froze. A stone from the bottom of it.',
    [['energy', 1.1], ['mana', 1.2], ['skillLevels', 1, 1], ['manaRegen', 1]],
    { hook: 'The deeper your mana, the stronger every spell.', power: 'manaScale', mag: 1.2,
      look: D('crystal.gem|0x3a8ad8', 'leather.fine|0x1a2a3a', 'metal.silver', ['crystals', 'runes'], 0.05, { cut: { kind: 'heartstone', wrap: 'wire' }, glow: 0x70c0ff, stone: 0x70c0ff }) }),

  // ===========================================================================
  // Staves
  // ===========================================================================
  U('uq.tallowcrook', 'Crook of the Tallow Flock', 'staff.short', 3,
    'The Tallow Shepherd led his flock down the stair with it, one candle at a time.',
    [['mana', 1], ['coldResist', 1], ['moveSpeed', 0.8], ['castSpeed', 0.6]],
    { hook: 'For walking the long way with a light.',
      look: D('wood.ash|0xc8b898', 'cloth.wool|0xd8d0b8', undefined, ['tatters', 'bells'], 0.5, { cut: { kind: 'short', wrap: 'cord' } }),
      from: 'tallow_shepherd' }),

  U('uq.pilgrimstaff', "Pilgrim's Staff", 'staff.long', 13,
    'Pilgrims walked to the Gate with these and left them leaning on the wall. This one walked back without its pilgrim.',
    [['mana', 1], ['energy', 0.8], ['life', 0.6]],
    { hook: 'Some of every blow is paid from your mana.', power: 'manaShield', mag: 0.4,
      look: D('wood.oak|0x8a7a5a', 'cloth.linen|0xb8a888', 'metal.bronze', ['leaves', 'laurels'], 0.6, { cut: { kind: 'long', wrap: 'cloth' } }) }),

  U('uq.coldhand', 'Coldhand', 'staff.battle', 21,
    'A frost-mage\'s walking staff, which she held so long her fingers stayed curled round it after.',
    [['coldDamage', 1], ['coldResist', 1], ['mana', 0.8]],
    { hook: 'Quick to cast, clumsy to swing.', power: 'coldHands', mag: 1,
      look: D('wood.dark|0x3a3a48', 'leather.fine|0x2a3a5a', 'metal.silver', ['frost', 'runes'], 0.35, { cut: { kind: 'battle', wrap: 'wire' }, finish: 'frosted' }) }),

  U('uq.gallowsroot', 'Gallows Root', 'staff.gnarled', 27,
    'Grown up through the floor of the old gallows, where the bodies were left too long.',
    [['energy', 1], ['poisonResist', 1], ['life', 0.6]],
    { classId: 'revenant', bend: { skill: 'corpseExplosion', more: 25, grow: { radius: 30 } },
      look: D('wood.bark|0x4a3a2a', 'metal.chain', 'bone.old', ['vines', 'skulls'], 0.75, { cut: { kind: 'gnarled', wrap: 'cord' } }),
      from: 'plaguelord_ossik' }),

  U('uq.whitecedar', 'Whitecedar', 'staff.cedar', 33,
    'Cut on the hill in the hard winter, from a tree that had frozen white all the way to the heart.',
    [['coldDamage', 1], ['energy', 0.9], ['castSpeed', 0.6]],
    { classId: 'mage', bend: { skill: 'blizzard', more: 20, grow: { radius: 25, duration: 25 } },
      look: D('wood.ash|0xe8e8f0', 'cloth.white', 'metal.silver', ['frost', 'crystals'], 0.2, { cut: { kind: 'cedar', wrap: 'cloth' }, finish: 'frosted' }),
      from: 'grandmother_thaw' }),

  U('uq.battlehymnal', 'The Battle Hymnal', 'staff.war', 41,
    'A choirmaster\'s staff shod in iron. He conducted with it, and when the singing stopped he kept conducting.',
    [['castSpeed', 1.2], ['defense', 1], ['life', 1], ['physicalResist', 0.8]],
    { hook: 'For the caster who stands at the front.',
      look: D('wood.polished|0x6a4a2a', 'cloth.banner|0x6a1a1a', 'metal.iron', ['rivets', 'bells'], 0.5, { cut: { kind: 'war', wrap: 'leather' } }) }),

  U('uq.turningwinter', 'The Turning Winter', 'staff.archon', 57,
    'The weather-wives turned the seasons with it. They stopped at winter and nobody has found the next notch.',
    [['coldDamage', 1.1], ['energy', 1], ['coldResist', 0.8]],
    { classId: 'mage', bend: { skill: 'frozenOrb', more: 25, grow: { radius: 40, duration: 30 } },
      look: D('crystal.frost|0xd0e8ff', 'cloth.silk|0x2a3a5a', 'metal.silver', ['crystals', 'stars'], 0.1, { cut: { kind: 'archon', wrap: 'wire' }, finish: 'frosted' }),
      from: 'rimeheart_valdr' }),

  U('uq.elderspatience', "The Elder's Patience", 'staff.elder', 65,
    'The council\'s eldest walked with it for ninety years and never once hurried.',
    [['energy', 1], ['manaRegen', 1], ['life', 0.8]],
    { hook: 'Your cooldowns come round faster.', power: 'voidCooldown', mag: 1.2,
      look: D('wood.oak|0x5a4a3a', 'cloth.wool|0x4a3a2a', 'metal.gold', ['laurels', 'runes'], 0.4, { cut: { kind: 'elder', wrap: 'cloth' } }) }),

  U('uq.stillwick', 'Stillwick', 'staff.elder', 69,
    'Mother Wick keeps her stair lamps lit with it. The flames on it do not flicker, even in a draught.',
    [['fireDamage', 1], ['energy', 1], ['fireResist', 0.8]],
    { hook: 'Mana comes back fast to a quiet mind, and there is less of it.', power: 'quietMind', mag: 1.2,
      look: D('wood.polished|0x8a6a3a', 'cloth.linen|0xd8c8a0', 'metal.brass', ['flames', 'chains'], 0.3, { cut: { kind: 'elder', wrap: 'wire' } }),
      from: 'mother_wick' }),

  U('uq.wireroot', 'Wireroot', 'staff.eldritch', 78,
    'Struck so many times on the hilltop that the wood turned to copper from the inside out.',
    [['lightningDamage', 1.3], ['energy', 1], ['skillLevels', 1, 1], ['lightningResist', 0.8]],
    { hook: 'Every spell you cast becomes lightning.', power: 'convertLightning',
      look: D('metal.copper|0xb8784a', 'wood.charred', 'metal.verdigris', ['coils', 'bolts', 'vines'], 0.3, { cut: { kind: 'eldritch', wrap: 'wire' }, glow: 0x9ad8ff, stone: 0x9ad8ff }),
      from: 'thessaly_vane' }),

  U('uq.rootmother', 'Rootmother', 'staff.worldtree', 88,
    'A living limb of Vhoss, given willingly, which is the strangest thing about it.',
    [['energy', 1.1], ['life', 1.2], ['skillLevels', 1, 1], ['poisonResist', 1]],
    { hook: 'What you call stands taller and drinks from what it strikes.', power: 'hymnAura', mag: 1.5,
      look: D('wood.bark|0x5a4a2a', 'cloth.rag|0x3a4a2a', 'metal.verdigris', ['leaves', 'vines', 'antlers'], 0.3, { cut: { kind: 'worldtree', wrap: 'cord' }, glow: 0x9ae070, stone: 0x9ae070 }),
      from: 'treant_elder_vhoss' }),

  // ===========================================================================
  // Orbs
  // ===========================================================================
  U('uq.gutteragate', 'Agate from the Gutter', 'orb.cracked', 2,
    'A child found it in the drain and traded it for a pie. The baker has not slept well since.',
    [['mana', 1], ['manaRegen', 1], ['lightningResist', 1]],
    { hook: 'Cheap, cracked, and full of something.',
      look: D('crystal.gem|0x8a6a4a', undefined, 'metal.iron', ['cracks'], 0.7, {}) }),

  U('uq.kestreleye', "Kestrel's Eye", 'orb.eagle', 9,
    'A falconer\'s lens, ground to see a mouse from the top of the bell tower.',
    [['lightningDamage', 0.8], ['energy', 1], ['castSpeed', 0.8]],
    { hook: 'Every lightning hit gives a little mana back.', power: 'manaldHeal', mag: 1,
      look: D('crystal.gem|0xd8b86a', 'leather.fine', 'metal.brass', ['feathers', 'eyes'], 0.3, {}) }),

  U('uq.censerofrot', 'Censer of Rot', 'orb.sacred', 17,
    'The Choir swing it at the head of their procession. The smoke is sweet, and then it is not.',
    [['poisonDamage', 1], ['energy', 0.8], ['poisonResist', 0.8]],
    { classId: 'revenant', bend: { skill: 'poisonNova', more: 25, grow: { radius: 20 }, add: { poisonStacks: 2 } },
      look: D('metal.verdigris', 'metal.chain', 'bone.old', ['smoke', 'skulls'], 0.6, {}),
      from: 'choir_of_rot' }),

  U('uq.smokedglass', 'Smoked Glass', 'orb.smoked', 25,
    'Vaskel holds it up to watch the eclipse with. He has been watching for some years now.',
    [['mana', 1.1], ['energy', 1], ['arcaneResist', 0.8]],
    { hook: 'Blows land on your mana, and it is slow to come back.', power: 'inkskin', mag: 1,
      look: D('crystal.shadow|0x3a3a44', undefined, 'metal.dark', ['smoke', 'moons'], 0.2, {}),
      from: 'vaskel_glazier' }),

  U('uq.bottledsquall', 'Bottled Squall', 'orb.crystalline', 33,
    'A sailor caught a storm in a jar off the end of the pier, and the pier went with it.',
    [['lightningDamage', 1], ['energy', 0.9], ['castSpeed', 0.6]],
    { classId: 'mage', bend: { skill: 'tempestOrb', more: 20, grow: { splash: 30 }, names: { splash: 'burst' }, applies: { status: 'shocked', duration: 4, label: 'shock enemies' } },
      look: D('crystal.ice|0xa8c8e8', undefined, 'metal.copper', ['bolts', 'coils'], 0.15, {}) }),

  U('uq.coalinajar', 'Coal in a Jar', 'orb.glowing', 42,
    'A coal from the first furnace in the Works, kept alive in a jar for two hundred years by the night stokers.',
    [['fireDamage', 1.1], ['mana', 0.8], ['fireResist', 0.8]],
    { hook: 'When your mana runs low, fire feeds it.', power: 'fireFree', mag: 1.2,
      look: D('crystal.gem|0xd8501a', undefined, 'metal.dark', ['flames', 'cracks'], 0.4, {}),
      from: 'forgefather_hurn' }),

  U('uq.skyfurnace', 'Sky-Furnace', 'orb.heavenly', 52,
    'The weather on the hill used to rain fire once a year. Somebody caught the last of it.',
    [['fireDamage', 1.1], ['energy', 1], ['castSpeed', 0.6]],
    { classId: 'mage', bend: { skill: 'firestorm', more: 20, grow: { radius: 20, duration: 25 } },
      look: D('crystal.gem|0xffa040', undefined, 'metal.gold', ['flames', 'stars'], 0.1, {}),
      from: 'ashen_prophet' }),

  U('uq.wardofuln', 'Ward of Uln', 'orb.eldritch', 60,
    'One of Uln\'s eyes, closed. It is still watching, from the inside.',
    [['energy', 1], ['mana', 1], ['arcaneDamage', 0.8]],
    { hook: 'Spells slide off you. Steel does not.', power: 'spellward', mag: 1,
      look: D('flesh.pale|0xc8b0a8', undefined, 'metal.voidgold', ['eyes', 'runes'], 0.3, {}),
      from: 'gaze_of_uln' }),

  U('uq.choirheart', 'Heart of the Furnace Choir', 'orb.demonheart', 68,
    'The Furnace Choir sing with one voice. This is where the voice was.',
    [['fireDamage', 1], ['coldDamage', 0.8], ['lightningDamage', 0.8], ['energy', 0.8]],
    { hook: 'All your elements burn hotter.', power: 'elePierce', mag: 1.5,
      look: D('flesh.demon|0x8a2a1a', undefined, 'metal.bloodgold', ['flames', 'cracks'], 0.4, {}),
      from: 'furnace_choir' }),

  U('uq.brittlemercy', 'Brittle Mercy', 'orb.vortex', 77,
    'Cracked glass with frost inside. Grandmother Thaw gives it to the ones she likes, so they go quickly.',
    [['coldDamage', 1.3], ['energy', 1], ['skillLevels', 1, 1], ['coldResist', 0.8]],
    { hook: 'Your cold cuts much deeper.', power: 'coldPierce', mag: 1.5,
      look: D('crystal.frost|0xe0f0ff', undefined, 'metal.silver', ['frost', 'cracks'], 0.2, { glow: 0xb8e8ff, stone: 0xb8e8ff }),
      from: 'grandmother_thaw' }),

  // ===========================================================================
  // Scepters
  // ===========================================================================
  U('uq.beadlerod', "The Beadle's Rod", 'scepter.scepter', 6,
    'The parish beadle kept order at services with it. Order was kept.',
    [['lifeRegen', 1], ['manaRegen', 1], ['defense', 0.8], ['fireResist', 0.8]],
    { hook: 'A little of everything a long sermon needs.',
      look: D('metal.brass', 'wood.polished', 'metal.iron', ['crowns', 'rivets'], 0.4, { cut: { kind: 'crown' } }),
      from: 'sister_abelline' }),

  U('uq.abellinethurible', "Abelline's Thurible", 'scepter.sprinkler', 15,
    'Sister Abelline blessed the dead with it, and then went on blessing them until they got up.',
    [['fireDamage', 0.8], ['vitality', 1], ['mana', 0.6]],
    { classId: 'paladin', bend: { skill: 'hurlCenser', more: 25, grow: { range: 25, duration: 30 } },
      look: D('metal.silver|0xc8c0b0', 'metal.chain', 'metal.gold', ['smoke', 'chains'], 0.3, { cut: { kind: 'sprinkler' } }),
      from: 'sister_abelline' }),

  U('uq.hourbell', 'The Hour Bell', 'scepter.divine', 40,
    'Rung on every hour of every day at the chapel for a century. Then it rang once more, at no hour at all.',
    [['enhancedDamage', 0.8], ['vitality', 1], ['lightningResist', 0.8]],
    { classId: 'paladin', bend: { skill: 'tollingBell', more: 20, grow: { radius: 30, ring: 30 } },
      look: D('metal.bronze|0xa88a4a', 'leather.fine', 'metal.gold', ['bells', 'halo'], 0.35, { cut: { kind: 'divine' } }),
      from: 'brass_abbot' }),

  U('uq.glasssermon', 'The Glass Sermon', 'scepter.mirrored', 55,
    'Vaskel blew it from the windows of the chapel he broke. It still shows the saints, backwards.',
    [['castSpeed', 0.8], ['energy', 1], ['arcaneResist', 1]],
    { hook: 'Faster in every way.', power: 'fanaticism', mag: 1,
      look: D('crystal.gem|0xb8d8e8', 'leather.fine|0x2a2a3a', 'metal.silver', ['crystals', 'halo'], 0.15, { cut: { kind: 'mirrored' } }),
      from: 'vaskel_glazier' }),

  U('uq.physicianrod', "The Physician's Rod", 'scepter.caduceus', 66,
    'The town physician\'s staff of office. The snakes on it were carved, and then they were not.',
    [['life', 1], ['vitality', 1], ['poisonResist', 1]],
    { hook: 'Heals you steadily, and slows your hand.', power: 'slowBlood', mag: 1.2,
      look: D('metal.gold|0xd8b860', 'leather.fine|0x2a3a2a', 'metal.silver', ['serpents', 'wings'], 0.2, { cut: { kind: 'caduceus' } }) }),

  U('uq.morningoffice', 'The Morning Office', 'scepter.solar', 80,
    'Carried at the dawn service. The dawn has not come down this far in living memory, so it is carried anyway.',
    [['vitality', 1.1], ['enhancedDamage', 1], ['skillLevels', 1, 1], ['fireResist', 1]],
    { hook: 'Once in a while, death is turned back at the door.', power: 'cheatDeath', mag: 1,
      look: D('metal.gold', 'cloth.white', 'metal.silver', ['halo', 'stars'], 0.05, { cut: { kind: 'solar' }, glow: 0xffe090, stone: 0xffe090 }),
      from: 'saint_ossery' }),

  // ===========================================================================
  // Shields
  // ===========================================================================
  U('uq.potlid', 'Pot Lid', 'shield.buckler', 2,
    'The cook from the Stairhead inn held off a whole cellar of rats with it, and then made a stew.',
    [['blockChance', 1], ['attackSpeed', 0.8], ['dexterity', 0.6]],
    { hook: 'Quick to raise, quick to swing behind.',
      look: D('metal.copper|0x9a6a4a', 'leather.worn', 'metal.iron', ['rivets'], 0.7, { cut: { outline: 'round', face: 'rings' }, finish: 'weathered' }) }),

  U('uq.lockjaw', 'Lockjaw', 'shield.small', 6,
    'Round, with a ring of iron teeth round the rim. The smith said it was decoration.',
    [['blockChance', 0.8], ['defense', 1], ['strength', 0.6]],
    { hook: 'A block bites back.', power: 'blockReflect', mag: 0.6,
      look: D('wood.planks|0x6a5038', 'leather.worn', 'metal.iron', ['teeth', 'rivets'], 0.6, { cut: { outline: 'round', face: 'spokes' } }) }),

  U('uq.ribcage', 'Ribcage', 'shield.bone', 10,
    'Gharruth gave it to his first knight. It is the only thing about the first knight that is left.',
    [['life', 1], ['poisonResist', 1.2], ['lifeRegen', 0.8]],
    { hook: 'For holding a doorway in the crypt.',
      look: D('bone.old', 'leather.hide', 'metal.dark', ['bones', 'skulls'], 0.6, { cut: { face: 'spine' } }),
      from: 'boneking_gharruth' }),

  U('uq.ballast', 'Ballast', 'shield.kite', 13,
    'A shield made from the ballast plate of a barge that sank at its mooring. It sank there for a reason.',
    [['defense', 1], ['blockChance', 0.8], ['life', 0.6]],
    { hook: 'Nothing moves you. You do not move much either.', power: 'anchor', mag: 0.8,
      look: D('metal.iron|0x4a4a4a', 'leather.worn', 'metal.rusted', ['barnacles', 'rivets'], 0.8, { cut: { outline: 'kite', face: 'planks' } }),
      from: 'sallow_twins' }),

  U('uq.throwndoor', 'The Thrown Door', 'shield.tower', 19,
    'The Queen of Hinges threw a door at an intruder, and he kept it. It still has the knocker on.',
    [['defense', 1], ['strength', 0.8], ['blockChance', 0.6]],
    { classId: 'warden', bend: { skill: 'shieldThrow', more: 25, add: { bounces: 2 } },
      look: D('wood.planks|0x5a4a3a', 'metal.chain', 'metal.iron', ['rivets', 'chains'], 0.65, { cut: { outline: 'tower', face: 'planks' } }),
      from: 'queen_of_hinges' }),

  U('uq.hedgehog', 'Hedgehog', 'shield.defender', 25,
    'Studded with spikes on both sides, which made it hard to carry and hard to argue with.',
    [['defense', 1], ['vitality', 0.8], ['physicalResist', 0.6]],
    { hook: 'Whatever hits you in close is hurt for it.', power: 'thorns', mag: 1,
      look: D('metal.steel|0x7a7a78', 'leather.studded', 'metal.dark', ['spikes', 'rivets'], 0.5, { cut: { outline: 'round', face: 'rivets' } }) }),

  U('uq.barredgate', 'The Barred Gate', 'shield.round', 29,
    'The bar from the chapel gate, fixed to a shield when the gate was burned. It still holds things out.',
    [['defense', 1], ['vitality', 1], ['blockChance', 0.6]],
    { classId: 'paladin', bend: { skill: 'barTheDoor', grow: { duration: 30, block: 30, dr: 30 } },
      look: D('wood.oak|0x6a4a2a', 'metal.chain', 'metal.iron', ['chains', 'rivets'], 0.55, { cut: { outline: 'round', face: 'cross' } }),
      from: 'holloway_stair' }),

  U('uq.grimface', 'Grimface', 'shield.grim', 33,
    'A face beaten into iron by a man who hated his brother. You can see the brother in it.',
    [['defense', 1], ['strength', 1], ['life', 0.6]],
    { hook: 'Steel bounces off. Fire and frost come through.', power: 'ironHide', mag: 1,
      look: D('metal.blackiron', 'leather.dark', 'metal.iron', ['horns', 'teeth'], 0.6, { cut: { outline: 'grim', face: 'skull' }, finish: 'blackened' }) }),

  U('uq.wyrmscaleward', 'Wyrmscale Ward', 'shield.dragon', 36,
    'Faced with a single scale off the saltwyrm. It turned fire and frost both, which the wyrm never needed.',
    [['fireResist', 1.4], ['coldResist', 1.4], ['blockChance', 0.8], ['life', 0.6]],
    { hook: 'Turns the weather, whatever the weather is.',
      look: D('bone.pale|0xd8d0c0', 'leather.fine|0x2a3a3a', 'metal.silver', ['scales', 'barnacles'], 0.4, { cut: { outline: 'dragon', face: 'scales' } }),
      from: 'gaellach_saltwyrm' }),

  U('uq.standingwall', 'The Standing Wall', 'shield.pavise', 43,
    'The last piece of the old town wall that anyone could lift. They lifted it.',
    [['defense', 1.1], ['vitality', 1], ['damageReduction', 0.6]],
    { classId: 'warden', bend: { skill: 'aegis', grow: { absorb: 40, duration: 30 } },
      look: D('stone.town|0x9a948a', 'leather.hide', 'metal.iron', ['cracks', 'rivets'], 0.7, { cut: { outline: 'pavise', face: 'ridge' } }),
      from: 'warden_gorm' }),

  U('uq.arrowcatch', 'Arrowcatch', 'shield.heater', 50,
    'Carried at the siege of the Gate, and never once cleaned. You can count the archers.',
    [['defense', 1], ['blockChance', 1], ['dexterity', 0.6]],
    { hook: 'Arrows and spells hit you far softer.', power: 'rangedDR', mag: 1,
      look: D('metal.steel', 'cloth.undyed', 'metal.bronze', ['arrows', 'rivets'], 0.8, { cut: { outline: 'heater', face: 'ridge' } }),
      from: 'iron_conqueror' }),

  U('uq.moonward', 'Moonward', 'shield.luna', 54,
    'Silvered by moonlight, the makers said. Silvered by silver, said the people who paid for it.',
    [['defense', 1], ['energy', 0.8], ['coldResist', 1]],
    { hook: 'While you are untouched, a ward builds around you.', power: 'overhealShield', mag: 1,
      look: D('metal.silver|0xd8dce8', 'leather.fine|0x1a1a3a', 'metal.silver', ['moons', 'stars'], 0.1, { cut: { outline: 'luna', face: 'moon' }, finish: 'polished' }) }),

  U('uq.trollbower', "The Troll's Bower", 'shield.trollnest', 58,
    'A troll built a nest out of shields and slept in it for a century. This was the bottom of the nest.',
    [['life', 1.2], ['defense', 1], ['strength', 0.8]],
    { hook: 'Thick-headed and hard to kill. Slow to think.', power: 'hardHead', mag: 1.2,
      look: D('wood.bark', 'leather.hide', 'bone.old', ['bones', 'leaves', 'vines'], 0.85, { cut: { face: 'nest' } }) }),

  U('uq.regentshield', "The Regent's Shield", 'shield.monarch', 62,
    'Carried for the young king through his whole reign. He was nine, and his reign was very short.',
    [['blockChance', 1.2], ['damageReduction', 1], ['strength', 1], ['manaRegen', 1]],
    { hook: 'A shield for one who must not fall.',
      look: D('metal.gold|0xc8a858', 'cloth.banner|0x2a1a5a', 'metal.silver', ['crowns', 'gilded'], 0.2, { cut: { outline: 'monarch', face: 'crown' }, finish: 'gilt' }) }),

  U('uq.lastdoorout', 'The Last Door Out', 'shield.aegis', 70,
    'Vey opens a door for everyone, once. This is the door Vey keeps for itself.',
    [['defense', 1.1], ['blockChance', 1], ['skillLevels', 1, 1], ['life', 0.8]],
    { hook: 'When a blow leaves you near death, you are elsewhere.', power: 'panicBlink',
      look: D('wood.planks|0x3a2a22', 'metal.chain', 'metal.voidgold', ['chains', 'eyes'], 0.4, { cut: { face: 'cross' }, glow: 0x9a70ff, stone: 0x9a70ff }),
      from: 'warden_vey' }),

  U('uq.longwatch', 'The Long Watch', 'shield.aeons', 86,
    'The watchman on the last landing has stood behind it since before the town had a name.',
    [['defense', 1.2], ['blockChance', 1], ['skillLevels', 1, 1], ['lifeRegen', 1]],
    { hook: 'While untouched, a great ward builds around you.', power: 'overhealShield', mag: 2,
      look: D('metal.mithril', 'cloth.banner|0x1a2a4a', 'metal.gold', ['stars', 'halo', 'runes'], 0.1, { cut: { face: 'clock' }, glow: 0xd8e0ff, stone: 0xd8e0ff }) }),
];
