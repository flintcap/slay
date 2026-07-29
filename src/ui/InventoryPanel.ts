/**
 * SLAY — inventory and paperdoll.
 *
 * Left: the ten equipment slots laid out around a class crest. Right: the
 * backpack grid. Items move by pointer drag (with valid/invalid drop
 * highlighting) or by right-click to equip. Every slot feeds the comparison
 * tooltip.
 */

import type { Character, EquipSlot, Item } from '../types';
import { RARITY_ORDER } from '../types';
import { events } from '../core/Events';
import { save, INVENTORY_SIZE } from '../core/Save';
import { equipItem, unequipItem, isWornOffHand } from '../sim/Character';
import { computeStats } from '../sim/Stats';
import { vendorPrice, itemDisplayName } from '../sim/Loot';
import {
  Panel,
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

export function invFirstFree(c: Character): number {
  normalizeInventory(c);
  for (let i = 0; i < c.inventory.length; i++) if (!c.inventory[i]) return i;
  return -1;
}

export function invAdd(c: Character, item: Item): boolean {
  if (invIndexOf(c, item) >= 0) return true;
  const i = invFirstFree(c);
  if (i < 0) return false;
  c.inventory[i] = item;
  return true;
}

export function invRemove(c: Character, item: Item): void {
  const i = invIndexOf(c, item);
  if (i >= 0) c.inventory[i] = null;
}

export function invCount(c: Character): number {
  normalizeInventory(c);
  let n = 0;
  for (const it of c.inventory) if (it) n++;
  return n;
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
  if (invFirstFree(c) < 0) {
    events.emit('toast', { text: 'Your pack is full.', kind: 'bad' });
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
  /** Called when something is dropped onto cell `index`. Return true if handled. */
  onDrop?: (payload: DragPayload, index: number) => boolean;
  accepts?: (payload: DragPayload, index: number) => boolean;
  onClick?: (item: Item | null, index: number, ev: MouseEvent) => void;
  onRightClick?: (item: Item | null, index: number, ev: MouseEvent) => void;
  hoverPrice?: (item: Item) => { gold: number; label: string } | undefined;
}

export class ItemGrid {
  readonly root: HTMLDivElement;
  readonly slots: ItemSlot[] = [];
  private opts: ItemGridOpts;

  constructor(opts: ItemGridOpts) {
    this.opts = opts;
    const size = opts.size ?? 50;
    this.root = div('itemgrid');
    this.root.style.setProperty('--cols', String(opts.cols));
    this.root.style.setProperty('--cell', `${size}px`);
    const total = opts.cols * opts.rows;
    for (let i = 0; i < total; i++) {
      const slot = new ItemSlot({
        size,
        source: opts.source,
        index: i,
        hoverContext: { source: opts.source },
        onClick: (item, ev) => opts.onClick?.(item, i, ev),
        onRightClick: (item, ev) => opts.onRightClick?.(item, i, ev),
      });
      registerDrop(
        slot.root,
        (p) => (opts.accepts ? opts.accepts(p, i) : !!p.item),
        (p) => opts.onDrop?.(p, i) ?? false
      );
      this.slots.push(slot);
      this.root.appendChild(slot.root);
    }
  }

  setItems(items: Array<Item | null>, offset = 0): void {
    for (let i = 0; i < this.slots.length; i++) {
      const item = items[offset + i] ?? null;
      this.slots[i].setItem(item);
      if (item && this.opts.hoverPrice) {
        const p = this.opts.hoverPrice(item);
        this.slots[i].root.dataset.price = p ? String(p.gold) : '';
      }
    }
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

const PAPERDOLL: EquipSlot[] = [
  'helm',
  'amulet',
  'mainHand',
  'chest',
  'offHand',
  'gloves',
  'belt',
  'ring1',
  'boots',
  'ring2',
];

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

  constructor() {
    this.panel = new Panel({
      id: 'inventory',
      title: 'Equipment',
      subtitle: 'What you carry is what you lose',
      icon: 'bag',
      width: 1010,
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

    // The live figure sits in the middle column, with the slots down each side.
    const stage = div('paperdoll-figure');
    stage.appendChild(this.view.root);
    stage.appendChild(div('pd-view-hint', SPIN_HINT));
    doll.appendChild(stage);

    for (const s of PAPERDOLL) {
      const slot = new ItemSlot({
        size: 58,
        source: 'equipment',
        slot: s,
        placeholder: SLOT_ICON[s],
        placeholderLabel: '',
        hoverContext: { source: 'equipment' },
        onRightClick: (item) => {
          const c = save.account.current;
          if (!c || !item) return;
          doUnequip(c, s);
        },
      });
      slot.root.classList.add('pd-slot', `pd-${s}`);
      slot.root.title = SLOT_LABEL[s];
      registerDrop(
        slot.root,
        (p) => !!p.item && slotsFor(p.item).includes(s),
        (p) => {
          const c = save.account.current;
          if (!c || !p.item) return false;
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
    this.capacityEl = span('inv-cap-v', '0 / 60');
    cap.appendChild(this.capacityEl);

    const gold = div('inv-gold');
    gold.appendChild(icon('coin', { size: 15 }));
    this.goldEl = span('inv-gold-v', '0');
    gold.appendChild(this.goldEl);
    add(packHd, cap, gold);

    this.grid = new ItemGrid({
      cols: 10,
      rows: 6,
      size: 50,
      source: 'inventory',
      accepts: (p) => !!p.item,
      onDrop: (p, index) => this.dropIntoInventory(p, index),
      onRightClick: (item, _i, ev) => this.onRightClick(item, ev),
    });

    const hint = div('inv-hint');
    hint.appendChild(span('', 'Right-click to equip or drink · drag onto the ground to drop · hold '));
    hint.appendChild(span('keycap', 'Shift'));
    hint.appendChild(span('', ' and right-click for more'));

    // Dragging an item out of the window and letting go throws it away, which
    // is how the whole genre does it and was the one thing the pack could not
    // do at all.
    drag.onWorldDrop = (p) => this.discard(p);

    add(right, packHd, this.grid.root, hint);
    add(wrap, left, right);
    this.panel.body.appendChild(wrap);

    events.on('ui:refresh', () => {
      if (this.panel.isOpen) this.refresh();
    });
    events.on('loot:pickedUp', () => {
      if (this.panel.isOpen) this.refresh();
    });
    events.on('loot:gold', () => {
      if (this.panel.isOpen) this.refresh();
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
      else events.emit('sfx', { id: 'ui.equip' });
      return;
    }
    this.itemMenu(item, ev);
  }

  /** Everything you can do with an item that is not "wear it" or "drink it". */
  private itemMenu(item: Item, ev: MouseEvent): void {
    const c = save.account.current;
    if (!c) return;
    contextMenu(ev.clientX, ev.clientY, [
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
        onPick: () => this.discard({ kind: 'inventory', item }),
      },
    ], attempt(() => item.name, 'Item'));
  }

  private dropIntoInventory(p: DragPayload, index: number): boolean {
    const c = save.account.current;
    if (!c || !p.item) return false;
    normalizeInventory(c);

    if (p.kind === 'equipment' && p.slot) {
      if (!doUnequip(c, p.slot)) return false;
      // Place it exactly where the player dropped it if that cell is free.
      const at = invIndexOf(c, p.item);
      if (at >= 0 && !c.inventory[index]) {
        c.inventory[at] = null;
        c.inventory[index] = p.item;
      }
      this.refresh();
      return true;
    }

    if (p.kind === 'inventory' && p.index !== undefined) {
      const from = p.index;
      if (from === index) return true;
      const a = c.inventory[from] ?? null;
      const b = c.inventory[index] ?? null;
      c.inventory[index] = a;
      c.inventory[from] = b;
      save.touch();
      this.refresh();
      return true;
    }

    if (p.kind === 'stash' && p.index !== undefined) {
      const stash = save.account.stash;
      if (c.inventory[index]) {
        const free = invFirstFree(c);
        if (free < 0) {
          events.emit('toast', { text: 'Your pack is full.', kind: 'bad' });
          return false;
        }
        c.inventory[free] = p.item;
      } else {
        c.inventory[index] = p.item;
      }
      stash[p.index] = null;
      save.touch();
      events.emit('ui:refresh', {});
      return true;
    }

    return false;
  }

  refresh(): void {
    const c = save.account.current;
    if (!c) return;
    normalizeInventory(c);

    for (const [slot, ui] of this.equipSlots) ui.setItem(c.equipment[slot] ?? null);

    // Two-handers visually claim the off-hand.
    const mh = c.equipment.mainHand ?? null;
    // A two-hander blocks the off hand — except for a quiver, which is worn on
    // the back and is exactly what a two-handed bow needs.
    const off = c.equipment.offHand ?? null;
    this.equipSlots
      .get('offHand')
      ?.root.classList.toggle('is-blocked', isTwoHanded(mh) && !isWornOffHand(off));

    this.grid.setItems(c.inventory);
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
