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
import {
  Panel,
  Tabs,
  add,
  clear,
  div,
  span,
  icon,
  iconSvg,
  sigilSvg,
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
  type DragPayload,
} from './Widgets';
import { skillIconUri } from '../art/Icons';
import { SKILL_BY_ID } from '../data/skills';

const CELL_W = 122;
const CELL_H = 104;
const NODE = 66;
const TIERS = 6;
const COLS = 3;

interface NodeView {
  def: SkillDef;
  root: HTMLDivElement;
  rank: HTMLDivElement;
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
  private hotStrip: HTMLDivElement;
  private treeBlurb: HTMLDivElement;

  private nodes = new Map<string, NodeView>();
  private activeTree = '';
  private focused: string | null = null;
  private pinned: string | null = null;

  constructor() {
    this.panel = new Panel({
      id: 'skills',
      title: 'Skills',
      subtitle: 'Every point is permanent — this character dies with its build',
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
    const head = div('skill-head');
    add(head, this.tabs.root, this.pointsEl);

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
      if (this.panel.isOpen) this.refresh();
    });
    events.on('player:levelUp', () => {
      if (this.panel.isOpen) this.refresh();
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
    for (let t = 1; t <= TIERS; t++) {
      const rail = div('skill-tierrail');
      rail.style.top = `${(t - 1) * CELL_H}px`;
      rail.style.height = `${CELL_H}px`;
      const need = (t - 1) * 5;
      rail.appendChild(span('skill-tiernum', `T${t}`));
      if (need > 0) rail.appendChild(span('skill-tierreq', `${need} pts`));
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
      art.innerHTML = `<img class="skill-img" src="${skillIconUri(s.id, skillDefFor(s.id)?.effect, skillDefFor(s.id)?.damageType, skillDefFor(s.id)?.targeting === 'passive', skillDefFor(s.id)?.icon)}" alt="" style="width:NODE - 18px;height:NODE - 18px" draggable="false">`;
      const frame = div('sknode-frame');
      const rank = div('sknode-rank');
      const lock = div('sknode-lock');
      lock.innerHTML = iconSvg('lock', { size: 15 });
      add(node, art, frame, rank, lock);
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

      const label = div('sknode-label', s.name);
      label.style.left = `${x - CELL_W / 2}px`;
      label.style.top = `${y + NODE / 2 - 4}px`;
      label.style.width = `${CELL_W}px`;

      this.board.appendChild(node);
      this.board.appendChild(label);
      this.nodes.set(s.id, { def: s, root: node, rank, x, y });
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
      view.root.title = check.ok ? '' : check.reason ?? '';
    }
    // Lines light up once their prerequisite is actually taken.
    const paths = this.lines.querySelectorAll<SVGPathElement>('.skline, .skline-dot');
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
    events.emit('sfx', { id: 'ui.levelup' });
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
    const rows: Array<{ label: string; cur: string; nxt: string; icon?: string }> = [];
    const numFmt = (v: number, suffix = ''): string => `${fmt(v)}${suffix}`;

    if (s.damageScale) {
      const a = attempt(() => s.damageScale?.(Math.max(1, rank)) ?? 0, 0);
      const b = attempt(() => s.damageScale?.(next) ?? 0, 0);
      rows.push({ label: 'Damage', cur: rank > 0 ? `${Math.round(a * 100)}%` : '—', nxt: `${Math.round(b * 100)}%`, icon: 'sword' });
    }
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

    // --- prerequisites & synergies ----------------------------------------
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
        art.innerHTML = sigilSvg(id, classAccent(c.classId), 34);
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
