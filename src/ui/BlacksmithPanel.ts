/**
 * SLAY — the blacksmith.
 *
 * Pick an item on the left, see exactly what each service would do to it in the
 * middle, pay for it on the right. The upgrade preview is a real dry run: the
 * item is cloned, upgraded off to the side, and the two stat blocks are
 * diffed — so "+1" is never a mystery.
 */

import type { Item, StatKey, Stats } from '../types';
import { events } from '../core/Events';
import { save } from '../core/Save';
import { upgradeCost, upgradeItem, rerollAffixes, addSocket, salvage } from '../sim/Crafting';
import { itemStats, itemDisplayName } from '../sim/Loot';
import { materialName, materialColor } from '../data/materials';
import { Random, randomSeed } from '../core/RNG';
import { ItemGrid, normalizeInventory, invRemove } from './InventoryPanel';
import {
  Panel,
  Button,
  add,
  clear,
  div,
  span,
  icon,
  iconSvg,
  fmt,
  fmtInt,
  signed,
  rarityHex,
  itemIconName,
  safeBase,
  attempt,
  emptyState,
  modal,
  STAT_LABEL,
  STAT_ICON,
  PERCENT_STATS,
  type DragPayload,
} from './Widgets';

type ServiceId = 'upgrade' | 'reroll' | 'socket' | 'salvage';

export class BlacksmithPanel {
  readonly panel: Panel;
  private packGrid: ItemGrid;
  private preview: HTMLDivElement;
  private actions: HTMLDivElement;
  private selected: Item | null = null;
  private goldEl: HTMLSpanElement;

  constructor() {
    this.panel = new Panel({
      id: 'blacksmith',
      title: 'Blacksmith',
      subtitle: 'Steel remembers every blow it survives',
      icon: 'anvil',
      width: 1140,
    });
    this.panel.frame.classList.add('panel-smith');

    const wrap = div('smith-wrap');

    // --- item picker ------------------------------------------------------
    const left = div('trade-col');
    const lhd = div('trade-colhd');
    lhd.appendChild(span('trade-coltitle', 'Your Pack'));
    const gold = div('inv-gold');
    gold.appendChild(icon('coin', { size: 13 }));
    this.goldEl = span('inv-gold-v', '0');
    gold.appendChild(this.goldEl);
    lhd.appendChild(gold);
    left.appendChild(lhd);

    this.packGrid = new ItemGrid({
      cols: 6,
      rows: 8,
      size: 46,
      source: 'craft',
      accepts: (p) => !!p.item,
      onDrop: (p) => this.pick(p),
      onClick: (item) => this.select(item),
      onRightClick: (item) => this.select(item),
    });
    left.appendChild(this.packGrid.root);
    left.appendChild(div('inv-hint', 'Click an item to bring it to the anvil.'));

    // --- preview ----------------------------------------------------------
    this.preview = div('smith-preview');

    // --- services ---------------------------------------------------------
    this.actions = div('smith-actions');

    add(wrap, left, this.preview, this.actions);
    this.panel.body.appendChild(wrap);

    events.on('ui:refresh', () => {
      if (this.panel.isOpen) this.refresh();
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

  // -- selection -----------------------------------------------------------

  private pick(p: DragPayload): boolean {
    if (!p.item) return false;
    this.select(p.item);
    return true;
  }

  private select(item: Item | null): void {
    if (!item) return;
    const base = safeBase(item);
    if (base && (base.category === 'potion' || base.category === 'material')) {
      events.emit('toast', { text: 'The smith has no use for that.', kind: 'info' });
      return;
    }
    this.selected = item;
    this.renderPreview();
    this.renderActions();
  }

  refresh(): void {
    const c = save.account.current;
    if (!c) return;
    normalizeInventory(c);
    this.packGrid.setItems(c.inventory);
    this.goldEl.textContent = fmtInt(c.gold);
    // Keep the selection alive across refreshes, drop it if it left the pack.
    if (this.selected && !c.inventory.some((i) => i?.uid === this.selected?.uid)) {
      const equipped = Object.values(c.equipment).some((i) => i?.uid === this.selected?.uid);
      if (!equipped) this.selected = null;
    }
    this.renderPreview();
    this.renderActions();
  }

  // -- preview -------------------------------------------------------------

  private renderPreview(): void {
    clear(this.preview);
    const item = this.selected;
    if (!item) {
      this.preview.appendChild(emptyState('Bring the smith something to work on.', 'anvil'));
      return;
    }
    const rc = rarityHex(item.rarity);
    const head = div('smith-item');
    const crest = div('tt-crest');
    crest.style.setProperty('--rc', rc);
    crest.style.color = rc;
    crest.innerHTML = iconSvg(itemIconName(item), { size: 26 });
    const titles = div('');
    const nm = div('smith-itemname', attempt(() => itemDisplayName(item), item.name));
    nm.style.color = rc;
    titles.appendChild(nm);
    const base = safeBase(item);
    titles.appendChild(
      div('smith-itemsub', `${base?.name ?? item.baseId} · ilvl ${item.ilvl} · +${item.upgrade} · ${item.sockets.length} socket${item.sockets.length === 1 ? '' : 's'}`)
    );
    add(head, crest, titles);
    this.preview.appendChild(head);

    // Dry-run the upgrade on a throwaway clone.
    const before = attempt(() => itemStats(item), {} as Partial<Stats>);
    const clone = cloneItem(item);
    const ok = clone ? attempt(() => upgradeItem(clone, new Random(randomSeed())).ok, false) : false;
    const after = ok && clone ? attempt(() => itemStats(clone), {} as Partial<Stats>) : null;

    const sec = div('');
    const hd = div('section-hd');
    hd.appendChild(icon('hammer', { size: 13 }));
    hd.appendChild(span('section-title', ok ? `Upgrade preview  +${item.upgrade} → +${item.upgrade + 1}` : 'Current stats'));
    hd.appendChild(div('section-rule'));
    sec.appendChild(hd);

    const table = div('smith-diff');
    const header = div('diffrow is-head');
    header.appendChild(span('diffrow-l', ''));
    header.appendChild(span('diffrow-a', 'Now'));
    header.appendChild(span('diffrow-arrow', ''));
    header.appendChild(span('diffrow-b', after ? 'After' : ''));
    table.appendChild(header);

    const keys = new Set<StatKey>([
      ...(Object.keys(before) as StatKey[]),
      ...((after ? Object.keys(after) : []) as StatKey[]),
    ]);
    let rows = 0;
    for (const key of keys) {
      const a = before[key] ?? 0;
      const b = after ? after[key] ?? 0 : a;
      if (a === 0 && b === 0) continue;
      const suffix = PERCENT_STATS.has(key) ? '%' : '';
      const line = div('diffrow');
      const l = span('diffrow-l');
      const ic = STAT_ICON[key];
      if (ic) l.appendChild(icon(ic, { size: 12 }));
      l.appendChild(span('', STAT_LABEL[key]));
      line.appendChild(l);
      line.appendChild(span('diffrow-a', `${fmt(a)}${suffix}`));
      const arrow = span('diffrow-arrow');
      if (after && b !== a) arrow.innerHTML = iconSvg('chevronRight', { size: 11 });
      line.appendChild(arrow);
      const bEl = span('diffrow-b', after && b !== a ? `${fmt(b)}${suffix} (${signed(b - a)})` : '');
      line.appendChild(bEl);
      table.appendChild(line);
      rows++;
      if (rows > 12) break;
    }
    if (!rows) table.appendChild(div('char-empty', 'This item has no numeric stats.'));
    sec.appendChild(table);
    this.preview.appendChild(sec);

    if (item.sockets.length) {
      const sockSec = div('');
      const shd = div('section-hd');
      shd.appendChild(icon('gem', { size: 13 }));
      shd.appendChild(span('section-title', 'Sockets'));
      shd.appendChild(div('section-rule'));
      sockSec.appendChild(shd);
      const strip = div('tt-socket-strip');
      for (const s of item.sockets) {
        const cell = div(s.gemId ? 'tt-socket filled' : 'tt-socket');
        if (s.gemId) cell.innerHTML = iconSvg('gem', { size: 14 });
        strip.appendChild(cell);
      }
      sockSec.appendChild(strip);
      this.preview.appendChild(sockSec);
    }
  }

  // -- services ------------------------------------------------------------

  private renderActions(): void {
    clear(this.actions);
    const item = this.selected;
    const c = save.account.current;
    if (!item || !c) {
      this.actions.appendChild(emptyState('No item at the anvil.', 'hammer'));
      return;
    }

    const cost = attempt(() => upgradeCost(item), { gold: 0, materials: {} as Record<string, number> });

    this.actions.appendChild(
      this.card('upgrade', 'Upgrade', 'hammer', `Raise this item to +${item.upgrade + 1}. Scales its base values and every rolled mod.`, cost, () => {
        const r = attempt(() => upgradeItem(item, new Random(randomSeed())), { ok: false, reason: 'Failed' });
        return r.ok ? null : r.reason ?? 'The smith shakes his head.';
      })
    );

    this.actions.appendChild(
      this.card(
        'reroll',
        'Reroll Affixes',
        'sparkle',
        'Wipes every prefix and suffix and rolls new ones at this item level. There is no undo.',
        { gold: Math.max(250, Math.round((item.value ?? 100) * 0.6)), materials: {} },
        () => {
          const r = attempt(() => rerollAffixes(item, new Random(randomSeed())), { ok: false, reason: 'Failed' });
          return r.ok ? null : r.reason ?? 'Nothing to reroll.';
        },
        true
      )
    );

    this.actions.appendChild(
      this.card(
        'socket',
        'Add Socket',
        'gem',
        'Punches another socket, if the item can take one.',
        { gold: Math.max(400, Math.round((item.value ?? 100) * 0.9)), materials: {} },
        () => {
          const r = attempt(() => addSocket(item, new Random(randomSeed())), { ok: false, reason: 'Failed' });
          return r.ok ? null : r.reason ?? 'No room for another socket.';
        }
      )
    );

    this.actions.appendChild(
      this.card(
        'salvage',
        'Salvage',
        'trash',
        'Break the item down for crafting materials. The item is destroyed.',
        { gold: 0, materials: {} },
        () => {
          const mats = attempt(() => salvage(item), {} as Record<string, number>);
          invRemove(c, item);
          for (const [id, n] of Object.entries(mats)) save.addMaterial(id, n);
          const summary = Object.entries(mats)
            .map(([id, n]) => `${n}x ${attempt(() => materialName(id), id)}`)
            .join(', ');
          events.emit('toast', { text: summary ? `Salvaged: ${summary}` : 'Salvaged.', kind: 'good' });
          this.selected = null;
          return null;
        },
        true
      )
    );

    // Material wallet.
    const wallet = div('craftcard');
    const whd = div('craftcard-hd');
    whd.appendChild(icon('material', { size: 13 }));
    whd.appendChild(span('', 'Materials'));
    wallet.appendChild(whd);
    const chips = div('craftcost');
    const mats = Object.entries(save.account.materials).filter(([, n]) => n > 0);
    if (!mats.length) chips.appendChild(span('craftcard-desc', 'None yet — salvage something.'));
    for (const [id, n] of mats.slice(0, 12)) chips.appendChild(this.matChip(id, n, 0));
    wallet.appendChild(chips);
    this.actions.appendChild(wallet);
  }

  private card(
    id: ServiceId,
    title: string,
    iconName: string,
    desc: string,
    cost: { gold: number; materials: Record<string, number> },
    run: () => string | null,
    confirm = false
  ): HTMLElement {
    const c = save.account.current;
    const card = div('craftcard smith-forge');
    const hd = div('craftcard-hd');
    hd.appendChild(icon(iconName, { size: 13 }));
    hd.appendChild(span('', title));
    card.appendChild(hd);
    card.appendChild(div('craftcard-desc', desc));

    const costs = div('craftcost');
    let affordable = true;
    if (cost.gold > 0) {
      const chip = span(`matchip ${(c?.gold ?? 0) < cost.gold ? 'lacking' : ''}`.trim());
      chip.appendChild(icon('coin', { size: 11 }));
      chip.appendChild(span('', fmtInt(cost.gold)));
      costs.appendChild(chip);
      if ((c?.gold ?? 0) < cost.gold) affordable = false;
    }
    for (const [mid, need] of Object.entries(cost.materials ?? {})) {
      const have = save.materialCount(mid);
      costs.appendChild(this.matChip(mid, have, need));
      if (have < need) affordable = false;
    }
    if (!costs.childElementCount) costs.appendChild(span('matchip', 'Free'));
    card.appendChild(costs);

    const btn = new Button({
      label: title,
      variant: id === 'salvage' ? 'danger' : 'primary',
      wide: true,
      small: true,
      onClick: () => {
        const doIt = (): void => {
          if (!affordable) {
            events.emit('toast', { text: 'You cannot afford that.', kind: 'bad' });
            btn.flash('bad');
            return;
          }
          const err = run();
          if (err) {
            events.emit('toast', { text: err, kind: 'bad' });
            btn.flash('bad');
            return;
          }
          // Charge only after the service actually succeeded.
          if (c) c.gold -= cost.gold;
          for (const [mid, need] of Object.entries(cost.materials ?? {})) save.spendMaterial(mid, need);
          save.touch();
          btn.flash('good');
          card.classList.remove('is-success');
          void card.offsetWidth;
          card.classList.add('is-success');
          events.emit('sfx', { id: 'craft.success' });
          events.emit('toast', { text: `${title} complete.`, kind: 'good' });
          events.emit('ui:refresh', {});
        };

        if (confirm) {
          modal({
            title: `${title}?`,
            icon: 'warn',
            tone: 'danger',
            body: `<p>${desc}</p><p><b>This cannot be undone.</b></p>`,
            confirmLabel: title,
            onConfirm: doIt,
          });
        } else {
          doIt();
        }
      },
    });
    btn.setDisabled(!affordable);
    card.appendChild(btn.root);
    return card;
  }

  private matChip(id: string, have: number, need: number): HTMLElement {
    const chip = span(`matchip ${need > 0 && have < need ? 'lacking' : ''}`.trim());
    const dot = span('matchip-dot');
    const col = attempt(() => materialColor(id), 0x9ad0ff);
    dot.style.background = `#${col.toString(16).padStart(6, '0')}`;
    dot.style.color = `#${col.toString(16).padStart(6, '0')}`;
    chip.appendChild(dot);
    chip.appendChild(span('', attempt(() => materialName(id), id)));
    chip.appendChild(span('', need > 0 ? ` ${have}/${need}` : ` ${have}`));
    return chip;
  }
}

/** Deep clone without dragging in structuredClone edge cases on old engines. */
function cloneItem(item: Item): Item | null {
  try {
    return JSON.parse(JSON.stringify(item)) as Item;
  } catch {
    return null;
  }
}
