/**
 * Procedural inventory and skill icons.
 *
 * Everything is drawn to a canvas at generation time and cached as a data URI.
 * No image files, no icon fonts — the game ships zero assets.
 *
 * Item icons are driven by the base's authored `visual` block (shape family,
 * palette, ornateness) so a gold sceptre and an iron mace do not share art, and
 * rarity escalates visibly: trim, then gem settings, then a glowing rim.
 *
 * Skill icons encode what the skill *does*: the motif comes from the effect
 * handler (a burst, a beam, a forked bolt) and the colour language from the
 * damage type, so a fire nova and a cold nova read as siblings while a fire
 * nova and a fire beam read as different abilities.
 */
import type { Item, ItemRarity, DamageType } from '../types';
import { paintItemIcon } from './ItemIconArt';

// ---------------------------------------------------------------------------
// Small deterministic RNG — icons must be stable across sessions.
// ---------------------------------------------------------------------------

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function makeRng(seed: number): () => number {
  let h = seed >>> 0 || 1;
  return () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

interface Swatch {
  /** Deepest shadow value. */
  dark: string;
  /** Mid / body value. */
  base: string;
  /** Lit value. */
  light: string;
  /** Specular hit. */
  spec: string;
  /** Secondary material (grip wrap, leather strap, wood haft). */
  accent: string;
  /** True for hard specular streaks; false for a soft diffuse roll. */
  metallic: boolean;
}

function sw(dark: string, base: string, light: string, spec: string, accent: string, metallic = true): Swatch {
  return { dark, base, light, spec, accent, metallic };
}

/**
 * Material swatches keyed by palette name. Values stay inside the physically
 * plausible albedo band — pure black or pure white kills the read at 32px.
 */
const SWATCHES: Record<string, Swatch> = {
  'metal.iron': sw('#2b2f36', '#5a626e', '#8e97a4', '#d6dde6', '#3d3229'),
  'metal.steel': sw('#333a45', '#6b7686', '#a3aebd', '#e8eef6', '#3a3027'),
  'metal.bronze': sw('#43301a', '#8a6033', '#c08b4a', '#f0cf92', '#3a2d1d'),
  'metal.gold': sw('#5c4310', '#b48a24', '#e3bb4c', '#fff0b0', '#4a3a12'),
  'metal.rusted': sw('#33221a', '#6d4630', '#9a6a45', '#c99a6c', '#2e2620'),
  'metal.dark': sw('#17191f', '#33383f', '#565d68', '#8e97a4', '#241f1c'),
  'metal.silver': sw('#39414c', '#7b8797', '#b6c2d0', '#f2f7ff', '#3a3027'),
  'wood.oak': sw('#2e2115', '#6b4a2c', '#95693f', '#c19566', '#4a3524', false),
  'wood.rotted': sw('#241f18', '#4a4232', '#6b6048', '#8d8064', '#332c22', false),
  'wood.charred': sw('#16130f', '#2e2822', '#4a4038', '#6a5c50', '#241d18', false),
  'wood.polished': sw('#33200f', '#7a4a20', '#a76b34', '#d19b5e', '#4a3018', false),
  'cloth.linen': sw('#3a3428', '#7d7360', '#a89c85', '#cfc4ad', '#544a3a', false),
  'cloth.silk': sw('#33283a', '#6c5a7d', '#9384a8', '#c0b3d2', '#463a52', false),
  'cloth.tattered': sw('#2a2620', '#5b5344', '#7d7461', '#9c9481', '#3d372c', false),
  'cloth.banner': sw('#3d1a1a', '#7e3030', '#a84a44', '#d07a६8'.replace('६', '6'), '#4a2320', false),
  'leather.worn': sw('#241a12', '#553c26', '#7a583a', '#9d7a55', '#3a2a1c', false),
  'leather.studded': sw('#1f1811', '#493422', '#6b4d33', '#8e6c4c', '#5a626e', false),
  'leather.fine': sw('#2a1d14', '#603f28', '#8a5e3d', '#b0825a', '#b48a24', false),
  'crystal.void': sw('#20143a', '#4a2a86', '#7d4fc4', '#c39dff', '#2a1a4a', false),
  'crystal.ice': sw('#153044', '#2f6f95', '#63a8c9', '#c2ecff', '#1d3d52', false),
  'crystal.arcane': sw('#3a1436', '#8a2a7a', '#c052ab', '#ffaee8', '#4a1a44', false),
  'bone.pale': sw('#3b352a', '#8e8571', '#bdb49c', '#e8e0c8', '#4a4336', false),
  'flesh.rotted': sw('#2a2a1e', '#5c6040', '#83885c', '#a8ac7e', '#3a2a2a', false),
};

/** Resolve a palette key to a swatch, falling back on its family. */
function swatchFor(palette: string | undefined): Swatch {
  if (!palette) return SWATCHES['metal.steel']!;
  const key = palette.split('|')[0]!.trim();
  if (SWATCHES[key]) return SWATCHES[key]!;
  const family = key.split('.')[0];
  for (const k of Object.keys(SWATCHES)) {
    if (k.startsWith(family + '.')) return SWATCHES[k]!;
  }
  return SWATCHES['metal.steel']!;
}

function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function rgba(hex: number, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function hexStr(hex: number): string {
  return '#' + hex.toString(16).padStart(6, '0');
}

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

const S = 128; // internal draw resolution

function newCanvas(size = S): { c: HTMLCanvasElement; x: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const x = c.getContext('2d')!;
  x.imageSmoothingEnabled = true;
  return { c, x };
}

/**
 * One canvas, reused for every icon.
 *
 * A fresh `<canvas>` per icon means a fresh backing store per icon, and an
 * inventory is a hundred of them in a row. Setting `width` is also the
 * documented way to clear a canvas, so the reset is free.
 */
let scratch: { c: HTMLCanvasElement; x: CanvasRenderingContext2D } | null = null;

function scratchCanvas(): { c: HTMLCanvasElement; x: CanvasRenderingContext2D } {
  if (!scratch) scratch = newCanvas();
  else scratch.c.width = S;
  return scratch;
}

/**
 * Light comes from the top-left, consistently across every icon. A shared light
 * direction is most of what makes a set of icons look like a set.
 */
function shade(
  x: CanvasRenderingContext2D,
  s: Swatch,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): CanvasGradient {
  const g = x.createLinearGradient(x0, y0, x1, y1);
  if (s.metallic) {
    // Metal: dark, quick ramp to a hard specular streak, then falls away.
    g.addColorStop(0.0, s.dark);
    g.addColorStop(0.22, s.base);
    g.addColorStop(0.44, s.spec);
    g.addColorStop(0.52, s.light);
    g.addColorStop(0.78, s.base);
    g.addColorStop(1.0, s.dark);
  } else {
    // Non-metal: soft diffuse roll, no mirror highlight.
    g.addColorStop(0.0, s.dark);
    g.addColorStop(0.35, s.base);
    g.addColorStop(0.62, s.light);
    g.addColorStop(1.0, s.dark);
  }
  return g;
}

function poly(x: CanvasRenderingContext2D, pts: Array<[number, number]>): void {
  x.beginPath();
  x.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) x.lineTo(pts[i]![0], pts[i]![1]);
  x.closePath();
}

/** Fills a shape and gives it a darker contact edge rather than a black outline. */
function fillShape(x: CanvasRenderingContext2D, s: Swatch, grad: CanvasGradient | string): void {
  x.fillStyle = grad;
  x.fill();
  x.strokeStyle = s.dark;
  x.lineWidth = 2;
  x.stroke();
}

/** Wood grain / cloth weave — breaks up flat fills on non-metals. */
function grain(x: CanvasRenderingContext2D, s: Swatch, rnd: () => number, n = 7): void {
  x.save();
  x.clip();
  x.globalAlpha = 0.18;
  x.strokeStyle = s.dark;
  x.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    const px = 20 + rnd() * 88;
    x.beginPath();
    x.moveTo(px, 0);
    x.bezierCurveTo(px + rnd() * 8 - 4, 40, px + rnd() * 8 - 4, 88, px + rnd() * 6 - 3, 128);
    x.stroke();
  }
  x.restore();
  x.globalAlpha = 1;
}

function gemAt(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, colour: number): void {
  const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, rgba(colour, 0.95));
  g.addColorStop(1, rgba(colour, 0.55));
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.fillStyle = g;
  x.fill();
  x.strokeStyle = 'rgba(0,0,0,.45)';
  x.lineWidth = 1.4;
  x.stroke();
}

// Item icons are painted by ./ItemIconArt (families in IconWeapons, IconArmor, IconTrinkets).
export { potionColor } from './IconTrinkets';

// ---------------------------------------------------------------------------
// Public: item icons
// ---------------------------------------------------------------------------

const itemCache = new Map<string, string>();

/** Resolver injected at boot so this module needn't depend on the item sim. */
let baseLookup: ((baseId: string) => { visual?: { shape?: string; palette?: string; ornate?: number; glow?: number }; category?: string } | undefined) | null = null;

export function setIconBaseResolver(fn: typeof baseLookup): void {
  baseLookup = fn;
  generation++;
  encoding.clear();
  itemCache.clear();
  // Anything queued was queued against the old art. Drop it rather than let a
  // stale icon land in a slot a frame later.
  pending.clear();
  listeners.clear();
}

/** The properties that actually change an item's art. */
function iconKeyFor(item: Item): string {
  // Uniques and set pieces share a base with plain drops but not a picture.
  return `${item.baseId}|${item.rarity}|${item.uniqueId ?? item.setId ?? ''}`;
}

/** A cached icon, or null if it has not been drawn yet. */
export function cachedItemIcon(item: Item): string | null {
  return itemCache.get(iconKeyFor(item)) ?? null;
}

/** A fully transparent 1x1, so a slot waiting on its icon renders as empty. */
const BLANK =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// ---------------------------------------------------------------------------
// Deferred icon generation
// ---------------------------------------------------------------------------

/**
 * Icons are drawn a few at a time, off the frame that asked for them.
 *
 * Drawing one is a canvas render plus a PNG encode, and opening a full pack is
 * a hundred of those back to back — enough to lock the window for most of a
 * second the first time you press I. Nothing about that work needs to happen
 * before the panel appears, so it doesn't: the grid renders immediately with
 * blank slots and each icon drops in as it is drawn.
 */
const pending = new Map<string, Item>();
const listeners = new Map<string, Array<(uri: string) => void>>();
/** Keys painted and waiting on the browser's PNG encoder. */
const encoding = new Set<string>();
/** Bumped whenever the caches are dropped, so a late encode cannot land stale art. */
let generation = 0;
let pumping = 0;

/** How long per frame to spend drawing icons. Roughly a third of a frame. */
const ICON_BUDGET_MS = 5;

function deliver(key: string, uri: string): void {
  const waiting = listeners.get(key);
  if (!waiting) return;
  listeners.delete(key);
  for (const fn of waiting) fn(uri);
}

/**
 * Paints now, encodes later. The PNG encode is as expensive as the painting,
 * and `toBlob` does it off the main thread, so the frame only pays for the
 * brushwork.
 */
function drawItemIconAsync(item: Item, key: string): void {
  const gen = generation;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const x = c.getContext('2d')!;
  paintItemIcon(x, { baseId: item.baseId, rarity: item.rarity, base: baseLookup?.(item.baseId), identity: item.uniqueId ?? item.setId });
  if (typeof c.toBlob !== 'function' || typeof URL?.createObjectURL !== 'function') {
    const uri = c.toDataURL('image/png');
    itemCache.set(key, uri);
    deliver(key, uri);
    return;
  }
  encoding.add(key);
  c.toBlob((blob) => {
    encoding.delete(key);
    if (gen !== generation) return;
    // A synchronous draw may have beaten the encoder to it; keep that one.
    let uri = itemCache.get(key);
    if (!uri) {
      uri = blob ? URL.createObjectURL(blob) : c.toDataURL('image/png');
      itemCache.set(key, uri);
    }
    deliver(key, uri);
  }, 'image/png');
}

function pump(): void {
  pumping = 0;
  const t0 = performance.now();
  for (const [key, item] of pending) {
    pending.delete(key);
    if (itemCache.has(key)) {
      deliver(key, itemCache.get(key)!);
      continue;
    }
    drawItemIconAsync(item, key);
    if (performance.now() - t0 > ICON_BUDGET_MS) break;
  }
  if (pending.size > 0) schedulePump();
}

function schedulePump(): void {
  if (pumping) return;
  pumping = requestAnimationFrame(pump);
}

/**
 * The icon for an item, drawn later if it is not already cached.
 *
 * Returns the cached URI when there is one — the common case once a pack has
 * been opened once — and otherwise a blank, calling `onReady` when the real one
 * is available. Callers that genuinely cannot wait (a drag ghost, which must
 * exist the instant the pointer moves) should use `itemIconUri`.
 */
export function requestItemIcon(item: Item, onReady: (uri: string) => void): string {
  const key = iconKeyFor(item);
  const hit = itemCache.get(key);
  if (hit) return hit;
  if (!encoding.has(key)) pending.set(key, item);
  let waiting = listeners.get(key);
  if (!waiting) {
    waiting = [];
    listeners.set(key, waiting);
  }
  waiting.push(onReady);
  schedulePump();
  return BLANK;
}

/**
 * Queues icons for items the player is holding, so they are already drawn by
 * the time the pack is opened. Costs nothing when they are all cached.
 */
export function warmItemIcons(items: Iterable<Item | null>): void {
  for (const item of items) {
    if (!item) continue;
    const key = iconKeyFor(item);
    if (itemCache.has(key) || pending.has(key) || encoding.has(key)) continue;
    pending.set(key, item);
  }
  if (pending.size > 0) schedulePump();
}

/**
 * Returns a data-URI icon for an item, drawing it now if it is not cached.
 * Prefer `requestItemIcon` anywhere a blank frame is acceptable.
 */
export function itemIconUri(item: Item): string {
  const key = iconKeyFor(item);
  const hit = itemCache.get(key);
  if (hit) return hit;
  return drawItemIcon(item, key);
}

function drawItemIcon(item: Item, key: string): string {
  const base = baseLookup?.(item.baseId);
  const { c, x } = scratchCanvas();
  paintItemIcon(x, {
    baseId: item.baseId,
    rarity: item.rarity,
    base,
    identity: item.uniqueId ?? item.setId,
  });
  const uri = c.toDataURL('image/png');
  itemCache.set(key, uri);
  return uri;
}

// ---------------------------------------------------------------------------
// Public: skill icons
// ---------------------------------------------------------------------------

interface Element {
  core: number;
  glow: number;
  dark: number;
}

const ELEMENT: Record<DamageType, Element> = {
  physical: { core: 0xf0e6d2, glow: 0xa8b0bd, dark: 0x3a3f47 },
  fire: { core: 0xffd27a, glow: 0xff6a22, dark: 0x5a1a08 },
  cold: { core: 0xdff4ff, glow: 0x59b8ff, dark: 0x0e3350 },
  lightning: { core: 0xf2e6ff, glow: 0xa46bff, dark: 0x2a1450 },
  poison: { core: 0xdcffa8, glow: 0x76d43a, dark: 0x1e3a10 },
  arcane: { core: 0xffd8f4, glow: 0xff5ad0, dark: 0x4a0e3c },
};

function glowStroke(x: CanvasRenderingContext2D, e: Element, w: number): void {
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.shadowColor = rgba(e.glow, 0.9);
  x.shadowBlur = 14;
  x.strokeStyle = rgba(e.glow, 0.95);
  x.lineWidth = w;
  x.stroke();
  x.shadowBlur = 0;
  x.strokeStyle = rgba(e.core, 0.95);
  x.lineWidth = Math.max(1.4, w * 0.42);
  x.stroke();
}

type Motif = (x: CanvasRenderingContext2D, e: Element, rnd: () => number) => void;

const MOTIFS: Record<string, Motif> = {
  // A pair of sweeping slashes.
  melee: (x, e) => {
    for (const [o, w] of [[0, 8], [16, 5]] as const) {
      x.beginPath();
      x.moveTo(28 + o, 26);
      x.quadraticCurveTo(104, 52, 40 + o, 104);
      glowStroke(x, e, w);
    }
  },
  cleave: (x, e) => {
    x.beginPath();
    x.moveTo(20, 40);
    x.quadraticCurveTo(64, 96, 108, 40);
    glowStroke(x, e, 9);
    x.beginPath();
    x.moveTo(30, 30);
    x.quadraticCurveTo(64, 78, 98, 30);
    glowStroke(x, e, 4.5);
  },
  whirlwind: (x, e) => {
    x.beginPath();
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      const a = t * Math.PI * 4.2;
      const r = 8 + t * 46;
      const px = 64 + Math.cos(a) * r;
      const py = 64 + Math.sin(a) * r * 0.82;
      if (i === 0) x.moveTo(px, py);
      else x.lineTo(px, py);
    }
    glowStroke(x, e, 7);
  },
  projectile: (x, e) => {
    // Comet head with a tapering tail.
    const g = x.createRadialGradient(84, 50, 2, 84, 50, 24);
    g.addColorStop(0, rgba(e.core, 1));
    g.addColorStop(0.4, rgba(e.glow, 0.9));
    g.addColorStop(1, rgba(e.glow, 0));
    x.fillStyle = g;
    x.beginPath();
    x.arc(84, 50, 24, 0, Math.PI * 2);
    x.fill();
    x.beginPath();
    x.moveTo(74, 60);
    x.quadraticCurveTo(44, 78, 20, 100);
    glowStroke(x, e, 8);
    x.beginPath();
    x.moveTo(80, 66);
    x.quadraticCurveTo(56, 84, 34, 104);
    glowStroke(x, e, 4);
  },
  nova: (x, e) => {
    for (const [r, w] of [[46, 7], [30, 5], [15, 4]] as const) {
      x.beginPath();
      x.arc(64, 64, r, 0, Math.PI * 2);
      glowStroke(x, e, w);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      x.beginPath();
      x.moveTo(64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48);
      x.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60);
      glowStroke(x, e, 4);
    }
  },
  slam: (x, e) => {
    // Impact point with radiating cracks.
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      x.beginPath();
      x.moveTo(64, 70);
      const mx = 64 + Math.cos(a) * 26;
      const my = 70 + Math.sin(a) * 20;
      x.lineTo(mx, my);
      x.lineTo(64 + Math.cos(a + 0.16) * 50, 70 + Math.sin(a + 0.16) * 38);
      glowStroke(x, e, 5);
    }
    x.beginPath();
    x.ellipse(64, 70, 12, 9, 0, 0, Math.PI * 2);
    x.fillStyle = rgba(e.core, 0.9);
    x.shadowColor = rgba(e.glow, 1);
    x.shadowBlur = 18;
    x.fill();
    x.shadowBlur = 0;
  },
  meteor: (x, e) => {
    const g = x.createRadialGradient(80, 46, 3, 80, 46, 26);
    g.addColorStop(0, rgba(e.core, 1));
    g.addColorStop(0.45, rgba(e.glow, 0.95));
    g.addColorStop(1, rgba(e.glow, 0));
    x.fillStyle = g;
    x.beginPath();
    x.arc(80, 46, 26, 0, Math.PI * 2);
    x.fill();
    for (const o of [0, 10, -8]) {
      x.beginPath();
      x.moveTo(66 + o, 60);
      x.lineTo(30 + o, 108);
      glowStroke(x, e, 5);
    }
    x.beginPath();
    x.ellipse(40, 112, 30, 7, 0, 0, Math.PI);
    glowStroke(x, e, 4);
  },
  beam: (x, e) => {
    const g = x.createLinearGradient(16, 64, 116, 64);
    g.addColorStop(0, rgba(e.glow, 0.15));
    g.addColorStop(0.5, rgba(e.core, 0.95));
    g.addColorStop(1, rgba(e.glow, 0.2));
    x.fillStyle = g;
    x.shadowColor = rgba(e.glow, 1);
    x.shadowBlur = 16;
    x.fillRect(14, 56, 100, 16);
    x.shadowBlur = 0;
    x.fillStyle = rgba(e.core, 1);
    x.fillRect(14, 61, 100, 6);
    for (const px of [26, 104]) {
      x.beginPath();
      x.arc(px, 64, 9, 0, Math.PI * 2);
      x.fillStyle = rgba(e.core, 0.9);
      x.fill();
    }
  },
  cone: (x, e) => {
    poly(x, [[22, 64], [104, 26], [104, 102]]);
    const g = x.createLinearGradient(22, 64, 104, 64);
    g.addColorStop(0, rgba(e.core, 0.9));
    g.addColorStop(1, rgba(e.glow, 0.12));
    x.fillStyle = g;
    x.shadowColor = rgba(e.glow, 0.9);
    x.shadowBlur = 14;
    x.fill();
    x.shadowBlur = 0;
    for (let i = 0; i < 3; i++) {
      x.beginPath();
      x.moveTo(46 + i * 20, 40 + i * 6);
      x.lineTo(46 + i * 20, 88 - i * 6);
      glowStroke(x, e, 3);
    }
  },
  chain: (x, e, rnd) => {
    let px = 18;
    let py = 30;
    x.beginPath();
    x.moveTo(px, py);
    for (let i = 0; i < 6; i++) {
      px += 16 + rnd() * 6;
      py = 30 + (i % 2 === 0 ? 44 : -6) + rnd() * 22;
      x.lineTo(px, py);
    }
    glowStroke(x, e, 7);
    // A fork partway along sells the "chains between targets" read.
    x.beginPath();
    x.moveTo(64, 58);
    x.lineTo(78, 96);
    x.lineTo(96, 84);
    glowStroke(x, e, 4.5);
  },
  dash: (x, e) => {
    for (let i = 0; i < 4; i++) {
      const y = 40 + i * 14;
      const len = 70 - Math.abs(i - 1.5) * 16;
      x.beginPath();
      x.moveTo(24, y);
      x.lineTo(24 + len, y);
      glowStroke(x, e, 6 - i * 0.6);
    }
    poly(x, [[100, 46], [120, 64], [100, 82]]);
    x.fillStyle = rgba(e.core, 0.95);
    x.shadowColor = rgba(e.glow, 1);
    x.shadowBlur = 16;
    x.fill();
    x.shadowBlur = 0;
  },
  buff: (x, e) => {
    for (let i = 0; i < 3; i++) {
      const y = 92 - i * 24;
      x.beginPath();
      x.moveTo(38, y);
      x.lineTo(64, y - 20);
      x.lineTo(90, y);
      glowStroke(x, e, 7 - i);
    }
  },
  // --- families the skill data actually uses -----------------------------
  strike: (x, e) => {
    // A single committed thrust.
    x.beginPath();
    x.moveTo(24, 104);
    x.lineTo(100, 28);
    glowStroke(x, e, 10);
    poly(x, [[104, 24], [110, 46], [88, 40]]);
    x.fillStyle = rgba(e.core, 0.95);
    x.shadowColor = rgba(e.glow, 1);
    x.shadowBlur = 14;
    x.fill();
    x.shadowBlur = 0;
  },
  heavy: (x, e) => {
    // Overhead smash: a steep arc into a hard stop.
    x.beginPath();
    x.moveTo(30, 20);
    x.quadraticCurveTo(96, 40, 74, 96);
    glowStroke(x, e, 12);
    x.beginPath();
    x.ellipse(70, 104, 30, 8, 0, 0, Math.PI * 2);
    x.fillStyle = rgba(e.glow, 0.5);
    x.fill();
  },
  ground: (x, e) => {
    // A field on the floor: ellipse plus rising wisps.
    x.beginPath();
    x.ellipse(64, 86, 44, 18, 0, 0, Math.PI * 2);
    glowStroke(x, e, 7);
    x.beginPath();
    x.ellipse(64, 86, 26, 10, 0, 0, Math.PI * 2);
    glowStroke(x, e, 4);
    for (let i = 0; i < 4; i++) {
      const px = 36 + i * 19;
      x.beginPath();
      x.moveTo(px, 78);
      x.quadraticCurveTo(px + (i % 2 ? 9 : -9), 54, px, 32);
      glowStroke(x, e, 4);
    }
  },
  cloud: (x, e, rnd) => {
    for (let i = 0; i < 6; i++) {
      const cx = 36 + rnd() * 56;
      const cy = 44 + rnd() * 40;
      const r = 12 + rnd() * 14;
      const g = x.createRadialGradient(cx, cy, 1, cx, cy, r);
      g.addColorStop(0, rgba(e.core, 0.5));
      g.addColorStop(1, rgba(e.glow, 0));
      x.fillStyle = g;
      x.beginPath();
      x.arc(cx, cy, r, 0, Math.PI * 2);
      x.fill();
    }
    x.beginPath();
    x.ellipse(64, 70, 38, 22, 0, 0, Math.PI * 2);
    glowStroke(x, e, 4);
  },
  aura: (x, e) => {
    // Radiating field centred on the caster.
    for (const [r, w, a] of [[20, 6, 1], [34, 4.5, 0.75], [48, 3.5, 0.5]] as const) {
      x.beginPath();
      x.arc(64, 64, r, 0, Math.PI * 2);
      x.shadowColor = rgba(e.glow, a);
      x.shadowBlur = 12;
      x.strokeStyle = rgba(e.glow, a);
      x.lineWidth = w;
      x.stroke();
      x.shadowBlur = 0;
    }
    x.beginPath();
    x.arc(64, 64, 9, 0, Math.PI * 2);
    x.fillStyle = rgba(e.core, 0.95);
    x.fill();
  },
  summon: (x, e) => {
    // A skull over a summoning ring.
    x.beginPath();
    x.ellipse(64, 84, 34, 12, 0, 0, Math.PI * 2);
    glowStroke(x, e, 5);
    x.beginPath();
    x.moveTo(46, 66);
    x.quadraticCurveTo(46, 34, 64, 34);
    x.quadraticCurveTo(82, 34, 82, 66);
    x.lineTo(76, 76);
    x.lineTo(52, 76);
    x.closePath();
    x.fillStyle = rgba(e.core, 0.9);
    x.shadowColor = rgba(e.glow, 0.9);
    x.shadowBlur = 14;
    x.fill();
    x.shadowBlur = 0;
    x.fillStyle = 'rgba(0,0,0,.75)';
    x.beginPath();
    x.arc(56, 58, 6, 0, Math.PI * 2);
    x.arc(72, 58, 6, 0, Math.PI * 2);
    x.fill();
    x.fillRect(60, 68, 8, 8);
  },
  curse: (x, e) => {
    // Downward-pointing sigil: the visual opposite of a buff.
    for (let i = 0; i < 3; i++) {
      const y = 36 + i * 24;
      x.beginPath();
      x.moveTo(38, y);
      x.lineTo(64, y + 20);
      x.lineTo(90, y);
      glowStroke(x, e, 7 - i);
    }
    x.beginPath();
    x.arc(64, 30, 7, 0, Math.PI * 2);
    x.fillStyle = rgba(e.core, 0.9);
    x.fill();
  },
  shout: (x, e) => {
    // Expanding sound arcs from a point on the left.
    for (let i = 0; i < 4; i++) {
      x.beginPath();
      x.arc(34, 64, 16 + i * 16, -0.85, 0.85);
      glowStroke(x, e, 6 - i * 0.9);
    }
    x.beginPath();
    x.arc(30, 64, 9, 0, Math.PI * 2);
    x.fillStyle = rgba(e.core, 0.95);
    x.fill();
  },
  channel: (x, e) => {
    // A sustained stream with pulses travelling along it.
    x.beginPath();
    x.moveTo(22, 92);
    x.quadraticCurveTo(64, 76, 106, 34);
    glowStroke(x, e, 9);
    for (const t of [0.3, 0.55, 0.8]) {
      const px = 22 + (106 - 22) * t;
      const py = 92 - (92 - 34) * t * t;
      x.beginPath();
      x.arc(px, py, 6 - t * 2, 0, Math.PI * 2);
      x.fillStyle = rgba(e.core, 0.9);
      x.fill();
    }
  },
  teleport: (x, e) => {
    // Fading out on the left, arriving on the right.
    for (let i = 0; i < 3; i++) {
      x.globalAlpha = 0.25 + i * 0.1;
      x.beginPath();
      x.ellipse(34 + i * 6, 64, 12, 26, 0, 0, Math.PI * 2);
      x.strokeStyle = rgba(e.glow, 0.9);
      x.lineWidth = 3;
      x.stroke();
    }
    x.globalAlpha = 1;
    x.beginPath();
    x.ellipse(94, 64, 14, 30, 0, 0, Math.PI * 2);
    glowStroke(x, e, 6);
    for (let i = 0; i < 5; i++) {
      x.beginPath();
      x.arc(58 + i * 8, 64 + (i % 2 ? -8 : 8), 2.4, 0, Math.PI * 2);
      x.fillStyle = rgba(e.core, 0.8);
      x.fill();
    }
  },
  wave: (x, e) => {
    // A travelling front.
    for (let i = 0; i < 3; i++) {
      x.beginPath();
      x.moveTo(30 + i * 18, 22);
      x.quadraticCurveTo(58 + i * 18, 64, 30 + i * 18, 106);
      glowStroke(x, e, 8 - i * 1.6);
    }
  },
  leap: (x, e) => {
    // An arc from a launch point to a landing crater.
    x.beginPath();
    x.moveTo(22, 100);
    x.quadraticCurveTo(64, 12, 104, 92);
    glowStroke(x, e, 7);
    x.beginPath();
    x.ellipse(104, 100, 20, 7, 0, 0, Math.PI * 2);
    x.fillStyle = rgba(e.glow, 0.55);
    x.fill();
    for (let i = 0; i < 4; i++) {
      const a = Math.PI + (i / 3) * Math.PI;
      x.beginPath();
      x.moveTo(104, 98);
      x.lineTo(104 + Math.cos(a) * 26, 98 + Math.sin(a) * 14);
      glowStroke(x, e, 3);
    }
  },
  detonate: (x, e, rnd) => {
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 46);
    g.addColorStop(0, rgba(e.core, 1));
    g.addColorStop(0.45, rgba(e.glow, 0.8));
    g.addColorStop(1, rgba(e.glow, 0));
    x.fillStyle = g;
    x.beginPath();
    x.arc(64, 64, 46, 0, Math.PI * 2);
    x.fill();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rnd() * 0.2;
      x.beginPath();
      x.moveTo(64 + Math.cos(a) * 18, 64 + Math.sin(a) * 18);
      x.lineTo(64 + Math.cos(a) * (44 + rnd() * 14), 64 + Math.sin(a) * (44 + rnd() * 14));
      glowStroke(x, e, 4);
    }
  },
  capstone: (x, e, rnd) => {
    // Deliberately the most ornate icon in the tree — these change how a class
    // is played, and should look like it.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 === 0 ? 52 : 30;
      x.beginPath();
      x.moveTo(64, 64);
      x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
      glowStroke(x, e, i % 2 === 0 ? 6 : 3.5);
    }
    x.beginPath();
    x.arc(64, 64, 22, 0, Math.PI * 2);
    glowStroke(x, e, 5);
    const g = x.createRadialGradient(64, 64, 2, 64, 64, 20);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.4, rgba(e.core, 0.95));
    g.addColorStop(1, rgba(e.glow, 0.1));
    x.fillStyle = g;
    x.beginPath();
    x.arc(64, 64, 20, 0, Math.PI * 2);
    x.fill();
    void rnd;
  },
  heal: (x, e) => {
    x.beginPath();
    x.moveTo(64, 30);
    x.lineTo(64, 98);
    x.moveTo(34, 64);
    x.lineTo(94, 64);
    glowStroke(x, e, 12);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.7;
      const px = 64 + Math.cos(a) * 44;
      const py = 64 + Math.sin(a) * 44;
      x.beginPath();
      x.arc(px, py, 3.2, 0, Math.PI * 2);
      x.fillStyle = rgba(e.core, 0.9);
      x.fill();
    }
  },
};

/**
 * Effect id → motif. The skill data uses dotted family ids ('melee.strike',
 * 'ground.cloud'), so resolve the specific sub-type first, then the family,
 * then a small alias table. Collapsing everything to one fallback is what made
 * a whole tree look like the same icon repeated.
 */
/**
 * Rotates an element palette by a per-skill amount, keeping it inside its own
 * family so a cold skill never comes out orange.
 */
function tintElement(e: Element, seed: number): Element {
  const shift = (((seed >>> 5) % 21) - 10) / 100;
  const rot = (hex: number): number => {
    const r = ((hex >> 16) & 255) / 255;
    const g = ((hex >> 8) & 255) / 255;
    const b = (hex & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) return hex;
    const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h =
      max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h / 6 + shift + 1) % 1;
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
    const p = 2 * l - q;
    const ch = (t: number): number => {
      let tt = (t + 1) % 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    const to = (v: number): number => Math.max(0, Math.min(255, Math.round(v * 255)));
    return (to(ch(h + 1 / 3)) << 16) | (to(ch(h)) << 8) | to(ch(h - 1 / 3));
  };
  return { core: rot(e.core), glow: rot(e.glow), dark: rot(e.dark) };
}

/**
 * Builds a distinct mark for any skill name.
 *
 * The skill data names 291 different icons and only 27 of them were ever drawn,
 * so everything else fell through to its effect family and a whole tree came
 * out as the same picture with a different tint. Hand-drawing 291 motifs is not
 * the answer; deriving one is.
 *
 * The name is hashed into a small set of shape decisions — core form, how many
 * arms or points, whether it is ringed, barred, slashed or haloed, and how it
 * is rotated — which yields thousands of combinations that all read as
 * deliberate heraldic marks rather than as noise. Bold and high-contrast on
 * purpose: these are looked at around 40 pixels.
 */
function proceduralSigil(name: string): Motif {
  const h = hashStr(name);
  const core = h % 6;
  const arms = 3 + ((h >>> 3) % 6);
  const ringed = ((h >>> 7) & 3) !== 0;
  const barred = ((h >>> 9) & 1) === 1;
  const slashed = ((h >>> 10) & 3) === 0;
  const haloed = ((h >>> 12) & 3) === 0;
  const spin = ((h >>> 14) % 12) * (Math.PI / 6);
  const inner = 0.3 + ((h >>> 17) % 5) * 0.09;

  return (x, e) => {
    x.save();
    x.translate(64, 64);
    x.rotate(spin);
    x.lineJoin = 'round';
    x.lineCap = 'round';

    if (haloed) {
      const g = x.createRadialGradient(0, 0, 4, 0, 0, 44);
      g.addColorStop(0, rgba(e.core, 0.55));
      g.addColorStop(1, rgba(e.glow, 0));
      x.fillStyle = g;
      x.beginPath();
      x.arc(0, 0, 44, 0, Math.PI * 2);
      x.fill();
    }

    const R = 30;
    x.strokeStyle = rgba(e.core, 0.95);
    x.fillStyle = rgba(e.glow, 0.8);
    x.lineWidth = 6;

    if (core === 0) {
      // Star: alternating outer points and an inner waist.
      x.beginPath();
      for (let i = 0; i < arms * 2; i++) {
        const r = i % 2 === 0 ? R : R * inner;
        const a = (i / (arms * 2)) * Math.PI * 2 - Math.PI / 2;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) x.moveTo(px, py);
        else x.lineTo(px, py);
      }
      x.closePath();
      x.fill();
      x.stroke();
    } else if (core === 1) {
      // Polygon shield.
      x.beginPath();
      for (let i = 0; i < arms; i++) {
        const a = (i / arms) * Math.PI * 2 - Math.PI / 2;
        const px = Math.cos(a) * R;
        const py = Math.sin(a) * R;
        if (i === 0) x.moveTo(px, py);
        else x.lineTo(px, py);
      }
      x.closePath();
      x.fill();
      x.stroke();
    } else if (core === 2) {
      // Radiating blades from a hub.
      for (let i = 0; i < arms; i++) {
        const a = (i / arms) * Math.PI * 2;
        x.beginPath();
        x.moveTo(Math.cos(a) * R * inner, Math.sin(a) * R * inner);
        x.lineTo(Math.cos(a + 0.16) * R, Math.sin(a + 0.16) * R);
        x.lineTo(Math.cos(a - 0.16) * R, Math.sin(a - 0.16) * R);
        x.closePath();
        x.fill();
      }
      x.beginPath();
      x.arc(0, 0, R * inner * 0.9, 0, Math.PI * 2);
      x.fillStyle = rgba(e.core, 0.95);
      x.fill();
    } else if (core === 3) {
      // Chevron stack, pointing up.
      for (let i = 0; i < Math.min(4, arms - 1); i++) {
        const o = -R + i * 20;
        x.beginPath();
        x.moveTo(-R * 0.8, o + 16);
        x.lineTo(0, o - 6);
        x.lineTo(R * 0.8, o + 16);
        x.stroke();
      }
    } else if (core === 4) {
      // Crescent. Sweep and bite both come from the name, so two crescents are
      // not the same crescent.
      const gap = 0.28 + (arms - 3) * 0.22;
      x.beginPath();
      x.arc(0, 0, R, gap, Math.PI * 2 - gap);
      x.arc(R * (0.34 + inner * 0.4), 0, R * (0.5 + inner * 0.5), Math.PI * 2 - gap, gap, true);
      x.closePath();
      x.fill();
      x.stroke();
    } else {
      // Teardrop / bolt shape.
      x.beginPath();
      x.moveTo(0, -R);
      x.quadraticCurveTo(R * 0.9, -R * 0.1, R * inner, R * 0.55);
      x.quadraticCurveTo(0, R, -R * inner, R * 0.55);
      x.quadraticCurveTo(-R * 0.9, -R * 0.1, 0, -R);
      x.closePath();
      x.fill();
      x.stroke();
    }

    // Count pips. The single most reliable difference between two marks: you
    // can see four of something is not five without reading the shape.
    x.fillStyle = rgba(e.core, 0.9);
    for (let i = 0; i < arms; i++) {
      const a = (i / arms) * Math.PI * 2 - Math.PI / 2;
      x.beginPath();
      x.arc(Math.cos(a) * (R + 15), Math.sin(a) * (R + 15), 3.4, 0, Math.PI * 2);
      x.fill();
    }

    if (ringed) {
      x.beginPath();
      x.arc(0, 0, R + 8, 0, Math.PI * 2);
      x.strokeStyle = rgba(e.glow, 0.75);
      x.lineWidth = 3;
      x.stroke();
    }
    if (barred) {
      x.beginPath();
      x.moveTo(-R - 6, 0);
      x.lineTo(R + 6, 0);
      x.strokeStyle = rgba(e.core, 0.9);
      x.lineWidth = 5;
      x.stroke();
    }
    if (slashed) {
      x.beginPath();
      x.moveTo(-R, R);
      x.lineTo(R, -R);
      x.strokeStyle = rgba(e.core, 0.85);
      x.lineWidth = 5;
      x.stroke();
    }
    x.restore();
  };
}

const sigilCache = new Map<string, Motif>();

function motifFor(iconKey: string | undefined, effect?: string | undefined): Motif {
  // The skill's authored icon name wins; the effect family is the fallback.
  const named = (iconKey ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (named && MOTIFS[named]) return MOTIFS[named]!;
  // No hand-drawn motif under that name: derive one from the name itself
  // rather than collapsing onto the effect family with everything else.
  if (iconKey) {
    let sig = sigilCache.get(iconKey);
    if (!sig) {
      sig = proceduralSigil(iconKey);
      sigilCache.set(iconKey, sig);
    }
    return sig;
  }
  const raw = (effect ?? iconKey ?? 'melee').toLowerCase();
  const [family, sub] = raw.split('.');

  // Most specific first: 'melee.strike' prefers the `strike` motif.
  if (sub && MOTIFS[sub]) return MOTIFS[sub]!;
  if (MOTIFS[raw]) return MOTIFS[raw]!;
  if (family && MOTIFS[family]) return MOTIFS[family]!;

  const alias: Record<string, string> = {
    bolt: 'projectile',
    orb: 'projectile',
    explode: 'detonate',
    explosion: 'detonate',
    blast: 'detonate',
    aoe: 'detonate',
    point: 'slam',
    sky: 'meteor',
    minion: 'summon',
    corpse: 'summon',
    totem: 'summon',
    banner: 'buff',
    stance: 'buff',
    self: 'buff',
    absorb: 'buff',
    debuff: 'curse',
    apply: 'curse',
    drain: 'beam',
    multislash: 'cleave',
    line: 'wave',
    damage: 'aura',
    dash: 'dash',
  };
  const bySub = sub ? alias[sub] : undefined;
  if (bySub && MOTIFS[bySub]) return MOTIFS[bySub]!;
  const byFamily = family ? alias[family] : undefined;
  if (byFamily && MOTIFS[byFamily]) return MOTIFS[byFamily]!;

  return MOTIFS.melee!;
}

const skillCache = new Map<string, string>();

/**
 * Returns a data-URI icon for a skill. `passive` gets a quieter, framed
 * treatment so the tree reads at a glance.
 */
export function skillIconUri(
  skillId: string,
  effect: string | undefined,
  damageType: DamageType | undefined,
  passive = false,
  /**
   * The skill's own authored icon name. Every skill definition carries one and
   * they were all being ignored: the motif came from the effect family alone,
   * so ~285 skills collapsed onto about fifteen pictures, and every skill that
   * shared a family and a damage type came out identical.
   */
  iconKey?: string,
): string {
  const key = `${skillId}|${effect ?? '-'}|${damageType ?? '-'}|${passive ? 'p' : 'a'}|${iconKey ?? '-'}`;
  const hit = skillCache.get(key);
  if (hit) return hit;

  // Shift the element palette per skill. The damage type still sets the family
  // — fire is warm, cold is blue — but two fire skills are no longer the same
  // orange, which is most of what made a tree look like one icon repeated.
  const e = tintElement(ELEMENT[damageType ?? 'physical'], hashStr(skillId));
  const rnd = makeRng(hashStr(key));
  const { c, x } = newCanvas();

  // Ground: a dark disc so the glow has something to sit on.
  const bg = x.createRadialGradient(64, 58, 6, 64, 64, 64);
  bg.addColorStop(0, rgba(e.dark, 0.95));
  bg.addColorStop(0.7, rgba(e.dark, 0.55));
  bg.addColorStop(1, 'rgba(6,6,9,0.9)');
  x.fillStyle = bg;
  x.beginPath();
  x.arc(64, 64, 62, 0, Math.PI * 2);
  x.fill();

  if (passive) {
    // Passives: hexagonal frame, motif drawn small and calm inside it.
    x.save();
    x.translate(64, 64);
    x.scale(0.62, 0.62);
    x.translate(-64, -64);
    x.globalAlpha = 0.85;
    // Passives were passing only the effect, so the skill's own icon name never
    // reached the motif picker and every passive in a tree drew the same mark
    // inside its hexagon.
    motifFor(iconKey ?? effect, effect)(x, e, rnd);
    x.restore();
    x.globalAlpha = 1;
    x.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const px = 64 + Math.cos(a) * 52;
      const py = 64 + Math.sin(a) * 52;
      if (i === 0) x.moveTo(px, py);
      else x.lineTo(px, py);
    }
    x.closePath();
    x.strokeStyle = rgba(e.glow, 0.7);
    x.lineWidth = 3;
    x.stroke();
  } else {
    motifFor(iconKey ?? effect, effect)(x, e, rnd);
  }

  // Signature ring: a short arc whose length, offset and tick count come from
  // the skill id. Cheap, and it makes any two icons distinguishable at a glance
  // even when they share a motif.
  const sig = hashStr(skillId + ':sig');
  const arc = 0.5 + ((sig >>> 3) % 7) * 0.18;
  const off = ((sig >>> 7) % 12) * (Math.PI / 6);
  x.strokeStyle = rgba(e.glow, 0.75);
  x.lineWidth = 3;
  x.beginPath();
  x.arc(64, 64, 57, off, off + arc);
  x.stroke();
  const ticks = 2 + (sig % 4);
  for (let i = 0; i < ticks; i++) {
    const a2 = off + arc + 0.5 + i * 0.34;
    x.beginPath();
    x.moveTo(64 + Math.cos(a2) * 50, 64 + Math.sin(a2) * 50);
    x.lineTo(64 + Math.cos(a2) * 58, 64 + Math.sin(a2) * 58);
    x.stroke();
  }

  // Vignette keeps the glow from bleeding to the slot edge.
  const vg = x.createRadialGradient(64, 64, 40, 64, 64, 64);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,.55)');
  x.fillStyle = vg;
  x.beginPath();
  x.arc(64, 64, 63, 0, Math.PI * 2);
  x.fill();

  const uri = c.toDataURL('image/png');
  skillCache.set(key, uri);
  return uri;
}

/** Frees cached icons — used when the item database is swapped in tests. */
export function clearIconCaches(): void {
  generation++;
  encoding.clear();
  itemCache.clear();
  // Anything queued was queued against the old art. Drop it rather than let a
  // stale icon land in a slot a frame later.
  pending.clear();
  listeners.clear();
  skillCache.clear();
}


// ---------------------------------------------------------------------------
// Public: monster affix badges
// ---------------------------------------------------------------------------

type Glyph = (x: CanvasRenderingContext2D, c: string) => void;

/** Bold, high-contrast marks — these are read at ~14px on a nameplate. */
const GLYPHS: Record<string, Glyph> = {
  flame: (x, c) => {
    x.beginPath();
    x.moveTo(32, 6);
    x.quadraticCurveTo(52, 30, 44, 44);
    x.quadraticCurveTo(40, 58, 32, 58);
    x.quadraticCurveTo(24, 58, 20, 44);
    x.quadraticCurveTo(12, 30, 32, 6);
    x.fillStyle = c;
    x.fill();
  },
  flake: (x, c) => {
    x.strokeStyle = c;
    x.lineWidth = 6;
    x.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      x.beginPath();
      x.moveTo(32 - Math.cos(a) * 24, 32 - Math.sin(a) * 24);
      x.lineTo(32 + Math.cos(a) * 24, 32 + Math.sin(a) * 24);
      x.stroke();
    }
  },
  bolt: (x, c) => {
    x.beginPath();
    x.moveTo(38, 4);
    x.lineTo(18, 34);
    x.lineTo(30, 34);
    x.lineTo(24, 60);
    x.lineTo(46, 28);
    x.lineTo(33, 28);
    x.closePath();
    x.fillStyle = c;
    x.fill();
  },
  drop: (x, c) => {
    x.beginPath();
    x.moveTo(32, 6);
    x.quadraticCurveTo(52, 34, 32, 58);
    x.quadraticCurveTo(12, 34, 32, 6);
    x.fillStyle = c;
    x.fill();
  },
  shield: (x, c) => {
    x.beginPath();
    x.moveTo(32, 6);
    x.lineTo(52, 16);
    x.lineTo(52, 34);
    x.quadraticCurveTo(52, 50, 32, 58);
    x.quadraticCurveTo(12, 50, 12, 34);
    x.lineTo(12, 16);
    x.closePath();
    x.fillStyle = c;
    x.fill();
  },
  spikes: (x, c) => {
    x.fillStyle = c;
    for (let i = 0; i < 4; i++) {
      const px = 10 + i * 15;
      x.beginPath();
      x.moveTo(px, 54);
      x.lineTo(px + 7, 12);
      x.lineTo(px + 14, 54);
      x.closePath();
      x.fill();
    }
  },
  wings: (x, c) => {
    x.fillStyle = c;
    x.beginPath();
    x.moveTo(32, 20);
    x.quadraticCurveTo(6, 12, 4, 40);
    x.quadraticCurveTo(20, 34, 32, 44);
    x.quadraticCurveTo(44, 34, 60, 40);
    x.quadraticCurveTo(58, 12, 32, 20);
    x.fill();
  },
  chain: (x, c) => {
    x.strokeStyle = c;
    x.lineWidth = 6;
    for (const [cx, cy] of [[22, 24], [42, 40]] as const) {
      x.beginPath();
      x.ellipse(cx, cy, 12, 9, -0.7, 0, Math.PI * 2);
      x.stroke();
    }
  },
  skull: (x, c) => {
    x.fillStyle = c;
    x.beginPath();
    x.moveTo(14, 34);
    x.quadraticCurveTo(14, 6, 32, 6);
    x.quadraticCurveTo(50, 6, 50, 34);
    x.lineTo(44, 46);
    x.lineTo(20, 46);
    x.closePath();
    x.fill();
    x.fillRect(24, 50, 16, 8);
    x.fillStyle = 'rgba(0,0,0,.8)';
    x.beginPath();
    x.arc(25, 30, 6, 0, Math.PI * 2);
    x.arc(39, 30, 6, 0, Math.PI * 2);
    x.fill();
  },
  eye: (x, c) => {
    x.beginPath();
    x.ellipse(32, 32, 26, 15, 0, 0, Math.PI * 2);
    x.fillStyle = c;
    x.fill();
    x.beginPath();
    x.arc(32, 32, 9, 0, Math.PI * 2);
    x.fillStyle = 'rgba(0,0,0,.85)';
    x.fill();
  },
  swirl: (x, c) => {
    x.strokeStyle = c;
    x.lineWidth = 6;
    x.lineCap = 'round';
    x.beginPath();
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const a = t * Math.PI * 3;
      const r = 4 + t * 24;
      const px = 32 + Math.cos(a) * r;
      const py = 32 + Math.sin(a) * r;
      if (i === 0) x.moveTo(px, py);
      else x.lineTo(px, py);
    }
    x.stroke();
  },
  arrows: (x, c) => {
    x.fillStyle = c;
    for (let i = 0; i < 3; i++) {
      x.beginPath();
      x.moveTo(8 + i * 16, 16);
      x.lineTo(24 + i * 16, 32);
      x.lineTo(8 + i * 16, 48);
      x.closePath();
      x.fill();
    }
  },
  wall: (x, c) => {
    x.fillStyle = c;
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 3; i++) {
        x.fillRect(6 + i * 18 + (r % 2 ? 9 : 0), 12 + r * 15, 15, 11);
      }
    }
  },
  heart: (x, c) => {
    x.beginPath();
    x.moveTo(32, 56);
    x.bezierCurveTo(2, 34, 14, 6, 32, 22);
    x.bezierCurveTo(50, 6, 62, 34, 32, 56);
    x.fillStyle = c;
    x.fill();
  },
  star: (x, c) => {
    x.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 27 : 12;
      const px = 32 + Math.cos(a) * r;
      const py = 32 + Math.sin(a) * r;
      if (i === 0) x.moveTo(px, py);
      else x.lineTo(px, py);
    }
    x.closePath();
    x.fillStyle = c;
    x.fill();
  },
};

/** Affix behaviour → glyph. Anything unmapped falls back to a star. */
const AFFIX_GLYPH: Record<string, string> = {
  fire_enchanted: 'flame', molten_trail: 'flame', unstable: 'flame', storm_death: 'bolt',
  cold_enchanted: 'flake', frozen_ground: 'flake', frozen_pulse: 'flake', chilling_death: 'flake',
  lightning_enchanted: 'bolt', electrified: 'bolt', arcane_enchanted: 'swirl', arcane_sentry: 'swirl',
  poison_aura: 'drop', plagued: 'drop', mana_burn: 'drop',
  shielded: 'shield', stoneskin: 'shield', missile_dampening: 'shield', juggernaut: 'shield',
  thorns: 'spikes', reflect_damage: 'spikes',
  teleporter: 'wings', phasing: 'wings', wormhole: 'wings', gravity: 'swirl', vortex: 'swirl',
  jailer: 'chain', entangling: 'chain', waller: 'wall', knockback: 'arrows', hasted_pack: 'arrows',
  berserker: 'arrows', empowered: 'star', avenger: 'star', nightmarish: 'eye', illusionist: 'eye',
  summoner: 'skull', soul_bound: 'skull', blood_thirsty: 'heart', vampiric: 'heart',
  life_leech: 'heart', regenerating: 'heart', health_link: 'chain', orbiter: 'swirl',
  mortar: 'arrows',
};

const affixCache = new Map<string, string>();

/** Small badge for a monster affix, drawn from its behaviour and colour. */
export function affixIconUri(behavior: string | undefined, color: number): string {
  const key = `${behavior ?? 'none'}|${color}`;
  const hit = affixCache.get(key);
  if (hit) return hit;

  const glyphName = AFFIX_GLYPH[behavior ?? ''] ?? 'star';
  const glyph = GLYPHS[glyphName] ?? GLYPHS.star!;

  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const x = c.getContext('2d')!;

  // Dark disc so the mark reads against any dungeon background.
  x.beginPath();
  x.arc(32, 32, 31, 0, Math.PI * 2);
  x.fillStyle = 'rgba(8,8,12,.88)';
  x.fill();
  x.strokeStyle = rgba(color, 0.9);
  x.lineWidth = 4;
  x.stroke();

  x.save();
  x.shadowColor = rgba(color, 0.9);
  x.shadowBlur = 8;
  glyph(x, hexStr(color));
  x.restore();

  const uri = c.toDataURL('image/png');
  affixCache.set(key, uri);
  return uri;
}
