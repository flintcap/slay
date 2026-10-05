/**
 * SLAY — floating combat text.
 *
 * Every number that comes off a hit, drawn on one 2D canvas laid over the
 * view. A canvas rather than DOM nodes because a busy fight throws dozens of
 * numbers a second, and moving canvas text costs no layout at all.
 *
 * What it has to do, in order of importance:
 *  - read at a glance: a heavy outlined face, the element's colour, crits
 *    bigger, white-hot and shaking so they register without reading digits;
 *  - not bury the fight: rapid hits on the same target stack into one number
 *    that grows instead of a column of twenty, and everything fades quickly;
 *  - say what happened to you: damage taken falls in red, heals rise in green,
 *    a dodge or block says so in words.
 *
 * The layer listens to the combat events itself. The scene only creates it,
 * feeds it the camera and the hero's position each frame, and disposes it.
 */
import * as THREE from 'three';
import type { DamageType } from '../types';
import { events } from '../core/Events';
import { save } from '../core/Save';

type Kind = 'hit' | 'crit' | 'hurt' | 'heal' | 'mana' | 'word' | 'level';

interface Entry {
  kind: Kind;
  text: string;
  amount: number;
  /** World anchor; numbers are re-projected every frame so they stay pinned. */
  x: number;
  y: number;
  z: number;
  /** Screen-space drift in px per second. */
  vx: number;
  vy: number;
  age: number;
  life: number;
  fill: string;
  edge: string;
  size: number;
  /** Merge key: hits on the same target fold into this entry. */
  key: string;
  /** 1 just after spawn or a merge, decaying to 0: drives the pop. */
  pop: number;
  stacks: number;
  /** Time since spawn, never reset by a merge: caps how long one total runs. */
  born: number;
  /** Spawn size: merges may grow a number, but only so far past this. */
  base: number;
  /** Fixed screen offset in px, so hero numbers sit either side of the head. */
  ox: number;
}

/** A running total stops absorbing hits after this long and a new one starts. */
const MAX_RUN = 1.4;
/** How much a running total may grow past its spawn size. */
const MAX_GROW = 1.3;

/** Element colours. Bright enough to survive bloom and a dark floor. */
const TYPE_FILL: Record<string, string> = {
  physical: '#f2ead8',
  fire: '#ff8a3c',
  cold: '#8fdcff',
  lightning: '#ffe86a',
  poison: '#9be056',
  arcane: '#d29aff',
  holy: '#fff0b0',
  shadow: '#b48cff',
  bleed: '#ff5a50',
};

const MAX_ENTRIES = 90;
/** Hits on one target closer together than this become one growing number. */
const STACK_WINDOW = 0.32;

const _v = new THREE.Vector3();

/** "1,234", "12.3K", "1.24M": the number has to fit over a monster's head. */
export function compactNumber(n: number): string {
  const v = Math.max(1, Math.round(n));
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 1 : 2)}M`;
  if (v >= 1e4) return `${(v / 1e3).toFixed(v >= 1e5 ? 0 : 1)}K`;
  return v.toLocaleString('en-US');
}

export class CombatTextLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private entries: Entry[] = [];
  private offs: Array<() => void> = [];
  private dpr = 1;
  private w = 0;
  private h = 0;
  private dirty = false;
  /** Deterministic spread so stacked numbers fan out without randomness. */
  private spawnCount = 0;
  private hero = new THREE.Vector3();
  private textScale = 1;

  constructor(parent: HTMLElement | null = document.getElementById('ui')) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'combat-text';
    this.ctx = this.canvas.getContext('2d');
    (parent ?? document.body).appendChild(this.canvas);
    this.resize();
    window.addEventListener('resize', this.resize);
    this.wire();
  }

  private resize = (): void => {
    // Capped: text is the only thing on this canvas and 1.5x is plenty crisp.
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
  };

  private wire(): void {
    const show = (): boolean => save.settings.showDamageNumbers !== false;
    this.offs.push(
      events.on('enemy:damaged', (e) => {
        if (!show()) return;
        this.damage(e.amount, e.x, e.y + 0.35, e.z, e.type, e.crit, e.id);
      }),
      events.on('player:damaged', (e) => {
        if (!show() || e.amount <= 0) return;
        this.spawnHero('hurt', `-${compactNumber(e.amount)}`, e.amount, '#ff5a46', 'player-hurt', e.type);
      }),
      events.on('player:healed', (e) => {
        if (!show() || e.amount < 1) return;
        this.spawnHero('heal', `+${compactNumber(e.amount)}`, e.amount, '#7ef08c', 'player-heal');
      }),
      events.on('player:evaded', () => {
        if (!show()) return;
        // Higher than the heal and hurt numbers so the three never collide.
        this.word('DODGE', this.hero.x, 2.9, this.hero.z, '#bfe4ff');
      }),
      events.on('sfx', (e) => {
        if (show() && e.id === 'block') this.word('BLOCK', this.hero.x, 2.9, this.hero.z, '#f0d79a');
      }),
      events.on('player:levelUp', (e) => {
        this.spawn({
          kind: 'level',
          text: `LEVEL ${e.level}`,
          amount: 0,
          x: this.hero.x,
          y: 2.6,
          z: this.hero.z,
          vx: 0,
          vy: -26,
          life: 2.2,
          fill: '#ffe39a',
          edge: '#2a1704',
          size: 34,
          key: '',
        });
      }),
    );
  }

  /**
   * A hit on something. Crits get their own treatment and keep their own
   * running total per target, apart from the normal hits: a fast build that
   * crits often otherwise piled a dozen big numbers on one spot.
   */
  damage(amount: number, x: number, y: number, z: number, type: DamageType, crit: boolean, target = ''): void {
    const fill = TYPE_FILL[type] ?? TYPE_FILL.physical!;
    const key = !target ? '' : crit ? `crit:${target}` : `hit:${target}`;
    if (key && this.merge(key, amount)) return;
    const n = this.spawnCount++;
    const fan = ((n * 7) % 5) - 2;
    this.spawn({
      kind: crit ? 'crit' : 'hit',
      text: compactNumber(amount),
      amount,
      x,
      // Crits start higher and off to one side so they clear the running
      // total of normal hits on the same target instead of landing on it.
      y: crit ? y + 0.8 : y,
      z,
      vx: crit ? (n % 2 ? 1 : -1) * (26 + Math.abs(fan) * 8) : fan * 11,
      vy: crit ? -70 : -58,
      life: crit ? 1.25 : 0.95,
      fill,
      edge: crit ? '#3a0d00' : '#120a05',
      size: crit ? 32 : 21,
      key,
    });
  }

  /** A short word at a world point: IMMUNE, BLOCK, DODGE, RESIST. */
  word(text: string, x: number, y: number, z: number, color = '#e6e0d0'): void {
    // The same word again while it is still up (three dodges in a row) just
    // re-pops it; stacking copies on one spot made an unreadable smear.
    const key = `word:${text}`;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i]!;
      if (e.key !== key || e.age > 0.55) continue;
      e.age = Math.min(e.age, 0.1);
      e.pop = 1;
      e.x = x;
      e.z = z;
      this.dirty = true;
      return;
    }
    this.spawn({
      kind: 'word',
      text,
      amount: 0,
      x,
      y,
      z,
      vx: 0,
      vy: -40,
      life: 0.95,
      fill: color,
      edge: '#0c0a08',
      size: 18,
      key,
    });
  }

  /** Damage or healing on the hero, anchored above their head. */
  private spawnHero(kind: Kind, text: string, amount: number, fill: string, key: string, type?: DamageType): void {
    if (this.merge(key, amount, kind === 'hurt' ? '-' : '+')) return;
    const n = this.spawnCount++;
    // Damage taken falls away to the left; healing rises to the right, so the
    // two never collide when both happen at once.
    const hurt = kind === 'hurt';
    this.spawn({
      kind,
      text,
      amount,
      x: this.hero.x,
      y: 2.0,
      z: this.hero.z,
      vx: hurt ? -34 - (n % 3) * 6 : 22,
      vy: hurt ? 30 : -46,
      // Either side of the head from the start, so a hit and a heal in the
      // same moment never print over each other.
      ox: hurt ? -34 : 34,
      life: 1.05,
      fill: hurt && type && type !== 'physical' ? mixHurt(TYPE_FILL[type] ?? fill) : fill,
      edge: hurt ? '#2a0402' : '#04210a',
      size: hurt ? 21 : 19,
      key,
    });
  }

  /** Folds a fresh hit into a young number on the same target. */
  private merge(key: string, amount: number, sign = ''): boolean {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i]!;
      if (e.key !== key) continue;
      // Too old, or it has been running long enough: let it go and start a
      // fresh number, so a long fight reads as a series, not one swelling blob.
      if (e.age > STACK_WINDOW + 0.25 || e.born > MAX_RUN) return false;
      e.amount += amount;
      e.text = `${sign}${compactNumber(e.amount)}`;
      e.stacks += 1;
      e.pop = 1;
      // Keep it alive while the hits keep coming, and let it grow a little.
      e.age = Math.min(e.age, 0.12);
      e.size = Math.min(e.size * 1.05, e.base * MAX_GROW);
      this.dirty = true;
      return true;
    }
    return false;
  }

  private spawn(p: Omit<Entry, 'age' | 'pop' | 'stacks' | 'born' | 'base' | 'ox'> & { ox?: number }): void {
    if (this.entries.length >= MAX_ENTRIES) this.entries.shift();
    this.entries.push({ ...p, age: 0, pop: 1, stacks: 1, born: 0, base: p.size, ox: p.ox ?? 0 });
    this.dirty = true;
  }

  /**
   * Advance and draw. `dt` should be real time, not world time, so numbers
   * keep moving through a hit-stop instead of freezing mid-air.
   */
  update(dt: number, camera: THREE.Camera, hero?: { x: number; z: number }): void {
    if (hero) this.hero.set(hero.x, 0, hero.z);
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.entries.length === 0) {
      if (this.dirty) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.dirty = false;
      }
      return;
    }
    this.dirty = true;
    // The text-size setting scales these too. Access.ts writes it inline on
    // the root, so this is a cheap property read, not a style recalc.
    const ts = parseFloat(document.documentElement.style.getPropertyValue('--text-scale'));
    this.textScale = Number.isFinite(ts) && ts > 0 ? ts : 1;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    let write = 0;
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i]!;
      e.age += dt;
      e.born += dt;
      e.pop = Math.max(0, e.pop - dt * 6);
      if (e.age >= e.life) continue;
      this.entries[write++] = e;

      _v.set(e.x, e.y, e.z).project(camera);
      if (_v.z > 1 || _v.z < -1) continue;
      const t = e.age / e.life;
      // Ease out: a quick throw, then it hangs and fades.
      const travel = 1 - (1 - Math.min(1, e.age / 0.7)) ** 3;
      let sx = (_v.x * 0.5 + 0.5) * this.w + e.ox + e.vx * travel * 0.9;
      let sy = (-_v.y * 0.5 + 0.5) * this.h + e.vy * travel * 0.9;
      if (sx < -80 || sx > this.w + 80 || sy < -60 || sy > this.h + 60) continue;
      // A number at a non-finite point (NaN passes every comparison above)
      // made createLinearGradient throw, and the throw took the frame's whole
      // HUD update with it. Drop the number instead.
      if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(e.size)) continue;

      let scale = 1 + e.pop * (e.kind === 'crit' ? 0.7 : 0.28);
      if (e.kind === 'crit' && e.age < 0.18) {
        // A crit lands with a short shudder.
        const k = (0.18 - e.age) / 0.18;
        sx += Math.sin(e.age * 120) * 3 * k;
        sy += Math.cos(e.age * 97) * 2 * k;
      }
      if (e.kind === 'level') scale = 0.7 + Math.min(1, e.age / 0.25) * 0.3 + e.pop * 0.2;
      const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      this.drawEntry(ctx, e, sx, sy, scale, alpha);
    }
    this.entries.length = write;
  }

  private drawEntry(ctx: CanvasRenderingContext2D, e: Entry, x: number, y: number, scale: number, alpha: number): void {
    const size = e.size * scale * this.textScale;
    ctx.globalAlpha = alpha;
    if (e.kind === 'word' || e.kind === 'level') {
      ctx.font = `700 ${size}px 'Cinzel', 'Trajan Pro', 'Palatino Linotype', Palatino, Georgia, serif`;
      ctx.letterSpacing = e.kind === 'level' ? '6px' : '2px';
    } else {
      ctx.font = `900 ${size}px 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif`;
      ctx.letterSpacing = '0px';
    }

    if (e.kind === 'crit' || e.kind === 'level') {
      // Warm halo so the big ones punch through a bright effect.
      ctx.shadowColor = e.kind === 'crit' ? 'rgba(255,170,60,0.85)' : 'rgba(255,210,120,0.9)';
      ctx.shadowBlur = 14;
    }
    ctx.lineWidth = Math.max(3, size * 0.16);
    ctx.strokeStyle = e.edge;
    ctx.strokeText(e.text, x, y);
    ctx.shadowBlur = 0;

    if (e.kind === 'crit') {
      // White-hot at the top, the element's colour at the base.
      const g = ctx.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
      g.addColorStop(0, '#fffbe8');
      g.addColorStop(0.45, '#ffe08a');
      g.addColorStop(1, e.fill);
      ctx.fillStyle = g;
    } else if (e.kind === 'level') {
      const g = ctx.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
      g.addColorStop(0, '#fff6da');
      g.addColorStop(0.5, '#f0d48e');
      g.addColorStop(1, '#b8873a');
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = e.fill;
    }
    ctx.fillText(e.text, x, y);

    if (e.stacks > 2 && (e.kind === 'hit' || e.kind === 'crit')) {
      // A small multiplier tells you the number is a running total.
      // Measure the number in its own font before switching to the small one.
      const tx = x + ctx.measureText(e.text).width * 0.5 + size * 0.42;
      ctx.font = `800 ${Math.round(size * 0.5)}px 'Segoe UI', system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = e.edge;
      ctx.strokeText(`x${e.stacks}`, tx, y + size * 0.15);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(`x${e.stacks}`, tx, y + size * 0.15);
    }
    ctx.globalAlpha = 1;
  }

  /** Drop everything on screen (floor change). */
  clear(): void {
    this.entries.length = 0;
    this.dirty = true;
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs = [];
    window.removeEventListener('resize', this.resize);
    this.canvas.remove();
    this.entries.length = 0;
  }
}

/** Damage you take keeps a red cast even when it is fire or frost. */
function mixHurt(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * 0.45 + 255 * 0.55);
  const g = Math.round(((n >> 8) & 255) * 0.45 + 80 * 0.55);
  const b = Math.round((n & 255) * 0.45 + 60 * 0.55);
  return `rgb(${r},${g},${b})`;
}
