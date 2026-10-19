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
 *
 * i18n-ignore-file: the looks' names are notes for the art code, never shown to a player.
 */

import { DEPTH_LOOKS } from '../../data/uniqueBatches/index';

/** Decorations a piece can carry on top of its cut. See `Features.ts`. */
export type Feature =
  | 'arrows' // arrows stuck in it
  | 'barnacles'
  | 'bells'
  | 'blood' // dark drips and stains
  | 'bolts' // jagged lightning fins
  | 'bones' // vertebrae along the shaft
  | 'chains'
  | 'claws' // hooked talons
  | 'coils' // copper wire wound round the axis
  | 'coins'
  | 'cracks' // glowing cracks
  | 'crowns' // a ring of tall points
  | 'crystals'
  | 'dragons' // sculpted dragon heads, jaws open, eyes lit
  | 'eyes'
  | 'feathers'
  | 'flames'
  | 'frost'
  | 'ghost' // a translucent glowing half
  | 'gilded' // gold filigree bands
  | 'halo'
  | 'horns'
  | 'antlers' // branching tines
  | 'laurels' // leaf crowns and sprays
  | 'leaves'
  | 'moons' // crescents
  | 'rivets'
  | 'runes'
  | 'scales'
  | 'serpents' // coiled snakes, heads raised
  | 'skulls'
  | 'smoke'
  | 'spiders'
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
  | 'crown'
  | 'gate'
  | 'orbit'
  | 'drop'
  | 'arrow'
  | 'lily'
  | 'lantern'
  | 'paw'
  | 'purse'
  | 'gear'
  | 'wave'
  | 'bell'
  | 'kiln'
  | 'pane'
  | 'anchor'
  | 'mask'
  | 'compass'
  | 'candle';

/**
 * A living effect around a piece: particles and light that move. Drawn by
 * `items/Aura.ts` on the body, in the hand and on the floor, and painted
 * into the icon.
 */
export type Aura =
  | 'none'
  | 'soft' // a still halo of light
  | 'embers' // sparks rising
  | 'ash' // ash and cinders drifting up slowly
  | 'frost' // cold mist sinking, ice glints
  | 'sparkles' // star glints that wink
  | 'shine' // golden glints sliding over the surface
  | 'wisp' // a thin trail curling round
  | 'smoke' // dark coloured smoke
  | 'drips' // drops falling
  | 'sparks' // crackling arcs, fast and jumpy
  | 'motes' // slow floating dust of light
  | 'souls'; // pale wisps rising and fading

/**
 * How a glowing item's light moves over it (`items/Aura.ts`, the glow shell).
 * Each aura kind has a style of its own (`glowStyleOf`); a design can pick
 * another.
 */
export type GlowStyle =
  | 'rim' // a steady halo at the edges, breathing slowly
  | 'pulse' // a heartbeat: two quick throbs and a rest
  | 'flame' // tongues of fire licking up off the surface
  | 'shimmer' // a band of light sweeping along it, with glints
  | 'frost' // a cold glow with ice crystals winking in it
  | 'storm' // lightning crawling over it, with sudden flashes
  | 'void' // dark smoke swirling through the light
  | 'spectral'; // ghost-light rising off it in wisps

const STYLE_OF: Record<Exclude<Aura, 'none'>, GlowStyle> = {
  soft: 'rim',
  embers: 'flame',
  ash: 'flame',
  frost: 'frost',
  sparkles: 'shimmer',
  shine: 'shimmer',
  wisp: 'spectral',
  smoke: 'void',
  drips: 'pulse',
  sparks: 'storm',
  motes: 'rim',
  souls: 'spectral',
};

/** The glow style for an aura, unless the design names its own. */
export function glowStyleOf(aura: Aura, own?: GlowStyle): GlowStyle {
  return own ?? (aura === 'none' ? 'rim' : STYLE_OF[aura]);
}

/** How a surface is finished: the shine of its metal and leather. */
export type Finish = 'polished' | 'lacquer' | 'satin' | 'matte' | 'frosted' | 'blackened' | 'weathered' | 'gilt' | 'pearl';

/** Metalness, roughness and a faint inner light (in the glow colour) per finish. */
export const FINISHES: Record<Finish, { metalness?: number; roughness: number; sheen: number }> = {
  polished: { metalness: 0.8, roughness: 0.26, sheen: 0 },
  lacquer: { metalness: 0.3, roughness: 0.22, sheen: 0.02 },
  satin: { roughness: 0.42, sheen: 0 },
  matte: { metalness: 0.25, roughness: 0.82, sheen: 0 },
  frosted: { metalness: 0.55, roughness: 0.5, sheen: 0.05 },
  blackened: { metalness: 0.5, roughness: 0.62, sheen: 0 },
  weathered: { metalness: 0.45, roughness: 0.7, sheen: 0 },
  gilt: { metalness: 0.9, roughness: 0.2, sheen: 0.06 },
  pearl: { metalness: 0.5, roughness: 0.3, sheen: 0.08 },
};

/**
 * Everything a set's pieces share: the set's signature. Each set has its own
 * palette (main surface by material, trim, cloth and glow), its own sculpted
 * motif (the first feature, worn on every piece) and its own aura. A full
 * set is one matched outfit.
 */
export interface SetMotif {
  /** The palette in words, for the design bible. */
  name: string;
  /** The set's colour: stones, emblem. */
  color: number;
  /** Glow and aura colour. */
  glow: number;
  /** Main surface of metal pieces. */
  metal: string;
  /** Main surface of leather pieces. */
  leather: string;
  /** Main surface of cloth pieces. */
  cloth: string;
  /** Cloth and leather on every piece: surface key, may carry `|0xRRGGBB`. */
  second: string;
  /** Trim metal. */
  trim: string;
  finish: Finish;
  /** The sculpted signature every piece carries (dragons, wings, antlers...). Unique among sets. */
  sculpt: Feature;
  emblem: Emblem;
  /** Extra features after the sculpt. */
  features: Feature[];
  aura: Aura;
  /** How its glow moves, when not its aura's own style. */
  glowStyle?: GlowStyle;
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
  /** Its living effect. Every unique has one. */
  aura: Aura;
  /** How its glow moves, when not its aura's own style. */
  glowStyle?: GlowStyle;
  finish?: Finish;
}

export const SET_MOTIFS: Record<string, SetMotif> = {
  // Early sets.
  'set.bloodied': { name: 'blood-red lacquer and black iron', color: 0xff2a2a, glow: 0xff1c1c, metal: 'metal.steel|0x8c1616', leather: 'leather.fine|0x6a1210', cloth: 'cloth.silk|0x5a0e10', second: 'leather.dark', trim: 'metal.blackiron', finish: 'lacquer', sculpt: 'claws', emblem: 'hand', features: ['blood'], aura: 'drips', wear: 0.55 },
  'set.kindled': { name: 'scorched crimson and candle flame', color: 0xff8a1a, glow: 0xffb83a, metal: 'metal.copper|0xb06040', leather: 'leather.fine|0x5a2416', cloth: 'cloth.wool|0x7a1a14', second: 'cloth.linen|0x9a3c1c', trim: 'metal.copper', finish: 'matte', sculpt: 'flames', emblem: 'flame', features: ['cracks'], aura: 'embers', wear: 0.35 },
  'set.quickstep': { name: 'moss leather and bright silver', color: 0x7aff9a, glow: 0x8affb0, metal: 'metal.silver|0xd0e6d0', leather: 'leather.fine|0x3e5a2c', cloth: 'cloth.wool|0x46603a', second: 'leather.worn|0x4c5e3a', trim: 'metal.silver', finish: 'satin', sculpt: 'feathers', emblem: 'feather', features: ['tatters'], aura: 'wisp', wear: 0.3 },
  // Mid sets.
  'set.bonefetter': { name: 'bone and verdigris, corpse-light', color: 0xc0ff70, glow: 0xb8ff5a, metal: 'metal.verdigris', leather: 'leather.worn|0x5a6a50', cloth: 'cloth.tattered|0x5a5a4c', second: 'cloth.tattered|0x4a4a3c', trim: 'bone.old', finish: 'weathered', sculpt: 'skulls', emblem: 'skull', features: ['bones'], aura: 'souls', wear: 0.6 },
  'set.gravewarden': { name: 'grave bronze and lantern amber', color: 0xffc040, glow: 0xffb030, metal: 'metal.bronze|0x9a8a6a', leather: 'leather.dark', cloth: 'cloth.wool|0x3a4034', second: 'cloth.undyed|0x4a5242', trim: 'metal.blackiron', finish: 'weathered', sculpt: 'eyes', emblem: 'eye', features: ['rivets', 'runes'], aura: 'motes', wear: 0.5 },
  'set.frostwrought': { name: 'ice blue and frosted silver', color: 0x9ad8ff, glow: 0x8ad0ff, metal: 'metal.silver|0xc0e4ff', leather: 'leather.fine|0x9ab8d0', cloth: 'cloth.silk|0xb0d0ea', second: 'leather.fine|0x2a3c50', trim: 'metal.silver|0xe8f6ff', finish: 'frosted', sculpt: 'crystals', emblem: 'snowflake', features: ['frost'], aura: 'frost', wear: 0.15 },
  'set.stormbound': { name: 'storm navy and burnished copper', color: 0x7ad8ff, glow: 0x9ae8ff, metal: 'metal.steel|0x3a4a7a', leather: 'leather.fine|0x22305a', cloth: 'cloth.silk|0x1e2c5a', second: 'cloth.silk|0x283c62', trim: 'metal.copper', finish: 'polished', sculpt: 'bolts', emblem: 'bolt', features: ['coils'], aura: 'sparks', wear: 0.25 },
  'set.venomthread': { name: 'black silk and venom green', color: 0x9aff3a, glow: 0x60ff30, metal: 'metal.blackiron|0x2a3a22', leather: 'leather.dark|0x1a2414', cloth: 'cloth.silk|0x14200e', second: 'cloth.silk|0x223418', trim: 'metal.dark', finish: 'satin', sculpt: 'spiders', emblem: 'web', features: ['web'], aura: 'drips', wear: 0.3 },
  'set.ironvow': { name: 'gunmetal and royal blue', color: 0x4a7aff, glow: 0x5a8aff, metal: 'metal.steel|0x6a7488', leather: 'leather.studded', cloth: 'cloth.banner|0x1a2a6a', second: 'cloth.banner|0x1a2a6a', trim: 'metal.silver', finish: 'polished', sculpt: 'chains', emblem: 'shield', features: ['rivets'], aura: 'soft', wear: 0.4 },
  // Late sets.
  'set.ashwalker': { name: 'blackened iron and ember cracks', color: 0xff5a1a, glow: 0xff4a10, metal: 'metal.blackiron', leather: 'leather.dark|0x2c2622', cloth: 'cloth.wool|0x2a2420', second: 'leather.fine|0x2c2622', trim: 'metal.dark', finish: 'blackened', sculpt: 'dragons', emblem: 'ember', features: ['cracks', 'scales'], aura: 'ash', wear: 0.6 },
  'set.gilded': { name: 'full gold with a gold shine', color: 0xffd25a, glow: 0xffd040, metal: 'metal.gold', leather: 'leather.fine|0xc89a3a', cloth: 'cloth.silk|0xd8b048', second: 'cloth.banner|0x5c1a2c', trim: 'metal.gold', finish: 'gilt', sculpt: 'coins', emblem: 'coin', features: ['gilded'], aura: 'shine', wear: 0.05 },
  'set.nightfall': { name: 'void violet and black', color: 0x9a6aff, glow: 0x9064ff, metal: 'metal.blackiron|0x4a3a6a', leather: 'leather.dark|0x2a1c40', cloth: 'cloth.silk|0x1c162c', second: 'cloth.silk|0x1c162c', trim: 'metal.voidgold', finish: 'satin', sculpt: 'moons', emblem: 'moon', features: ['smoke'], aura: 'smoke', wear: 0.2 },
  // Endgame sets.
  'set.sunderedsky': { name: 'white and silver with a white glow', color: 0xffffff, glow: 0xf0f4ff, metal: 'metal.silver|0xf4f6ff', leather: 'leather.fine|0xe8e4dc', cloth: 'cloth.white', second: 'cloth.white', trim: 'metal.silver', finish: 'pearl', sculpt: 'stars', emblem: 'star', features: ['halo'], glowStyle: 'rim', aura: 'sparkles', wear: 0 },
  'set.lastlegion': { name: 'polished brass and legion crimson', color: 0xff4a2a, glow: 0xff7040, metal: 'metal.brass', leather: 'leather.fine|0x6a1a14', cloth: 'cloth.banner|0x8a1c1a', second: 'cloth.banner|0x8a1c1a', trim: 'metal.gold', finish: 'polished', sculpt: 'wings', emblem: 'laurel', features: ['laurels', 'tatters'], aura: 'embers', wear: 0.3 },
  'set.hollowking': { name: 'obsidian and pale gold, spectral cyan', color: 0x6affe8, glow: 0x50f0e0, metal: 'metal.blackiron|0x2a2a30', leather: 'leather.dark|0x18161c', cloth: 'cloth.silk|0x1a1222', second: 'cloth.silk|0x1a1222', trim: 'metal.gold|0xd8c890', finish: 'satin', sculpt: 'antlers', emblem: 'crown', features: ['gilded', 'smoke'], aura: 'souls', wear: 0.1 },
  // The depth plan's sets. Class sets first.
  'set.tollgate': { name: 'black iron and toll-road red', color: 0xd03a2a, glow: 0xff6040, metal: 'metal.blackiron|0x2e2e34', leather: 'leather.dark', cloth: 'cloth.banner|0x8a1a14', second: 'cloth.banner|0x8a1a14', trim: 'metal.brass', finish: 'blackened', sculpt: 'spikes', emblem: 'gate', features: ['rivets'], aura: 'soft', wear: 0.45 },
  'set.orrery': { name: 'blue enamel and turning brass', color: 0x4a7ad8, glow: 0x8ab0ff, metal: 'metal.brass|0xc8a050', leather: 'leather.fine|0x1a2a5a', cloth: 'cloth.silk|0x1e3070', second: 'cloth.silk|0x1e3070', trim: 'metal.gold', finish: 'lacquer', sculpt: 'coils', emblem: 'orbit', features: ['stars'], aura: 'motes', wear: 0.15 },
  'set.lampblack': { name: 'soot black and brass buttons', color: 0xc8a050, glow: 0xffd080, metal: 'metal.black|0x18181a', leather: 'leather.dark|0x141414', cloth: 'cloth.wool|0x161616', second: 'cloth.wool|0x1c1c1c', trim: 'metal.brass', finish: 'matte', sculpt: 'smoke', emblem: 'drop', features: ['tatters'], aura: 'smoke', wear: 0.6 },
  'set.heronwatch': { name: 'heron grey-blue and woven reed', color: 0x8aa8c0, glow: 0xc0d8f0, metal: 'metal.steel|0x8a98a8', leather: 'leather.fine|0x5a6a78', cloth: 'cloth.linen|0x8a9aa8', second: 'wood.bark|0x8a7a50', trim: 'metal.silver', finish: 'satin', sculpt: 'arrows', emblem: 'arrow', features: ['feathers'], aura: 'wisp', wear: 0.35 },
  'set.pallbearer': { name: 'black velvet, silver nails and lilies', color: 0xf0f0e8, glow: 0xe8e8ff, metal: 'metal.dark|0x2a2a30', leather: 'leather.dark|0x18141c', cloth: 'cloth.velvet|0x141018', second: 'cloth.velvet|0x141018', trim: 'metal.silver', finish: 'satin', sculpt: 'bones', emblem: 'lily', features: ['rivets', 'leaves'], aura: 'souls', wear: 0.25 },
  'set.lanternwright': { name: 'white enamel and brass lamp cages', color: 0xffe0a0, glow: 0xffd070, metal: 'metal.silver|0xf0ece0', leather: 'leather.fine|0xd8d0c0', cloth: 'cloth.white', second: 'cloth.white', trim: 'metal.brass', finish: 'lacquer', sculpt: 'halo', emblem: 'lantern', features: ['gilded'], aura: 'soft', wear: 0.2 },
  'set.tallowmoon': { name: 'cream fur and tallow wax', color: 0xf0e4c8, glow: 0xfff0d0, metal: 'bone.pale|0xe8dcc0', leather: 'leather.hide|0xe0d4b8', cloth: 'cloth.wool|0xe8dcc4', second: 'leather.hide|0xd8c8a8', trim: 'bone.old', finish: 'satin', sculpt: 'horns', emblem: 'paw', features: ['claws'], aura: 'motes', wear: 0.4 },
  // Open sets.
  'set.cutpurse': { name: 'stolen gilt on cheap string', color: 0xe0c060, glow: 0xffe080, metal: 'metal.gold|0xc8a858', leather: 'leather.worn', cloth: 'cloth.homespun', second: 'cloth.homespun|0x6a5a40', trim: 'metal.brass', finish: 'weathered', sculpt: 'tatters', emblem: 'purse', features: ['coins'], aura: 'shine', wear: 0.6 },
  'set.tinker': { name: 'patched leather and copper rivets', color: 0xd08040, glow: 0xffa060, metal: 'metal.copper', leather: 'leather.worn|0x6a4a2a', cloth: 'cloth.rag|0x6a5a48', second: 'leather.worn|0x5a3a20', trim: 'metal.copper', finish: 'weathered', sculpt: 'rivets', emblem: 'gear', features: ['tatters'], aura: 'sparks', wear: 0.75 },
  'set.saltmarsh': { name: 'oilcloth with salt-white rims', color: 0xe8f0f0, glow: 0xd0f0f0, metal: 'metal.iron|0x7a8a88', leather: 'leather.fine|0x3a4a40', cloth: 'cloth.linen|0x4a5a50', second: 'cloth.white|0xe8ece8', trim: 'metal.verdigris', finish: 'weathered', sculpt: 'barnacles', emblem: 'wave', features: ['scales'], aura: 'drips', wear: 0.6 },
  'set.ninefold': { name: 'silver and nine little bells', color: 0xd8e0f0, glow: 0xf0f4ff, metal: 'metal.silver', leather: 'leather.fine|0xb8c0d0', cloth: 'cloth.silk|0xd0d8e8', second: 'cloth.silk|0xd0d8e8', trim: 'metal.silver|0xf0f4ff', finish: 'polished', sculpt: 'bells', emblem: 'bell', features: ['runes'], aura: 'sparkles', wear: 0.15 },
  'set.kilnborn': { name: 'glazed red clay and gold glaze lines', color: 0xc84a2a, glow: 0xffa040, metal: 'stone.foundry|0xa84a30', leather: 'leather.fine|0x6a2a18', cloth: 'cloth.linen|0x8a3a20', second: 'cloth.linen|0x5a2a1a', trim: 'metal.gold', finish: 'lacquer', sculpt: 'cracks', emblem: 'kiln', features: ['gilded'], aura: 'embers', wear: 0.4 },
  'set.glasswing': { name: 'pale cloth and crystal panes', color: 0xc0e8ff, glow: 0xd8f4ff, metal: 'crystal.ice|0xd0ecff', leather: 'leather.fine|0xd8e0e8', cloth: 'cloth.silk|0xe0ecf4', second: 'cloth.silk|0xe0ecf4', trim: 'metal.silver', finish: 'pearl', sculpt: 'ghost', emblem: 'pane', features: ['wings'], aura: 'sparkles', wear: 0.1 },
  'set.drownedbell': { name: 'sea-green coats, rope and brass bells', color: 0x40b0a0, glow: 0x70e0d0, metal: 'metal.verdigris|0x4a8a78', leather: 'leather.fine|0x2a4a40', cloth: 'cloth.banner|0x1e5a50', second: 'cloth.banner|0x1e5a50', trim: 'metal.brass', finish: 'weathered', sculpt: 'serpents', emblem: 'anchor', features: ['chains'], aura: 'drips', wear: 0.55 },
  'set.pretender': { name: 'stolen royal purple and tarnished gold', color: 0x8a3ac0, glow: 0xc080ff, metal: 'metal.gold|0xb8983a', leather: 'leather.fine|0x3a1a4a', cloth: 'cloth.velvet|0x4a1a5a', second: 'cloth.velvet|0x4a1a5a', trim: 'metal.gold', finish: 'weathered', sculpt: 'crowns', emblem: 'mask', features: ['gilded'], aura: 'shine', wear: 0.35 },
  'set.cartographer': { name: 'ink-stained leather and compass brass', color: 0x2a3a5a, glow: 0x8aa0d0, metal: 'metal.brass|0xa88a50', leather: 'leather.dark|0x2a2420', cloth: 'cloth.linen|0xc8b890', second: 'leather.dark|0x241e1a', trim: 'metal.brass', finish: 'matte', sculpt: 'runes', emblem: 'compass', features: ['rivets'], aura: 'motes', wear: 0.5 },
  'set.hollowmere': { name: 'drowned black and pond teal, lamp glass and one soft light', color: 0xffc860, glow: 0xffd890, metal: 'metal.blackiron|0x24282c', leather: 'leather.dark|0x1a2024', cloth: 'cloth.wool|0x1e4a48', second: 'cloth.wool|0x1e4a48', trim: 'metal.brass', finish: 'satin', sculpt: 'vines', emblem: 'candle', features: ['cracks'], glowStyle: 'flame', aura: 'embers', wear: 0.3 },
};

/** A set we have no motif for still gets a stable colour. */
export function fallbackMotif(setId: string, hash: number): SetMotif {
  const hues = [0x33d64a, 0x3ac8c0, 0x4a8cff, 0xb05cff, 0xff6a9a, 0xffb43a, 0xd8e05a];
  void setId;
  const c = hues[hash % hues.length]!;
  return { name: 'fallback', color: c, glow: c, metal: 'metal.steel', leather: 'leather.fine', cloth: 'cloth.silk', second: 'cloth.silk', trim: 'metal.silver', finish: 'satin', sculpt: 'runes', emblem: 'star', features: [], aura: 'soft', wear: 0.3 };
}

export const UNIQUE_DESIGNS: Record<string, UniqueDesign> = {
  // ---- unique ------------------------------------------------------------
  'uq.rixots': { main: 'metal.silver', second: 'leather.fine|0x4a2418', features: ['runes'], glow: 0xdfe8ff, glowStrength: 0.12, cut: { w: 0.052, fuller: 0.85, tip: 'spear' }, wear: 0.3, aura: 'sparkles' },
  'uq.felloak': { main: 'wood.charred', second: 'leather.worn', glow: 0xff6a1e, features: ['cracks', 'smoke'], cut: { knots: 7 }, wear: 0.8, aura: 'embers' },
  'uq.gnasher': { main: 'metal.rusted', second: 'bone.old', features: ['teeth'], glow: 0xd0b080, glowStrength: 0, wear: 0.9, aura: 'drips' },
  'uq.hotspur': { main: 'leather.fine|0x3a2216', trim: 'metal.copper', glow: 0xff7a2a, features: ['flames', 'cracks'], wear: 0.5, aura: 'embers' },
  'uq.pluckeye': { main: 'wood.polished|0x4a3020', second: 'leather.fine', glow: 0xffd070, stone: 0xffc040, features: ['eyes'], wear: 0.4, aura: 'motes' },
  'uq.greyform': { main: 'leather.worn|0x9a9890', second: 'cloth.undyed', features: ['tatters', 'rivets'], glow: 0xc8c8c0, glowStrength: 0, wear: 0.8, aura: 'ash', finish: 'matte' },
  'uq.jadetando': { main: 'crystal.ice|0x48d080', second: 'leather.fine|0x1e3a24', glow: 0x40d070, features: ['runes'], cut: { tip: 'fang', curve: 0.25 }, wear: 0.1, aura: 'wisp' },
  'uq.wormskull': { main: 'bone.old', second: 'flesh.rotted', glow: 0x9ac04a, features: ['serpents', 'eyes', 'vines'], wear: 0.7, aura: 'souls' },
  'uq.steelclash': { main: 'metal.bronze', second: 'leather.worn', glow: 0xffd88a, glowStrength: 0.12, features: ['bells', 'rivets'], wear: 0.6, aura: 'shine' },
  'uq.nightsmoke': { main: 'cloth.silk|0x6e7280', trim: 'metal.silver', glow: 0xb8c4d8, features: ['smoke', 'tatters'], wear: 0.2, aura: 'smoke' },
  'uq.bloodrise': { main: 'metal.dark', second: 'leather.fine|0x501414', trim: 'metal.bloodgold', glow: 0xb01818, features: ['skulls', 'blood', 'teeth'], wear: 0.6, aura: 'drips' },
  'uq.civerbs': { main: 'wood.rotted', second: 'cloth.tattered', trim: 'metal.iron', glow: 0x9ad8c8, features: ['rivets', 'chains', 'bells'], wear: 0.8, aura: 'souls' },
  'uq.gorefoot': { main: 'leather.fine|0x5a1a14', trim: 'metal.dark', glow: 0xc02018, features: ['blood', 'spikes'], wear: 0.6, aura: 'drips' },
  'uq.venomward': { main: 'metal.verdigris', second: 'leather.worn|0x30401c', glow: 0x5ac84a, features: ['vines', 'thorns'], wear: 0.6, aura: 'drips' },
  'uq.skystrike': { main: 'wood.polished|0x5a6878', second: 'leather.fine|0x1e2a3a', trim: 'metal.silver', glow: 0xa8dcff, features: ['coils', 'runes'], wear: 0.25, aura: 'sparks' },
  'uq.hexfire': { main: 'metal.bloodgold', second: 'leather.fine|0x3a1810', glow: 0xff6020, features: ['flames', 'runes'], wear: 0.3, aura: 'embers' },
  'uq.frostwind': { main: 'metal.silver|0xcfe6ff', second: 'leather.fine|0x22344a', glow: 0x9ad8ff, features: ['frost', 'crystals'], wear: 0.2, aura: 'frost', finish: 'frosted' },
  'uq.duskdeep': { main: 'metal.dark', trim: 'metal.iron', glow: 0x90a0b0, glowStrength: 0, features: ['rivets', 'cracks'], cut: { welded: true }, wear: 0.85, aura: 'ash', finish: 'blackened' },
  'uq.magefist': { main: 'cloth.silk|0x5a2618', trim: 'metal.copper', glow: 0xff7030, features: ['cracks', 'flames'], wear: 0.4, aura: 'embers' },
  'uq.frostburn': { main: 'leather.fine|0x2a3444', trim: 'metal.silver', glow: 0x7ab4ff, features: ['frost'], wear: 0.4, aura: 'frost' },
  'uq.stormchaser': { main: 'wood.polished|0x6a5a48', trim: 'metal.copper', glow: 0xa8d8ff, features: ['coils', 'wings'], cut: { top: 'vane' }, wear: 0.3, aura: 'sparks' },
  'uq.rockstopper': { main: 'metal.iron', trim: 'metal.bronze', glow: 0xc0a080, glowStrength: 0, features: ['rivets', 'cracks'], cut: { dent: true }, wear: 0.95, aura: 'ash' },
  'uq.goldwrap': { main: 'metal.gold', second: 'leather.fine|0x4a2a14', glow: 0xffd860, features: ['coins', 'gilded'], wear: 0.15, aura: 'shine', finish: 'gilt' },
  'uq.nagelring': { main: 'metal.bronze', stone: 0x3ad07a, glow: 0x60e090, features: ['coins'], wear: 0.5, aura: 'motes' },
  'uq.manald': { main: 'metal.bloodgold', stone: 0xd8303c, glow: 0xff6070, features: ['runes'], wear: 0.3, aura: 'soft' },
  'uq.cleglaw': { main: 'metal.dark', second: 'leather.fine|0x1a1418', trim: 'metal.silver', glow: 0xd8d8ff, features: ['thorns'], wear: 0.2, aura: 'sparkles' },
  'uq.buriza': { main: 'metal.dark', second: 'wood.polished|0x3a2a1e', trim: 'metal.bronze', glow: 0xa8dcff, features: ['rivets', 'spikes'], wear: 0.5, aura: 'frost' },
  'uq.titans': { main: 'metal.gold', second: 'wood.polished', glow: 0xffd070, features: ['wings', 'runes'], wear: 0.3, aura: 'sparks', finish: 'polished' },
  'uq.stormshield': { main: 'metal.steel', second: 'leather.worn|0x4a3020', trim: 'metal.iron', glow: 0xb8c8d8, glowStrength: 0, features: ['rivets', 'cracks'], cut: { straps: 11 }, wear: 0.8, aura: 'shine' },
  'uq.shaftstop': { main: 'metal.steel', second: 'cloth.undyed', trim: 'metal.bronze', glow: 0xd0c0a0, glowStrength: 0, features: ['arrows', 'rivets'], wear: 0.85, aura: 'ash' },
  'uq.gazehell': { main: 'bone.old|0x9a8a7a', trim: 'metal.dark', glow: 0xff5a1a, features: ['dragons', 'eyes', 'flames'], wear: 0.6, aura: 'embers' },
  'uq.silkweave': { main: 'cloth.silk|0xd0c8b8', trim: 'metal.silver', glow: 0xe8e0ff, features: ['web'], wear: 0.2, aura: 'wisp' },
  'uq.chancecast': { main: 'metal.gold', second: 'cloth.banner|0x5a1a2a', glow: 0xffd860, stone: 0x3ad07a, features: ['coins', 'gilded'], wear: 0.3, aura: 'shine', finish: 'gilt' },
  'uq.ravenfrost': { main: 'metal.silver|0xb8d8ff', stone: 0x9ad8ff, glow: 0xa8e0ff, features: ['frost'], wear: 0.1, glowStyle: 'void', aura: 'frost', finish: 'frosted' },
  'uq.bulkathos': { main: 'metal.gold', stone: 0xff6a80, glow: 0xffb0c0, features: ['chains'], cut: { twin: true }, wear: 0.5, aura: 'soft' },
  'uq.thegravenspine': { main: 'wood.rotted|0x8a8070', trim: 'bone.old', glow: 0x9ad8c0, features: ['bones', 'eyes'], wear: 0.6, aura: 'souls' },
  'uq.widowmaker': { main: 'metal.voidgold', second: 'wood.polished|0x8a1020', trim: 'metal.dark', glow: 0xc02040, features: ['tatters', 'thorns'], wear: 0.3, aura: 'smoke', finish: 'lacquer' },
  'uq.hellslayer': { main: 'metal.dark', second: 'leather.fine|0x2a1a14', trim: 'metal.bloodgold', glow: 0xff4020, features: ['cracks', 'skulls'], wear: 0.5, aura: 'embers', finish: 'blackened' },
  'uq.spectralshard': { main: 'metal.steel', second: 'leather.fine', glow: 0x9ad8ff, features: ['ghost', 'runes'], cut: { broken: true }, wear: 0.4, aura: 'wisp' },
  'uq.windforce': { main: 'metal.gold', second: 'wood.polished|0x3a6ac8', trim: 'metal.gold', glow: 0xd8f0ff, features: ['wings', 'feathers'], wear: 0.25, aura: 'wisp' },
  'uq.doombringer': { main: 'metal.dark', second: 'leather.fine|0x2a1010', trim: 'metal.bloodgold', glow: 0xd04030, features: ['skulls', 'cracks'], wear: 0.4, aura: 'smoke', finish: 'blackened' },
  'uq.griswold': { main: 'metal.steel', second: 'leather.fine|0x3a2414', trim: 'metal.gold', glow: 0xff7a20, features: ['runes', 'gilded', 'flames'], wear: 0.15, aura: 'embers', finish: 'polished' },
  'uq.azurewrath': { main: 'crystal.ice|0x9ad0ff', second: 'leather.fine|0x1a2a44', trim: 'metal.silver', glow: 0x80c8ff, features: ['crystals', 'frost'], wear: 0, aura: 'sparkles', finish: 'polished' },
  'uq.arreatsface': { main: 'stone.crypt|0x8a8478', trim: 'bone.old', glow: 0xd0a060, glowStrength: 0.12, features: ['cracks', 'horns'], cut: { face: true }, wear: 0.7, aura: 'ash' },
  'uq.crownofages': { main: 'metal.gold', trim: 'metal.gold', stone: 0xd8303c, glow: 0xffd070, features: ['laurels', 'gilded', 'spikes'], cut: { gems: 6 }, wear: 0.4, aura: 'shine', finish: 'gilt' },
  'uq.leviathan': { main: 'metal.verdigris', second: 'leather.fine|0x1e3a3a', trim: 'metal.bronze', glow: 0x3ac8b8, features: ['serpents', 'barnacles', 'scales'], wear: 0.6, aura: 'drips' },
  'uq.skinofvipermagi': { main: 'leather.fine|0x8a3a5a', trim: 'metal.dark', glow: 0x9ad84a, features: ['scales', 'serpents'], wear: 0.3, aura: 'smoke' },
  'uq.warTraveler': { main: 'leather.worn|0x5a4632', trim: 'metal.iron', glow: 0xd0b080, glowStrength: 0, features: ['tatters', 'rivets'], wear: 1, aura: 'ash', finish: 'matte' },
  'uq.gorerider': { main: 'leather.fine|0x3a3230', trim: 'bone.pale', glow: 0xd04030, features: ['horns', 'spikes', 'blood'], wear: 0.6, aura: 'drips' },
  'uq.dracul': { main: 'metal.bloodgold', second: 'leather.fine|0x2a0e0e', glow: 0xc01c1c, features: ['claws', 'spikes', 'blood'], wear: 0.4, aura: 'drips', finish: 'lacquer' },
  'uq.arachnid': { main: 'cloth.silk|0x2a2432', trim: 'metal.dark', glow: 0xa060ff, features: ['spiders', 'web'], wear: 0.2, aura: 'smoke' },
  'uq.verdungo': { main: 'leather.worn|0x5c4a2a', trim: 'metal.iron', glow: 0xd8a860, glowStrength: 0, features: ['rivets', 'tatters'], wear: 0.8, aura: 'soft', finish: 'matte' },
  'uq.highlords': { main: 'metal.gold', trim: 'bone.old', stone: 0xd04020, glow: 0xff6030, features: ['bones'], wear: 0.4, aura: 'sparks' },
  'uq.mara': { main: 'metal.silver', stone: 0xf0f8ff, glow: 0xd8f0ff, features: ['crystals'], wear: 0.2, aura: 'sparkles', finish: 'pearl' },
  'uq.metalgrid': { main: 'metal.iron', trim: 'metal.copper', stone: 0x80c0ff, glow: 0x9ad0ff, features: ['rivets', 'coils'], wear: 0.6, aura: 'sparks' },
  'uq.soj': { main: 'metal.gold', stone: 0x5aa0ff, glow: 0x8ac0ff, features: ['coins'], wear: 0.3, aura: 'motes' },
  'uq.carrionwind': { main: 'metal.dark', stone: 0x7ac04a, glow: 0x8ad050, features: ['smoke'], wear: 0.5, aura: 'smoke' },
  'uq.thunderstroke': { main: 'metal.gold', second: 'wood.charred', trim: 'metal.silver', glow: 0xf0e05a, features: ['bolts', 'coils'], wear: 0.2, aura: 'sparks' },
  'uq.deathsweb': { main: 'crystal.void|0x3a5a2a', second: 'bone.old', glow: 0x7ac84a, features: ['web'], wear: 0.3, glowStyle: 'void', aura: 'souls' },
  'uq.eschutas': { main: 'crystal.ice|0xffa070', trim: 'metal.gold', glow: 0xff6a30, stone: 0x6ac0ff, features: ['stars', 'cracks'], cut: { split: true }, wear: 0, glowStyle: 'pulse', aura: 'embers' },
  'uq.herald': { main: 'metal.gold', second: 'cloth.banner|0x7a1a1e', trim: 'metal.silver', glow: 0xffe8a0, features: ['laurels', 'tatters', 'gilded'], wear: 0.3, aura: 'shine' },
  'uq.lastwish': { main: 'metal.dark', trim: 'metal.gold', glow: 0xf0e05a, features: ['stars', 'cracks'], wear: 0.6, aura: 'sparkles' },
  // ---- mythic ------------------------------------------------------------
  'my.griffonseye': { main: 'metal.gold', stone: 0xffd060, glow: 0xffd060, features: ['eyes', 'feathers', 'halo'], cut: { lens: true }, wear: 0, aura: 'shine' },
  'my.harlequin': { main: 'metal.gold', second: 'cloth.banner|0x7a1a3a', stone: 0x5a8cff, glow: 0xff6ab0, features: ['bells'], cut: { jester: true }, wear: 0.1, aura: 'sparkles' },
  'my.tyraelsmight': { main: 'metal.silver', second: 'cloth.linen|0xd8d0c0', trim: 'metal.gold', glow: 0xfff0c0, features: ['wings', 'halo'], wear: 0, aura: 'motes', finish: 'pearl' },
  'my.chainsofhonor': { main: 'metal.steel', second: 'cloth.banner|0xa01e1e', trim: 'metal.gold', glow: 0xffd070, features: ['chains', 'gilded'], wear: 0.2, aura: 'shine' },
  'my.the-oculus': { main: 'crystal.void|0x4a3070', trim: 'metal.voidgold', stone: 0xfff0a0, glow: 0x8a60ff, features: ['eyes', 'stars'], wear: 0, glowStyle: 'pulse', aura: 'wisp' },
  'my.wizardspike': { main: 'crystal.ice|0xc8d8ff', second: 'leather.fine|0x1a1a3a', trim: 'metal.silver', glow: 0x80b0ff, features: ['runes', 'frost'], wear: 0, aura: 'frost' },
  'my.the-reapers-toll': { main: 'metal.verdigris', second: 'wood.charred', trim: 'metal.dark', glow: 0x9ad8b8, features: ['skulls', 'coins'], cut: { scythe: true }, wear: 0.5, aura: 'souls' },
  'my.beast': { main: 'metal.bloodgold', second: 'leather.fine|0x3a2418', glow: 0xd04020, features: ['teeth', 'tatters'], wear: 0.5, aura: 'embers' },
  'my.iceblink': { main: 'crystal.ice|0xd0ecff', second: 'cloth.silk|0x8a5ac0', trim: 'metal.silver', glow: 0xb8e8ff, features: ['frost', 'bells'], wear: 0, aura: 'frost', finish: 'frosted' },
  'my.faith': { main: 'metal.gold', second: 'cloth.linen|0xe0d8c0', trim: 'metal.silver', glow: 0xffd060, features: ['halo', 'wings'], wear: 0, aura: 'motes', finish: 'gilt' },
  'my.spirit-of-the-forge': { main: 'metal.dark', second: 'leather.fine|0x2a1a10', trim: 'metal.copper', glow: 0xff6a10, features: ['cracks', 'flames'], wear: 0.4, aura: 'embers' },
  'my.nightwing': { main: 'metal.dark', stone: 0x6ab0ff, glow: 0x6ab0ff, features: ['wings', 'smoke'], wear: 0, aura: 'wisp' },
  'my.stoneofthevoid': { main: 'metal.voidgold', stone: 0x1a1030, glow: 0x8a60ff, features: ['moons', 'smoke'], wear: 0, aura: 'smoke' },
  'my.seraphshymn': { main: 'metal.silver', stone: 0xfff0c0, glow: 0xfff0c0, features: ['wings', 'halo'], wear: 0, glowStyle: 'shimmer', aura: 'motes', finish: 'pearl' },
  // ---- ancient -----------------------------------------------------------
  'an.worldbreaker': { main: 'stone.crypt|0x5a5048', second: 'metal.dark', trim: 'metal.bloodgold', glow: 0xff3a10, features: ['cracks', 'spikes'], wear: 0.5, glowStyle: 'pulse', aura: 'ash' },
  'an.the-long-noon': { main: 'metal.gold', second: 'leather.fine|0x5a2a10', trim: 'metal.gold', glow: 0xffc040, features: ['halo', 'flames'], wear: 0, aura: 'shine', finish: 'gilt' },
  'an.eternity': { main: 'metal.bloodgold', stone: 0xff6aa0, glow: 0xff6aa0, features: ['serpents', 'runes'], cut: { seamless: true }, wear: 0, glowStyle: 'rim', aura: 'sparkles' },
  'an.the-first-word': { main: 'wood.bark', second: 'wood.polished', trim: 'metal.gold', glow: 0xfff0a0, features: ['leaves', 'runes', 'vines'], wear: 0, glowStyle: 'spectral', aura: 'motes' },
  'an.mourning-star': { main: 'metal.dark', second: 'cloth.silk|0x101014', trim: 'metal.silver', glow: 0xc0c8ff, features: ['stars', 'tatters'], wear: 0.2, glowStyle: 'void', aura: 'sparkles', finish: 'blackened' },
  'an.the-hollow-crown': { main: 'metal.dark', trim: 'metal.voidgold', stone: 0x08060c, glow: 0x8a40ff, features: ['crowns', 'spikes', 'smoke'], cut: { hollow: true }, wear: 0.3, aura: 'smoke' },
  'an.godsblood-shroud': { main: 'cloth.silk|0x44101c', trim: 'metal.bloodgold', glow: 0xff3a5a, features: ['eyes', 'stars'], wear: 0, glowStyle: 'pulse', aura: 'souls' },
  // ---- pants -------------------------------------------------------------
  'uq.mudlark': { main: 'cloth.wool|0x2e2418', trim: 'metal.iron', glow: 0x8a9a6a, glowStrength: 0, features: ['tatters', 'rivets'], wear: 0.85, aura: 'drips', finish: 'matte' },
  'uq.hearthwool': { main: 'cloth.wool|0x4e2012', trim: 'metal.copper', glow: 0xff8a40, features: ['flames', 'runes'], wear: 0.3, aura: 'embers' },
  'uq.gatewarden': { main: 'metal.iron', trim: 'metal.bronze', glow: 0xc0a080, glowStrength: 0, features: ['spikes', 'rivets'], wear: 0.6, aura: 'ash' },
  'uq.brambleshanks': { main: 'leather.fine|0x2e3a1c', trim: 'metal.dark', glow: 0x6ab040, features: ['thorns', 'vines'], wear: 0.5, aura: 'drips' },
  'uq.stillwater': { main: 'cloth.silk|0x1e3450', trim: 'metal.silver', glow: 0x9ad8ff, features: ['frost', 'runes'], wear: 0.15, aura: 'frost', finish: 'frosted' },
  'uq.anvilknees': { main: 'metal.dark', trim: 'metal.iron', glow: 0xff9040, glowStrength: 0, features: ['horns', 'rivets'], wear: 0.7, aura: 'ash', finish: 'blackened' },
  'uq.wyrmhaunch': { main: 'leather.fine|0x4a1a10', trim: 'metal.bloodgold', glow: 0xff6020, features: ['scales', 'flames', 'dragons'], wear: 0.3, aura: 'embers' },
  'uq.nightstride': { main: 'cloth.silk|0x1a1a3a', trim: 'metal.silver', glow: 0xc8b8ff, features: ['stars', 'moons'], wear: 0.1, aura: 'sparkles' },
  'uq.lastrank': { main: 'metal.steel', second: 'leather.worn|0x3a2418', trim: 'metal.bronze', glow: 0xd0c0a0, glowStrength: 0, features: ['skulls', 'chains', 'rivets'], wear: 0.75, aura: 'ash', finish: 'weathered' },
  'my.rootbound': { main: 'metal.verdigris', second: 'leather.worn|0x2a3a1c', glow: 0x7ad060, features: ['vines', 'leaves', 'crystals'], wear: 0.4, aura: 'motes' },
  'an.spirefoot': { main: 'metal.mithril', trim: 'metal.gold', stone: 0xffd070, glow: 0xffd070, features: ['laurels', 'crowns', 'gilded'], wear: 0, aura: 'shine', finish: 'gilt' },
  // Charms: each named one is its own object, never a recoloured plain charm.
  'uq.charm.widowpebble': { main: 'stone.obsidian|0x2a2c34', stone: 0x9ab8ff, glow: 0xa8c4ff, features: ['tatters'], wear: 0.6, aura: 'motes' },
  'uq.charm.emberstone': { main: 'stone.ash|0x3a1a10', glow: 0xff6a1e, second: 'leather.worn|0x5a3a1a', features: ['cracks', 'smoke'], wear: 0.7, aura: 'embers' },
  'uq.charm.pellmother': { main: 'bone.old', stone: 0x70e0c0, glow: 0x80f0d0, features: ['eyes', 'thorns', 'chains'], wear: 0.5, aura: 'wisp' },
  'uq.charm.corranfingers': { main: 'bone.old', second: 'leather.worn|0x5a1a14', glow: 0xffc070, features: ['rivets', 'blood'], wear: 0.8, aura: 'ash' },
  'uq.charm.hangknot': { main: 'cloth.rag|0x6a5838', glow: 0x8ad050, features: ['chains', 'blood'], wear: 0.9, aura: 'drips' },
  'uq.charm.lanternmoth': { main: 'bone.old', glow: 0xffe08a, second: 'cloth.silk|0x8a6a2a', features: ['wings', 'feathers'], wear: 0.4, aura: 'sparkles' },
  'uq.charm.ninthbell': { main: 'metal.bronze', trim: 'metal.dark', glow: 0xfff0c0, features: ['bells', 'runes'], wear: 0.5, aura: 'soft' },
  'uq.charm.saltwife': { main: 'bone.old', trim: 'metal.silver', glow: 0xd8e8f0, features: ['coins', 'cracks'], wear: 0.6, aura: 'shine' },
  'uq.charm.mutepsalm': { main: 'bone.old', glow: 0xb0c8ff, second: 'cloth.linen|0x4a5a7a', features: ['runes', 'ghost'], wear: 0.3, aura: 'souls' },
  'uq.charm.drownedidol': { main: 'stone.sunken|0x1e3a3a', second: 'leather.worn|0x203028', glow: 0x60d0c0, features: ['barnacles', 'scales'], wear: 0.8, aura: 'drips', glowStyle: 'pulse' },
  'uq.charm.lastherd': { main: 'bone.old', second: 'leather.fine|0x4a2418', glow: 0xffa040, features: ['horns', 'tatters'], wear: 0.6, aura: 'ash' },
  'uq.charm.ninateeth': { main: 'bone.old', trim: 'metal.gold', glow: 0xff4a3a, features: ['teeth', 'crowns', 'skulls'], wear: 0.5, aura: 'souls', glowStyle: 'spectral' },
};

// The depth plan's batch uniques carry their designs beside their numbers.
for (const [id, d] of Object.entries(DEPTH_LOOKS)) UNIQUE_DESIGNS[id] ??= d;

/**
 * The few sets that glow. A glow is a reward, so most gear goes without: the
 * gold and the white sets and the elemental ones. The rest keep their
 * colours, sculpts and emblems, and their aura kind is ignored.
 */
export const GLOWING_SETS: ReadonlySet<string> = new Set([
  'set.gilded',
  'set.sunderedsky',
  'set.kindled',
  'set.frostwrought',
  'set.stormbound',
  'set.hollowking',
  'set.hollowmere',
]);

/**
 * How much a unique may glow, by its tier (the depth plan's look budget):
 * early, middle and late uniques not at all (gems and metal catch the light,
 * nothing more), relics (level 70 and up) in one small detail, a gem or a
 * rune line, and mythics and ancients in full, with their aura.
 */
export type GlowTier = 'none' | 'detail' | 'full';

/** The item level where a unique counts as a relic. */
export const RELIC_ILVL = 70;

export function glowTierOf(rarity: string, ilvl: number): GlowTier {
  if (rarity === 'mythic' || rarity === 'ancient') return 'full';
  return ilvl >= RELIC_ILVL ? 'detail' : 'none';
}

/** Emissive strength a unique's own design may burn at, for its tier. */
export function tierGlowStrength(tier: GlowTier, own: number): number {
  return tier === 'full' ? own : tier === 'detail' ? Math.min(own, 0.6) : Math.min(own, 0.12);
}
