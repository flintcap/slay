# Stream: story (lore, quests, characters)

Status: in progress

## Milestones

- [x] The why: a central premise for the descent, revealed in pieces as you go deeper, with a payoff at depth milestones. (`Story: the premise of the descent, chapters and the journal`)
- [ ] Town NPCs: each has a name, a voice, a few lines of dialogue that change with your progress, and a reason to talk to them.
- [ ] Quest lines: hand-written quest chains that send you to specific depths and biomes, with rewards and short story beats.
- [ ] Bosses with personality: an intro line, a taunt mid-fight, and a death line for every boss; lore found on their floors.
- [ ] Flavour: item, unique and set flavour text, biome and variant blurbs, lore notes found in the dungeon, a journal to reread them.
- [ ] Sweep: consistent tone and names, no contradictions, every quest completable.

## Next up

Milestone 2, town NPCs. Plan, already decided:
- New `src/data/story/npcs.ts`: nine people (`NpcId` in `src/data/story/types.ts`): Hesk (vendor), Ordrun Kale
  (blacksmith), Sister Vell (alchemist), Corvane (stash), Old Marrow (memorial), Captain Ilsa Renn, the Listener,
  Gilder Hain, Wenna Torr. The last four are talk-only and stand at the camp figures in `src/world/Town.ts`
  (gate pair at (2.0,-14.4) and (-1.2,-14.6), fire pair at (-3.6,4.4) and (3.4,4.8)).
- Lines and topics use `When` conditions read by `holds()` in `src/sim/Story.ts`.
- New `src/ui/DialoguePanel.ts` registered in `UIRoot.ts` as panel `dialogue`. Hook in `TownScene.ts`: on interact,
  `if (!openDialogueFor(best.id)) events.emit('ui:open', ...)`, and push talk-only spots into `interactables`.

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
- Text style: no em dashes in new writing, no curly quotes in data (the UI adds them), tokens `{name}` etc. only.
