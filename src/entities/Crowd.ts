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

/**
 * A run of monsters: the first `n` of `items`. Emptied by zeroing `n`, never
 * by `length = 0`, which throws the array's storage away so the next fill
 * allocates it again.
 */
interface Run {
  items: Enemy[];
  n: number;
}

/**
 * What one question found: read the first `n` of `list`. Keep one per caller
 * and pass it back each time; it is refilled in place.
 */
export interface CrowdHits {
  list: ReadonlyArray<Enemy | undefined>;
  n: number;
  /** The storage behind `list` (unless `list` is the whole monster list). */
  readonly store: Array<Enemy | undefined>;
}

export function crowdHits(): CrowdHits {
  const store: Array<Enemy | undefined> = [];
  return { list: store, n: 0, store };
}

// Cells are kept from frame to frame (emptied, not dropped), so a rebuild
// makes no garbage: clearing the map threw its table away every frame.
const cells = new Map<number, Run>();
/** The cells holding someone since the last build. */
const used: Run[] = [];
let usedN = 0;

const cellOf = (v: number): number => Math.floor(v / CELL);
const keyOf = (cx: number, cz: number): number => (cx + SPAN) * 2 * SPAN + (cz + SPAN);

/** The scene's monster list, its monsters about to move this frame. */
export function markCrowd(list: readonly Enemy[] | null): void {
  // A new floor's list: the old floor's cells go.
  if (list !== managed) {
    cells.clear();
    used.length = 0;
    usedN = 0;
  }
  managed = list;
  dirty = true;
}

function build(list: readonly Enemy[]): void {
  for (let i = 0; i < usedN; i++) used[i]!.n = 0;
  usedN = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i]!;
    if (!e.alive) continue;
    const p = e.root.position;
    const k = keyOf(cellOf(p.x), cellOf(p.z));
    let run = cells.get(k);
    if (!run) {
      run = { items: [], n: 0 };
      cells.set(k, run);
    }
    if (run.n === 0) used[usedN++] = run;
    run.items[run.n++] = e;
  }
  dirty = false;
}

/**
 * Monsters of `list` that may stand within `r` of (x, z), written into `out`
 * (or `list` itself when the scene does not keep a grid for it). Nearer
 * than `r` is the caller's own check.
 */
export function crowdNear(list: readonly Enemy[], x: number, z: number, r: number, out: CrowdHits): CrowdHits {
  if (list !== managed) {
    out.list = list;
    out.n = list.length;
    return out;
  }
  if (dirty) build(list);
  const store = out.store;
  const was = out.list === store ? out.n : 0;
  let n = 0;
  const rr = r + MARGIN;
  const x0 = cellOf(x - rr);
  const x1 = cellOf(x + rr);
  const z0 = cellOf(z - rr);
  const z1 = cellOf(z + rr);
  for (let cx = x0; cx <= x1; cx++) {
    for (let cz = z0; cz <= z1; cz++) {
      const run = cells.get(keyOf(cx, cz));
      if (!run) continue;
      const items = run.items;
      for (let i = 0; i < run.n; i++) store[n++] = items[i];
    }
  }
  // Let go of what the last answer held past this one.
  for (let i = n; i < was; i++) store[i] = undefined;
  out.list = store;
  out.n = n;
  return out;
}
