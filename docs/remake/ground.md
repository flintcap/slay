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
- [ ] Material library. Download CC0 PBR sets (Poly Haven, ambientCG): stone
  floor, flagstone, cobble, brick, rough rock, cave rock, dirt, mud, grass,
  forest floor with leaves, roots, sand, cracked earth, snow, ice, lava rock,
  obsidian, ash, wood planks, plaster, rusted metal, bone. Convert to 1024 px
  WebP (colour, normal, packed roughness/AO/height). New material API with
  world-space or triplanar UVs, tiling breakup and height-based blending
  between two materials. Switch every world surface to it.
- [ ] Delete the old texture painter (`Textures.ts` procedural maps,
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

1. Material library: download CC0 PBR sets to `/tmp/slay-downloads/ground/`,
   convert to WebP under `public/assets/textures/world/<name>/`, add rows to
   `ASSETS.md`, build the new material API, switch world surfaces.

## Notes for resume

- maps runs at the same time and will add tile kinds and zones. Draw unknown
  tile kinds as blocking walls until you support them.
- `surface()` returns a shared cached material: never attach
  `onBeforeCompile` to it, clone first.
- Wall tops must not be in the dissolving roof bucket, or walls look
  see-through (old bug).
- Exposing the whole THREE namespace on `window.SLAY` breaks tree shaking and
  artifact publishing. Expose only named classes.
- Asset pipeline is in: `src/core/Assets.ts` (`loadTexture`, `preloadAssets`,
  `assets:progress` event, fallback textures), `tools/check-assets.mjs`,
  `tools/bundle-artifact.mjs` writes `dist-single/files.json`. Contract in
  `CONTRACTS.md` under `src/core/Assets.ts`.
