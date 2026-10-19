/**
 * SLAY vfx kit: how much a skill's rank lifts its drawing.
 *
 * While a hero's skill is drawn (its cast, its delayed blows, and every step
 * of a bolt, beam or field it left behind) the effect code runs "at" that
 * skill's rank: every particle layer, projectile core and flash light made
 * meanwhile comes out a little bigger, denser and brighter. The lift is the
 * same on every quality preset, on top of what the preset draws, so a maxed
 * skill on Low still reads as heavier than the same skill at rank 1 on Low.
 *
 * Monster and world effects run at rank 1 and are untouched.
 */

/**
 * How much bigger a skill's drawing is at `rank` than at rank 1: a little per
 * rank, capped, so a maxed skill reads as the same spell grown heavier. The
 * skill's real numbers (radius, length) already size the families; this is
 * on top, for sprite sizes and the parts no number sizes (motifs, self casts).
 */
export function rankSize(rank: number): number {
  return Math.min(1.45, 1 + Math.max(0, rank - 1) * 0.025);
}

/** How much denser a skill's particles are at `rank`. */
export function rankDensity(rank: number): number {
  return Math.min(1.6, 1 + Math.max(0, rank - 1) * 0.035);
}

/** How much brighter a skill's particles, cores and lights are at `rank`. */
export function rankGlow(rank: number): number {
  return Math.min(1.6, 1 + Math.max(0, rank - 1) * 0.03);
}

/** The lift in force right now (read by the particle, core and light code). */
export const BOOST = { rank: 1, size: 1, density: 1, glow: 1 };

/** The rank effects are being drawn at right now. */
export function boostRank(): number {
  return BOOST.rank;
}

/** Draws everything from here at `rank` (1 for none). Prefer `atRank`. */
export function setBoostRank(rank: number): void {
  const r = Number.isFinite(rank) ? Math.max(1, rank) : 1;
  if (r === BOOST.rank) return;
  BOOST.rank = r;
  BOOST.size = rankSize(r);
  BOOST.density = rankDensity(r);
  BOOST.glow = rankGlow(r);
}

/** Runs `fn` with effects drawn at `rank`, then puts back the rank before. */
export function atRank<T>(rank: number, fn: () => T): T {
  const was = BOOST.rank;
  setBoostRank(rank);
  try {
    return fn();
  } finally {
    setBoostRank(was);
  }
}
