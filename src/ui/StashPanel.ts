/**
 * SLAY — the vault.
 *
 * The cross-character bank. Multiple tabs, drag both ways against the pack, a
 * search filter, and gold that moves between the character's purse and the
 * account vault. The banner says the important part out loud: this survives
 * death, your pack does not.
 */

import type { Item, ItemRarity } from '../types';
import { events } from '../core/Events';
import { save, STASH_TAB_SIZE } from '../core/Save';
import { itemDisplayName } from '../sim/Loot';
import { sortSlots } from '../sim/Inventory';
import { ItemGrid, normalizeInventory, invFirstFree } from './InventoryPanel';
import {
  scheduleRefresh,
  Panel,
  Button,
  Tabs,
  add,
  clear,
  div,
  span,
  icon,
  fmtInt,
  countTo,
  safeBase,
  attempt,
  modal,
  type DragPayload,
} from './Widgets';

const TAB_COLS = 12;
const TAB_ROWS = 10;

export class StashPanel {
  readonly panel: Panel;
  private tabs: Tabs;
  private stashGrid: ItemGrid;
  private packGrid: ItemGrid;
  private tabIndex = 0;
  private search = '';
  private vaultGoldEl: HTMLSpanElement;
  private purseGoldEl: HTMLSpanElement;
  private tabBar: HTMLDivElement;

  constructor() {
    this.panel = new Panel({
      id: 'stash',
      title: 'The Vault',
      subtitle: 'Everything stored here outlives you',
      icon: 'stash',
      width: 1180,
    });
    this.panel.frame.classList.add('panel-stash');

    const wrap = div('trade-wrap');
    wrap.style.gridTemplateColumns = 'minmax(0,1fr) 320px';

    // --- vault side -------------------------------------------------------
    const left = div('trade-col');
    const hd = div('trade-colhd');
    hd.appendChild(span('trade-coltitle', 'Vault'));

    const searchBox = div('trade-search');
    searchBox.appendChild(icon('search', { size: 13 }));
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Search by name or type…';
    input.addEventListener('input', () => {
      this.search = input.value.trim().toLowerCase();
      this.applyFilter();
    });
    input.addEventListener('keydown', (e) => e.stopPropagation());
    searchBox.appendChild(input);
    hd.appendChild(searchBox);
    left.appendChild(hd);

    this.tabBar = div('');
    this.tabs = new Tabs([], 'tab0', (id) => {
      this.tabIndex = Number(id.replace('tab', '')) || 0;
      this.refresh();
    });
    const tabRow = div('row');
    tabRow.appendChild(this.tabs.root);
    const addTab = new Button({
      label: '+ Tab',
      variant: 'ghost',
      small: true,
      onClick: () => {
        if (save.addStashTab()) {
          events.emit('toast', { text: 'Vault expanded.', kind: 'good' });
          this.refresh();
        } else {
          events.emit('toast', { text: 'The vault cannot hold more tabs.', kind: 'bad' });
        }
      },
    });
    tabRow.appendChild(addTab.root);

    // Sorts the tab you are looking at, not the whole vault: a ten-tab vault
    // sorted as one blob would shuffle everything you had deliberately filed.
    const sortTab = new Button({
      label: 'Sort Tab',
      variant: 'ghost',
      icon: 'sparkle',
      small: true,
      onClick: () => {
        const start = this.tabIndex * STASH_TAB_SIZE;
        const slice = save.account.stash.slice(start, start + STASH_TAB_SIZE);
        sortSlots(slice);
        for (let i = 0; i < STASH_TAB_SIZE; i++) save.account.stash[start + i] = slice[i] ?? null;
        save.touch();
        this.refresh();
        events.emit('toast', { text: 'Tab sorted.', kind: 'info' });
      },
    });
    tabRow.appendChild(sortTab.root);
    this.tabBar.appendChild(tabRow);
    left.appendChild(this.tabBar);

    this.stashGrid = new ItemGrid({
      cols: TAB_COLS,
      rows: TAB_ROWS,
      size: 46,
      source: 'stash',
      accepts: (p) => !!p.item,
      onDrop: (p, i) => this.dropIntoStash(p, i),
      onRightClick: (item, i) => this.toPack(item, i),
    });
    left.appendChild(this.stashGrid.root);

    const note = div('trade-note');
    note.appendChild(icon('info', { size: 13 }));
    note.appendChild(
      span('', 'The vault is shared by every character on this account and is never lost on death. Your pack is.')
    );
    left.appendChild(note);

    // --- pack side --------------------------------------------------------
    const right = div('trade-col');
    const rhd = div('trade-colhd');
    rhd.appendChild(span('trade-coltitle', 'Pack'));
    rhd.appendChild(span('goldbank-label', 'right-click to store'));
    right.appendChild(rhd);

    this.packGrid = new ItemGrid({
      cols: 6,
      rows: 10,
      size: 46,
      source: 'inventory',
      accepts: (p) => !!p.item,
      onDrop: (p, i) => this.dropIntoPack(p, i),
      onRightClick: (item) => this.toVault(item),
    });
    right.appendChild(this.packGrid.root);

    // --- gold -------------------------------------------------------------
    const bank = div('goldbank');
    const r1 = div('goldbank-row');
    r1.appendChild(span('goldbank-label', 'Vault'));
    this.vaultGoldEl = span('goldbank-value', '0');
    r1.appendChild(this.vaultGoldEl);
    const r2 = div('goldbank-row');
    r2.appendChild(span('goldbank-label', 'Purse'));
    this.purseGoldEl = span('goldbank-value', '0');
    r2.appendChild(this.purseGoldEl);

    const dep = div('goldbank-actions');
    for (const amount of [1000, 10000, -1] as number[]) {
      dep.appendChild(
        new Button({
          label: amount < 0 ? 'All' : fmtInt(amount),
          variant: 'ghost',
          small: true,
          onClick: () => this.deposit(amount),
        }).root
      );
    }
    const wit = div('goldbank-actions');
    for (const amount of [1000, 10000, -1] as number[]) {
      wit.appendChild(
        new Button({
          label: amount < 0 ? 'All' : fmtInt(amount),
          variant: 'ghost',
          small: true,
          onClick: () => this.withdraw(amount),
        }).root
      );
    }
    add(bank, r1, r2, div('goldbank-label', 'Deposit'), dep, div('goldbank-label', 'Withdraw'), wit);
    right.appendChild(bank);

    add(wrap, left, right);
    this.panel.body.appendChild(wrap);

    events.on('ui:refresh', () => {
      if (this.panel.isOpen) scheduleRefresh(this.boundRefresh);
    });
  }

  open(): void {
    this.refresh();
    this.panel.open();
  }
  close(): void {
    this.panel.close();
  }
  get isOpen(): boolean {
    return this.panel.isOpen;
  }

  // -- data ----------------------------------------------------------------

  private tabOffset(): number {
    return this.tabIndex * STASH_TAB_SIZE;
  }

  private readonly boundRefresh = (): void => this.refresh();

  refresh(): void {
    const acct = save.account;
    const defs = [];
    for (let i = 0; i < acct.stashTabs; i++) {
      const from = i * STASH_TAB_SIZE;
      let used = 0;
      for (let k = from; k < from + STASH_TAB_SIZE; k++) if (acct.stash[k]) used++;
      defs.push({ id: `tab${i}`, label: `Tab ${i + 1}`, count: used });
    }
    if (this.tabIndex >= acct.stashTabs) this.tabIndex = 0;
    this.tabs.setTabs(defs, `tab${this.tabIndex}`);

    this.stashGrid.setItems(acct.stash, this.tabOffset());

    const c = acct.current;
    if (c) {
      normalizeInventory(c);
      this.packGrid.setItems(c.inventory);
      countTo(this.purseGoldEl, c.gold, fmtInt, 320);
    } else {
      this.packGrid.setItems([]);
      this.purseGoldEl.textContent = '0';
    }
    countTo(this.vaultGoldEl, acct.bankGold, fmtInt, 320);
    this.applyFilter();
  }

  private applyFilter(): void {
    if (!this.search) {
      this.stashGrid.applyFilter(null);
      return;
    }
    const q = this.search;
    this.stashGrid.applyFilter((item) => {
      const name = attempt(() => itemDisplayName(item), item.name).toLowerCase();
      const base = safeBase(item);
      return (
        name.includes(q) ||
        (base?.name.toLowerCase().includes(q) ?? false) ||
        (base?.category.toLowerCase().includes(q) ?? false) ||
        item.rarity.includes(q)
      );
    });
  }

  // -- movement ------------------------------------------------------------

  private dropIntoStash(p: DragPayload, index: number): boolean {
    const acct = save.account;
    const target = this.tabOffset() + index;
    if (!p.item) return false;

    if (p.kind === 'stash' && p.index !== undefined) {
      const a = acct.stash[p.index] ?? null;
      acct.stash[p.index] = acct.stash[target] ?? null;
      acct.stash[target] = a;
      save.touch();
      this.refresh();
      return true;
    }

    const c = acct.current;
    if (!c) return false;

    if (p.kind === 'inventory' && p.index !== undefined) {
      const displaced = acct.stash[target] ?? null;
      acct.stash[target] = p.item;
      c.inventory[p.index] = displaced;
      save.touch();
      events.emit('ui:refresh', {});
      return true;
    }

    if (p.kind === 'equipment') {
      events.emit('toast', { text: 'Unequip it first.', kind: 'bad' });
      return false;
    }
    return false;
  }

  private dropIntoPack(p: DragPayload, index: number): boolean {
    const acct = save.account;
    const c = acct.current;
    if (!c || !p.item) return false;
    normalizeInventory(c);

    if (p.kind === 'stash' && p.index !== undefined) {
      const displaced = c.inventory[index] ?? null;
      c.inventory[index] = p.item;
      acct.stash[p.index] = displaced;
      save.touch();
      events.emit('ui:refresh', {});
      return true;
    }
    if (p.kind === 'inventory' && p.index !== undefined) {
      const a = c.inventory[p.index] ?? null;
      c.inventory[p.index] = c.inventory[index] ?? null;
      c.inventory[index] = a;
      save.touch();
      this.refresh();
      return true;
    }
    return false;
  }

  private toVault(item: Item | null): void {
    const c = save.account.current;
    if (!c || !item) return;
    const at = c.inventory.findIndex((i) => i?.uid === item.uid);
    if (at < 0) return;
    const free = save.account.stash.indexOf(null);
    if (free < 0) {
      events.emit('toast', { text: 'The vault is full.', kind: 'bad' });
      return;
    }
    save.account.stash[free] = item;
    c.inventory[at] = null;
    save.touch();
    events.emit('sfx', { id: 'ui.click' });
    events.emit('ui:refresh', {});
  }

  private toPack(item: Item | null, index: number): void {
    const c = save.account.current;
    if (!c || !item) return;
    normalizeInventory(c);
    const free = invFirstFree(c);
    if (free < 0) {
      events.emit('toast', { text: 'Your pack is full.', kind: 'bad' });
      return;
    }
    c.inventory[free] = item;
    save.account.stash[this.tabOffset() + index] = null;
    save.touch();
    events.emit('sfx', { id: 'ui.click' });
    events.emit('ui:refresh', {});
  }

  // -- gold ----------------------------------------------------------------

  private deposit(amount: number): void {
    const c = save.account.current;
    if (!c) return;
    const n = amount < 0 ? c.gold : Math.min(amount, c.gold);
    if (n <= 0) {
      events.emit('toast', { text: 'Nothing to deposit.', kind: 'info' });
      return;
    }
    c.gold -= n;
    save.account.bankGold += n;
    save.touch();
    events.emit('ui:refresh', {});
  }

  private withdraw(amount: number): void {
    const c = save.account.current;
    if (!c) return;
    const n = amount < 0 ? save.account.bankGold : Math.min(amount, save.account.bankGold);
    if (n <= 0) {
      events.emit('toast', { text: 'The vault is empty.', kind: 'info' });
      return;
    }
    save.account.bankGold -= n;
    c.gold += n;
    save.touch();
    events.emit('ui:refresh', {});
  }
}

export { modal as _modal };
export type { ItemRarity as _ItemRarity };
