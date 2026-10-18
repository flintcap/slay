# Stream: speed (Wave 4: smooth and fast on WebGPU)

Status: in progress (part 2)

Goal: high, steady frame rate and short loads with no frozen browser. The
owner reports town loads of 20 to 25 s and map loads of 50 to 60 s with the
browser frozen, and low FPS. Never change gameplay, stats or monster counts.
WebGPU only: never add WebGL2 paths or compare against them. This VM renders
in software, so judge GPU work by draw calls, triangles and shader counts,
judge CPU work by measured ms, and leave real-GPU FPS to the owner.

Checkers: `node tools/run-checks.mjs` (only the ones your change can break),
`tools/check-lag.mjs`, `tools/check-perf.mjs`, `tools/check-frames.mjs`
(browser, one at a time, inside `flock /tmp/slay-browser.lock timeout`).
Run `node tools/get-chrome.mjs` once before the first browser check.

## Milestones

- [x] 1. Baseline, measured once: town load and map load at depths 1, 12
  and 25 (time to playable and longest main-thread block), plus fight frame
  stats (p95, p99, worst) from one check-lag or check-perf run. Write the
  numbers under "Notes for resume". (wip(speed): baseline load numbers,
  load:progress event, check-loadtime --depths)
- [x] 2. No frozen browser while loading: move map build work off the main
  thread (worker) where it is pure data, spread GPU uploads and mesh
  building across frames, and emit `'load:progress'` (see PLAN.md Wave 4
  contracts; add it to `Events.ts` and `CONTRACTS.md`). (wip(speed): paced
  floor build, bake workers ...; bake jobs name the monster by id ...;
  static floor build yields per chunk)
- [x] 3. Shaders compiled at load, not in play: `compileAsync` for the level
  and its monster list behind the loading screen, so first hits and first
  monsters do not stutter. (speed: part 1 done, milestones 1 to 3; the
  curtain build already existed as `Engine.prime` + `ShaderGate`, which is
  what `compileAsync` does; check-frames now names each pipeline still made
  in play, and the few left belong to other streams' late looks: see
  "Notes for resume")
- [x] 3b. Leftover first-time stutters (handed over by looks, two tries
  there): pipelines still made in play for `warden:mouth`,
  `warden:shorts`, `item-gem/item:gem` on the map; `fx:solid-shard`,
  `fx:cores`, `fx:columns`, `item-glow/item:glow`, `prop:altar` cloth and
  bone, and boss adds' `creature:bone` and `creature:shade` in the boss
  room. Read looks.md "Notes for resume" first (its guesses). Fix with
  stand-ins in `warmup()` or hidden builds at load; count pipelines made in
  play before and after with check-frames.
- [x] 3c. The vfx lab (`tools/check-decals.mjs`) renders black frames for
  every scene, even the old `impacts` scene (see effects.md). Find why and
  fix the lab (a tool, not the game, unless the game is at fault). One
  retry, then note it and move on. (Fixed in the lab: 18 of 19 scenes draw;
  `crits` is still black in a full run, see "Notes for resume".)
- [x] 4. (after wave two) Fewer draw calls: instancing or `BatchedMesh` for repeated props,
  monsters and loot, with culling (GPU or indirect draws where three.js
  supports it). Count draw calls before and after. (The hero's shadow from
  shadow bodies: map 170 -> 161 draws; see "Milestone 4".)
- [x] 5. (after wave two) Shadow cost: cache static shadows so only moving casters redraw;
  a budget for point-light shadows. (`core/ShadowCache.ts`: map shadow
  draws per update 47 -> 16, town 166 -> 56 with residents' shadow bodies;
  depth maps identical; see "Milestone 5".)
- [x] 6. (after wave two) Many torches: tiled or clustered lighting, only if it measures
  faster here. If it does not, note why and tick. (Not done: cannot be
  measured here and the light loop is already small; see "Milestone 6".)
- [ ] 7. (after wave two) CPU frame: lower animation and update rate for far monsters and
  summons, pool hot objects, no per-frame allocation in the loops you touch.
- [ ] 8. Handover with before and after numbers.

## Next up

Part 2, milestones 3b, 3c done; baseline re-taken (see "Part 2 baseline").
A fresh agent:

1. Read this file, PROTOCOL.md, PLAN.md and the "Loading progress" and
   "Bake workers" sections of CONTRACTS.md.
2. Milestone 4: draw counts per kind are under "Part 2 baseline"
   (`check-frames --draws`). Cut the biggest group, count again.
3. Then 5, 6, 7, 8. Re-save `tools/perf-frames.json` at the end
   (`check-frames --save`, all three places).

## Notes for resume

- Known: map build froze the main thread about 12 s in this VM.
- Baseline (milestone 1, commit aced25a, this VM, software WebGPU, other
  agents sharing the 4 cores; `check-loadtime --no-select --depths=1,12,25
  --profile --size=640x360`, cold profile). Time is from `goTo` to ten
  frames after arrival; "block" is the longest main-thread task.
  | load | time | longest block | long tasks (sum) | main thread idle |
  | --- | --- | --- | --- | --- |
  | town (new warden) | 46.9 s | 2589 ms | 32 (7.6 s) | 36.8 s |
  | map depth 1 | 25.0 s | 3650 ms | 41 (6.5 s) | 16.1 s |
  | map depth 12 | 26.8 s | 5258 ms | 34 (7.9 s) | ~17 s |
  | map depth 25 | 39.8 s | 8327 ms | 58 (13.1 s) | 23.5 s |
  Where it goes: the longest block is `DungeonScene.loadLevel` run in one
  task (depth 25: 7.6 s, about 6.3 s of it baking creature meshes, `prim`
  and `evalList` are the SDF field). Shader node graphs are another 3 to 5 s
  of JS but already sliced (`ShaderGate.pump`). Most of the wall time is the
  page idle, waiting on GPU pipelines (software here) and workers. Town:
  the hero's gear meshed on the main thread (`refreshEquipmentVisuals`,
  2.2 s) and the town build are the two big blocks.
- Fight frame baseline (`check-frames --only=map`, depth 6, 125 monsters,
  480x270, high, before the WebGPU counter fix): frame p95 1591 / p99 2020 /
  worst 2233 ms (software drawing, not meaningful); update p50 3.9 / p95
  19.6 / p99 38 / worst 59 ms; update+render submit p95 34 / p99 49 / worst
  71 ms. The update p95 was 12.1 in the saved baseline: this machine was
  shared with two other agents' runs.

- Milestone 2 result (run 3, same command as the baseline). Longest
  main-thread block: depth 1 3650 -> 985 ms, depth 12 5258 -> 543 ms,
  depth 25 8327 -> 845 ms (before the per-chunk yield, which should cut the
  floor's 845 further; not re-measured). Monster step at depth 25: 2.5 s in
  tasks of at most 283 ms (was one 7.6 s task). Steps at depth 25: map 0.6 s,
  hero 0.1, world 3.1, monsters 2.5, shaders 10.5 s, ready at 17.3 s. Wall
  times here are not comparable to the baseline's: the phase time includes
  ten frames after arrival, each 1 to 3 s in software, and the machine is
  shared. 59 of 60 looks came from the bake workers.
- Town: the hero's gear now meshes in a worker (hero step 2.2 s -> 0.2 s).
  Left: `buildTown` is one 3.1 s task (`world/Town.ts`, props and ground
  own it, both done). Request for finish: make `buildTown` yield between
  buildings and residents (a generator like `DungeonMesh.steps`), then
  TownScene can run it paced. The 'meshing' step (19 s here) is the page
  idle waiting for the townsfolk workers; with the title and select screens
  first (a real player) they have usually finished.
- Checkers fixed for WebGPU: check-frames counts draws, pipelines made in
  play and texture uploads from the GPU API (it read WebGL calls and showed
  0); check-perf and check-lag read `info.render.drawCalls` (they read
  `render.calls`, which on WebGPU counts render passes since start). The
  saved baseline in `tools/perf-frames.json` predates this: re-save it.

- Milestone 3 (check-frames `--only=map,boss`, depth 6, after milestones 1
  and 2). Pipelines still made in play, each named `object/material` by
  check-frames, with the stream that owns the look:
  - map (4): `warden:mouth/MeshStandardMaterial` and
    `warden:shorts/hero-linen` (the warden is in the scene at prime, so its
    material changes when it wakes or is hit: heroes/bosses),
    `item-gem/item:gem` (a gem drop: items),
    `Output Color Transform (OrthographicCamera)` (a screen-space pass drawn
    only in play: render/post owner).
  - boss (8): `fx:solid-shard`, `fx:cores`, `fx:columns` (boss effects first
    cast: vfx), `item-glow/item:glow` (items), `prop:altar:1` cloth.linen and
    bone.pale (an altar added during the fight: props), `creature:skin/
    creature:bone` and `creature:alt/creature:shade` (boss adds summoned
    mid-fight: creatures/bosses).
  Request for each owner: put a stand-in of the late look into the scene's
  `warmup()` (DungeonScene already has stand-ins for flash, corpses, coin,
  loot, veil, shade and shots), or build the object at load hidden; `prime`
  shows hidden objects for the warm frames. Map draw calls 651 per frame in
  that run (the old 156 came from the broken counter). Upload in play 987 KB.
- Nothing from milestone 4 or later was started; nothing is half-wired.

### Part 2 baseline (after wave two, commit e2f6422)

Same command as milestone 1 (`check-loadtime --no-select --depths=1,12,25
--profile --size=640x360`, cold profile, this VM, other agents sharing it).
Title live at 11.9 s.

| load | time | longest block | long tasks (sum) | ready at | main thread idle |
| --- | --- | --- | --- | --- | --- |
| town | 44.3 s | 466 ms | 45 (5.6 s) | 23.4 s | 35.6 s |
| map depth 1 | 23.4 s | 517 ms | 57 (5.1 s) | 10.2 s | 15.0 s |
| map depth 12 | 27.1 s | 464 ms | 50 (4.5 s) | 11.4 s | 18.8 s |
| map depth 25 | 39.1 s | 774 ms | 81 (8.1 s) | 15.6 s | 25.7 s |

Steps (ms): town meshing 15408, world 2286, hero 162, shaders 4972; depth 25
map 502, hero 138, world 2538, monsters 2956, summons 620, shaders 8447.
Town's `buildTown` is paced now (longest block 466, was 2589).

Frames (`check-frames --only=map,boss --why --draws`, 480x270, high, 120
frames, depth 6 map with 123 monsters, depth 8 boss with 77):

| place | draws (GPU) | render objects | triangles | update p50/p95/p99/worst | cpu p50/p95 | made in play |
| --- | --- | --- | --- | --- | --- | --- |
| map | 170 | ~177 | 1.36 M | 2.9 / 9.7 / 12.2 / 636 | 13.9 / 25.2 | 3 |
| boss | 112 | ~150 | 0.55 M | 2.4 / 8.7 / 32 / 1106 | 11.8 / 33 | 7 |

The one worst frame of each is a single spike (a GC or a new area's
build); the p99 is the real tail. Map draws by kind (render objects a
frame, main view + shadow maps): props baked 17 + 10 shadow, creatures 26.7
+ 16.8 shadow (one shadow body each), the hero's parts 22 + 20 shadow,
terrain 5 + 7 shadow, instanced props 5 + 11 shadow, the rest one or two
each (flames, light pools, motes, post passes).

### Milestone 3b (late pipelines)

`check-frames --why` now logs every pipeline from the load on and, for
each made in play, the nearest one made before with what differs in its
key; `--draws` counts draws by kind. What it found:
- Map (`warden:mouth`, `warden:shorts`, `item-gem`): not the map at all.
  The inventory paperdoll (a studio drawing the hero under its own lights)
  warmed on `scene:change`, as the curtain lifts, and its compile culled
  to its camera, so the face, cloth and the weapon's gem were built by the
  draw after it, in play. It now warms on the map load's first step and
  compiles with culling off (`ui/InventoryPanel.ts`, `ui/PaperdollView.ts`,
  ui's files, small edits). Map: 3 in play -> 0. Two are still made in the
  first second (the paperdoll's compile builds for the game's own target,
  4x samples and colour space differ from its canvas; the draw makes them).
- `warmupDone` freed the item stand-ins' geometry and the summoned
  bodies' materials right after the warm: three lets go of a pipeline once
  nothing that drew with it is left, so every late look nothing else on
  the floor wears (a gem or potion drop, a boss's adds) was thrown away
  again and made anew mid-fight. They now live until the area changes
  (`DungeonScene.releaseWarm`).
- Boss (40 frames): 0 made in play. The 26 made while settling were a new
  area's own warm-up (the autopilot walked through a way on).

### Milestone 3c (vfx lab)

- The lab drew one frame cold. The game's renderer leaves out every draw
  whose shader is not built yet (`ShaderGate`), so every scene was black.
  It now runs `Renderer.warm` before each shot, draws twice, and throws a
  first shot away at boot. 18 of 19 scenes draw (`shots/vfx/`).
- `crits` (shot at 0.06 s) still comes out black in a full run, though it
  drew in a two-scene run. Tried twice; left. Guess: the crit flash's
  first frames (exposure or the temporal pass) on a cold scene.

### Milestone 4 (draw calls)

What is already batched (earlier waves): props are baked per chunk and
material, repeated props are instanced (one storage-buffer shader for all),
flames are one `BatchedMesh`, light pools one instanced mesh, each monster's
shadow is one shadow body, held items are merged per material. three's
WebGPU `BatchedMesh` still issues one GPU draw per piece (no multi-draw
indirect in r186), so batching more of the same buys JS time, not draws.
- The biggest group left that could be cut without a new look: the hero's
  shadow, one draw per part and per item part in every sun shadow map.
  It now comes from shadow bodies like the monsters' (`HeroModel.
  useShadowBodies`, on for the player only): the body, linens and armour
  in one skinned geometry, and each held item in one more. Parts a plain
  depth draw would get wrong (two-sided cloth, see-through glows, the cape
  on its own bones, a spinning part) keep casting their own. Rebuilt when
  the gear or the beast form changes.
- Map (same seed, 40 frames): draws 170 -> 161, hero shadow draws about
  12 -> 3. Pipelines made in play still 0.
- Not done: monster parts (skin, cloth, metal: about 25 draws) are one draw
  per material by design; merging them needs one material, a new look.
  Loot on the ground is a few draws (a potion is three).

### Milestone 5 (shadow cost)

- The sun's (and the camp moon's) shadow of still things is kept
  (`core/ShadowCache.ts`). The floor, baked props and prop piles are drawn
  into a map of their own; each shadow update copies it and draws only what
  moves on top. The kept map is drawn again when the sun's camera steps
  (it follows the hero in whole metres), a chunk is shown or hidden, or a
  still caster changes; a caster marked still that moves is put back with
  the moving ones for good. Walls cut away near the hero, dithered roofs and
  swaying shapes are never marked. Scenes mark their casters with
  `markStaticShadows` (DungeonScene after the floor build, TownScene after
  the camp build). The sun's depth is now 32-bit float (three's default
  depth format cannot be copied).
- Checked exact: a probe read the sun's depth map back after a kept frame
  and after a full frame, on the map and in town, standing and after a
  step: 0 texels differ of 4.2 M (`shots/probe/shadow-probe.mjs`, not kept).
- Shadow draws per update (render objects): map 47 -> 16 standing still;
  town 166 -> 96 from residents' shadow bodies (`art/npc/Residents.ts`,
  one body per resident, like the monsters') -> 56 kept. While walking, the
  kept map is redrawn about once per metre (6 times a second at a run,
  against 40 shadow updates a second on high).
- Point-light shadows: none in play. Torches come from a pool of four
  lights that never cast; the only point shadow is the death screen's
  candle (one 512 map). The quality's `pointShadows` already turns that off
  on low. Nothing to budget; noted, not changed.

### Milestone 6 (many torches)

Not done, on purpose. Point and spot lights are already packed into one
loop (`core/Lighting.ts`) that is handed only the lit lights whose reach
touches the view, so a parked or off-screen torch costs a pixel nothing. A
map lights four torch lights at a time plus the hero's; the camp has about
twenty. Tiled or clustered lighting adds a compute pass and a light list
per tile every frame to save part of a loop of at most twenty: it can only
win on a real GPU at high resolution in town, and this VM cannot measure
GPU time (software rendering). For the owner: if town FPS on a real GPU is
low at 4K, profile the lit fragment cost first.

## For the owner to test

(Add one line per item: what to try and what should happen.)

- Clear site data, start a new character, go to town, then into a map at a
  deep tier: the loading bar and the page should keep moving (no "page not
  responding", other tabs stay smooth); compare the load time with before.
- Enter a few maps in a row: the second and later loads should be faster
  (monster bodies come from the bake workers and the stored cache).
- On a real GPU, fight in a map and a boss room right after loading: first
  hits, first monsters and the first boss attacks should not stutter. A
  short hitch on the warden waking, a gem drop or boss adds is known and is
  listed for the owning streams.

## Handover

(Written when every milestone is ticked.)
