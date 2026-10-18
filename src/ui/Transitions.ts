/**
 * SLAY — the loading card shown during scene swaps.
 *
 * `Engine.goTo` fades the `#fade` curtain to black, announces `scene:loading`,
 * builds the next scene, then lifts the curtain. Most swaps are quick; a deep
 * dungeon floor is not. The card lives inside the curtain and only becomes
 * visible after a short delay (in CSS), so a fast swap is a clean dip to black
 * and a slow one gets a destination, a turning sigil, a progress bar and a tip.
 *
 * The bar draws from `'load:progress'` (core/LoadProgress.ts): each step of
 * the build is named in plain words, and inside a step the fill creeps on
 * slowly so a long step never looks frozen. Loads with no step counting fall
 * back to `'assets:progress'` (files still arriving).
 *
 * The stairs between areas of a map load without `scene:loading`; the first
 * step of such a load brings the card up on its own, titled with the next
 * area.
 *
 * Behind the card, the place you are going: a ruin skyline generated from the
 * biome's id and lit in the biome's own colour. No image files.
 */

import { events } from '../core/Events';
import { save } from '../core/Save';
import { Random, randomSeed, streamFor } from '../core/RNG';
import { TIPS, nextTip } from './tips';
import { mountKeyArt } from '../art/KeyArt';
import { dividerUri } from '../art/Ornament';
import { BIOMES, isOutdoorBiome } from '../world/Biomes';
import type { BiomeId } from '../types';

/** Each build step, in words a player reads in a glance. */
const STAGE_WORDS: Record<string, string> = {
  map: 'Drawing the map',
  hero: 'Arming the hero',
  world: 'Raising the walls',
  monsters: 'Waking the monsters',
  boss: 'Something stirs below',
  summons: 'Calling your allies',
  icons: 'Painting the gear',
  shaders: 'Lighting the torches',
  meshing: 'Gathering the townsfolk',
  ready: 'Ready',
};

/** The town's own light, and the colour before any biome is known. */
const TOWN_TINT = '#d9a441';

/** How long one step's creep takes to get most of the way (seconds). */
const CREEP_TAU = 2.4;
/** How far into the next step a step may creep (fraction of one step). */
const CREEP_CAP = 0.85;

function hex(n: number): string {
  return '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6);
}

function tintFor(biome: string | undefined): string {
  const def = biome ? BIOMES.find((b) => b.id === biome) : undefined;
  return def ? hex(def.accentColor) : TOWN_TINT;
}

let mounted = false;

export function mountTransitions(): void {
  if (mounted) return;
  mounted = true;
  const fade = document.getElementById('fade');
  if (!fade) return;

  // The place, behind everything but the key art.
  const scape = document.createElement('div');
  scape.className = 'ld-scape';
  scape.setAttribute('aria-hidden', 'true');
  fade.appendChild(scape);

  const card = document.createElement('div');
  card.className = 'ld-card';
  card.setAttribute('role', 'status');
  card.innerHTML =
    '<div class="ld-sigil" aria-hidden="true">' +
    '<svg viewBox="0 0 100 100"><g fill="none" stroke="currentColor">' +
    '<circle cx="50" cy="50" r="44" stroke-width="0.8" opacity="0.5"/>' +
    '<circle cx="50" cy="50" r="38" stroke-width="0.6" stroke-dasharray="2 5" class="ld-spin-a"/>' +
    '<path d="M50 8 L58 50 L50 92 L42 50 Z" stroke-width="1" class="ld-spin-b"/>' +
    '<path d="M8 50 L50 42 L92 50 L50 58 Z" stroke-width="1" class="ld-spin-b"/>' +
    '<circle cx="50" cy="50" r="5" stroke-width="1.2"/>' +
    '</g></svg></div>' +
    '<div class="ld-kicker"></div>' +
    '<div class="ld-title"></div>' +
    '<div class="ld-load">' +
    '<div class="ld-track"><div class="ld-run"><div class="ld-spark"></div></div></div>' +
    '<div class="ld-meta"><span class="ld-stage"></span><span class="ld-pct"></span></div>' +
    '</div>' +
    '<div class="ld-tip"><span class="ld-tip-k">Tip</span><span class="ld-tip-text"></span></div>';
  fade.appendChild(card);

  // A gold filigree divider (art stream) in place of the tip's hairline.
  const tipRow = card.querySelector<HTMLElement>('.ld-tip');
  if (tipRow) {
    try {
      tipRow.style.setProperty('--ld-divider', `url(${dividerUri(320, 'gold')})`);
      tipRow.classList.add('has-divider');
    } catch {
      /* the hairline stays */
    }
  }

  // The key art (art stream) fades in behind the card on slow swaps only.
  let art: HTMLCanvasElement | null = null;
  try {
    art = mountKeyArt(fade, 0);
    art.style.opacity = ''; // the stylesheet owns it from here
    art.classList.add('ld-art');
  } catch {
    art = null;
  }

  const kicker = card.querySelector<HTMLElement>('.ld-kicker')!;
  const title = card.querySelector<HTMLElement>('.ld-title')!;
  const tipText = card.querySelector<HTMLElement>('.ld-tip-text')!;
  const load = card.querySelector<HTMLElement>('.ld-load')!;
  const run = card.querySelector<HTMLElement>('.ld-run')!;
  const stageEl = card.querySelector<HTMLElement>('.ld-stage')!;
  const pctEl = card.querySelector<HTMLElement>('.ld-pct')!;
  const rng = new Random(randomSeed());
  let tip = -1;

  // Where the hero is, from the floor and zone news: names the next area on
  // the stairs and colours the scenery.
  let lastDepth = { depth: 1, level: 1, of: 1, mapName: undefined as string | undefined };
  let biome: string | undefined;
  let scapeFor = '';

  const setTint = (b: string | undefined): void => {
    const t = tintFor(b);
    card.style.setProperty('--ld-tint', t);
    scape.style.setProperty('--ld-tint', t);
    const key = b ?? 'town';
    if (key !== scapeFor) {
      scapeFor = key;
      scape.innerHTML = skyline(key, !!b && isOutdoorBiome(b as BiomeId));
    }
  };

  // --- the bar ---------------------------------------------------------------

  let on = false;
  /** A `scene:loading` started this load (cleared at `scene:change`). */
  let viaGoTo = false;
  /** This load shows the card (menus build too fast to need one). */
  let wanted = false;
  /** Steps arrived for this load, so file progress stays out of it. */
  let stepped = false;
  let base = 0; // done / total of the current step
  let cap = 0; // how far this step may creep
  let stepAt = 0; // when the current step began (ms)
  let shown = 0; // what the bar shows now, 0..1
  let drawn = -1;
  let pct = -1;
  let raf = 0;

  const paint = (): void => {
    if (Math.abs(shown - drawn) > 0.0008) {
      drawn = shown;
      run.style.transform = `translateX(${((shown - 1) * 100).toFixed(2)}%)`;
    }
    const p = Math.round(shown * 100);
    if (p !== pct) {
      pct = p;
      pctEl.textContent = `${p}%`;
    }
  };

  let lastT = 0;
  const tick = (now: number): void => {
    raf = 0;
    if (!on) return;
    const dt = Math.min(0.1, Math.max(0, (now - (lastT || now)) / 1000));
    lastT = now;
    const into = (now - stepAt) / 1000;
    const goal = base + (cap - base) * (1 - Math.exp(-into / CREEP_TAU));
    // Catch up fast when a step lands, never run backwards.
    if (goal > shown) shown += (goal - shown) * (1 - Math.exp(-dt / 0.14));
    paint();
    raf = requestAnimationFrame(tick);
  };

  const resetBar = (): void => {
    base = cap = shown = 0;
    drawn = pct = -1;
    stepped = false;
    stepAt = performance.now();
    stageEl.textContent = '';
    load.classList.remove('is-live');
    paint();
  };

  const show = (k: string, t: string): void => {
    tip = nextTip(tip, () => rng.next());
    kicker.textContent = k;
    title.textContent = t;
    tipText.textContent = TIPS[tip] ?? '';
    on = true;
    card.classList.add('is-on');
    scape.classList.add('is-on');
    art?.classList.add('is-on');
    lastT = 0;
    if (!raf) raf = requestAnimationFrame(tick);
  };

  const hide = (): void => {
    on = false;
    wanted = false;
    card.classList.remove('is-on');
    scape.classList.remove('is-on');
    art?.classList.remove('is-on');
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  events.on('scene:loading', (p) => {
    viaGoTo = true;
    resetBar();
    if (p.to === 'dungeon') {
      const depth = Math.max(1, Number((p.payload as { depth?: number } | undefined)?.depth ?? 1));
      // The biome is not known until the floor is drawn; the town's light
      // until then, and the place's own colour the moment it is.
      setTint(undefined);
      wanted = true;
      show(p.from === 'dungeon' ? 'Deeper still' : 'Descending', `Tier ${depth}`);
    } else if (p.to === 'town') {
      setTint(undefined);
      const c = save.account.current;
      const k = c && p.from !== 'dungeon' ? c.name : p.from === 'dungeon' ? 'Climbing out' : 'Returning';
      wanted = true;
      show(k, 'The Town');
    } else {
      // Menus build instantly; a card would only flash.
      hide();
    }
  });

  events.on('load:progress', (p) => {
    if (p.done === 0 && p.stage !== 'ready' && !viaGoTo && !on) {
      // The stairs to the next area: no scene:loading, so the first step
      // brings the card up.
      resetBar();
      setTint(biome);
      wanted = true;
      const next = Math.min(lastDepth.of, lastDepth.level + 1);
      const k = lastDepth.mapName ?? `Tier ${lastDepth.depth}`;
      show(k, lastDepth.of > 1 ? `Area ${next} of ${lastDepth.of}` : 'Onward');
    }
    if (!wanted) return;
    const total = Math.max(1, p.total);
    stepped = true;
    load.classList.add('is-live');
    stageEl.textContent = STAGE_WORDS[p.stage] ?? 'Making ready';
    if (p.stage === 'ready') {
      base = cap = shown = 1;
      paint();
      // The curtain lifts next; the card fades with a full bar.
      hide();
      viaGoTo = false;
      return;
    }
    base = Math.min(1, Math.max(shown, p.done / total));
    cap = Math.min(1, Math.max(base, (p.done + CREEP_CAP) / total));
    stepAt = performance.now();
  });

  // Files still arriving (core/Assets.ts), for a load with no steps counted.
  events.on('assets:progress', (p) => {
    if (!on || stepped) return;
    const f = p.total > 0 ? Math.min(1, p.loaded / p.total) : 1;
    if (f >= 1) {
      load.classList.remove('is-live');
      return;
    }
    load.classList.add('is-live');
    stageEl.textContent = 'Fetching the old maps';
    base = cap = Math.max(shown, f);
    stepAt = performance.now();
  });

  events.on('depth:changed', (p) => {
    lastDepth = { depth: p.depth, level: p.level, of: p.of, mapName: p.mapName };
    biome = p.biome;
    // Arrives mid-build: the scenery takes the new place's colour.
    if (on) setTint(biome);
  });
  events.on('zone:entered', (p) => {
    biome = p.biome;
  });

  events.on('scene:change', () => {
    viaGoTo = false;
    hide();
  });

  setTint(undefined);
}

/**
 * A skyline for one place, as inline SVG: a far wall of peaks or cave teeth
 * and a near row of ruins (pillars, broken columns, arches, spires, rubble).
 * The same id always draws the same skyline.
 */
function skyline(id: string, outdoor: boolean): string {
  const r = streamFor(0x51a7, `ld-scape:${id}`);
  const W = 1200;
  const H = 300;

  // Far layer: smooth peaks (outdoors) or a jagged cave wall.
  let far = `M0 ${H} L0 ${170 + r.next() * 40}`;
  for (let x = 0; x < W; ) {
    const w = outdoor ? 60 + r.next() * 140 : 26 + r.next() * 60;
    const peak = outdoor ? 60 + r.next() * 120 : 110 + r.next() * 90;
    const mid = x + w * (0.35 + r.next() * 0.3);
    x = Math.min(W, x + w);
    const valley = peak + 30 + r.next() * 50;
    far += ` L${mid.toFixed(0)} ${peak.toFixed(0)} L${x.toFixed(0)} ${Math.min(H - 40, valley).toFixed(0)}`;
  }
  far += ` L${W} ${H} Z`;

  // Teeth from the top, underground only.
  let roof = '';
  if (!outdoor) {
    roof = `M0 0`;
    for (let x = 0; x < W; ) {
      const w = 18 + r.next() * 50;
      const drop = r.next() < 0.3 ? 40 + r.next() * 70 : 8 + r.next() * 22;
      roof += ` L${(x + w / 2).toFixed(0)} ${drop.toFixed(0)} L${Math.min(W, x + w).toFixed(0)} ${(2 + r.next() * 6).toFixed(0)}`;
      x += w;
    }
    roof += ` L${W} 0 Z`;
  }

  // Near layer: ruins on a low ground line.
  const ground = H - 18 - r.next() * 10;
  let near = `M0 ${H} L0 ${ground.toFixed(0)}`;
  const at = (x: number, y: number): string => ` L${x.toFixed(0)} ${y.toFixed(0)}`;
  for (let x = 0; x < W; ) {
    const roll = r.next();
    if (roll < 0.22) {
      // A pillar with a cap.
      const w = 14 + r.next() * 12;
      const h = 70 + r.next() * 110;
      near += at(x + 4, ground) + at(x + 4, ground - h) + at(x, ground - h) + at(x, ground - h - 8) + at(x + w + 8, ground - h - 8) + at(x + w + 8, ground - h) + at(x + w + 4, ground - h) + at(x + w + 4, ground);
      x += w + 8 + 20 + r.next() * 50;
    } else if (roll < 0.4) {
      // A broken column, snapped at a slant.
      const w = 16 + r.next() * 10;
      const h = 30 + r.next() * 80;
      near += at(x, ground) + at(x, ground - h) + at(x + w * 0.4, ground - h - 10 - r.next() * 14) + at(x + w * 0.7, ground - h + 6) + at(x + w, ground - h - 4) + at(x + w, ground);
      x += w + 16 + r.next() * 40;
    } else if (roll < 0.55) {
      // An arch: two piers and a round head.
      const span = 50 + r.next() * 50;
      const pier = 12 + r.next() * 6;
      const h = 70 + r.next() * 60;
      const top = ground - h;
      near += at(x, ground) + at(x, top) + ` A${(span / 2 + pier).toFixed(0)} ${(span / 2 + pier).toFixed(0)} 0 0 1 ${(x + span + pier * 2).toFixed(0)} ${top.toFixed(0)}`;
      near += at(x + span + pier * 2, ground) + at(x + span + pier, ground) + at(x + span + pier, top + 4);
      near += ` A${(span / 2).toFixed(0)} ${(span / 2).toFixed(0)} 0 0 0 ${(x + pier).toFixed(0)} ${(top + 4).toFixed(0)}`;
      near += at(x + pier, ground);
      x += span + pier * 2 + 24 + r.next() * 40;
    } else if (roll < 0.66) {
      // A spire.
      const w = 20 + r.next() * 20;
      const h = 90 + r.next() * 120;
      near += at(x, ground) + at(x + w * 0.2, ground - h * 0.55) + at(x + w * 0.5, ground - h) + at(x + w * 0.8, ground - h * 0.55) + at(x + w, ground);
      x += w + 20 + r.next() * 60;
    } else {
      // Rubble and bare ground.
      const w = 40 + r.next() * 90;
      const n = 2 + Math.floor(r.next() * 4);
      for (let i = 1; i <= n; i++) near += at(x + (w * i) / (n + 1), ground - 4 - r.next() * 14) + at(x + (w * (i + 0.5)) / (n + 1), ground);
      x += w;
    }
  }
  near += at(W, ground) + ` L${W} ${H} Z`;

  return (
    (roof ? `<svg class="ld-top" viewBox="0 0 ${W} 120" preserveAspectRatio="xMidYMin slice"><path class="ld-roof" d="${roof}"/></svg>` : '') +
    `<svg class="ld-bottom" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice">` +
    `<path class="ld-far" d="${far}"/>` +
    `<path class="ld-near" d="${near}"/>` +
    '</svg>'
  );
}
