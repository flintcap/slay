/**
 * SLAY — the story overlay.
 *
 * Two surfaces that sit over the game without stopping it:
 *
 *   - spoken lines: a speaker and a sentence above the skill bar, for bosses,
 *     the people of the camp, and the occasional narrated beat;
 *   - cards: a parchment card for a chapter of the descent, a lore note, or
 *     the first sight of a place. One at a time, queued, dismissable, and
 *     always kept in the journal afterwards.
 *
 * `installStory` is the single entry point `main.ts` calls. It wires the
 * story runtime to the event bus and to the world generator.
 */

import './story.css';
import { events } from '../core/Events';
import { save } from '../core/Save';
import { div, span, clear } from './Widgets';
import {
  NPCS,
  arrivalLine,
  noteDeath,
  noteRunCleared,
  revealChaptersUpTo,
} from '../sim/Story';
import type { Chapter } from '../data/story/types';
import { installContracts } from './StoryContracts';
import { openDialogueFor } from './DialoguePanel';
import { journal } from './JournalPanel';
import { installStoryBosses } from './StoryBosses';
import { installStoryPlaces } from './StoryPlaces';

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

let subsRoot: HTMLDivElement | null = null;
let cardsRoot: HTMLDivElement | null = null;

function host(): HTMLElement {
  return document.getElementById('ui') ?? document.body;
}

function ensureRoots(): void {
  if (!subsRoot) {
    subsRoot = div('story-subs');
    host().appendChild(subsRoot);
  }
  if (!cardsRoot) {
    cardsRoot = div('story-cards');
    host().appendChild(cardsRoot);
  }
}

// ---------------------------------------------------------------------------
// Spoken lines
// ---------------------------------------------------------------------------

export interface SayOpts {
  /** Visual tone: a boss speaks in red, narration has no speaker. */
  tone?: 'npc' | 'boss' | 'narration';
  /** Seconds before showing. */
  delay?: number;
  /** Seconds on screen. Defaults to a reading time for the length. */
  hold?: number;
}

/** Puts a spoken line on screen. Lines stack; the oldest goes first. */
export function say(speaker: string, text: string, opts: SayOpts = {}): void {
  if (!text) return;
  const show = (): void => {
    ensureRoots();
    const root = subsRoot!;
    const el = div(`story-sub ${opts.tone === 'boss' ? 'is-boss' : ''} ${opts.tone === 'narration' ? 'is-narration' : ''}`);
    if (speaker && opts.tone !== 'narration') el.appendChild(span('story-sub-who', speaker));
    el.appendChild(span('story-sub-line', text));
    root.appendChild(el);
    while (root.childElementCount > 3) root.firstElementChild?.remove();
    requestAnimationFrame(() => el.classList.add('is-open'));
    const hold = opts.hold ?? Math.min(9, 2.6 + text.length * 0.045);
    setTimeout(() => {
      el.classList.remove('is-open');
      setTimeout(() => el.remove(), 420);
    }, hold * 1000);
  };
  if (opts.delay && opts.delay > 0) setTimeout(show, opts.delay * 1000);
  else show();
}

/** Clears every spoken line at once (scene changes). */
export function hush(): void {
  if (subsRoot) clear(subsRoot);
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export interface Card {
  kicker: string;
  title: string;
  text: string[];
  source?: string;
  kind?: 'chapter' | 'note' | 'place';
}

const queue: Card[] = [];
let showing: HTMLDivElement | null = null;
let showTimer: number | null = null;

/** Queues a card. Cards never stack: the next waits until this one goes. */
export function showCard(card: Card): void {
  queue.push(card);
  if (!showing) nextCard();
}

function nextCard(): void {
  const card = queue.shift();
  if (!card) return;
  ensureRoots();
  const el = div(`story-card ${card.kind === 'note' ? 'is-note' : ''}`);
  el.classList.add('ui-interactive');
  el.appendChild(div('story-card-kicker', card.kicker));
  el.appendChild(div('story-card-title', card.title));
  el.appendChild(div('story-card-rule'));
  for (const p of card.text) {
    const para = document.createElement('p');
    para.textContent = p;
    el.appendChild(para);
  }
  if (card.source) el.appendChild(div('story-card-source', `— ${card.source}`));
  const ft = div('story-card-ft');
  ft.appendChild(span('', queue.length ? `Kept in your journal (J) · ${queue.length} more` : 'Kept in your journal (J)'));
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn btn-ghost btn-sm';
  close.textContent = 'Close';
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    dismiss();
  });
  ft.appendChild(close);
  el.appendChild(ft);
  cardsRoot!.appendChild(el);
  showing = el;
  requestAnimationFrame(() => el.classList.add('is-open'));

  const words = card.text.join(' ').split(/\s+/).length;
  const seconds = Math.min(26, 6 + words * 0.32);
  showTimer = window.setTimeout(dismiss, seconds * 1000);
}

function dismiss(): void {
  if (showTimer !== null) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  const el = showing;
  showing = null;
  if (el) {
    el.classList.remove('is-open');
    setTimeout(() => el.remove(), 480);
  }
  setTimeout(nextCard, 520);
}

function chapterCard(ch: Chapter): Card {
  return {
    kicker: ch.depth === 0 ? 'The descent' : ch.id.startsWith('ledger.') ? 'The Deep Ledger' : `The descent · Tier ${ch.depth}`,
    title: ch.title,
    text: ch.text,
    kind: 'chapter',
  };
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

let installed = false;

/** Called once from `main.ts`, after the UI is mounted. */
export function installStory(): void {
  if (installed) return;
  installed = true;
  ensureRoots();
  installContracts();

  events.on('depth:changed', (p) => {
    // Town fires depth 0: the first night in camp reveals the premise. Every
    // floor fires its own tier; the first floor of a run is where it lands.
    if (p.depth === 0) {
      if (!save.account.current) return;
      const fresh = revealChaptersUpTo(0);
      for (const ch of fresh) setTimeout(() => showCard(chapterCard(ch)), 2200);
      // Somebody in camp calls out about what just happened below.
      const call = arrivalLine();
      if (call) say(call.npc.name, call.text, { delay: 2.6 });
      return;
    }
    if (p.level !== 1) return;
    const fresh = revealChaptersUpTo(p.depth);
    // A save from before the story existed can reveal a dozen at once. Show
    // the deepest two; the rest go straight into the journal.
    const shown = fresh.slice(-2);
    shown.forEach((ch, i) => setTimeout(() => showCard(chapterCard(ch)), 2600 + i * 400));
  });

  events.on('run:cleared', (p) => noteRunCleared(p.depth));

  events.on('player:died', () => {
    const c = save.account.current;
    noteDeath(c?.depthRecord ?? 0, c?.name ?? '');
  });

  events.on('scene:change', () => hush());

  // A handle for the screenshot and behaviour tools, next to window.SLAY.
  (window as unknown as Record<string, unknown>).SLAY_STORY = {
    say,
    showCard,
    talk: (id: string) => openDialogueFor(id.includes(':') || !(id in NPCS) ? id : `talk:${id}`),
    journal: (tab?: string) => journal().openAt(tab ?? 'descent'),
  };

  installStoryBosses();
  installStoryPlaces();
}
