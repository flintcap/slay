import { stackCount } from '../sim/Inventory';
import { itemIconUri, requestItemIcon } from '../art/Icons';
import { ONE_HAND_MELEE } from '../data/itemBases';
import { equipRules } from '../data/classes';
import { save } from '../core/Save';
/**
 * SLAY — UI widget kit.
 *
 * Plain DOM, zero framework, zero external assets. Everything visual here is
 * either an inline SVG path authored in this file or a CSS class defined in
 * `styles.css`. This module is the leaf of the UI dependency graph: panels
 * import it, it imports nothing from `ui/`. That keeps the module graph acyclic
 * and lets `Tooltip` register itself through `hoverHooks` instead of being
 * imported by every slot.
 */

import type {
  Item,
  ItemRarity,
  EquipSlot,
  ItemBase,
  StatKey,
  SkillDef,
  SkillTreeDef,
  CharClassId,
  CharClassDef,
  DungeonLevel,
  ItemCategory,
} from '../types';
import { RARITY_COLOR } from '../types';
import { getBase } from '../sim/Loot';
import { CLASSES } from '../data/classes';
import * as SkillData from '../data/skills';

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

/** Terse element factory. `cls` may carry several space-separated classes. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function div(cls?: string, text?: string): HTMLDivElement {
  return el('div', cls, text);
}

export function span(cls?: string, text?: string): HTMLSpanElement {
  return el('span', cls, text);
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Appends children, skipping nulls so callers can inline conditionals. */
export function add<T extends Element>(parent: T, ...kids: Array<Node | null | undefined>): T {
  for (const k of kids) if (k) parent.appendChild(k);
  return parent;
}

/** Row helper — a flex line with an optional gap class. */
export function row(cls = ''): HTMLDivElement {
  return div(`row ${cls}`.trim());
}

/** Marks a subtree as interactive so it blocks world clicks. */
export function interactive<T extends HTMLElement>(node: T): T {
  node.classList.add('ui-interactive');
  return node;
}

// ---------------------------------------------------------------------------
// Colour / number formatting
// ---------------------------------------------------------------------------

export function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

export function rarityHex(r: ItemRarity): string {
  return hex(RARITY_COLOR[r] ?? RARITY_COLOR.normal);
}

/** `rgba()` string from a packed hex int — used for glows and gradients. */
export function rgba(n: number, a: number): string {
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function mixHex(a: number, b: number, t: number): string {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

/** 12345 -> "12,345"; 1234567 -> "1.23M". Keeps stat columns narrow. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 10000) return `${Math.round(n).toLocaleString('en-US')}`;
  if (abs >= 100) return String(Math.round(n));
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function signed(n: number, decimals = 0): string {
  const v = decimals ? n.toFixed(decimals) : String(Math.round(n));
  return n > 0 ? `+${v}` : v;
}

export function pct(n: number, decimals = 0): string {
  return `${n.toFixed(decimals)}%`;
}

/** 3725 -> "1h 02m". Used for playtime and long timers. */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

export function timeAgo(ms: number): string {
  const d = Math.max(0, Date.now() - ms);
  const mins = Math.floor(d / 60000);
  if (mins < 1) return 'moments ago';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Icons — every glyph in the game is one of these strings.
// ---------------------------------------------------------------------------

/**
 * Icon bodies for a 24x24 viewBox. The wrapper supplies
 * `fill="none" stroke="currentColor"`, so an icon only opts into fills where it
 * wants a solid mass (hearts, flames, gems).
 */
export const ICONS: Record<string, string> = {
  // --- weapons -------------------------------------------------------------
  sword:
    '<path d="M20.6 3.4 10.9 13.1"/><path d="M16.8 3.4h3.8v3.8"/><path d="M6.6 13.2l4.2 4.2"/><path d="M8.7 15.3 4.1 19.9"/><path d="M2.4 21.6 4.4 19.6"/><path d="M3.2 17.2 6.8 20.8"/>',
  axe:
    '<path d="M11.6 3.6c4 .6 6.9 3.6 7.4 7.6l-4 3.4c-.4-4-2.9-6.6-6.8-7.4z" fill="currentColor" stroke="none"/><path d="M11.6 3.6c4 .6 6.9 3.6 7.4 7.6l-4 3.4c-.4-4-2.9-6.6-6.8-7.4z"/><path d="M9.6 9.4 3.4 19.6"/><path d="M2.2 21.4l1.6-2.6 2.2 1.3-1.6 2.5z"/>',
  mace:
    '<path d="M13.1 10.9 4.2 19.8"/><path d="M2.6 21.4 4.2 19.8"/><circle cx="16.4" cy="7.6" r="3.7"/><path d="M16.4 1.6v2.3M16.4 11.3v2.3M10.4 7.6h2.3M20.1 7.6h2.3M12.2 3.4l1.6 1.6M19 10.2l1.6 1.6M20.6 3.4 19 5M13.8 10.2 12.2 11.8"/>',
  dagger:
    '<path d="M17.4 3.6 11.6 9.4"/><path d="M14.6 3.6h2.9v2.9"/><path d="M8.6 9.6l4 4"/><path d="M10.2 12.4 6.6 16"/><path d="M5.2 17.6l1.6-1.6"/>',
  spear:
    '<path d="M20.8 3.2 15 5l3 3z" fill="currentColor" stroke="none"/><path d="M20.8 3.2 15 5l3 3z"/><path d="M16.2 7 4.4 18.8"/><path d="M2.6 21.4l1.4-2.4 2 1.2z"/><path d="M12.4 7.2 15.8 10.6"/>',
  bow:
    '<path d="M6.5 3.2a13.5 13.5 0 0 1 0 17.6"/><path d="M6.5 3.2 6.5 20.8"/><path d="M6.5 12h12"/><path d="M15.4 9.2 18.6 12l-3.2 2.8"/>',
  crossbow:
    '<path d="M3.4 6.6c3 3.4 5.6 5 8.6 5s5.6-1.6 8.6-5"/><path d="M12 9.4V21"/><path d="M8.6 13.2h6.8"/><path d="M3.4 6.6 5 4.4M20.6 6.6 19 4.4"/>',
  wand:
    '<path d="M5.4 19.6 14.6 10.4"/><path d="M17.4 3.2l1.1 2.9 2.9 1.1-2.9 1.1-1.1 2.9-1.1-2.9-2.9-1.1 2.9-1.1z" fill="currentColor" stroke="none"/><path d="M8.2 8.2l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6z" fill="currentColor" stroke="none"/>',
  staff:
    '<path d="M7.4 21.4 14 6.6"/><circle cx="15.8" cy="4.2" r="2.6"/><path d="M11.8 8.4 14.6 9.8"/><path d="M9.6 14.2 12.4 15.6"/>',
  scepter:
    '<path d="M9.4 21.4 13.6 8.6"/><path d="M15 2.6l2.8 3.2-2 3.4-3.6-.6-.8-3.6z" fill="currentColor" stroke="none"/><path d="M15 2.6l2.8 3.2-2 3.4-3.6-.6-.8-3.6z"/><path d="M10.6 11.4 15.4 13"/>',
  shield:
    '<path d="M12 2.4 20 5.4v5.9c0 5.1-3.9 8.7-8 10.3-4.1-1.6-8-5.2-8-10.3V5.4z"/><path d="M12 6.2v11.4"/><path d="M7 9.6h10"/>',
  orb:
    '<circle cx="12" cy="12" r="7.6"/><path d="M7.4 7.8a6.4 6.4 0 0 1 4-2.2"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" opacity=".55"/>',
  quiver:
    '<path d="M7.6 8.4h8.8l-1.2 12.2H8.8z"/><path d="M9.4 8.4 11 2.6M14.6 8.4 13 2.6"/><path d="M11 5.4 9.2 3.6M13 5.4l1.8-1.8"/>',
  // --- armour --------------------------------------------------------------
  helm:
    '<path d="M4.4 13.6a7.6 7.6 0 0 1 15.2 0v5.8H4.4z"/><path d="M9.4 13.6v5.8M14.6 13.6v5.8"/><path d="M4.4 16.4h15.2"/>',
  chest:
    '<path d="M5 6.4 9.2 4.2 12 5.8l2.8-1.6L19 6.4l-.9 6.2c0 4.9-2.6 7.6-6.1 8.9-3.5-1.3-6.1-4-6.1-8.9z"/><path d="M12 5.8v15.7"/><path d="M6.4 11.6h11.2"/>',
  gloves:
    '<path d="M8 21v-7.6a1.9 1.9 0 0 1 3.8 0V6.6a1.6 1.6 0 0 1 3.2 0v5.8"/><path d="M15 12.4v-2a1.6 1.6 0 0 1 3.2 0v6.2c0 2.6-1.6 4.4-3.4 4.4H8"/><path d="M8 15.2 5.6 13"/>',
  boots:
    '<path d="M8.4 3h4.4v8.4c0 1.8 1.8 2.8 3.6 3.6l2.6 1.2v4.8H8.4z"/><path d="M8.4 17h11"/><path d="M12.8 8.2h-4.4"/>',
  belt:
    '<path d="M2.6 9.2h18.8v5.6H2.6z"/><path d="M9.4 9.2v5.6M14.6 9.2v5.6"/><path d="M11.2 11.2h1.6v1.6h-1.6z" fill="currentColor" stroke="none"/>',
  amulet:
    '<path d="M6.6 3.2 12 11M17.4 3.2 12 11"/><path d="m12 11.6 3.6 3.4-3.6 5.4-3.6-5.4z"/>',
  ring:
    '<circle cx="12" cy="14.4" r="6"/><circle cx="12" cy="14.4" r="3.2"/><path d="m12 2.6 2.6 3-2.6 2.8L9.4 5.6z" fill="currentColor" stroke="none"/>',
  charm:
    '<rect x="5.4" y="3.4" width="13.2" height="17.2" rx="2.4"/><path d="m12 7.4 1.3 3.3 3.3 1.3-3.3 1.3-1.3 3.3-1.3-3.3-3.3-1.3 3.3-1.3z" fill="currentColor" stroke="none"/>',
  gem:
    '<path d="m12 2.4 7.6 5.4L16.6 21H7.4L4.4 7.8z"/><path d="M4.4 7.8h15.2M12 2.4 8.6 7.8 12 21l3.4-13.2z"/>',
  rune:
    '<path d="M5.6 3.4h12.8v17.2H5.6z"/><path d="M9 7.4v9.2M9 11.4l5.4-4M9 12.6l5.4 4"/>',
  potion:
    '<path d="M9.6 2.8h4.8v4l3.6 7.4a4.2 4.2 0 0 1-3.8 6H9.8a4.2 4.2 0 0 1-3.8-6l3.6-7.4z"/><path d="M7.4 14.4h9.2"/><path d="M9.6 2.8h4.8"/>',
  material:
    '<path d="m7 3.6 5.4 2.2-1.4 5.4-5.4-1.6z" fill="currentColor" stroke="none" opacity=".65"/><path d="m14.6 9.6 5 2.4-1.8 5.6-5-1.8z"/><path d="m5.6 13.4 5.2 2-1.4 5.4-4.8-1.8z"/>',
  // --- attributes ----------------------------------------------------------
  strength:
    '<path d="M3 9.4v5.2M6.2 6.8v10.4M17.8 6.8v10.4M21 9.4v5.2"/><path d="M6.2 12h11.6"/>',
  dexterity:
    '<path d="M21 3 8.2 15.8"/><path d="M16.4 3H21v4.6"/><path d="m3 21 4.4-4.4"/><path d="M3.4 15.6 8.4 20.6"/>',
  vitality:
    '<path d="M12 20.8S3.8 15.5 3.8 9.9A4.6 4.6 0 0 1 12 7.1a4.6 4.6 0 0 1 8.2 2.8c0 5.6-8.2 10.9-8.2 10.9z" fill="currentColor" stroke="none"/>',
  energy:
    '<path d="m12 2.2 2.3 6.1 6.1 2.3-6.1 2.3-2.3 6.1-2.3-6.1-6.1-2.3 6.1-2.3z" fill="currentColor" stroke="none"/><path d="M18.6 16.6l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z" fill="currentColor" stroke="none" opacity=".6"/>',
  // --- damage types --------------------------------------------------------
  physical:
    '<path d="M4.4 4.4 15 15M4.4 8.2V4.4h3.8"/><path d="M19.6 4.4 9 15M19.6 8.2V4.4h-3.8"/><path d="m7.6 17.4 2.6 2.6M16.4 17.4l-2.6 2.6"/>',
  fire:
    '<path d="M12 21.6c3.9 0 6.4-2.6 6.4-6.2 0-4.2-4.4-5.6-3.4-11-3.2 1.6-5.2 4.4-5.2 6.6 0-1.2-.9-2.3-2-3.2-1.1 2.1-2.2 4.3-2.2 7.6 0 3.6 2.5 6.2 6.4 6.2z" fill="currentColor" stroke="none"/>',
  cold:
    '<path d="M12 2.4v19.2M3.7 7.2l16.6 9.6M20.3 7.2 3.7 16.8"/><path d="M9.4 4.6 12 7.2l2.6-2.6M9.4 19.4 12 16.8l2.6 2.6"/><path d="m6.1 8.8-.6-3.5 3.5.6M17.9 15.2l.6 3.5-3.5-.6M17.9 8.8l.6-3.5-3.5.6M6.1 15.2l-.6 3.5 3.5-.6"/>',
  lightning:
    '<path d="M13.6 1.8 4.8 13.4h5.2L8.8 22.2l9.2-12.2h-5.4z" fill="currentColor" stroke="none"/>',
  poison:
    '<path d="M12 2.8s6 6.6 6 10.4a6 6 0 0 1-12 0C6 9.4 12 2.8 12 2.8z" fill="currentColor" stroke="none" opacity=".85"/><circle cx="10" cy="12.6" r="1.3" fill="#0b0d08" stroke="none"/><circle cx="14" cy="15" r="1" fill="#0b0d08" stroke="none"/>',
  arcane:
    '<path d="m12 2 2 6.4L20.4 6l-4 5.4 5.6 3.2-6.6.6 1.4 6.6-4.8-4.6-4.8 4.6L8.6 15.2 2 14.6l5.6-3.2-4-5.4L10 8.4z" fill="currentColor" stroke="none" opacity=".9"/>',
  // --- derived stats -------------------------------------------------------
  attack: '<path d="M20.6 3.4 10.9 13.1"/><path d="M16.8 3.4h3.8v3.8"/><path d="M6.6 13.2l4.2 4.2"/><path d="M8.7 15.3 4.1 19.9"/>',
  defense: '<path d="M12 2.4 20 5.4v5.9c0 5.1-3.9 8.7-8 10.3-4.1-1.6-8-5.2-8-10.3V5.4z"/><path d="m8.4 11.8 2.6 2.8 4.6-5.2"/>',
  crit:
    '<path d="m12 2.6 2.1 5.8 5.9-1.4-3.6 4.9 4.4 3.4-6 .5.9 5.9-3.7-4.5-3.7 4.5.9-5.9-6-.5 4.4-3.4L4 7z" fill="currentColor" stroke="none"/>',
  speed: '<path d="m5 5.6 6.4 6.4L5 18.4M13 5.6 19.4 12 13 18.4"/>',
  block: '<path d="M12 2.4 20 5.4v5.9c0 5.1-3.9 8.7-8 10.3-4.1-1.6-8-5.2-8-10.3V5.4z"/><path d="M4 11.4h16"/>',
  life: '<path d="M12 20.8S3.8 15.5 3.8 9.9A4.6 4.6 0 0 1 12 7.1a4.6 4.6 0 0 1 8.2 2.8c0 5.6-8.2 10.9-8.2 10.9z" fill="currentColor" stroke="none"/>',
  mana: '<path d="M12 2.8s6 6.6 6 10.4a6 6 0 0 1-12 0C6 9.4 12 2.8 12 2.8z" fill="currentColor" stroke="none"/>',
  regen: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20.4 3.6v4.2h-4.2"/><path d="M12 8.4v7.2M8.4 12h7.2"/>',
  magicFind:
    '<path d="m12 3.4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.1l5.4-.8z"/><path d="m18.6 17 .7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" fill="currentColor" stroke="none"/>',
  goldFind:
    '<ellipse cx="12" cy="6.6" rx="7.4" ry="3.2"/><path d="M4.6 6.6v4.8c0 1.8 3.3 3.2 7.4 3.2s7.4-1.4 7.4-3.2V6.6"/><path d="M4.6 11.4v4.8c0 1.8 3.3 3.2 7.4 3.2s7.4-1.4 7.4-3.2v-4.8"/>',
  cooldown: '<circle cx="12" cy="12.6" r="8.4"/><path d="M12 7.8v4.8l3.2 2"/><path d="M9.2 2.4h5.6"/>',
  moveSpeed: '<path d="M4 8.4h8M4 12h11M4 15.6h6"/><path d="m16.6 7.4 4.4 4.6-4.4 4.6"/>',
  skillLevels:
    '<path d="m12 2.6 8.4 4.6v9.6L12 21.4 3.6 16.8V7.2z"/><path d="m12 8.2 3.4 1.9v3.8L12 15.8l-3.4-1.9v-3.8z" fill="currentColor" stroke="none" opacity=".7"/>',
  resist: '<path d="M12 2.4 20 5.4v5.9c0 5.1-3.9 8.7-8 10.3-4.1-1.6-8-5.2-8-10.3V5.4z"/><path d="M5 13c2.4-2.2 4.3 2.2 7 0s4.4 2.2 7 0"/>',
  // --- interface -----------------------------------------------------------
  close: '<path d="M6.4 6.4 17.6 17.6M17.6 6.4 6.4 17.6"/>',
  plus: '<path d="M12 5.2v13.6M5.2 12h13.6"/>',
  minus: '<path d="M5.2 12h13.6"/>',
  check: '<path d="m4.6 12.6 5 5.2L19.4 6.4"/>',
  lock: '<rect x="4.8" y="10.4" width="14.4" height="10.4" rx="1.8"/><path d="M8.2 10.4V7.8a3.8 3.8 0 0 1 7.6 0v2.6"/><circle cx="12" cy="15.4" r="1.5" fill="currentColor" stroke="none"/>',
  search: '<circle cx="10.6" cy="10.6" r="6.4"/><path d="m15.4 15.4 5 5"/>',
  gear:
    '<circle cx="12" cy="12" r="3.4"/><path d="M12 2.6v3.2M12 18.2v3.2M21.4 12h-3.2M5.8 12H2.6M18.6 5.4l-2.3 2.3M7.7 16.3l-2.3 2.3M18.6 18.6l-2.3-2.3M7.7 7.7 5.4 5.4"/>',
  map: '<path d="m9 4.2-6 2.4v13.2l6-2.4 6 2.4 6-2.4V4.2l-6 2.4z"/><path d="M9 4.2v13.2M15 6.6v13.2"/>',
  book: '<path d="M4.4 5.6A3 3 0 0 1 7.4 2.6h12.2v15.6H7.4a3 3 0 0 0-3 3z"/><path d="M7.4 18.2h12.2"/><path d="M9 6.6h7M9 9.8h7"/>',
  bag: '<path d="M5.4 8h13.2l1.2 12.6H4.2z"/><path d="M8.6 8V6.4a3.4 3.4 0 0 1 6.8 0V8"/>',
  stash: '<rect x="3" y="6.4" width="18" height="13.6" rx="1.8"/><path d="M3 11.6h18"/><path d="M9.6 11.6v3.2h4.8v-3.2"/><path d="M6.4 6.4 8 3.4h8l1.6 3"/>',
  anvil: '<path d="M4.4 8.6h11.2c0 2.2 1.6 3 4 3.4l-1.4 3.4H8.8L4.4 12z"/><path d="M9.4 15.4h5.2l1.4 5.2H8z"/><path d="M6 20.6h12"/>',
  coin: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="4.6"/><path d="M8.6 7.4 6.4 5.2"/>',
  skull:
    '<path d="M12 2.6c-4.7 0-8 3.4-8 7.8 0 2.6 1.2 4.2 2.6 5.2v3.2h10.8v-3.2c1.4-1 2.6-2.6 2.6-5.2 0-4.4-3.3-7.8-8-7.8z"/><circle cx="8.8" cy="10.6" r="1.9" fill="currentColor" stroke="none"/><circle cx="15.2" cy="10.6" r="1.9" fill="currentColor" stroke="none"/><path d="M10.4 18.8v2.6M13.6 18.8v2.6"/>',
  chevronDown: '<path d="m6.4 9.4 5.6 5.6 5.6-5.6"/>',
  chevronRight: '<path d="m9.4 6.4 5.6 5.6-5.6 5.6"/>',
  chevronLeft: '<path d="M14.6 6.4 9 12l5.6 5.6"/>',
  star: '<path d="m12 3 2.6 5.8 6.4.7-4.8 4.3 1.4 6.2-5.6-3.2-5.6 3.2 1.4-6.2L3 9.5l6.4-.7z"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11v6"/><circle cx="12" cy="7.6" r="1.1" fill="currentColor" stroke="none"/>',
  warn: '<path d="M12 3.4 21.4 20H2.6z"/><path d="M12 9.4v5"/><circle cx="12" cy="17" r="1.1" fill="currentColor" stroke="none"/>',
  trash: '<path d="M4.6 6.6h14.8"/><path d="M8.6 6.6V4.4h6.8v2.2"/><path d="M6.4 6.6 7.4 20.6h9.2l1-14"/><path d="M10.4 10.4v6M13.6 10.4v6"/>',
  filter: '<path d="M3.2 5.2h17.6l-6.8 8v6l-4-2.2v-3.8z"/>',
  descend: '<path d="M3.4 5.6h4.8v4.4H13v4.4h4.8V19H22"/><path d="M17.4 15.6 20 18.2l2.6-2.6"/>',
  quest: '<path d="M6.4 2.6h11.2v18.8L12 17.8l-5.6 3.6z"/><path d="M9.6 8.6h4.8M9.6 12h4.8"/>',
  hourglass: '<path d="M6.4 3h11.2M6.4 21h11.2"/><path d="M7.6 3v3.4c0 2.4 4.4 3.9 4.4 5.6s-4.4 3.2-4.4 5.6V21"/><path d="M16.4 3v3.4c0 2.4-4.4 3.9-4.4 5.6s4.4 3.2 4.4 5.6V21"/>',
  sparkle:
    '<path d="m12 3 1.9 5.1 5.1 1.9-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" fill="currentColor" stroke="none"/><path d="m18.4 15.6.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z" fill="currentColor" stroke="none" opacity=".65"/>',
  hammer: '<path d="m14.4 2.6 7 7-3 3-7-7z"/><path d="m11.2 7.8-8.6 8.6 3.4 3.4L14.6 11"/>',
  scroll: '<path d="M5.6 4.6h12.8v13.6a2.8 2.8 0 0 0 2.8 2.8H8.4a2.8 2.8 0 0 1-2.8-2.8z"/><path d="M8.8 8.4h6.4M8.8 12h6.4"/><path d="M5.6 4.6a2.4 2.4 0 0 0-2.4 2.4v1.4h2.4"/>',
  eye: '<path d="M2.2 12S6 5.6 12 5.6 21.8 12 21.8 12 18 18.4 12 18.4 2.2 12 2.2 12z"/><circle cx="12" cy="12" r="3"/>',
  target: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="3.4"/><path d="M12 1.6v3.4M12 19v3.4M1.6 12H5M19 12h3.4"/>',
  exit: '<path d="M14.4 3.6H5.6v16.8h8.8"/><path d="M10.6 12h10.2"/><path d="m17.4 8.6 3.4 3.4-3.4 3.4"/>',
  play: '<path d="m7.4 4.4 12 7.6-12 7.6z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 4.6h3v14.8H8zM13 4.6h3v14.8h-3z" fill="currentColor" stroke="none"/>',
  upload: '<path d="M4.4 15.6v3.4a1.6 1.6 0 0 0 1.6 1.6h12a1.6 1.6 0 0 0 1.6-1.6v-3.4"/><path d="M12 3.4v11.4"/><path d="m7.8 7.6 4.2-4.2 4.2 4.2"/>',
  download: '<path d="M4.4 15.6v3.4a1.6 1.6 0 0 0 1.6 1.6h12a1.6 1.6 0 0 0 1.6-1.6v-3.4"/><path d="M12 14.8V3.4"/><path d="m7.8 10.6 4.2 4.2 4.2-4.2"/>',
};

export interface IconOpts {
  size?: number;
  stroke?: number;
  cls?: string;
  color?: string;
}

/** Raw SVG markup for an icon. Falls back to a neutral rune mark. */
export function iconSvg(name: string, opts: IconOpts = {}): string {
  const body = ICONS[name] ?? ICONS.rune;
  const size = opts.size ?? 18;
  const sw = opts.stroke ?? 1.6;
  const style = opts.color ? ` style="color:${opts.color}"` : '';
  return (
    `<svg class="icon ${opts.cls ?? ''}" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true"${style}>${body}</svg>`
  );
}

/** Icon as an element, ready to append. */
export function icon(name: string, opts: IconOpts = {}): HTMLSpanElement {
  const s = span('ico');
  s.innerHTML = iconSvg(name, opts);
  return s;
}

// ---------------------------------------------------------------------------
// Procedural sigils — deterministic per-skill emblems, no art assets.
// ---------------------------------------------------------------------------

function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * A unique, repeatable emblem for any string id. Used for skills so every node
 * in the tree reads as its own thing without a single image file.
 */
export function sigilSvg(seed: string, accent: string, size = 40): string {
  let h = hashStr(seed);
  const rnd = (): number => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 4294967296;
  };
  const cx = 24;
  const cy = 24;
  const points = 3 + Math.floor(rnd() * 5); // 3..7
  const rot = rnd() * Math.PI * 2;
  const r1 = 9 + rnd() * 4;
  const r2 = 15 + rnd() * 4;

  let poly = '';
  for (let i = 0; i < points; i++) {
    const a = rot + (i / points) * Math.PI * 2;
    const rr = i % 2 === 0 ? r2 : r1;
    poly += `${i === 0 ? 'M' : 'L'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`;
  }
  poly += 'Z';

  // Two or three angular strokes across the middle read as a carved rune.
  let runes = '';
  const strokes = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < strokes; i++) {
    const a1 = rnd() * Math.PI * 2;
    const a2 = a1 + 1.4 + rnd() * 2.4;
    const rr = 5 + rnd() * 5;
    runes +=
      `<path d="M${(cx + Math.cos(a1) * rr).toFixed(1)} ${(cy + Math.sin(a1) * rr).toFixed(1)} ` +
      `L${cx} ${cy} L${(cx + Math.cos(a2) * rr).toFixed(1)} ${(cy + Math.sin(a2) * rr).toFixed(1)}" ` +
      `fill="none" stroke="${accent}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  const ring = rnd() > 0.45
    ? `<circle cx="${cx}" cy="${cy}" r="${(r2 + 2.5).toFixed(1)}" fill="none" stroke="${accent}" stroke-width="1" opacity=".38"/>`
    : '';

  return (
    `<svg class="sigil" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">` +
    `<defs><radialGradient id="sg${h & 0xffff}" cx="50%" cy="42%" r="62%">` +
    `<stop offset="0%" stop-color="${accent}" stop-opacity=".55"/>` +
    `<stop offset="100%" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs>` +
    `<circle cx="${cx}" cy="${cy}" r="21" fill="url(#sg${h & 0xffff})"/>` +
    ring +
    `<path d="${poly}" fill="${accent}" fill-opacity=".16" stroke="${accent}" stroke-width="1.5" stroke-linejoin="round"/>` +
    runes +
    `</svg>`
  );
}

/** Class emblem — larger, more ornate variant used on the selection cards. */
export function classCrestSvg(id: string, accent: string, size = 96): string {
  let h = hashStr(`crest:${id}`);
  const rnd = (): number => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 4294967296;
  };
  const arms = 5 + Math.floor(rnd() * 3);
  let rays = '';
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2 - Math.PI / 2;
    const x1 = 48 + Math.cos(a) * 14;
    const y1 = 48 + Math.sin(a) * 14;
    const x2 = 48 + Math.cos(a) * 33;
    const y2 = 48 + Math.sin(a) * 33;
    rays += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${accent}" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>`;
    const bx = 48 + Math.cos(a + 0.16) * 24;
    const by = 48 + Math.sin(a + 0.16) * 24;
    rays += `<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="2" fill="${accent}" opacity=".55"/>`;
  }
  return (
    `<svg class="crest" width="${size}" height="${size}" viewBox="0 0 96 96" aria-hidden="true">` +
    `<defs><radialGradient id="cg${id}" cx="50%" cy="50%" r="55%">` +
    `<stop offset="0%" stop-color="${accent}" stop-opacity=".38"/>` +
    `<stop offset="100%" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs>` +
    `<circle cx="48" cy="48" r="44" fill="url(#cg${id})"/>` +
    `<circle cx="48" cy="48" r="35" fill="none" stroke="${accent}" stroke-width="1" opacity=".45"/>` +
    `<circle cx="48" cy="48" r="30" fill="none" stroke="${accent}" stroke-width="2.2" opacity=".85"/>` +
    rays +
    `<circle cx="48" cy="48" r="11" fill="${accent}" fill-opacity=".22" stroke="${accent}" stroke-width="1.6"/>` +
    `</svg>`
  );
}

// ---------------------------------------------------------------------------
// Stat vocabulary
// ---------------------------------------------------------------------------

export const STAT_LABEL: Record<StatKey, string> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  vitality: 'Vitality',
  energy: 'Energy',
  life: 'Life',
  mana: 'Mana',
  lifeRegen: 'Life Regeneration',
  manaRegen: 'Mana Regeneration',
  attackRating: 'Attack Rating',
  minDamage: 'Minimum Damage',
  maxDamage: 'Maximum Damage',
  attackSpeed: 'Attack Speed',
  castSpeed: 'Cast Speed',
  critChance: 'Critical Chance',
  critDamage: 'Critical Damage',
  lifeSteal: 'Life Steal',
  manaSteal: 'Mana Steal',
  defense: 'Defense',
  blockChance: 'Block Chance',
  damageReduction: 'Damage Reduction',
  physicalResist: 'Physical Resistance',
  fireResist: 'Fire Resistance',
  coldResist: 'Cold Resistance',
  lightningResist: 'Lightning Resistance',
  poisonResist: 'Poison Resistance',
  arcaneResist: 'Arcane Resistance',
  fireDamage: 'Fire Damage',
  coldDamage: 'Cold Damage',
  lightningDamage: 'Lightning Damage',
  poisonDamage: 'Poison Damage',
  arcaneDamage: 'Arcane Damage',
  enhancedDamage: 'Enhanced Damage',
  enhancedDefense: 'Enhanced Defense',
  elementalDamagePct: 'Elemental Damage',
  areaDamagePct: 'Area Damage',
  moveSpeed: 'Movement Speed',
  magicFind: 'Magic Find',
  goldFind: 'Gold Find',
  cooldownReduction: 'Cooldown Reduction',
  skillLevels: 'All Skills',
};

/** Stats rendered as a percentage rather than a flat number. */
export const PERCENT_STATS = new Set<StatKey>([
  'attackSpeed',
  'castSpeed',
  'critChance',
  'critDamage',
  'lifeSteal',
  'manaSteal',
  'blockChance',
  'damageReduction',
  'physicalResist',
  'fireResist',
  'coldResist',
  'lightningResist',
  'poisonResist',
  'arcaneResist',
  'enhancedDamage',
  'enhancedDefense',
  'elementalDamagePct',
  'areaDamagePct',
  'moveSpeed',
  'magicFind',
  'goldFind',
  'cooldownReduction',
]);

export const STAT_ICON: Partial<Record<StatKey, string>> = {
  strength: 'strength',
  dexterity: 'dexterity',
  vitality: 'vitality',
  energy: 'energy',
  life: 'life',
  mana: 'mana',
  lifeRegen: 'regen',
  manaRegen: 'regen',
  attackRating: 'target',
  minDamage: 'sword',
  maxDamage: 'sword',
  attackSpeed: 'speed',
  castSpeed: 'speed',
  critChance: 'crit',
  critDamage: 'crit',
  lifeSteal: 'life',
  manaSteal: 'mana',
  defense: 'defense',
  blockChance: 'block',
  damageReduction: 'shield',
  physicalResist: 'physical',
  fireResist: 'fire',
  coldResist: 'cold',
  lightningResist: 'lightning',
  poisonResist: 'poison',
  arcaneResist: 'arcane',
  fireDamage: 'fire',
  coldDamage: 'cold',
  lightningDamage: 'lightning',
  poisonDamage: 'poison',
  arcaneDamage: 'arcane',
  enhancedDamage: 'attack',
  enhancedDefense: 'defense',
  elementalDamagePct: 'sparkle',
  areaDamagePct: 'target',
  moveSpeed: 'moveSpeed',
  magicFind: 'magicFind',
  goldFind: 'goldFind',
  cooldownReduction: 'cooldown',
  skillLevels: 'skillLevels',
};

export function formatStatValue(stat: StatKey, value: number): string {
  if (PERCENT_STATS.has(stat)) return `${value >= 0 ? '' : ''}${fmt(value)}%`;
  return fmt(value);
}

// ---------------------------------------------------------------------------
// Item helpers
// ---------------------------------------------------------------------------

/** `getBase` may throw for a corrupted save; the UI must never die from that. */
export function safeBase(item: Item | null | undefined): ItemBase | null {
  if (!item) return null;
  try {
    return getBase(item.baseId) ?? null;
  } catch {
    return null;
  }
}

export function itemCategory(item: Item | null): ItemCategory | null {
  return safeBase(item)?.category ?? null;
}

export function itemIconName(item: Item | null): string {
  const cat = itemCategory(item);
  if (!cat) return 'material';
  return ICONS[cat] ? cat : 'material';
}

/** Equip slots an item may legally occupy. Empty means "not equippable". */
export function slotsFor(item: Item | null): EquipSlot[] {
  const base = safeBase(item);
  if (!base) return [];
  const s = base.slot;
  if (s === 'none' || s === 'consumable') return [];
  if (s === 'twoHand') return ['mainHand'];
  if (s === 'ring1' || s === 'ring2') return ['ring1', 'ring2'];

  // Dual-wielding classes can drop a one-handed melee weapon in the off hand,
  // so the drag target has to light up for it.
  const c = save.account.current;
  if (c && s === 'mainHand' && ONE_HAND_MELEE.has(base.category) && equipRules(c.classId).dualWield) {
    return ['mainHand', 'offHand'];
  }
  return [s];
}

export function isTwoHanded(item: Item | null): boolean {
  return safeBase(item)?.slot === 'twoHand';
}

export const SLOT_LABEL: Record<EquipSlot, string> = {
  mainHand: 'Main Hand',
  offHand: 'Off Hand',
  helm: 'Helm',
  chest: 'Body Armour',
  gloves: 'Gloves',
  boots: 'Boots',
  belt: 'Belt',
  amulet: 'Amulet',
  ring1: 'Ring',
  ring2: 'Ring',
};

export const SLOT_ICON: Record<EquipSlot, string> = {
  mainHand: 'sword',
  offHand: 'shield',
  helm: 'helm',
  chest: 'chest',
  gloves: 'gloves',
  boots: 'boots',
  belt: 'belt',
  amulet: 'amulet',
  ring1: 'ring',
  ring2: 'ring',
};

// ---------------------------------------------------------------------------
// Game-data access (tolerant of the exact export names the data modules chose)
// ---------------------------------------------------------------------------

const SD = SkillData as unknown as Record<string, unknown>;

function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === 'object') return Object.values(v as Record<string, T>);
  return [];
}

let skillCache: SkillDef[] | null = null;
let treeCache: SkillTreeDef[] | null = null;

export function allSkills(): SkillDef[] {
  if (skillCache) return skillCache;
  const raw = SD.SKILLS ?? SD.ALL_SKILLS ?? SD.SKILL_LIST ?? SD.skills;
  skillCache = asArray<SkillDef>(raw).filter((s) => s && typeof s.id === 'string');
  return skillCache;
}

export function allTrees(): SkillTreeDef[] {
  if (treeCache) return treeCache;
  const raw = SD.SKILL_TREES ?? SD.TREES ?? SD.SKILLTREES ?? SD.trees;
  treeCache = asArray<SkillTreeDef>(raw).filter((t) => t && typeof t.id === 'string');
  return treeCache;
}

export function skillById(id: string): SkillDef | null {
  for (const s of allSkills()) if (s.id === id) return s;
  return null;
}

export function treeById(id: string): SkillTreeDef | null {
  for (const t of allTrees()) if (t.id === id) return t;
  return null;
}

export function skillsInTree(treeId: string): SkillDef[] {
  return allSkills().filter((s) => s.treeId === treeId);
}

export function classById(id: CharClassId): CharClassDef | null {
  for (const c of CLASSES) if (c.id === id) return c;
  return null;
}

export function classList(): CharClassDef[] {
  return CLASSES;
}

export function classAccent(id: CharClassId | undefined): string {
  if (!id) return '#c9a227';
  return hex(classById(id)?.color ?? 0xc9a227);
}

/** Safe call into a data module function that may not exist yet. */
export function attempt<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Runtime bridge — live gameplay values the HUD reads each frame.
// ---------------------------------------------------------------------------

export interface StatusChip {
  id: string;
  name: string;
  remaining: number;
  duration: number;
  stacks: number;
  polarity: 1 | -1;
  color: number;
  icon: string;
}

export interface MinimapPip {
  x: number;
  y: number;
  kind: 'enemy' | 'elite' | 'boss' | 'loot' | 'prop';
  color?: number;
}

/**
 * Written by the HUD each frame after sniffing the live scene, and readable by
 * any panel that needs "what is happening right now" (the map panel, the
 * blacksmith's material counts, the skill tree's cooldown preview).
 */
export const runtime = {
  life: 0,
  maxLife: 1,
  mana: 0,
  maxMana: 1,
  /** Skill id -> seconds of cooldown remaining. */
  cooldowns: new Map<string, number>(),
  cooldownTotal: new Map<string, number>(),
  statuses: [] as StatusChip[],
  level: null as DungeonLevel | null,
  playerTileX: 0,
  playerTileY: 0,
  facing: 0,
  pips: [] as MinimapPip[],
  depth: 0,
  levelIndex: 0,
  levelsTotal: 0,
  inTown: true,
};

// ---------------------------------------------------------------------------
// Hover hooks — Tooltip registers itself here so widgets stay decoupled.
// ---------------------------------------------------------------------------

export interface ItemHoverContext {
  /** Where the item lives; drives "equip"/"unequip" hint lines. */
  source?: DragKind;
  /** Suppress the side-by-side comparison (already looking at equipped gear). */
  noCompare?: boolean;
  /** Optional price footer, for vendor panels. */
  price?: { gold: number; label: string };
}

export const hoverHooks: {
  item: ((item: Item, anchor: HTMLElement, ctx?: ItemHoverContext) => void) | null;
  text: ((html: string, anchor: HTMLElement, title?: string) => void) | null;
  hide: (() => void) | null;
} = { item: null, text: null, hide: null };

/** Attach a rich text tooltip to any element. */
export function tip(node: HTMLElement, title: string, html: string): void {
  node.addEventListener('pointerenter', () => hoverHooks.text?.(html, node, title));
  node.addEventListener('pointerleave', () => hoverHooks.hide?.());
}

// ---------------------------------------------------------------------------
// Drag and drop
// ---------------------------------------------------------------------------

export type DragKind = 'inventory' | 'equipment' | 'stash' | 'vendor' | 'craft' | 'skill' | 'hotbar';

export interface DragPayload {
  kind: DragKind;
  item?: Item;
  skillId?: string;
  index?: number;
  slot?: EquipSlot;
  tab?: number;
}

type DropHandler = (payload: DragPayload) => boolean;
type DropValidator = (payload: DragPayload) => boolean;

interface DropTarget {
  handler: DropHandler;
  accepts: DropValidator;
}

const dropTargets = new WeakMap<HTMLElement, DropTarget>();
const activeTargets = new Set<HTMLElement>();

export function registerDrop(node: HTMLElement, accepts: DropValidator, handler: DropHandler): void {
  node.classList.add('drop-target');
  dropTargets.set(node, { accepts, handler });
  activeTargets.add(node);
}

export function unregisterDrop(node: HTMLElement): void {
  dropTargets.delete(node);
  activeTargets.delete(node);
}

class DragController {
  payload: DragPayload | null = null;
  private ghost: HTMLElement | null = null;
  private hovered: HTMLElement | null = null;
  private onEnd: (() => void) | null = null;

  get active(): boolean {
    return this.payload !== null;
  }

  begin(payload: DragPayload, ev: PointerEvent, ghostHtml: string, onEnd?: () => void): void {
    if (this.payload) this.cancel();
    this.payload = payload;
    this.onEnd = onEnd ?? null;

    const g = div('drag-ghost');
    g.innerHTML = ghostHtml;
    document.body.appendChild(g);
    this.ghost = g;
    this.move(ev.clientX, ev.clientY);

    document.body.classList.add('dragging');
    // Light up every target that would accept this payload.
    for (const node of activeTargets) {
      const t = dropTargets.get(node);
      if (!t) continue;
      node.classList.toggle('drop-ok', t.accepts(payload));
      node.classList.toggle('drop-no', !t.accepts(payload));
    }

    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp, true);
    window.addEventListener('keydown', this.onKey, true);
  }

  private onMove = (e: PointerEvent): void => {
    this.move(e.clientX, e.clientY);
    const under = this.targetUnder(e.clientX, e.clientY);
    if (under !== this.hovered) {
      this.hovered?.classList.remove('drop-hover');
      this.hovered = under;
      this.hovered?.classList.add('drop-hover');
    }
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.cancel();
    }
  };

  private targetUnder(x: number, y: number): HTMLElement | null {
    if (this.ghost) this.ghost.style.display = 'none';
    const hit = document.elementFromPoint(x, y) as HTMLElement | null;
    if (this.ghost) this.ghost.style.display = '';
    let node: HTMLElement | null = hit;
    while (node) {
      const t = dropTargets.get(node);
      if (t && this.payload && t.accepts(this.payload)) return node;
      node = node.parentElement;
    }
    return null;
  }

  /**
   * Called when an item is released over the world rather than over any slot.
   *
   * Dragging something out of the pack and letting go is how every game in this
   * genre throws an item away, and it was the one thing the inventory could not
   * do. Registered by the inventory rather than implemented here, so this class
   * stays a pure pointer-drag helper.
   */
  onWorldDrop: ((payload: DragPayload) => void) | null = null;

  /** True when the point is over the playfield and not over any panel. */
  private overWorld(x: number, y: number): boolean {
    if (this.ghost) this.ghost.style.display = 'none';
    const hit = document.elementFromPoint(x, y) as HTMLElement | null;
    if (this.ghost) this.ghost.style.display = '';
    if (!hit) return false;
    // The UI layer is pointer-events:none except where a widget opts in, so
    // anything that is not inside an interactive node is the world behind it.
    return !hit.closest('.ui-interactive, .panel, .modal-wrap, .drag-ghost');
  }

  private onUp = (e: PointerEvent): void => {
    const payload = this.payload;
    if (!payload) return;
    const node = this.targetUnder(e.clientX, e.clientY);
    if (node) {
      const t = dropTargets.get(node);
      if (t) {
        e.stopPropagation();
        e.preventDefault();
        t.handler(payload);
      }
    } else if (payload.item && this.onWorldDrop && this.overWorld(e.clientX, e.clientY)) {
      e.stopPropagation();
      e.preventDefault();
      this.onWorldDrop(payload);
    }
    this.cancel();
  };

  private move(x: number, y: number): void {
    if (!this.ghost) return;
    this.ghost.style.transform = `translate3d(${x - 26}px, ${y - 26}px, 0)`;
  }

  cancel(): void {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp, true);
    window.removeEventListener('keydown', this.onKey, true);
    this.ghost?.remove();
    this.ghost = null;
    this.hovered?.classList.remove('drop-hover');
    this.hovered = null;
    this.payload = null;
    document.body.classList.remove('dragging');
    for (const node of activeTargets) node.classList.remove('drop-ok', 'drop-no', 'drop-hover');
    const cb = this.onEnd;
    this.onEnd = null;
    cb?.();
  }
}

export const drag = new DragController();

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export interface PanelOpts {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  width?: number;
  height?: number;
  draggable?: boolean;
  /** Dim and block the world behind the panel. */
  scrim?: boolean;
  /** Fill the viewport (char select, death, map). */
  fullscreen?: boolean;
  closable?: boolean;
  className?: string;
  onClose?: () => void;
  onOpen?: () => void;
}

let panelZ = 40;

export class Panel {
  readonly root: HTMLDivElement;
  readonly frame: HTMLDivElement;
  readonly body: HTMLDivElement;
  readonly header: HTMLDivElement;
  readonly footer: HTMLDivElement;
  readonly id: string;

  private opts: PanelOpts;
  private openState = false;
  private moved = false;

  constructor(opts: PanelOpts) {
    this.opts = opts;
    this.id = opts.id;

    this.root = div(`panel-wrap ${opts.fullscreen ? 'panel-full' : ''} ${opts.className ?? ''}`);
    this.root.dataset.panel = opts.id;

    const scrim = div('panel-scrim');
    if (opts.scrim || opts.fullscreen) this.root.appendChild(scrim);

    this.frame = div('panel');
    this.frame.classList.add('ui-interactive');
    if (opts.width) this.frame.style.width = `${opts.width}px`;
    if (opts.height) this.frame.style.height = `${opts.height}px`;

    // --- header ---
    this.header = div('panel-hd');
    const orn = div('panel-hd-orn');
    orn.innerHTML =
      '<svg viewBox="0 0 120 12" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="M0 6h34l6-5 6 5h28l6-5 6 5h34" fill="none" stroke="currentColor" stroke-width="1"/></svg>';

    const titles = div('panel-hd-titles');
    const t = div('panel-title');
    if (opts.icon) t.appendChild(icon(opts.icon, { size: 15, cls: 'panel-title-ico' }));
    t.appendChild(span('panel-title-text', opts.title));
    titles.appendChild(t);
    if (opts.subtitle) titles.appendChild(div('panel-sub', opts.subtitle));

    this.header.appendChild(titles);

    if (opts.closable !== false) {
      const close = new IconButton('close', 'Close', () => this.close());
      close.root.classList.add('panel-close');
      this.header.appendChild(close.root);
    }
    this.header.appendChild(orn);

    this.body = div('panel-body');
    this.footer = div('panel-ft');

    add(this.frame, this.header, this.body, this.footer);
    this.root.appendChild(this.frame);

    if (opts.draggable !== false && !opts.fullscreen) this.enableDrag();

    // Clicking anywhere in the panel raises it above its siblings.
    this.frame.addEventListener('pointerdown', () => this.raise(), true);
    scrim.addEventListener('pointerdown', (e) => {
      if (opts.closable !== false && opts.fullscreen !== true) {
        e.stopPropagation();
        this.close();
      }
    });
  }

  mount(parent: HTMLElement): this {
    parent.appendChild(this.root);
    return this;
  }

  private raise(): void {
    panelZ += 1;
    this.frame.style.zIndex = String(panelZ);
  }

  private enableDrag(): void {
    let sx = 0;
    let sy = 0;
    let ox = 0;
    let oy = 0;
    let dragging = false;
    this.header.classList.add('draggable');
    this.header.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      dragging = true;
      const r = this.frame.getBoundingClientRect();
      if (!this.moved) {
        // Freeze the flex-centred position into explicit coordinates before the
        // first drag so the panel does not jump.
        this.frame.style.position = 'fixed';
        this.frame.style.margin = '0';
        this.frame.style.left = `${r.left}px`;
        this.frame.style.top = `${r.top}px`;
        this.moved = true;
      }
      sx = e.clientX;
      sy = e.clientY;
      ox = r.left;
      oy = r.top;
      this.header.setPointerCapture(e.pointerId);
      this.frame.classList.add('is-dragging');
    });
    this.header.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const w = this.frame.offsetWidth;
      const h = this.frame.offsetHeight;
      const nx = Math.max(-w + 120, Math.min(window.innerWidth - 120, ox + e.clientX - sx));
      const ny = Math.max(0, Math.min(window.innerHeight - 44, oy + e.clientY - sy));
      this.frame.style.left = `${nx}px`;
      this.frame.style.top = `${ny}px`;
    });
    const stop = (e: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      this.frame.classList.remove('is-dragging');
      try {
        this.header.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
    };
    this.header.addEventListener('pointerup', stop);
    this.header.addEventListener('pointercancel', stop);
  }

  get isOpen(): boolean {
    return this.openState;
  }

  open(): void {
    if (this.openState) return;
    this.openState = true;
    this.root.classList.add('is-open');
    this.raise();
    this.opts.onOpen?.();
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.root.classList.remove('is-open');
    this.opts.onClose?.();
    hoverHooks.hide?.();
  }

  toggle(): void {
    if (this.openState) this.close();
    else this.open();
  }

  setTitle(title: string, subtitle?: string): void {
    const t = this.header.querySelector('.panel-title-text');
    if (t) t.textContent = title;
    const s = this.header.querySelector('.panel-sub');
    if (s && subtitle !== undefined) s.textContent = subtitle;
  }
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost' | 'gold';

export interface ButtonOpts {
  label: string;
  variant?: ButtonVariant;
  icon?: string;
  hint?: string;
  wide?: boolean;
  small?: boolean;
  onClick?: (ev: MouseEvent) => void;
}

export class Button {
  readonly root: HTMLButtonElement;
  private labelEl: HTMLSpanElement;

  constructor(opts: ButtonOpts) {
    this.root = el('button', `btn btn-${opts.variant ?? 'default'}`);
    this.root.type = 'button';
    if (opts.wide) this.root.classList.add('btn-wide');
    if (opts.small) this.root.classList.add('btn-sm');
    if (opts.icon) this.root.appendChild(icon(opts.icon, { size: opts.small ? 13 : 15 }));
    this.labelEl = span('btn-label', opts.label);
    this.root.appendChild(this.labelEl);
    if (opts.hint) {
      const h = span('btn-hint', opts.hint);
      this.root.appendChild(h);
    }
    if (opts.onClick) this.root.addEventListener('click', opts.onClick);
  }

  setLabel(text: string): void {
    this.labelEl.textContent = text;
  }

  setDisabled(v: boolean): void {
    this.root.disabled = v;
    this.root.classList.toggle('is-disabled', v);
  }

  /** One-shot success flourish after a craft or purchase. */
  flash(kind: 'good' | 'bad' = 'good'): void {
    this.root.classList.remove('flash-good', 'flash-bad');
    void this.root.offsetWidth;
    this.root.classList.add(kind === 'good' ? 'flash-good' : 'flash-bad');
  }
}

export class IconButton {
  readonly root: HTMLButtonElement;

  constructor(iconName: string, label: string, onClick: () => void, size = 16) {
    this.root = el('button', 'iconbtn');
    this.root.type = 'button';
    this.root.title = label;
    this.root.setAttribute('aria-label', label);
    this.root.innerHTML = iconSvg(iconName, { size });
    this.root.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
  }
}

// ---------------------------------------------------------------------------
// Toggle / Slider / Segmented / Tabs
// ---------------------------------------------------------------------------

export class Toggle {
  readonly root: HTMLDivElement;
  private input: HTMLButtonElement;
  private value: boolean;

  constructor(label: string, value: boolean, onChange: (v: boolean) => void, hint?: string) {
    this.value = value;
    this.root = div('field field-toggle');
    const l = div('field-label', label);
    if (hint) l.appendChild(span('field-hint', hint));
    this.input = el('button', 'toggle');
    this.input.type = 'button';
    this.input.setAttribute('role', 'switch');
    this.input.innerHTML = '<span class="toggle-knob"></span>';
    this.sync();
    this.input.addEventListener('click', () => {
      this.value = !this.value;
      this.sync();
      onChange(this.value);
    });
    add(this.root, l, this.input);
  }

  private sync(): void {
    this.input.classList.toggle('on', this.value);
    this.input.setAttribute('aria-checked', String(this.value));
  }

  set(v: boolean): void {
    this.value = v;
    this.sync();
  }
}

export class Slider {
  readonly root: HTMLDivElement;
  private input: HTMLInputElement;
  private readout: HTMLSpanElement;
  private format: (v: number) => string;

  constructor(
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (v: number) => void,
    format?: (v: number) => string
  ) {
    this.format = format ?? ((v) => `${Math.round(v * 100)}%`);
    this.root = div('field field-slider');
    const head = div('field-head');
    head.appendChild(div('field-label', label));
    this.readout = span('field-value', this.format(value));
    head.appendChild(this.readout);

    const track = div('slider-track');
    this.input = el('input', 'slider');
    this.input.type = 'range';
    this.input.min = String(min);
    this.input.max = String(max);
    this.input.step = String(step);
    this.input.value = String(value);
    const fill = div('slider-fill');
    const setFill = (v: number): void => {
      fill.style.width = `${((v - min) / (max - min)) * 100}%`;
    };
    setFill(value);
    this.input.addEventListener('input', () => {
      const v = Number(this.input.value);
      setFill(v);
      this.readout.textContent = this.format(v);
      onChange(v);
    });
    add(track, fill, this.input);
    add(this.root, head, track);
  }

  set(v: number): void {
    this.input.value = String(v);
    this.readout.textContent = this.format(v);
    this.input.dispatchEvent(new Event('input'));
  }
}

export interface SegmentOption<T extends string> {
  id: T;
  label: string;
  hint?: string;
}

export class Segmented<T extends string> {
  readonly root: HTMLDivElement;
  private buttons = new Map<T, HTMLButtonElement>();
  private value: T;

  constructor(label: string, options: Array<SegmentOption<T>>, value: T, onChange: (v: T) => void) {
    this.value = value;
    this.root = div('field field-segmented');
    if (label) this.root.appendChild(div('field-label', label));
    const bar = div('segbar');
    for (const opt of options) {
      const b = el('button', 'seg');
      b.type = 'button';
      b.textContent = opt.label;
      if (opt.hint) b.title = opt.hint;
      b.addEventListener('click', () => {
        this.set(opt.id);
        onChange(opt.id);
      });
      this.buttons.set(opt.id, b);
      bar.appendChild(b);
    }
    this.root.appendChild(bar);
    this.sync();
  }

  private sync(): void {
    for (const [id, b] of this.buttons) b.classList.toggle('on', id === this.value);
  }

  set(v: T): void {
    this.value = v;
    this.sync();
  }
}

export interface TabDef {
  id: string;
  label: string;
  icon?: string;
  accent?: string;
  count?: number;
}

export class Tabs {
  readonly root: HTMLDivElement;
  private buttons = new Map<string, HTMLButtonElement>();
  private active = '';
  private onChange: (id: string) => void;

  constructor(defs: TabDef[], active: string, onChange: (id: string) => void, cls = '') {
    this.onChange = onChange;
    this.root = div(`tabs ${cls}`.trim());
    this.setTabs(defs, active);
  }

  setTabs(defs: TabDef[], active?: string): void {
    clear(this.root);
    this.buttons.clear();
    for (const d of defs) {
      const b = el('button', 'tab');
      b.type = 'button';
      if (d.accent) b.style.setProperty('--tab-accent', d.accent);
      if (d.icon) b.appendChild(icon(d.icon, { size: 14 }));
      b.appendChild(span('tab-label', d.label));
      if (d.count !== undefined) b.appendChild(span('tab-count', String(d.count)));
      b.addEventListener('click', () => this.select(d.id));
      this.buttons.set(d.id, b);
      this.root.appendChild(b);
    }
    const want = active ?? this.active;
    if (this.buttons.has(want)) this.selectSilent(want);
    else if (defs.length) this.selectSilent(defs[0].id);
  }

  private selectSilent(id: string): void {
    this.active = id;
    for (const [k, b] of this.buttons) b.classList.toggle('on', k === id);
  }

  select(id: string): void {
    if (this.active === id) return;
    this.selectSilent(id);
    this.onChange(id);
  }

  get current(): string {
    return this.active;
  }
}

// ---------------------------------------------------------------------------
// Bars
// ---------------------------------------------------------------------------

export class ProgressBar {
  readonly root: HTMLDivElement;
  private fill: HTMLDivElement;
  private ghost: HTMLDivElement;
  private text: HTMLSpanElement;
  private ghostTimer = 0;

  constructor(cls = '', withText = true) {
    this.root = div(`bar ${cls}`.trim());
    this.ghost = div('bar-ghost');
    this.fill = div('bar-fill');
    this.text = span('bar-text');
    add(this.root, this.ghost, this.fill, withText ? this.text : null);
  }

  /** `v` is 0..1. The ghost trails the fill, so damage reads as a chunk lost. */
  set(v: number, label?: string): void {
    const p = Math.max(0, Math.min(1, v)) * 100;
    const prev = parseFloat(this.fill.style.width) || 0;
    this.fill.style.width = `${p}%`;
    if (p < prev) {
      this.ghost.style.width = `${prev}%`;
      window.clearTimeout(this.ghostTimer);
      this.ghostTimer = window.setTimeout(() => {
        this.ghost.style.width = `${p}%`;
      }, 90);
    } else {
      this.ghost.style.width = `${p}%`;
    }
    if (label !== undefined) this.text.textContent = label;
  }
}

// ---------------------------------------------------------------------------
// ScrollArea
// ---------------------------------------------------------------------------

export class ScrollArea {
  readonly root: HTMLDivElement;
  readonly content: HTMLDivElement;

  constructor(cls = '') {
    this.root = div(`scroll ${cls}`.trim());
    this.content = div('scroll-content');
    this.root.appendChild(this.content);
  }

  scrollTop(): void {
    this.root.scrollTop = 0;
  }
}

// ---------------------------------------------------------------------------
// Item slot
// ---------------------------------------------------------------------------

export interface ItemSlotOpts {
  size?: number;
  /** Ghost icon shown when the slot is empty (equipment paperdoll). */
  placeholder?: string;
  placeholderLabel?: string;
  source?: DragKind;
  index?: number;
  slot?: EquipSlot;
  tab?: number;
  draggable?: boolean;
  hoverContext?: ItemHoverContext;
  onClick?: (item: Item | null, ev: MouseEvent) => void;
  onRightClick?: (item: Item | null, ev: MouseEvent) => void;
  onDoubleClick?: (item: Item | null, ev: MouseEvent) => void;
}

export class ItemSlot {
  readonly root: HTMLDivElement;
  item: Item | null = null;
  private inner: HTMLDivElement;
  private opts: ItemSlotOpts;

  constructor(opts: ItemSlotOpts = {}) {
    this.opts = opts;
    this.root = div('islot ui-interactive');
    if (opts.size) {
      this.root.style.width = `${opts.size}px`;
      this.root.style.height = `${opts.size}px`;
    }
    this.inner = div('islot-inner');
    this.root.appendChild(this.inner);
    this.root.appendChild(div('islot-bevel'));

    this.root.addEventListener('click', (e) => {
      if (drag.active) return;
      opts.onClick?.(this.item, e);
    });
    this.root.addEventListener('dblclick', (e) => opts.onDoubleClick?.(this.item, e));
    this.root.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      opts.onRightClick?.(this.item, e);
    });
    this.root.addEventListener('pointerenter', () => {
      if (this.item && !drag.active) hoverHooks.item?.(this.item, this.root, opts.hoverContext);
    });
    this.root.addEventListener('pointerleave', () => hoverHooks.hide?.());

    if (opts.draggable !== false) this.enableDrag();
    this.render();
  }

  private enableDrag(): void {
    let sx = 0;
    let sy = 0;
    let armed = false;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !this.item) return;
      armed = true;
      sx = e.clientX;
      sy = e.clientY;
    });
    this.root.addEventListener('pointermove', (e) => {
      if (!armed || !this.item || drag.active) return;
      if (Math.hypot(e.clientX - sx, e.clientY - sy) < 5) return;
      armed = false;
      hoverHooks.hide?.();
      const item = this.item;
      const ghost =
        `<div class="islot islot-ghost" data-rarity="${item.rarity}" style="--rc:${rarityHex(item.rarity)}">` +
        `<div class="islot-inner"><img class="islot-img" src="${itemIconUri(item)}" alt="" draggable="false"></div></div>`;
      this.root.classList.add('is-source');
      drag.begin(
        {
          kind: this.opts.source ?? 'inventory',
          item,
          index: this.opts.index,
          slot: this.opts.slot,
          tab: this.opts.tab,
        },
        e,
        ghost,
        () => this.root.classList.remove('is-source')
      );
    });
    this.root.addEventListener('pointerup', () => {
      armed = false;
    });
  }

  setItem(item: Item | null): void {
    if (item === this.item) return;
    this.item = item;
    this.render();
  }

  /** Force a redraw (upgrade level or socket count changed in place). */
  refresh(): void {
    this.render();
  }

  private render(): void {
    const item = this.item;
    clear(this.inner);
    this.root.classList.toggle('is-empty', !item);
    if (!item) {
      this.root.removeAttribute('data-rarity');
      this.root.style.removeProperty('--rc');
      if (this.opts.placeholder) {
        const ph = div('islot-ph');
        ph.innerHTML = iconSvg(this.opts.placeholder, { size: Math.round((this.opts.size ?? 52) * 0.52) });
        this.inner.appendChild(ph);
        if (this.opts.placeholderLabel) {
          this.inner.appendChild(div('islot-ph-label', this.opts.placeholderLabel));
        }
      }
      return;
    }
    const rc = rarityHex(item.rarity);
    this.root.dataset.rarity = item.rarity;
    this.root.style.setProperty('--rc', rc);

    const art = div('islot-art');
    const px = Math.round((this.opts.size ?? 52) * 0.78);
    // Drawing an icon is a canvas render plus a PNG encode. A full pack is a
    // hundred of them, which is why opening the inventory used to lock up the
    // first time. The grid goes up straight away and the art fills in over the
    // next few frames instead.
    const img = document.createElement('img');
    img.className = 'islot-img';
    img.alt = '';
    img.draggable = false;
    img.style.width = `${px}px`;
    img.style.height = `${px}px`;
    img.src = requestItemIcon(item, (uri) => {
      // The slot may have been given a different item while we were drawing.
      if (this.item === item) img.src = uri;
    });
    art.appendChild(img);
    this.inner.appendChild(art);

    // Stack size. Potions, gems, runes and materials all stack, and the slot
    // never showed how many were in it — so a stack of twelve looked like one.
    const n = stackCount(item);
    if (n > 1) this.inner.appendChild(span('islot-stack', String(n)));

    if (item.upgrade > 0) this.inner.appendChild(span('islot-upg', `+${item.upgrade}`));
    if (item.sockets && item.sockets.length > 0) {
      const s = div('islot-sockets');
      for (const sock of item.sockets) {
        const dot = span(sock.gemId ? 'sock filled' : 'sock');
        s.appendChild(dot);
      }
      this.inner.appendChild(s);
    }
    if (item.corrupted) this.root.classList.add('is-corrupted');
    if (item.seen === false) this.inner.appendChild(span('islot-new'));
  }
}

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

export interface MenuEntry {
  label: string;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
  onPick?: () => void;
}

let openMenu: HTMLElement | null = null;

export function closeContextMenu(): void {
  openMenu?.remove();
  openMenu = null;
}

export function contextMenu(x: number, y: number, entries: MenuEntry[], title?: string): void {
  closeContextMenu();
  const m = div('ctxmenu ui-interactive');
  if (title) m.appendChild(div('ctxmenu-title', title));
  for (const e of entries) {
    if (e.label === '-') {
      m.appendChild(div('ctxmenu-sep'));
      continue;
    }
    const b = el('button', `ctxmenu-item${e.danger ? ' danger' : ''}${e.disabled ? ' is-disabled' : ''}`);
    b.type = 'button';
    if (e.icon) b.appendChild(icon(e.icon, { size: 14 }));
    b.appendChild(span('ctxmenu-label', e.label));
    if (e.hint) b.appendChild(span('ctxmenu-hint', e.hint));
    if (!e.disabled) {
      b.addEventListener('click', () => {
        closeContextMenu();
        e.onPick?.();
      });
    }
    m.appendChild(b);
  }
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = `${Math.min(x, window.innerWidth - r.width - 8)}px`;
  m.style.top = `${Math.min(y, window.innerHeight - r.height - 8)}px`;
  openMenu = m;
  requestAnimationFrame(() => m.classList.add('is-open'));

  const dismiss = (ev: PointerEvent): void => {
    if (!m.contains(ev.target as Node)) {
      closeContextMenu();
      window.removeEventListener('pointerdown', dismiss, true);
    }
  };
  setTimeout(() => window.addEventListener('pointerdown', dismiss, true), 0);
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export interface ModalOpts {
  title: string;
  body: string | HTMLElement;
  icon?: string;
  tone?: 'neutral' | 'danger' | 'epic';
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export function modal(opts: ModalOpts): void {
  const wrap = div(`modal-wrap tone-${opts.tone ?? 'neutral'}`);
  const box = div('modal ui-interactive');
  const hd = div('modal-hd');
  if (opts.icon) hd.appendChild(icon(opts.icon, { size: 18 }));
  hd.appendChild(span('modal-title', opts.title));
  const body = div('modal-body');
  if (typeof opts.body === 'string') body.innerHTML = opts.body;
  else body.appendChild(opts.body);

  const ft = div('modal-ft');
  const close = (): void => {
    wrap.classList.remove('is-open');
    setTimeout(() => wrap.remove(), 180);
  };
  const cancel = new Button({
    label: opts.cancelLabel ?? 'Cancel',
    variant: 'ghost',
    onClick: () => {
      close();
      opts.onCancel?.();
    },
  });
  const confirm = new Button({
    label: opts.confirmLabel ?? 'Confirm',
    variant: opts.tone === 'danger' ? 'danger' : 'primary',
    onClick: () => {
      close();
      opts.onConfirm?.();
    },
  });
  add(ft, cancel.root, confirm.root);
  add(box, hd, body, ft);
  wrap.appendChild(box);
  wrap.addEventListener('pointerdown', (e) => {
    if (e.target === wrap) {
      close();
      opts.onCancel?.();
    }
  });
  (document.getElementById('ui') ?? document.body).appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('is-open'));
}

// ---------------------------------------------------------------------------
// Number animation
// ---------------------------------------------------------------------------

const counters = new WeakMap<HTMLElement, { from: number; to: number; t0: number; dur: number; fmt: (n: number) => string }>();
let counterRaf = 0;

function tickCounters(): void {
  const now = performance.now();
  let alive = false;
  document.querySelectorAll<HTMLElement>('[data-count]').forEach((node) => {
    const c = counters.get(node);
    if (!c) return;
    const k = Math.min(1, (now - c.t0) / c.dur);
    const e = 1 - Math.pow(1 - k, 3);
    const v = c.from + (c.to - c.from) * e;
    node.textContent = c.fmt(v);
    if (k < 1) alive = true;
    else {
      node.removeAttribute('data-count');
      counters.delete(node);
    }
  });
  counterRaf = alive ? requestAnimationFrame(tickCounters) : 0;
}

/** Animates a number toward `to`. Cheap: only ticks while something is moving. */
export function countTo(node: HTMLElement, to: number, format: (n: number) => string = fmtInt, dur = 420): void {
  const prev = counters.get(node);
  const from = prev ? Number(node.textContent?.replace(/[^\d.-]/g, '') ?? 0) : Number(node.dataset.value ?? node.textContent?.replace(/[^\d.-]/g, '') ?? 0);
  node.dataset.value = String(to);
  if (!Number.isFinite(from) || Math.abs(to - from) < 0.5) {
    node.textContent = format(to);
    return;
  }
  counters.set(node, { from, to, t0: performance.now(), dur, fmt: format });
  node.setAttribute('data-count', '1');
  if (!counterRaf) counterRaf = requestAnimationFrame(tickCounters);
}

// ---------------------------------------------------------------------------
// Misc layout helpers
// ---------------------------------------------------------------------------

/** A titled block with an ornamental rule — the panel's section unit. */
export function section(title: string, iconName?: string, cls = ''): { root: HTMLDivElement; body: HTMLDivElement } {
  const root = div(`section ${cls}`.trim());
  const hd = div('section-hd');
  if (iconName) hd.appendChild(icon(iconName, { size: 13 }));
  hd.appendChild(span('section-title', title));
  hd.appendChild(div('section-rule'));
  const body = div('section-body');
  add(root, hd, body);
  return { root, body };
}

/** Label/value line used by every stat sheet in the game. */
export function statLine(label: string, value: string, opts: { icon?: string; tone?: string; hint?: string; title?: string } = {}): HTMLDivElement {
  const r = div(`statline ${opts.tone ? `tone-${opts.tone}` : ''}`.trim());
  const l = div('statline-label');
  if (opts.icon) l.appendChild(icon(opts.icon, { size: 13, cls: 'statline-ico' }));
  l.appendChild(span('', label));
  const v = span('statline-value', value);
  add(r, l, div('statline-dots'), v);
  if (opts.hint) tip(r, opts.title ?? label, opts.hint);
  return r;
}

export function keycap(text: string): HTMLSpanElement {
  return span('keycap', text);
}

/** Gold amount with a coin glyph. */
export function goldChip(amount: number, cls = ''): HTMLSpanElement {
  const s = span(`goldchip ${cls}`.trim());
  s.appendChild(icon('coin', { size: 13 }));
  s.appendChild(span('goldchip-v', fmtInt(amount)));
  return s;
}

export function emptyState(text: string, iconName = 'bag'): HTMLDivElement {
  const d = div('empty-state');
  d.innerHTML = iconSvg(iconName, { size: 34 });
  d.appendChild(div('empty-state-text', text));
  return d;
}
