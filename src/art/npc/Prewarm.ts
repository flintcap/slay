/**
 * SLAY — start meshing the townsfolk in a worker at boot (see FolkWorker.ts).
 *
 * Fire and forget. Where workers are not allowed (a strict page policy, an
 * old browser) nothing happens and the town meshes its residents as before.
 */
import { adoptMeshes, type RawGeo } from '../hero/MeshCache';
import { NPC_LOOK_IDS } from './Folk';

type Reply = { entries: Array<[string, RawGeo]>; id: string } | { done: true };

let started = false;

export function prewarmTownsfolk(): void {
  if (started || typeof Worker === 'undefined') return;
  started = true;
  let worker: Worker;
  try {
    worker = new Worker(new URL('./FolkWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return;
  }
  const stop = (): void => {
    try {
      worker.terminate();
    } catch {
      /* already gone */
    }
  };
  worker.onmessage = (e: MessageEvent<Reply>) => {
    const r = e.data;
    if ('done' in r) stop();
    else adoptMeshes(r.entries);
  };
  worker.onerror = stop;
  worker.postMessage({ ids: [...NPC_LOOK_IDS] });
}
