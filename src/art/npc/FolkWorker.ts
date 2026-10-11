/**
 * SLAY — the townsfolk, meshed off the main thread.
 *
 * A cold first visit to town meshes nine residents: tens of seconds of
 * surface nets and decimation that used to freeze the page on arrival. This
 * worker builds the same residents from the same code while the player is
 * still on the title and select screens, and posts every part it meshes back
 * (`adoptMeshes`), so the town's own build reads them from the cache.
 *
 * It also opens the IndexedDB cache itself, so parts stored on an earlier
 * visit are read rather than meshed again, and new ones are stored for the
 * next visit. Anything that fails here only means the town meshes it itself.
 */
import { loadMeshCache, onMeshed, type RawGeo } from '../hero/MeshCache';
import { buildFolk } from './Folk';

interface Scope {
  onmessage: ((e: MessageEvent<{ ids: string[] }>) => void) | null;
  postMessage(msg: unknown, transfer: Transferable[]): void;
}
const scope = self as unknown as Scope;

scope.onmessage = async (e) => {
  await loadMeshCache();
  let batch: Array<[string, RawGeo]> = [];
  onMeshed((key, raw) => batch.push([key, raw]));
  for (const id of e.data.ids) {
    try {
      buildFolk(id);
    } catch {
      // The town builds this one itself.
    }
    // One resident at a time, so a town entered half way through still gains.
    const transfer: Transferable[] = [];
    for (const [, raw] of batch) {
      transfer.push(raw.index.buffer);
      for (const a of Object.values(raw.attrs)) transfer.push(a.array.buffer);
    }
    try {
      scope.postMessage({ entries: batch, id }, [...new Set(transfer)]);
    } catch {
      // A buffer could not move (shared with a part sent before): copy instead.
      scope.postMessage({ entries: batch, id }, []);
    }
    batch = [];
  }
  scope.postMessage({ done: true }, []);
};
