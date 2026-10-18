/**
 * SLAY — the item tooltip.
 *
 * The single most-read element in an ARPG. Everything about it is deliberate:
 * the rarity-coloured frame, the strict line order (base -> implicit -> affixes
 * -> sockets -> set -> requirements -> flavour -> value), the red requirement
 * lines when you cannot wear it, and the side-by-side comparison against what
 * is already equipped with green/red deltas.
 */

import type { Item, ItemMod, EquipSlot, StatKey, Stats, ItemRarity } from '../types';
import { itemTooltipLines, itemDisplayName, vendorPrice, itemStats, modLine, requiredLevel } from '../sim/Loot';
import { meetsRequirements } from '../sim/Character';
import { getAffix } from '../data/affixes';
import { getUnique } from '../data/uniques';
import { powerLines } from '../sim/ItemPowers';
import { getSet } from '../data/sets';
import { itemFlavor } from '../data/story/itemFlavor';
import { requestItemIcon } from '../art/Icons';
import { computeStats } from '../sim/Stats';
import { save } from '../core/Save';
import { compareChoices, compareItems } from './Compare';
import { getGem, socketBonuses } from '../data/gems';
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
  frameOrnament,
  type ItemHoverContext,
} from './Widgets';

/** Rarities grand enough to wear filigree on their tooltip frame. */
const RICH = new Set<ItemRarity>(['rare', 'set', 'unique', 'mythic', 'ancient']);

const RARITY_WORD: Record<string, string> = {
  normal: 'Common',
  magic: 'Magic',
  rare: 'Rare',
  set: 'Set Item',
  unique: 'Unique',
  mythic: 'Mythic',
  ancient: 'Ancient',
};


class TooltipManager {
  private root: HTMLDivElement;
  private main: HTMLDivElement;
  /** Worn pieces shown beside the item: up to two (both rings, or a weapon and its shield). */
  private compareCols: HTMLDivElement[];
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
    this.compareCols = [div('tt tt-compare'), div('tt tt-compare')];
    add(this.root, this.compareCols[1]!, this.compareCols[0]!, this.main);

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
    // Alt also reveals the exact tier numbers on each affix.
    if (e.key === 'Alt') this.root.classList.toggle('show-detail', held);
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
    for (const col of this.compareCols) col.style.display = 'none';
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
    const choices = this.compareFor(item, ctx);
    const wantCompare = choices.length > 0 && !ctx?.noCompare && (this.compareHeld || this.compareByDefault);

    const stats = char ? computeStats(char) : null;
    this.buildItemCard(this.main, item, stats, char?.level ?? 1, ctx, false);

    for (const col of this.compareCols) col.style.display = 'none';
    if (wantCompare) {
      // Every worn piece in play gets its card: both rings, or the weapon and
      // shield a two-hander would take off.
      const shown = [...new Set(choices.flat())].slice(0, this.compareCols.length);
      shown.forEach((worn, i) => {
        const col = this.compareCols[i]!;
        clear(col);
        col.style.display = '';
        this.buildItemCard(col, worn, stats, char?.level ?? 1, undefined, true);
      });
      for (const worn of choices) this.appendDeltas(this.main, item, worn, choices.length > 1);
    } else {
      if (choices.length && !ctx?.noCompare) {
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

  /** What the item is weighed against: one list of worn pieces per choice (see `compareChoices`). */
  private compareFor(item: Item, ctx?: ItemHoverContext): Item[][] {
    const char = save.account.current;
    if (!char || ctx?.source === 'equipment') return [];
    const choices = compareChoices(char, item);
    if (!choices) return [];
    if (choices.length) return choices;
    // It would fill an empty ring or hand. Still worth a look against the
    // piece already worn beside it.
    for (const s of slotsFor(item)) {
      const cur = char.equipment[s];
      if (cur && cur.uid !== item.uid) return [[cur]];
    }
    return [];
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
    const base = safeBase(item);
    const char = save.account.current;

    // Rare and better wear filigree in their own colour; magic and common
    // stay plain so the frame itself says how good the drop is.
    if (RICH.has(item.rarity)) host.appendChild(frameOrnament(false));

    if (isCompare) host.appendChild(div('tt-compare-flag', 'Currently Equipped'));

    // --- header plate -------------------------------------------------------
    const hd = div('tt-hd');
    const crest = div('tt-crest');
    const img = document.createElement('img');
    img.className = 'tt-crest-img';
    img.alt = '';
    img.draggable = false;
    img.src = attempt(
      () =>
        requestItemIcon(item, (uri) => {
          if (img.isConnected) img.src = uri;
        }),
      ''
    );
    if (img.src) crest.appendChild(img);
    else crest.innerHTML = iconSvg(itemIconName(item), { size: 26 });
    hd.appendChild(crest);

    const titles = div('tt-titles');
    const name = attempt(() => itemDisplayName(item), item.name || 'Unknown Item');
    const nameEl = div('tt-name', name);
    if (item.upgrade > 0) nameEl.appendChild(span('tt-upg', ` +${item.upgrade}`));
    titles.appendChild(nameEl);

    const baseLine = div('tt-base');
    baseLine.appendChild(span('tt-rarity-word', RARITY_WORD[item.rarity] ?? item.rarity));
    if (base && base.name !== name) baseLine.appendChild(span('tt-base-name', base.name));
    if (isTwoHanded(item)) baseLine.appendChild(span('tt-tag', 'Two-Handed'));
    if (item.corrupted) baseLine.appendChild(span('tt-corrupt', 'Corrupted'));
    titles.appendChild(baseLine);
    hd.appendChild(titles);
    host.appendChild(hd);

    // --- can you even wear it? ---------------------------------------------
    // Said first, in red, because it changes how you read everything below.
    const equippable = slotsFor(item).length > 0;
    if (equippable && char && !isCompare) {
      const req = attempt(() => meetsRequirements(char, item, stats ?? undefined), { ok: true } as { ok: boolean; reason?: string });
      if (!req.ok) {
        const warn = div('tt-warn');
        warn.appendChild(icon('warn', { size: 13 }));
        warn.appendChild(span('', req.reason ?? 'You cannot equip this.'));
        host.appendChild(warn);
      }
    }

    // --- weapon / armour headline ------------------------------------------
    if (base) {
      const block = div('tt-block');
      const stat = attempt(() => itemStats(item), {} as Partial<Stats>);
      if (base.baseMinDamage !== undefined || stat.minDamage) {
        const lo = Math.round(stat.minDamage ?? base.baseMinDamage ?? 0);
        const hi = Math.round(stat.maxDamage ?? base.baseMaxDamage ?? 0);
        block.appendChild(this.bigStat('Damage', `${lo}–${hi}`, 'sword'));
        if (base.baseSpeed) {
          block.appendChild(this.bigStat('Per second', base.baseSpeed.toFixed(2), 'speed'));
          block.appendChild(this.bigStat('DPS', fmt(((lo + hi) / 2) * base.baseSpeed), 'fire', 'is-dps'));
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

    // --- implicit, then rolled affixes -------------------------------------
    const implicits = item.mods.filter((m) => m.kind === 'implicit');
    if (implicits.length) {
      const imp = div('tt-lines tt-implicits');
      for (const m of implicits) imp.appendChild(this.modRow(m, item));
      host.appendChild(imp);
    }
    const rolled = item.mods.filter((m) => m.kind !== 'implicit');
    if (rolled.length) {
      if (implicits.length) host.appendChild(div('tt-rule'));
      const body = div('tt-lines');
      for (const m of rolled) body.appendChild(this.modRow(m, item));
      host.appendChild(body);
    }

    // Gems, runes and runewords explain themselves through the item module's
    // own text; those blocks are lifted out of it rather than re-derived.
    for (const extra of this.extraBlocks(item)) host.appendChild(extra);

    // --- sockets -----------------------------------------------------------
    if (item.sockets && item.sockets.length) {
      const sockRow = div('tt-sockets');
      const strip = div('tt-socket-list');
      for (const s of item.sockets) {
        const cell = div(s.gemId ? 'tt-socket filled' : 'tt-socket');
        if (s.gemId) {
          const gem = attempt(() => getGem(s.gemId as string) ?? null, null);
          const col = gem ? `#${(gem.color ?? 0xffffff).toString(16).padStart(6, '0')}` : '#9fe6ff';
          cell.style.setProperty('--gc', col);
          cell.innerHTML = iconSvg('gem', { size: 13 });
          const row = div('tt-socket-row');
          row.appendChild(cell);
          row.appendChild(span('tt-socket-name', gem?.name ?? s.gemId));
          // What the stone gives in this kind of item; already counted in the
          // character's stats (sim/Loot socketStats), shown so it is seen.
          const gives = base
            ? attempt(() => socketBonuses(s.gemId as string, base.category), [])
                .map((b) => modLine({ stat: b.stat, value: Math.max(1, Math.round(b.value)), kind: 'implicit' } as ItemMod).replace(' %', '%'))
                .join(', ')
            : '';
          if (gives) row.appendChild(span('tt-socket-gives', gives));
          strip.appendChild(row);
        } else {
          const row = div('tt-socket-row is-empty');
          row.appendChild(cell);
          row.appendChild(span('tt-socket-name', 'Empty socket'));
          strip.appendChild(row);
        }
      }
      sockRow.appendChild(strip);
      host.appendChild(sockRow);
    }

    // --- set membership ----------------------------------------------------
    if (item.setId) host.appendChild(this.buildSetBlock(item));

    // --- unique hook and flavour --------------------------------------------
    const uq = item.uniqueId ? attempt(() => getUnique(item.uniqueId as string) ?? null, null) : null;
    if (uq?.hook) host.appendChild(div('tt-hook', uq.hook));

    // --- powers: what the item does, in exact numbers -----------------------
    // The hook is a line of character; this is the rule. Without it a unique
    // read "leaves a warm print on stone" and never said what that meant.
    for (const p of attempt(() => powerLines(item), [])) {
      const row = div('tt-power');
      row.appendChild(span('tt-power-name', p.name));
      row.appendChild(span('tt-power-text', p.text));
      host.appendChild(row);
    }

    // --- requirements ------------------------------------------------------
    if (base) {
      const reqs: Array<{ label: string; met: boolean }> = [];
      const lvl = Math.max(base.levelReq + item.upgrade, attempt(() => requiredLevel(item), base.levelReq));
      if (lvl > 1) reqs.push({ label: `Level ${lvl}`, met: level >= lvl });
      if (base.strReq) reqs.push({ label: `${base.strReq} Str`, met: (stats?.strength ?? 0) >= base.strReq });
      if (base.dexReq) reqs.push({ label: `${base.dexReq} Dex`, met: (stats?.dexterity ?? 0) >= base.dexReq });
      if (reqs.length) {
        const r = div('tt-reqs');
        r.appendChild(span('tt-reqs-label', 'Requires'));
        for (const q of reqs) r.appendChild(span(`tt-req ${q.met ? 'met' : 'unmet'}`, q.label));
        host.appendChild(r);
      }
      if (base.classes && base.classes.length) {
        const mine = !char || base.classes.includes(char.classId);
        host.appendChild(div(`tt-class-lock ${mine ? '' : 'unmet'}`.trim(), `${base.classes.map(titleCase).join(' · ')} only`));
      }
    }

    const flavor = uq?.flavor ?? (item as unknown as { flavor?: string }).flavor ?? attempt(() => itemFlavor(item, base?.category), undefined);
    if (flavor) host.appendChild(div('tt-flavor', `“${flavor}”`));

    // --- footer ------------------------------------------------------------
    const ft = div('tt-ft');
    const value = attempt(() => vendorPrice(item, false), item.value ?? 0);
    const worth = span(`tt-worth ${ctx?.price ? 'is-price' : ''}`.trim());
    worth.appendChild(icon('coin', { size: 12 }));
    worth.appendChild(span('', fmtInt(ctx?.price ? ctx.price.gold : value)));
    worth.appendChild(span('tt-worth-label', ctx?.price ? ` ${ctx.price.label}` : ' sells for'));
    ft.appendChild(worth);
    ft.appendChild(span('tt-ilvl', `Item level ${item.ilvl}`));
    host.appendChild(ft);

    if (!isCompare && ctx?.source) {
      const hints = div('tt-actions');
      if (ctx.source === 'inventory') hints.appendChild(this.hintChip('RMB', 'Equip'));
      if (ctx.source === 'equipment') hints.appendChild(this.hintChip('RMB', 'Unequip'));
      if (ctx.source === 'vendor') hints.appendChild(this.hintChip('Click', 'Buy'));
      if (ctx.source === 'stash') hints.appendChild(this.hintChip('RMB', 'To pack'));
      if (hints.childElementCount) host.appendChild(hints);
    }
  }

  /**
   * One affix line with its tier mark. Tier 1 is the bottom of a ladder; the
   * mark brightens as the tier climbs and burns gold at the top, so a glance
   * says whether a roll is worth keeping. Holding Alt shows "T4/6".
   */
  private modRow(mod: ItemMod, item: Item): HTMLElement {
    const row = div(`tt-mod kind-${mod.kind}`);
    const text = attempt(() => modLine(mod), `${mod.value >= 0 ? '+' : ''}${mod.value} ${STAT_LABEL[mod.stat] ?? mod.stat}`);
    row.appendChild(span('tt-mod-text', text));
    if (mod.value < 0) row.classList.add('is-negative');
    if (item.rarity === 'set') row.classList.add('is-set');
    if (item.rarity === 'unique' || item.rarity === 'mythic' || item.rarity === 'ancient') row.classList.add('is-unique');

    if (mod.kind === 'prefix' || mod.kind === 'suffix') {
      const def = attempt(() => getAffix(mod.affixId) ?? null, null);
      const max = def?.tiers?.length ?? 0;
      if (max > 0 && mod.tier > 0) {
        const k = mod.tier / max;
        const mark = span(`tt-tier ${k >= 1 ? 'is-top' : k >= 0.66 ? 'is-high' : k >= 0.34 ? 'is-mid' : 'is-low'}`);
        // Pips: one per tier climbed, out of the ladder's length (capped at 6
        // so a long ladder still fits).
        const shown = Math.min(6, max);
        const lit = Math.max(1, Math.round(k * shown));
        for (let i = 0; i < shown; i++) mark.appendChild(span(i < lit ? 'pip on' : 'pip'));
        mark.appendChild(span('tt-tier-num', `T${mod.tier}/${max}`));
        mark.title = `Tier ${mod.tier} of ${max} (${mod.kind})`;
        row.appendChild(mark);
      }
    } else if (mod.kind === 'crafted') {
      row.appendChild(span('tt-modtag', 'crafted'));
    } else if (mod.kind === 'corrupted') {
      row.appendChild(span('tt-modtag is-corrupt', 'corrupted'));
    }
    return row;
  }

  /** Socketable and runeword text, lifted from the item module's own lines. */
  private extraBlocks(item: Item): HTMLElement[] {
    const lines = attempt(() => itemTooltipLines(item), [] as Array<{ text: string; color: string; bold?: boolean }>);
    const out: HTMLElement[] = [];
    const take = (from: number, until: (t: string) => boolean): HTMLElement => {
      const box = div('tt-extra');
      for (let i = from; i < lines.length; i++) {
        const l = lines[i]!;
        if (i > from && until(l.text)) break;
        if (!l.text) continue;
        const d = div('tt-extra-line', l.text.trim());
        if (l.color) d.style.color = l.color;
        if (l.bold) d.classList.add('is-bold');
        if (/^\s{2}/.test(l.text)) d.classList.add('is-indent');
        box.appendChild(d);
      }
      return box;
    };
    const gemAt = lines.findIndex((l) => l.text === 'When socketed into:');
    if (gemAt >= 0) out.push(take(gemAt, (t) => t === '' || t.startsWith('Sockets:')));
    const wordAt = lines.findIndex((l) => l.text.startsWith('Runeword:'));
    if (wordAt >= 0) out.push(take(wordAt, (t) => t === '' || !t.startsWith('  ')));
    return out;
  }

  private hintChip(key: string, label: string): HTMLElement {
    const c = span('tt-actionchip');
    c.appendChild(span('keycap', key));
    c.appendChild(span('', label));
    return c;
  }

  private bigStat(label: string, value: string, iconName: string, cls = ''): HTMLElement {
    const b = div(`tt-bigstat ${cls}`.trim());
    b.appendChild(icon(iconName, { size: 14 }));
    const t = div('tt-bigstat-text');
    t.appendChild(div('tt-bigstat-value', value));
    t.appendChild(div('tt-bigstat-label', label));
    b.appendChild(t);
    return b;
  }

  /** Every piece of the set, which you wear, and which bonuses are lit. */
  private buildSetBlock(item: Item): HTMLElement {
    const char = save.account.current;
    const setId = item.setId as string;
    const def = attempt(() => getSet(setId) ?? null, null);
    const wornIds = new Set<string>();
    if (char) {
      for (const key of Object.keys(char.equipment) as EquipSlot[]) {
        const it = char.equipment[key];
        if (it && it.setId === setId && it.uniqueId) wornIds.add(it.uniqueId);
      }
    }
    // Counting this piece as worn previews what equipping it would light up.
    const counted = new Set(wornIds);
    if (item.uniqueId) counted.add(item.uniqueId);
    const block = div('tt-set');
    const hd = div('tt-set-name', def?.name ?? `${titleCase(setId.replace(/[-_]/g, ' '))} Set`);
    hd.appendChild(span('tt-set-count', `${wornIds.size}/${def?.pieces.length ?? '?'} worn`));
    block.appendChild(hd);
    if (def) {
      for (const p of def.pieces) {
        const on = wornIds.has(p.id);
        const me = p.id === item.uniqueId;
        block.appendChild(div(`tt-set-piece ${on ? 'active' : ''} ${me ? 'is-this' : ''}`.trim(), p.name));
      }
      for (const b of def.bonuses) {
        const lit = counted.size >= b.pieces;
        const row = div(`tt-set-bonus ${lit ? 'active' : ''}`.trim());
        row.appendChild(span('tt-set-need', `${b.pieces}`));
        row.appendChild(span('', b.desc));
        block.appendChild(row);
      }
    } else {
      block.appendChild(div('tt-set-note', 'Wear more pieces to awaken the set.'));
    }
    return block;
  }

  /** The green/red delta strip — the reason players hold the compare key. */
  private appendDeltas(host: HTMLDivElement, item: Item, worn: Item[], named: boolean): void {
    const { deltas, verdict: v } = compareItems(item, worn);
    const rows: HTMLElement[] = [];
    for (const { key, delta: d } of deltas) {
      const line = div(`tt-delta ${d > 0 ? 'up' : 'down'}`);
      const l = span('tt-delta-label');
      const ic = STAT_ICON[key];
      if (ic) l.appendChild(icon(ic, { size: 12 }));
      l.appendChild(span('', STAT_LABEL[key]));
      line.appendChild(l);
      const suffix = PERCENT_STATS.has(key) ? '%' : '';
      const val = span('tt-delta-v');
      val.appendChild(span('tt-delta-arrow', d > 0 ? '▲' : '▼'));
      val.appendChild(span('', `${signed(d, Number.isInteger(d) ? 0 : 1)}${suffix}`));
      line.appendChild(val);
      rows.push(line);
    }
    const against = worn.length > 1 ? 'Versus both hands' : named ? `Versus ${worn[0]!.name}` : 'Versus equipped';
    if (!rows.length) {
      host.appendChild(div('tt-delta-none', named ? `${against}: no net stat change` : 'No net stat change'));
      return;
    }
    const wrap = div('tt-deltas');
    const head = div('tt-deltas-hd');
    head.appendChild(span('tt-sublabel', against));
    // A one-word verdict for the common case where every line agrees. The
    // same verdict puts the green arrow on item slots (Compare.ts).
    const verdict = v === 'upgrade' ? 'Upgrade' : v === 'downgrade' ? 'Downgrade' : 'Trade-off';
    head.appendChild(span(`tt-verdict is-${verdict.toLowerCase()}`, verdict));
    wrap.appendChild(head);
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
