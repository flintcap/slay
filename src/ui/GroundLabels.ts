/**
 * Ground-loot labels.
 *
 * Every dropped item wears a rarity-coloured nameplate on the floor, the way
 * ARPG players expect. Hovering shows a short summary; holding shift swaps it
 * for the full tooltip. Clicking the label picks the item up, so a small item
 * on a busy floor is never a pixel hunt.
 */
import * as THREE from 'three';
import type { Item } from '../types';
import { RARITY_COLOR } from '../types';
import { itemDisplayName, itemTooltipLines } from '../sim/Loot';

export interface GroundEntry {
  item: Item;
  root: THREE.Object3D;
  pos: THREE.Vector3;
}

interface Label {
  root: HTMLDivElement;
  name: HTMLSpanElement;
  detail: HTMLDivElement;
  uid: string;
  inUse: boolean;
}

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
    root.className = 'glabel ui-interactive';
    const name = document.createElement('span');
    name.className = 'glabel-name';
    const detail = document.createElement('div');
    detail.className = 'glabel-detail';
    root.append(name, detail);
    this.container.appendChild(root);

    const label: Label = { root, name, detail, uid: '', inUse: true };

    root.addEventListener('pointerenter', () => {
      this.hovered = label.uid;
      root.classList.add('is-hover');
    });
    root.addEventListener('pointerleave', () => {
      if (this.hovered === label.uid) this.hovered = null;
      root.classList.remove('is-hover');
    });
    root.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (e.button === 0 && !e.shiftKey) this.onPickUp?.(label.uid);
    });

    this.pool.push(label);
    return label;
  }

  /** Rebuilds a label's contents only when the item under it changes. */
  private paint(l: Label, item: Item, detailed: boolean): void {
    const key = `${item.uid}|${detailed ? 'full' : 'short'}`;
    if (l.root.dataset.key === key) return;
    l.root.dataset.key = key;

    const colour = hex(RARITY_COLOR[item.rarity] ?? 0xc8c8c8);
    l.root.style.setProperty('--gc', colour);
    l.root.dataset.rarity = item.rarity;
    l.name.textContent = itemDisplayName(item);

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

    for (const e of entries) {
      const dx = e.pos.x - focus.x;
      const dz = e.pos.z - focus.z;
      if (dx * dx + dz * dz > this.maxDistance * this.maxDistance) continue;

      const head = this.tmp.set(e.pos.x, e.pos.y + 0.95, e.pos.z);
      const proj = head.project(camera);
      if (proj.z > 1) continue;
      if (proj.x < -1.1 || proj.x > 1.1 || proj.y < -1.1 || proj.y > 1.1) continue;

      const l = this.acquire();
      l.uid = e.item.uid;
      const detailed = shiftHeld && this.hovered === e.item.uid;
      this.paint(l, e.item, detailed);

      const sx = (proj.x * 0.5 + 0.5) * width;
      const sy = (-proj.y * 0.5 + 0.5) * height;
      l.root.style.transform = `translate(-50%,-100%) translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
      l.root.style.display = '';
      l.root.classList.toggle('is-detailed', detailed);
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
