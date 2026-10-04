/**
 * SLAY — the story runtime.
 *
 * Owns `AccountSave.story`: what the account has learned, who it has talked
 * to, which contracts are open. Reads the text in `data/story/` and decides
 * what applies right now. Presentation lives in `ui/StoryOverlay.ts`,
 * `ui/DialoguePanel.ts` and `ui/JournalPanel.ts`; nothing here touches the DOM.
 *
 * Story state is account-wide on purpose. A character dies; the town's
 * business does not. The next delver inherits the open contracts, the
 * journal and the Listener's opinion of the family.
 */

import type { AccountSave, Character, StorySave } from '../types';
import { save } from '../core/Save';
import type { Chapter, When } from '../data/story/types';
import { CHAPTERS, chapterById, chaptersUpTo } from '../data/story/premise';

const STORY_VERSION = 1;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function fresh(): StorySave {
  return {
    v: STORY_VERSION,
    chapters: [],
    notes: [],
    biomes: [],
    met: [],
    slain: [],
    heard: [],
    talked: {},
    chains: {},
  };
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? Array.from(new Set(v.filter((x): x is string => typeof x === 'string'))) : [];

/**
 * The migration. Fills in a missing or damaged story block in place and
 * returns it. Safe to call on every access: a sound block passes through
 * untouched.
 */
export function ensureStory(acct: AccountSave): StorySave {
  const raw = acct.story as Partial<StorySave> | undefined;
  if (raw && raw.v === STORY_VERSION && Array.isArray(raw.chapters) && raw.chains && raw.talked) {
    return raw as StorySave;
  }
  const s = fresh();
  if (raw && typeof raw === 'object') {
    s.chapters = strings(raw.chapters);
    s.notes = strings(raw.notes);
    s.biomes = strings(raw.biomes);
    s.met = strings(raw.met);
    s.slain = strings(raw.slain);
    s.heard = strings(raw.heard);
    if (raw.talked && typeof raw.talked === 'object') {
      for (const [k, v] of Object.entries(raw.talked)) if (typeof v === 'number') s.talked[k] = v;
    }
    if (raw.chains && typeof raw.chains === 'object') {
      for (const [k, v] of Object.entries(raw.chains)) {
        const step = (v as { step?: unknown })?.step;
        const state = (v as { state?: unknown })?.state;
        if (typeof step !== 'number' || step < 0) continue;
        s.chains[k] = {
          step: Math.floor(step),
          state: state === 'active' || state === 'ready' ? state : 'idle',
        };
      }
    }
    if (raw.last && typeof raw.last === 'object') s.last = raw.last;
  }
  acct.story = s;
  return s;
}

/** The live account's story block. */
export function story(): StorySave {
  return ensureStory(save.account);
}

/** Persists after a story change. Never throws: story must not break the game. */
export function persist(): void {
  try {
    save.touch();
  } catch {
    /* no storage in this environment */
  }
}

function current(): Character | null {
  return save.account.current ?? null;
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

/**
 * Chain progress readers. Registered by the chain module so this file does
 * not need to import the chain catalogue to answer a condition.
 */
let stepDone: (ref: string) => boolean = () => false;
let stepActive: (ref: string) => boolean = () => false;

export function setChainReaders(done: (ref: string) => boolean, active: (ref: string) => boolean): void {
  stepDone = done;
  stepActive = active;
}

/** True when every condition in `w` holds right now. */
export function holds(w: When | undefined, npcId?: string): boolean {
  if (!w) return true;
  const s = story();
  const acct = save.account;
  const c = current();
  const depth = c?.depthRecord ?? 0;
  if (w.chapter && !s.chapters.includes(w.chapter)) return false;
  if (w.notChapter && s.chapters.includes(w.notChapter)) return false;
  if (w.best !== undefined && acct.bestDepth < w.best) return false;
  if (w.notBest !== undefined && acct.bestDepth >= w.notBest) return false;
  if (w.depth !== undefined && depth < w.depth) return false;
  if (w.notDepth !== undefined && depth >= w.notDepth) return false;
  if (w.fallen !== undefined && acct.fallen.length < w.fallen) return false;
  if (w.done && !stepDone(w.done)) return false;
  if (w.notDone && stepDone(w.notDone)) return false;
  if (w.active && !stepActive(w.active)) return false;
  if (w.slain && !s.slain.includes(w.slain)) return false;
  if (w.notSlain && s.slain.includes(w.notSlain)) return false;
  if (w.note && !s.notes.includes(w.note)) return false;
  if (w.cls && c?.classId !== w.cls) return false;
  if (w.first !== undefined && npcId) {
    const spoke = s.talked[npcId] !== undefined;
    if (w.first === spoke) return false;
  }
  if (w.after) {
    const last = s.last;
    if (!last || last.kind !== w.after) return false;
    // Only news if it happened since this person last spoke to you.
    if (npcId && (s.talked[npcId] ?? 0) >= last.at) return false;
  }
  return true;
}

/** `{name}`, `{class}`, `{depth}`, `{best}`, `{fallen}`, `{lastFallen}` in a line. */
export function fillStory(text: string): string {
  const acct = save.account;
  const c = current();
  const lastFallen = acct.fallen.length ? acct.fallen[acct.fallen.length - 1]!.name : 'the last one';
  const vars: Record<string, string> = {
    name: c?.name ?? 'delver',
    class: c ? className(c.classId) : 'delver',
    depth: String(c?.depthRecord ?? 0),
    best: String(acct.bestDepth),
    fallen: String(acct.fallen.length),
    lastFallen,
  };
  return text.replace(/\{(\w+)\}/g, (whole, k: string) => vars[k] ?? whole);
}

const CLASS_NAMES: Record<string, string> = {
  warden: 'warden',
  pyromancer: 'pyromancer',
  shadowblade: 'shadowblade',
  stormcaller: 'stormcaller',
  revenant: 'revenant',
  ranger: 'ranger',
};

function className(id: string): string {
  return CLASS_NAMES[id] ?? 'delver';
}

// ---------------------------------------------------------------------------
// Chapters — the why, in pieces
// ---------------------------------------------------------------------------

/**
 * Reveals every chapter at or above `depth` that the account has not seen.
 * Returns the newly revealed ones, shallowest first, for the overlay to show.
 */
export function revealChaptersUpTo(depth: number): Chapter[] {
  const s = story();
  const fresh: Chapter[] = [];
  for (const ch of chaptersUpTo(depth)) {
    if (s.chapters.includes(ch.id)) continue;
    s.chapters.push(ch.id);
    fresh.push(ch);
  }
  if (fresh.length) persist();
  return fresh;
}

/** Every revealed chapter, in the order of the descent. */
export function revealedChapters(): Chapter[] {
  const s = story();
  const out: Chapter[] = [];
  for (const id of s.chapters) {
    const ch = chapterById(id);
    if (ch) out.push(ch);
  }
  return out.sort((a, b) => a.depth - b.depth);
}

/** The next written chapter the account has not reached, for a journal hint. */
export function nextChapter(): Chapter | null {
  const s = story();
  return CHAPTERS.find((c) => !s.chapters.includes(c.id)) ?? null;
}

// ---------------------------------------------------------------------------
// What just happened below — so the camp can react to it
// ---------------------------------------------------------------------------

export function noteRunCleared(depth: number): void {
  const c = current();
  story().last = { kind: 'cleared', at: Date.now(), depth, name: c?.name ?? '' };
  persist();
}

export function noteDeath(depth: number, name: string): void {
  story().last = { kind: 'died', at: Date.now(), depth, name };
  persist();
}

/** Marks a biome as entered. Returns true the first time. */
export function enterBiome(biome: string): boolean {
  const s = story();
  if (s.biomes.includes(biome)) return false;
  s.biomes.push(biome);
  persist();
  return true;
}
