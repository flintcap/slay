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

## In progress

1. #95 Fewer monster windups and channels.
   - Tag basic attacks `basic` in src/entities/Abilities.ts.
   - New `basic_shot` ability; Enemy auto-adds it for ranged monsters with no basic shot.
   - AI rest between specials for non-boss monsters (src/entities/AI.ts chooseAbility).
   - Trim lists in src/data/monsters.ts. Channels kept only on watcher_eye,
     chaos_maw, storm_djinn, glacier_titan, unmaker.
   - Boss-only entries untouched (mirror_image, hero_echo, choir_high_voice,
     sallow_orrin, slag_cantor, tallow_sheep, wax_child, arcane_sentry_totem).

## Next

2. #96 Stronger uniques and sets (more affixes, natural rolls, no low caps).
3. #94 Own runes: 4 veins (Ember, Rime, Marrow, Umbra) x 6 cuts = 24 runes.
   Runewords match the vein order, not exact runes; power grows with rune cut.
   Old ids rune.el..rune.zod map to new ids on load (src/core/Save.ts item()).
   Recipe list in the Legacy codex.
4. #93 Phase 0d bugs (list in the plan doc).
5. Attack rating question for the owner (wire hit chance or remove the stat).
