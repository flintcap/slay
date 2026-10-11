/**
 * SLAY — which builder makes which family.
 *
 * Swords and daggers are built in `Model.ts` from `Blades.ts`; every other
 * family has its builder here. A family missing from the table falls back to
 * a plain short sword (and the "every base looks different" check fails).
 */
import type { Parts } from './Parts';
import { buildAxe, buildMace, buildPole } from './Weapons';
import { buildBow, buildCrossbow } from './Ranged';
import { buildOrb, buildScepter, buildStaff, buildWand } from './Casters';
import { buildQuiver, buildShield } from './Offhand';
import { buildBelt, buildBoots, buildChest, buildGloves, buildHelm } from './Wear';

export type FamilyBuilder = (P: Parts) => void;

export const FAMILY_BUILDERS: Partial<Record<string, FamilyBuilder>> = {
  axe: buildAxe,
  mace: buildMace,
  spear: buildPole,
  bow: buildBow,
  crossbow: buildCrossbow,
  wand: buildWand,
  staff: buildStaff,
  scepter: buildScepter,
  orb: buildOrb,
  shield: buildShield,
  quiver: buildQuiver,
  helm: buildHelm,
  chest: buildChest,
  gloves: buildGloves,
  boots: buildBoots,
  belt: buildBelt,
};
