# Stream: props (every prop, interactable and town building)

Status: in progress

Goal: every object in the world remade from nothing to match the new ground
and lighting. Diablo II and Path of Exile dressing: grim, worn, heavy.

## Milestones

- [x] Kit and textures. A prop kit API on ground's materials. CC0 wood,
  stone, metal, cloth and bone textures under `public/assets/textures/props/`.
  (props: prop kit and textures; every kind rebuilt on the kit)
- [ ] Biome dressing. Per biome set: crypt (sarcophagi, candles, bones,
  braziers, chains), forest (trees, stumps, ferns, boulders, ruins, carts),
  swamp (dead trees, reeds, boardwalks), desert (broken pillars, bones,
  tents, urns), frozen (ice spikes, frozen bodies, banners), hell (spikes,
  cages, skull piles, lava rocks), and whatever else maps added.
- [ ] Interactables. Chests by tier, shrines, doors, portals, waypoints,
  breakables (barrels, urns, crates) with real break pieces, quest objects.
- [ ] Town. Buildings remade (timber frame, stone, thatch, a palisade),
  stations (forge, stash, vendor stalls), dressing.
- [ ] Switch and clean. Delete old `Props.ts` builders and every reference.
  Colliders match the new meshes (`check-ghost`, `check-blockers`).

## Checkers

`check-propkit` (headless, every kind x biome x variant: grounded, wall
clearance, budgets, no invisible walls), `check-props`, `check-ghost`,
`check-blockers`, `check-interact`, `check-npcdraws`, `check-assets`,
screenshots. Prop contact sheets:
`SLAY_PORT=4327 timeout 600 node tools/prop-sheet.mjs kinds --ids=<kinds|group> --biomes=a,b`
(writes `shots/props/`).

## Next up

1. Biome dressing: `src/art/props/Dressing.ts` holds the per-biome (and
   per-zone) prop vocabulary: wall lights, floor props, wall props,
   features, landmarks, detail. Placement in `src/world/Props.ts` reads it
   instead of BiomeArt's vocab fields.
2. Outdoor biomes (darkForest, swamp, desert, tundra, ashwaste, hell) get
   standing lights (lanternPost, brazier, campfire) instead of wall lights,
   and edge props (deadTree, boulder, rockCluster).
3. Place `chestRare`/`chestVault` by chest tier.
4. Leave a note in `docs/remake/ground.md` asking ground to drop the vocab
   fields from BiomeArt once Dressing is live.
5. Render a few biomes at `SLAY_PORT=4327`.

## Notes for resume

- New prop code lives in `src/art/props/`: `Kit.ts` (geometry kit),
  `PropMats.ts` (materials on ground's texture sets; `tint` multiplies,
  `base` recolours to an absolute mid-tone), `Ctx.ts` (per-biome palettes,
  build context), `Defs.ts` (113 kinds), `Library.ts` (templates,
  `remainsTemplate` for opened/spent/pulled states), and builder files
  Lights, Stone, Crypt, Wild, Elements, Works, Hive, Containers, Detail.
- `src/world/Props.ts` `propTemplate` routes every kind with a builder to the
  new library. The old builders in Props.ts are dead code: delete them in
  "Switch and clean".
- Light colour: `fire: true` uses the biome palette flame, `mood: true` uses
  `art.lightColor`, otherwise the def colour.
- `seat(geo)` in Kit flattens a part's underside onto the floor; use it for
  mounds and rocks so nothing sinks past check-propkit's -0.12 limit.

- From ground: the biome's wall light (`art.wallLight`) now shines in
  `art.lightColor` (DungeonBuilder). Other lit props keep their template
  colour: `mushroomCluster` and friends throw saturated teal pools in the
  dark forest. When you rebuild them, pick colours that sit in the biome's
  mood (or read `art.lightColor`).

- Town `addBox` colliders take the AABB of the rotated rectangle.
- Wall-prop colliders are offset by `wallOffset` along the prop's rotation.
- Done: Props.ts uses `T_EXIT`/`T_ARRIVAL`; the `T_STAIRS_*` aliases are gone
  from `Layouts.ts` (grep T_STAIRS_: 0).
