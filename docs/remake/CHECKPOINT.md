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
- Each unique and set item has its own fixed lines. They never change.
- Uniques and sets stay at their own item level. No scaling with depth.

## Done

- Phase 0a (9e197d4), 0b (b4b0437), 0c (bd9bd6f) pushed.
- Phase 0c full check run was stopped (too long). Typecheck clean. Not fully re-run.
- #95 monsters: plain attacks tagged `basic`, new `basic_shot`, rest of 2.5-4.5 s
  between special moves (not bosses or wardens), 125 lists trimmed, 5 channels left,
  plain fighters swing 15% faster. check-readable passes.

- #94 runes: 24 runes in 4 veins x 6 cuts, 27 runewords by vein order, power by
  cut, old ids remapped on load, loot filter by cut, recipe list in the Legacy
  codex. check-names passes.
- #96 items (src/sim/Loot.ts): rares roll 4 to 8 lines (4 a side).
- #97 uniques and sets: fixed extra lines per item in src/data/extraLines.ts
  (550 items, 1992 lines; set 2-3, unique 3-5, mythic 4-5, ancient 5-6).
  Items keep their own item level. Set pieces still lifted to 7 rare lines at
  their own level. Unique avg 7.6 lines, 2.6x a rare (mythic 2.9x, ancient
  4.6x; 12 uniques under 1.5x). setpower and uniques checks pass.
- #98 attack rating is live (owner said turn it on). Weapon blows (melee,
  heavy, bow/crossbow arrows; physical only) roll `hitChance(AR, guard)` in
  SkillRunner.lands. Guard = `Enemy.guard()`: usual hero AR at the monster's
  level x sqrt(live defense / depth-curve defense). Even odds 92%, half 82%,
  2x 97%, 5x 100%, floor 60%. Spells, beams, chains, minions, procs, vigils
  and veiled blows always land. MISS word shown. Tooltip shows hit chances.

## In progress

1. #93 Phase 0d bugs (list in the plan doc, Claude Docs project a47249ba).

## Next

- Owner may want a weapon damage bump to make up for misses (asked, not done).
