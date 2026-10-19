/**
 * SLAY — the wind in the leaves.
 *
 * One shared push for everything that grows: a slow gust rolling across the
 * map and a quicker flutter on top, both keyed to where the plant stands so
 * a field moves in waves rather than in step. A vertex moves by how far it
 * stands above the plant's own root, so stems stay planted and tips swing.
 */
import { positionLocal, sin, time, vec3 } from 'three/tsl';
import type { F, V3 } from '../core/Tsl';

/** The way the wind blows, on the ground plane. */
const DIR = vec3(0.8, 0.0, 0.6);

/**
 * `positionLocal` (the drawn mesh's own space, which for the level's meshes
 * is the world) moved by the wind. `bend` is metres of travel at the
 * strongest gust: zero at the root, growing toward the tip.
 */
export function swayed(bend: F): V3 {
  const P = positionLocal;
  const ph = P.x.mul(0.37).add(P.z.mul(0.29));
  const gust = sin(time.mul(0.7).add(ph.mul(0.35))).mul(0.3).add(0.7);
  const flutter = sin(time.mul(2.3).add(ph)).mul(0.65).add(sin(time.mul(3.7).add(ph.mul(1.7))).mul(0.25));
  return P.add(DIR.mul(flutter.mul(gust).mul(bend)));
}
