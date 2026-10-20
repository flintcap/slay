/**
 * Procedural inventory, skill, status and affix icons — the public surface.
 *
 * Everything is drawn to a canvas at generation time and cached as an image
 * URI. No image files, no icon fonts.
 *
 * The drawing lives elsewhere and this module only caches and schedules it:
 *
 *  - item icons: rendered from the item's own 3D model by
 *    `items/IconRender`, with the rarity look composited on top
 *  - skill, status and affix icons: `SkillIconArt`, over the pictogram
 *    vocabulary in `Glyphs`
 *  - the brushes underneath all of it: `Paint`
 */
import type * as THREE from 'three';
import type { Item, DamageType, ItemVisual } from '../types';
import { drawItemIcon as renderItemIcon, drawItemIconLater, iconCanvasSize, iconScale, iconScansMissing, itemScansReady, warmIconStudio, type IconSpec } from './items/IconRender';
import { textureReady } from '../core/Assets';
import { iconShape } from '../sim/Grid';
import { paintSkillIcon, paintStatusIcon, paintAffixIcon } from './SkillIconArt';
import { makeCanvas } from './Paint';
import { SKILL_BY_ID, TREE_BY_ID, SKILL_TREES } from '../data/skills';

/**
 * Skill icons are painted in a 128-unit square and baked at 128 x
 * `iconScale()` pixels: 128 on a plain screen, 205 at a ratio of 2, 307 at
 * the most (UI scale 200% on a high density screen). The largest a skill icon
 * is shown is 62 CSS px (the skill board's detail pane; the hotbar's 40 px at
 * HUD scale 150% is 60), so 248 screen pixels at that setting: the bake is
 * always at least that sharp. Baking one costs about 4 ms at 128 px and 16 ms
 * at 307 px in a software-drawn browser, and its PNG holds 45 to 210 KB, so
 * the hero's own icons are baked ahead of need in idle time
 * (`warmSkillIcons`) and a bigger bake would buy nothing the screen can show.
 */
const S = 128;

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

export { potionColor } from './items/IconRender';

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

/**
 * Which picture of an item to draw. `square` is the classic one; `shaped`
 * matches the item's block in the pack, so a staff is drawn tall.
 */
export type IconForm = 'square' | 'shaped';

/** What the icon renderer needs for an item: its base's authored visual and identity. */
function specFor(item: Item, form: IconForm = 'square'): IconSpec {
  const v = baseLookup?.(item.baseId)?.visual;
  const visual: ItemVisual | undefined = v?.shape ? { shape: v.shape, palette: v.palette ?? 'metal.steel', ornate: v.ornate, glow: v.glow } : undefined;
  const shape = form === 'shaped' ? iconShape(item) : undefined;
  return { baseId: item.baseId, rarity: item.rarity, visual, uniqueId: item.uniqueId, setId: item.setId, shape };
}

/** The properties that actually change an item's art. */
function iconKeyFor(item: Item, form: IconForm = 'square'): string {
  // Uniques and set pieces share a base with plain drops but not a picture.
  const sh = form === 'shaped' ? iconShape(item) : undefined;
  return `${item.baseId}|${item.rarity}|${item.uniqueId ?? item.setId ?? ''}${sh ? `|${sh.w}x${sh.h}` : ''}`;
}

/** A cached icon, or null if it has not been drawn yet. */
export function cachedItemIcon(item: Item, form: IconForm = 'square'): string | null {
  return itemCache.get(iconKeyFor(item, form)) ?? null;
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
 * Drawing one is a model build, a render and a PNG encode, and opening a full pack is
 * a hundred of those back to back — enough to lock the window for most of a
 * second the first time you press I. Nothing about that work needs to happen
 * before the panel appears, so it doesn't: the grid renders immediately with
 * blank slots and each icon drops in as it is drawn.
 */
const pending = new Map<string, { item: Item; form: IconForm }>();
const listeners = new Map<string, Array<(uri: string) => void>>();
/** Keys painted and waiting on the browser's PNG encoder. */
const encoding = new Set<string>();
/** Bumped whenever the caches are dropped, so a late encode cannot land stale art. */
let generation = 0;
let pumping = 0;

/** How long per frame to spend drawing icons. Roughly a third of a frame. */
const ICON_BUDGET_MS = 5;

function deliver(key: string, uri: string, final = true): void {
  const waiting = listeners.get(key);
  if (!waiting) return;
  if (final) listeners.delete(key);
  for (const fn of waiting) fn(uri);
}

/** Scans that failed for good: an icon does not wait on them. */
const neverLoads = new WeakSet<THREE.Texture>();
const lateScans = (): THREE.Texture[] => iconScansMissing().filter((t) => !neverLoads.has(t));

/**
 * An icon drawn before all its scans had loaded is shown as it is and not
 * kept: once they land it is queued again, and its slots are handed the
 * finished picture.
 */
function redrawWhenLoaded(key: string, item: Item, form: IconForm, late: readonly THREE.Texture[]): void {
  const gen = generation;
  void Promise.all(late.map((t) => textureReady(t).then((ok) => ok || neverLoads.add(t)))).then(() => {
    if (gen !== generation || itemCache.has(key)) return;
    pending.set(key, { item, form });
    schedulePump();
  });
}

/**
 * Draws now, encodes later. `toBlob` does the PNG encode off the main thread,
 * so the frame only pays for the render.
 */
function drawItemIconAsync(item: Item, key: string, form: IconForm): void {
  const gen = generation;
  // CPU-backed, like every icon canvas (see `makeCanvas`): the encode below
  // must not wait on the GPU.
  const spec = specFor(item, form);
  const dim = iconCanvasSize(spec);
  const { c, x } = makeCanvas(dim.w, dim.h);
  // The model is read back from the GPU without blocking (see `Studio`), so
  // the encode waits on that, not the page.
  const job = drawItemIconLater(x, spec);
  const late = job.missing.filter((t) => !neverLoads.has(t));
  const done = late.length === 0;
  if (!done) redrawWhenLoaded(key, item, form, late);
  encoding.add(key);
  void job.painted.then(() => encode(c, key, gen, done));
}

/** Hands a painted icon to its slots, encoded off the main thread where the browser can. */
function encode(c: HTMLCanvasElement, key: string, gen: number, done: boolean): void {
  if (typeof c.toBlob !== 'function' || typeof URL?.createObjectURL !== 'function') {
    encoding.delete(key);
    if (gen !== generation) return;
    const uri = c.toDataURL('image/png');
    if (done) itemCache.set(key, uri);
    deliver(key, uri, done);
    return;
  }
  c.toBlob((blob) => {
    encoding.delete(key);
    if (gen !== generation) return;
    // A synchronous draw may have beaten the encoder to it; keep that one.
    let uri = itemCache.get(key);
    if (!uri) {
      uri = blob ? URL.createObjectURL(blob) : c.toDataURL('image/png');
      if (done) itemCache.set(key, uri);
    }
    deliver(key, uri, done || itemCache.has(key));
  }, 'image/png');
}

/** The item scans have decoded; until then deferred icons wait rather than bake flat maps. */
let scansReady = false;
let scansAsked = false;

function pump(deadline?: { didTimeout: boolean; timeRemaining(): number }): void {
  pumping = 0;
  if (!scansReady) {
    if (!scansAsked) {
      scansAsked = true;
      void itemScansReady().then(() => {
        scansReady = true;
        if (pending.size > 0) schedulePump();
      });
    }
    return;
  }
  const t0 = performance.now();
  // Idle time the browser offers is free: use all of it, not just the
  // budget. A pack of forty icons at one per callback took most of a minute
  // to fill in while a map was running.
  const budget = deadline && !deadline.didTimeout ? Math.max(ICON_BUDGET_MS, deadline.timeRemaining() - 1) : ICON_BUDGET_MS;
  for (const [key, job] of pending) {
    pending.delete(key);
    if (itemCache.has(key)) {
      deliver(key, itemCache.get(key)!);
      continue;
    }
    drawItemIconAsync(job.item, key, job.form);
    if (performance.now() - t0 > budget) break;
  }
  if (pending.size > 0) schedulePump();
}

function schedulePump(): void {
  if (pumping) return;
  // In the idle time after a frame, not at its start: an icon picked up mid
  // fight no longer adds its drawing to the frame that is about to render.
  // Capped, so a busy game with no idle time still draws a few a second.
  const idle = (globalThis as { requestIdleCallback?: (cb: (d: { didTimeout: boolean; timeRemaining(): number }) => void, o?: { timeout: number }) => number }).requestIdleCallback;
  pumping = idle ? idle(pump, { timeout: 120 }) : requestAnimationFrame(() => pump());
}

/**
 * The icon for an item, drawn later if it is not already cached.
 *
 * Returns the cached URI when there is one — the common case once a pack has
 * been opened once — and otherwise a blank, calling `onReady` when the real one
 * is available. Callers that genuinely cannot wait (a drag ghost, which must
 * exist the instant the pointer moves) should use `itemIconUri`.
 */
export function requestItemIcon(item: Item, onReady: (uri: string) => void, form: IconForm = 'square'): string {
  const key = iconKeyFor(item, form);
  const hit = itemCache.get(key);
  if (hit) return hit;
  if (!encoding.has(key)) pending.set(key, { item, form });
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
export function warmItemIcons(items: Iterable<Item | null | undefined>, form: IconForm = 'square'): void {
  for (const item of items) {
    if (!item) continue;
    const key = iconKeyFor(item, form);
    if (itemCache.has(key) || pending.has(key) || encoding.has(key)) continue;
    pending.set(key, { item, form });
  }
  if (pending.size > 0) schedulePump();
}

/**
 * Draws the icons for `items` now, one per task, until all are drawn or
 * `budgetMs` has passed; for a scene to call behind its loading curtain.
 *
 * The icons are rendered in a renderer of their own. Its first use (the
 * device, its lighting and a shader per kind of material) and each icon
 * after it used to land on frames in play: the pack's icons were drawn in
 * the background right after a scene opened, a long frame or several in the
 * first seconds of every visit. Whatever the budget leaves is drawn in the
 * background as before.
 */
export async function drawItemIconsNow(items: Iterable<Item | null | undefined>, budgetMs = 1500, form: IconForm = 'square'): Promise<void> {
  const t0 = performance.now();
  const ok = await Promise.race([
    itemScansReady().then(() => true),
    new Promise<boolean>((r) => setTimeout(() => r(false), budgetMs)),
  ]);
  if (!ok) return;
  scansReady = true;
  // The studio's shaders, built here rather than on the first icon in play.
  await warmIconStudio();
  const gen = generation;
  for (const item of items) {
    if (!item) continue;
    if (performance.now() - t0 > budgetMs || gen !== generation) break;
    const key = iconKeyFor(item, form);
    if (itemCache.has(key) || encoding.has(key)) continue;
    pending.delete(key);
    try {
      drawItemIconAsync(item, key, form);
    } catch {
      /* drawn later, or the slot keeps its fallback */
    }
    await new Promise((r) => setTimeout(r, 0));
  }
}

/**
 * Returns a data-URI icon for an item, drawing it now if it is not cached.
 * Prefer `requestItemIcon` anywhere a blank frame is acceptable.
 */
export function itemIconUri(item: Item, form: IconForm = 'square'): string {
  const key = iconKeyFor(item, form);
  const hit = itemCache.get(key);
  if (hit) return hit;
  return drawItemIcon(item, key, form);
}

function drawItemIcon(item: Item, key: string, form: IconForm): string {
  const spec = specFor(item, form);
  const dim = iconCanvasSize(spec);
  // A picture drawn before its scans landed is not kept, so the next ask draws it again.
  if (dim.w !== dim.h) {
    const { c, x } = makeCanvas(dim.w, dim.h);
    renderItemIcon(x, spec);
    const uri = c.toDataURL('image/png');
    if (lateScans().length === 0) itemCache.set(key, uri);
    return uri;
  }
  const { c, x } = scratchCanvas(dim.w);
  renderItemIcon(x, spec);
  const uri = c.toDataURL('image/png');
  if (lateScans().length === 0) itemCache.set(key, uri);
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
  // Painted in plain-screen units, scaled up to the screen's own pixels.
  const k = iconScale();
  const { c, x } = scratchCanvas(Math.round(S * k));
  x.save();
  x.scale(k, k);
  paintSkillIcon(x, { skillId, icon: iconKey, effect, damageType, passive, classId, treeIndex: index });
  x.restore();
  const uri = c.toDataURL('image/png');
  skillCache.set(key, uri);
  return uri;
}

/** Skills whose icons are waiting for idle time. */
const skillWarm: SkillDefLike[] = [];
let skillWarming = 0;

type SkillDefLike = { id: string; effect?: string; damageType?: DamageType; targeting?: string; icon?: string };
type IdleDeadline = { didTimeout: boolean; timeRemaining(): number };

function skillWarmPump(deadline?: IdleDeadline): void {
  skillWarming = 0;
  const t0 = performance.now();
  const budget = deadline && !deadline.didTimeout ? Math.max(4, deadline.timeRemaining() - 1) : 4;
  while (skillWarm.length > 0) {
    const s = skillWarm.shift()!;
    try {
      skillIconUri(s.id, s.effect, s.damageType, s.targeting === 'passive', s.icon);
    } catch {
      /* drawn when shown instead */
    }
    if (performance.now() - t0 > budget) break;
  }
  if (skillWarm.length > 0) scheduleSkillWarm();
}

function scheduleSkillWarm(): void {
  if (skillWarming) return;
  const idle = (globalThis as { requestIdleCallback?: (cb: (d: IdleDeadline) => void, o?: { timeout: number }) => number }).requestIdleCallback;
  skillWarming = idle ? idle(skillWarmPump, { timeout: 1000 }) : (setTimeout(() => skillWarmPump(), 50) as unknown as number);
}

/**
 * Bakes a class's skill icons ahead of need, a few at a time in the browser's
 * idle time, so the skill board's first open does not bake fifty icons in
 * one frame. Costs nothing for icons already baked.
 */
export function warmSkillIcons(classId: string): void {
  const trees = new Set(SKILL_TREES.filter((t) => t.classId === classId).map((t) => t.id));
  for (const s of Object.values(SKILL_BY_ID)) if (s.treeId && trees.has(s.treeId)) skillWarm.push(s);
  if (skillWarm.length > 0) scheduleSkillWarm();
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
  const px = Math.round(64 * iconScale());
  const { c, x } = scratchCanvas(px);
  paintStatusIcon(x, icon, color, polarity < 0, px);
  const uri = c.toDataURL('image/png');
  statusCache.set(key, uri);
  return uri;
}

/** The `iconScale` the cached icons were drawn at. */
let drawnAt = iconScale();

/**
 * Drops the cached icons if the screen's sharpness has changed since they
 * were drawn (the window moved to another monitor). True when it had.
 */
export function refreshIconScale(): boolean {
  if (iconScale() === drawnAt) return false;
  clearIconCaches();
  return true;
}

/** Frees cached icons — used when the item database is swapped in tests. */
export function clearIconCaches(): void {
  drawnAt = iconScale();
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
  const px = Math.round(64 * iconScale());
  const { c, x } = scratchCanvas(px);
  paintAffixIcon(x, behavior, color, px);
  const uri = c.toDataURL('image/png');
  affixCache.set(key, uri);
  return uri;
}
