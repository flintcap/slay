# Stream: story (lore, quests, characters)

Status: done

## Milestones

- [x] The why: a central premise for the descent, revealed in pieces as you go deeper, with a payoff at depth milestones. (`Story: the premise of the descent, chapters and the journal`)
- [x] Town NPCs: each has a name, a voice, a few lines of dialogue that change with your progress, and a reason to talk to them. (`Story: the people of Stairhead, and talking to them`)
- [x] Quest lines: hand-written quest chains that send you to specific depths and biomes, with rewards and short story beats. (`Story: contracts, nine hand-written quest lines`)
- [x] Bosses with personality: an intro line, a taunt mid-fight, and a death line for every boss; lore found on their floors. (`Story: a voice and floor lore for all 24 bosses`)
- [x] Flavour: item, unique and set flavour text, biome and variant blurbs, lore notes found in the dungeon, a journal to reread them. (`Story: flavour, one name per layer, uniques renamed into the world`)
- [x] Sweep: consistent tone and names, no contradictions, every quest completable. (`Story: sweep done; journal fits its tabs, subtitles clear the buffs, key hints follow rebinding`)

## Next up

All six milestones are done. Nothing is queued. If more story work is wanted later:
- Optional: rename uniques already sitting in old saves to their new names (quality owns `Save.ts`; the map from old
  to new names would come from `src/data/story/uniqueText.ts`).
- A new boss from combat needs a voice in `src/data/story/bossVoices.ts` or `check-story` fails (by design).
- Canon dates to keep: Caul paid rent nine hundred years and fell about four hundred years ago; the Works have run
  four hundred years since; Calix's last authorised entry (611 years) predates the fall; the Spire has worked loose
  for a thousand years; Gilder left Ferris on the sixth eleven years ago; Renn has kept the roster nineteen years.

## Notes for resume

- Story renders: `node tools/shot-story.mjs --lab --out=shots/story --shots=talk,offer,journal,card,note,boss,bossfloor`
  mounts the real story UI on the UI lab's painted stand-in (`tools/storylab.html`, `tools/storylab-entry.ts`), no
  WebGL, and takes under a minute. The full-game render (no `--lab`) never finished on this machine: it timed out
  before boot at 40 minutes with two other renders running (load 15). The `journal` shot takes one picture per tab
  and seeds chapters, notes, places and bosses into the in-memory save first.
- Sweep render fixes: the journal tab row no longer widens the panel past its frame (the page text and contract cards
  were clipped on the right, and Places was cut off); the first tab is now "Chapters"; subtitles sit above the buff
  strip and the interact prompt (they were drawn over the buffs); cards start at 116px so they clear the boss bar's
  phase marks; card footers and dialogue key numbers moved from ink-4 to ink-3 for contrast.
- Key hints follow rebinding: dialogue option numbers show the key bound to Skill 1-9, the card footer shows the
  journal key, and the empty People page names the interact key. `check-story` holds all three.

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
