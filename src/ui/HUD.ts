/**
 * SLAY — the in-game HUD.
 *
 * Everything here has to be readable in a fraction of a second while something
 * is trying to kill you: two liquid-filled globes at the bottom corners of the
 * command bar, a six-slot hotbar with cooldown sweeps and mana dimming, a
 * minimap, and a boss bar that only appears when it matters.
 *
 * The HUD is rebuilt on events, never per frame. The per-frame work is limited
 * to: two small canvases, six CSS custom-property writes for cooldowns, and one
 * minimap redraw at 8Hz.
 */

import type { Character, DungeonLevel, ItemRarity, QuestInstance, SkillDef, StatKey } from '../types';
import { events, type GameEvents } from '../core/Events';
import { save } from '../core/Save';
import { stackCount } from '../sim/Inventory';
import type { Engine } from '../core/Engine';
import { computeStats, xpForLevel } from '../sim/Stats';
import { getStatus } from '../data/statuses';
import {
  add,
  clear,
  div,
  span,
  icon,
  iconSvg,
  classAccent,
  skillById,
  safeBase,
  fmt,
  fmtInt,
  rarityHex,
  hex,
  rgba,
  registerDrop,
  countTo,
  attempt,
  runtime,
  tip,
  STAT_LABEL,
  ORNAMENT,
  type MinimapPip,
} from './Widgets';
import { requestItemIcon, skillIconUri, statusIconUri, warmItemIcons } from '../art/Icons';
import { pickPotion } from '../sim/Potions';
import { setPrimaryAttack, setHotbarSlot } from '../sim/Character';
import { SKILL_BY_ID } from '../data/skills';
import { BOSSES } from '../data/bosses';
import { CHAINS } from '../data/story/chains';
import { NPCS } from '../data/story/npcs';
import { carriedContract, chainStep, stepState } from '../sim/Chains';
import { bountyText, heldBounties } from '../sim/TownServices';
import { zoneInks, zoneInkAt, newKindInk, wayMarks } from './ZoneInk';

// Tile ids as stored in DungeonLevel.tiles (mirrors world/Layouts TILE_VALUES).
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

const MINIMAP_PX = 178;
const MINIMAP_TILE = 3.6;
const REVEAL_RADIUS = 10;
/** How far from the hero, in tiles, a monster shows on the maps: what you can see. */
const PIP_SIGHT = REVEAL_RADIUS + 6;

// ---------------------------------------------------------------------------
// Scene sniffing
// ---------------------------------------------------------------------------

interface SceneProbe {
  player: Record<string, unknown> | null;
  level: DungeonLevel | null;
  worldToTile: ((x: number, z: number) => { x: number; y: number }) | null;
  enemies: Array<Record<string, unknown>> | null;
  quest: QuestInstance | null;
}

const probes = new WeakMap<object, SceneProbe>();

function isLevel(v: unknown): v is DungeonLevel {
  const o = v as DungeonLevel | null;
  return !!o && typeof o === 'object' && !!o.tiles && typeof o.width === 'number' && typeof o.height === 'number';
}

/**
 * Finds the player, level and enemy list on whatever the active scene calls
 * them. Structural rather than nominal so the UI never breaks when the scene
 * layer renames a field.
 */
/**
 * Forgets what we learned about a scene.
 *
 * The probe result is cached against the scene object, but a dungeon scene
 * survives a floor change and rebuilds its level and its mesh underneath. The
 * stale cache kept handing the HUD floor one's grid and floor one's
 * `worldToTile`, which is why every minimap from floor two on was the wrong map
 * with the arrow in the wrong place.
 */
function forgetProbe(scene: object | null | undefined): void {
  if (scene) probes.delete(scene);
}

function probeScene(scene: object): SceneProbe {
  const cached = probes.get(scene);
  if (cached) return cached;
  const p: SceneProbe = { player: null, level: null, worldToTile: null, enemies: null, quest: null };
  const seen = new Set<unknown>();

  const visit = (obj: unknown, depth: number): void => {
    if (!obj || typeof obj !== 'object' || seen.has(obj) || depth > 2) return;
    seen.add(obj);
    const rec = obj as Record<string, unknown>;

    for (const key of Object.keys(rec)) {
      const v = rec[key];
      if (!v || typeof v !== 'object') continue;
      const vr = v as Record<string, unknown>;
      if (!p.player && typeof vr.life === 'number' && typeof vr.mana === 'number' && vr.stats) p.player = vr;
      if (!p.level && isLevel(v)) p.level = v;
      if (!p.worldToTile && typeof vr.worldToTile === 'function') {
        p.worldToTile = (vr.worldToTile as (x: number, z: number) => { x: number; y: number }).bind(vr);
      }
      if (!p.enemies && Array.isArray(v) && v.length && typeof (v[0] as Record<string, unknown>)?.maxLife === 'number') {
        p.enemies = v as Array<Record<string, unknown>>;
      }
      if (!p.quest && Array.isArray(vr.objectives) && typeof vr.name === 'string') p.quest = v as QuestInstance;
      if (Array.isArray(v)) continue;
      visit(v, depth + 1);
    }
  };
  visit(scene, 0);
  // Only cache once we actually found the player — probing during a scene
  // transition can otherwise freeze a half-empty result in place forever.
  if (p.player) probes.set(scene, p);
  return p;
}

// ---------------------------------------------------------------------------
// Orb — a canvas globe with animated liquid.
// ---------------------------------------------------------------------------

/** Fractional part, for looping bubble phases without any randomness. */
function frac(v: number): number {
  return v - Math.floor(v);
}

/**
 * A two-beat heartbeat envelope, 0..1, with a period of `period` seconds.
 * Lub, a short gap, dub. Reads as a pulse rather than a blink.
 */
function heartbeat(t: number, period: number): number {
  const p = t % period;
  const lub = Math.exp(-p * 14);
  const q = p - 0.2;
  const dub = q > 0 ? 0.65 * Math.exp(-q * 13) : 0;
  return Math.min(1, lub + dub);
}

/** Per-orb palette: surface, body, depths, the trail band and the swirl tint. */
interface OrbPalette {
  hi: [number, number, number];
  mid: [number, number, number];
  deep: [number, number, number];
  trail: string;
  swirl: string;
}

const ORB_PALETTE: Record<'life' | 'mana', OrbPalette> = {
  life: {
    hi: [255, 120, 96],
    mid: [196, 22, 18],
    deep: [58, 4, 6],
    trail: 'rgba(255,214,170,0.42)',
    swirl: 'rgba(255,90,60,',
  },
  mana: {
    hi: [140, 196, 255],
    mid: [34, 92, 214],
    deep: [8, 16, 64],
    trail: 'rgba(200,230,255,0.38)',
    swirl: 'rgba(120,170,255,',
  },
};

class Orb {
  readonly root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private label: HTMLDivElement;
  private curEl: HTMLElement | null;
  private maxEl: HTMLElement | null;
  private kind: 'life' | 'mana';
  private pal: OrbPalette;
  private size: number;

  /** What the liquid shows, eased toward `target` so a hit pours rather than cuts. */
  private display = 1;
  private target = 1;
  /**
   * The "damage taken" level. It holds where the liquid was for a moment after
   * a loss, then drains to meet it, so a big hit leaves a visible pale band of
   * exactly how much it cost.
   */
  private trail = 1;
  private trailHold = 0;
  /** Surface slosh: a damped spring kicked by every change in level. */
  private slosh = 0;
  private sloshV = 0;
  private flash = 0;
  private healGlow = 0;
  private lastCur = -1;
  private lastMax = -1;

  constructor(kind: 'life' | 'mana', size: number) {
    this.kind = kind;
    this.pal = ORB_PALETTE[kind];
    this.size = size;
    this.root = div(`orb orb-${kind}`);
    this.canvas = el2('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(size * dpr);
    this.canvas.height = Math.round(size * dpr);
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    // Small and redrawn every frame: painted on the CPU. A GPU canvas drawn
    // every frame can have the browser hold the page each frame until the
    // GPU, busy with the world, has caught up with it.
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.ctx?.scale(dpr, dpr);

    const glass = div('orb-glass');
    const ring = div('orb-ring');
    const studs = div('orb-studs');
    const wing = div('orb-wing');
    wing.innerHTML = ORB_WING_SVG;
    this.label = div('orb-label');
    this.label.innerHTML = '<span class="orb-cur">0</span><span class="orb-max">/ 0</span>';
    this.curEl = this.label.querySelector<HTMLElement>('.orb-cur');
    this.maxEl = this.label.querySelector<HTMLElement>('.orb-max');
    add(this.root, wing, this.canvas, glass, ring, studs, this.label);
  }

  set(value: number, max: number): void {
    const t = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    const delta = t - this.target;
    if (delta < -0.001) {
      this.flash = Math.min(1, this.flash + 0.5 + -delta * 3);
      this.trailHold = 0.45;
      // A bigger loss throws the liquid harder.
      this.sloshV -= Math.min(26, 6 + -delta * 90);
    } else if (delta > 0.004) {
      this.healGlow = Math.min(1, this.healGlow + delta * 6);
      this.sloshV += Math.min(14, 3 + delta * 40);
    }
    this.target = t;
    const cur = Math.round(value);
    const mx = Math.round(max);
    // Writing text every frame forces layout; only touch it on a change.
    if (cur !== this.lastCur && this.curEl) {
      this.lastCur = cur;
      countTo(this.curEl, cur, (n) => fmtInt(Math.round(n)), 260);
    }
    if (mx !== this.lastMax && this.maxEl) {
      this.lastMax = mx;
      this.maxEl.textContent = `/ ${fmtInt(mx)}`;
    }
    this.root.classList.toggle('is-critical', this.kind === 'life' && t < 0.28 && t > 0);
    this.root.classList.toggle('is-empty', t <= 0.001);
  }

  draw(elapsed: number, dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const step = Math.min(dt, 0.05);
    this.display += (this.target - this.display) * Math.min(1, step * 7);
    if (this.trail < this.display) this.trail = this.display;
    if (this.trailHold > 0) this.trailHold -= step;
    else this.trail += (this.display - this.trail) * Math.min(1, step * 2.6);
    // Damped spring: stiff enough to settle in about a second.
    this.sloshV += (-this.slosh * 38 - this.sloshV * 3.2) * step;
    this.slosh += this.sloshV * step;
    this.flash = Math.max(0, this.flash - step * 2.4);
    this.healGlow = Math.max(0, this.healGlow - step * 1.6);

    const s = this.size;
    const r = s / 2;
    const pal = this.pal;
    const [hr, hg, hb] = pal.hi;
    const [mr, mg, mb] = pal.mid;
    const [dr, dg, db] = pal.deep;
    const critical = this.kind === 'life' && this.target < 0.28 && this.target > 0;
    const beat = critical ? heartbeat(elapsed, 1.05) : 0;

    ctx.clearRect(0, 0, s, s);
    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, r - 1, 0, Math.PI * 2);
    ctx.clip();

    // Empty vessel: smoked glass, faintly tinted by what it holds.
    const bg = ctx.createRadialGradient(r * 0.8, r * 0.7, r * 0.1, r, r, r);
    bg.addColorStop(0, `rgb(${Math.round(dr * 0.6 + 14)},${Math.round(dg * 0.6 + 12)},${Math.round(db * 0.6 + 14)})`);
    bg.addColorStop(1, '#030203');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, s, s);

    const level = s - this.display * s;
    const trailLevel = s - this.trail * s;
    const tilt = this.slosh * 0.012;

    // Damage-taken band, drawn first so the liquid sits in front of it.
    if (trailLevel < level - 0.5) {
      ctx.fillStyle = pal.trail;
      ctx.fillRect(0, trailLevel, s, level - trailLevel + 2);
    }

    const surface = (x: number, layer: number): number => {
      const amp = (layer === 0 ? 2.6 : 1.8) * (0.5 + this.display * 0.5) + Math.abs(this.slosh) * 0.12;
      const speed = layer === 0 ? 1.6 : -2.1;
      const freq = layer === 0 ? 0.06 : 0.09;
      return (
        level +
        (layer === 0 ? 0 : -1.6) +
        (x - r) * tilt +
        Math.sin(x * freq + elapsed * speed + layer * 1.9) * amp +
        Math.sin(x * 0.17 - elapsed * 2.9 + layer) * amp * 0.25
      );
    };

    const liquidPath = (layer: number): void => {
      ctx.beginPath();
      ctx.moveTo(0, s);
      for (let x = 0; x <= s; x += 3) ctx.lineTo(x, surface(x, layer));
      ctx.lineTo(s, surface(s, layer));
      ctx.lineTo(s, s);
      ctx.closePath();
    };

    if (this.display > 0.002) {
      // Back wave: thinner, darker, a beat out of step with the front.
      liquidPath(1);
      ctx.fillStyle = `rgba(${mr},${mg},${mb},0.5)`;
      ctx.fill();

      // Front body.
      liquidPath(0);
      const g = ctx.createLinearGradient(0, level - 6, 0, s);
      g.addColorStop(0, `rgb(${hr},${hg},${hb})`);
      g.addColorStop(0.16, `rgb(${mr},${mg},${mb})`);
      g.addColorStop(1, `rgb(${dr},${dg},${db})`);
      ctx.fillStyle = g;
      ctx.fill();

      // Everything below lives inside the liquid.
      ctx.save();
      liquidPath(0);
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';

      // Slow churn: three soft lights drifting on Lissajous paths.
      for (let i = 0; i < 3; i++) {
        const cx = r + Math.sin(elapsed * (0.35 + i * 0.13) + i * 2.1) * r * 0.55;
        const cy = r + 8 + Math.cos(elapsed * (0.27 + i * 0.11) + i * 1.3) * r * 0.45;
        const rad = r * (0.42 + i * 0.1);
        const sw = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        sw.addColorStop(0, `${pal.swirl}${0.2 + beat * 0.25})`);
        sw.addColorStop(1, `${pal.swirl}0)`);
        ctx.fillStyle = sw;
        ctx.fillRect(0, 0, s, s);
      }

      // Bubbles, rising on fixed loops. Deterministic, so no RNG needed.
      for (let i = 0; i < 9; i++) {
        const seed = frac(Math.sin(i * 91.7) * 4375.85);
        const speed = 0.16 + seed * 0.22;
        const ph = frac(elapsed * speed + seed * 7.3);
        const bx = r + (frac(seed * 13.1) - 0.5) * s * 0.7 + Math.sin(elapsed * 2 + i) * 2.2;
        const by = s - ph * (s - level + 4);
        if (by < level + 3) continue;
        const br = 0.8 + frac(seed * 5.7) * 1.8;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${0.1 + (1 - ph) * 0.12})`;
        ctx.fill();
      }

      // Caustic sheen just under the surface.
      const sheen = ctx.createLinearGradient(0, level - 4, 0, level + 22);
      sheen.addColorStop(0, `rgba(255,255,255,${0.2 + this.flash * 0.3 + this.healGlow * 0.3})`);
      sheen.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(0, level - 6, s, 30);
      ctx.restore();

      // Meniscus: a bright hairline along the front surface.
      ctx.beginPath();
      for (let x = 0; x <= s; x += 3) {
        const y = surface(x, 0);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${Math.min(255, hr + 40)},${Math.min(255, hg + 60)},${Math.min(255, hb + 60)},0.75)`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    ctx.globalCompositeOperation = 'lighter';
    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(255,236,220,${this.flash * 0.16})`;
      ctx.fillRect(0, 0, s, s);
    }
    if (this.healGlow > 0.01) {
      ctx.fillStyle = `rgba(${hr},${hg},${hb},${this.healGlow * 0.18})`;
      ctx.fillRect(0, 0, s, s);
    }
    if (beat > 0.01) {
      // The whole globe throbs with the heartbeat when life runs low.
      const hb2 = ctx.createRadialGradient(r, r, r * 0.3, r, r, r);
      hb2.addColorStop(0, `rgba(255,40,30,${beat * 0.06})`);
      hb2.addColorStop(1, `rgba(255,40,30,${beat * 0.38})`);
      ctx.fillStyle = hb2;
      ctx.fillRect(0, 0, s, s);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Spherical shading: darken toward the rim so it reads as a globe.
    const rim = ctx.createRadialGradient(r * 0.92, r * 0.86, r * 0.5, r, r, r);
    rim.addColorStop(0, 'rgba(0,0,0,0)');
    rim.addColorStop(0.82, 'rgba(0,0,0,0.25)');
    rim.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = rim;
    ctx.fillRect(0, 0, s, s);

    ctx.restore();
  }
}

/** A horned skull on a gilt boss: the end caps of the boss health bar. */
const BOSS_CAP_SVG =
  '<svg viewBox="0 0 40 40" aria-hidden="true">' +
  '<path d="M20 1 39 20 20 39 1 20Z" fill="#1a110a" stroke="#c9a24f" stroke-width="1.6"/>' +
  '<path d="M20 5 35 20 20 35 5 20Z" fill="none" stroke="#6d4f1e" stroke-width="1"/>' +
  '<path d="M11 13c1 3 3 4.6 5 5M29 13c-1 3-3 4.6-5 5" fill="none" stroke="#e8d3a0" stroke-width="1.4" stroke-linecap="round"/>' +
  '<path d="M20 13c-4.4 0-7 2.8-7 6.4 0 2.4 1.2 3.9 2.6 4.6V27h8.8v-3c1.4-.7 2.6-2.2 2.6-4.6 0-3.6-2.6-6.4-7-6.4Z" fill="#e8d3a0"/>' +
  '<circle cx="17.3" cy="19.6" r="1.7" fill="#b3200f"/><circle cx="22.7" cy="19.6" r="1.7" fill="#b3200f"/>' +
  '<path d="M18 27v-2M20 27v-2M22 27v-2" stroke="#1a110a" stroke-width=".9"/>' +
  '</svg>';

/**
 * The bracket that cradles each orb on its outer side: a crescent of gilt
 * with three thorns, drawn for the life orb and mirrored for mana.
 */
const ORB_WING_SVG =
  '<svg viewBox="0 0 60 150" aria-hidden="true">' +
  '<defs><linearGradient id="orbWingG" x1="0" y1="0" x2="1" y2="1">' +
  '<stop offset="0" stop-color="#f3dc9a"/><stop offset=".45" stop-color="#9c7432"/><stop offset="1" stop-color="#4a3414"/>' +
  '</linearGradient></defs>' +
  '<path d="M52 8C26 22 12 46 12 75s14 53 40 67C34 124 26 101 26 75s8-49 26-67Z" fill="url(#orbWingG)" stroke="#120c06" stroke-width="1.2"/>' +
  '<path d="M19 40 3 33 15 47ZM13 75 0 75 13 82ZM19 110 3 117 15 103Z" fill="url(#orbWingG)" stroke="#120c06" stroke-width="1"/>' +
  '<path d="M44 18C28 32 20 52 20 75s8 43 24 57" fill="none" stroke="#fff1c4" stroke-opacity=".35" stroke-width="1"/>' +
  '<circle cx="19" cy="75" r="4" fill="#1a0f08" stroke="#e3c47e" stroke-width="1.2"/>' +
  '<circle class="orb-gem" cx="19" cy="75" r="2.2"/>' +
  '</svg>';

function el2<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] {
  return document.createElement(tag);
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

interface QuestTrack {
  name: string;
  objectives: Array<{ desc: string; progress: number; target: number; done: boolean }>;
}


/** The last number each element was given for each CSS variable (see `setVar`). */
const shownVars = new WeakMap<HTMLElement, Record<string, number>>();

/**
 * Sets a CSS variable to a number, only when the number changed. The HUD
 * sets these every frame, and an inline style write restyles the element
 * even when the value is the same as before: eight of them a frame for
 * cooldowns that were mostly sitting at zero.
 */
const kids = new WeakMap<HTMLElement, Map<string, HTMLElement>>();

/**
 * `el.querySelector(sel)`, remembered: for per-frame code reaching into
 * parts that are built once with their parent. A miss is not remembered,
 * so a part added later is still found.
 */
function part(el: HTMLElement, sel: string): HTMLElement | null {
  let m = kids.get(el);
  if (!m) {
    m = new Map();
    kids.set(el, m);
  }
  const hit = m.get(sel);
  if (hit && hit.parentNode) return hit;
  const found = el.querySelector<HTMLElement>(sel);
  if (found) m.set(sel, found);
  return found;
}

function setVar(el: HTMLElement, name: string, v: number): void {
  let shown = shownVars.get(el);
  if (!shown) {
    shown = {};
    shownVars.set(el, shown);
  }
  if (shown[name] === v) return;
  shown[name] = v;
  el.style.setProperty(name, String(v));
}

/**
 * Plays a class's CSS animation again from the start. The usual trick (drop
 * the class, read `offsetWidth`, add it back) makes the browser lay out the
 * whole page on the spot, and the HUD did that on every hit taken and every
 * cast: a full layout each time, several in a busy frame. Here the class goes
 * now and comes back on the next frame, after the page has drawn without it.
 */
const replaying = new Map<HTMLElement, Set<string>>();
let replayFrame = 0;
function replayClass(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  let set = replaying.get(el);
  if (!set) replaying.set(el, (set = new Set()));
  set.add(cls);
  if (replayFrame) return;
  // Two frames: a call from outside the frame loop (a key press) would
  // otherwise add the class back before the page ever drew without it.
  replayFrame = requestAnimationFrame(() => {
    replayFrame = requestAnimationFrame(() => {
      replayFrame = 0;
      for (const [node, list] of replaying) for (const c of list) node.classList.add(c);
      replaying.clear();
    });
  });
}

export class HUD {
  readonly root: HTMLDivElement;

  private engine: Engine;
  private lifeOrb: Orb;
  private manaOrb: Orb;
  private xpFill: HTMLDivElement;
  private xpText: HTMLSpanElement;
  private levelBadge: HTMLDivElement;
  private hotSlots: HTMLDivElement[] = [];
  private hotIcons: HTMLDivElement[] = [];
  private potionLife: HTMLDivElement;
  private potionMana: HTMLDivElement;
  private dashSlot!: HTMLDivElement;
  private buffStrip: HTMLDivElement;
  private rmbSlot!: HTMLDivElement;
  private rmbArt!: HTMLDivElement;
  private rmbCd!: HTMLDivElement;
  /** Last cooldown seen per slot (RMB is index 6), to catch casts and readies. */
  private cdPrev: number[] = [0, 0, 0, 0, 0, 0, 0];
  private dashMax = 0;
  private dashWasOn = false;
  private minimapCanvas: HTMLCanvasElement;
  private minimapCtx: CanvasRenderingContext2D | null;
  private minimapLabel: HTMLDivElement;
  private depthLabel: HTMLSpanElement;
  private biomeLabel: HTMLSpanElement;
  private questBox: HTMLDivElement;
  private bossBar: HTMLDivElement;
  private bossFill: HTMLDivElement;
  private bossTrail: HTMLDivElement;
  private bossTicks: HTMLDivElement;
  private bossPct: HTMLSpanElement;
  private bossTrailTimer = 0;
  private bossThresholds: number[] = [];
  private xpTrack: HTMLDivElement;
  private bossName: HTMLDivElement;
  private bossPips: HTMLDivElement;
  private bossBark: HTMLDivElement;
  /** The boss's wind-up: ability name over a bar that fills to the hit. */
  private bossCast: HTMLDivElement;
  private bossCastFill: HTMLDivElement;
  private bossCastName: HTMLSpanElement;
  private bossCastTimer = 0;
  /** The room rule's bar: what to do, and how far along it is. */
  private bossRule: HTMLDivElement;
  private bossRuleName: HTMLSpanElement;
  private bossRuleFill: HTMLDivElement;
  /** A mini-boss's entrance card under the boss bar's spot. */
  private miniCard: HTMLDivElement;
  private miniTimer = 0;
  private toastStack: HTMLDivElement;
  private promptBox: HTMLDivElement;
  private floatLayer: HTMLDivElement;
  private centerLayer: HTMLDivElement;
  private goldReadout: HTMLSpanElement;

  private minimapAccum = 0;
  private orbAccum = 1;
  private bossMax = 1;
  private bossLife = 1;
  private bossVisible = false;
  private quest: QuestTrack | null = null;
  private tracker: HTMLDivElement;
  private trackerHd: HTMLDivElement;
  private trackerBody: HTMLDivElement;
  private trackerKey = '';
  private trackerAccum = 1;
  private offs: Array<() => void> = [];
  private shown = false;
  private lastHotbarKey = '';
  private toastCount = 0;

  constructor(engine: Engine) {
    this.engine = engine;
    this.root = div('hud');

    // --- top-left: run header -------------------------------------------
    const header = div('hud-header ui-interactive');
    const crest = div('hud-crest');
    crest.innerHTML = iconSvg('descend', { size: 17 });
    const headText = div('hud-header-text');
    this.depthLabel = span('hud-depth', 'The Town');
    this.biomeLabel = span('hud-biome', 'Sanctuary');
    add(headText, this.depthLabel, this.biomeLabel);
    add(header, crest, headText);

    this.buffStrip = div('hud-buffs');
    const topLeft = div('hud-topleft');
    add(topLeft, header);

    // --- top-right: minimap + quest --------------------------------------
    const topRight = div('hud-topright');
    const mapWrap = div('minimap ui-interactive');
    this.minimapCanvas = el2('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.minimapCanvas.width = MINIMAP_PX * dpr;
    this.minimapCanvas.height = MINIMAP_PX * dpr;
    this.minimapCanvas.style.width = `${MINIMAP_PX}px`;
    this.minimapCanvas.style.height = `${MINIMAP_PX}px`;
    // On the CPU, like the orbs: small and redrawn every frame.
    this.minimapCtx = this.minimapCanvas.getContext('2d', { willReadFrequently: true });
    this.minimapCtx?.scale(dpr, dpr);
    this.minimapLabel = div('minimap-label', 'Tier 0');
    const mapFrame = div('minimap-frame');
    const mapBtn = div('minimap-expand');
    mapBtn.innerHTML = iconSvg('map', { size: 14 });
    mapBtn.title = 'Open map (M)';
    mapBtn.addEventListener('click', () => events.emit('ui:open', { panel: 'map' }));
    add(mapWrap, this.minimapCanvas, mapFrame, this.minimapLabel, mapBtn);

    this.questBox = div('hud-quest ui-interactive');
    this.questBox.style.display = 'none';
    this.questBox.addEventListener('click', () => events.emit('ui:open', { panel: 'questLog' }));

    // Everything else you have taken on, quiet, under the run's contract.
    // Its header folds it away (and back), remembered with the settings.
    this.tracker = div('hud-tracker ui-interactive');
    this.trackerHd = div('hud-track-hd');
    this.trackerHd.title = 'Hide or show the quest list';
    this.trackerHd.addEventListener('click', () => {
      save.settings.trackerHidden = !save.settings.trackerHidden;
      save.touch();
      this.trackerKey = '';
      attempt(() => this.renderTracker(), undefined);
    });
    this.trackerBody = div('hud-track-body');
    this.trackerBody.title = 'Open the journal (J)';
    this.trackerBody.addEventListener('click', () => events.emit('ui:open', { panel: 'journal' }));
    add(this.tracker, this.trackerHd, this.trackerBody);

    this.toastStack = div('toast-stack');
    add(topRight, mapWrap, this.questBox, this.tracker, this.toastStack);

    // --- top-center: boss bar --------------------------------------------
    // A framed plate: skull caps at each end, a pale trail that shows the
    // last chunk of damage, and tick marks where the fight changes phase.
    this.bossBar = div('bossbar');
    this.bossName = div('bossbar-name');
    this.bossPips = div('bossbar-pips');
    const bossPlate = div('bossbar-plate');
    const bossTrack = div('bossbar-track');
    this.bossTrail = div('bossbar-trail');
    this.bossFill = div('bossbar-fill');
    this.bossTicks = div('bossbar-ticks');
    const bossGloss = div('bossbar-gloss');
    this.bossPct = span('bossbar-pct', '100%');
    add(bossTrack, this.bossTrail, this.bossFill, this.bossTicks, bossGloss, this.bossPct);
    const capL = div('bossbar-cap cap-l');
    const capR = div('bossbar-cap cap-r');
    capL.innerHTML = BOSS_CAP_SVG;
    capR.innerHTML = BOSS_CAP_SVG;
    add(bossPlate, capL, bossTrack, capR);
    this.bossBark = div('bossbar-bark');
    this.bossCast = div('bosscast');
    this.bossCastName = span('bosscast-name');
    const castTrack = div('bosscast-track');
    this.bossCastFill = div('bosscast-fill');
    castTrack.appendChild(this.bossCastFill);
    add(this.bossCast, this.bossCastName, castTrack);
    this.bossRule = div('bossrule');
    this.bossRuleName = span('bossrule-name');
    const ruleTrack = div('bossrule-track');
    this.bossRuleFill = div('bossrule-fill');
    ruleTrack.appendChild(this.bossRuleFill);
    add(this.bossRule, this.bossRuleName, ruleTrack);
    add(this.bossBar, this.bossName, bossPlate, this.bossPips, this.bossCast, this.bossRule, this.bossBark);
    this.miniCard = div('minicard');

    // --- bottom: command bar ---------------------------------------------
    const bar = div('cmdbar');
    this.lifeOrb = new Orb('life', 124);
    this.manaOrb = new Orb('mana', 124);

    const center = div('cmdbar-center');

    // XP bar with the level badge riding on its left edge.
    const xpRow = div('xprow');
    this.levelBadge = div('level-badge');
    this.levelBadge.innerHTML = '<span class="level-num">1</span><span class="level-word">LVL</span>';
    const xpTrack = div('xp-track ui-interactive');
    this.xpTrack = xpTrack;
    this.xpFill = div('xp-fill');
    this.xpText = span('xp-text', '0 / 0 XP');
    // Ten cells, so "a tenth of a level" is something you can see at a glance.
    const xpNotches = div('xp-notches');
    const xpFlare = div('xp-flare');
    add(xpTrack, this.xpFill, xpNotches, xpFlare, this.xpText);
    add(xpRow, this.levelBadge, xpTrack);

    const slots = div('hotbar');

    // The attack button gets its own slot at the head of the bar so it is
    // obvious what right click does, and so a skill can be dragged onto it.
    this.rmbSlot = div('hotslot hotslot-rmb ui-interactive');
    this.rmbArt = div('hotslot-art');
    const rmbCd = div('hotslot-cd');
    const rmbKey = div('hotslot-key', 'RMB');
    add(this.rmbSlot, this.rmbArt, rmbCd, div('hotslot-edge'), div('hotslot-cdtext'), div('hotslot-tint'), rmbKey);
    slots.appendChild(this.rmbSlot);
    this.rmbCd = rmbCd;

    registerDrop(
      this.rmbSlot,
      (p) => p.kind === 'skill' && !!p.skillId,
      (p) => {
        const c = save.account.current;
        if (!c || !p.skillId) return false;
        if (!setPrimaryAttack(c, p.skillId)) return false;
        save.touch();
        this.buildHotbar(true);
        events.emit('toast', {
          text: `${skillById(p.skillId)?.name ?? 'Skill'} bound to right click`,
          kind: 'good',
        });
        return true;
      }
    );
    // Right-clicking the slot clears it back to the plain basic attack.
    this.rmbSlot.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const c = save.account.current;
      if (!c || !c.primaryAttack) return;
      setPrimaryAttack(c, null);
      save.touch();
      this.buildHotbar(true);
      events.emit('toast', { text: 'Right click set to basic attack', kind: 'info' });
    });

    for (let i = 0; i < 6; i++) {
      const s = div('hotslot ui-interactive');
      s.dataset.index = String(i);
      const art = div('hotslot-art');
      const cd = div('hotslot-cd');
      // The bright hand of the cooldown clock, so the sweep reads at a glance.
      const edge = div('hotslot-edge');
      const cdText = div('hotslot-cdtext');
      // Out-of-mana and out-of-range wash the icon in one overlay.
      const tint = div('hotslot-tint');
      const key = div('hotslot-key', String(i + 1));
      const cost = div('hotslot-cost');
      const rank = div('hotslot-rank');
      const charges = div('hotslot-charges');
      add(s, art, cd, edge, tint, cdText, key, cost, rank, charges);
      this.hotSlots.push(s);
      this.hotIcons.push(art);
      slots.appendChild(s);

      registerDrop(
        s,
        (p) => p.kind === 'skill' && !!p.skillId,
        (p) => {
          const c = save.account.current;
          if (!c || !p.skillId) return false;
          if (!setHotbarSlot(c, i, p.skillId)) return false;
          save.touch();
          this.buildHotbar(true);
          events.emit('toast', { text: `Bound ${skillById(p.skillId)?.name ?? 'skill'} to slot ${i + 1}`, kind: 'good' });
          return true;
        }
      );
      s.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const c = save.account.current;
        if (!c || !c.hotbar[i]) return;
        c.hotbar[i] = null;
        save.touch();
        this.buildHotbar(true);
      });
    }

    const potions = div('potions');
    this.potionLife = div('potslot pot-life ui-interactive');
    this.potionMana = div('potslot pot-mana ui-interactive');
    for (const [node, key] of [
      [this.potionLife, 'Q'],
      [this.potionMana, 'F'],
    ] as Array<[HTMLDivElement, string]>) {
      // The flask itself, as the pack draws it: the one a quick drink reaches for (`refreshPotions`).
      const art = div('potslot-art');
      art.innerHTML = '<img class="potslot-img" alt="" draggable="false">';
      const count = div('potslot-count', '0');
      const k = div('potslot-key', key);
      add(node, art, count, k);
    }
    // Clicking a flask drinks it. The slots have always shown a count; nothing
    // ever let you use one, from here or from the pack.
    this.potionLife.addEventListener('click', () => events.emit('potion:use', { kind: 'life' }));
    this.potionMana.addEventListener('click', () => events.emit('potion:use', { kind: 'mana' }));
    this.potionLife.title = 'Drink a healing potion (Q)';
    this.potionMana.title = 'Drink a mana potion (F)';

    add(potions, this.potionLife, this.potionMana);

    // Dash slot. It has a cooldown now, and a cooldown the player cannot see is
    // just the button randomly not working.
    this.dashSlot = div('potslot pot-dash ui-interactive');
    const dashArt = div('potslot-art');
    dashArt.innerHTML = `<img class="potslot-img" src="${skillIconUri('dash', undefined, undefined, false, 'dash')}" alt="" draggable="false">`;
    const dashCd = div('hotslot-cd');
    const dashKey = div('potslot-key', 'SPC');
    add(this.dashSlot, dashArt, dashCd, div('hotslot-edge'), dashKey);
    potions.appendChild(this.dashSlot);

    const skillRow = div('skillrow');
    add(skillRow, slots, potions);
    // The carved plate the whole bar sits on, joining the two orbs.
    const plate = div('cmdbar-plate');
    // Buffs ride just above the plate: where the eyes already are in a fight.
    add(center, plate, this.buffStrip, xpRow, skillRow);

    const goldBox = div('hud-gold ui-interactive');
    goldBox.appendChild(icon('coin', { size: 14 }));
    this.goldReadout = span('hud-gold-v', '0');
    goldBox.appendChild(this.goldReadout);

    add(bar, this.lifeOrb.root, center, this.manaOrb.root);

    this.promptBox = div('hud-prompt');
    this.floatLayer = div('float-layer');
    this.centerLayer = div('center-layer');

    add(this.root, topLeft, topRight, this.bossBar, this.miniCard, this.centerLayer, this.promptBox, goldBox, bar, this.floatLayer);
    this.root.style.display = 'none';
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
    this.wire();
  }

  // -- visibility ----------------------------------------------------------

  show(): void {
    if (this.shown) return;
    this.shown = true;
    this.root.style.display = '';
    requestAnimationFrame(() => this.root.classList.add('is-live'));
    this.refreshAll();
  }

  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.root.classList.remove('is-live');
    this.root.style.display = 'none';
    this.hideBoss();
  }

  get visible(): boolean {
    return this.shown;
  }

  // -- events --------------------------------------------------------------

  private wire(): void {
    const on = <K extends keyof GameEvents>(k: K, fn: (p: GameEvents[K]) => void): void => {
      this.offs.push(events.on(k, fn));
    };

    on('ui:open', (p) => {
      if (p.panel === 'hud') this.show();
    });
    on('ui:close', (p) => {
      if (p.panel === 'hud') this.hide();
    });
    on('scene:change', (p) => {
      if (p.to === 'town' || p.to === 'dungeon') this.show();
      else this.hide();
      if (p.to === 'town') {
        this.depthLabel.textContent = 'The Town';
        this.biomeLabel.textContent = 'Sanctuary — no monsters walk here';
        this.hideBoss();
        this.quest = null;
        this.questBox.style.display = 'none';
      }
      this.refreshAll();
    });

    on('ui:refresh', () => this.refreshAll());

    // Press feedback. The bar does not handle input (the scene does); this only
    // dips the slot that was pressed so a keypress is visibly acknowledged.
    const pressKeys: Record<string, () => HTMLElement | undefined> = {
      Digit1: () => this.hotSlots[0],
      Digit2: () => this.hotSlots[1],
      Digit3: () => this.hotSlots[2],
      Digit4: () => this.hotSlots[3],
      Digit5: () => this.hotSlots[4],
      Digit6: () => this.hotSlots[5],
      KeyQ: () => this.potionLife,
      KeyF: () => this.potionMana,
      Space: () => this.dashSlot,
    };
    const onKey = (e: KeyboardEvent): void => {
      if (!this.shown || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const node = pressKeys[e.code]?.();
      if (!node) return;
      replayClass(node, 'is-pressed');
    };
    window.addEventListener('keydown', onKey);
    this.offs.push(() => window.removeEventListener('keydown', onKey));
    on('item:equipped', () => this.refreshAll());
    on('item:unequipped', () => this.refreshAll());

    on('player:damaged', (p) => {
      this.lifeOrb.set(p.life, p.maxLife);
      // The number itself is drawn over the hero by CombatTextLayer; a second
      // copy over the orb only split the eye between two places.
      this.pulseHurt(p.amount / Math.max(1, p.maxLife));
    });
    on('player:levelUp', (p) => {
      this.levelFlourish(p.level);
      this.refreshAll();
    });
    on('player:xp', () => {
      const c = save.account.current;
      if (!c) return;
      // Read the character, not the event payload. `c.xp` is by definition the
      // progress into the current level, so there is nothing to derive and
      // nothing for a bad `toNext` to corrupt.
      const need = attempt(() => xpForLevel(c.level), 100);
      this.setXp(c.xp, need, c.level);
    });
    on('loot:gold', (p) => {
      this.floatText(`+${fmtInt(p.amount)}`, 'gold', this.goldReadout);
      this.refreshGold();
    });
    on('loot:pickedUp', (p) => {
      this.toast(attempt(() => p.item.name, 'Item'), 'epic', p.item.rarity);
      this.refreshPotions();
      // Draw its inventory icon now, in the quiet frames after the pickup,
      // rather than all of them at once the next time the pack is opened.
      attempt(() => warmItemIcons([p.item], 'shaped'), undefined);
    });
    on('depth:changed', (p) => {
      // A new floor means a new grid and a new tile mapping, so anything we
      // cached about the scene's shape is now a lie.
      forgetProbe(this.engine.currentScene as unknown as object | null);
      runtime.level = null;
      runtime.depth = p.depth;
      runtime.levelIndex = p.level;
      runtime.levelsTotal = p.of;
      runtime.inTown = p.depth <= 0;
      if (p.depth <= 0) {
        this.depthLabel.textContent = 'The Town';
        this.biomeLabel.textContent = 'Sanctuary';
        this.minimapLabel.textContent = 'Town';
      } else {
        // A map: its name and tier on top, the zone you are in below.
        if (p.mapName) {
          this.depthLabel.textContent = `${p.mapName} · Tier ${p.depth}`;
          this.biomeLabel.textContent = p.place ?? '';
        } else {
          this.depthLabel.textContent = p.place ? `Tier ${p.depth} · ${p.place}` : `Tier ${p.depth}`;
          this.biomeLabel.textContent = p.of > 0 ? `Area ${p.level} of ${p.of}` : '';
        }
        this.minimapLabel.textContent = `Tier ${p.depth}`;
      }
      runtime.explored.clear();
    });
    on('zone:entered', (p) => {
      this.biomeLabel.textContent = p.name;
    });
    on('boss:engaged', (p) => this.showBoss(p.name, p.title, p.maxLife));
    on('boss:damaged', (p) => {
      this.bossLife = p.life;
      this.bossMax = Math.max(1, p.maxLife);
      this.setBossLife(p.life / this.bossMax);
    });
    on('boss:phase', (p) => {
      const pips = this.bossPips.querySelectorAll('.bosspip');
      pips.forEach((n, i) => {
        n.classList.toggle('spent', i < p.index);
        n.classList.toggle('is-current', i === p.index);
      });
      this.bossTicks.querySelectorAll('.btick').forEach((n, i) => n.classList.toggle('passed', i < p.index));
      if (p.bark) {
        this.bossBark.textContent = `“${p.bark}”`;
        this.bossBark.classList.remove('is-live');
        void this.bossBark.offsetWidth;
        this.bossBark.classList.add('is-live');
      }
      this.bossBar.classList.remove('phase-shift');
      void this.bossBar.offsetWidth;
      this.bossBar.classList.add('phase-shift');
    });
    on('boss:cast', (p) => this.bossCasting(p.ability, p.windup));
    on('boss:castEnd', () => this.endBossCast());
    on('boss:rule', (p) => {
      // Sent every frame by the rule: only touch the page when it changes.
      if (this.bossRuleName.textContent !== p.label) {
        this.bossRuleName.textContent = p.label;
        this.bossRule.classList.toggle('is-live', !!p.label);
      }
      const w = `${Math.round(p.value * 100)}%`;
      if (this.bossRuleFill.style.width !== w) this.bossRuleFill.style.width = w;
    });
    on('boss:enraged', () => {
      this.bossBar.classList.add('is-enraged');
      this.bossBar.classList.remove('enrage-in');
      void this.bossBar.offsetWidth;
      this.bossBar.classList.add('enrage-in');
    });
    on('miniboss:engaged', (p) => this.showMiniBoss(p.name, p.title, p.kind));
    on('miniboss:killed', (p) => {
      this.hideMiniBoss();
      this.toast(`${p.name} is slain`, 'epic');
    });
    on('boss:killed', () => {
      this.endBossCast();
      this.bossRule.classList.remove('is-live');
      this.bossRuleName.textContent = '';
      this.setBossLife(0);
      this.bossBar.classList.add('is-slain');
      setTimeout(() => this.hideBoss(), 1400);
    });
    on('quest:progress', (p) => this.questProgress(p));
    on('quest:complete', (p) => {
      this.toast(`Quest complete — ${p.name}`, 'epic');
      if (this.quest) {
        for (const o of this.quest.objectives) o.done = true;
        this.renderQuest();
      }
    });
    // The interact prompt is anchored, not transient: without an explicit clear
    // it survives the walk from town into the dungeon and sits there forever.
    on('scene:change', () => {
      this.setPrompt('');
    });
    on('toast', (p) => {
      const text = p.text ?? '';
      // The town's proximity prompts come through the toast channel; they are a
      // different thing entirely and get their own anchored slot.
      if (text.startsWith('[')) {
        this.setPrompt(text);
        return;
      }
      if (!text) {
        this.setPrompt('');
        return;
      }
      this.toast(text, p.kind ?? 'info', p.rarity);
    });
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs = [];
  }

  // -- per-frame -----------------------------------------------------------

  update(dt: number, elapsed: number): void {
    if (!this.shown) return;
    this.trackerAccum += dt;
    if (this.trackerAccum >= 1) {
      this.trackerAccum = 0;
      attempt(() => this.renderTracker(), undefined);
    }

    const scene = this.engine.currentScene as unknown as object | null;
    const probe = scene ? probeScene(scene) : null;
    const char = save.account.current;

    // Vitals: prefer the live player, fall back to computed stats so the orbs
    // are never blank in town before the entity exists.
    let life = runtime.life;
    let maxLife = runtime.maxLife;
    let mana = runtime.mana;
    let maxMana = runtime.maxMana;
    const pl = probe?.player;
    if (pl) {
      const st = pl.stats as Partial<Record<StatKey, number>> | undefined;
      life = typeof pl.life === 'number' ? pl.life : life;
      mana = typeof pl.mana === 'number' ? pl.mana : mana;
      maxLife = st?.life ?? maxLife;
      maxMana = st?.mana ?? maxMana;
    } else if (char) {
      const st = attempt(() => computeStats(char), null);
      if (st) {
        maxLife = st.life;
        maxMana = st.mana;
        if (life <= 0) life = st.life;
        if (mana <= 0) mana = st.mana;
      }
    }
    runtime.life = life;
    runtime.maxLife = Math.max(1, maxLife);
    runtime.mana = mana;
    runtime.maxMana = Math.max(1, maxMana);

    this.lifeOrb.set(life, runtime.maxLife);
    this.manaOrb.set(mana, runtime.maxMana);
    // Thirty times a second is plenty for the liquid, and halves what two
    // gradient-filled canvases cost the main thread.
    this.orbAccum += dt;
    if (this.orbAccum >= 1 / 31) {
      this.lifeOrb.draw(elapsed, this.orbAccum);
      this.manaOrb.draw(elapsed, this.orbAccum);
      this.orbAccum = 0;
    }

    // Cooldowns.
    const cds = pl?.cooldowns;
    if (cds instanceof Map) {
      runtime.cooldowns = cds as Map<string, number>;
    }
    // How far the cursor is from the player, for skills with a cast range.
    let aim = Number.NaN;
    const wp = (this.engine as unknown as { input?: { worldPoint?: { x: number; z: number } } }).input?.worldPoint;
    const ppos = pl?.position as { x: number; z: number } | undefined;
    if (wp && ppos && !runtime.inTown) aim = Math.hypot(wp.x - ppos.x, wp.z - ppos.z);
    this.updateHotbarRuntime(mana, aim);

    // Dash cooldown, drawn with the same sweep the hotbar uses.
    const dashCd = typeof pl?.dodgeCooldown === 'number' ? (pl.dodgeCooldown as number) : 0;
    // The dash cooldown is published in seconds; show it as a fraction of the
    // longest one we have seen so the sweep empties smoothly.
    if (dashCd > this.dashMax) this.dashMax = dashCd;
    const dk = this.dashMax > 0 ? Math.min(1, dashCd / this.dashMax) : 0;
    setVar(this.dashSlot, '--cd', dk);
    const dashOn = dashCd > 0.001;
    if (this.dashWasOn && !dashOn) this.flashReady(this.dashSlot);
    this.dashWasOn = dashOn;
    this.dashSlot.classList.toggle('on-cd', dashOn);
    this.updateStatuses(pl);

    // Minimap at 8Hz — a full grid redraw every frame is pure waste.
    if (probe?.level) runtime.level = probe.level;
    if (pl) {
      const pos = pl.position as { x: number; z: number } | undefined;
      if (pos && probe?.worldToTile) {
        const t = probe.worldToTile(pos.x, pos.z);
        runtime.playerTileX = t.x;
        runtime.playerTileY = t.y;
      }
      // Minimap arrow heading, as a canvas rotation ready to use.
      //
      // The character's forward is +Z (`faceTowards` uses `atan2(dx, dz)` as the
      // yaw), and both maps put +Z down the canvas and +X across it. The arrow
      // art points up at rotation zero, so a canvas `rotate(a)` aims it at
      // (sin a, -cos a) and the heading we want is (sin yaw, +cos yaw). Those
      // agree when a = PI - yaw. It used to be plain `-yaw`, which is that
      // direction reflected through the origin — the arrow pointed at exactly
      // where the player had come from.
      const root = pl.root as { rotation?: { y: number } } | undefined;
      if (root?.rotation) runtime.facing = Math.PI - root.rotation.y;
    }
    this.minimapAccum += dt;
    if (this.minimapAccum > 0.125) {
      this.minimapAccum = 0;
      this.collectPips(probe);
      this.drawMinimap();
    }
  }

  // -- rebuilds ------------------------------------------------------------

  refreshAll(): void {
    const c = save.account.current;
    if (!c) return;
    this.buildHotbar(true);
    this.refreshPotions();
    this.refreshGold();
    const need = attempt(() => xpForLevel(c.level), 100);
    this.setXp(c.xp, need, c.level);
    // Get the pack's icons drawn in the background. Skips anything already
    // cached, so this is free after the first pass and means pressing I on a
    // loaded character does not have to draw sixty icons before it can paint.
    attempt(() => {
      warmItemIcons(c.inventory, 'shaped');
      warmItemIcons(Object.values(c.equipment), 'shaped');
    }, undefined);
  }

  private refreshGold(): void {
    const c = save.account.current;
    if (!c) return;
    countTo(this.goldReadout, c.gold, fmtInt, 380);
  }

  private setXp(into: number, need: number, level: number): void {
    const k = need > 0 ? Math.max(0, Math.min(1, into / need)) : 0;
    this.xpFill.style.width = `${k * 100}%`;
    this.xpText.textContent = `${fmtInt(into)} / ${fmtInt(need)} XP`;
    const num = this.levelBadge.querySelector<HTMLElement>('.level-num');
    if (num && num.textContent !== String(level)) num.textContent = String(level);
  }

  private buildHotbar(force = false): void {
    const c = save.account.current;
    if (!c) return;
    while (c.hotbar.length < 6) c.hotbar.push(null);
    const key = c.hotbar.slice(0, 6).join('|') + '#' + c.classId + '#' + (c.primaryAttack ?? 'basic');
    if (!force && key === this.lastHotbarKey) return;
    this.lastHotbarKey = key;
    const accent = classAccent(c.classId);

    // Right-click slot: the assigned skill, or the plain basic attack.
    const rmb = c.primaryAttack ?? null;
    clear(this.rmbArt);
    this.rmbSlot.classList.toggle('is-basic', !rmb);
    if (rmb) {
      const d = skillDefFor(rmb);
      this.rmbArt.innerHTML =
        `<img class="skill-img" src="${skillIconUri(rmb, d?.effect, d?.damageType, d?.targeting === 'passive', d?.icon)}" ` +
        `alt="" style="width:40px;height:40px" draggable="false">`;
      this.rmbSlot.dataset.skill = rmb;
      const rd = skillById(rmb);
      const rrank = c.skills[rmb] ?? 0;
      this.rmbSlot.dataset.cost = String(rd?.manaCost ? attempt(() => rd.manaCost?.(rrank) ?? 0, 0) : 0);
      this.rmbSlot.dataset.range = String(castRange(rd));
      this.rmbSlot.title = `${skillById(rmb)?.name ?? 'Skill'} — right click to attack. Right-click this slot to clear it.`;
    } else {
      // A crossed-swords mark reads as "plain attack" without needing words.
      this.rmbArt.innerHTML =
        '<svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true">' +
        '<path d="M3 3l7.5 7.5M21 3l-7.5 7.5M12 12l9 9M12 12l-9 9" fill="none" ' +
        'stroke="#cbb98a" stroke-width="2" stroke-linecap="round"/></svg>';
      delete this.rmbSlot.dataset.skill;
      this.rmbSlot.dataset.cost = '0';
      this.rmbSlot.dataset.range = '0';
      this.rmbSlot.title = 'Basic attack — drag a skill here to replace it.';
    }

    for (let i = 0; i < 6; i++) {
      const slotEl = this.hotSlots[i];
      const art = this.hotIcons[i];
      const id = c.hotbar[i];
      clear(art);
      slotEl.classList.toggle('is-empty', !id);
      const rankEl = slotEl.querySelector<HTMLElement>('.hotslot-rank');
      const costEl = slotEl.querySelector<HTMLElement>('.hotslot-cost');
      if (!id) {
        if (rankEl) rankEl.textContent = '';
        if (costEl) costEl.textContent = '';
        slotEl.title = 'Empty — drag a skill here from the skill tree (T)';
        continue;
      }
      const def = skillById(id);
      art.innerHTML = `<img class="skill-img" src="${skillIconUri(id, skillDefFor(id)?.effect, skillDefFor(id)?.damageType, skillDefFor(id)?.targeting === 'passive', skillDefFor(id)?.icon)}" alt="" style="width:40px;height:40px" draggable="false">`;
      const rank = c.skills[id] ?? 0;
      if (rankEl) rankEl.textContent = rank > 0 ? String(rank) : '';
      const cost = def?.manaCost ? attempt(() => def.manaCost?.(rank) ?? 0, 0) : 0;
      if (costEl) costEl.textContent = cost > 0 ? String(Math.round(cost)) : '';
      slotEl.dataset.skill = id;
      slotEl.dataset.cost = String(cost);
      slotEl.dataset.range = String(castRange(def));
      slotEl.title = def ? `${def.name} — Rank ${rank}` : id;
    }
  }

  private updateHotbarRuntime(mana: number, aim: number): void {
    const c = save.account.current;
    if (!c) return;
    for (let i = 0; i < 7; i++) {
      const slotEl = i < 6 ? this.hotSlots[i] : this.rmbSlot;
      const id = i < 6 ? c.hotbar[i] : c.primaryAttack;
      if (!id) {
        this.cdPrev[i] = 0;
        continue;
      }
      const remain = runtime.cooldowns.get(id) ?? 0;
      const def = skillById(id);
      const rank = c.skills[id] ?? 0;
      const total = def?.cooldown ? attempt(() => def.cooldown?.(rank) ?? 0, 0) : 0;
      const k = total > 0 ? Math.max(0, Math.min(1, remain / total)) : 0;
      setVar(slotEl, '--cd', k);
      const onCd = k > 0.001;
      slotEl.classList.toggle('on-cd', onCd);

      // A cooldown that jumps up means the skill just fired; one that reaches
      // zero means it is ready again. Both get a beat of light.
      const prev = this.cdPrev[i] ?? 0;
      if (remain > prev + 0.05 && prev < 0.05) this.flashCast(slotEl);
      else if (prev > 0.05 && remain <= 0.05) this.flashReady(slotEl);
      this.cdPrev[i] = remain;

      const t = part(slotEl, '.hotslot-cdtext');
      if (t) {
        const txt = remain > 0.05 ? (remain >= 10 ? String(Math.ceil(remain)) : remain.toFixed(1)) : '';
        if (t.textContent !== txt) t.textContent = txt;
      }
      const cost = Number(slotEl.dataset.cost ?? 0);
      slotEl.classList.toggle('no-mana', cost > 0 && mana < cost);
      const range = Number(slotEl.dataset.range ?? 0);
      slotEl.classList.toggle('out-of-range', range > 0 && Number.isFinite(aim) && aim > range);
      const ch = runtime.charges.get(id);
      const chEl = part(slotEl, '.hotslot-charges');
      if (chEl) {
        const txt = ch !== undefined ? String(ch) : '';
        if (chEl.textContent !== txt) chEl.textContent = txt;
        slotEl.classList.toggle('no-charges', ch === 0);
      }
    }
  }

  private flashCast(node: HTMLElement): void {
    replayClass(node, 'is-cast');
  }

  private flashReady(node: HTMLElement): void {
    replayClass(node, 'is-ready');
  }

  private refreshPotions(): void {
    const c = save.account.current;
    if (!c) return;
    let life = 0;
    let mana = 0;
    for (const it of c.inventory) {
      if (!it) continue;
      const base = safeBase(it);
      if (!base || base.category !== 'potion') continue;
      // Count units, not slots. Potions stack, so a slot holding five flasks
      // was being reported as one.
      const n = stackCount(it);
      const isMana = /mana|azure|sapphire|spirit/i.test(base.id + base.name);
      if (isMana) mana += n;
      else life += n;
    }
    const lc = this.potionLife.querySelector<HTMLElement>('.potslot-count');
    const mc = this.potionMana.querySelector<HTMLElement>('.potslot-count');
    if (lc) lc.textContent = String(life);
    if (mc) mc.textContent = String(mana);
    this.potionLife.classList.toggle('is-empty', life === 0);
    this.potionMana.classList.toggle('is-empty', mana === 0);
    this.potionArt(this.potionLife, c, 'life');
    this.potionArt(this.potionMana, c, 'mana');
  }

  /** Shows the flask a quick drink of `kind` takes next, or the plainest one when there are none. */
  private potionArt(slot: HTMLDivElement, c: Character, kind: 'life' | 'mana'): void {
    const img = slot.querySelector<HTMLImageElement>('.potslot-img');
    if (!img) return;
    const baseId = attempt(() => pickPotion(c, kind, 0), null) ?? (kind === 'life' ? 'potion.heal.minor' : 'potion.mana.minor');
    if (img.dataset.base === baseId) return;
    img.dataset.base = baseId;
    const item = c.inventory.find((it) => it?.baseId === baseId) ?? { uid: `hud:${baseId}`, baseId, name: baseId, rarity: 'normal', ilvl: 1, mods: [], upgrade: 0, sockets: [], value: 0 };
    img.src = requestItemIcon(item, (uri) => {
      if (img.dataset.base === baseId) img.src = uri;
    });
  }

  // -- statuses ------------------------------------------------------------

  private updateStatuses(player: Record<string, unknown> | null | undefined): void {
    const raw = player?.statuses;
    const list: Array<{ id: string; remaining: number; duration: number; stacks: number }> = [];
    if (Array.isArray(raw)) {
      for (const s of raw as Array<Record<string, unknown>>) {
        if (!s || typeof s.id !== 'string') continue;
        list.push({
          id: s.id,
          remaining: Number(s.remaining ?? s.timeLeft ?? s.duration ?? 0),
          duration: Number(s.duration ?? s.total ?? s.remaining ?? 1),
          stacks: Number(s.stacks ?? 1),
        });
      }
    } else if (raw instanceof Map) {
      for (const [id, v] of raw as Map<string, Record<string, unknown>>) {
        list.push({
          id,
          remaining: Number(v?.remaining ?? v?.duration ?? 0),
          duration: Number(v?.duration ?? 1),
          stacks: Number(v?.stacks ?? 1),
        });
      }
    }

    // Summons ride the same strip as buffs. A pack you cannot see the state of
    // is a pack you cannot play around, and a chip beside the buffs is where a
    // player already looks for "what is currently true about me".
    const pets = runtime.minions;

    // Signature comparison keeps us from rebuilding the strip every frame.
    const sig =
      list.map((s) => `${s.id}:${s.stacks}`).join(',') +
      '|' +
      pets.map((p) => `${p.skillId}:${p.count}`).join(',');
    if (sig !== this.buffStrip.dataset.sig) {
      this.buffStrip.dataset.sig = sig;
      clear(this.buffStrip);
      for (const s of list) {
        const def = attempt(() => getStatus(s.id) ?? null, null);
        const chip = div(`buff ${def && def.polarity < 0 ? 'debuff' : ''}`.trim());
        chip.style.setProperty('--bc', hex(def?.color ?? 0x9ad0ff));
        const art = div('buff-art');
        // Painted chip from the art stream (gold ring for a buff, toothed red
        // ring for a debuff); the line-icon is the fallback if painting fails.
        const uri = attempt(() => statusIconUri(def?.icon ?? s.id, def?.color ?? 0x9ad0ff, def?.polarity ?? 1), '');
        art.innerHTML = uri
          ? `<img class="buff-img" src="${uri}" alt="" draggable="false">`
          : iconSvg(statusIcon(s.id, def?.icon), { size: 17 });
        if (uri) chip.classList.add('has-img');
        const sweep = div('buff-sweep');
        add(chip, sweep, art, span('buff-time'));
        if (s.stacks > 1) chip.appendChild(span('buff-stacks', String(s.stacks)));
        chip.dataset.id = s.id;
        // A shrine blessing that lasts two minutes and says nothing about what
        // it does is a mystery, not a reward. Hovering now spells it out.
        tip(chip, def?.name ?? s.id, statusTooltip(s.id, s.stacks));
        this.buffStrip.appendChild(chip);
      }

      for (const p of pets) {
        const chip = div('buff buff-minion');
        chip.style.setProperty('--bc', hex(0x8fd67a));
        const art = div('buff-art');
        art.innerHTML = iconSvg('skull', { size: 17 });
        add(chip, art, div('buff-sweep'));
        chip.appendChild(span('buff-stacks', String(p.count)));
        chip.dataset.minion = p.skillId;
        const name = skillById(p.skillId)?.name ?? 'Summons';
        tip(
          chip,
          name,
          `<p>${p.count} under your command.</p><ul class="tip-mods"><li>${Math.round(p.life)} / ${Math.round(p.maxLife)} life</li>` +
            `<li>${Number.isFinite(p.left) ? `${Math.ceil(p.left)}s left` : 'Stays until it falls'}</li></ul>`,
        );
        this.buffStrip.appendChild(chip);
      }
    }
    // Cheap per-frame: only the sweep fraction changes.
    const chips = this.buffStrip.children;
    for (let i = 0; i < chips.length; i++) {
      const el = chips[i] as HTMLElement;
      if (i < list.length) {
        const s = list[i]!;
        const k = s.duration > 0 ? Math.max(0, Math.min(1, s.remaining / s.duration)) : 0;
        // Hundredths: a finer sweep is invisible on a chip this size, and each
        // change is a style write.
        setVar(el, '--k', Math.round((1 - k) * 100) / 100);
        // Seconds left under the chip; only rewritten when the number changes.
        const tEl = part(el, '.buff-time');
        if (tEl) {
          const txt = !Number.isFinite(s.remaining) || s.remaining > 3600 ? '' : buffTime(s.remaining);
          if (tEl.textContent !== txt) tEl.textContent = txt;
        }
        el.classList.toggle('is-ending', Number.isFinite(s.remaining) && s.remaining < 3 && s.remaining > 0);
        continue;
      }
      // Minion chips sweep on time left, and their stack number is the count.
      const p = pets[i - list.length];
      if (!p) continue;
      // A permanent summon has no arc to sweep; it is full until it dies.
      const k = Number.isFinite(p.left) ? Math.max(0, Math.min(1, p.left / 30)) : 1;
      setVar(el, '--k', Math.round((1 - k) * 100) / 100);
      const n = part(el, '.buff-stacks');
      const count = String(p.count);
      if (n && n.textContent !== count) n.textContent = count;
    }
  }

  // -- boss ----------------------------------------------------------------

  private showBoss(name: string, title: string, maxLife: number): void {
    this.bossMax = Math.max(1, maxLife);
    this.bossLife = maxLife;
    clear(this.bossName);
    this.bossName.appendChild(span('bossbar-title', title));
    const proper = div('bossbar-proper-row');
    const ornL = span('bossbar-orn');
    const ornR = span('bossbar-orn is-r');
    ornL.innerHTML = ORNAMENT.divider;
    ornR.innerHTML = ORNAMENT.divider;
    add(proper, ornL, span('bossbar-proper', name), ornR);
    this.bossName.appendChild(proper);

    // Phase thresholds come from the boss's own definition, so the ticks sit
    // exactly where the fight will turn. Unknown bosses fall back to quarters.
    const def = attempt(() => BOSSES.find((b) => b.name === name) ?? null, null);
    const phases = def?.phases?.length ? def.phases.map((ph) => ph.atLife) : [1, 0.75, 0.5, 0.25];
    this.bossThresholds = phases.slice(1);
    clear(this.bossTicks);
    for (const at of this.bossThresholds) {
      const t = div('btick');
      t.style.left = `${Math.max(0, Math.min(1, at)) * 100}%`;
      this.bossTicks.appendChild(t);
    }
    window.clearTimeout(this.bossTrailTimer);
    this.bossTrail.style.transition = 'none';
    this.bossTrail.style.width = '100%';
    this.setBossLife(1);
    clear(this.bossPips);
    for (let i = 0; i < phases.length; i++) this.bossPips.appendChild(div(`bosspip ${i === 0 ? 'is-current' : ''}`.trim()));
    this.bossBark.textContent = '';
    this.endBossCast();
    this.bossBar.classList.remove('is-slain', 'is-enraged', 'enrage-in');
    this.hideMiniBoss();
    this.bossBar.classList.add('is-open');
    this.bossVisible = true;
  }

  /**
   * Moves the boss bar. The red fill snaps; the pale trail waits a beat and
   * then drains to meet it, so each burst of damage reads as a chunk lost.
   */
  private setBossLife(k: number): void {
    const pct = Math.max(0, Math.min(1, k)) * 100;
    this.bossFill.style.width = `${pct}%`;
    this.bossPct.textContent = pct > 0 && pct < 1 ? '<1%' : `${Math.ceil(pct)}%`;
    const trailNow = parseFloat(this.bossTrail.style.width) || 100;
    if (pct >= trailNow) {
      this.bossTrail.style.transition = 'none';
      this.bossTrail.style.width = `${pct}%`;
      return;
    }
    window.clearTimeout(this.bossTrailTimer);
    this.bossTrailTimer = window.setTimeout(() => {
      this.bossTrail.style.transition = '';
      this.bossTrail.style.width = `${pct}%`;
    }, 420);
    this.bossBar.classList.remove('is-hit');
    void this.bossBar.offsetWidth;
    this.bossBar.classList.add('is-hit');
  }

  /**
   * A boss wind-up. The bar fills over exactly the tell's length, so "when it
   * reaches the end, move" is the whole lesson.
   */
  private bossCasting(ability: string, windup: number): void {
    if (!this.bossVisible) return;
    const secs = Math.max(0.2, Number.isFinite(windup) ? windup : 1);
    this.bossCastName.textContent = ability;
    const fill = this.bossCastFill;
    fill.style.transition = 'none';
    fill.style.width = '0%';
    void fill.offsetWidth;
    fill.style.transition = `width ${secs}s linear`;
    fill.style.width = '100%';
    this.bossCast.classList.add('is-live');
    window.clearTimeout(this.bossCastTimer);
    this.bossCastTimer = window.setTimeout(() => this.endBossCast(), secs * 1000 + 260);
  }

  private endBossCast(): void {
    window.clearTimeout(this.bossCastTimer);
    this.bossCast.classList.remove('is-live');
  }

  /**
   * A floor's mini-boss announces itself: a short card where the boss bar
   * lives, naming it and what it does, then it gets out of the way.
   */
  private showMiniBoss(name: string, title: string, kind: string): void {
    if (this.bossVisible) return;
    clear(this.miniCard);
    this.miniCard.appendChild(span('minicard-kicker', 'Mini-boss'));
    const row = div('minicard-row');
    const ornL = span('minicard-orn');
    const ornR = span('minicard-orn is-r');
    ornL.innerHTML = ORNAMENT.divider;
    ornR.innerHTML = ORNAMENT.divider;
    add(row, ornL, span('minicard-name', name), ornR);
    this.miniCard.appendChild(row);
    const sub = title || prettyKind(kind);
    if (sub) this.miniCard.appendChild(span('minicard-title', sub));
    replayClass(this.miniCard, 'is-open');
    window.clearTimeout(this.miniTimer);
    this.miniTimer = window.setTimeout(() => this.hideMiniBoss(), 4200);
  }

  private hideMiniBoss(): void {
    window.clearTimeout(this.miniTimer);
    this.miniCard.classList.remove('is-open');
  }

  private hideBoss(): void {
    this.endBossCast();
    if (!this.bossVisible) return;
    this.bossVisible = false;
    this.bossBar.classList.remove('is-open');
  }

  // -- quest ---------------------------------------------------------------

  private questProgress(p: GameEvents['quest:progress']): void {
    if (!this.quest) {
      const scene = this.engine.currentScene as unknown as object | null;
      const found = scene ? probeScene(scene).quest : null;
      this.quest = {
        name: found?.name ?? 'Contract',
        objectives: (found?.objectives ?? []).map((o) => ({
          desc: o.desc,
          progress: o.progress,
          target: o.target,
          done: o.done,
        })),
      };
    }
    while (this.quest.objectives.length <= p.index) {
      this.quest.objectives.push({ desc: p.desc, progress: 0, target: p.target, done: false });
    }
    const o = this.quest.objectives[p.index];
    o.desc = p.desc;
    o.progress = p.progress;
    o.target = p.target;
    o.done = p.progress >= p.target;
    this.renderQuest();
  }

  private renderQuest(): void {
    if (!this.quest) {
      this.questBox.style.display = 'none';
      return;
    }
    this.questBox.style.display = '';
    clear(this.questBox);
    const hd = div('hud-quest-hd');
    hd.appendChild(icon('quest', { size: 13 }));
    hd.appendChild(span('hud-quest-name', this.quest.name));
    this.questBox.appendChild(hd);
    for (const o of this.quest.objectives) {
      const row = div(`hud-obj ${o.done ? 'done' : ''}`.trim());
      const line = div('hud-obj-line');
      line.appendChild(span('hud-obj-desc', o.desc));
      line.appendChild(span('hud-obj-count', `${Math.min(o.progress, o.target)}/${o.target}`));
      const track = div('hud-obj-track');
      const fill = div('hud-obj-fill');
      fill.style.width = `${o.target > 0 ? Math.min(100, (o.progress / o.target) * 100) : 0}%`;
      track.appendChild(fill);
      add(row, line, track);
      this.questBox.appendChild(row);
    }
  }

  /**
   * The quiet list under the minimap: contracts taken from people in town
   * (and who to hand them to once done) and bounties held from the board.
   * The contract this descent is working is left out down here, since the
   * run's own box above already shows it. Rebuilt only when it changes.
   */
  private renderTracker(): void {
    const c = save.account.current;
    const rows: Array<{ title: string; note: string; done: boolean }> = [];
    if (c) {
      const carried = this.quest ? carriedContract()?.chain.id : undefined;
      for (const chain of CHAINS) {
        const index = chainStep(chain);
        const step = chain.steps[index];
        if (!step) continue;
        const st = stepState(chain, index);
        if (st !== 'active' && st !== 'ready') continue;
        if (st === 'active' && chain.id === carried) continue;
        const giver = NPCS[step.giver ?? chain.giver]?.name ?? 'the giver';
        rows.push(
          st === 'ready'
            ? { title: step.title, note: `Back to ${giver}`, done: true }
            : { title: step.title, note: `Tier ${step.minDepth}+`, done: false },
        );
      }
      for (const b of heldBounties(c)) {
        const text = bountyText(b).replace(/\s*\([^)]*\)/g, '');
        rows.push(
          b.state === 'done'
            ? { title: text, note: 'Claim at the board', done: true }
            : { title: text, note: `${Math.min(b.progress, b.target)}/${b.target}`, done: false },
        );
      }
    }
    const hidden = !!save.settings.trackerHidden;
    const key = JSON.stringify([hidden, rows]);
    if (key === this.trackerKey) return;
    this.trackerKey = key;
    this.tracker.style.display = rows.length ? '' : 'none';
    this.tracker.classList.toggle('folded', hidden);
    const ready = rows.filter((r) => r.done).length;
    this.trackerHd.textContent = `Quests ${rows.length}${ready ? ` · ${ready} ready` : ''} ${hidden ? '+' : '\u2212'}`;
    clear(this.trackerBody);
    if (hidden) return;
    for (const r of rows) {
      const row = div(`hud-track${r.done ? ' done' : ''}`);
      add(row, span('hud-track-title', r.title), span('hud-track-note', r.note));
      this.trackerBody.appendChild(row);
    }
  }

  /** Called by QuestLog when it learns about a fresh run quest. */
  setQuest(q: QuestInstance | null): void {
    if (!q) {
      this.quest = null;
      this.questBox.style.display = 'none';
      return;
    }
    this.quest = {
      name: q.name,
      objectives: q.objectives.map((o) => ({ desc: o.desc, progress: o.progress, target: o.target, done: o.done })),
    };
    this.renderQuest();
  }

  // -- minimap -------------------------------------------------------------

  /**
   * The monsters worth a mark: alive, standing on ground you have explored,
   * and close enough to be seen. The map used to mark every monster on the
   * floor, out in the dark you had not walked yet, and read them from an
   * array found once by shape, which went stale and left marks where nothing
   * stood. The scene's own list is read fresh each time instead.
   */
  private collectPips(probe: SceneProbe | null): void {
    const pips: MinimapPip[] = [];
    const scene = this.engine.currentScene as unknown as Record<string, unknown> | null;
    const live = scene && Array.isArray(scene.enemies) ? (scene.enemies as Array<Record<string, unknown>>) : probe?.enemies ?? null;
    const boss = scene && scene.boss && typeof scene.boss === 'object' ? (scene.boss as Record<string, unknown>) : null;
    const level = runtime.level;
    const explored = level ? this.exploredFor(level) : null;
    const px = runtime.playerTileX;
    const py = runtime.playerTileY;
    const add = (e: Record<string, unknown>): void => {
      if (Number(e.life ?? 0) <= 0 || e.alive === false || e.readyToRemove === true) return;
      const root = e.root as { position?: { x: number; z: number }; parent?: unknown; visible?: boolean } | undefined;
      const pos = root?.position;
      // Off the scene graph is gone: cleared with its floor, or not raised yet.
      if (!pos || !root?.parent || !probe?.worldToTile) return;
      const t = probe.worldToTile(pos.x, pos.z);
      if (level && explored) {
        if (t.x < 0 || t.y < 0 || t.x >= level.width || t.y >= level.height) return;
        if (!explored[t.y * level.width + t.x]) return;
      }
      const dx = t.x - px;
      const dy = t.y - py;
      if (dx * dx + dy * dy > PIP_SIGHT * PIP_SIGHT) return;
      const rank = String(e.rank ?? 'normal');
      pips.push({ x: t.x, y: t.y, kind: rank === 'boss' || e === boss ? 'boss' : rank === 'normal' ? 'enemy' : 'elite' });
    };
    if (live) {
      for (const e of live) {
        add(e);
        if (pips.length > 160) break;
      }
    }
    if (boss && !live?.includes(boss)) add(boss);
    runtime.pips = pips;
  }

  /** The explored-ground canvas of the level shown, one pixel per tile. */
  private sheet: { level: DungeonLevel; ctx: CanvasRenderingContext2D; canvas: HTMLCanvasElement } | null = null;

  /** The level's ground canvas, painted with every tile already explored. */
  private groundSheet(level: DungeonLevel, explored: Uint8Array): { ctx: CanvasRenderingContext2D; canvas: HTMLCanvasElement; inks: string[] } {
    if (this.sheet?.level !== level) {
      const canvas = document.createElement('canvas');
      canvas.width = level.width;
      canvas.height = level.height;
      // Painted on the CPU. It is never on the page, only copied into the
      // minimap, and a GPU canvas drawn every frame without being shown has
      // the browser hold the whole page until the GPU catches up with it.
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      this.sheet = { level, ctx, canvas };
      const sheet = { ctx, canvas, inks: zoneInks(level, [146, 128, 98], 0.62) };
      for (let i = 0; i < explored.length; i++) if (explored[i]) paintGround(sheet, level, i);
    }
    // Ground takes its zone's tint, so the seam between two zones shows.
    return { ctx: this.sheet.ctx, canvas: this.sheet.canvas, inks: zoneInks(level, [146, 128, 98], 0.62) };
  }

  private exploredFor(level: DungeonLevel): Uint8Array {
    let e = runtime.explored.get(level.seed);
    if (!e || e.length !== level.width * level.height) {
      e = new Uint8Array(level.width * level.height);
      runtime.explored.set(level.seed, e);
    }
    return e;
  }

  private drawMinimap(): void {
    const ctx = this.minimapCtx;
    const level = runtime.level;
    if (!ctx) return;
    const S = MINIMAP_PX;
    ctx.clearRect(0, 0, S, S);

    if (!level) {
      if (this.drawCampChart(ctx, S)) return;
      ctx.fillStyle = 'rgba(10,9,8,0.55)';
      ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = 'rgba(160,140,105,0.35)';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('no map', S / 2, S / 2);
      return;
    }

    const explored = this.exploredFor(level);
    const px = runtime.playerTileX;
    const py = runtime.playerTileY;

    // The explored ground lives on a canvas of one pixel per tile, painted
    // as tiles are revealed. The minimap used to paint some three thousand
    // tiles one by one eight times a second, a small stall every few frames.
    const sheet = this.groundSheet(level, explored);

    // Reveal a disc around the player.
    for (let dy = -REVEAL_RADIUS; dy <= REVEAL_RADIUS; dy++) {
      for (let dx = -REVEAL_RADIUS; dx <= REVEAL_RADIUS; dx++) {
        if (dx * dx + dy * dy > REVEAL_RADIUS * REVEAL_RADIUS) continue;
        const x = px + dx;
        const y = py + dy;
        if (x < 0 || y < 0 || x >= level.width || y >= level.height) continue;
        const idx = y * level.width + x;
        if (explored[idx]) continue;
        explored[idx] = 1;
        paintGround(sheet, level, idx);
      }
    }

    const half = S / 2;
    const scale = MINIMAP_TILE;
    const span0 = Math.ceil(half / scale) + 2;

    ctx.fillStyle = 'rgba(8,7,6,0.62)';
    ctx.fillRect(0, 0, S, S);

    // The window of tiles round the player, each drawn as a sharp block.
    const n = span0 * 2 + 1;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet.canvas, px - span0, py - span0, n, n, half - span0 * scale - scale / 2, half - span0 * scale - scale / 2, n * scale, n * scale);

    // The ways on are the thing you are actually looking for.
    const marks = wayMarks(level);
    for (const [mx, my, color, shape] of marks) {
      const idx = my * level.width + mx;
      if (!explored[idx]) continue;
      const sx = half + (mx - px) * scale;
      const sy = half + (my - py) * scale;
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.beginPath();
      if (shape === 'ring') {
        ctx.lineWidth = 1.6;
        ctx.arc(sx, sy, 3.4, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      if (shape === 'gate') {
        ctx.moveTo(sx, sy - 4);
        ctx.lineTo(sx + 4, sy);
        ctx.lineTo(sx, sy + 4);
        ctx.lineTo(sx - 4, sy);
      } else {
        ctx.moveTo(sx, sy - 4);
        ctx.lineTo(sx + 3.6, sy + 3);
        ctx.lineTo(sx - 3.6, sy + 3);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Enemy pips.
    for (const pip of runtime.pips) {
      const dx = pip.x - px;
      const dy = pip.y - py;
      if (Math.abs(dx) > span0 || Math.abs(dy) > span0) continue;
      const sx = half + dx * scale;
      const sy = half + dy * scale;
      ctx.beginPath();
      const r = pip.kind === 'boss' ? 4 : pip.kind === 'elite' ? 3 : 2;
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = pip.kind === 'boss' ? '#ff4d3d' : pip.kind === 'elite' ? '#ff9a3c' : '#d9483c';
      ctx.fill();
      if (pip.kind !== 'enemy') {
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Player arrow.
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(runtime.facing);
    ctx.beginPath();
    ctx.moveTo(0, -5.5);
    ctx.lineTo(4.2, 4.4);
    ctx.lineTo(0, 2.2);
    ctx.lineTo(-4.2, 4.4);
    ctx.closePath();
    ctx.fillStyle = '#f6ecd2';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1.2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** The camp's extent in world x, z, worked out once per camp. */
  private campBox = new WeakMap<object, { x0: number; z0: number; x1: number; z1: number }>();

  /**
   * The town has no tile grid, so its map is drawn from the camp itself: the
   * buildings' footprints, a mark at every station and the portal, and you.
   * Returns false where there is no camp to draw.
   */
  private drawCampChart(ctx: CanvasRenderingContext2D, S: number): boolean {
    const scene = this.engine.currentScene as unknown as Record<string, unknown> | null;
    const town = scene?.town as { colliders?: Array<{ x: number; z: number; w: number; d: number; r?: number }> } | undefined;
    const spots = scene?.interactables as Array<{ id: string; pos: { x: number; z: number } }> | undefined;
    const pl = scene?.player as { position?: { x: number; z: number } } | undefined;
    if (!town?.colliders || !Array.isArray(spots) || !pl?.position) return false;
    let box = this.campBox.get(town);
    if (!box) {
      box = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
      for (const s of spots) {
        box.x0 = Math.min(box.x0, s.pos.x); box.x1 = Math.max(box.x1, s.pos.x);
        box.z0 = Math.min(box.z0, s.pos.z); box.z1 = Math.max(box.z1, s.pos.z);
      }
      if (!Number.isFinite(box.x0)) return false;
      const pad = 6;
      box.x0 -= pad; box.z0 -= pad; box.x1 += pad; box.z1 += pad;
      this.campBox.set(town, box);
    }
    const cx = (box.x0 + box.x1) / 2;
    const cz = (box.z0 + box.z1) / 2;
    const k = (S - 12) / Math.max(box.x1 - box.x0, box.z1 - box.z0);
    const sx = (x: number): number => S / 2 + (x - cx) * k;
    const sy = (z: number): number => S / 2 + (z - cz) * k;

    ctx.fillStyle = 'rgba(8,7,6,0.62)';
    ctx.fillRect(0, 0, S, S);
    // Buildings and walls, as the dungeon map draws explored ground.
    ctx.fillStyle = 'rgba(146,128,98,0.42)';
    for (const c of town.colliders) {
      const hw = c.r ?? c.w * 0.5;
      const hd = c.r ?? c.d * 0.5;
      const x = sx(c.x - hw);
      const y = sy(c.z - hd);
      if (x > S || y > S || x + hw * 2 * k < 0 || y + hd * 2 * k < 0) continue;
      ctx.fillRect(x, y, Math.max(1, hw * 2 * k), Math.max(1, hd * 2 * k));
    }
    // Stations and the portal.
    for (const s of spots) {
      const x = sx(s.pos.x);
      const y = sy(s.pos.z);
      ctx.beginPath();
      if (s.id === 'portal') {
        ctx.strokeStyle = '#9cc4ff';
        ctx.lineWidth = 1.8;
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      ctx.moveTo(x, y - 3.4);
      ctx.lineTo(x + 3.4, y);
      ctx.lineTo(x, y + 3.4);
      ctx.lineTo(x - 3.4, y);
      ctx.closePath();
      ctx.fillStyle = '#f0d79a';
      ctx.fill();
    }
    // You.
    ctx.save();
    ctx.translate(sx(pl.position.x), sy(pl.position.z));
    ctx.rotate(runtime.facing);
    ctx.beginPath();
    ctx.moveTo(0, -5.5);
    ctx.lineTo(4.2, 4.4);
    ctx.lineTo(0, 2.2);
    ctx.lineTo(-4.2, 4.4);
    ctx.closePath();
    ctx.fillStyle = '#f6ecd2';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1.2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return true;
  }

  // -- feedback ------------------------------------------------------------

  private pulseHurt(fraction: number): void {
    replayClass(this.root, 'hurt');
    if (fraction > 0.18) replayClass(this.root, 'hurt-big');
  }

  private floatText(text: string, kind: 'good' | 'bad' | 'gold', anchor: HTMLElement): void {
    const r = anchor.getBoundingClientRect();
    const node = div(`floattext ft-${kind}`, text);
    node.style.left = `${r.left + r.width / 2}px`;
    node.style.top = `${r.top}px`;
    this.floatLayer.appendChild(node);
    setTimeout(() => node.remove(), 1100);
  }

  private levelFlourish(level: number): void {
    // The bar itself celebrates too: a flare runs along it and the badge burns.
    for (const n of [this.xpTrack, this.levelBadge]) {
      n.classList.remove('is-flare');
      void n.offsetWidth;
      n.classList.add('is-flare');
    }
    const wrap = div('levelup');
    wrap.innerHTML =
      `<div class="levelup-rays"></div><div class="levelup-ring"></div>` +
      `<div class="levelup-kicker">You grow stronger</div>` +
      `<div class="levelup-word">LEVEL ${level}</div>` +
      `<div class="levelup-orn">${ORNAMENT.crest}</div>` +
      `<div class="levelup-sub">Spend your points <span class="keycap">C</span> attributes <span class="keycap">T</span> skills</div>`;
    this.centerLayer.appendChild(wrap);
    setTimeout(() => wrap.remove(), 3000);
  }

  private setPrompt(text: string): void {
    if (!text) {
      this.promptBox.classList.remove('is-open');
      return;
    }
    const m = /^\[(.+?)\]\s*(.*)$/.exec(text);
    clear(this.promptBox);
    if (m) {
      this.promptBox.appendChild(span('keycap', m[1]));
      this.promptBox.appendChild(span('hud-prompt-text', m[2]));
    } else {
      this.promptBox.appendChild(span('hud-prompt-text', text));
    }
    this.promptBox.classList.add('is-open');
  }

  toast(text: string, kind: 'info' | 'good' | 'bad' | 'epic' = 'info', rarity?: ItemRarity): void {
    const t = div(`toast toast-${kind}`);
    if (rarity) {
      t.style.setProperty('--rc', rarityHex(rarity));
      t.classList.add('has-rarity');
      t.style.setProperty('--rglow', rgba(parseInt(rarityHex(rarity).slice(1), 16), 0.35));
    }
    const ic = kind === 'bad' ? 'warn' : kind === 'epic' ? 'sparkle' : kind === 'good' ? 'check' : 'info';
    t.appendChild(icon(ic, { size: 14 }));
    t.appendChild(span('toast-text', text));
    this.toastStack.appendChild(t);
    this.toastCount++;
    requestAnimationFrame(() => t.classList.add('is-open'));
    const life = kind === 'epic' ? 4200 : 3000;
    setTimeout(() => {
      t.classList.remove('is-open');
      setTimeout(() => t.remove(), 240);
    }, life);
    // Never let a loot storm push the stack off screen.
    while (this.toastStack.childElementCount > 6) this.toastStack.firstElementChild?.remove();
  }
}

/** Paints one explored tile onto a level's ground canvas. */
function paintGround(sheet: { ctx: CanvasRenderingContext2D; inks: string[] }, level: DungeonLevel, idx: number): void {
  const t = level.tiles[idx]!;
  if (t === T_VOID) return;
  sheet.ctx.fillStyle = t === T_FLOOR ? zoneInkAt(level, sheet.inks, idx) : newKindInk(t) ?? tileColor(t);
  sheet.ctx.fillRect(idx % level.width, Math.floor(idx / level.width), 1, 1);
}

function tileColor(t: number): string {
  switch (t) {
    case T_FLOOR:
      return 'rgba(146,128,98,0.62)';
    case T_WALL:
      return 'rgba(58,48,38,0.92)';
    case T_DOOR:
      return 'rgba(214,168,80,0.9)';
    case T_WATER:
      return 'rgba(52,96,140,0.75)';
    case T_LAVA:
      return 'rgba(196,72,26,0.85)';
    case T_CHASM:
      return 'rgba(12,10,14,0.9)';
    case T_EXIT:
      return 'rgba(255,214,107,0.95)';
    case T_ARRIVAL:
      return 'rgba(127,176,255,0.9)';
    case T_RUBBLE:
      return 'rgba(96,84,66,0.6)';
    default:
      return 'rgba(0,0,0,0)';
  }
}

/**
 * What a buff chip says when you hover it.
 *
 * Every status was authored with a plain-English `desc` and a table of stat
 * modifiers, and the chip only ever showed the name. A shrine blessing that
 * lasts two minutes and tells you nothing about what it does is a mystery
 * rather than a reward.
 */
function statusTooltip(id: string, stacks: number): string {
  const def = attempt(() => getStatus(id) ?? null, null);
  if (!def) return '<p>No description.</p>';
  const out: string[] = [];
  if (def.desc) out.push(`<p>${def.desc}</p>`);

  // The numbers as they actually apply right now, stacks included.
  const mods = Object.entries(def.mods ?? {}).filter(([, v]) => typeof v === 'number' && v !== 0);
  if (mods.length > 0) {
    const rows = mods.map(([k, v]) => {
      const value = (v as number) * Math.max(1, stacks);
      const label = STAT_LABEL[k as StatKey] ?? k;
      return `<li>${value >= 0 ? '+' : ''}${fmt(value)} ${label}</li>`;
    });
    out.push(`<ul class="tip-mods">${rows.join('')}</ul>`);
  }
  if (def.dot) out.push(`<p>${fmt(def.dot.perSecond * Math.max(1, stacks))} ${def.dot.type} damage per second.</p>`);
  if (def.hot) out.push(`<p>Restores ${fmt(def.hot * Math.max(1, stacks))} life per second.</p>`);
  if (def.manaPerSecond) out.push(`<p>Restores ${fmt(def.manaPerSecond * Math.max(1, stacks))} mana per second.</p>`);
  if (def.absorb) out.push(`<p>Absorbs ${fmt(def.absorb * Math.max(1, stacks))} damage before it breaks.</p>`);
  if (def.reflect) out.push(`<p>Reflects ${Math.round(def.reflect * 100 * Math.max(1, stacks))}% of damage taken.</p>`);
  if (def.incapacitates) out.push('<p>You cannot act while this lasts.</p>');
  else if (def.immobilises) out.push('<p>You cannot move while this lasts.</p>');
  if (stacks > 1) out.push(`<p class="tip-dim">${stacks} stacks.</p>`);
  return out.join('');
}

/** "12s", "4.5s", "2m": short enough to sit under a 30px chip. */
/** "frost_warden" -> "Frost Warden", for a mini-boss with no title. */
function prettyKind(kind: string): string {
  return (kind ?? '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()).trim();
}

function buffTime(sec: number): string {
  if (sec <= 0) return '';
  if (sec >= 120) return `${Math.round(sec / 60)}m`;
  if (sec >= 10) return `${Math.ceil(sec)}s`;
  return `${sec.toFixed(1)}s`;
}

/** Maps a status id to the closest icon in the authored set. */
function statusIcon(id: string, hint?: string): string {
  const s = `${hint ?? ''} ${id}`.toLowerCase();
  if (/burn|ignite|fire|scorch/.test(s)) return 'fire';
  if (/freeze|chill|frost|cold/.test(s)) return 'cold';
  if (/shock|static|lightning|electro/.test(s)) return 'lightning';
  if (/poison|venom|toxic|plague/.test(s)) return 'poison';
  if (/curse|hex|arcane|void/.test(s)) return 'arcane';
  if (/bleed|wound|rend/.test(s)) return 'physical';
  if (/haste|swift|speed/.test(s)) return 'moveSpeed';
  if (/shield|ward|barrier|guard/.test(s)) return 'shield';
  if (/regen|heal|mend/.test(s)) return 'regen';
  if (/stun|freeze|root|snare/.test(s)) return 'lock';
  if (/rage|fury|might|str/.test(s)) return 'strength';
  return 'sparkle';
}


/**
 * How far away a skill can be aimed, or 0 when distance does not matter.
 *
 * Only skills that land at a point or on a chosen enemy have a reach; a beam's
 * `range` is how long it is, not how far you may aim it.
 */
function castRange(def: SkillDef | null | undefined): number {
  if (!def || (def.targeting !== 'point' && def.targeting !== 'enemy')) return 0;
  const r = def.params?.range;
  return typeof r === 'number' && r > 0 ? r : 0;
}

/** Look up a skill definition by id for icon generation. */
function skillDefFor(id: string) {
  return SKILL_BY_ID?.[id];
}
