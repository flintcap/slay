/**
 * SLAY — the skill tree.
 *
 * Three trees per class, six tiers deep, prerequisites drawn as real lines
 * between nodes. The left half is the board; the right half is a detail pane
 * that shows what the next rank actually buys you, because "+1 rank" means
 * nothing without the numbers next to it.
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
  section,
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
import { SKILL_BY_ID, synergiesFor, synergiesFrom, synergyPct } from '../data/skills';
import { COMBO_WINDOW, canCombo, comboBonusPct, comboForSkill } from '../entities/Combos';
import { BURST_POWER, FOE_POWER, SELF_POWER, burstGrowth, minionLifeGrowth } from '../data/skillPower';
import { uiSfx } from './Sfx';

const CELL_W = 132;
const CELL_H = 104;
const NODE = 58;
const TIERS = 6;
const COLS = 3;

interface NodeView {
  def: SkillDef;
  root: HTMLDivElement;
  rank: HTMLDivElement;
  /** The rank arc drawn round the node, filled as points go in. */
  arc: SVGCircleElement;
  x: number;
  y: number;
}

/** Radius and length of the rank arc round each node. */
const ARC_R = NODE / 2 + 3;
const ARC_LEN = 2 * Math.PI * ARC_R;

export class SkillTreePanel {
  readonly panel: Panel;
  private tabs: Tabs;
  private board: HTMLDivElement;
  private lines: SVGSVGElement;
  private detail: HTMLDivElement;
  private pointsEl: HTMLDivElement;
  private hotStrip: HTMLDivElement;
  private treeBlurb: HTMLDivElement;

  private nodes = new Map<string, NodeView>();
  private card = div('skcard');
  /** The node under the pointer, so its card survives a board rebuild. */
  private hoverId: string | null = null;
  private respecBtn: Button;
  private activeTree = '';
  private focused: string | null = null;
  private pinned: string | null = null;

  constructor() {
    this.panel = new Panel({
      id: 'skills',
      title: 'Skills',
      subtitle: 'Points are yours to spend · a full respec has a price',
      icon: 'skillLevels',
      width: 1160,
    });
    this.panel.frame.classList.add('panel-skills');

    this.tabs = new Tabs([], '', (id) => {
      this.activeTree = id;
      this.buildBoard();
      this.pinned = null;
      this.showDetail(this.defaultFocus());
    }, 'tabs-trees');

    this.pointsEl = div('skill-points');
    // Respec lives in plain sight beside the point counter, with its price on
    // the button, so changing your mind is a known cost rather than a mystery.
    this.respecBtn = new Button({
      label: 'Respec',
      variant: 'ghost',
      icon: 'cooldown',
      small: true,
      onClick: () => this.confirmRespec(),
    });
    this.respecBtn.root.classList.add('skill-respec');
    const right = div('skill-head-right');
    add(right, this.respecBtn.root, this.pointsEl);
    const head = div('skill-head');
    add(head, this.tabs.root, right);

    const body = div('skill-body');

    const boardWrap = div('skill-boardwrap');
    this.treeBlurb = div('skill-treeblurb');
    this.board = div('skill-board');
    this.lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.lines.classList.add('skill-lines');
    this.board.appendChild(this.lines as unknown as Node);
    add(boardWrap, this.treeBlurb, this.board);

    const rail = div('skill-rail');
    this.detail = div('skill-detail');
    this.hotStrip = div('skill-hotstrip');
    add(rail, this.detail, this.hotStrip);

    add(body, boardWrap, rail);
    add(this.panel.body, head, body);

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
    this.renderHotStrip(c);
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
    this.respecBtn.setLabel(cost.free ? `Respec · free (${FREE_RESPECS - used} left)` : `Respec · ${fmtInt(cost.gold)}g`);
    this.respecBtn.root.title = spent === 0 ? 'Nothing to refund yet' : 'Refund every skill point';
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
      events.emit('toast', { text: `A respec costs ${fmtInt(cost.gold)} gold.`, kind: 'bad' });
      return;
    }
    const price = cost.free
      ? `This one is <b>free</b> (${FREE_RESPECS - used} free respec${FREE_RESPECS - used === 1 ? '' : 's'} left).`
      : `It costs <b>${fmtInt(cost.gold)} gold</b>, and each one after costs more.`;
    modal({
      title: 'Unlearn Every Skill',
      icon: 'cooldown',
      tone: 'danger',
      body:
        `All <b>${spent}</b> skill points come back to you to spend again, and your hotbar is cleared. ${price}`,
      confirmLabel: cost.free ? 'Respec' : `Pay ${fmtInt(cost.gold)}g`,
      onConfirm: () => {
        if (!cost.free) c.gold -= cost.gold;
        attempt(() => respecSkills(c), 0);
        c.respecs = used + 1;
        for (let i = 0; i < c.hotbar.length; i++) c.hotbar[i] = null;
        c.primaryAttack = null;
        save.touch();
        uiSfx('ui.levelup');
        events.emit('toast', { text: `${spent} skill points returned.`, kind: 'good' });
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
    this.pointsEl.appendChild(span('skill-points-l', has ? 'points to spend' : 'no points'));
  }

  private buildBoard(): void {
    const c = save.account.current;
    clear(this.board);
    this.nodes.clear();
    this.board.appendChild(this.lines as unknown as Node);
    this.board.style.width = `${COLS * CELL_W}px`;
    this.board.style.height = `${TIERS * CELL_H}px`;
    this.lines.setAttribute('viewBox', `0 0 ${COLS * CELL_W} ${TIERS * CELL_H}`);
    this.lines.setAttribute('width', String(COLS * CELL_W));
    this.lines.setAttribute('height', String(TIERS * CELL_H));
    clear(this.lines as unknown as Element);

    const tree = treeById(this.activeTree);
    clear(this.treeBlurb);
    if (tree) {
      this.treeBlurb.appendChild(span('skill-treename', tree.name));
      this.treeBlurb.appendChild(span('skill-treetext', tree.blurb));
    }

    const list = skillsInTree(this.activeTree);
    if (!list.length) {
      this.board.appendChild(emptyState('No skills defined for this tree yet.', 'skillLevels'));
      return;
    }

    // Tier rails give the eye a grid to read the six power levels against.
    // The tier number and its point gate sit stacked in the left gutter so
    // they never collide with a node's name; a tier you have opened is lit.
    const spentHere = c ? this.pointsIn(c, this.activeTree) : 0;
    for (let t = 1; t <= TIERS; t++) {
      const rail = div('skill-tierrail');
      rail.style.top = `${(t - 1) * CELL_H}px`;
      rail.style.height = `${CELL_H}px`;
      const need = (t - 1) * 5;
      rail.classList.toggle('is-open', spentHere >= need);
      const tag = div('skill-tiertag');
      tag.appendChild(span('skill-tiernum', toRoman(t)));
      if (need > 0) tag.appendChild(span('skill-tierreq', `${need}`));
      tag.title = need > 0 ? `Tier ${t}: needs ${need} points in this tree` : `Tier ${t}`;
      rail.appendChild(tag);
      this.board.appendChild(rail);
    }

    const accent = classAccent(c?.classId);
    for (const s of list) {
      const col = Math.max(0, Math.min(COLS - 1, s.column));
      const tier = Math.max(1, Math.min(TIERS, s.tier));
      const x = col * CELL_W + CELL_W / 2;
      const y = (tier - 1) * CELL_H + CELL_H / 2;

      const node = div('sknode');
      node.style.left = `${x - NODE / 2}px`;
      node.style.top = `${y - NODE / 2}px`;
      node.style.width = `${NODE}px`;
      node.style.height = `${NODE}px`;
      node.style.setProperty('--accent', accent);
      node.dataset.skill = s.id;

      const art = div('sknode-art');
      art.innerHTML = `<img class="skill-img" src="${skillIconUri(s.id, skillDefFor(s.id)?.effect, skillDefFor(s.id)?.damageType, skillDefFor(s.id)?.targeting === 'passive', skillDefFor(s.id)?.icon)}" alt="" style="width:${NODE - 7}px;height:${NODE - 7}px" draggable="false">`;
      const frame = div('sknode-frame');
      const rank = div('sknode-rank');
      const lock = div('sknode-lock');
      lock.innerHTML = iconSvg('lock', { size: 15 });
      // Rank arc: a groove all the way round, lit for the share of max rank
      // already bought. Reads from across the board where "3/20" does not.
      const ns = 'http://www.w3.org/2000/svg';
      const ring = document.createElementNS(ns, 'svg');
      const box = NODE + 12;
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
        c0.setAttribute('r', String(ARC_R));
      }
      arc.setAttribute('stroke-dasharray', `0 ${ARC_LEN}`);
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
        this.hoverId = s.id;
        this.showCard(s.id);
      });
      node.addEventListener('pointerleave', () => {
        this.highlightSynergies(s.id, false);
        if (!this.pinned) this.showDetail(this.focused ?? this.defaultFocus());
        this.hoverId = null;
        this.hideCard();
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
      label.style.left = `${x - CELL_W / 2}px`;
      label.style.top = `${y + NODE / 2 + 9}px`;
      label.style.width = `${CELL_W}px`;

      this.board.appendChild(node);
      this.board.appendChild(label);
      this.nodes.set(s.id, { def: s, root: node, rank, arc, x, y });
    }

    this.drawLines();
    this.syncStates();
    if (this.hoverId && this.nodes.has(this.hoverId)) this.showCard(this.hoverId);
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

  // -- hover card ------------------------------------------------------------

  /**
   * A small card beside the hovered node: what the next point buys, in
   * numbers, without the eye leaving the board. The detail pane on the right
   * keeps the long form.
   */
  private showCard(id: string): void {
    const c = save.account.current;
    const view = this.nodes.get(id);
    const s = skillById(id);
    if (!c || !view || !s) return;
    const card = this.card;
    clear(card);
    const rank = c.skills[id] ?? 0;
    const maxed = rank >= s.maxRank;
    const check = attempt(() => canAllocateSkill(c, id), { ok: false, reason: '' } as { ok: boolean; reason?: string });

    const hd = div('skcard-hd');
    hd.appendChild(span('skcard-name', s.name));
    hd.appendChild(span(`skcard-rank ${maxed ? 'is-max' : ''}`.trim(), `${rank}/${s.maxRank}`));
    card.appendChild(hd);

    const rows = rankRows(s, rank);
    if (rows.length) {
      const list = div('skcard-rows');
      for (const r of rows.slice(0, 4)) {
        const line = div('skcard-row');
        line.appendChild(span('skcard-l', r.label));
        if (maxed) {
          line.appendChild(span('skcard-n', r.cur));
        } else {
          if (rank > 0) {
            line.appendChild(span('skcard-c', r.cur));
            const arrow = span('skcard-a');
            arrow.innerHTML = iconSvg('chevronRight', { size: 9 });
            line.appendChild(arrow);
          }
          line.appendChild(span(`skcard-n ${r.cur !== r.nxt ? 'is-better' : ''}`.trim(), r.nxt));
        }
        list.appendChild(line);
      }
      card.appendChild(list);
    }

    let foot = '';
    let tone = '';
    if (maxed) {
      foot = 'Mastered';
      tone = 'is-max';
    } else if (rank === 0 && !check.ok) {
      foot = check.reason || 'Locked';
      tone = 'is-bad';
    } else if (c.skillPoints <= 0) {
      foot = 'No points to spend';
      tone = 'is-dim';
    } else {
      foot = rank > 0 ? `Click to raise to rank ${rank + 1}` : 'Click to learn';
      tone = 'is-go';
    }
    card.appendChild(div(`skcard-foot ${tone}`, foot));

    // Beside the node, on whichever side has room; nudged up near the bottom.
    const right = view.x < (COLS * CELL_W) / 2 + 1;
    card.classList.toggle('on-left', !right);
    card.style.left = right ? `${view.x + NODE / 2 + 14}px` : '';
    card.style.right = right ? '' : `${COLS * CELL_W - view.x + NODE / 2 + 14}px`;
    card.style.top = `${Math.min(view.y - NODE / 2 - 6, TIERS * CELL_H - 150)}px`;
    this.board.appendChild(card);
    card.classList.remove('is-shown');
    void card.offsetWidth;
    card.classList.add('is-shown');
  }

  private hideCard(): void {
    this.card.classList.remove('is-shown');
    this.card.remove();
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
        const midY = (from.y + view.y) / 2;
        // A vertical S-curve reads as a dependency without cluttering the grid.
        const d =
          `M${from.x} ${from.y + NODE / 2 - 6} ` +
          `C${from.x} ${midY}, ${view.x} ${midY}, ${view.x} ${view.y - NODE / 2 + 6}`;
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
        dot.setAttribute('cy', String(view.y - NODE / 2 + 4));
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
      view.arc.setAttribute('stroke-dasharray', `${(ARC_LEN * k).toFixed(1)} ${ARC_LEN.toFixed(1)}`);
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
      events.emit('toast', { text: `${s.name} is already at maximum rank.`, kind: 'info' });
      return;
    }
    const check = attempt(() => canAllocateSkill(c, s.id), { ok: false, reason: 'Locked' } as { ok: boolean; reason?: string });
    if (!check.ok) {
      events.emit('toast', { text: check.reason ?? 'You cannot learn that yet.', kind: 'bad' });
      const view = this.nodes.get(s.id);
      view?.root.classList.remove('shake');
      void view?.root.offsetWidth;
      view?.root.classList.add('shake');
      return;
    }
    if (c.skillPoints <= 0) {
      events.emit('toast', { text: 'No skill points to spend.', kind: 'bad' });
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
    events.emit('toast', { text: `${def.name} bound to slot ${at + 1}`, kind: 'good' });
  }

  // -- detail pane ---------------------------------------------------------

  private showDetail(id: string | null): void {
    clear(this.detail);
    const c = save.account.current;
    if (!id || !c) {
      this.detail.appendChild(emptyState('Hover a skill to inspect it.', 'skillLevels'));
      return;
    }
    const s = skillById(id);
    if (!s) return;
    const rank = c.skills[id] ?? 0;
    const next = Math.min(s.maxRank, rank + 1);
    const accent = classAccent(c.classId);
    this.detail.style.setProperty('--accent', accent);

    const hd = div('skdetail-hd');
    const art = div('skdetail-art');
    art.innerHTML = `<img class="skill-img" src="${skillIconUri(s.id, skillDefFor(s.id)?.effect, skillDefFor(s.id)?.damageType, skillDefFor(s.id)?.targeting === 'passive', skillDefFor(s.id)?.icon)}" alt="" style="width:62px;height:62px" draggable="false">`;
    const titles = div('skdetail-titles');
    titles.appendChild(div('skdetail-name', s.name));
    const meta = div('skdetail-meta');
    meta.appendChild(span('skdetail-chip', `Tier ${s.tier}`));
    meta.appendChild(span('skdetail-chip', TARGETING_LABEL[s.targeting] ?? s.targeting));
    if (s.damageType) meta.appendChild(span(`skdetail-chip dmg-${s.damageType}`, capitalize(s.damageType)));
    meta.appendChild(span(`skdetail-chip ${rank > 0 ? 'is-on' : ''}`, `Rank ${rank} / ${s.maxRank}`));
    titles.appendChild(meta);
    add(hd, art, titles);
    this.detail.appendChild(hd);

    this.detail.appendChild(div('skdetail-desc', s.desc));

    // --- current vs next ---------------------------------------------------
    const rows = rankRows(s, rank);

    if (rows.length) {
      const sec = section(rank >= s.maxRank ? 'At Maximum Rank' : 'This Rank → Next Rank', 'chevronRight');
      const table = div('skdetail-table');
      const head = div('skdetail-trow is-head');
      head.appendChild(span('skdetail-tl', ''));
      head.appendChild(span('skdetail-tc', `Rank ${Math.max(1, rank)}`));
      head.appendChild(span('skdetail-ta', ''));
      head.appendChild(span('skdetail-tn', rank >= s.maxRank ? '—' : `Rank ${next}`));
      table.appendChild(head);
      for (const r of rows) {
        const line = div('skdetail-trow');
        const l = span('skdetail-tl');
        if (r.icon) l.appendChild(icon(r.icon, { size: 12 }));
        l.appendChild(span('', r.label));
        line.appendChild(l);
        line.appendChild(span('skdetail-tc', r.cur));
        const arrow = span('skdetail-ta');
        arrow.innerHTML = iconSvg('chevronRight', { size: 11 });
        line.appendChild(arrow);
        line.appendChild(span(`skdetail-tn ${r.cur !== r.nxt ? 'is-better' : ''}`.trim(), rank >= s.maxRank ? '—' : r.nxt));
        table.appendChild(line);
      }
      sec.body.appendChild(table);
      this.detail.appendChild(sec.root);
    }

    // --- synergies ----------------------------------------------------------
    // Hard ranks in other skills that make this one stronger, and the skills
    // a rank here makes stronger (`SYNERGIES`; +skills gear does not count).
    const gains = synergiesFor(s.id);
    const gives = synergiesFrom(s.id);
    if (gains.length || gives.length) {
      const sec = section('Synergies', 'plus');
      if (gains.length) {
        const total = synergyPct(s.id, c.skills);
        const what = s.damageScale || s.targeting !== 'passive' ? 'damage' : 'power';
        sec.body.appendChild(
          div('skdetail-note', total > 0 ? `Ranks in these skills add ${what} to this one: +${fmt(total)}% now.` : `Ranks in these skills add ${what} to this one.`),
        );
        const r = div('skdetail-links');
        for (const l of gains) {
          const have = c.skills[l.source] ?? 0;
          const name = skillById(l.source)?.name ?? l.source;
          r.appendChild(span(`skdetail-link ${have > 0 ? 'ok' : ''}`.trim(), `${name} +${fmt(l.pctPerRank)}% a rank${have > 0 ? ` (+${fmt(l.pctPerRank * have)}%)` : ''}`));
        }
        sec.body.appendChild(r);
      }
      if (gives.length) {
        const r = div('skdetail-links');
        r.appendChild(span('skdetail-linklabel', 'Each rank adds'));
        for (const l of gives) r.appendChild(span('skdetail-link', `+${fmt(l.pctPerRank)}% to ${skillById(l.target)?.name ?? l.target}`));
        sec.body.appendChild(r);
      }
      this.detail.appendChild(sec.root);
    }

    // --- combo ---------------------------------------------------------------
    const combo = comboForSkill(s);
    if (combo && canCombo(s)) {
      const sec = section(`Combo: ${combo.name}`, 'sparkle');
      sec.body.appendChild(
        div(
          'skdetail-note',
          `Land this on a target another of your skills hit in the last ${COMBO_WINDOW}s: +${comboBonusPct(s)}% damage. ${combo.desc} The same skill twice in a row does not combo.`,
        ),
      );
      this.detail.appendChild(sec.root);
    }

    // --- prerequisites -------------------------------------------------------
    const reqs = s.requires ?? [];
    const dependents = skillsInTree(s.treeId).filter((o) => (o.requires ?? []).includes(s.id));
    if (reqs.length || dependents.length) {
      const sec = section('Connections', 'skillLevels');
      if (reqs.length) {
        const r = div('skdetail-links');
        r.appendChild(span('skdetail-linklabel', 'Requires'));
        for (const q of reqs) {
          const d = skillById(q);
          const got = (c.skills[q] ?? 0) > 0;
          r.appendChild(span(`skdetail-link ${got ? 'ok' : 'missing'}`, d?.name ?? q));
        }
        sec.body.appendChild(r);
      }
      if (dependents.length) {
        const r = div('skdetail-links');
        r.appendChild(span('skdetail-linklabel', 'Unlocks'));
        for (const d of dependents) r.appendChild(span('skdetail-link', d.name));
        sec.body.appendChild(r);
      }
      this.detail.appendChild(sec.root);
    }

    // --- actions -----------------------------------------------------------
    const actions = div('skdetail-actions');
    const check = attempt(() => canAllocateSkill(c, s.id), { ok: false, reason: '' } as { ok: boolean; reason?: string });
    const spend = document.createElement('button');
    spend.type = 'button';
    spend.className = 'btn btn-primary btn-wide';
    const canSpend = check.ok && c.skillPoints > 0 && rank < s.maxRank;
    spend.disabled = !canSpend;
    spend.innerHTML = `<span class="btn-label">${rank >= s.maxRank ? 'Mastered' : rank > 0 ? `Raise to Rank ${next}` : 'Learn Skill'}</span>`;
    spend.addEventListener('click', () => this.spend(s));
    actions.appendChild(spend);

    if (!check.ok && rank === 0 && check.reason) {
      actions.appendChild(div('skdetail-locked', check.reason));
    } else if (c.skillPoints <= 0 && rank < s.maxRank) {
      actions.appendChild(div('skdetail-locked', 'No skill points — level up to earn more.'));
    }

    if (s.targeting !== 'passive' && rank > 0) {
      const isPrimary = c.primaryAttack === s.id;
      const rc = document.createElement('button');
      rc.type = 'button';
      rc.className = `btn btn-wide btn-sm ${isPrimary ? 'btn-primary' : 'btn-ghost'}`;
      rc.innerHTML = `<span class="btn-label">${
        isPrimary ? 'On right click' : 'Set as right click attack'
      }</span>`;
      rc.disabled = isPrimary;
      rc.addEventListener('click', () => {
        if (setPrimaryAttack(c, s.id)) {
          save.touch();
          events.emit('toast', { text: `${s.name} bound to right click.`, kind: 'good' });
          events.emit('ui:refresh', {});
          this.refresh();
        }
      });
      actions.appendChild(rc);

      const bind = document.createElement('button');
      bind.type = 'button';
      bind.className = 'btn btn-ghost btn-wide btn-sm';
      bind.innerHTML = '<span class="btn-label">Bind to a number key</span>';
      bind.addEventListener('click', () => this.bindToHotbar(s.id));
      actions.appendChild(bind);
      actions.appendChild(div('skdetail-draghint', 'or drag the node onto a hotbar slot'));
    }
    this.detail.appendChild(actions);
  }

  // -- hotbar strip --------------------------------------------------------

  private renderHotStrip(c: Character): void {
    clear(this.hotStrip);
    this.hotStrip.appendChild(span('skill-hotlabel', 'Hotbar'));
    const strip = div('skill-hotslots');
    while (c.hotbar.length < 6) c.hotbar.push(null);
    for (let i = 0; i < 6; i++) {
      const id = c.hotbar[i];
      const cell = div('skill-hotcell');
      cell.appendChild(span('skill-hotkey', String(i + 1)));
      if (id) {
        const d = skillById(id);
        const art = div('skill-hotart');
        // The skill's own painted icon, as on its node and the HUD hotbar.
        const def = skillDefFor(id);
        art.innerHTML = `<img class="skill-img" src="${skillIconUri(id, def?.effect, def?.damageType, def?.targeting === 'passive', def?.icon)}" alt="" style="width:36px;height:36px" draggable="false">`;
        cell.appendChild(art);
        cell.title = d?.name ?? id;
        cell.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          c.hotbar[i] = null;
          save.touch();
          events.emit('ui:refresh', {});
        });
      } else {
        cell.classList.add('is-empty');
      }
      strip.appendChild(cell);
    }
    this.hotStrip.appendChild(strip);
  }
}

const TARGETING_LABEL: Record<string, string> = {
  self: 'Self',
  point: 'Ground Target',
  direction: 'Directional',
  enemy: 'Single Target',
  passive: 'Passive',
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
    rows.push({ label: 'Damage', cur: rank > 0 ? `${Math.round(a * 100)}%` : '—', nxt: `${Math.round(b * 100)}%`, icon: 'sword' });
  }
  rows.push(...powerRows(s, rank, next));
  if (s.manaCost) {
    const a = attempt(() => s.manaCost?.(Math.max(1, rank)) ?? 0, 0);
    const b = attempt(() => s.manaCost?.(next) ?? 0, 0);
    rows.push({ label: 'Mana Cost', cur: rank > 0 ? numFmt(a) : '—', nxt: numFmt(b), icon: 'mana' });
  }
  if (s.cooldown) {
    const a = attempt(() => s.cooldown?.(Math.max(1, rank)) ?? 0, 0);
    const b = attempt(() => s.cooldown?.(next) ?? 0, 0);
    if (a > 0 || b > 0) rows.push({ label: 'Cooldown', cur: rank > 0 ? `${a.toFixed(1)}s` : '—', nxt: `${b.toFixed(1)}s`, icon: 'cooldown' });
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
  const secs = (v: number): string => `${v.toFixed(1)}s`;
  const statRows = (mods: (k: number) => Partial<Record<StatKey, number>> | undefined, foe: boolean): void => {
    const first = attempt(() => mods(0), undefined) ?? {};
    let keys = Object.keys(first) as StatKey[];
    const allResist = RESISTS.every((r) => first[r] !== undefined && first[r] === first.physicalResist);
    if (allResist) keys = ['physicalResist', ...keys.filter((key) => !RESISTS.includes(key))];
    for (const key of keys) {
      const label = allResist && key === 'physicalResist' ? 'All Resistances' : STAT_LABEL[key];
      const suffix = PERCENT_STATS.has(key) || RESISTS.includes(key) ? '%' : '';
      row(foe ? `Enemy ${label}` : label, (k) => mods(k)?.[key], (v) => `${signed(v)}${suffix}`, STAT_ICON[key]);
    }
  };

  const summon = /^summon\./.test(s.effect ?? '');
  if (summon && !s.damageScale) {
    row('Minion Damage', (k) => n('damagePct', 50) * burstGrowth(s.id, k, n), pct, 'sword');
    row('Minion Life', (k) => n('lifePct', 40) * minionLifeGrowth(s.id, k, n), (v) => `${fmt(v)}% of yours`, 'life');
  } else if (!s.damageScale && BURST_POWER[s.id]) {
    row('Power', (k) => 100 * burstGrowth(s.id, k, n), pct, 'sword');
  }
  const self = SELF_POWER[s.id];
  if (self) {
    statRows((k) => self(k, n).mods, false);
    row('Ward', (k) => self(k, n).absorb, fmt, 'shield');
    row('Ward', (k) => self(k, n).absorbLifePct, (v) => `${fmt(v)}% of life`, 'shield');
    row('Heal', (k) => self(k, n).healPct, (v) => `${fmt(v)}% of life`, 'life');
    row('Duration', (k) => self(k, n).duration, secs, 'cooldown');
  }
  const foe = FOE_POWER[s.id];
  if (foe) {
    statRows((k) => foe(k, n).mods, true);
    row('Effect Time', (k) => foe(k, n).duration, secs, 'cooldown');
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
