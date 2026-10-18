/**
 * SLAY — hands creature bakes and hero dressing to workers (`BakeWorker.ts`).
 *
 * A scene about to build a floor asks for every look it will meet
 * (`bakeLooks`) and the hero it will dress (`meshHero`), then builds what it
 * can on the main thread while the workers bake, and waits for the bakes
 * only when it reaches the monsters. Each bake that comes back joins the bake
 * store (`bakedCached`) and each hero part the hero mesh cache, so the build
 * reads them instead of baking: the same code and the same result, minus the
 * frozen page.
 *
 * Workers start on the first request and stay for the session. A few run side
 * by side, one job each at a time, handed out in the order asked, so the
 * first floor's looks go before later floors'. Where workers are not allowed,
 * or one fails, every waiter is let go at once and the page bakes as before.
 */
import type { CharClassId, EquipSlot, Item } from '../types';
import { bakedCached, fromRaw, type RawGeo } from '../art/creatures/Store';
import { adoptMeshes, type RawGeo as PartRaw } from '../art/hero/MeshCache';
import { pageAssetBase } from '../core/Assets';

/** One piece of work for a worker. */
export type BakeJob =
  | ({ kind: 'creature' } & LookAsk)
  | { kind: 'hero'; classId: CharClassId; seed: number; equipment: Partial<Record<EquipSlot, Item | null>> };
/** What a worker sends back for one job. */
export interface BakeReply {
  id: number;
  bakes: Array<[string, RawGeo[]]>;
  parts: Array<[string, PartRaw]>;
}

/** What the workers have done this session (read by the load checker). */
export const bakeStats = { workers: 0, jobs: 0, replies: 0, bakes: 0, parts: 0, failed: 0 };

/** The page keeps a core of its own; a few workers are plenty. */
const MAX_WORKERS = 3;

let tried = false;
/** Workers alive, each with the job id it is on (null when free). */
const workers = new Map<Worker, number | null>();
const queue: Array<{ id: number; job: BakeJob }> = [];
/** Jobs not yet answered, with who waits on each. */
const waiting = new Map<number, Array<() => void>>();
/** Looks already asked for (by monster and family), so each is baked once. */
const asked = new Map<string, number>();
let nextId = 1;
let base = '';

function settle(id: number): void {
  const w = waiting.get(id);
  waiting.delete(id);
  if (w) for (const f of w) f();
}

/** Stops a worker; its job and, with none left, every queued job are let go. */
function drop(w: Worker): void {
  const job = workers.get(w);
  workers.delete(w);
  bakeStats.failed++;
  try {
    w.terminate();
  } catch {
    /* already gone */
  }
  if (job != null) settle(job);
  if (workers.size === 0) {
    for (const q of queue.splice(0)) settle(q.id);
  }
}

function handOut(): void {
  for (const [w, job] of workers) {
    if (job !== null) continue;
    const next = queue.shift();
    if (!next) return;
    workers.set(w, next.id);
    try {
      w.postMessage({ id: next.id, job: next.job, base });
    } catch {
      drop(w);
    }
  }
}

function start(): boolean {
  if (tried) return workers.size > 0;
  tried = true;
  if (typeof Worker === 'undefined') return false;
  base = pageAssetBase();
  const n = Math.max(1, Math.min(MAX_WORKERS, (navigator.hardwareConcurrency || 2) - 1));
  for (let i = 0; i < n; i++) {
    let w: Worker;
    try {
      w = new Worker(new URL('./BakeWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      break;
    }
    workers.set(w, null);
    w.onmessage = (e: MessageEvent<BakeReply>) => {
      const { id, bakes, parts } = e.data;
      bakeStats.replies++;
      bakeStats.bakes += bakes.length;
      bakeStats.parts += parts.length;
      try {
        for (const [key, raws] of bakes) bakedCached(key, () => raws.map(fromRaw));
        if (parts.length) adoptMeshes(parts);
      } catch {
        // A malformed reply: the page bakes those itself.
      }
      workers.set(w, null);
      settle(id);
      handOut();
    };
    w.onerror = () => drop(w);
  }
  bakeStats.workers = workers.size;
  return workers.size > 0;
}

function submit(job: BakeJob): number {
  const id = nextId++;
  bakeStats.jobs++;
  waiting.set(id, []);
  queue.push({ id, job });
  handOut();
  return id;
}

/** Resolves once every job in `ids` is answered, or after `capMs`. */
function whenDone(ids: number[], capMs: number): Promise<void> {
  const left = ids.filter((id) => waiting.has(id));
  if (left.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let n = left.length;
    const t = setTimeout(resolve, capMs);
    for (const id of left) {
      waiting.get(id)!.push(() => {
        if (--n > 0) return;
        clearTimeout(t);
        resolve();
      });
    }
  });
}

/**
 * A look to bake: which monster, boss or warden (by id: looks are found by
 * the data's own visual object, which a copy sent to a worker is not), its
 * family and the rank it is first met at.
 */
export interface LookAsk {
  from: 'monster' | 'boss' | 'warden';
  id: string;
  family?: string;
  rank?: string;
}

/**
 * Lets go of every look not yet handed to a worker (a new run starts: the
 * last run's later floors are not coming). Their waiters resolve at once.
 */
export function dropQueuedLooks(): void {
  for (let i = queue.length - 1; i >= 0; i--) {
    const q = queue[i]!;
    if (q.job.kind !== 'creature') continue;
    queue.splice(i, 1);
    for (const [k, id] of asked) if (id === q.id) asked.delete(k);
    settle(q.id);
  }
}

/**
 * Asks the workers to bake these looks, in this order: after anything asked
 * before, or with `urgent` (a build is waiting on them) before anything not
 * yet handed out. The promise resolves when they are all in the bake store,
 * or at `capMs`, or at once without workers. Looks asked for earlier are not
 * baked again; their first request is waited on instead.
 */
export function bakeLooks(list: readonly LookAsk[], urgent = false, capMs = 45000): Promise<void> {
  if (!start()) return Promise.resolve();
  const ids: number[] = [];
  for (const a of list) {
    const k = `${a.from}:${a.id}|${a.family ?? ''}`;
    let id = asked.get(k);
    if (id === undefined) {
      id = submit({ kind: 'creature', ...a });
      asked.set(k, id);
    }
    ids.push(id);
  }
  if (urgent) {
    const want = new Set(ids);
    const front = queue.filter((q) => want.has(q.id));
    const rest = queue.filter((q) => !want.has(q.id));
    queue.splice(0, queue.length, ...front, ...rest);
  }
  return whenDone(ids, capMs);
}

/**
 * Asks a worker to dress a hero in `equipment`, so every part it wears is
 * meshed there. Resolves once the parts are in the hero mesh cache, or at
 * `capMs`, or at once without workers.
 */
export function meshHero(classId: CharClassId, seed: number, equipment: Partial<Record<EquipSlot, Item | null>>, capMs = 30000): Promise<void> {
  if (!start()) return Promise.resolve();
  return whenDone([submit({ kind: 'hero', classId, seed, equipment })], capMs);
}
