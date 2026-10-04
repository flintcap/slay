# Stream: depth (systems and content)

Status: in progress

## Milestones

- [x] Itemisation: more affixes and tiers, uniques with signature effects, item sets, and a loot filter.
      Commit: "Make every unique's power real, add power affixes, set powers and a loot filter"
- [ ] Progression across runs: a meta progression track and unlocks so every run moves you forward.
- [ ] Dungeon events: cursed chests, ambushes, treasure runners, shrines with choices. (Elite affixes and mini-bosses moved to the combat stream.)
- [ ] Town systems: crafting or enchanting, a gambling vendor, a bounty board with rewards.
- [ ] Run variety: depth milestones with rewards, more run modifiers, reasons to push deeper.
- [ ] Balance: headless simulations confirm every class can clear early depths and scale; sweep.

## Next up

Milestone 2, Legacy (meta progression). `src/sim/Legacy.ts` is written but NOT
wired yet (nothing imports it). To finish:

1. `main.ts`: `bindLegacyAccount(() => save.account)` after `save.load()`.
2. `Stats.computeStats`: call `applyLegacyStats(out)` next to `applyPowerStats`.
3. `Character.createCharacter`: call `legacyStartingBonus(c)` and add that many
   `potion.heal.minor` with `makeStartingItem`.
4. `Loot.vendorPrice(buying)`: multiply by `legacyPriceMultiplier()`;
   `Crafting.salvage`: multiply yields by `legacySalvageMultiplier()`.
5. A new `src/scenes/RunDirector.ts` owned by DungeonScene (same pattern as
   `PowerRuntime`): grants renown on kill (`grantKill`), floor change
   (`loadLevel`), run clear (`checkExit`), boss kill, quest complete, new
   best depth; records codex on `loot:pickedUp` for unique/set/mythic/ancient;
   bumps `legacy.stats`; toasts rank-ups and unlocks. Multiply kill XP in
   `grantKill` by `legacyXpMultiplier()`.
6. `src/ui/LegacyPanel.ts` (hotkey G) registered in `src/ui/DepthUI.ts`:
   renown bar, perk list with buy buttons, unlock list, codex counts, lifetime
   stats. `stashTab` unlock calls `save.addStashTab()` once.
7. Checker `tools/check-legacy.mjs` + `tools/legacy-entry.ts`: old saves get a
   legacy block, renown curve sane (first run reaches rank 1-2), every perk
   changes the sheet or its multiplier, unlocks fire at their rank.

## Notes for resume

- **Item powers** (`src/sim/ItemPowers.ts`): one table, 73 powers. A power has
  up to four parts: `passive` (folds into `PassiveEffects`, so it rides the
  combat hooks skills already use), `stats` (transforms the sheet at the end of
  `computeStats`), `runtime` (fills `PowerEffects`, read by
  `src/scenes/PowerRuntime.ts`), `affix` (can roll on magic/rare items).
  Sources: unique `special`, set bonus tier `power`, item `powers` array.
- `PowerRuntime` is constructed in `DungeonScene.enter` and hooks
  `Enemy.takeDamage` through `powerHooks` (two additive lines in Enemy.ts).
  It is also where **Life Steal and Mana Steal** are applied; before this
  nothing in the game read either stat.
- Unique tooltips now print the power's exact text (gold) instead of the
  `hook` line when a power exists. Hooks remain the fallback.
- Authored set bonuses (`data/sets.ts` `bonuses`) now reach the sheet via
  `Stats.setBonusStats`; the old generic curve only applies to unknown set ids.
  `SET_POWERS` in sets.ts attaches a signature power to one tier of each set.
- Tooltips show affix tier as `[T1]` (best rung of that ladder) via
  `Loot.affixTierRank`, and set progress `(2/4)` via `setTooltipWearer` (bound
  in main.ts).
- Loot filter: `src/sim/LootFilter.ts`, account field `lootFilter`, panel
  `src/ui/LootFilterPanel.ts` (hotkey O). DungeonScene marks filtered drops
  `hidden`; Shift shows them. Uniques and better always show.
- New panels go through `src/ui/DepthUI.ts` and `registerPanel` (UIRoot).
  Styles in `src/ui/depth.css`, tokens only.
- Checkers: `node tools/check-items.mjs` (headless, ~1 min) proves every power
  fires, sets apply, power affixes and every rarity drop, filter works.
  `npm run build && SLAY_PORT=4306 node tools/smoke-depth.mjs` boots the real
  game and drives hits through the live runtime (slow: many minutes).
- Requests for other streams (logged, not done by depth):
  - feel: `SkillRunner.afterHit` returns early unless `arcChance` or
    `conductSharePct` > 0, so crit riders, Flurry stacks and minion leech never
    run for most characters. Also `tune` returns before Retribution is applied
    whenever a crit or multiplier changed the packet.
  - feel: DungeonScene `flurryIdle` is never reset on a hit, so Flurry stacks
    are wiped every 2 seconds regardless.
  - menus: O opens the Loot Filter; please list it in any controls help.
  - combat: `enemy:killed` is emitted twice per kill (Enemy.die and
    DungeonScene.grantKill) with different `id` meanings.
