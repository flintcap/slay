/**
 * SLAY — surface palette registry.
 *
 * A palette is a *declarative* description of a real-world surface: its colour
 * story, its relief (the height field the whole PBR set is derived from), and
 * the ordered list of "history" passes that happened to it — mortar poured
 * between blocks, water that pooled in the crevices, moss that grew where light
 * never reaches, rust blooms, chipped edges, dust that settled on the ledges.
 *
 * Colour rules obeyed throughout:
 *  - No saturated primaries. Everything is desaturated and hue-shifted; warm
 *    surfaces lean amber/ochre, cool surfaces lean slate/teal, never toward
 *    pure RGB axes.
 *  - Albedo stays inside the physically plausible 0.04 .. 0.85 band. Pure black
 *    and pure white albedo destroy PBR response — nothing in nature does that.
 *  - Every palette carries a *shade* (crevice), *base*, *light* (worn/raised),
 *    a *detail* colour for structure (mortar, veins, thread, trim) and an
 *    *accent* colour for the growth/corrosion story.
 *
 * Nothing here allocates or touches THREE — this module is pure data so the
 * texture baker and the material library can both read it cheaply.
 */

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Unpack an 0xRRGGBB integer into 0..1 floats. */
export function rgbOf(hex: number): RGB {
  return {
    r: ((hex >> 16) & 0xff) / 255,
    g: ((hex >> 8) & 0xff) / 255,
    b: (hex & 0xff) / 255,
  };
}

export function hexOf(c: RGB): number {
  const q = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (q(c.r) << 16) | (q(c.g) << 8) | q(c.b);
}

export function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

export function scaleRGB(a: RGB, k: number): RGB {
  return { r: a.r * k, g: a.g * k, b: a.b * k };
}

/** Perceptual luminance (Rec.709). */
export function lumaOf(c: RGB): number {
  return c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
}

/**
 * Clamp an albedo into the physically plausible range. Coal is ~0.04, fresh
 * snow ~0.85; anything outside reads as broken lighting.
 */
export function plausibleAlbedo(c: RGB): RGB {
  const l = lumaOf(c);
  if (l < 0.035) {
    const k = l > 1e-4 ? 0.035 / l : 0;
    return { r: c.r * k + 0.035, g: c.g * k + 0.033, b: c.b * k + 0.04 };
  }
  if (l > 0.86) {
    const k = 0.86 / l;
    return scaleRGB(c, k);
  }
  return c;
}

// ---------------------------------------------------------------------------
// Palette shape
// ---------------------------------------------------------------------------

export type SurfaceFamily =
  | 'stone'
  | 'metal'
  | 'wood'
  | 'cloth'
  | 'leather'
  | 'flesh'
  | 'crystal'
  | 'ground'
  | 'bone';

/**
 * How the base height field is built. This is the single most important
 * decision for a surface — the albedo, normal, roughness and AO are all
 * derived from it, which is what makes them agree with each other.
 */
export type ReliefKind =
  | 'rock' // eroded, ridged, domain-warped natural stone
  | 'blocks' // laid ashlar / brickwork with mortar courses
  | 'slab' // large irregular flagstones
  | 'cobble' // rounded set stones
  | 'plank' // sawn boards along U
  | 'weave' // over/under textile
  | 'plate' // hammered metal sheet with rivets
  | 'organic' // meat, hide, fungal
  | 'crystal' // faceted, sharp cell borders
  | 'granular' // sand, ash, snow — dunes plus grain
  | 'scale' // overlapping chitin plates
  | 'hide' // pebbled leather grain
  | 'fiber' // strongly anisotropic threads
  | 'smooth'; // polished, near featureless

export interface Relief {
  kind: ReliefKind;
  /** Noise frequency across one texture tile. Higher = finer structure. */
  scale: number;
  /** Domain-warp strength. 0 looks procedural; 0.3..1.2 looks real. */
  warp: number;
  /** Height contrast, 0..1. Drives normal map amplitude and AO depth. */
  depth: number;
  octaves: number;
  /** Lattice divisions for blocks / cobble / plank / scale reliefs. */
  cells?: number;
  /** Row divisions when the lattice is anisotropic (brick courses). */
  rows?: number;
  /** >1 stretches structure along U (planks, fibres, dunes). */
  stretch?: number;
  /** How irregular the lattice is, 0..1. */
  jitter?: number;
}

/**
 * A surface-history pass. Ordering matters: mortar goes down before staining,
 * staining before moss, moss before dust.
 */
export type PassKind =
  // structural — these modify the height field itself
  | 'mortar'
  | 'crack'
  | 'chip'
  | 'pit'
  | 'emboss'
  | 'rivet'
  // surface history — these modify albedo / roughness / metalness
  | 'stain'
  | 'moss'
  | 'rust'
  | 'soot'
  | 'dust'
  | 'frost'
  | 'blood'
  | 'veins'
  | 'scratch'
  | 'speckle'
  | 'grain'
  | 'fray'
  | 'glaze';

/** Which derived mask drives a pass's coverage. */
export type MaskKind =
  | 'none'
  | 'height' // more on raised areas
  | 'low' // more in the low areas (water pools, silt)
  | 'cavity' // more in concavities (moss, rust, grime)
  | 'peak' // more on convex edges (wear, chipping, polish)
  | 'ledge' // more on upward-facing shelves (dust, snow)
  | 'edge'; // more near lattice cell borders

export interface Pass {
  kind: PassKind;
  /** Coverage / strength, 0..1. */
  amount: number;
  /** Optional override colour; defaults to the palette's accent/detail. */
  color?: number;
  /** Frequency multiplier relative to the relief scale. */
  scale?: number;
  mask?: MaskKind;
  /** Roughness delta where the pass is present, -1..1. */
  rough?: number;
  /** Metalness delta where the pass is present, -1..1. */
  metal?: number;
  /** Height delta where the pass is present, -1..1. */
  height?: number;
  /** Contrast on the pass's own mask; higher = tighter, patchier coverage. */
  sharp?: number;
}

export interface Palette {
  key: string;
  family: SurfaceFamily;
  /** Mid-tone albedo. */
  base: number;
  /** Crevice / shadowed albedo. */
  shade: number;
  /** Raised / worn albedo. */
  light: number;
  /** Structural detail colour: mortar, veins, thread, inlay. */
  detail: number;
  /** Growth / corrosion accent: moss, rust, verdigris, ember. */
  accent: number;
  /** [smoothest, roughest]; the baker maps the height field across this. */
  roughness: [number, number];
  metalness: number;
  /** Normal map amplitude multiplier. */
  bump: number;
  relief: Relief;
  passes: Pass[];
  /** Per-cell / large-scale albedo variation, 0..1. */
  variance?: number;
  /** AO darkening strength, 0..1. */
  ao?: number;
  /** Self-illumination for crystals, runes, lava. */
  emissive?: number;
  emissiveIntensity?: number;
  /** Suggested world-space repeat when the caller does not specify one. */
  repeat?: number;
  /** Surfaces with a coloured sheen (silk, chitin, polished lacquer). */
  sheen?: number;
}

// ---------------------------------------------------------------------------
// Terse pass constructor
// ---------------------------------------------------------------------------

function p(kind: PassKind, amount: number, extra: Partial<Pass> = {}): Pass {
  return { kind, amount, ...extra };
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

const LIST: Palette[] = [
  // ======================= STONE =========================================
  {
    key: 'stone.crypt',
    family: 'stone',
    base: 0x6b6a63,
    shade: 0x35342f,
    light: 0x93907f,
    detail: 0x4b4a44,
    accent: 0x5a6a46,
    roughness: [0.62, 0.96],
    metalness: 0.0,
    bump: 1.0,
    relief: { kind: 'blocks', scale: 4.2, warp: 0.55, depth: 0.8, octaves: 5, cells: 4, rows: 6, jitter: 0.35 },
    variance: 0.34,
    ao: 0.9,
    repeat: 1,
    passes: [
      p('mortar', 0.9, { rough: 0.18, height: -0.42, scale: 1 }),
      p('crack', 0.4, { mask: 'edge', height: -0.3, sharp: 2.4 }),
      p('chip', 0.5, { mask: 'peak', height: -0.35, scale: 3.2 }),
      p('stain', 0.55, { mask: 'low', color: 0x2f3330, rough: -0.14, scale: 0.7 }),
      p('moss', 0.42, { mask: 'cavity', rough: 0.16, height: 0.06, scale: 1.6, sharp: 2.2 }),
      p('speckle', 0.3, { color: 0x9a9788, scale: 9 }),
      p('dust', 0.35, { mask: 'ledge', color: 0x8b8677, rough: 0.2 }),
    ],
  },
  {
    key: 'stone.cavern',
    family: 'stone',
    base: 0x5c554b,
    shade: 0x2b2721,
    light: 0x877d6d,
    detail: 0x413b33,
    accent: 0x46543c,
    roughness: [0.58, 0.98],
    metalness: 0.0,
    bump: 1.35,
    relief: { kind: 'rock', scale: 3.0, warp: 1.05, depth: 1.0, octaves: 6 },
    variance: 0.4,
    ao: 1.0,
    repeat: 1,
    passes: [
      p('crack', 0.55, { height: -0.34, scale: 1.6, sharp: 2.8 }),
      p('chip', 0.45, { mask: 'peak', height: -0.25, scale: 4 }),
      p('stain', 0.7, { mask: 'low', color: 0x2a2e2b, rough: -0.24, scale: 0.6 }),
      p('moss', 0.5, { mask: 'cavity', rough: 0.18, height: 0.07, scale: 1.9, sharp: 1.9 }),
      p('speckle', 0.35, { color: 0x8d8878, scale: 11 }),
      p('dust', 0.28, { mask: 'ledge', color: 0x7d7565 }),
    ],
  },
  {
    key: 'stone.temple',
    family: 'stone',
    base: 0x968b74,
    shade: 0x574f41,
    light: 0xc0b393,
    detail: 0x776c58,
    accent: 0x4c7a68,
    roughness: [0.42, 0.86],
    metalness: 0.0,
    bump: 0.85,
    relief: { kind: 'slab', scale: 3.4, warp: 0.45, depth: 0.62, octaves: 5, cells: 3, jitter: 0.55 },
    variance: 0.28,
    ao: 0.85,
    repeat: 1,
    passes: [
      p('mortar', 0.75, { rough: 0.14, height: -0.36 }),
      p('emboss', 0.4, { mask: 'none', height: 0.22, scale: 2, color: 0x8a7f68 }),
      p('veins', 0.35, { color: 0xb6ab8e, scale: 2.4, sharp: 3.2 }),
      p('chip', 0.4, { mask: 'peak', height: -0.28, scale: 3.4 }),
      p('stain', 0.5, { mask: 'low', color: 0x4d4a3c, rough: -0.1, scale: 0.8 }),
      p('moss', 0.5, { mask: 'cavity', rough: 0.2, scale: 1.7, sharp: 2.0 }),
      p('dust', 0.4, { mask: 'ledge', color: 0xa89a7c }),
    ],
  },
  {
    key: 'stone.frost',
    family: 'stone',
    base: 0x6d7986,
    shade: 0x373f49,
    light: 0xa7b5c2,
    detail: 0x54606c,
    accent: 0xc6dcea,
    roughness: [0.3, 0.82],
    metalness: 0.0,
    bump: 1.1,
    relief: { kind: 'blocks', scale: 3.6, warp: 0.6, depth: 0.75, octaves: 5, cells: 3, rows: 5, jitter: 0.3 },
    variance: 0.24,
    ao: 0.9,
    repeat: 1,
    passes: [
      p('mortar', 0.8, { rough: 0.1, height: -0.4 }),
      p('crack', 0.45, { height: -0.28, scale: 2, sharp: 3 }),
      p('chip', 0.4, { mask: 'peak', height: -0.3, scale: 3.6 }),
      p('frost', 0.7, { mask: 'cavity', color: 0xd9ebf6, rough: -0.3, height: 0.09, scale: 2.2 }),
      p('dust', 0.45, { mask: 'ledge', color: 0xdfeef8, rough: 0.15 }),
      p('speckle', 0.25, { color: 0xe8f4fb, scale: 10 }),
    ],
  },
  {
    key: 'stone.ash',
    family: 'stone',
    base: 0x4a453e,
    shade: 0x211e1b,
    light: 0x6f675c,
    detail: 0x35302b,
    accent: 0xc2551d,
    roughness: [0.6, 0.98],
    metalness: 0.0,
    bump: 1.25,
    relief: { kind: 'rock', scale: 3.6, warp: 0.9, depth: 0.95, octaves: 6 },
    variance: 0.36,
    ao: 1.0,
    emissive: 0x8a2a08,
    emissiveIntensity: 0.12,
    repeat: 1,
    passes: [
      p('crack', 0.7, { height: -0.4, scale: 1.5, sharp: 2.6, color: 0x7a2c0c }),
      p('chip', 0.5, { mask: 'peak', height: -0.3, scale: 3.8 }),
      p('soot', 0.6, { mask: 'ledge', color: 0x1d1a18, rough: 0.18 }),
      p('speckle', 0.4, { color: 0x8a7f70, scale: 12 }),
      p('dust', 0.4, { mask: 'ledge', color: 0x6b6459 }),
    ],
  },
  {
    key: 'stone.void',
    family: 'stone',
    base: 0x34303c,
    shade: 0x15131b,
    light: 0x4f4860,
    detail: 0x262230,
    accent: 0x8a5cc4,
    roughness: [0.34, 0.8],
    metalness: 0.06,
    bump: 1.2,
    relief: { kind: 'crystal', scale: 3.0, warp: 0.75, depth: 0.9, octaves: 5, cells: 5, jitter: 0.9 },
    variance: 0.3,
    ao: 1.0,
    emissive: 0x5a2fa0,
    emissiveIntensity: 0.35,
    repeat: 1,
    passes: [
      p('crack', 0.6, { height: -0.34, scale: 1.8, sharp: 3, color: 0x6b3fb0 }),
      p('veins', 0.55, { color: 0x9a6ce0, scale: 2.2, sharp: 3.6 }),
      p('chip', 0.4, { mask: 'peak', height: -0.28, scale: 3.4 }),
      p('glaze', 0.4, { mask: 'peak', rough: -0.24 }),
      p('speckle', 0.3, { color: 0xb08cf0, scale: 14 }),
    ],
  },
  {
    key: 'stone.town',
    family: 'stone',
    base: 0x7c7970,
    shade: 0x45423c,
    light: 0xa5a196,
    detail: 0x5e5b54,
    accent: 0x66764c,
    roughness: [0.55, 0.92],
    metalness: 0.0,
    bump: 0.95,
    relief: { kind: 'blocks', scale: 4.0, warp: 0.5, depth: 0.72, octaves: 5, cells: 4, rows: 5, jitter: 0.4 },
    variance: 0.3,
    ao: 0.85,
    repeat: 1,
    passes: [
      p('mortar', 0.85, { rough: 0.16, height: -0.4 }),
      p('chip', 0.42, { mask: 'peak', height: -0.3, scale: 3.2 }),
      p('stain', 0.4, { mask: 'low', color: 0x4a4740, rough: -0.1 }),
      p('moss', 0.36, { mask: 'cavity', rough: 0.16, scale: 1.8, sharp: 2.2 }),
      p('speckle', 0.3, { color: 0xa9a596, scale: 10 }),
      p('dust', 0.3, { mask: 'ledge', color: 0x968f80 }),
    ],
  },

  // ======================= METAL =========================================
  {
    key: 'metal.iron',
    family: 'metal',
    base: 0x585c60,
    shade: 0x2c2f33,
    light: 0x8a8e94,
    detail: 0x42464a,
    accent: 0x7a482a,
    roughness: [0.3, 0.68],
    metalness: 1.0,
    bump: 0.75,
    relief: { kind: 'plate', scale: 3.2, warp: 0.6, depth: 0.5, octaves: 5, cells: 2 },
    variance: 0.18,
    ao: 0.7,
    repeat: 1,
    passes: [
      p('rivet', 0.6, { height: 0.4, scale: 2 }),
      p('pit', 0.4, { mask: 'cavity', height: -0.3, scale: 6 }),
      p('scratch', 0.55, { mask: 'peak', rough: -0.16, color: 0x9ba0a6, scale: 7 }),
      p('rust', 0.35, { mask: 'cavity', rough: 0.4, metal: -0.75, scale: 2.4, sharp: 2.6 }),
      p('soot', 0.3, { mask: 'low', color: 0x24262a, rough: 0.14 }),
      p('dust', 0.2, { mask: 'ledge', color: 0x6e6a62, rough: 0.18, metal: -0.2 }),
    ],
  },
  {
    key: 'metal.steel',
    family: 'metal',
    base: 0x8b919a,
    shade: 0x4a4f57,
    light: 0xc4cad2,
    detail: 0x686e77,
    accent: 0x5a6470,
    roughness: [0.14, 0.44],
    metalness: 1.0,
    bump: 0.55,
    relief: { kind: 'smooth', scale: 4.0, warp: 0.7, depth: 0.3, octaves: 4 },
    variance: 0.12,
    ao: 0.55,
    repeat: 1,
    passes: [
      p('scratch', 0.7, { rough: -0.08, color: 0xd2d8e0, scale: 9, sharp: 3 }),
      p('glaze', 0.6, { mask: 'peak', rough: -0.09 }),
      p('pit', 0.18, { mask: 'cavity', height: -0.2, scale: 8 }),
      p('stain', 0.2, { mask: 'low', color: 0x545a63, rough: 0.12 }),
    ],
  },
  {
    key: 'metal.bronze',
    family: 'metal',
    base: 0x8a6a3c,
    shade: 0x483520,
    light: 0xc09a5c,
    detail: 0x6a4e2a,
    accent: 0x4e806a,
    roughness: [0.22, 0.6],
    metalness: 1.0,
    bump: 0.7,
    relief: { kind: 'plate', scale: 3.0, warp: 0.65, depth: 0.42, octaves: 5, cells: 2 },
    variance: 0.2,
    ao: 0.65,
    repeat: 1,
    passes: [
      p('emboss', 0.45, { height: 0.24, scale: 2.4, color: 0xa07f46 }),
      p('scratch', 0.45, { mask: 'peak', rough: -0.12, color: 0xd0ab6a, scale: 8 }),
      p('rust', 0.5, { mask: 'cavity', color: 0x4e806a, rough: 0.34, metal: -0.6, scale: 2.2, sharp: 2.2 }),
      p('pit', 0.3, { mask: 'cavity', height: -0.24, scale: 6 }),
      p('glaze', 0.4, { mask: 'peak', rough: -0.14 }),
    ],
  },
  {
    key: 'metal.gold',
    family: 'metal',
    base: 0xd0a94a,
    shade: 0x8a6c22,
    light: 0xf0d78a,
    detail: 0xa07f2c,
    accent: 0xfff0b8,
    roughness: [0.08, 0.32],
    metalness: 1.0,
    bump: 0.6,
    relief: { kind: 'smooth', scale: 3.4, warp: 0.8, depth: 0.34, octaves: 4 },
    variance: 0.14,
    ao: 0.5,
    repeat: 1,
    passes: [
      p('emboss', 0.55, { height: 0.3, scale: 2.6, color: 0xe3c069 }),
      p('scratch', 0.4, { mask: 'peak', rough: -0.05, color: 0xfbe9ad, scale: 10 }),
      p('glaze', 0.7, { mask: 'peak', rough: -0.06 }),
      p('stain', 0.16, { mask: 'low', color: 0x7a5c1c, rough: 0.14 }),
    ],
  },
  {
    key: 'metal.rusted',
    family: 'metal',
    base: 0x6d4527,
    shade: 0x35200f,
    light: 0x9c6c43,
    detail: 0x4a2c17,
    accent: 0x93602f,
    roughness: [0.55, 0.98],
    metalness: 0.75,
    bump: 1.25,
    relief: { kind: 'plate', scale: 3.0, warp: 0.9, depth: 0.7, octaves: 6, cells: 2 },
    variance: 0.35,
    ao: 0.95,
    repeat: 1,
    passes: [
      p('rivet', 0.5, { height: 0.32, scale: 2 }),
      p('pit', 0.8, { mask: 'cavity', height: -0.45, scale: 5, sharp: 2.2 }),
      p('rust', 0.9, { mask: 'none', rough: 0.3, metal: -0.7, scale: 2.6, sharp: 1.6 }),
      p('chip', 0.5, { mask: 'peak', height: -0.3, scale: 4.5, color: 0x8d939b }),
      p('stain', 0.5, { mask: 'low', color: 0x33200f, rough: 0.1 }),
      p('speckle', 0.35, { color: 0xa87a45, scale: 13 }),
    ],
  },
  {
    key: 'metal.dark',
    family: 'metal',
    base: 0x3a3c41,
    shade: 0x1a1b1e,
    light: 0x5c6067,
    detail: 0x2a2c30,
    accent: 0x6f5c3a,
    roughness: [0.24, 0.6],
    metalness: 1.0,
    bump: 0.8,
    relief: { kind: 'plate', scale: 3.4, warp: 0.7, depth: 0.46, octaves: 5, cells: 2 },
    variance: 0.16,
    ao: 0.7,
    repeat: 1,
    passes: [
      p('rivet', 0.45, { height: 0.34, scale: 2 }),
      p('scratch', 0.6, { mask: 'peak', rough: -0.16, color: 0x757b84, scale: 8 }),
      p('emboss', 0.3, { height: 0.18, scale: 2.8, color: 0x4a4d53 }),
      p('soot', 0.5, { mask: 'cavity', color: 0x131416, rough: 0.2 }),
      p('glaze', 0.35, { mask: 'peak', rough: -0.12 }),
    ],
  },
  {
    key: 'metal.silver',
    family: 'metal',
    base: 0xb2b8bf,
    shade: 0x6d737a,
    light: 0xe0e5ea,
    detail: 0x8d939a,
    accent: 0x6a6f78,
    roughness: [0.06, 0.3],
    metalness: 1.0,
    bump: 0.5,
    relief: { kind: 'smooth', scale: 3.8, warp: 0.8, depth: 0.26, octaves: 4 },
    variance: 0.1,
    ao: 0.5,
    repeat: 1,
    passes: [
      p('scratch', 0.6, { rough: -0.04, color: 0xeff3f7, scale: 11, sharp: 3.2 }),
      p('glaze', 0.7, { mask: 'peak', rough: -0.05 }),
      p('stain', 0.3, { mask: 'low', color: 0x565c66, rough: 0.16 }),
    ],
  },
  {
    key: 'metal.copper',
    family: 'metal',
    base: 0x9a5f3c,
    shade: 0x532e1b,
    light: 0xd0865a,
    detail: 0x74432a,
    accent: 0x4f8a72,
    roughness: [0.18, 0.55],
    metalness: 1.0,
    bump: 0.7,
    relief: { kind: 'plate', scale: 3.2, warp: 0.7, depth: 0.4, octaves: 5, cells: 2 },
    variance: 0.2,
    ao: 0.62,
    repeat: 1,
    passes: [
      p('emboss', 0.4, { height: 0.22, scale: 2.6, color: 0xb0704a }),
      p('rust', 0.62, { mask: 'cavity', color: 0x4f8a72, rough: 0.36, metal: -0.65, scale: 2.0, sharp: 2.0 }),
      p('scratch', 0.4, { mask: 'peak', rough: -0.12, color: 0xd8946a, scale: 9 }),
      p('glaze', 0.4, { mask: 'peak', rough: -0.12 }),
    ],
  },

  // ======================= WOOD ==========================================
  {
    key: 'wood.oak',
    family: 'wood',
    base: 0x6d5334,
    shade: 0x3a2a18,
    light: 0x9a7a51,
    detail: 0x4e3820,
    accent: 0x7c6440,
    roughness: [0.46, 0.86],
    metalness: 0.0,
    bump: 0.95,
    relief: { kind: 'plank', scale: 3.0, warp: 0.35, depth: 0.6, octaves: 5, cells: 5, stretch: 7 },
    variance: 0.3,
    ao: 0.8,
    repeat: 1,
    passes: [
      p('grain', 0.85, { color: 0x452f1a, scale: 1, sharp: 2.2, height: -0.16 }),
      p('mortar', 0.7, { rough: 0.1, height: -0.5, color: 0x2a1d10 }),
      p('chip', 0.45, { mask: 'peak', height: -0.24, scale: 4, color: 0x8a6a44 }),
      p('stain', 0.45, { mask: 'low', color: 0x36271a, rough: -0.08 }),
      p('scratch', 0.4, { mask: 'peak', rough: 0.1, color: 0x8f7350, scale: 8 }),
      p('dust', 0.28, { mask: 'ledge', color: 0x8a8070 }),
    ],
  },
  {
    key: 'wood.rotted',
    family: 'wood',
    base: 0x4d4a3b,
    shade: 0x252316,
    light: 0x6e6a54,
    detail: 0x383527,
    accent: 0x54613c,
    roughness: [0.62, 0.99],
    metalness: 0.0,
    bump: 1.3,
    relief: { kind: 'plank', scale: 3.0, warp: 0.7, depth: 0.85, octaves: 6, cells: 5, stretch: 6 },
    variance: 0.4,
    ao: 0.95,
    repeat: 1,
    passes: [
      p('grain', 0.9, { color: 0x2c2a1c, scale: 1, sharp: 2.6, height: -0.24 }),
      p('mortar', 0.75, { rough: 0.12, height: -0.55, color: 0x1d1b12 }),
      p('crack', 0.7, { height: -0.42, scale: 2.2, sharp: 2.8 }),
      p('pit', 0.55, { mask: 'cavity', height: -0.4, scale: 5 }),
      p('moss', 0.6, { mask: 'cavity', rough: 0.2, height: 0.08, scale: 2.2, sharp: 1.7 }),
      p('stain', 0.6, { mask: 'low', color: 0x21201a, rough: -0.1 }),
    ],
  },
  {
    key: 'wood.charred',
    family: 'wood',
    base: 0x2b2622,
    shade: 0x111010,
    light: 0x4b433a,
    detail: 0x1c1917,
    accent: 0xb04a18,
    roughness: [0.6, 0.99],
    metalness: 0.0,
    bump: 1.4,
    relief: { kind: 'plank', scale: 3.2, warp: 0.8, depth: 0.9, octaves: 6, cells: 5, stretch: 5 },
    variance: 0.28,
    ao: 1.0,
    emissive: 0x8a2f08,
    emissiveIntensity: 0.18,
    repeat: 1,
    passes: [
      p('crack', 0.9, { height: -0.5, scale: 3.0, sharp: 2.2, color: 0x8a3410 }),
      p('grain', 0.7, { color: 0x171514, scale: 1, sharp: 2.4, height: -0.2 }),
      p('chip', 0.55, { mask: 'peak', height: -0.3, scale: 4.5, color: 0x3d352e }),
      p('soot', 0.8, { mask: 'none', color: 0x131110, rough: 0.16 }),
      p('dust', 0.35, { mask: 'ledge', color: 0x5c554c }),
    ],
  },
  {
    key: 'wood.polished',
    family: 'wood',
    base: 0x53331e,
    shade: 0x29180d,
    light: 0x8a5b34,
    detail: 0x3b2413,
    accent: 0xc79a5e,
    roughness: [0.12, 0.4],
    metalness: 0.0,
    bump: 0.5,
    relief: { kind: 'plank', scale: 2.6, warp: 0.25, depth: 0.3, octaves: 5, cells: 3, stretch: 9 },
    variance: 0.22,
    ao: 0.55,
    sheen: 0.3,
    repeat: 1,
    passes: [
      p('grain', 0.8, { color: 0x36200f, scale: 1, sharp: 2.6, height: -0.08 }),
      p('glaze', 0.85, { mask: 'none', rough: -0.12 }),
      p('scratch', 0.3, { mask: 'peak', rough: 0.08, color: 0x9a6c44, scale: 10 }),
      p('emboss', 0.25, { height: 0.14, scale: 3, color: 0x6a4326 }),
    ],
  },

  // ======================= CLOTH =========================================
  {
    key: 'cloth.linen',
    family: 'cloth',
    base: 0xa79880,
    shade: 0x6b614f,
    light: 0xcdc0a6,
    detail: 0x8a7e67,
    accent: 0x7a6f58,
    roughness: [0.7, 0.98],
    metalness: 0.0,
    bump: 0.5,
    relief: { kind: 'weave', scale: 3.0, warp: 0.06, depth: 0.3, octaves: 4, cells: 22 },
    variance: 0.2,
    ao: 0.55,
    repeat: 1,
    passes: [
      p('fray', 0.35, { color: 0x8d8067, scale: 9, rough: 0.1 }),
      p('stain', 0.5, { mask: 'low', color: 0x6d604a, rough: -0.06 }),
      p('dust', 0.4, { mask: 'ledge', color: 0xbfb49a }),
    ],
  },
  {
    // Undyed homespun. Deliberately duller and darker than every skin tone in
    // the game: this is what a character with no gear is wearing, and against
    // pale skin a cream linen just merges into one blob.
    key: 'cloth.undyed',
    family: 'cloth',
    base: 0x8a7a60,
    shade: 0x4c4234,
    light: 0xb3a488,
    detail: 0x6e6149,
    accent: 0x5d5240,
    roughness: [0.74, 0.99],
    metalness: 0.0,
    bump: 0.5,
    relief: { kind: 'weave', scale: 3.0, warp: 0.06, depth: 0.32, octaves: 4, cells: 20 },
    variance: 0.22,
    ao: 0.58,
    repeat: 1,
    passes: [
      p('fray', 0.4, { color: 0x7a6c53, scale: 9, rough: 0.1 }),
      p('stain', 0.55, { mask: 'low', color: 0x4a4032, rough: -0.05 }),
      p('dust', 0.35, { mask: 'ledge', color: 0x9c8f74 }),
    ],
  },
  {
    key: 'cloth.silk',
    family: 'cloth',
    base: 0x604a70,
    shade: 0x31253c,
    light: 0x9a7cab,
    detail: 0x4a3557,
    accent: 0xc3a8d2,
    roughness: [0.24, 0.52],
    metalness: 0.0,
    bump: 0.45,
    relief: { kind: 'fiber', scale: 3.2, warp: 0.4, depth: 0.28, octaves: 4, stretch: 8 },
    variance: 0.18,
    ao: 0.55,
    sheen: 0.7,
    repeat: 1,
    passes: [
      p('glaze', 0.8, { mask: 'peak', rough: -0.14 }),
      p('emboss', 0.4, { height: 0.16, scale: 3.2, color: 0x7a5f8c }),
      p('fray', 0.18, { color: 0x8d6fa0, scale: 10, rough: 0.06 }),
      p('stain', 0.18, { mask: 'low', color: 0x3d2f4a, rough: 0.08 }),
    ],
  },
  {
    key: 'cloth.tattered',
    family: 'cloth',
    base: 0x695e51,
    shade: 0x342e28,
    light: 0x8d8172,
    detail: 0x4e453b,
    accent: 0x3b352d,
    roughness: [0.72, 0.99],
    metalness: 0.0,
    bump: 0.7,
    relief: { kind: 'weave', scale: 3.0, warp: 0.14, depth: 0.42, octaves: 5, cells: 18 },
    variance: 0.34,
    ao: 0.72,
    repeat: 1,
    passes: [
      p('fray', 0.6, { color: 0x7c7062, scale: 8, rough: 0.14, height: -0.3 }),
      p('pit', 0.5, { mask: 'cavity', height: -0.5, scale: 4 }),
      p('stain', 0.7, { mask: 'low', color: 0x2f2a24, rough: -0.05 }),
      p('soot', 0.35, { mask: 'cavity', color: 0x231f1b, rough: 0.1 }),
      p('dust', 0.3, { mask: 'ledge', color: 0x8a8070 }),
    ],
  },
  {
    key: 'cloth.banner',
    family: 'cloth',
    base: 0x7a2e26,
    shade: 0x3d1512,
    light: 0xa84a3c,
    detail: 0xc9a24a,
    accent: 0x5c1d18,
    roughness: [0.6, 0.92],
    metalness: 0.0,
    bump: 0.5,
    relief: { kind: 'weave', scale: 3.0, warp: 0.08, depth: 0.3, octaves: 4, cells: 20 },
    variance: 0.22,
    ao: 0.58,
    repeat: 1,
    passes: [
      p('emboss', 0.3, { height: 0.09, scale: 5.0, color: 0xc9a24a }),
      p('fray', 0.35, { color: 0x8f4437, scale: 9, rough: 0.1 }),
      p('stain', 0.45, { mask: 'low', color: 0x3a1512, rough: -0.06 }),
      p('dust', 0.3, { mask: 'ledge', color: 0x9a7c5a }),
    ],
  },

  // ======================= LEATHER =======================================
  {
    key: 'leather.worn',
    family: 'leather',
    base: 0x5b4331,
    shade: 0x2e2118,
    light: 0x83644b,
    detail: 0x412e21,
    accent: 0x2a1e15,
    roughness: [0.44, 0.84],
    metalness: 0.0,
    bump: 0.55,
    relief: { kind: 'hide', scale: 3.0, warp: 0.6, depth: 0.3, octaves: 5, cells: 20, jitter: 0.7 },
    variance: 0.28,
    ao: 0.6,
    repeat: 1,
    passes: [
      p('crack', 0.5, { height: -0.3, scale: 4, sharp: 2.4 }),
      p('scratch', 0.5, { mask: 'peak', rough: -0.1, color: 0x8f7053, scale: 7 }),
      p('glaze', 0.45, { mask: 'peak', rough: -0.18 }),
      p('stain', 0.5, { mask: 'low', color: 0x2b1d14, rough: 0.08 }),
      p('dust', 0.25, { mask: 'ledge', color: 0x7c705f }),
    ],
  },
  {
    key: 'leather.studded',
    family: 'leather',
    base: 0x40342b,
    shade: 0x1f1914,
    light: 0x60503f,
    detail: 0x8a8d92,
    accent: 0x2a231c,
    roughness: [0.4, 0.82],
    metalness: 0.0,
    bump: 0.7,
    relief: { kind: 'hide', scale: 3.0, warp: 0.6, depth: 0.34, octaves: 5, cells: 18, jitter: 0.68 },
    variance: 0.24,
    ao: 0.65,
    repeat: 1,
    passes: [
      p('rivet', 0.9, { height: 0.6, scale: 3, color: 0x9aa0a8, metal: 0.9, rough: -0.3 }),
      p('crack', 0.45, { height: -0.28, scale: 4.4, sharp: 2.4 }),
      p('scratch', 0.45, { mask: 'peak', rough: -0.08, color: 0x6a5949, scale: 8 }),
      p('stain', 0.5, { mask: 'low', color: 0x1c1712, rough: 0.08 }),
    ],
  },
  {
    key: 'leather.fine',
    family: 'leather',
    base: 0x3b2b2a,
    shade: 0x1d1615,
    light: 0x5e4644,
    detail: 0xa08a5c,
    accent: 0x2a1f1e,
    roughness: [0.26, 0.56],
    metalness: 0.0,
    bump: 0.42,
    relief: { kind: 'hide', scale: 3.0, warp: 0.45, depth: 0.22, octaves: 5, cells: 26, jitter: 0.65 },
    variance: 0.16,
    ao: 0.6,
    sheen: 0.25,
    repeat: 1,
    passes: [
      p('emboss', 0.26, { height: 0.1, scale: 4.5, color: 0xa08a5c }),
      p('glaze', 0.75, { mask: 'peak', rough: -0.16 }),
      p('scratch', 0.25, { mask: 'peak', rough: 0.06, color: 0x6a5150, scale: 10 }),
      p('stain', 0.2, { mask: 'low', color: 0x241a19, rough: 0.06 }),
    ],
  },

  // ======================= FLESH =========================================
  {
    key: 'flesh.rotted',
    family: 'flesh',
    base: 0x6a6a55,
    shade: 0x38382a,
    light: 0x8e8c71,
    detail: 0x5c3a35,
    accent: 0x7a3a34,
    roughness: [0.36, 0.78],
    metalness: 0.0,
    bump: 1.15,
    relief: { kind: 'organic', scale: 3.4, warp: 1.0, depth: 0.7, octaves: 5 },
    variance: 0.34,
    ao: 0.95,
    repeat: 1,
    passes: [
      p('veins', 0.6, { color: 0x6a3730, scale: 2.6, sharp: 3.2 }),
      p('pit', 0.55, { mask: 'cavity', height: -0.42, scale: 5, color: 0x40241f }),
      p('stain', 0.6, { mask: 'low', color: 0x3a3226, rough: -0.16 }),
      p('moss', 0.35, { mask: 'cavity', color: 0x5e6b3c, rough: 0.2, scale: 2.4, sharp: 2.2 }),
      p('glaze', 0.4, { mask: 'peak', rough: -0.2 }),
    ],
  },
  {
    key: 'flesh.chitin',
    family: 'flesh',
    base: 0x3a2f29,
    shade: 0x191310,
    light: 0x6b5347,
    detail: 0x8a5a24,
    accent: 0xc08a3a,
    roughness: [0.14, 0.46],
    metalness: 0.12,
    bump: 1.0,
    relief: { kind: 'scale', scale: 3.0, warp: 0.5, depth: 0.75, octaves: 5, cells: 7, rows: 9, jitter: 0.35 },
    variance: 0.24,
    ao: 0.9,
    sheen: 0.5,
    repeat: 1,
    passes: [
      p('mortar', 0.6, { rough: 0.18, height: -0.4, color: 0x150f0c }),
      p('glaze', 0.85, { mask: 'peak', rough: -0.16 }),
      p('veins', 0.4, { color: 0xa8702c, scale: 3.0, sharp: 3.4 }),
      p('scratch', 0.35, { mask: 'peak', rough: 0.08, color: 0x9a7448, scale: 9 }),
      p('chip', 0.3, { mask: 'peak', height: -0.2, scale: 5, color: 0x8a6a4a }),
    ],
  },
  {
    key: 'flesh.pale',
    family: 'flesh',
    base: 0xaf9f93,
    shade: 0x71655c,
    light: 0xd5c8bc,
    detail: 0x8a7466,
    accent: 0x9a5f5a,
    roughness: [0.34, 0.7],
    metalness: 0.0,
    bump: 0.7,
    relief: { kind: 'organic', scale: 3.6, warp: 0.85, depth: 0.45, octaves: 5 },
    variance: 0.22,
    ao: 0.75,
    repeat: 1,
    passes: [
      p('veins', 0.45, { color: 0x8a6f74, scale: 2.8, sharp: 3.6 }),
      p('speckle', 0.4, { color: 0x9a8478, scale: 16 }),
      p('stain', 0.35, { mask: 'low', color: 0x74655c, rough: -0.08 }),
      p('glaze', 0.4, { mask: 'peak', rough: -0.14 }),
      p('blood', 0.25, { mask: 'cavity', scale: 3.0, rough: -0.22 }),
    ],
  },
  {
    // Human skin. The flesh.* family is built for corpses and monsters — grey,
    // lumpy, high relief — and putting a player character in it makes them look
    // carved from chalk. Skin is nearly smooth, warm, and gets almost all of
    // its shading from form rather than from texture.
    key: 'skin.fair',
    family: 'flesh',
    base: 0xd6a888,
    shade: 0x8c5f47,
    light: 0xf0cdb0,
    detail: 0xc08d70,
    accent: 0xb06a55,
    roughness: [0.48, 0.66],
    metalness: 0.0,
    bump: 0.18,
    relief: { kind: 'organic', scale: 4.2, warp: 0.5, depth: 0.1, octaves: 4 },
    variance: 0.09,
    ao: 0.3,
    repeat: 1,
    passes: [
      p('speckle', 0.16, { color: 0xb27a5c, scale: 9 }),
      p('stain', 0.22, { mask: 'low', color: 0xa9705a, rough: 0.03 }),
      p('glaze', 0.3, { mask: 'peak', rough: -0.08 }),
    ],
  },
  {
    key: 'skin.tan',
    family: 'flesh',
    base: 0xb07d58,
    shade: 0x6d452c,
    light: 0xd6a37a,
    detail: 0x96684a,
    accent: 0x8c5137,
    roughness: [0.46, 0.64],
    metalness: 0.0,
    bump: 0.18,
    relief: { kind: 'organic', scale: 4.2, warp: 0.5, depth: 0.1, octaves: 4 },
    variance: 0.09,
    ao: 0.32,
    repeat: 1,
    passes: [
      p('speckle', 0.16, { color: 0x8e5a3c, scale: 9 }),
      p('stain', 0.22, { mask: 'low', color: 0x7d4a30, rough: 0.03 }),
      p('glaze', 0.32, { mask: 'peak', rough: -0.08 }),
    ],
  },
  {
    key: 'skin.deep',
    family: 'flesh',
    base: 0x6d4530,
    shade: 0x3a2118,
    light: 0x936047,
    detail: 0x5a3524,
    accent: 0x4a2a1d,
    roughness: [0.42, 0.6],
    metalness: 0.0,
    bump: 0.18,
    relief: { kind: 'organic', scale: 4.2, warp: 0.5, depth: 0.1, octaves: 4 },
    variance: 0.08,
    ao: 0.34,
    repeat: 1,
    passes: [
      p('stain', 0.2, { mask: 'low', color: 0x2f1a12, rough: 0.03 }),
      p('glaze', 0.4, { mask: 'peak', rough: -0.1 }),
    ],
  },
  {
    key: 'flesh.demonic',
    family: 'flesh',
    base: 0x763530,
    shade: 0x3a1714,
    light: 0xa6544a,
    detail: 0x2d1412,
    accent: 0xff9a3a,
    roughness: [0.3, 0.72],
    metalness: 0.0,
    bump: 1.25,
    relief: { kind: 'organic', scale: 3.2, warp: 1.15, depth: 0.85, octaves: 6 },
    variance: 0.3,
    ao: 1.0,
    emissive: 0xd44a12,
    emissiveIntensity: 0.4,
    repeat: 1,
    passes: [
      p('crack', 0.75, { height: -0.4, scale: 2.4, sharp: 2.4, color: 0xff8a2a }),
      p('veins', 0.55, { color: 0xff7a2a, scale: 2.4, sharp: 3.4 }),
      p('pit', 0.4, { mask: 'cavity', height: -0.34, scale: 5 }),
      p('soot', 0.4, { mask: 'ledge', color: 0x231210, rough: 0.14 }),
      p('glaze', 0.4, { mask: 'peak', rough: -0.18 }),
    ],
  },

  // ======================= CRYSTAL =======================================
  {
    key: 'crystal.void',
    family: 'crystal',
    base: 0x3b2f5c,
    shade: 0x191430,
    light: 0x7a63b8,
    detail: 0xb08cff,
    accent: 0xc9a6ff,
    roughness: [0.05, 0.24],
    metalness: 0.0,
    bump: 1.1,
    relief: { kind: 'crystal', scale: 2.6, warp: 0.5, depth: 0.9, octaves: 4, cells: 6, jitter: 0.95 },
    variance: 0.3,
    ao: 0.7,
    emissive: 0x7a4ad6,
    emissiveIntensity: 0.9,
    sheen: 0.4,
    repeat: 1,
    passes: [
      p('veins', 0.7, { color: 0xc9a6ff, scale: 2.0, sharp: 3.8 }),
      p('glaze', 0.9, { mask: 'peak', rough: -0.1 }),
      p('chip', 0.3, { mask: 'peak', height: -0.24, scale: 5, color: 0x9a82d0 }),
      p('speckle', 0.3, { color: 0xd8c0ff, scale: 15 }),
    ],
  },
  {
    key: 'crystal.ice',
    family: 'crystal',
    base: 0x9dc2d7,
    shade: 0x587c94,
    light: 0xdbeef8,
    detail: 0xbfe4f5,
    accent: 0xf0fbff,
    roughness: [0.03, 0.2],
    metalness: 0.0,
    bump: 1.0,
    relief: { kind: 'crystal', scale: 2.4, warp: 0.45, depth: 0.85, octaves: 4, cells: 5, jitter: 0.9 },
    variance: 0.22,
    ao: 0.55,
    emissive: 0x2f6a8c,
    emissiveIntensity: 0.28,
    sheen: 0.5,
    repeat: 1,
    passes: [
      p('veins', 0.6, { color: 0xe8f8ff, scale: 2.2, sharp: 4.0 }),
      p('frost', 0.6, { mask: 'cavity', color: 0xeaf7ff, rough: 0.24, height: 0.1, scale: 3 }),
      p('glaze', 0.9, { mask: 'peak', rough: -0.08 }),
      p('chip', 0.35, { mask: 'peak', height: -0.26, scale: 5.5, color: 0xcfe8f6 }),
    ],
  },
  {
    key: 'crystal.arcane',
    family: 'crystal',
    base: 0x2f6a7a,
    shade: 0x123138,
    light: 0x6cc0d0,
    detail: 0x9ae8f0,
    accent: 0xd0fbff,
    roughness: [0.04, 0.22],
    metalness: 0.0,
    bump: 1.05,
    relief: { kind: 'crystal', scale: 2.8, warp: 0.55, depth: 0.88, octaves: 4, cells: 6, jitter: 1.0 },
    variance: 0.26,
    ao: 0.6,
    emissive: 0x2ad0e6,
    emissiveIntensity: 1.0,
    sheen: 0.45,
    repeat: 1,
    passes: [
      p('veins', 0.75, { color: 0xd0fbff, scale: 2.0, sharp: 3.8 }),
      p('glaze', 0.9, { mask: 'peak', rough: -0.1 }),
      p('speckle', 0.35, { color: 0xaef0fa, scale: 14 }),
      p('chip', 0.28, { mask: 'peak', height: -0.22, scale: 5, color: 0x8ad8e6 }),
    ],
  },

  // ======================= GROUND ========================================
  {
    key: 'ground.cobble',
    family: 'ground',
    base: 0x5f5b54,
    shade: 0x2f2c28,
    light: 0x86817a,
    detail: 0x3f3b36,
    accent: 0x4c5340,
    roughness: [0.6, 0.98],
    metalness: 0.0,
    bump: 1.2,
    relief: { kind: 'cobble', scale: 3.0, warp: 0.5, depth: 0.85, octaves: 5, cells: 7, jitter: 0.85 },
    variance: 0.4,
    ao: 1.0,
    repeat: 2,
    passes: [
      p('mortar', 0.95, { rough: 0.2, height: -0.55, color: 0x3a3730 }),
      p('chip', 0.5, { mask: 'peak', height: -0.26, scale: 4 }),
      p('stain', 0.6, { mask: 'low', color: 0x2c2a26, rough: -0.2 }),
      p('moss', 0.45, { mask: 'cavity', rough: 0.18, height: 0.07, scale: 2.0, sharp: 2.0 }),
      p('speckle', 0.35, { color: 0x8d887c, scale: 12 }),
      p('dust', 0.3, { mask: 'ledge', color: 0x8a8375 }),
    ],
  },
  {
    key: 'ground.dirt',
    family: 'ground',
    base: 0x564734,
    shade: 0x2b2319,
    light: 0x7a6650,
    detail: 0x3e3225,
    accent: 0x4a4a32,
    roughness: [0.72, 1.0],
    metalness: 0.0,
    bump: 1.15,
    relief: { kind: 'granular', scale: 4.0, warp: 0.85, depth: 0.62, octaves: 6 },
    variance: 0.36,
    ao: 0.95,
    repeat: 2,
    passes: [
      p('crack', 0.45, { height: -0.28, scale: 2.2, sharp: 2.0 }),
      p('speckle', 0.55, { color: 0x8a7860, scale: 14 }),
      p('pit', 0.35, { mask: 'cavity', height: -0.22, scale: 7 }),
      p('stain', 0.5, { mask: 'low', color: 0x2a231a, rough: -0.14 }),
      p('moss', 0.3, { mask: 'cavity', rough: 0.14, scale: 2.4, sharp: 2.4 }),
    ],
  },
  {
    // The clearing floor outside the trodden paths: turf, moss and leaf litter.
    key: 'ground.grass',
    family: 'ground',
    base: 0x3f4a28,
    shade: 0x1e2412,
    light: 0x5f6d38,
    detail: 0x2c351a,
    accent: 0x6d7a3e,
    roughness: [0.82, 0.99],
    metalness: 0.0,
    bump: 0.7,
    relief: { kind: 'organic', scale: 3.2, warp: 0.9, depth: 0.45, octaves: 5 },
    variance: 0.34,
    ao: 0.8,
    repeat: 1,
    passes: [
      p('moss', 0.7, { mask: 'cavity', color: 0x53632f }),
      p('stain', 0.45, { mask: 'low', color: 0x232a14, rough: -0.04 }),
      p('dust', 0.3, { mask: 'ledge', color: 0x6e6a44 }),
      p('speckle', 0.3, { color: 0x7d8a48, scale: 7 }),
    ],
  },
  {
    // Bark: coarse vertical fissures, nothing like sawn timber.
    key: 'wood.bark',
    family: 'wood',
    base: 0x4a3a2c,
    shade: 0x241b14,
    light: 0x6d5741,
    detail: 0x33271d,
    accent: 0x2c2119,
    roughness: [0.78, 0.99],
    metalness: 0.0,
    bump: 1.2,
    relief: { kind: 'plank', scale: 3.0, warp: 0.5, depth: 0.8, octaves: 5, cells: 5, rows: 1 },
    variance: 0.3,
    ao: 0.95,
    repeat: 1,
    passes: [
      p('crack', 0.85, { height: -0.5, scale: 3.4, sharp: 3.0 }),
      p('moss', 0.4, { mask: 'cavity', color: 0x4a5a2c }),
      p('stain', 0.4, { mask: 'low', color: 0x1e1710, rough: -0.04 }),
    ],
  },
  {
    // Pine needles, read as a mass rather than as leaves.
    key: 'foliage.pine',
    family: 'ground',
    base: 0x27381f,
    shade: 0x0f1a0c,
    light: 0x40562c,
    detail: 0x1b2815,
    accent: 0x4d6630,
    roughness: [0.7, 0.95],
    metalness: 0.0,
    bump: 0.9,
    relief: { kind: 'fiber', scale: 3.0, warp: 0.6, depth: 0.5, octaves: 4, stretch: 6 },
    variance: 0.3,
    ao: 0.9,
    repeat: 1,
    passes: [
      p('speckle', 0.4, { color: 0x486030, scale: 8 }),
      p('stain', 0.4, { mask: 'low', color: 0x0d160a, rough: 0.04 }),
    ],
  },
  {
    key: 'ground.sand',
    family: 'ground',
    base: 0xa5916c,
    shade: 0x6c5d43,
    light: 0xd0bd94,
    detail: 0x8a795a,
    accent: 0x998964,
    roughness: [0.75, 1.0],
    metalness: 0.0,
    bump: 0.85,
    relief: { kind: 'granular', scale: 3.0, warp: 0.55, depth: 0.5, octaves: 5, stretch: 3 },
    variance: 0.22,
    ao: 0.7,
    repeat: 2,
    passes: [
      p('speckle', 0.7, { color: 0xc4b28c, scale: 18 }),
      p('pit', 0.3, { mask: 'cavity', height: -0.18, scale: 8 }),
      p('dust', 0.4, { mask: 'ledge', color: 0xdbc9a2 }),
      p('stain', 0.3, { mask: 'low', color: 0x6f6046, rough: -0.06 }),
    ],
  },
  {
    key: 'ground.snow',
    family: 'ground',
    base: 0xc7d2dc,
    shade: 0x8797a6,
    light: 0xeef4f8,
    detail: 0xa9b8c6,
    accent: 0xdeeaf2,
    roughness: [0.5, 0.88],
    metalness: 0.0,
    bump: 0.7,
    relief: { kind: 'granular', scale: 2.6, warp: 0.7, depth: 0.45, octaves: 5, stretch: 2.4 },
    variance: 0.14,
    ao: 0.6,
    repeat: 2,
    passes: [
      p('speckle', 0.5, { color: 0xf2f8fc, scale: 20 }),
      p('frost', 0.55, { mask: 'peak', color: 0xf6fbff, rough: -0.18, scale: 4 }),
      p('stain', 0.25, { mask: 'low', color: 0x93a3b2, rough: -0.1 }),
      p('dust', 0.3, { mask: 'ledge', color: 0xf0f6fa }),
    ],
  },
  {
    key: 'ground.ash',
    family: 'ground',
    base: 0x494540,
    shade: 0x222020,
    light: 0x6e6a63,
    detail: 0x34312e,
    accent: 0xa8340f,
    roughness: [0.78, 1.0],
    metalness: 0.0,
    bump: 0.95,
    relief: { kind: 'granular', scale: 3.4, warp: 0.9, depth: 0.55, octaves: 6, stretch: 2 },
    variance: 0.3,
    ao: 0.9,
    emissive: 0x8a2a08,
    emissiveIntensity: 0.14,
    repeat: 2,
    passes: [
      p('crack', 0.55, { height: -0.3, scale: 2.0, sharp: 2.2, color: 0x7a2a0a }),
      p('speckle', 0.5, { color: 0x7a736a, scale: 16 }),
      p('soot', 0.6, { mask: 'low', color: 0x181615, rough: 0.1 }),
      p('dust', 0.45, { mask: 'ledge', color: 0x6a655c }),
    ],
  },
  {
    key: 'ground.blood',
    family: 'ground',
    base: 0x4a1e1a,
    shade: 0x1f0b09,
    light: 0x7a3028,
    detail: 0x341210,
    accent: 0x8d3a2e,
    roughness: [0.18, 0.6],
    metalness: 0.0,
    bump: 0.8,
    relief: { kind: 'smooth', scale: 3.2, warp: 1.0, depth: 0.4, octaves: 5 },
    variance: 0.3,
    ao: 0.8,
    sheen: 0.4,
    repeat: 2,
    passes: [
      p('blood', 0.9, { mask: 'none', scale: 2.0, rough: -0.3, sharp: 1.8 }),
      p('glaze', 0.7, { mask: 'low', rough: -0.24 }),
      p('stain', 0.5, { mask: 'peak', color: 0x2a100d, rough: 0.24 }),
      p('speckle', 0.3, { color: 0x7a2a22, scale: 14 }),
    ],
  },

  // ======================= BONE ==========================================
  {
    key: 'bone.pale',
    family: 'bone',
    base: 0xb5ab92,
    shade: 0x736a56,
    light: 0xdcd4bd,
    detail: 0x8f8570,
    accent: 0x6a6248,
    roughness: [0.4, 0.8],
    metalness: 0.0,
    bump: 0.9,
    relief: { kind: 'organic', scale: 3.6, warp: 0.7, depth: 0.5, octaves: 5 },
    variance: 0.2,
    ao: 0.8,
    repeat: 1,
    passes: [
      p('crack', 0.5, { height: -0.26, scale: 3.0, sharp: 2.8 }),
      p('veins', 0.3, { color: 0x9a9078, scale: 3.0, sharp: 3.2 }),
      p('stain', 0.55, { mask: 'low', color: 0x6a5f48, rough: -0.08 }),
      p('speckle', 0.35, { color: 0xc9c0a8, scale: 15 }),
      p('dust', 0.3, { mask: 'ledge', color: 0xcfc6ae }),
    ],
  },
  {
    key: 'bone.old',
    family: 'bone',
    base: 0x8b8271,
    shade: 0x504a3d,
    light: 0xb2a893,
    detail: 0x6c6455,
    accent: 0x54603c,
    roughness: [0.55, 0.92],
    metalness: 0.0,
    bump: 1.05,
    relief: { kind: 'organic', scale: 3.2, warp: 0.85, depth: 0.62, octaves: 6 },
    variance: 0.28,
    ao: 0.9,
    repeat: 1,
    passes: [
      p('crack', 0.7, { height: -0.34, scale: 2.6, sharp: 2.6 }),
      p('pit', 0.45, { mask: 'cavity', height: -0.3, scale: 6 }),
      p('stain', 0.65, { mask: 'low', color: 0x453f31, rough: -0.06 }),
      p('moss', 0.3, { mask: 'cavity', rough: 0.16, scale: 2.4, sharp: 2.2 }),
      p('speckle', 0.3, { color: 0xa39a85, scale: 14 }),
    ],
  },
];

// ---------------------------------------------------------------------------
// Lookup + aliasing
// ---------------------------------------------------------------------------

const REGISTRY = new Map<string, Palette>();
for (const pal of LIST) REGISTRY.set(pal.key, pal);

/**
 * Aliases keep the art layer forgiving: biome definitions and item bases are
 * authored by other modules and will reach for keys that read naturally
 * ('stone.foundry', 'stone.caverns'). Rather than throw or fall back to hot
 * pink, resolve them to the closest authored surface.
 */
const ALIASES: Record<string, string> = {
  // biome-flavoured stone
  'stone.caverns': 'stone.cavern',
  'stone.cave': 'stone.cavern',
  'stone.foundry': 'metal.rusted',
  'stone.sunkentemple': 'stone.temple',
  'stone.sunken': 'stone.temple',
  'stone.hive': 'flesh.chitin',
  'stone.frostvault': 'stone.frost',
  'stone.ice': 'stone.frost',
  'stone.ashwaste': 'stone.ash',
  'stone.voidspire': 'stone.void',
  'stone.marble': 'stone.temple',
  'stone.granite': 'stone.town',
  'stone.brick': 'stone.crypt',
  'stone.obsidian': 'stone.void',
  // ground flavours
  'ground.stone': 'ground.cobble',
  'ground.rock': 'ground.cobble',
  'ground.gravel': 'ground.dirt',
  'ground.mud': 'ground.dirt',
  'ground.ice': 'ground.snow',
  'ground.lava': 'ground.ash',
  'ground.void': 'stone.void',
  'ground.grass': 'ground.dirt',
  'ground.floor': 'ground.cobble',
  'ground.tile': 'ground.cobble',
  // metals
  'metal.brass': 'metal.bronze',
  'metal.blackiron': 'metal.dark',
  'metal.black': 'metal.dark',
  'metal.rust': 'metal.rusted',
  'metal.mithril': 'metal.silver',
  'metal.electrum': 'metal.gold',
  'metal.blade': 'metal.steel',
  // wood
  'wood.plank': 'wood.oak',
  'wood.dark': 'wood.polished',
  'wood.ash': 'wood.charred',
  'wood.burnt': 'wood.charred',
  'wood.rot': 'wood.rotted',
  // cloth / leather
  'skin.pale': 'skin.fair',
  'skin.olive': 'skin.tan',
  'cloth.homespun': 'cloth.undyed',
  'cloth.robe': 'cloth.linen',
  'cloth.wool': 'cloth.linen',
  'cloth.velvet': 'cloth.silk',
  'cloth.rag': 'cloth.tattered',
  'cloth.rags': 'cloth.tattered',
  'leather.hide': 'leather.worn',
  'leather.dark': 'leather.fine',
  'leather.studs': 'leather.studded',
  // flesh / bone
  'flesh.undead': 'flesh.rotted',
  'flesh.zombie': 'flesh.rotted',
  'flesh.bone': 'bone.pale',
  'flesh.insect': 'flesh.chitin',
  'flesh.demon': 'flesh.demonic',
  'flesh.skin': 'flesh.pale',
  'bone.bleached': 'bone.pale',
  'bone.rotted': 'bone.old',
  // crystal
  'crystal.gem': 'crystal.arcane',
  'crystal.shadow': 'crystal.void',
  'crystal.frost': 'crystal.ice',
  'crystal.soul': 'crystal.void',
};

/** Family fallbacks when nothing else matches. */
const FAMILY_DEFAULT: Record<string, string> = {
  stone: 'stone.crypt',
  metal: 'metal.iron',
  wood: 'wood.oak',
  cloth: 'cloth.linen',
  leather: 'leather.worn',
  flesh: 'flesh.pale',
  crystal: 'crystal.arcane',
  ground: 'ground.cobble',
  bone: 'bone.pale',
};

/**
 * Resolve a palette key, tolerating unknown names. Never returns undefined —
 * a missing surface is a texture bug that ships, not a crash on boot.
 */
export function resolvePalette(key: string): Palette {
  const direct = REGISTRY.get(key);
  if (direct) return direct;
  const lower = key.toLowerCase();
  const aliased = ALIASES[lower];
  if (aliased) {
    const a = REGISTRY.get(aliased);
    if (a) return a;
  }
  const byLower = REGISTRY.get(lower);
  if (byLower) return byLower;
  const family = lower.split(/[.\-_/]/)[0] ?? '';
  const fam = FAMILY_DEFAULT[family];
  if (fam) {
    const f = REGISTRY.get(fam);
    if (f) return f;
  }
  // Last resort: something inert and neutral rather than a magenta placeholder.
  return REGISTRY.get('stone.crypt')!;
}

export function hasPalette(key: string): boolean {
  return REGISTRY.has(key) || ALIASES[key.toLowerCase()] !== undefined;
}

export function allPalettes(): Palette[] {
  return LIST.slice();
}

export function paletteKeyList(): string[] {
  return LIST.map((p2) => p2.key);
}

/**
 * The set warmed on the boot bar. These are the surfaces a first dungeon and
 * the town are guaranteed to touch; everything else bakes lazily on demand.
 */
export const WARM_SET: string[] = [
  'stone.crypt',
  'stone.cavern',
  'stone.town',
  'ground.cobble',
  'ground.dirt',
  'metal.iron',
  'metal.steel',
  'metal.gold',
  'metal.dark',
  'wood.oak',
  'cloth.linen',
  'cloth.tattered',
  'leather.worn',
  'bone.pale',
  'crystal.arcane',
  'flesh.rotted',
];

/** Palettes grouped by family, for editor/debug listings. */
export function palettesByFamily(family: SurfaceFamily): Palette[] {
  return LIST.filter((pal) => pal.family === family);
}
