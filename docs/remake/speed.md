# Stream: speed (Wave 4: smooth and fast on WebGPU)

Status: in progress

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
- [ ] 3. Shaders compiled at load, not in play: `compileAsync` for the level
  and its monster list behind the loading screen, so first hits and first
  monsters do not stutter.
- [ ] 4. Fewer draw calls: instancing or `BatchedMesh` for repeated props,
  monsters and loot, with culling (GPU or indirect draws where three.js
  supports it). Count draw calls before and after.
- [ ] 5. Shadow cost: cache static shadows so only moving casters redraw;
  a budget for point-light shadows.
- [ ] 6. Many torches: tiled or clustered lighting, only if it measures
  faster here. If it does not, note why and tick.
- [ ] 7. CPU frame: lower animation and update rate for far monsters and
  summons, pool hot objects, no per-frame allocation in the loops you touch.
- [ ] 8. Handover with before and after numbers.

## Next up

1. Milestone 3: `npx vite build` is not enough for the checkers; run
   `node tools/bundle-artifact.mjs`, then
   `SLAY_PORT=4341 flock /tmp/slay-browser.lock timeout 2400 node tools/check-frames.mjs --only=map,boss`
   and read "pipelines made while playing" (now counted on WebGPU). Zero
   means first monsters and hits build nothing in play.

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

## For the owner to test

(Add one line per item: what to try and what should happen.)

- Clear site data, start a new character, go to town, then into a map at a
  deep tier: the loading bar and the page should keep moving (no "page not
  responding", other tabs stay smooth); compare the load time with before.
- Enter a few maps in a row: the second and later loads should be faster
  (monster bodies come from the bake workers and the stored cache).

## Handover

(Written when every milestone is ticked.)
