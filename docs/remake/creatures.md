# Stream: creatures (every monster and boss body and animation)

Status: done

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
- [x] Demons, elementals and the rest. (wip(creatures): ooze looks (spawn, slimes, tar, gelatinous cube, magma, plague, glass, void, devourer)) Imps, hellhounds, golems, frost and
  fire things, void things.
- [x] Animation. (wip(creatures): bodies stay where they fall; rank rims in plate colours; mini-boss crown; boss phases burn hotter) Per rig: idle, walk, run, two or more attacks, cast, hit,
  stagger, death (a real fall, then the body stays), spawn (climb from the
  ground, drop from above).
- [x] Bosses and mini-bosses. (wip(creatures): all 24 boss looks, sized 4 to 6 m by scale; bosses in the anim check) Each boss unique, large, with a silhouette you
  know at a glance, phase changes you can see.
- [x] Ranks and affixes. (wip(creatures): bodies stay where they fall; rank rims in plate colours; mini-boss crown; boss phases burn hotter) Champion, elite, rare and affix looks (tints, auras,
  size) that read at a glance without hiding the model.
- [x] Switch and clean. (creatures: switch every monster to its creature body; delete the old builders and the old animator; creatures: boss portraits rendered from the boss bodies, in an iron medallion, ready before the fight) Delete old `MonsterModels.ts` builders and the old
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

## Handover

What exists now:

- Every monster (127) and boss (24) is a creature: a look per id in
  `src/art/creatures/Look*.ts` (rig, SDF sculpt, materials, motion style),
  baked once into one to three skinned meshes (`Creature.ts`, `Bake.ts`,
  IndexedDB cache in `Store.ts`) and instanced per spawn. Ids with no look
  of their own would get `genericLook` (none today).
- Motion: `Animator.ts` (`CreatureAnimator`, and the `RigAnimator` face the
  game holds) with per-rig posers (`Pose*.ts`): IK feet, idles, gaits, two
  or more attacks, casts, hits, staggers, real falls, spawns from the
  ground or from above.
- Bodies stay where they fall (`leaveCorpse`, 36 kept). Rank rims in the
  nameplate colours, a mini-boss crown, boss phases burn hotter.
- `src/entities/MonsterModels.ts` is now only the door: archetypes,
  `buildMonsterModel` (exact old rng draws), release and dispose. The old
  builders and `src/art/MonsterAnimation.ts` are gone.
- Boss portraits are rendered from the boss bodies (`BossPortraits.ts`),
  prepared when the boss is built, cached in localStorage.
- Tools: `creature-sheet.mjs` (`lineup`, `game`, `big`, `side`, `poses`,
  `ranks`), `check-monster-anim.mjs` (monsters and bosses),
  `art-sheet.mjs bosses` (portraits).

Left for `finish`:

- Polish: ashen prophet's wings read as planks, hive queen's wings are dim,
  stalker prime is plain, glacier fists, the djinn is dark.
- Some boss bodies run 13k to 18.7k triangles (budget 12k); one boss is on
  screen at a time, so it is safe, but they could be trimmed.
- First bakes on a cold cache take 150 to 500 ms per monster and 0.6 to
  2.9 s per boss on the main thread; a worker would hide them.
- A boss portrait opens a second WebGL context once per boss (then cached);
  if that ever hitches, render it with the main renderer instead.

## Notes for resume

- `buildMonsterModel` always builds the creature (look found from the
  visual object by reference, else the generic look). `RigAnimator` wraps
  `CreatureAnimator`. Both keep the exact old rng draws.
- Bakes run on the main thread at first spawn (about 150 to 500 ms each,
  cold); IndexedDB `slay-creature-meshes` makes repeats free. If floor loads
  stall, move baking to a worker.
- Painted glow smears on coarse meshes. Eyes, boils, gems and candle flames
  are rigid parts (`s.eye`, `s.boil`); keep painted glow for broad soft areas.
- `Enemy.ts` (not ours) sinks bodies after deathT 1 and removes them at 1.45.
  The animator leaves a frozen copy (`leaveCorpse` in `Creature.ts`) in the
  scene at deathT 1 and hides the live body; 36 stay, oldest cleared first,
  all cleared by `disposeCreatures`. Ghosts (`fade`), swarms and hovering
  wisps leave nothing.
- Rank rims use the nameplate colours (`RANK_RIM`); the boss rim is soft
  (.28) so boss colours survive. Mini-bosses get a spiked crown on the
  head socket (`miniBossFlair`, from `MiniBoss.ts`). Boss phases swap to
  private hotter materials (`heatCreature`, from `setPhase`).
- `creature-sheet.mjs ranks --ids=...` renders normal, champion, elite,
  rare, mini-boss and corpse side by side.
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
  `cut` at 0.95 or more and glow at 0.45 or less, or leave them out.
- A biped's second arm pair (`arms2`) shadows the first (`echo`) in
  `PoseBiped.ts`.
- `node <scratch>/run-ssr.mjs <scratch>/cr_trace2.ts <id> <bone> <step>`
  replays check-monster-anim and prints one bone's per-frame jump (keep a
  copy of it in the scratchpad if you need it; it is not in the repo).
- Some scans render dark under a tint (`flesh`, `stone`): for a true
  colour use `ice` or `crystal` with a `rough` override on the mat, or
  paint `base` above 1.
- Floater orbits use spin slot 3; ooze heave slot 4; swarm motes use
  slots 8 and up. `a.strideRate` gives the gait's cycles per second.
- Crossfades also carry the root squash and spread, so a fade from a
  squashed pose does not snap.
- Fast strikes pop on small or low bodies (the check divides by hip
  height). Scale the wind and hit ramps by `heavy` (see `fast` in
  `poseOoze`, `go` in `poseSerpent`) and keep throws small.
- The `jelly` surface (opacity 0.5) shows rigid parts sunk inside it (the
  gelatinous cube's skeleton).
- Do not change monster stats or counts. Never make monsters weaker or fewer.
