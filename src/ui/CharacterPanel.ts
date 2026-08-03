/**
 * SLAY — the character sheet.
 *
 * Attribute allocation on the left, the full derived stat block on the right,
 * grouped Offense / Defense / Utility with an explanation on hover for every
 * line, because "where does this number come from" is the question players
 * actually ask.
 */

import type { Character, Stats, StatKey, DamageType } from '../types';
import { DAMAGE_TYPES, RESIST_OF } from '../types';
import { events } from '../core/Events';
import { save } from '../core/Save';
import { computeStats, xpForLevel } from '../sim/Stats';
import { allocateStat } from '../sim/Character';
import {
  scheduleRefresh,
  Panel,
  add,
  clear,
  div,
  span,
  icon,
  classById,
  classAccent,
  classCrestSvg,
  fmt,
  fmtInt,
  duration,
  statLine,
  section,
  attempt,
  tip,
  STAT_LABEL,
  STAT_ICON,
  countTo,
} from './Widgets';

type AttrKey = 'strength' | 'dexterity' | 'vitality' | 'energy';

const ATTRS: AttrKey[] = ['strength', 'dexterity', 'vitality', 'energy'];

const ATTR_BLURB: Record<AttrKey, string> = {
  strength: 'Raises physical damage and lets you wear heavier armour and weapons. Most melee bases gate on it.',
  dexterity: 'Raises attack rating, block chance and critical strike. Bows, daggers and light armour scale with it.',
  vitality: 'The only attribute that keeps you alive. Each point adds life directly.',
  energy: 'Grows the mana pool and mana regeneration — the fuel for every skill you press.',
};

const STAT_HOW: Partial<Record<StatKey, string>> = {
  life: 'Class base + per-level gain + (Vitality x life-per-point) + flat life from gear and passives.',
  mana: 'Class base + per-level gain + (Energy x mana-per-point) + flat mana from gear and passives.',
  lifeRegen: 'Life restored every second, out of and in combat.',
  manaRegen: 'Mana restored every second. Sustain builds live and die on this number.',
  attackRating: 'Compared against the target defense to produce a hit chance. Scales with Dexterity and level.',
  minDamage: 'Weapon base damage, scaled by upgrade level, then multiplied by Enhanced Damage.',
  maxDamage: 'Weapon base damage, scaled by upgrade level, then multiplied by Enhanced Damage.',
  attackSpeed: 'Percentage change to swing time. Additive across gear, then applied to the weapon base speed.',
  castSpeed: 'Percentage change to cast time for spell skills.',
  critChance: 'Chance for a hit to roll critical damage instead of normal damage.',
  critDamage: 'Bonus damage on a critical hit, on top of the base 150%.',
  lifeSteal: 'Fraction of physical damage dealt returned as life.',
  manaSteal: 'Fraction of physical damage dealt returned as mana.',
  defense: 'Reduces the chance an attack lands at all. Compared against attacker level and attack rating.',
  blockChance: 'Chance a shield stops an incoming attack outright. Requires a shield equipped.',
  damageReduction: 'Flat percentage taken off every incoming hit, after resistances.',
  enhancedDamage: 'Multiplies weapon damage. Additive within the pool, so two +40% rolls give +80%.',
  enhancedDefense: 'Multiplies armour values from gear.',
  elementalDamagePct: 'Multiplies all non-physical damage you deal.',
  areaDamagePct: 'Multiplies damage dealt by area-of-effect skills.',
  moveSpeed: 'Percentage change to run speed. The most under-rated defensive stat in the game.',
  magicFind: 'Improves the odds a drop rolls a higher rarity. Has diminishing returns on the highest tiers.',
  goldFind: 'Increases gold dropped by slain monsters.',
  cooldownReduction: 'Shortens skill cooldowns multiplicatively.',
  skillLevels: 'Adds ranks to every skill you have already invested in.',
};

const OFFENSE: StatKey[] = [
  'minDamage',
  'maxDamage',
  'enhancedDamage',
  'attackRating',
  'attackSpeed',
  'castSpeed',
  'critChance',
  'critDamage',
  'elementalDamagePct',
  'areaDamagePct',
  'fireDamage',
  'coldDamage',
  'lightningDamage',
  'poisonDamage',
  'arcaneDamage',
];

const DEFENSE: StatKey[] = ['defense', 'enhancedDefense', 'blockChance', 'damageReduction', 'life', 'lifeRegen'];

const UTILITY: StatKey[] = [
  'mana',
  'manaRegen',
  'moveSpeed',
  'magicFind',
  'goldFind',
  'cooldownReduction',
  'skillLevels',
  'lifeSteal',
  'manaSteal',
];

const RESIST_LABEL: Record<DamageType, string> = {
  physical: 'Physical',
  fire: 'Fire',
  cold: 'Cold',
  lightning: 'Lightning',
  poison: 'Poison',
  arcane: 'Arcane',
};

export class CharacterPanel {
  readonly panel: Panel;
  private identity: HTMLDivElement;
  private attrBox: HTMLDivElement;
  private colOffense: HTMLDivElement;
  private colDefense: HTMLDivElement;
  private colUtility: HTMLDivElement;
  private resistBox: HTMLDivElement;
  private pointsBanner: HTMLDivElement;

  constructor() {
    this.panel = new Panel({
      id: 'character',
      title: 'Character',
      subtitle: 'Attributes and derived power',
      icon: 'strength',
      width: 940,
    });
    this.panel.frame.classList.add('panel-character');

    const wrap = div('char-wrap');
    const left = div('char-left');
    this.identity = div('char-identity');
    this.pointsBanner = div('char-points');
    this.attrBox = div('char-attrs');
    add(left, this.identity, this.pointsBanner, this.attrBox);

    const right = div('char-right');
    this.colOffense = div('char-col');
    this.colDefense = div('char-col');
    this.colUtility = div('char-col');
    this.resistBox = div('char-resists');
    const cols = div('char-cols');
    add(cols, this.colOffense, this.colDefense, this.colUtility);
    add(right, cols, this.resistBox);

    add(wrap, left, right);
    this.panel.body.appendChild(wrap);

    events.on('ui:refresh', () => {
      if (this.panel.isOpen) scheduleRefresh(this.boundRefresh);
    });
    events.on('player:levelUp', () => {
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

  private readonly boundRefresh = (): void => this.refresh();

  refresh(): void {
    const c = save.account.current;
    if (!c) return;
    const st = attempt(() => computeStats(c), null);
    if (!st) return;

    this.renderIdentity(c, st);
    this.renderAttrs(c, st);
    this.renderGroup(this.colOffense, 'Offense', 'sword', OFFENSE, st);
    this.renderGroup(this.colDefense, 'Defense', 'shield', DEFENSE, st);
    this.renderGroup(this.colUtility, 'Utility', 'sparkle', UTILITY, st);
    this.renderResists(st);
  }

  // -- identity ------------------------------------------------------------

  private renderIdentity(c: Character, st: Stats): void {
    clear(this.identity);
    const def = classById(c.classId);
    const accent = classAccent(c.classId);
    this.identity.style.setProperty('--accent', accent);

    const crest = div('char-crest');
    crest.innerHTML = classCrestSvg(c.classId, accent, 74);
    const names = div('char-names');
    names.appendChild(div('char-name', c.name));
    names.appendChild(div('char-class', `${def?.title ?? ''} · ${def?.name ?? c.classId}`));
    const head = div('char-head');
    add(head, crest, names);
    this.identity.appendChild(head);

    const need = attempt(() => xpForLevel(c.level), 100);
    const xpRow = div('char-xp');
    const lvl = div('char-level');
    lvl.appendChild(span('char-level-n', String(c.level)));
    lvl.appendChild(span('char-level-w', 'LEVEL'));
    const track = div('char-xp-track');
    const fill = div('char-xp-fill');
    fill.style.width = `${Math.max(0, Math.min(100, (c.xp / Math.max(1, need)) * 100))}%`;
    track.appendChild(fill);
    track.appendChild(span('char-xp-text', `${fmtInt(c.xp)} / ${fmtInt(need)}`));
    add(xpRow, lvl, track);
    this.identity.appendChild(xpRow);

    const facts = div('char-facts');
    facts.appendChild(this.fact('Deepest', `Depth ${c.depthRecord}`, 'descend'));
    facts.appendChild(this.fact('Survived', duration(c.playtime), 'hourglass'));
    facts.appendChild(this.fact('Gold', fmtInt(c.gold), 'coin'));
    facts.appendChild(this.fact('Life', fmt(st.life), 'life'));
    this.identity.appendChild(facts);
  }

  private fact(label: string, value: string, iconName: string): HTMLElement {
    const f = div('char-fact');
    f.appendChild(icon(iconName, { size: 14 }));
    const t = div('char-fact-text');
    t.appendChild(div('char-fact-v', value));
    t.appendChild(div('char-fact-l', label));
    f.appendChild(t);
    return f;
  }

  // -- attributes ----------------------------------------------------------

  private renderAttrs(c: Character, st: Stats): void {
    clear(this.pointsBanner);
    const hasPoints = c.statPoints > 0;
    this.pointsBanner.classList.toggle('is-live', hasPoints);
    this.pointsBanner.appendChild(icon(hasPoints ? 'sparkle' : 'info', { size: 14 }));
    this.pointsBanner.appendChild(
      span('', hasPoints ? `${c.statPoints} attribute point${c.statPoints === 1 ? '' : 's'} unspent` : 'No unspent attribute points')
    );
    if (c.skillPoints > 0) {
      const b = span('char-points-skill', `${c.skillPoints} skill point${c.skillPoints === 1 ? '' : 's'}`);
      b.addEventListener('click', () => events.emit('ui:open', { panel: 'skills' }));
      this.pointsBanner.appendChild(b);
    }

    clear(this.attrBox);
    const def = classById(c.classId);
    for (const key of ATTRS) {
      const rowEl = div('attr-row');
      const head = div('attr-head');
      head.appendChild(icon(STAT_ICON[key] ?? 'star', { size: 15 }));
      head.appendChild(span('attr-name', STAT_LABEL[key]));
      const base = c.allocated?.[key] ?? 0;
      const total = st[key];
      const value = div('attr-value');
      const v = span('attr-total', String(Math.round(total)));
      value.appendChild(v);
      if (base > 0) value.appendChild(span('attr-alloc', `(${base} spent)`));

      const btn = document.createElement('button');
      btn.className = 'attr-plus';
      btn.type = 'button';
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5.4v13.2M5.4 12h13.2"/></svg>';
      btn.disabled = c.statPoints <= 0;
      btn.title = c.statPoints > 0 ? `Spend a point on ${STAT_LABEL[key]}` : 'No points to spend';
      btn.addEventListener('click', () => {
        const ok = attempt(() => allocateStat(c, key), false);
        if (ok) {
          save.touch();
          events.emit('sfx', { id: 'ui.click' });
          events.emit('ui:refresh', {});
          btn.classList.remove('pop');
          void btn.offsetWidth;
          btn.classList.add('pop');
        }
      });

      const derived = div('attr-derived');
      if (key === 'vitality' && def) derived.textContent = `+${def.lifePerVit} life per point`;
      else if (key === 'energy' && def) derived.textContent = `+${def.manaPerEnr} mana per point`;
      else if (key === 'strength') derived.textContent = 'scales physical damage';
      else derived.textContent = 'scales attack rating & block';

      add(rowEl, head, value, btn, derived);
      tip(rowEl, STAT_LABEL[key], `<p>${ATTR_BLURB[key]}</p><p class="tt-explain-how">Total ${Math.round(total)} — ${base} allocated by you, the rest from your class, level and gear.</p>`);
      this.attrBox.appendChild(rowEl);
    }
  }

  // -- derived stats -------------------------------------------------------

  private renderGroup(host: HTMLDivElement, title: string, iconName: string, keys: StatKey[], st: Stats): void {
    clear(host);
    const s = section(title, iconName);
    let shown = 0;
    for (const key of keys) {
      const v = st[key];
      if (!v && key !== 'defense' && key !== 'life' && key !== 'mana' && key !== 'minDamage' && key !== 'maxDamage') continue;
      const isPct = /Pct$|Speed$|Chance$|Damage$|Reduction$|Find$|Steal$/.test(key) && key !== 'minDamage' && key !== 'maxDamage' && key !== 'fireDamage' && key !== 'coldDamage' && key !== 'lightningDamage' && key !== 'poisonDamage' && key !== 'arcaneDamage';
      const text = isPct ? `${fmt(v)}%` : fmt(v);
      const line = statLine(STAT_LABEL[key], text, {
        icon: STAT_ICON[key],
        hint: STAT_HOW[key] ? `<p>${STAT_HOW[key]}</p>` : `<p>Current value: <b>${text}</b></p>`,
        title: STAT_LABEL[key],
      });
      s.body.appendChild(line);
      shown++;
    }
    if (!shown) s.body.appendChild(div('char-empty', 'Nothing here yet.'));
    host.appendChild(s.root);
  }

  private renderResists(st: Stats): void {
    clear(this.resistBox);
    const s = section('Resistances', 'resist', 'char-resist-section');
    const grid = div('resist-grid');
    for (const dt of DAMAGE_TYPES) {
      const key = RESIST_OF[dt];
      const v = st[key] ?? 0;
      const cell = div('resist-cell');
      cell.classList.toggle('is-negative', v < 0);
      cell.classList.toggle('is-capped', v >= 75);
      const head = div('resist-head');
      head.appendChild(icon(dt, { size: 14, cls: `dmg-${dt}` }));
      head.appendChild(span('resist-name', RESIST_LABEL[dt]));
      head.appendChild(span('resist-value', `${Math.round(v)}%`));
      const track = div('resist-track');
      const fill = div('resist-fill');
      fill.style.width = `${Math.max(0, Math.min(100, ((v + 100) / 175) * 100))}%`;
      fill.classList.add(`dmgbg-${dt}`);
      const capMark = div('resist-cap');
      add(track, fill, capMark);
      add(cell, head, track);
      tip(
        cell,
        `${RESIST_LABEL[dt]} Resistance`,
        `<p>Reduces incoming ${RESIST_LABEL[dt].toLowerCase()} damage by ${Math.round(v)}%.</p>` +
          `<p class="tt-explain-how">Soft cap is 75%. Deeper floors apply a resistance penalty, so overcapping is not wasted.</p>`
      );
      grid.appendChild(cell);
    }
    s.body.appendChild(grid);
    this.resistBox.appendChild(s.root);
  }
}
