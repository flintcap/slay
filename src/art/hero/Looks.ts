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
  /**
   * What a hero wears with nothing equipped: plain undyed linens and a cord
   * at the waist, the same for every class. Gear makes the look (see "Gear
   * makes the look" in docs/remake/PLAN.md); hoods and masks are helmets.
   */
  linen: number;
  leather: number;
  /** Cloth for anything the body itself wears (the same undyed linen). */
  cloth: number;
  hood?: boolean;
  mask?: boolean;
  /** Rim and UI accent. */
  accent: number;
  /** How the body carries itself: 0 upright .. 1 hunched forward. */
  stoop: number;
}

/** Undyed linen and a plain cord, the bare hero's clothes. */
// Grey-brown, cooler and darker than any skin, so a bare hero reads as
// dressed in rough cloth, not as a naked body (it nearly matched skin).
const UNDYED = 0x8e8672;
const CORD = 0x6a5a44;

export const HERO_LOOKS: Record<CharClassId, HeroLook> = {
  warden: {
    shape: { sex: 'male', height: 1.88, build: 0.9, shoulders: 1.08 },
    face: { rugged: 1 },
    skin: 0xc08a68,
    hair: { cut: 'crop', color: 0x3a2a1e, beard: 2 },
    eyes: { iris: 0x5a4632 },
    linen: UNDYED,
    leather: CORD,
    cloth: UNDYED,
    accent: 0xd8b45a,
    stoop: 0.05,
  },
  mage: {
    shape: { sex: 'female', height: 1.74, build: 0.25, hips: 0.95 },
    face: { rugged: 0 },
    skin: 0xe2b49a,
    hair: { cut: 'long', color: 0x9a3a18 },
    eyes: { iris: 0x4a6a3a },
    linen: UNDYED,
    leather: CORD,
    cloth: UNDYED,
    accent: 0x9a8aff,
    stoop: 0,
  },
  shadowblade: {
    shape: { sex: 'female', height: 1.72, build: 0.28, hips: 0.92 },
    face: { rugged: 0.15 },
    skin: 0x8a5a40,
    hair: { cut: 'knot', color: 0x141010 },
    eyes: { iris: 0x2a2018 },
    linen: UNDYED,
    leather: CORD,
    cloth: UNDYED,
    accent: 0x4ad69a,
    stoop: 0.35,
  },
  revenant: {
    shape: { sex: 'male', height: 1.84, build: 0.2, wasted: 0.85 },
    face: { skull: true },
    skin: 0xb4ae98,
    dead: true,
    hair: { cut: 'none', color: 0x000000 },
    eyes: { iris: 0x7ce0a0, glow: 0x7ce0a0 },
    linen: UNDYED,
    leather: CORD,
    cloth: UNDYED,
    accent: 0x7ce0a0,
    stoop: 0.6,
  },
  ranger: {
    shape: { sex: 'female', height: 1.76, build: 0.4, hips: 0.95 },
    face: { rugged: 0.25 },
    skin: 0xd8a888,
    hair: { cut: 'ponytail', color: 0xb08a50 },
    eyes: { iris: 0x5a7a4a },
    linen: UNDYED,
    leather: CORD,
    cloth: UNDYED,
    accent: 0x7fc46a,
    stoop: 0.1,
  },
  shapeshifter: {
    // Rangy and heavy in the shoulder, weathered by the drowned woods, long
    // braided hair with a short beard, and amber eyes that catch the light
    // the way an animal's do.
    shape: { sex: 'male', height: 1.9, build: 0.72, shoulders: 1.05 },
    face: { rugged: 0.8 },
    skin: 0xa87656,
    hair: { cut: 'braids', color: 0x2a1e16, beard: 1 },
    eyes: { iris: 0xc8902a, glow: 0x6a4410 },
    linen: UNDYED,
    leather: CORD,
    cloth: UNDYED,
    accent: 0xc46a34,
    stoop: 0.22,
  },
  // A big, older man who stands straight: shaved head, a short grizzled
  // beard, pale scarred skin and pale grey eyes. Taller and broader than the
  // Knight, and nothing like him in the face.
  paladin: {
    shape: { sex: 'male', height: 1.92, build: 0.8, shoulders: 1.06 },
    face: { rugged: 0.75 },
    skin: 0xd0a68a,
    hair: { cut: 'shaved', color: 0x7a7468, beard: 1, brows: 0.8 },
    eyes: { iris: 0x8a929a },
    linen: UNDYED,
    leather: CORD,
    cloth: UNDYED,
    accent: 0xe8cf96,
    stoop: 0,
  },
};
