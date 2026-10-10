# Stream: audio (every sound and all music)

Status: in progress

Goal: replace every synthesized sound and the procedural music with real,
free (CC0) recorded RPG sounds and music. Heavy, gritty, Diablo-like.

## Milestones

- [ ] Sample engine. New audio engine that plays decoded samples: several
  variations per sound id picked with seeded RNG, small pitch and volume
  jitter, voice limits and priorities, positional panning and distance
  falloff, buses (effects, ambience, music, UI) wired to the existing
  settings sliders. Keep the public `audio.play(id, opts)` API so callers do
  not change. Silent if a file is missing.
- [ ] Sourcing. Download CC0 packs: Kenney (RPG Audio, Impact Sounds,
  Interface Sounds, Foley, and others), OpenGameArt CC0-only entries (for
  example "80 CC0 RPG SFX", "50 CC0 RPG SFX", CC0 creature, magic, footstep
  and ambience packs, CC0 dark fantasy music). Convert to OGG. Every file in
  `ASSETS.md`.
- [ ] Combat. Swings per weapon type, impacts by target (flesh, bone, armour,
  stone), blocks, crits, player hurt and death, footsteps by surface (stone,
  dirt, grass, sand, snow, water).
- [ ] Skills. Every skill's cast, travel and impact, grouped by element
  (physical, fire, cold, lightning, poison, arcane) with per-skill flavour.
- [ ] Monsters and bosses. Per family: aggro, attack, hurt, death. Bosses get
  their own set and an intro sting.
- [ ] UI and loot. Clicks, panels, item pickup by kind (gold, potion, gem,
  weapon, armour, jewellery), drops by rarity (a unique drop must feel
  special), level up, quest done, portal, waypoint.
- [ ] Ambience and music. Ambience bed per biome and per zone kind (forest
  wind and birds, desert wind, cave drips, hell rumble, frozen howl, crypt
  air). Music per biome, town, boss fight. Delete `Synth.ts`, procedural
  music and every synthesized sound.
- [ ] Mix and verify. Every sound id resolves (`check-audio`), loudness
  balanced, budgets met, dead code removed.

## Checkers

`check-audio` (update it for samples), `tools/check-assets.mjs` once ground
has written it.

## Next up

1. Run Setup in `docs/remake/PROTOCOL.md`.
2. Read `src/audio/Audio.ts` (`play`, `soundIds`, `resolvesSound`),
   `Synth.ts`, `Music.ts`, `Ambience.ts`, `MonsterAudio.ts`, and grep for
   `audio.play(` to list every sound id in use.
3. Build the sample engine milestone.

## Notes for resume

- From maps: six new biomes play `music` keys equal to their ids:
  `darkForest`, `swamp`, `desert`, `desertTomb`, `tundra`, `hell` (and
  `boss.<id>` if you key boss music by biome). Until a track exists Music.ts
  falls back to the crypt dirge. Ambience may also want them.

- freesound.org is blocked from this machine. Kenney and OpenGameArt work.
- On OpenGameArt, check each entry's licence box. CC0 only.
- Software rendering boots slowly; audio can mostly be checked headlessly.
