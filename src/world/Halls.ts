/**
 * SLAY — halls that stand taller.
 *
 * The rock over a carved level is one flat sheet (`DungeonBuilder`, roofY).
 * A big room, and every boss room, lifts its walls and its ceiling a storey
 * above it, so the rock steps up and down across a level instead of lying
 * flat. The builder closes every step it makes with a face; `check-roof`
 * models the same lifts from this file.
 */
import type { DungeonLevel } from '../types';
import { streamFor } from '../core/RNG';

/** Metres a hall stands above the level's own rock and ceiling. */
export const HALL_STOREY = 1.6;

export interface HallLifts {
  /** Per tile: how far a wall's top stands above the level's rock (the tallest room it borders). */
  wall: Float32Array;
  /** Per tile: how far an open tile's ceiling stands above the level's (its own room's). */
  ceil: Float32Array;
}

/** Lifts for a level. `open` says which tiles are open ground; `roomOf` is the room id per tile (-1 for none). */
export function hallLifts(level: DungeonLevel, roomOf: Int16Array, open: (x: number, y: number) => boolean): HallLifts {
  const W = level.width;
  const H = level.height;
  const wall = new Float32Array(W * H);
  const ceil = new Float32Array(W * H);
  const rr = streamFor(level.seed, 'hallLifts');
  const byRoom = new Map<number, number>();
  for (const r of level.rooms) {
    const area = r.w * r.h;
    const lift = r.kind === 'boss' ? HALL_STOREY * 1.5 : rr.chance(area >= 140 ? 0.6 : area >= 80 ? 0.3 : 0) ? HALL_STOREY : 0;
    if (lift > 0) byRoom.set(r.id, lift);
  }
  if (byRoom.size === 0) return { wall, ceil };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (open(x, y)) {
        const rid = roomOf[i]!;
        if (rid >= 0) ceil[i] = byRoom.get(rid) ?? 0;
        continue;
      }
      let m = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || !open(nx, ny)) continue;
          const nr = roomOf[ny * W + nx]!;
          if (nr >= 0) m = Math.max(m, byRoom.get(nr) ?? 0);
        }
      }
      wall[i] = m;
    }
  }
  return { wall, ceil };
}
