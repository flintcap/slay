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
 *   does, the fallback simply stays. Where the GPU reads BC7, a scan packed
 *   ahead (`usePackedTextures`) is loaded in its place.
 *
 * `preloadAssets` fetches and decodes a list of files ahead of time and reports
 * progress on the `assets:progress` event, which the boot bar and the loading
 * card both listen to.
 */

import * as THREE from 'three';
import { events } from './Events';
import { PACKED } from './Build';
import { tr } from './I18n';

const cache = new Map<string, Promise<ArrayBuffer | null>>();

/**
 * Where the page's files live. A relative base resolves against whoever
 * fetches, and a worker fetches from its own script folder (`assets/`), so
 * the worker is told the page's base (`setAssetBase`) before it loads art.
 */
let assetBase: string = import.meta.env.BASE_URL ?? './';

/** The page's base as a full URL, to hand to a worker. */
export function pageAssetBase(): string {
  return new URL(assetBase, document.baseURI).href;
}

/** Inside a worker: fetch from the page's base, not the worker's folder. */
export function setAssetBase(base: string): void {
  assetBase = base;
}

/** URL of a file under `public/assets/`, e.g. `assetUrl('sounds/hit_01.ogg')`. */
export function assetUrl(rel: string): string {
  return `${assetBase}assets/${rel.replace(/^\/+/, '')}`;
}

/**
 * Fetches a file once and shares the bytes. Resolves to `null` on any failure
 * so callers can fall back instead of throwing.
 */
export function fetchAsset(rel: string): Promise<ArrayBuffer | null> {
  const key = rel.replace(/^\/+/, '');
  let p = cache.get(key);
  if (!p) {
    p = packIndex().then((index) => {
      const entry = index?.[key];
      return entry ? fromPack(entry) : fetchLoose(key);
    });
    cache.set(key, p);
  }
  return p;
}

function fetchLoose(rel: string): Promise<ArrayBuffer | null> {
  return fetch(assetUrl(rel))
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .catch(() => null);
}

// ---------------------------------------------------------------------------
// Packs
// ---------------------------------------------------------------------------
//
// The published build folds most files into a few packs (the artifact host
// caps how many files one page may carry; see `tools/bundle-artifact.mjs`).
// `assets/packs.json` maps each file to [pack, offset, length]. Only that build
// has one (`PACKED`); every other build fetches each file loose.

type PackEntry = [pack: string, offset: number, length: number];

let indexPromise: Promise<Record<string, PackEntry> | null> | null = null;
const packs = new Map<string, Promise<ArrayBuffer | null>>();
/** Entries not yet sliced out of each pack; at zero the pack's bytes are let go. */
const packLeft = new Map<string, number>();

function packIndex(): Promise<Record<string, PackEntry> | null> {
  if (!indexPromise && !PACKED) indexPromise = Promise.resolve(null);
  if (!indexPromise) {
    indexPromise = fetch(assetUrl('packs.json'))
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, PackEntry>>) : null))
      .then((index) => {
        if (!index || typeof index !== 'object') return null;
        for (const [pack] of Object.values(index)) packLeft.set(pack, (packLeft.get(pack) ?? 0) + 1);
        return index;
      })
      .catch(() => null);
  }
  return indexPromise;
}

async function fromPack([pack, offset, length]: PackEntry): Promise<ArrayBuffer | null> {
  let p = packs.get(pack);
  if (!p) {
    p = fetchLoose(`packs/${pack}`);
    packs.set(pack, p);
  }
  const bytes = await p;
  const left = (packLeft.get(pack) ?? 1) - 1;
  packLeft.set(pack, left);
  if (left <= 0) packs.delete(pack);
  if (!bytes || offset + length > bytes.byteLength) return null;
  return bytes.slice(offset, offset + length);
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
// Packed textures
// ---------------------------------------------------------------------------
//
// `tools/pack-textures.mjs` packs the scans into BC7 blocks, KTX2 files under
// `ktx2/` beside `assets/`: a quarter of the video memory of the plain pixels
// a WebP decodes to, with every mip level made ahead instead of drawn on the
// GPU when the file lands. Used where the GPU reads BC7, for the files the
// packer's index lists; every other file, and every other GPU, gets the WebP.

/** One mip level of a packed texture: BC7 blocks. */
interface PackedLevel {
  data: Uint8Array;
  width: number;
  height: number;
}

interface PackedImage {
  width: number;
  height: number;
  mipmaps: PackedLevel[];
}

/** Files packed for the GPU in use, or null to load every file as it is. */
let packedFiles: ReadonlySet<string> | null = null;
const packedImages = new Map<string, Promise<PackedImage | null>>();

/**
 * Called once the renderer is open, before any texture is asked for: reads
 * the packer's index when the GPU reads BC7 (`texture-compression-bc`).
 * Returns how many files are packed. The published page has none (its art
 * travels in packs of the plain files, `tools/bundle-artifact.mjs`).
 */
export async function usePackedTextures(bc7: boolean): Promise<number> {
  packedFiles = null;
  if (!bc7 || PACKED) return 0;
  try {
    const r = await fetch(`${assetBase}ktx2/index.json`);
    const index = r.ok ? ((await r.json()) as { files?: Record<string, unknown> }) : null;
    if (index?.files && typeof index.files === 'object') packedFiles = new Set(Object.keys(index.files));
  } catch {
    /* no index: every file as it is */
  }
  return packedFiles?.size ?? 0;
}

const isPacked = (rel: string): boolean => !!packedFiles?.has(rel);

const VK_FORMAT_BC7_UNORM = 145;
const VK_FORMAT_BC7_SRGB = 146;
const KHR_SUPERCOMPRESSION_ZSTD = 2;

let zstd: Promise<{ decode(a: Uint8Array, size?: number): Uint8Array }> | null = null;

/**
 * Reads a KTX2 file of BC7 blocks, each level as written or squeezed with
 * zstd (the packer's). Null for anything else, so the WebP is used instead.
 */
async function readKtx2(bytes: ArrayBuffer): Promise<PackedImage | null> {
  const v = new DataView(bytes);
  // «KTX 20», then the header (KTX2 specification, section 3).
  if (bytes.byteLength < 80 || v.getUint32(0) !== 0xab4b5458 || v.getUint32(4) !== 0x203230bb) return null;
  const vkFormat = v.getUint32(12, true);
  const width = v.getUint32(20, true);
  const height = v.getUint32(24, true);
  const levelCount = Math.max(1, v.getUint32(40, true));
  const scheme = v.getUint32(44, true);
  if ((vkFormat !== VK_FORMAT_BC7_UNORM && vkFormat !== VK_FORMAT_BC7_SRGB) || (scheme !== 0 && scheme !== KHR_SUPERCOMPRESSION_ZSTD)) return null;
  if (bytes.byteLength < 80 + levelCount * 24) return null;
  if (scheme === KHR_SUPERCOMPRESSION_ZSTD && !zstd) {
    zstd = import('three/examples/jsm/libs/zstddec.module.js').then(async ({ ZSTDDecoder }) => {
      const d = new ZSTDDecoder();
      await d.init();
      return d;
    });
  }
  const unzip = scheme === KHR_SUPERCOMPRESSION_ZSTD ? await zstd! : null;
  const mipmaps: PackedLevel[] = [];
  for (let i = 0; i < levelCount; i++) {
    const at = 80 + i * 24;
    const offset = Number(v.getBigUint64(at, true));
    const length = Number(v.getBigUint64(at + 8, true));
    const size = Number(v.getBigUint64(at + 16, true));
    if (offset + length > bytes.byteLength) return null;
    const raw = new Uint8Array(bytes, offset, length);
    const w = Math.max(1, width >> i);
    const h = Math.max(1, height >> i);
    const data = unzip ? unzip.decode(raw, size) : raw.slice();
    if (data.byteLength !== Math.ceil(w / 4) * Math.ceil(h / 4) * 16) return null;
    mipmaps.push({ data, width: w, height: h });
  }
  return { width, height, mipmaps };
}

/** A packed file's levels, fetched and read once. Null if it is missing or unreadable. */
function loadPacked(rel: string): Promise<PackedImage | null> {
  let p = packedImages.get(rel);
  if (!p) {
    p = fetch(`${assetBase}ktx2/${rel.replace(/\.webp$/, '.ktx2')}`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((bytes) => (bytes ? readKtx2(bytes) : null))
      .catch(() => null)
      .then((img) => {
        if (!img) failed.add(rel);
        return img;
      });
    packedImages.set(rel, p);
  }
  return p;
}

/** One BC7 block (mode 6) of a flat colour, as a packed texture's stand-in. */
function flatBlock(color: number, alpha: number): Uint8Array {
  const out = new Uint8Array(16);
  let pos = 0;
  const put = (value: number, n: number): void => {
    for (let i = 0; i < n; i++, pos++) if ((value >> i) & 1) out[pos >> 3]! |= 1 << (pos & 7);
  };
  put(1 << 6, 7);
  const rgba = [(color >> 16) & 255, (color >> 8) & 255, color & 255, alpha];
  // Both ends the colour (7 bits, the shared low bit 0); every step 0.
  for (const c of rgba) {
    const q = Math.min(127, Math.round(c / 2));
    put(q, 7);
    put(q, 7);
  }
  return out;
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
  /** The sweep count when a scene last used it (`sweepAssetTextures`). */
  used: number;
  /** False once a sweep freed its GPU copy, until a scene uses it again. */
  gpu: boolean;
  /** Fetches the file and puts its pixels in the texture (what `loadTexture` started). */
  fill: () => Promise<boolean>;
  /** Puts the flat fallback back in place of the pixels. */
  flat: () => void;
  /** Its pixels were let go (`sweepAssetTextures`); the next use fetches them again. */
  evicted: boolean;
}

let sweeps = 0;
/**
 * Sweeps a texture stays unused before its pixels are let go too. A sweep is
 * a scene change, so four is two trips to the dungeon and back somewhere
 * else: a biome left behind gives back its memory, the town's stays.
 */
const KEEP_PIXELS = 4;

const textures = new Map<string, TexEntry>();
const entryOf = new WeakMap<THREE.Texture, TexEntry>();
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
  const g = c.getContext('2d', { willReadFrequently: true });
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
  if (hit) {
    revive(hit);
    return hit.tex;
  }

  const fb = opts.fallback ?? (opts.srgb ? 0x606060 : 0x8080ff);
  const fbAlpha = opts.fallbackAlpha ?? 255;
  const packed = isPacked(rel);
  const tex: THREE.Texture = packed
    ? new THREE.CompressedTexture([{ data: flatBlock(fb, fbAlpha), width: 4, height: 4 }] as never, 4, 4, THREE.RGBA_BPTC_Format)
    : new THREE.Texture<TexImageSource>(fallbackImage(fb, fbAlpha) ?? undefined);
  tex.name = `asset:${rel}`;
  tex.wrapS = tex.wrapT = opts.wrap ?? THREE.RepeatWrapping;
  tex.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = opts.anisotropy ?? defaultAnisotropy;
  tex.generateMipmaps = false;
  // Linear, not nearest: WebGPU binds no sampler to a nearest-only texture,
  // and shaders that sample with explicit gradients need one.
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.flipY = false;
  tex.userData.asset = rel;
  tex.userData.shared = true;
  tex.userData.loaded = false;
  tex.needsUpdate = true;

  // The fallback again, as made above, once the pixels are let go.
  const flat = (): void => {
    if (packed) {
      tex.image = { width: 4, height: 4 } as never;
      tex.mipmaps = [{ data: flatBlock(fb, fbAlpha), width: 4, height: 4 }] as never;
    } else {
      tex.image = fallbackImage(fb, fbAlpha) ?? undefined;
      tex.flipY = false;
      tex.generateMipmaps = false;
    }
    tex.minFilter = THREE.LinearFilter;
    tex.userData.loaded = false;
    tex.needsUpdate = true;
  };
  const fill = (): Promise<boolean> =>
    packed
      ? loadPacked(rel).then((img) => {
          if (!img) return false;
          // As below: storage at the real size, every level from the file.
          tex.dispose();
          tex.image = { width: img.width, height: img.height } as never;
          tex.mipmaps = img.mipmaps as never;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.userData.loaded = true;
          tex.needsUpdate = true;
          tex.dispatchEvent({ type: 'loaded' } as never);
          return true;
        })
      : loadImage(rel).then((img) => {
          if (!img) return false;
          // The renderer writes a new image into the texture's existing GPU
          // storage, which is still the 2 px fallback's size. Releasing it first
          // makes the next draw allocate storage at the real size, mips and all,
          // and rebind every material that samples it.
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
  const entry: TexEntry = { tex, ready: fill(), used: sweeps, gpu: true, fill, flat, evicted: false };
  textures.set(key, entry);
  entryOf.set(tex, entry);
  return tex;
}

/** Fetches an evicted texture's pixels again. */
function revive(e: TexEntry): void {
  if (!e.evicted) return;
  e.evicted = false;
  e.tex.onUpdate = null;
  // Asked for again: it counts as used, and its next upload is swept as any other.
  e.used = sweeps;
  e.gpu = true;
  e.ready = e.fill();
}

/**
 * Lets go of a texture's pixels: the decoded image (or packed levels) and
 * the file's bytes. The texture object stays, holding its flat fallback, as
 * materials keep it. It loads again when asked for (`loadTexture`), when a
 * scene that holds it is entered (`reviveAssetTextures`), or, failing both,
 * the first time it is drawn: the fallback shows for that moment.
 */
function evict(e: TexEntry): void {
  const rel = e.tex.userData.asset as string;
  e.evicted = true;
  e.flat();
  e.ready = Promise.resolve(false);
  e.tex.onUpdate = () => revive(e);
  images.delete(rel);
  packedImages.delete(rel);
  // The published build's files come out of shared packs: those bytes stay.
  if (!PACKED) cache.delete(rel);
}

/**
 * Before a scene's first frame: every evicted texture among `texes` (what
 * its materials sample) is fetched again, so the loading curtain waits for
 * it (`texturesSettled`). Returns how many were.
 */
export function reviveAssetTextures(texes: Iterable<THREE.Texture>): number {
  let n = 0;
  for (const t of texes) {
    const e = entryOf.get(t);
    if (e?.evicted) {
      revive(e);
      n++;
    }
  }
  return n;
}

/**
 * Between scenes: frees the GPU copy of every asset texture that neither the
 * new scene nor the one before it used. The texture and its decoded image
 * stay cached, so whatever still holds it draws it again after one upload.
 * A long session no longer keeps every biome's textures on the GPU (all of
 * them come to about 450 MB). One unused for `KEEP_PIXELS` scenes gives
 * back its pixels and file bytes too (`evict`): a biome left behind no
 * longer holds its memory for the rest of the session. Returns how many
 * gave back their GPU copy.
 */
export function sweepAssetTextures(inUse: ReadonlySet<THREE.Texture>): number {
  sweeps++;
  let freed = 0;
  for (const e of textures.values()) {
    if (inUse.has(e.tex)) {
      e.used = sweeps;
      e.gpu = true;
    } else if (e.gpu && e.used < sweeps - 1 && e.tex.userData.loaded) {
      e.tex.dispose();
      e.tex.needsUpdate = true;
      e.gpu = false;
      freed++;
    } else if (!e.gpu && !e.evicted && e.used < sweeps - KEEP_PIXELS && e.tex.userData.loaded) {
      evict(e);
    }
  }
  return freed;
}

/** Resolves true once the texture holds its real image, false if it never will. */
export function textureReady(tex: THREE.Texture): Promise<boolean> {
  for (const e of textures.values()) if (e.tex === tex) return e.ready;
  return Promise.resolve(!!tex.userData.loaded);
}

/**
 * Resolves once every texture asked for so far holds its image (or never
 * will), or after `ms`. A texture that lands after a scene's first frame is
 * uploaded, mipmaps and all, on whatever frame it is first drawn in; waiting
 * for them behind a loading curtain keeps those uploads off the play.
 *
 * With `only`, waits for those textures alone (a scene's own: one still
 * fetched for another biome does not hold its curtain). `onLanded(n, of)`
 * hears the count at the start (n = 0) and then each one arrive, for the loading bar.
 */
export function texturesSettled(ms: number, only?: Iterable<THREE.Texture>, onLanded?: (n: number, of: number) => void): Promise<void> {
  const waiting: Array<Promise<unknown>> = [];
  const pick = (e: TexEntry | undefined): void => {
    if (e && !e.tex.userData.loaded) waiting.push(e.ready);
  };
  if (only) for (const t of only) pick(entryOf.get(t));
  else for (const e of textures.values()) pick(e);
  if (!waiting.length) return Promise.resolve();
  onLanded?.(0, waiting.length);
  let n = 0;
  const all = Promise.allSettled(waiting.map((p) => p.finally(() => onLanded?.(++n, waiting.length)))).then(() => undefined);
  return Promise.race([all, new Promise<void>((r) => setTimeout(r, ms))]);
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
  packedImages.delete(rel);
  cache.delete(rel);
  void img?.then((i) => {
    if (i && 'close' in i) i.close();
  });
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
  label = tr('Loading'),
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
      const ok = isImage ? !!(await (isPacked(rel) ? loadPacked(rel) : loadImage(rel))) : !!(await fetchAsset(rel));
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

/**
 * Counts for the debug overlay and checkers. `packed` textures are held as
 * BC7; `videoMB` is what the loaded ones on the GPU take there, `plainMB`
 * what they would take as plain pixels (four bytes each, mips and all).
 * `evicted` ones hold their fallback until used again; `images` and `bytes`
 * are the decoded images and fetched files still held.
 */
export function assetStats(): {
  bytes: number;
  images: number;
  textures: number;
  loaded: number;
  evicted: number;
  packed: number;
  videoMB: number;
  plainMB: number;
  failed: string[];
} {
  let loaded = 0;
  let packed = 0;
  let video = 0;
  let plain = 0;
  let evicted = 0;
  for (const e of textures.values()) {
    if (e.evicted) evicted++;
    if (!e.tex.userData.loaded) continue;
    loaded++;
    const isPacked = !!(e.tex as THREE.CompressedTexture).isCompressedTexture;
    if (isPacked) packed++;
    // Video memory: only what is on the GPU now (`sweepAssetTextures`).
    if (!e.gpu) continue;
    const { width, height } = e.tex.image as { width: number; height: number };
    const full = (width * height * 4 * 4) / 3;
    plain += full;
    if (isPacked) {
      for (const m of e.tex.mipmaps as PackedLevel[]) video += m.data.byteLength;
    } else {
      video += full;
    }
  }
  const mb = (n: number): number => Math.round((n / 1048576) * 10) / 10;
  return {
    bytes: cache.size,
    images: images.size + packedImages.size,
    textures: textures.size,
    loaded,
    evicted,
    packed,
    videoMB: mb(video),
    plainMB: mb(plain),
    failed: Array.from(failed),
  };
}
