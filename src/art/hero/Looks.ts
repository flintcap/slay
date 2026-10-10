/**
 * SLAY — who each class is: body, face, hair, skin and undergarments.
 * See "Design" in docs/remake/heroes.md.
 */
import type { CharClassId } from '../../types';
import type { BodyShape } from './Rig';
import type { AnatomyOpts } from './Anatomy';

export type HairCut = 'crop' | 'long' | 'ponytail' | 'knot' | 'braids' | 'shaved' | 'none';

export interface HeroLook {
  shape: BodyShape;
  face: AnatomyOpts;
  /** Skin albedo (linear-ish sRGB hex) and how red the flushed parts go. */
  skin: number;
  /** Bone-and-sinew skin: the revenant. */
  dead?: boolean;
  hair: { cut: HairCut; color: number; beard?: 0 | 1 | 2; brows?: number };
  eyes: { iris: number; glow?: number };
  /** Undergarment colours. */
  linen: number;
  leather: number;
  /** Class cloth: hoods, masks, sashes. */
  cloth: number;
  hood?: boolean;
  mask?: boolean;
  /** Rim and UI accent. */
  accent: number;
  /** How the body carries itself: 0 upright .. 1 hunched forward. */
  stoop: number;
}

export const HERO_LOOKS: Record<CharClassId, HeroLook> = {
  warden: {
    shape: { sex: 'male', height: 1.88, build: 0.9, shoulders: 1.08 },
    face: { rugged: 1 },
    skin: 0xc08a68,
    hair: { cut: 'crop', color: 0x3a2a1e, beard: 2 },
    eyes: { iris: 0x5a4632 },
    linen: 0x8a7e6a,
    leather: 0x4a3424,
    cloth: 0x7a1e1a,
    accent: 0xd8b45a,
    stoop: 0.05,
  },
  pyromancer: {
    shape: { sex: 'female', height: 1.74, build: 0.25 },
    face: { rugged: 0 },
    skin: 0xe2b49a,
    hair: { cut: 'long', color: 0x9a3a18 },
    eyes: { iris: 0x4a6a3a },
    linen: 0x9a8e7c,
    leather: 0x5a3020,
    cloth: 0x6a1a12,
    accent: 0xff7a2a,
    stoop: 0,
  },
  shadowblade: {
    shape: { sex: 'female', height: 1.72, build: 0.42 },
    face: { rugged: 0.15 },
    skin: 0x8a5a40,
    hair: { cut: 'knot', color: 0x141010 },
    eyes: { iris: 0x2a2018 },
    linen: 0x3a3a40,
    leather: 0x2a2220,
    cloth: 0x585e68,
    hood: true,
    mask: true,
    accent: 0x4ad69a,
    stoop: 0.35,
  },
  stormcaller: {
    shape: { sex: 'male', height: 1.84, build: 0.35, shoulders: 0.98 },
    face: { rugged: 0.55 },
    skin: 0xd6aa90,
    hair: { cut: 'braids', color: 0x8a96a8, beard: 1 },
    eyes: { iris: 0x4a6a8a },
    linen: 0x8a909a,
    leather: 0x3a3430,
    cloth: 0x2a3a5a,
    accent: 0x6fc8ff,
    stoop: 0.05,
  },
  revenant: {
    shape: { sex: 'male', height: 1.84, build: 0.2, wasted: 0.85 },
    face: { skull: true },
    skin: 0xb4ae98,
    dead: true,
    hair: { cut: 'none', color: 0x000000 },
    eyes: { iris: 0x7ce0a0, glow: 0x7ce0a0 },
    linen: 0x4a4a40,
    leather: 0x2a2620,
    cloth: 0x3a4a40,
    accent: 0x7ce0a0,
    stoop: 0.6,
  },
  ranger: {
    shape: { sex: 'female', height: 1.76, build: 0.48 },
    face: { rugged: 0.25 },
    skin: 0xd8a888,
    hair: { cut: 'ponytail', color: 0xb08a50 },
    eyes: { iris: 0x5a7a4a },
    linen: 0x8a8270,
    leather: 0x5a3e28,
    cloth: 0x4a5a34,
    accent: 0x7fc46a,
    stoop: 0.1,
  },
};

export function heroLook(classId: CharClassId): HeroLook {
  return HERO_LOOKS[classId] ?? HERO_LOOKS.warden;
}
