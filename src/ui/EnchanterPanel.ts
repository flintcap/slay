/**
 * SLAY — the Enchanter. Pick a magic or rare item you carry or wear, then
 * reforge one of its properties or, on a rare with none, imbue a power.
 * Once a property has been reforged it is the only one that may change again.
 */

import { save } from '../core/Save';
import { events, toast } from '../core/Events';
import { audio } from '../audio/Audio';
import type { Item } from '../types';
import { modLine } from '../sim/Loot';
import { canAfford, spendCost } from '../sim/Crafting';
import { canEnchantItem, canImbue, imbueCost, imbuePower, reforgeCost, reforgeMod, reforgeableMods } from '../sim/TownServices';
import { powerLines } from '../sim/ItemPowers';
import { Panel, Button, div, span, clear, add } from './Widgets';
import { costText, itemName } from './DepthWidgets';

export class EnchanterPanel {
  readonly panel: Panel;
  private body: HTMLDivElement;
  private selected: string | null = null;

  constructor() {
    this.panel = new Panel({
      id: 'enchanter',
      title: 'The Enchanter',
      subtitle: 'One property, made over',
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
        'Choose a magic or rare item. Reforging rolls one property anew; after that, only that property can be reforged again. A rare with no power can be imbued with one.',
      ),
    );
    if (items.length === 0) {
      this.body.appendChild(div('depth-card-sub', 'You carry nothing I can work with.'));
      return;
    }

    const list = div('depth-list');
    list.style.maxHeight = '22vh';
    for (const it of items) {
      const card = div(`depth-card${it.uid === this.selected ? ' is-done' : ''}`);
      card.style.cursor = 'pointer';
      const b = div('depth-card-body');
      const worn = Object.values(c.equipment).includes(it);
      add(b, itemName(it), span('depth-dim', `${worn ? 'Worn' : 'In pack'} · item level ${it.ilvl}${it.enchantedMod ? ' · reforged' : ''}`));
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
    const done = (ok: boolean, reason?: string, what = 'The enchantment takes.') => {
      if (!ok) {
        toast(reason ?? 'No.', 'bad');
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

    const can = new Set(reforgeableMods(item));
    const rcost = reforgeCost(item);
    const rok = canAfford(rcost);
    const mods = div('depth-list');
    item.mods.forEach((m, i) => {
      if (m.kind !== 'prefix' && m.kind !== 'suffix') return;
      const card = div(`depth-card${can.has(i) ? '' : ' is-locked'}`);
      const b = div('depth-card-body');
      add(b, div('depth-card-title', modLine(m)), span('depth-dim', m.affixId === item.enchantedMod ? 'Reforged' : m.kind));
      card.appendChild(b);
      if (can.has(i)) {
        add(card, costText(rcost, rok));
        const btn = new Button({
          label: 'Reforge',
          small: true,
          variant: 'gold',
          onClick: () => {
            const r = reforgeMod(c, item, i, pay);
            done(r.ok, r.reason, r.ok ? `Reforged: ${modLine(item.mods[i]!)}` : undefined);
          },
        });
        btn.setDisabled(!rok);
        card.appendChild(btn.root);
      }
      mods.appendChild(card);
    });
    this.body.appendChild(mods);

    const imb = canImbue(item);
    const icost = imbueCost(item);
    const iok = canAfford(icost);
    const power = div(`depth-card${imb.ok ? '' : ' is-locked'}`);
    const pb = div('depth-card-body');
    const has = powerLines(item).find((p) => p.source === 'affix');
    add(
      pb,
      div('depth-card-title', 'Imbue a power'),
      span(has ? 'depth-power' : 'depth-dim', has ? `${has.name}: ${has.text}` : imb.reason ?? 'A behaviour, not a number: arcs, explosions, echoes.'),
    );
    power.appendChild(pb);
    if (imb.ok) {
      add(power, costText(icost, iok));
      const btn = new Button({
        label: 'Imbue',
        small: true,
        variant: 'gold',
        onClick: () => {
          const r = imbuePower(c, item, pay);
          const got = r.ok ? powerLines(item).find((p) => p.source === 'affix') : undefined;
          done(r.ok, r.reason, got ? `Imbued: ${got.name}` : undefined);
        },
      });
      btn.setDisabled(!iok);
      power.appendChild(btn.root);
    }
    this.body.appendChild(power);
  }
}
