/**
 * SLAY — loot filter panel.
 *
 * Presets for the common cases and a toggle for each rule. Every change saves
 * at once and applies to the next thing that drops. Opens with O.
 */

import type { ItemRarity } from '../types';
import { save } from '../core/Save';
import { RUNES } from '../data/gems';
import {
  DEFAULT_LOOT_FILTER,
  FILTER_GROUPS,
  LOOT_FILTER_PRESETS,
  STAT_CHIPS,
  describeFilter,
  lootFilterOf,
  type LootFilterSettings,
} from '../sim/LootFilter';
import { Panel, Segmented, Toggle, Button, div, clear, section, keycap, span, add } from './Widgets';

const RARITY_OPTS: Array<{ id: ItemRarity; label: string; hint: string }> = [
  { id: 'normal', label: 'All', hint: 'Show all of it' },
  { id: 'magic', label: 'Magic', hint: 'Hide plain' },
  { id: 'rare', label: 'Rare', hint: 'Hide magic and plain' },
  { id: 'set', label: 'Set', hint: 'Only sets and uniques' },
  { id: 'unique', label: 'Unique', hint: 'Only uniques and better' },
];

const GEM_OPTS = [
  { id: '0', label: 'All' },
  { id: '1', label: 'Flawed+' },
  { id: '2', label: 'Normal+' },
  { id: '3', label: 'Flawless+' },
  { id: '4', label: 'Perfect+' },
];

/** Rune bars, labelled with the rune that starts each one. */
const RUNE_OPTS = [1, 8, 14, 20, 26].map((n) => {
  const r = RUNES.find((x) => x.order === n);
  return { id: String(n), label: n === 1 ? 'All' : `${r?.name ?? `#${n}`}+`, hint: `From rune ${n} of 33` };
});

const POTION_OPTS = [
  { id: 'off', label: 'Off' },
  { id: '0', label: 'All' },
  { id: '1', label: 'Light+' },
  { id: '2', label: 'Greater+' },
  { id: '3', label: 'Super+' },
];

/** The rarity ladder the glance grid shows, low to high. */
const LADDER: Array<{ id: ItemRarity; label: string }> = [
  { id: 'normal', label: 'Plain' },
  { id: 'magic', label: 'Magic' },
  { id: 'rare', label: 'Rare' },
  { id: 'set', label: 'Set' },
  { id: 'unique', label: 'Unique' },
];
const RARITY_RANK: ItemRarity[] = LADDER.map((r) => r.id);

/** Same settings, field by field (key order does not matter). */
function sameSettings(a: LootFilterSettings, b: LootFilterSettings): boolean {
  const norm = (v: unknown): unknown =>
    Array.isArray(v)
      ? [...v].map(norm).sort()
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, norm((v as Record<string, unknown>)[k])]))
        : v;
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

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

  /**
   * The filter at a glance: one row per kind of gear, one pip per rarity in
   * that rarity's colour, lit when it shows and struck through when hidden.
   * The words underneath say the rest (what is always kept, what else hides).
   */
  private glance(f: LootFilterSettings): HTMLElement {
    const box = div('depth-note lf-glance');
    const grid = div('lf-grid');
    grid.appendChild(span('lf-grid-corner'));
    for (const r of LADDER) grid.appendChild(span('lf-grid-hd', r.label));
    for (const g of FILTER_GROUPS) {
      grid.appendChild(span('lf-grid-row', g.label));
      const floor = RARITY_RANK.indexOf(f.rarityBy[g.id]);
      for (const r of LADDER) {
        const shown = !f.enabled || RARITY_RANK.indexOf(r.id) >= floor;
        const pip = span(`lf-pip ${shown ? 'is-on' : 'is-off'}`);
        pip.style.setProperty('--pip', `var(--r-${r.id})`);
        pip.title = `${g.label}, ${r.label.toLowerCase()}: ${shown ? 'shown' : 'hidden'}`;
        grid.appendChild(pip);
      }
    }
    box.appendChild(grid);
    // describeFilter opens with the rarity bars the grid already shows.
    const parts = describeFilter(f).split('. ');
    const rest = parts[0]?.startsWith('Showing ') ? parts.slice(1).join('. ') : parts.join('. ');
    if (rest) box.appendChild(div('lf-glance-text', rest));
    return box;
  }

  private change(patch: Partial<LootFilterSettings>): void {
    Object.assign(this.settings(), patch);
    save.touch();
    this.render();
  }

  private render(): void {
    clear(this.body);
    const f = this.settings();

    this.body.appendChild(this.glance(f));

    const presets = section('Presets', 'sparkle');
    const row = div('depth-row');
    const active = LOOT_FILTER_PRESETS.find((p) => sameSettings(p.settings, f));
    for (const p of LOOT_FILTER_PRESETS) {
      const b = new Button({
        label: p.label,
        small: true,
        variant: p === active ? 'gold' : 'ghost',
        onClick: () => {
          Object.assign(this.settings(), structuredClone(p.settings));
          save.touch();
          this.render();
        },
      });
      b.root.title = p.hint;
      if (p === active) b.root.classList.add('is-on');
      row.appendChild(b.root);
    }
    presets.body.appendChild(row);
    // Say what the current setup is: a preset's own words, or that it is yours.
    presets.body.appendChild(
      div('lf-preset-note', active ? `${active.label}: ${active.hint}` : 'Custom: your own mix of the settings below.'),
    );
    this.body.appendChild(presets.root);

    const gear = section('Gear', 'target');
    gear.body.appendChild(new Toggle('Filter on', f.enabled, (v) => this.change({ enabled: v })).root);
    gear.body.appendChild(div('lf-caption', 'Each row shows the rarity picked and everything rarer.'));
    for (const g of FILTER_GROUPS) {
      const seg = new Segmented<ItemRarity>(g.label, RARITY_OPTS, f.rarityBy[g.id], (v) =>
        this.change({ rarityBy: { ...f.rarityBy, [g.id]: v } }),
      ).root;
      // Each choice in its rarity's colour, so "Rare" reads as the yellow ones.
      seg.classList.add('lf-rarity');
      seg.querySelectorAll<HTMLElement>('.seg').forEach((b, i) => {
        const r = RARITY_OPTS[i]?.id;
        if (r && r !== 'normal') b.style.setProperty('--seg-tint', `var(--r-${r})`);
      });
      gear.body.appendChild(seg);
    }
    gear.body.appendChild(
      new Segmented<string>(
        'Hide outgrown bases',
        [
          { id: '0', label: 'Off' },
          { id: '10', label: '10+ lvls', hint: 'Plain and magic gear on a base 10 levels behind the drop' },
          { id: '20', label: '20+ lvls' },
          { id: '30', label: '30+ lvls' },
        ],
        String(f.hideOldBases),
        (v) => this.change({ hideOldBases: Number(v) }),
      ).root,
    );
    gear.body.appendChild(
      new Toggle("Hide other classes' gear", f.hideOtherClasses, (v) => this.change({ hideOtherClasses: v })).root,
    );
    this.body.appendChild(gear.root);

    const keep = section('Always show', 'sparkle');
    keep.body.appendChild(
      new Toggle('Powers', f.keepPowers, (v) => this.change({ keepPowers: v }), 'gear with an orange power line').root,
    );
    keep.body.appendChild(
      new Toggle('T1 rolls', f.keepTopTier, (v) => this.change({ keepTopTier: v }), 'the best tier of any affix').root,
    );
    keep.body.appendChild(
      new Segmented<string>(
        'Sockets',
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
    const wanted = div('field field-segmented');
    wanted.appendChild(div('field-label', 'Stats I want'));
    const chips = div('segbar lf-chips');
    for (const c of STAT_CHIPS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seg';
      b.textContent = c.label;
      b.classList.toggle('on', f.keepStats.includes(c.id));
      b.addEventListener('click', () => {
        const on = f.keepStats.includes(c.id);
        this.change({ keepStats: on ? f.keepStats.filter((x) => x !== c.id) : [...f.keepStats, c.id] });
      });
      chips.appendChild(b);
    }
    wanted.appendChild(chips);
    keep.body.appendChild(wanted);
    keep.body.appendChild(
      new Segmented<string>(
        'Needs how many',
        [
          { id: '1', label: 'Any 1' },
          { id: '2', label: '2 of them' },
          { id: '3', label: '3 of them' },
        ],
        String(f.keepStatsMin),
        (v) => this.change({ keepStatsMin: Number(v) }),
      ).root,
    );
    this.body.appendChild(keep.root);

    const other = section('Gems, runes, potions', 'gem');
    other.body.appendChild(
      new Segmented<string>('Gems', [{ id: 'off', label: 'Off' }, ...GEM_OPTS], f.showGems ? String(f.minGemQuality) : 'off', (v) =>
        this.change(v === 'off' ? { showGems: false } : { showGems: true, minGemQuality: Number(v) }),
      ).root,
    );
    other.body.appendChild(
      new Segmented<string>('Runes', [{ id: 'off', label: 'Off' }, ...RUNE_OPTS], f.showRunes ? String(f.minRuneOrder) : 'off', (v) =>
        this.change(v === 'off' ? { showRunes: false } : { showRunes: true, minRuneOrder: Number(v) }),
      ).root,
    );
    other.body.appendChild(
      new Segmented<string>('Potions', POTION_OPTS, f.showPotions ? String(f.minPotionTier) : 'off', (v) =>
        this.change(v === 'off' ? { showPotions: false } : { showPotions: true, minPotionTier: Number(v) }),
      ).root,
    );
    this.body.appendChild(other.root);

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
          save.account.lootFilter = structuredClone(DEFAULT_LOOT_FILTER);
          save.touch();
          this.render();
        },
      }).root,
    );
    this.body.appendChild(foot);
  }
}
