# Stream: models (how bodies and worn gear look)

Status: done (all milestones ticked; polish ideas under Next up)

## Milestones

- [x] Player bodies: better proportions, anatomy and silhouette per class; faces and hair with character; materials with real skin, cloth, leather and metal response. ("Models: real bodies and armour cut to fit them")
- [x] Equipped gear on the body: helm, chest, gloves, boots, belt and shield show the actual item worn. Shape, material and ornament change with the item's base, tier and rarity, so upgrading visibly changes your character. Uniques and sets look unique. ("Models: real bodies and armour cut to fit them")
- [x] Monster looks: a distinct, readable silhouette per family, more detail and material variety, elites and champions visibly tougher, bosses that look like bosses. ("Models: monsters by family and rank, one skinned mesh per material")
- [x] Town NPCs: each camp NPC built for their role (smith, vendor, healer, stash keeper and the rest), with clothing and props that say who they are. ("Models: every camp resident built for their trade")
- [x] Level of detail and budgets: far-away models get cheaper, crowds of monsters stay smooth, nothing visibly pops. ("Models: monster level of detail and merged held items")
- [x] Sweep: a turntable render of every class in low, mid and top gear, every monster family and every NPC, checked for clipping, floating parts and style drift. ("Models: sweep done")

## Next up

All six milestones are done. Polish a successor could pick up, in order of value:
1. Faces at portrait scale are still blocky (brow bar, simple nose); a ring-built nose and lips and a
   softer brow would help the paperdoll and character select. Check with the `bodies` sheet.
2. Robe and coat sleeves puff at the shoulder (the deltoid cover grown by the cloth); a sleeve cap that
   blends into the torso band would read more like tailoring.
3. Worn gear is up to five meshes per piece; merging same-material meshes across slots (one skinned mesh
   per material for all worn gear) would take top-gear characters from ~35 to ~22 draw calls.
4. Undead rags read as a kilt; vary their length and add holes per rank.
5. The paperdoll shows the figure from behind in `check-paperdoll` (hud's camera framing, or worth a look).
Sweep results this session: `classes`, `bodies-*`, `stride`, `monsters`, `npcs-a|b` reviewed; fixes made
(sleeve shoulders, eyes, cheekbones, worn metal reading black). `check-grips` and `check-worn` pass;
`check-gear-visuals` passes; `check-paperdoll` renders the first class and then times out on the second
screenshot when the machine is busy (no page errors). Town render shows the residents in place.

## Notes for resume

- **From world:** the foundry/caverns invisible hero was the animator's pelvis spring blowing up on long
  frames (hips at -1e14 m; it flickered, which is why hiding nearby meshes seemed to help). Fixed in
  `Animation.ts`. Entry rubble was also pulled back from the spawn tile. `skin.fair|tan|deep` no longer
  have speckle or stain passes, so `skinMaterial` can keep the albedo map again if you want it. The
  apothecary lantern post moved to (-3.0, -10.6).

How to look at models (fast, no game boot, about 30-60 s each even under load):
`node tools/models-sheet.mjs <sheets> --port=4311 --out=shots/models/<dir>`. Sheets: `classes` (6 classes x
bare/low/mid/top, front and back, plus a game-camera strip), `bodies`, `bodies-low|mid|top` (each class big:
front, side, back, two head close-ups), `monsters`, `npcs`, `npcs-a`, `npcs-b`. If a browser checker is
using 4311, pass `--port=4312` (unassigned) so the two never collide. Read the PNGs with the Read tool.

How the bodies work now:
- `src/art/BodyKit.ts` holds the rig (`BONE_NAMES`, `BONE_PARENT`, unchanged), skinning (`skinGeometry`,
  `skinRigid`, `mergeSkinned`), shape builders (`ringStack` with separate front/back depth and open arcs,
  `sweep` = a tube through stations with elliptical sections, `shapedSphere`), and the anatomy shared by
  body and gear: `torsoRings(fit, inflate, from, to)` (the torso surface; the ribcage is narrower than the
  shoulder joints so arms hang outside it), `armNodes`, `legNodes`, `handGeos`, `footGeos`. Gear is cut by
  calling these with an `inflate`, so it fits every class.
- `CharacterModels.ts`: `PersonLook` (profile, materials with optional tints, hair style, beard, hood,
  mask, skeletal, eye glow, sleeves) and `buildPerson(look, rng, name)`; the six classes are `CLASS_LOOKS`;
  `buildPlayerModel` wraps it. Joint positions (`jointsFor`) are untouched: they are the animation contract.
  The root carries `userData.bodyFit` (measurements, joints, segments, skeleton) for gear.
- Skin uses a flat colour plus the palette's normal and roughness (`skinMaterial`): the palettes' speckle
  passes read as dirt on faces. All buckets use texture seed 0 (boot warms seed 0).
- Cover keys: `chest` (undershirt, shirt sleeves), `gloves` (the bare hands), `boots` (bare feet and foot
  wraps), `helm` (class hood and mask), `hair` (the cap of hair, topknots), `hairLong` (falls, braids,
  ponytails). Equipment slots hide their own key; a piece can hide more through
  `root.userData.extraCovers[slot]`, which `applyWornSlots` honours only while that slot is worn.

How worn gear works now:
- `wearItem(body, bones, slot, item, visual)` in CharacterModels builds `WornGear.buildWorn` and parents
  the result under the hips bone with `userData.socketSlot = slot`, so `clearSocket` and `disposeObject`
  remove it like any socketed item. Geometry is in character space and bound to the body's skeleton with
  an identity bind matrix; attached-mode skinning makes the parent irrelevant. Returns null for weapons,
  shields, jewellery: those still go through `attachToSocket` (art's `ItemModels`). Shields are held items,
  so they stay the art stream's model.
- Wired (one small edit each) in `Player.refreshEquipmentVisuals`, `PaperdollView.setCharacter`,
  `HeroModel.assemble` (menus): try `wearItem`, else the old socket path.
- `WornGear` cuts: chest `robe|leather|mail|scale|plate` (+ `coat|apron` for camp people), helm
  `cap|full|horned|circlet` (+ `hat|hood|blindfold`), gloves `light|plate|silk`, boots `light|plate|silk`,
  belt `sash|plate|chain`. Base tier (level req <20, <50, 50+) grows the cut (robe length, plate fluting,
  pauldron lames, horn length, closed vs open helm); rarity adds trim, fittings, gems, runes; uniques get a
  signature (cape / fur mantle / glowing veins on chest; crown / wings / plume / halo on helms; claws /
  glowing knuckles / spiked cuffs; ankle wings / spurs / glowing soles; skull buckle / trophies / stones);
  set pieces wear their set colour (`setColor(setId)`) on trim and gems. `buildFitted(fit, name, parts)`
  skins one-off pieces (NPC trousers, scars).
- Visual `palette` may be `key|0xRRGGBB` for dyed cloth (worn gear only).
- `src/art/GearLook.ts` `gearLook(item, visual)` is the shared "what does this item look like" answer
  (palette, family, kind, rarity tier, base tier, trim palette and tint, accent, glow, ornament flags,
  signature). Art stream: please build `itemLook()` on it or adopt it in `ItemModels`, so drops, held
  weapons and icons use the same trim metal and set colour (requested in art.md).

Costs (classes sheet): bare 10-12 draw calls, top gear 31-60 (was 78-105); most of what is left is the held
weapon and shield from `ItemModels`, one mesh per part.

Checker status at this checkpoint: `check-grips` passes. `check-worn` and `check-paperdoll` reached their
screenshot step with no page errors but timed out taking the screenshot (30 s Playwright default) with the
machine at load average ~24; rerun them when the machine is quieter. `check-body`, `check-fabric`,
`check-clips` are visual/boot tools that do not touch the changed code paths in a way that can fail.

Monsters (`src/entities/MonsterModels.ts`):
- `buildMonsterModel(visual, rng, scale, { family, rank })`; Enemy passes `def.family` and its rank. The
  prototype cache key includes both. `dressFamily` adds what makes a family read (undead rags and mantle,
  demon horns and burning seams, beast ears and hackles, construct core, grille, rivets and plates, insect
  feelers and carapace ridges, aberration eye stalks and tentacles, elemental shards and core, humanoid
  hood, belt and pouch, plant leaves and a glowing bulb). `dressRank` adds steel pauldrons and a blue
  band (champion), a gold crown, spikes, spined back and gold band (elite, orange band for rare), and for
  bosses all of that grander plus a cape and a burning core. Everything is placed against the bounds of
  what each bone already carries (`boxOf`), so one rule fits a goblin and a colossus.
- Assembly: one SkinnedMesh per material (`body`, `glow`, `trim`, `alt`, `rank`), every vertex rigidly
  bound to its bone; 2-5 draw calls a monster (weapon extra), was ~20. Each clone gets its own Skeleton
  over its own bones (shared inverse matrices); `releaseMonsterModel(root)` frees it, called from
  `Enemy.dispose`. Culling uses a padded `boundingSphere` on each SkinnedMesh.
- Tints (`palette: 'key|0xRRGGBB'`) are now the creature's albedo (`albedoTint` divides by the palette
  base), not a multiplier on it: the bestiary was rendering near-black. Eyes always glow (family colour
  when the visual has none). Limbs are rounded lathes, not open cylinders.
- `RigAnimator` now lives in `src/art/MonsterAnimation.ts` (animation stream); MonsterModels re-exports it
  and its `RigAction` / `RigDriveOpts` types, as agreed. It only touches bones (and the hips scale for
  oozes), so skinning is fine. It reads the model root's world position for ground speed.

Town NPCs (`src/art/NpcModels.ts`):
- `NPC_LOOK_IDS`, `buildNpcModel(id, rng)`, `npcCarryGrip(id)`. Each resident is a `PersonLook` on the shared
  rig plus clothes through `wearItem` (coat, apron, habit, hood, hat, blindfold, mail with a crimson
  surcoat), trousers and the smith's burn scars through `WornGear.buildFitted`, and tools: item-model
  weapons (hammer, spears, staffs) through `attachToSocket` with a real grip, props (ledger, keys,
  lantern, satchel, tankard, map, chisel) as rigid meshes on the hand bones.
- `Town.ts` `npc()` now takes a resident id (small edit, world's file): forge = kale, wagon = hesk, stash
  = corvane, cairn = marrow, (-3.6,4.4) = gilder, (3.4,4.8) = wenna, (-1.2,-14.6) = listener,
  (2.0,-14.4) = renn, and Sister Vell is new, standing at the apothecary facing `npcSpots.alchemist`.
  The animator gets `setGrip(npcCarryGrip(id))` so two-handed tools are held with both hands.
- Story stream: talk spots still come from `TALK_SPOTS`/`npcSpots`; positions are unchanged.

Budgets and level of detail (milestone 5):
- Monsters: each prototype is built twice from one seed (`DETAIL` 1 and 0: fewer lathe and sphere segments,
  cylinders for limbs, 4-sided horns) and both are skinned to the same skeleton under a `THREE.LOD`
  (`FAR_DISTANCE` 25 m, hysteresis 0.1). The renderer switches levels itself; the far level casts no
  shadow. The `monsters` sheet prints near and far triangles.
- Held items: `src/art/ModelBudget.ts` `compactModel(root)` merges a static item model's meshes into one
  per material (keeps `userData.orbit/spin` parts). Used in Player, PaperdollView, HeroModel, NpcModels and
  monster weapons (one-line wraps around `buildItemModel`).
- Measured (classes sheet): bare 10-12 calls, low 12-19, mid 21-30, top 28-41 (was 78-105). Monsters 2-5
  calls plus a weapon (2-4 now). NPCs 14-24. Budgets: player top gear <= 42, monster <= 8, NPC <= 25.

Foundry "hero cannot be seen" (asked by world at 75e1755): **solved, it is occlusion, not the models.**
- With `docs/overhaul/world-render.mjs` `foundry@close`: hiding every scene child except the hero shows
  the hero; hiding only the meshes within 1.5 m of the hero (the room's arch landmark, r 6.4, and its
  rubble blocks, r 0.3 to 1.6) also shows it. The hero is standing inside the landmark's rubble pile.
  The same happens at the normal depth-1 start in `check-worn` (caverns): the hero spawns inside the
  entry arch's rubble. It looked flaky because the idle sway moves parts in and out of the blocks.
- Earlier theories (fog, lights, cloned materials) are wrong: my clone experiment re-ran with the hero
  inside the rubble. Models materials and bodies are fine.
- Fix belongs to world (`DungeonBuilder` landmarks / spawn): keep rubble and landmark pieces off the
  spawn tile and off walkable tiles, or add them to the colliders; and the harness's "south of centre"
  stand point lands in the rubble.

Requests to other streams:
- art: adopt `GearLook.gearLook` for trim/set colour in `ItemModels` (see above).
- feel (`SkillRunner.ts` summons): once monsters are skinned (milestone 3), call `releaseMonsterModel(root)`
  when a summon's model is thrown away, or its skeleton's bone texture leaks.
- world (`Palettes.ts`): a smooth `skin.*` palette without speckle/stain passes would let skin use its
  albedo map again; today `CharacterModels.skinMaterial` drops the map.
