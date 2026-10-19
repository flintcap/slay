/**
 * SLAY — a cache of meshed hero parts that survives a reload.
 *
 * Meshing a body costs seconds; reading it back costs milliseconds. Parts are
 * kept in memory and mirrored to IndexedDB under a key that hashes the field
 * they came from, so a changed body never reads a stale mesh. Every failure
 * (no IndexedDB, private window, quota) just means meshing again.
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
  for (const [k, raw] of entries) if (!memory.has(k) && !stored.has(k)) stored.set(k, raw);
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
    return g;
  }
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
    stored.set(k, toRaw(g));
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
