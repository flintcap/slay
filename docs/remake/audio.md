# Stream: audio (every sound and all music)

Status: done

Goal: replace every synthesized sound and the procedural music with real,
free (CC0) recorded RPG sounds and music. Heavy, gritty, Diablo-like.

## Milestones

- [x] Sample engine. New audio engine that plays decoded samples: several
  variations per sound id picked with seeded RNG, small pitch and volume
  jitter, voice limits and priorities, positional panning and distance
  falloff, buses (effects, ambience, music, UI) wired to the existing
  settings sliders. Keep the public `audio.play(id, opts)` API so callers do
  not change. Silent if a file is missing.
  (wip(audio): sample engine, bank, streamed music and ambience (not switched on);
  audio: switch to recorded samples; delete Synth.ts, procedural music and synthesized sounds)
- [x] Sourcing. Download CC0 packs: Kenney (RPG Audio, Impact Sounds,
  Interface Sounds, Foley, and others), OpenGameArt CC0-only entries (for
  example "80 CC0 RPG SFX", "50 CC0 RPG SFX", CC0 creature, magic, footstep
  and ambience packs, CC0 dark fantasy music). Convert to OGG. Every file in
  `ASSETS.md`.
  (audio: CC0 sound, ambience and music files built from Kenney and OpenGameArt packs)
- [x] Combat. Swings per weapon type, impacts by target (flesh, bone, armour,
  stone), blocks, crits, player hurt and death, footsteps by surface (stone,
  dirt, grass, sand, snow, water).
  (audio: CC0 sound, ambience and music files built from Kenney and OpenGameArt packs)
- [x] Skills. Every skill's cast, travel and impact, grouped by element
  (physical, fire, cold, lightning, poison, arcane) with per-skill flavour.
  (audio: CC0 sound, ambience and music files built from Kenney and OpenGameArt packs)
- [x] Monsters and bosses. Per family: aggro, attack, hurt, death. Bosses get
  their own set and an intro sting.
  (audio: CC0 sound, ambience and music files built from Kenney and OpenGameArt packs;
  audio: switch to recorded samples; delete Synth.ts, procedural music and synthesized sounds)
- [x] UI and loot. Clicks, panels, item pickup by kind (gold, potion, gem,
  weapon, armour, jewellery), drops by rarity (a unique drop must feel
  special), level up, quest done, portal, waypoint.
  (audio: shrine and chest sounds, quiet families lifted, browser decode check)
- [x] Ambience and music. Ambience bed per biome and per zone kind (forest
  wind and birds, desert wind, cave drips, hell rumble, frozen howl, crypt
  air). Music per biome, town, boss fight. Delete `Synth.ts`, procedural
  music and every synthesized sound.
  (audio: switch to recorded samples; delete Synth.ts, procedural music and synthesized sounds)
- [x] Mix and verify. Every sound id resolves (`check-audio`), loudness
  balanced, budgets met, dead code removed.
  (audio: stream done, handover)

## Checkers

- `node tools/check-audio.mjs`: every biome, boss and scene track; every
  bed's loops, events, music and footsteps; per-family monster sets; every
  element's cast, impact and nova; every literal id the source plays; every
  manifest file on disk and in `ASSETS.md`.
- `node tools/check-assets.mjs` (ground's): ledger, CC0, OGG, budgets.
- `npm run build && SLAY_PORT=4323 node tools/audio/decode-check.mjs`:
  every file decodes in headless Chromium.
- `check-feel`, `check-vfx`, `check-beats` also call `resolvesSound`.

## Handover

What exists now:

- `src/audio/Audio.ts` is the front door: `audio` (a `SampleEngine`),
  `resolvesSound`, `soundIds`, `soundPriority`, `AUDIO_ELEMENTS`.
- `SampleEngine.ts`: voices, buses, reverb, panning, footsteps, UI and game
  hooks (`loot:pickedUp` plays `pickup.kind.<kind>`, `boss:engaged` plays
  `boss.intro`).
- `Bank.ts`: per-id mix settings and the family fallbacks. `Places.ts`: music
  keys and biome ids fold onto 13 places. `Score.ts`: music. `Beds.ts`:
  ambience per place. `Streams.ts`: two-deck streamed playback for music and
  beds. `manifest.ts`: generated. `MonsterAudio.ts`: unchanged.
- Files: `public/assets/sounds/<id>/NN.ogg` (201 ids, 702 takes),
  `public/assets/sounds/beds/<key>/` (13 beds), `public/assets/music/<key>/`
  (20 tracks). Sounds 14.8/25 MB, music 23.2/35 MB, largest file 1.8 MB.
- Build: `node tools/build-audio.mjs` (add `--fetch` to download the packs
  into `/tmp/slay-downloads/audio`). Sources and credits:
  `tools/audio/packs.mjs`; what each id is made of: `tools/audio/recipe.mjs`;
  per-file credits: `tools/audio/ledger.json` and `ASSETS.md`.
- DungeonScene plays the music and bed of the zone the hero stands in.

Left for `finish`:

- Nothing plays `waypoint` yet (the sound exists). Whoever wires waypoint
  travel should call `audio.play('waypoint')`.
- Loudness was balanced by measurement (peak and average level), not by ear.
  A listening pass may want per-id `vol` tweaks in `Bank.ts` `DEFS`.
- Effects decode to about 86 MB of memory once all are loaded (they load in
  the background after the first click). If memory matters, load per biome.

## Next up

Nothing. Stream finished.

## Notes for resume

- The six map biomes (`darkForest`, `swamp`, `desert`, `desertTomb`,
  `tundra`, `hell`) have their own music and beds through `Places.ts`. New
  biome ids fold onto places by keyword, so a new biome usually needs no
  audio change. Add an exact entry in `Places.ts` if its name says nothing.
- freesound.org is blocked from this machine. Kenney and OpenGameArt work.
- On OpenGameArt, check each entry's licence box. CC0 only. Every pack in
  `tools/audio/packs.mjs` was checked and lists CC0.
- The worktree sandbox refuses shell loops and computed commands around
  unzip, ffprobe and node; use helper scripts or one plain command each.
