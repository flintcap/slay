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
 *
 * Several of these run side by side (see Prewarm.ts). The page hands each
 * one job at a time, a hero or a resident, so whatever a screen is waiting
 * on can be handed out next.
 */
import { loadMeshCache, onMeshed, type RawGeo } from '../hero/MeshCache';
import { buildFolk } from './Folk';
import { buildClassHero } from '../../scenes/HeroModel';
import type { CharClassId } from '../../types';
import { setAssetBase } from '../../core/Assets';

interface Scope {
  onmessage: ((e: MessageEvent<{ job: string; base?: string }>) => void) | null;
  postMessage(msg: unknown, transfer: Transferable[]): void;
}
const scope = self as unknown as Scope;

/** `hero:<class>` is a hero in its field kit; anything else a resident's look. */
function build(id: string): void {
  if (id.startsWith('hero:')) buildClassHero(id.slice(5) as CharClassId).dispose();
  else buildFolk(id);
}

let batch: Array<[string, RawGeo]> = [];
onMeshed((key, raw) => batch.push([key, raw]));
const ready = loadMeshCache();

// Jobs arrive one at a time, the next only once this one is sent back.
scope.onmessage = (e) => {
  if (e.data.base) setAssetBase(e.data.base);
  const id = e.data.job;
  void ready.then(() => {
    try {
      build(id);
    } catch {
      // The screen that needs it builds it itself.
    }
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
  });
};
