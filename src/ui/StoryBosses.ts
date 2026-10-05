/**
 * SLAY — the bosses, as the story tells them.
 *
 * The fight (`entities/Boss.ts`) raises events; this turns them into speech:
 *
 *   boss:engaged   the narrated intro, then the boss's greeting
 *   boss:phase     the phase bark, spoken (the opening one is left to the HUD)
 *   boss:damaged   one taunt as it drops under 45%, chosen by how you are doing
 *   boss:enraged   a line when the fight runs long
 *   boss:killed    last words, then a narrated epitaph
 *   player:died    a line over your body, if a boss did it
 *
 * Arriving on a boss floor shows what was left there, once per account. All of
 * it is kept in the journal's Bosses tab.
 */

import { events } from '../core/Events';
import { BOSSES, getBoss } from '../data/bosses';
import { BOSS_VOICES } from '../data/story/bossVoices';
import type { BossDef } from '../types';
import {
  bossIdByName,
  fillStory,
  floorNoteId,
  noteBossFloor,
  noteBossMet,
  noteBossSlain,
  story,
  tauntMood,
} from '../sim/Story';
import { say, showCard } from './StoryOverlay';
import { addJournalSection, para, pageTitle, type JournalEntry } from './JournalPanel';
import { div, runtime } from './Widgets';

/** The fight in progress, if any. */
let fight: { def: BossDef; taunted: boolean; quietUntil: number } | null = null;

const now = (): number => performance.now() / 1000;

/** True while a boss fight is on: other story beats keep quiet. */
export function bossFightActive(): boolean {
  return fight !== null;
}

/** Speaks as the boss, after anything it is still saying. */
function speak(def: BossDef, text: string, delay = 0, hold?: number): void {
  if (!text) return;
  const t = now();
  const at = Math.max(t + delay, fight?.def === def ? fight.quietUntil : 0);
  const line = fillStory(text);
  const len = hold ?? Math.min(9, 2.6 + line.length * 0.045);
  if (fight?.def === def) fight.quietUntil = at + Math.min(len, 3.2);
  say(def.name, line, { tone: 'boss', delay: at - t, hold });
}

function narrate(text: string, delay = 0): void {
  if (text) say('', text, { tone: 'narration', delay });
}

function floorCard(def: BossDef, depth: number): void {
  const v = BOSS_VOICES[def.id];
  if (!v) return;
  showCard({
    kicker: depth > 0 ? `Found on tier ${depth}` : 'Found on the boss floor',
    title: v.floor.title,
    text: v.floor.text,
    source: v.floor.source,
    kind: 'note',
  });
}

let installed = false;

/** Called from `installStory`. */
export function installStoryBosses(): void {
  if (installed) return;
  installed = true;

  events.on('depth:changed', (p) => {
    if (!p.bossId) return;
    const def = getBoss(p.bossId);
    if (!def || !BOSS_VOICES[def.id]) return;
    // Once per account; the floor card waits for the floor's own title card.
    if (noteBossFloor(def.id)) setTimeout(() => floorCard(def, p.depth), 3600);
  });

  events.on('boss:engaged', (p) => {
    const id = bossIdByName(p.name);
    const def = id ? getBoss(id) : undefined;
    if (!def) return;
    fight = { def, taunted: false, quietUntil: 0 };
    noteBossMet(def.id);
    // The name banner holds the screen for about three seconds; the intro
    // sits under it, and the boss speaks once it lifts.
    narrate(def.intro, 0.5);
    const v = BOSS_VOICES[def.id];
    if (v) speak(def, v.greet, 3.4);
  });

  events.on('boss:phase', (p) => {
    // Phase 0 opens the fight at the same moment as the intro, and the HUD
    // already shows its shout under the bar. Later phases are spoken.
    if (!fight || p.index === 0 || !p.bark) return;
    speak(fight.def, p.bark);
  });

  events.on('boss:damaged', (p) => {
    if (!fight || fight.taunted || p.life <= 0) return;
    if (p.life / Math.max(1, p.maxLife) > 0.45) return;
    fight.taunted = true;
    const v = BOSS_VOICES[fight.def.id];
    if (!v) return;
    const share = runtime.life / Math.max(1, runtime.maxLife);
    speak(fight.def, v.taunts[tauntMood(share)], 0.6);
  });

  events.on('boss:enraged', () => {
    if (!fight) return;
    const v = BOSS_VOICES[fight.def.id];
    if (v) speak(fight.def, v.enraged);
  });

  events.on('boss:killed', (p) => {
    const id = bossIdByName(p.name) ?? fight?.def.id;
    const def = id ? getBoss(id) : undefined;
    fight = null;
    if (!def) return;
    noteBossSlain(def.id);
    const v = BOSS_VOICES[def.id];
    if (!v) return;
    say(def.name, fillStory(v.death), { tone: 'boss' });
    narrate(v.slain, 3.0);
  });

  events.on('player:died', () => {
    if (!fight) return;
    const v = BOSS_VOICES[fight.def.id];
    // The death screen takes over after about two seconds.
    if (v) say(fight.def.name, fillStory(v.victory), { tone: 'boss', delay: 0.2, hold: 2.0 });
    fight = null;
  });

  events.on('scene:change', () => {
    fight = null;
  });

  // Render-tool handles, next to the others on window.SLAY_STORY.
  const handle = (window as unknown as Record<string, Record<string, unknown> | undefined>).SLAY_STORY;
  if (handle) {
    const pick = (): BossDef => fight?.def ?? BOSSES[0]!;
    handle.bossLine = (kind: 'greet' | 'ahead' | 'death' | 'slain' = 'greet') => {
      const def = pick();
      const v = BOSS_VOICES[def.id]!;
      if (kind === 'slain') narrate(v.slain);
      else say(def.name, fillStory(kind === 'greet' ? v.greet : kind === 'death' ? v.death : v.taunts.ahead), { tone: 'boss', hold: 12 });
    };
    handle.bossFloor = (id?: string) => floorCard(getBoss(id ?? pick().id) ?? pick(), 3);
  }
}

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

addJournalSection({
  id: 'bosses',
  label: 'Bosses',
  icon: 'skull',
  empty: 'Nothing has stood in your way yet. Every run ends with something that will.',
  entries(): JournalEntry[] {
    const s = story();
    const known = new Set([...s.met, ...s.slain]);
    for (const n of s.notes) if (n.startsWith('floor.')) known.add(n.slice(6));
    return BOSSES.filter((b) => known.has(b.id) && BOSS_VOICES[b.id])
      .sort((a, b) => a.minDepth - b.minDepth)
      .map((b) => {
        const v = BOSS_VOICES[b.id]!;
        const slain = s.slain.includes(b.id);
        const met = s.met.includes(b.id);
        const read = s.notes.includes(floorNoteId(b.id));
        return {
          id: b.id,
          label: b.name,
          sub: b.title,
          group: slain ? 'Slain' : met ? 'Fought' : 'Heard of',
          render(page: HTMLElement) {
            pageTitle(page, `${b.name}, ${b.title}`, slain ? 'Slain' : met ? 'Fought, still standing' : 'Not yet met');
            if (met) {
              para(page, b.intro, 'jr-quiet');
              const q = document.createElement('blockquote');
              q.textContent = fillStory(v.greet);
              page.appendChild(q);
            }
            if (read) {
              page.appendChild(div('jr-group', v.floor.title));
              for (const t of v.floor.text) para(page, t);
              page.appendChild(div('jr-meta', v.floor.source));
            }
            if (slain) {
              page.appendChild(div('jr-group', 'The end of it'));
              const q = document.createElement('blockquote');
              q.textContent = fillStory(v.death);
              page.appendChild(q);
              para(page, v.slain);
            }
          },
        };
      });
  },
});
