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
import { rollItem, vendorPrice, itemDisplayName, rarityRank, createItem, getBase } from '../sim/Loot';
import { Random, randomSeed } from '../core/RNG';
import { ItemGrid, normalizeInventory, invFirstFree, invRemove } from './InventoryPanel';
import { recordSale, buyBackList, buyBackPrice, takeBack } from '../sim/BuyBack';
import { addItemToInventory, setStackCount } from '../sim/Inventory';
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
  modal,
  rarityHex,
  attempt,
  type DragPayload,
} from './Widgets';

/** Rarities that demand a confirmation before being sold. */
const PRECIOUS: ItemRarity[] = ['set', 'unique', 'mythic', 'ancient'];

const STOCK_SIZE = 40;

/**
 * What the apothecary keeps behind the counter.
 *
 * Ordered so the cheap reliable flasks come first and the situational tonics
 * sit at the end, and filtered by level so a fresh character is not looking at
 * a wall of things they cannot use.
 */
const POTION_STOCK = [
  'potion.heal.minor',
  'potion.mana.minor',
  'potion.heal.light',
  'potion.mana.light',
  'potion.heal.greater',
  'potion.mana.greater',
  'potion.heal.super',
  'potion.mana.super',
  'potion.rejuv.lesser',
  'potion.rejuv.full',
  'potion.heal.full',
  'potion.antidote',
  'potion.thawing',
  'potion.stamina',
  'potion.oil.fire',
  'potion.oil.venom',
];

/**
 * What kind of counter this is.
 *
 * The apothecary is the same shop with a different shelf: same buying, same
 * selling, same buy-back. Only what it stocks changes, so it is a parameter
 * rather than a second panel class that would drift out of sync.
 */
export interface VendorOpts {
  id: string;
  title: string;
  subtitle: string;
  icon?: string;
  /** Restrict the shelf to one item category. */
  only?: 'potion';
}

export class VendorPanel {
  readonly panel: Panel;
  private opts: VendorOpts;
  private stock: Array<Item | null> = new Array(STOCK_SIZE).fill(null);
  private stockGrid: ItemGrid;
  private packGrid: ItemGrid;
  private goldEl: HTMLSpanElement;
  private restockEl: HTMLDivElement;
  private restockBtn!: Button;
  private tabs!: Tabs;
  /** Which shelf the left column is showing. */
  private tab: 'stock' | 'buyback' = 'stock';
  /** How many crates have been asked for since the last cleared run. */
  private restocks = 0;
  private generatedFor = -1;

  constructor(opts: VendorOpts = {
    id: 'vendor',
    title: 'Merchant',
    subtitle: 'Everything has a price, and hers are bad',
    icon: 'coin',
  }) {
    this.opts = opts;
    this.panel = new Panel({
      id: opts.id,
      title: opts.title,
      subtitle: opts.subtitle,
      icon: opts.icon ?? 'coin',
      width: 1080,
    });
    this.panel.frame.classList.add('panel-vendor');

    const wrap = div('trade-wrap');
    wrap.style.gridTemplateColumns = '1fr 1fr';

    // --- stock ------------------------------------------------------------
    const left = div('trade-col');
    const lhd = div('trade-colhd');
    // The shelf behind the counter. Everything you sold this visit sits there
    // at exactly what you were paid, until you go back down.
    this.tabs = new Tabs(
      [
        { id: 'stock', label: 'For Sale' },
        { id: 'buyback', label: 'Buy Back' },
      ],
      'stock',
      (id) => {
        this.tab = id === 'buyback' ? 'buyback' : 'stock';
        this.refresh();
      },
    );
    lhd.appendChild(this.tabs.root);
    this.restockEl = div('goldbank-label', '');
    lhd.appendChild(this.restockEl);
    left.appendChild(lhd);

    this.stockGrid = new ItemGrid({
      cols: 8,
      rows: 5,
      size: 50,
      source: 'vendor',
      accepts: () => false,
      onClick: (item, i) => {
        if (!item) return;
        if (this.tab === 'buyback') this.buyBack(item);
        else this.buy(item, i);
      },
      onRightClick: (item, i) => {
        if (!item) return;
        if (this.tab === 'buyback') this.buyBack(item);
        else this.buy(item, i);
      },
    });
    left.appendChild(this.stockGrid.root);

    const buyHint = div('inv-hint', 'Click an item to buy it.');
    left.appendChild(buyHint);

    this.restockBtn = new Button({
      label: 'Ask for new stock',
      variant: 'ghost',
      icon: 'sparkle',
      small: true,
      onClick: () => this.buyRestock(),
    });
    left.appendChild(this.restockBtn.root);

    // A cleared run wipes the tally. Rerolling the shelf between floors of the
    // same run gets expensive fast; going back down and finishing resets it.
    events.on('run:cleared', () => {
      this.restocks = 0;
      this.generatedFor = -1;
      this.refresh();
    });

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
      if (this.panel.isOpen) scheduleRefresh(this.boundRefresh);
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

  /**
   * What the next crate costs.
   *
   * Doubling-ish per crate inside a single trip to town, so the first reroll is
   * an easy call and the fifth is a real decision. Scaled by level and best
   * depth so it stays a meaningful sum instead of pocket change by depth 40.
   */
  private restockCost(): number {
    const c = save.account.current;
    const base = 140 + (c?.level ?? 1) * 40 + Math.max(1, save.account.bestDepth) * 55;
    return Math.round(base * Math.pow(1.9, this.restocks));
  }

  /** Pay for a fresh shelf, or say why you cannot. */
  private buyRestock(): void {
    const c = save.account.current;
    if (!c) return;
    const cost = this.restockCost();
    if (c.gold < cost) {
      events.emit('toast', { text: `You need ${fmtInt(cost - c.gold)} more gold.`, kind: 'bad' });
      this.restockBtn.flash('bad');
      return;
    }
    c.gold -= cost;
    save.setCharacter(c);
    this.restocks++;
    this.generateStock();
    this.refresh();
    this.restockBtn.flash('good');
    events.emit('toast', { text: `The merchant unpacks another crate. ${fmtInt(cost)} gold.`, kind: 'info' });
  }

  private generateStock(): void {
    const c = save.account.current;
    const level = c?.level ?? 1;
    const depth = Math.max(1, save.account.bestDepth);
    this.generatedFor = save.account.bestDepth + this.restocks * 1000;
    const rng = new Random(randomSeed());
    this.stock = new Array(STOCK_SIZE).fill(null);

    // The apothecary stocks flasks, not gear, and stocks them deep: a potion
    // shop that sells one of each is a shop you visit once.
    if (this.opts.only === 'potion') {
      const pool = POTION_STOCK.filter((id) => {
        const base = attempt(() => getBase(id), null);
        return !!base && base.levelReq <= level + 6;
      });
      pool.forEach((id, i) => {
        if (i >= STOCK_SIZE) return;
        const item = attempt(() => createItem(id, Math.max(1, level), rng, 'normal'), null);
        if (!item) return;
        item.seen = true;
        setStackCount(item, 10);
        this.stock[i] = item;
      });
      this.restockEl.textContent = `${this.stock.filter(Boolean).length} kinds`;
      return;
    }

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

  private readonly boundRefresh = (): void => this.refresh();

  refresh(): void {
    const c = save.account.current;
    const shelf = buyBackList();
    if (this.tab === 'buyback') {
      const items: Array<Item | null> = shelf.map((e) => e.item);
      while (items.length < STOCK_SIZE) items.push(null);
      this.stockGrid.setItems(items);
    } else {
      this.stockGrid.setItems(this.stock);
    }
    this.tabs.setTabs(
      [
        { id: 'stock', label: 'For Sale' },
        { id: 'buyback', label: shelf.length > 0 ? `Buy Back (${shelf.length})` : 'Buy Back' },
      ],
      this.tab,
    );
    if (c) {
      normalizeInventory(c);
      this.packGrid.setItems(c.inventory);
      countTo(this.goldEl, c.gold, fmtInt, 340);
    }
    const cost = this.restockCost();
    this.restockBtn.setLabel(`Ask for new stock — ${fmtInt(cost)}g`);
    this.restockBtn.setDisabled((c?.gold ?? 0) < cost || this.tab === 'buyback');
    this.restockBtn.root.style.display = this.tab === 'buyback' ? 'none' : '';
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

  /**
   * Takes something back off the shelf for exactly what you were paid.
   *
   * No markup on purpose. This is an undo for a misclick, not a trading
   * mechanic, and charging a spread would make it one.
   */
  private buyBack(item: Item): void {
    const c = save.account.current;
    if (!c) return;
    const price = buyBackPrice(item.uid);
    if (price === null) return;
    if (c.gold < price) {
      events.emit('toast', { text: `You need ${fmtInt(price - c.gold)} more gold.`, kind: 'bad' });
      return;
    }
    if (invFirstFree(c) < 0) {
      events.emit('toast', { text: 'Your pack is full.', kind: 'bad' });
      return;
    }
    const back = takeBack(item.uid);
    if (!back) return;
    c.gold -= price;
    addItemToInventory(c, back);
    save.setCharacter(c);
    events.emit('sfx', { id: 'ui.buy' });
    events.emit('toast', {
      text: `${attempt(() => itemDisplayName(back), 'Item')} bought back.`,
      kind: 'good',
    });
    this.refresh();
    events.emit('ui:refresh', {});
  }

  private sell(item: Item, price: number): void {
    const c = save.account.current;
    if (!c) return;
    invRemove(c, item);
    recordSale(item, price);
    c.gold += price;
    save.touch();
    events.emit('sfx', { id: 'ui.sell' });
    events.emit('toast', { text: `Sold for ${fmtInt(price)} gold.`, kind: 'good' });
    events.emit('ui:refresh', {});
  }
}

export { clear as _clear };
