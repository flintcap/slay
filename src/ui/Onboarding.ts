/**
 * SLAY — first-run hints.
 *
 * Teaches the controls once, one thing at a time, and waits for the player to
 * actually try each one before moving on. A hint that is answered (the player
 * pressed the key it names) completes with a tick; one that is ignored for a
 * while quietly steps aside and comes back later. Every hint is remembered in
 * the account's unlocks as `hint.<id>`, so it never shows again unless the
 * player asks for them back in Settings.
 *
 * Some hints are contextual rather than scripted: the potion hint waits until
 * life first drops below half, the points hint until the first level-up, the
 * loot hint until something first drops.
 *
 * This replaced four timed toasts on the first descent, two of which named the
 * wrong buttons.
 */

import type { Engine } from '../core/Engine';
import { events } from '../core/Events';
import { save } from '../core/Save';

type Signal = { kind: 'key'; code: string } | { kind: 'mouse'; button: number } | { kind: 'event'; name: string };

interface Hint {
  id: string;
  /** Text with `{Key}` placeholders that render as keycaps. */
  text: string;
  /** Where it may show. */
  where: 'town' | 'dungeon' | 'world';
  done: (s: Signal) => boolean;
  /** Seconds before an ignored hint steps aside. */
  patience?: number;
}

const key = (...codes: string[]) => (s: Signal): boolean => s.kind === 'key' && codes.includes(s.code);
const event = (...names: string[]) => (s: Signal): boolean => s.kind === 'event' && names.includes(s.name);

const HINTS: Record<string, Hint> = {
  move: {
    id: 'move',
    text: 'Left click the ground to walk there, or move with {W}{A}{S}{D}.',
    where: 'world',
    done: (s) => key('KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight')(s) || (s.kind === 'mouse' && s.button === 0),
  },
  talk: {
    id: 'talk',
    text: 'Walk up to anyone in town and press {E} to trade, craft or open the vault.',
    where: 'town',
    done: key('KeyE'),
    patience: 16,
  },
  attack: {
    id: 'attack',
    text: '{Right click} a monster to attack it. You will close the distance on your own.',
    where: 'dungeon',
    done: (s) => s.kind === 'mouse' && s.button === 2,
  },
  skills: {
    id: 'skills',
    text: 'Keys {1} to {6} cast the skills on your bar. Spend skill points with {T} to fill it.',
    where: 'dungeon',
    done: key('Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'KeyT'),
    patience: 14,
  },
  dodge: {
    id: 'dodge',
    text: 'Press {Space} to dodge. It carries you straight through a swing.',
    where: 'dungeon',
    done: key('Space'),
    patience: 14,
  },
  potion: {
    id: 'potion',
    text: 'Life is low. {Q} drinks a life potion, {F} a mana potion.',
    where: 'dungeon',
    done: (s) => key('KeyQ', 'KeyF')(s) || event('potion')(s),
    patience: 10,
  },
  points: {
    id: 'points',
    text: 'Level up! Spend your points: {C} for attributes, {T} for skills.',
    where: 'world',
    done: key('KeyC', 'KeyT'),
    patience: 18,
  },
  loot: {
    id: 'loot',
    text: 'Something dropped. Click its name to pick it up. Hold {Shift} to see everything on the floor.',
    where: 'dungeon',
    done: (s) => event('pickup')(s) || key('ShiftLeft', 'ShiftRight')(s),
    patience: 16,
  },
  inventory: {
    id: 'inventory',
    text: 'Press {I} to open your pack and put on what you found.',
    where: 'world',
    done: key('KeyI'),
    patience: 16,
  },
  map: {
    id: 'map',
    text: 'Press {M} for the map. Every floor has a way down, and the last one has a boss.',
    where: 'dungeon',
    done: key('KeyM'),
    patience: 14,
  },
};

const PREFIX = 'hint.';

let engineRef: Engine | null = null;
let card: HTMLDivElement | null = null;
let showing: Hint | null = null;
let shownAt = 0;
const queue: string[] = [];
let gapUntil = 0;
let timer = 0;

function seen(id: string): boolean {
  return save.hasUnlock(PREFIX + id);
}

function enabled(): boolean {
  return save.settings.hints !== false;
}

function sceneKind(): 'town' | 'dungeon' | null {
  const id = engineRef?.currentSceneId;
  return id === 'town' || id === 'dungeon' ? id : null;
}

function fits(h: Hint): boolean {
  const k = sceneKind();
  if (!k) return false;
  return h.where === 'world' || h.where === k;
}

/** Puts a hint in line. `urgent` hints jump the queue. */
function want(id: string, urgent = false): void {
  if (!enabled() || seen(id) || showing?.id === id || queue.includes(id)) return;
  if (urgent) queue.unshift(id);
  else queue.push(id);
  pump();
}

function pump(): void {
  if (showing || !card || !enabled()) return;
  const now = performance.now();
  if (now < gapUntil) {
    clearTimeout(timer);
    timer = window.setTimeout(pump, gapUntil - now + 20);
    return;
  }
  const i = queue.findIndex((id) => !seen(id) && fits(HINTS[id]!));
  if (i < 0) return;
  const [id] = queue.splice(i, 1);
  show(HINTS[id!]!);
}

function render(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const parts = text.split(/(\{[^}]+\})/g);
  for (const p of parts) {
    if (!p) continue;
    const m = /^\{(.+)\}$/.exec(p);
    if (m) {
      const k = document.createElement('span');
      k.className = 'keycap ob-key';
      k.textContent = m[1]!;
      frag.appendChild(k);
    } else {
      frag.appendChild(document.createTextNode(p));
    }
  }
  return frag;
}

function show(h: Hint): void {
  if (!card) return;
  showing = h;
  shownAt = performance.now();
  const total = Object.keys(HINTS).length;
  const done = Object.keys(HINTS).filter(seen).length;
  card.replaceChildren();
  const head = document.createElement('div');
  head.className = 'ob-head';
  head.innerHTML = '<span class="ob-kicker">How to play</span>';
  const count = document.createElement('span');
  count.className = 'ob-count';
  count.textContent = `${done + 1} / ${total}`;
  head.appendChild(count);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'ob-close';
  close.title = 'Dismiss this hint';
  close.textContent = '×';
  close.addEventListener('click', () => finish(true));
  head.appendChild(close);
  const body = document.createElement('div');
  body.className = 'ob-text';
  body.appendChild(render(h.text));
  const bar = document.createElement('div');
  bar.className = 'ob-bar';
  bar.style.setProperty('--life', `${h.patience ?? 0}s`);
  if (!h.patience) bar.classList.add('is-static');
  card.append(head, body, bar);
  card.classList.remove('is-done', 'is-out');
  void card.offsetWidth;
  card.classList.add('is-on');
  events.emit('sfx', { id: 'ui.open', volume: 0.6 });

  clearTimeout(timer);
  if (h.patience) {
    timer = window.setTimeout(() => {
      // Ignored: step aside without marking it seen, and try again later.
      if (showing?.id !== h.id) return;
      hide();
      window.setTimeout(() => want(h.id), 45000);
    }, h.patience * 1000);
  }
}

function hide(): void {
  if (!card) return;
  showing = null;
  card.classList.add('is-out');
  card.classList.remove('is-on');
  gapUntil = performance.now() + 1400;
  pump();
}

/** The player did the thing (or dismissed it). */
function finish(dismissed = false): void {
  const h = showing;
  if (!h || !card) return;
  save.unlock(PREFIX + h.id);
  save.touch();
  clearTimeout(timer);
  if (dismissed) {
    hide();
    return;
  }
  card.classList.add('is-done');
  events.emit('sfx', { id: 'ui.select', volume: 0.6 });
  window.setTimeout(() => {
    if (showing === h) hide();
  }, 900);
}

function signal(s: Signal): void {
  // A brief grace period so the keypress that was already happening does not
  // complete the hint before it has been read.
  if (showing && performance.now() - shownAt > 400 && showing.done(s)) finish();
}

/** Forget every hint so they show again. Used by Settings. */
export function resetHints(): void {
  const u = save.account.unlocks;
  for (let i = u.length - 1; i >= 0; i--) if (u[i]!.startsWith(PREFIX)) u.splice(i, 1);
  save.touch();
}

export function mountOnboarding(root: HTMLElement, engine: Engine): void {
  if (card) return;
  engineRef = engine;
  card = document.createElement('div');
  card.className = 'ob-card';
  card.setAttribute('role', 'status');
  root.appendChild(card);

  // Players from before this system already learned the basics from the old
  // toasts; do not teach them to walk again.
  if (save.hasUnlock('tutorial.controls')) {
    for (const id of ['move', 'attack', 'skills', 'dodge']) save.unlock(PREFIX + id);
  }

  window.addEventListener(
    'keydown',
    (e) => {
      if (!e.repeat) signal({ kind: 'key', code: e.code });
    },
    { capture: true, passive: true },
  );
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.target === engine.renderer.canvas) signal({ kind: 'mouse', button: e.button });
    },
    { capture: true, passive: true },
  );

  events.on('scene:loading', () => {
    // Anything on screen belongs to the scene we are leaving.
    if (showing) {
      const id = showing.id;
      showing = null;
      card?.classList.remove('is-on', 'is-done');
      if (!seen(id)) queue.unshift(id);
    }
  });
  events.on('scene:change', (p) => {
    if (p.to === 'town') {
      gapUntil = performance.now() + 2600;
      want('move');
      want('talk');
    } else if (p.to === 'dungeon') {
      gapUntil = performance.now() + 4200;
      want('move');
      want('attack');
      want('skills');
      want('dodge');
    }
    pump();
  });
  events.on('player:damaged', (p) => {
    if (sceneKind() === 'dungeon' && p.life > 0 && p.life / Math.max(1, p.maxLife) < 0.5) want('potion', true);
  });
  events.on('potion:use', () => signal({ kind: 'event', name: 'potion' }));
  events.on('player:levelUp', () => want('points', true));
  events.on('loot:dropped', () => {
    if (sceneKind() === 'dungeon') want('loot');
  });
  events.on('loot:pickedUp', () => {
    signal({ kind: 'event', name: 'pickup' });
    want('inventory');
  });
  events.on('depth:changed', (p) => {
    if (p.depth > 0 && p.level >= 2) want('map');
  });
  events.on('settings:changed', () => {
    if (!enabled() && showing) hide();
  });
}
