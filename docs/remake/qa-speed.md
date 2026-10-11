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

- [ ] Load time. Measure title-screen time and first town and first map time
  from the published bundle (`tools/bundle-artifact.mjs`, served with the
  packs as `tools/verify-single.mjs` or similar does). Find the biggest waits
  (pack downloads, texture decode, mesh building, shader compile) and cut
  them: show progress, load in the background, build lazily, warm shaders
  behind the loading card.
- [ ] Owner-reported lag (top priority, ahead of garbage and mix). The owner
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
- [ ] The CPU frame. Profile update and render per system (AI, pathfinding,
  animation and IK, skinning, effects, UI and damage text, audio) and cut
  the biggest: update far or offscreen monsters less often, cache paths,
  pool and reuse, no per-frame allocation or DOM layout, batch HUD updates.
- [ ] The GPU frame. Draw calls and instancing; shadow cost (resolution,
  which lights cast, static shadow caching); overdraw from particles and
  glows; post-processing cost; texture memory and mipmaps; shader count
  (merge material variants).
- [ ] A real quality ladder in Settings: Low, Medium, High, Ultra, each
  setting shadows, post, effect density, view distance and resolution
  scale. An optional auto mode drops a step when frames run long and steps
  back up when there is room. Defaults give smooth play first.
- [ ] Loading. New areas build without freezing play (across frames or in
  a worker), and what the next area needs is warmed ahead of time.
- [ ] A permanent perf check in `tools/` that records frame-time stats for
  town, a busy map and a boss fight, and fails on regressions.
- [ ] Hitches. First sight of a monster or boss stalls 0.15 to 2.9 s while its
  body is built. Move that work off the frame (worker, prebuild during map
  load for the map's monster list, or spread over frames). Same for any other
  stall over 50 ms you find.
- [ ] Garbage. Per-step garbage at depth 1 is 290 to 440 KB against 200
  (number boxing in creature IK and AI maths; `check-perf --alloc` names it).
  Bring it under the line without changing behaviour.
- [ ] Long session. The full default soak (3 runs x 3 maps x 300 frames) never
  ran because it takes 90 minutes. Split it into runs under 45 minutes each
  and run them all. Memory, GPU objects and frame time stay flat. Fix leaks.
- [ ] Sound mix. Loudness balance between music, ambience, skills, hits and
  UI. No sound that clips or drowns everything. Check headlessly by
  measuring peak and RMS of what plays in common scenes.
- [ ] Handover with before and after numbers.

## Results

(fill in)

## Next up

1. Load time: compare `tools/check-loadtime.mjs` before (baseline bundle of
   8d9fb82, built in a scratch copy) and after, back to back.
2. Hitches: `check-loadtime.mjs --walk` tours the first map; look for long
   tasks per stop.
3. Garbage: `check-perf --preview --alloc --depths=1`.
4. Soak in parts: `check-soak --preview --part=i/3` for i = 1..3.
5. Mix: `check-mix.mjs` (scenes and every id alone).

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
