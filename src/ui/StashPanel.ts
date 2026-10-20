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
import { moveBetween, sortStashTab, splitStack, stackCount } from '../sim/Inventory';
import { findFit, tabArea, INV_COLS, INV_ROWS, STASH_COLS, STASH_ROWS } from '../sim/Grid';
import { ItemGrid, normalizeInventory, invFirstFree, placeOrFit } from './InventoryPanel';
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
  splitStackDialog,
  type DragPayload,
} from './Widgets';
import { uiSfx } from './Sfx';
import { tr } from '../core/I18n';

const TAB_COLS = STASH_COLS;
const TAB_ROWS = STASH_ROWS;
/** Cell size on this screen: both grids side by side have to fit. */
const CELL = 42;

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
  private addTab: Button;

  constructor() {
    this.panel = new Panel({
      id: 'stash',
      title: tr('The Vault'),
      subtitle: tr('Everything stored here outlives you'),
      icon: 'stash',
      width: 1180,
    });
    this.panel.frame.classList.add('panel-stash');

    const wrap = div('trade-wrap');
    wrap.style.gridTemplateColumns = 'minmax(0,1fr) auto';

    // --- vault side -------------------------------------------------------
    const left = div('trade-col');
    const hd = div('trade-colhd');
    hd.appendChild(span('trade-coltitle', tr('Vault')));

    const searchBox = div('trade-search');
    searchBox.appendChild(icon('search', { size: 13 }));
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = tr('Search by name or type…');
    input.addEventListener('input', () => {
      this.search = input.value.trim().toLowerCase();
      this.applyFilter();
    });
    input.addEventListener('keydown', (e) => e.stopPropagation());
    searchBox.appendChild(input);
    hd.appendChild(searchBox);
    left.appendChild(hd);

    this.tabBar = div('stash-tabbar');
    this.tabs = new Tabs([], 'tab0', (id) => {
      this.tabIndex = Number(id.replace('tab', '')) || 0;
      this.refresh();
    });
    // The tabs get the column's whole width and slide sideways once they
    // outgrow it. The buttons sit up by the search box, so a vault of ten
    // tabs can never push them out of sight.
    this.tabs.root.classList.add('stash-tabs');
    this.tabs.root.addEventListener(
      'wheel',
      (e) => {
        const strip = this.tabs.root;
        if (strip.scrollWidth <= strip.clientWidth || e.deltaX !== 0) return;
        strip.scrollLeft += e.deltaY;
        e.preventDefault();
      },
      { passive: false },
    );
    this.tabs.root.addEventListener('scroll', () => this.markTabEdges(), { passive: true });
    this.tabBar.appendChild(this.tabs.root);
    const tools = div('stash-tools');
    // Tabs past the first four are bought (Save.STASH_TAB_PRICES), so the
    // Legacy reward tab is worth something.
    this.addTab = new Button({
      label: tr('+ Tab'),
      variant: 'ghost',
      small: true,
      onClick: () => this.buyTab(),
    });
    tools.appendChild(this.addTab.root);

    // Sorts the tab you are looking at, not the whole vault: a ten-tab vault
    // sorted as one blob would shuffle everything you had deliberately filed.
    const sortTab = new Button({
      label: tr('Sort Tab'),
      variant: 'ghost',
      icon: 'sparkle',
      small: true,
      onClick: () => {
        sortStashTab(this.tabIndex);
        this.quietNext = true;
        this.refresh();
        this.stashGrid.playSort();
        uiSfx('ui.click');
      },
    });
    tools.appendChild(sortTab.root);
    hd.appendChild(tools);
    left.appendChild(this.tabBar);

    this.stashGrid = new ItemGrid({
      cols: TAB_COLS,
      rows: TAB_ROWS,
      size: CELL,
      source: 'stash',
      accepts: (p) => !!p.item,
      onDrop: (p, i) => this.dropIntoStash(p, i),
      onClick: (item, i, ev) => {
        if (ev.shiftKey && item) this.askSplit(item, 'stash', this.tabOffset() + i);
      },
      onRightClick: (item, i) => this.toPack(item, i),
    });
    left.appendChild(this.stashGrid.root);

    const note = div('trade-note');
    note.appendChild(icon('info', { size: 13 }));
    note.appendChild(
      span('', tr('The vault is shared by every character on this account and is never lost on death. Your pack is.'))
    );
    left.appendChild(note);

    // --- pack side --------------------------------------------------------
    const right = div('trade-col');
    const rhd = div('trade-colhd');
    rhd.appendChild(span('trade-coltitle', tr('Pack')));
    rhd.appendChild(span('goldbank-label', 'right-click to store'));
    right.appendChild(rhd);

    this.packGrid = new ItemGrid({
      cols: INV_COLS,
      rows: INV_ROWS,
      size: CELL,
      source: 'inventory',
      accepts: (p) => !!p.item,
      onDrop: (p, i) => this.dropIntoPack(p, i),
      onClick: (item, i, ev) => {
        if (ev.shiftKey && item) this.askSplit(item, 'pack', i);
      },
      onRightClick: (item) => this.toVault(item),
    });
    right.appendChild(this.packGrid.root);

    // --- gold -------------------------------------------------------------
    const bank = div('goldbank');
    const r1 = div('goldbank-row');
    r1.appendChild(span('goldbank-label', tr('Vault')));
    this.vaultGoldEl = span('goldbank-value', '0');
    r1.appendChild(this.vaultGoldEl);
    const r2 = div('goldbank-row');
    r2.appendChild(span('goldbank-label', tr('Purse')));
    this.purseGoldEl = span('goldbank-value', '0');
    r2.appendChild(this.purseGoldEl);

    const dep = div('goldbank-actions');
    for (const amount of [1000, 10000, -1] as number[]) {
      dep.appendChild(
        new Button({
          label: amount < 0 ? tr('All') : fmtInt(amount),
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
          label: amount < 0 ? tr('All') : fmtInt(amount),
          variant: 'ghost',
          small: true,
          onClick: () => this.withdraw(amount),
        }).root
      );
    }
    add(bank, r1, r2, div('goldbank-label', tr('Deposit')), dep, div('goldbank-label', tr('Withdraw')), wit);
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
  private quietNext = false;
  private shownOffset = -1;

  private buyTab(): void {
    const price = save.stashTabPrice();
    if (price === null) return;
    modal({
      title: tr('Buy a vault tab?'),
      icon: 'stash',
      body: tr('<p>One more tab of {0} cells for <b>{1} gold</b>. Paid from the bank first, then your purse.</p>', STASH_TAB_SIZE, fmtInt(price)),
      confirmLabel: tr('Buy tab'),
      onConfirm: () => {
        const r = save.buyStashTab();
        if (r === 'ok') {
          uiSfx('ui.buy');
          events.emit('toast', { text: tr('Vault expanded.'), kind: 'good' });
        } else {
          events.emit('toast', { text: r === 'gold' ? tr('Not enough gold.') : tr('The vault cannot hold more tabs.'), kind: 'bad' });
        }
        events.emit('ui:refresh', {});
        this.refresh();
      },
    });
  }

  /** Slides the tab strip so the open tab is in full view. */
  private showActiveTab(): void {
    const strip = this.tabs.root;
    const on = strip.querySelector<HTMLElement>('.tab.on');
    if (on && strip.scrollWidth > strip.clientWidth) {
      // The strip is the tabs' offset parent (it is positioned).
      const left = on.offsetLeft;
      if (left < strip.scrollLeft) strip.scrollLeft = left - 12;
      else if (left + on.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = left + on.offsetWidth - strip.clientWidth + 12;
    }
    this.markTabEdges();
  }

  /** Fades whichever end of the tab strip has tabs slid out past it. */
  private markTabEdges(): void {
    const strip = this.tabs.root;
    const more = strip.scrollWidth - strip.clientWidth;
    this.tabBar.classList.toggle('more-left', more > 1 && strip.scrollLeft > 1);
    this.tabBar.classList.toggle('more-right', more > 1 && strip.scrollLeft < more - 1);
  }

  refresh(): void {
    const acct = save.account;
    const defs = [];
    for (let i = 0; i < acct.stashTabs; i++) {
      const from = i * STASH_TAB_SIZE;
      let used = 0;
      for (let k = from; k < from + STASH_TAB_SIZE; k++) if (acct.stash[k]) used++;
      defs.push({ id: `tab${i}`, label: tr('Tab {0}', i + 1), count: used });
    }
    if (this.tabIndex >= acct.stashTabs) this.tabIndex = 0;
    this.tabs.setTabs(defs, `tab${this.tabIndex}`);
    const price = save.stashTabPrice();
    this.addTab.setLabel(price === null ? tr('Vault full') : tr('+ Tab · {0} gold', fmtInt(price)));
    this.addTab.setDisabled(price === null);
    this.showActiveTab();

    // A tab switch or a sort replaces every cell; only a real arrival flashes.
    const offset = this.tabOffset();
    this.stashGrid.setItems(acct.stash, offset, this.quietNext || offset !== this.shownOffset);
    this.shownOffset = offset;
    this.quietNext = false;

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
      // Same kind of stack: pour it in. Onto one item: trade places.
      if (!moveBetween(acct.stash, p.index, acct.stash, target)) {
        events.emit('toast', { text: tr('It will not fit there.'), kind: 'bad' });
        return false;
      }
      save.touch();
      this.refresh();
      return true;
    }

    const c = acct.current;
    if (!c) return false;

    if (p.kind === 'inventory' && p.index !== undefined) {
      if (!placeOrFit(c.inventory, p.index, acct.stash, target)) {
        events.emit('toast', { text: tr('No room in this tab for that.'), kind: 'bad' });
        return false;
      }
      save.touch();
      events.emit('ui:refresh', {});
      return true;
    }

    if (p.kind === 'equipment') {
      events.emit('toast', { text: tr('Unequip it first.'), kind: 'bad' });
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
      if (!placeOrFit(acct.stash, p.index, c.inventory, index)) {
        events.emit('toast', { text: tr('No room in your pack for that.'), kind: 'bad' });
        return false;
      }
      save.touch();
      events.emit('ui:refresh', {});
      return true;
    }
    if (p.kind === 'inventory' && p.index !== undefined) {
      if (!moveBetween(c.inventory, p.index, c.inventory, index)) {
        events.emit('toast', { text: tr('It will not fit there.'), kind: 'bad' });
        return false;
      }
      save.touch();
      this.refresh();
      return true;
    }
    return false;
  }

  /**
   * Shift+click on a stack: ask how many, then split them off into the first
   * empty slot of the same side (the open tab, for the vault).
   */
  private askSplit(item: Item, side: 'stash' | 'pack', index: number): void {
    const held = stackCount(item);
    if (held < 2) return;
    splitStackDialog(attempt(() => itemDisplayName(item), 'stack'), held, (n) => {
      const c = save.account.current;
      let ok = false;
      if (side === 'stash') {
        const start = this.tabOffset();
        ok = save.account.stash[index]?.uid === item.uid && splitStack(save.account.stash, index, n, start, start + STASH_TAB_SIZE);
      } else if (c) {
        normalizeInventory(c);
        ok = c.inventory[index]?.uid === item.uid && splitStack(c.inventory, index, n);
      }
      if (!ok) {
        events.emit('toast', { text: tr('No empty slot to split into.'), kind: 'bad' });
        return;
      }
      save.touch();
      uiSfx('ui.click');
      events.emit('ui:refresh', {});
      this.refresh();
    });
  }

  private toVault(item: Item | null): void {
    const c = save.account.current;
    if (!c || !item) return;
    const at = c.inventory.findIndex((i) => i?.uid === item.uid);
    if (at < 0) return;
    // The open tab first, then any tab with room.
    let free = findFit(save.account.stash, item, tabArea(this.tabIndex));
    if (free < 0) free = findFit(save.account.stash, item);
    if (free < 0) {
      events.emit('toast', { text: tr('No room in the vault for that.'), kind: 'bad' });
      return;
    }
    save.account.stash[free] = item;
    c.inventory[at] = null;
    save.touch();
    uiSfx('ui.click');
    events.emit('ui:refresh', {});
  }

  private toPack(item: Item | null, index: number): void {
    const c = save.account.current;
    if (!c || !item) return;
    normalizeInventory(c);
    const free = invFirstFree(c, item);
    if (free < 0) {
      events.emit('toast', { text: tr('No room in your pack for that.'), kind: 'bad' });
      return;
    }
    c.inventory[free] = item;
    save.account.stash[this.tabOffset() + index] = null;
    save.touch();
    uiSfx('ui.click');
    events.emit('ui:refresh', {});
  }

  // -- gold ----------------------------------------------------------------

  private deposit(amount: number): void {
    const c = save.account.current;
    if (!c) return;
    const n = amount < 0 ? c.gold : Math.min(amount, c.gold);
    if (n <= 0) {
      events.emit('toast', { text: tr('Nothing to deposit.'), kind: 'info' });
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
      events.emit('toast', { text: tr('The vault is empty.'), kind: 'info' });
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
