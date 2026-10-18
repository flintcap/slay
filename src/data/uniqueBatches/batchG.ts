/**
 * SLAY — depth uniques, batch G: what the six deep bosses carry.
 *
 * Two each, from Mother Wickwane on tier 66 to the Sleeper's Hand on 96.
 * The Usher and the Sleeper's Hand each carry one mythic; the rest are
 * uniques built at their boss's depth, so each pair outclasses the last.
 */
import type { UniqueDef } from '../uniques';
import { D, U } from './kit';

export const BATCH_G: UniqueDef[] = [
  // --- Mother Wickwane, Who Keeps the House --------------------------------
  U('uq.lastcandle', 'The Last Candle', 'wand.unearthed', 74,
    "The last candle on Mother Wickwane's table. It has never needed trimming, and it has never once been allowed to go out.",
    [['fireDamage', 1.2], ['castSpeed', 1], ['energy', 1], ['mana', 0.8]],
    { hook: 'A ring of candlelight burns round you and slows what walks into it.', power: 'lanternRing', mag: 1.1,
      look: D('bone.pale|0xe8dcc0', 'cloth.linen|0x2a2622', 'metal.brass', ['flames', 'tatters'], 0.4, { aura: 'embers', glow: 0xffb040, glowStyle: 'flame' }),
      from: 'mother_wickwane' }),

  U('uq.wickwaneskeyring', "Wickwane's Keyring", 'belt.colossus', 74,
    'Every door in the house, on one ring. There is a key on it for a door you have not found yet.',
    [['life', 1], ['vitality', 1], ['defense', 1], ['goldFind', 1]],
    { hook: 'Champions and rares you cut down have one more lock to open.', power: 'cartographer', mag: 1.1,
      look: D('leather.dark|0x2a2622', undefined, 'metal.brass', ['chains', 'coins'], 0.5, { finish: 'weathered' }),
      from: 'mother_wickwane' }),

  // --- The Glasswright, Who Glazes the Spire --------------------------------
  U('uq.glaziersrule', "The Glazier's Rule", 'sword.phase', 79,
    'A straightedge of Spire glass, ground sharp along one side. The Glasswright measured every delver with it before the cut.',
    [['enhancedDamage', 1.2], ['critChance', 1], ['critDamage', 1], ['lightningDamage', 0.8], ['attackSpeed', 0.8]],
    { hook: 'Every blow you slip past breaks into flying glass.', power: 'glasswing', mag: 1.2,
      look: D('crystal.ice|0xd8f0ff', 'cloth.silk|0x2a2e3a', 'metal.dark', ['crystals', 'cracks'], 0.1, { aura: 'sparkles', glow: 0xd8f0ff, glowStyle: 'shimmer' }),
      from: 'the_glasswright' }),

  U('uq.leadlinemantle', 'Leadline Mantle', 'chest.sacred', 79,
    'Panes of Spire glass set in lead and sewn into a coat. Light comes through it in colours. Nothing else does.',
    [['defense', 1.2], ['life', 1], ['lightningResist', 1], ['arcaneResist', 1], ['physicalResist', 0.8]],
    { hook: 'Bolts and spells break on you like light on leaded glass.', power: 'rangedDR', mag: 1.1,
      look: D('crystal.gem|0x9ab8d0', 'cloth.velvet|0x2a2e3a', 'metal.dark', ['crystals', 'rivets'], 0.2, { aura: 'shine', glow: 0xb0d0ff }),
      from: 'the_glasswright' }),

  // --- Marshal Harrow, of the Company That Stayed ---------------------------
  U('uq.rollofthestayed', 'The Roll of the Stayed', 'amulet.sigil', 84,
    'Three hundred names on a strip of vellum, rolled tight in a brass case. Wear it, and you are on the roll.',
    [['skillLevels', 1, 1], ['life', 1], ['vitality', 1], ['coldResist', 1], ['poisonResist', 1]],
    { hook: 'Every foe you fell is buried, and its grave bursts.', power: 'pallbearer', mag: 1.2,
      look: D('metal.brass', 'cloth.linen|0xd8d0b8', 'metal.bronze', ['runes', 'skulls'], 0.5, { aura: 'souls', glow: 0x9cd8ff, glowStyle: 'spectral' }),
      from: 'marshal_harrow' }),

  U('uq.harrowslastorder', "Harrow's Last Order", 'sword.godslayer', 84,
    'Forward. It was the only order the company ever got below the thirtieth, and they followed it to the end.',
    [['enhancedDamage', 1.3], ['strength', 1], ['attackSpeed', 1], ['attackRating', 1], ['life', 0.8]],
    { hook: 'Every blow you land speeds the next.', power: 'momentum', mag: 1.3,
      look: D('metal.steel|0xb8c0c8', 'leather.worn', 'metal.iron', ['tatters', 'skulls'], 0.6, { aura: 'frost', glow: 0x9cd8ff }),
      from: 'marshal_harrow' }),

  // --- The Holdfast, Under the Spire's Nail ---------------------------------
  U('uq.holdfastbolt', 'The Holdfast Bolt', 'mace.ruinhammer', 89,
    "One of the bolts that held the Holdfast to its plate, as long as a man. The Spire rose a finger's width the moment it came loose.",
    [['enhancedDamage', 1.3], ['strength', 1.2], ['maxDamage', 1], ['life', 1]],
    { hook: 'Every tenth blow rings like iron on iron and throws back all around.', power: 'drownedBell', mag: 1.3,
      look: D('metal.rusted|0x5a4a40', 'metal.chain', 'metal.brass', ['rivets', 'chains'], 0.6, { aura: 'sparks', glow: 0xffa040, glowStyle: 'pulse' }),
      from: 'the_holdfast' }),

  U('uq.anchorplate', 'Anchorplate of the First Layer', 'shield.aeons', 89,
    'Cut from the iron plate the Holdfast was bolted to. The first layer stamped its orders on it, and they are still there: HOLD.',
    [['blockChance', 1.2], ['defense', 1.2], ['life', 1], ['damageReduction', 1], ['vitality', 0.8]],
    { hook: 'Nothing moves you, and blows land soft. You move a little less.', power: 'anchor', mag: 1.4,
      look: D('metal.iron|0x4a4a50', undefined, 'metal.brass', ['rivets', 'runes'], 0.5, { aura: 'soft', glow: 0xffa040 }),
      from: 'the_holdfast' }),

  // --- The Usher, Who Makes Room --------------------------------------------
  U('uq.usherslamp', "The Usher's Lamp", 'orb.void', 94,
    'A lamp on a long hook, held out ahead to show the way down. Whatever room you walk into, it is already lit.',
    [['skillLevels', 1, 1], ['arcaneDamage', 1.2], ['castSpeed', 1], ['mana', 1], ['cooldownReduction', 0.8]],
    { hook: 'Every door opens sooner for you: your skills come back faster.', power: 'voidCooldown', mag: 1.4,
      look: D('metal.voidgold', 'cloth.linen|0x2a2622', 'metal.silver', ['halo', 'stars'], 0.2, { aura: 'wisp', glow: 0xc8a0ff, glowStyle: 'void' }),
      from: 'the_usher' }),

  U('my.doortoelsewhere', 'A Door to Elsewhere', 'ring.eternity', 94,
    'A ring cut from the frame of the Usher\'s door. Look through it and the room on the other side is never the one behind it.',
    [['skillLevels', 2, 2], ['moveSpeed', 1], ['life', 1], ['dexterity', 1], ['energy', 1], ['arcaneResist', 1]],
    { hook: 'When a blow would bring you low, a door opens and you step through it.', power: 'panicBlink', rarity: 'mythic', chase: true,
      look: D('metal.voidgold', undefined, 'metal.mithril', ['runes', 'stars', 'ghost'], 0, { aura: 'souls', glow: 0xc8a0ff, glowStyle: 'void' }),
      from: 'the_usher' }),

  // --- The Sleeper's Hand, Reaching Up in Its Sleep -------------------------
  U('uq.dreamtcrown', 'The Dreamt Crown', 'helm.corona', 99,
    'A crown the Sleeper dreamt onto the head of the first delver it ever reached for. It fits everyone. It fits too well.',
    [['skillLevels', 2, 2], ['energy', 1], ['life', 1], ['manaRegen', 1], ['magicFind', 1]],
    { hook: 'Every skill you use is dreamt twice.', power: 'echo', mag: 1,
      look: D('metal.gold|0xffd8e8', 'cloth.silk|0x6a4a5a', 'metal.voidgold', ['crowns', 'eyes', 'stars'], 0, { aura: 'motes', glow: 0xff80c0, glowStyle: 'spectral' }),
      from: 'sleepers_hand' }),

  U('my.palmstone', 'Palmstone of the Tenant', 'amulet.heartstone', 99,
    'A stone from the hollow of the great palm, warm, rising and falling under your fingers. Far below, something breathes in time with it.',
    [['skillLevels', 2, 2], ['life', 1.2], ['damageReduction', 1], ['fireResist', 1], ['coldResist', 1], ['lightningResist', 1]],
    { hook: 'While you are whole, a warm hand closes round you and takes the blows.', power: 'overhealShield', mag: 1.8, rarity: 'mythic', chase: true,
      look: D('stone.obsidian|0x6a4a5a', 'cloth.silk|0xff80c0', 'metal.voidgold', ['runes', 'eyes', 'cracks'], 0.1, { aura: 'souls', glow: 0xff80c0, glowStyle: 'pulse' }),
      from: 'sleepers_hand' }),
];
