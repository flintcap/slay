/**
 * SLAY — the Enchanter. Pick a magic or rare item you carry or wear, then
 * reforge one of its properties, add one into an open slot or, on a rare with
 * none, imbue a power. A reforge or a new line lays three choices on the
 * table; take one or keep what you had. Once a property has been reforged it
 * is the only one that may change again.
 */

import { save } from '../core/Save';
import { events, toast } from '../core/Events';
import { audio } from '../audio/Audio';
import type { Item } from '../types';
import { modLine, openAffixSlots } from '../sim/Loot';
import { canAfford, spendCost } from '../sim/Crafting';
import {
  canEnchantItem,
  canFillSlot,
  canImbue,
  fillCost,
  fillSlot,
  imbueCost,
  imbuePower,
  reforgeCost,
  reforgeMod,
  reforgeableMods,
  takeOffer,
} from '../sim/TownServices';
import { powerLines } from '../sim/ItemPowers';
import { Panel, Button, div, span, clear, add } from './Widgets';
import { costText, itemName } from './DepthWidgets';
import { tr } from '../core/I18n';

export class EnchanterPanel {
  readonly panel: Panel;
  private body: HTMLDivElement;
  private selected: string | null = null;

  constructor() {
    this.panel = new Panel({
      id: 'enchanter',
      title: tr('The Enchanter'),
      subtitle: tr('One property, made over'),
      icon: 'sparkle',
      width: 600,
    });
    this.body = div('depth-panel');
    this.panel.body.appendChild(this.body);
    events.on('ui:refresh', () => {
      if (this.panel.isOpen) this.render();
    });
  }

  open(): void {
    this.render();
    this.panel.open();
  }
  close(): void {
    this.panel.close();
  }
  get isOpen(): boolean {
    return this.panel.isOpen;
  }

  /** Every magic or rare item the character wears or carries. */
  private candidates(): Item[] {
    const c = save.account.current;
    if (!c) return [];
    const out: Item[] = [];
    for (const it of Object.values(c.equipment)) if (it && canEnchantItem(it).ok) out.push(it);
    for (const it of c.inventory) if (it && canEnchantItem(it).ok) out.push(it);
    return out;
  }

  private render(): void {
    clear(this.body);
    const c = save.account.current;
    if (!c) return;
    const items = this.candidates();
    if (!items.some((i) => i.uid === this.selected)) this.selected = items[0]?.uid ?? null;
    this.body.appendChild(
      div(
        'depth-note',
        tr('Choose a magic or rare item. Reforging lays out three new versions of one property: take one, or keep what you had. After that, only that property can be reforged again. An item with room can take a new property the same way, if none has been reforged yet. A rare with no power can be imbued with one.'),
      ),
    );
    if (items.length === 0) {
      this.body.appendChild(div('depth-card-sub', tr('You carry nothing I can work with.')));
      return;
    }

    const list = div('depth-list');
    list.style.maxHeight = '22cqh';
    for (const it of items) {
      const card = div(`depth-card${it.uid === this.selected ? ' is-done' : ''}`);
      card.style.cursor = 'var(--cursor-hot)';
      const b = div('depth-card-body');
      const worn = Object.values(c.equipment).includes(it);
      add(b, itemName(it), span('depth-dim', tr('{0} · item level {1}{2}', worn ? tr('Worn') : tr('In pack'), it.ilvl, it.offers ? tr(' · choice waiting') : it.enchantedMod ? tr(' · reforged') : '')));
      card.appendChild(b);
      card.addEventListener('click', () => {
        this.selected = it.uid;
        this.render();
      });
      list.appendChild(card);
    }
    this.body.appendChild(list);

    const item = items.find((i) => i.uid === this.selected);
    if (!item) return;
    const pay = (cost: Parameters<typeof spendCost>[0]) => spendCost(cost);
    const done = (ok: boolean, reason?: string, what = tr('The enchantment takes.')) => {
      if (!ok) {
        toast(reason ?? tr('No.'), 'bad');
        audio.play('ui.error');
        return;
      }
      audio.play('levelup');
      toast(what, 'good');
      save.touch();
      // Worn gear changed: the stat sheet and the model should follow.
      if (Object.values(c.equipment).includes(item)) events.emit('item:equipped', { item });
      events.emit('ui:refresh', {});
    };

    // Lines already paid for wait on the table until one is taken.
    const offers = item.offers;
    if (offers) {
      const table = div('depth-list');
      table.appendChild(div('depth-note', offers.line ? tr('Take one of these in its place, or keep the line you had.') : tr('Take one of these as a new {0}, or leave the slot open.', offers.kind)));
      offers.mods.forEach((m, k) => {
        const card = div('depth-card');
        const b = div('depth-card-body');
        add(b, div('depth-card-title', modLine(m)), span('depth-dim', tr('{0} · tier {1}', m.kind, m.tier)));
        card.appendChild(b);
        const btn = new Button({
          label: tr('Take'),
          small: true,
          variant: 'gold',
          onClick: () => {
            const r = takeOffer(item, k);
            done(r.ok, r.reason, r.ok ? tr('Enchanted: {0}', modLine(m)) : undefined);
          },
        });
        card.appendChild(btn.root);
        table.appendChild(card);
      });
      const old = offers.line ? item.mods.find((m) => m.affixId === offers.line && m.kind === offers.kind) : undefined;
      const keep = div('depth-card');
      const kb = div('depth-card-body');
      add(kb, div('depth-card-title', old ? modLine(old) : tr('Nothing')), span('depth-dim', old ? tr('keep what you had') : tr('leave the slot open')));
      keep.appendChild(kb);
      const kbtn = new Button({
        label: old ? tr('Keep') : tr('Leave'),
        small: true,
        onClick: () => {
          const r = takeOffer(item, null);
          done(r.ok, r.reason, old ? tr('You keep what you had.') : tr('The slot stays open.'));
        },
      });
      keep.appendChild(kbtn.root);
      table.appendChild(keep);
      this.body.appendChild(table);
    }

    const can = new Set(reforgeableMods(item));
    const rcost = reforgeCost(item);
    const rok = canAfford(rcost);
    const mods = div('depth-list');
    item.mods.forEach((m, i) => {
      if (m.kind !== 'prefix' && m.kind !== 'suffix') return;
      const card = div(`depth-card${can.has(i) ? '' : ' is-locked'}`);
      const b = div('depth-card-body');
      add(b, div('depth-card-title', modLine(m)), span('depth-dim', m.affixId === item.enchantedMod ? tr('Reforged') : m.kind));
      card.appendChild(b);
      if (can.has(i)) {
        add(card, costText(rcost, rok));
        const btn = new Button({
          label: tr('Reforge'),
          small: true,
          variant: 'gold',
          onClick: () => {
            const r = reforgeMod(c, item, i, pay);
            done(r.ok, r.reason, tr('Three lines are laid out. Choose one.'));
          },
        });
        btn.setDisabled(!rok);
        card.appendChild(btn.root);
      }
      mods.appendChild(card);
    });

    // An open slot can take a new line, while no line has been reforged.
    const room = openAffixSlots(item);
    const fcost = fillCost(item);
    const fok = canAfford(fcost);
    for (const kind of ['prefix', 'suffix'] as const) {
      if (room[kind] <= 0) continue;
      const fill = canFillSlot(item, kind);
      const card = div(`depth-card${fill.ok ? '' : ' is-locked'}`);
      const b = div('depth-card-body');
      add(b, div('depth-card-title', tr('Add a {0}', kind)), span('depth-dim', fill.ok ? tr('{0} open', room[kind]) : fill.reason ?? ''));
      card.appendChild(b);
      if (fill.ok) {
        add(card, costText(fcost, fok));
        const btn = new Button({
          label: tr('Add'),
          small: true,
          variant: 'gold',
          onClick: () => {
            const r = fillSlot(c, item, kind, pay);
            done(r.ok, r.reason, tr('Three lines are laid out. Choose one.'));
          },
        });
        btn.setDisabled(!fok);
        card.appendChild(btn.root);
      }
      mods.appendChild(card);
    }
    this.body.appendChild(mods);

    const imb = canImbue(item);
    const icost = imbueCost(item);
    const iok = canAfford(icost);
    const power = div(`depth-card${imb.ok ? '' : ' is-locked'}`);
    const pb = div('depth-card-body');
    const has = powerLines(item).find((p) => p.source === 'affix');
    add(
      pb,
      div('depth-card-title', tr('Imbue a power')),
      span(has ? 'depth-power' : 'depth-dim', has ? `${has.name}: ${has.text}` : imb.reason ?? tr('A behaviour, not a number: arcs, explosions, echoes.')),
    );
    power.appendChild(pb);
    if (imb.ok) {
      add(power, costText(icost, iok));
      const btn = new Button({
        label: tr('Imbue'),
        small: true,
        variant: 'gold',
        onClick: () => {
          const r = imbuePower(c, item, pay);
          const got = r.ok ? powerLines(item).find((p) => p.source === 'affix') : undefined;
          done(r.ok, r.reason, got ? tr('Imbued: {0}', got.name) : undefined);
        },
      });
      btn.setDisabled(!iok);
      power.appendChild(btn.root);
    }
    this.body.appendChild(power);
  }
}
