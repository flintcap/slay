/**
 * SLAY — character select and creation.
 *
 * The screen players see after every death, so it has to want to be clicked.
 * It is an overlay on CharSelectScene: the hero stands on the plinth in the
 * middle of the screen, the choices sit in a column on the left, the details
 * of whatever is chosen sit on the right, and the commit controls sit along
 * the bottom.
 *
 * Two modes share the layout. "New" lists the classes and ends in a name, a
 * difficulty and a Begin button. "Roster" lists the account's living
 * characters, shows the selected one in their real gear, and ends in Play or
 * Retire. The scene is told what to put on the plinth through the bus.
 */

import type { CharClassDef, CharClassId, Character } from '../types';
import type { Engine } from '../core/Engine';
import { events } from '../core/Events';
import { save } from '../core/Save';
import { createCharacter, startingSkillFor } from '../sim/Character';
import { computeStats } from '../sim/Stats';
import { DIFFICULTIES, DEFAULT_DIFFICULTY, type DifficultyId } from '../data/difficulties';
import { STARTING_SKILL_HINTS, CLASS_TAGLINES } from '../data/classes';
import { Random, randomSeed } from '../core/RNG';
import { checkName, type NameCheck } from './names';
import { menuKey } from './MenuNav';
import { skillIconUri } from '../art/Icons';
import {
  Panel,
  div,
  span,
  icon,
  classList,
  classAccent,
  classCrestSvg,
  treeById,
  skillById,
  classById,
  fmtInt,
  duration,
  attempt,
  keycap,
  tip,
} from './Widgets';

const NAME_PARTS_A = [
  'Vor', 'Kael', 'Mor', 'Sil', 'Bran', 'Tyr', 'Dral', 'Ash', 'Eir', 'Gor',
  'Nyx', 'Rav', 'Sel', 'Thal', 'Ur', 'Vex', 'Wren', 'Zar', 'Cai', 'Fen',
];
const NAME_PARTS_B = [
  'wyn', 'drek', 'ath', 'ora', 'ric', 'ael', 'mir', 'oth', 'ska', 'ven',
  'ish', 'gar', 'une', 'eth', 'lan', 'dus', 'ira', 'orn', 'wick', 'ash',
];

function rollName(rng: Random): string {
  return rng.pick(NAME_PARTS_A) + rng.pick(NAME_PARTS_B);
}

/** Rough playstyle copy per class, keyed off the class id. */
const PLAYSTYLE: Record<CharClassId, string> = {
  warden: 'Stand in the middle of it. Bleed them out, soak the hits, and never give ground.',
  pyromancer: 'Delete packs before they close. Enormous burst, paper-thin if a single elite reaches you.',
  shadowblade: 'Strike from outside their awareness. Crits, poison stacks, and a dodge on a short leash.',
  stormcaller: 'Never stop moving. Chain lightning between targets while you blink across the room.',
  revenant: 'Bring a crowd. Your dead do the work while you drain the living to stay standing.',
  ranger: 'Open at the far wall and keep it there. Traps behind you, arrows ahead, and a step back for every step they take.',
};

const ROLE: Record<CharClassId, string> = {
  warden: 'Bulwark · Bleed',
  pyromancer: 'Fire · Arcane',
  shadowblade: 'Crit · Poison',
  stormcaller: 'Lightning · Mobility',
  revenant: 'Summons · Drain',
  ranger: 'Bow · Traps',
};

/** How much there is to juggle, 1 to 3. Shown as pips so a first-timer can pick. */
const COMPLEXITY: Record<CharClassId, number> = {
  warden: 1,
  ranger: 2,
  pyromancer: 2,
  revenant: 3,
  stormcaller: 3,
  shadowblade: 3,
};

type Mode = 'new' | 'roster';

export class CharSelectPanel {
  readonly panel: Panel;
  private engine: Engine;
  private rng = new Random(randomSeed());

  private mode: Mode = 'new';
  private selectedClass: CharClassId = 'warden';
  private selectedChar: string | null = null;
  private difficulty: DifficultyId = DEFAULT_DIFFICULTY;

  // Layout
  private sub: HTMLDivElement;
  private tabs: HTMLDivElement;
  private tabNew: HTMLButtonElement;
  private tabRoster: HTMLButtonElement;
  private list: HTMLDivElement;
  private detail: HTMLDivElement;
  private bottom: HTMLDivElement;

  // Creation controls, built once so typing is never interrupted by a re-render.
  private createBar: HTMLDivElement;
  private nameInput: HTMLInputElement;
  private nameMsg: HTMLDivElement;
  private difRow: HTMLDivElement;
  private difCards = new Map<DifficultyId, HTMLButtonElement>();
  private beginBtn: HTMLButtonElement;
  private beginLabel: HTMLSpanElement;

  // Roster controls.
  private rosterBar: HTMLDivElement;
  private playBtn: HTMLButtonElement;
  private retireBtn: HTMLButtonElement;
  private retireArmed = false;

  constructor(engine: Engine) {
    this.engine = engine;
    this.panel = new Panel({
      id: 'charSelect',
      title: '',
      fullscreen: true,
      closable: false,
      draggable: false,
      className: 'panel-charselect csx',
    });
    this.panel.header.style.display = 'none';

    const root = div('csx-root');
    root.appendChild(div('csx-shade'));

    // --- top bar ------------------------------------------------------------
    const top = div('csx-top');
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'csx-back';
    back.append(icon('chevronLeft', { size: 14 }), span('', 'Title'), keycap('Esc'));
    back.addEventListener('click', () => {
      events.emit('sfx', { id: 'ui.click' });
      void this.engine.goTo('title');
    });

    const heading = div('csx-heading');
    heading.appendChild(div('csx-title', 'Choose Your Ruin'));
    this.sub = div('csx-sub');
    heading.appendChild(this.sub);

    this.tabs = div('csx-tabs');
    this.tabRoster = this.tabButton('Your Characters', () => this.setMode('roster'));
    this.tabNew = this.tabButton('New Character', () => this.setMode('new'));
    this.tabs.append(this.tabRoster, this.tabNew);

    const fallen = document.createElement('button');
    fallen.type = 'button';
    fallen.className = 'csx-back csx-fallen';
    fallen.append(icon('skull', { size: 13 }), span('', 'The Fallen'));
    fallen.addEventListener('click', () => events.emit('ui:open', { panel: 'memorial' }));

    top.append(back, heading, fallen);
    root.appendChild(top);
    root.appendChild(this.tabs);

    // --- columns ------------------------------------------------------------
    this.list = div('csx-list');
    this.detail = div('csx-detail');
    root.append(this.list, this.detail);

    root.appendChild(div('csx-drag', 'Drag to turn'));

    // --- bottom: creation ---------------------------------------------------
    this.bottom = div('csx-bottom');

    this.createBar = div('csx-create');
    const difBox = div('csx-field');
    difBox.appendChild(div('csx-label', 'Difficulty'));
    this.difRow = div('csx-difrow');
    for (const d of DIFFICULTIES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'csx-dif';
      b.style.setProperty('--dc', '#' + d.color.toString(16).padStart(6, '0'));
      b.append(span('csx-dif-pips', '◆'.repeat(Math.min(5, d.rank))), span('csx-dif-name', d.name));
      b.addEventListener('click', () => this.setDifficulty(d.id));
      tip(
        b,
        d.name,
        `<p><i>${esc(d.blurb)}</i></p><p>${esc(d.guidance)}</p>` +
          (d.pros.length ? `<p style="color:var(--good)">${d.pros.map((x) => '+ ' + esc(x)).join('<br>')}</p>` : '') +
          (d.cons.length ? `<p style="color:var(--bad)">${d.cons.map((x) => '- ' + esc(x)).join('<br>')}</p>` : ''),
      );
      this.difCards.set(d.id, b);
      this.difRow.appendChild(b);
    }
    difBox.appendChild(this.difRow);

    const nameBox = div('csx-field csx-namefield');
    nameBox.appendChild(div('csx-label', 'Name'));
    const nameRow = div('csx-name');
    this.nameInput = document.createElement('input');
    this.nameInput.type = 'text';
    this.nameInput.maxLength = 20;
    this.nameInput.spellcheck = false;
    this.nameInput.autocomplete = 'off';
    this.nameInput.setAttribute('aria-label', 'Character name');
    this.nameInput.value = rollName(this.rng);
    this.nameInput.addEventListener('input', () => this.validate());
    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.begin();
      else if (e.key === 'Escape') this.nameInput.blur();
      e.stopPropagation();
    });
    const dice = document.createElement('button');
    dice.type = 'button';
    dice.className = 'csx-dice';
    dice.title = 'Roll a new name';
    dice.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.3" fill="currentColor"/><circle cx="15" cy="15" r="1.3" fill="currentColor"/><circle cx="15" cy="9" r="1.3" fill="currentColor"/><circle cx="9" cy="15" r="1.3" fill="currentColor"/></svg>';
    dice.addEventListener('click', () => {
      this.nameInput.value = rollName(this.rng);
      dice.classList.remove('is-rolling');
      void dice.offsetWidth;
      dice.classList.add('is-rolling');
      events.emit('sfx', { id: 'ui.click' });
      this.validate();
    });
    nameRow.append(this.nameInput, dice);
    nameBox.appendChild(nameRow);
    this.nameMsg = div('csx-namemsg');
    nameBox.appendChild(this.nameMsg);

    this.beginBtn = document.createElement('button');
    this.beginBtn.type = 'button';
    this.beginBtn.className = 'csx-go';
    this.beginLabel = span('csx-go-label', 'Begin');
    this.beginBtn.append(this.beginLabel, span('csx-go-sub', 'Descend into the town'));
    this.beginBtn.addEventListener('click', () => this.begin());

    this.createBar.append(difBox, nameBox, this.beginBtn);

    // --- bottom: roster -----------------------------------------------------
    this.rosterBar = div('csx-create csx-rosterbar');
    this.retireBtn = document.createElement('button');
    this.retireBtn.type = 'button';
    this.retireBtn.className = 'csx-retire';
    this.retireBtn.addEventListener('click', () => this.retire());
    this.playBtn = document.createElement('button');
    this.playBtn.type = 'button';
    this.playBtn.className = 'csx-go';
    this.playBtn.append(span('csx-go-label', 'Play'), span('csx-go-sub', 'Return to town'));
    this.playBtn.addEventListener('click', () => this.play());
    this.rosterBar.append(this.retireBtn, this.playBtn);

    this.bottom.append(this.createBar, this.rosterBar);
    root.appendChild(this.bottom);

    this.panel.body.appendChild(root);

    window.addEventListener('keydown', this.onKey);
    this.setDifficulty(DEFAULT_DIFFICULTY);
  }

  private tabButton(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'csx-tab';
    b.appendChild(span('csx-tab-label', label));
    b.addEventListener('click', () => {
      events.emit('sfx', { id: 'ui.tab' });
      onClick();
    });
    return b;
  }

  // -- lifecycle -----------------------------------------------------------

  open(): void {
    // The scene announces itself and UIRoot opens the screen on scene change,
    // so this is routinely called twice. Only the first one counts.
    if (this.panel.isOpen) return;
    const roster = save.roster;
    // Resuming someone is the more common action once you have anyone.
    this.mode = roster.length ? 'roster' : 'new';
    if (this.selectedChar && !roster.some((c) => c.id === this.selectedChar)) this.selectedChar = null;
    if (!this.selectedChar) this.selectedChar = save.account.current?.id ?? roster[0]?.id ?? null;
    if (!this.nameInput.value.trim()) this.nameInput.value = rollName(this.rng);
    this.retireArmed = false;
    this.render();
    this.panel.open();
    this.announce();
  }

  close(): void {
    this.panel.close();
  }

  get isOpen(): boolean {
    return this.panel.isOpen;
  }

  // -- state ---------------------------------------------------------------

  private setMode(mode: Mode): void {
    if (mode === 'roster' && save.roster.length === 0) return;
    if (this.mode === mode) return;
    this.mode = mode;
    this.retireArmed = false;
    this.render();
    this.announce();
  }

  private selectClass(id: CharClassId): void {
    if (this.selectedClass === id && this.mode === 'new') return;
    this.selectedClass = id;
    this.renderList();
    this.renderDetail();
    this.syncBegin();
    this.announce();
  }

  private selectChar(id: string): void {
    if (this.selectedChar === id) return;
    this.selectedChar = id;
    this.retireArmed = false;
    this.renderList();
    this.renderDetail();
    this.syncRoster();
    this.announce();
  }

  /** Tell the scene what to put on the plinth. */
  private announce(): void {
    if (this.mode === 'roster' && this.selectedChar) {
      events.emit('ui:open', { panel: `char:${this.selectedChar}` });
    } else {
      events.emit('ui:open', { panel: `class:${this.selectedClass}` });
    }
  }

  private setDifficulty(id: DifficultyId): void {
    if (this.difficulty !== id) events.emit('sfx', { id: 'ui.click' });
    this.difficulty = id;
    for (const [key, el] of this.difCards) el.classList.toggle('is-on', key === id);
  }

  // -- render --------------------------------------------------------------

  private render(): void {
    const roster = save.roster;
    this.panel.root.dataset.mode = this.mode;
    this.tabs.style.display = roster.length ? '' : 'none';
    this.tabRoster.classList.toggle('is-on', this.mode === 'roster');
    this.tabNew.classList.toggle('is-on', this.mode === 'new');
    this.tabRoster.dataset.count = String(roster.length);
    this.sub.textContent =
      this.mode === 'roster'
        ? 'Take up an old torch. Every one of them shares the same vault.'
        : roster.length
          ? 'Forge another. The vault and the memorial are shared.'
          : 'One life. One build. The vault is all that follows you down.';
    this.createBar.style.display = this.mode === 'new' ? '' : 'none';
    this.rosterBar.style.display = this.mode === 'roster' ? '' : 'none';
    this.renderList();
    this.renderDetail();
    this.validate();
    this.syncRoster();
  }

  private renderList(): void {
    this.list.replaceChildren();
    if (this.mode === 'new') {
      this.list.appendChild(div('csx-label', 'Class'));
      classList().forEach((def, i) => this.list.appendChild(this.classRow(def, i)));
    } else {
      this.list.appendChild(div('csx-label', 'The living'));
      save.roster.forEach((c, i) => this.list.appendChild(this.charRow(c, i)));
    }
  }

  private classRow(def: CharClassDef, i: number): HTMLButtonElement {
    const accent = classAccent(def.id);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'csx-row';
    row.style.setProperty('--accent', accent);
    row.style.setProperty('--i', String(i));
    row.classList.toggle('is-on', def.id === this.selectedClass);
    const crest = div('csx-row-crest');
    crest.innerHTML = classCrestSvg(def.id, accent, 38);
    const text = div('csx-row-text');
    text.append(div('csx-row-name', def.name), div('csx-row-meta', ROLE[def.id] ?? def.title));
    row.append(crest, text, complexityPips(COMPLEXITY[def.id] ?? 2));
    row.addEventListener('click', () => this.selectClass(def.id));
    row.addEventListener('pointerenter', () => events.emit('sfx', { id: 'ui.hover' }));
    return row;
  }

  private charRow(c: Character, i: number): HTMLButtonElement {
    const accent = classAccent(c.classId);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'csx-row';
    row.style.setProperty('--accent', accent);
    row.style.setProperty('--i', String(i));
    row.classList.toggle('is-on', c.id === this.selectedChar);
    const crest = div('csx-row-crest');
    crest.innerHTML = classCrestSvg(c.classId, accent, 38);
    const text = div('csx-row-text');
    const cls = classById(c.classId)?.name ?? c.classId;
    text.append(div('csx-row-name', c.name), div('csx-row-meta', `Level ${c.level} ${cls}`));
    const lvl = div('csx-row-lvl', String(c.level));
    row.append(crest, text, lvl);
    row.addEventListener('click', () => this.selectChar(c.id));
    row.addEventListener('dblclick', () => this.play());
    row.addEventListener('pointerenter', () => events.emit('sfx', { id: 'ui.hover' }));
    return row;
  }

  private renderDetail(): void {
    this.detail.replaceChildren();
    // Re-trigger the entrance so a new selection visibly lands.
    this.detail.classList.remove('is-in');
    void this.detail.offsetWidth;
    this.detail.classList.add('is-in');
    if (this.mode === 'roster') {
      const c = save.roster.find((x) => x.id === this.selectedChar);
      if (c) this.characterDetail(c);
      return;
    }
    const def = classById(this.selectedClass);
    if (def) this.classDetail(def);
  }

  private classDetail(def: CharClassDef): void {
    const accent = classAccent(def.id);
    const d = this.detail;
    d.style.setProperty('--accent', accent);

    d.appendChild(div('csx-kicker', ROLE[def.id] ?? def.title));
    d.appendChild(div('csx-name-big', def.name));
    d.appendChild(div('csx-epithet', def.title));
    const lines = CLASS_TAGLINES[def.id];
    if (lines?.length) d.appendChild(div('csx-quote', `“${lines[0]}”`));
    d.appendChild(div('csx-blurb', PLAYSTYLE[def.id] ?? def.blurb));

    // Attributes, plus the life and mana a fresh character really starts with.
    const attrs = div('csx-attrs');
    const max = 40;
    const rows: Array<[string, number]> = [
      ['Strength', def.base.strength],
      ['Dexterity', def.base.dexterity],
      ['Vitality', def.base.vitality],
      ['Energy', def.base.energy],
    ];
    for (const [label, value] of rows) {
      const r = div('csx-attr');
      const bar = div('csx-attr-bar');
      const fill = div('csx-attr-fill');
      fill.style.setProperty('--w', `${Math.min(100, (value / max) * 100)}%`);
      bar.appendChild(fill);
      r.append(span('csx-attr-l', label), bar, span('csx-attr-v', String(value)));
      attrs.appendChild(r);
    }
    d.appendChild(attrs);

    const sample = attempt(() => createCharacter(def.name, def.id, new Random(1)), null);
    const st = sample ? attempt(() => computeStats(sample), null) : null;
    if (st) {
      const vit = div('csx-vitals');
      vit.append(
        vital('life', Math.round(st.life), 'Life'),
        vital('mana', Math.round(st.mana), 'Mana'),
        vital('def', Math.round(st.defense), 'Defense'),
      );
      d.appendChild(vit);
    }

    // The opening skill, then what the class grows into first.
    const starter = startingSkillFor(def.id);
    const sk = starter ? skillById(starter) : null;
    if (sk) {
      d.appendChild(div('csx-label', 'Opening skill'));
      const card = div('csx-skill');
      const img = document.createElement('img');
      img.className = 'csx-skill-ico';
      img.alt = '';
      img.draggable = false;
      img.src = attempt(() => skillIconUri(sk.id, sk.effect, sk.damageType, sk.targeting === 'passive', sk.icon), '');
      const body = div('csx-skill-body');
      const head = div('csx-skill-head');
      head.append(span('csx-skill-name', sk.name), span('csx-skill-key', 'Right click'));
      body.append(head, div('csx-skill-desc', sk.desc));
      card.append(img, body);
      d.appendChild(card);
    }
    const early = (STARTING_SKILL_HINTS[def.id] ?? []).filter((id) => id !== starter).slice(0, 4);
    if (early.length) {
      d.appendChild(div('csx-label', 'Grows into'));
      const row = div('csx-early');
      for (const id of early) {
        const s = skillById(id);
        if (!s) continue;
        const cell = div('csx-early-cell');
        const img = document.createElement('img');
        img.alt = '';
        img.draggable = false;
        img.src = attempt(() => skillIconUri(s.id, s.effect, s.damageType, s.targeting === 'passive', s.icon), '');
        cell.append(img, span('csx-early-name', s.name));
        tip(cell, s.name, `<p>${esc(s.desc)}</p>`);
        row.appendChild(cell);
      }
      d.appendChild(row);
    }

    const trees = div('csx-trees');
    for (const t of def.trees) trees.appendChild(span('csx-tree', treeById(t)?.name ?? t));
    d.appendChild(trees);
  }

  private characterDetail(c: Character): void {
    const accent = classAccent(c.classId);
    const d = this.detail;
    d.style.setProperty('--accent', accent);
    const cls = classById(c.classId);
    const dif = DIFFICULTIES.find((x) => x.id === c.difficulty);

    d.appendChild(div('csx-kicker', `${cls?.name ?? c.classId} · ${dif?.name ?? 'Normal'}`));
    d.appendChild(div('csx-name-big', c.name));
    d.appendChild(div('csx-epithet', `Level ${c.level} ${cls?.title ?? ''}`.trim()));

    const facts = div('csx-facts');
    const fact = (v: string, l: string): void => {
      const f = div('csx-fact');
      f.append(div('csx-fact-v', v), div('csx-fact-l', l));
      facts.appendChild(f);
    };
    fact(c.depthRecord > 0 ? String(c.depthRecord) : '-', 'Deepest');
    fact(duration(c.playtime), 'Played');
    fact(fmtInt(c.gold), 'Gold');
    const unspent = c.statPoints + c.skillPoints;
    fact(String(unspent), 'Unspent points');
    d.appendChild(facts);

    const st = attempt(() => computeStats(c), null);
    if (st) {
      const vit = div('csx-vitals');
      vit.append(
        vital('life', Math.round(st.life), 'Life'),
        vital('mana', Math.round(st.mana), 'Mana'),
        vital('def', Math.round(st.defense), 'Defense'),
      );
      d.appendChild(vit);
    }

    // What they are wearing, by rarity, so a strong character looks strong.
    const worn = Object.values(c.equipment).filter((x): x is NonNullable<typeof x> => !!x);
    if (worn.length) {
      d.appendChild(div('csx-label', 'Equipped'));
      const list = div('csx-gear');
      for (const item of worn.slice(0, 10)) {
        const g = span(`csx-gear-item r-${item.rarity}`, item.name);
        list.appendChild(g);
      }
      d.appendChild(list);
    }
  }

  // -- validation and commit -------------------------------------------------

  private validate(): NameCheck {
    const res = checkName(this.nameInput.value, save.roster, save.account.fallen);
    this.nameMsg.textContent = res.message;
    this.nameMsg.dataset.tone = res.tone;
    this.nameInput.parentElement?.classList.toggle('is-bad', !res.ok);
    this.syncBegin(res);
    return res;
  }

  private syncBegin(res?: NameCheck): void {
    const check = res ?? checkName(this.nameInput.value, save.roster, save.account.fallen);
    const def = classById(this.selectedClass);
    this.beginLabel.textContent = def ? `Begin as ${def.name}` : 'Begin';
    this.beginBtn.disabled = !check.ok;
  }

  private syncRoster(): void {
    const c = save.roster.find((x) => x.id === this.selectedChar);
    this.playBtn.disabled = !c;
    this.retireBtn.replaceChildren(
      icon('trash', { size: 13 }),
      span('', this.retireArmed ? `Retire ${c?.name ?? ''} forever?` : 'Retire'),
    );
    this.retireBtn.classList.toggle('is-armed', this.retireArmed);
  }

  private begin(): void {
    if (this.mode !== 'new') return;
    const check = this.validate();
    if (!check.ok) {
      events.emit('sfx', { id: 'ui.error' });
      this.nameInput.parentElement?.classList.remove('shake');
      void this.nameInput.offsetWidth;
      this.nameInput.parentElement?.classList.add('shake');
      this.nameInput.focus();
      return;
    }
    const created = attempt(
      () => createCharacter(check.name, this.selectedClass, new Random(randomSeed()), this.difficulty),
      null,
    );
    if (!created) {
      events.emit('toast', { text: 'Could not forge that character.', kind: 'bad' });
      return;
    }
    save.setCharacter(created);
    events.emit('sfx', { id: 'ui.select' });
    events.emit('toast', { text: `${created.name} takes up the torch.`, kind: 'epic' });
    this.nameInput.value = '';
    this.panel.close();
    void this.engine.goTo('town');
  }

  private play(): void {
    if (this.mode !== 'roster' || !this.selectedChar) return;
    if (!save.selectCharacter(this.selectedChar)) return;
    events.emit('sfx', { id: 'ui.select' });
    this.panel.close();
    void this.engine.goTo('town');
  }

  /** Retiring is deliberate and irreversible, so it asks on the button itself. */
  private retire(): void {
    const id = this.selectedChar;
    if (!id) return;
    if (!this.retireArmed) {
      this.retireArmed = true;
      events.emit('sfx', { id: 'ui.error' });
      this.syncRoster();
      return;
    }
    save.deleteCharacter(id);
    this.retireArmed = false;
    this.selectedChar = save.roster[0]?.id ?? null;
    if (!this.selectedChar) this.mode = 'new';
    this.render();
    this.announce();
  }

  // -- keyboard --------------------------------------------------------------

  private onKey = (e: KeyboardEvent): void => {
    if (!this.panel.isOpen) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (document.querySelector('.modal-wrap.is-open')) return;
    if (document.querySelector('.panel-wrap.is-open:not(.csx)')) return;
    let handled = true;
    // Menu keys go through the rebinding like every other key.
    const code = menuKey(e);
    switch (code) {
      case 'ArrowUp':
      case 'ArrowDown': {
        const dir = code === 'ArrowUp' ? -1 : 1;
        if (this.mode === 'new') {
          const ids = classList().map((c) => c.id);
          const i = ids.indexOf(this.selectedClass);
          this.selectClass(ids[(i + dir + ids.length) % ids.length]!);
        } else {
          const ids = save.roster.map((c) => c.id);
          if (!ids.length) break;
          const i = Math.max(0, ids.indexOf(this.selectedChar ?? ''));
          this.selectChar(ids[(i + dir + ids.length) % ids.length]!);
        }
        events.emit('sfx', { id: 'ui.hover' });
        break;
      }
      case 'ArrowLeft':
      case 'ArrowRight': {
        if (this.mode !== 'new') break;
        const dir = code === 'ArrowLeft' ? -1 : 1;
        const ids = DIFFICULTIES.map((x) => x.id);
        const i = ids.indexOf(this.difficulty);
        const n = i + dir;
        if (n >= 0 && n < ids.length) this.setDifficulty(ids[n]!);
        break;
      }
      case 'Tab':
        if (!save.roster.length) {
          handled = false;
          break;
        }
        this.setMode(this.mode === 'new' ? 'roster' : 'new');
        events.emit('sfx', { id: 'ui.tab' });
        break;
      case 'Enter':
      case 'NumpadEnter':
        if (e.repeat) break;
        if (this.mode === 'new') this.begin();
        else this.play();
        break;
      case 'KeyN':
        if (this.mode !== 'new') break;
        this.nameInput.focus();
        this.nameInput.select();
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
}

function complexityPips(n: number): HTMLElement {
  const d = div('csx-row-cx');
  d.title = ['', 'Straightforward', 'Some juggling', 'Demanding'][n] ?? '';
  for (let i = 1; i <= 3; i++) d.appendChild(span(i <= n ? 'on' : ''));
  return d;
}

function vital(kind: string, value: number, label: string): HTMLElement {
  const v = div(`csx-vital ${kind}`);
  v.append(div('csx-vital-v', fmtInt(value)), div('csx-vital-l', label));
  return v;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}
