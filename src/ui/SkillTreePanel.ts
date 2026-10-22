/**
 * SLAY — the skill tree.
 *
 * Three trees per class, six tiers deep, prerequisites drawn as real lines
 * between nodes. The board and the picked skill's details sit side by side and
 * both fit the panel, so nothing scrolls: the board sizes its tiers and nodes
 * to the room it has (`fitBoard`). The details show what the next rank
 * actually buys you, because "+1 rank" means nothing without the numbers next
 * to it.
 *
 * Nodes can be dragged straight onto the HUD hotbar.
 */

import type { Character, SkillDef, StatKey } from '../types';
import { events } from '../core/Events';
import { save } from '../core/Save';
import { allocateSkill, canAllocateSkill, setPrimaryAttack, setHotbarSlot } from '../sim/Character';
import { respecCost, respecSkills, FREE_RESPECS } from '../sim/Progression';
import {
  scheduleRefresh,
  Panel,
  Tabs,
  add,
  clear,
  div,
  span,
  icon,
  iconSvg,
  classById,
  classAccent,
  skillById,
  skillsInTree,
  treeById,
  drag,
  fmt,
  signed,
  attempt,
  STAT_LABEL,
  STAT_ICON,
  PERCENT_STATS,
  emptyState,
  modal,
  fmtInt,
  Button,
  type DragPayload,
} from './Widgets';
import { skillIconUri } from '../art/Icons';
import { computeStats } from '../sim/Stats';
import { paceFor } from './AttackEstimate';
import { SKILL_BY_ID, synergiesFor, synergiesFrom, synergyPct } from '../data/skills';
import { COMBO_WINDOW, canCombo, comboBonusPct, comboForSkill } from '../entities/Combos';
import { BURST_POWER, FOE_POWER, SELF_POWER, burstGrowth, minionLifeGrowth } from '../data/skillPower';
import { uiSfx } from './Sfx';
import { tr, trn, numText } from '../core/I18n';
import { uiHeight } from '../core/UiScale';
import { edgeFalloffNote } from '../data/areaFalloff';

const TIERS = 6;
const COLS = 3;
/** The left strip that carries each tier's numeral and point gate. */
const GUTTER = 26;

/**
 * Column width, tier height, node size and rank arc, all from the room the
 * board has: the six tiers always fill its height and the three columns its
 * width, so the board never scrolls and never leaves a bare band. Nodes grow
 * with the room, from 40 px on a short screen to 60 where there is space,
 * and always leave a line under them for the name.
 */
const TIER_H_MIN = 64;
const CELL_W_MIN = 86;
/** What the panel frame and the tree tabs take, before the board is laid out. */
const BOARD_CHROME = 230;
const geo = { cellW: 96, cellH: 104, node: 58, arcR: 32, arcLen: 2 * Math.PI * 32 };

/** Sizes the board for `w` by `h` px. */
function fitBoard(w: number, h: number): void {
  geo.cellW = Math.max(CELL_W_MIN, Math.floor((w - GUTTER) / COLS));
  geo.cellH = Math.max(TIER_H_MIN, Math.floor(h / TIERS));
  // Room under the node for its rank plate and a name.
  const node = Math.min(60, geo.cellH - 34, geo.cellW - 30);
  geo.node = Math.max(40, Math.round(node / 2) * 2);
  geo.arcR = geo.node / 2 + 3;
  geo.arcLen = 2 * Math.PI * geo.arcR;
}

interface NodeView {
  def: SkillDef;
  root: HTMLDivElement;
  rank: HTMLDivElement;
  /** The rank arc drawn round the node, filled as points go in. */
  arc: SVGCircleElement;
  x: number;
  y: number;
}


export class SkillTreePanel {
  readonly panel: Panel;
  private tabs: Tabs;
  private board: HTMLDivElement;
  private lines: SVGSVGElement;
  private detail: HTMLDivElement;
  private pointsEl: HTMLDivElement;

  private nodes = new Map<string, NodeView>();
  private boardWrap: HTMLDivElement;
  private respecBtn: Button;
  private activeTree = '';
  private focused: string | null = null;
  private pinned: string | null = null;

  constructor() {
    this.panel = new Panel({
      id: 'skills',
      title: tr('Skills'),
      subtitle: tr('Points are yours to spend · a full respec has a price'),
      icon: 'skillLevels',
      side: 'right',
    });
    this.panel.frame.classList.add('panel-skills');

    this.tabs = new Tabs([], '', (id) => {
      this.activeTree = id;
      this.buildBoard();
      this.pinned = null;
      this.showDetail(this.defaultFocus());
    }, 'tabs-trees');

    this.pointsEl = div('skill-points');
    // Points and respec sit under the board, the price on the button (the
    // full terms in its tooltip), so changing your mind is a known cost rather
    // than a mystery.
    this.respecBtn = new Button({
      label: tr('Respec'),
      variant: 'ghost',
      icon: 'cooldown',
      small: true,
      onClick: () => this.confirmRespec(),
    });
    this.respecBtn.root.classList.add('skill-respec');
    const foot = div('skill-boardfoot');
    add(foot, this.pointsEl, this.respecBtn.root);
    const head = div('skill-head');
    add(head, this.tabs.root);

    const body = div('skill-body');

    // The board on the left fills its column; the picked skill reads beside
    // it. The hotbar is the HUD's own, just below the panel, and takes drops.
    this.boardWrap = div('skill-boardwrap');
    this.board = div('skill-board');
    this.lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.lines.classList.add('skill-lines');
    this.board.appendChild(this.lines as unknown as Node);
    this.boardWrap.appendChild(this.board);
    const boardCol = div('skill-boardcol');
    add(boardCol, this.boardWrap, foot);

    const rail = div('skill-rail');
    this.detail = div('skill-detail');
    rail.appendChild(this.detail);

    add(body, boardCol, rail);
    add(this.panel.body, head, body);

    events.on('ui:refresh', () => {
      if (this.panel.isOpen) scheduleRefresh(this.boundRefresh);
    });
    events.on('player:levelUp', () => {
      if (this.panel.isOpen) scheduleRefresh(this.boundRefresh);
    });
    window.addEventListener('resize', () => this.refit());
  }

  open(): void {
    this.refresh();
    this.panel.open();
    // Laid out now: size the board to the room it really has.
    this.refit();
  }

  /** Rebuilds the board if the room it has now wants another size. */
  private refit(): void {
    if (!this.panel.isOpen) return;
    const was = `${geo.cellW}x${geo.cellH}`;
    this.fit();
    if (`${geo.cellW}x${geo.cellH}` !== was) this.buildBoard();
  }

  close(): void {
    this.panel.close();
  }

  get isOpen(): boolean {
    return this.panel.isOpen;
  }

  // -- build ---------------------------------------------------------------

  private readonly boundRefresh = (): void => this.refresh();

  refresh(): void {
    const c = save.account.current;
    if (!c) return;
    const def = classById(c.classId);
    const trees = def?.trees ?? [];
    const defs = trees.map((id) => {
      const t = treeById(id);
      return { id, label: t?.name ?? prettify(id), accent: classAccent(c.classId), count: this.pointsIn(c, id) };
    });
    const keep = defs.some((d) => d.id === this.activeTree) ? this.activeTree : (defs[0]?.id ?? '');
    this.activeTree = keep;
    this.tabs.setTabs(defs, keep);
    this.buildBoard();
    this.renderPoints(c);
    this.renderRespec(c);
    this.showDetail(this.pinned ?? this.focused ?? this.defaultFocus());
  }

  private pointsIn(c: Character, treeId: string): number {
    let n = 0;
    for (const s of skillsInTree(treeId)) n += c.skills[s.id] ?? 0;
    return n;
  }

  private defaultFocus(): string | null {
    const list = skillsInTree(this.activeTree);
    if (!list.length) return null;
    const c = save.account.current;
    if (c) {
      const allocated = list.find((s) => (c.skills[s.id] ?? 0) > 0);
      if (allocated) return allocated.id;
    }
    const sorted = [...list].sort((a, b) => a.tier - b.tier || a.column - b.column);
    return sorted[0]?.id ?? null;
  }

  private renderRespec(c: Character): void {
    let spent = 0;
    for (const id of Object.keys(c.skills)) spent += c.skills[id] ?? 0;
    const used = c.respecs ?? 0;
    const cost = attempt(() => respecCost(c, used), { gold: 0, materials: {}, free: true });
    this.respecBtn.setDisabled(spent === 0);
    this.respecBtn.setLabel(cost.free ? tr('Respec · {0} free', FREE_RESPECS - used) : tr('Respec · {0}g', fmtInt(cost.gold)));
    this.respecBtn.root.title =
      spent === 0
        ? tr('Nothing to refund yet')
        : cost.free
          ? trn(FREE_RESPECS - used, 'Refund every skill point. Free: {0} free respec left.', 'Refund every skill point. Free: {0} free respecs left.', FREE_RESPECS - used)
          : tr('Refund every skill point for {0} gold.', fmtInt(cost.gold));
  }

  private confirmRespec(): void {
    const c = save.account.current;
    if (!c) return;
    let spent = 0;
    for (const id of Object.keys(c.skills)) spent += c.skills[id] ?? 0;
    if (spent === 0) return;
    const used = c.respecs ?? 0;
    const cost = attempt(() => respecCost(c, used), { gold: 0, materials: {}, free: true });
    if (!cost.free && c.gold < cost.gold) {
      events.emit('toast', { text: tr('A respec costs {0} gold.', fmtInt(cost.gold)), kind: 'bad' });
      return;
    }
    const price = cost.free
      ? trn(FREE_RESPECS - used, 'This one is <b>free</b> ({0} free respec left).', 'This one is <b>free</b> ({0} free respecs left).', FREE_RESPECS - used)
      : tr('It costs <b>{0} gold</b>, and each one after costs more.', fmtInt(cost.gold));
    modal({
      title: tr('Unlearn Every Skill'),
      icon: 'cooldown',
      tone: 'danger',
      body:
        tr('All <b>{0}</b> skill points come back to you to spend again, and your hotbar is cleared. {1}', spent, price),
      confirmLabel: cost.free ? tr('Respec') : tr('Pay {0}g', fmtInt(cost.gold)),
      onConfirm: () => {
        if (!cost.free) c.gold -= cost.gold;
        attempt(() => respecSkills(c), 0);
        c.respecs = used + 1;
        for (let i = 0; i < c.hotbar.length; i++) c.hotbar[i] = null;
        c.primaryAttack = null;
        save.touch();
        uiSfx('ui.levelup');
        events.emit('toast', { text: tr('{0} skill points returned.', spent), kind: 'good' });
        events.emit('ui:refresh', {});
        this.refresh();
        // Every node lights as the points drain back out of it.
        for (const [, v] of this.nodes) {
          v.root.classList.remove('refund');
          void v.root.offsetWidth;
          v.root.classList.add('refund');
        }
      },
    });
  }

  private renderPoints(c: Character): void {
    clear(this.pointsEl);
    const has = c.skillPoints > 0;
    this.pointsEl.classList.toggle('is-live', has);
    this.pointsEl.appendChild(icon(has ? 'sparkle' : 'lock', { size: 14 }));
    this.pointsEl.appendChild(span('skill-points-n', String(c.skillPoints)));
    this.pointsEl.appendChild(span('skill-points-l', has ? tr('points to spend') : tr('no points')));
  }

  /**
   * Sizes the board to its column. Layout sizes (`offsetWidth`) are the
   * panel's own pixels, before its zoom and its opening slide.
   */
  private fit(): void {
    const w = this.boardWrap.offsetWidth;
    const h = this.boardWrap.offsetHeight;
    // A short board means a short card too: it drops the drag hint and tightens up.
    if (h > 0) this.panel.frame.classList.toggle('is-compact', h < 520);
    if (w > 0 && h > 0) fitBoard(w, h);
    else fitBoard(300, uiHeight() - BOARD_CHROME);
  }

  private buildBoard(): void {
    const c = save.account.current;
    this.fit();
    clear(this.board);
    this.nodes.clear();
    this.board.appendChild(this.lines as unknown as Node);
    const boardW = GUTTER + COLS * geo.cellW;
    const boardH = TIERS * geo.cellH;
    this.board.style.width = `${boardW}px`;
    this.board.style.height = `${boardH}px`;
    this.lines.setAttribute('viewBox', `0 0 ${boardW} ${boardH}`);
    this.lines.setAttribute('width', String(boardW));
    this.lines.setAttribute('height', String(boardH));
    clear(this.lines as unknown as Element);

    const list = skillsInTree(this.activeTree);
    if (!list.length) {
      this.board.appendChild(emptyState(tr('No skills defined for this tree yet.'), 'skillLevels'));
      return;
    }

    // Tier rails give the eye a grid to read the six power levels against.
    // The tier number and its point gate sit stacked in the left gutter so
    // they never collide with a node's name; a tier you have opened is lit.
    const spentHere = c ? this.pointsIn(c, this.activeTree) : 0;
    for (let t = 1; t <= TIERS; t++) {
      const rail = div('skill-tierrail');
      rail.style.top = `${(t - 1) * geo.cellH}px`;
      rail.style.height = `${geo.cellH}px`;
      const need = (t - 1) * 5;
      rail.classList.toggle('is-open', spentHere >= need);
      const tag = div('skill-tiertag');
      tag.appendChild(span('skill-tiernum', toRoman(t)));
      if (need > 0) tag.appendChild(span('skill-tierreq', `${need}`));
      tag.title = need > 0 ? tr('Tier {0}: needs {1} points in this tree', t, need) : tr('Tier {0}', t);
      rail.appendChild(tag);
      this.board.appendChild(rail);
    }

    const accent = classAccent(c?.classId);
    for (const s of list) {
      const col = Math.max(0, Math.min(COLS - 1, s.column));
      const tier = Math.max(1, Math.min(TIERS, s.tier));
      const x = GUTTER + col * geo.cellW + geo.cellW / 2;
      // A little above the tier's middle: the node and its name below it are centred together.
      const y = (tier - 1) * geo.cellH + geo.cellH / 2 - 9;

      const node = div('sknode');
      node.style.left = `${x - geo.node / 2}px`;
      node.style.top = `${y - geo.node / 2}px`;
      node.style.width = `${geo.node}px`;
      node.style.height = `${geo.node}px`;
      node.style.setProperty('--accent', accent);
      node.dataset.skill = s.id;

      const art = div('sknode-art');
      art.innerHTML = `<img class="skill-img" src="${skillIconUri(s.id, skillDefFor(s.id)?.effect, skillDefFor(s.id)?.damageType, skillDefFor(s.id)?.targeting === 'passive', skillDefFor(s.id)?.icon)}" alt="" style="width:${geo.node - 7}px;height:${geo.node - 7}px" draggable="false">`;
      const frame = div('sknode-frame');
      const rank = div('sknode-rank');
      const lock = div('sknode-lock');
      lock.innerHTML = iconSvg('lock', { size: 15 });
      // Rank arc: a groove all the way round, lit for the share of max rank
      // already bought. Reads from across the board where "3/20" does not.
      const ns = 'http://www.w3.org/2000/svg';
      const ring = document.createElementNS(ns, 'svg');
      const box = geo.node + 12;
      ring.setAttribute('class', 'sknode-ring');
      ring.setAttribute('viewBox', `0 0 ${box} ${box}`);
      ring.setAttribute('width', String(box));
      ring.setAttribute('height', String(box));
      const groove = document.createElementNS(ns, 'circle');
      groove.setAttribute('class', 'sknode-groove');
      const arc = document.createElementNS(ns, 'circle');
      arc.setAttribute('class', 'sknode-arc');
      for (const c0 of [groove, arc]) {
        c0.setAttribute('cx', String(box / 2));
        c0.setAttribute('cy', String(box / 2));
        c0.setAttribute('r', String(geo.arcR));
      }
      arc.setAttribute('stroke-dasharray', `0 ${geo.arcLen}`);
      arc.setAttribute('transform', `rotate(-90 ${box / 2} ${box / 2})`);
      ring.appendChild(groove);
      ring.appendChild(arc);
      const plus = div('sknode-plus', '+');
      add(node, ring as unknown as HTMLElement, art, frame, rank, lock, plus);
      node.appendChild(div('sknode-name-tip'));

      node.addEventListener('pointerenter', () => {
        this.focused = s.id;
        this.highlightSynergies(s.id, true);
        if (!this.pinned) this.showDetail(s.id);
      });
      node.addEventListener('pointerleave', () => {
        this.highlightSynergies(s.id, false);
        if (!this.pinned) this.showDetail(this.focused ?? this.defaultFocus());
      });
      node.addEventListener('click', () => this.spend(s));
      node.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.pinned = this.pinned === s.id ? null : s.id;
        this.showDetail(s.id);
        this.bindToHotbar(s.id);
      });
      this.enableDrag(node, s);

      // The rank badge straddles the bottom of the ring; the name sits clear
      // of it underneath.
      const label = div('sknode-label', s.name);
      label.style.left = `${x - geo.cellW / 2}px`;
      label.style.top = `${y + geo.node / 2 + 9}px`;
      label.style.width = `${geo.cellW}px`;

      this.board.appendChild(node);
      this.board.appendChild(label);
      this.nodes.set(s.id, { def: s, root: node, rank, arc, x, y });
    }

    this.drawLines();
    this.syncStates();
  }

  private enableDrag(node: HTMLDivElement, s: SkillDef): void {
    let sx = 0;
    let sy = 0;
    let armed = false;
    node.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      armed = true;
      sx = e.clientX;
      sy = e.clientY;
    });
    node.addEventListener('pointermove', (e) => {
      if (!armed || drag.active) return;
      if (Math.hypot(e.clientX - sx, e.clientY - sy) < 6) return;
      armed = false;
      const accent = classAccent(save.account.current?.classId);
      const ghost = `<div class="sknode sknode-ghost"><div class="sknode-art">${`<img class="skill-img" src="${skillIconUri(s.id, skillDefFor(s.id)?.effect, skillDefFor(s.id)?.damageType, skillDefFor(s.id)?.targeting === 'passive', skillDefFor(s.id)?.icon)}" alt="" style="width:44px;height:44px" draggable="false">`}</div><div class="sknode-frame"></div></div>`;
      const payload: DragPayload = { kind: 'skill', skillId: s.id };
      drag.begin(payload, e, ghost);
    });
    node.addEventListener('pointerup', () => {
      armed = false;
    });
  }

  private drawLines(): void {
    const svg = this.lines;
    clear(svg as unknown as Element);
    const ns = 'http://www.w3.org/2000/svg';
    for (const [, view] of this.nodes) {
      for (const reqId of view.def.requires ?? []) {
        const from = this.nodes.get(reqId);
        if (!from) continue;
        const path = document.createElementNS(ns, 'path');
        const d = linkPath(from.x, from.y, view.x, view.y);
        path.setAttribute('d', d);
        path.setAttribute('class', 'skline');
        path.dataset.to = view.def.id;
        path.dataset.from = reqId;
        svg.appendChild(path);
        // A travelling dash over the same curve: power flowing down the tree
        // once both ends are learned.
        const flow = document.createElementNS(ns, 'path');
        flow.setAttribute('d', d);
        flow.setAttribute('class', 'skline-flow');
        flow.dataset.to = view.def.id;
        flow.dataset.from = reqId;
        svg.appendChild(flow);

        const dot = document.createElementNS(ns, 'circle');
        dot.setAttribute('cx', String(view.x));
        dot.setAttribute('cy', String(view.y - geo.node / 2 + 4));
        dot.setAttribute('r', '2.6');
        dot.setAttribute('class', 'skline-dot');
        dot.dataset.to = view.def.id;
        svg.appendChild(dot);
      }
    }
  }

  private syncStates(): void {
    const c = save.account.current;
    if (!c) return;
    for (const [id, view] of this.nodes) {
      const rank = c.skills[id] ?? 0;
      const max = view.def.maxRank;
      const check = attempt(() => canAllocateSkill(c, id), { ok: false } as { ok: boolean; reason?: string });
      const canSpend = check.ok && c.skillPoints > 0 && rank < max;

      view.root.classList.toggle('is-allocated', rank > 0);
      view.root.classList.toggle('is-maxed', rank >= max && rank > 0);
      view.root.classList.toggle('is-available', rank === 0 && check.ok);
      view.root.classList.toggle('can-spend', canSpend);
      view.root.classList.toggle('is-locked', rank === 0 && !check.ok);
      view.rank.textContent = rank > 0 ? `${rank}/${max}` : `0/${max}`;
      const k = max > 0 ? Math.min(1, rank / max) : 0;
      view.arc.setAttribute('stroke-dasharray', `${(geo.arcLen * k).toFixed(1)} ${geo.arcLen.toFixed(1)}`);
      view.root.title = check.ok ? '' : check.reason ?? '';
    }
    // Lines light up once their prerequisite is actually taken.
    const paths = this.lines.querySelectorAll<SVGPathElement>('.skline, .skline-flow, .skline-dot');
    paths.forEach((p) => {
      const fromId = (p as unknown as HTMLElement).dataset.from;
      const toId = (p as unknown as HTMLElement).dataset.to;
      const fromRank = fromId ? c.skills[fromId] ?? 0 : 0;
      const toRank = toId ? c.skills[toId] ?? 0 : 0;
      p.classList.toggle('is-live', fromRank > 0);
      p.classList.toggle('is-flow', fromRank > 0 && toRank > 0);
    });
  }

  private highlightSynergies(id: string, on: boolean): void {
    const def = skillById(id);
    if (!def) return;
    const related = new Set<string>(def.requires ?? []);
    for (const l of synergiesFor(id)) related.add(l.source);
    for (const l of synergiesFrom(id)) related.add(l.target);
    for (const [otherId, view] of this.nodes) {
      if ((view.def.requires ?? []).includes(id)) related.add(otherId);
    }
    for (const [otherId, view] of this.nodes) {
      view.root.classList.toggle('is-synergy', on && related.has(otherId));
      view.root.classList.toggle('is-dimmed', on && otherId !== id && !related.has(otherId));
    }
  }

  private spend(s: SkillDef): void {
    const c = save.account.current;
    if (!c) return;
    const rank = c.skills[s.id] ?? 0;
    if (rank >= s.maxRank) {
      events.emit('toast', { text: tr('{0} is already at maximum rank.', s.name), kind: 'info' });
      return;
    }
    const check = attempt(() => canAllocateSkill(c, s.id), { ok: false, reason: tr('Locked') } as { ok: boolean; reason?: string });
    if (!check.ok) {
      events.emit('toast', { text: check.reason ?? tr('You cannot learn that yet.'), kind: 'bad' });
      const view = this.nodes.get(s.id);
      view?.root.classList.remove('shake');
      void view?.root.offsetWidth;
      view?.root.classList.add('shake');
      return;
    }
    if (c.skillPoints <= 0) {
      events.emit('toast', { text: tr('No skill points to spend.'), kind: 'bad' });
      return;
    }
    const ok = attempt(() => allocateSkill(c, s.id), false);
    if (!ok) return;

    // allocateSkill already binds the first rank to a free slot. Binding again
    // here put the same skill in two slots at once.
    while (c.hotbar.length < 6) c.hotbar.push(null);
    save.touch();
    uiSfx('ui.levelup');
    events.emit('ui:refresh', {});

    const view = this.nodes.get(s.id);
    view?.root.classList.remove('pulse');
    void view?.root.offsetWidth;
    view?.root.classList.add('pulse');
  }

  private bindToHotbar(id: string): void {
    const c = save.account.current;
    const def = skillById(id);
    if (!c || !def || def.targeting === 'passive') return;
    if ((c.skills[id] ?? 0) <= 0) return;
    while (c.hotbar.length < 6) c.hotbar.push(null);
    if (c.hotbar.includes(id)) return;
    const free = c.hotbar.findIndex((h) => !h);
    const at = free >= 0 ? free : 0;
    setHotbarSlot(c, at, id);
    save.touch();
    events.emit('ui:refresh', {});
    events.emit('toast', { text: tr('{0} bound to slot {1}', def.name, at + 1), kind: 'good' });
  }

  // -- detail pane ---------------------------------------------------------

  /**
   * The picked skill beside the board, in one column that fits the panel:
   * name and facts, what it does, what the next rank buys, then how it ties
   * to the rest of the tree, with the buttons held at the foot.
   */
  private showDetail(id: string | null): void {
    clear(this.detail);
    const c = save.account.current;
    if (!id || !c) {
      this.detail.appendChild(emptyState(tr('Hover a skill to inspect it.'), 'skillLevels'));
      return;
    }
    const s = skillById(id);
    if (!s) return;
    const rank = c.skills[id] ?? 0;
    const maxed = rank >= s.maxRank;
    const next = Math.min(s.maxRank, rank + 1);
    const accent = classAccent(c.classId);
    this.detail.style.setProperty('--accent', accent);
    this.detail.classList.toggle('is-learned', rank > 0);
    this.detail.classList.toggle('is-pinned', this.pinned === id);

    // --- head: art, name, rank --------------------------------------------
    const hd = div('skdetail-hd');
    const art = div('skdetail-art');
    art.innerHTML = `<img class="skill-img" src="${skillIconUri(s.id, skillDefFor(s.id)?.effect, skillDefFor(s.id)?.damageType, skillDefFor(s.id)?.targeting === 'passive', skillDefFor(s.id)?.icon)}" alt="" draggable="false">`;
    const titles = div('skdetail-titles');
    titles.appendChild(div('skdetail-name', s.name));
    const rankLine = div('skdetail-rankline');
    const bar = div('skdetail-rankbar');
    const fill = div('skdetail-rankfill');
    fill.style.width = `${s.maxRank > 0 ? Math.min(100, (rank / s.maxRank) * 100) : 0}%`;
    bar.appendChild(fill);
    add(rankLine, span(`skdetail-rank ${maxed ? 'is-max' : ''}`.trim(), tr('Rank {0} / {1}', rank, s.maxRank)), bar);
    // How long one use takes with what is held now (`sim/Speed.ts`): an attack
    // at the weapon's pace, a spell on its cast time.
    if (s.targeting !== 'passive') {
      const def = skillDefFor(s.id);
      const st = def ? attempt(() => computeStats(c), null) : null;
      const pace = def && st ? attempt(() => paceFor(c, st, def), null) : null;
      if (pace && pace.time > 0) {
        const p = span('skdetail-pace');
        p.appendChild(icon('speed', { size: 10 }));
        p.appendChild(span('', tr('{0}s', numText(pace.time, 2))));
        p.title =
          pace.timing === 'attack'
            ? tr('An attack: one use takes {0} s with what you hold now, {1} a second. Attack speed makes it quicker.', numText(pace.time, 2), numText(1 / pace.time, 2))
            : tr('A spell: one cast takes {0} s, {1} a second. Cast speed makes it quicker.', numText(pace.time, 2), numText(1 / pace.time, 2));
        rankLine.appendChild(p);
      }
    }
    titles.appendChild(rankLine);
    add(hd, art, titles);
    this.detail.appendChild(hd);

    // --- facts: tier, kind, element, pace ------------------------------------
    const meta = div('skdetail-meta');
    meta.appendChild(span('skdetail-chip', tr('Tier {0}', s.tier)));
    meta.appendChild(span('skdetail-chip', TARGETING_LABEL[s.targeting] ?? s.targeting));
    if (s.damageType) meta.appendChild(span(`skdetail-chip dmg-${s.damageType}`, capitalize(s.damageType)));
    this.detail.appendChild(meta);

    const scroll = div('skdetail-flow');
    scroll.appendChild(div('skdetail-desc', s.desc));
    // A blast that weakens toward its rim says so (`data/areaFalloff.ts`).
    const edge = edgeFalloffNote(s.id);
    if (edge) scroll.appendChild(div('skdetail-note', edge));

    // --- current vs next ---------------------------------------------------
    const rows = rankRows(s, rank);
    if (rows.length) {
      const table = div('skdetail-table');
      const head = div('skdetail-trow is-head');
      head.appendChild(span('skdetail-tl', maxed ? tr('At maximum rank') : tr('Next rank')));
      head.appendChild(span('skdetail-tc', rank > 0 ? tr('Now') : ''));
      head.appendChild(span('skdetail-ta', ''));
      head.appendChild(span('skdetail-tn', maxed ? '' : tr('Rank {0}', next)));
      table.appendChild(head);
      for (const r of rows) {
        const line = div('skdetail-trow');
        const l = span('skdetail-tl');
        if (r.icon) l.appendChild(icon(r.icon, { size: 11 }));
        l.appendChild(span('', r.label));
        line.appendChild(l);
        line.appendChild(span('skdetail-tc', r.cur));
        const arrow = span('skdetail-ta');
        if (!maxed) arrow.innerHTML = iconSvg('chevronRight', { size: 10 });
        line.appendChild(arrow);
        line.appendChild(span(`skdetail-tn ${r.cur !== r.nxt ? 'is-better' : ''}`.trim(), maxed ? '' : r.nxt));
        table.appendChild(line);
      }
      scroll.appendChild(table);
    }

    // --- synergies ----------------------------------------------------------
    // Hard ranks in other skills that make this one stronger, and the skills
    // a rank here makes stronger (`SYNERGIES`; +skills gear does not count).
    const gains = synergiesFor(s.id);
    const gives = synergiesFrom(s.id);
    if (gains.length || gives.length) {
      const box = div('skdetail-block');
      const hd = div('skdetail-blockhd', tr('Synergies'));
      box.appendChild(hd);
      if (gains.length) {
        const total = synergyPct(s.id, c.skills);
        const what = s.damageScale || s.targeting !== 'passive' ? 'damage' : 'power';
        // The running total sits on the heading; the sentence is its tooltip.
        if (total > 0) hd.appendChild(span('skdetail-blockval', tr('+{0}% {1} now', fmt(total), what)));
        box.title = tr('Ranks in these skills add {0} to this one.', what);
        const r = div('skdetail-links');
        for (const l of gains) {
          const have = c.skills[l.source] ?? 0;
          const name = skillById(l.source)?.name ?? l.source;
          r.appendChild(span(`skdetail-link ${have > 0 ? 'ok' : ''}`.trim(), tr('{0} +{1}% a rank{2}', name, fmt(l.pctPerRank), have > 0 ? ` (+${fmt(l.pctPerRank * have)}%)` : '')));
        }
        box.appendChild(r);
      }
      if (gives.length) {
        const r = div('skdetail-links');
        r.appendChild(span('skdetail-linklabel', tr('Each rank adds')));
        for (const l of gives) r.appendChild(span('skdetail-link', tr('+{0}% to {1}', fmt(l.pctPerRank), skillById(l.target)?.name ?? l.target)));
        box.appendChild(r);
      }
      scroll.appendChild(box);
    }

    // --- combo ---------------------------------------------------------------
    const combo = comboForSkill(s);
    if (combo && canCombo(s)) {
      const box = div('skdetail-block');
      box.appendChild(div('skdetail-blockhd', tr('Combo: {0}', combo.name)));
      box.appendChild(
        div(
          'skdetail-note',
          tr('Land this on a target another of your skills hit in the last {0}s: +{1}% damage. {2} The same skill twice in a row does not combo.', COMBO_WINDOW, comboBonusPct(s), combo.desc),
        ),
      );
      scroll.appendChild(box);
    }

    // --- prerequisites -------------------------------------------------------
    const reqs = s.requires ?? [];
    const dependents = skillsInTree(s.treeId).filter((o) => (o.requires ?? []).includes(s.id));
    if (reqs.length || dependents.length) {
      const box = div('skdetail-block');
      if (reqs.length) {
        const r = div('skdetail-links');
        r.appendChild(span('skdetail-linklabel', tr('Requires')));
        for (const q of reqs) {
          const d = skillById(q);
          const got = (c.skills[q] ?? 0) > 0;
          r.appendChild(span(`skdetail-link ${got ? 'ok' : 'missing'}`, d?.name ?? q));
        }
        box.appendChild(r);
      }
      if (dependents.length) {
        const r = div('skdetail-links');
        r.appendChild(span('skdetail-linklabel', tr('Unlocks')));
        for (const d of dependents) r.appendChild(span('skdetail-link', d.name));
        box.appendChild(r);
      }
      scroll.appendChild(box);
    }
    this.detail.appendChild(scroll);

    // --- actions, held at the foot ---------------------------------------------
    const actions = div('skdetail-actions');
    const check = attempt(() => canAllocateSkill(c, s.id), { ok: false, reason: '' } as { ok: boolean; reason?: string });
    if (!check.ok && rank === 0 && check.reason) {
      actions.appendChild(div('skdetail-locked', check.reason));
    } else if (c.skillPoints <= 0 && !maxed) {
      actions.appendChild(div('skdetail-locked', tr('No skill points — level up to earn more.')));
    }
    const spend = document.createElement('button');
    spend.type = 'button';
    spend.className = 'btn btn-primary btn-wide';
    const canSpend = check.ok && c.skillPoints > 0 && !maxed;
    spend.disabled = !canSpend;
    spend.innerHTML = `<span class="btn-label">${maxed ? tr('Mastered') : rank > 0 ? tr('Raise to Rank {0}', next) : tr('Learn Skill')}</span>`;
    spend.addEventListener('click', () => this.spend(s));
    actions.appendChild(spend);

    if (s.targeting !== 'passive' && rank > 0) {
      const row = div('skdetail-actrow');
      const isPrimary = c.primaryAttack === s.id;
      const rc = document.createElement('button');
      rc.type = 'button';
      rc.className = `btn btn-sm ${isPrimary ? 'btn-primary' : 'btn-ghost'}`;
      rc.innerHTML = `<span class="btn-label">${isPrimary ? tr('On right click') : tr('Right click')}</span>`;
      rc.title = tr('Set as right click attack');
      rc.disabled = isPrimary;
      rc.addEventListener('click', () => {
        if (setPrimaryAttack(c, s.id)) {
          save.touch();
          events.emit('toast', { text: tr('{0} bound to right click.', s.name), kind: 'good' });
          events.emit('ui:refresh', {});
          this.refresh();
        }
      });
      const bind = document.createElement('button');
      bind.type = 'button';
      bind.className = 'btn btn-ghost btn-sm';
      bind.innerHTML = tr('<span class="btn-label">Number key</span>');
      bind.title = tr('Bind to a number key');
      bind.addEventListener('click', () => this.bindToHotbar(s.id));
      add(row, rc, bind);
      actions.appendChild(row);
      actions.appendChild(div('skdetail-draghint', tr('or drag the node onto a hotbar slot')));
    }
    this.detail.appendChild(actions);
  }
}

const TARGETING_LABEL: Record<string, string> = {
  self: tr('Self'),
  point: tr('Ground Target'),
  direction: tr('Directional'),
  enemy: tr('Single Target'),
  passive: tr('Passive'),
};

interface RankRow {
  label: string;
  cur: string;
  nxt: string;
  icon?: string;
}

/** The numbers that change with rank: this rank and the next, formatted. */
function rankRows(s: SkillDef, rank: number): RankRow[] {
  const next = Math.min(s.maxRank, rank + 1);
  const rows: RankRow[] = [];
  const numFmt = (v: number, suffix = ''): string => `${fmt(v)}${suffix}`;
  if (s.damageScale) {
    const a = attempt(() => s.damageScale?.(Math.max(1, rank)) ?? 0, 0);
    const b = attempt(() => s.damageScale?.(next) ?? 0, 0);
    rows.push({ label: tr('Damage'), cur: rank > 0 ? `${Math.round(a * 100)}%` : '—', nxt: `${Math.round(b * 100)}%`, icon: 'sword' });
  }
  rows.push(...powerRows(s, rank, next));
  if (s.manaCost) {
    const a = attempt(() => s.manaCost?.(Math.max(1, rank)) ?? 0, 0);
    const b = attempt(() => s.manaCost?.(next) ?? 0, 0);
    rows.push({ label: tr('Mana Cost'), cur: rank > 0 ? numFmt(a) : '—', nxt: numFmt(b), icon: 'mana' });
  }
  if (s.cooldown) {
    const a = attempt(() => s.cooldown?.(Math.max(1, rank)) ?? 0, 0);
    const b = attempt(() => s.cooldown?.(next) ?? 0, 0);
    if (a > 0 || b > 0) rows.push({ label: tr('Cooldown'), cur: rank > 0 ? tr('{0}s', numText(a, 1)) : '—', nxt: tr('{0}s', numText(b, 1)), icon: 'cooldown' });
  }
  if (s.passive) {
    for (const key of Object.keys(s.passive) as StatKey[]) {
      const fn = s.passive[key];
      if (!fn) continue;
      const a = attempt(() => fn(Math.max(1, rank)), 0);
      const b = attempt(() => fn(next), 0);
      const suffix = PERCENT_STATS.has(key) ? '%' : '';
      rows.push({
        label: STAT_LABEL[key],
        cur: rank > 0 ? `${signed(a)}${suffix}` : '—',
        nxt: `${signed(b)}${suffix}`,
        icon: STAT_ICON[key],
      });
    }
  }
  return rows;
}

const RESISTS: StatKey[] = ['physicalResist', 'fireResist', 'coldResist', 'lightningResist', 'poisonResist', 'arcaneResist'];

/**
 * What a rank buys beyond the damage ladder (`data/skillPower.ts`): a
 * summon's blows and body, a buff's stats, ward and time, a curse's bite.
 * Without these a Shadow Clone's rank table read only mana and cooldown.
 */
function powerRows(s: SkillDef, rank: number, next: number): RankRow[] {
  const p = s.params ?? {};
  const n = (key: string, d: number): number => (typeof p[key] === 'number' ? (p[key] as number) : d);
  const out: RankRow[] = [];
  const row = (label: string, at: (k: number) => number | undefined, show: (v: number) => string, icon?: string): void => {
    // Only what a rank changes: a stance's fixed slower feet is not a step.
    if (attempt(() => at(0), undefined) === attempt(() => at(s.maxRank - 1), undefined)) return;
    const a = attempt(() => at(Math.max(0, rank - 1)), undefined);
    const b = attempt(() => at(next - 1), undefined);
    if (b === undefined) return;
    out.push({ label, cur: rank > 0 && a !== undefined ? show(a) : '—', nxt: show(b), icon });
  };
  const pct = (v: number): string => `${fmt(v)}%`;
  const secs = (v: number): string => tr('{0}s', numText(v, 1));
  const statRows = (mods: (k: number) => Partial<Record<StatKey, number>> | undefined, foe: boolean): void => {
    const first = attempt(() => mods(0), undefined) ?? {};
    let keys = Object.keys(first) as StatKey[];
    const allResist = RESISTS.every((r) => first[r] !== undefined && first[r] === first.physicalResist);
    if (allResist) keys = ['physicalResist', ...keys.filter((key) => !RESISTS.includes(key))];
    for (const key of keys) {
      const label = allResist && key === 'physicalResist' ? tr('All Resistances') : STAT_LABEL[key];
      const suffix = PERCENT_STATS.has(key) || RESISTS.includes(key) ? '%' : '';
      row(foe ? tr('Enemy {0}', label) : label, (k) => mods(k)?.[key], (v) => `${signed(v)}${suffix}`, STAT_ICON[key]);
    }
  };

  const summon = /^summon\./.test(s.effect ?? '');
  if (summon && !s.damageScale) {
    row(tr('Minion Damage'), (k) => n('damagePct', 50) * burstGrowth(s.id, k, n), pct, 'sword');
    row(tr('Minion Life'), (k) => n('lifePct', 40) * minionLifeGrowth(s.id, k, n), (v) => tr('{0}% of yours', fmt(v)), 'life');
  } else if (!s.damageScale && BURST_POWER[s.id]) {
    row(tr('Power'), (k) => 100 * burstGrowth(s.id, k, n), pct, 'sword');
  }
  const self = SELF_POWER[s.id];
  if (self) {
    statRows((k) => self(k, n).mods, false);
    row(tr('Ward'), (k) => self(k, n).absorb, fmt, 'shield');
    row(tr('Ward'), (k) => self(k, n).absorbLifePct, (v) => tr('{0}% of life', fmt(v)), 'shield');
    row(tr('Heal'), (k) => self(k, n).healPct, (v) => tr('{0}% of life', fmt(v)), 'life');
    row(tr('Duration'), (k) => self(k, n).duration, secs, 'cooldown');
  }
  const foe = FOE_POWER[s.id];
  if (foe) {
    statRows((k) => foe(k, n).mods, true);
    row(tr('Effect Time'), (k) => foe(k, n).duration, secs, 'cooldown');
  }
  return out;
}

function toRoman(n: number): string {
  return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][n - 1] ?? String(n);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function prettify(id: string): string {
  return id.replace(/[-_]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}


/** Look up a skill definition by id for icon generation. */
function skillDefFor(id: string) {
  return SKILL_BY_ID?.[id];
}

/** Room under a node for its rank badge and name (`.sknode-label`). */
const LABEL_DROP = 27;

/**
 * A prerequisite line, drawn square like a circuit: down from under the
 * name, across only in the gaps between tiers, and down into the target. A
 * line that skips a tier runs down the lane between columns, so no line
 * ever crosses a node or a name.
 */
function linkPath(x1: number, y1: number, x2: number, y2: number): string {
  const top = y1 + geo.node / 2 + LABEL_DROP;
  const end = y2 - geo.node / 2 + 6;
  // The middle of the gap under a tier whose nodes sit at `y`.
  const gapUnder = (y: number): number => (y + geo.node / 2 + LABEL_DROP + y + geo.cellH - geo.node / 2) / 2;
  const busIn = gapUnder(y2 - geo.cellH);
  const pts: [number, number][] = [[x1, top]];
  if (y2 - y1 > geo.cellH * 1.5) {
    const busOut = gapUnder(y1);
    const lastCol = GUTTER + (COLS - 1) * geo.cellW + geo.cellW / 2;
    const side = x2 > x1 || (x2 === x1 && x1 < lastCol - 1) ? 1 : -1;
    const lane = x1 + (side * geo.cellW) / 2;
    pts.push([x1, busOut], [lane, busOut], [lane, busIn], [x2, busIn]);
  } else if (Math.abs(x2 - x1) >= 1) {
    pts.push([x1, busIn], [x2, busIn]);
  }
  pts.push([x2, end]);
  return roundedPath(pts, 8);
}

/** A polyline with each corner rounded off by up to `radius`. */
function roundedPath(pts: [number, number][], radius: number): string {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const inLen = Math.hypot(cx - px, cy - py);
    const outLen = Math.hypot(nx - cx, ny - cy);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (r <= 0.5) {
      d += ` L${cx} ${cy}`;
      continue;
    }
    const ax = cx - ((cx - px) / inLen) * r;
    const ay = cy - ((cy - py) / inLen) * r;
    const bx = cx + ((nx - cx) / outLen) * r;
    const by = cy + ((ny - cy) / outLen) * r;
    d += ` L${ax.toFixed(1)} ${ay.toFixed(1)} Q${cx} ${cy} ${bx.toFixed(1)} ${by.toFixed(1)}`;
  }
  const [lx, ly] = pts[pts.length - 1];
  return `${d} L${lx} ${ly}`;
}
