/**
 * SLAY — a cache of meshed hero parts that survives a reload.
 *
 * Meshing a body costs seconds; reading it back costs milliseconds. Parts are
 * kept in memory and mirrored to IndexedDB under a key that hashes the field
 * they came from, so a changed body never reads a stale mesh. Every failure
 * (no IndexedDB, private window, quota) just means meshing again.
 */
import * as THREE from 'three';

/** Bump when the mesher, decimator, weights or painting change. */
export const MESH_VERSION = 1;

const DB = 'slay-hero-meshes';
const STORE = 'parts';
const MAX_ENTRIES = 400;

interface RawAttr {
  array: Float32Array | Uint16Array | Uint32Array;
  itemSize: number;
}
interface RawGeo {
  attrs: Record<string, RawAttr>;
  index: Uint32Array | Uint16Array;
}

const memory = new Map<string, THREE.BufferGeometry>();
const stored = new Map<string, RawGeo>();
let db: IDBDatabase | null = null;

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
  const hit = memory.get(k);
  if (hit) return hit;
  const raw = stored.get(k);
  if (raw) {
    stored.delete(k);
    const g = fromRaw(raw);
    memory.set(k, g);
    return g;
  }
  const g = build();
  memory.set(k, g);
  put(k, toRaw(g));
  return g;
}

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
