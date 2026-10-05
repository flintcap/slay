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
  /**
   * A named rare's epithet, shown under the name. Only they have one, which is
   * what makes the plate read as somebody rather than as another Frenzied
   * Skeleton.
   */
  title?: string;
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
  /** The named-rare epithet line. Hidden for everything else. */
  epithet: HTMLDivElement;
  barFill: HTMLDivElement;
  /** Pale chunk that lingers where life just was, then drains to the fill. */
  barTrail: HTMLDivElement;
  chips: HTMLDivElement;
  /** What the DOM currently shows, so we only touch it on change. */
  key: string;
  pct: number;
  /** Where the trail sits, and when the last hit landed (ms). */
  trail: number;
  hitAt: number;
  inUse: boolean;
}

/** How long the trail holds before draining, and how fast it drains (1/s). */
const TRAIL_HOLD = 380;
const TRAIL_RATE = 5;

/** One target that survived the cheap culls this frame, before thinning. */
interface Candidate {
  t: PlateTarget;
  dist: number;
  sx: number;
  sy: number;
  /** Ordinary monsters are the ones thinned in a crowd. */
  ordinary: boolean;
  keep: boolean;
}

const byDistance = (a: Candidate, b: Candidate): number => a.dist - b.dist;

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
  private lastT = 0;

  /** Plates fade out past this distance so the screen stays readable. */
  maxDistance = 26;
  /**
   * Ordinary monsters in a crowd: only the nearest few keep a plate, and only
   * inside a tighter radius. Champions, elites, rares and bosses always keep
   * theirs. Without this a big fight is a wall of plates over the action.
   */
  maxOrdinaryPlates = 6;
  ordinaryDistance = 16;
  private cands: Candidate[] = [];
  private ordinaryScratch: Candidate[] = [];

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
    const barTrail = document.createElement('div');
    barTrail.className = 'np-bar-trail';
    const barFill = document.createElement('div');
    barFill.className = 'np-bar-fill';
    bar.append(barTrail, barFill);

    const epithet = document.createElement('div');
    epithet.className = 'np-epithet';

    const chips = document.createElement('div');
    chips.className = 'np-chips';

    root.append(title, epithet, bar, chips);
    this.container.appendChild(root);

    const plate: Plate = {
      root,
      title,
      nameEl,
      levelEl,
      rankEl,
      epithet,
      barFill,
      barTrail,
      chips,
      key: '',
      pct: -1,
      trail: -1,
      hitAt: 0,
      inUse: true,
    };
    this.pool.push(plate);
    return plate;
  }

  /** Rebuilds a plate's text only when its identity actually changed. */
  private paint(p: Plate, d: PlateData): void {
    const key = `${d.name}|${d.title ?? ''}|${d.rank}|${d.level}|${d.affixes.join(',')}`;
    if (p.key === key) return;
    p.key = key;
    // A new face on this pooled plate: no trail carried over from the last one.
    p.trail = -1;

    p.nameEl.textContent = d.name;
    p.epithet.textContent = d.title ?? '';
    p.epithet.style.display = d.title ? '' : 'none';
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
    const now = performance.now();
    const dt = this.lastT ? Math.min(0.1, (now - this.lastT) / 1000) : 0;
    this.lastT = now;

    camera.updateMatrixWorld();
    const camPos = this.tmpCam.setFromMatrixPosition(camera.matrixWorld);
    const forward = this.tmpFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);

    let n = 0;
    const ordinary = this.ordinaryScratch;
    ordinary.length = 0;
    for (const t of targets) {
      if (t.life <= 0) continue;

      const world = t.root.position;
      // Skip anything the player is nowhere near — nameplates for monsters
      // across the level are noise, not information.
      // Cheap squared check before anything else runs.
      const ddx = world.x - focus.x;
      const ddz = world.z - focus.z;
      const d2 = ddx * ddx + ddz * ddz;
      const isOrdinary = t.nameplate.rank === 'normal';
      const reach = isOrdinary ? Math.min(this.maxDistance, this.ordinaryDistance) : this.maxDistance;
      if (d2 > reach * reach) continue;

      const head = this.tmpHead.set(world.x, world.y + (t.plateHeight ?? 2.1), world.z);
      // Behind the camera projects to a valid-looking point; reject it.
      const bx = head.x - camPos.x;
      const by = head.y - camPos.y;
      const bz = head.z - camPos.z;
      if (bx * forward.x + by * forward.y + bz * forward.z <= 0) continue;

      const proj = this.tmpProj.copy(head).project(camera);
      if (proj.x < -1.2 || proj.x > 1.2 || proj.y < -1.2 || proj.y > 1.2) continue;

      let c = this.cands[n];
      if (!c) {
        c = { t, dist: 0, sx: 0, sy: 0, ordinary: false, keep: true };
        this.cands[n] = c;
      }
      n++;
      c.t = t;
      c.dist = Math.sqrt(d2);
      c.sx = (proj.x * 0.5 + 0.5) * width;
      c.sy = (-proj.y * 0.5 + 0.5) * height;
      c.ordinary = isOrdinary;
      c.keep = true;
      if (isOrdinary) ordinary.push(c);
    }

    // Thin the crowd: past the cap, only the nearest ordinary monsters keep a
    // plate. Everyone with a rank keeps theirs.
    if (ordinary.length > this.maxOrdinaryPlates) {
      ordinary.sort(byDistance);
      for (let i = this.maxOrdinaryPlates; i < ordinary.length; i++) ordinary[i]!.keep = false;
    }
    ordinary.length = 0;

    for (let i = 0; i < n; i++) {
      const c = this.cands[i]!;
      if (!c.keep) continue;
      const t = c.t;
      const d = t.nameplate;
      const plate = this.acquire();
      this.paint(plate, d);

      const pct = d.maxLife > 0 ? Math.max(0, Math.min(1, d.life / d.maxLife)) : 0;
      if (Math.abs(pct - plate.pct) > 0.002) {
        if (pct < plate.pct) plate.hitAt = now;
        plate.pct = pct;
        plate.barFill.style.transform = `scaleX(${pct})`;
      }
      // The trail: snaps up on a heal, holds after a hit, then drains.
      let trail = plate.trail < 0 || pct > plate.trail ? pct : plate.trail;
      if (trail > pct && now - plate.hitAt > TRAIL_HOLD) trail = Math.max(pct, trail - (trail - pct) * Math.min(1, dt * TRAIL_RATE) - dt * 0.05);
      if (Math.abs(trail - plate.trail) > 0.001) {
        plate.trail = trail;
        plate.barTrail.style.transform = `scaleX(${trail})`;
      }

      // Fade with distance so the far edge of the pack does not shout.
      const reach = c.ordinary ? Math.min(this.maxDistance, this.ordinaryDistance) : this.maxDistance;
      const fade = c.dist > reach * 0.75 ? 1 - (c.dist - reach * 0.75) / (reach * 0.25) : 1;
      plate.root.style.transform = `translate(-50%,-100%) translate(${c.sx.toFixed(1)}px, ${c.sy.toFixed(1)}px)`;
      plate.root.style.opacity = String(Math.max(0, Math.min(1, fade)));
      plate.root.style.display = '';
    }
    // Drop references so a disposed scene's monsters are not kept alive.
    for (let i = 0; i < n; i++) this.cands[i]!.t = null as unknown as PlateTarget;

    for (const p of this.pool) {
      if (!p.inUse) p.root.style.display = 'none';
    }
  }

  dispose(): void {
    this.container.remove();
    this.pool = [];
  }
}
