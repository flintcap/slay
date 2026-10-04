# Stream: depth (systems and content)

Status: in progress

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

Milestone 3, dungeon events. Plan (nothing written yet):

1. `DungeonGen.ts`: after `placeProps`, a `placeEvents(level, depth, rng.fork('events'))`
   step appends event props on free walkable tiles of `normal` rooms, away from
   spawns, stairs and other props: `chest` with interact `chest.cursed`,
   `bonepile` with `corpse.ambush`, `shrine` with `shrine.choice`; and records a
   treasure runner in a new optional `DungeonLevel.events` list.
2. New `src/scenes/RunEvents.ts` owned by DungeonScene (pattern of
   `PowerRuntime`): `interact(it)` returns true when it handled an event prop
   (call it in `tickInteractables` before the vault check), `update(dt)`,
   `onKill(enemy)`, `onLevel()` to spawn the runner.
   - Cursed chest: opening seals it and spawns two waves of champions/elites
     around it; kill them inside 40s and it opens with boss-rank loot, else it
     crumbles to dust.
   - Fallen adventurer: loot a bone pile, then an ambush pack steps out of the
     dark all around you; killing it drops a guaranteed rare.
   - Treasure runner ("the Hoarder"): a named rare with `ai = null`, driven by
     `motionOverride` dashes away from the player, dropping coins; escapes 30s
     after it sees you. Kill it for a gold fountain, 3-5 items, materials.
   - Shrine of choices: a small chooser panel (`src/ui/ChoicePanel.ts`) offers
     three bargains (boon with a cost). Boons are statuses registered at runtime
     with `registerStatus` from a new `src/data/boons.ts`, so the HUD shows them.
3. Renown for completing each event via `RunDirector`.
4. Checker `tools/check-events.mjs`: events are placed at sane rates on
   walkable, unblocked tiles, never on stairs; each boon status resolves.

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
