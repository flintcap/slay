/**
 * SLAY — the character sheet.
 *
 * One page that fits the panel without scrolling: the hero's name, level and
 * record on top, the four attributes side by side, the six resistances in one
 * strip, then the derived stats in two columns (Offense; Defense and Utility)
 * with "Your build" on a second tab. Every line explains itself on hover,
 * because "where does this number come from" is the question players actually
 * ask. On a short screen the stats split over three tabs instead (`fitStats`).
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
  Tabs,
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
import { tr, trn, numText } from '../core/I18n';
import { ATTACK_RATE_CAP, BASE_CAST_TIME, CAST_RATE_CAP, DUAL_SWING_RATE, basicRate, handsOf, speedMultiplier, speedReadout } from '../sim/Speed';
import { formHands } from '../data/shifterPower';
import { castsOnly } from '../data/itemBases';

type AttrKey = 'strength' | 'dexterity' | 'vitality' | 'energy';

/** Panel body height (own px) under which the compact layout is used. */
const COMPACT_BELOW = 640;

const ATTRS: AttrKey[] = ['strength', 'dexterity', 'vitality', 'energy'];

const ATTR_BLURB: Record<AttrKey, string> = {
  strength: tr('Raises physical damage and lets you wear heavier armour and weapons. Most melee bases gate on it.'),
  dexterity: tr('Raises attack rating, block chance and critical strike. Bows, daggers and light armour scale with it.'),
  vitality: tr('The only attribute that keeps you alive. Each point adds life directly.'),
  energy: tr('Grows the mana pool and mana regeneration — the fuel for every skill you press.'),
};

/**
 * The speed rows: the true rate as the value, and how it comes about. Gear and
 * skill speed is summed, then counts for less the more there is
 * (`sim/Speed.ts`), so the rate is what to read, not the percent.
 */
function speedRow(key: 'attackSpeed' | 'castSpeed', st: Stats): { text: string; hint: string } {
  const c = save.account.current;
  const r = speedReadout(c?.equipment ?? {}, st.attackSpeed, st.castSpeed);
  const pct = (v: number): string => `${v >= 0 ? '+' : ''}${fmt(Math.round(v))}%`;
  if (key === 'attackSpeed') {
    const pace = r.dual
      ? tr('Your two weapons swing {0} times a second on their own, and two blades take turns, {1} times as often.', numText(r.weaponAps, 2), numText(DUAL_SWING_RATE, 1))
      : tr('Your weapon swings {0} times a second on its own.', numText(r.weaponAps, 2));
    const none = !!c && castsOnly(c.classId, c.equipment.mainHand?.baseId, c.equipment.offHand?.baseId);
    // A Shapeshifter's beast swings the same weapon at its own pace (`FORM_PACE`).
    let beasts = '';
    if (c?.classId === 'shapeshifter') {
      const hands = handsOf(c.equipment);
      const am = speedMultiplier(st.attackSpeed);
      const at = (form: 'cat' | 'wolf' | 'bear'): string => numText(basicRate(formHands(hands, form), am), 2);
      beasts = tr('<p>As a beast the same weapon swings at the beast\'s pace: cat <b>{0}</b>, wolf <b>{1}</b>, bear <b>{2}</b> a second.</p>', at('cat'), at('wolf'), at('bear'));
    }
    return {
      text: tr('{0} a second', numText(r.attackRate, 2)),
      hint: beasts + (none ? tr('<p>A caster\'s weapon makes no basic attack. Attack skills swing <b>{0}</b> times a second.</p>', numText(r.attackRate, 2)) : tr('<p>You make <b>{0}</b> basic attacks a second.</p>', numText(r.attackRate, 2))) + tr('<p class="tt-explain-how">{0} Attack speed from gear and skills: {1}, worth {2} after diminishing returns: each point counts for less the more you have. No one attacks more than {3} times a second. An attack skill takes its own share of a swing.</p>', pace, pct(st.attackSpeed), pct(r.attackGain), numText(ATTACK_RATE_CAP, 1)),
    };
  }
  return {
    text: tr('{0} a second', numText(r.castRate, 2)),
    hint: tr('<p>You cast a usual spell <b>{0}</b> times a second.</p><p class="tt-explain-how">A usual spell takes {1} s before cast speed; some take longer. Cast speed from gear and skills: {2}, worth {3} after diminishing returns: each point counts for less the more you have. No one casts more than {4} times a second.</p>', numText(r.castRate, 2), numText(BASE_CAST_TIME, 2), pct(st.castSpeed), pct(r.castGain), numText(CAST_RATE_CAP, 1)),
  };
}

/** A usual boss stands this much harder to hit than a usual monster of its level (its rank's armour, square-rooted). */
const BOSS_GUARD = Math.sqrt(2.4);

/** Hit chances for the attack rating tooltip, against monsters of the hero's level. */
function hitHint(ar: number): string {
  const guard = usualAttackRating(save.account.current?.level ?? 1);
  const pct = (g: number): string => `${Math.round(hitChance(ar, g) * 100)}%`;
  return tr('<p class="tt-explain-how">Hit chance against a usual monster of your level: <b>{0}</b>. Against a usual boss: <b>{1}</b>.</p>', pct(guard), pct(guard * BOSS_GUARD));
}

const STAT_HOW: Partial<Record<StatKey, string>> = {
  life: tr('Class base + per-level gain + (Vitality x life-per-point) + flat life from gear and passives.'),
  mana: tr('Class base + per-level gain + (Energy x mana-per-point) + flat mana from gear and passives.'),
  lifeRegen: tr('Life restored every second, out of and in combat.'),
  manaRegen: tr('Mana restored every second. Sustain builds live and die on this number.'),
  attackRating: tr('Blows from your weapon (swings, slams, arrows) can miss. The more attack rating you have against a monster\'s guard, the fewer misses; five times its guard never misses. Armoured monsters, elites and bosses guard more. Spells, minions and area blasts always hit. Grows with Dexterity and level.'),
  minDamage: tr('Weapon base damage, scaled by upgrade level, then multiplied by Enhanced Damage.'),
  maxDamage: tr('Weapon base damage, scaled by upgrade level, then multiplied by Enhanced Damage.'),
  critChance: tr('Chance for a hit to roll critical damage instead of normal damage.'),
  critDamage: tr('Bonus damage on a critical hit, on top of the base 150%.'),
  lifeSteal: tr('Fraction of physical damage dealt returned as life.'),
  manaSteal: tr('Fraction of physical damage dealt returned as mana.'),
  defense: tr('Reduces the chance an attack lands at all. Compared against attacker level and attack rating.'),
  blockChance: tr('Chance a shield stops an incoming attack outright. Requires a shield equipped.'),
  damageReduction: tr('Percent taken off every incoming hit, after resistances and defense. Most it can reach: 50%.'),
  enhancedDamage: tr('Multiplies weapon damage. Additive within the pool, so two +40% rolls give +80%.'),
  enhancedDefense: tr('Multiplies armour values from gear.'),
  elementalDamagePct: tr('Multiplies all non-physical damage you deal.'),
  areaDamagePct: tr('Multiplies damage dealt by area-of-effect skills.'),
  moveSpeed: tr('Percentage change to run speed. The most under-rated defensive stat in the game.'),
  magicFind: tr('Improves the odds a drop rolls a higher rarity. Has diminishing returns on the highest tiers.'),
  goldFind: tr('Increases gold dropped by slain monsters.'),
  cooldownReduction: tr('Shortens skill cooldowns multiplicatively.'),
  skillLevels: tr('Adds ranks to every skill you have already invested in.'),
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
  physical: tr('Physical'),
  fire: tr('Fire'),
  cold: tr('Cold'),
  lightning: tr('Lightning'),
  poison: tr('Poison'),
  arcane: tr('Arcane'),
};

type StatView = 'stats' | 'offense' | 'defense' | 'build';

export class CharacterPanel {
  readonly panel: Panel;
  private identity: HTMLDivElement;
  private attrHead: HTMLDivElement;
  private attrBox: HTMLDivElement;
  private colOffense: HTMLDivElement;
  private colDefense: HTMLDivElement;
  private colUtility: HTMLDivElement;
  private resistBox: HTMLDivElement;
  private buildBox: HTMLDivElement;
  private statTabs: Tabs;
  private statArea: HTMLDivElement;
  private wrap: HTMLDivElement;
  private statCols: HTMLDivElement;
  /** Offense beside Defense and Utility when they fit; three tabs when they do not. */
  private split = false;
  private view: StatView = 'stats';

  constructor() {
    this.panel = new Panel({
      id: 'character',
      title: tr('Character'),
      subtitle: tr('Attributes and derived power'),
      icon: 'strength',
      side: 'left',
    });
    this.panel.frame.classList.add('panel-character');

    const wrap = div('char-wrap');
    this.wrap = wrap;
    this.identity = div('char-identity');

    const attrs = div('char-attrsec');
    this.attrHead = div('char-attrhead');
    this.attrBox = div('char-attrs');
    add(attrs, this.attrHead, this.attrBox);

    this.resistBox = div('char-resists');

    this.colOffense = div('char-col');
    this.colDefense = div('char-col');
    this.colUtility = div('char-col');
    this.buildBox = div('char-build');
    this.statCols = div('char-cols');
    const side = div('char-col-stack');
    add(side, this.colDefense, this.colUtility);
    add(this.statCols, this.colOffense, side);
    this.statArea = div('char-statarea');
    add(this.statArea, this.statCols, this.buildBox);
    this.statTabs = new Tabs([], 'stats', (id) => this.showView(id as StatView), 'tabs-char');
    const stats = div('char-stats');
    add(stats, this.statTabs.root, this.statArea);

    add(wrap, this.identity, attrs, this.resistBox, stats);
    this.panel.body.appendChild(wrap);
    this.setTabs();

    events.on('ui:refresh', () => {
      if (this.panel.isOpen) scheduleRefresh(this.boundRefresh);
    });
    events.on('player:levelUp', () => {
      if (this.panel.isOpen) scheduleRefresh(this.boundRefresh);
    });
    window.addEventListener('resize', () => {
      if (this.panel.isOpen) this.fitStats();
    });
  }

  open(): void {
    this.refresh();
    this.panel.open();
    // Laid out now: see whether the stats fit side by side.
    this.fitStats();
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
    this.renderGroup(this.colOffense, tr('Offense'), 'sword', OFFENSE, st);
    this.renderAttack(c, st);
    this.renderGroup(this.colDefense, tr('Defense'), 'shield', DEFENSE, st);
    this.renderGroup(this.colUtility, tr('Utility'), 'sparkle', UTILITY, st);
    this.renderResists(st);
    this.renderBuild(c, st);
    if (this.panel.isOpen) this.fitStats();
  }

  // -- stat tabs -------------------------------------------------------------

  private setTabs(): void {
    const defs = this.split
      ? [
          { id: 'offense', label: tr('Offense'), icon: 'sword' },
          { id: 'defense', label: tr('Defense'), icon: 'shield' },
          { id: 'build', label: tr('Your build'), icon: 'sparkle' },
        ]
      : [
          { id: 'stats', label: tr('Stats'), icon: 'strength' },
          { id: 'build', label: tr('Your build'), icon: 'sparkle' },
        ];
    // Keep the reader on the same page across a switch.
    if (this.split && this.view === 'stats') this.view = 'offense';
    if (!this.split && (this.view === 'offense' || this.view === 'defense')) this.view = 'stats';
    this.statTabs.setTabs(defs, this.view);
    this.showView(this.view);
  }

  private showView(view: StatView): void {
    this.view = view;
    this.statArea.dataset.view = view;
  }

  /**
   * Offense beside Defense and Utility while both columns fit the room under
   * the resistances; on a short screen they take a tab each instead, so the
   * sheet still never scrolls.
   */
  private fitStats(): void {
    // A short screen first drops the run facts and the attribute notes (both
    // still in tooltips and the HUD), then splits the stats over tabs.
    const body = this.panel.body.clientHeight;
    if (body > 0) this.wrap.classList.toggle('is-compact', body < COMPACT_BELOW);
    const room = this.statArea.clientHeight;
    if (room <= 0) return;
    const was = this.split;
    const need = Math.max(this.colOffense.scrollHeight, this.colDefense.scrollHeight + this.colUtility.scrollHeight + 10);
    // Measured side by side; once split, each column alone must still fit to come back.
    if (!this.split && need > room + 1) this.split = true;
    else if (this.split && need <= room - 8) this.split = false;
    if (this.split !== was) this.setTabs();
  }

  // -- identity ------------------------------------------------------------

  private renderIdentity(c: Character, st: Stats): void {
    clear(this.identity);
    const def = classById(c.classId);
    const accent = classAccent(c.classId);
    this.identity.style.setProperty('--accent', accent);

    const crest = div('char-crest');
    crest.innerHTML = classCrestSvg(c.classId, accent, 58);
    const names = div('char-names');
    names.appendChild(div('char-name', c.name));
    names.appendChild(div('char-class', `${def?.title ?? ''} · ${def?.name ?? c.classId}`));

    // Level on a gilt medallion at the right of the name.
    const lvl = div('char-level');
    lvl.appendChild(span('char-level-n', String(c.level)));
    lvl.appendChild(span('char-level-w', tr('LEVEL')));
    const head = div('char-head');
    add(head, crest, names, lvl);
    this.identity.appendChild(head);

    const need = attempt(() => xpForLevel(c.level), 100);
    const track = div('char-xp-track');
    const fill = div('char-xp-fill');
    fill.style.width = `${Math.max(0, Math.min(100, (c.xp / Math.max(1, need)) * 100))}%`;
    track.appendChild(fill);
    track.appendChild(span('char-xp-text', tr('{0} / {1} experience', fmtInt(c.xp), fmtInt(need))));
    this.identity.appendChild(track);

    const facts = div('char-facts');
    facts.appendChild(this.fact(tr('Deepest'), tr('Tier {0}', c.depthRecord), 'descend'));
    facts.appendChild(this.fact(tr('Survived'), duration(c.playtime), 'hourglass'));
    facts.appendChild(this.fact(tr('Gold'), fmtInt(c.gold), 'coin'));
    facts.appendChild(this.fact(tr('Life'), fmt(st.life), 'life'));
    this.identity.appendChild(facts);
  }

  private fact(label: string, value: string, iconName: string): HTMLElement {
    const f = div('char-fact');
    const ic = div('char-fact-i');
    ic.appendChild(icon(iconName, { size: 13 }));
    f.appendChild(ic);
    f.appendChild(span('char-fact-v', value));
    f.appendChild(span('char-fact-l', label));
    return f;
  }

  // -- attributes ----------------------------------------------------------

  private renderAttrs(c: Character, st: Stats): void {
    clear(this.attrHead);
    const hasPoints = c.statPoints > 0;
    const title = div('char-sechd');
    title.appendChild(icon('strength', { size: 13 }));
    title.appendChild(span('char-sectitle', tr('Attributes')));
    title.appendChild(div('section-rule'));
    this.attrHead.appendChild(title);
    const pts = span(`char-points ${hasPoints ? 'is-live' : ''}`.trim());
    pts.appendChild(icon(hasPoints ? 'sparkle' : 'info', { size: 12 }));
    pts.appendChild(span('', hasPoints ? trn(c.statPoints, '{0} point to spend', '{0} points to spend', c.statPoints) : tr('No points to spend')));
    this.attrHead.appendChild(pts);
    if (c.skillPoints > 0) {
      const b = span('char-points-skill', trn(c.skillPoints, '{0} skill point', '{0} skill points', c.skillPoints));
      b.addEventListener('click', () => events.emit('ui:open', { panel: 'skills' }));
      this.attrHead.appendChild(b);
    }

    clear(this.attrBox);
    this.attrBox.classList.toggle('has-points', hasPoints);
    const def = classById(c.classId);
    for (const key of ATTRS) {
      const card = div(`attr-row attr-${key}`);
      const head = div('attr-head');
      head.appendChild(icon(STAT_ICON[key] ?? 'star', { size: 14 }));
      head.appendChild(span('attr-name', STAT_LABEL[key]));
      const base = c.allocated?.[key] ?? 0;
      const total = st[key];
      const value = div('attr-value');
      value.appendChild(span('attr-total', String(Math.round(total))));

      const btn = document.createElement('button');
      btn.className = 'attr-plus';
      btn.type = 'button';
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5.4v13.2M5.4 12h13.2"/></svg>';
      btn.disabled = c.statPoints <= 0;
      btn.title = c.statPoints > 0 ? tr('Spend a point on {0}', STAT_LABEL[key]) : tr('No points to spend');
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
      value.appendChild(btn);

      const derived = div('attr-derived');
      if (key === 'vitality' && def) derived.textContent = tr('+{0} life per point', def.lifePerVit);
      else if (key === 'energy' && def) derived.textContent = tr('+{0} mana per point', def.manaPerEnr);
      else if (key === 'strength') derived.textContent = tr('scales physical damage');
      else derived.textContent = tr('scales attack rating & block');

      add(card, head, value, derived);
      tip(card, STAT_LABEL[key], tr('<p>{0}</p><p class="tt-explain-how">Total {1} — {2} allocated by you, the rest from your class, level and gear.</p>', ATTR_BLURB[key], Math.round(total), base));
      this.attrBox.appendChild(card);
    }
  }

  // -- derived stats -------------------------------------------------------

  private renderGroup(host: HTMLDivElement, title: string, iconName: string, keys: StatKey[], st: Stats): void {
    clear(host);
    const s = section(title, iconName);
    let shown = 0;
    for (const key of keys) {
      const v = st[key];
      const speed = key === 'attackSpeed' || key === 'castSpeed' ? speedRow(key, st) : null;
      if (!v && !speed && key !== 'defense' && key !== 'life' && key !== 'mana' && key !== 'minDamage' && key !== 'maxDamage') continue;
      const isPct = /Pct$|Speed$|Chance$|Damage$|Reduction$|Find$|Steal$/.test(key) && key !== 'minDamage' && key !== 'maxDamage' && key !== 'fireDamage' && key !== 'coldDamage' && key !== 'lightningDamage' && key !== 'poisonDamage' && key !== 'arcaneDamage';
      const text = speed ? speed.text : isPct ? `${fmt(v)}%` : fmt(v);
      // Below the right-click attack, the weapon's own roll is named as the weapon's.
      const label = key === 'minDamage' ? tr('Weapon Min Damage') : key === 'maxDamage' ? tr('Weapon Max Damage') : STAT_LABEL[key];
      const line = statLine(label, text, {
        icon: STAT_ICON[key],
        hint: speed ? speed.hint : (STAT_HOW[key] ? `<p>${STAT_HOW[key]}</p>` : tr('<p>Current value: <b>{0}</b></p>', text)) + (key === 'attackRating' ? hitHint(v) : ''),
        title: label,
      });
      s.body.appendChild(line);
      shown++;
    }
    if (!shown) s.body.appendChild(div('char-empty', tr('Nothing here yet.')));
    host.appendChild(s.root);
  }

  /**
   * The right-click attack, first in Offense: what it hits for with this gear.
   * The weapon's own numbers stay below it, named as the weapon's.
   */
  private renderAttack(c: Character, st: Stats): void {
    const body = this.colOffense.querySelector('.section-body');
    if (!body) return;
    let label = tr('Attack');
    let value = '—';
    let hint = tr('<p>Put a skill on the right mouse button to see what it hits for.</p>');
    const est = attempt(() => estimateAttack(c, st), null);
    if (est?.def) {
      const { def, rank, scale, type } = est;
      label = def.name;
      value = `${fmtInt(Math.round(est.min))}–${fmtInt(Math.round(est.max))}`;
      const crit = Math.max(100, st.critDamage);
      hint =
        tr('<p>Your right-click skill, rank {0}. Each hit lands for <b>{1}</b> {2} damage before the target\'s defences.</p><p class="tt-explain-how">Weapon damage × {3}% skill power, with Enhanced Damage and your elemental adds. A critical hit lands for {4}% of it. About <b>{5}</b> damage a second to one target, crits counted.</p>', rank, value, RESIST_LABEL[type].toLowerCase(), fmt(Math.round(scale * 100)), fmt(crit), fmtInt(Math.round(est.dps)));
    } else if (est) {
      value = `${fmtInt(Math.round(est.min))}–${fmtInt(Math.round(est.max))}`;
      hint =
        tr('<p>Your weapon attack. Each hit lands for <b>{0}</b> physical damage before the target\'s defences.</p><p class="tt-explain-how">About <b>{1}</b> damage a second to one target, crits counted. Drag a skill onto the right mouse button to use it instead.</p>', value, fmtInt(Math.round(est.dps)));
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
    const s = section(tr('Your build'), 'sparkle', 'char-build-section');

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
      dmg.appendChild(div('char-empty', tr('Put a damage skill on your bar to see what it does.')));
    } else {
      const head = div('build-row build-head');
      add(head, span('', tr('Skill')), span('', tr('Each hit')), span('', tr('A second')));
      dmg.appendChild(head);
      for (const e of rows.sort((a, b) => b.dps - a.dps)) {
        const r = div('build-row');
        const name = span('build-name');
        name.appendChild(icon(e.type, { size: 12, cls: `dmg-${e.type}` }));
        name.appendChild(span('', e.def ? `${e.def.name} ${e.rank}` : tr('Weapon attack')));
        add(r, name, span('build-num', `${fmtInt(Math.round(e.min))}–${fmtInt(Math.round(e.max))}`), span('build-num build-dps', fmtInt(Math.round(e.dps))));
        tip(
          r,
          e.def ? e.def.name : tr('Weapon attack'),
          tr('<p>About <b>{0}</b> {1} damage a second to one target, one use every {2} s, crits counted.</p><p class="tt-explain-how">Before the target\'s armour and resistances. Areas, chains and damage over time hit more than one target or keep hurting after, so they do more than this in a crowd.</p>', fmtInt(Math.round(e.dps)), RESIST_LABEL[e.type].toLowerCase(), fmt(Math.round(e.period * 100) / 100)),
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
        tr('{0} blows to fall', RESIST_LABEL[b.type]),
        tr('<p>About <b>{0}</b> ordinary {1} blows of Tier {2} take you from full life to nothing.</p><p class="tt-explain-how">Your life with armour, block, resistance and damage reduction counted. Elites and bosses hit harder.</p>', fmtInt(Math.round(b.n)), RESIST_LABEL[b.type].toLowerCase(), tier),
      );
      guard.appendChild(cell);
    }

    // --- summary --------------------------------------------------------------
    const lines: string[] = [];
    const best = rows[0];
    if (best) lines.push(tr('Most damage: {0}, {1}.', best.def ? best.def.name : tr('your weapon'), RESIST_LABEL[best.type].toLowerCase()));
    const thin = [...blows].sort((a, b) => a.n - b.n)[0];
    const thick = [...blows].sort((a, b) => b.n - a.n)[0];
    if (thin && thick && thick.n > thin.n * 1.5) lines.push(tr('Weakest against {0}, strongest against {1}.', RESIST_LABEL[thin.type].toLowerCase(), RESIST_LABEL[thick.type].toLowerCase()));
    const back: string[] = [];
    if (st.lifeSteal > 0) back.push(tr('{0}% of damage dealt', fmt(Math.round(st.lifeSteal * 10) / 10)));
    if (st.lifeRegen > 0) back.push(tr('{0} a second', fmt(Math.round(st.lifeRegen * 10) / 10)));
    lines.push(back.length ? tr('Life back: {0}.', back.join(' and ')) : tr('No life back from gear: you lean on potions.'));
    if (st.critChance >= 25) lines.push(tr('Crits often: {0}% for {1}%.', Math.round(Math.min(95, st.critChance)), Math.round(Math.max(100, st.critDamage))));
    const summary = div('build-summary');
    for (const l of lines) summary.appendChild(div('build-line', l));

    add(s.body, dmg, div('build-sub', tr('Blows to fall at Tier {0}', tier)), guard, summary);
    this.buildBox.appendChild(s.root);
  }

  private renderResists(st: Stats): void {
    clear(this.resistBox);
    const s = section(tr('Resistances'), 'resist', 'char-resist-section');
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
        tr('{0} Resistance', RESIST_LABEL[dt]),
        tr('<p>Reduces incoming {0} damage by <b>{1}%</b>.</p><p class="tt-explain-how">Each point counts in full up to {2}%. Past that, each point counts for less, and the cut never reaches {3}%. Curses and carried quest relics lower it, so going past {4}% is not wasted.</p>', RESIST_LABEL[dt].toLowerCase(), Math.round(eff), RESIST_SOFT_CAP, RESIST_HARD_CAP, RESIST_SOFT_CAP)
      );
      grid.appendChild(cell);
    }
    s.body.appendChild(grid);
    this.resistBox.appendChild(s.root);
  }
}
