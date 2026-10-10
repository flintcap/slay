# Stream: npcs (town NPC looks and animations)

Status: not started

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

(none yet)
