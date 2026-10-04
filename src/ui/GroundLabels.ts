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

const GAP = 3;

function hex(n: number): string {
  return '#' + (n >>> 0).toString(16).padStart(6, '0');
}

export class GroundLabelLayer {
  private container: HTMLDivElement;
  private pool: Label[] = [];
  private tmp = new THREE.Vector3();

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

    const label: Label = { root, name, type, detail, tether, uid: '', inUse: true, w: 0, h: 0 };

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
      if (!e.shiftKey) this.onPickUp?.(label.uid);
    });

    this.pool.push(label);
    return label;
  }

  /** Rebuilds a label's contents only when the item under it changes. */
  private paint(l: Label, item: Item, detailed: boolean): void {
    const key = `${item.uid}|${detailed ? 'full' : 'short'}`;
    if (l.root.dataset.key === key) return;
    const sameItem = l.root.dataset.key?.startsWith(`${item.uid}|`) ?? false;
    l.root.dataset.key = key;

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

    // Measure the short form once per item: the declutter pass works in these
    // sizes, and reading layout every frame for every label is not free.
    if (!sameItem) {
      l.root.style.display = '';
      l.w = l.name.offsetWidth + 4;
      l.h = l.name.offsetHeight + (tag ? l.type.offsetHeight + 2 : 0);
    }
  }

  update(
    camera: THREE.Camera,
    entries: Iterable<GroundEntry>,
    focus: THREE.Vector3,
    width: number,
    height: number,
    shiftHeld: boolean
  ): void {
    for (const l of this.pool) l.inUse = false;

    camera.updateMatrixWorld();
    const placed: Placed[] = [];

    for (const e of entries) {
      const dx = e.pos.x - focus.x;
      const dz = e.pos.z - focus.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > this.maxDistance * this.maxDistance) continue;

      const head = this.tmp.set(e.pos.x, e.pos.y + 0.95, e.pos.z);
      const proj = head.project(camera);
      if (proj.z > 1) continue;
      if (proj.x < -1.1 || proj.x > 1.1 || proj.y < -1.1 || proj.y > 1.1) continue;

      const l = this.acquire();
      l.uid = e.item.uid;
      const detailed = shiftHeld && this.hovered === e.item.uid;
      this.paint(l, e.item, detailed);
      l.root.classList.toggle('is-detailed', detailed);

      placed.push({
        l,
        x: (proj.x * 0.5 + 0.5) * width,
        y: (-proj.y * 0.5 + 0.5) * height,
        rank: RARITY_ORDER.indexOf(e.item.rarity),
        d2,
      });
    }

    // Declutter: best rarity first, then nearest, keep their spot; anything
    // that would overlap a placed label is lifted above it. A handful of
    // labels at most, so the pairwise pass is cheap.
    placed.sort((a, b) => b.rank - a.rank || a.d2 - b.d2);
    const boxes: Array<{ x0: number; x1: number; y0: number; y1: number }> = [];
    for (const p of placed) {
      const half = p.l.w / 2;
      let bottom = p.y;
      for (let guard = 0; guard < 12; guard++) {
        const top = bottom - p.l.h;
        let hit: { y0: number } | null = null;
        for (const b of boxes) {
          if (p.x + half <= b.x0 || p.x - half >= b.x1) continue;
          if (bottom <= b.y0 || top >= b.y1) continue;
          if (!hit || b.y0 < hit.y0) hit = b;
        }
        if (!hit) break;
        bottom = hit.y0 - GAP;
      }
      boxes.push({ x0: p.x - half, x1: p.x + half, y0: bottom - p.l.h, y1: bottom });
      const lift = p.y - bottom;
      const l = p.l;
      l.root.style.transform = `translate(-50%,-100%) translate(${p.x.toFixed(1)}px, ${bottom.toFixed(1)}px)`;
      l.root.style.display = '';
      if (lift > 2) {
        l.tether.style.height = `${lift.toFixed(0)}px`;
        l.root.classList.add('is-lifted');
      } else if (l.root.classList.contains('is-lifted')) {
        l.root.classList.remove('is-lifted');
      }
    }

    for (const l of this.pool) {
      if (!l.inUse) {
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
