/**
 * SLAY — the Gambler. Name a kind of item, pay, and see what the seal held.
 * Opened from the gambler's table in camp once Renown unlocks it.
 */

import { save } from '../core/Save';
import { events, toast } from '../core/Events';
import { audio } from '../audio/Audio';
import { GAMBLE_ODDS, GAMBLE_OFFERS, gamble, gamblePrice } from '../sim/TownServices';
import { Panel, Button, div, span, clear, add, fmtInt } from './Widgets';
import { itemName } from './DepthWidgets';
import type { Item } from '../types';

export class GamblerPanel {
  readonly panel: Panel;
  private body: HTMLDivElement;
  private last: Item | null = null;

  constructor() {
    this.panel = new Panel({
      id: 'gambler',
      title: 'The Gambler',
      subtitle: 'Sealed goods. No refunds.',
      icon: 'coin',
      width: 560,
    });
    this.body = div('depth-panel');
    this.panel.body.appendChild(this.body);
    events.on('ui:refresh', () => {
      if (this.panel.isOpen) this.render();
    });
  }

  open(): void {
    this.last = null;
    this.render();
    this.panel.open();
  }
  close(): void {
    this.panel.close();
  }
  get isOpen(): boolean {
    return this.panel.isOpen;
  }

  private render(): void {
    clear(this.body);
    const c = save.account.current;
    if (!c) return;
    const total = GAMBLE_ODDS.reduce((s, o) => s + o.weight, 0);
    const odds = GAMBLE_ODDS.map((o) => `${o.rarity} ${((o.weight / total) * 100).toFixed(o.weight < 20 ? 1 : 0)}%`).join(' · ');
    this.body.appendChild(div('depth-note', `Every seal holds a magic item or better, near your level. ${odds}.`));

    if (this.last) {
      const card = div('depth-card is-done');
      const b = div('depth-card-body');
      add(b, span('depth-dim', 'The seal breaks:'), itemName(this.last));
      card.appendChild(b);
      this.body.appendChild(card);
    }

    const grid = div('depth-grid');
    for (const offer of GAMBLE_OFFERS) {
      const price = gamblePrice(c, offer.id);
      const card = div(`depth-card${c.gold < price ? ' is-locked' : ''}`);
      const b = div('depth-card-body');
      add(b, div('depth-card-title', offer.name), span(c.gold < price ? 'depth-bad' : 'depth-gold', `${fmtInt(price)}g`));
      card.appendChild(b);
      const btn = new Button({
        label: 'Buy',
        small: true,
        variant: 'gold',
        onClick: () => {
          const r = gamble(c, offer.id);
          if (!r.ok || !r.item) {
            toast(r.reason ?? 'No.', 'bad');
            audio.play('ui.error');
            return;
          }
          this.last = r.item;
          audio.play(r.item.rarity === 'magic' ? 'ui.open' : 'levelup');
          toast(`The seal breaks: ${r.item.name}`, r.item.rarity === 'magic' || r.item.rarity === 'rare' ? 'good' : 'epic', r.item.rarity);
          save.touch();
          events.emit('ui:refresh', {});
        },
      });
      btn.setDisabled(c.gold < price);
      card.appendChild(btn.root);
      grid.appendChild(card);
    }
    this.body.appendChild(grid);
    const foot = div('depth-row depth-foot');
    add(foot, span('depth-dim', `You carry ${fmtInt(c.gold)} gold.`));
    this.body.appendChild(foot);
  }
}
