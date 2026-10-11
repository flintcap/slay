/**
 * SLAY — what bodies are made of, for the effects that fly off them. Kept
 * apart from `Effects.ts` so entities can ask without pulling in the effect
 * library.
 */

/**
 * What a body is made of, for what flies off it when struck: blood from flesh,
 * chips from bone, grit and sparks from stone, ichor from slimes, plants and
 * bugs, and only light from elementals.
 */
export type HitMaterial = 'flesh' | 'bone' | 'stone' | 'ichor' | 'ether';

export function hitMaterial(family: string | undefined): HitMaterial {
  switch (family) {
    case 'undead':
      return 'bone';
    case 'construct':
      return 'stone';
    case 'ooze':
    case 'plant':
    case 'insect':
      return 'ichor';
    case 'elemental':
      return 'ether';
    default:
      return 'flesh';
  }
}

/** The burst a struck body of each material throws. */
export const MATERIAL_BURST: Record<HitMaterial, string> = {
  flesh: 'blood',
  bone: 'chips.bone',
  stone: 'chips.stone',
  ichor: 'ichor',
  ether: 'sparks',
};

/** The floor mark a struck body of each material leaves (null: none). */
export const MATERIAL_MARK: Record<HitMaterial, string | null> = {
  flesh: 'bloodSplatter',
  bone: 'bone',
  stone: 'crack',
  ichor: 'stain',
  ether: null,
};
