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
import { effectiveLife, effectiveResist, hitChance, RESIST_HARD_CAP, RESIST_SOFT_CAP, usualAttackRating } from '../sim/Combat';
import { depthCurve } from '../sim/Difficulty';
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
import { uiSfx } from './Sfx';
import { estimateAttack, estimateSkill, type AttackEstimate } from './AttackEstimate';

type AttrKey = 'strength' | 'dexterity' | 'vitality' | 'energy';

const ATTRS: AttrKey[] = ['strength', 'dexterity', 'vitality', 'energy'];

const ATTR_BLURB: Record<AttrKey, string> = {
  strength: 'Raises physical damage and lets you wear heavier armour and weapons. Most melee bases gate on it.',
  dexterity: 'Raises attack rating, block chance and critical strike. Bows, daggers and light armour scale with it.',
  vitality: 'The only attribute that keeps you alive. Each point adds life directly.',
  energy: 'Grows the mana pool and mana regeneration — the fuel for every skill you press.',
};

/** A usual boss stands this much harder to hit than a usual monster of its level (its rank's armour, square-rooted). */
const BOSS_GUARD = Math.sqrt(2.4);

/** Hit chances for the attack rating tooltip, against monsters of the hero's level. */
function hitHint(ar: number): string {
  const guard = usualAttackRating(save.account.current?.level ?? 1);
  const pct = (g: number): string => `${Math.round(hitChance(ar, g) * 100)}%`;
  return `<p class="tt-explain-how">Hit chance against a usual monster of your level: <b>${pct(guard)}</b>. Against a usual boss: <b>${pct(guard * BOSS_GUARD)}</b>.</p>`;
}

const STAT_HOW: Partial<Record<StatKey, string>> = {
  life: 'Class base + per-level gain + (Vitality x life-per-point) + flat life from gear and passives.',
  mana: 'Class base + per-level gain + (Energy x mana-per-point) + flat mana from gear and passives.',
  lifeRegen: 'Life restored every second, out of and in combat.',
  manaRegen: 'Mana restored every second. Sustain builds live and die on this number.',
  attackRating: 'Blows from your weapon (swings, slams, arrows) can miss. The more attack rating you have against a monster\'s guard, the fewer misses; five times its guard never misses. Armoured monsters, elites and bosses guard more. Spells, minions and area blasts always hit. Grows with Dexterity and level.',
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
  damageReduction: 'Percent taken off every incoming hit, after resistances and defense. Most it can reach: 50%.',
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
  private buildBox: HTMLDivElement;
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
    this.buildBox = div('char-build');
    const cols = div('char-cols');
    add(cols, this.colOffense, this.colDefense, this.colUtility);
    add(right, cols, this.resistBox, this.buildBox);

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
    this.renderAttack(c, st);
    this.renderGroup(this.colDefense, 'Defense', 'shield', DEFENSE, st);
    this.renderGroup(this.colUtility, 'Utility', 'sparkle', UTILITY, st);
    this.renderResists(st);
    this.renderBuild(c, st);
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
    facts.appendChild(this.fact('Deepest', `Tier ${c.depthRecord}`, 'descend'));
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
          uiSfx('ui.click');
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
      // Below the right-click attack, the weapon's own roll is named as the weapon's.
      const label = key === 'minDamage' ? 'Weapon Min Damage' : key === 'maxDamage' ? 'Weapon Max Damage' : STAT_LABEL[key];
      const line = statLine(label, text, {
        icon: STAT_ICON[key],
        hint: (STAT_HOW[key] ? `<p>${STAT_HOW[key]}</p>` : `<p>Current value: <b>${text}</b></p>`) + (key === 'attackRating' ? hitHint(v) : ''),
        title: label,
      });
      s.body.appendChild(line);
      shown++;
    }
    if (!shown) s.body.appendChild(div('char-empty', 'Nothing here yet.'));
    host.appendChild(s.root);
  }

  /**
   * The right-click attack, first in Offense: what it hits for with this gear.
   * The weapon's own numbers stay below it, named as the weapon's.
   */
  private renderAttack(c: Character, st: Stats): void {
    const body = this.colOffense.querySelector('.section-body');
    if (!body) return;
    let label = 'Attack';
    let value = '—';
    let hint = '<p>Put a skill on the right mouse button to see what it hits for.</p>';
    const est = attempt(() => estimateAttack(c, st), null);
    if (est?.def) {
      const { def, rank, scale, type } = est;
      label = def.name;
      value = `${fmtInt(Math.round(est.min))}–${fmtInt(Math.round(est.max))}`;
      const crit = Math.max(100, st.critDamage);
      hint =
        `<p>Your right-click skill, rank ${rank}. Each hit lands for <b>${value}</b> ${RESIST_LABEL[type].toLowerCase()} damage before the target's defences.</p>` +
        `<p class="tt-explain-how">Weapon damage × ${fmt(Math.round(scale * 100))}% skill power, with Enhanced Damage and your elemental adds. A critical hit lands for ${fmt(crit)}% of it. About <b>${fmtInt(Math.round(est.dps))}</b> damage a second to one target, crits counted.</p>`;
    } else if (est) {
      value = `${fmtInt(Math.round(est.min))}–${fmtInt(Math.round(est.max))}`;
      hint =
        `<p>Your weapon attack. Each hit lands for <b>${value}</b> physical damage before the target's defences.</p>` +
        `<p class="tt-explain-how">About <b>${fmtInt(Math.round(est.dps))}</b> damage a second to one target, crits counted. Drag a skill onto the right mouse button to use it instead.</p>`;
    }
    const line = statLine(label, value, { icon: 'sword', hint, title: label });
    line.classList.add('statline-attack');
    body.insertBefore(line, body.firstChild);
  }

  /**
   * The build in real numbers: what each skill on the bar hits for and deals
   * a second with this gear, how many ordinary blows of the deepest tier
   * reached it takes to fall to each kind of damage, and a few plain lines
   * on what the build leans on and where it is thin.
   */
  private renderBuild(c: Character, st: Stats): void {
    clear(this.buildBox);
    const s = section('Your build', 'sparkle', 'char-build-section');

    // --- damage per skill ---------------------------------------------------
    const ids = [...new Set([c.primaryAttack, ...c.hotbar].filter((x): x is string => !!x))];
    const rows: AttackEstimate[] = [];
    for (const id of ids) {
      const e = attempt(() => estimateSkill(c, st, id), null);
      if (e) rows.push(e);
    }
    const weapon = attempt(() => estimateAttack(c, st), null);
    if (weapon && !weapon.def) rows.unshift(weapon);
    const dmg = div('build-skills');
    if (!rows.length) {
      dmg.appendChild(div('char-empty', 'Put a damage skill on your bar to see what it does.'));
    } else {
      const head = div('build-row build-head');
      add(head, span('', 'Skill'), span('', 'Each hit'), span('', 'A second'));
      dmg.appendChild(head);
      for (const e of rows.sort((a, b) => b.dps - a.dps)) {
        const r = div('build-row');
        const name = span('build-name');
        name.appendChild(icon(e.type, { size: 12, cls: `dmg-${e.type}` }));
        name.appendChild(span('', e.def ? `${e.def.name} ${e.rank}` : 'Weapon attack'));
        add(r, name, span('build-num', `${fmtInt(Math.round(e.min))}–${fmtInt(Math.round(e.max))}`), span('build-num build-dps', fmtInt(Math.round(e.dps))));
        tip(
          r,
          e.def ? e.def.name : 'Weapon attack',
          `<p>About <b>${fmtInt(Math.round(e.dps))}</b> ${RESIST_LABEL[e.type].toLowerCase()} damage a second to one target, one use every ${fmt(Math.round(e.period * 100) / 100)} s, crits counted.</p>` +
            `<p class="tt-explain-how">Before the target's armour and resistances. Areas, chains and damage over time hit more than one target or keep hurting after, so they do more than this in a crowd.</p>`,
        );
        dmg.appendChild(r);
      }
    }

    // --- how many blows to fall ---------------------------------------------
    const tier = Math.max(1, c.depthRecord || 1);
    const blow = Math.max(1, depthCurve(tier).damage);
    const guard = div('build-guard');
    const blows: Array<{ type: DamageType; n: number }> = DAMAGE_TYPES.map((t) => ({
      type: t,
      n: Math.min(999, effectiveLife(st, blow, t) / blow),
    }));
    for (const b of blows) {
      const cell = div('build-guard-cell');
      cell.appendChild(icon(b.type, { size: 13, cls: `dmg-${b.type}` }));
      cell.appendChild(span('build-guard-n', b.n >= 999 ? '999+' : fmtInt(Math.round(b.n))));
      cell.classList.toggle('is-thin', b.n < 8);
      tip(
        cell,
        `${RESIST_LABEL[b.type]} blows to fall`,
        `<p>About <b>${fmtInt(Math.round(b.n))}</b> ordinary ${RESIST_LABEL[b.type].toLowerCase()} blows of Tier ${tier} take you from full life to nothing.</p>` +
          `<p class="tt-explain-how">Your life with armour, block, resistance and damage reduction counted. Elites and bosses hit harder.</p>`,
      );
      guard.appendChild(cell);
    }

    // --- summary --------------------------------------------------------------
    const lines: string[] = [];
    const best = rows[0];
    if (best) lines.push(`Most damage: ${best.def ? best.def.name : 'your weapon'}, ${RESIST_LABEL[best.type].toLowerCase()}.`);
    const thin = [...blows].sort((a, b) => a.n - b.n)[0];
    const thick = [...blows].sort((a, b) => b.n - a.n)[0];
    if (thin && thick && thick.n > thin.n * 1.5) lines.push(`Weakest against ${RESIST_LABEL[thin.type].toLowerCase()}, strongest against ${RESIST_LABEL[thick.type].toLowerCase()}.`);
    const back: string[] = [];
    if (st.lifeSteal > 0) back.push(`${fmt(Math.round(st.lifeSteal * 10) / 10)}% of damage dealt`);
    if (st.lifeRegen > 0) back.push(`${fmt(Math.round(st.lifeRegen * 10) / 10)} a second`);
    lines.push(back.length ? `Life back: ${back.join(' and ')}.` : 'No life back from gear: you lean on potions.');
    if (st.critChance >= 25) lines.push(`Crits often: ${Math.round(Math.min(95, st.critChance))}% for ${Math.round(Math.max(100, st.critDamage))}%.`);
    const summary = div('build-summary');
    for (const l of lines) summary.appendChild(div('build-line', l));

    add(s.body, dmg, div('build-sub', `Blows to fall at Tier ${tier}`), guard, summary);
    this.buildBox.appendChild(s.root);
  }

  private renderResists(st: Stats): void {
    clear(this.resistBox);
    const s = section('Resistances', 'resist', 'char-resist-section');
    const grid = div('resist-grid');
    for (const dt of DAMAGE_TYPES) {
      const key = RESIST_OF[dt];
      const v = st[key] ?? 0;
      const eff = effectiveResist(v);
      const cell = div('resist-cell');
      cell.classList.toggle('is-negative', v < 0);
      cell.classList.toggle('is-capped', v >= RESIST_SOFT_CAP);
      const head = div('resist-head');
      head.appendChild(icon(dt, { size: 14, cls: `dmg-${dt}` }));
      head.appendChild(span('resist-name', RESIST_LABEL[dt]));
      head.appendChild(span('resist-value', `${Math.round(v)}%`));
      const track = div('resist-track');
      const fill = div('resist-fill');
      const span100 = RESIST_HARD_CAP + 100;
      fill.style.width = `${Math.max(0, Math.min(100, ((eff + 100) / span100) * 100))}%`;
      fill.classList.add(`dmgbg-${dt}`);
      const capMark = div('resist-cap');
      capMark.style.left = `${((RESIST_SOFT_CAP + 100) / span100) * 100}%`;
      add(track, fill, capMark);
      add(cell, head, track);
      tip(
        cell,
        `${RESIST_LABEL[dt]} Resistance`,
        `<p>Reduces incoming ${RESIST_LABEL[dt].toLowerCase()} damage by <b>${Math.round(eff)}%</b>.</p>` +
          `<p class="tt-explain-how">Each point counts in full up to ${RESIST_SOFT_CAP}%. Past that, each point counts for less, and the cut never reaches ${RESIST_HARD_CAP}%. Curses and carried quest relics lower it, so going past ${RESIST_SOFT_CAP}% is not wasted.</p>`
      );
      grid.appendChild(cell);
    }
    s.body.appendChild(grid);
    this.resistBox.appendChild(s.root);
  }
}
