# Stream: models (how bodies and worn gear look)

Status: paused

## Milestones

- [ ] Player bodies: better proportions, anatomy and silhouette per class; faces and hair with character; materials with real skin, cloth, leather and metal response.
- [ ] Equipped gear on the body: helm, chest, gloves, boots, belt and shield show the actual item worn. Shape, material and ornament change with the item's base, tier and rarity, so upgrading visibly changes your character. Uniques and sets look unique.
- [ ] Monster looks: a distinct, readable silhouette per family, more detail and material variety, elites and champions visibly tougher, bosses that look like bosses.
- [ ] Town NPCs: each camp NPC built for their role (smith, vendor, healer, stash keeper and the rest), with clothing and props that say who they are.
- [ ] Level of detail and budgets: far-away models get cheaper, crowds of monsters stay smooth, nothing visibly pops.
- [ ] Sweep: a turntable render of every class in low, mid and top gear, every monster family and every NPC, checked for clipping, floating parts and style drift.

## Next up

Milestone 1 (nothing ticked yet). First run the baseline lineup render, which has never been run:
`SLAY_PORT=4311 node tools/models-sheet.mjs classes,monsters --out=shots/models/base` (run it as a plain
command, not wrapped in `time`). Look at the PNGs, then start on the body work in the plan below.

## Notes for resume

Tools already written (committed, typecheck clean, not yet run):
- `tools/models-sheet.mjs` + `tools/models-page.ts`: lineup renders without booting the game (Vite dev
  server, empty page, SwiftShader WebGL). Sheets: `classes` (6 classes x bare/low/mid/top gear, front and
  back, plus a strip at the real game camera scale), `monsters` (per family, plus an elite and 6 bosses),
  `npcs` (reads `NPC_LOOK_IDS` and `buildNpcModel` from `src/art/NpcModels.ts` once it exists). Prints
  triangles and draw calls per figure. The page already calls `CM.wearItem(body, bones, slot, item, visual)`
  if it exists, and passes `{ family, rank }` as a 4th arg to `buildMonsterModel`.

What I found (read before coding):
- Worn armour today is `ItemModels.buildItemModel` (art stream) as a rigid one-size mesh on a bone, socketed
  by `attachToSocket` in `Player.refreshEquipmentVisuals` and `PaperdollView.setCharacter`. It does not fit
  each class's body. Plan: new `src/art/WornGear.ts` builds helm/chest/gloves/boots/belt as SkinnedMeshes
  bound to the body's own skeleton (store skeleton and joint fit on `root.userData` in `buildPlayerModel`),
  shaped by the sub-type in `visual.shape` (`chest.robe|leather|mail|scale|plate`, `helm.cap|full|horned|circlet`,
  `gloves.light|plate|silk`, `boots.light|plate|silk`, `belt.sash|plate|chain`), rarity tier and ornate.
  Export `wearItem(...)` from CharacterModels returning null for slots it does not handle, and make a
  one-line additive edit in Player.ts and PaperdollView.ts: try `wearItem` first, else the old path. Attach
  the result under a bone with `userData.socketSlot = slot` so `clearSocket` removes it. Do not route
  skinned meshes through `attachToSocket` (its mirror clone would double-draw).
- Share skinning helpers (`ringStack`, `blob`, `skinGeometry`, `mergeSkinned`, segments) via a new
  `src/art/BodyKit.ts` to avoid an import cycle between CharacterModels and WornGear.
- Put an exported `gearLook(visual, rarity)` helper in a new `src/art/GearLook.ts` (tier, trim key, accent,
  glow) mirroring `ItemModels.decoFor/kitFor`, and ask the art stream in art.md to use it so drops and worn
  gear agree.
- `buildPlayerModel` uses texture seeds 1..N per material bucket, which bakes fresh PBR sets per character
  (boot only warms seed 0). Switch to seed 0.
- Town NPCs: `Town.ts` calls `npc(ctx, classId, ...)` 8 times with player class models. Mapping by position:
  forge = Kale (smith), wagon = Hesk (quartermaster), stash tent = Corvane (vaultkeeper), cairn = Marrow
  (gravekeeper), (-3.6,4.4) = Gilder, (3.4,4.8) = Wenna, (-1.2,-14.6) = the Listener, (2.0,-14.4) = Captain
  Renn. Sister Vell (apothecary at `npcSpots.alchemist`) has no model at all. People are in
  `src/data/story/npcs.ts`.
- Monsters: `MonsterVisual` has no family; Enemy.ts (combat) builds via `buildMonsterModel(def.visual, rng,
  sizeScale)` and knows `def.family` and `rank` (bosses go through Enemy with rank 'boss'). Plan: optional
  4th arg `{ family, rank }`, one-line edit in Enemy.ts. Monsters are rigid-bound, one mesh per bone, one
  material each (~17 draw calls per humanoid). Big draw-call win: rebuild as one rigidly weighted
  SkinnedMesh per material (bones have no bind rotation), and re-create the Skeleton per clone.
  HitFlash swaps materials to MeshBasicMaterial, which works with skinning. Leave `RigAnimator` (same file)
  to the animation stream.
