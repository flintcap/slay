/**
 * Procedural inventory, skill, status and affix icons — the public surface.
 *
 * Everything is painted to a canvas at generation time and cached as an image
 * URI. No image files, no icon fonts — the game ships zero assets.
 *
 * The painting lives elsewhere and this module only caches and schedules it:
 *
 *  - item icons: `ItemIconArt` (families in `IconWeapons`, `IconArmor`,
 *    `IconTrinkets`, kit and rarity looks in `IconKit`)
 *  - skill, status and affix icons: `SkillIconArt`, over the pictogram
 *    vocabulary in `Glyphs`
 *  - the brushes underneath all of it: `Paint`
 */
import type { Item, DamageType } from '../types';
import { paintItemIcon } from './ItemIconArt';
import { paintSkillIcon, paintStatusIcon, paintAffixIcon } from './SkillIconArt';
import { makeCanvas } from './Paint';
import { SKILL_BY_ID, TREE_BY_ID, SKILL_TREES } from '../data/skills';

const S = 128; // internal draw resolution

/**
 * One canvas, reused for every synchronous icon.
 *
 * A fresh `<canvas>` per icon means a fresh backing store per icon, and an
 * inventory is a hundred of them in a row. Setting `width` is also the
 * documented way to clear a canvas, so the reset is free.
 */
let scratch: { c: HTMLCanvasElement; x: CanvasRenderingContext2D } | null = null;

function scratchCanvas(size = S): { c: HTMLCanvasElement; x: CanvasRenderingContext2D } {
  if (!scratch || scratch.c.width !== size) scratch = makeCanvas(size);
  else scratch.c.width = size;
  return scratch;
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

const skillCache = new Map<string, string>();

/** Which class a tree belongs to, and its position among that class's trees. */
function treeInfo(treeId: string | undefined): { classId?: string; index: number } {
  if (!treeId) return { index: 0 };
  const tree = TREE_BY_ID[treeId];
  if (!tree) return { index: 0 };
  const siblings = SKILL_TREES.filter((t) => t.classId === tree.classId);
  return { classId: tree.classId, index: Math.max(0, siblings.findIndex((t) => t.id === treeId)) };
}

/**
 * Returns an image URI for a skill. `passive` gets a hexagonal plate so the
 * tree reads at a glance. The class frame and tree pips are looked up from
 * the skill's own tree.
 */
export function skillIconUri(
  skillId: string,
  effect: string | undefined,
  damageType: DamageType | undefined,
  passive = false,
  /** The skill's own authored icon name, which picks the pictogram. */
  iconKey?: string,
): string {
  const key = `${skillId}|${effect ?? '-'}|${damageType ?? '-'}|${passive ? 'p' : 'a'}|${iconKey ?? '-'}`;
  const hit = skillCache.get(key);
  if (hit) return hit;
  const { classId, index } = treeInfo(SKILL_BY_ID[skillId]?.treeId);
  const { c, x } = scratchCanvas();
  paintSkillIcon(x, { skillId, icon: iconKey, effect, damageType, passive, classId, treeIndex: index });
  const uri = c.toDataURL('image/png');
  skillCache.set(key, uri);
  return uri;
}

// ---------------------------------------------------------------------------
// Public: status chips
// ---------------------------------------------------------------------------

const statusCache = new Map<string, string>();

/**
 * A painted chip for a buff or debuff. `icon` is the status definition's
 * authored icon name ('flame', 'ice-block', 'ward'...), `color` its colour,
 * and `polarity` below zero marks it a debuff (dark toothed rim rather than
 * gold). 64px; reads down to the HUD's 17px chips.
 */
export function statusIconUri(icon: string | undefined, color: number, polarity = 1): string {
  const key = `${icon ?? '-'}|${color}|${polarity < 0 ? 'd' : 'b'}`;
  const hit = statusCache.get(key);
  if (hit) return hit;
  const { c, x } = scratchCanvas(64);
  paintStatusIcon(x, icon, color, polarity < 0, 64);
  const uri = c.toDataURL('image/png');
  statusCache.set(key, uri);
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
  statusCache.clear();
  affixCache.clear();
}

// ---------------------------------------------------------------------------
// Public: monster affix badges
// ---------------------------------------------------------------------------

const affixCache = new Map<string, string>();

/** Small badge for a monster affix, drawn from its behaviour and colour. */
export function affixIconUri(behavior: string | undefined, color: number): string {
  const key = `${behavior ?? 'none'}|${color}`;
  const hit = affixCache.get(key);
  if (hit) return hit;
  const { c, x } = scratchCanvas(64);
  paintAffixIcon(x, behavior, color, 64);
  const uri = c.toDataURL('image/png');
  affixCache.set(key, uri);
  return uri;
}
