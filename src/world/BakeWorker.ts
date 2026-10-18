/**
 * SLAY — creature bodies and the hero's gear, meshed off the main thread.
 *
 * A map's monsters are baked from their sculpts the first time each look is
 * met (`art/creatures/Creature.ts`): tens to hundreds of milliseconds a look,
 * and a deep map meets twenty of them. Baked on the main thread inside the
 * floor build, that was one task of up to eight seconds with the page frozen.
 * Here the same code bakes them while the page builds the hero and the floor,
 * and posts each bake back (`BakePool.ts`), so the floor build reads it from
 * the bake store instead of baking.
 *
 * Hero jobs dress a hero in a character's own gear, so every part it wears is
 * meshed here and adopted into the hero mesh cache (as the townsfolk worker
 * does for residents).
 *
 * Both caches are opened here too, so a bake stored on an earlier visit is
 * read rather than baked. Anything that fails only means the page bakes it
 * itself, as before.
 */
import { lookFor } from '../art/creatures/Looks';
import { BOSSES, MONSTERS } from '../data/monsters';
import { getWarden } from '../data/wardens';
import { lookBake } from '../art/creatures/Creature';
import { bakedCached, loadCreatureBakes, toRaw, type RawGeo } from '../art/creatures/Store';
import { loadMeshCache, onMeshed, type RawGeo as PartRaw } from '../art/hero/MeshCache';
import { DressedHero } from '../scenes/HeroModel';
import { setAssetBase } from '../core/Assets';
import type { BakeJob, BakeReply } from './BakePool';

interface Scope {
  onmessage: ((e: MessageEvent<{ id: number; job: BakeJob; base?: string }>) => void) | null;
  postMessage(msg: BakeReply, transfer: Transferable[]): void;
}
const scope = self as unknown as Scope;

let parts: Array<[string, PartRaw]> = [];
onMeshed((key, raw) => parts.push([key, raw]));
const ready = Promise.all([loadCreatureBakes(), loadMeshCache()]);
/** Looks already sent back: their arrays moved to the page, so never sent twice. */
const sent = new Set<string>();

function run(job: BakeJob): Array<[string, RawGeo[]]> {
  if (job.kind === 'hero') {
    const hero = new DressedHero(job.classId, job.seed);
    hero.dress(job.equipment);
    hero.dispose();
    return [];
  }
  // The data's own visual object: looks are found by it.
  const def = job.from === 'boss' ? BOSSES.find((b) => b.id === job.id) : job.from === 'warden' ? getWarden(job.id) : MONSTERS.find((m) => m.id === job.id);
  if (!def) return [];
  const look = lookFor(def.visual, job.family, job.rank);
  if (sent.has(look.key)) return [];
  sent.add(look.key);
  const { key, bake } = lookBake(look);
  // Read from this worker's copy of the store when stored, baked otherwise.
  return [[key, bakedCached(key, bake).map(toRaw)]];
}

// Jobs arrive one at a time, the next only once this one is sent back.
scope.onmessage = (e) => {
  const { id, job, base } = e.data;
  if (base) setAssetBase(base);
  void ready.then(() => {
    let bakes: Array<[string, RawGeo[]]> = [];
    try {
      bakes = run(job);
    } catch {
      // The page bakes it itself.
    }
    const transfer: Transferable[] = [];
    for (const [, raws] of bakes) {
      for (const r of raws) {
        transfer.push(r.index.buffer);
        for (const a of Object.values(r.attrs)) transfer.push(a.array.buffer);
      }
    }
    for (const [, raw] of parts) {
      transfer.push(raw.index.buffer);
      for (const a of Object.values(raw.attrs)) transfer.push(a.array.buffer);
    }
    const msg: BakeReply = { id, bakes, parts };
    parts = [];
    try {
      scope.postMessage(msg, [...new Set(transfer)]);
    } catch {
      // A buffer could not move (shared with one sent before): copy instead.
      scope.postMessage(msg, []);
    }
  });
};
