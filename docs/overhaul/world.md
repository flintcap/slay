# Stream: world (environment art and rendering)

Status: in progress

## Milestones

- [x] Textures: richer procedural surfaces with normal and roughness detail and large-scale variation so floors and walls stop tiling visibly. (commit "World: world-space surfaces, biome grades, height fog, room landmarks")
- [x] Lighting and post: tone mapping, a colour grade per biome, tuned bloom, ambient occlusion, vignette, light shafts and fog that add depth. (same commit; grade + bloom + vignette per biome, fog shaped around the player, height fog in pits. Light shafts untouched.)
- [ ] Set dressing: landmark pieces per room type and per biome so every room has a focal point. (wired; w10 calm render: the crypt treasure room's gold hoard reads as the focal point. Biome landmarks (ossuary, crystal, forge, idol, brood mound, monolith, obelisk, rift) not yet seen)
- [ ] Liquids and hazards: water, lava and chasms that look the part, with ambient motes and drips per biome. (WIRED and live; water seen in caverns and sunken temple; lava and drips not yet seen)
- [x] Town: lived-in camp with lighting, landmarks and life. (commit "World: town confirmed in render; foundry flat orange tile; calm harness shots"; w9 render: campfire, lanterns, tents and residents read at night, hero clear; 1,096 draw calls, 23 lights)
- [ ] Sweep: one render per biome, each reads clearly with the player and monsters easy to see.

## Next up

Paused mid-render (w10 stopped after its first shot). Nothing is half-wired; the branch builds.

1. Render the rest of w10, one command, under `timeout` (45 min max), port 4304:
   `npm run build` then
   `SLAY_PORT=4304 timeout -k 20 2700 node docs/overhaul/world-render.mjs --calm --out=shots/w10 --shots=caverns@room,foundry@liquid,foundry@room,hive@room,ashwaste@liquid`
   then `pkill -f "[v]ite preview --port 4304"`. Run it as a background Bash task (it exits by
   itself) and wait with an `until grep ... shots/w10.log` loop; never wait on a bare server.
   - `@room` shots show biome landmarks: if each room has a clear focal piece, tick milestone 3.
   - `@liquid` shots show foundry and ashwaste lava (both seeds have lava: 36 and 56 tiles) and
     the drips near the hero: if lava reads as lava and nothing glares, tick milestone 4.
   - foundry@liquid also checks the two fixes made after w9: no flat orange floor tile (rust is
     metalness 0.12 now) and the hero aura disc on the hero's floor.
2. Milestone 6 sweep: one shot per biome WITHOUT `--calm` so monsters are on screen, at most five
   or six shots per render (each takes 4 to 7 minutes; boot about 1 minute). For example
   `--shots=crypt@room,caverns@room,foundry@room,sunkenTemple@room` and then
   `--shots=hive@room,frostvault@room,ashwaste@room,voidspire@room`. Judge: floor clearest and best
   lit, hero and monsters stand out from it. Nameplates crowd big fights; that is the HUD stream's.
3. Known look issues from w9, fix if cheap: the near wall's cap draws as a big black wedge at the
   bottom of a narrow corridor shot (foundry@treasure); pale blue-white stones round the town
   fire ring and scattered in the camp read cold and bright; ashwaste still 2.0M triangles in w9
   (rubble now casts no shadow; rockCluster at rough 0.6 is 1,344 triangles a copy).
4. Town: 1,096 draw calls (budget 900), 802K triangles, 23 lights (budget 24). Rest is residents
   (models' budget).
5. When milestones 3, 4 and 6 are ticked, set `Status: done`.
6. `node tools/check-propmesh.mjs` alone when the machine is quiet.

## Notes for resume

- w10 (calm) found, and this session fixed without a render yet: lava blew out to a white sheet
  and flooded the room orange (lava emissive 2.8 -> 1.25, molten albedo x0.4, voidwater 2.2 -> 1.2;
  heat lights 1.7 m up, intensity 2.2..4.5, distance 8..12); floor veins were lit squares (now a
  tileable `crackTexture()` with UVs running across tiles); hive webs were pale paper squares (now
  `webTexture()` on `webMat`); the hero vanished behind a wall top in ashwaste@liquid (new wall
  sightline cutaway: `worldCutaway` in WorldSurface.ts, a dithered 2 m hole on the camera-to-hero
  line, only in front of the hero, wall-kind materials only, set in `DungeonMesh.update`). Town
  stone tinted warm (0xb09c80). Cluster rocks of 0.5 m and under use the low bevel.
- Harness: `@landmark` stands three tiles south of the biggest room's biome landmark.

**From menus, DONE:** sprites drew as solid dark squares in the ambient occlusion pass. `Renderer.ts` `hideSpritesFromAO()` patches the GTAO pass instance so sprites hide with points and lines during its normal/depth draw (checked headlessly: hidden during, restored after).

- w10 crypt@room (calm, treasure room 14x13): gold hoard glows as the room's centre piece, floor
  reads clean, hero clear, 242 draw calls. The floor seal under the hoard did not show clearly.

- w9 render (town, foundry, foundry@treasure, crypt@room, sunkenTemple@room, ashwaste): no white blob
  at the ashwaste entry any more; foundry entry rubble sits behind the hero. The flat orange tile at
  the foundry entry was a `metal.rust` floor tile at metalness 0.5 and roughness 0.8 reflecting a
  flat blur of the warm environment map; rust is now metalness 0.12. The hero aura disc now follows
  the hero's floor height (it sat at y 0.06 whatever the floor). Rubble piles cast no shadow
  (ashwaste was 2.0M triangles in w9, much of it the sun's shadow pass).
- Harness: `--calm` removes monsters within 24 m of an `@` stand point (landmark shots kept landing
  in fights); `@liquid` stands on the floor tile next to water, lava or chasm nearest the entry.
  The harness's own cleanup must use `pkill -f "[v]ite preview --port 4304"`; a plain pattern kills
  the shell that runs it.

- Keep-clear rule (Props.ts `crowdsKeepClear`): features and props of radius 0.6+ never stand within 4
  tiles (Chebyshev) of the entry; props of radius 0.85+ never stand next to a spawn tile. Interactables
  (chests, altars, shrines) are exempt so no gameplay piece is dropped. Entry rubble blocks keep their
  nearest corner behind z -1.0 of the entry tile. The harness `@room`/`@<kind>` stand point now picks
  the nearest floor tile with no prop within one tile.
- Ashwaste triangle cut: cluster rocks of size 0.2 and under are bare icosahedra, up to 0.45 use the
  low bevel. The entry arch uses the walls' own stone and tint at 72% (the white blob over the hero).
  The hero light follows the hero's height (it sat at y 4 on raised floors).

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
