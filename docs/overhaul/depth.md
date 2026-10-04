# Stream: depth (systems and content)

Status: paused

## Milestones

- [x] Itemisation: more affixes and tiers, uniques with signature effects, item sets, and a loot filter.
      Commit: "Make every unique's power real, add power affixes, set powers and a loot filter"
- [x] Progression across runs: a meta progression track and unlocks so every run moves you forward.
      Commit: "Legacy: renown, perks, unlocks and a codex that survive every death"
- [ ] Dungeon events: cursed chests, ambushes, treasure runners, shrines with choices. (Elite affixes and mini-bosses moved to the combat stream.)
- [ ] Town systems: crafting or enchanting, a gambling vendor, a bounty board with rewards.
- [ ] Run variety: depth milestones with rewards, more run modifiers, reasons to push deeper.
- [ ] Balance: headless simulations confirm every class can clear early depths and scale; sweep.

## Next up

Milestone 3, dungeon events. Code is WRITTEN and WIRED but switched OFF by
`EVENTS_ENABLED = false` in `src/world/DungeonGen.ts` (no event props are
placed, so nothing new is reachable). Already done:

- `DungeonGen.placeEvents` (behind the flag): cursed chest (`chest` prop,
  interact `chest.cursed`), fallen adventurer (`bonepile`, `corpse.ambush`),
  shrine of choices (`shrine`, `shrine.choice`), treasure runner (recorded in
  the new `DungeonLevel.events` list). Rates in `EVENT_RATES`.
- `src/scenes/RunEvents.ts`: runs all four (waves with a 45s timer for the
  cursed chest, ambush pack with a guaranteed-rare carrier, bargains, the
  fleeing Hoarder driven by `motionOverride` dashes with `ai = null`).
- `src/data/boons.ts`: boon statuses via `registerStatus` + `BARGAINS`.
- `src/ui/ChoicePanel.ts`, exposed as `offerChoice()` from `src/ui/DepthUI.ts`.
- DungeonScene wiring (additive): `dungeonEvents` constructed in `enter`,
  `onLevel()` in `loadLevel`, `interact()` in `tickInteractables` after the
  lever check, `RunEvents.prompt` in `promptFor`, `update`, `onKill` in
  `reapDead`, `dispose`. Renown via `RunDirector.award`.

To finish milestone 3:
1. Write `tools/events-entry.ts` + `tools/check-events.mjs` (use
   `tools/depth-ssr.mjs`; install the real catalogue with `setMonsterCatalog`
   as `tools/legacy-entry.ts` does). Make placement forceable for the checker
   and check: rates per floor sane, every event tile has all 8 neighbours
   floor, is at least 6 tiles from stairs, never on a spawn or prop, boss
   floors have none, every `BARGAINS[].status` resolves via `getStatus`.
2. Flip `EVENTS_ENABLED` to true.
3. `npm run build && SLAY_PORT=4306 node tools/smoke-depth.mjs` in the
   background (boot takes 10+ minutes under software rendering). Extend the
   smoke to use an event prop (`scene.mesh.interactables` kind `chest.cursed`
   / `shrine.choice`) and confirm a runner spawns. The smoke has never
   completed yet, so milestones 1 and 2 have headless verification only.
   Do not `pkill -f` with a pattern that matches your own shell command.
4. Checkpoint (tick milestone 3 here).

Then milestone 4 (town systems): gambler, enchanter, bounty board, each gated
by `hasUnlock(save.account, 'gambler' | 'enchanter' | 'bounties')`. Add town
interactables additively to the `interactables` array in
`src/scenes/TownScene.ts` (world-owned: additive lines only) opening panels
registered in `src/ui/DepthUI.ts`. Enchanter: reforge one affix (D4 rule:
only that mod may be reforged again; store `Item.enchantedMod?`) or imbue a
power affix on a rare via `rollPowerAffix(..., force=true)`. Bounties live on
the character (`Character.bounties?`, migrate in `repairCharacter`).

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
- **Legacy** (`src/sim/Legacy.ts`): renown is fractional (a normal kill is
  ~0.15). Curve tuned by `tools/check-legacy.mjs` from real generated runs:
  a cleared first run is rank 1, rank 5 by about run 5, rank ~44 by run 40.
  Unlock ranks: bounties 2, gambler 3, enchanter 5, waypoints 7, pacts 9,
  stash tab 12, perk cap 20. The town services for milestone 4 must check
  `hasUnlock(save.account, id)`.
- `RunDirector` is created in `DungeonScene.enter`; it is the place to add any
  "this moment is worth something" rule (events, bounties, milestones).
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
(none yet)

### Request from quality
- `node tools/check-openness.mjs` fails: cathedral 59.6%, halls 29.6% and rooms
  25.1% of floor is "wide open" (two clear tiles every way; the limit is 25%).
  Arena, terraces and ruins were fixed this way before (see commit 90a8fbe).
  Either break those layouts up, or if the cathedral is meant to be one hall,
  say so in the checker with a per-layout limit.
