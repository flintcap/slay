/**
 * Enemy nameplates.
 *
 * A DOM overlay rather than sprites: text stays crisp at any resolution, the
 * layout engine handles wrapping and chips for free, and it costs no draw
 * calls. Plates are pooled and only the visible ones are positioned each frame.
 */
import * as THREE from 'three';
import type { MonsterRank } from '../types';
import { affixIconUri } from '../art/Icons';

/** The shape both Enemy and Boss expose via their `nameplate` getter. */
export interface PlateData {
  name: string;
  rank: MonsterRank;
  affixes: string[];
  life: number;
  maxLife: number;
  color: number;
  level: number;
  /** Behaviour ids, parallel to `affixes`, used to pick badge glyphs. */
  affixBehaviors?: string[];
  affixColors?: number[];
}

/** Anything that can wear a plate. */
export interface PlateTarget {
  root: THREE.Object3D;
  life: number;
  nameplate: PlateData;
  /** Roughly how tall the model is, so the plate clears its head. */
  plateHeight?: number;
}

const RANK_LABEL: Partial<Record<MonsterRank, string>> = {
  champion: 'Champion',
  elite: 'Elite',
  rare: 'Rare',
  boss: 'Boss',
};

interface Plate {
  root: HTMLDivElement;
  title: HTMLDivElement;
  nameEl: HTMLSpanElement;
  levelEl: HTMLSpanElement;
  rankEl: HTMLSpanElement;
  barFill: HTMLDivElement;
  chips: HTMLDivElement;
  /** What the DOM currently shows, so we only touch it on change. */
  key: string;
  pct: number;
  inUse: boolean;
}

function hex(n: number): string {
  return '#' + (n >>> 0).toString(16).padStart(6, '0');
}

export class NameplateLayer {
  private container: HTMLDivElement;
  private pool: Plate[] = [];
  // Preallocated scratch: this loop runs for every visible monster every frame,
  // and allocating Vector3s here is what turns a fight into a GC stutter.
  private tmpCam = new THREE.Vector3();
  private tmpFwd = new THREE.Vector3();
  private tmpHead = new THREE.Vector3();
  private tmpProj = new THREE.Vector3();

  /** Plates fade out past this distance so the screen stays readable. */
  maxDistance = 26;

  constructor(parent?: HTMLElement) {
    const host = parent ?? document.getElementById('ui') ?? document.body;
    this.container = document.createElement('div');
    this.container.className = 'nameplates';
    host.appendChild(this.container);
    // Build the pool up front. Creating a dozen plates in the frame a pack
    // first comes into view is a visible hitch.
    for (let i = 0; i < 16; i++) this.acquire();
    for (const p of this.pool) {
      p.inUse = false;
      p.root.style.display = 'none';
    }
  }

  private acquire(): Plate {
    for (const p of this.pool) {
      if (!p.inUse) {
        p.inUse = true;
        return p;
      }
    }
    const root = document.createElement('div');
    root.className = 'nameplate';

    const title = document.createElement('div');
    title.className = 'np-title';
    const nameEl = document.createElement('span');
    nameEl.className = 'np-name';
    const levelEl = document.createElement('span');
    levelEl.className = 'np-level';
    const rankEl = document.createElement('span');
    rankEl.className = 'np-rank';
    title.append(levelEl, nameEl, rankEl);

    const bar = document.createElement('div');
    bar.className = 'np-bar';
    const barFill = document.createElement('div');
    barFill.className = 'np-bar-fill';
    bar.appendChild(barFill);

    const chips = document.createElement('div');
    chips.className = 'np-chips';

    root.append(title, bar, chips);
    this.container.appendChild(root);

    const plate: Plate = { root, title, nameEl, levelEl, rankEl, barFill, chips, key: '', pct: -1, inUse: true };
    this.pool.push(plate);
    return plate;
  }

  /** Rebuilds a plate's text only when its identity actually changed. */
  private paint(p: Plate, d: PlateData): void {
    const key = `${d.name}|${d.rank}|${d.level}|${d.affixes.join(',')}`;
    if (p.key === key) return;
    p.key = key;

    p.nameEl.textContent = d.name;
    p.levelEl.textContent = String(d.level);
    const label = RANK_LABEL[d.rank];
    p.rankEl.textContent = label ?? '';
    p.rankEl.style.display = label ? '' : 'none';

    const c = hex(d.color);
    p.root.style.setProperty('--np-color', c);
    p.root.dataset.rank = d.rank;

    p.chips.textContent = '';
    // Cap the badges so a heavily-affixed rare pack does not cover the screen.
    const shown = d.affixes.slice(0, 5);
    for (let i = 0; i < shown.length; i++) {
      const img = document.createElement('img');
      img.className = 'np-chip';
      img.src = affixIconUri(d.affixBehaviors?.[i], d.affixColors?.[i] ?? d.color);
      img.alt = shown[i] ?? '';
      img.title = shown[i] ?? '';
      img.draggable = false;
      p.chips.appendChild(img);
    }
    if (d.affixes.length > shown.length) {
      const more = document.createElement('span');
      more.className = 'np-more';
      more.textContent = `+${d.affixes.length - shown.length}`;
      p.chips.appendChild(more);
    }
    p.chips.style.display = shown.length ? '' : 'none';
  }

  /**
   * Positions a plate over every living target in view. Call once per frame
   * after the camera has been updated.
   */
  update(camera: THREE.Camera, targets: Iterable<PlateTarget>, focus: THREE.Vector3, width: number, height: number): void {
    for (const p of this.pool) p.inUse = false;

    camera.updateMatrixWorld();
    const camPos = this.tmpCam.setFromMatrixPosition(camera.matrixWorld);
    const forward = this.tmpFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);

    for (const t of targets) {
      if (t.life <= 0) continue;

      const world = t.root.position;
      // Skip anything the player is nowhere near — nameplates for monsters
      // across the level are noise, not information.
      // Cheap squared check before anything else runs.
      const ddx = world.x - focus.x;
      const ddz = world.z - focus.z;
      if (ddx * ddx + ddz * ddz > this.maxDistance * this.maxDistance) continue;

      const head = this.tmpHead.set(world.x, world.y + (t.plateHeight ?? 2.1), world.z);
      // Behind the camera projects to a valid-looking point; reject it.
      const bx = head.x - camPos.x;
      const by = head.y - camPos.y;
      const bz = head.z - camPos.z;
      if (bx * forward.x + by * forward.y + bz * forward.z <= 0) continue;

      const proj = this.tmpProj.copy(head).project(camera);
      if (proj.x < -1.2 || proj.x > 1.2 || proj.y < -1.2 || proj.y > 1.2) continue;

      const d = t.nameplate;
      const plate = this.acquire();
      this.paint(plate, d);

      const pct = d.maxLife > 0 ? Math.max(0, Math.min(1, d.life / d.maxLife)) : 0;
      if (Math.abs(pct - plate.pct) > 0.002) {
        plate.pct = pct;
        plate.barFill.style.transform = `scaleX(${pct})`;
      }

      const sx = (proj.x * 0.5 + 0.5) * width;
      const sy = (-proj.y * 0.5 + 0.5) * height;
      const dist = Math.hypot(world.x - focus.x, world.z - focus.z);
      // Fade with distance so the far edge of the pack does not shout.
      const fade = dist > this.maxDistance * 0.75
        ? 1 - (dist - this.maxDistance * 0.75) / (this.maxDistance * 0.25)
        : 1;
      plate.root.style.transform = `translate(-50%,-100%) translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
      plate.root.style.opacity = String(Math.max(0, Math.min(1, fade)));
      plate.root.style.display = '';
    }

    for (const p of this.pool) {
      if (!p.inUse) p.root.style.display = 'none';
    }
  }

  dispose(): void {
    this.container.remove();
    this.pool = [];
  }
}
