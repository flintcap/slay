/**
 * SLAY — the item tooltip.
 *
 * The single most-read element in an ARPG. Everything about it is deliberate:
 * the rarity-coloured frame, the strict line order (base -> implicit -> affixes
 * -> sockets -> set -> requirements -> flavour -> value), the red requirement
 * lines when you cannot wear it, and the side-by-side comparison against what
 * is already equipped with green/red deltas.
 */

import type { Item, EquipSlot, StatKey, Stats } from '../types';
import { itemTooltipLines, itemDisplayName, vendorPrice, itemStats } from '../sim/Loot';
import { computeStats } from '../sim/Stats';
import { save } from '../core/Save';
import { getGem } from '../data/gems';
import {
  add,
  clear,
  div,
  span,
  icon,
  iconSvg,
  rarityHex,
  fmt,
  fmtInt,
  signed,
  hoverHooks,
  safeBase,
  slotsFor,
  isTwoHanded,
  itemIconName,
  STAT_LABEL,
  STAT_ICON,
  PERCENT_STATS,
  formatStatValue,
  attempt,
  type ItemHoverContext,
} from './Widgets';

const RARITY_WORD: Record<string, string> = {
  normal: 'Common',
  magic: 'Magic',
  rare: 'Rare',
  set: 'Set Item',
  unique: 'Unique',
  mythic: 'Mythic',
  ancient: 'Ancient',
};

/** Stats worth surfacing in the compare delta strip, in reading order. */
const COMPARE_KEYS: StatKey[] = [
  'minDamage',
  'maxDamage',
  'enhancedDamage',
  'attackSpeed',
  'critChance',
  'critDamage',
  'defense',
  'enhancedDefense',
  'blockChance',
  'life',
  'mana',
  'strength',
  'dexterity',
  'vitality',
  'energy',
  'fireResist',
  'coldResist',
  'lightningResist',
  'poisonResist',
  'arcaneResist',
  'lifeSteal',
  'moveSpeed',
  'magicFind',
  'goldFind',
  'skillLevels',
];

class TooltipManager {
  private root: HTMLDivElement;
  private main: HTMLDivElement;
  private compareCol: HTMLDivElement;
  private anchor: HTMLElement | null = null;
  private compareHeld = false;
  private currentItem: Item | null = null;
  private currentCtx: ItemHoverContext | undefined;
  private visible = false;

  /** When true, equippable items show the comparison without holding a key. */
  compareByDefault = true;

  constructor() {
    this.root = div('tt-wrap');
    this.main = div('tt');
    this.compareCol = div('tt tt-compare');
    add(this.root, this.compareCol, this.main);

    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', () => {
      this.compareHeld = false;
    });
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
    hoverHooks.item = (item, anchor, ctx) => this.showItem(item, anchor, ctx);
    hoverHooks.text = (html, anchor, title) => this.showText(html, anchor, title);
    hoverHooks.hide = () => this.hide();
  }

  private onKey = (e: KeyboardEvent): void => {
    const held = e.type === 'keydown';
    if (e.key === 'Shift' || e.key === 'Alt') {
      if (this.compareHeld === held) return;
      this.compareHeld = held;
      if (this.visible && this.currentItem) this.showItem(this.currentItem, this.anchor, this.currentCtx);
    }
  };

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.currentItem = null;
    this.root.classList.remove('is-open');
  }

  // -- public API -----------------------------------------------------------

  showText(html: string, anchor: HTMLElement | null, title?: string): void {
    this.currentItem = null;
    clear(this.main);
    this.compareCol.style.display = 'none';
    this.main.removeAttribute('data-rarity');
    this.main.style.setProperty('--rc', 'var(--gold)');
    this.main.classList.add('tt-plain');
    if (title) this.main.appendChild(div('tt-name', title));
    const b = div('tt-text');
    b.innerHTML = html;
    this.main.appendChild(b);
    this.place(anchor);
  }

  showItem(item: Item, anchor: HTMLElement | null, ctx?: ItemHoverContext): void {
    this.currentItem = item;
    this.currentCtx = ctx;
    this.anchor = anchor;
    this.main.classList.remove('tt-plain');
    clear(this.main);

    const char = save.account.current;
    const equipped = this.equippedFor(item, ctx);
    const wantCompare = !!equipped && !ctx?.noCompare && (this.compareHeld || this.compareByDefault);

    this.buildItemCard(this.main, item, char ? computeStats(char) : null, char?.level ?? 1, ctx, false);

    if (wantCompare && equipped) {
      clear(this.compareCol);
      this.compareCol.style.display = '';
      this.buildItemCard(this.compareCol, equipped, char ? computeStats(char) : null, char?.level ?? 1, undefined, true);
      this.appendDeltas(this.main, item, equipped);
    } else {
      this.compareCol.style.display = 'none';
      if (equipped && !ctx?.noCompare) {
        const hint = div('tt-hint');
        hint.appendChild(span('', 'Hold '));
        hint.appendChild(span('keycap', 'Shift'));
        hint.appendChild(span('', ' to compare'));
        this.main.appendChild(hint);
      }
    }

    this.place(anchor);
  }

  // -- internals ------------------------------------------------------------

  private equippedFor(item: Item, ctx?: ItemHoverContext): Item | null {
    const char = save.account.current;
    if (!char || ctx?.source === 'equipment') return null;
    const slots = slotsFor(item);
    if (!slots.length) return null;
    for (const s of slots) {
      const cur = char.equipment[s];
      if (cur && cur.uid !== item.uid) return cur;
    }
    // An empty ring/hand still deserves a comparison against the other one.
    const first = char.equipment[slots[0] as EquipSlot];
    return first && first.uid !== item.uid ? first : null;
  }

  private buildItemCard(
    host: HTMLDivElement,
    item: Item,
    stats: Stats | null,
    level: number,
    ctx: ItemHoverContext | undefined,
    isCompare: boolean
  ): void {
    const rc = rarityHex(item.rarity);
    host.dataset.rarity = item.rarity;
    host.style.setProperty('--rc', rc);

    if (isCompare) host.appendChild(div('tt-compare-flag', 'Currently Equipped'));

    // --- header ------------------------------------------------------------
    const hd = div('tt-hd');
    const crest = div('tt-crest');
    crest.innerHTML = iconSvg(itemIconName(item), { size: 26 });
    hd.appendChild(crest);

    const titles = div('tt-titles');
    const name = attempt(() => itemDisplayName(item), item.name || 'Unknown Item');
    const nameEl = div('tt-name', name);
    if (item.upgrade > 0) nameEl.appendChild(span('tt-upg', ` +${item.upgrade}`));
    titles.appendChild(nameEl);

    const base = safeBase(item);
    const baseLine = div('tt-base');
    baseLine.appendChild(span('tt-rarity-word', RARITY_WORD[item.rarity] ?? item.rarity));
    if (base && base.name !== name) baseLine.appendChild(span('tt-base-name', ` · ${base.name}`));
    if (isTwoHanded(item)) baseLine.appendChild(span('tt-tag', ' · Two-Handed'));
    if (item.corrupted) baseLine.appendChild(span('tt-corrupt', ' · Corrupted'));
    titles.appendChild(baseLine);
    hd.appendChild(titles);
    host.appendChild(hd);

    // --- weapon / armour headline ------------------------------------------
    if (base) {
      const block = div('tt-block');
      const stat = attempt(() => itemStats(item), {} as Partial<Stats>);
      if (base.baseMinDamage !== undefined || stat.minDamage) {
        const lo = Math.round(stat.minDamage ?? base.baseMinDamage ?? 0);
        const hi = Math.round(stat.maxDamage ?? base.baseMaxDamage ?? 0);
        block.appendChild(this.bigStat('Damage', `${lo} – ${hi}`, 'sword'));
        if (base.baseSpeed) {
          block.appendChild(this.bigStat('Speed', `${base.baseSpeed.toFixed(2)}/s`, 'speed'));
        }
      }
      if (base.baseDefense !== undefined || stat.defense) {
        block.appendChild(this.bigStat('Defense', fmtInt(stat.defense ?? base.baseDefense ?? 0), 'defense'));
      }
      if (base.baseBlock) {
        block.appendChild(this.bigStat('Block', `${Math.round(base.baseBlock * 100)}%`, 'block'));
      }
      if (block.childElementCount) host.appendChild(block);
    }

    // --- affix lines from the item module ----------------------------------
    const lines = attempt(() => itemTooltipLines(item), [] as Array<{ text: string; color: string; bold?: boolean }>);
    if (lines.length) {
      const body = div('tt-lines');
      for (const l of lines) {
        if (!l || !l.text) continue;
        const line = div('tt-line');
        line.textContent = l.text;
        if (l.color) line.style.color = l.color;
        if (l.bold) line.classList.add('is-bold');
        body.appendChild(line);
      }
      host.appendChild(body);
    }

    // --- sockets -----------------------------------------------------------
    if (item.sockets && item.sockets.length) {
      const sockRow = div('tt-sockets');
      sockRow.appendChild(span('tt-sublabel', `Sockets (${item.sockets.filter((s) => s.gemId).length}/${item.sockets.length})`));
      const strip = div('tt-socket-strip');
      for (const s of item.sockets) {
        const cell = div(s.gemId ? 'tt-socket filled' : 'tt-socket');
        if (s.gemId) {
          const gem = attempt(() => getGem(s.gemId as string) ?? null, null);
          const col = gem ? `#${(gem.color ?? 0xffffff).toString(16).padStart(6, '0')}` : '#9fe6ff';
          cell.style.setProperty('--gc', col);
          cell.innerHTML = iconSvg('gem', { size: 14 });
          cell.title = gem?.name ?? s.gemId;
        }
        strip.appendChild(cell);
      }
      sockRow.appendChild(strip);
      host.appendChild(sockRow);
    }

    // --- set membership ----------------------------------------------------
    if (item.setId) host.appendChild(this.buildSetBlock(item));

    // --- requirements ------------------------------------------------------
    if (base) {
      const reqs: Array<{ label: string; met: boolean }> = [];
      if (base.levelReq > 1) reqs.push({ label: `Level ${base.levelReq}`, met: level >= base.levelReq });
      if (base.strReq) reqs.push({ label: `${base.strReq} Strength`, met: (stats?.strength ?? 0) >= base.strReq });
      if (base.dexReq) reqs.push({ label: `${base.dexReq} Dexterity`, met: (stats?.dexterity ?? 0) >= base.dexReq });
      if (reqs.length) {
        const r = div('tt-reqs');
        r.appendChild(span('tt-sublabel', 'Requires'));
        for (const q of reqs) {
          const c = span(`tt-req ${q.met ? 'met' : 'unmet'}`, q.label);
          r.appendChild(c);
        }
        host.appendChild(r);
      }
      if (base.classes && base.classes.length) {
        host.appendChild(div('tt-class-lock', `${base.classes.map(titleCase).join(' / ')} only`));
      }
    }

    // --- flavour -----------------------------------------------------------
    const flavor = (item as unknown as { flavor?: string }).flavor;
    if (flavor) host.appendChild(div('tt-flavor', `“${flavor}”`));
    else if (item.uniqueId && item.rarity === 'unique') {
      host.appendChild(div('tt-flavor', '“Forged in an age the world has agreed to forget.”'));
    }

    // --- footer ------------------------------------------------------------
    const ft = div('tt-ft');
    const value = attempt(() => vendorPrice(item, false), item.value ?? 0);
    const worth = span('tt-worth');
    worth.appendChild(icon('coin', { size: 12 }));
    worth.appendChild(span('', fmtInt(ctx?.price ? ctx.price.gold : value)));
    worth.appendChild(span('tt-worth-label', ctx?.price ? ` ${ctx.price.label}` : ' vendor value'));
    ft.appendChild(worth);
    ft.appendChild(span('tt-ilvl', `ilvl ${item.ilvl}`));
    host.appendChild(ft);

    if (!isCompare && ctx?.source) {
      const hints = div('tt-actions');
      if (ctx.source === 'inventory') hints.appendChild(this.hintChip('Right-click', 'Equip'));
      if (ctx.source === 'equipment') hints.appendChild(this.hintChip('Right-click', 'Unequip'));
      if (ctx.source === 'vendor') hints.appendChild(this.hintChip('Click', 'Buy'));
      if (ctx.source === 'stash') hints.appendChild(this.hintChip('Right-click', 'To Inventory'));
      if (hints.childElementCount) host.appendChild(hints);
    }
  }

  private hintChip(key: string, label: string): HTMLElement {
    const c = span('tt-actionchip');
    c.appendChild(span('keycap', key));
    c.appendChild(span('', label));
    return c;
  }

  private bigStat(label: string, value: string, iconName: string): HTMLElement {
    const b = div('tt-bigstat');
    b.appendChild(icon(iconName, { size: 14 }));
    const t = div('tt-bigstat-text');
    t.appendChild(div('tt-bigstat-value', value));
    t.appendChild(div('tt-bigstat-label', label));
    b.appendChild(t);
    return b;
  }

  private buildSetBlock(item: Item): HTMLElement {
    const char = save.account.current;
    const setId = item.setId as string;
    const worn: Item[] = [];
    if (char) {
      for (const key of Object.keys(char.equipment) as EquipSlot[]) {
        const it = char.equipment[key];
        if (it && it.setId === setId) worn.push(it);
      }
    }
    const active = worn.length + (worn.some((w) => w.uid === item.uid) ? 0 : 1);
    const block = div('tt-set');
    block.appendChild(div('tt-set-name', `${titleCase(setId.replace(/[-_]/g, ' '))} Set`));
    const count = div('tt-set-count', `${worn.length} piece${worn.length === 1 ? '' : 's'} worn`);
    block.appendChild(count);
    for (const w of worn) {
      block.appendChild(div('tt-set-piece active', attempt(() => itemDisplayName(w), w.name)));
    }
    if (worn.length === 0) {
      block.appendChild(div('tt-set-piece', 'No other pieces equipped'));
    }
    block.appendChild(
      div('tt-set-note', active >= 2 ? 'Set bonuses active.' : 'Wear another piece to awaken the set.')
    );
    return block;
  }

  /** The green/red delta strip — the reason players hold the compare key. */
  private appendDeltas(host: HTMLDivElement, item: Item, equipped: Item): void {
    const a = attempt(() => itemStats(item), {} as Partial<Stats>);
    const b = attempt(() => itemStats(equipped), {} as Partial<Stats>);
    const rows: HTMLElement[] = [];
    for (const key of COMPARE_KEYS) {
      const av = a[key] ?? 0;
      const bv = b[key] ?? 0;
      const d = av - bv;
      if (Math.abs(d) < 0.005) continue;
      const line = div(`tt-delta ${d > 0 ? 'up' : 'down'}`);
      const l = span('tt-delta-label');
      const ic = STAT_ICON[key];
      if (ic) l.appendChild(icon(ic, { size: 12 }));
      l.appendChild(span('', STAT_LABEL[key]));
      line.appendChild(l);
      const suffix = PERCENT_STATS.has(key) ? '%' : '';
      line.appendChild(span('tt-delta-v', `${signed(d, Number.isInteger(d) ? 0 : 1)}${suffix}`));
      rows.push(line);
    }
    if (!rows.length) {
      host.appendChild(div('tt-delta-none', 'No net stat change'));
      return;
    }
    const wrap = div('tt-deltas');
    wrap.appendChild(span('tt-sublabel', 'Versus equipped'));
    for (const r of rows.slice(0, 12)) wrap.appendChild(r);
    host.appendChild(wrap);
  }

  /**
   * Smart placement: prefer the side of the anchor with more room, clamp into
   * the viewport, and never cover the thing being hovered.
   */
  private place(anchor: HTMLElement | null): void {
    this.visible = true;
    this.root.classList.add('is-open');
    // Measure with the tooltip laid out but off-screen.
    this.root.style.left = '-4000px';
    this.root.style.top = '0px';

    requestAnimationFrame(() => {
      const w = this.root.offsetWidth;
      const h = this.root.offsetHeight;
      const pad = 12;
      let x: number;
      let y: number;
      if (anchor && anchor.isConnected) {
        const r = anchor.getBoundingClientRect();
        const spaceRight = window.innerWidth - r.right;
        x = spaceRight > w + pad * 2 ? r.right + pad : r.left - w - pad;
        if (x < pad) x = Math.min(r.right + pad, window.innerWidth - w - pad);
        y = r.top + r.height / 2 - h / 2;
      } else {
        x = window.innerWidth / 2 - w / 2;
        y = window.innerHeight / 2 - h / 2;
      }
      x = Math.max(pad, Math.min(x, window.innerWidth - w - pad));
      y = Math.max(pad, Math.min(y, window.innerHeight - h - pad));
      this.root.style.left = `${Math.round(x)}px`;
      this.root.style.top = `${Math.round(y)}px`;
    });
  }
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export const tooltip = new TooltipManager();

/** Convenience for panels that want a plain explanatory tooltip. */
export function statExplainer(stat: StatKey, value: number, how: string): string {
  return (
    `<div class="tt-explain-value">${STAT_LABEL[stat]}: <b>${formatStatValue(stat, value)}</b></div>` +
    `<div class="tt-explain-how">${how}</div>`
  );
}

export { fmt as _fmt };
