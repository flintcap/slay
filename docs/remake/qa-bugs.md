# Stream: qa-bugs (quality pass 2: does everything work)

Status: in progress

Goal: after the remake, every part of the game works end to end with no
errors, no soft-locks and nothing broken on screen. Fix what you find.

## Milestones

- [x] Checker sweep. Run every headless checker in `tools/` (one at a time,
  each under `timeout`). List pass/fail under "Results". Fix every failure
  that is a real bug. Delete or update any checker that tests code that no
  longer exists. Typecheck clean, build clean.
  (`qa-bugs: checker sweep, class tour, balance` checkpoint)
- [ ] Full flow, each class. For each of the six classes, one browser run
  (one class per run): title, create character, town, talk to an NPC, open
  every panel, take the portal, clear into the second zone, use every
  hotbar skill, pick up loot, equip it, use a waypoint home, return. Watch
  for console errors, soft-locks, stuck UI and missing art. Fix them.
- [ ] Boss and map end. Reach and kill a map's boss (debug helpers are fine),
  see the arena gate, the boss phases, the reward, the portal home, and that
  the next portal opens a fresh map. Death and respawn work. Save and reload
  mid-map works (old saves too).
- [ ] Text and UI leftovers. Any text that still talks about stairs, floors
  or depth where the new map flow means zones, maps and tiers. Tooltips and
  HUD read right with the new items and maps. Do not restyle the HUD or menus.
  (text fixes committed; still to check by eye in a render)
- [x] Balance check (owner's rule: make classes stronger, never make monsters
  weaker or fewer). `check-curve` fails 8 of 30 at deep tiers 12 and 40.
  Find why. If the fix is making classes stronger (scaling, skills, passives),
  do it and show the curve passes. If it needs anything else, write it under
  "Results" for the owner instead of changing it.
  (classes stronger plus the owner-approved reflect fix: 1 of 30 left, an
  "untouched" revenant at tier 5; see Results)
- [x] Owner's play bugs (do first). (1) Shadowblade dual wield: with two
  weapons the off hand must really attack, in the game logic and in the
  animation, and its weapon must really deal damage. (2) Coat Blades does
  nothing: no Poisoned on hit, no green marker, no extra damage; check Viper
  Strike and the rest of the Venom tree too. (3) Elemental damage numbers
  must show their element's colour (fire, cold, lightning, poison, arcane);
  physical stays as it is. Prove each with a headless check.
  (all three fixed; `check-hits` 32 of 32; see Results)
- [ ] Handover.

## Results

### Checker sweep (static, `node tools/run-checks.mjs`)

52 of 53 pass. The one failure is `curve` (balance, see below). No static
checker tests code that no longer exists (`unfinished`: 0 orphans, `rules`
and `wiring` pass).

Browser checkers are run per milestone instead (they take 10 to 45 minutes
each with three agents on the CPU): `flow --class=<id>` for the six classes,
`mapflow` for the boss and map end.

### Balance (`check-curve`)

Why it failed (traced with `--trace`):

- Tier 12 (pyromancer, shadowblade, L19): plain lack of life and damage.
  Packs with life-draining burrow ticks and the bosses outlast them.
- Tier 40 (every class, L38): most pack deaths are reflect. The elite affix
  `reflect_damage` returns 22% of the damage the monster *took*, and that
  amount includes overkill, with no cap. One pyromancer nova into a pack of
  three reflect elites came back as 48,000 to 62,000 damage in one frame
  against 22,500 life. The run modifier `mod.reflect` is capped at 5% of the
  hero's life per hit; the affix is not.

What changed (classes stronger only):

- `src/sim/HeroPower.ts`: hero power starts at level 7 (was 8), damage
  x1.15 per level (was x1.135), life x1.17 per level (was x1.13).
- `src/data/classes.ts`: more life for the three frailest classes.
  Pyromancer life per level 1.4 -> 2.0 and per vitality 2.5 -> 3;
  shadowblade 1.9 -> 2.4 and 3 -> 3.5; revenant 1.8 -> 2.4 and 2.5 -> 3.

- `src/entities/Enemy.ts` (owner approved, relayed by the coordinator):
  the `reflect_damage` affix now reflects its 22% only of the damage the
  monster actually absorbed, capped at its life before the hit. No
  overkill. The share and every other monster number are unchanged.

Result: 1 of 30 fails (was 8). Nothing is walled. The one failure is the
revenant at tier 5 being "untouched" (it wins without losing 15% life or
drinking a potion). Making classes stronger cannot fix that; it is on the
edge (low 90% and 92%, the line is 85%) and passes when the revenant is run
on its own (`--classes=revenant`), because the curve harness carries some
state from class to class.

### Owner's play bugs (`node tools/check-hits.mjs`, 32 of 32)

Dual wield. How it is meant to work (the code's own design): both blades
strike on every basic attack, the main hand first and the off hand a beat
later for 62% of the sheet. The sheet adds both weapons' damage, so the
off-hand weapon counts in both blows and in every skill (two daggers deal
2.9x one dagger; a stronger off-hand blade raises it again). What was
broken: the second blow had no swing behind it, the body only ever swung the
right blade, and only the dungeon scene ticked it. Now the left blade swings
and the off-hand blow lands on its contact frame; the left blade has its own
swing trail.

Coat Blades and the Venom tree. Coat Blades never poisoned: its 25% chance
was read by nothing and its poison rode inside a physical hit. Viper Strike,
Venom Dart and Death Lotus never applied their stated stacks. Death Lotus,
Double Strike and Massacre landed one hit instead of 8, 2 and 5. Corrosive
Edge and Scorch had no on-hit code. Paralytic Toxin counted the wrong
status. Poison ticked for a sliver of one swing. And every passive skill did
nothing in a fresh town or map until a level-up or gear change, because the
hero never worked out passives on arrival. All fixed; the hero's poison now
ticks for 4% of the blow a second per stack (or the old curve, if higher).

Damage numbers. Elemental skills already passed their type, but running
totals merged every hit on a target into the first hit's colour, and flat
elemental damage on a swing was drawn as physical. Now each element is its
own number in its own colour. Physical is unchanged.

Static sweep after these changes: 53 of 54 pass; `curve` is the same single
revenant tier 5 "untouched" cell as before.

### Text

UI text that still said floors, depth or stairs for the map flow now says
maps, areas and tiers (pause menu, settings, onboarding, death screen,
title, legacy, memorial, contracts, waypoint picker, town toast, map
modifier and objective lines, difficulty guidance). Story prose is unchanged.

## Next up

1. Run the class tour, one class per run:
   `SLAY_PORT=4331 timeout 2700 node tools/check-flow.mjs --class=warden`
   then pyromancer, shadowblade, stormcaller, revenant, ranger. The first try
   (before the panel tour moved inside the page) timed out at the hotbar
   step after 45 minutes; everything before it passed.
2. Run `SLAY_PORT=4331 timeout 2700 node tools/check-mapflow.mjs` (now also
   kills a boss, takes the portal home, opens a fresh map, reloads mid-map).
3. Run the plain `check-flow` once for death and rise again.
4. Look at a town and a dungeon render for the text milestone.

## Notes for resume

- Browser boot is slow under software rendering. Run one class or one map
  per browser run. Under load one frame can take several seconds, so do
  checks inside one `page.evaluate` rather than many round trips.
- `tools/lib/class-tour.mjs` is the class tour that `check-flow --class=`
  runs. `check-mapflow` holds the boss and map-end steps.
- `check-curve` results shift a little with which classes run together.
