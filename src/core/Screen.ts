/**
 * SLAY — how sharp the screen is: device pixels per CSS pixel.
 *
 * UI canvases (combat numbers, maps, item icons) draw at this ratio so their
 * text and edges land on real pixels: 1 on a plain monitor, 1.5 or 2 on a 4K
 * one with Windows scaling, 2 on a Retina laptop. It is read again whenever
 * it changes: the window was dragged to another monitor, or the page zoom
 * changed. A move between monitors of the same CSS size fires no `resize`,
 * so the ratio is watched through a media query instead.
 *
 * Canvases inside the UI layer use `uiRatio()`: the menus' own scale
 * (Settings, Video, Interface) makes them that much bigger on screen.
 */

import { uiScale } from './UiScale';

/** Highest ratio anything draws at; beyond it the extra pixels are not seen. */
const MAX_RATIO = 3;

/** Device pixels per CSS pixel, 1 to 3. */
export function screenRatio(): number {
  const r = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return Math.min(MAX_RATIO, Math.max(1, r));
}

/**
 * Device pixels per CSS pixel for a canvas inside the UI layer, which is
 * drawn `uiScale()` times bigger, and `extra` times more on top (the HUD's
 * own scale, the minimap's). Capped like `screenRatio`.
 */
export function uiRatio(extra = 1): number {
  return Math.min(MAX_RATIO, screenRatio() * uiScale() * extra);
}

const listeners = new Set<(ratio: number) => void>();
let query: MediaQueryList | null = null;

function arm(): void {
  query?.removeEventListener('change', changed);
  query = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  query.addEventListener('change', changed);
}

function changed(): void {
  // The old query stopped matching; watch the new ratio from here on.
  arm();
  const r = screenRatio();
  for (const fn of [...listeners]) fn(r);
}

/** The UI scale changed: everything that sharpens to the screen looks again. */
export function uiScaleChanged(): void {
  const r = screenRatio();
  for (const fn of [...listeners]) fn(r);
}

/** Calls `fn` with the new ratio each time it changes. Returns the off switch. */
export function onScreenRatio(fn: (ratio: number) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  if (!query) arm();
  listeners.add(fn);
  return () => listeners.delete(fn);
}
