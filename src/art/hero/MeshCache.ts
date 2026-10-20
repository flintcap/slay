/**
 * SLAY — a cache of meshed hero parts that survives a reload.
 *
 * Meshing a body costs seconds; reading it back costs milliseconds. Parts are
 * kept in memory and mirrored to IndexedDB under a key that hashes the field
 * they came from, so a changed body never reads a stale mesh. Every failure
 * (no IndexedDB, private window, quota) just means meshing again.
 *
 * The bodies a first launch needs come with the game, meshed when it was
 * built (`loadShippedMeshes`, `tools/build-meshes.mjs`).
 */
import * as THREE from 'three';
import { events } from '../../core/Events';

/** Bump when the mesher, decimator, weights or painting change. */
export const MESH_VERSION = 7;

const DB = 'slay-hero-meshes';
const STORE = 'parts';
const MAX_ENTRIES = 400;

interface RawAttr {
  array: Float32Array | Uint16Array | Uint32Array;
  itemSize: number;
}
/** A meshed part as plain arrays: what IndexedDB stores and a worker posts. */
export interface RawGeo {
  attrs: Record<string, RawAttr>;
  index: Uint32Array | Uint16Array;
}

const memory = new Map<string, THREE.BufferGeometry>();
const stored = new Map<string, RawGeo>();
/** Parts that came with the game: kept for the whole session, never swept. */
const shipped = new Map<string, RawGeo>();
/** Where each part asked for came from, for the load checks. */
const tally = { shipped: 0, stored: 0, meshed: 0 };
/** Scene count at each in-memory part's last use (`sweepMeshCache`). */
const lastUse = new Map<string, number>();
let scenes = 0;
let db: IDBDatabase | null = null;
/** Told about every part meshed here (the town prewarm worker collects them). */
let meshed: ((key: string, raw: RawGeo) => void) | null = null;

/** Watch every part this context meshes, or stop with null. */
export function onMeshed(fn: ((key: string, raw: RawGeo) => void) | null): void {
  meshed = fn;
}

/**
 * Parts meshed elsewhere (a worker) join the stored cache, so the next build
 * that needs one reads it instead of meshing. Parts already here are skipped.
 */
export function adoptMeshes(entries: ReadonlyArray<readonly [string, RawGeo]>): void {
  for (const [k, raw] of entries) if (!memory.has(k) && !stored.has(k) && !shipped.has(k)) stored.set(k, raw);
}

function toRaw(g: THREE.BufferGeometry): RawGeo {
  const attrs: Record<string, RawAttr> = {};
  for (const [name, a] of Object.entries(g.attributes)) {
    attrs[name] = { array: (a as THREE.BufferAttribute).array as RawAttr['array'], itemSize: a.itemSize };
  }
  return { attrs, index: g.getIndex()!.array as Uint32Array };
}

function fromRaw(r: RawGeo): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(r.attrs)) g.setAttribute(name, new THREE.BufferAttribute(a.array, a.itemSize));
  g.setIndex(new THREE.BufferAttribute(r.index, 1));
  g.computeBoundingSphere();
  return g;
}

function put(key: string, raw: RawGeo): void {
  if (!db) return;
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).put(raw, key);
  } catch {
    // Quota or a closed database: the part is meshed again next time.
  }
}

/** The part for `key`, from memory, the stored cache, or `build()`. */
export function meshCached(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  const k = `${MESH_VERSION}|${key}`;
  lastUse.set(k, scenes);
  const hit = memory.get(k);
  if (hit) return hit;
  const raw = stored.get(k);
  if (raw) {
    stored.delete(k);
    const g = fromRaw(raw);
    g.userData.cached = true;
    memory.set(k, g);
    tally.stored++;
    return g;
  }
  const ship = shipped.get(k);
  if (ship) {
    const g = fromRaw(ship);
    g.userData.cached = true;
    memory.set(k, g);
    tally.shipped++;
    return g;
  }
  tally.meshed++;
  const g = build();
  // Shared by every hero that uses it: disposers leave it alone.
  g.userData.cached = true;
  memory.set(k, g);
  const fresh = toRaw(g);
  put(k, fresh);
  meshed?.(k, fresh);
  return g;
}

/**
 * After each scene change: a part no hero built in the last two scenes gives
 * back its GPU buffers and goes back to the stored list as plain arrays, so
 * the next hero that needs it reads it again in milliseconds. Every piece of
 * gear ever worn used to stay on the GPU for the whole session. The stored
 * list keeps the newest MAX_ENTRIES; the rest are still in IndexedDB.
 */
export function sweepMeshCache(): void {
  scenes++;
  for (const [k, g] of memory) {
    if ((lastUse.get(k) ?? 0) >= scenes - 2) continue;
    memory.delete(k);
    lastUse.delete(k);
    // A shipped part is still in its own list.
    if (!shipped.has(k)) stored.set(k, toRaw(g));
    g.dispose();
  }
  for (const k of stored.keys()) {
    if (stored.size <= MAX_ENTRIES) break;
    stored.delete(k);
  }
}
events.on('scene:change', sweepMeshCache);

/**
 * Reads every stored part into memory. Call once at boot before heroes are
 * built; resolves (never rejects) within a few seconds whatever happens.
 */
export function loadMeshCache(): Promise<void> {
  if (db || typeof indexedDB === 'undefined') return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(resolve, 4000);
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onerror = done;
      req.onblocked = done;
      req.onsuccess = () => {
        db = req.result;
        try {
          const tx = db.transaction(STORE, 'readwrite');
          const st = tx.objectStore(STORE);
          const keys = st.getAllKeys();
          const vals = st.getAll();
          tx.oncomplete = () => {
            const ks = keys.result as string[];
            const vs = vals.result as RawGeo[];
            if (ks.length > MAX_ENTRIES) {
              // Old shapes pile up as bodies change; start over.
              try {
                db!.transaction(STORE, 'readwrite').objectStore(STORE).clear();
              } catch {
                /* ignore */
              }
            } else {
              ks.forEach((k, i) => {
                if (k.startsWith(`${MESH_VERSION}|`)) stored.set(k, vs[i]);
              });
            }
            done();
          };
          tx.onerror = done;
          tx.onabort = done;
        } catch {
          done();
        }
      };
    } catch {
      done();
    }
  });
}

const ARRAYS = { Float32Array, Uint16Array, Uint32Array } as const;

interface ShippedHeader {
  version: number;
  jobs: string[];
  parts: Array<{
    key: string;
    attrs: Array<{ name: string; itemSize: number; type: string; offset: number; bytes: number }>;
    index: { type: string; offset: number; bytes: number };
  }>;
}

/**
 * Reads the parts that come with the game (`url`, made by
 * `tools/build-meshes.mjs`): the select-screen heroes, each class as a new
 * character, the shapeshifter's beasts and the townsfolk, meshed when the
 * game was built by this same code under the same keys. A first launch reads
 * them instead of meshing them for tens of seconds.
 *
 * Resolves to the town prewarm jobs the file covers (`art/npc/Prewarm.ts`),
 * empty when it is missing, from another mesh version or unreadable: then
 * everything is meshed as before. Never rejects.
 */
export async function loadShippedMeshes(url: string): Promise<ReadonlySet<string>> {
  try {
    const res = await fetch(url);
    if (!res.ok || !res.body) return new Set();
    const buf = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (new TextDecoder().decode(bytes.subarray(0, 8)) !== 'SLAYMESH') return new Set();
    const len = new DataView(buf).getUint32(8, true);
    const header = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + len))) as ShippedHeader;
    if (header.version !== MESH_VERSION) return new Set();
    const at = (12 + len + 3) & ~3;
    // Each array gets its own buffer, as one read from IndexedDB has: a
    // worker may be handed one, and handing over a shared one would empty
    // every other part.
    const array = (type: string, offset: number, n: number): RawAttr['array'] | null => {
      const Ctor = ARRAYS[type as keyof typeof ARRAYS];
      return Ctor ? new Ctor(buf.slice(at + offset, at + offset + n)) : null;
    };
    for (const p of header.parts) {
      const index = array(p.index.type, p.index.offset, p.index.bytes);
      if (!index || index instanceof Float32Array) continue;
      const attrs: Record<string, RawAttr> = {};
      let whole = true;
      for (const a of p.attrs) {
        const arr = array(a.type, a.offset, a.bytes);
        if (!arr) whole = false;
        else attrs[a.name] = { array: arr, itemSize: a.itemSize };
      }
      if (whole) shipped.set(p.key, { attrs, index });
    }
    return new Set(header.jobs);
  } catch {
    return new Set();
  }
}

/** How many parts came with the game, and where every part asked for so far came from. */
export function meshCacheStats(): { shipped: number; fromShipped: number; fromStored: number; meshed: number } {
  return { shipped: shipped.size, fromShipped: tally.shipped, fromStored: tally.stored, meshed: tally.meshed };
}
