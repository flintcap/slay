import { uniform } from 'three/tsl';

/**
 * One exposure shared by every light-adding effect shader (particles, cores,
 * beams, columns, shells, ribbons, floor glows). Effects add light, so a pile
 * of them washes the frame to white; `EffectSystem` lowers this when many
 * bright beats land at once and lets it recover. Telegraphs ignore it: a
 * warning must stay readable however busy the fight is.
 *
 * A shader uniform: shaders use it as a node, the game sets `.value`.
 */
export const FX_EXPOSURE = uniform(1);

/**
 * Flash reduction (Settings, Gameplay): how much of each bright beat is kept.
 * `light` scales the one-shot lights that light up the room around a blast,
 * `hit` the white flash on a struck body, and `ceiling` caps the exposure
 * above, so even one burst never reaches full white.
 */
export const FX_COMFORT = { light: 1, hit: 1, ceiling: 1 };

export function setFlashReduce(on: boolean): void {
  FX_COMFORT.light = on ? 0.4 : 1;
  FX_COMFORT.hit = on ? 0.45 : 1;
  FX_COMFORT.ceiling = on ? 0.75 : 1;
  FX_EXPOSURE.value = Math.min(FX_EXPOSURE.value, FX_COMFORT.ceiling);
}
