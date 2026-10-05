# Stream: world (environment art and rendering)

Status: in progress

## Milestones

- [x] Textures: richer procedural surfaces with normal and roughness detail and large-scale variation so floors and walls stop tiling visibly. (commit "World: world-space surfaces, biome grades, height fog, room landmarks")
- [x] Lighting and post: tone mapping, a colour grade per biome, tuned bloom, ambient occlusion, vignette, light shafts and fog that add depth. (same commit; grade + bloom + vignette per biome, fog shaped around the player, height fog in pits. Light shafts untouched.)
- [ ] Set dressing: landmark pieces per room type and per biome so every room has a focal point. (wired; start rooms rendered fine, but no landmark has been seen up close yet: the room shots landed in fights)
- [ ] Liquids and hazards: water, lava and chasms that look the part, with ambient motes and drips per biome. (WIRED and live; water seen once and froth toned down after; lava and drips not yet seen)
- [ ] Town: lived-in camp with lighting, landmarks and life. (WIRED and live: night grade, fog shape, world-surface ground, fireflies, ground light pools; not yet rendered)
- [ ] Sweep: one render per biome, each reads clearly with the player and monsters easy to see.

## Next up

1. Read the rest of the w8 batch (`shots/w8`: ashwaste, foundry@treasure, crypt@treasure, frostvault)
   and its `PROBE` lines: (650,260) is the white blob over the hero at the ashwaste entry, (900,450) the
   black area right of the corridor in foundry@treasure. Fix what they name.
2. Ashwaste got grey ground light (ambient 0x6f6460, key 0xffb48a, bounce 0x5e544e) and a cool
   shadow grade after w8 was built; render it again to judge. Its 3.3M triangles are NOT the sun
   shadow (the sun now follows the hero, `SUN_REACH` 30); the harness `heavy` list names the meshes.
3. The flat orange square at the foundry entry: probe hits are the hero aura (a 9 m plane round the
   hero) then `lightPools`; take a probe with 4 hits further from the hero to see what is under it.
4. Landmarks still unseen. `@treasure` and `@ambush` now stand inside small rooms.
5. Town: 1,092 draw calls (budget 900), 805K triangles, 23 lights, 1 shadow light. Remaining cost is
   main + AO + moon shadow per mesh; nine residents at ~20 meshes each are most of it (models' budget).
6. Then tick milestones 3 to 5 and do the milestone 6 sweep over all eight biomes.
7. `node tools/check-propmesh.mjs` alone when the machine is quiet.

## Notes for resume

- Town perf (w6 -> w8): 6,102 -> 1,092 draw calls, 2.7M -> 805K triangles. `mergeStatic` folds every
  static single-material mesh under the camp root into one mesh per material (moving things in
  `spin`/`sway`/`flames` are skipped), the lantern bulbs are one `InstancedMesh` (`buildBulbs`, flicker
  writes instance matrices), residents' skinned parts cull against a 2.4 m sphere, and the camp fire
  no longer casts a point shadow (the moon does). Hero light in town is softer and higher (9 at 3.4 m).
- The open-sky sun's shadow square follows the hero in whole-metre steps (`sun` in DungeonBuilder,
  moved in `DungeonMesh.update`).

- SOLVED, the invisible hero: `Animator.guardReach`'s pelvis spring blew up on long frames (hips at
  -1e14 m, flickering because of a clamp at zero). Fixed in `Animation.ts` (closed-form step; the
  weapon-lag spring is sub-stepped). The models stream's "hidden by rubble" reading was the flicker.
  The harness prints `hero.pelvis`; it should be a few centimetres.
- Entry rubble sits further back (z -1.3) so nothing stands in the hero's legs at spawn.
- `skin.*` palettes have no speckle or stain passes now (models asked).
- Water froth down to `rim 0.2`, `rimColor 0x4c6266`; the caverns pools still wore a pale ring.

- Town lights cut to 22 counted by check-perf (palisade torches, watch platforms, cairn candles and
  the vendor's second lantern are bulbs only; unlit high lanterns still get a faint ground pool).
  Budget note sits above `addLantern` in Town.ts. The apothecary lantern post moved to (-3.0,-10.6).
- Chasms in lava and voidwater biomes get the level's liquid 4.2 m down; the height fog leaves an
  ember glow. Not yet seen rendered.
- `world-render.mjs` now prints, per shot, `hero.hits` (first things a ray from the camera to the
  hero's chest meets; ignores dithered roof discard), `hero.y` and `hero.floor`. `--diag` adds a
  `-recompiled.png` per `@close` shot and a `PROGS` line about the hero's programs.

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

- **From models (foundry invisible hero), solved:** the hero is inside the room landmark's rubble pile.
  With your harness, hiding only meshes within 1.5 m of the hero (the arch, r 6.4, and its rubble blocks,
  r 0.3 to 1.6) makes the hero appear; nothing else changes it. The normal depth-1 start in `check-worn`
  (caverns) has the same problem: the hero spawns inside the entry arch's rubble. Request: keep landmark
  rubble off the spawn tile and walkable tiles (or make it collide), and move the harness stand point.
