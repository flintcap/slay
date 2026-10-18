/**
 * SLAY — inventory and paperdoll.
 *
 * Left: the ten equipment slots laid out around a class crest. Right: the
 * backpack grid. Items move by pointer drag (with valid/invalid drop
 * highlighting) or by right-click to equip. Every slot feeds the comparison
 * tooltip.
 */

import type { Character, EquipSlot, Item } from '../types';
import { afterCurtain } from '../core/Idle';
import { RARITY_ORDER } from '../types';
import { events } from '../core/Events';
import { save, INVENTORY_SIZE } from '../core/Save';
import { equipItem, unequipItem, isWornOffHand } from '../sim/Character';
import { computeStats } from '../sim/Stats';
import { vendorPrice, itemDisplayName } from '../sim/Loot';
import { insertGem } from '../sim/Crafting';
import {
  scheduleRefresh,
  Panel,
  Button,
  ItemSlot,
  add,
  clear,
  div,
  span,
  icon,
  iconSvg,
  classAccent,
  classCrestSvg,
  classById,
  registerDrop,
  drag,
  contextMenu,
  splitStackDialog,
  modal,
  countTo,
  fmt,
  fmtInt,
  slotsFor,
  isTwoHanded,
  safeBase,
  SLOT_LABEL,
  SLOT_ICON,
  statLine,
  emptyState,
  attempt,
  section,
  type DragKind,
  type DragPayload,
} from './Widgets';
import { PaperdollView } from './PaperdollView';
import { potionKind } from '../sim/Potions';
import { moveBetween, sortInventory, splitStack, stackCount, setStackCount } from '../sim/Inventory';
import { findFit, firstFreeCell, fitsAt, freeCells, itemSize, INV_COLS, INV_ROWS } from '../sim/Grid';
import { uiSfx } from './Sfx';

// ---------------------------------------------------------------------------
// Inventory model helpers — the UI is the only place that shuffles the arrays,
// so these live here and stay defensive about what the sim layer already did.
// ---------------------------------------------------------------------------

export function normalizeInventory(c: Character): void {
  if (!Array.isArray(c.inventory)) c.inventory = [];
  while (c.inventory.length < INVENTORY_SIZE) c.inventory.push(null);
}

export function invIndexOf(c: Character, item: Item): number {
  for (let i = 0; i < c.inventory.length; i++) if (c.inventory[i]?.uid === item.uid) return i;
  return -1;
}

/**
 * Where `item` would go in the pack: the first place its whole block fits.
 * Without an item, the first cell nothing covers.
 */
export function invFirstFree(c: Character, item?: Item): number {
  normalizeInventory(c);
  return item ? findFit(c.inventory, item) : firstFreeCell(c.inventory);
}

export function invAdd(c: Character, item: Item): boolean {
  if (invIndexOf(c, item) >= 0) return true;
  const i = invFirstFree(c, item);
  if (i < 0) return false;
  c.inventory[i] = item;
  return true;
}

export function invRemove(c: Character, item: Item): void {
  const i = invIndexOf(c, item);
  if (i >= 0) c.inventory[i] = null;
}

/**
 * Spends a single unit out of a stack.
 *
 * Socketing used `invRemove`, which nulls the whole slot. Setting one rune into
 * a helm destroyed the other three in the stack with it. Anything that consumes
 * one of something must come through here.
 */
export function invConsumeOne(c: Character, item: Item): void {
  const i = invIndexOf(c, item);
  if (i < 0) return;
  const held = stackCount(item);
  if (held <= 1) {
    c.inventory[i] = null;
    return;
  }
  setStackCount(item, held - 1);
}

/** Cells in use in the pack. */
export function invCount(c: Character): number {
  normalizeInventory(c);
  return c.inventory.length - freeCells(c.inventory);
}

/**
 * Moves the item at `fromIndex` so its corner sits on `toIndex`; if it cannot
 * go exactly there, into the first place it fits on that side. False when
 * there is no room for it at all.
 */
export function placeOrFit(from: Array<Item | null>, fromIndex: number, to: Array<Item | null>, toIndex: number): boolean {
  if (moveBetween(from, fromIndex, to, toIndex)) return true;
  const item = from[fromIndex];
  if (!item || from === to) return false;
  const at = findFit(to, item);
  if (at < 0) return false;
  from[fromIndex] = null;
  to[at] = item;
  return true;
}

/**
 * Equip with cleanup. `equipItem` owns the rules; this makes sure the arrays
 * agree afterwards regardless of how much bookkeeping it already did.
 */
export function doEquip(c: Character, item: Item, slot?: EquipSlot): { ok: boolean; reason?: string } {
  const res = attempt(() => equipItem(c, item, slot), { ok: false, reason: 'Cannot equip' } as ReturnType<typeof equipItem>);
  if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot equip that' };
  invRemove(c, item);
  for (const d of res.displaced ?? []) {
    if (!d) continue;
    if (!invAdd(c, d)) {
      // No room: put the new item back rather than deleting the old one.
      events.emit('toast', { text: 'Not enough room in your pack.', kind: 'bad' });
    }
  }
  save.touch();
  events.emit('item:equipped', { item });
  events.emit('ui:refresh', {});
  return { ok: true };
}

export function doUnequip(c: Character, slot: EquipSlot): boolean {
  const item = c.equipment[slot];
  if (!item) return false;
  if (invIndexOf(c, item) < 0 && invFirstFree(c, item) < 0) {
    events.emit('toast', { text: 'No room in your pack for that.', kind: 'bad' });
    return false;
  }
  const ok = attempt(() => unequipItem(c, slot), false);
  if (!ok) return false;
  invAdd(c, item);
  save.touch();
  events.emit('item:unequipped', { item });
  events.emit('ui:refresh', {});
  return true;
}

// ---------------------------------------------------------------------------
// Reusable grid of item slots
// ---------------------------------------------------------------------------

export interface ItemGridOpts {
  cols: number;
  rows: number;
  size?: number;
  source: DragKind;
  /**
   * Items cover blocks of cells, as in the pack and the vault (the default).
   * Off, every item takes one cell, for a plain list such as a shop shelf.
   */
  sized?: boolean;
  /**
   * Called when something is dropped. `index` is where its top-left corner
   * goes; `under` is the cell under the pointer, or the item covering it,
   * which is what a gem dropped onto gear is aimed at. Return true if handled.
   */
  onDrop?: (payload: DragPayload, index: number, under: number) => boolean;
  accepts?: (payload: DragPayload, index: number) => boolean;
  onClick?: (item: Item | null, index: number, ev: MouseEvent) => void;
  onRightClick?: (item: Item | null, index: number, ev: MouseEvent) => void;
  hoverPrice?: (item: Item) => { gold: number; label: string } | undefined;
}

/** Space between cells, in px. Matches `.itemgrid { gap }`. */
const GRID_GAP = 4;

export class ItemGrid {
  readonly root: HTMLDivElement;
  readonly slots: ItemSlot[] = [];
  private opts: ItemGridOpts;
  private readonly size: number;
  private readonly sized: boolean;
  /** Uid last shown in each cell, so a new arrival can be made to flash. */
  private shown: string[] = [];
  private primed = false;
  /** What the grid is showing: the backing array and where this grid starts in it. */
  private items: Array<Item | null> = [];
  private offset = 0;
  /** For each cell, the cell of the item covering it, or -1. */
  private cover: Int32Array;
  /** Where a held item would land: green to fit, gold to swap, red when it cannot. */
  private landing: HTMLDivElement;

  constructor(opts: ItemGridOpts) {
    this.opts = opts;
    const size = opts.size ?? 50;
    this.size = size;
    this.sized = opts.sized !== false;
    this.root = div(this.sized ? 'itemgrid is-sized' : 'itemgrid');
    this.root.style.setProperty('--cols', String(opts.cols));
    this.root.style.setProperty('--cell', `${size}px`);
    const total = opts.cols * opts.rows;
    this.cover = new Int32Array(total).fill(-1);
    for (let i = 0; i < total; i++) {
      const slot = new ItemSlot({
        size,
        source: opts.source,
        index: i,
        shaped: this.sized,
        hoverContext: { source: opts.source },
        onClick: (item, ev) => opts.onClick?.(item, i, ev),
        onRightClick: (item, ev) => opts.onRightClick?.(item, i, ev),
      });
      registerDrop(
        slot.root,
        (p) => (opts.accepts ? opts.accepts(p, i) : !!p.item),
        (p) => this.drop(p, i)
      );
      slot.root.style.setProperty('--i', String(i));
      if (this.sized) {
        slot.root.style.gridColumn = `${(i % opts.cols) + 1}`;
        slot.root.style.gridRow = `${Math.floor(i / opts.cols) + 1}`;
      }
      this.slots.push(slot);
      this.root.appendChild(slot.root);
    }
    this.landing = div('igrid-landing');
    if (this.sized) {
      this.root.appendChild(this.landing);
      // The thin gaps between cells catch a drop too. The grid is a target
      // in its own right but without the target styling, which the cells own.
      registerDrop(
        this.root,
        (p) => (opts.accepts ? opts.accepts(p, 0) : !!p.item),
        (p) => this.drop(p, this.cellAt(drag.x, drag.y))
      );
      this.root.classList.remove('drop-target');
      drag.moveHooks.add((x, y) => this.preview(x, y));
      drag.endHooks.add(() => this.landing.classList.remove('is-on'));
    }
  }

  /** The cell under a point, clamped to the grid. */
  private cellAt(x: number, y: number): number {
    const r = this.root.getBoundingClientRect();
    const cs = getComputedStyle(this.root);
    const pl = parseFloat(cs.paddingLeft) || 0;
    const pt = parseFloat(cs.paddingTop) || 0;
    const step = this.size + GRID_GAP;
    const c = Math.max(0, Math.min(this.opts.cols - 1, Math.floor((x - r.left - pl + GRID_GAP / 2) / step)));
    const row = Math.max(0, Math.min(this.opts.rows - 1, Math.floor((y - r.top - pt + GRID_GAP / 2) / step)));
    return row * this.opts.cols + c;
  }

  /** Where a held item's top-left corner goes when the pointer is over `cell`. */
  private anchorFor(p: DragPayload, cell: number): number {
    if (!this.sized || !p.item) return cell;
    const { w, h } = itemSize(p.item);
    const cols = this.opts.cols;
    const gx = Math.min(w - 1, Math.max(0, Math.floor((p.grab?.fx ?? 0.5) * w)));
    const gy = Math.min(h - 1, Math.max(0, Math.floor((p.grab?.fy ?? 0.5) * h)));
    const c = Math.max(0, Math.min(cols - w, (cell % cols) - gx));
    const r = Math.max(0, Math.min(this.opts.rows - h, Math.floor(cell / cols) - gy));
    return r * cols + c;
  }

  private drop(p: DragPayload, cell: number): boolean {
    if (this.sized) cell = this.cellAt(drag.x, drag.y);
    const under = this.cover[cell] >= 0 ? this.cover[cell]! : cell;
    return this.opts.onDrop?.(p, this.anchorFor(p, cell), under) ?? false;
  }

  /** Shows where the held item would land, and whether it can. */
  private preview(x: number, y: number): void {
    const p = drag.payload;
    const r = this.root.getBoundingClientRect();
    const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && r.width > 0;
    if (!p?.item || !inside || (this.opts.accepts && !this.opts.accepts(p, 0))) {
      this.landing.classList.remove('is-on');
      return;
    }
    const at = this.anchorFor(p, this.cellAt(x, y));
    const { w, h } = itemSize(p.item);
    const cols = this.opts.cols;
    const c0 = at % cols;
    const r0 = Math.floor(at / cols);
    // What it would sit on, not counting itself.
    const hit = new Set<string>();
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const k = this.cover[(r0 + dy) * cols + c0 + dx] ?? -1;
        const it = k >= 0 ? this.items[this.offset + k] : null;
        if (it && it.uid !== p.item.uid) hit.add(it.uid);
      }
    }
    const step = this.size + GRID_GAP;
    const cs = getComputedStyle(this.root);
    const pl = parseFloat(cs.paddingLeft) || 0;
    const pt = parseFloat(cs.paddingTop) || 0;
    const st = this.landing.style;
    st.left = `${pl + c0 * step}px`;
    st.top = `${pt + r0 * step}px`;
    st.width = `${w * this.size + (w - 1) * GRID_GAP}px`;
    st.height = `${h * this.size + (h - 1) * GRID_GAP}px`;
    this.landing.classList.add('is-on');
    this.landing.classList.toggle('is-swap', hit.size === 1);
    this.landing.classList.toggle('is-no', hit.size > 1);
  }

  /**
   * Fills the grid. `quiet` skips the arrival flash, for wholesale changes
   * such as a sort or a tab switch where everything would light at once.
   */
  setItems(items: Array<Item | null>, offset = 0, quiet = false): void {
    this.items = items;
    this.offset = offset;
    const cols = this.opts.cols;
    const rows = this.opts.rows;
    if (this.sized) {
      this.cover.fill(-1);
      for (let i = 0; i < this.slots.length; i++) {
        const it = items[offset + i];
        if (!it || this.cover[i] >= 0) continue;
        const { w, h } = itemSize(it);
        const c0 = i % cols;
        const r0 = Math.floor(i / cols);
        for (let dy = 0; dy < h && r0 + dy < rows; dy++) {
          for (let dx = 0; dx < w && c0 + dx < cols; dx++) {
            const k = (r0 + dy) * cols + c0 + dx;
            if (this.cover[k] < 0) this.cover[k] = i;
          }
        }
      }
    }
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      let item = items[offset + i] ?? null;
      if (this.sized) {
        const owner = this.cover[i];
        if (owner >= 0 && owner !== i) {
          // Covered by a bigger item: this cell is part of its block.
          slot.root.style.display = 'none';
          item = null;
        } else {
          slot.root.style.display = '';
          let w = 1;
          let h = 1;
          if (item) {
            const sz = itemSize(item);
            w = Math.min(sz.w, cols - (i % cols));
            h = Math.min(sz.h, rows - Math.floor(i / cols));
          }
          slot.root.style.gridColumn = `${(i % cols) + 1} / span ${w}`;
          slot.root.style.gridRow = `${Math.floor(i / cols) + 1} / span ${h}`;
          slot.setSpan(w, h, this.size, GRID_GAP);
        }
      }
      const uid = item?.uid ?? '';
      const arrived = this.primed && !quiet && uid !== '' && this.shown[i] !== uid;
      this.shown[i] = uid;
      slot.setItem(item);
      if (arrived) slot.flash();
      if (item && this.opts.hoverPrice) {
        const p = this.opts.hoverPrice(item);
        slot.root.dataset.price = p ? String(p.gold) : '';
      }
    }
    this.primed = true;
  }

  /** Plays the settle-in animation, cell by cell, after a sort. */
  playSort(): void {
    this.root.classList.remove('is-sorting');
    void this.root.offsetWidth;
    this.root.classList.add('is-sorting');
    window.setTimeout(() => this.root.classList.remove('is-sorting'), 1100);
  }

  /** Highlights every cell whose item matches a filter (search box support). */
  applyFilter(pred: ((item: Item) => boolean) | null): void {
    for (const s of this.slots) {
      if (!s.item || !pred) {
        s.root.classList.remove('is-dimmed', 'is-hit');
        continue;
      }
      const hit = pred(s.item);
      s.root.classList.toggle('is-hit', hit);
      s.root.classList.toggle('is-dimmed', !hit);
    }
  }
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

/** Tab order: down the body on the left, then the hands on the right. */
const PAPERDOLL: EquipSlot[] = [
  'helm',
  'amulet',
  'chest',
  'belt',
  'legs',
  'boots',
  'gloves',
  'ring1',
  'ring2',
  'mainHand',
  'offHand',
];

/** Paperdoll slot sizes, in cells, matching what each slot holds in the pack. */
const PD_CELLS: Record<EquipSlot, [number, number]> = {
  helm: [2, 2],
  amulet: [1, 1],
  mainHand: [2, 4],
  chest: [2, 3],
  offHand: [2, 4],
  gloves: [2, 2],
  belt: [2, 1],
  ring1: [1, 1],
  legs: [2, 3],
  boots: [2, 2],
  ring2: [1, 1],
};
/** One paperdoll cell and the gap between cells, in px. Matches `.paperdoll`. */
const PD_CELL = 44;
const PD_GAP = 4;

/** Set on the panel while the character view is being dragged to spin. */
const SPIN_HINT = 'Drag to turn';

export class InventoryPanel {
  readonly panel: Panel;
  private grid: ItemGrid;
  private equipSlots = new Map<EquipSlot, ItemSlot>();
  private goldEl: HTMLSpanElement;
  private capacityEl: HTMLSpanElement;
  private crest: HTMLDivElement;
  private statRail: HTMLDivElement;
  private view = new PaperdollView();
  /** Uid last shown in each equipment slot, to flash a fresh equip. */
  private worn = new Map<EquipSlot, string>();
  private wornPrimed = false;
  /** Set before a refresh that rearranges everything (sort). */
  private quietNext = false;

  constructor() {
    this.panel = new Panel({
      id: 'inventory',
      title: 'Equipment',
      subtitle: 'What you carry is what you lose',
      icon: 'bag',
      width: 1030,
      // The figure animates, so it must not keep drawing behind a closed panel.
      onClose: () => this.view.stop(),
    });
    this.panel.frame.classList.add('panel-inventory');

    const wrap = div('inv-wrap');

    // --- paperdoll --------------------------------------------------------
    const left = div('inv-left');
    const doll = div('paperdoll');
    this.crest = div('paperdoll-crest');
    doll.appendChild(this.crest);

    // The live figure stands in the middle, with the slots down each side.
    const stage = div('paperdoll-figure');
    stage.appendChild(this.view.root);
    stage.appendChild(div('pd-view-hint', SPIN_HINT));
    doll.appendChild(stage);

    for (const s of PAPERDOLL) {
      const [cw, ch] = PD_CELLS[s];
      const slot = new ItemSlot({
        size: PD_CELL,
        width: cw * PD_CELL + (cw - 1) * PD_GAP,
        height: ch * PD_CELL + (ch - 1) * PD_GAP,
        shaped: true,
        source: 'equipment',
        slot: s,
        placeholder: SLOT_ICON[s],
        placeholderLabel: '',
        hoverContext: { source: 'equipment' },
        onRightClick: (item, ev) => {
          const c = save.account.current;
          if (!c || !item) return;
          // Ctrl drops it straight on the floor. Real right button only: on a
          // Mac, Ctrl+click is how a one-button mouse right-clicks at all.
          if (ev.ctrlKey && ev.button === 2) {
            this.discard({ kind: 'equipment', item, slot: s });
            return;
          }
          doUnequip(c, s);
        },
      });
      slot.root.classList.add('pd-slot', `pd-${s}`);
      slot.root.title = SLOT_LABEL[s];
      registerDrop(
        slot.root,
        (p) =>
          !!p.item &&
          // Either it goes in this slot, or it is a gem for what is already in it.
          (slotsFor(p.item).includes(s) || this.isSocketMove(p.item, save.account.current?.equipment[s])),
        (p) => {
          const c = save.account.current;
          if (!c || !p.item) return false;
          // Socketing a worn item works too: you should not have to take your
          // armour off to put a gem in it.
          if (this.trySocket(p.item, c.equipment[s] ?? null)) return true;
          const r = doEquip(c, p.item, s);
          if (!r.ok) events.emit('toast', { text: r.reason ?? 'Cannot equip', kind: 'bad' });
          return r.ok;
        }
      );
      const tag = div('pd-tag', SLOT_LABEL[s]);
      slot.root.appendChild(tag);
      this.equipSlots.set(s, slot);
      doll.appendChild(slot.root);
    }
    left.appendChild(doll);

    this.statRail = div('inv-statrail');
    left.appendChild(this.statRail);

    // --- backpack ---------------------------------------------------------
    const right = div('inv-right');
    const packHd = div('inv-packhd');
    const cap = div('inv-cap');
    cap.appendChild(icon('bag', { size: 13 }));
    this.capacityEl = span('inv-cap-v', `0 / ${INV_COLS * INV_ROWS}`);
    cap.appendChild(this.capacityEl);

    const gold = div('inv-gold');
    gold.appendChild(icon('coin', { size: 15 }));
    this.goldEl = span('inv-gold-v', '0');
    gold.appendChild(this.goldEl);

    // Sort. `sortSlots` merges stacks first and then orders by rarity and
    // slot, so a pack full of half-stacks of dust collapses on one click.
    const sortBtn = new Button({
      label: 'Sort',
      variant: 'ghost',
      icon: 'sparkle',
      small: true,
      onClick: () => {
        const c = save.account.current;
        if (!c) return;
        sortInventory(c);
        save.setCharacter(c);
        this.quietNext = true;
        this.refresh();
        this.grid.playSort();
        uiSfx('ui.click');
      },
    });
    add(packHd, cap, sortBtn.root, gold);

    this.grid = new ItemGrid({
      cols: INV_COLS,
      rows: INV_ROWS,
      size: 50,
      source: 'inventory',
      accepts: (p) => !!p.item,
      onDrop: (p, index, under) => this.dropIntoInventory(p, index, under),
      onClick: (item, i, ev) => {
        if (ev.shiftKey && item) this.askSplit(item, i);
      },
      onRightClick: (item, _i, ev) => this.onRightClick(item, ev),
    });

    const hint = div('inv-hint');
    hint.appendChild(span('', 'Right-click to equip or drink · drag a gem onto gear to socket it · drag onto the ground to drop · hold '));
    hint.appendChild(span('keycap', 'Shift'));
    hint.appendChild(span('', ' and right-click for more, or '));
    hint.appendChild(span('keycap', 'Shift'));
    hint.appendChild(span('', ' and click a stack to split it, or '));
    hint.appendChild(span('keycap', 'Ctrl'));
    hint.appendChild(span('', ' and right-click to drop'));

    // Dragging an item out of the window and letting go throws it away, which
    // is how the whole genre does it and was the one thing the pack could not
    // do at all.
    drag.onWorldDrop = (p) => this.discard(p);

    add(right, packHd, this.grid.root, hint);
    add(wrap, left, right);
    this.panel.body.appendChild(wrap);

    events.on('ui:refresh', () => {
      if (this.panel.isOpen) scheduleRefresh(this.boundRefresh);
    });
    events.on('loot:pickedUp', () => {
      if (this.panel.isOpen) scheduleRefresh(this.boundRefresh);
    });
    events.on('loot:gold', () => {
      if (this.panel.isOpen) scheduleRefresh(this.boundRefresh);
    });
    // The figure is built ahead of time, not on the frame the panel first
    // opens (PaperdollView.warm). On the way into a run that happens behind
    // the curtain; town is safe ground, so there it waits for idle time after
    // the curtain lifts instead of making the loading screen longer.
    //
    // A map warms on `scene:change`, not `scene:loading`: the old scene is
    // torn down between the two, and that teardown freed shaders the figure
    // had just built, so the first opening in a map rebuilt them all (a
    // freeze of a second or two).
    const warm = () => {
      const c = save.account.current;
      if (!c || this.panel.isOpen) return;
      try {
        this.view.warm(c);
      } catch {
        /* the panel builds it on opening, as before */
      }
    };
    events.on('scene:change', (p) => {
      if (p.to === 'dungeon') warm();
      else if (p.to === 'town') afterCurtain(warm, 2500);
    });
  }

  open(): void {
    this.refresh();
    this.panel.open();
    this.view.start();
  }

  close(): void {
    this.panel.close();
  }

  /**
   * Throws an item on the floor.
   *
   * The UI owns removing it from wherever it was; the scene owns putting a
   * model at the player's feet. Anything worth keeping asks first — a
   * mis-drag should not cost you a unique.
   */
  private discard(p: DragPayload): void {
    const c = save.account.current;
    const item = p.item;
    if (!c || !item) return;

    const throwIt = (): void => {
      if (p.kind === 'equipment' && p.slot) {
        // Take it off first, then out of the pack it landed in.
        if (!doUnequip(c, p.slot)) return;
      }
      invRemove(c, item);
      save.touch();
      // The scene says what happened, because only it knows whether there was
      // anywhere to put it. In town there is not, and it goes back in the pack.
      events.emit('loot:discard', { item });
      events.emit('ui:refresh', {});
      this.refresh();
    };

    if (RARITY_ORDER.indexOf(item.rarity) >= 2 || item.upgrade > 0 || item.sockets.some((s) => s.gemId)) {
      modal({
        title: 'Drop this?',
        icon: 'trash',
        tone: 'danger',
        body: `${attempt(() => itemDisplayName(item), 'This item')} will be left on the floor.`,
        confirmLabel: 'Drop it',
        onConfirm: throwIt,
      });
      return;
    }
    throwIt();
  }

  private onRightClick(item: Item | null, ev: MouseEvent): void {
    const c = save.account.current;
    if (!c || !item) return;

    // Ctrl drops it on the floor: the quick way to clear a pack mid-dungeon.
    // Real right button only: on a Mac, Ctrl+click is a right-click.
    if (ev.ctrlKey && ev.button === 2) {
      this.discard({ kind: 'inventory', item });
      return;
    }

    // Shift opens the full menu for anything, including gear — plain
    // right-click equips, so without this there was no way to reach the menu
    // for an item you could wear.
    if (ev.shiftKey) {
      this.itemMenu(item, ev);
      return;
    }

    // Consumables are used, not equipped. Right-clicking one used to fall
    // through to the context menu, which offered no way to drink it.
    const base = safeBase(item);
    if (base?.category === 'potion') {
      const kind = potionKind(item.baseId) === 'mana' ? 'mana' : 'life';
      events.emit('potion:use', { kind, baseId: item.baseId });
      return;
    }

    const slots = slotsFor(item);
    if (slots.length) {
      // Prefer the empty ring/hand so the second click does not overwrite the first.
      const target = slots.find((s) => !c.equipment[s]) ?? slots[0];
      const r = doEquip(c, item, target);
      if (!r.ok) events.emit('toast', { text: r.reason ?? 'Cannot equip that', kind: 'bad' });
      else uiSfx('ui.equip');
      return;
    }
    this.itemMenu(item, ev);
  }

  /** Asks how many to take off the stack at pack slot `index`, then splits it. */
  private askSplit(item: Item, index: number): void {
    const c = save.account.current;
    if (!c) return;
    const held = stackCount(item);
    if (held < 2) return;
    splitStackDialog(attempt(() => itemDisplayName(item), 'stack'), held, (n) => {
      normalizeInventory(c);
      const at = c.inventory[index]?.uid === item.uid ? index : invIndexOf(c, item);
      if (at < 0 || !splitStack(c.inventory, at, n)) {
        events.emit('toast', { text: 'No empty slot to split into.', kind: 'bad' });
        return;
      }
      save.touch();
      uiSfx('ui.click');
      events.emit('ui:refresh', {});
      this.refresh();
    });
  }

  /** Everything you can do with an item that is not "wear it" or "drink it". */
  private itemMenu(item: Item, ev: MouseEvent): void {
    const c = save.account.current;
    if (!c) return;
    const at = invIndexOf(c, item);
    const split = stackCount(item) > 1 && at >= 0
      ? [{ label: 'Split stack', icon: 'bag', hint: 'Shift+click', onPick: () => this.askSplit(item, at) }]
      : [];
    contextMenu(ev.clientX, ev.clientY, [
      ...split,
      {
        label: 'Send to Vault',
        icon: 'stash',
        onPick: () => {
          if (save.stashItem(item)) {
            invRemove(c, item);
            save.touch();
            events.emit('toast', { text: 'Stored in the vault.', kind: 'good' });
            events.emit('ui:refresh', {});
          } else {
            events.emit('toast', { text: 'The vault is full.', kind: 'bad' });
          }
        },
      },
      {
        label: 'Take to the Blacksmith',
        icon: 'anvil',
        onPick: () => events.emit('ui:open', { panel: 'blacksmith' }),
      },
      {
        label: 'Drop on the ground',
        icon: 'trash',
        hint: 'Ctrl+right-click',
        onPick: () => this.discard({ kind: 'inventory', item }),
      },
    ], attempt(() => item.name, 'Item'));
  }

  /**
   * Puts a dragged gem or rune into a host item's first empty socket.
   *
   * Dragging the stone onto the thing you want it in is the obvious gesture,
   * and until now the only way to socket anything was to walk to the anvil and
   * click the socket itself. Returns false when this is not a socketing move at
   * all, so the caller can fall through to its normal swap.
   */
  private trySocket(gem: Item | null | undefined, host: Item | null | undefined): boolean {
    const c = save.account.current;
    if (!c || !gem || !host || gem.uid === host.uid) return false;
    const gemBase = safeBase(gem);
    if (gemBase?.category !== 'gem' && gemBase?.category !== 'rune') return false;

    const free = host.sockets.findIndex((s) => !s.gemId);
    if (free < 0) {
      const why = host.sockets.length === 0 ? 'has no sockets' : 'has no empty socket';
      events.emit('toast', { text: `${attempt(() => itemDisplayName(host), 'That')} ${why}.`, kind: 'bad' });
      // Handled: the player clearly meant to socket it, so do not also swap the
      // two items around as a consolation prize.
      return true;
    }

    const r = attempt(() => insertGem(host, gem.baseId, free), { ok: false, reason: 'Failed' });
    if (!r.ok) {
      events.emit('toast', { text: r.reason ?? 'It will not seat.', kind: 'bad' });
      return true;
    }
    invConsumeOne(c, gem);
    save.touch();
    uiSfx('ui.equip');
    events.emit('toast', {
      text: `${attempt(() => itemDisplayName(gem), 'Gem')} set into ${attempt(() => itemDisplayName(host), 'it')}.`,
      kind: 'good',
    });
    events.emit('ui:refresh', {});
    this.refresh();
    return true;
  }

  /** True when dropping `gem` on `host` would socket rather than swap. */
  private isSocketMove(gem: Item | null | undefined, host: Item | null | undefined): boolean {
    if (!gem || !host || gem.uid === host.uid) return false;
    const cat = safeBase(gem)?.category;
    if (cat !== 'gem' && cat !== 'rune') return false;
    return host.sockets.length > 0;
  }

  private dropIntoInventory(p: DragPayload, index: number, under = index): boolean {
    const c = save.account.current;
    if (!c || !p.item) return false;
    normalizeInventory(c);

    // A gem landing on a socketed item goes in it, rather than trading places.
    if (this.trySocket(p.item, c.inventory[under] ?? null)) return true;

    if (p.kind === 'equipment' && p.slot) {
      if (!doUnequip(c, p.slot)) return false;
      // Set it down where the player dropped it if it fits there.
      const at = invIndexOf(c, p.item);
      if (at >= 0 && at !== index && fitsAt(c.inventory, p.item, index, at)) {
        c.inventory[at] = null;
        c.inventory[index] = p.item;
      }
      this.refresh();
      return true;
    }

    if (p.kind === 'inventory' && p.index !== undefined) {
      const from = p.index;
      if (from === index) return true;
      // Same kind of stack: pour it in. Onto one item: trade places. Across
      // two or more, it will not go.
      if (!moveBetween(c.inventory, from, c.inventory, index)) {
        events.emit('toast', { text: 'It will not fit there.', kind: 'bad' });
        return false;
      }
      save.touch();
      this.refresh();
      return true;
    }

    if (p.kind === 'stash' && p.index !== undefined) {
      if (!placeOrFit(save.account.stash, p.index, c.inventory, index)) {
        events.emit('toast', { text: 'No room in your pack for that.', kind: 'bad' });
        return false;
      }
      save.touch();
      events.emit('ui:refresh', {});
      return true;
    }

    return false;
  }

  private readonly boundRefresh = (): void => this.refresh();

  refresh(): void {
    const c = save.account.current;
    if (!c) return;
    normalizeInventory(c);

    for (const [slot, ui] of this.equipSlots) {
      const it = c.equipment[slot] ?? null;
      const uid = it?.uid ?? '';
      const fresh = this.wornPrimed && uid !== '' && this.worn.get(slot) !== uid;
      this.worn.set(slot, uid);
      ui.setItem(it);
      if (fresh) ui.flash();
    }
    this.wornPrimed = true;

    // Two-handers visually claim the off-hand.
    const mh = c.equipment.mainHand ?? null;
    // A two-hander blocks the off hand — except for a quiver, which is worn on
    // the back and is exactly what a two-handed bow needs.
    const off = c.equipment.offHand ?? null;
    this.equipSlots
      .get('offHand')
      ?.root.classList.toggle('is-blocked', isTwoHanded(mh) && !isWornOffHand(off));

    this.grid.setItems(c.inventory, 0, this.quietNext);
    this.quietNext = false;
    countTo(this.goldEl, c.gold, fmtInt, 400);
    const used = invCount(c);
    this.capacityEl.textContent = `${used} / ${c.inventory.length}`;
    this.capacityEl.parentElement?.classList.toggle('is-full', used >= c.inventory.length);

    this.view.setCharacter(c);
    if (this.panel.isOpen) this.view.start();

    const def = classById(c.classId);
    this.crest.innerHTML = classCrestSvg(c.classId, classAccent(c.classId), 190);
    this.panel.setTitle('Equipment', `${c.name} · Level ${c.level} ${def?.name ?? ''}`);

    this.renderStatRail(c);
  }

  private renderStatRail(c: Character): void {
    const st = attempt(() => computeStats(c), null);
    clear(this.statRail);
    if (!st) return;
    const s = section('At a Glance', 'target');
    const dps = ((st.minDamage + st.maxDamage) / 2) * Math.max(0.1, st.attackSpeed / 100 + 1);
    s.body.appendChild(statLine('Damage', `${fmt(st.minDamage)} – ${fmt(st.maxDamage)}`, { icon: 'sword' }));
    s.body.appendChild(statLine('Est. DPS', fmt(dps), { icon: 'crit' }));
    s.body.appendChild(statLine('Defense', fmt(st.defense), { icon: 'defense' }));
    s.body.appendChild(statLine('Life', fmt(st.life), { icon: 'life' }));
    s.body.appendChild(statLine('Mana', fmt(st.mana), { icon: 'mana' }));
    s.body.appendChild(statLine('Magic Find', `${fmt(st.magicFind)}%`, { icon: 'magicFind' }));
    this.statRail.appendChild(s.root);

    const worth = c.inventory.reduce((sum, it) => sum + (it ? attempt(() => vendorPrice(it, false), 0) : 0), 0);
    const foot = div('inv-worth');
    foot.appendChild(icon('coin', { size: 12 }));
    foot.appendChild(span('', `Pack worth ${fmtInt(worth)}`));
    this.statRail.appendChild(foot);
  }
}
