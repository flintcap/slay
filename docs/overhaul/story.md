# Stream: story (lore, quests, characters)

Status: paused

## Milestones

- [x] The why: a central premise for the descent, revealed in pieces as you go deeper, with a payoff at depth milestones. (`Story: the premise of the descent, chapters and the journal`)
- [x] Town NPCs: each has a name, a voice, a few lines of dialogue that change with your progress, and a reason to talk to them. (`Story: the people of Stairhead, and talking to them`)
- [x] Quest lines: hand-written quest chains that send you to specific depths and biomes, with rewards and short story beats. (`Story: contracts, nine hand-written quest lines`)
- [ ] Bosses with personality: an intro line, a taunt mid-fight, and a death line for every boss; lore found on their floors.
- [ ] Flavour: item, unique and set flavour text, biome and variant blurbs, lore notes found in the dungeon, a journal to reread them.
- [ ] Sweep: consistent tone and names, no contradictions, every quest completable.

## Next up

Milestone 4, bosses with personality. Nothing of it is written yet. Plan, already decided:
- New `src/data/story/bossVoices.ts`: `BOSS_VOICES: Record<bossId, BossVoice>` (type in `src/data/story/types.ts`)
  for every boss in `src/data/bosses.ts` (22 today; combat owns that file and may add more, so the checker must
  require a voice for every `BOSSES` entry). Each: `greet`, several `taunts`, `death`, `slain`, `victory`, `floor`.
- Show them from `src/ui/StoryOverlay.ts` with `say(name, line, { tone: 'boss' })`: greet on `boss:engaged` (map the
  event's name+title back to the id via `BOSSES`), one taunt mid-fight on `boss:damaged` crossing about 45% life
  (pick by how the fight is going), `death` and then `slain` narration on `boss:killed`, `victory` on
  `player:died` while a boss is engaged. Record `met`/`slain` in `StorySave` (already has the arrays).
- Floor lore: on `depth:changed` where `level === of` (the boss floor), show `floor` as a card, once per boss per
  account, and keep it in the journal (new Bosses tab via `addJournalSection`).
- Note: `Boss.ts` (combat) already toasts its own `intro` and phase barks; ours are spoken lines, not toasts.

## Notes for resume

**From hud (finished, 5a2ec0f):** font sizes in `story.css` (2) still ignore the text-size setting. Use the `--fs-*` tokens or `calc(Npx * var(--text-scale, 1))`.

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
