/**
 * Ground-loot labels.
 *
 * Every dropped item wears a rarity-coloured nameplate on the floor, the way
 * ARPG players expect. Hovering shows a short summary; holding shift swaps it
 * for the full tooltip. Clicking the label picks the item up, so a small item
 * on a busy floor is never a pixel hunt.
 *
 * Labels are tiered by rarity (a plain tag for common junk up to a gilt,
 * capped plate with a light shaft for uniques and better) and decluttered:
 * the best drop keeps its spot, and anything that would cover it is lifted
 * clear on a thin tether back to the item.
 */
import * as THREE from 'three';
import type { Item, ItemRarity } from '../types';
import { RARITY_ORDER } from '../types';
import { itemDisplayName, itemTooltipLines, itemLabelColor, itemTypeTag } from '../sim/Loot';

export interface GroundEntry {
  item: Item;
  root: THREE.Object3D;
  pos: THREE.Vector3;
}

interface Label {
  root: HTMLDivElement;
  name: HTMLSpanElement;
  /** What the item is — Sword, Ring, Rune — under the name. */
  type: HTMLSpanElement;
  detail: HTMLDivElement;
  /** Thin line back to the item when the label was lifted out of a pile. */
  tether: HTMLSpanElement;
  uid: string;
  inUse: boolean;
  /** Short-form size, measured once per contents change. */
  w: number;
  h: number;
  /** The item and form its contents were last built for. */
  paintedUid: string;
  paintedFull: boolean;
  /** What was last written to the page, so a still label writes nothing. */
  shownX: number;
  shownY: number;
  shownLift: number;
  shown: boolean;
  detailed: boolean;
}

/** Rarities that get the full treatment: gilt caps and a light shaft. */
const BEAM: ReadonlySet<ItemRarity> = new Set<ItemRarity>(['unique', 'set', 'mythic', 'ancient']);

interface Placed {
  l: Label;
  x: number;
  y: number;
  rank: number;
  d2: number;
}

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const GAP = 3;

function hex(n: number): string {
  return '#' + (n >>> 0).toString(16).padStart(6, '0');
}

export class GroundLabelLayer {
  private container: HTMLDivElement;
  private pool: Label[] = [];
  /** The label each item wore last frame: it keeps it while it stays in view. */
  private byUid = new Map<string, Label>();
  private tmp = new THREE.Vector3();
  private placed: Placed[] = [];
  private placedPool: Placed[] = [];
  /** The entries behind `placed`, by index, for this frame. */
  private pending: GroundEntry[] = [];
  /** Whether `placed[i]` kept last frame's label. */
  private kept: boolean[] = [];
  private boxes: Box[] = [];

  /** Set by the scene each frame; the uid the cursor is currently over. */
  hovered: string | null = null;
  /** Called when a label is clicked. Returns true if the item was taken. */
  onPickUp: ((uid: string) => boolean) | null = null;

  /** Labels past this range are hidden entirely. */
  maxDistance = 22;

  constructor(parent?: HTMLElement) {
    const host = parent ?? document.getElementById('ui') ?? document.body;
    this.container = document.createElement('div');
    this.container.className = 'groundlabels';
    host.appendChild(this.container);
    for (let i = 0; i < 12; i++) this.acquire();
    for (const l of this.pool) {
      l.inUse = false;
      l.root.style.display = 'none';
    }
  }

  private acquire(): Label {
    for (const l of this.pool) {
      if (!l.inUse) {
        l.inUse = true;
        return l;
      }
    }
    const root = document.createElement('div');
    // `ui-soft` marks a label as a *left-click* target only. It sits over the
    // playfield, so treating it as full UI meant standing near a dropped item
    // silently disabled the attack button.
    root.className = 'glabel ui-interactive ui-soft';
    const name = document.createElement('span');
    name.className = 'glabel-name';
    const type = document.createElement('span');
    type.className = 'glabel-type';
    const detail = document.createElement('div');
    detail.className = 'glabel-detail';
    const beam = document.createElement('span');
    beam.className = 'glabel-beam';
    const tether = document.createElement('span');
    tether.className = 'glabel-tether';
    root.append(beam, name, type, detail, tether);
    this.container.appendChild(root);

    const label: Label = { root, name, type, detail, tether, uid: '', inUse: true, w: 0, h: 0, paintedUid: '', paintedFull: false, shownX: NaN, shownY: NaN, shownLift: 0, shown: true, detailed: false };

    root.addEventListener('pointerenter', () => {
      this.hovered = label.uid;
      root.classList.add('is-hover');
    });
    root.addEventListener('pointerleave', () => {
      if (this.hovered === label.uid) this.hovered = null;
      root.classList.remove('is-hover');
    });
    root.addEventListener('pointerdown', (e) => {
      // Only the left button belongs to the label. Right-click has to reach the
      // game underneath, or you cannot attack a monster standing on loot.
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      // Shift too: items the loot filter hides only show while Shift is
      // held, so a Shift+click is the only way to take one.
      this.onPickUp?.(label.uid);
    });

    this.pool.push(label);
    return label;
  }

  /** Rebuilds a label's contents only when the item under it changes. */
  private paint(l: Label, item: Item, detailed: boolean): void {
    if (l.paintedUid === item.uid && l.paintedFull === detailed) return;
    const sameItem = l.paintedUid === item.uid;
    l.paintedUid = item.uid;
    l.paintedFull = detailed;

    // Gems wear their own stone colour and runes a single shared orange, so a
    // ruby reads red on the floor and a rune is never lost in a pile of grey
    // drops. Everything else stays rarity-coloured, because that is the
    // decision you make about gear.
    const colour = hex(itemLabelColor(item));
    l.root.style.setProperty('--gc', colour);
    l.root.dataset.rarity = item.rarity;
    l.name.textContent = itemDisplayName(item);

    // What it *is*, always. A name alone does not tell you a Sigil is an amulet.
    const tag = itemTypeTag(item);
    l.type.textContent = tag;
    l.type.style.display = tag ? '' : 'none';

    l.detail.textContent = '';
    let lines: Array<{ text: string; color: string; bold?: boolean }> = [];
    try {
      lines = itemTooltipLines(item);
    } catch {
      lines = [];
    }
    // Short form is the headline stats only; shift shows everything.
    const shown = detailed ? lines.slice(0, 18) : lines.slice(1, 5);
    for (const line of shown) {
      if (!line.text) continue;
      const row = document.createElement('div');
      row.className = 'glabel-line';
      row.style.color = line.color;
      if (line.bold) row.style.fontWeight = '600';
      row.textContent = line.text;
      l.detail.appendChild(row);
    }
    l.detail.classList.toggle('is-full', detailed);
    l.root.classList.toggle('has-beam', BEAM.has(item.rarity));

    // The short form is measured once per item (`measure`): the declutter
    // pass works in these sizes, and reading layout every frame is not free.
    if (!sameItem) l.w = -1;
  }

  /**
   * Sizes of labels just built, read together after every label is written:
   * a read between writes lays the page out again, once per new label (a
   * boss's pile of drops did that dozens of times in one frame).
   */
  private measure(placed: readonly Placed[]): void {
    for (let pi = 0; pi < placed.length; pi++) {
      const p = placed[pi]!;
      if (p.l.w >= 0 || p.l.shown) continue;
      p.l.shown = true;
      p.l.root.style.display = '';
    }
    for (let pi = 0; pi < placed.length; pi++) {
      const p = placed[pi]!;
      const l = p.l;
      if (l.w >= 0) continue;
      l.w = l.name.offsetWidth + 4;
      l.h = l.name.offsetHeight + (l.type.style.display === 'none' ? 0 : l.type.offsetHeight + 2);
    }
  }

  update(
    camera: THREE.Camera,
    entries: readonly GroundEntry[],
    focus: THREE.Vector3,
    width: number,
    height: number,
    shiftHeld: boolean
  ): void {
    for (let li = 0; li < this.pool.length; li++) {
      const l = this.pool[li]!;
      l.inUse = false;
    }

    camera.updateMatrixWorld();
    const placed = this.placed;
    let n = 0;

    const pending = this.pending;
    for (let ei = 0; ei < entries.length; ei++) {
      const e = entries[ei]!;
      const dx = e.pos.x - focus.x;
      const dz = e.pos.z - focus.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > this.maxDistance * this.maxDistance) continue;

      const head = this.tmp.set(e.pos.x, e.pos.y + 0.95, e.pos.z);
      const proj = head.project(camera);
      if (proj.z > 1) continue;
      if (proj.x < -1.1 || proj.x > 1.1 || proj.y < -1.1 || proj.y > 1.1) continue;
      const p = (this.placedPool[n] ??= { l: this.pool[0]!, x: 0, y: 0, rank: 0, d2: 0 });
      placed[n] = p;
      p.x = (proj.x * 0.5 + 0.5) * width;
      p.y = (-proj.y * 0.5 + 0.5) * height;
      p.rank = RARITY_ORDER.indexOf(e.item.rarity);
      p.d2 = d2;
      // An item keeps the label it wore last frame: one handed to another
      // item is rebuilt and measured again, which forces a page layout.
      const own = this.byUid.get(e.item.uid);
      const keep = own && own.uid === e.item.uid ? own : null;
      if (keep) {
        keep.inUse = true;
        p.l = keep;
      }
      this.kept[n] = keep !== null;
      pending[n++] = e;
    }
    // New arrivals take whatever label nobody in view is wearing.
    for (let i = 0; i < n; i++) {
      const e = pending[i]!;
      const p = placed[i]!;
      if (!this.kept[i]) {
        const l = this.acquire();
        this.byUid.delete(l.uid);
        l.uid = e.item.uid;
        this.byUid.set(l.uid, l);
        p.l = l;
      }
      const l = p.l;
      const detailed = shiftHeld && this.hovered === e.item.uid;
      this.paint(l, e.item, detailed);
      if (l.detailed !== detailed) {
        l.detailed = detailed;
        l.root.classList.toggle('is-detailed', detailed);
      }
    }
    placed.length = n;
    // Cut to this frame's count, not emptied: `length = 0` threw the storage
    // away to be grown again next frame.
    pending.length = n;
    this.measure(placed);

    // Declutter: best rarity first, then nearest, keep their spot; anything
    // that would overlap a placed label is lifted above it. A handful of
    // labels at most, so the pairwise pass is cheap.
    placed.sort((a, b) => b.rank - a.rank || a.d2 - b.d2);
    const boxes = this.boxes;
    let nb = 0;
    for (let pi = 0; pi < placed.length; pi++) {
      const p = placed[pi]!;
      const half = p.l.w / 2;
      let bottom = p.y;
      for (let guard = 0; guard < 12; guard++) {
        const top = bottom - p.l.h;
        let hit: { y0: number } | null = null;
        for (let k = 0; k < nb; k++) {
          const b = boxes[k]!;
          if (p.x + half <= b.x0 || p.x - half >= b.x1) continue;
          if (bottom <= b.y0 || top >= b.y1) continue;
          if (!hit || b.y0 < hit.y0) hit = b;
        }
        if (!hit) break;
        bottom = hit.y0 - GAP;
      }
      const b = (boxes[nb++] ??= { x0: 0, x1: 0, y0: 0, y1: 0 });
      b.x0 = p.x - half;
      b.x1 = p.x + half;
      b.y0 = bottom - p.l.h;
      b.y1 = bottom;
      const lift = Math.round(p.y - bottom);
      const l = p.l;
      // Written only when it moved: a hundred labels on a still screen
      // otherwise restyle the page every frame.
      const x = Math.round(p.x * 2) / 2;
      const y = Math.round(bottom * 2) / 2;
      if (x !== l.shownX || y !== l.shownY) {
        l.shownX = x;
        l.shownY = y;
        l.root.style.transform = `translate(-50%,-100%) translate(${x}px, ${y}px)`;
      }
      if (!l.shown) {
        l.shown = true;
        l.root.style.display = '';
      }
      if (lift !== l.shownLift) {
        if (lift > 2) {
          l.tether.style.height = `${lift}px`;
          if (l.shownLift <= 2) l.root.classList.add('is-lifted');
        } else if (l.shownLift > 2) l.root.classList.remove('is-lifted');
        l.shownLift = lift;
      }
    }

    for (let li = 0; li < this.pool.length; li++) {
      const l = this.pool[li]!;
      if (!l.inUse && l.shown) {
        l.shown = false;
        l.root.style.display = 'none';
        l.root.classList.remove('is-hover');
      }
    }
  }

  dispose(): void {
    this.container.remove();
    this.pool = [];
  }
}
