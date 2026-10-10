# Stream: heroes (player bodies, faces, skeleton, animation, worn armour)

Status: in progress

Goal: every class looks and moves like a Diablo II or Path of Exile hero.
Whole body, face, walk, attacks: remade from nothing. Delete the old body kit
and animator when done.

## Milestones

- [x] Rig and design. (`heroes: hero rig contract and design`; the old rig goes with the old body in "Switch and clean") Pick each class's silhouette and look (write it under
  "Design"). Define the new skeleton: bone names, hierarchy, rest pose,
  sockets (main hand, off hand, back, belt, head, chest). Write it to
  `CONTRACTS.md` before anything else, because items, npcs and vfx depend on
  it. Keep the hit frame and release frame events.
- [x] Body. (`heroes: new hero body, skinned, textured, dressed`; not switched on yet, the old body goes in "Switch and clean") One continuous skinned mesh per body type with smooth weights and
  real proportions (about 7.5 heads tall, broad shoulders, hands and feet with
  shape). Male and female bodies, build varied per class. PBR skin, cloth and
  leather from CC0 textures under `public/assets/textures/hero/`.
- [x] Head and face. (`heroes: hair, brows, beards, hood and mask grown from the head`; helmets are fitted in Worn armour, where hair hides under them) Brow, eye sockets, nose, cheekbones, jaw, ears; eyes
  that catch light; hair and beards as real shapes; helmets fit over them.
- [x] Worn armour. (`heroes: armour grown on the hero from ItemLook`; cape bones swing once the new animator drives them in Locomotion; not switched on yet) Chest, shoulders, gloves, boots, belt, helmet, cape (with
  sway), drawn on the new body from items' `ItemLook`. Bare and fully
  geared both look right. Until items' ItemLook lands, use the current one.
- [x] Locomotion. (`heroes: hero animator with planted feet, stances and cape swing`; not switched on yet, the game still runs the old animator until "Switch and clean") New animator from nothing: idle with breathing and weight
  shift, walk, run, turn in place, start and stop, feet planted (no sliding),
  stance per weapon (one hand, two hand, dual, staff, bow, shield).
- [x] Combat moves. (`heroes: combat moves per weapon, placed hands, action steps`; not switched on yet) Attacks per weapon kind (sword, axe, mace, dagger, spear,
  two-handed, staff, wand, bow, shield bash, unarmed), combo chains, casts
  (aimed, self, ground), channel, dodge, hit react, stun, knockdown, death.
  Anticipation, weight and follow-through. Hit and release frames match
  `src/entities/Abilities.ts` and `src/scenes/SkillRunner.ts`.
- [ ] Switch and clean. Character select, paperdoll, town and dungeon all use
  the new hero. Delete `BodyKit.ts`, the old `Animation.ts` clips and every
  reference. Class portraits redrawn from the new models.

## Checkers

`check-body`, `check-clips`, `check-footplant`, `check-grips`, `check-equip`,
`check-gear-visuals`, `tools/art-sheet.mjs`. Update or replace them as the
new system lands.

New: `SLAY_PORT=4324 timeout 900 node tools/check-hero.mjs` (heights, soles,
skin weights, budgets, eyes, cache). Sheets to look at:
`node tools/hero-sheet.mjs bodies,faces,extremities,poses [--class=...]`.

## Design

The bar: a Diablo II or Path of Exile hero, read from a steep camera at
fifteen metres. Silhouette and motion first, surface second.

**How a body is made.** Each body is one signed distance field (ellipsoids,
tapered capsules and muscle masses blended with smooth unions), meshed with
sparse surface nets and simplified with quadric edge collapse. No more
capsules joined by balls: one continuous skin from scalp to toe. The head and
hands are meshed at finer resolution with a small overlap at the neck and
wrist so the face and fingers hold their shape. Skin weights come from the
bone segments, gated by body region (an arm never claims the ribs) and
smoothed across each joint. Armour is cut from the same field grown outward,
so every piece fits every body.

**Surface.** PBR materials with CC0 photo detail (skin pores, linen weave,
leather grain, metal) projected triplanar in rest-pose space, so the texture
sticks to the skin as it bends. Eyes are separate glossy spheres that catch
the light.

**Skeleton.** 28 bones, A-pose bind, identity bind rotations; see "Hero rig"
in `CONTRACTS.md`. Proportions in heads: 7.5 heads tall.

**Classes.**

| Class | Body | Read at game camera | Hair and face |
| --- | --- | --- | --- |
| Warden | Male, 1.88 m, heavy (build 0.9), broad shoulders | A wall: wide, square, planted, shield forward | Short crop, full beard, heavy brow, broken nose |
| Pyromancer | Female, 1.74 m, lean (0.25), narrow shoulders | Upright and tall, long fall of copper hair | Long loose copper hair, high cheekbones |
| Shadowblade | Female, 1.72 m, athletic (0.4) | Low and forward-leaning, hood and mask, two blades | Hood up, cloth mask, black hair in a knot |
| Stormcaller | Male, 1.84 m, wiry (0.35), long limbs | Tall and straight with a staff, braids | Grey-blue braids, short beard, lined face |
| Revenant | Male, 1.84 m, wasted (wasted 0.85) | A spindle of bone and sinew, hunched, glowing eyes | Bare skull face, sunken sockets, green eye glow |
| Ranger | Female, 1.76 m, athletic (0.45) | Long stride, bow in the left hand, ponytail | Fair ponytail, freckled, strong jaw |

**Motion.** A new animator: procedural gait with real stride length (feet
planted, stride from ground speed so nothing slides), two-bone leg IK onto
the ground, idle with breathing and weight shift, start/stop and turn-in-place
steps, a stance per weapon. Actions are key poses with anticipation, a fast
contact and a heavy follow-through, time-warped so the hit or release frame
lands exactly on the game's contact time.

## Next up

1. Switch and clean. Character select, paperdoll, town and dungeon build
   `buildHero` + `HeroAnimator` (via `src/scenes/HeroModel.ts`), hold weapons
   with `holdItem`, and pass the weapon category to `setWeapon(grip,
   category)` so spears pick the spear chain. Call `loadMeshCache()` at boot.
   Then delete `BodyKit.ts`, the old `Animation.ts` and every reference (keep
   what `NpcModels.ts`, `Town` and `MonsterModels.ts` import working:
   `Skinning.ts` has `mergeSkinned`/`skinRigid` replacements), update the old
   tools that import the old animator, redraw portraits, and show zero grep
   hits for the old names in the commit.

Render: `SLAY_PORT=4324 timeout 900 node tools/hero-sheet.mjs bodies,faces,extremities,poses,gear,clips,stances [--class=warden] [--kit=plate] [--rarity=unique] [--stance=shield]`
writes `shots/heroes/*.png` in seconds. Check: `node tools/check-hero.mjs`.
Actions: `hero-sheet.mjs actions --class=warden --stance=oneHand [--weapon=axe]
--actions=attack1#0,attack1#1,slam` (two views a row, contact frame
outlined, a post where the foe stands); `probe` prints hand and blade per key.

## Notes for resume

- Animator (`src/art/hero/Animator.ts`, `HeroAnimator(bones)`): poses are
  channels (`Pose.ts`: three angles per bone in a fixed convention, plus
  pelvis offset, leg IK weight, off-hand grip). Layers: stance
  (`Stances.ts`) -> stride or idle (in `buildPose`) -> action
  (`Actions.ts`, Hermite curve through key poses, time-warped to `contact`)
  -> flinch. Then `solve()`: FK, pelvis dropped until feet reach, leg IK
  (`Ik.ts`), off hand onto the main hand's grip. Feet (`Gait.ts`) live in
  world space; planted feet never move (check-hero measures 0.0 mm drift on
  every class). Cape bones under the chest are found automatically and
  swung by `Secondary.ts`. Costs about 45-80 us a frame. `setWeapon(grip)` plus
  `setOffHand('shield' | 'weapon')` pick the stance; `Hold.ts` puts items in
  hand sockets with the grip turn (reverse grip for daggers).

- Actions (`Actions.ts`): `actionFor(name, kind, combo)` where
  `moveKind(stance, grip, category)` picks the chain (blade, axe, mace,
  dagger, dual, spear, great, staff, wand, bow, shield, unarmed); blows in a
  row within 1 s walk the chain. Sword, axe, mace, two-hander, staff and
  spear blows place the hand (`Pose.reach`: grip position and weapon
  pointing, character space, carried by the pelvis offset) and the animator
  solves the arm (`reachArm`): hand turned to point the weapon, elbow where
  the wrist stays natural. Keys without a reach are filled from where their
  angles put the hand, so the curve runs through. Daggers, fists and
  gestures still use arm angles. `steps` move a foot inside an action
  (`Gait.actionStep`); `legIk` below 1 (roll, falls) re-places the feet under
  the body. check-hero times every hit/release on every weapon: within one
  frame of `contact`.

- Armour (`Armour.ts`): `wearArmour(hero, slot, item, visual)` returns
  `{ object, hides }`; call `setHeroHidden(hero, hides)` and
  `removeArmour(worn)` to take it off. First dressing costs 1-4 s per kit
  (meshing); repeat costs nothing (memory + IndexedDB). If that hitch shows
  in play, move meshing to a worker (specs would need to be declarative:
  today cuts and thickness are closures).

- New hero code lives in `src/art/hero/`: `Rig` (bones, sockets), `Sdf`
  (field), `Mesher` (surface nets), `Decimate` (QEM), `Anatomy` (body and
  head field), `Skinning`, `Body` (three-resolution mesh: trunk coarse, head
  and hands fine, overlapping at neck and wrist with tucked seams), `Garment`
  (body field pushed out and cut by planes), `HeroMaterials` (triplanar in
  bind space; skin pores painted in code, cloth from `textures/hero/*`),
  `Eyes`, `Looks` (per class), `Hero` (`buildHero(look)`).
- Textures: `node tools/fetch-hero-textures.mjs` (Poly Haven CC0, rows in
  ASSETS.md).
- A body costs 2-3 s to mesh in the browser (dominated by surface nets on the
  trunk and QEM). Parts are cached in memory and in IndexedDB
  (`MeshCache.ts`, keyed by a hash of the field; bump `MESH_VERSION` when the
  mesher, weights or painting change). Call `loadMeshCache()` at boot.

- items runs at the same time and owns `ItemLook`. Read their contract in
  `CONTRACTS.md`; do not edit their files.
- Held items: grip at origin, business end along +Y, wide on X, thin on Z.
