/**
 * SLAY — class selection.
 *
 * The screen players see after every death, so it has to want to be clicked:
 * five art-directed cards with their own accent colour and crest, a stat
 * preview, the three skill-tree names, and the memorial wall of everyone this
 * account has already lost.
 */

import type { CharClassDef, CharClassId } from '../types';
import type { Engine } from '../core/Engine';
import { events } from '../core/Events';
import { save } from '../core/Save';
import { createCharacter } from '../sim/Character';
import { DIFFICULTIES, DEFAULT_DIFFICULTY, type DifficultyId } from '../data/difficulties';
import { Random, randomSeed } from '../core/RNG';
import {
  Panel,
  Button,
  add,
  clear,
  div,
  span,
  icon,
  classList,
  classAccent,
  classCrestSvg,
  treeById,
  fmtInt,
  timeAgo,
  classById,
  emptyState,
  attempt,
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
  const a = rng.pick(NAME_PARTS_A);
  const b = rng.pick(NAME_PARTS_B);
  return a + b;
}

/** Rough playstyle copy per class, keyed off the class id. */
const PLAYSTYLE: Record<CharClassId, string> = {
  warden: 'Stand in the middle of it. Bleed them out, soak the hits, and never give ground.',
  pyromancer: 'Delete packs before they close. Enormous burst, paper-thin if a single elite reaches you.',
  shadowblade: 'Strike from outside their awareness. Crits, poison stacks, and a dodge on a short leash.',
  stormcaller: 'Never stop moving. Chain lightning between targets while you blink across the room.',
  revenant: 'Bring a crowd. Your dead do the work while you drain the living to stay standing.',
};

const ROLE: Record<CharClassId, string> = {
  warden: 'Bulwark · Bleed',
  pyromancer: 'Fire · Arcane',
  shadowblade: 'Crit · Poison',
  stormcaller: 'Lightning · Mobility',
  revenant: 'Summons · Drain',
};

export class CharSelectPanel {
  readonly panel: Panel;
  private engine: Engine;
  private cards = new Map<CharClassId, HTMLDivElement>();
  private selected: CharClassId | null = null;
  private nameInput: HTMLInputElement;
  private difficulty: DifficultyId = DEFAULT_DIFFICULTY;
  private difficultyCards = new Map<DifficultyId, HTMLDivElement>();
  private difficultyDetail!: HTMLDivElement;
  private memorialList: HTMLDivElement;
  private beginBtn: Button;
  private rng = new Random(randomSeed());

  constructor(engine: Engine) {
    this.engine = engine;
    this.panel = new Panel({
      id: 'charSelect',
      title: '',
      fullscreen: true,
      closable: false,
      draggable: false,
      className: 'panel-charselect',
    });
    this.panel.header.style.display = 'none';

    const wrap = div('cs-wrap');

    const head = div('cs-head');
    head.appendChild(div('cs-title', 'Choose Your Ruin'));
    head.appendChild(div('cs-sub', 'One life. One build. The vault is all that follows you down.'));
    wrap.appendChild(head);

    const body = div('cs-body');
    const cards = div('cs-cards');
    for (const def of classList()) cards.appendChild(this.buildCard(def));
    body.appendChild(cards);

    // --- side rail --------------------------------------------------------
    const side = div('cs-side');

    // --- difficulty ------------------------------------------------------
    const difbox = div('cs-difbox');
    difbox.appendChild(div('goldbank-label', 'Choose your difficulty'));
    const difRow = div('cs-difrow');
    for (const d of DIFFICULTIES) {
      const card = div('cs-difcard');
      card.dataset.id = d.id;
      card.style.setProperty('--dc', '#' + d.color.toString(16).padStart(6, '0'));
      card.appendChild(span('cs-difpip', String(d.rank)));
      card.appendChild(span('cs-difname', d.name));
      card.title = d.guidance;
      card.addEventListener('click', () => this.setDifficulty(d.id));
      this.difficultyCards.set(d.id, card);
      difRow.appendChild(card);
    }
    difbox.appendChild(difRow);
    this.difficultyDetail = div('cs-difdetail');
    difbox.appendChild(this.difficultyDetail);
    side.appendChild(difbox);

    const namebox = div('cs-namebox');
    namebox.appendChild(div('goldbank-label', 'Name your character'));
    const nameRow = div('cs-nameinput');
    this.nameInput = document.createElement('input');
    this.nameInput.type = 'text';
    this.nameInput.maxLength = 16;
    this.nameInput.spellcheck = false;
    this.nameInput.value = rollName(this.rng);
    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.begin();
      e.stopPropagation();
    });
    const dice = document.createElement('button');
    dice.type = 'button';
    dice.className = 'iconbtn';
    dice.title = 'Roll a new name';
    dice.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.3" fill="currentColor"/><circle cx="15" cy="15" r="1.3" fill="currentColor"/><circle cx="15" cy="9" r="1.3" fill="currentColor"/><circle cx="9" cy="15" r="1.3" fill="currentColor"/></svg>';
    dice.addEventListener('click', () => {
      this.nameInput.value = rollName(this.rng);
    });
    add(nameRow, this.nameInput, dice);
    namebox.appendChild(nameRow);

    this.beginBtn = new Button({
      label: 'Begin the Descent',
      variant: 'primary',
      icon: 'descend',
      wide: true,
      onClick: () => this.begin(),
    });
    this.beginBtn.root.style.marginTop = '13px';
    namebox.appendChild(this.beginBtn.root);
    side.appendChild(namebox);

    const memorial = div('cs-memorial');
    const mhd = div('section-hd');
    mhd.appendChild(icon('skull', { size: 13 }));
    mhd.appendChild(span('section-title', 'The Fallen'));
    mhd.appendChild(div('section-rule'));
    memorial.appendChild(mhd);
    this.memorialList = div('cs-memorial-list');
    memorial.appendChild(this.memorialList);
    side.appendChild(memorial);
    this.setDifficulty(DEFAULT_DIFFICULTY);

    body.appendChild(side);
    wrap.appendChild(body);
    this.panel.body.appendChild(wrap);
  }

  // -- cards ---------------------------------------------------------------

  private buildCard(def: CharClassDef): HTMLDivElement {
    const accent = classAccent(def.id);
    const card = div('cs-card');
    card.style.setProperty('--accent', accent);

    const crest = div('cs-crest');
    crest.innerHTML = classCrestSvg(def.id, accent, 88);
    card.appendChild(crest);

    card.appendChild(div('cs-name', def.name));
    card.appendChild(div('cs-role', ROLE[def.id] ?? def.title));
    card.appendChild(div('cs-blurb', PLAYSTYLE[def.id] ?? def.blurb));

    const stats = div('cs-stats');
    const maxAttr = Math.max(def.base.strength, def.base.dexterity, def.base.vitality, def.base.energy, 1);
    const rows: Array<[string, number]> = [
      ['STR', def.base.strength],
      ['DEX', def.base.dexterity],
      ['VIT', def.base.vitality],
      ['ENR', def.base.energy],
    ];
    for (const [label, value] of rows) {
      const r = div('cs-statrow');
      r.appendChild(span('', label));
      const bar = div('cs-statbar');
      const fill = div('cs-statfill');
      fill.style.width = `${(value / maxAttr) * 100}%`;
      bar.appendChild(fill);
      r.appendChild(bar);
      r.appendChild(span('cs-statv', String(value)));
      stats.appendChild(r);
    }
    card.appendChild(stats);

    const trees = div('cs-trees');
    for (const t of def.trees) {
      trees.appendChild(div('cs-tree', `◆ ${treeById(t)?.name ?? prettify(t)}`));
    }
    card.appendChild(trees);

    card.addEventListener('click', () => this.select(def.id));
    card.addEventListener('pointerenter', () => events.emit('sfx', { id: 'ui.hover' }));

    this.cards.set(def.id, card);
    return card;
  }

  private select(id: CharClassId): void {
    if (this.selected === id) return;
    this.selected = id;
    for (const [cid, card] of this.cards) card.classList.toggle('is-selected', cid === id);
    // The 3D scene listens for this and swaps the model on the plinth.
    events.emit('ui:open', { panel: `class:${id}` });
    events.emit('sfx', { id: 'ui.select' });
    const def = classById(id);
    if (def) this.beginBtn.setLabel(`Begin as ${def.name}`);
  }

  // -- lifecycle -----------------------------------------------------------

  open(): void {
    this.renderMemorial();
    if (!this.selected) {
      const first = classList()[0];
      if (first) this.select(first.id);
    }
    if (!this.nameInput.value.trim()) this.nameInput.value = rollName(this.rng);
    this.panel.open();
  }

  close(): void {
    this.panel.close();
  }

  get isOpen(): boolean {
    return this.panel.isOpen;
  }

  private renderMemorial(): void {
    clear(this.memorialList);
    const fallen = save.account.fallen;
    if (!fallen.length) {
      this.memorialList.appendChild(emptyState('No graves yet. This is your first descent.', 'skull'));
      return;
    }
    for (const f of fallen.slice(0, 40)) {
      const row = div('fallen-row');
      const mark = span('');
      mark.appendChild(icon('skull', { size: 13 }));
      mark.style.color = classAccent(f.classId);
      const body = div('');
      body.appendChild(span('fallen-name', f.name));
      body.appendChild(
        span('fallen-detail', `Lv ${f.level} ${classById(f.classId)?.name ?? f.classId} — ${f.killedBy} · ${timeAgo(f.at)}`)
      );
      add(row, mark, body, span('fallen-depth', `D${f.depth}`));
      this.memorialList.appendChild(row);
    }
  }

  /** Selects a tier and rewrites the pros/cons panel beneath the row. */
  private setDifficulty(id: DifficultyId): void {
    this.difficulty = id;
    for (const [key, el] of this.difficultyCards) {
      el.classList.toggle('is-on', key === id);
    }
    const d = DIFFICULTIES.find((x) => x.id === id);
    clear(this.difficultyDetail);
    if (!d) return;

    this.difficultyDetail.appendChild(span('cs-difblurb', d.blurb));
    this.difficultyDetail.appendChild(span('cs-difguide', d.guidance));

    const good = div('cs-diflist good');
    for (const line of d.pros) {
      const r = div('cs-difline');
      r.appendChild(span('cs-difmark', '+'));
      r.appendChild(span('cs-diftext', line));
      good.appendChild(r);
    }
    const bad = div('cs-diflist bad');
    for (const line of d.cons) {
      const r = div('cs-difline');
      r.appendChild(span('cs-difmark', '-'));
      r.appendChild(span('cs-diftext', line));
      bad.appendChild(r);
    }
    add(this.difficultyDetail, good, bad);
  }

  // -- start a run ---------------------------------------------------------

  private begin(): void {
    const id = this.selected ?? classList()[0]?.id;
    if (!id) return;
    const name = (this.nameInput.value || '').trim() || rollName(this.rng);

    const created = attempt(
      () => createCharacter(name, id, new Random(randomSeed()), this.difficulty),
      null
    );
    if (!created) {
      events.emit('toast', { text: 'Could not forge that character.', kind: 'bad' });
      return;
    }
    save.setCharacter(created);
    events.emit('sfx', { id: 'ui.confirm' });
    events.emit('toast', { text: `${created.name} takes up the torch.`, kind: 'epic' });
    this.panel.close();
    void this.engine.goTo('town');
  }
}

function prettify(id: string): string {
  return id.replace(/[-_]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export { fmtInt as _fmtInt };
