# Stream: world (environment art and rendering)

Status: paused

## Milestones

- [x] Textures: richer procedural surfaces with normal and roughness detail and large-scale variation so floors and walls stop tiling visibly. (commit "World: world-space surfaces, biome grades, height fog, room landmarks")
- [x] Lighting and post: tone mapping, a colour grade per biome, tuned bloom, ambient occlusion, vignette, light shafts and fog that add depth. (same commit; grade + bloom + vignette per biome, fog shaped around the player, height fog in pits. Light shafts untouched.)
- [ ] Set dressing: landmark pieces per room type and per biome so every room has a focal point. (wired; start rooms rendered fine, but no landmark has been seen up close yet: the room shots landed in fights)
- [ ] Liquids and hazards: water, lava and chasms that look the part, with ambient motes and drips per biome. (WIRED and live; water seen once and froth toned down after; lava and drips not yet seen)
- [ ] Town: lived-in camp with lighting, landmarks and life. (WIRED and live: night grade, fog shape, world-surface ground, fireflies, ground light pools; not yet rendered)
- [ ] Sweep: one render per biome, each reads clearly with the player and monsters easy to see.

## Next up

Everything below is already in the code and switched on. What is missing is
looking at it. Paused mid render batch; the code builds, typecheck is clean,
check-roof, check-props, check-decalheight and check-palettes pass.

1. `npm run build`, then one batch (expect 5 to 8 minutes per shot under load):
   `SLAY_PORT=4304 node docs/overhaul/world-render.mjs --out=shots/w4 --shots=crypt,foundry@close,sunkenTemple,sunkenTemple@room,caverns@room,foundry@room,town`
   Harness options (new): `biome@room` teleports to the biggest non-entry room, `biome@<kind>` to the
   first room of that kind (treasure, ambush, vault, boss), `biome@close` zooms the camera in on the
   hero. Each line prints `hero` (meshes shown and screen position) and real whole-frame draw calls
   and triangles. Wait for lines with the regex `^name +[0-9]+s`; the `name -> {...}` line is only the
   teleport. Kill the node process AND its `vite preview --port 4304` child when done (by PID).
2. Look for, and fix in this order:
   - foundry@close: in the foundry start shot the hero was NOT visible at the screen centre although
     the probe says 42 of 44 meshes are shown at (640,370). The crypt start shot shows the hero fine at
     the same spot. Find out why (dark material? under the floor? hidden by the entry arch?). If it is
     not a world problem, write it up for the models or quality stream.
   - water (sunkenTemple, caverns@room): froth was a bright white ring round every one-tile pool; now
     `rim 0.32`, darker `rimColor`, and clotted by noise in `Liquids.ts`. Check it reads as water.
   - drips (sunkenTemple): falling drops plus rings near the hero.
   - lava (foundry@room, bottom right of the old shot): a white-hot blown-out patch. If still blown out,
     lower `TUNING.lava.emissiveIntensity` (2.8) or the heat light `intensity` in `addHeatLights`.
   - foundry grade: changed to cool shadows (`shadowTint 0x4a5874`) because the whole frame was one red.
   - chasms render as a flat black shape. Consider an ember glow at the bottom for foundry/ashwaste.
   - landmarks: still unseen. A `@room` shot that lands in a fight shows monsters, not the piece; try
     `@vault`, `@treasure` or another seed in `SEEDS`.
   - town: night grade, `setFogShape(18)`, ground light pools (`buildGlows` in Town.ts), fireflies at
     radius 22 to 34 and moths on the lantern posts. Town has 34 real lights (perf budget is 24 for
     dungeons); consider marking a few more lanterns unlit.
3. Tick milestones 3, 4, 5 as they check out and checkpoint.
4. Milestone 6 sweep: all eight biomes in `SEEDS`, fix anything hiding the player or monsters.
5. `node tools/check-propmesh.mjs` has never finished under load; run it alone when the machine is quiet.

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
- **From models:** `Town.ts` `npc()` now builds residents with `buildNpcModel(id)` from
  `src/art/NpcModels.ts` (nine people, Sister Vell added at the apothecary). Request: a smooth skin
  palette (no speckle or stain passes) would let `CharacterModels.skinMaterial` keep an albedo map;
  today it drops the map because the `skin.*` speckle reads as dirt on faces. Also, the lantern post at
  (-7.0, -13.5) stands inside the apothecary footprint at (-6.5, -13.5).
- Wall tops (CAPS) now carry `aEnv = WORLD_CAP_ENV` (199) and the wall shader darkens them 60%, makes
  them matte and flattens their normal. Same material, same bucket, still solid (check-roof passes).
  Render after the change: the floor is now the brightest thing in the crypt start shot.
- Entry-arch rubble now uses the wall stone; in the dark tint it read as black holes by the player.
- Wet floors bottom out at roughness 0.22 (was 0.12) to cut specular sparkle on damp biomes.
- `world-m4-wiring.py` was applied and deleted. Liquids: `liquidSurface()` owns the level's liquid
  material (disposed via `this.liquid`), `shoreContact()` feeds froth/crust, lava and void pools add
  records to the torch pool (`addHeatLights`), `Drips` from `src/world/Ambience.ts` run near the hero.
- The render harness parks the mouse mid-screen after boot; the rig leans toward the cursor, and with
  the cursor at (0,0) the hero sat off-centre and looked missing.

