/**
 * SLAY — depth uniques, batch B: bows, crossbows, quivers and the great
 * two-handed weapons.
 *
 * Forty-nine pieces. Six bend a Ranger skill (Twin Shot, Ricochet, Arrow
 * Rain, Explosive Tip, Fan Fire, Darken the Sky) and two a Shapeshifter's
 * bear (Maul, Hammerfall).
 */
import type { UniqueDef } from '../uniques';
import { D, U } from './kit';

export const BATCH_B: UniqueDef[] = [
  // ===========================================================================
  // Bows
  // ===========================================================================
  U('uq.crowscarer', 'Crowscarer', 'bow.short', 3,
    'Brannoch Tull tied it to his scarecrow. It kept the crows off better than the scarecrow ever had.',
    [['attackRating', 1], ['goldFind', 1], ['moveSpeed', 0.8], ['dexterity', 0.6]],
    { hook: 'Keeps the birds off, and the rest of them.',
      look: D('wood.ash|0xa89878', 'cloth.rag|0x6a5a3a', undefined, ['feathers', 'tatters'], 0.75, { cut: { riser: 'plain', tips: 'nock', wrap: 'cord', depth: 0.06 }, finish: 'matte' }),
      from: 'warden_brannoch' }),

  U('uq.fenreed', 'Fen Reed', 'bow.long', 9,
    'Bent from a reed as thick as a wrist, cut where the water is blackest. It is lighter than it has any right to be.',
    [['dexterity', 1], ['attackSpeed', 0.8], ['poisonResist', 1]],
    { hook: 'Its arrows go through the first thing they meet.', power: 'pierce', mag: 0.6,
      look: D('wood.bark|0x6a7a4a', 'cloth.linen|0x5a6a4a', 'metal.verdigris', ['leaves', 'vines'], 0.5, { cut: { riser: 'shelf', tips: 'curl', wrap: 'cord', segments: 6 } }) }),

  U('uq.braceoflarks', 'Brace of Larks', 'bow.war', 16,
    'A fowler\'s bow from the hill farms, made to bring down two birds from one flock.',
    [['dexterity', 1], ['attackRating', 0.8], ['life', 0.6]],
    { classId: 'ranger', bend: { skill: 'twinShot', more: 25, add: { count: 1 }, names: { count: 'arrows' } },
      look: D('wood.polished|0x8a6a3a', 'leather.fine|0x5a3a1a', 'metal.brass', ['feathers', 'wings'], 0.35, { cut: { riser: 'winged', tips: 'horn', wrap: 'leather', recurve: 0.06 } }) }),

  U('uq.wallwalker', "The Wallwalker's Bow", 'bow.great', 22,
    'The town wall had archers once, on a walk along the top. The wall is gone. The walk is still there, in the air.',
    [['enhancedDamage', 1], ['dexterity', 0.9], ['lightningResist', 0.8]],
    { hook: 'Hard to hit from a distance, and hard to hit back.', power: 'thinAir', mag: 0.8,
      look: D('wood.oak|0x7a6a5a', 'cloth.banner|0x3a4a6a', 'metal.iron', ['rivets', 'tatters'], 0.6, { cut: { riser: 'heavy', tips: 'cap', wrap: 'cloth', bands: 3 } }),
      from: 'holloway_stair' }),

  U('uq.poacherspatience', "Poacher's Patience", 'bow.hunters', 25,
    'The Duchess hanged three poachers for using it. The fourth one kept it, and kept his head down.',
    [['critChance', 1], ['magicFind', 1], ['coldResist', 1], ['lifeRegen', 1]],
    { hook: 'For the one who can wait all night for a single shot.',
      look: D('wood.dark|0x3a2a1e', 'leather.hide|0x4a3a28', 'metal.dark', ['leaves', 'antlers'], 0.55, { cut: { riser: 'shelf', tips: 'horn', wrap: 'leather', reflex: 0.02 }, finish: 'matte' }),
      from: 'duchess_imeris' }),

  U('uq.skippingstone', 'Skipping Stone', 'bow.composite', 34,
    'Horn and sinew from the lake shore, where the children skip stones to see how far the ripples go.',
    [['dexterity', 1], ['attackSpeed', 0.8], ['lightningResist', 0.8]],
    { classId: 'ranger', bend: { skill: 'ricochet', more: 20, add: { bounces: 2 }, grow: { range: 25 } },
      look: D('bone.old|0xc8b898', 'leather.fine|0x2a3a4a', 'metal.silver', ['scales', 'runes'], 0.3, { cut: { riser: 'plain', tips: 'curl', wrap: 'wire', recurve: 0.09, angular: true } }) }),

  U('uq.twicestruck', 'The Twice-Struck', 'bow.double', 42,
    'Corvus Hale\'s crows always come back to him. So does everything shot from this.',
    [['enhancedDamage', 1], ['dexterity', 0.9], ['critChance', 0.7]],
    { hook: 'Every arrow strikes again on its way home.', power: 'returning', mag: 0.8,
      look: D('wood.charred|0x2a2228', 'cloth.silk|0x14141a', 'metal.dark', ['feathers', 'eyes'], 0.4, { cut: { riser: 'skull', tips: 'blade', wrap: 'cloth', double: true }, finish: 'blackened' }),
      from: 'corvus_hale' }),

  U('uq.webline', 'Webline', 'bow.spider', 50,
    'Strung with a single thread from the brood nest. Sae-lith noticed it was gone.',
    [['poisonDamage', 1.2], ['dexterity', 1], ['poisonResist', 0.8]],
    { hook: 'Its venom finds a way past any resistance.', power: 'poisonPierce', mag: 0.8,
      look: D('flesh.chitin|0x2a2a1a', 'cloth.silk|0xd8d8c8', 'metal.dark', ['spiders', 'web'], 0.3, { cut: { riser: 'winged', tips: 'blade', wrap: 'wire', segments: 8, barbs: 4 } }),
      from: 'broodmother_saelith' }),

  U('uq.hush', 'Hush', 'bow.shadow', 58,
    'A black bow with no shine on the string. The fletcher who made it never once raised his voice.',
    [['critDamage', 1.1], ['dexterity', 1], ['moveSpeed', 0.7]],
    { hook: 'A clean hit leaves the target open to everything.', power: 'critVulnerable', mag: 1,
      look: D('wood.dark|0x16141a', 'cloth.velvet|0x101014', 'metal.black', ['moons', 'smoke'], 0.1, { cut: { riser: 'plain', tips: 'nock', wrap: 'cloth', depth: 0.1 }, finish: 'matte' }),
      from: 'stalker_prime' }),

  U('uq.rimesight', 'Rimesight', 'bow.diamond', 67,
    'Valdr\'s hunters looked down it for so long their eyes frosted over. They said they could see further for it.',
    [['coldDamage', 1.2], ['dexterity', 1], ['coldResist', 1]],
    { hook: 'Its arrows carry the cold into the wound.', power: 'chillOnHit', mag: 0.8,
      look: D('crystal.ice|0xc8e4ff', 'leather.fine|0x2a3a5a', 'metal.silver', ['frost', 'crystals'], 0.05, { cut: { riser: 'winged', tips: 'crystal', wrap: 'wire' }, finish: 'frosted' }),
      from: 'rimeheart_valdr' }),

  U('uq.throughline', 'Throughline', 'bow.hydra', 78,
    'Drawn from the deep shaft where the old mine went down too far. Whatever was below stopped one of its arrows, once.',
    [['enhancedDamage', 1.2], ['dexterity', 1], ['skillLevels', 1, 1], ['attackSpeed', 0.7]],
    { hook: 'Every arrow goes on through.', power: 'pierce', mag: 1.4,
      look: D('bone.bleached', 'leather.dark', 'metal.voidgold', ['serpents', 'runes'], 0.2, { cut: { riser: 'heavy', tips: 'head', wrap: 'wire', segments: 10 }, glow: 0x70e0c0, stone: 0x70e0c0 }),
      from: 'deeps_own_name' }),

  // ===========================================================================
  // Crossbows
  // ===========================================================================
  U('uq.ratcatcher', "Ratcatcher's Latch", 'xbow.light', 4,
    'The town paid a copper a tail. One man made his fortune with this and a sack.',
    [['attackSpeed', 1], ['critChance', 1], ['poisonResist', 1]],
    { hook: 'Small, quick and very sure.',
      look: D('wood.planks|0x6a5a40', 'leather.worn', 'metal.iron', ['teeth', 'rivets'], 0.8, { cut: { prod: 0.24 }, finish: 'weathered' }),
      from: 'gutterking_rusk' }),

  U('uq.doorknocker', 'Doorknocker', 'xbow.crossbow', 12,
    'The bailiff\'s crossbow. He knocked once and then he did not knock again.',
    [['enhancedDamage', 0.9], ['strength', 0.8], ['defense', 0.6]],
    { hook: 'Every bolt knocks its target back.', power: 'knockback',
      look: D('wood.oak', 'leather.studded', 'metal.iron', ['rivets', 'chains'], 0.6, { cut: { sweep: 0.04 } }),
      from: 'warden_gorm' }),

  U('uq.longdrizzle', 'The Long Drizzle', 'xbow.repeating', 20,
    'Made by a fletcher who said the worst weather is not the storm but the rain that will not stop.',
    [['dexterity', 1], ['attackSpeed', 0.8], ['coldResist', 0.6]],
    { classId: 'ranger', bend: { skill: 'arrowRain', more: 20, grow: { radius: 25 }, add: { ticks: 3 }, names: { ticks: 'volleys' } },
      look: D('wood.polished|0x5a4a3a', 'cloth.linen|0x4a5a6a', 'metal.steel', ['rivets', 'feathers'], 0.4, {}) }),

  U('uq.hairtrigger', 'Hairtrigger', 'xbow.arbalest', 28,
    'The latch was filed so fine it goes off if you think about it too hard.',
    [['attackSpeed', 1.1], ['critChance', 0.8], ['dexterity', 0.8]],
    { hook: 'Fast to fire again. Slow to fill back up.', power: 'shortFuse', mag: 0.8,
      look: D('metal.brass|0xb89a5a', 'wood.dark', 'metal.copper', ['coils', 'rivets'], 0.3, { cut: { sweep: 0.1 }, finish: 'polished' }),
      from: 'brass_abbot' }),

  U('uq.quarrybreaker', 'Quarrybreaker', 'xbow.siege', 38,
    'The quarrymen used it to bring down rock faces from a safe distance. It was not always a safe distance.',
    [['enhancedDamage', 1], ['strength', 0.8], ['fireResist', 0.8]],
    { classId: 'ranger', bend: { skill: 'explosiveTip', more: 30, grow: { radius: 40 } },
      look: D('stone.granite|0x8a8478', 'wood.oak', 'metal.iron', ['cracks', 'rivets'], 0.7, { cut: { sw: 0.04 } }) }),

  U('uq.rattlebox', 'Rattlebox', 'xbow.chukonu', 45,
    'A repeating box that empties itself in a breath. You can hear it from the next tier.',
    [['attackSpeed', 1.4], ['lifeSteal', 0.8], ['fireResist', 1], ['life', -0.4]],
    { hook: 'Fires faster than anything else, and shakes you for it.',
      look: D('wood.polished|0x8a3a1a', 'leather.fine', 'metal.bronze', ['bells', 'rivets'], 0.45, {}) }),

  U('uq.copperhail', 'The Copper Hail', 'xbow.pellet', 54,
    'It throws copper shot that hums in the air. Azhek\'s storms follow the sound.',
    [['lightningDamage', 1.2], ['attackSpeed', 0.8], ['lightningResist', 1]],
    { hook: 'Its shot arcs on to the next one.', power: 'chainLightning', mag: 1,
      look: D('metal.copper', 'wood.dark', 'metal.verdigris', ['coils', 'bolts'], 0.35, { cut: { prod: 0.34 } }),
      from: 'stormcrown_azhek' }),

  U('uq.kilnbolt', 'Kiln Bolt', 'xbow.ballista', 63,
    'The Kiln Saint fires her bolts in the oven before she looses them. They are still hot when they land.',
    [['fireDamage', 1.2], ['enhancedDamage', 1], ['strength', 0.7]],
    { hook: 'Fire burns hotter for it, and cold cuts deeper.', power: 'emberBargain', mag: 1,
      look: D('stone.foundry|0x8a5a3a', 'leather.dark', 'metal.copper', ['cracks', 'smoke'], 0.5, {}),
      from: 'kiln_saint' }),

  U('uq.vorrowjaw', "Vorrowmaw's Jaw", 'xbow.demon', 70,
    'The prod is a jawbone and the string is something that used to be a tongue.',
    [['enhancedDamage', 1.2], ['critChance', 1], ['skillLevels', 1, 1], ['fireResist', 0.8]],
    { hook: 'Its bolts slip past any armour.', power: 'unblockableCrit', mag: 1.4,
      look: D('bone.rotted|0x6a4a3a', 'flesh.demon', 'metal.bloodgold', ['teeth', 'horns'], 0.4, { glow: 0xff5a2a, stone: 0xff5a2a }),
      from: 'vorrowmaw' }),

  // ===========================================================================
  // Quivers
  // ===========================================================================
  U('uq.hedgequiver', 'Hedge Quiver', 'quiver.ragged', 5,
    'Woven from hawthorn by a boy who could not afford leather. The thorns keep the arrows in.',
    [['lifeSteal', 0.8], ['moveSpeed', 0.8], ['critChance', 0.8]],
    { hook: 'For the archer who has to keep running.',
      look: D('wood.bark|0x5a4a2a', 'cloth.rag', undefined, ['thorns', 'leaves'], 0.7, {}) }),

  U('uq.featherfall', 'Featherfall', 'quiver.hunters', 24,
    'A goose-down quiver from the hill farms. The arrows come out of it already spreading.',
    [['dexterity', 1], ['attackRating', 0.8], ['life', 0.6]],
    { classId: 'ranger', bend: { skill: 'fanFire', more: 20, add: { count: 2 }, names: { count: 'arrows' } },
      look: D('leather.fine|0xb8a888', 'cloth.white', 'metal.silver', ['feathers', 'wings'], 0.3, {}) }),

  U('uq.overcast', 'The Overcast', 'quiver.runic', 50,
    'Stitched from the grey cloth that hung over the town the summer the sun did not come out.',
    [['dexterity', 1], ['enhancedDamage', 0.8], ['lightningResist', 0.8]],
    { classId: 'ranger', bend: { skill: 'darkenTheSky', more: 20, grow: { radius: 20, duration: 30 } },
      look: D('cloth.wool|0x5a6070', 'leather.dark', 'metal.steel', ['smoke', 'runes'], 0.4, {}),
      from: 'thessaly_vane' }),

  U('uq.everyarrowhome', 'Every Arrow Home', 'quiver.endless', 74,
    'The fletchers\' guild hung it over their hall door. Every arrow anyone ever lost turned up in it, eventually.',
    [['enhancedDamage', 1], ['dexterity', 1], ['skillLevels', 1, 1], ['magicFind', 0.8]],
    { hook: 'Every hit strikes again on the way back.', power: 'returning', mag: 1.2,
      look: D('leather.fine|0x6a3a1a', 'cloth.banner|0x7a1a1a', 'metal.gold', ['feathers', 'runes', 'gilded'], 0.1, { glow: 0xffd070, stone: 0xffd070 }) }),

  // ===========================================================================
  // Two-handed swords
  // ===========================================================================
  U('uq.ploughshare', 'Ploughshare', 'sword.great', 13,
    'Beaten out of a plough the year the fields went to the brood. The farmer said he had nothing left to plant.',
    [['strength', 1.2], ['life', 1], ['fireResist', 1], ['attackSpeed', -0.5]],
    { hook: 'Heavy, honest, and slow to turn.',
      look: D('metal.iron|0x6a6058', 'leather.fine|0x2a4a2a', 'metal.dark', ['rivets', 'cracks'], 0.8, { cut: { tip: 'round', guard: 'bar', pommel: 'disc', w: 0.06 }, finish: 'weathered' }) }),

  U('uq.harvestblade', 'Harvest Blade', 'sword.great', 19,
    'Ysolde Varr swung it through the wheat the last summer there was wheat.',
    [['enhancedDamage', 1], ['strength', 0.8], ['vitality', 0.6]],
    { hook: 'Every swing takes the ones beside it too.', power: 'cleave', mag: 1,
      look: D('metal.steel|0xa89a7a', 'cloth.linen|0x8a7a4a', 'metal.bronze', ['laurels', 'leaves'], 0.5, { cut: { tip: 'cleaver', guard: 'crescent', pommel: 'wheel', curve: 0.06 } }),
      from: 'warden_ysolde' }),

  U('uq.bravemistake', 'The Brave Mistake', 'sword.zweihander', 38,
    'Carried by every young knight who thought armour was for the frightened. The sword has had many owners.',
    [['enhancedDamage', 1.1], ['strength', 1], ['critChance', 0.7]],
    { hook: 'All the force, none of the cover.', power: 'glassJaw', mag: 1,
      look: D('metal.steel', 'leather.fine|0x7a1a1a', 'metal.gold', ['laurels', 'tatters'], 0.25, { cut: { tip: 'point', guard: 'winged', pommel: 'crown', ricasso: 0.12 }, finish: 'polished' }) }),

  U('uq.woundwright', 'Woundwright', 'sword.zweihander', 44,
    'A barber-surgeon\'s great sword, which tells you something about the barber.',
    [['critChance', 1], ['enhancedDamage', 1], ['dexterity', 0.8]],
    { hook: 'A clean hit opens deep wounds.', power: 'critBleed', mag: 2,
      look: D('metal.steel|0x8a7a7a', 'leather.dark', 'metal.bloodgold', ['blood', 'thorns'], 0.55, { cut: { tip: 'flame', waves: 7, guard: 'drooping', pommel: 'spike' } }),
      from: 'butcher_grell' }),

  U('uq.parryingiron', 'Parrying Iron', 'sword.zweihander', 48,
    'A fencing master\'s great sword, all guard and patience. She taught with it for forty years and was never touched.',
    [['blockChance', 0.8], ['attackRating', 1], ['critDamage', 1], ['lightningResist', 1]],
    { hook: 'A two-hander that blocks like a shield.',
      look: D('metal.iron|0x7a7e88', 'leather.fine|0x2a2a3a', 'metal.silver', ['rivets', 'runes'], 0.35, { cut: { tip: 'spear', guard: 'ringed', pommel: 'ring', ricasso: 0.18 } }) }),

  U('uq.longswing', 'The Long Swing', 'sword.colossus', 62,
    'Too heavy to stop once it starts. Its owners learned not to start unless they meant it.',
    [['enhancedDamage', 1.1], ['strength', 1], ['life', 0.7]],
    { hook: 'Each hit lands quicker than the last.', power: 'momentum', mag: 1.2,
      look: D('metal.dark|0x3a3a40', 'leather.worn', 'metal.iron', ['chains', 'rivets'], 0.6, { cut: { tip: 'cleaver', guard: 'block', pommel: 'wheel', w: 0.09 }, finish: 'blackened' }) }),

  U('uq.weightofvareth', 'The Weight of Vareth', 'sword.colossus', 68,
    'A splinter of the colossus that walks the deep, hafted and sharpened. It still wants to sink.',
    [['enhancedDamage', 1.1], ['strength', 1.2], ['physicalResist', 0.8]],
    { hook: 'Very hard to knock down, and very slow to get moving.', power: 'heavyTread', mag: 1.2,
      look: D('stone.sunken|0x3a5a5a', 'metal.chain', 'metal.verdigris', ['barnacles', 'cracks'], 0.75, { cut: { tip: 'round', guard: 'block', pommel: 'cap', w: 0.1 } }),
      from: 'colossus_of_the_deep' }),

  U('uq.kingsend', "Kingsend", 'sword.godslayer', 84,
    'Every crown in the deep has been struck once by this. None of them twice.',
    [['enhancedDamage', 1.2], ['critChance', 1], ['skillLevels', 1, 1], ['life', 0.8]],
    { hook: 'It finishes kings, and everything else.', power: 'culling', mag: 2,
      look: D('metal.dark|0x2a2a2e', 'leather.fine|0x2a0e10', 'metal.gold', ['crowns', 'skulls'], 0.2, { cut: { tip: 'point', guard: 'sun', pommel: 'crown' }, glow: 0xffd070, stone: 0xffd070 }),
      from: 'the_gaunt_king' }),

  U('uq.dayspring', 'Dayspring', 'sword.sunblade', 86,
    'Forged in the one hour of daylight that ever reached the bottom of the stair.',
    [['fireDamage', 1.2], ['enhancedDamage', 1.1], ['fireResist', 1], ['skillLevels', 1, 1]],
    { hook: 'Everything it cuts burns, and burns brighter.', power: 'convertFirePierce', mag: 1.2,
      look: D('metal.gold|0xe8c870', 'leather.fine|0x6a3a10', 'metal.silver', ['flames', 'halo'], 0.05, { cut: { tip: 'flame', waves: 5, guard: 'sun', pommel: 'gem' }, finish: 'gilt', glow: 0xffb040, stone: 0xffb040 }) }),

  // ===========================================================================
  // Two-handed axes
  // ===========================================================================
  U('uq.hidesplitter', 'Hidesplitter', 'axe.battle', 15,
    'The tanners\' guild axe, for hides too thick for a knife. Old Gristle\'s was one of them.',
    [['strength', 1], ['lifeRegen', 1.2], ['coldResist', 0.8]],
    { hook: 'For the long day of work that never ends.',
      look: D('metal.iron', 'wood.oak|0x5a3a1a', 'metal.copper', ['rivets', 'tatters'], 0.65, { cut: { bit: 'broad', back: 'hammer', wrap: 'leather' } }),
      from: 'old_gristle' }),

  U('uq.fellmonger', 'Fellmonger', 'axe.greataxe', 22,
    'The gravedigger\'s felling axe, for roots that grow into the graves. Some of the roots fought back.',
    [['enhancedDamage', 1], ['strength', 0.8], ['poisonResist', 0.8]],
    { hook: 'What it kills bursts.', power: 'corpseBurst', mag: 0.6,
      look: D('metal.rusted|0x6a4a3a', 'wood.rotted', 'bone.old', ['bones', 'vines'], 0.8, { cut: { bit: 'bearded', back: 'spike', wrap: 'cord' } }),
      from: 'boneking_gharruth' }),

  U('uq.redwater', 'Redwater', 'axe.greataxe', 29,
    'Named for the stream below the shambles, which has run that colour as long as anyone remembers.',
    [['enhancedDamage', 1.1], ['strength', 0.8], ['attackSpeed', 0.6]],
    { hook: 'It feeds on every cut and not on rest.', power: 'leechHunger', mag: 0.8,
      look: D('metal.steel|0x8a6a68', 'leather.fine|0x1e2a3a', 'metal.bloodgold', ['blood', 'teeth'], 0.6, { cut: { bit: 'crescent', back: 'bit', wrap: 'leather', bands: 2 } }),
      from: 'butcher_grell' }),

  U('uq.twoopinions', 'Two Opinions', 'axe.ettin', 40,
    'One bit for each head of the ettin it was made for. They never agreed on anything, except this.',
    [['areaDamagePct', 1.2], ['critChance', 1], ['strength', 0.8], ['defense', -0.4]],
    { hook: 'Wide and wild, and it leaves you open.',
      look: D('metal.iron|0x5a5a5a', 'leather.hide', 'metal.bronze', ['horns', 'rivets'], 0.6, { cut: { bit: 'twin', back: 'bit', wrap: 'leather' } }) }),

  U('uq.undertow', 'Undertow', 'axe.gothic', 47,
    'Green-black bronze, crusted with barnacles. It came up in a net, and the net went back down without the boat.',
    [['enhancedDamage', 1.1], ['coldResist', 1], ['strength', 0.8]],
    { hook: 'The water drags at everything that comes near.', power: 'slowAura', mag: 1,
      look: D('metal.verdigris|0x2a4a3a', 'wood.rotted|0x3a4a3a', 'metal.bronze', ['barnacles', 'serpents'], 0.75, { cut: { bit: 'gothic', back: 'hook', wrap: 'cord' } }),
      from: 'gilt_leviathan' }),

  U('uq.widefield', 'The Wide Field', 'axe.glorious', 64,
    'A war axe from the old border, where the fighting went on across whole fields at once.',
    [['enhancedDamage', 0.9], ['strength', 1], ['life', 0.8]],
    { hook: 'Wider and weaker, and wider again.', power: 'broadStroke', mag: 1.3,
      look: D('metal.steel|0xb0aa98', 'cloth.banner|0x5a6a2a', 'metal.gold', ['laurels', 'gilded'], 0.3, { cut: { bit: 'moon', back: 'spike', wrap: 'wire', bw: 0.26 } }) }),

  U('uq.bonfirenight', 'Bonfire Night', 'axe.decapitator', 72,
    'Teodric burned the old town\'s gallows on the first night of winter, and kept the headsman\'s axe from the ashes.',
    [['fireDamage', 1.2], ['enhancedDamage', 1.1], ['skillLevels', 1, 1], ['fireResist', 0.8]],
    { hook: 'What it kills keeps burning.', power: 'pyreKills', mag: 1,
      look: D('metal.dark', 'wood.charred', 'metal.copper', ['flames', 'cracks'], 0.5, { cut: { bit: 'cleaver', back: 'spike', wrap: 'wire' }, glow: 0xff7a2a, stone: 0xff7a2a }),
      from: 'teodric_ashmonger' }),

  U('uq.lastharvest', 'The Last Harvest', 'axe.worldcleaver', 88,
    'The reaper at the bottom of the world uses it on the last field there is. It is not wheat.',
    [['enhancedDamage', 1.3], ['strength', 1], ['skillLevels', 1, 1], ['areaDamagePct', 0.8]],
    { hook: 'What is left of every killing blow goes on to the next.', power: 'overkillSplash', mag: 2,
      look: D('metal.voidgold', 'bone.bleached', 'metal.dark', ['skulls', 'runes'], 0.25, { cut: { bit: 'rune', back: 'bit', wrap: 'wire' }, glow: 0xb080ff, stone: 0xb080ff }),
      from: 'deeps_own_name' }),

  // ===========================================================================
  // Two-handed maces
  // ===========================================================================
  U('uq.masonsweight', "Mason's Weight", 'mace.warhammer', 16,
    'Gorm Ashlar built half the town\'s walls with it, and tore down the other half.',
    [['strength', 1], ['defense', 1], ['lightningResist', 1], ['attackRating', 0.8]],
    { hook: 'Built to last, like the walls it put up.',
      look: D('stone.granite|0x9a948a', 'wood.oak', 'metal.iron', ['cracks', 'rivets'], 0.7, { cut: { head: 'hammer', hs: 0.11, wrap: 'leather', pommel: 'cap' } }),
      from: 'warden_gorm' }),

  U('uq.bearpaw', 'Bearpaw', 'mace.maul', 23,
    'A maul with the head carved to a bear\'s paw, claws and all. The carver had met the bear.',
    [['strength', 1], ['life', 1], ['enhancedDamage', 0.6]],
    { classId: 'shapeshifter', bend: { skill: 'maul', more: 30, grow: { arc: 30, reach: 15 } },
      look: D('wood.oak|0x5a3a22', 'leather.hide|0x3a2a1a', 'bone.old', ['claws', 'tatters'], 0.6, { cut: { head: 'maul', hs: 0.17, wrap: 'leather', pommel: 'none' } }) }),

  U('uq.nettlehead', 'Nettlehead', 'mace.maul', 30,
    'Bound in nettle cord and studded with thorn. It stings the hand that holds it, and worse the hand that grabs it.',
    [['enhancedDamage', 1], ['vitality', 1], ['poisonResist', 0.8]],
    { hook: 'Whatever strikes you in close is stung for it.', power: 'thorns', mag: 1.2,
      look: D('wood.bark', 'cloth.rag|0x3a4a2a', 'metal.dark', ['thorns', 'vines'], 0.65, { cut: { head: 'knobbed', n: 10, wrap: 'cord', pommel: 'spike' } }),
      from: 'treant_elder_vhoss' }),

  U('uq.rockfall', 'Rockfall', 'mace.battlehammer', 41,
    'Quarried from the slip where the hill came down on the old village. It remembers falling.',
    [['strength', 1], ['enhancedDamage', 0.9], ['physicalResist', 0.8]],
    { classId: 'shapeshifter', bend: { skill: 'hammerfall', more: 25, grow: { radius: 35 } },
      look: D('stone.cavern|0x6a6458', 'leather.hide', 'metal.iron', ['cracks', 'antlers'], 0.75, { cut: { head: 'battlehammer', wrap: 'cord', pommel: 'disc' } }) }),

  U('uq.anvilsbrother', "The Anvil's Brother", 'mace.greatmaul', 48,
    'Hurn cast two from the same pour: the anvil he works on, and this, for when the work talks back.',
    [['strength', 1.1], ['defense', 1], ['fireResist', 1]],
    { hook: 'Hard as the anvil, and as slow.', power: 'stoneSkin', mag: 1.2,
      look: D('metal.blackiron', 'leather.dark', 'metal.iron', ['rivets', 'cracks'], 0.55, { cut: { head: 'greatmaul', wrap: 'leather', pommel: 'cap' }, finish: 'blackened' }),
      from: 'forgefather_hurn' }),

  U('uq.icebreaker', 'Icebreaker', 'mace.legendhammer', 66,
    'The ferry crews broke the winter ice with it so the boats could run. Valdr froze the river solid to spite them.',
    [['coldDamage', 1.2], ['enhancedDamage', 1], ['coldResist', 1]],
    { hook: 'What freezes, shatters, and takes its neighbours with it.', power: 'shatter',
      look: D('metal.silver|0xb8c8d8', 'wood.ash', 'metal.steel', ['frost', 'crystals'], 0.3, { cut: { head: 'legend', wrap: 'wire', pommel: 'crown' }, finish: 'frosted' }),
      from: 'rimeheart_valdr' }),

  U('uq.stormanvil', 'Stormanvil', 'mace.thundermaul', 74,
    'Struck by lightning nine times on the bell tower before anyone thought to take it down and use it.',
    [['lightningDamage', 1.3], ['enhancedDamage', 1.1], ['skillLevels', 1, 1], ['lightningResist', 1]],
    { hook: 'Its lightning burns twice as hot.', power: 'lightningFloor', mag: 2,
      look: D('metal.dark|0x2a3040', 'leather.fine|0x1a2a4a', 'metal.copper', ['bolts', 'coils'], 0.35, { cut: { head: 'thunder', wrap: 'wire', pommel: 'spike' }, glow: 0x9ad8ff, stone: 0x9ad8ff }),
      from: 'stormcrown_azhek' }),

  U('uq.thepour', 'The Pour', 'mace.ruinhammer', 88,
    'Ixthar\'s own hammer, cast in the moment the magma first broke through the floor of the Works.',
    [['fireDamage', 1.3], ['enhancedDamage', 1.2], ['skillLevels', 1, 1], ['strength', 1]],
    { hook: 'Every hit splashes molten slag around the target.', power: 'moltenTrail',
      look: D('stone.obsidian|0x2a1a14', 'metal.dark', 'metal.bloodgold', ['cracks', 'flames'], 0.4, { cut: { head: 'ruin', wrap: 'wire', pommel: 'gem' }, glow: 0xff5010, stone: 0xff5010 }),
      from: 'magma_sovereign' }),
];
