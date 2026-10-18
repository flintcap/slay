# Stream: mapvariety (Wave 4: maps that feel new every run)

Status: done

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

- [x] 1. Audit (headless): list the biomes, layouts, map shapes and props
  today, and what repeats most between runs. Write it under "Notes for
  resume". (mapvariety: town builds in pieces; audit)
- [x] 2. Town builds in pieces: `buildTown` in `src/world/Town.ts` is one
  3.1 s block. Make it yield between buildings and residents (a generator,
  like the floor build) and run it paced in `TownScene`, so the town load
  never freezes the browser (speed's request in `speed.md`).
  (mapvariety: town builds in pieces; audit)
- [x] 3. New map shapes: at least three new layout kinds (for example a
  ring around a pit, a river or chasm that splits the map with crossings,
  cliff terraces, an island chain), picked by seed, in fitting biomes.
  (mapvariety: three new map shapes, maw, cleft and terraces)
- [x] 4. Landmarks: rare set pieces per biome (a collapsed bridge, a frozen
  giant, a ruined shrine, a gallows hill) that pull the player to explore,
  some with a small reward.
  (mapvariety: landmark set pieces with a reward)
- [x] 5. Weather per biome: snow, rain, ash fall, drifting fog, scaled by
  quality level, built on the particle kit in `src/fx/kit` (use it, do not
  change it; ask effects in `effects.md` notes if you need more).
  (mapvariety: weather per zone, snow, rain, ash and fog)
- [x] 6. Run themes: each run may roll a theme (flooded, overgrown, burnt,
  haunted) that changes props, light tint and monster mix weights, never
  monster counts or strength down.
  (mapvariety: run themes, flooded, overgrown, burnt and haunted)
- [x] 7. Map polish: floating or mismatched props, seams, empty dead ends.
  (mapvariety: map polish, dead ends, bridges and seams)
- [x] 8. Handover. (mapvariety: handover)

## Next up

Nothing: every milestone is ticked. See Handover.

## Notes for resume

### Audit (milestone 1, headless, from the code and check-maps/check-variety)

What exists today:
- 14 biomes (`Biomes.ts`): 8 old (crypt, caverns, foundry, sunkenTemple,
  hive, frostvault, ashwaste, voidspire) and 6 map-remake ones (darkForest,
  swamp, desert, desertTomb, tundra, hell). Outdoor: darkForest, swamp,
  desert, tundra, ashwaste, hell.
- 10 layout kinds (`LayoutKind`, one generator each in `zones/Outdoor.ts` and
  `zones/Indoor.ts`): forest, swamp, dunes, tundra, wastes; crypt, cave,
  tomb, keep, rift. Picked by `layoutForBiome` from the biome's `layouts`.
- A map (`MapGen.planMap`) is one of 14 themes (zone chains such as
  blackroot: darkForest > crypt), 3 to 5 zones, at most 4 areas (loads).
  Outdoor zones pair up into one area with a seam; indoor zones stand alone.
- Each area is turned or mirrored at random (8 ways) in `zones/Area.ts`.
- Boss arena (`zones/Arena.ts`): always the east end of the last zone. Indoor
  a 20-24 x 18-22 box with four pillars; outdoor a ragged oval with 2-4 stones.
- Dressing per biome (`art/props/Dressing.ts`): lights, clutter, wall, edge,
  feature, landmark (hero piece of a big room on a floor seal), detail,
  liquid, pillar, breakables. Biome variants (`Biomes.ts` VARIANTS, art
  patches + dressing patches): 2 each for the 8 old biomes, none for the 6
  map-remake biomes.
- Ambient particles per biome (`BiomeDef.particles`: dust, embers, snow,
  spores, ash, void, bubbles) via `fx.setAmbient` in `DungeonScene`.
- Per-floor extras: run modifiers (18, `RUN_MODIFIERS`), events (cursed
  chest, fallen adventurer, choice shrine, treasure runner), a warden on
  about one floor in three, quests.

What repeats most between runs:
1. Map shape per biome. 12 of 14 biomes have exactly one layout kind
   (crypt has crypt/keep, frostvault cave/keep). Every swamp is the same
   boardwalk-and-pools band, every forest the same clearings-and-paths.
   Outdoor zones all start from one `bandMask` (a wavy band west to east).
2. The boss arena: the same box or oval at the east end every time.
3. The 6 map-remake biomes have no variants, so their look never changes.
4. Weather: only a box of ambient motes; no falling snow, rain or ash.
5. No set pieces worth a detour: landmarks are a centre prop in a big room,
   no reward, no story.
6. No run-wide mood: variants are per biome; nothing ties a whole map
   together (flooded, burnt) beyond the theme's zone chain.

Checkers for maps (headless): `maps` (every generator x biome, hard rules:
connected, ports walkable, arena sealed), `mapgen`, `variety` (report),
`grid`, `openness`, `roomrules`, `density`, `dressing`, `props`,
`variants`. Browser: `map`, `mapflow`, `stairs`, `walk`.

### Milestone 7 notes

- New checker `node tools/check-polish.mjs` (headless): bare dead ends
  (side rooms with no monsters, nothing to open, no feature, no light, no
  landmark or event; fails over 15%), props on bridges, and dressing props
  standing in the other zone's biome across a seam (ambush and treasure
  room pieces are the room's, not the biome's).
- Before: 3.5% bare dead ends (swamp 9 of 31), 21 props on bridges, 10
  set-piece gibbets across seams. After: 0.9% bare, 0 on bridges, 0 across.
- `Props.ts`: `emit` refuses non-liquid props on bridge tiles;
  `placeDeadEnds` (own stream) gives a bare side room the biome's feature,
  2-3 breakables, a plain chest 30% of the time, and pots where the ground
  takes no solid piece; landmark pieces and their heart stay in one zone.
- One render (`screenshot.mjs --shots=dungeon`, port 4346): a dark wood
  map at tier 1 draws as before, props sit on the ground, nothing broken.
  That map rolled no rain or fog, so weather itself is in the owner list.
- Already clean before (checked): props grounded (`props`), blockers you
  can see (`blockers`), decals on their floor, grid, roof, maps.

### Milestone 6 notes

- `src/world/Themes.ts` (new file rather than `Biomes.ts`, to stay out of
  looks' way there): `RUN_THEMES` with name, blurb, biomes it skips,
  dressing additions, favoured families with a weight, a guest biome,
  weather under sky and under a roof, and a light tint.
  `RUN_THEME_CHANCE` 0.35 from tier 3; picked only if it suits at least
  half the map's zones.
- Rolled in `generateRun` on `streamFor(seed, 'runTheme:<depth>')`, carried
  as `run.runTheme` and `level.runTheme` (types.ts), via `AreaContext`.
- Monster mix (`placeSpawns`): weighted pick by family in fitting zones,
  up to 3 guests of favoured families from the guest biome (own stream).
  Also changed: a pack member's kind is now rolled even for a named leader,
  so a different leader never shifts the rolls of the packs after it. That
  moved which monsters appear on existing seeds, not how many or how strong.
- Props: `themedDressing` adds pools in fitting zones. Weather:
  `withTheme` lays the theme's weather over the zone's (heavier wins).
- Light tint: asked looks in `looks.md` "Notes for resume"; nothing reads
  it yet. No screen shows the theme name yet (ui is done): left for later.
- Also fixed the request I left for effects (they handed over first): the
  biome motes now follow the hero (`fx.setFocus` before `fx.update`).
- New checker `node tools/check-themes.mjs`: same count, ranks, affixes and
  places as without the theme, favoured families up, props show, no sky
  weather under a roof; themes roll on about 1 map in 3.

### Milestone 5 notes

- `src/world/Weather.ts`: `weatherFor` rolls a zone's weather; `Weather`
  runs it round the hero, easing between zones. Tundra snow (calm, normal
  or a storm), swamp rain (60%) and fog, dark wood rain (45%) and fog (55%),
  ash over the wastes (heavier in "grey", cinders in "emberfall"), ash and
  cinders in hell, sand wind on half the deserts, fog in most crypts and the
  drowned temple, drips in caverns, flooded crypts and the temple. Frozen
  vaults drift a little rime indoors (a real blizzard in "blizzard").
- Hooked in `DungeonScene` at one place (field, build next to
  `fx.setAmbient`, update after `tickZone`): not our file, three lines.
- Layers are our own `Layer` objects, emitted with `FXSystem.emit` (the
  kit is unchanged). Every layer has count 3+ so `fxScale` thins it.
- New checker `node tools/check-weather.mjs` (headless): sky weather never
  under a roof, every layer scales, at most 600 particles a second (peak
  about 430, a rainy dark wood).
- Found: the biome ambient motes stay round the map centre (`setFocus` is
  never called). Written as a request in `effects.md` "Notes for resume".

### Milestone 4 notes

- `src/world/Landmarks.ts`: 9 set pieces (`SET_PIECES`: id, name, biomes,
  heart prop, a ring of pieces, litter, a light, reward chest, shrine or
  none). `LANDMARK_CHANCE` 0.3 per area.
- `world/Props.ts` `placeLandmark` runs after the lights and before room
  features, on `streamFor(seed, 'landmark:...')` swapped into `ctx.rng`, so
  every other prop roll is unchanged. Room: a normal room at least 7x7,
  16+ tiles from the arrival, 10 from the exit, clear of the arena, scored
  by how far it lies off the straight way (dead ends score more).
- Solids of a set piece never touch each other (`placeSpaced`), and a fence
  of ring radius + 2 round the heart (`ctx.landmarkArea`) keeps every later
  blocking prop out. The connectivity guard pulls the set piece's own
  solids only when nothing else is left to take. Without the fence, later
  scatter walled tiles in and the guard took the whole set piece away.
- `level.landmark` = `{id, name, x, y, room}` (types.ts). Nothing shows the
  name yet: a label on the map or a toast on entering the room would need
  `src/ui` or the scene (not ours). The ui stream is done; left for later.
- New checker `node tools/check-landmarks.mjs` (headless, in run-checks):
  31% of areas, 81 of 82 rewards placed, every piece turns up.

### Milestone 3 notes

- New file `src/world/zones/Shapes.ts`: `maw` (ring round a pit, warren of
  chambers, dais with one causeway 65%), `cleft` (river or chasm along the
  zone, entry and exit on opposite banks, 2-3 crossings: bridge, a ford of
  shallows outdoors, ice floes in tundra), `terraces` (3-5 tiers, climb,
  fall or ridge, cliffs of void with ramps; the boss zone's last tier sits
  at 0 to meet the arena). `gulfTile` picks lava (hell, foundry), deep
  water (swamp, sunkenTemple, caverns, darkForest, tundra, hive) or chasm.
- Registered in `LayoutKind` (types.ts), `ZONE_GENERATORS` and `zoneSize`
  (zones/Area.ts), and biome `layouts` lists (Biomes.ts, signature first,
  so the signature stays about half of all zones).
- Indoor walk share kept at 29-32% (cave 27-30, crypt 35), so the monster
  budget (`zoneBudget`, one per 11 walkable tiles) is not cut.
- Checkers changed: `maps-entry.ts` CASES list the new shapes;
  `openness-entry.ts`/`check-openness.mjs` judge the outdoor runs of the
  shared shapes as open country (`maw.open` etc.); `events-entry.ts` now
  sums the heat-scaled chance per floor (placeEvents scales by area heat)
  instead of the bare rates, which failed on noise at depth 1.
- Top-down look: `node tools/check-maps.mjs --dump=maw:crypt:boss --seed=3`
  prints the ASCII map.

### Milestone 2 notes

- `townSteps(rng)` in `world/Town.ts` is the generator; `buildTown(rng)` runs
  it in one go for tools (`tools/town-entry.ts`, `townprops-entry.ts`).
  `art/props/town/Layout.ts` `townPropsSteps` yields per building and per 9
  pines; `Residents.add` (art/npc/Residents.ts) builds one resident.
  These two files belong to no wave-two stream; the edits are small.
- Headless timing (node, no workers): 37 pieces; every props piece under
  310 ms; each resident 2.6-4.8 s in node because node has no folk worker
  cache. In the browser the folk are meshed by workers first
  (`folkMeshed`), so a resident is only assembly.

## For the owner to test

(Add one line per item: what to try and what should happen.)

- Go back to town from a map (and start a new character): the loading bar
  keeps moving through the "world" step and the page never stops answering.
- Explore a few maps fully: about one area in three has a lit set piece in a
  side room (gibbets, a frozen watch, a broken chapel, a bone mound...).
  Most have a rare chest or a shrine beside the centre piece that you can
  walk up to and use. Nothing in it floats or blocks the way.
- Weather: play a tundra map (snow, sometimes a storm that leans with the
  wind), a swamp or dark wood (rain with rings on the ground, low fog),
  the ash wastes or hell (ash and cinders), a crypt (low fog). It should
  feel heavy and grim, never cute; it should fade when you walk into a zone
  with other weather, and stay smooth on Low quality.
- Run themes: play several maps from tier 3. About one in three should feel
  changed all through: drowned (reeds, shells, drips, rain), root-choked
  (moss, ferns, roots on the walls), burnt out (ash, scorch marks, falling
  cinders) or restless (bones, chains, fog, more undead). Monster numbers
  should feel the same as an ordinary map.
- Biome motes (dust, spores, snow) now drift round the hero everywhere on
  the map, not only near its middle.

## Handover

What exists now, and where:
- Town loads in pieces: `townSteps` (`world/Town.ts`), `townPropsSteps`
  (`art/props/town/Layout.ts`), `Residents.add`; `TownScene` runs it with
  `yieldIfLong`. `buildTown` runs it in one go for tools.
- Three new map shapes in `world/zones/Shapes.ts`: `maw` (ring round a
  pit), `cleft` (river or chasm with crossings), `terraces` (tiers with
  ramps). Listed per biome in `Biomes.ts` `layouts`.
- Landmarks: `world/Landmarks.ts` (9 set pieces), stood by
  `Props.ts` `placeLandmark`; `level.landmark` names it.
- Weather: `world/Weather.ts`, hooked in `DungeonScene` (build at level
  load, update each frame). Biome motes now follow the hero too.
- Run themes: `world/Themes.ts` (flooded, overgrown, burnt, haunted),
  rolled in `generateRun`, used by `placeSpawns`, `placeProps` and weather.
- Polish: `placeDeadEnds`, no props on bridges, set pieces in one zone.
- New headless checkers: `landmarks`, `weather`, `themes`, `polish`.

Left for `finish`:
- Nothing shows a landmark's name or the run theme's name yet
  (`level.landmark.name`, `runTheme(id).name/blurb`): a map label or a
  toast in `src/ui` would make them read as places.
- The theme light tint (`runTheme(id).light`) waits for looks to read it.
- Weather and themes were checked headless only; how they look and feel
  is in "For the owner to test".
