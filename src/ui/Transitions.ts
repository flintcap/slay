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
 */

import { events } from '../core/Events';
import { save } from '../core/Save';
import { Random, randomSeed } from '../core/RNG';
import { TIPS, nextTip } from './tips';
import { mountKeyArt } from '../art/KeyArt';
import { dividerUri } from '../art/Ornament';
import { tr } from '../core/I18n';

/** Each build step, in words a player reads in a glance. */
const STAGE_WORDS: Record<string, string> = {
  map: tr('Drawing the map'),
  hero: tr('Arming the hero'),
  world: tr('Raising the walls'),
  monsters: tr('Waking the monsters'),
  boss: tr('Something stirs below'),
  summons: tr('Calling your allies'),
  icons: tr('Painting the gear'),
  shaders: tr('Lighting the torches'),
  meshing: tr('Gathering the townsfolk'),
  ready: tr('Ready'),
};

/** How long one step's creep takes to get most of the way (seconds). */
const CREEP_TAU = 2.4;
/** How far into the next step a step may creep (fraction of one step). */
const CREEP_CAP = 0.85;

let mounted = false;

export function mountTransitions(): void {
  if (mounted) return;
  mounted = true;
  const fade = document.getElementById('fade');
  if (!fade) return;

  const card = document.createElement('div');
  card.className = 'ld-card';
  card.setAttribute('role', 'status');
  card.innerHTML =
    tr('<div class="ld-sigil" aria-hidden="true"><svg viewBox="0 0 100 100"><g fill="none" stroke="currentColor"><circle cx="50" cy="50" r="44" stroke-width="0.8" opacity="0.5"/><circle cx="50" cy="50" r="38" stroke-width="0.6" stroke-dasharray="2 5" class="ld-spin-a"/><path d="M50 8 L58 50 L50 92 L42 50 Z" stroke-width="1" class="ld-spin-b"/><path d="M8 50 L50 42 L92 50 L50 58 Z" stroke-width="1" class="ld-spin-b"/><circle cx="50" cy="50" r="5" stroke-width="1.2"/></g></svg></div><div class="ld-kicker"></div><div class="ld-title"></div><div class="ld-load"><div class="ld-track"><div class="ld-run"></div></div><div class="ld-meta"><span class="ld-stage"></span><span class="ld-pct"></span></div></div><div class="ld-tip"><span class="ld-tip-k">Tip</span><span class="ld-tip-text"></span></div>');
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

  // Where the hero is, from the floor news: names the next area on the stairs.
  let lastDepth = { depth: 1, level: 1, of: 1, mapName: undefined as string | undefined };

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
    art?.classList.add('is-on');
    lastT = 0;
    if (!raf) raf = requestAnimationFrame(tick);
  };

  const hide = (): void => {
    on = false;
    wanted = false;
    card.classList.remove('is-on');
    art?.classList.remove('is-on');
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  events.on('scene:loading', (p) => {
    viaGoTo = true;
    resetBar();
    if (p.to === 'dungeon') {
      const depth = Math.max(1, Number((p.payload as { depth?: number } | undefined)?.depth ?? 1));
      wanted = true;
      show(p.from === 'dungeon' ? tr('Deeper still') : tr('Descending'), tr('Tier {0}', depth));
    } else if (p.to === 'town') {
      const c = save.account.current;
      const k = c && p.from !== 'dungeon' ? c.name : p.from === 'dungeon' ? tr('Climbing out') : tr('Returning');
      wanted = true;
      show(k, tr('The Town'));
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
      wanted = true;
      const next = Math.min(lastDepth.of, lastDepth.level + 1);
      const k = lastDepth.mapName ?? tr('Tier {0}', lastDepth.depth);
      show(k, lastDepth.of > 1 ? tr('Area {0} of {1}', next, lastDepth.of) : tr('Onward'));
    }
    if (!wanted) return;
    const total = Math.max(1, p.total);
    stepped = true;
    load.classList.add('is-live');
    stageEl.textContent = STAGE_WORDS[p.stage] ?? tr('Making ready');
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
    stageEl.textContent = tr('Fetching the old maps');
    base = cap = Math.max(shown, f);
    stepAt = performance.now();
  });

  events.on('depth:changed', (p) => {
    lastDepth = { depth: p.depth, level: p.level, of: p.of, mapName: p.mapName };
  });

  events.on('scene:change', () => {
    viaGoTo = false;
    hide();
  });
}
