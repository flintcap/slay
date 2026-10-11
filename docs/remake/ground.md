# Stream: ground (assets pipeline, world textures, terrain, lighting)

Status: in progress

Goal: the world looks like Diablo II or Path of Exile. Photo-based CC0
textures, heavy stone and wet earth, deep shadows, warm torch pools, open sky
outdoors. Remake from nothing; delete the old painted textures.

## Milestones

- [x] Asset pipeline. (ground: asset pipeline, preloader, check-assets, files.json) Grow `src/core/Assets.ts` into a preloader (progress
  shown on the existing loading screen through an event, decode, cache, a
  fallback when a file fails). `tools/check-assets.mjs`: every file under
  `public/assets/` is in `ASSETS.md`, CC0, within budgets. Make
  `tools/bundle-artifact.mjs` write the page plus a list of asset files so
  Claude can publish them with the artifact's `files` option (print the
  mapping as JSON to `dist-single/files.json`).
- [x] Material library. (ground: photo material library, world-space shader) Download CC0 PBR sets (Poly Haven, ambientCG): stone
  floor, flagstone, cobble, brick, rough rock, cave rock, dirt, mud, grass,
  forest floor with leaves, roots, sand, cracked earth, snow, ice, lava rock,
  obsidian, ash, wood planks, plaster, rusted metal, bone. Convert to 1024 px
  WebP (colour, normal, packed roughness/AO/height). New material API with
  world-space or triplanar UVs, tiling breakup and height-based blending
  between two materials. Switch every world surface to it.
- [x] Delete the old texture painter. (ground: delete the texture painter and palettes) (`Textures.ts` procedural maps,
  `Palettes.ts`, `WorldSurface.ts` if unused). Keep only small utility
  textures fx still uses, moved to a file vfx owns if needed (note it in
  `vfx.md`).
- [x] Indoor builder. (wip(ground): wall kits, doorway arches, outdoor terrain with tree lines; checked in renders by wip(ground): calmer ice and crystal, dimmer floor cracks, muted hive and void spire) Thick masonry walls with real depth, pillars, arches,
  floor tiles with grime and cracks, wall bases and tops, per-biome kits
  (crypt, tomb, ice cave, cave, keep). No see-through walls; the roof dissolve
  around the hero must still work.
- [x] Outdoor builder. (wip(ground): exits drawn by kind, trees planted in culled blocks; wip(ground): wall lights in the biome's own colour, ragged ruin tops; dull dark sludge, no scattered lava crust) Open sky, heightfield ground with blended materials
  (path vs grass vs mud), cliffs, tree-line walls built from real trunks and
  canopy, dunes, ice sheets, lava rivers, water with banks. Reads maps'
  `zones`/`zoneOf` and blends at zone edges.
- [x] Lighting and post. (wip(ground): light moods per biome, light from below, heat haze; grain scaled to the light, brighter night forests) Dark and gritty: low ambient, a hero light radius
  like D2, warm torch pools, shadows, fog per biome, colour grading per biome,
  bloom only on magic and fire, vignette. Forest moonlight, desert harsh low
  sun and heat haze, hell red underglow, frozen blue. Hero, monsters and loot
  must still read clearly.
- [x] Town ground and sky. (wip(ground): town ground as one splatted sheet with tracks and mud; paler town paths in d9e9f4a) Night camp: moonlit hemisphere and moon key, warm fire and lantern pools, one splatted ground sheet (grass, dirt, stony, mud). Terrain, paths, mud, lighting and mood for the
  town (buildings belong to props).
- [ ] Verify and clean. Renders of every biome indoor and outdoor, speed
  check (draw calls under 900), dead code removed.

## Checkers

`tools/check-assets.mjs` (new), `check-roof`, `check-ghost`, `check-blockers`,
`check-decalheight`, screenshots.

## Next up

1. Verify and clean: `check-perf` (town and busy maps under 900 draw calls),
   `check-ghost`, `check-roof`, `check-blockers`, `check-decalheight`,
   `check-assets`, then a last render of every biome with
   `tools/shoot-ground.mjs` and a dead code sweep in my files.
2. Then "Finishing a stream": Status done, Handover, QUEUE.md (ground to Done).

## Notes for resume

- From props (requests, `DungeonBuilder.buildProps`):
  1. Props are now dressed per zone (`src/art/props/Dressing.ts`), but
     templates are built with the level's art, so a forest zone beside a
     crypt zone gets crypt-coloured stumps. Please group placements by
     kind, variant and the zone biome at `level.zoneOf[p.y * w + p.x]`, and
     call `propTemplate(kind, biomeArt(zoneBiome, level.variant), ...)`.
  2. Every wall light template already resolves its light to
     `art.lightColor` (`mood`), and fires to the biome flame, so line
     `g.kind === art.wallLight ? art.lightColor : tmpl.light?.color` can
     become `tmpl.light?.color`.
  3. Placement no longer reads BiomeArt's prop vocabulary (`wallLight`,
     `props`, `wallProps`, `featureProps`, `landmarks`, `detailProps`,
     `pillar`). Once 2 is done, those fields can be dropped from BiomeArt.

- Requests left in props.md (teal prop lights) and vfx.md (bright fight rings).

- From maps: in the swamp zone render (`tools/shoot-zones.mjs`, tier 3) the
  floating motes are so many and so bright that the frame washes out to white
  and the ground is hard to read. Worth a look when you tune the swamp.
- Look renders: `SLAY_PORT=4322 timeout 2700 node tools/shoot-ground.mjs
  --biomes=crypt,darkForest,...` (one boot, loads the area of each biome,
  hero in a middle room, monsters cleared, 1024x576). About 2 minutes a
  biome. `tools/screenshot.mjs` biome shots warp to the boss and take far
  longer.
- Renders are slow when three agents render at once (a 1920x1080 dungeon shot
  took 25 minutes). Use `--width=1280 --height=720` and at most three shots
  per run.
- Wall lights (`art.wallLight`) shine in `art.lightColor`, not the prop's
  stock colour, so biome variants keep their mood.

- From maps: the zone generators are on and emit `ruin`, `deepWater`,
  `bridge` and `ice`. maps made the one-line edit in DungeonBuilder's
  `tile()` accessor: it now returns `drawAsKind(v)`, so new kinds draw as
  wall, water or floor. Colliders already read raw tiles through
  `isWalkableValue`, so ruin and deep water block. When you give a kind its
  own look, branch on the raw value before `drawAsKind`.
- From maps: levels now carry `zones`, `zoneOf` and (boss floor) `arena`.
  Outdoor zones are open ground with a void edge meant as a tree line, reeds,
  dune ridge or cliff, not masonry. In milestone 4 one area can hold two
  outdoor zones side by side (up to about 230 tiles on the long side).
- From maps: maps are live (milestone 4). Areas hold one or two zones; two
  outdoor zones meet at a seam. `level.exits[0].kind` says how the way on
  should look (caveMouth, doorway, stairs, portal) and `facing` which way you
  walk through it. Tiles 7 and 8 are renamed `T_EXIT` and `T_ARRIVAL`;
  Props.ts still imports the old names, which stay as aliases. Please switch
  Props.ts to the new names when you next touch it. DungeonScene draws the
  waypoint ring at `level.waypoint`; props are kept off it.
- Every biome has its own `ART` entry. A biome added later without one
  borrows the crypt's look (outdoor ones lose the roof); `LOOK_FALLBACK` is gone.

- maps runs at the same time and will add tile kinds and zones. Draw unknown
  tile kinds as blocking walls until you support them.
- `surface()` returns a shared cached material: never attach
  `onBeforeCompile` to it, clone first.
- Wall tops must not be in the dissolving roof bucket, or walls look
  see-through (old bug).
- Exposing the whole THREE namespace on `window.SLAY` breaks tree shaking and
  artifact publishing. Expose only named classes.
- Material system: `src/art/TextureSets.ts` (the downloaded sets, average
  colours, sizes), `src/art/SurfaceLibrary.ts` (every surface key to a set,
  base colour, roughness), `src/art/Materials.ts` (`surface()` on photo sets,
  same contract as before), `src/art/WorldMaterial.ts` (world-space and
  triplanar level materials, up to 4 layers by `aSplat`, cutaway and roof
  dissolve as shared uniforms). Add a set: a line in `tools/fetch-textures.mjs`,
  run it with `--only=name`, then add it to `TEXTURE_SETS` with the average from
  a 1x1 linear resize of its albedo.
- A surface whose key glows but whose set has no emission map glows only in
  the low points of its height map (cracks), never all over.
- Effect textures moved to `src/fx/UtilityTextures.ts` (vfx owns it).
- Asset pipeline is in: `src/core/Assets.ts` (`loadTexture`, `preloadAssets`,
  `assets:progress` event, fallback textures), `tools/check-assets.mjs`,
  `tools/bundle-artifact.mjs` writes `dist-single/files.json`. Contract in
  `CONTRACTS.md` under `src/core/Assets.ts`.
