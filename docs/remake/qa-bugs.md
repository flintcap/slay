# Stream: qa-bugs (quality pass 2: does everything work)

Status: in progress

Goal: after the remake, every part of the game works end to end with no
errors, no soft-locks and nothing broken on screen. Fix what you find.

## Milestones

- [ ] Checker sweep. Run every headless checker in `tools/` (one at a time,
  each under `timeout`). List pass/fail under "Results". Fix every failure
  that is a real bug. Delete or update any checker that tests code that no
  longer exists. Typecheck clean, build clean.
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
- [ ] Balance check (owner's rule: make classes stronger, never make monsters
  weaker or fewer). `check-curve` fails 8 of 30 at deep tiers 12 and 40.
  Find why. If the fix is making classes stronger (scaling, skills, passives),
  do it and show the curve passes. If it needs anything else, write it under
  "Results" for the owner instead of changing it.
- [ ] Handover.

## Results

(fill in)

## Next up

1. Run Setup in `docs/remake/PROTOCOL.md`.
2. Read `docs/remake/finish.md` (Handover) and `CONTRACTS.md`.
3. Start the checker sweep.

## Notes for resume

- Browser boot is slow under software rendering. Run one class or one map
  per browser run. `tools/check-flow.mjs`, `check-crash`, `check-skills`,
  `check-bossfights`, `check-soak` exist; extend them rather than writing new
  ones where you can.
