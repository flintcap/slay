# Stream: creatures (every monster and boss body and animation)

Status: not started

Goal: monsters look and move like Diablo II and Path of Exile monsters:
distinct silhouettes per family, grim materials, heavy and readable motion.
Remake from nothing.

## Milestones

- [ ] Inventory and rigs. List every monster, boss and mini-boss and its
  family (write it under "Design"). Design new rigs from nothing: humanoid,
  hunched brute, quadruped, spider or insect, serpent, flyer, amorphous, giant.
  Write attach points (mouth, hands, weapon tip, chest) and hit and release
  frame events to `CONTRACTS.md`.
- [ ] Undead and humanoid foes. Skeletons, zombies, ghouls, wraiths,
  cultists, bandits, mummies, whatever the list holds.
- [ ] Beasts and insects. Wolves, spiders, bats, scorpions, hive things,
  swamp creatures.
- [ ] Demons, elementals and the rest. Imps, hellhounds, golems, frost and
  fire things, void things.
- [ ] Animation. Per rig: idle, walk, run, two or more attacks, cast, hit,
  stagger, death (a real fall, then the body stays), spawn (climb from the
  ground, drop from above).
- [ ] Bosses and mini-bosses. Each boss unique, large, with a silhouette you
  know at a glance, phase changes you can see.
- [ ] Ranks and affixes. Champion, elite, rare and affix looks (tints, auras,
  size) that read at a glance without hiding the model.
- [ ] Switch and clean. Delete old `MonsterModels.ts` builders and the old
  `MonsterAnimation.ts` and every reference. Boss portraits redrawn from the
  new models.

## Checkers

`check-monster-anim`, `check-bosses`, `tools/art-sheet.mjs`; add a monster
sheet render if there is none.

## Design

(to be written in milestone 1)

## Next up

1. Run Setup in `docs/remake/PROTOCOL.md`.
2. Read `src/entities/MonsterModels.ts` (`buildMonsterModel`, `Archetype`),
   `src/art/MonsterAnimation.ts` (`RigAnimator`), `src/data/monsters.ts`,
   `src/data/bosses.ts`, and how `src/entities/Enemy.ts` drives them.
3. Write the inventory and rigs, push, then start on undead.

## Notes for resume

- maps may have added biomes and moved families; read `src/data/monsters.ts`
  and the biome list fresh.
- Do not change monster stats or counts. Never make monsters weaker or fewer.
