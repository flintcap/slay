/**
 * SLAY — depth uniques, batch D: helms, chest armour and gloves.
 *
 * Forty-three pieces. Eleven bend a skill: the Knight's War Stomp and
 * Massacre, the Paladin's Anvilfall, the Rogue's Venom Dart and Shadow
 * Clone, the Ranger's Snare Trap, the Revenant's Bone Armor and Siphon Life,
 * and the Shapeshifter's Call the Pack, Reaping Swipe and Killing Dance.
 */
import type { UniqueDef } from '../uniques';
import { D, U } from './kit';
import { tr } from '../../core/I18n';

export const BATCH_D: UniqueDef[] = [
  // ===========================================================================
  // Helms
  // ===========================================================================
  U('uq.lampblackcap', tr('Lampblack Cap'), 'helm.cap', 3,
    tr('A miner\'s cap, so black with soot that the lamp on the front is the only thing you can see of it.'),
    [['magicFind', 1], ['coldResist', 1], ['life', 0.6]],
    { hook: tr('For the dark and the cold below the second tier.'),
      look: D('cloth.wool|0x1a1a1a', 'leather.worn', 'metal.brass', ['rivets'], 0.8, { finish: 'matte' }) }),

  U('uq.bucket', tr('The Bucket'), 'helm.helm', 9,
    tr('A milk pail with two eye holes cut in it. The farmhand who wore it held the barn door against the brood all night.'),
    [['defense', 1], ['vitality', 1], ['life', 0.6]],
    { hook: tr('Nothing knocks you off your feet.'), power: 'unstoppable',
      look: D('metal.iron|0x7a7a78', 'leather.worn', 'metal.rusted', ['rivets', 'cracks'], 0.85, { finish: 'weathered' }),
      from: 'broodmother_saelith' }),

  U('uq.ossuarylid', tr('Ossuary Lid'), 'helm.bone', 13,
    tr('The lid of a bone box from the crypt, fitted with a strap. Its owner kept the box.'),
    [['energy', 1], ['mana', 1], ['poisonResist', 1], ['defense', 0.6]],
    { hook: tr('For the one who talks to the dead.'),
      look: D('bone.old', 'leather.dark', 'metal.dark', ['bones', 'runes'], 0.6, {}),
      from: 'archivist_moln' }),

  U('uq.prenticeband', tr("The Prentice's Band"), 'helm.circlet', 15,
    tr('Every apprentice at the old school was given one. The good ones grew into it.'),
    [['energy', 1], ['mana', 0.8], ['castSpeed', 0.6]],
    { hook: tr('It grows sharper as you do.'), power: 'critPerLevel', mag: 0.5,
      look: D('metal.copper', undefined, 'metal.silver', ['runes'], 0.3, { stone: 0x5aa0d8 }) }),

  U('uq.wolfmothercap', tr("Wolfmother's Cap"), 'helm.skullcap', 18,
    tr('Vess the hound-master wore a wolf\'s skull for a hat, and the wolves followed it, not him.'),
    [['life', 1], ['strength', 0.8], ['dexterity', 0.6]],
    { classId: 'shapeshifter', bend: { skill: 'callThePack', grow: { lifePct: 30 }, add: { count: 1 }, names: { count: 'wolves' } },
      look: D('bone.old|0xd0c0a0', 'leather.hide|0x5a4a3a', undefined, ['teeth', 'tatters'], 0.6, {}),
      from: 'hound_master_vess' }),

  U('uq.firewatchhelm', tr('Firewatch Helm'), 'helm.full', 31,
    tr('Worn by the watchmen in the bell tower who looked for fires on the hill. They did not feel the cold up there.'),
    [['defense', 1], ['life', 0.9], ['lightningResist', 0.8]],
    { hook: tr('Frost cannot hold you. Fire finds you easier.'), power: 'warmBlood', mag: 1,
      look: D('metal.steel|0x8a5a4a', 'leather.fine|0x5a1a10', 'metal.copper', ['flames', 'rivets'], 0.5, {}) }),

  U('uq.earthbreakerbrow', tr("Earthbreaker's Brow"), 'helm.grim', 37,
    tr('A helm with a brow like a ploughshare, made for a man who led with his head and his feet.'),
    [['strength', 1], ['life', 0.9], ['defense', 0.7]],
    { classId: 'warden', bend: { skill: 'warStomp', more: 25, grow: { radius: 25 }, add: { stun: 0.5 } },
      look: D('metal.blackiron', 'leather.fine|0x9a6a3a', 'metal.iron', ['horns', 'cracks'], 0.6, { finish: 'blackened' }),
      from: 'colossus_of_the_deep' }),

  U('uq.mirrorcrown', tr('Mirrorcrown'), 'helm.coronet', 39,
    tr('Vaskel set it with slivers of a broken mirror. The wearer is never quite alone in the reflections.'),
    [['dexterity', 1], ['critChance', 0.8], ['life', 0.6]],
    { classId: 'shadowblade', bend: { skill: 'shadowClone', grow: { damagePct: 30, lifePct: 30 }, add: { baseCap: 1 }, names: { baseCap: 'clones' } },
      look: D('metal.silver|0xd0d4dc', undefined, 'metal.dark', ['crystals', 'crowns'], 0.15, { finish: 'polished' }),
      from: 'vaskel_glazier' }),

  U('uq.courierscasque', tr("The Courier's Casque"), 'helm.casque', 43,
    tr('The post riders between the tiers wore these, before there were no more letters to carry.'),
    [['attackSpeed', 1], ['castSpeed', 1], ['moveSpeed', 0.8], ['damageReduction', 0.6]],
    { hook: tr('For the one who must arrive, and quickly.'),
      look: D('metal.steel', 'leather.fine|0x3a2a1a', 'metal.brass', ['wings', 'feathers'], 0.4, {}) }),

  U('uq.oldguard', tr('The Old Guard'), 'helm.great', 56,
    tr('The last helm of the last company of the town guard. It has stood every watch since, empty.'),
    [['defense', 1.1], ['strength', 0.8], ['physicalResist', 0.8]],
    { hook: tr('The longer you serve, the harder you are to kill.'), power: 'lifePerLevel', mag: 1,
      look: D('metal.steel|0x9a9aa0', 'cloth.banner|0x2a3a6a', 'metal.bronze', ['laurels', 'rivets'], 0.55, {}),
      from: 'warden_pike' }),

  U('uq.seventhspire', tr('The Seventh Spire'), 'helm.spired', 63,
    tr('Ordrach raised seven spires over his seals. The seventh was a helm, because he wanted to wear one.'),
    [['energy', 1], ['mana', 1], ['life', 0.7]],
    { hook: tr('Spells slide off you. Steel does not.'), power: 'spellward', mag: 1.2,
      look: D('metal.dark|0x3a3448', 'cloth.silk|0x2a1a3a', 'metal.voidgold', ['spikes', 'runes'], 0.3, {}),
      from: 'lich_of_seven_seals' }),

  U('uq.clockworkdiadem', tr('Clockwork Diadem'), 'helm.diadem', 66,
    tr('Wren the Cog-Abbess wound it every morning at prayers. It has not been wound in a long time, and it is still ticking.'),
    [['castSpeed', 1], ['energy', 0.9], ['lightningResist', 1]],
    { hook: tr('Your cooldowns come round faster.'), power: 'voidCooldown', mag: 1,
      look: D('metal.brass|0xc8a050', undefined, 'metal.gold', ['coils', 'crowns'], 0.2, { finish: 'polished', stone: 0x40a0ff }),
      from: 'warden_cog' }),

  U('uq.hurryingcrown', tr('The Hurrying Crown'), 'helm.diadem', 72,
    tr('Worn by the regent who ruled for a single day and got more done in it than the kings before her.'),
    [['attackSpeed', 1], ['energy', 0.8], ['skillLevels', 1, 1], ['life', 0.8]],
    { hook: tr('Faster in every way.'), power: 'fanaticism', mag: 1.2,
      look: D('metal.gold', undefined, 'metal.silver', ['wings', 'gilded'], 0.1, { finish: 'gilt', glow: 0xffe080, stone: 0xffe080 }),
      from: 'duchess_imeris' }),

  U('uq.unmadekings', tr('Crown of Unmade Kings'), 'helm.corona', 87,
    tr('A black iron circlet with three empty settings. Three kings were meant to wear it. None of them were ever crowned.'),
    [['skillLevels', 2, 2], ['life', 1], ['defense', 0.8], ['fireResist', 0.8], ['coldResist', 0.8]],
    { hook: tr('Each empty setting is waiting for a king.'), sockets: 3,
      look: D('metal.blackiron', 'cloth.velvet|0x8a1a2a', 'metal.dark', ['crowns', 'spikes'], 0.3, { finish: 'blackened', glow: 0xff7030, stone: 0xff7030 }),
      from: 'the_gaunt_king' }),

  // ===========================================================================
  // Chest armour
  // ===========================================================================
  U('uq.eiderdown', tr('Eiderdown'), 'chest.quilted', 2,
    tr('A quilt from the inn\'s best bed, cut and stitched into a coat the winter the firewood ran out.'),
    [['life', 1], ['coldResist', 1.2], ['lifeRegen', 0.8]],
    { hook: tr('Warm, soft, and better than it looks.'),
      look: D('cloth.wool|0xd8c8a8', 'cloth.linen', 'metal.brass', ['tatters', 'feathers'], 0.5, { finish: 'matte' }) }),

  U('uq.weighingcoat', tr('The Weighing Coat'), 'chest.leather', 6,
    tr('A merchant\'s coat over mail, with brass scale pins on the lapels. He weighed everything, including his customers.'),
    [['goldFind', 1.2], ['defense', 1], ['life', 0.6]],
    { hook: tr('Gold picked up heals you a little.'), power: 'goldToLife', mag: 0.8,
      look: D('leather.fine|0x5a3a1a', 'cloth.velvet|0x2a1a3a', 'metal.brass', ['coins', 'chains'], 0.4, {}),
      from: 'gilt_leviathan' }),

  U('uq.coalmanmail', tr("The Coalman's Mail"), 'chest.ringmail', 11,
    tr('A ring shirt worn under a coal sack for thirty years. The coal dust has filled every ring.'),
    [['defense', 1], ['strength', 0.8], ['fireResist', 0.8]],
    { hook: tr('Heavy enough to stand in, too heavy to run in.'), power: 'heavyTread', mag: 0.7,
      look: D('metal.chainmail|0x2a2a2a', 'cloth.rags|0x2a2620', 'metal.dark', ['rivets'], 0.85, { finish: 'matte' }) }),

  U('uq.herringmail', tr('Herring-Mail'), 'chest.scale', 15,
    tr('Scales of the big fen fish, stitched on canvas by the fishwives. It still smells of the market.'),
    [['defense', 1], ['fireResist', 1], ['lightningResist', 1], ['moveSpeed', -0.6]],
    { hook: tr('Turns the weather and slows the step.'),
      look: D('bone.pale|0xc8d0c8', 'cloth.linen|0x6a7a6a', 'metal.verdigris', ['scales', 'barnacles'], 0.55, {}),
      from: 'tidewarden_nheru' }),

  U('uq.morningmuster', tr('Breastplate of the Morning Muster'), 'chest.plate', 19,
    tr('The guard lined up at dawn and were counted. This was always polished, and always counted.'),
    [['defense', 1.1], ['vitality', 1], ['blockChance', 0.6]],
    { hook: tr('While you are untouched, a ward builds around you.'), power: 'overhealShield', mag: 0.6,
      look: D('metal.steel|0xc0c4cc', 'leather.fine', 'metal.brass', ['laurels', 'rivets'], 0.2, { finish: 'polished' }),
      from: 'warden_pike' }),

  U('uq.gravelinen', tr('Grave Linen'), 'chest.ghost', 26,
    tr('A shroud that would not stay on its body. Mirelle made a robe of it, and it stayed on her.'),
    [['energy', 1], ['coldResist', 1], ['life', 0.6]],
    { hook: tr('Hard to hit from afar. Easier to hurt up close.'), power: 'thinAir', mag: 1,
      look: D('cloth.linen|0xd8d8d0', 'cloth.tattered', undefined, ['tatters', 'ghost'], 0.6, {}),
      from: 'mirelle_unburied' }),

  U('uq.cutpursejerkin', tr("Cutpurse's Jerkin"), 'chest.studded', 29,
    tr('Twenty pockets inside, none of them the jerkin owner\'s own.'),
    [['dexterity', 1], ['lifeSteal', 0.8], ['poisonResist', 1], ['attackSpeed', 0.6]],
    { hook: tr('For the one who is in and out before the shout.'),
      look: D('leather.dark|0x2a2420', 'cloth.silk|0x5a1a1a', 'metal.dark', ['rivets', 'tatters'], 0.45, {}),
      from: 'gutterking_rusk' }),

  U('uq.charnelmail', tr('Charnel Mail'), 'chest.chainmail', 34,
    tr('Mail made of finger bones wired together. It rattles when there is no wind.'),
    [['energy', 1], ['defense', 1], ['life', 0.7]],
    { classId: 'revenant', bend: { skill: 'boneArmor', grow: { absorb: 40, duration: 30 } },
      look: D('bone.bleached', 'cloth.tattered|0x2a2a2a', 'metal.dark', ['bones', 'skulls'], 0.5, {}),
      from: 'boneking_gharruth' }),

  U('uq.barkhide', tr('Barkhide'), 'chest.splint', 39,
    tr('Splints of living bark, grown onto the wearer by a hedge witch who knew her trade too well.'),
    [['life', 1], ['strength', 0.8], ['poisonResist', 0.8]],
    { classId: 'shapeshifter', bend: { skill: 'reapingSwipe', more: 25, add: { maxTargets: 2 }, grow: { radius: 20 } },
      look: D('wood.bark', 'leather.hide', 'bone.old', ['leaves', 'antlers'], 0.6, {}),
      from: 'treant_elder_vhoss' }),

  U('uq.cathedralplate', tr('Cathedral Plate'), 'chest.gothic', 45,
    tr('The chapel\'s founders wore it under their robes. The robes are gone. The founders are still in it.'),
    [['defense', 1.1], ['strength', 1], ['lightningResist', 0.8]],
    { hook: tr('Very hard to knock down, and very slow to get moving.'), power: 'heavyTread', mag: 1,
      look: D('metal.steel|0x9a9aa8', 'cloth.white', 'metal.gold', ['spikes', 'laurels'], 0.4, {}),
      from: 'saint_ossery' }),

  U('uq.duskweave', tr('Duskweave'), 'chest.dusk', 53,
    tr('Woven from the last light of the evening by somebody who could not sleep.'),
    [['energy', 1], ['mana', 1], ['coldResist', 0.8]],
    { hook: tr('Part of every blow is paid from your mana.'), power: 'manaShield', mag: 0.5,
      look: D('cloth.silk|0x2a1a3a', 'cloth.velvet|0x1a1428', 'metal.silver', ['moons', 'stars'], 0.15, {}) }),

  U('uq.saltwyrmhide', tr('Saltwyrm Hide'), 'chest.wyrmhide', 57,
    tr('A shed skin of Gaellach, white with salt. It still crackles when it bends.'),
    [['fireResist', 1.4], ['poisonResist', 1.4], ['life', 1], ['strength', 0.6]],
    { hook: tr('Fire and rot both find it hard going.'),
      look: D('leather.hide|0xd8d4c8', 'cloth.linen', 'metal.silver', ['scales', 'cracks'], 0.5, {}),
      from: 'gaellach_saltwyrm' }),

  U('uq.choirweave', tr('Choirweave'), 'chest.boneweave', 61,
    tr('Woven from the bones of the Choir\'s lost voices. You can hear them when you breathe in.'),
    [['life', 1], ['energy', 0.8], ['poisonResist', 1]],
    { hook: tr('Your life comes back, always, fight or no fight.'), power: 'combatRegen', mag: 1,
      look: D('bone.old|0xc8c0a8', 'cloth.tattered', 'metal.verdigris', ['bones', 'bells'], 0.55, {}),
      from: 'choir_of_rot' }),

  U('uq.barnaclecoat', tr('Barnacle Coat'), 'chest.kraken', 65,
    tr('Vareth-Kar wore it on the sea floor for so long the barnacles grew three deep.'),
    [['defense', 1.2], ['life', 1], ['coldResist', 1]],
    { hook: tr('Hard as a reef, and as slow.'), power: 'stoneSkin', mag: 1.4,
      look: D('stone.sunken|0x3a5a5a', 'leather.dark|0x1a2a2a', 'metal.verdigris', ['barnacles', 'serpents'], 0.75, {}),
      from: 'colossus_of_the_deep' }),

  U('uq.penitentrobe', tr("The Penitent's Robe"), 'chest.sacred', 69,
    tr('Saint Ossery wore it for a hundred years of penance. The air around it still feels heavy with what he was sorry for.'),
    [['life', 1], ['vitality', 1], ['fireResist', 0.8], ['coldResist', 0.8]],
    { hook: tr('The air drags at everything that comes near you.'), power: 'slowAura', mag: 1.2,
      look: D('cloth.linen|0x8a7a6a', 'cloth.rag', 'metal.iron', ['chains', 'bones'], 0.6, {}),
      from: 'saint_ossery' }),

  U('uq.shroudthatwaits', tr('The Shroud That Waits'), 'chest.aeonshroud', 83,
    tr('Laid out for someone who has not died yet. It will be ready when they do.'),
    [['energy', 1.1], ['mana', 1.2], ['skillLevels', 1, 1], ['life', 0.8]],
    { hook: tr('Blows land on your mana before your life.'), power: 'manaShield', mag: 1,
      look: D('cloth.silk|0xe0dcd8', 'cloth.white', 'metal.silver', ['ghost', 'stars'], 0, { glow: 0xd0e0ff, stone: 0xd0e0ff }),
      from: 'archivist_below' }),

  U('uq.lastlanding', tr('Plate of the Last Landing'), 'chest.archon', 86,
    tr('Taken off the knight who held the last landing of the stair. He took it off himself, and walked on down.'),
    [['defense', 1.2], ['life', 1.2], ['skillLevels', 1, 1], ['damageReduction', 0.8]],
    { hook: tr('Death asks for you, and is sent away. Sometimes.'), power: 'cheatDeath', mag: 1.5,
      look: D('metal.mithril', 'cloth.banner|0x3a1a1a', 'metal.gold', ['wings', 'laurels'], 0.15, { glow: 0xffd8a0, stone: 0xffd8a0 }),
      from: 'came_up_instead' }),

  // ===========================================================================
  // Gloves
  // ===========================================================================
  U('uq.countinggloves', tr('Counting Gloves'), 'gloves.leather', 3,
    tr('The tally-man at the Ford counted every coin that crossed the river in them. He never once got it wrong.'),
    [['attackSpeed', 1], ['goldFind', 1], ['dexterity', 0.6]],
    { hook: tr('Quick fingers, full pockets.'),
      look: D('leather.fine|0x6a4a2a', undefined, 'metal.brass', ['coins'], 0.5, {}) }),

  U('uq.scribemitts', tr("The Scribe's Mitts"), 'gloves.silk', 7,
    tr('Fingerless, so the scribe could write in the cold archive. Moln has the rest of the scribe.'),
    [['castSpeed', 1], ['mana', 1], ['fireResist', 0.8]],
    { hook: tr('For the one who works fast in the cold.'),
      look: D('cloth.wool|0x4a3a5a', undefined, 'metal.silver', ['runes'], 0.6, {}),
      from: 'archivist_moln' }),

  U('uq.trappergauntlets', tr("The Trapper's Gauntlets"), 'gloves.gauntlets', 13,
    tr('Iron gloves, so the jaws of his own traps could not take his fingers. They took his fingers anyway.'),
    [['dexterity', 1], ['defense', 0.8], ['life', 0.6]],
    { classId: 'ranger', bend: { skill: 'snareTrap', grow: { radius: 40 }, add: { root: 1 }, names: { root: tr('seconds held') } },
      look: D('metal.iron', 'leather.hide', 'metal.dark', ['teeth', 'chains'], 0.7, {}),
      from: 'hound_master_vess' }),

  U('uq.butcherknuckles', tr("The Butcher's Knuckles"), 'gloves.gauntlets', 17,
    tr('Grell wears these to work. He does not stop work.'),
    [['strength', 1], ['enhancedDamage', 0.6], ['life', 0.6]],
    { classId: 'warden', bend: { skill: 'massacre', more: 20, add: { hits: 2, bleedPerHit: 1 } },
      look: D('metal.steel|0x8a6a68', 'leather.fine|0x4a1414', 'metal.dark', ['blood', 'spikes'], 0.6, {}),
      from: 'butcher_grell' }),

  U('uq.anvilhands', tr('Anvil Hands'), 'gloves.heavy', 23,
    tr('Hurn\'s apprentices wore these until their hands were as hard as the gloves, and then they did not need them.'),
    [['strength', 1], ['vitality', 0.8], ['fireResist', 0.8]],
    { classId: 'paladin', bend: { skill: 'anvilfall', more: 25, add: { dents: 1 }, grow: { reach: 15 } },
      look: D('leather.dark|0x2a2018', undefined, 'metal.iron', ['rivets', 'cracks'], 0.65, {}),
      from: 'forgefather_hurn' }),

  U('uq.leechfingers', tr('Leechfingers'), 'gloves.vampirebone', 31,
    tr('Fingertips of hollow bone, each one open at the end. They are always a little warmer than you are.'),
    [['energy', 1], ['lifeSteal', 0.6], ['life', 0.6]],
    { classId: 'revenant', bend: { skill: 'siphonLife', more: 25, grow: { healPct: 30, range: 20 } },
      look: D('bone.pale', 'leather.fine|0xa08074', 'metal.bloodgold', ['claws', 'blood'], 0.4, {}),
      from: 'plaguelord_ossik' }),

  U('uq.dartmaker', tr("The Dartmaker's Grips"), 'gloves.war', 37,
    tr('Stained green to the wrist. The dartmaker said the stain would come out. It has not, and neither has the dartmaker.'),
    [['dexterity', 1], ['poisonDamage', 0.8], ['attackSpeed', 0.6]],
    { classId: 'shadowblade', bend: { skill: 'venomDart', more: 25, add: { poisonStacks: 2, pierce: 1 } },
      look: D('leather.fine|0x2a3a1a', undefined, 'metal.dark', ['vines', 'serpents'], 0.45, {}),
      from: 'hive_queen_zsarra' }),

  U('uq.dancingclaws', tr('Dancing Claws'), 'gloves.war', 42,
    tr('A bear-dancer\'s gloves from the spring fair, long nails and all. The bear was never seen to dance.'),
    [['dexterity', 1], ['strength', 0.8], ['life', 0.6]],
    { classId: 'shapeshifter', bend: { skill: 'killingDance', more: 20, add: { hits: 2 } },
      look: D('leather.hide|0x4a3a2a', undefined, 'bone.old', ['claws', 'tatters'], 0.55, {}),
      from: 'old_gristle' }),

  U('uq.kilnmothermitts', tr("Kilnmother's Mitts"), 'gloves.bramble', 49,
    tr('Fired clay plates on canvas, with cracks in the glaze and soot in the cracks. The Kiln Saint takes them off only to pray.'),
    [['fireDamage', 1.1], ['castSpeed', 0.8], ['strength', 0.6]],
    { hook: tr('Fire burns hotter. Frost bites deeper.'), power: 'emberBargain', mag: 1.2,
      look: D('stone.foundry|0xa86a4a', 'cloth.linen|0x4a3a2a', undefined, ['cracks', 'smoke'], 0.6, {}),
      from: 'kiln_saint' }),

  U('uq.inkandfrost', tr('Ink and Frost'), 'gloves.sorcerer', 58,
    tr('A copyist\'s gloves from the cold archive. The ink froze in the pen, and then in the copyist.'),
    [['coldDamage', 1], ['energy', 1], ['castSpeed', 0.6]],
    { hook: tr('Your blows turn to frost and starlight.'), power: 'convertColdArcane',
      look: D('cloth.silk|0x1a2a4a', 'leather.dark|0x101014', 'metal.silver', ['frost', 'runes'], 0.2, {}),
      from: 'archivist_below' }),

  U('uq.wallbreakers', tr('Wallbreakers'), 'gloves.ogre', 62,
    tr('Made for the men who pulled the old town wall down after the siege. They did it with their hands.'),
    [['strength', 1.2], ['enhancedDamage', 0.8], ['life', 0.8]],
    { hook: tr('Every blow carries into the ones beside it.'), power: 'cleave', mag: 1.5,
      look: D('leather.hide|0x5a4a3a', undefined, 'metal.iron', ['rivets', 'spikes'], 0.75, {}),
      from: 'iron_conqueror' }),

  U('uq.darkenedhand', tr('The Darkened Hand'), 'gloves.eclipse', 84,
    tr('Worn by the one who put out the sun over the town. Nobody saw who it was. Everybody saw the hand.'),
    [['lightningDamage', 1], ['attackSpeed', 1], ['skillLevels', 1, 1], ['critChance', 0.8]],
    { hook: tr('Every hit has a good chance to leap to another.'), power: 'chainLightning', mag: 1.5,
      look: D('leather.dark|0x101014', undefined, 'metal.voidgold', ['moons', 'bolts'], 0.1, { glow: 0x9a80ff, stone: 0x9a80ff }),
      from: 'void_herald_shessi' }),
];
