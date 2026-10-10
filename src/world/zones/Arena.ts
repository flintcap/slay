/**
 * SLAY — the boss arena tail (map remake, docs/remake/maps.md).
 *
 * Carved before the boss zone's generator runs. The arena takes the east end
 * of the zone: a big open room indoors, a clearing outdoors, with one way in,
 * a three-wide gate in its west wall. Everything from the arena's west wall
 * eastward is fenced off (`limitX`, `forbid`), so neither the generator nor
 * the connectivity pass can open a second way in.
 */

import { T_FLOOR, T_VOID } from '../Layouts';
import { type ZoneCtx, type ZoneResult, addRoom, clampN, makeNoise } from './Kit';

export function carveArena(ctx: ZoneCtx): NonNullable<ZoneResult['arena']> {
  const { g, rng, outdoor } = ctx;
  const aw = rng.int(20, 24);
  const ah = clampN(rng.int(18, 22), 12, g.h - 10);
  const ax = g.w - 3 - aw;
  const ay = clampN(Math.round(ctx.exit.y - ah / 2), 4, g.h - 4 - ah);
  const gy = clampN(ctx.exit.y, ay + 3, ay + ah - 4);

  // Fence: the arena and its one-tile shell, plus every column east of it.
  for (let y = 0; y < g.h; y++) {
    for (let x = ax - 1; x < g.w; x++) ctx.forbid[y * g.w + x] = 1;
  }
  const set = (x: number, y: number, v: number): void => g.set(x, y, v);

  if (outdoor) {
    const noise = makeNoise(rng);
    const cx = ax + aw / 2;
    const cy = ay + ah / 2;
    // A ragged clearing that never breaks its own rectangle.
    for (let y = ay; y < ay + ah; y++) {
      for (let x = ax; x < ax + aw; x++) {
        const dx = (x + 0.5 - cx) / (aw / 2);
        const dy = (y + 0.5 - cy) / (ah / 2);
        const edge = 1 + 0.12 * noise.fbm(x * 0.25, y * 0.25, 2) - 0.1;
        if (dx * dx + dy * dy < edge * edge) set(x, y, T_FLOOR);
      }
    }
    // A few standing stones, trunks or spires, well clear of the middle.
    for (let k = 0; k < rng.int(2, 4); k++) {
      const a = rng.range(0, Math.PI * 2);
      const px = Math.round(cx + Math.cos(a) * aw * 0.3);
      const py = Math.round(cy + Math.sin(a) * ah * 0.3);
      set(px, py, T_VOID);
    }
  } else {
    for (let y = ay; y < ay + ah; y++) for (let x = ax; x < ax + aw; x++) set(x, y, T_FLOOR);
    // Four great pillars, and cut corners so the room is not a box.
    for (const [px, py] of [
      [ax + 4, ay + 4],
      [ax + aw - 6, ay + 4],
      [ax + 4, ay + ah - 6],
      [ax + aw - 6, ay + ah - 6],
    ] as const) {
      for (let y = py; y < py + 2; y++) for (let x = px; x < px + 2; x++) set(x, y, T_VOID);
    }
    for (let k = 0; k < 2; k++) {
      for (let d = 0; d < 2 - k; d++) {
        set(ax + k, ay + d, T_VOID);
        set(ax + aw - 1 - k, ay + d, T_VOID);
        set(ax + k, ay + ah - 1 - d, T_VOID);
        set(ax + aw - 1 - k, ay + ah - 1 - d, T_VOID);
      }
    }
  }

  // The gate: three tiles in the west wall, a short throat, and the approach.
  for (let d = -1; d <= 1; d++) {
    set(ax - 1, gy + d, T_FLOOR);
    set(ax - 2, gy + d, T_FLOOR);
    set(ax, gy + d, T_FLOOR);
  }
  // Outdoors the clearing is round, so make sure the gate reaches into it.
  if (outdoor) for (let x = ax; x < ax + aw / 2; x++) for (let d = -1; d <= 1; d++) set(x, gy + d, T_FLOOR);

  ctx.limitX = ax - 1;
  ctx.exit = { x: ax - 4, y: gy };
  addRoom(ctx, ax, ay, aw, ah, 'boss');
  return { x: ax, y: ay, w: aw, h: ah, gate: { x: ax - 1, y: gy } };
}
