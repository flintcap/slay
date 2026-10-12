# Stream: qa-speed (quality pass 2: is it fast and steady)

Status: in progress

Goal: the game loads quickly, runs smoothly and stays steady over a long
session, as published. Widened by the owner: this stream is the
optimization and performance stream. The aim is the smoothest, lag-free
play we can get, not only meeting budgets. Never change gameplay, stats or
monster counts. Before and after numbers are measured under the same
conditions. Software rendering here is slow: judge GPU work by draw calls,
triangles, overdraw and shader counts, and CPU work by measured ms.

## Milestones

- [x] Load time. Measure title-screen time and first town and first map time
  from the published bundle (`tools/bundle-artifact.mjs`, served with the
  packs as `tools/verify-single.mjs` or similar does). Find the biggest waits
  (pack downloads, texture decode, mesh building, shader compile) and cut
  them: show progress, load in the background, build lazily, warm shaders
  behind the loading card.
- [x] Owner-reported lag (top priority, ahead of garbage and mix). The owner
  played the published game on a real machine and still feels lag in:
  (a) the main menus, (b) character creation and select, (c) attacking
  enemies, (d) enemies coming into view, (e) loading new areas while moving
  through a map. For each, find what costs the time and cut it. Real
  hardware has a GPU, so first-use shader compiles and main-thread building
  matter most. Report frame spikes over 50 ms, not only averages.
- [ ] Frame pacing. A steady 60 fps on a mid-range laptop GPU in town, on
  busy maps and in boss fights. Measure p95, p99 and worst frame, not only
  averages. Remove every recurring spike over 33 ms and every one-off spike
  over 50 ms we can find.
- [x] The CPU frame. Profile update and render per system (AI, pathfinding,
  animation and IK, skinning, effects, UI and damage text, audio) and cut
  the biggest: update far or offscreen monsters less often, cache paths,
  pool and reuse, no per-frame allocation or DOM layout, batch HUD updates.
- [x] The GPU frame. Draw calls and instancing; shadow cost (resolution,
  which lights cast, static shadow caching); overdraw from particles and
  glows; post-processing cost; texture memory and mipmaps; shader count
  (merge material variants).
- [x] A real quality ladder in Settings: Low, Medium, High, Ultra, each
  setting shadows, post, effect density, view distance and resolution
  scale. An optional auto mode drops a step when frames run long and steps
  back up when there is room. Defaults give smooth play first.
- [ ] Loading. New areas build without freezing play (across frames or in
  a worker), and what the next area needs is warmed ahead of time.
- [x] A permanent perf check in `tools/` that records frame-time stats for
  town, a busy map and a boss fight, and fails on regressions.
- [x] Hitches. First sight of a monster or boss stalls 0.15 to 2.9 s while its
  body is built. Move that work off the frame (worker, prebuild during map
  load for the map's monster list, or spread over frames). Same for any other
  stall over 50 ms you find.
- [ ] Garbage. Per-step garbage at depth 1 is 290 to 440 KB against 200
  (number boxing in creature IK and AI maths; `check-perf --alloc` names it).
  Bring it under the line without changing behaviour.
- [ ] Long session. The full default soak (3 runs x 3 maps x 300 frames) never
  ran because it takes 90 minutes. Split it into runs under 45 minutes each
  and run them all. Memory, GPU objects and frame time stay flat. Fix leaks.
- [x] Sound mix. Loudness balance between music, ambience, skills, hits and
  UI. No sound that clips or drowns everything. Check headlessly by
  measuring peak and RMS of what plays in common scenes.
- [ ] Handover with before and after numbers.

## Results

- Quality ladder (ac11ae4): Low, Medium, High, Ultra each set shadow map
  size per light, torch shadows, sun shadow reach, AO, bloom, SMAA, effect
  density, pixel ratio cap and render scale. High is the old look. The old
  `shadowMapSize` field (never applied) is gone. Auto quality
  (`core/AutoQuality.ts`, on by default, chosen quality is its top) steps
  down at median > 22 ms or p90 > 30 ms and back up after 20 calm seconds.
  `check-quality.mjs`: no black screen across low, medium, ultra, high, low.
- Owner's five lag spots, `check-lag --stops=6 --fight=200`, cold visit,
  published bundle. Before is 8d9fb82, after is 195dd7a. Same machine,
  480x270, software rendering, CPU shared with two other agents. Every
  software frame is slow, so the count of frames over 50 ms says little in
  a map; what carries to a real GPU is programs linked, uploads and JS
  time inside a frame.

  | spot | before: worst ms, links | after: worst ms, links |
  |---|---|---|
  | (a) title idle / settings | 1550, 0 / 233, 0 | 1267, 0 / 617, 0 |
  | (b) select open | 18449, 30, 1 context | 5300, 21, 1 context |
  | (b) show each class | 10083 to 14399, 4 to 6, new context each | 0 to 1917, 0 to 2, no context |
  | town enter (curtain) | 19233, 55 | 16216, 42 |
  | map enter (curtain) | 17699, 63 | 11483, 38 |
  | (d) glide, enemies into view | 6333, 4 links, 7.8 MB up | 4633, 0 links, 5.9 MB up |
  | (c) fight | 7250, 2 links, update max 465 | 6600, 0 links, update max 135 |
  | (e) next area (curtain) | 17733, 59 | 8916, 38 |
  | (e) first 5 s in new area | 3150, 0 | 2217, 0 |

  What did it: shaders compiled with the composer's target bound, a warm
  frame with culling off and every texture uploaded behind the curtain, no
  drawing while the curtain is down (prime's side-by-side linking used to
  be undone by the loop), the select heroes and townsfolk taken from the
  boot worker instead of meshed again, item icons drawn behind the curtain
  and then in idle moments, portraits one at a time, combat text from
  cached sprites, creature cull spheres set instead of posed per vertex,
  far monsters' matrices frozen and hidden from the cull pass.
- Glide JS (126 frames, `--profile`): matrix work 839 ms before, 238 ms
  after the freeze.
- Load time, `check-loadtime.mjs`, cold, inside the browser lock, back to
  back (before 8d9fb82 from a scratch copy, after 04d1d12):

  | phase | before ms | after ms | long tasks before (total, biggest) | after |
  |---|---|---|---|---|
  | title | 27415 | 21904 | boot 20442, 13061 | 11606, 8001 |
  | select screen | 53395 | 44488 | 30096, 17577 | 11425, 7228 |
  | first town | 81740 | 89365 | 77087, 20671 | 55159, 8157 |
  | first map | 55241 | 43928 | 33170, 9726 | 31985, 8307 |

  First town takes a little longer because it now waits behind the
  curtain for the boot worker's townsfolk instead of meshing them again on
  the main thread; the longest freeze there fell from 20.7 s to 8.2 s.
- Standing check, `check-frames.mjs` (published bundle, 480x270, software,
  120 frames after settling): baseline in `tools/perf-frames.json`. With
  the hidden-object and item-material warm-up, the boss fight links no
  program while playing (was 1, a 2.9 s cpu frame here) and the map fight
  likewise; uploads in the boss fight are bone textures only.
- Standing check again, alone on the machine (7031d7a, new baseline):

  | place | update p50 / p95 / worst ms | update+render worst | draws | links in play |
  |---|---|---|---|---|
  | town | 1.4 / 3.8 / 8.5 | 26.1 | 405 | 0 |
  | busy map, 125 monsters | 3.4 / 12.1 / 24 | 40.7 | 344 | 0 |
  | boss fight | 2.2 / 8.0 / 18.2 | 1579 | 156 | 0 |

  The old baseline's map update p95 37 and worst 400 were the shared CPU.
  No update frame over 33 ms anywhere. The boss fight's two slow render
  frames come with 5.8 MB sent to the GPU mid-fight and no link: most
  likely a shadow map or render target made on a phase change (in
  software every big allocation is slow). Not chased.
- `check-perf` budgets at depth 1: draw calls 457 / 900, triangles 1.22M /
  1.5M, programs 83 / 110, lights 13 / 24, shadow lights 1 / 2, textures
  210 / 240, texture memory 36 MB / 192, update 5.8 ms / 6. All within.
- Sound mix (`check-mix`, inside the lock): one fail, "block alone clips
  the output" (block peak +7.8 dB). The six block files decoded to +6 to
  +13 dBFS (Vorbis overshoot). Peak-limited and re-encoded (4face02,
  noted in ASSETS.md): block peak -3.7 dB, "OK, nothing clips".
- Area change links: `check-lag --only=areas` with old materials held
  until the new area was primed still linked 39 programs (was 38 to 39),
  so the old programs were not the ones the new area needed. Areas of one
  map can be different biomes, and the light set (an "under" light in
  some indoor biomes, a shadow-casting sun only outdoors) is part of every
  lit shader's key, so a biome change relinks every lit program. Change
  reverted.
- Garbage, `check-perf --alloc --depths=1`: 298 KB a step (was 290 to 440;
  budget 200). Not under the line. The top names (tickProjectiles 46 KB a
  step, creature solve, locomotion, Enemy.update) hold no allocation in
  their source: the bytes are numbers boxed by code that is not yet
  optimised in a 30-step sample (the projectile-against-prop loop is the
  biggest). At 60 fps that is about 18 MB/s of short-lived garbage, one
  minor GC of about a millisecond a second.

## Next up

1. Soak in parts (`check-soak --preview --part=i/3`), once, inside the
   lock. Then Handover.

## Notes for resume

- Tools this stream added: `tools/check-loadtime.mjs` (published bundle,
  boot steps, phases, requests, long tasks; `--profile` splits JS from
  GPU waits, `--walk` tours the map), `tools/lib/single.mjs` (serves
  `dist-single` the way the host does), `tools/check-mix.mjs` (taps the
  mix buses in real-time audio). `bundle-artifact.mjs --no-minify` gives
  readable profiles; never publish that build.
- Headless Chromium here has no KHR_parallel_shader_compile, and every GPU
  call is software. Profiles: "native/GPU wait" (toBlob, toDataURL,
  getProgramInfoLog, getContext, onFirstUse) is mostly SwiftShader work and
  says little about a real machine; JS self time is what transfers.

- The published build packs assets: `assets/packs.json` plus seven `.wasm`
  packs. The dev server has no packs and fetches loose files.
- Do not change stats, balance or monster counts.

- **Lean testing (hard rule, PROTOCOL.md "Lean testing", commit 5716a63).**
  Testing burns the owner's usage.
  - Find the cost with CPU profiles and code reading first. A browser run
    only confirms.
  - One short perf run before and one after per milestone, same settings.
    Never around every edit.
  - Batch several speed fixes, then measure once.
  - Garbage and CPU checks headless where possible.
  - The full soak runs once, at handover only.
  - Print summary numbers only (p50, p95, p99, worst) through `grep` or
    `tail`. Never dump frame logs into context.
  - Once a target is met, move on.
- **One browser at a time (PROTOCOL.md, cf0c485).** Wrap every browser
  run as `flock /tmp/slay-browser.lock timeout 2700 node tools/<tool>.mjs`.
  Numbers taken while other agents' browsers ran are noisy (load near 18
  on 4 cores): compare before and after only from runs inside the lock.
  Everything in Results before this note was taken outside the lock; the
  links, uploads and JS-time numbers hold, wall times do not.
