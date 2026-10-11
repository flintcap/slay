# Stream: creatures (every monster and boss body and animation)

Status: in progress

Goal: monsters look and move like Diablo II and Path of Exile monsters:
distinct silhouettes per family, grim materials, heavy and readable motion.
Remake from nothing.

## Milestones

- [x] Inventory and rigs. (creatures: inventory, rigs contract, undead switched on per id) List every monster, boss and mini-boss and its
  family (write it under "Design"). Design new rigs from nothing: humanoid,
  hunched brute, quadruped, spider or insect, serpent, flyer, amorphous, giant.
  Write attach points (mouth, hands, weapon tip, chest) and hit and release
  frame events to `CONTRACTS.md`.
- [x] Undead and humanoid foes. (wip(creatures): humanoid looks (goblins, bandits, cultists, priests, zealots, captain), crossbow aim, capes and tunics) Skeletons, zombies, ghouls, wraiths,
  cultists, bandits, mummies, whatever the list holds.
- [x] Beasts and insects. (wip(creatures): insect looks (drones, hornets, wasps, nurse, beetles, mantis, reaver, tick, spinner, brood spawn, acid larva), soft IK reach, jolt-free foot swing) Wolves, spiders, bats, scorpions, hive things,
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

### Inventory (127 monsters, 24 bosses, mini-bosses promoted from monsters)

| family | n | ids | rigs |
|---|---|---|---|
| undead | 17 | skeleton rattler, archer, warden, duelist, ballista, bone conjurer, crypt/plague ghoul, rotting bloat, corpse hound, wraith, banshee, gravebound knight, grave titan, mortician lich, barrow shade, sepulcher choir | biped, brute, giant, quadruped, specter |
| humanoid | 14 | goblin scrapper, bomber, bandit cutthroat, crossbow, cultist zealot, acolyte, dark priest, inquisitor, troglodyte, sunken zealot, ashen marauder, blood chanter, warlock apostate, iron captain | biped, brute |
| demon | 13 | imp scamperer, fleshripper, hellhound, infernal archer, pit brute, succubus lash, void stalker, ember fiend, soulbinder, chaos maw, balor lieutenant, sin eater, brimstone hulk | biped (digitigrade, tails, wings), quadruped, giant, flyer |
| beast | 14 | dire rat, cave bat, gorge wolf, pack alpha, crag bear, saber prowler, harpy screecher, basilisk, gulper frog, tunnel worm, wyvern whelp, rime stag, ashen lion, chasm leviathan | quadruped, flyer, serpent |
| construct | 13 | scarab drone, animated armor, clockwork sentry, arc pylon, iron golem, forge smith, brass stalker, siege automaton, rune guardian, arcane sentry totem, colossus frame, mercury construct, obsidian warden | insect, biped, giant, spider, floater |
| insect | 13 | hive drone, hornet swarmer, spitter beetle, lance mantis, burrow tick, web spinner, carapace warden, hive nurse, venom wasp, chitin reaver, acid larva, royal guard beetle, broodmother spawn | insect, spider, serpent |
| aberration | 11 | whisper wisp, watcher eye, gazer tyrant, thought eater, tentacle horror, null walker, flesh amalgam, dimensional lurker, star spawn, mirror image, unmaker | swarm, floater, biped, ooze, flyer, giant |
| elemental | 12 | ember wisp, fire elemental, magma hulk, frost shard, ice revenant, lightning wisp, storm djinn, living gale, obsidian elemental, tide caller, void ember, glacier titan | floater, biped, giant, flyer, swarm |
| plant | 10 | spore pod, thorn creeper, strangler vine, bloom cannon, fungal shambler, deathcap priest, blight flower, ancient treant, root horror, corpse bloom | ooze, serpent, floater, biped, giant |
| ooze | 10 | ooze spawn, green slime, acid ooze, tar crawler, gelatinous mass, magma ooze, plague pudding, glass gel, void slime, devourer pudding | ooze |

Bosses (each its own look, 4 to 6 m tall in game): Gharruth the bone king,
Sae-lith broodmother, Grell the butcher, warden Calix, hound master Vess, Ylph
the ooze sovereign, archivist Moln, forgefather Hurn, tidewarden Nheru,
plaguelord Ossik, the gaze of Uln, rimeheart Valdr, the ashen prophet Kaveh,
iron conqueror Malek, treant elder Vhoss, stalker prime Nul, stormcrown
Azhek, hive queen Zsarra, Ordrach the lich of seven seals, magma sovereign
Ixthar, void herald Shessi, Vareth-Kar colossus of the deep, Ghaal the first
devourer, the Gaunt King. Mini-bosses are elite or rare promotions of
monsters: same look, rank rim and glow, plus mini-boss flair.

### How a creature is made

- A look (`src/art/creatures/Look*.ts`, one factory per monster id) picks a
  rig (`Rig.ts`), sculpts its body as signed distance shapes per material
  (`Sculpt.ts`, helpers in `Kit.ts`, weapons in `Arms.ts`), and names its
  materials and motion style.
- `Bake.ts` meshes, decimates, weights and paints it once (vertex colour for
  occlusion and grime, a glow channel for eyes, boils and runes); hard parts
  (teeth, claws, ribs, weapons, eyes) ride one bone rigidly. `Store.ts`
  keeps bakes in IndexedDB so a second visit costs nothing.
- `Materials.ts`: triplanar CC0 scans (bone, flesh, fur, iron...) or drawn
  normals (scales, chitin), painted glow, rank rim light.
- `Animator.ts` plants feet with two-bone IK and calls a poser per rig kind
  (`PoseBiped`, `PoseBeast`, `PoseBug`, `PoseBlob`), driven by `MotionStyle`
  (attacks, spawn, death, idle, gait, heavy).
- Budgets: small/normal/big/boss tiers, about 2.5k/4.5k/6.5k/12k triangles,
  at most three draw calls.
- Tools: `node tools/creature-sheet.mjs <lineup|big|side|poses|game> --ids=...`
  renders sheets; `node tools/check-monster-anim.mjs [--all]` checks motion.

## Next up

1. Constructs (family construct, 13 ids), then elementals (12),
   aberrations (11), plants (10), oozes (10). One `Look<Family>.ts` each,
   registered in `Looks.ts`. Demons are done in `LookDemon.ts` (its
   `fiendLook`, `demonWings`, `horns`, `eyesAt`, `backSpines` are exported
   for reuse). Then tick "Demons, elementals and the rest".
2. Then the 24 bosses (4 to 6 m in game).
3. Corpses that stay (a static skinned copy left at deathT 1, capped), rank
   rims to match nameplates (champion 0x6f8cff, elite 0xf5d76e, rare
   0xffa040), mini-boss flair, boss phase glow.
4. Switch and clean: when every id has a look, delete the old builders in
   `MonsterModels.ts` and `LegacyRigAnimator` in `MonsterAnimation.ts`;
   boss portraits from the new models.

## Notes for resume

- The switch is live per id: `buildMonsterModel` uses the new creature when
  `hasLook(id)` (id found from the visual object by reference), else the old
  builder. `RigAnimator` wraps `CreatureAnimator` or the old animator. Both
  keep the exact old rng draws.
- Bakes run on the main thread at first spawn (about 150 to 500 ms each,
  cold); IndexedDB `slay-creature-meshes` makes repeats free. If floor loads
  stall, move baking to a worker.
- Painted glow smears on coarse meshes. Eyes, boils, gems and candle flames
  are rigid parts (`s.eye`, `s.boil`); keep painted glow for broad soft areas.
- `Enemy.ts` (not ours) sinks bodies after deathT 1 and removes them at 1.45.
  Corpses that stay must be a copy we leave behind, not a change there.
- heroes deleted the old `BodyKit.ts`; `MonsterModels.ts` imports
  `mergeSkinned` and `skinRigid` from `src/art/hero/Skinning.ts`.
- In-game size is look size times the data's `scale` (a dire rat is 0.5,
  a leviathan 2.4). Sculpt at a working size and set `size` on the look so
  the product lands right (`CreatureLook.size`).
- IK hands over to the pose by blending joint turns (`ikW`), so deaths and
  lunges never flip a knee.
- Render one family: `SLAY_PORT=4325 timeout 900 node tools/creature-sheet.mjs lineup --ids=family:<f> --out=<scratch>`;
  `side` and `big` and `poses` sheets take the same ids.
- Crossfades keep momentum: a faded-from pose coasts on with the turn it
  had and eases to a stop (`FADE_COAST`), so a fade never freezes a limb.
- Phases whose rate changes with speed go through `a.spin(slot, rate)`
  (integrated), never `time * rate`, which jumps when the rate changes.
  Slots in use: 0 flyer wingbeat, 1 quadruped tail wag, 2 serpent drift.
- Glowing cracks (`veins` paint) look like blotches on coarse meshes: keep
  `cut` at 0.93 or more and glow at 0.7 or less.
- A biped's second arm pair (`arms2`) shadows the first (`echo`) in
  `PoseBiped.ts`.
- `node <scratch>/run-ssr.mjs <scratch>/cr_trace2.ts <id> <bone> <step>`
  replays check-monster-anim and prints one bone's per-frame jump (keep a
  copy of it in the scratchpad if you need it; it is not in the repo).
- Do not change monster stats or counts. Never make monsters weaker or fewer.
