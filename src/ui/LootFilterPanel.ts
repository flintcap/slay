/**
 * SLAY — loot filter panel.
 *
 * Presets for the common cases and a toggle for each rule. Every change saves
 * at once and applies to the next thing that drops. Opens with O.
 */

import type { ItemRarity } from '../types';
import { save } from '../core/Save';
import {
  DEFAULT_LOOT_FILTER,
  LOOT_FILTER_PRESETS,
  describeFilter,
  lootFilterOf,
  type LootFilterSettings,
} from '../sim/LootFilter';
import { Panel, Segmented, Toggle, Button, div, clear, section, keycap, span, add } from './Widgets';

const RARITY_OPTS: Array<{ id: ItemRarity; label: string; hint: string }> = [
  { id: 'normal', label: 'Normal', hint: 'Show all gear' },
  { id: 'magic', label: 'Magic', hint: 'Hide plain gear' },
  { id: 'rare', label: 'Rare', hint: 'Hide magic and plain gear' },
  { id: 'set', label: 'Set', hint: 'Only sets and uniques' },
];

export class LootFilterPanel {
  readonly panel: Panel;
  private body: HTMLDivElement;

  constructor() {
    this.panel = new Panel({
      id: 'lootFilter',
      title: 'Loot Filter',
      subtitle: 'Decide what the floor shows you',
      icon: 'filter',
      width: 520,
    });
    this.body = div('depth-panel');
    this.panel.body.appendChild(this.body);
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

  private settings(): LootFilterSettings {
    return lootFilterOf(save.account);
  }

  private change(patch: Partial<LootFilterSettings>): void {
    Object.assign(this.settings(), patch);
    save.touch();
    this.render();
  }

  private render(): void {
    clear(this.body);
    const f = this.settings();

    const summary = div('depth-note');
    summary.textContent = describeFilter(f);
    this.body.appendChild(summary);

    const presets = section('Presets', 'sparkle');
    const row = div('depth-row');
    for (const p of LOOT_FILTER_PRESETS) {
      const b = new Button({
        label: p.label,
        small: true,
        variant: 'ghost',
        onClick: () => {
          Object.assign(this.settings(), p.settings);
          save.touch();
          this.render();
        },
      });
      b.root.title = p.hint;
      row.appendChild(b.root);
    }
    presets.body.appendChild(row);
    this.body.appendChild(presets.root);

    const rules = section('Rules', 'target');
    rules.body.appendChild(new Toggle('Filter on', f.enabled, (v) => this.change({ enabled: v })).root);
    rules.body.appendChild(
      new Segmented<ItemRarity>('Hide gear below', RARITY_OPTS, f.minRarity, (v) => this.change({ minRarity: v })).root,
    );
    rules.body.appendChild(
      new Toggle('Always show powers', f.keepPowers, (v) => this.change({ keepPowers: v }), 'gear with an orange power line').root,
    );
    rules.body.appendChild(
      new Toggle('Always show T1 rolls', f.keepTopTier, (v) => this.change({ keepTopTier: v }), 'the best tier of any affix').root,
    );
    rules.body.appendChild(
      new Segmented<string>(
        'Always show sockets',
        [
          { id: '0', label: 'Off' },
          { id: '2', label: '2+' },
          { id: '3', label: '3+' },
          { id: '4', label: '4+' },
        ],
        String(f.keepSockets),
        (v) => this.change({ keepSockets: Number(v) }),
      ).root,
    );
    rules.body.appendChild(
      new Toggle("Hide other classes' gear", f.hideOtherClasses, (v) => this.change({ hideOtherClasses: v })).root,
    );
    rules.body.appendChild(new Toggle('Show gems', f.showGems, (v) => this.change({ showGems: v })).root);
    rules.body.appendChild(new Toggle('Show runes', f.showRunes, (v) => this.change({ showRunes: v })).root);
    rules.body.appendChild(new Toggle('Show potions', f.showPotions, (v) => this.change({ showPotions: v })).root);
    this.body.appendChild(rules.root);

    const foot = div('depth-row depth-foot');
    const hint = span('depth-dim');
    add(hint, span('', 'Hold '), keycap('Shift'), span('', ' to see hidden drops. Uniques and better always show.'));
    foot.appendChild(hint);
    foot.appendChild(
      new Button({
        label: 'Reset',
        small: true,
        variant: 'ghost',
        onClick: () => {
          save.account.lootFilter = { ...DEFAULT_LOOT_FILTER };
          save.touch();
          this.render();
        },
      }).root,
    );
    this.body.appendChild(foot);
  }
}
