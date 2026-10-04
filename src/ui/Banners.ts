/**
 * SLAY — cinematic banners.
 *
 * Big, brief, centred moments: the title card for a floor, the town's
 * "sanctuary" card, a boss's introduction, a level-up. They sit in their own
 * layer above the HUD and below every panel, never take input, and queue so
 * two never fight for the middle of the screen.
 *
 * Each banner is pure DOM and CSS (menus.css, `bn-` classes). This module only
 * decides what to say and when.
 */

import { events } from '../core/Events';
import { save } from '../core/Save';
import { BIOMES } from '../world/DungeonGen';

interface Queued {
  build: () => HTMLElement;
  /** How long it owns the stage, in ms, before the next may start. */
  hold: number;
  /** Total lifetime before the node is removed. */
  life: number;
}

let layer: HTMLDivElement | null = null;
const queue: Queued[] = [];
let busyUntil = 0;
let pump = 0;

function hex(n: number): string {
  return '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6);
}

function el(cls: string, text?: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  if (text !== undefined) d.textContent = text;
  return d;
}

/**
 * Splits text into per-letter spans for a staggered reveal. Letters are
 * grouped by word, so a long name wraps between words and never mid-word.
 */
function letters(into: HTMLElement, text: string): void {
  let i = 0;
  text.split(' ').forEach((word, w) => {
    if (w > 0) into.appendChild(document.createTextNode(' '));
    const group = document.createElement('span');
    group.className = 'bn-word';
    for (const ch of word) {
      const s = document.createElement('span');
      s.textContent = ch;
      s.style.setProperty('--i', String(i++));
      group.appendChild(s);
    }
    into.appendChild(group);
  });
}

function enqueue(item: Queued, priority = false): void {
  if (priority) queue.unshift(item);
  else queue.push(item);
  schedule();
}

function schedule(): void {
  if (pump) return;
  const wait = Math.max(0, busyUntil - performance.now());
  pump = window.setTimeout(() => {
    pump = 0;
    const next = queue.shift();
    if (!next || !layer) return;
    const node = next.build();
    layer.appendChild(node);
    busyUntil = performance.now() + next.hold;
    window.setTimeout(() => node.remove(), next.life);
    if (queue.length) schedule();
  }, wait);
}

/** Drop anything waiting, and anything on screen. Used on scene changes. */
function flush(): void {
  queue.length = 0;
  if (pump) {
    clearTimeout(pump);
    pump = 0;
  }
  busyUntil = 0;
  layer?.replaceChildren();
}

// ---------------------------------------------------------------------------
// The floor title card
// ---------------------------------------------------------------------------

function depthCard(kicker: string, title: string, blurb: string | undefined, tint: string): HTMLElement {
  const card = el('bn bn-depth');
  card.style.setProperty('--tint', tint);
  const rule = (): HTMLElement => {
    const r = el('bn-rule');
    r.appendChild(el('bn-rule-gem'));
    return r;
  };
  card.appendChild(rule());
  card.appendChild(el('bn-depth-kicker', kicker));
  const t = el('bn-depth-title');
  letters(t, title);
  card.appendChild(t);
  if (blurb) card.appendChild(el('bn-depth-blurb', blurb));
  card.appendChild(rule());
  return card;
}

export function showDepthCard(depth: number, level: number, of: number, place?: string, blurb?: string, biome?: string): void {
  const def = BIOMES.find((b) => b.id === biome);
  const tint = def ? hex(def.accentColor) : '#c9a227';
  const name = place || def?.name || `Depth ${depth}`;
  const kicker = of > 1 ? `Depth ${depth}  ·  Floor ${level} of ${of}` : `Depth ${depth}`;
  enqueue({ build: () => depthCard(kicker, name, blurb, tint), hold: 3600, life: 4800 });
}

// ---------------------------------------------------------------------------
// Boss introduction and defeat
// ---------------------------------------------------------------------------

/**
 * Letterbox bars close in, the boss's title and name burn in across the
 * middle, then everything pulls away. The HUD's boss bar carries the name for
 * the rest of the fight; this is only the entrance.
 */
function bossIntro(name: string, title: string): HTMLElement {
  const wrap = el('bn bn-boss');
  wrap.append(el('bn-bars top'), el('bn-bars bottom'));
  const card = el('bn-boss-card');
  card.appendChild(el('bn-boss-title', title));
  const n = el('bn-boss-name');
  letters(n, name);
  card.appendChild(n);
  card.appendChild(el('bn-boss-flare'));
  wrap.appendChild(card);
  return wrap;
}

function bossSlain(name: string): HTMLElement {
  const wrap = el('bn bn-slain');
  wrap.style.setProperty('--tint', '#f2d989');
  wrap.appendChild(el('bn-slain-kicker', name));
  wrap.appendChild(el('bn-slain-word', 'Vanquished'));
  const r = el('bn-rule');
  r.appendChild(el('bn-rule-gem'));
  wrap.appendChild(r);
  return wrap;
}

/**
 * A level-up wash: gold light blooming in from the screen edges and a column
 * of rising motes. The HUD draws the "LEVEL N" text itself; this is the light
 * around it, so the two never say the same thing twice.
 */
function levelGlow(): HTMLElement {
  const wrap = el('bn bn-level');
  wrap.appendChild(el('bn-level-edge'));
  const rays = el('bn-level-rays');
  for (let i = 0; i < 14; i++) {
    const m = document.createElement('i');
    m.style.setProperty('--x', `${44 + ((i * 37) % 13)}%`);
    m.style.setProperty('--d', `${(i * 83) % 900}ms`);
    m.style.setProperty('--s', `${0.6 + ((i * 29) % 10) / 12}`);
    rays.appendChild(m);
  }
  wrap.appendChild(rays);
  return wrap;
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

export function mountBanners(root: HTMLElement): void {
  if (layer) return;
  layer = el('bn-layer');
  root.appendChild(layer);

  events.on('scene:loading', () => flush());

  // The event fires while the new floor is still behind the fade curtain, so
  // the card waits for the curtain to lift before it starts.
  events.on('depth:changed', (p) => window.setTimeout(() => onDepth(p), 650));

  events.on('boss:engaged', (p) => {
    // The boss outranks a floor card still on screen.
    layer?.querySelectorAll('.bn-depth').forEach((n) => n.remove());
    busyUntil = 0;
    enqueue({ build: () => bossIntro(p.name, p.title), hold: 3000, life: 3600 }, true);
  });
  events.on('boss:killed', (p) => {
    enqueue({ build: () => bossSlain(p.name), hold: 2800, life: 3800 }, true);
  });
  events.on('player:levelUp', () => {
    // Not queued: it is light, not words, and can share the screen.
    if (!layer) return;
    const node = levelGlow();
    layer.appendChild(node);
    window.setTimeout(() => node.remove(), 2600);
  });
  events.on('run:cleared', (p) => {
    clearedDepth = p.depth;
  });
}

/** Set when a run is banked, so the town card can say so. */
let clearedDepth = 0;

function onDepth(p: { depth: number; level: number; of: number; place?: string; blurb?: string; biome?: string }): void {
  if (save.settings.titleCards === false) return;
  if (p.depth <= 0) {
    // Town: a quieter card than a floor's.
    const kicker = clearedDepth > 0 ? `Depth ${clearedDepth} cleared` : 'Sanctuary';
    const blurb = clearedDepth > 0 ? 'The depth is banked. The next descent starts deeper.' : undefined;
    clearedDepth = 0;
    enqueue({
      build: () => depthCard(kicker, 'The Town', blurb, '#d8b45a'),
      hold: 2600,
      life: 4200,
    });
    return;
  }
  showDepthCard(p.depth, p.level, p.of, p.place, p.blurb, p.biome);
}
