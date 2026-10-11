/**
 * SLAY — what uniques and sets look like.
 *
 * Bases get their shape from the family builders (`Weapons.ts`, `Armour.ts`,
 * `Trinkets.ts`), one authored cut per base. This module holds the layer on
 * top: every unique has its own design (materials, colours, a cut override
 * and features no ordinary item carries) and every set has a motif that all
 * of its pieces share (a colour, a trim metal, an emblem and features).
 *
 * Pure data. Nothing here touches three.js, so the look can be computed in
 * any context (heroes reads it to dress the body).
 */

/** Decorations a piece can carry on top of its cut. See `Features.ts`. */
export type Feature =
  | 'arrows' // arrows stuck in it
  | 'barnacles'
  | 'bells'
  | 'blood' // dark drips and stains
  | 'bones' // vertebrae along the shaft
  | 'chains'
  | 'coils' // copper wire wound round the axis
  | 'coins'
  | 'cracks' // glowing cracks
  | 'crystals'
  | 'eyes'
  | 'feathers'
  | 'flames'
  | 'frost'
  | 'ghost' // a translucent glowing half
  | 'gilded' // gold filigree bands
  | 'halo'
  | 'horns'
  | 'leaves'
  | 'rivets'
  | 'runes'
  | 'scales'
  | 'skulls'
  | 'smoke'
  | 'spikes'
  | 'stars'
  | 'tatters' // cloth strips and ribbons
  | 'teeth'
  | 'thorns'
  | 'vines'
  | 'web'
  | 'wings';

/** A set's badge, stamped on every piece. */
export type Emblem =
  | 'hand'
  | 'flame'
  | 'feather'
  | 'skull'
  | 'eye'
  | 'snowflake'
  | 'bolt'
  | 'web'
  | 'shield'
  | 'ember'
  | 'coin'
  | 'moon'
  | 'star'
  | 'laurel'
  | 'crown';

/** Everything a set's pieces share. */
export interface SetMotif {
  /** The set's colour: stones, glow, emblem. */
  color: number;
  /** Cloth and leather on every piece: surface key, may carry `|0xRRGGBB`. */
  second: string;
  /** Trim metal. */
  trim: string;
  emblem: Emblem;
  features: Feature[];
  /** 0 pristine .. 1 battered. */
  wear: number;
}

/** A unique's own design. Every field is optional except its features. */
export interface UniqueDesign {
  /** Main body surface key, may carry `|0xRRGGBB`. */
  main?: string;
  /** Hafts, grips, straps, cloth. */
  second?: string;
  trim?: string;
  glow?: number;
  stone?: number;
  /** How bright its glow burns (0 none). Defaults by rarity. */
  glowStrength?: number;
  features: Feature[];
  /** Overrides on the base's cut, read by the family builder. */
  cut?: Record<string, number | string | boolean>;
  wear?: number;
}

export const SET_MOTIFS: Record<string, SetMotif> = {
  'set.bloodied': { color: 0xc0242a, second: 'leather.fine|0x6a1c16', trim: 'metal.iron', emblem: 'hand', features: ['blood'], wear: 0.7 },
  'set.kindled': { color: 0xff7a22, second: 'cloth.linen|0x9a3c1c', trim: 'metal.copper', emblem: 'flame', features: ['flames'], wear: 0.35 },
  'set.quickstep': { color: 0x8ee0a0, second: 'leather.worn|0x4c5e3a', trim: 'metal.silver', emblem: 'feather', features: ['feathers'], wear: 0.3 },
  'set.bonefetter': { color: 0x9ae8c8, second: 'cloth.tattered|0x5a5a4c', trim: 'bone.old', emblem: 'skull', features: ['skulls', 'chains'], wear: 0.6 },
  'set.gravewarden': { color: 0xe0b85a, second: 'cloth.undyed|0x4a5242', trim: 'metal.iron', emblem: 'eye', features: ['rivets'], wear: 0.55 },
  'set.frostwrought': { color: 0x8ad4ff, second: 'leather.fine|0x2a3c50', trim: 'metal.silver|0xc8e8ff', emblem: 'snowflake', features: ['frost'], wear: 0.2 },
  'set.stormbound': { color: 0xa8dcff, second: 'cloth.silk|0x283c62', trim: 'metal.copper', emblem: 'bolt', features: ['coils'], wear: 0.25 },
  'set.venomthread': { color: 0x7ad84a, second: 'cloth.silk|0x223418', trim: 'metal.dark', emblem: 'web', features: ['web'], wear: 0.3 },
  'set.ironvow': { color: 0xd8e2ee, second: 'leather.studded', trim: 'metal.dark', emblem: 'shield', features: ['rivets', 'chains'], wear: 0.45 },
  'set.ashwalker': { color: 0xff5a1a, second: 'leather.fine|0x2c2622', trim: 'metal.dark', emblem: 'ember', features: ['cracks'], wear: 0.75 },
  'set.gilded': { color: 0xffd25a, second: 'cloth.banner|0x5c1a2c', trim: 'metal.gold', emblem: 'coin', features: ['gilded', 'coins'], wear: 0.1 },
  'set.nightfall': { color: 0x9064ff, second: 'cloth.silk|0x1c162c', trim: 'metal.voidgold', emblem: 'moon', features: ['smoke'], wear: 0.2 },
  'set.sunderedsky': { color: 0x6abcff, second: 'cloth.silk|0x1a2c56', trim: 'metal.silver', emblem: 'star', features: ['stars', 'cracks'], wear: 0.15 },
  'set.lastlegion': { color: 0xd8341e, second: 'cloth.banner|0x8a1c1a', trim: 'metal.steel', emblem: 'laurel', features: ['tatters', 'rivets'], wear: 0.65 },
  'set.hollowking': { color: 0xb474ff, second: 'cloth.silk|0x1a1222', trim: 'metal.bloodgold', emblem: 'crown', features: ['spikes', 'gilded'], wear: 0.1 },
};

/** A set we have no motif for still gets a stable colour. */
export function fallbackMotif(setId: string, hash: number): SetMotif {
  const hues = [0x33d64a, 0x3ac8c0, 0x4a8cff, 0xb05cff, 0xff6a9a, 0xffb43a, 0xd8e05a];
  void setId;
  return { color: hues[hash % hues.length]!, second: 'cloth.silk', trim: 'metal.silver', emblem: 'star', features: [], wear: 0.3 };
}

export const UNIQUE_DESIGNS: Record<string, UniqueDesign> = {
  // ---- unique ------------------------------------------------------------
  'uq.rixots': { main: 'metal.silver', second: 'leather.fine|0x4a2418', features: ['runes'], glow: 0xdfe8ff, glowStrength: 0.6, cut: { w: 0.052, fuller: 0.85, tip: 'spear' }, wear: 0.3 },
  'uq.felloak': { main: 'wood.charred', second: 'leather.worn', glow: 0xff6a1e, features: ['cracks', 'smoke'], cut: { knots: 7 }, wear: 0.8 },
  'uq.gnasher': { main: 'metal.rusted', second: 'bone.old', features: ['teeth'], glow: 0xd0b080, glowStrength: 0, wear: 0.9 },
  'uq.hotspur': { main: 'leather.fine|0x3a2216', trim: 'metal.copper', glow: 0xff7a2a, features: ['flames', 'cracks'], wear: 0.5 },
  'uq.pluckeye': { main: 'wood.polished|0x4a3020', second: 'leather.fine', glow: 0xffd070, stone: 0xffc040, features: ['eyes'], wear: 0.4 },
  'uq.greyform': { main: 'leather.worn|0x9a9890', second: 'cloth.undyed', features: ['tatters', 'rivets'], glow: 0xc8c8c0, glowStrength: 0, wear: 0.8 },
  'uq.jadetando': { main: 'crystal.ice|0x48d080', second: 'leather.fine|0x1e3a24', glow: 0x40d070, features: ['runes'], cut: { tip: 'fang', curve: 0.25 }, wear: 0.1 },
  'uq.wormskull': { main: 'bone.old', second: 'flesh.rotted', glow: 0x9ac04a, features: ['vines', 'eyes'], wear: 0.7 },
  'uq.steelclash': { main: 'metal.bronze', second: 'leather.worn', glow: 0xffd88a, glowStrength: 0.3, features: ['bells', 'rivets'], wear: 0.6 },
  'uq.nightsmoke': { main: 'cloth.silk|0x6e7280', trim: 'metal.silver', glow: 0xb8c4d8, features: ['smoke', 'tatters'], wear: 0.2 },
  'uq.bloodrise': { main: 'metal.dark', second: 'leather.fine|0x501414', trim: 'metal.bloodgold', glow: 0xb01818, features: ['blood', 'teeth', 'spikes'], wear: 0.6 },
  'uq.civerbs': { main: 'wood.rotted', second: 'cloth.tattered', trim: 'metal.iron', glow: 0x9ad8c8, features: ['rivets', 'chains', 'bells'], wear: 0.8 },
  'uq.gorefoot': { main: 'leather.fine|0x5a1a14', trim: 'metal.dark', glow: 0xc02018, features: ['blood', 'spikes'], wear: 0.6 },
  'uq.venomward': { main: 'metal.verdigris', second: 'leather.worn|0x30401c', glow: 0x5ac84a, features: ['vines', 'thorns'], wear: 0.6 },
  'uq.skystrike': { main: 'wood.polished|0x5a6878', second: 'leather.fine|0x1e2a3a', trim: 'metal.silver', glow: 0xa8dcff, features: ['coils', 'runes'], wear: 0.25 },
  'uq.hexfire': { main: 'metal.bloodgold', second: 'leather.fine|0x3a1810', glow: 0xff6020, features: ['flames', 'runes'], wear: 0.3 },
  'uq.frostwind': { main: 'metal.silver|0xcfe6ff', second: 'leather.fine|0x22344a', glow: 0x9ad8ff, features: ['frost', 'crystals'], wear: 0.2 },
  'uq.duskdeep': { main: 'metal.dark', trim: 'metal.iron', glow: 0x90a0b0, glowStrength: 0, features: ['rivets', 'cracks'], cut: { welded: true }, wear: 0.85 },
  'uq.magefist': { main: 'cloth.silk|0x5a2618', trim: 'metal.copper', glow: 0xff7030, features: ['cracks', 'flames'], wear: 0.4 },
  'uq.frostburn': { main: 'leather.fine|0x2a3444', trim: 'metal.silver', glow: 0x7ab4ff, features: ['frost'], wear: 0.4 },
  'uq.stormchaser': { main: 'wood.polished|0x6a5a48', trim: 'metal.copper', glow: 0xa8d8ff, features: ['coils', 'wings'], cut: { top: 'vane' }, wear: 0.3 },
  'uq.rockstopper': { main: 'metal.iron', trim: 'metal.bronze', glow: 0xc0a080, glowStrength: 0, features: ['rivets', 'cracks'], cut: { dent: true }, wear: 0.95 },
  'uq.goldwrap': { main: 'metal.gold', second: 'leather.fine|0x4a2a14', glow: 0xffd860, features: ['coins', 'gilded'], wear: 0.15 },
  'uq.nagelring': { main: 'metal.bronze', stone: 0x3ad07a, glow: 0x60e090, features: ['coins'], wear: 0.5 },
  'uq.manald': { main: 'metal.bloodgold', stone: 0xd8303c, glow: 0xff6070, features: ['runes'], wear: 0.3 },
  'uq.cleglaw': { main: 'metal.dark', second: 'leather.fine|0x1a1418', trim: 'metal.silver', glow: 0xd8d8ff, features: ['thorns'], wear: 0.2 },
  'uq.buriza': { main: 'metal.dark', second: 'wood.polished|0x3a2a1e', trim: 'metal.bronze', glow: 0xa8dcff, features: ['rivets', 'spikes'], wear: 0.5 },
  'uq.titans': { main: 'metal.gold', second: 'wood.polished', glow: 0xffd070, features: ['wings', 'runes'], wear: 0.3 },
  'uq.stormshield': { main: 'metal.steel', second: 'leather.worn|0x4a3020', trim: 'metal.iron', glow: 0xb8c8d8, glowStrength: 0, features: ['rivets', 'cracks'], cut: { straps: 11 }, wear: 0.8 },
  'uq.shaftstop': { main: 'metal.steel', second: 'cloth.undyed', trim: 'metal.bronze', glow: 0xd0c0a0, glowStrength: 0, features: ['arrows', 'rivets'], wear: 0.85 },
  'uq.gazehell': { main: 'bone.old|0x9a8a7a', trim: 'metal.dark', glow: 0xff5a1a, features: ['eyes', 'flames', 'horns'], wear: 0.6 },
  'uq.silkweave': { main: 'cloth.silk|0xd0c8b8', trim: 'metal.silver', glow: 0xe8e0ff, features: ['web'], wear: 0.2 },
  'uq.chancecast': { main: 'metal.gold', second: 'cloth.banner|0x5a1a2a', glow: 0xffd860, stone: 0x3ad07a, features: ['coins', 'gilded'], wear: 0.3 },
  'uq.ravenfrost': { main: 'metal.silver|0xb8d8ff', stone: 0x9ad8ff, glow: 0xa8e0ff, features: ['frost'], wear: 0.1 },
  'uq.bulkathos': { main: 'metal.gold', stone: 0xff6a80, glow: 0xffb0c0, features: ['chains'], cut: { twin: true }, wear: 0.5 },
  'uq.thegravenspine': { main: 'wood.rotted|0x8a8070', trim: 'bone.old', glow: 0x9ad8c0, features: ['bones', 'eyes'], wear: 0.6 },
  'uq.widowmaker': { main: 'metal.voidgold', second: 'wood.polished|0x8a1020', trim: 'metal.dark', glow: 0xc02040, features: ['tatters', 'thorns'], wear: 0.3 },
  'uq.hellslayer': { main: 'metal.dark', second: 'leather.fine|0x2a1a14', trim: 'metal.bloodgold', glow: 0xff4020, features: ['cracks', 'skulls'], wear: 0.5 },
  'uq.spectralshard': { main: 'metal.steel', second: 'leather.fine', glow: 0x9ad8ff, features: ['ghost', 'runes'], cut: { broken: true }, wear: 0.4 },
  'uq.windforce': { main: 'metal.gold', second: 'wood.polished|0x3a6ac8', trim: 'metal.gold', glow: 0xd8f0ff, features: ['wings', 'feathers'], wear: 0.25 },
  'uq.doombringer': { main: 'metal.dark', second: 'leather.fine|0x2a1010', trim: 'metal.bloodgold', glow: 0xd04030, features: ['skulls', 'cracks'], wear: 0.4 },
  'uq.griswold': { main: 'metal.steel', second: 'leather.fine|0x3a2414', trim: 'metal.gold', glow: 0xff7a20, features: ['runes', 'gilded', 'flames'], wear: 0.15 },
  'uq.azurewrath': { main: 'crystal.ice|0x9ad0ff', second: 'leather.fine|0x1a2a44', trim: 'metal.silver', glow: 0x80c8ff, features: ['halo', 'crystals'], wear: 0 },
  'uq.arreatsface': { main: 'stone.crypt|0x8a8478', trim: 'bone.old', glow: 0xd0a060, glowStrength: 0.4, features: ['cracks', 'horns'], cut: { face: true }, wear: 0.7 },
  'uq.crownofages': { main: 'metal.gold', trim: 'metal.gold', stone: 0xd8303c, glow: 0xffd070, features: ['spikes', 'gilded'], cut: { gems: 6 }, wear: 0.4 },
  'uq.leviathan': { main: 'metal.verdigris', second: 'leather.fine|0x1e3a3a', trim: 'metal.bronze', glow: 0x3ac8b8, features: ['barnacles', 'scales'], wear: 0.6 },
  'uq.skinofvipermagi': { main: 'leather.fine|0x8a3a5a', trim: 'metal.dark', glow: 0x9ad84a, features: ['scales'], wear: 0.3 },
  'uq.warTraveler': { main: 'leather.worn|0x5a4632', trim: 'metal.iron', glow: 0xd0b080, glowStrength: 0, features: ['tatters', 'rivets'], wear: 1 },
  'uq.gorerider': { main: 'leather.fine|0x3a3230', trim: 'bone.pale', glow: 0xd04030, features: ['spikes', 'blood'], wear: 0.6 },
  'uq.dracul': { main: 'metal.bloodgold', second: 'leather.fine|0x2a0e0e', glow: 0xc01c1c, features: ['spikes', 'blood'], wear: 0.4 },
  'uq.arachnid': { main: 'cloth.silk|0x2a2432', trim: 'metal.dark', glow: 0xa060ff, features: ['web'], wear: 0.2 },
  'uq.verdungo': { main: 'leather.worn|0x5c4a2a', trim: 'metal.iron', glow: 0xd8a860, glowStrength: 0, features: ['rivets', 'tatters'], wear: 0.8 },
  'uq.highlords': { main: 'metal.gold', trim: 'bone.old', stone: 0xd04020, glow: 0xff6030, features: ['bones'], wear: 0.4 },
  'uq.mara': { main: 'metal.silver', stone: 0xf0f8ff, glow: 0xd8f0ff, features: ['crystals'], wear: 0.2 },
  'uq.metalgrid': { main: 'metal.iron', trim: 'metal.copper', stone: 0x80c0ff, glow: 0x9ad0ff, features: ['rivets', 'coils'], wear: 0.6 },
  'uq.soj': { main: 'metal.gold', stone: 0x5aa0ff, glow: 0x8ac0ff, features: ['coins'], wear: 0.3 },
  'uq.carrionwind': { main: 'metal.dark', stone: 0x7ac04a, glow: 0x8ad050, features: ['smoke'], wear: 0.5 },
  'uq.thunderstroke': { main: 'metal.gold', second: 'wood.charred', trim: 'metal.silver', glow: 0xf0e05a, features: ['coils'], wear: 0.2 },
  'uq.deathsweb': { main: 'crystal.void|0x3a5a2a', second: 'bone.old', glow: 0x7ac84a, features: ['web'], wear: 0.3 },
  'uq.eschutas': { main: 'crystal.ice|0xffa070', trim: 'metal.gold', glow: 0xff6a30, stone: 0x6ac0ff, features: ['halo'], cut: { split: true }, wear: 0 },
  'uq.herald': { main: 'metal.gold', second: 'cloth.banner|0x7a1a1e', trim: 'metal.silver', glow: 0xffe8a0, features: ['tatters', 'gilded'], wear: 0.3 },
  'uq.lastwish': { main: 'metal.dark', trim: 'metal.gold', glow: 0xf0e05a, features: ['stars', 'cracks'], wear: 0.6 },
  // ---- mythic ------------------------------------------------------------
  'my.griffonseye': { main: 'metal.gold', stone: 0xffd060, glow: 0xffd060, features: ['eyes', 'wings'], cut: { lens: true }, wear: 0 },
  'my.harlequin': { main: 'metal.gold', second: 'cloth.banner|0x7a1a3a', stone: 0x5a8cff, glow: 0xff6ab0, features: ['bells'], cut: { jester: true }, wear: 0.1 },
  'my.tyraelsmight': { main: 'metal.silver', second: 'cloth.linen|0xd8d0c0', trim: 'metal.gold', glow: 0xfff0c0, features: ['wings', 'halo'], wear: 0 },
  'my.chainsofhonor': { main: 'metal.steel', second: 'cloth.banner|0xa01e1e', trim: 'metal.gold', glow: 0xffd070, features: ['chains', 'gilded'], wear: 0.2 },
  'my.the-oculus': { main: 'crystal.void|0x4a3070', trim: 'metal.voidgold', stone: 0xfff0a0, glow: 0x8a60ff, features: ['eyes', 'halo'], wear: 0 },
  'my.wizardspike': { main: 'crystal.ice|0xc8d8ff', second: 'leather.fine|0x1a1a3a', trim: 'metal.silver', glow: 0x80b0ff, features: ['runes', 'halo'], wear: 0 },
  'my.the-reapers-toll': { main: 'metal.verdigris', second: 'wood.charred', trim: 'metal.dark', glow: 0x9ad8b8, features: ['skulls', 'coins'], cut: { scythe: true }, wear: 0.5 },
  'my.beast': { main: 'metal.bloodgold', second: 'leather.fine|0x3a2418', glow: 0xd04020, features: ['teeth', 'tatters'], wear: 0.5 },
  'my.iceblink': { main: 'crystal.ice|0xd0ecff', second: 'leather.fine|0x1a2a40', trim: 'metal.silver', glow: 0xb8e8ff, features: ['frost', 'bells'], wear: 0 },
  'my.faith': { main: 'metal.gold', second: 'cloth.linen|0xe0d8c0', trim: 'metal.silver', glow: 0xffd060, features: ['halo', 'wings'], wear: 0 },
  'my.spirit-of-the-forge': { main: 'metal.dark', second: 'leather.fine|0x2a1a10', trim: 'metal.copper', glow: 0xff6a10, features: ['cracks', 'flames'], wear: 0.4 },
  'my.nightwing': { main: 'metal.dark', stone: 0x6ab0ff, glow: 0x6ab0ff, features: ['wings', 'feathers'], wear: 0 },
  'my.stoneofthevoid': { main: 'metal.voidgold', stone: 0x1a1030, glow: 0x8a60ff, features: ['halo', 'smoke'], wear: 0 },
  'my.seraphshymn': { main: 'metal.silver', stone: 0xfff0c0, glow: 0xfff0c0, features: ['wings', 'halo'], wear: 0 },
  // ---- ancient -----------------------------------------------------------
  'an.worldbreaker': { main: 'stone.crypt|0x5a5048', second: 'metal.dark', trim: 'metal.bloodgold', glow: 0xff3a10, features: ['cracks', 'spikes'], wear: 0.5 },
  'an.the-long-noon': { main: 'metal.gold', second: 'leather.fine|0x5a2a10', trim: 'metal.gold', glow: 0xffc040, features: ['halo', 'flames'], wear: 0 },
  'an.eternity': { main: 'metal.bloodgold', stone: 0xff6aa0, glow: 0xff6aa0, features: ['halo', 'runes'], cut: { seamless: true }, wear: 0 },
  'an.the-first-word': { main: 'wood.bark', second: 'wood.polished', trim: 'metal.gold', glow: 0xfff0a0, features: ['leaves', 'runes', 'halo'], wear: 0 },
  'an.mourning-star': { main: 'metal.dark', second: 'cloth.silk|0x101014', trim: 'metal.silver', glow: 0xc0c8ff, features: ['stars', 'tatters'], wear: 0.2 },
  'an.the-hollow-crown': { main: 'metal.dark', trim: 'metal.voidgold', stone: 0x08060c, glow: 0x8a40ff, features: ['spikes', 'smoke'], cut: { hollow: true }, wear: 0.3 },
  'an.godsblood-shroud': { main: 'cloth.silk|0x44101c', trim: 'metal.bloodgold', glow: 0xff3a5a, features: ['eyes', 'stars'], wear: 0 },
};
