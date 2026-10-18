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

- #94 runes: 24 runes in 4 veins x 6 cuts, 27 runewords by vein order, power by
  cut, old ids remapped on load, loot filter by cut, recipe list in the Legacy
  codex. check-names passes.
- #96 items (src/sim/Loot.ts): rares roll 4 to 8 lines (4 a side). Uniques and
  sets grow with depth, are lifted to a floor (unique 7, mythic 10, ancient 14,
  set 7 rare lines) and roll extra open-pool lines (set 2-3, unique 3-5,
  mythic 4-5, ancient 5-6). Unique avg 7.4 lines, 2.4x a rare. setpower and
  economy checks pass.

## In progress

1. #93 Phase 0d bugs (list in the plan doc, Claude Docs project a47249ba).

## Next

5. Attack rating question for the owner (wire hit chance or remove the stat).
