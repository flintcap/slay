/**
 * Downloaded art and sound.
 *
 * The remake lifts the old "no asset files" rule for free (CC0) textures and
 * sounds. Files live under `public/assets/`, which Vite copies to the build
 * root, and every file is listed in `ASSETS.md` with its source and licence.
 * `tools/check-assets.mjs` keeps the folder and the ledger in step.
 *
 * Nothing in the game may depend on a file arriving: a missing or slow file
 * must fall back to something drawable or silent, never an error.
 *
 * Three layers, each usable on its own:
 *
 * - `assetUrl` / `fetchAsset`: raw bytes, fetched once and shared. Other
 *   streams rely on these two and their signatures never change.
 * - `loadImage`: a decoded image (ImageBitmap where the browser has it), cached.
 * - `loadTexture`: a `THREE.Texture` handed back at once with a flat fallback
 *   pixel in it. The real image is swapped in when it decodes; if it never
 *   does, the fallback simply stays.
 *
 * `preloadAssets` fetches and decodes a list of files ahead of time and reports
 * progress on the `assets:progress` event, which the boot bar and the loading
 * card both listen to.
 */

import * as THREE from 'three';
import { events } from './Events';

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

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export type DecodedImage = ImageBitmap | HTMLImageElement;

const images = new Map<string, Promise<DecodedImage | null>>();
/** Files that failed once. They are not retried this session. */
const failed = new Set<string>();

function mimeOf(rel: string): string {
  const ext = rel.slice(rel.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'webp') return 'image/webp';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

async function decode(rel: string, bytes: ArrayBuffer): Promise<DecodedImage | null> {
  const blob = new Blob([bytes], { type: mimeOf(rel) });
  if (typeof createImageBitmap === 'function') {
    try {
      // Flip here: three.js ignores `flipY` for ImageBitmaps, and OpenGL-style
      // normal maps (what Poly Haven and ambientCG ship) expect the flip.
      return await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    } catch {
      /* fall through to the element path */
    }
  }
  if (typeof Image === 'undefined' || typeof URL === 'undefined') return null;
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A decoded image, fetched and decoded once. `null` if it is missing or broken. */
export function loadImage(rel: string): Promise<DecodedImage | null> {
  let p = images.get(rel);
  if (!p) {
    p = fetchAsset(rel).then(async (bytes) => {
      const img = bytes ? await decode(rel, bytes) : null;
      if (!img) {
        failed.add(rel);
        // The raw bytes are useless now; let them go.
        cache.delete(rel);
      }
      return img;
    });
    images.set(rel, p);
  }
  return p;
}

// ---------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------

export interface AssetTextureOpts {
  /** Colour data (albedo) is sRGB; data maps (normal, roughness...) are linear. */
  srgb?: boolean;
  /** Fallback colour shown until the image arrives, or forever if it never does. */
  fallback?: number;
  /** Fallback alpha, 0..255. */
  fallbackAlpha?: number;
  wrap?: THREE.Wrapping;
  anisotropy?: number;
}

interface TexEntry {
  tex: THREE.Texture;
  ready: Promise<boolean>;
}

const textures = new Map<string, TexEntry>();
let defaultAnisotropy = 4;

/** Anisotropic filtering applied to every asset texture, now and later. */
export function setAssetAnisotropy(n: number): void {
  defaultAnisotropy = Math.max(1, n | 0);
  for (const e of textures.values()) {
    if (e.tex.anisotropy !== defaultAnisotropy) {
      e.tex.anisotropy = defaultAnisotropy;
      e.tex.needsUpdate = true;
    }
  }
}

function fallbackImage(color: number, alpha: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  // A canvas is a valid upload source for a plain Texture, so swapping in the
  // decoded image later is a simple `.image` assignment.
  const c = document.createElement('canvas');
  c.width = c.height = 2;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${alpha / 255})`;
    g.fillRect(0, 0, 2, 2);
  }
  return c;
}

/**
 * A texture for a file under `public/assets/`. Returned at once and shared per
 * (file, colour space). It starts as a one-pixel fallback; when the image
 * decodes it takes the real pixels and re-uploads. Treat it as shared: never
 * dispose it yourself (call `releaseAssetTexture` to evict).
 */
export function loadTexture(rel: string, opts: AssetTextureOpts = {}): THREE.Texture {
  const key = `${rel}|${opts.srgb ? 's' : 'l'}`;
  const hit = textures.get(key);
  if (hit) return hit.tex;

  const fb = opts.fallback ?? (opts.srgb ? 0x606060 : 0x8080ff);
  const tex: THREE.Texture<TexImageSource> = new THREE.Texture<TexImageSource>(fallbackImage(fb, opts.fallbackAlpha ?? 255) ?? undefined);
  tex.name = `asset:${rel}`;
  tex.wrapS = tex.wrapT = opts.wrap ?? THREE.RepeatWrapping;
  tex.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = opts.anisotropy ?? defaultAnisotropy;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.flipY = false;
  tex.userData.asset = rel;
  tex.userData.shared = true;
  tex.userData.loaded = false;
  tex.needsUpdate = true;

  const ready = loadImage(rel).then((img) => {
    if (!img) return false;
    // Drop the GPU copy of the fallback first: the real image is a different
    // size, and immutable texture storage cannot be resized in place.
    tex.dispose();
    tex.image = img;
    // An HTMLImageElement was not pre-flipped; ask the upload to do it.
    tex.flipY = !(typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap);
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.userData.loaded = true;
    tex.needsUpdate = true;
    tex.dispatchEvent({ type: 'loaded' } as never);
    return true;
  });
  textures.set(key, { tex, ready });
  return tex;
}

/** Resolves true once the texture holds its real image, false if it never will. */
export function textureReady(tex: THREE.Texture): Promise<boolean> {
  for (const e of textures.values()) if (e.tex === tex) return e.ready;
  return Promise.resolve(!!tex.userData.loaded);
}

/** Evicts a file's textures and decoded image. Materials still holding it keep the GPU copy until disposed. */
export function releaseAssetTexture(rel: string): void {
  for (const [k, e] of textures) {
    if (k.startsWith(`${rel}|`)) {
      e.tex.dispose();
      textures.delete(k);
    }
  }
  const img = images.get(rel);
  images.delete(rel);
  cache.delete(rel);
  void img?.then((i) => {
    if (i && 'close' in i) i.close();
  });
}

/** True when a file is known to be missing or undecodable this session. */
export function assetFailed(rel: string): boolean {
  return failed.has(rel);
}

// ---------------------------------------------------------------------------
// Preloading
// ---------------------------------------------------------------------------

let total = 0;
let done = 0;

function report(label: string): void {
  events.emit('assets:progress', { loaded: done, total, label });
}

/**
 * Fetches (and, for images, decodes) a list of files ahead of time. Progress
 * goes out on `assets:progress` and to `onProgress` (0..1). Never rejects:
 * missing files count as done. Several calls may overlap; the shared counters
 * cover all of them until everything in flight has landed.
 */
export async function preloadAssets(
  rels: string[],
  label = 'Loading',
  onProgress?: (p: number, label: string) => void,
): Promise<{ ok: number; missing: string[] }> {
  const list = Array.from(new Set(rels));
  if (!list.length) {
    onProgress?.(1, label);
    return { ok: 0, missing: [] };
  }
  total += list.length;
  let mine = 0;
  const missing: string[] = [];
  report(label);
  // A few at a time: enough to keep the pipe full without stalling the main
  // thread on a burst of decodes.
  const queue = list.slice();
  const worker = async (): Promise<void> => {
    for (;;) {
      const rel = queue.shift();
      if (!rel) return;
      const isImage = /\.(webp|png|jpe?g)$/i.test(rel);
      const ok = isImage ? !!(await loadImage(rel)) : !!(await fetchAsset(rel));
      if (!ok) missing.push(rel);
      done++;
      mine++;
      onProgress?.(mine / list.length, label);
      report(label);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (done >= total) {
    done = 0;
    total = 0;
  }
  return { ok: list.length - missing.length, missing };
}

/** Files still in flight across every preload call. */
export function assetsPending(): number {
  return Math.max(0, total - done);
}

/** Counts for the debug overlay and checkers. */
export function assetStats(): { bytes: number; images: number; textures: number; failed: number } {
  return { bytes: cache.size, images: images.size, textures: textures.size, failed: failed.size };
}
