/**
 * SLAY — the blacksmith.
 *
 * Pick an item on the left, see exactly what each service would do to it in the
 * middle, pay for it on the right. The upgrade preview is a real dry run: the
 * item is cloned, upgraded off to the side, and the two stat blocks are
 * diffed — so "+1" is never a mystery.
 */

import type { EquipSlot, Item, StatKey, Stats } from '../types';
import { events } from '../core/Events';
import { save } from '../core/Save';
import {
  upgradeCost,
  upgradeItem,
  applyUpgrade,
  canUpgrade,
  rerollAffixes,
  rerollCost,
  maxLocks,
  canHone,
  honeCost,
  honeLine,
  honeTarget,
  addSocket,
  socketCost,
  salvage,
  insertGem,
  removeGem,
  removeGemCost,
  canAfford,
} from '../sim/Crafting';
import { itemStats, itemDisplayName, newItem, getBase, modLine } from '../sim/Loot';
import { getSocketable, socketBonuses } from '../data/gems';
import { addItemToInventory } from '../sim/Inventory';
import { INV_COLS, INV_ROWS } from '../sim/Grid';
import { materialName, materialColor } from '../data/materials';
import { Random, randomSeed } from '../core/RNG';
import { requestItemIcon } from '../art/Icons';
import { ItemGrid, normalizeInventory, invRemove, invConsumeOne } from './InventoryPanel';
import {
  scheduleRefresh,
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
  SLOT_LABEL,
  SLOT_ICON,
  ItemSlot,
  STAT_ICON,
  PERCENT_STATS,
  type DragPayload,
} from './Widgets';
import { uiSfx } from './Sfx';

type ServiceId = 'upgrade' | 'reroll' | 'hone' | 'socket' | 'salvage';

export class BlacksmithPanel {
  readonly panel: Panel;
  private packGrid: ItemGrid;
  /** What the hero is wearing, so worn gear can go on the anvil without taking it off. */
  private worn = new Map<EquipSlot, ItemSlot>();
  private preview: HTMLDivElement;
  private actions: HTMLDivElement;
  private selected: Item | null = null;
  /** Indexes of the lines bound through the next reroll, for the item on the anvil. */
  private locks = new Set<number>();
  /** The line picked to hone, for the item on the anvil. */
  private honePick: number | null = null;
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
      cols: INV_COLS,
      rows: INV_ROWS,
      size: 36,
      source: 'craft',
      accepts: (p) => !!p.item,
      onDrop: (p) => this.pick(p),
      onClick: (item) => this.select(item),
      onRightClick: (item) => this.select(item),
    });
    left.appendChild(this.packGrid.root);
    left.appendChild(div('inv-hint', 'Click an item to bring it to the anvil.'));

    const whd = div('trade-colhd');
    whd.appendChild(span('trade-coltitle', 'Worn'));
    left.appendChild(whd);
    const wornRow = div('smith-worn');
    for (const slot of Object.keys(SLOT_LABEL) as EquipSlot[]) {
      const cell = new ItemSlot({
        size: 36,
        slot,
        draggable: false,
        placeholder: SLOT_ICON[slot],
        placeholderLabel: SLOT_LABEL[slot],
        onClick: (item) => this.select(item),
        onRightClick: (item) => this.select(item),
      });
      this.worn.set(slot, cell);
      wornRow.appendChild(cell.root);
    }
    left.appendChild(wornRow);

    // --- preview ----------------------------------------------------------
    this.preview = div('smith-preview');

    // --- services ---------------------------------------------------------
    this.actions = div('smith-actions');

    add(wrap, left, this.preview, this.actions);
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
    if (this.selected?.uid !== item.uid) {
      this.locks.clear();
      this.honePick = null;
    }
    this.selected = item;
    this.renderPreview();
    this.renderActions();
  }

  private readonly boundRefresh = (): void => this.refresh();

  refresh(): void {
    const c = save.account.current;
    if (!c) return;
    normalizeInventory(c);
    this.packGrid.setItems(c.inventory);
    for (const [slot, cell] of this.worn) cell.setItem(c.equipment[slot] ?? null);
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
    // Mark the item on the anvil in the pack, so you can see what you picked.
    const uid = this.selected?.uid ?? '';
    this.packGrid.root.querySelectorAll<HTMLElement>('.islot').forEach((el) => {
      el.classList.toggle('is-picked', !!uid && el.dataset.uid === uid);
    });
    for (const cell of this.worn.values()) cell.root.classList.toggle('is-picked', !!uid && cell.item?.uid === uid);
    const item = this.selected;
    if (!item) {
      this.preview.appendChild(emptyState('Click an item in your pack, or one you are wearing, to put it on the anvil.', 'anvil'));
      return;
    }
    const rc = rarityHex(item.rarity);
    const head = div('smith-item');
    const crest = div('tt-crest');
    crest.style.setProperty('--rc', rc);
    crest.style.color = rc;
    // The painted item art, as in the tooltip; the line icon only if it fails.
    const uri = attempt(
      () =>
        requestItemIcon(item, (ready) => {
          const img = crest.querySelector<HTMLImageElement>('img');
          if (img?.isConnected) img.src = ready;
        }),
      ''
    );
    if (uri) {
      const img = document.createElement('img');
      img.className = 'tt-crest-img';
      img.alt = '';
      img.draggable = false;
      img.src = uri;
      crest.appendChild(img);
    } else {
      crest.innerHTML = iconSvg(itemIconName(item), { size: 26 });
    }
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

    // Dry-run the upgrade on a throwaway clone. No payment, no chance bonus:
    // the preview shows the sure result and never touches the hero's purse.
    const before = attempt(() => itemStats(item), {} as Partial<Stats>);
    const clone = cloneItem(item);
    const ok = clone && attempt(() => canUpgrade(item).ok, false)
      ? attempt(() => { applyUpgrade(clone, null); return true; }, false)
      : false;
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
      item.sockets.forEach((s, i) => {
        const cell = div(s.gemId ? 'tt-socket filled ui-interactive' : 'tt-socket ui-interactive');
        const gem = s.gemId ? attempt(() => getSocketable(s.gemId!), undefined) : undefined;
        if (gem) {
          cell.innerHTML = iconSvg('gem', { size: 14 });
          cell.style.color = rarityHex('unique');
          cell.title = gem.name;
        } else {
          cell.title = 'Empty — click to set a gem or rune';
        }
        cell.style.cursor = 'var(--cursor-hot)';
        cell.addEventListener('click', () => this.openSocketPicker(item, i));
        strip.appendChild(cell);
      });
      sockSec.appendChild(strip);
      sockSec.appendChild(
        div('craftcard-desc', 'Click a socket to set a gem, or to prise one back out.')
      );
      this.preview.appendChild(sockSec);
    }
  }

  // -- socketing -----------------------------------------------------------

  /**
   * Set or prise out one socket.
   *
   * The crafting layer has had `insertGem` and `removeGem` from the beginning
   * and nothing ever called either of them, so gems dropped, stacked up in the
   * pack and did nothing at all. This is the missing half.
   */
  private openSocketPicker(item: Item, index: number): void {
    const c = save.account.current;
    if (!c) return;
    const slot = item.sockets[index];
    if (!slot) return;

    if (slot.gemId) {
      const gem = attempt(() => getSocketable(slot.gemId!), undefined);
      const cost = removeGemCost();
      const canKeep = attempt(() => canAfford(cost), false);
      modal({
        title: `Remove ${gem?.name ?? 'gem'}`,
        icon: 'gem',
        tone: 'danger',
        body: canKeep
          ? `A Sigil of Order and ${fmtInt(cost.gold)} gold prises it out intact. Without one the gem is destroyed.`
          : `You have no Sigil of Order, so knocking this one out will destroy it.`,
        confirmLabel: canKeep ? 'Prise it out' : 'Destroy it',
        onConfirm: () => {
          const r = attempt(
            () => removeGem(item, index, canKeep),
            { ok: false, reason: 'Failed' } as { ok: boolean; reason?: string; gemId?: string }
          );
          if (!r.ok) {
            events.emit('toast', { text: r.reason ?? 'The smith cannot.', kind: 'bad' });
            return;
          }
          if (canKeep && r.gemId) {
            const made = attempt(() => newItem(getBase(r.gemId!), item.ilvl, 'normal', new Random(randomSeed())), null);
            if (made) addItemToInventory(c, made);
          }
          events.emit('toast', { text: canKeep ? 'Gem recovered.' : 'Gem shattered.', kind: canKeep ? 'good' : 'info' });
          save.touch();
          events.emit('ui:refresh', {});
          this.refresh();
        },
      });
      return;
    }

    // Empty socket: pick from the gems and runes actually in the pack.
    const gems = c.inventory.filter((it): it is Item => {
      if (!it) return false;
      const b = safeBase(it);
      return b?.category === 'gem' || b?.category === 'rune';
    });

    const body = div('socket-picker');
    if (gems.length === 0) {
      body.appendChild(emptyState('No gems or runes in your pack.', 'gem'));
    }
    for (const gem of gems) {
      const def = attempt(() => getSocketable(gem.baseId), undefined);
      const row = div('socket-pick ui-interactive');
      row.appendChild(icon(itemIconName(gem), { size: 16 }));
      row.appendChild(span('socket-pick-name', def?.name ?? gem.name));
      const hostBase = safeBase(item);
      const bonuses = attempt(
        () => (hostBase ? socketBonuses(gem.baseId, hostBase.category) : []),
        [] as Array<{ stat: StatKey; value: number }>
      );
      row.appendChild(
        span(
          'socket-pick-stats',
          bonuses.length
            ? bonuses.map((b) => `${b.value >= 0 ? '+' : ''}${b.value} ${STAT_LABEL[b.stat] ?? b.stat}`).join(', ')
            : 'No effect in this item'
        )
      );
      row.style.cursor = 'var(--cursor-hot)';
      row.addEventListener('click', () => {
        const r = attempt(() => insertGem(item, gem.baseId, index), { ok: false, reason: 'Failed' });
        if (!r.ok) {
          events.emit('toast', { text: r.reason ?? 'It will not seat.', kind: 'bad' });
          return;
        }
        invConsumeOne(c, gem);
        events.emit('toast', { text: `${def?.name ?? 'Gem'} set.`, kind: 'good' });
        save.touch();
        events.emit('ui:refresh', {});
        this.refresh();
        document.querySelector('.modal-wrap')?.remove();
      });
      body.appendChild(row);
    }

    modal({
      title: 'Set a gem',
      icon: 'gem',
      body,
      confirmLabel: 'Done',
    });
  }

  // -- services ------------------------------------------------------------

  private renderActions(): void {
    clear(this.actions);
    const item = this.selected;
    const c = save.account.current;
    if (!item || !c) {
      this.actions.appendChild(emptyState('Upgrades, sockets and salvage appear here once an item is on the anvil.', 'hammer'));
      return;
    }

    const cost = attempt(() => upgradeCost(item), { gold: 0, materials: {} as Record<string, number> });

    this.actions.appendChild(
      this.card('upgrade', 'Upgrade', 'hammer', `Raise this item to +${item.upgrade + 1}. Scales its base values and every rolled mod.`, cost, () => {
        const r = attempt(() => upgradeItem(item, new Random(randomSeed())), { ok: false, reason: 'Failed' });
        return r.ok ? null : r.reason ?? 'The smith shakes his head.';
      })
    );

    const lines = item.mods.map((m, i) => ({ m, i })).filter(({ m }) => m.kind === 'prefix' || m.kind === 'suffix');
    const rolled = item.rarity === 'magic' || item.rarity === 'rare';
    // Bound lines must still be on the item; a reroll elsewhere may have moved them.
    for (const i of [...this.locks]) if (!lines.some((l) => l.i === i)) this.locks.delete(i);
    const cap = attempt(() => maxLocks(item), 0);
    const reroll = this.card(
      'reroll',
      'Reroll Affixes',
      'sparkle',
      this.locks.size
        ? `Rolls new prefixes and suffixes at this item level. The ${this.locks.size === 1 ? 'bound line stays' : `${this.locks.size} bound lines stay`}; every other line is lost. There is no undo.`
        : 'Wipes every prefix and suffix and rolls new ones at this item level. There is no undo.',
      attempt(() => rerollCost(item, this.locks.size), { gold: 0, materials: {} as Record<string, number> }),
      () => {
        const r = attempt(() => rerollAffixes(item, new Random(randomSeed()), [...this.locks]), { ok: false, reason: 'Failed' });
        if (r.ok) {
          this.locks.clear();
          this.honePick = null;
        }
        return r.ok ? null : r.reason ?? 'Nothing to reroll.';
      },
      true
    );
    if (rolled && cap > 0 && lines.length > 1) {
      const list = div('smith-lines');
      list.appendChild(div('craftcard-desc', `Click up to ${cap} line${cap === 1 ? '' : 's'} to bind with cloth and keep through the reroll.`));
      for (const { m, i } of lines) {
        const on = this.locks.has(i);
        const full = !on && this.locks.size >= cap;
        const row = div(`smith-line${on ? ' is-on' : full ? ' is-off' : ''}`);
        add(row, span('', modLine(m)), span('smith-line-tag', on ? 'Bound' : m.kind));
        row.addEventListener('click', () => {
          if (on) this.locks.delete(i);
          else if (!full) this.locks.add(i);
          else return;
          uiSfx('ui.click');
          this.renderActions();
        });
        list.appendChild(row);
      }
      reroll.insertBefore(list, reroll.querySelector('.craftcost'));
    }
    this.actions.appendChild(reroll);

    if (rolled && lines.length) {
      if (this.honePick !== null && !attempt(() => canHone(item, this.honePick!).ok, false)) this.honePick = null;
      const honed = item.mods.find((m) => m.honed);
      const hone = this.card(
        'hone',
        'Hone a Line',
        'hammer',
        honed
          ? `${modLine(honed)} is honed. Only one line on an item can be.`
          : 'Moves one prefix or suffix a rung up its ladder, a little past what the item could roll. Once per item.',
        attempt(() => honeCost(item), { gold: 0, materials: {} as Record<string, number> }),
        () => {
          if (this.honePick === null) return 'Pick a line to hone first.';
          const r = attempt(() => honeLine(item, this.honePick!, new Random(randomSeed())), { ok: false, reason: 'Failed' });
          if (r.ok) this.honePick = null;
          return r.ok ? null : r.reason ?? 'The smith cannot hone that.';
        }
      );
      if (!honed) {
        const list = div('smith-lines');
        for (const { m, i } of lines) {
          const next = attempt(() => (canHone(item, i).ok ? honeTarget(item, i) : null), null);
          const on = this.honePick === i;
          const row = div(`smith-line${on ? ' is-on' : next ? '' : ' is-off'}`);
          add(row, span('', modLine(m)), span('smith-line-tag', next ? `tier ${m.tier} → ${next.tier}` : 'at its best'));
          if (next) {
            row.addEventListener('click', () => {
              this.honePick = on ? null : i;
              uiSfx('ui.click');
              this.renderActions();
            });
          }
          list.appendChild(row);
        }
        hone.insertBefore(list, hone.querySelector('.craftcost'));
      }
      this.actions.appendChild(hone);
    }

    this.actions.appendChild(
      this.card(
        'socket',
        'Add Socket',
        'gem',
        'Punches another socket, if the item can take one.',
        attempt(() => socketCost(item), { gold: 0, materials: {} as Record<string, number> }),
        () => {
          const r = attempt(() => addSocket(item, new Random(randomSeed())), { ok: false, reason: 'Failed' });
          return r.ok ? null : r.reason ?? 'No room for another socket.';
        }
      )
    );

    // Worn gear is smithed where it sits; breaking it down means taking it off first.
    const worn = Object.values(c.equipment).some((i) => i?.uid === item.uid);
    if (!worn) this.actions.appendChild(
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
          // The service took its own payment (`Crafting.spendCost`); charging
          // here as well billed every upgrade, reforge and socket twice.
          save.touch();
          btn.flash('good');
          card.classList.remove('is-success');
          void card.offsetWidth;
          card.classList.add('is-success');
          uiSfx('craft.success');
          events.emit('toast', { text: `${title} complete.`, kind: 'good' });
          // Worn gear changes the hero's numbers the moment it is improved.
          const worn = Object.values(c?.equipment ?? {}).find((i) => i?.uid === this.selected?.uid);
          if (worn) events.emit('item:equipped', { item: worn });
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
