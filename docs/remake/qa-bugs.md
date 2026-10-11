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
- [ ] Balance check (owner's rule: make classes stronger, never make monsters
  weaker or fewer). `check-curve` fails 8 of 30 at deep tiers 12 and 40.
  Find why. If the fix is making classes stronger (scaling, skills, passives),
  do it and show the curve passes. If it needs anything else, write it under
  "Results" for the owner instead of changing it.
  (classes made stronger: 8 of 30 down to 0 to 2 of 30; see Results)
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

Result: 2 of 30 fail on a full run (revenant at tier 5 is "untouched": wins
without losing 15% life; revenant at tier 40 packs). Run on its own
(`--classes=revenant`) all five revenant cells pass, so these two are on the
edge and move with the order the classes are fought in (the curve harness
carries some state from class to class).

For the owner (not changed, it would make monsters weaker):

- The `reflect_damage` affix reflects overkill and has no cap. Capping it
  (to the monster's remaining life, or a share of the hero's life like the
  run modifier) is what makes deep packs fair for big-hitting builds. More
  hero life cannot fix it for long: reflect grows with hero damage.

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
