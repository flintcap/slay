# Stream: props (every prop, interactable and town building)

Status: done

Goal: every object in the world remade from nothing to match the new ground
and lighting. Diablo II and Path of Exile dressing: grim, worn, heavy.

## Milestones

- [x] Kit and textures. A prop kit API on ground's materials. CC0 wood,
  stone, metal, cloth and bone textures under `public/assets/textures/props/`.
  (props: prop kit and textures; every kind rebuilt on the kit)
- [x] Biome dressing. Per biome set: crypt (sarcophagi, candles, bones,
  braziers, chains), forest (trees, stumps, ferns, boulders, ruins, carts),
  swamp (dead trees, reeds, boardwalks), desert (broken pillars, bones,
  tents, urns), frozen (ice spikes, frozen bodies, banners), hell (spikes,
  cages, skull piles, lava rocks), and whatever else maps added.
  (wip(props): biome dressing per zone; outdoor lights stand in the open; chests by tier)
- [x] Interactables. Chests by tier, shrines, doors, portals, waypoints,
  breakables (barrels, urns, crates) with real break pieces, quest objects.
  (wip(props): used props leave remains, breakables burst into pieces, new waypoint and portal, doors at doorways)
- [x] Town. Buildings remade (timber frame, stone, thatch, a palisade),
  stations (forge, stash, vendor stalls), dressing.
  (wip(props): the town rebuilt: timber-frame houses, smithy, shop, strongroom, apothecary, gatehouse, palisade;
  old camp builders grep buildForge|buildWagon|buildPalisade|buildCampfire in Town.ts: 0)
- [x] Switch and clean. Delete old `Props.ts` builders and every reference.
  Colliders match the new meshes (`check-ghost`, `check-blockers`).
  (wip(props): old prop builders deleted; every kind comes from the prop library;
  grep makeStream|buildTorch|buildBrazier|buildFlatWall|buildMisc: 0)

## Checkers

`check-propkit` (headless, every kind x biome x variant: grounded, wall
clearance, budgets, no invisible walls), `check-props`, `check-ghost`,
`check-blockers`, `check-interact`, `check-npcdraws`, `check-assets`,
`check-dressing`, `check-townprops` (headless: town draws, lights, and
colliders against what is drawn), screenshots. Town views:
`SLAY_PORT=4327 timeout 2400 node tools/shoot-town.mjs --out=shots/props --spots=fire,forge,shop`
(spots: fire, forge, shop, stash, alchemy, cairn, gate, south; about 6
minutes a spot while other agents render). Prop contact sheets:
`SLAY_PORT=4327 timeout 600 node tools/prop-sheet.mjs kinds --ids=<kinds|group> --biomes=a,b`
(writes `shots/props/`).

## Handover

What exists now:

- Dungeon props: `src/art/props/`. `Defs.ts` (every kind: placement,
  radius, blocks, light), `Kit.ts` (geometry kit), `PropMats.ts` (materials
  on ground's texture sets), `Ctx.ts` (per-biome palettes), builder files by
  family (Lights, Stone, Crypt, Wild, Elements, Works, Hive, Containers,
  Detail), `Library.ts` (cached templates, `remainsTemplate` for opened,
  spent and pulled states), `Dressing.ts` (per-biome and per-zone prop
  vocabulary). Breakables burst into real pieces; chests come by tier.
- Placement: `src/world/Props.ts` (placement only; `propTemplate` hands every
  kind to the library, unknown kinds draw as `rubblePile`).
- Town: `src/art/props/town/` (`TownKit`, `Houses`, `Works`, `Layout`).
  `src/world/Town.ts` owns the ground, lights and residents and calls
  `buildTownProps`. The town measures 425 draw calls (budget 900) and 22
  lights with the hero's (budget 24).
- Checkers, all passing: check-propkit, check-dressing, check-blockers,
  check-props, check-townprops, check-town, check-assets, check-interact,
  check-ghost. Renders: `tools/shoot-town.mjs`, `tools/prop-sheet.mjs`.

Left for `finish`:

- `check-perf --preview --depths=0,1,9`: the town is within budget. Depth 9
  (dark forest, 132 monsters) draws 1.60M triangles against 1.5M, and depths
  1 and 9 allocate 310 to 470 KB a step against 200 (monster AI is 70 to 80%
  of the update; HeroModel is a top allocator). Bones and skulls were
  halved, which cut crypt floors' prop triangles by 20% but moved that
  forest frame only 1%. How the rest splits between monster bodies,
  ground's trees and forest props is not measured yet.
- `check-npcdraws` fails headless in `irisTexture` (the heroes' eye texture
  needs `document`). Not a props file.
- Ground request 1 in `ground.md` (templates built with the zone biome's
  art, not the level's) is DungeonBuilder's, not props'.
- check-propkit warns that `cart` and `tent` spill past their colliders
  (0.57 m and 0.85 m): low parts (shafts, guy lines) you step over.

## Notes for resume

- The town is `src/art/props/town/`: `TownKit.ts` (materials `TM`,
  `TownBatch` merging every static part per material into one mesh, `Site`
  local frames with +Z as the front, `solid` footprints), `Houses.ts`
  (house, smithy, shop, strongroom, apothecary), `Works.ts` (gatehouse,
  palisade, watch towers, pines, fire ring, cairn, well, yard dressing),
  `Layout.ts` (`buildTownProps`: where everything stands). `src/world/Town.ts`
  keeps the ground, lights and residents and calls `buildTownProps`.
- The town camera looks from the south-east. Counters and keepers go on the
  south or east side of a building, never under a roof seen from behind.
- Town lights: 21 with intensity against a cap of 23 (check-perf allows 24
  with the hero's). Lantern specs carry `lit`; unlit ones are bulbs only.

- New prop code lives in `src/art/props/`: `Kit.ts` (geometry kit),
  `PropMats.ts` (materials on ground's texture sets; `tint` multiplies,
  `base` recolours to an absolute mid-tone), `Ctx.ts` (per-biome palettes,
  build context), `Defs.ts` (113 kinds), `Library.ts` (templates,
  `remainsTemplate` for opened/spent/pulled states), and builder files
  Lights, Stone, Crypt, Wild, Elements, Works, Hive, Containers, Detail.
- `src/world/Props.ts` is placement only; `propTemplate` hands every kind to
  the library.
- Light colour: `fire: true` uses the biome palette flame, `mood: true` uses
  `art.lightColor`, otherwise the def colour.
- `seat(geo)` in Kit flattens a part's underside onto the floor; use it for
  mounds and rocks so nothing sinks past check-propkit's -0.12 limit.

- From ground: the biome's wall light (`art.wallLight`) shines in
  `art.lightColor`. Done: `mushroomCluster` no longer carries a light, so
  the teal pools are gone.

- Town footprints: `TownBatch.solid` is exact when square-on; turned, it
  fills the rectangle with small inscribed boxes. `Site.block` is one box for
  small turned squares (chimneys).
- Wall-prop colliders are offset by `wallOffset` along the prop's rotation.
- Done: Props.ts uses `T_EXIT`/`T_ARRIVAL`; the `T_STAIRS_*` aliases are gone
  from `Layouts.ts` (grep T_STAIRS_: 0).
