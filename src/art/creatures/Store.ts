/**
 * SLAY — baked creature meshes that survive a reload.
 *
 * Meshing a creature's fields costs tens to hundreds of milliseconds; reading
 * it back costs almost nothing. Baked meshes are kept in memory and mirrored
 * to IndexedDB under a key that hashes everything they were baked from, so a
 * changed sculpt never reads a stale mesh. A database of its own (not the
 * heroes'), so neither can crowd the other out. Every failure (no IndexedDB,
 * a private window, quota) just means baking again.
 */
import * as THREE from 'three';

/** Bump when the baker, painter or weights change in a way the key does not see. */
export const BAKE_VERSION = 9;

const DB = 'slay-creature-meshes';
const STORE = 'bakes';
const MAX_ENTRIES = 600;

interface RawAttr {
  array: Float32Array | Uint16Array | Uint32Array | Uint8Array;
  itemSize: number;
  normalized: boolean;
}
export interface RawGeo {
  attrs: Record<string, RawAttr>;
  index: Uint32Array | Uint16Array;
}

const memory = new Map<string, THREE.BufferGeometry[]>();
const stored = new Map<string, RawGeo[]>();
let db: IDBDatabase | null = null;

export function toRaw(g: THREE.BufferGeometry): RawGeo {
  const attrs: Record<string, RawAttr> = {};
  for (const [name, a] of Object.entries(g.attributes)) {
    const ba = a as THREE.BufferAttribute;
    attrs[name] = { array: ba.array as RawAttr['array'], itemSize: ba.itemSize, normalized: ba.normalized };
  }
  return { attrs, index: g.getIndex()!.array as Uint32Array };
}

export function fromRaw(r: RawGeo): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(r.attrs)) g.setAttribute(name, new THREE.BufferAttribute(a.array, a.itemSize, a.normalized));
  g.setIndex(new THREE.BufferAttribute(r.index, 1));
  g.computeBoundingSphere();
  return g;
}

function put(key: string, raw: RawGeo[]): void {
  if (!db) return;
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).put(raw, key);
  } catch {
    // Quota or a closed database: baked again next time.
  }
}

/** The baked parts for `key`, from memory, the stored cache, or `bake()`. Geometries are shared: never dispose them per instance. */
export function bakedCached(key: string, bake: () => THREE.BufferGeometry[]): THREE.BufferGeometry[] {
  const k = `${BAKE_VERSION}|${key}`;
  const hit = memory.get(k);
  if (hit) return hit;
  const raw = stored.get(k);
  if (raw) {
    stored.delete(k);
    try {
      const gs = raw.map(fromRaw);
      for (const g of gs) g.userData.cached = true;
      memory.set(k, gs);
      return gs;
    } catch {
      // A malformed record: bake it fresh.
    }
  }
  const gs = bake();
  for (const g of gs) g.userData.cached = true;
  memory.set(k, gs);
  put(k, gs.map(toRaw));
  return gs;
}

/**
 * Frees the GPU copies (between runs). The vertex arrays are kept as raw
 * records, so the next floor rebuilds them in microseconds, not by baking.
 */
export function releaseBakes(): void {
  for (const [k, gs] of memory) {
    stored.set(k, gs.map(toRaw));
    for (const g of gs) g.dispose();
  }
  memory.clear();
}

/**
 * Reads every stored bake into memory. Call once at boot; resolves (never
 * rejects) within a few seconds whatever happens.
 */
export function loadCreatureBakes(): Promise<void> {
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
            const vs = vals.result as RawGeo[][];
            const stale = ks.filter((k) => !k.startsWith(`${BAKE_VERSION}|`));
            if (ks.length > MAX_ENTRIES || stale.length > ks.length / 2) {
              try {
                db!.transaction(STORE, 'readwrite').objectStore(STORE).clear();
              } catch {
                /* ignore */
              }
            } else {
              ks.forEach((k, i) => {
                if (k.startsWith(`${BAKE_VERSION}|`)) stored.set(k, vs[i]!);
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
