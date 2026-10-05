# Stream: story (lore, quests, characters)

Status: in progress

## Milestones

- [x] The why: a central premise for the descent, revealed in pieces as you go deeper, with a payoff at depth milestones. (`Story: the premise of the descent, chapters and the journal`)
- [x] Town NPCs: each has a name, a voice, a few lines of dialogue that change with your progress, and a reason to talk to them. (`Story: the people of Stairhead, and talking to them`)
- [x] Quest lines: hand-written quest chains that send you to specific depths and biomes, with rewards and short story beats. (`Story: contracts, nine hand-written quest lines`)
- [x] Bosses with personality: an intro line, a taunt mid-fight, and a death line for every boss; lore found on their floors. (`Story: a voice and floor lore for all 24 bosses`)
- [x] Flavour: item, unique and set flavour text, biome and variant blurbs, lore notes found in the dungeon, a journal to reread them. (`Story: flavour, one name per layer, uniques renamed into the world`)
- [ ] Sweep: consistent tone and names, no contradictions, every quest completable.

## Next up

Milestone 6, the sweep. Already done in the milestone 5 commit:
- `src/data/lore.ts` cut down to what the game reads (`pickLine`, `QUEST_LORE`/`questLore`, `NAMED_ELITES`); the
  dead tables that named missing bosses, monsters and townsfolk are gone. 14 quests have their own lore now.
- Quest whispers were never shown; `sim/Quests.ts` now emits `story:line` as an objective falls, and
  `StoryOverlay.ts` speaks it.
- Fixed: Hesk's eleven expeditions (nine were chartered), the Third Watch's eleven guards (six of the watch), the
  Herald's roll striking all nine of the Third (Gilder and Ashka are alive), dashes in quest text, a "difficulty
  setting" line.
Still to do: read every line of `npcs.ts`, `chains.ts`, `premise.ts` once more against `bossVoices.ts`, `notes.ts`
and `places.ts` for contradictions (dates: Caul nine hundred years, the Works four hundred, the Spire and the
Archive a thousand); look at the render from `tools/shot-story.mjs`; then set `Status: done`.

## Notes for resume

- Done: the two raw font sizes in `story.css` hud asked about now scale with `--text-scale`.
- Bosses: voices in `src/data/story/bossVoices.ts`, spoken by `src/ui/StoryBosses.ts`. `Boss.ts` no longer toasts its
  intro or phase barks (the toast clipped long lines); the intro is narrated as a subtitle and later barks are spoken.
  The checker requires a voice for every `BOSSES` entry, so a new boss from combat fails `check-story` until written.
- `depth:changed` carries `bossId` on boss floors; `lore:search` (Events.ts) is the hook for finding pages;
  `story:line` speaks a narrated line from anywhere.
- Unique and set names, flavour and hook wording live in `src/data/story/uniqueText.ts` and are applied by one line
  each in `uniques.ts` and `sets.ts`. The old names were Diablo II's (Stone of Jordan, Tyrael's Might, Windforce and
  the rest); every one is now a name from this world. Items already in a save keep the name they dropped with.
  The checker fails if a unique or set has no entry, or two items share a name.
- One name per layer: the biome names in `world/Biomes.ts` now match `places.ts` (The Ossuary Tiers, The Root Deeps,
  The Cindergate Works, The Drowned Sanctum, The Chitin Warrens, The Rime Archive, The Cinderfields, The Hollow
  Spire). The checker holds them together.

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
