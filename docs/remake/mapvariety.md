# Stream: mapvariety (Wave 4: maps that feel new every run)

Status: in progress

Goal: each run feels different: new map shapes, landmarks worth finding,
weather, and run themes, all from seeded randomness (`src/core/RNG.ts`).
Dark and gritty, never cartoonish. Our own names and designs. Never fewer or
weaker monsters. Keep map loads paced (speed part 1 made the build yield;
new build work must yield too and report `'load:progress'`).

Checkers: `node tools/run-checks.mjs --only=<name>` for what you touch (map
generation checkers are headless; use them first). Renders: at most one
small contact sheet per milestone, inside `flock /tmp/slay-browser.lock
timeout`. Run `node tools/get-chrome.mjs` once before the first browser check.

## Milestones

- [ ] 1. Audit (headless): list the biomes, layouts, map shapes and props
  today, and what repeats most between runs. Write it under "Notes for
  resume".
- [ ] 2. Town builds in pieces: `buildTown` in `src/world/Town.ts` is one
  3.1 s block. Make it yield between buildings and residents (a generator,
  like the floor build) and run it paced in `TownScene`, so the town load
  never freezes the browser (speed's request in `speed.md`).
- [ ] 3. New map shapes: at least three new layout kinds (for example a
  ring around a pit, a river or chasm that splits the map with crossings,
  cliff terraces, an island chain), picked by seed, in fitting biomes.
- [ ] 4. Landmarks: rare set pieces per biome (a collapsed bridge, a frozen
  giant, a ruined shrine, a gallows hill) that pull the player to explore,
  some with a small reward.
- [ ] 5. Weather per biome: snow, rain, ash fall, drifting fog, scaled by
  quality level, built on the particle kit in `src/fx/kit` (use it, do not
  change it; ask effects in `effects.md` notes if you need more).
- [ ] 6. Run themes: each run may roll a theme (flooded, overgrown, burnt,
  haunted) that changes props, light tint and monster mix weights, never
  monster counts or strength down.
- [ ] 7. Map polish: floating or mismatched props, seams, empty dead ends.
- [ ] 8. Handover.

## Next up

1. Do Setup in PROTOCOL.md. Set `Status: in progress`.
2. Milestone 1: read `src/world/MapGen.ts`, `DungeonGen.ts`, `Layouts.ts`,
   `src/world/zones/*` and `Biomes.ts`, and write the audit.

## Notes for resume

## For the owner to test

(Add one line per item: what to try and what should happen.)

## Handover

(Written when every milestone is ticked.)
