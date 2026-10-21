/**
 * SLAY — loot filter panel.
 *
 * Presets for the common cases and a toggle for each rule. Every change saves
 * at once and applies to the next thing that drops. Opens with O.
 */

import type { ItemRarity } from '../types';
import { save } from '../core/Save';
import { RUNES, RUNE_CUTS } from '../data/gems';
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
import { tr } from '../core/I18n';

const RARITY_OPTS: Array<{ id: ItemRarity; label: string; hint: string }> = [
  { id: 'normal', label: tr('All'), hint: tr('Show all of it') },
  { id: 'magic', label: tr('Magic'), hint: tr('Hide plain') },
  { id: 'rare', label: tr('Rare'), hint: tr('Hide magic and plain') },
  { id: 'set', label: tr('Set'), hint: tr('Only sets and uniques') },
  { id: 'unique', label: tr('Unique'), hint: tr('Only uniques and better') },
];

const GEM_OPTS = [
  { id: '0', label: tr('All') },
  { id: '1', label: tr('Flawed+') },
  { id: '2', label: tr('Normal+') },
  { id: '3', label: tr('Flawless+') },
  { id: '4', label: tr('Perfect+') },
];

/** Rune bars by cut: every vein's rune of that cut and deeper. */
const RUNE_OPTS = [1, 2, 3, 4, 5].map((n) => {
  const names = RUNES.filter((x) => x.cut === n).map((x) => x.name.replace(/ Rune$/, '')).join(', ');
  return { id: String(n), label: n === 1 ? tr('All') : tr('Cut {0}+', n), hint: tr('From cut {0} of {1}: {2}', n, RUNE_CUTS, names) };
});

const POTION_OPTS = [
  { id: 'off', label: tr('Off') },
  { id: '0', label: tr('All') },
  { id: '1', label: tr('Light+') },
  { id: '2', label: tr('Greater+') },
  { id: '3', label: tr('Super+') },
];

/** The rarity ladder the glance grid shows, low to high. */
const LADDER: Array<{ id: ItemRarity; label: string }> = [
  { id: 'normal', label: tr('Plain') },
  { id: 'magic', label: tr('Magic') },
  { id: 'rare', label: tr('Rare') },
  { id: 'set', label: tr('Set') },
  { id: 'unique', label: tr('Unique') },
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
  private idle: { lootFilter?: LootFilterSettings } = {};

  constructor() {
    this.panel = new Panel({
      id: 'lootFilter',
      title: tr('Loot Filter'),
      subtitle: tr('Decide what the floor shows you'),
      icon: 'filter',
      side: 'left',
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

  /** The live hero's filter. With no hero in play, a default nobody keeps. */
  private settings(): LootFilterSettings {
    return lootFilterOf(save.account.current ?? this.idle);
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

    const presets = section(tr('Presets'), 'sparkle');
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
      div('lf-preset-note', active ? `${active.label}: ${active.hint}` : tr('Custom: your own mix of the settings below.')),
    );
    this.body.appendChild(presets.root);

    const gear = section(tr('Gear'), 'target');
    gear.body.appendChild(new Toggle(tr('Filter on'), f.enabled, (v) => this.change({ enabled: v })).root);
    gear.body.appendChild(div('lf-caption', tr('Each row shows the rarity picked and everything rarer.')));
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
        tr('Hide outgrown bases'),
        [
          { id: '0', label: tr('Off') },
          { id: '10', label: tr('10+ lvls'), hint: tr('Plain and magic gear on a base 10 levels behind the drop') },
          { id: '20', label: tr('20+ lvls') },
          { id: '30', label: tr('30+ lvls') },
        ],
        String(f.hideOldBases),
        (v) => this.change({ hideOldBases: Number(v) }),
      ).root,
    );
    gear.body.appendChild(
      new Toggle(tr("Hide other classes' gear"), f.hideOtherClasses, (v) => this.change({ hideOtherClasses: v })).root,
    );
    this.body.appendChild(gear.root);

    const keep = section(tr('Always show'), 'sparkle');
    keep.body.appendChild(
      new Toggle(tr('Powers'), f.keepPowers, (v) => this.change({ keepPowers: v }), tr('gear with an orange power line')).root,
    );
    keep.body.appendChild(
      new Toggle(tr('T1 rolls'), f.keepTopTier, (v) => this.change({ keepTopTier: v }), tr('the best tier of any affix')).root,
    );
    keep.body.appendChild(
      new Segmented<string>(
        tr('Sockets'),
        [
          { id: '0', label: tr('Off') },
          { id: '2', label: '2+' },
          { id: '3', label: '3+' },
          { id: '4', label: '4+' },
        ],
        String(f.keepSockets),
        (v) => this.change({ keepSockets: Number(v) }),
      ).root,
    );
    const wanted = div('field field-segmented');
    wanted.appendChild(div('field-label', tr('Stats I want')));
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
        tr('Needs how many'),
        [
          { id: '1', label: tr('Any 1') },
          { id: '2', label: tr('2 of them') },
          { id: '3', label: tr('3 of them') },
        ],
        String(f.keepStatsMin),
        (v) => this.change({ keepStatsMin: Number(v) }),
      ).root,
    );
    this.body.appendChild(keep.root);

    const other = section(tr('Gems, runes, potions'), 'gem');
    other.body.appendChild(
      new Segmented<string>(tr('Gems'), [{ id: 'off', label: tr('Off') }, ...GEM_OPTS], f.showGems ? String(f.minGemQuality) : 'off', (v) =>
        this.change(v === 'off' ? { showGems: false } : { showGems: true, minGemQuality: Number(v) }),
      ).root,
    );
    other.body.appendChild(
      new Segmented<string>(tr('Runes'), [{ id: 'off', label: tr('Off') }, ...RUNE_OPTS], f.showRunes ? String(f.minRuneOrder) : 'off', (v) =>
        this.change(v === 'off' ? { showRunes: false } : { showRunes: true, minRuneOrder: Number(v) }),
      ).root,
    );
    other.body.appendChild(
      new Segmented<string>(tr('Potions'), POTION_OPTS, f.showPotions ? String(f.minPotionTier) : 'off', (v) =>
        this.change(v === 'off' ? { showPotions: false } : { showPotions: true, minPotionTier: Number(v) }),
      ).root,
    );
    this.body.appendChild(other.root);

    const foot = div('depth-row depth-foot');
    const hint = span('depth-dim');
    add(hint, span('', tr('Hold ')), keycap('Shift'), span('', tr(' to see hidden drops. Uniques and better always show.')));
    foot.appendChild(hint);
    foot.appendChild(
      new Button({
        label: tr('Reset'),
        small: true,
        variant: 'ghost',
        onClick: () => {
          (save.account.current ?? this.idle).lootFilter = structuredClone(DEFAULT_LOOT_FILTER);
          save.touch();
          this.render();
        },
      }).root,
    );
    this.body.appendChild(foot);
  }
}
