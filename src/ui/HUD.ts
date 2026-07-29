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

import type { DungeonLevel, ItemRarity, QuestInstance, StatKey } from '../types';
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
  sigilSvg,
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
  type MinimapPip,
} from './Widgets';
import { skillIconUri, warmItemIcons } from '../art/Icons';
import { setPrimaryAttack } from '../sim/Character';
import { SKILL_BY_ID } from '../data/skills';

// Tile ids as stored in DungeonLevel.tiles (mirrors world/Layouts TILE_VALUES).
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

const MINIMAP_PX = 178;
const MINIMAP_TILE = 3.6;
const REVEAL_RADIUS = 10;

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

class Orb {
  readonly root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private label: HTMLDivElement;
  private display = 1;
  private target = 1;
  private hue: [number, number, number];
  private size: number;
  private flash = 0;

  constructor(kind: 'life' | 'mana', size: number) {
    this.size = size;
    this.root = div(`orb orb-${kind}`);
    this.canvas = el2('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(size * dpr);
    this.canvas.height = Math.round(size * dpr);
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.ctx = this.canvas.getContext('2d');
    this.ctx?.scale(dpr, dpr);

    this.hue = kind === 'life' ? [0xd8, 0x1f, 0x1a] : [0x2f, 0x6b, 0xe0];

    const glass = div('orb-glass');
    const ring = div('orb-ring');
    this.label = div('orb-label');
    this.label.innerHTML = '<span class="orb-cur">0</span><span class="orb-sep">/</span><span class="orb-max">0</span>';
    add(this.root, this.canvas, glass, ring, this.label);
  }

  set(value: number, max: number): void {
    const t = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    if (t < this.target - 0.001) this.flash = 1;
    this.target = t;
    const cur = this.label.querySelector<HTMLElement>('.orb-cur');
    const mx = this.label.querySelector<HTMLElement>('.orb-max');
    if (cur) countTo(cur, Math.round(value), (n) => fmtInt(Math.round(n)), 260);
    if (mx) mx.textContent = fmtInt(Math.round(max));
    this.root.classList.toggle('is-critical', t < 0.28);
  }

  draw(elapsed: number, dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    // Ease the fill so a big hit reads as liquid sloshing down, not a jump cut.
    this.display += (this.target - this.display) * Math.min(1, dt * 7);
    this.flash = Math.max(0, this.flash - dt * 2.6);

    const s = this.size;
    const r = s / 2;
    ctx.clearRect(0, 0, s, s);
    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, r - 3, 0, Math.PI * 2);
    ctx.clip();

    // Empty vessel.
    const bg = ctx.createRadialGradient(r * 0.75, r * 0.6, r * 0.1, r, r, r);
    bg.addColorStop(0, '#141013');
    bg.addColorStop(1, '#050405');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, s, s);

    const level = s - this.display * s;
    const [cr, cg, cb] = this.hue;

    // Two offset sine waves make the surface look like a fluid rather than a bar.
    for (let layer = 0; layer < 2; layer++) {
      const amp = (layer === 0 ? 3.4 : 2.2) * (0.55 + this.display * 0.45);
      const speed = layer === 0 ? 1.7 : -2.3;
      const freq = layer === 0 ? 0.055 : 0.083;
      const yoff = layer === 0 ? 0 : 2.4;
      ctx.beginPath();
      ctx.moveTo(0, s);
      ctx.lineTo(0, level + yoff);
      for (let x = 0; x <= s; x += 3) {
        const y = level + yoff + Math.sin(x * freq + elapsed * speed + layer * 1.9) * amp;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(s, s);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, level - 10, 0, s);
      const a = layer === 0 ? 1 : 0.55;
      g.addColorStop(0, `rgba(${Math.min(255, cr + 70)},${Math.min(255, cg + 80)},${Math.min(255, cb + 70)},${a})`);
      g.addColorStop(0.35, `rgba(${cr},${cg},${cb},${a})`);
      g.addColorStop(1, `rgba(${Math.round(cr * 0.34)},${Math.round(cg * 0.3)},${Math.round(cb * 0.38)},${a})`);
      ctx.fillStyle = g;
      ctx.fill();
    }

    // Caustic sheen just under the surface.
    ctx.globalCompositeOperation = 'lighter';
    const sheen = ctx.createLinearGradient(0, level, 0, level + 26);
    sheen.addColorStop(0, `rgba(255,255,255,${0.16 + this.flash * 0.3})`);
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, level, s, 26);

    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(255,235,220,${this.flash * 0.14})`;
      ctx.fillRect(0, 0, s, s);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Glass highlight.
    const hl = ctx.createRadialGradient(r * 0.68, r * 0.5, 2, r * 0.68, r * 0.5, r * 0.95);
    hl.addColorStop(0, 'rgba(255,255,255,0.20)');
    hl.addColorStop(0.5, 'rgba(255,255,255,0.04)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.fillRect(0, 0, s, s);

    ctx.restore();
  }
}

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
  private minimapCanvas: HTMLCanvasElement;
  private minimapCtx: CanvasRenderingContext2D | null;
  private minimapLabel: HTMLDivElement;
  private depthLabel: HTMLSpanElement;
  private biomeLabel: HTMLSpanElement;
  private questBox: HTMLDivElement;
  private bossBar: HTMLDivElement;
  private bossFill: HTMLDivElement;
  private bossName: HTMLDivElement;
  private bossPips: HTMLDivElement;
  private bossBark: HTMLDivElement;
  private toastStack: HTMLDivElement;
  private promptBox: HTMLDivElement;
  private floatLayer: HTMLDivElement;
  private centerLayer: HTMLDivElement;
  private goldReadout: HTMLSpanElement;

  private explored = new Map<number, Uint8Array>();
  private minimapAccum = 0;
  private bossMax = 1;
  private bossLife = 1;
  private bossVisible = false;
  private quest: QuestTrack | null = null;
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
    this.minimapCtx = this.minimapCanvas.getContext('2d');
    this.minimapCtx?.scale(dpr, dpr);
    this.minimapLabel = div('minimap-label', 'Depth 0');
    const mapFrame = div('minimap-frame');
    const mapBtn = div('minimap-expand');
    mapBtn.innerHTML = iconSvg('map', { size: 14 });
    mapBtn.title = 'Open map (M)';
    mapBtn.addEventListener('click', () => events.emit('ui:open', { panel: 'map' }));
    add(mapWrap, this.minimapCanvas, mapFrame, this.minimapLabel, mapBtn);

    this.questBox = div('hud-quest ui-interactive');
    this.questBox.style.display = 'none';
    this.questBox.addEventListener('click', () => events.emit('ui:open', { panel: 'questLog' }));

    this.toastStack = div('toast-stack');
    add(topRight, mapWrap, this.questBox, this.toastStack);

    // --- top-center: boss bar --------------------------------------------
    this.bossBar = div('bossbar');
    this.bossName = div('bossbar-name');
    this.bossPips = div('bossbar-pips');
    const bossTrack = div('bossbar-track');
    this.bossFill = div('bossbar-fill');
    const bossGloss = div('bossbar-gloss');
    add(bossTrack, this.bossFill, bossGloss);
    this.bossBark = div('bossbar-bark');
    add(this.bossBar, this.bossName, bossTrack, this.bossPips, this.bossBark);

    // --- bottom: command bar ---------------------------------------------
    const bar = div('cmdbar');
    this.lifeOrb = new Orb('life', 118);
    this.manaOrb = new Orb('mana', 118);

    const center = div('cmdbar-center');

    // XP bar with the level badge riding on its left edge.
    const xpRow = div('xprow');
    this.levelBadge = div('level-badge');
    this.levelBadge.innerHTML = '<span class="level-num">1</span><span class="level-word">LVL</span>';
    const xpTrack = div('xp-track ui-interactive');
    this.xpFill = div('xp-fill');
    this.xpText = span('xp-text', '0 / 0 XP');
    const xpNotches = div('xp-notches');
    add(xpTrack, this.xpFill, xpNotches, this.xpText);
    add(xpRow, this.levelBadge, xpTrack);

    const slots = div('hotbar');

    // The attack button gets its own slot at the head of the bar so it is
    // obvious what right click does, and so a skill can be dragged onto it.
    this.rmbSlot = div('hotslot hotslot-rmb ui-interactive');
    this.rmbArt = div('hotslot-art');
    const rmbCd = div('hotslot-cd');
    const rmbKey = div('hotslot-key', 'RMB');
    add(this.rmbSlot, this.rmbArt, rmbCd, rmbKey);
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
      const cdText = div('hotslot-cdtext');
      const key = div('hotslot-key', String(i + 1));
      const cost = div('hotslot-cost');
      const rank = div('hotslot-rank');
      add(s, art, cd, cdText, key, cost, rank);
      this.hotSlots.push(s);
      this.hotIcons.push(art);
      slots.appendChild(s);

      registerDrop(
        s,
        (p) => p.kind === 'skill' && !!p.skillId,
        (p) => {
          const c = save.account.current;
          if (!c || !p.skillId) return false;
          while (c.hotbar.length < 6) c.hotbar.push(null);
          // Clear the skill from any other slot so it never occupies two.
          for (let k = 0; k < 6; k++) if (c.hotbar[k] === p.skillId) c.hotbar[k] = null;
          c.hotbar[i] = p.skillId;
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
    for (const [node, ic, key] of [
      [this.potionLife, 'potion', 'Q'],
      [this.potionMana, 'potion', 'F'],
    ] as Array<[HTMLDivElement, string, string]>) {
      const art = div('potslot-art');
      art.innerHTML = iconSvg(ic, { size: 24 });
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
    dashArt.innerHTML = iconSvg('dash', { size: 24 });
    const dashCd = div('hotslot-cd');
    const dashKey = div('potslot-key', 'SPC');
    add(this.dashSlot, dashArt, dashCd, dashKey);
    potions.appendChild(this.dashSlot);

    const skillRow = div('skillrow');
    add(skillRow, slots, potions);
    add(center, xpRow, skillRow);

    const goldBox = div('hud-gold ui-interactive');
    goldBox.appendChild(icon('coin', { size: 14 }));
    this.goldReadout = span('hud-gold-v', '0');
    goldBox.appendChild(this.goldReadout);

    add(bar, this.lifeOrb.root, center, this.manaOrb.root);

    this.promptBox = div('hud-prompt');
    this.floatLayer = div('float-layer');
    this.centerLayer = div('center-layer');

    // Buffs live directly above the hotbar: that is where the player's eyes
    // already are during a fight, not the top-left corner.
    bar.insertBefore(this.buffStrip, bar.firstChild);
    add(this.root, topLeft, topRight, this.bossBar, this.centerLayer, this.promptBox, goldBox, bar, this.floatLayer);
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
    on('item:equipped', () => this.refreshAll());
    on('item:unequipped', () => this.refreshAll());

    on('player:damaged', (p) => {
      this.lifeOrb.set(p.life, p.maxLife);
      this.pulseHurt(p.amount / Math.max(1, p.maxLife));
      this.floatText(`-${fmt(p.amount)}`, 'bad', this.lifeOrb.root);
    });
    on('player:healed', (p) => {
      this.floatText(`+${fmt(p.amount)}`, 'good', this.lifeOrb.root);
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
      attempt(() => warmItemIcons([p.item]), undefined);
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
        this.depthLabel.textContent = `Depth ${p.depth}`;
        this.biomeLabel.textContent = p.of > 0 ? `Floor ${p.level} of ${p.of}` : '';
        this.minimapLabel.textContent = `Depth ${p.depth}`;
      }
      this.explored.clear();
    });
    on('boss:engaged', (p) => this.showBoss(p.name, p.title, p.maxLife));
    on('boss:damaged', (p) => {
      this.bossLife = p.life;
      this.bossMax = Math.max(1, p.maxLife);
      this.bossFill.style.width = `${Math.max(0, (p.life / this.bossMax) * 100)}%`;
    });
    on('boss:phase', (p) => {
      const pips = this.bossPips.querySelectorAll('.bosspip');
      pips.forEach((n, i) => n.classList.toggle('spent', i <= p.index));
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
    on('boss:killed', () => {
      this.bossFill.style.width = '0%';
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
    this.lifeOrb.draw(elapsed, dt);
    this.manaOrb.draw(elapsed, dt);

    // Cooldowns.
    const cds = pl?.cooldowns;
    if (cds instanceof Map) {
      runtime.cooldowns = cds as Map<string, number>;
    }
    this.updateHotbarRuntime(mana);

    // Dash cooldown, drawn with the same sweep the hotbar uses.
    const dashCd = typeof pl?.dodgeCooldown === 'number' ? (pl.dodgeCooldown as number) : 0;
    this.dashSlot.style.setProperty('--cd', String(dashCd));
    this.dashSlot.classList.toggle('on-cd', dashCd > 0.001);
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
      // Minimap arrow heading — the model's yaw, if the avatar exposes one.
      const root = pl.root as { rotation?: { y: number } } | undefined;
      if (root?.rotation) runtime.facing = -root.rotation.y;
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
      warmItemIcons(c.inventory);
      warmItemIcons(Object.values(c.equipment));
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
      this.rmbSlot.title = `${skillById(rmb)?.name ?? 'Skill'} — right click to attack. Right-click this slot to clear it.`;
    } else {
      // A crossed-swords mark reads as "plain attack" without needing words.
      this.rmbArt.innerHTML =
        '<svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true">' +
        '<path d="M3 3l7.5 7.5M21 3l-7.5 7.5M12 12l9 9M12 12l-9 9" fill="none" ' +
        'stroke="#cbb98a" stroke-width="2" stroke-linecap="round"/></svg>';
      delete this.rmbSlot.dataset.skill;
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
      slotEl.title = def ? `${def.name} — Rank ${rank}` : id;
    }
  }

  private updateHotbarRuntime(mana: number): void {
    const c = save.account.current;
    if (!c) return;
    for (let i = 0; i < 6; i++) {
      const slotEl = this.hotSlots[i];
      const id = c.hotbar[i];
      if (!id) continue;
      const remain = runtime.cooldowns.get(id) ?? 0;
      const def = skillById(id);
      const rank = c.skills[id] ?? 0;
      const total = def?.cooldown ? attempt(() => def.cooldown?.(rank) ?? 0, 0) : 0;
      const k = total > 0 ? Math.max(0, Math.min(1, remain / total)) : 0;
      slotEl.style.setProperty('--cd', String(k));
      slotEl.classList.toggle('on-cd', k > 0.001);
      const t = slotEl.querySelector<HTMLElement>('.hotslot-cdtext');
      if (t) t.textContent = remain > 0.05 ? (remain >= 10 ? String(Math.ceil(remain)) : remain.toFixed(1)) : '';
      const cost = Number(slotEl.dataset.cost ?? 0);
      slotEl.classList.toggle('no-mana', cost > 0 && mana < cost);
    }
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

    // Signature comparison keeps us from rebuilding the strip every frame.
    const sig = list.map((s) => `${s.id}:${s.stacks}`).join(',');
    if (sig !== this.buffStrip.dataset.sig) {
      this.buffStrip.dataset.sig = sig;
      clear(this.buffStrip);
      for (const s of list) {
        const def = attempt(() => getStatus(s.id) ?? null, null);
        const chip = div(`buff ${def && def.polarity < 0 ? 'debuff' : ''}`.trim());
        chip.style.setProperty('--bc', hex(def?.color ?? 0x9ad0ff));
        const art = div('buff-art');
        art.innerHTML = iconSvg(statusIcon(s.id, def?.icon), { size: 17 });
        const sweep = div('buff-sweep');
        add(chip, art, sweep);
        if (s.stacks > 1) chip.appendChild(span('buff-stacks', String(s.stacks)));
        chip.dataset.id = s.id;
        chip.title = def?.name ?? s.id;
        this.buffStrip.appendChild(chip);
      }
    }
    // Cheap per-frame: only the sweep fraction changes.
    const chips = this.buffStrip.children;
    for (let i = 0; i < chips.length && i < list.length; i++) {
      const s = list[i];
      const k = s.duration > 0 ? Math.max(0, Math.min(1, s.remaining / s.duration)) : 0;
      (chips[i] as HTMLElement).style.setProperty('--k', String(1 - k));
    }
  }

  // -- boss ----------------------------------------------------------------

  private showBoss(name: string, title: string, maxLife: number): void {
    this.bossMax = Math.max(1, maxLife);
    this.bossLife = maxLife;
    clear(this.bossName);
    this.bossName.appendChild(span('bossbar-title', title));
    this.bossName.appendChild(span('bossbar-proper', name));
    this.bossFill.style.width = '100%';
    clear(this.bossPips);
    for (let i = 0; i < 4; i++) this.bossPips.appendChild(div('bosspip'));
    this.bossBark.textContent = '';
    this.bossBar.classList.remove('is-slain');
    this.bossBar.classList.add('is-open');
    this.bossVisible = true;
  }

  private hideBoss(): void {
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

  private collectPips(probe: SceneProbe | null): void {
    const pips: MinimapPip[] = [];
    if (probe?.enemies && probe.worldToTile) {
      for (const e of probe.enemies) {
        const life = Number(e.life ?? 0);
        if (life <= 0) continue;
        const root = e.root as { position?: { x: number; z: number } } | undefined;
        const pos = root?.position;
        if (!pos) continue;
        const t = probe.worldToTile(pos.x, pos.z);
        const rank = String(e.rank ?? 'normal');
        pips.push({
          x: t.x,
          y: t.y,
          kind: rank === 'boss' ? 'boss' : rank === 'normal' ? 'enemy' : 'elite',
        });
        if (pips.length > 160) break;
      }
    }
    runtime.pips = pips;
  }

  private exploredFor(level: DungeonLevel): Uint8Array {
    let e = this.explored.get(level.seed);
    if (!e || e.length !== level.width * level.height) {
      e = new Uint8Array(level.width * level.height);
      this.explored.set(level.seed, e);
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

    // Reveal a disc around the player.
    for (let dy = -REVEAL_RADIUS; dy <= REVEAL_RADIUS; dy++) {
      for (let dx = -REVEAL_RADIUS; dx <= REVEAL_RADIUS; dx++) {
        if (dx * dx + dy * dy > REVEAL_RADIUS * REVEAL_RADIUS) continue;
        const x = px + dx;
        const y = py + dy;
        if (x < 0 || y < 0 || x >= level.width || y >= level.height) continue;
        explored[y * level.width + x] = 1;
      }
    }

    const half = S / 2;
    const scale = MINIMAP_TILE;
    const span0 = Math.ceil(half / scale) + 2;

    ctx.fillStyle = 'rgba(8,7,6,0.62)';
    ctx.fillRect(0, 0, S, S);

    for (let dy = -span0; dy <= span0; dy++) {
      for (let dx = -span0; dx <= span0; dx++) {
        const x = px + dx;
        const y = py + dy;
        if (x < 0 || y < 0 || x >= level.width || y >= level.height) continue;
        const idx = y * level.width + x;
        if (!explored[idx]) continue;
        const t = level.tiles[idx];
        if (t === T_VOID) continue;
        const sx = half + dx * scale - scale / 2;
        const sy = half + dy * scale - scale / 2;
        ctx.fillStyle = tileColor(t);
        ctx.fillRect(sx, sy, scale + 0.5, scale + 0.5);
      }
    }

    // Stairs are the thing you are actually looking for.
    const marks: Array<[number, number, string, string]> = [];
    if (level.exit) marks.push([level.exit.x, level.exit.y, '#ffd66b', 'down']);
    if (level.entry) marks.push([level.entry.x, level.entry.y, '#7fb0ff', 'up']);
    for (const [mx, my, color] of marks) {
      const idx = my * level.width + mx;
      if (!explored[idx]) continue;
      const sx = half + (mx - px) * scale;
      const sy = half + (my - py) * scale;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 4);
      ctx.lineTo(sx + 3.6, sy + 3);
      ctx.lineTo(sx - 3.6, sy + 3);
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

  // -- feedback ------------------------------------------------------------

  private pulseHurt(fraction: number): void {
    this.root.classList.remove('hurt');
    void this.root.offsetWidth;
    this.root.classList.add('hurt');
    if (fraction > 0.18) {
      this.root.classList.remove('hurt-big');
      void this.root.offsetWidth;
      this.root.classList.add('hurt-big');
    }
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
    const wrap = div('levelup');
    wrap.innerHTML =
      `<div class="levelup-ring"></div><div class="levelup-word">LEVEL ${level}</div>` +
      `<div class="levelup-sub">Points to spend — press C and T</div>`;
    this.centerLayer.appendChild(wrap);
    setTimeout(() => wrap.remove(), 2600);
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
    case T_STAIRS_DOWN:
      return 'rgba(255,214,107,0.95)';
    case T_STAIRS_UP:
      return 'rgba(127,176,255,0.9)';
    case T_RUBBLE:
      return 'rgba(96,84,66,0.6)';
    default:
      return 'rgba(0,0,0,0)';
  }
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


/** Look up a skill definition by id for icon generation. */
function skillDefFor(id: string) {
  return SKILL_BY_ID?.[id];
}
