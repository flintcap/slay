/**
 * SLAY — the merchant.
 *
 * Rolling stock on the left, your pack on the right, prices on every slot. Set,
 * unique, mythic and ancient items get a confirmation dialog before they are
 * sold, because losing a mythic to a misclick is the kind of thing players
 * quit over.
 */

import type { Item, ItemRarity } from '../types';
import { RARITY_ORDER } from '../types';
import { events } from '../core/Events';
import { save } from '../core/Save';
import { rollItem, vendorPrice, itemDisplayName, rarityRank } from '../sim/Loot';
import { Random, randomSeed } from '../core/RNG';
import { ItemGrid, normalizeInventory, invFirstFree, invRemove } from './InventoryPanel';
import {
  Panel,
  Button,
  add,
  clear,
  div,
  span,
  icon,
  fmtInt,
  countTo,
  modal,
  rarityHex,
  attempt,
  type DragPayload,
} from './Widgets';

/** Rarities that demand a confirmation before being sold. */
const PRECIOUS: ItemRarity[] = ['set', 'unique', 'mythic', 'ancient'];

const STOCK_SIZE = 40;

export class VendorPanel {
  readonly panel: Panel;
  private stock: Array<Item | null> = new Array(STOCK_SIZE).fill(null);
  private stockGrid: ItemGrid;
  private packGrid: ItemGrid;
  private goldEl: HTMLSpanElement;
  private restockEl: HTMLDivElement;
  private restocks = 0;
  private generatedFor = -1;

  constructor() {
    this.panel = new Panel({
      id: 'vendor',
      title: 'Merchant',
      subtitle: 'Everything has a price, and hers are bad',
      icon: 'coin',
      width: 1080,
    });
    this.panel.frame.classList.add('panel-vendor');

    const wrap = div('trade-wrap');
    wrap.style.gridTemplateColumns = '1fr 1fr';

    // --- stock ------------------------------------------------------------
    const left = div('trade-col');
    const lhd = div('trade-colhd');
    lhd.appendChild(span('trade-coltitle', 'For Sale'));
    this.restockEl = div('goldbank-label', '');
    lhd.appendChild(this.restockEl);
    left.appendChild(lhd);

    this.stockGrid = new ItemGrid({
      cols: 8,
      rows: 5,
      size: 50,
      source: 'vendor',
      accepts: () => false,
      onClick: (item, i) => this.buy(item, i),
      onRightClick: (item, i) => this.buy(item, i),
    });
    left.appendChild(this.stockGrid.root);

    const buyHint = div('inv-hint', 'Click an item to buy it.');
    left.appendChild(buyHint);

    const restock = new Button({
      label: 'Ask for new stock',
      variant: 'ghost',
      icon: 'sparkle',
      small: true,
      onClick: () => {
        this.restocks++;
        this.generateStock();
        this.refresh();
        events.emit('toast', { text: 'The merchant unpacks another crate.', kind: 'info' });
      },
    });
    left.appendChild(restock.root);

    // --- pack -------------------------------------------------------------
    const right = div('trade-col');
    const rhd = div('trade-colhd');
    rhd.appendChild(span('trade-coltitle', 'Your Pack'));
    const gold = div('inv-gold');
    gold.appendChild(icon('coin', { size: 14 }));
    this.goldEl = span('inv-gold-v', '0');
    gold.appendChild(this.goldEl);
    rhd.appendChild(gold);
    right.appendChild(rhd);

    this.packGrid = new ItemGrid({
      cols: 8,
      rows: 8,
      size: 50,
      source: 'inventory',
      accepts: (p) => p.kind === 'inventory' && !!p.item,
      onDrop: (p) => this.sellFromDrag(p),
      onClick: (item) => this.trySell(item),
      onRightClick: (item) => this.trySell(item),
    });
    right.appendChild(this.packGrid.root);
    right.appendChild(div('inv-hint', 'Click an item in your pack to sell it.'));

    const note = div('trade-note warn');
    note.appendChild(icon('warn', { size: 13 }));
    note.appendChild(span('', 'Sold items are gone for good. Set and better always ask twice.'));
    right.appendChild(note);

    add(wrap, left, right);
    this.panel.body.appendChild(wrap);

    events.on('ui:refresh', () => {
      if (this.panel.isOpen) this.refresh();
    });
  }

  open(): void {
    const depth = save.account.bestDepth;
    if (this.generatedFor !== depth + this.restocks * 1000) this.generateStock();
    this.refresh();
    this.panel.open();
  }
  close(): void {
    this.panel.close();
  }
  get isOpen(): boolean {
    return this.panel.isOpen;
  }

  // -- stock ---------------------------------------------------------------

  private generateStock(): void {
    const c = save.account.current;
    const level = c?.level ?? 1;
    const depth = Math.max(1, save.account.bestDepth);
    this.generatedFor = save.account.bestDepth + this.restocks * 1000;
    const rng = new Random(randomSeed());
    this.stock = new Array(STOCK_SIZE).fill(null);
    for (let i = 0; i < STOCK_SIZE; i++) {
      // A little above the player's level so the shop is aspirational.
      const ilvl = Math.max(1, level + rng.int(-2, 4) + Math.floor(depth / 3));
      // Rare is the ceiling. Sets, uniques, mythics and ancients are things you
      // go and find; stocking them on a shelf turns the whole loot chase into a
      // gold check. Reroll rather than force the rarity, so the shop still
      // carries a normal spread of white, blue and yellow.
      const item = attempt(() => {
        for (let tries = 0; tries < 8; tries++) {
          const roll = rollItem(ilvl, rng, { magicFind: 40 + this.restocks * 5, classId: c?.classId });
          if (roll && rarityRank(roll.rarity) <= rarityRank('rare')) return roll;
        }
        return rollItem(ilvl, rng, { classId: c?.classId, forceRarity: 'rare' });
      }, null);
      if (item) {
        item.seen = true;
        this.stock[i] = item;
      }
    }
    this.restockEl.textContent = `${this.stock.filter(Boolean).length} wares`;
  }

  refresh(): void {
    const c = save.account.current;
    this.stockGrid.setItems(this.stock);
    if (c) {
      normalizeInventory(c);
      this.packGrid.setItems(c.inventory);
      countTo(this.goldEl, c.gold, fmtInt, 340);
    }
    this.decorate(c?.gold ?? 0);
  }

  /** Stamps prices onto both grids and greys out anything unaffordable. */
  private decorate(gold: number): void {
    for (let i = 0; i < this.stockGrid.slots.length; i++) {
      const slot = this.stockGrid.slots[i];
      const item = slot.item;
      let tag = slot.root.querySelector<HTMLElement>('.vendor-price');
      if (!item) {
        tag?.remove();
        slot.root.classList.remove('cannot-afford');
        continue;
      }
      const price = attempt(() => vendorPrice(item, true), item.value ?? 0);
      if (!tag) {
        tag = div('vendor-price');
        slot.root.appendChild(tag);
      }
      tag.textContent = fmtInt(price);
      slot.root.classList.toggle('cannot-afford', gold < price);
    }
    for (const slot of this.packGrid.slots) {
      const item = slot.item;
      let tag = slot.root.querySelector<HTMLElement>('.vendor-price');
      if (!item) {
        tag?.remove();
        continue;
      }
      const price = attempt(() => vendorPrice(item, false), Math.floor((item.value ?? 0) / 4));
      if (!tag) {
        tag = div('vendor-price');
        slot.root.appendChild(tag);
      }
      tag.textContent = `+${fmtInt(price)}`;
    }
  }

  // -- transactions --------------------------------------------------------

  private buy(item: Item | null, index: number): void {
    const c = save.account.current;
    if (!c || !item) return;
    const price = attempt(() => vendorPrice(item, true), item.value ?? 0);
    if (c.gold < price) {
      events.emit('toast', { text: `You need ${fmtInt(price - c.gold)} more gold.`, kind: 'bad' });
      return;
    }
    normalizeInventory(c);
    const free = invFirstFree(c);
    if (free < 0) {
      events.emit('toast', { text: 'Your pack is full.', kind: 'bad' });
      return;
    }
    c.gold -= price;
    c.inventory[free] = item;
    this.stock[index] = null;
    save.touch();
    events.emit('sfx', { id: 'ui.buy' });
    events.emit('toast', {
      text: `Bought ${attempt(() => itemDisplayName(item), item.name)}`,
      kind: 'good',
      rarity: item.rarity,
    });
    events.emit('ui:refresh', {});
  }

  private sellFromDrag(p: DragPayload): boolean {
    if (!p.item) return false;
    this.trySell(p.item);
    return true;
  }

  private trySell(item: Item | null): void {
    if (!item) return;
    const price = attempt(() => vendorPrice(item, false), Math.floor((item.value ?? 0) / 4));
    const rank = RARITY_ORDER.indexOf(item.rarity);
    const precious = PRECIOUS.includes(item.rarity) || rank >= RARITY_ORDER.indexOf('set');

    if (!precious) {
      this.sell(item, price);
      return;
    }

    const name = attempt(() => itemDisplayName(item), item.name);
    const body = div('');
    const title = div('');
    title.style.color = rarityHex(item.rarity);
    title.style.fontWeight = '700';
    title.style.fontSize = '15px';
    title.textContent = name;
    body.appendChild(title);
    body.appendChild(
      div('', `This is a ${item.rarity} item. Selling it destroys it permanently — there is no buyback.`)
    );
    const worth = div('');
    worth.style.marginTop = '10px';
    worth.innerHTML = `You will receive <b>${fmtInt(price)}</b> gold.`;
    body.appendChild(worth);

    modal({
      title: 'Sell this?',
      icon: 'warn',
      tone: 'danger',
      body,
      confirmLabel: `Sell for ${fmtInt(price)}`,
      cancelLabel: 'Keep it',
      onConfirm: () => this.sell(item, price),
    });
  }

  private sell(item: Item, price: number): void {
    const c = save.account.current;
    if (!c) return;
    invRemove(c, item);
    c.gold += price;
    save.touch();
    events.emit('sfx', { id: 'ui.sell' });
    events.emit('toast', { text: `Sold for ${fmtInt(price)} gold.`, kind: 'good' });
    events.emit('ui:refresh', {});
  }
}

export { clear as _clear };
