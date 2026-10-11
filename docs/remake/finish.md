# Stream: finish (cleanup, speed, long play test, publish)

Status: in progress

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

## Leftovers checklist

Gathered from every stream's Handover and "Notes for resume". Ticked when
fixed, or marked "won't" with the reason.

Requests (fixes other streams asked for):

- [ ] R1 props: `generateRun` sets `level.variant` after props are placed.
  Pass the variant into `generateLevel` so props dress in it.
- [ ] R2 props: `ensureInteractables` plants `chest.rare` as kind `chest`;
  use `chestKindFor`.
- [ ] R3 vfx/creatures: public read-only `Enemy.rig`; drop the cast in
  `DungeonScene.watchBody`.
- [ ] R4 vfx/items: `ItemModels` stops building `beam`, `pool`, `sigil`,
  `dropLight` on drops (LootFX owns beacons).
- [ ] R5 ground: `DungeonBuilder.buildProps` builds templates with each
  zone's biome art; wall-light line uses `tmpl.light?.color`; drop BiomeArt
  prop vocabulary fields nothing reads.
- [ ] R6 audio: play `waypoint` on waypoint travel.
- [ ] R7 maps: tips, quest log and run stats text that still says "stairs"
  or "depth". (`T_STAIRS_*` aliases: already gone, grep 0.)
- [ ] R8 npcs/props: `check-npcdraws` fails headless in `irisTexture`.
- [ ] R9 heroes: `PLAN.md` still lists deleted files under heroes.
- [ ] R10 ground: `Town.ts` imports `CharClassId` without using it.

Dead code:

- [ ] D1 items: unused brushes in `src/art/Paint.ts`.
- [ ] D2 a sweep for exports nothing imports, old checkers and old assets.

Speed:

- [ ] S1 per-step garbage over budget (304 to 411 KB against 200):
  `Nav.lineOfSight`/`worldToTile` in shot ticks, `Enemy.hasStatus`/`stacksOf`
  closures, monster AI, HeroModel.
- [ ] S2 depth 9 forest 1.60M triangles against 1.5M.
- [ ] S3 depth 12 perf never measured.
- [ ] S4 first town visit builds the nine townsfolk in about 28 s; build
  over several frames or off the main loop.
- [ ] S5 first build per monster (150 to 500 ms) and boss (0.6 to 2.9 s) on
  the main thread.
- [ ] S6 boss bodies 13k to 18.7k triangles against 12k.

Looks (polish, no stat changes):

- [ ] L1 items: `metal.dark` too dark under torches; kraken pauldrons
  blobby; quilting faint.
- [ ] L2 creatures: ashen prophet wings like planks, hive queen wings dim,
  stalker prime plain, glacier titan fists, storm djinn dark.
- [ ] L3 heroes: warden's field kit sword sits high in the hand on the
  select screen.
- [ ] L4 one real dungeon frame with monsters in view, looked at.

Checks never run by their stream:

- [ ] C1 `check-skills` for warden and shadowblade (one class a run).
- [ ] C2 `check-soak`, small settings first.

Noted, not planned (owner's call or low value):

- audio: a listening pass by ear is not possible here; loudness stays
  balanced by measurement. Effects decode to about 86 MB once loaded.
- creatures: a boss portrait opens a second WebGL context once per boss.
- npcs: Renn's hand-on-hip floats a little; ledger and map read flat from
  far; walkers do not path round buildings.
- maps: `check-curve` fails 3 of 30, same as before the remake.

## Next up

1. Work the checklist top down: requests, dead code, speed, looks, checks.

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
  3. `check-perf` depth 1 garbage is 304 KB per step (ground saw 411). The
     top allocator is `tickProjectiles` (52 KB): `Nav.lineOfSight` calls
     `worldToTile`, which returns a new object, twice per shot per step.
     `Enemy.hasStatus`/`stacksOf` build a closure per call too.

- The cancelled overhaul's quality stream never took its final speed numbers
  or ran the soak (see `docs/overhaul/quality.md`). Those tools are
  `tools/check-perf.mjs` and `tools/check-soak.mjs`.
