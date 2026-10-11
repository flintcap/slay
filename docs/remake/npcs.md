# Stream: npcs (town NPC looks and animations)

Status: done

Goal: every townsperson remade on the new hero rig, each one recognisable,
with life: working, idling, turning to talk.

## Milestones

- [x] Looks. Each NPC in `NPC_LOOK_IDS` rebuilt on heroes' rig and body with a
  look that fits their story role (read `src/data/story/npcs.ts`).
  (wip(npcs): the nine townsfolk built and dressed for their trades)
- [x] Animation. Idle loops that fit the job (hammering at the forge,
  sweeping, praying, counting coins), talk gestures, turn to face the player,
  wander paths where it fits.
  (npcs: town switched to the new townsfolk; old NpcModels bridge deleted)
- [x] Switch and clean. Delete the old `NpcModels.ts` builders and every
  reference. Renders of each NPC.
  (npcs: town switched to the new townsfolk; old NpcModels bridge deleted;
  grep NpcModels|buildNpcModel|npcCarryGrip|mergeResidentSkins in code: 0)

## Checkers

- `SLAY_PORT=4328 timeout 900 node tools/check-npcdraws.mjs`: every resident
  built cold (time printed), at most 16 meshes each, all nine within 240
  draws with one shadow pass, every loop registered and run for 10 s.
- `SLAY_PORT=4328 timeout 900 node tools/npc-sheet.mjs folk,faces,jobs --out=shots/npcs`
  (`--yaw=0.7`, `--loop=work2|rest|talk`, `--ids=kale,hesk`, `--ty=0.5 --dist=2.6`).
- Town: `npm run build`, then `SLAY_PORT=4328 timeout 1500 node tools/shoot-town.mjs
  --out=shots/npcs/new --spots=forge,fire,gate,stash` (about 4 minutes a spot)
  and `SLAY_PORT=4328 timeout 1500 node tools/check-perf.mjs --depths=0 --preview`.

## Next up

Nothing: the stream is done. See Handover.

## Handover

- **What exists.** The nine townsfolk are `buildFolk(id)` in
  `src/art/npc/Folk.ts`: a hero body (`QUALITY_RESIDENT`), clothes for their
  trade (`npc.*` coat cuts added to `CHEST_CUTS`, plus `Clothes.ts` trade
  pieces: Kale's apron and burn scars, Vell's wimple and veil, Marrow's hood,
  Wenna's brimmed hat and kerchief, Gilder's feathered cap, Hesk's shawl, the
  Listener's blindfold), real item bases where they fit (Renn's casque, belts,
  boots, gloves), and props baked into the body (`HandProps.ts`: hammer and
  tongs with a hot bar, ledger and quill, coins, keys and lantern at the belt,
  mortar and pestle, besom and spade, spear, staff, rod and map, tankard).
  Same-material parts are merged: 8 to 16 meshes a resident, 203 draws for
  all nine with one shadow pass. Town measured 445 draw calls (check-perf,
  depth 0).
- **Animation** (`Jobs.ts`): per-resident `work`, `rest`, `talk` loops and a
  second work loop for some (`npc.<id>.*`, via `registerAction`). The smith
  hammers and turns the bar at the anvil, Hesk writes in her ledger, Corvane
  counts coins, Vell grinds and prays, Marrow sweeps and leans on his broom,
  Renn watches the gate and shades her eyes, the Listener kneels and bends
  her ear to the ground, Gilder sways, drinks and tells stories, Wenna reads
  her map and sights along her rod.
- **Life in town** (`Residents.ts`): spells of work, rest and second loops;
  rounds for Corvane, Marrow (sweeping as he goes), Gilder, Wenna and Renn;
  heads follow a player within 4.5 m; in conversation (or while their trade
  is open) they stop, turn to face the player and gesture. The Listener
  stays kneeling and turns her head. Colliders and talk points move with the
  wanderers (`TownScene.attendResidents`).
- **Deleted:** `src/art/NpcModels.ts`, `tools/npcdraws-entry.ts`.
- **Tools:** `tools/npc-sheet.mjs` + `tools/npc-page.ts` (folk, faces, jobs,
  check); `tools/check-npcdraws.mjs` runs the check sheet.
- **Left for `finish`:** a cold first visit builds the nine in about 28 s
  under SwiftShader (heroes measured about 20 to 25 s for the bridge); moving
  meshing off the main thread or over several frames is still the fix. Renn's
  hand-on-hip pose floats a little in front of the hip. The ledger and map
  read as flat boards from far away. Walking residents do not avoid buildings;
  their rounds are short and kept to open ground.

## Notes for resume

- Code: `src/art/npc/` (Folk looks and build, Clothes trade pieces and
  `npc.*` coat cuts, HandProps baked props, Jobs loops, Residents routines).
  `Town.ts` builds `new Residents(...)` in its residents section and exposes
  it as `TownBuild.residents`; `TownScene.attendResidents` feeds it.
- `registerAction` was added to `src/art/hero/Actions.ts` (additive) so the
  loops can be played by name.
- The old node-only draw checker could not run any more (the hero body paints
  canvases), so `check-npcdraws.mjs` now runs the browser check.
