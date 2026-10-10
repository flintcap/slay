# Stream: heroes (player bodies, faces, skeleton, animation, worn armour)

Status: not started

Goal: every class looks and moves like a Diablo II or Path of Exile hero.
Whole body, face, walk, attacks: remade from nothing. Delete the old body kit
and animator when done.

## Milestones

- [ ] Rig and design. Pick each class's silhouette and look (write it under
  "Design"). Define the new skeleton: bone names, hierarchy, rest pose,
  sockets (main hand, off hand, back, belt, head, chest). Write it to
  `CONTRACTS.md` before anything else, because items, npcs and vfx depend on
  it. Keep the hit frame and release frame events.
- [ ] Body. One continuous skinned mesh per body type with smooth weights and
  real proportions (about 7.5 heads tall, broad shoulders, hands and feet with
  shape). Male and female bodies, build varied per class. PBR skin, cloth and
  leather from CC0 textures under `public/assets/textures/hero/`.
- [ ] Head and face. Brow, eye sockets, nose, cheekbones, jaw, ears; eyes
  that catch light; hair and beards as real shapes; helmets fit over them.
- [ ] Worn armour. Chest, shoulders, gloves, boots, belt, helmet, cape (with
  sway), drawn on the new body from items' `ItemLook`. Bare and fully
  geared both look right. Until items' ItemLook lands, use the current one.
- [ ] Locomotion. New animator from nothing: idle with breathing and weight
  shift, walk, run, turn in place, start and stop, feet planted (no sliding),
  stance per weapon (one hand, two hand, dual, staff, bow, shield).
- [ ] Combat moves. Attacks per weapon kind (sword, axe, mace, dagger, spear,
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

## Design

(to be written in milestone 1)

## Next up

1. Run Setup in `docs/remake/PROTOCOL.md`.
2. Read `src/art/CharacterModels.ts`, `BodyKit.ts`, `Animation.ts`
   (`ClipName`, `Animator`, `PlayOpts`), `WornGear.ts`, `src/scenes/HeroModel.ts`,
   and how `src/entities/Player.ts` and `Abilities.ts` call the animator.
3. Write the rig to `CONTRACTS.md` and push it before building the body.

## Notes for resume

- items runs at the same time and owns `ItemLook`. Read their contract in
  `CONTRACTS.md`; do not edit their files.
- Held items: grip at origin, business end along +Y, wide on X, thin on Z.
