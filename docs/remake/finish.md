# Stream: finish (cleanup, speed, long play test, publish)

Status: not started

Goal: tie the remake together. Nothing old left behind, fast enough, no
crashes, docs true, published.

## Milestones

- [ ] Requests. Do every request other streams left for a stream that has
  finished (search "Notes for resume" in every progress file).
- [ ] Dead code. Find and delete code nothing calls any more, old assets and
  old checkers. `tsc` clean, build clean.
- [ ] Speed. Draw calls (under 900 in town and a busy map), triangles,
  textures, load time, memory, garbage per frame. Fix the worst.
- [ ] Long play test. A headless soak (`check-soak`) through many maps:
  errors, leaks, slowdowns. Fix what it finds.
- [ ] Docs. `CONTRACTS.md`, `CLAUDE.md`, `ASSETS.md` accurate.
- [ ] Publish. Bundle with `node tools/bundle-artifact.mjs` and hand Claude
  the page and the asset file list.

## Next up

1. Run Setup in `docs/remake/PROTOCOL.md`.
2. Read every other progress file's Handover section.

## Notes for resume

- From props (maps is done, so these are yours):
  1. `DungeonGen.generateRun` sets `level.variant` after `generateLevel`
     has already called `placeProps`, so props are always dressed as the
     plain biome. Set the variant before placement (pass `variantOf` into
     `generateLevel`). `check-dressing` warns until then.
  2. `ensureInteractables` plants `chest.rare` as kind `chest`. Use
     `chestKindFor(interact)` from `world/Props.ts` for the kind, so a rare
     chest draws as the rare chest model.

- From vfx (creatures and items are done, so these are yours):
  1. `Enemy.rig` is protected; `DungeonScene.watchBody` reads it with a cast
     (`(e as unknown as { rig }).rig?.creature`). Expose a public read-only
     `rig` getter on `Enemy` and drop the cast.
  2. `ItemModels` still builds `beam`, `pool`, `sigil` and `dropLight`
     children on dropped items. `LootFX` hides them and draws its own pooled
     beacons, so stop building them (saves meshes and a light per drop).

- The cancelled overhaul's quality stream never took its final speed numbers
  or ran the soak (see `docs/overhaul/quality.md`). Those tools are
  `tools/check-perf.mjs` and `tools/check-soak.mjs`.
