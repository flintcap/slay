/**
 * SLAY — the see-through map.
 *
 * The floor's chart laid over the game itself while you play: the walls you
 * have seen as bright lines, the ground as a faint wash, the ways on and the
 * monsters you can see, and your own arrow. It turns with the camera and is
 * tilted the way the camera tilts the ground, so a corridor on the chart runs
 * the way the corridor on screen does, and it is centred on where the hero
 * stands on screen. It never takes a click. Tab shows and hides it; how solid
 * and how large it is are in Settings, Gameplay.
 *
 * Drawing: the chart is painted once into a canvas of its own, a few pixels a
 * tile, and only the ground near the hero is repainted as it is revealed.
 * Each frame that canvas is drawn once through the camera's turn and tilt, and
 * the few things that move (the hero, the monsters, the way marks) on top.
 */

import type { DungeonLevel } from '../types';
import { save } from '../core/Save';
import { runtime, div } from './Widgets';
import { wayMarks, T_RUIN } from './ZoneInk';

const T_VOID = 0;
const T_WALL = 2;
const T_DOOR = 3;
const T_WATER = 4;
const T_LAVA = 5;
const T_CHASM = 6;

/** Chart pixels per tile in the cached canvas. */
const CELL = 8;
/** Screen pixels per tile at size 1. */
const BASE_SCALE = 7;
/** How far round the hero the chart is repainted as ground is revealed. */
const REPAINT_RADIUS = 13;
/** Seconds between repaints of the ground round the hero. */
const REPAINT_EVERY = 0.2;

const EDGE_INK = '#f0d9a0';
const FLOOR_WASH = 'rgba(240, 217, 160, 0.10)';

export class MapOverlay {
  readonly root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  /** The chart, a few pixels a tile, painted as ground is seen. */
  private chart: HTMLCanvasElement | OffscreenCanvas | null = null;
  private chartCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  private chartSeed = -1;
  private sinceRepaint = 0;
  private dpr = 1;
  private w = 0;
  private h = 0;
  /** The full map is up: this one steps aside. */
  hiddenBy: () => boolean = () => false;

  constructor() {
    this.root = div('map-overlay');
    this.root.setAttribute('aria-hidden', 'true');
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.root.appendChild(this.canvas);
  }

  mount(parent: HTMLElement): void {
    // First in the UI layer, so the bars, panels and tooltips sit over it.
    parent.prepend(this.root);
  }

  get isOn(): boolean {
    return !!save.settings.mapOverlay;
  }

  toggle(): void {
    save.settings.mapOverlay = !save.settings.mapOverlay;
    save.touch();
    this.chartSeed = -1;
  }

  /** Driven by the UI tick; draws only while it is up and there is a floor. */
  tick(dt: number): void {
    const level = runtime.level;
    const show = this.isOn && !runtime.inTown && !!level && !this.hiddenBy();
    this.root.classList.toggle('on', show);
    if (!show || !level || !this.ctx) return;
    this.resize();
    const explored = runtime.explored.get(level.seed);
    if (!explored || explored.length !== level.width * level.height) return;

    if (this.chartSeed !== level.seed) {
      this.paintChart(level, explored);
      this.sinceRepaint = 0;
    } else {
      this.sinceRepaint += dt;
      if (this.sinceRepaint >= REPAINT_EVERY) {
        this.sinceRepaint = 0;
        const v = runtime.view;
        this.paintRegion(level, explored, Math.floor(v.tx) - REPAINT_RADIUS, Math.floor(v.ty) - REPAINT_RADIUS, REPAINT_RADIUS * 2 + 1, REPAINT_RADIUS * 2 + 1);
      }
    }
    this.draw(level, explored);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  /** A fresh chart for a new floor, with everything already seen on it. */
  private paintChart(level: DungeonLevel, explored: Uint8Array): void {
    const w = level.width * CELL;
    const h = level.height * CELL;
    if (!this.chart || this.chart.width !== w || this.chart.height !== h) {
      this.chart = new OffscreenCanvas(w, h);
      this.chartCtx = this.chart.getContext('2d');
    }
    this.chartSeed = level.seed;
    this.paintRegion(level, explored, 0, 0, level.width, level.height);
  }

  /** Repaints the chart inside a box of tiles from what has been seen. */
  private paintRegion(level: DungeonLevel, explored: Uint8Array, x0: number, y0: number, bw: number, bh: number): void {
    const c = this.chartCtx;
    if (!c) return;
    const LW = level.width;
    const LH = level.height;
    const xa = Math.max(0, x0);
    const ya = Math.max(0, y0);
    const xb = Math.min(LW, x0 + bw);
    const yb = Math.min(LH, y0 + bh);
    if (xa >= xb || ya >= yb) return;
    const pass = (x: number, y: number): boolean => {
      if (x < 0 || y < 0 || x >= LW || y >= LH) return false;
      const t = level.tiles[y * LW + x];
      return t !== T_VOID && t !== T_WALL && t !== T_RUIN;
    };
    // A lone blocked tile in open ground (a tree, a pillar) is drawn as
    // ground: outlined, a field of them reads as noise over the room.
    const walk = (x: number, y: number): boolean =>
      pass(x, y) ||
      (x >= 0 && y >= 0 && x < LW && y < LH && level.tiles[y * LW + x] !== T_VOID && pass(x - 1, y) && pass(x + 1, y) && pass(x, y - 1) && pass(x, y + 1));

    c.save();
    c.beginPath();
    c.rect(xa * CELL, ya * CELL, (xb - xa) * CELL, (yb - ya) * CELL);
    c.clip();
    c.clearRect(xa * CELL, ya * CELL, (xb - xa) * CELL, (yb - ya) * CELL);
    // One tile past the box on every side, so lines that cross its edge are
    // drawn whole.
    const xs = Math.max(0, xa - 1);
    const ys = Math.max(0, ya - 1);
    const xe = Math.min(LW, xb + 1);
    const ye = Math.min(LH, yb + 1);
    for (let y = ys; y < ye; y++) {
      for (let x = xs; x < xe; x++) {
        const idx = y * LW + x;
        if (!explored[idx] || !walk(x, y)) continue;
        const t = level.tiles[idx]!;
        c.fillStyle = t === T_WATER ? 'rgba(80, 150, 220, 0.30)' : t === T_LAVA ? 'rgba(230, 90, 30, 0.40)' : t === T_CHASM ? 'rgba(0, 0, 0, 0.35)' : t === T_DOOR ? 'rgba(230, 180, 90, 0.35)' : FLOOR_WASH;
        c.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
    c.beginPath();
    for (let y = ys; y < ye; y++) {
      for (let x = xs; x < xe; x++) {
        if (!explored[y * LW + x] || !walk(x, y)) continue;
        const px = x * CELL;
        const py = y * CELL;
        if (!walk(x, y - 1)) {
          c.moveTo(px, py);
          c.lineTo(px + CELL, py);
        }
        if (!walk(x, y + 1)) {
          c.moveTo(px, py + CELL);
          c.lineTo(px + CELL, py + CELL);
        }
        if (!walk(x - 1, y)) {
          c.moveTo(px, py);
          c.lineTo(px, py + CELL);
        }
        if (!walk(x + 1, y)) {
          c.moveTo(px + CELL, py);
          c.lineTo(px + CELL, py + CELL);
        }
      }
    }
    c.lineCap = 'square';
    c.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    c.lineWidth = CELL * 0.5;
    c.stroke();
    c.strokeStyle = EDGE_INK;
    c.lineWidth = CELL * 0.22;
    c.stroke();
    c.restore();
  }

  private draw(level: DungeonLevel, explored: Uint8Array): void {
    const ctx = this.ctx!;
    const v = runtime.view;
    const scale = BASE_SCALE * (save.settings.mapOverlaySize ?? 1);
    this.root.style.opacity = String(save.settings.mapOverlayOpacity ?? 0.7);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (!this.chart) return;

    // The chart, turned and tilted like the ground under the camera, with the
    // hero's tile on the hero.
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.scale(1, v.squash);
    ctx.rotate(v.yaw);
    ctx.scale(scale / CELL, scale / CELL);
    ctx.translate(-v.tx * CELL, -v.ty * CELL);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.chart, 0, 0);
    ctx.restore();

    // Tile position to screen, the same turn and tilt.
    const cos = Math.cos(v.yaw);
    const sin = Math.sin(v.yaw);
    const at = (tx: number, ty: number): [number, number] => {
      const dx = (tx - v.tx) * scale;
      const dy = (ty - v.ty) * scale;
      return [v.x + dx * cos - dy * sin, v.y + (dx * sin + dy * cos) * v.squash];
    };

    // The ways on, the arena gate, the waypoint and where you came in.
    for (const [mx, my, color, shape] of wayMarks(level)) {
      if (!explored[my * level.width + mx]) continue;
      const [px, py] = at(mx + 0.5, my + 0.5);
      const r = Math.max(5, scale * 0.9);
      ctx.beginPath();
      if (shape === 'ring') {
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        continue;
      }
      if (shape === 'gate') {
        ctx.moveTo(px, py - r);
        ctx.lineTo(px + r, py);
        ctx.lineTo(px, py + r);
        ctx.lineTo(px - r, py);
      } else {
        ctx.moveTo(px, py - r);
        ctx.lineTo(px + r * 0.85, py + r * 0.75);
        ctx.lineTo(px - r * 0.85, py + r * 0.75);
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // Monsters in sight.
    for (const pip of runtime.pips) {
      const [px, py] = at(pip.x + 0.5, pip.y + 0.5);
      ctx.beginPath();
      ctx.arc(px, py, pip.kind === 'boss' ? 5 : pip.kind === 'elite' ? 3.5 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = pip.kind === 'boss' ? '#ff4d3d' : pip.kind === 'elite' ? '#ff9a3c' : '#e0503c';
      ctx.fill();
    }

    // The hero's arrow, pointing the way the hero faces on screen.
    const a = runtime.facing;
    const fx = Math.sin(a);
    const fy = -Math.cos(a);
    const sx = fx * cos - fy * sin;
    const sy = (fx * sin + fy * cos) * v.squash;
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(Math.atan2(sx, -sy));
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5.4, 5.6);
    ctx.lineTo(0, 2.8);
    ctx.lineTo(-5.4, 5.6);
    ctx.closePath();
    ctx.fillStyle = '#f6ecd2';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 1.4;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
