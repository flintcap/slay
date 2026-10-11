/**
 * One exposure shared by every light-adding effect shader (particles, cores,
 * beams, columns, shells, ribbons, floor glows). Effects add light, so a pile
 * of them washes the frame to white; `EffectSystem` lowers this when many
 * bright beats land at once and lets it recover. Telegraphs ignore it: a
 * warning must stay readable however busy the fight is.
 */
export const FX_EXPOSURE = { value: 1 };

/** Declares the uniform in a fragment shader. */
export const GLSL_EXPOSURE = /* glsl */ `uniform float uExposure;`;
