/**
 * SLAY — who stands near whom, answered from a coarse grid.
 *
 * Monster AI asks "which of us are near here" many times a frame: spacing
 * from its neighbours, the nearest ally, the wounded to tend, a free slot
 * round the hero. Each question used to walk every monster in the area, so
 * the cost grew with awake monsters times all monsters, and with packs of
 * twenty and hundreds to an area that walk became most of the frame.
 *
 * The scene marks its monster list once a frame (`markCrowd`); the first
 * question after that sorts the living into 8 m cells, and every question
 * reads only the cells its circle touches. A monster moves far less than the
 * margin in one frame, so the cells stay true for the frame. Callers still
 * check the exact distance and `alive`, as they did over the whole list.
 *
 * A list nobody marked (a test harness, a sim) gets itself back whole, so
 * the answer there is the old full walk, never a stale grid.
 */
import type { Enemy } from './Enemy';

const CELL = 8;
/** Metres a monster can move between the grid's build and a question. */
const MARGIN = 1.5;
const SPAN = 1 << 13;

let managed: readonly Enemy[] | null = null;
let dirty = true;
const cells = new Map<number, Enemy[]>();
const spare: Enemy[][] = [];

const cellOf = (v: number): number => Math.floor(v / CELL);
const keyOf = (cx: number, cz: number): number => (cx + SPAN) * 2 * SPAN + (cz + SPAN);

/** The scene's monster list, its monsters about to move this frame. */
export function markCrowd(list: readonly Enemy[] | null): void {
  managed = list;
  dirty = true;
}

function build(list: readonly Enemy[]): void {
  for (const arr of cells.values()) {
    arr.length = 0;
    spare.push(arr);
  }
  cells.clear();
  for (let i = 0; i < list.length; i++) {
    const e = list[i]!;
    if (!e.alive) continue;
    const p = e.root.position;
    const k = keyOf(cellOf(p.x), cellOf(p.z));
    let arr = cells.get(k);
    if (!arr) {
      arr = spare.pop() ?? [];
      cells.set(k, arr);
    }
    arr.push(e);
  }
  dirty = false;
}

/**
 * Monsters of `list` that may stand within `r` of (x, z), written into `out`
 * (or `list` itself when the scene does not keep a grid for it). Nearer
 * than `r` is the caller's own check.
 */
export function crowdNear(list: readonly Enemy[], x: number, z: number, r: number, out: Enemy[]): readonly Enemy[] {
  if (list !== managed) return list;
  if (dirty) build(list);
  out.length = 0;
  const rr = r + MARGIN;
  const x0 = cellOf(x - rr);
  const x1 = cellOf(x + rr);
  const z0 = cellOf(z - rr);
  const z1 = cellOf(z + rr);
  for (let cx = x0; cx <= x1; cx++) {
    for (let cz = z0; cz <= z1; cz++) {
      const arr = cells.get(keyOf(cx, cz));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) out.push(arr[i]!);
    }
  }
  return out;
}
