/**
 * SLAY — full screen, and which screen.
 *
 * In a browser the game is either in a window or full screen; the window
 * itself, borderless modes and vsync belong to the desktop app (Phase 4).
 * Full screen keeps Escape for the game: the browser leaves full screen only
 * when Escape is held (Keyboard Lock), so a tap still opens the pause menu.
 *
 * With more than one screen, Chrome can say which screens there are (Window
 * Management, after the player allows it once) and open full screen on the
 * one chosen.
 */

/** The part of a screen the Window Management API describes that the game uses. */
export interface ScreenChoice {
  label: string;
  width: number;
  height: number;
  primary: boolean;
  /** The browser's own handle, passed back to `requestFullscreen`. */
  handle: unknown;
}

interface DetailedScreen {
  label?: string;
  width: number;
  height: number;
  isPrimary?: boolean;
}
interface ScreenDetails {
  screens: DetailedScreen[];
  currentScreen: DetailedScreen;
}
type WindowWithScreens = Window & { getScreenDetails?: () => Promise<ScreenDetails> };
type ScreenWithExtended = Screen & { isExtended?: boolean };
type KeyboardLock = { lock?: (keys?: string[]) => Promise<void>; unlock?: () => void };

export function isFullscreen(): boolean {
  return !!document.fullscreenElement;
}

/** Turns full screen on (on `on`, the screen chosen) or off. Must run from a click. */
export async function setFullscreen(on: boolean, onScreen?: ScreenChoice): Promise<void> {
  const keyboard = (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;
  if (!on) {
    keyboard?.unlock?.();
    if (document.fullscreenElement) await document.exitFullscreen();
    return;
  }
  const opts = { navigationUI: 'hide', ...(onScreen ? { screen: onScreen.handle } : {}) } as FullscreenOptions;
  await document.documentElement.requestFullscreen(opts);
  // A tap of Escape is the game's; holding it leaves full screen.
  await keyboard?.lock?.(['Escape']).catch(() => undefined);
}

/** True when the browser can name the screens and there is more than one. */
export function canChooseScreen(): boolean {
  return typeof (window as WindowWithScreens).getScreenDetails === 'function' && !!(screen as ScreenWithExtended).isExtended;
}

/** The screens, once the player allows it (the browser asks the first time). */
export async function listScreens(): Promise<{ screens: ScreenChoice[]; current: number }> {
  const get = (window as WindowWithScreens).getScreenDetails;
  if (!get) return { screens: [], current: 0 };
  const details = await get.call(window);
  const screens = details.screens.map((s, i) => ({
    label: s.label || `${i + 1}`,
    width: s.width,
    height: s.height,
    primary: !!s.isPrimary,
    handle: s,
  }));
  return { screens, current: Math.max(0, details.screens.indexOf(details.currentScreen)) };
}

/** Calls `fn` whenever full screen starts or ends. Returns the off switch. */
export function onFullscreenChange(fn: () => void): () => void {
  document.addEventListener('fullscreenchange', fn);
  return () => document.removeEventListener('fullscreenchange', fn);
}
