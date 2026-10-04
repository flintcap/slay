# Stream: models (how bodies and worn gear look)

Status: in progress

## Milestones

- [x] Player bodies: better proportions, anatomy and silhouette per class; faces and hair with character; materials with real skin, cloth, leather and metal response. ("Models: real bodies and armour cut to fit them")
- [x] Equipped gear on the body: helm, chest, gloves, boots, belt and shield show the actual item worn. Shape, material and ornament change with the item's base, tier and rarity, so upgrading visibly changes your character. Uniques and sets look unique. ("Models: real bodies and armour cut to fit them")
- [x] Monster looks: a distinct, readable silhouette per family, more detail and material variety, elites and champions visibly tougher, bosses that look like bosses. ("Models: monsters by family and rank, one skinned mesh per material")
- [x] Town NPCs: each camp NPC built for their role (smith, vendor, healer, stash keeper and the rest), with clothing and props that say who they are. ("Models: every camp resident built for their trade")
- [ ] Level of detail and budgets: far-away models get cheaper, crowds of monsters stay smooth, nothing visibly pops.
- [ ] Sweep: a turntable render of every class in low, mid and top gear, every monster family and every NPC, checked for clipping, floating parts and style drift.

## Next up

Milestone 5, level of detail and budgets. Concretely:
1. Monsters: build a second, cheaper prototype per cache key (fewer lathe/sphere segments, no `alt` and
   `rank` dressing below a size threshold, no weapon detail) and swap a monster's meshes to it beyond
   ~22 m from the camera, with a small hysteresis band so nothing pops back and forth. Do it inside
   `MonsterModels.ts` (e.g. a `setMonsterDetail(root, far)` the scene calls, or a `THREE.LOD`-like switch
   driven from `RigAnimator.update`), and keep both levels on the same skeleton so animation is shared.
2. Characters: held weapons and shields from `ItemModels` cost one draw call per part (5-15 each). Merge a
   socketed model's meshes by material once it is attached (in `attachToSocket`'s caller side, not in the
   grip code, which is the animation stream's), or ask art to merge in `buildItemModel`.
3. Measure with the `classes` and `monsters` sheets (they print tris and draw calls) and record budgets
   here: player top gear under 40 calls, monster under 6, NPC under 25.

## Notes for resume

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
- `RigAnimator` is untouched and still lives here. Animation stream: when monster motion moves to
  `src/art/MonsterAnimation.ts`, change the class here to `export { RigAnimator } from
  '../art/MonsterAnimation'` (models agrees in advance); it only touches bones, so skinning is fine.

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

Requests to other streams:
- art: adopt `GearLook.gearLook` for trim/set colour in `ItemModels` (see above).
- feel (`SkillRunner.ts` summons): once monsters are skinned (milestone 3), call `releaseMonsterModel(root)`
  when a summon's model is thrown away, or its skeleton's bone texture leaks.
- world (`Palettes.ts`): a smooth `skin.*` palette without speckle/stain passes would let skin use its
  albedo map again; today `CharacterModels.skinMaterial` drops the map.
