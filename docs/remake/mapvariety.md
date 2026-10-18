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

1. Do Setup in PROTOCOL.md.
2. Milestone 4: landmarks. Rare set pieces per biome that pull the player
   to explore, some with a small reward. Plan: a `landmark` field on
   `DungeonLevel` (types.ts, additive) chosen in `DungeonGen.generateLevel`
   on its own stream (`streamFor(seed, 'landmark:...')`) so no other roll
   moves; placed in a far room (or the maw dais); drawn from existing prop
   kinds in `art/props/Defs.ts`; reward = a chest prop with a new interact
   id the scene already handles (check `DungeonScene` interact dispatch).

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

## Handover

(Written when every milestone is ticked.)
