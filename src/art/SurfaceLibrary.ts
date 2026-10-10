/**
 * SLAY — what each `surface()` key is made of.
 *
 * Every key names a photo texture set (`TextureSets.ts`) plus how to wear it:
 * a target colour, a roughness range, metalness, relief strength and glow.
 * Pure data; nothing here touches THREE.
 *
 * Keys are `family.name` ('stone.crypt', 'metal.gold', 'cloth.banner'...).
 * Aliases fold the many names the model builders use onto a smaller set of
 * real surfaces, and an unknown key falls back to its family, then to stone,
 * so a typo never ships as a broken material. `tex.<set>` names a texture set
 * directly, in its own photographed colour.
 */

import { isTextureSet, TEXTURE_SETS, type TextureSetName } from './TextureSets';

export interface SurfaceDef {
  key: string;
  family: string;
  set: TextureSetName;
  /**
   * Target mid-tone (sRGB hex). The material tint is chosen so the scan's
   * average lands here; leave out to keep the photographed colour.
   */
  base?: number;
  /** 0..1 how far toward `base` the tint goes (1 for colourless scans). */
  tintAmount?: number;
  /** Roughness range the scan's roughness map is stretched across. */
  rough: [number, number];
  metal: number;
  /** Normal map strength multiplier. */
  bump: number;
  emissive?: number;
  emissiveIntensity?: number;
  /** Metres per texture tile on world geometry (defaults to the scan's size). */
  metres?: number;
}

type Def = Omit<SurfaceDef, 'key' | 'family'>;

const S = (set: TextureSetName, base: number | undefined, rough: [number, number], metal: number, bump: number, extra: Partial<Def> = {}): Def => ({
  set,
  base,
  rough,
  metal,
  bump,
  ...extra,
});

const LIB: Record<string, Def> = {
  // Stone
  'stone.crypt': S('slab', 0x6b6a63, [0.62, 0.96], 0, 1.0, { tintAmount: 0.6 }),
  'stone.cavern': S('cave', 0x5c554b, [0.58, 0.98], 0, 1.3, { tintAmount: 0.5 }),
  'stone.temple': S('sandstone', 0x968b74, [0.42, 0.86], 0, 0.9, { tintAmount: 0.6 }),
  'stone.frost': S('slab', 0x6d7986, [0.3, 0.82], 0, 1.1, { tintAmount: 0.8 }),
  'stone.ash': S('basalt', 0x4a453e, [0.6, 0.98], 0, 1.25, { tintAmount: 0.5, emissive: 0x8a2a08, emissiveIntensity: 0.12 }),
  'stone.void': S('obsidian', 0x34303c, [0.34, 0.8], 0.06, 1.2, { tintAmount: 0.7, emissive: 0x5a2fa0, emissiveIntensity: 0.35 }),
  'stone.town': S('rubble_wall', 0x7c7970, [0.55, 0.92], 0, 1.0, { tintAmount: 0.5 }),
  'stone.brick': S('ashlar', undefined, [0.55, 0.95], 0, 1.0),
  'stone.foundry': S('basalt', 0x4a3830, [0.55, 0.95], 0.1, 1.2, { tintAmount: 0.6 }),
  // Metal
  'metal.iron': S('iron', 0x585c60, [0.3, 0.68], 1, 0.75),
  'metal.steel': S('steel', 0x8b919a, [0.14, 0.44], 1, 0.55),
  'metal.bronze': S('steel', 0x8a6a3c, [0.22, 0.6], 1, 0.7),
  'metal.gold': S('steel', 0xd0a94a, [0.08, 0.32], 1, 0.6),
  'metal.rusted': S('rust', 0x6d4527, [0.55, 0.98], 0.45, 1.25, { tintAmount: 0.5 }),
  'metal.dark': S('iron', 0x3a3c41, [0.24, 0.6], 1, 0.8),
  'metal.silver': S('steel', 0xb2b8bf, [0.06, 0.3], 1, 0.5),
  'metal.copper': S('steel', 0x9a5f3c, [0.18, 0.55], 1, 0.7),
  'metal.verdigris': S('rust', 0x4f7a6a, [0.5, 0.9], 0.3, 1.1, { tintAmount: 0.8 }),
  'metal.voidgold': S('steel', 0x8f78c4, [0.1, 0.34], 1, 0.6),
  'metal.bloodgold': S('steel', 0xb0503a, [0.1, 0.34], 1, 0.6),
  'metal.chain': S('chainmail', 0x6c7076, [0.25, 0.6], 1, 1.0),
  // Wood
  'wood.oak': S('wood', 0x6d5334, [0.46, 0.86], 0, 0.95, { tintAmount: 0.7 }),
  'wood.rotted': S('wood', 0x4d4a3b, [0.62, 0.99], 0, 1.3, { tintAmount: 0.7 }),
  'wood.charred': S('wood', 0x2b2622, [0.6, 0.99], 0, 1.4, { tintAmount: 0.9, emissive: 0x8a2f08, emissiveIntensity: 0.18 }),
  'wood.polished': S('wood', 0x53331e, [0.12, 0.4], 0, 0.5, { tintAmount: 0.8 }),
  'wood.bark': S('bark', undefined, [0.7, 1.0], 0, 1.3),
  'wood.planks': S('planks', undefined, [0.55, 0.95], 0, 1.0),
  // Cloth
  'cloth.linen': S('cloth', 0xa79880, [0.7, 0.98], 0, 0.5),
  'cloth.undyed': S('cloth', 0x8f8471, [0.72, 0.98], 0, 0.55),
  'cloth.silk': S('cloth', 0x604a70, [0.24, 0.52], 0, 0.4),
  'cloth.tattered': S('cloth', 0x695e51, [0.72, 0.99], 0, 0.7),
  'cloth.banner': S('cloth', 0x7a2e26, [0.6, 0.92], 0, 0.5),
  // Leather
  'leather.worn': S('leather', 0x5b4331, [0.44, 0.84], 0, 0.55),
  'leather.studded': S('leather', 0x40342b, [0.4, 0.82], 0, 0.7),
  'leather.fine': S('leather', 0x3b2b2a, [0.26, 0.56], 0, 0.42),
  // Flesh, skin, hair
  'flesh.rotted': S('flesh', 0x6a6a55, [0.36, 0.78], 0, 1.1, { tintAmount: 0.85 }),
  'flesh.chitin': S('obsidian', 0x3a2f29, [0.14, 0.46], 0.12, 1.0, { tintAmount: 0.8 }),
  'flesh.pale': S('leather', 0xaf9f93, [0.34, 0.7], 0, 0.45),
  'flesh.demonic': S('flesh', 0x763530, [0.3, 0.72], 0, 1.2, { tintAmount: 0.7, emissive: 0xd44a12, emissiveIntensity: 0.4 }),
  'skin.fair': S('leather', 0xc49a80, [0.46, 0.66], 0, 0.18),
  'skin.tan': S('leather', 0xb07d58, [0.46, 0.64], 0, 0.18),
  'skin.deep': S('leather', 0x6d4530, [0.42, 0.6], 0, 0.18),
  'hair.dark': S('fur', 0x2a2420, [0.38, 0.62], 0, 0.5),
  'hair.fair': S('fur', 0x8a6d43, [0.38, 0.62], 0, 0.5),
  // Crystal
  'crystal.void': S('ice', 0x3b2f5c, [0.05, 0.24], 0, 1.1, { tintAmount: 0.9, emissive: 0x7a4ad6, emissiveIntensity: 0.9 }),
  'crystal.ice': S('ice', 0x9dc2d7, [0.03, 0.2], 0, 1.0, { tintAmount: 0.7, emissive: 0x2f6a8c, emissiveIntensity: 0.28 }),
  'crystal.arcane': S('ice', 0x2f6a7a, [0.04, 0.22], 0, 1.05, { tintAmount: 0.9, emissive: 0x2ad0e6, emissiveIntensity: 1.0 }),
  // Ground
  'ground.cobble': S('cobble', 0x5f5b54, [0.6, 0.98], 0, 1.2, { tintAmount: 0.5 }),
  'ground.dirt': S('dirt', 0x564734, [0.72, 1.0], 0, 1.15, { tintAmount: 0.5 }),
  'ground.mud': S('mud', undefined, [0.3, 0.9], 0, 1.1),
  'ground.grass': S('grass', undefined, [0.75, 1.0], 0, 1.0),
  'ground.leaves': S('leaves', undefined, [0.7, 1.0], 0, 1.0),
  'ground.sand': S('sand', 0xa5916c, [0.75, 1.0], 0, 0.85, { tintAmount: 0.5 }),
  'ground.snow': S('snow', 0xc7d2dc, [0.5, 0.88], 0, 0.7, { tintAmount: 0.9 }),
  'ground.ash': S('ash', 0x494540, [0.78, 1.0], 0, 0.95, { tintAmount: 0.5, emissive: 0x8a2a08, emissiveIntensity: 0.14 }),
  'ground.blood': S('mud', 0x4a1e1a, [0.18, 0.6], 0, 0.8, { tintAmount: 0.9 }),
  'ground.cracked': S('cracked', undefined, [0.7, 1.0], 0, 1.0),
  'earth.moss': S('moss', 0x4a5a36, [0.7, 1.0], 0, 0.9, { tintAmount: 0.5 }),
  'foliage.pine': S('moss', 0x2c3a26, [0.6, 0.95], 0, 0.9, { tintAmount: 0.8 }),
  // Bone
  'bone.pale': S('bone', 0xb5ab92, [0.4, 0.8], 0, 0.9),
  'bone.old': S('bone', 0x8b8271, [0.55, 0.92], 0, 1.05),
  // Liquids and heat, for world geometry
  'lava.crust': S('lava_crust', undefined, [0.5, 0.95], 0, 1.2, { emissive: 0xff5a1a, emissiveIntensity: 2.2 }),
  'lava.flow': S('lava', undefined, [0.3, 0.7], 0, 0.6, { emissive: 0xff6a20, emissiveIntensity: 2.6 }),
};

const ALIASES: Record<string, string> = {
  'stone.caverns': 'stone.cavern',
  'stone.cave': 'stone.cavern',
  'stone.sunkentemple': 'stone.temple',
  'stone.sunken': 'stone.temple',
  'stone.marble': 'stone.temple',
  'stone.hive': 'flesh.chitin',
  'stone.frostvault': 'stone.frost',
  'stone.ice': 'stone.frost',
  'stone.ashwaste': 'stone.ash',
  'stone.voidspire': 'stone.void',
  'stone.obsidian': 'stone.void',
  'stone.granite': 'stone.town',
  'ground.stone': 'ground.cobble',
  'ground.rock': 'ground.cobble',
  'ground.floor': 'ground.cobble',
  'ground.tile': 'ground.cobble',
  'ground.gravel': 'ground.dirt',
  'ground.ice': 'ground.snow',
  'ground.lava': 'ground.ash',
  'ground.void': 'stone.void',
  'earth.ash': 'ground.ash',
  'metal.brass': 'metal.bronze',
  'metal.blackiron': 'metal.dark',
  'metal.black': 'metal.dark',
  'metal.rust': 'metal.rusted',
  'metal.mithril': 'metal.silver',
  'metal.electrum': 'metal.gold',
  'metal.blade': 'metal.steel',
  'metal.chainmail': 'metal.chain',
  'wood.plank': 'wood.planks',
  'wood.dark': 'wood.polished',
  'wood.ash': 'wood.charred',
  'wood.burnt': 'wood.charred',
  'wood.rot': 'wood.rotted',
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
  'flesh.undead': 'flesh.rotted',
  'flesh.zombie': 'flesh.rotted',
  'flesh.bone': 'bone.pale',
  'flesh.insect': 'flesh.chitin',
  'flesh.demon': 'flesh.demonic',
  'flesh.skin': 'flesh.pale',
  'bone.bleached': 'bone.pale',
  'bone.rotted': 'bone.old',
  'crystal.gem': 'crystal.arcane',
  'crystal.shadow': 'crystal.void',
  'crystal.frost': 'crystal.ice',
  'crystal.soul': 'crystal.void',
};

const FAMILY_DEFAULT: Record<string, string> = {
  stone: 'stone.crypt',
  metal: 'metal.iron',
  gold: 'metal.gold',
  wood: 'wood.oak',
  cloth: 'cloth.linen',
  leather: 'leather.worn',
  flesh: 'flesh.pale',
  skin: 'skin.tan',
  hair: 'hair.dark',
  crystal: 'crystal.arcane',
  ground: 'ground.cobble',
  earth: 'ground.dirt',
  foliage: 'foliage.pine',
  bone: 'bone.pale',
  lava: 'lava.crust',
};

const cache = new Map<string, SurfaceDef>();

function make(key: string, d: Def): SurfaceDef {
  return { key, family: key.split('.')[0] ?? 'stone', ...d };
}

/**
 * The surface a key means. Never fails: aliases, then the family's default,
 * then crypt stone. `tex.<set>` gives a texture set in its own colour.
 */
export function resolveSurface(key: string): SurfaceDef {
  const hit = cache.get(key);
  if (hit) return hit;
  let out: SurfaceDef;
  const lower = key.toLowerCase();
  if (lower.startsWith('tex.') && isTextureSet(lower.slice(4))) {
    out = make(lower, { set: lower.slice(4) as TextureSetName, rough: [0, 1], metal: 0, bump: 1 });
  } else {
    const real = LIB[key] ? key : LIB[lower] ? lower : ALIASES[lower] ?? FAMILY_DEFAULT[lower.split(/[.\-_/]/)[0] ?? ''] ?? 'stone.crypt';
    out = make(real, LIB[real] ?? LIB['stone.crypt']!);
  }
  cache.set(key, out);
  return out;
}

/** True when the key (or its alias) names an authored surface. */
export function hasSurface(key: string): boolean {
  const lower = key.toLowerCase();
  return !!LIB[key] || !!LIB[lower] || ALIASES[lower] !== undefined || (lower.startsWith('tex.') && isTextureSet(lower.slice(4)));
}

/** Every authored key (not aliases). */
export function surfaceKeys(): string[] {
  return Object.keys(LIB);
}

/** Every key that resolves to an authored surface, aliases included. */
export function allSurfaceKeys(): string[] {
  return [...Object.keys(LIB), ...Object.keys(ALIASES)];
}

/**
 * The surface's mid-tone as sRGB hex: its `base`, or the scan's own average.
 * For model code that wants "the colour of iron" without a texture.
 */
export function surfaceBaseColor(key: string): number {
  const d = resolveSurface(key);
  return d.base ?? TEXTURE_SETS[d.set].avg;
}
