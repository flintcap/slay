/**
 * SLAY — how big the menus and the HUD are drawn (Settings, Interface).
 *
 * The whole UI layer (`#ui`) is scaled with CSS `zoom`, so it lays out again
 * at its new size and the text stays sharp; the HUD and the minimap scale on
 * top of that. Inside the layer one CSS pixel is `uiScale()` screen pixels,
 * so anything placed from a pointer or a measured box converts first:
 *
 *  - `cssPx(el, px)`: a screen length (clientX, a `getBoundingClientRect`
 *    edge) as CSS pixels for `el`, wherever it sits.
 *  - `uiWidth()`, `uiHeight()`: the window in the layer's own pixels.
 *
 * In the stylesheets, `#ui` is the size container `ui`: lengths that follow
 * the window use `cqw`/`cqh` and the layouts that change on small windows use
 * `@container ui (...)`, both in the layer's own pixels. `vw`/`vh` and
 * `@media` would measure the window in screen pixels and miss the scale.
 *
 * The world's own overlays (combat numbers, the see-through map) cover the
 * screen pixel for pixel and undo the scale.
 */
import type { GameSettings } from '../types';

export const UI_SCALE_MIN = 0.8;
export const UI_SCALE_MAX = 2;
export const HUD_SCALE_MIN = 0.7;
export const HUD_SCALE_MAX = 1.5;
export const MINIMAP_SCALE_MIN = 0.75;
export const MINIMAP_SCALE_MAX = 1.75;

let scale = 1;
let hud = 1;
let minimap = 1;

const clamp = (v: number | undefined, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Number.isFinite(v) ? (v as number) : 1));

/** The menus' scale in force: 1 draws them as designed. */
export function uiScale(): number {
  return scale;
}

/** The HUD's own scale, on top of `uiScale()`. */
export function hudScale(): number {
  return hud;
}

/** The minimap's size as a share of its designed size. */
export function minimapScale(): number {
  return minimap;
}

/** The window's width in the UI layer's own CSS pixels. */
export function uiWidth(): number {
  return window.innerWidth / scale;
}

/** The window's height in the UI layer's own CSS pixels. */
export function uiHeight(): number {
  return window.innerHeight / scale;
}

/** A length in screen pixels as CSS pixels for `el`, scaled or not. */
export function cssPx(el: Element, px: number): number {
  return px / ((el as HTMLElement).currentCSSZoom || 1);
}

/**
 * Puts the scales from `settings` on the page. Returns true when any of them
 * changed, so canvases drawn in the layer can be sharpened again.
 */
export function applyUiScale(settings: GameSettings): boolean {
  const ui = clamp(settings.uiScale, UI_SCALE_MIN, UI_SCALE_MAX);
  const h = clamp(settings.hudScale, HUD_SCALE_MIN, HUD_SCALE_MAX);
  const m = clamp(settings.minimapScale, MINIMAP_SCALE_MIN, MINIMAP_SCALE_MAX);
  const changed = ui !== scale || h !== hud || m !== minimap;
  scale = ui;
  hud = h;
  minimap = m;
  const root = document.documentElement.style;
  root.setProperty('--ui-scale', String(ui));
  root.setProperty('--hud-scale', String(h));
  root.setProperty('--minimap-scale', String(m));
  return changed;
}
