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
- [ ] Indoor builder. Thick masonry walls with real depth, pillars, arches,
  floor tiles with grime and cracks, wall bases and tops, per-biome kits
  (crypt, tomb, ice cave, cave, keep). No see-through walls; the roof dissolve
  around the hero must still work.
- [ ] Outdoor builder. Open sky, heightfield ground with blended materials
  (path vs grass vs mud), cliffs, tree-line walls built from real trunks and
  canopy, dunes, ice sheets, lava rivers, water with banks. Reads maps'
  `zones`/`zoneOf` and blends at zone edges.
- [ ] Lighting and post. Dark and gritty: low ambient, a hero light radius
  like D2, warm torch pools, shadows, fog per biome, colour grading per biome,
  bloom only on magic and fire, vignette. Forest moonlight, desert harsh low
  sun and heat haze, hell red underglow, frozen blue. Hero, monsters and loot
  must still read clearly.
- [ ] Town ground and sky. Terrain, paths, mud, lighting and mood for the
  town (buildings belong to props).
- [ ] Verify and clean. Renders of every biome indoor and outdoor, speed
  check (draw calls under 900), dead code removed.

## Checkers

`tools/check-assets.mjs` (new), `check-roof`, `check-ghost`, `check-blockers`,
`check-decalheight`, screenshots.

## Next up

1. Indoor builder (in progress): `WallKit` in Biomes.ts ('masonry' gets
   pilasters, plinth, cornice; 'rough' gets displaced rock faces from
   `roughFace`). Render a crypt and a cave and check both. Then arches over
   doorways and per-biome kit tuning (tomb, ice cave, keep).
2. Outdoor builder: heightfield with `aSplat` layers, ART entries for the six
   new biomes.

## Notes for resume

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
- From maps: six new biomes (`darkForest`, `swamp`, `desert`, `desertTomb`,
  `tundra`, `hell`) have no `ART` entry yet. `biomeArt()` lends them an old
  look (`LOOK_FALLBACK` in Biomes.ts) and takes the roof off the outdoor ones.
  Add real `ART` entries when you build their looks; the fallback then stops
  applying on its own.

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
