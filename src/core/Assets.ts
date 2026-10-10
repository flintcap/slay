/**
 * Downloaded art and sound.
 *
 * The remake lifts the old "no asset files" rule for free (CC0) textures and
 * sounds. Files live under `public/assets/`, which Vite copies to the build
 * root, and every file is listed in `ASSETS.md` with its source and licence.
 *
 * Nothing in the game may depend on a file arriving: a missing or slow file
 * must fall back to something drawable or silent, never an error.
 *
 * The `ground` stream grows this into the full preloader (progress on the
 * loading screen, texture decode, cache limits). Other streams only need the
 * two functions below and must not change their signatures.
 */

const cache = new Map<string, Promise<ArrayBuffer | null>>();

/** URL of a file under `public/assets/`, e.g. `assetUrl('sounds/hit_01.ogg')`. */
export function assetUrl(rel: string): string {
  const base = import.meta.env.BASE_URL ?? './';
  return `${base}assets/${rel.replace(/^\/+/, '')}`;
}

/**
 * Fetches a file once and shares the bytes. Resolves to `null` on any failure
 * so callers can fall back instead of throwing.
 */
export function fetchAsset(rel: string): Promise<ArrayBuffer | null> {
  let p = cache.get(rel);
  if (!p) {
    p = fetch(assetUrl(rel))
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
    cache.set(rel, p);
  }
  return p;
}
