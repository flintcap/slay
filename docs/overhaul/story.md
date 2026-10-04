# Stream: story (lore, quests, characters)

Status: in progress

## Milestones

- [x] The why: a central premise for the descent, revealed in pieces as you go deeper, with a payoff at depth milestones. (`Story: the premise of the descent, chapters and the journal`)
- [x] Town NPCs: each has a name, a voice, a few lines of dialogue that change with your progress, and a reason to talk to them. (`Story: the people of Stairhead, and talking to them`)
- [ ] Quest lines: hand-written quest chains that send you to specific depths and biomes, with rewards and short story beats.
- [ ] Bosses with personality: an intro line, a taunt mid-fight, and a death line for every boss; lore found on their floors.
- [ ] Flavour: item, unique and set flavour text, biome and variant blurbs, lore notes found in the dungeon, a journal to reread them.
- [ ] Sweep: consistent tone and names, no contradictions, every quest completable.

## Next up

Milestone 3, quest chains. Plan, already decided:
- New `src/data/story/chains.ts`: nine chains, one per person, 3 to 5 steps each (`ChainDef`/`ChainStep` in
  `src/data/story/types.ts`). Each step has a giver, a tier, a biome, optionally a boss, fixed objectives, an offer,
  a hand-in speech and a reward. Use only objective kinds the dungeon really counts: `slay` (any, family:x, rank:x),
  `slayElite`, `cleanse` with `prop:shrine` or `prop:chest`, `boss` with `boss:<id>`, `survive` with `zone:any`.
- Chain progress lives in `StorySave.chains`; register readers with `setChainReaders()` so `When.done/active` work.
- An accepted step drives the next run at or past its tier: additive hook in `src/world/DungeonGen.ts`
  (`setRunDirector`) that can choose the biome, the quest instance and the boss. Build the quest with
  `instantiateQuest` from `src/sim/Quests.ts`; make `questById` in `src/data/quests.ts` find chain steps too.
- Mark a step ready on `quest:complete`; hand it in through the dialogue (`addDialogueOptions`,
  `addNewsCheck` in `src/ui/DialoguePanel.ts`). Add a Contracts tab to the journal.
- Extend `tools/story-entry.ts`: every step's biome, boss and families exist at its tier, and generated runs
  with the director installed actually contain enough monsters, shrines and chests to finish it.

## Notes for resume

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
- Text style: no em dashes in new writing, no curly quotes in data (the UI adds them), tokens `{name}` etc. only.
