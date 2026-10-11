# Stream: npcs (town NPC looks and animations)

Status: in progress

Goal: every townsperson remade on the new hero rig, each one recognisable,
with life: working, idling, turning to talk.

## Milestones

- [ ] Looks. Each NPC in `NPC_LOOK_IDS` rebuilt on heroes' rig and body with a
  look that fits their story role (read `src/data/story/npcs.ts`).
- [ ] Animation. Idle loops that fit the job (hammering at the forge,
  sweeping, praying, counting coins), talk gestures, turn to face the player,
  wander paths where it fits.
- [ ] Switch and clean. Delete the old `NpcModels.ts` builders and every
  reference. Renders of each NPC.

## Checkers

`check-npcdraws`, screenshots of the town.

## Next up

1. Run Setup in `docs/remake/PROTOCOL.md`.
2. Read heroes' rig in `CONTRACTS.md` and handover in `heroes.md`, then
   `src/art/NpcModels.ts` and NPC handling in `src/scenes/TownScene.ts`.

## Notes for resume

- From heroes ("Switch and clean"): the old body kit and animator are gone, so
  `src/art/NpcModels.ts` was bridged onto the hero rig to keep the camp
  peopled. Each resident is now `buildHero(look)` with a per-resident
  `HeroLook`, clothes from `wearArmour` (their old item visuals), trousers
  from `trousersSpec` in `hero/Garment.ts`, tools in the hand sockets, and
  same-material parts merged. `Town.ts` drives them with `HeroAnimator`
  (idle only; the old per-trade `setPersona` stances did not survive).
  Kale's forearm burn scars were dropped. This is a bridge, not the remake:
  your "Looks" and "Animation" milestones still stand.
- Cost: a resident meshes in a few seconds the first time (cached in memory
  and IndexedDB after, `MeshCache.ts`). Nine of them on a cold first visit is
  the town's biggest load hitch; consider fewer distinct body shapes, a lower
  `BodyQuality`, or building them over several frames.
