/**
 * SLAY — the full-screen map.
 *
 * Draws the current DungeonLevel to a canvas at a readable scale: explored
 * tiles only, rooms tinted by kind, stairs and quest markers called out, and
 * the player where they actually are. Pan by dragging, zoom on the wheel.
 */

import type { DungeonLevel, DungeonRoom } from '../types';
import { events } from '../core/Events';
import { runtime, Panel, add, clear, div, span, icon, emptyState } from './Widgets';

const T_VOID = 0;
const T_FLOOR = 1;
const T_WALL = 2;
const T_DOOR = 3;
const T_WATER = 4;
const T_LAVA = 5;
const T_CHASM = 6;
const T_STAIRS_DOWN = 7;
const T_STAIRS_UP = 8;
const T_RUBBLE = 9;

const ROOM_TINT: Record<DungeonRoom['kind'], string> = {
  normal: 'rgba(0,0,0,0)',
  entry: 'rgba(127,176,255,0.10)',
  exit: 'rgba(255,214,107,0.12)',
  treasure: 'rgba(216,168,58,0.16)',
  shrine: 'rgba(176,108,255,0.14)',
  boss: 'rgba(224,80,60,0.16)',
  vault: 'rgba(51,214,74,0.13)',
  ambush: 'rgba(224,80,60,0.09)',
  quest: 'rgba(111,140,255,0.14)',
};

const ROOM_LABEL: Partial<Record<DungeonRoom['kind'], string>> = {
  treasure: 'Treasure',
  shrine: 'Shrine',
  boss: 'Boss',
  vault: 'Vault',
  quest: 'Quest',
  entry: 'Entrance',
  exit: 'Stairs Down',
};

export class MapPanel {
  readonly panel: Panel;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private stage: HTMLDivElement;
  private zoom = 6;
  private panX = 0;
  private panY = 0;
  private dirty = true;
  private explored = new Map<number, Uint8Array>();
  private headerLabel: HTMLDivElement;

  constructor() {
    this.panel = new Panel({
      id: 'map',
      title: 'Map',
      subtitle: 'Only what you have walked past is drawn',
      icon: 'map',
      fullscreen: true,
    });
    this.panel.frame.classList.add('panel-map');

    this.stage = div('map-stage');
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.stage.appendChild(this.canvas);

    this.headerLabel = div('minimap-label');
    this.headerLabel.style.position = 'absolute';
    this.headerLabel.style.top = '12px';
    this.headerLabel.style.left = '0';
    this.headerLabel.style.right = '0';
    this.headerLabel.style.background = 'none';
    this.stage.appendChild(this.headerLabel);

    const legend = div('map-legend');
    const rows: Array<[string, string]> = [
      ['#9c8862', 'Explored floor'],
      ['#3a3026', 'Wall'],
      ['#ffd66b', 'Stairs down'],
      ['#7fb0ff', 'Stairs up'],
      ['#d8a83a', 'Treasure'],
      ['#b06cff', 'Shrine'],
      ['#e0503c', 'Boss chamber'],
      ['#f6ecd2', 'You'],
    ];
    for (const [color, label] of rows) {
      const r = div('legend-item');
      const sw = div('legend-swatch');
      sw.style.background = color;
      add(r, sw, span('', label));
      legend.appendChild(r);
    }
    this.stage.appendChild(legend);
    this.stage.appendChild(div('map-hint', 'Drag to pan · scroll to zoom · M to close'));

    this.panel.body.style.padding = '0';
    this.panel.body.style.display = 'flex';
    this.panel.body.appendChild(this.stage);

    this.wire();
    events.on('depth:changed', () => {
      this.explored.clear();
      this.panX = 0;
      this.panY = 0;
      this.dirty = true;
    });
  }

  private wire(): void {
    let dragging = false;
    let sx = 0;
    let sy = 0;
    this.stage.addEventListener('pointerdown', (e) => {
      dragging = true;
      sx = e.clientX - this.panX;
      sy = e.clientY - this.panY;
      this.stage.setPointerCapture(e.pointerId);
    });
    this.stage.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      this.panX = e.clientX - sx;
      this.panY = e.clientY - sy;
      this.dirty = true;
    });
    const stop = (e: PointerEvent): void => {
      dragging = false;
      try {
        this.stage.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
    };
    this.stage.addEventListener('pointerup', stop);
    this.stage.addEventListener('pointercancel', stop);
    this.stage.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const next = this.zoom * (e.deltaY < 0 ? 1.16 : 0.86);
        this.zoom = Math.max(2, Math.min(20, next));
        this.dirty = true;
      },
      { passive: false }
    );
  }

  open(): void {
    this.resize();
    this.dirty = true;
    this.panel.open();
  }
  close(): void {
    this.panel.close();
  }
  get isOpen(): boolean {
    return this.panel.isOpen;
  }

  /** Driven by the UI tick in UIRoot — only redraws when something changed. */
  tick(): void {
    if (!this.panel.isOpen) return;
    this.resize();
    if (this.dirty) {
      this.dirty = false;
      this.draw();
    }
  }

  private resize(): void {
    const w = this.stage.clientWidth;
    const h = this.stage.clientHeight;
    if (w <= 0 || h <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const want = { w: Math.round(w * dpr), h: Math.round(h * dpr) };
    if (this.canvas.width !== want.w || this.canvas.height !== want.h) {
      this.canvas.width = want.w;
      this.canvas.height = want.h;
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
      this.ctx = this.canvas.getContext('2d');
      this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.dirty = true;
    }
  }

  private exploredFor(level: DungeonLevel): Uint8Array {
    let e = this.explored.get(level.seed);
    if (!e || e.length !== level.width * level.height) {
      e = new Uint8Array(level.width * level.height);
      this.explored.set(level.seed, e);
    }
    // Reveal generously around the player each time the map is drawn.
    const R = 12;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        const x = runtime.playerTileX + dx;
        const y = runtime.playerTileY + dy;
        if (x < 0 || y < 0 || x >= level.width || y >= level.height) continue;
        e[y * level.width + x] = 1;
      }
    }
    return e;
  }

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight;
    ctx.clearRect(0, 0, W, H);

    const level = runtime.level;
    this.headerLabel.textContent = level
      ? `Depth ${runtime.depth} · ${level.biome} · ${level.layout}`
      : '';

    if (!level) {
      clear(this.headerLabel);
      if (!this.stage.querySelector('.empty-state')) {
        const es = emptyState('No dungeon to map. The town needs no chart.', 'map');
        es.style.position = 'absolute';
        this.stage.appendChild(es);
      }
      return;
    }
    this.stage.querySelector('.empty-state')?.remove();

    const explored = this.exploredFor(level);
    const s = this.zoom;
    const ox = W / 2 + this.panX - runtime.playerTileX * s;
    const oy = H / 2 + this.panY - runtime.playerTileY * s;

    // Rooms first, as soft tinted plates behind the tiles.
    for (const room of level.rooms ?? []) {
      const tint = ROOM_TINT[room.kind];
      if (!tint || tint === 'rgba(0,0,0,0)') continue;
      let anySeen = false;
      for (let y = room.y; y < room.y + room.h && !anySeen; y++) {
        for (let x = room.x; x < room.x + room.w; x++) {
          if (x < 0 || y < 0 || x >= level.width || y >= level.height) continue;
          if (explored[y * level.width + x]) {
            anySeen = true;
            break;
          }
        }
      }
      if (!anySeen) continue;
      ctx.fillStyle = tint;
      ctx.fillRect(ox + room.x * s, oy + room.y * s, room.w * s, room.h * s);
    }

    // Tiles.
    for (let y = 0; y < level.height; y++) {
      const py = oy + y * s;
      if (py < -s || py > H) continue;
      for (let x = 0; x < level.width; x++) {
        const idx = y * level.width + x;
        if (!explored[idx]) continue;
        const t = level.tiles[idx];
        if (t === T_VOID) continue;
        const px = ox + x * s;
        if (px < -s || px > W) continue;
        ctx.fillStyle = tileColor(t);
        ctx.fillRect(px, py, s + 0.5, s + 0.5);
      }
    }

    // Room labels.
    if (s >= 5) {
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (const room of level.rooms ?? []) {
        const label = ROOM_LABEL[room.kind];
        if (!label) continue;
        const cx = room.center?.x ?? room.x + room.w / 2;
        const cy = room.center?.y ?? room.y + room.h / 2;
        if (!explored[Math.floor(cy) * level.width + Math.floor(cx)]) continue;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillText(label, ox + cx * s + 1, oy + cy * s + 1);
        ctx.fillStyle = 'rgba(236,224,200,0.85)';
        ctx.fillText(label, ox + cx * s, oy + cy * s);
      }
    }

    // Stairs.
    const marks: Array<[number, number, string]> = [];
    if (level.exit) marks.push([level.exit.x, level.exit.y, '#ffd66b']);
    if (level.entry) marks.push([level.entry.x, level.entry.y, '#7fb0ff']);
    for (const [mx, my, color] of marks) {
      if (!explored[my * level.width + mx]) continue;
      const px = ox + mx * s + s / 2;
      const py = oy + my * s + s / 2;
      ctx.beginPath();
      ctx.moveTo(px, py - s * 0.9);
      ctx.lineTo(px + s * 0.8, py + s * 0.7);
      ctx.lineTo(px - s * 0.8, py + s * 0.7);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // Live pips (enemies) — only where the player can currently see.
    for (const pip of runtime.pips) {
      const px = ox + pip.x * s + s / 2;
      const py = oy + pip.y * s + s / 2;
      ctx.beginPath();
      ctx.arc(px, py, pip.kind === 'boss' ? s * 0.8 : s * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = pip.kind === 'boss' ? '#ff4d3d' : pip.kind === 'elite' ? '#ff9a3c' : '#d9483c';
      ctx.fill();
    }

    // Player.
    const px = ox + runtime.playerTileX * s + s / 2;
    const py = oy + runtime.playerTileY * s + s / 2;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(runtime.facing);
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.1);
    ctx.lineTo(s * 0.85, s * 0.9);
    ctx.lineTo(0, s * 0.45);
    ctx.lineTo(-s * 0.85, s * 0.9);
    ctx.closePath();
    ctx.fillStyle = '#f6ecd2';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 1.4;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function tileColor(t: number): string {
  switch (t) {
    case T_FLOOR:
      return '#9c8862';
    case T_WALL:
      return '#3a3026';
    case T_DOOR:
      return '#d6a850';
    case T_WATER:
      return '#34608c';
    case T_LAVA:
      return '#c4481a';
    case T_CHASM:
      return '#0c0a0e';
    case T_STAIRS_DOWN:
      return '#ffd66b';
    case T_STAIRS_UP:
      return '#7fb0ff';
    case T_RUBBLE:
      return '#605442';
    default:
      return 'rgba(0,0,0,0)';
  }
}

export { icon as _icon };
