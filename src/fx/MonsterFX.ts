/**
 * The effect system as monster code sees it. Abilities, bosses and hazards
 * live in `entities/` and only get particles and decals through their combat
 * context; the scene binds the full effect system here so a monster's bolt
 * can be a lit, trailed projectile and a boss phase can erupt.
 *
 * Unbound (headless checks, tools), callers fall back to their plain looks.
 */
import type { EffectSystem } from './Effects';

let bound: EffectSystem | null = null;

/** The scene calls this once the effect system exists, and with null on exit. */
export function bindMonsterFX(effects: EffectSystem | null): void {
  bound = effects;
}

/** The bound effect system, or null. */
export function monsterFX(): EffectSystem | null {
  return bound;
}

/** Floor glow kind for a hazard of each damage type. */
export const HAZARD_GLOW = {
  fire: 'firePool',
  poison: 'poisonPool',
  cold: 'frostField',
  lightning: 'stormField',
  arcane: 'voidPool',
  physical: 'auraRing',
} as const;
