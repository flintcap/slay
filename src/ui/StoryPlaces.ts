/**
 * SLAY — the layers, and what was left in them.
 *
 *   - The first time any character walks into a layer, a card names it.
 *   - Far below a layer's first tier, a line says how it has changed.
 *   - Now and then while you explore, a line notices something.
 *   - Searching a bookcase, a chest or a fallen adventurer can turn up a page.
 *
 * Every page and place is kept in the journal.
 */

import { events } from '../core/Events';
import { streamFor } from '../core/RNG';
import type { BiomeId } from '../types';
import { getBiome } from '../world/Biomes';
import { NOTES } from '../data/story/notes';
import { PLACES, placeName } from '../data/story/places';
import type { LoreNote } from '../data/story/types';
import { deepKey, enterBiome, foundNotes, noteDeepEntry, searchForNote, story } from '../sim/Story';
import { say, showCard } from './StoryOverlay';
import { bossFightActive } from './StoryBosses';
import { addJournalSection, para, pageTitle, type JournalEntry } from './JournalPanel';
import { div } from './Widgets';

/** Where the hero is: biome and tier of the floor, or null in town. */
let here: { biome: BiomeId; depth: number; floor: number } | null = null;
let whisperTimer: number | null = null;
let floorSeq = 0;
let notesThisFloor = 0;
const lastWhisper = new Map<string, string>();

const SOURCE_KICKER: Record<string, string> = {
  fallen: "In a fallen delver's pack",
  bookcase: 'Between the books',
  chest: 'At the bottom of the chest',
};

function noteCard(n: LoreNote, kicker: string): void {
  showCard({ kicker, title: n.title, text: [n.text], source: n.source, kind: 'note' });
}

function clearWhisper(): void {
  if (whisperTimer !== null) {
    clearTimeout(whisperTimer);
    whisperTimer = null;
  }
}

/** One quiet line, some time into the floor, if nothing else is going on. */
function scheduleWhisper(): void {
  clearWhisper();
  if (!here) return;
  const at = { ...here };
  const rng = streamFor((at.depth * 131 + at.floor * 17 + floorSeq * 7) >>> 0, 'story.whisper');
  const wait = rng.range(35, 80);
  whisperTimer = window.setTimeout(() => {
    whisperTimer = null;
    if (!here || here.depth !== at.depth || here.floor !== at.floor) return;
    if (bossFightActive()) return;
    const place = PLACES[at.biome];
    if (!place) return;
    const pool = place.ambient.filter((l) => l !== lastWhisper.get(at.biome));
    const line = rng.pick(pool.length ? pool : place.ambient);
    lastWhisper.set(at.biome, line);
    say('', line, { tone: 'narration' });
  }, wait * 1000);
}

let installed = false;

/** Called from `installStory`. */
/** Biomes this map has already shown, so each greets the hero once per map. */
const seenThisMap = new Set<BiomeId>();

export function installStoryPlaces(): void {
  if (installed) return;
  installed = true;

  events.on('depth:changed', (p) => {
    clearWhisper();
    if (p.depth === 0 || !p.biome) {
      here = null;
      return;
    }
    const biome = p.biome as BiomeId;
    here = { biome, depth: p.depth, floor: p.level };
    floorSeq++;
    notesThisFloor = 0;
    if (p.level === 1) seenThisMap.clear();
    arriveIn(biome, p.depth);
    scheduleWhisper();
  });

  // A map mixes biomes: walking into a new one inside an area counts too.
  events.on('zone:entered', (p) => {
    if (!here) return;
    here = { ...here, biome: p.biome as BiomeId };
    arriveIn(p.biome as BiomeId, p.depth);
  });

  /** The first time a map shows a biome: its first-sight card or deep note. */
  function arriveIn(biome: BiomeId, depth: number): void {
    if (seenThisMap.has(biome)) return;
    seenThisMap.add(biome);
    const place = PLACES[biome];
    if (place) {
      if (enterBiome(biome)) {
        // After the floor card and any chapter of the descent.
        setTimeout(
          () =>
            showCard({
              kicker: `First sight · Tier ${depth}`,
              title: place.name,
              text: [place.firstEntry, place.description],
              kind: 'place',
            }),
          3000,
        );
      } else if (depth >= getBiome(biome).minDepth + place.deepAfter && noteDeepEntry(biome)) {
        say('', place.deepEntry, { tone: 'narration', delay: 4.5 });
      }
    }
  }

  events.on('lore:search', (p) => {
    if (!here || notesThisFloor >= 2) return;
    const n = searchForNote(p.source, p.depth, here.biome);
    if (!n) return;
    notesThisFloor++;
    noteCard(n, SOURCE_KICKER[p.source] ?? 'Found');
  });

  events.on('player:died', () => {
    clearWhisper();
    here = null;
  });
  events.on('scene:change', (p) => {
    if (p.to !== 'dungeon') {
      clearWhisper();
      here = null;
    }
  });

  const handle = (window as unknown as Record<string, Record<string, unknown> | undefined>).SLAY_STORY;
  if (handle) {
    handle.note = (id?: string) => {
      const n = NOTES.find((x) => x.id === id) ?? NOTES[0]!;
      noteCard(n, SOURCE_KICKER.fallen!);
    };
    handle.place = (biome: BiomeId = 'crypt') => {
      const place = PLACES[biome];
      showCard({ kicker: 'First sight · Tier 1', title: place.name, text: [place.firstEntry, place.description], kind: 'place' });
    };
  }
}

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

const BIOME_ORDER: BiomeId[] = [
  'crypt', 'caverns', 'darkForest', 'foundry', 'swamp', 'sunkenTemple', 'desert', 'desertTomb',
  'hive', 'tundra', 'frostvault', 'ashwaste', 'hell', 'voidspire',
];

addJournalSection({
  id: 'notes',
  label: 'Notes',
  icon: 'scroll',
  empty: 'No pages yet. Search bookcases, chests and the packs of the fallen.',
  entries(): JournalEntry[] {
    const found = foundNotes();
    const out: JournalEntry[] = [];
    const groups: Array<[string, LoreNote[]]> = BIOME_ORDER.map((b) => [placeName(b), found.filter((n) => n.biome === b)]);
    groups.push(['Loose pages', found.filter((n) => !n.biome)]);
    for (const [group, notes] of groups) {
      for (const n of notes) {
        out.push({
          id: n.id,
          label: n.title,
          sub: n.source,
          group,
          render(page) {
            pageTitle(page, n.title, `${n.biome ? placeName(n.biome) : 'Found below'} · ${n.source}`);
            para(page, n.text);
          },
        });
      }
    }
    if (out.length) {
      const left = NOTES.length - found.length;
      if (left > 0) {
        out.push({
          id: 'more',
          label: `${left} more`,
          sub: 'Somewhere below',
          group: 'Not yet found',
          locked: true,
          render(page) {
            pageTitle(page, 'Not yet found', `${found.length} of ${NOTES.length}`);
            para(page, `There are ${left} more pages below, as far as anyone knows. Some only turn up deep.`, 'jr-quiet');
          },
        });
      }
    }
    return out;
  },
});

addJournalSection({
  id: 'places',
  label: 'Places',
  icon: 'map',
  empty: 'You have not been below yet.',
  entries(): JournalEntry[] {
    const s = story();
    return BIOME_ORDER.filter((b) => s.biomes.includes(b)).map((b) => {
      const place = PLACES[b];
      const biome = getBiome(b);
      return {
        id: b,
        label: place.name,
        sub: `From tier ${biome.minDepth}`,
        group: 'The layers',
        render(page: HTMLElement) {
          pageTitle(page, place.name, `Made by ${place.makers} · from tier ${biome.minDepth}`);
          para(page, place.firstEntry);
          para(page, place.description);
          if (s.heard.includes(deepKey(b))) {
            page.appendChild(div('jr-group', 'Further down'));
            para(page, place.deepEntry);
          }
          const all = NOTES.filter((n) => n.biome === b);
          const got = all.filter((n) => s.notes.includes(n.id)).length;
          para(page, `Pages found here: ${got} of ${all.length}.`, 'jr-quiet');
        },
      };
    });
  },
});
