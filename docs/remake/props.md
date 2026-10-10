# Stream: props (every prop, interactable and town building)

Status: not started

Goal: every object in the world remade from nothing to match the new ground
and lighting. Diablo II and Path of Exile dressing: grim, worn, heavy.

## Milestones

- [ ] Kit and textures. A prop kit API on ground's materials. CC0 wood,
  stone, metal, cloth and bone textures under `public/assets/textures/props/`.
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

`check-ghost`, `check-blockers`, `check-interact`, `check-npcdraws`,
screenshots.

## Next up

1. Run Setup in `docs/remake/PROTOCOL.md`.
2. Read `src/world/Props.ts`, `src/world/Town.ts`, `src/art/Meshes.ts`, and
   ground's handover in `docs/remake/ground.md`.

## Notes for resume

- Town `addBox` colliders take the AABB of the rotated rectangle.
- Wall-prop colliders are offset by `wallOffset` along the prop's rotation.
