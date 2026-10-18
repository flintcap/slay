# Checkpoint

Where the work stands, so a paused or new session can pick up exactly here.
Update this file and push it after every finished step.

## Owner rules for this stretch

- Steam work goes in the last phase.
- Drops stay random, never class leaning.
- Runes and runewords are our own, not a D2 copy.
- Few monster windups and channels. Every monster ability has a cooldown.
  Many monsters use only plain melee or ranged attacks.
- Death is permanent. No standard mode.
- Tests: only what is critical. One retry, then skip and note it. A few minutes at most.
- Uniques and sets must be far stronger than rares, with many more stats.

## Done

- Phase 0a (9e197d4), 0b (b4b0437), 0c (bd9bd6f) pushed.
- Phase 0c full check run was stopped (too long). Typecheck clean. Not fully re-run.
- #95 monsters: plain attacks tagged `basic`, new `basic_shot`, rest of 2.5-4.5 s
  between special moves (not bosses or wardens), 125 lists trimmed, 5 channels left,
  plain fighters swing 15% faster. check-readable passes.

- #96 items (src/sim/Loot.ts): rares roll 4 to 8 lines (4 a side). Uniques and
  sets grow with depth, are lifted to a floor (unique 7, mythic 10, ancient 14,
  set 7 rare lines) and roll extra open-pool lines (set 2-3, unique 3-5,
  mythic 4-5, ancient 5-6). Unique avg 7.4 lines, 2.4x a rare. setpower and
  economy checks pass.

## In progress

1. #94 Own runes. Done so far (committed): new rune data and runewords in
   src/data/gems.ts, matching by vein, power by cut, old ids remapped in
   src/core/Save.ts, loot filter by cut, rune icons for 24 runes, tools fixed.
   Left: recipe list in the Legacy codex (src/ui/LegacyPanel.ts), run
   check-names once, then mark #94 done.

## Next

2. #94 Own runes design: 4 veins (Ember, Rime, Marrow, Umbra) x 6 cuts = 24 runes.
   Runewords match the vein order, not exact runes; power grows with rune cut.
   Old ids rune.el..rune.zod map to new ids on load (src/core/Save.ts item()).
   Recipe list in the Legacy codex.
4. #93 Phase 0d bugs (list in the plan doc).
5. Attack rating question for the owner (wire hit chance or remove the stat).
