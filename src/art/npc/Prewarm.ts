/**
 * SLAY — start meshing the select-screen heroes and the townsfolk in a
 * worker at boot (see FolkWorker.ts).
 *
 * Fire and forget. Where workers are not allowed (a strict page policy, an
 * old browser) nothing happens and the town meshes its residents as before.
 */
import { adoptMeshes, type RawGeo } from '../hero/MeshCache';
import { NPC_LOOK_IDS } from './Folk';
import { CLASSES } from '../../data/classes';

type Reply = { entries: Array<[string, RawGeo]>; id: string } | { done: true };

let started = false;
let worker: Worker | null = null;
/** Jobs the worker has been given and not yet sent back, with who waits on each. */
const pending = new Map<string, Array<() => void>>();

function settle(id: string): void {
  const waiters = pending.get(id);
  pending.delete(id);
  if (waiters) for (const w of waiters) w();
}

function settleAll(): void {
  for (const id of [...pending.keys()]) settle(id);
}

export function prewarmTownsfolk(): void {
  if (started || typeof Worker === 'undefined') return;
  started = true;
  let w: Worker;
  try {
    w = new Worker(new URL('./FolkWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return;
  }
  worker = w;
  const stop = (): void => {
    worker = null;
    try {
      w.terminate();
    } catch {
      /* already gone */
    }
    // Nothing more is coming: whoever waits builds it themselves.
    settleAll();
  };
  w.onmessage = (e: MessageEvent<Reply>) => {
    const r = e.data;
    if ('done' in r) stop();
    else {
      adoptMeshes(r.entries);
      settle(r.id);
    }
  };
  w.onerror = stop;
  // The select screen comes before the town and shows every class in turn,
  // starting with the first: mesh those heroes first, in that order. Each one
  // used to be meshed on the main thread the moment its card was picked, a
  // freeze of seconds per class on a first visit.
  const heroes = CLASSES.map((c) => c.id as string);
  for (const id of [...heroes.map((h) => `hero:${h}`), ...NPC_LOOK_IDS]) pending.set(id, []);
  w.postMessage({ ids: [...NPC_LOOK_IDS], heroes });
}

/**
 * Resolves once the worker has sent back the hero for `classId`, at once if
 * it already has (or there is no worker), and after `capMs` whatever happens.
 *
 * A screen about to build that hero waits here instead of meshing it a second
 * time on the main thread, which froze the page for seconds while the worker
 * was already half way through the same body. Asking moves the hero to the
 * front of the worker's queue.
 */
export function heroMeshed(classId: string, capMs = 20000): Promise<void> {
  const id = `hero:${classId}`;
  const waiters = pending.get(id);
  if (!waiters || !worker) return Promise.resolve();
  try {
    worker.postMessage({ first: id });
  } catch {
    /* the worker is gone; the cap below still lets the build go ahead */
  }
  return new Promise<void>((resolve) => {
    const t = setTimeout(resolve, capMs);
    waiters.push(() => {
      clearTimeout(t);
      resolve();
    });
  });
}
