/**
 * SLAY — Sister Vell's stone work. Three gems of one family and quality fuse
 * into one of the next quality; three runes of one kind into the next rune.
 * Opened from her second service in the talk window.
 */

import { save } from '../core/Save';
import { events, toast } from '../core/Events';
import { audio } from '../audio/Audio';
import { Random } from '../core/RNG';
import type { Item } from '../types';
import { createItem } from '../sim/Loot';
import { spendCost } from '../sim/Crafting';
import { fusableInPack, fuseStones, type FuseRecipe } from '../sim/TownServices';
import { getSocketable } from '../data/gems';
import { itemIconUri } from '../art/Icons';
import { Panel, Button, div, span, clear, add, fmtInt } from './Widgets';
import { itemName } from './DepthWidgets';
import { tr } from '../core/I18n';

/** One look at each stone the panel can make, for its icon and tooltip. */
const previews = new Map<string, Item>();
function preview(baseId: string): Item {
  let it = previews.get(baseId);
  if (!it) {
    it = createItem(baseId, 1, new Random(0x5701e));
    previews.set(baseId, it);
  }
  return it;
}

function stoneIcon(item: Item): HTMLImageElement {
  const img = document.createElement('img');
  img.className = 'fuse-ico';
  img.src = itemIconUri(item);
  img.alt = '';
  img.draggable = false;
  return img;
}

export class FusePanel {
  readonly panel: Panel;
  private body: HTMLDivElement;

  constructor() {
    this.panel = new Panel({
      id: 'fuse',
      title: tr('Stone Work'),
      subtitle: tr('Three of a kind, rendered into one better'),
      icon: 'gem',
      side: 'left',
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

  private fuse(recipe: FuseRecipe, times: number): void {
    const c = save.account.current;
    if (!c) return;
    const r = fuseStones(c, recipe.from, times, (cost) => spendCost(cost));
    if (!r.ok) {
      toast(r.reason ?? tr('No.'), 'bad');
      audio.play('ui.error');
      return;
    }
    const name = getSocketable(recipe.to)?.name ?? 'stone';
    audio.play('levelup');
    toast(r.made > 1 ? tr('Fused {0} × {1}', r.made, name) : tr('Fused: {0}', name), 'good');
    if (r.reason) toast(r.reason, 'info');
    save.touch();
    events.emit('ui:refresh', {});
  }

  private render(): void {
    clear(this.body);
    const c = save.account.current;
    if (!c) return;
    this.body.appendChild(
      div(
        'depth-note',
        tr('Three gems of the same kind and quality make one of the next quality. Three runes of the same kind make the next rune. Only what you carry in your pack counts.'),
      ),
    );
    const rows = fusableInPack(c).sort((a, b) =>
      a.recipe.kind === b.recipe.kind
        ? (getSocketable(a.recipe.from)?.value ?? 0) - (getSocketable(b.recipe.from)?.value ?? 0)
        : a.recipe.kind === 'gem' ? -1 : 1,
    );
    if (rows.length === 0) {
      this.body.appendChild(div('depth-card-sub', tr('Bring me gems or runes. Three of a kind, and I can do something with them.')));
    }
    const list = div('depth-list');
    list.style.maxHeight = '52cqh';
    for (const { recipe, have } of rows) {
      const sets = Math.floor(have / recipe.count);
      const affordable = Math.min(sets, Math.floor(c.gold / Math.max(1, recipe.gold)));
      const card = div(`depth-card fuse-row${sets > 0 ? '' : ' is-locked'}`);
      const from = preview(recipe.from);
      const to = preview(recipe.to);
      const b = div('depth-card-body fuse-body');
      const line = div('fuse-line');
      add(line, stoneIcon(from), span('fuse-times', `${recipe.count} ×`), itemName(from), span('fuse-arrow', '→'), stoneIcon(to), itemName(to));
      add(b, line, span('depth-dim', tr('You carry {0}. {1}g each.', have, fmtInt(recipe.gold))));
      card.appendChild(b);
      const one = new Button({ label: tr('Fuse'), small: true, variant: 'gold', onClick: () => this.fuse(recipe, 1) });
      one.setDisabled(affordable < 1);
      card.appendChild(one.root);
      if (sets > 1) {
        const all = new Button({ label: tr('Fuse all ({0})', affordable), small: true, onClick: () => this.fuse(recipe, affordable) });
        all.setDisabled(affordable < 2);
        card.appendChild(all.root);
      }
      list.appendChild(card);
    }
    this.body.appendChild(list);
    const foot = div('depth-row depth-foot');
    add(foot, span('depth-dim', tr('You carry {0} gold.', fmtInt(c.gold))));
    this.body.appendChild(foot);
  }
}
