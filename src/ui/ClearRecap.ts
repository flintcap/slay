/**
 * SLAY — the map-clear recap.
 *
 * Back in camp after a cleared map, one card says how the run went: the time,
 * the kills, the gold and the finds, the experience, how close it came and
 * what hurt most. It opens a moment after arrival, once the town card has had
 * its turn, and Escape or its button closes it. Nothing on it is a
 * choice.
 */

import { RARITY_COLOR } from '../types';
import { events } from '../core/Events';
import { Panel, Button, div, span, icon, clear, duration, fmtInt } from './Widgets';
import { runStats } from './RunStats';
import { tr, trn } from '../core/I18n';

/** Wait after arriving in camp, so the town card is read first. */
const OPEN_AFTER_MS = 2800;

export class ClearRecap {
  readonly panel: Panel;
  private body: HTMLDivElement;
  /** The tier just banked, until camp is reached. */
  private cleared = 0;
  private shown = 0;
  private timer = 0;
  private inTown = false;

  constructor() {
    this.panel = new Panel({ id: 'clearRecap', title: tr('Map Cleared'), icon: 'sparkle', width: 480, className: 'panel-recap' });
    this.body = div('rcp');
    this.panel.body.appendChild(this.body);

    events.on('run:cleared', (p) => {
      this.cleared = p.depth;
    });
    events.on('scene:change', (p) => {
      this.inTown = p.to === 'town';
      window.clearTimeout(this.timer);
      if (!this.inTown || !this.cleared) {
        if (p.to === 'dungeon') this.cleared = 0;
        return;
      }
      this.shown = this.cleared;
      this.cleared = 0;
      this.timer = window.setTimeout(() => {
        if (this.inTown) events.emit('ui:open', { panel: 'clearRecap' });
      }, OPEN_AFTER_MS);
    });
  }

  open(): void {
    if (!this.shown) return;
    this.render(this.shown);
    this.panel.open();
  }

  close(): void {
    this.panel.close();
  }

  get isOpen(): boolean {
    return this.panel.isOpen;
  }

  private render(depth: number): void {
    const r = runStats.latest;
    this.panel.setTitle(r.mapName ? tr('{0} cleared', r.mapName) : tr('Tier {0} cleared', depth), tr('Tier {0}', depth));
    clear(this.body);

    const grid = div('rcp-grid');
    const stat = (iconName: string, value: string, label: string, sub?: string): void => {
      const d = div('rcp-stat');
      const v = div('rcp-v');
      v.append(icon(iconName, { size: 14 }), span('', value));
      d.append(v, div('rcp-l', label));
      if (sub) d.appendChild(div('rcp-sub', sub));
      grid.appendChild(d);
    };
    const kinds: string[] = [];
    if (r.elites > 0) kinds.push(tr('{0} elite', r.elites));
    if (r.bosses > 0) kinds.push(trn(r.bosses, '{0} boss', '{0} bosses', r.bosses));
    stat('hourglass', r.seconds > 0 ? duration(r.seconds) : '-', tr('Time below'));
    stat('skull', fmtInt(r.kills), tr('Kills'), kinds.join(', ') || undefined);
    stat('coin', fmtInt(r.gold), tr('Gold found'));
    stat('star', fmtInt(Math.round(r.xp)), tr('Experience'), r.levels > 0 ? trn(r.levels, '+{0} level', '+{0} levels', r.levels) : undefined);
    stat('bag', fmtInt(r.items), tr('Items taken'));
    stat('potion', fmtInt(r.potions), tr('Potions drunk'));
    this.body.appendChild(grid);

    const lines = div('rcp-lines');
    const line = (label: string, value: HTMLElement | string): void => {
      const row = div('rcp-line');
      row.appendChild(span('rcp-line-l', label));
      row.appendChild(typeof value === 'string' ? span('rcp-line-v', value) : value);
      lines.appendChild(row);
    };
    if (r.bestItem && r.bestRarity) {
      const v = span('rcp-line-v', r.bestItem);
      v.style.color = `#${RARITY_COLOR[r.bestRarity].toString(16).padStart(6, '0')}`;
      line(tr('Best find'), v);
    }
    const low = Math.round(r.lowest * 100);
    line(tr('Closest call'), r.lowest >= 0.999 ? tr('Never hurt') : low >= 70 ? tr('Never below {0}% life', low) : tr('Down to {0}% life', Math.max(1, low)));
    if (r.hurtMost) line(tr('Hurt most by'), tr('{0}, {1} damage', r.hurtMost.name, fmtInt(Math.round(r.hurtMost.amount))));
    line(tr('Damage taken'), fmtInt(Math.round(r.damageTaken)));
    if (r.quest) line(tr('Contract done'), r.quest);
    this.body.appendChild(lines);

    const foot = div('rcp-foot');
    foot.appendChild(new Button({ label: tr('Onward'), variant: 'gold', onClick: () => this.close() }).root);
    this.body.appendChild(foot);
  }
}
