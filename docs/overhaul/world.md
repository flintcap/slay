# Stream: world (environment art and rendering)

Status: paused

## Milestones

- [x] Textures: richer procedural surfaces with normal and roughness detail and large-scale variation so floors and walls stop tiling visibly. (commit "World: world-space surfaces, biome grades, height fog, room landmarks")
- [x] Lighting and post: tone mapping, a colour grade per biome, tuned bloom, ambient occlusion, vignette, light shafts and fog that add depth. (same commit; grade + bloom + vignette per biome, fog shaped around the player, height fog in pits. Light shafts untouched.)
- [ ] Set dressing: landmark pieces per room type and per biome so every room has a focal point. (code is in and wired, not yet seen in a render)
- [ ] Liquids and hazards: water, lava and chasms that look the part, with ambient motes and drips per biome. (materials and drips written, NOT wired)
- [ ] Town: lived-in camp with lighting, landmarks and life. (fireflies class written, NOT wired)
- [ ] Sweep: one render per biome, each reads clearly with the player and monsters easy to see.

## Next up

1. Render to check milestone 3 (and recheck 1 and 2 in more biomes). From the repo root after `npm run build`:
   `SLAY_PORT=4304 node docs/overhaul/world-render.mjs --out=shots/w2 --shots=crypt,caverns,foundry,sunkenTemple,town`
   It boots once (10 to 25 minutes under load), then visits each biome with a fixed seed and prints
   draw calls, triangles, programs, lights and materials per shot. Look at each PNG. Check: floor
   seals sit flat and are not z-fighting; ossuary, idol head, gold hoard and gibbet look right; big
   rooms have a hero piece; floors show broad patches and dark corners at wall feet but are still
   the brightest, clearest thing on screen. If seals look noisy, lower the glyph emissive in
   `buildSeal` (Props.ts). Then tick milestone 3 and checkpoint.
2. Milestone 4, liquids: run `python3 docs/overhaul/world-m4-wiring.py` after changing its
   `os.chdir` line to your worktree. It wires `src/art/Liquids.ts` (animated water, lava crust over
   glow, sludge, ice, void; shore froth from an `aEnv` corner attribute) and `src/world/Ambience.ts`
   (drips from the ceiling into water with rings) into `DungeonBuilder.ts`, and makes lava and void
   pools add records to the torch pool so they light the room. Typecheck, run check-roof,
   check-props, check-decalheight, render foundry (lava) and sunkenTemple (water), tune, checkpoint.
   Delete `world-m4-wiring.py` once applied.
3. Milestone 5, town: in `TownScene.enter` call `renderer.setGrade({...night grade...})` (cool
   shadows ~0x4a5a8a, warm highlights ~0xffc080, splitTone 0.5, vignette 0.5) and
   `setFogShape(18)` from `core/Renderer`; reset both in `dispose` (`setGrade()`, `setFogShape()`).
   Swap the town dirt and path materials in `Town.ts` to `worldSurface(..., {kind:'floor', ...})`
   so the ground stops tiling (push them into `ctx.mat` for disposal). Wire `CampLife` from
   `src/world/TownLife.ts`: build it with the lantern post positions (y 2.86, x+0.24) and ring
   inner 22, outer 34, add `root`, call `update(elapsed)` from the town's update, dispose it.
   Render town, tune, checkpoint.
4. Milestone 6 sweep: render all eight biomes (names in `world-render.mjs` SEEDS), fix anything
   that hides the player or monsters, checkpoint.

## Notes for resume

- Renders are slow because every stream renders at once. Use `docs/overhaul/world-render.mjs`
  (boots once, many shots, 1280x720) rather than `tools/screenshot.mjs`, and give it a long timeout.
  First render of this work (crypt, seed 1001) came back correct: no shader errors, floors lit.
- `src/art/WorldSurface.ts`: `worldSurface()` = `surfaceVariant()` + an `onBeforeCompile` patch
  (never on the shared cached `surface()`). All world surfaces of a kind share one program via
  `customProgramCacheKey`. It reads a per-vertex `aEnv` attribute: floors = contact 0..1 (baked per
  tile corner in `DungeonMesh.floorContact`), walls = metres above the floor. `Surf` in
  DungeonBuilder carries `env` and a per-bucket default (`defEnv` 99 for wall buckets and CAPS so
  caps and ledges get no contact shadow).
- Floor tiles with a whole-number texture span are mirrored per tile (seamless); walls use world-
  space U/V so courses line up across tiles of different floor height. `wholeRepeat()` decides.
- `Textures.macroNoiseTexture()` is the shared 256px world breakup field (R broad, G blotch,
  B damp, A grain). Liquids use it too.
- Biome art fields added in `Biomes.ts`: `grime`, `wetness`, `surfaceVariation`, `grade`,
  `landmarks`. Variants can override `grade` and `wetness`.
- `Renderer`: `setGrade(partial)` / `DEFAULT_GRADE` (split toning, vignette tint, bloom per grade),
  `setExposure` is now a trim multiplied into the grade. `patchFog()` rewrites three's fog chunks
  once at construction: fog starts `fogShape.x` metres from the camera, and a height term below
  `fogShape.y` swallows pits. `applyBiomeLighting` sets the shape; `DungeonMesh.update` writes the
  height (lowest walkable floor minus 0.9). The uniform is a plain object shared by reference;
  hand-written ShaderMaterials just see zero (plain fog).
- DungeonScene got two additive lines: `setGrade(biomeArt(...).grade)` on level load and
  `setGrade()` in dispose.
- Props.ts: new kinds `floorSeal`, `arenaSeal` (flat, detail placement, no collision; placed by
  `sealAt` only where the whole disc is walkable, dry and level), `ossuary`, `idolHead`,
  `goldHoard`, `gibbet`. Every room 6x6 and up now gets a feature (85%, big rooms always, from
  `landmarks`), treasure rooms a gold hoard, ambush rooms gibbets, vault/quest/boss rooms a seal.
- `tools/check-propmesh.mjs` timed out under load during this session (did not fail); rerun it
  alone. check-roof, check-props, check-palettes, check-decalheight, check-blockers passed.
- The story stream owns town NPCs and dialogue; keep Town.ts changes to lighting, ground and life.
