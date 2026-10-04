/**
 * Accessibility: the values live in `save.settings`, the effects live here.
 *
 *  - **Text size** scales every `--fs-*` type token on the page.
 *  - **Colour-blind rarity colours** swap `RARITY_COLOR` (and the matching
 *    `--r-*` CSS variables) for a palette every common colour-vision type can
 *    tell apart. The default palette puts magic and mythic within 2 ΔE of each
 *    other for deuteranopes, i.e. the same colour. `tools/check-access.mjs`
 *    measures both.
 *  - **Reduced motion** turns off screen shake and camera punch-ins, and
 *    stops CSS animation and transitions. It is also on whenever the system
 *    asks for reduced motion.
 *  - **Key rebinding** is a permutation of key codes applied where the key
 *    events come in (`Input` and the UI's panel hotkeys). Every caller keeps
 *    asking for `KeyI` or `Digit1`; the player's chosen key produces it.
 *    Rebinding always swaps, so no action is ever left without a key.
 *
 * Nothing here touches the DOM at import time, so it is safe under Node.
 */
import type { GameSettings, ItemRarity } from '../types';
import { RARITY_COLOR } from '../types';

// ---------------------------------------------------------------------------
// Rarity colours
// ---------------------------------------------------------------------------

/** The authored palette, captured before anything can swap it. */
export const DEFAULT_RARITY_COLOR: Readonly<Record<ItemRarity, number>> = { ...RARITY_COLOR };

/**
 * Searched for with `tools/lib/try-palettes.mjs`: every pair is at least
 * ~23 ΔE apart under protanopia, deuteranopia and tritanopia as well as
 * typical vision, each colour keeps its family (magic blue, rare yellow, set
 * green, unique amber, mythic violet, ancient red), and all reach 4.5:1
 * contrast on the panel background.
 */
export const COLORBLIND_RARITY_COLOR: Readonly<Record<ItemRarity, number>> = {
  normal: 0xb4b4b4,
  magic: 0x638afb,
  rare: 0xf3f06a,
  set: 0x08db75,
  unique: 0xeba100,
  mythic: 0xac6ca9,
  ancient: 0xe2422f,
};

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

/** Every action the player can move to another key, by its default code. */
export const REBINDABLE: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'KeyW', label: 'Move up' },
  { code: 'KeyS', label: 'Move down' },
  { code: 'KeyA', label: 'Move left' },
  { code: 'KeyD', label: 'Move right' },
  { code: 'Digit1', label: 'Skill 1' },
  { code: 'Digit2', label: 'Skill 2' },
  { code: 'Digit3', label: 'Skill 3' },
  { code: 'Digit4', label: 'Skill 4' },
  { code: 'Digit5', label: 'Skill 5' },
  { code: 'Digit6', label: 'Skill 6' },
  { code: 'KeyQ', label: 'Life potion' },
  { code: 'KeyF', label: 'Mana potion' },
  { code: 'Space', label: 'Dodge' },
  { code: 'KeyE', label: 'Interact' },
  { code: 'KeyI', label: 'Inventory' },
  { code: 'KeyC', label: 'Character' },
  { code: 'KeyT', label: 'Skill tree' },
  { code: 'KeyB', label: 'Vault' },
  { code: 'KeyM', label: 'Map' },
  { code: 'KeyL', label: 'Quest log' },
];

/** Keys that can never be taken: they are how you get out of things. */
export const RESERVED_KEYS: ReadonlySet<string> = new Set(['Escape', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'Tab', 'F5', 'F11', 'F12']);

/** physical key -> the code the game sees. Rebuilt by `applyAccessibility`. */
let keyMap = new Map<string, string>();

/** The code the game should see for a physical key press. */
export function remapKey(physical: string): string {
  return keyMap.get(physical) ?? physical;
}

/** The physical key currently producing `code`. */
export function keyFor(code: string, binds: Record<string, string> | undefined): string {
  return binds?.[code] ?? code;
}

/**
 * True when `binds` (default code -> physical code) is a valid permutation:
 * no two actions on one key, and every key some action moved away from is
 * picked up by another, so nothing is unreachable.
 */
export function bindsAreValid(binds: unknown): binds is Record<string, string> {
  if (!binds || typeof binds !== 'object' || Array.isArray(binds)) return false;
  const entries = Object.entries(binds as Record<string, unknown>);
  const from = new Set<string>();
  const to = new Set<string>();
  for (const [k, v] of entries) {
    if (typeof v !== 'string' || !v || RESERVED_KEYS.has(v) || RESERVED_KEYS.has(k)) return false;
    if (to.has(v)) return false;
    from.add(k);
    to.add(v);
  }
  // A permutation moves exactly the keys it takes.
  if (from.size !== to.size) return false;
  for (const k of from) if (!to.has(k)) return false;
  return true;
}

/**
 * Put the action whose default key is `code` on `physical`. Whatever was on
 * `physical` moves to the key this action leaves, so the result is always a
 * permutation. Returns the new map; the input is not modified.
 */
export function rebind(binds: Record<string, string> | undefined, code: string, physical: string): Record<string, string> {
  if (RESERVED_KEYS.has(physical) || RESERVED_KEYS.has(code)) return { ...(binds ?? {}) };
  // logical -> physical, for the actions that have moved. Absent means "on its own key".
  const phys = new Map<string, string>(Object.entries(binds ?? {}));
  // Which action is on `physical` now? In a permutation, either some moved
  // action, or the key's own action if nothing moved onto it.
  let other = physical;
  for (const [l, p] of phys) if (p === physical) other = l;
  if (other === code) return { ...(binds ?? {}) };
  const was = phys.get(code) ?? code;
  phys.set(code, physical);
  phys.set(other, was);
  const out: Record<string, string> = {};
  for (const [l, p] of phys) if (l !== p) out[l] = p;
  return out;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const TEXT_SCALE_MIN = 0.85;
export const TEXT_SCALE_MAX = 1.5;

/** True when the OS or browser asks for less motion. */
export function systemPrefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Reduced motion as it is actually in force: the setting, or the system's. */
export function reducedMotion(settings: GameSettings): boolean {
  return !!settings.reduceMotion || systemPrefersReducedMotion();
}

/** Screen shake as the camera should apply it, after reduced motion. */
export function effectiveShake(settings: GameSettings): number {
  return reducedMotion(settings) ? 0 : Math.max(0, Math.min(2, settings.screenShake ?? 1));
}

const FS_TOKENS = ['--fs-xs', '--fs-sm', '--fs-md', '--fs-lg', '--fs-xl', '--fs-2xl', '--fs-3xl', '--fs-4xl'];
let fsBase: Map<string, number> | null = null;
let motionStyle: HTMLStyleElement | null = null;

const hexCss = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/**
 * Apply every accessibility setting. Idempotent; call on boot and whenever
 * the settings change.
 */
export function applyAccessibility(settings: GameSettings): void {
  // Rarity palette: swapped in place, so every reader of RARITY_COLOR (drop
  // beams, labels, tooltips, icons drawn from now on) picks it up.
  const pal = settings.colorBlindRarity ? COLORBLIND_RARITY_COLOR : DEFAULT_RARITY_COLOR;
  for (const k of Object.keys(pal) as ItemRarity[]) RARITY_COLOR[k] = pal[k];

  // Keys.
  const binds = bindsAreValid(settings.keybinds) ? settings.keybinds : {};
  keyMap = new Map();
  for (const [code, physical] of Object.entries(binds)) keyMap.set(physical, code);

  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  for (const k of Object.keys(pal) as ItemRarity[]) root.style.setProperty(`--r-${k}`, hexCss(pal[k]));

  // Text size: scale the type tokens from the stylesheet's own values, read
  // once before the first override so a later change to the tokens is honoured.
  const scale = Math.max(TEXT_SCALE_MIN, Math.min(TEXT_SCALE_MAX, settings.textScale ?? 1));
  if (!fsBase) {
    fsBase = new Map();
    const cs = getComputedStyle(root);
    for (const t of FS_TOKENS) {
      const v = parseFloat(cs.getPropertyValue(t));
      if (Number.isFinite(v)) fsBase.set(t, v);
    }
  }
  for (const [t, px] of fsBase) {
    if (scale === 1) root.style.removeProperty(t);
    else root.style.setProperty(t, `${(px * scale).toFixed(2)}px`);
  }
  // For text sized in raw pixels: `calc(9px * var(--text-scale, 1))`.
  root.style.setProperty('--text-scale', String(scale));

  // Reduced motion: no CSS animation or transition anywhere in the UI.
  const reduce = reducedMotion(settings);
  root.classList.toggle('reduce-motion', reduce);
  if (reduce && !motionStyle) {
    motionStyle = document.createElement('style');
    motionStyle.id = 'reduce-motion-style';
    motionStyle.textContent =
      '.reduce-motion *, .reduce-motion *::before, .reduce-motion *::after {' +
      ' animation-duration: 0.001ms !important; animation-iteration-count: 1 !important;' +
      ' transition-duration: 0.001ms !important; scroll-behavior: auto !important; }';
    document.head.appendChild(motionStyle);
  }
}
