# Stream: depth (systems and content)

Status: in progress

## Milestones

- [x] Itemisation: more affixes and tiers, uniques with signature effects, item sets, and a loot filter.
      Commit: "Make every unique's power real, add power affixes, set powers and a loot filter"
- [x] Progression across runs: a meta progression track and unlocks so every run moves you forward.
      Commit: "Legacy: renown, perks, unlocks and a codex that survive every death"
- [x] Dungeon events: cursed chests, ambushes, treasure runners, shrines with choices. (Elite affixes and mini-bosses moved to the combat stream.)
      Commit: "Dungeon events, town services, real run modifiers, milestones and an economy sweep"
- [x] Town systems: crafting or enchanting, a gambling vendor, a bounty board with rewards.
      Commit: same as above.
- [x] Run variety: depth milestones with rewards, more run modifiers, reasons to push deeper.
      Commit: same as above.
- [x] Balance: headless simulations confirm every class can clear early depths and scale; sweep.
      Commit: same as above. Systems half only (economy, level curve, loot by depth:
      `tools/check-economy.mjs`). The fight half (class against depth) is the combat
      stream's milestone 6, which owns the combat sim now.

## Next up

All six milestones are ticked on headless proof (the checkers below all pass
at commit "Dungeon events, town services, real run modifiers, milestones and
an economy sweep"). The one thing NOT yet seen in a live browser is milestones
3 to 5: the extended smoke was stopped by the pause mid-run (it had passed
boot and was inside its first `page.evaluate`, ~25 minutes in).

To resume, in order:

1. `npm run build && SLAY_PORT=4306 node tools/smoke-depth.mjs` alone, in
   the background (allow 40 to 60 minutes under software rendering; it now
   waits on conditions, not frame counts). It checks item powers, the loot
   filter, renown, a fallen adventurer's ambush, a shrine bargain through the
   real choice panel, the treasure runner, the run-modifier strip, the three
   camp stations and their panels, and the gate's waypoint panel, and writes
   screenshots to `shots/depth/` (dungeon.png, town-gambler.png,
   town-enchanter.png, town-bounties.png, panel-bounties.png, gate.png). Look
   at them. Stop it by PID, never with `pkill -f` on a pattern your own shell
   matches.
2. If a station sits badly in camp, move it in `STATIONS`
   (`src/scenes/TownStations.ts`): gambler's table east at x 16.4, z 1;
   enchanter's lectern west at x -13.6, z -0.8 (it sat inside the broken cart at x -17); bounty board at x 5, z -10.5.
3. When combat's class-vs-depth harness (their milestone 6) lands, read its
   numbers next to `tools/check-economy.mjs` and retune gear scaling if a class
   is walled (make the class stronger; never monsters weaker or fewer).

## Checkers (all headless, run alone, about a minute each)

- `node tools/check-events.mjs` — event placement, rates, chest/altar/shrine
  guarantees, every generated quest finishable, live RunEvents (cursed chest
  won and lost, fallen adventurer, every bargain, the runner caught and lost).
- `node tools/check-town.mjs` — saves, gambler odds and edge, enchanter rules,
  bounty board through a real RunDirector, wiring.
- `node tools/check-runmods.mjs` — every run modifier does something, danger
  pays, milestones, waypoints, pacts, wiring.
- `node tools/check-economy.mjs` — gold per descent against camp prices, level
  curve against monster level, loot value by depth, for all six classes.
- `node tools/check-items.mjs`, `node tools/check-legacy.mjs` — milestones 1 and 2.
- `npm run build && SLAY_PORT=4306 node tools/smoke-depth.mjs` — the live game
  (slow; see notes).

## Notes for resume

**From hud (finished, 5a2ec0f):** font sizes in `depth.css` (1) still ignore the text-size setting. Use the `--fs-*` tokens or `calc(Npx * var(--text-scale, 1))`.

**Requests answered this session:**
- Story: "collect" and "reach" objectives now count. `src/scenes/QuestTokens.ts`
  says what each moment is worth: relics from chests (1), the quest altar (2),
  elites/rares (1) and the boss (2); corpse-keys from champions and up;
  `marker:bottom` on reaching the run's last floor, `marker:altar` at the quest
  altar (the reliquary), `marker:exit` on every down stair. The generated
  quests' filters were made exact (`item:relic`, `item:key`, `marker:*`,
  cleanse is `prop:shrine` so smashing barrels no longer "cleanses shrines").
  The escort quest got a second objective (reach the bottom) because an
  escort-only quest could never complete. `tools/check-events.mjs` drives every
  generated quest to completion through the same calls DungeonScene makes.
- Story: every floor now has a plain chest. `DungeonGen.ensureInteractables`
  plants one when room roles or prop placement left none (open ground, then a
  dead end, then a corridor on a loop that blocking cannot cut, then a barrel
  turned into a chest). It does the same for the quest altar a collect quest
  owes and for enough shrines for a cleanse quest.
- Quality (openness): cathedral is a per-layout limit (0.65) in
  `tools/check-openness.mjs`, with the owner's reason. Rooms and halls got
  pillars in their big rooms (`colonnade` in `src/world/Layouts.ts`).

**Requests for other streams (logged, not done by depth):**
- combat: no buff on the player ever reached the stat sheet. `Player.status`
  was a private `StatusContainer('player')` and `computeStats` looks statuses
  up by character id. Depth added two lines to `Player.ts` (`adoptStatuses` in
  the constructor, `releaseAdopted` in dispose; new exports in `Status.ts`), so
  shrine blessings, boons, tonics and run statuses now count. Combat may want to
  check nothing double-counts (a slow status that also slows in movement code).
- world: `src/scenes/TownStations.ts` puts three small stations in camp
  (gambler's table east at x 16.4, enchanter's lectern west at x -13.6, bounty
  board by the gate path at x 5, z -10.5) and adds their colliders to
  `town.colliders`. If the camp layout moves, move `STATIONS`. TownScene got two
  small edits: `mountTownStations(...)` in `enter`, and `descend` now goes
  through `planDescent` (waypoints and pacts).
- hud: `src/ui/RunModStrip.ts` appends a row of modifier chips into
  `.hud-topleft` (under the depth header) while a run is on. Styles in
  `depth.css` (`.depth-mods`, `.depth-mod`). Restyle freely.
- menus: no new keys. The gate may now open a choice panel (waypoints, pacts).

**Systems added this session:**
- Dungeon events are ON (`EVENTS_ENABLED = true`). About 0.6 events per
  ordinary floor at depth 1, 1.1 at depth 5 to 20, 1.6 at depth 60.
  `forceEvents(true|false|null)` for checkers. `RunEvents` uses
  `ui/ChoiceSeam.ts` (DOM-free) for the shrine's offer, so it runs headless.
- Town services (`src/sim/TownServices.ts`, state on `Character.town`,
  repaired by `repairCharacter`; items carry `enchantedMod` and `enchants`):
  Gambler (rank 3), Enchanter (rank 5, reforge one mod D4-style, or imbue a
  rare with a power), Bounty Board (rank 2, three offers, hold two, progress
  through `RunDirector`). Panels `GamblerPanel`, `EnchanterPanel`,
  `BountyPanel`, registered in `DepthUI`.
- Run modifiers are real (`src/scenes/RunModifiers.ts`). Before this only
  Teeming, Warband and Legion did anything. Every modifier also grants
  "Spoils of Danger" (+8% magic and gold find per tier).
- Depth milestones (every 5th depth, first clear per account) pay gold,
  Renown and guaranteed uniques (sets on 10s, mythics on 25s) via
  `RunDirector.payMilestones`. Waypoints (rank 7) let a descent start at a
  claimed milestone; Pacts (rank 9) add a chosen modifier for +25% Renown.
  Both at the gate (`src/scenes/DescentPlanner.ts`). The Legacy panel lists
  milestones.
- Economy sweep (`tools/check-economy.mjs`): gamble, reforge and imbue prices
  were raised to track gold income (a gamble is 1-2k early, ~17k at level 34;
  ten to twenty a descent).
- The browser smoke (`tools/smoke-depth.mjs`) waits on conditions, not frame
  counts: under software rendering a frame takes seconds, and the fixed waits
  are why it never finished. It also screenshots camp stations into
  `shots/depth/`.

**Earlier sessions:**


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
