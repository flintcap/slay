/**
 * SLAY — start meshing the select-screen heroes and the townsfolk in
 * workers at boot (see FolkWorker.ts).
 *
 * Fire and forget. Where workers are not allowed (a strict page policy)
 * nothing happens and the town meshes its residents as before.
 *
 * One worker meshed them all one after another: on a cold first visit the
 * town waited half a minute behind its curtain for the last resident. Now a
 * few run side by side, one job each at a time, handed out from one list
 * here, so whatever a screen is waiting on goes to the next worker free.
 */
import { adoptMeshes, type RawGeo } from '../hero/MeshCache';
import { NPC_LOOK_IDS } from './Folk';
import { CLASSES } from '../../data/classes';
import { pageAssetBase } from '../../core/Assets';

type Reply = { entries: Array<[string, RawGeo]>; id: string };

/** Workers to run: the page keeps a core of its own, and a few are plenty. */
const MAX_WORKERS = 4;

let started = false;
/** Workers alive, each with the job it is on (null when free). */
const workers = new Map<Worker, string | null>();
/** Jobs not handed out yet, in order. */
let queue: string[] = [];
/** Where the workers load textures from. */
let base = '';
/** Jobs not yet sent back, with who waits on each. */
const pending = new Map<string, Array<() => void>>();

function settle(id: string): void {
  const waiters = pending.get(id);
  pending.delete(id);
  if (waiters) for (const w of waiters) w();
}

/** Gives every free worker the next job, or lets it go if none are left. */
function handOut(): void {
  for (const [w, job] of workers) {
    if (job !== null) continue;
    const next = queue.shift();
    if (next === undefined) {
      drop(w);
      continue;
    }
    workers.set(w, next);
    try {
      w.postMessage({ job: next, base });
    } catch {
      drop(w);
    }
  }
}

/** Stops a worker. Its job, if any, is left to whoever waits on it. */
function drop(w: Worker): void {
  const job = workers.get(w);
  workers.delete(w);
  try {
    w.terminate();
  } catch {
    /* already gone */
  }
  if (job) settle(job);
  // Nothing more is coming: whoever waits builds it themselves.
  if (workers.size === 0) {
    for (const id of queue) settle(id);
    queue = [];
  }
}

export function prewarmTownsfolk(): void {
  if (started || typeof Worker === 'undefined') return;
  started = true;
  // The select screen comes before the town and shows every class in turn,
  // starting with the first: those heroes go first, in that order. Each one
  // used to be meshed on the main thread the moment its card was picked, a
  // freeze of seconds per class on a first visit.
  queue = [...CLASSES.map((c) => `hero:${c.id}`), ...NPC_LOOK_IDS];
  for (const id of queue) pending.set(id, []);
  const n = Math.max(1, Math.min(MAX_WORKERS, (navigator.hardwareConcurrency || 2) - 1));
  base = pageAssetBase();
  for (let i = 0; i < n; i++) {
    let w: Worker;
    try {
      w = new Worker(new URL('./FolkWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      break;
    }
    workers.set(w, null);
    w.onmessage = (e: MessageEvent<Reply>) => {
      adoptMeshes(e.data.entries);
      workers.set(w, null);
      settle(e.data.id);
      handOut();
    };
    w.onerror = () => drop(w);
  }
  if (workers.size === 0) {
    for (const id of queue) settle(id);
    queue = [];
    return;
  }
  handOut();
}

/** Moves a job not handed out yet to the front of the list. */
function first(id: string): void {
  const i = queue.indexOf(id);
  if (i > 0) queue.unshift(...queue.splice(i, 1));
}

/**
 * Resolves once a worker has sent back the hero for `classId`, at once if
 * it already has (or there are no workers), and after `capMs` whatever happens.
 *
 * A screen about to build that hero waits here instead of meshing it a second
 * time on the main thread, which froze the page for seconds while the worker
 * was already half way through the same body. Asking moves the hero to the
 * front of the list.
 */
export function heroMeshed(classId: string, capMs = 20000): Promise<void> {
  const id = `hero:${classId}`;
  const waiters = pending.get(id);
  if (!waiters) return Promise.resolve();
  first(id);
  return new Promise<void>((resolve) => {
    const t = setTimeout(resolve, capMs);
    waiters.push(() => {
      clearTimeout(t);
      resolve();
    });
  });
}

/**
 * Resolves once the workers have sent back every townsfolk body, after
 * `capMs` at most. The town waits here behind its curtain: building them itself meshed the same nine residents a second time
 * on the main thread, the longest freeze of a first visit. They move to the
 * front of the list.
 */
export function folkMeshed(capMs = 60000): Promise<void> {
  const left = NPC_LOOK_IDS.filter((id) => pending.has(id));
  if (left.length === 0) return Promise.resolve();
  // Last moved goes first: move them in reverse to keep their order.
  for (let i = left.length - 1; i >= 0; i--) first(left[i]);
  return new Promise<void>((resolve) => {
    let n = left.length;
    const t = setTimeout(resolve, capMs);
    for (const id of left) {
      pending.get(id)!.push(() => {
        if (--n > 0) return;
        clearTimeout(t);
        resolve();
      });
    }
  });
}
