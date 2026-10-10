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
const T_EXIT = 7;
const T_ARRIVAL = 8;
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
  private headerLabel: HTMLDivElement;
  private lastTileX = -1;
  private lastTileY = -1;
  /** The floor the zoom was last fitted to; a new floor refits once. */
  private fittedSeed = -1;

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
    legend.appendChild(div('map-legend-title', 'Legend'));
    const rows: Array<[string, string]> = [
      [FLOOR_FILL, 'Explored floor'],
      [EDGE_INK, 'Wall'],
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
      // The HUD owns clearing the shared record; this only resets the view.
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
    // The game keeps running behind the map, so moving is a change worth
    // redrawing for: without this the ground you walk while it is open only
    // appears the next time something else happens to dirty the canvas.
    if (runtime.playerTileX !== this.lastTileX || runtime.playerTileY !== this.lastTileY) {
      this.lastTileX = runtime.playerTileX;
      this.lastTileY = runtime.playerTileY;
      this.dirty = true;
    }
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

  /**
   * What the player has seen — read from the shared record, never written.
   *
   * This used to keep its own copy and reveal a disc around the player each
   * time it drew, which only happens while the panel is open. Walk the whole
   * floor with the map closed and it stayed blank; the minimap in the corner,
   * which does update every frame, knew the floor perfectly. The HUD owns the
   * revealing now and this just draws what is already known.
   */
  private exploredFor(level: DungeonLevel): Uint8Array {
    const e = runtime.explored.get(level.seed);
    if (e && e.length === level.width * level.height) return e;
    const fresh = new Uint8Array(level.width * level.height);
    runtime.explored.set(level.seed, fresh);
    return fresh;
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
    if (this.fittedSeed !== level.seed) {
      // First look at a floor: zoom so the whole of it would fit the stage,
      // within sane bounds. The wheel takes over from there.
      this.fittedSeed = level.seed;
      const fit = Math.min(W / level.width, H / level.height) * 0.8;
      this.zoom = Math.max(4, Math.min(14, fit));
    }
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

    // Tiles. Walkable ground is a muted wash; walls are not filled at all but
    // inked as a bright edge wherever ground meets them, the way a drawn chart
    // reads. Water, lava and chasms keep their own colour.
    const LW = level.width;
    const walk = (x: number, y: number): boolean => {
      if (x < 0 || y < 0 || x >= LW || y >= level.height) return false;
      const t = level.tiles[y * LW + x];
      return t !== T_VOID && t !== T_WALL;
    };
    for (let y = 0; y < level.height; y++) {
      const py = oy + y * s;
      if (py < -s || py > H) continue;
      for (let x = 0; x < LW; x++) {
        const idx = y * LW + x;
        if (!explored[idx]) continue;
        const t = level.tiles[idx];
        if (t === T_VOID || t === T_WALL) continue;
        const px = ox + x * s;
        if (px < -s || px > W) continue;
        ctx.fillStyle = tileColor(t);
        ctx.fillRect(px, py, s + 0.5, s + 0.5);
      }
    }
    // Edge pass: one stroked path for every ground-to-wall boundary seen.
    ctx.beginPath();
    for (let y = 0; y < level.height; y++) {
      const py = oy + y * s;
      if (py < -s || py > H) continue;
      for (let x = 0; x < LW; x++) {
        if (!explored[y * LW + x] || !walk(x, y)) continue;
        const px = ox + x * s;
        if (px < -s || px > W) continue;
        if (!walk(x, y - 1)) {
          ctx.moveTo(px, py);
          ctx.lineTo(px + s, py);
        }
        if (!walk(x, y + 1)) {
          ctx.moveTo(px, py + s);
          ctx.lineTo(px + s, py + s);
        }
        if (!walk(x - 1, y)) {
          ctx.moveTo(px, py);
          ctx.lineTo(px, py + s);
        }
        if (!walk(x + 1, y)) {
          ctx.moveTo(px + s, py);
          ctx.lineTo(px + s, py + s);
        }
      }
    }
    ctx.lineCap = 'square';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = Math.max(2, s * 0.42);
    ctx.stroke();
    ctx.strokeStyle = EDGE_INK;
    ctx.lineWidth = Math.max(1, s * 0.2);
    ctx.stroke();

    // Room labels.
    if (s >= 5) {
      ctx.font = `700 ${Math.round(11 * textScale())}px 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif`;
      ctx.letterSpacing = '2px';
      ctx.textAlign = 'center';
      for (const room of level.rooms ?? []) {
        const label = ROOM_LABEL[room.kind];
        if (!label) continue;
        const cx = room.center?.x ?? room.x + room.w / 2;
        const cy = room.center?.y ?? room.y + room.h / 2;
        if (!explored[Math.floor(cy) * level.width + Math.floor(cx)]) continue;
        const text = label.toUpperCase();
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText(text, ox + cx * s, oy + cy * s);
        ctx.fillStyle = ROOM_INK[room.kind] ?? 'rgba(236,224,200,0.9)';
        ctx.fillText(text, ox + cx * s, oy + cy * s);
      }
      ctx.letterSpacing = '0px';
    }

    // Stairs.
    const marks: Array<[number, number, string]> = [];
    if (level.exit) marks.push([level.exit.x, level.exit.y, '#ffd66b']);
    if (level.entry) marks.push([level.entry.x, level.entry.y, '#7fb0ff']);
    for (const [mx, my, color] of marks) {
      if (!explored[my * level.width + mx]) continue;
      const px = ox + mx * s + s / 2;
      const py = oy + my * s + s / 2;
      // A soft halo first so the marker finds the eye on a big floor.
      const halo = ctx.createRadialGradient(px, py, 0, px, py, s * 2.4);
      halo.addColorStop(0, color);
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = halo;
      ctx.fillRect(px - s * 2.4, py - s * 2.4, s * 4.8, s * 4.8);
      ctx.globalAlpha = 1;
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
    const glow = ctx.createRadialGradient(px, py, 0, px, py, s * 3);
    glow.addColorStop(0, 'rgba(255,236,190,0.45)');
    glow.addColorStop(1, 'rgba(255,236,190,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(px - s * 3, py - s * 3, s * 6, s * 6);
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

/** The map's two inks: ground wash and the wall line drawn round it. */
const FLOOR_FILL = '#4f432f';
const EDGE_INK = '#e3c88e';

/** Room label colours, matching the legend. */
const ROOM_INK: Partial<Record<DungeonRoom['kind'], string>> = {
  treasure: '#f0c75a',
  shrine: '#cf9dff',
  boss: '#ff7a62',
  vault: '#6fe08a',
  quest: '#9fb4ff',
  entry: '#a9c8ff',
  exit: '#ffe08a',
};

function textScale(): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--text-scale'));
  return Number.isFinite(v) && v > 0 ? v : 1;
}

function tileColor(t: number): string {
  switch (t) {
    case T_FLOOR:
      return FLOOR_FILL;
    case T_WALL:
      return 'rgba(0,0,0,0)';
    case T_DOOR:
      return '#d6a850';
    case T_WATER:
      return '#34608c';
    case T_LAVA:
      return '#c4481a';
    case T_CHASM:
      return '#0c0a0e';
    case T_EXIT:
      return '#ffd66b';
    case T_ARRIVAL:
      return '#7fb0ff';
    case T_RUBBLE:
      return '#433a2c';
    default:
      return 'rgba(0,0,0,0)';
  }
}

export { icon as _icon };
