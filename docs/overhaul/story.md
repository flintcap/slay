# Stream: story (lore, quests, characters)

Status: in progress

## Milestones

- [x] The why: a central premise for the descent, revealed in pieces as you go deeper, with a payoff at depth milestones. (`Story: the premise of the descent, chapters and the journal`)
- [x] Town NPCs: each has a name, a voice, a few lines of dialogue that change with your progress, and a reason to talk to them. (`Story: the people of Stairhead, and talking to them`)
- [x] Quest lines: hand-written quest chains that send you to specific depths and biomes, with rewards and short story beats. (`Story: contracts, nine hand-written quest lines`)
- [x] Bosses with personality: an intro line, a taunt mid-fight, and a death line for every boss; lore found on their floors. (`Story: a voice and floor lore for all 24 bosses`)
- [ ] Flavour: item, unique and set flavour text, biome and variant blurbs, lore notes found in the dungeon, a journal to reread them.
- [ ] Sweep: consistent tone and names, no contradictions, every quest completable.

## Next up

Milestone 5, flavour. Much of it already landed with milestone 4's commit (it was written in the same session):
lore notes (`src/data/story/notes.ts`, 39 pages, found through `lore:search` from bookcases, chests and fallen
delvers, `src/ui/StoryPlaces.ts`), places (`src/data/story/places.ts`: first-sight cards, deep entries, ambient
lines), rare item flavour (`src/data/story/itemFlavor.ts`, shown by `Tooltip.ts`), and journal tabs Bosses, Notes
and Places. Still to do for milestone 5:
- Read every unique flavour (`src/data/uniques.ts`) and set blurb (`src/data/sets.ts`) against the premise; fix any
  that contradict it or use modern idiom (small text-only edits in depth's files).
- Read the biome and variant blurbs in `src/world/Biomes.ts` (`PLAIN(...)` and `blurb:`); fix tone (text only).
- Render once with `tools/shot-story.mjs` (port 4308, under `timeout`) and look at a boss line, a note card, the
  journal.
Then milestone 6: the sweep, starting with the old `src/data/lore.ts`, which names boss and monster ids that do not
exist.

## Notes for resume

- Done: the two raw font sizes in `story.css` hud asked about now scale with `--text-scale`.
- Bosses: voices in `src/data/story/bossVoices.ts`, spoken by `src/ui/StoryBosses.ts`. `Boss.ts` no longer toasts its
  intro or phase barks (the toast clipped long lines); the intro is narrated as a subtitle and later barks are spoken.
  The checker requires a voice for every `BOSSES` entry, so a new boss from combat fails `check-story` until written.
- `depth:changed` carries `bossId` on boss floors; `lore:search` (Events.ts) is the hook for finding pages.

- The premise is written at the top of `src/data/story/premise.ts`. Read it before writing anything: the Tenant,
  the layers, the delvers as the lid, Stairhead. Chapters reveal once per account on reaching their tier; past
  tier 100 the Deep Ledger generates an entry every 20 tiers, deterministically.
- Story state is `AccountSave.story` (`StorySave` in `src/types.ts`). It is optional; `ensureStory()` in
  `src/sim/Story.ts` is the migration and runs on every access. `Save.ts` needs no change.
- `src/ui/StoryOverlay.ts` holds `installStory()` (called once from `main.ts`), spoken lines (`say`) and cards
  (`showCard`). `src/ui/JournalPanel.ts` is the journal (J; was a duplicate of L). Other modules add tabs with
  `addJournalSection`.
- Styles are in `src/ui/story.css`, built only from the tokens in `styles.css`.
- Checker: `node tools/check-story.mjs` (entry `tools/story-entry.ts`). Extend it with every milestone.
- People: `src/data/story/npcs.ts`. Dialogue box `src/ui/DialoguePanel.ts` (panel `dialogue`). TownScene calls
  `openDialogueFor(best.id)` before opening a station, and pushes `storyTalkSpots(spots)` for Renn, the Listener,
  Gilder and Wenna (positions in `TALK_SPOTS`, overridden by `npcSpots[<id>]` if world names them). E twice at a
  keeper opens their trade. `tools/check-story.mjs` checks these hooks by name.
- Contracts: `src/data/story/chains.ts` (9 chains, 32 steps), runtime `src/sim/Chains.ts`, UI
  `src/ui/StoryContracts.ts`. A taken step steers the next descent at or past its tier through `setRunDirector` in
  `src/world/DungeonGen.ts` (biome, quest, boss). Step quests have ids `story.<chain>.<n>`; `questById` in
  `src/data/quests.ts` builds their definitions (weight 0, never in the random pool). Chest objectives are banned:
  some layouts produce floors with no chest. The checker generates 8 runs per step and counts what is on the floors.
- `installStory()` also sets `window.SLAY_STORY` (`say`, `showCard`, `talk(npcId)`, `journal(tab)`) for render
  tools. No story render has been taken yet: before or during milestone 4, write `tools/shot-story.mjs` (copy the
  boot and `town` driver from `tools/screenshot.mjs`, port 4308) to screenshot a conversation with Renn, an offer,
  and the journal, and look at the PNGs.
- Text style: no em dashes in new writing, no curly quotes in data (the UI adds them), tokens `{name}` etc. only.
