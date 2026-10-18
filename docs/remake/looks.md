# Stream: looks (Wave 4: light, shadow, air and colour)

Status: done

Goal: every place looks rich, dark and gritty, like a grim action RPG: deep
shadows, warm torch pools, cold air, wet and icy surfaces that catch light.
Never cartoonish or festive. Our own look: do not copy another game 1:1.
WebGPU only. New costs scale with the quality ladder: Low and Medium stay as
cheap as today. CC0 textures only, every file in `ASSETS.md`.

Checkers: `node tools/run-checks.mjs --only=<name>` for what you touch.
Renders: at most one small contact sheet per milestone, inside
`flock /tmp/slay-browser.lock timeout`. Run `node tools/get-chrome.mjs` once
before the first browser check. Real-GPU frame rate goes to the owner.

## Milestones

- [x] 1. Baseline, once: one contact sheet of the town and three biomes
  (one cave, one outdoor, one ice) on High. Note the weakest looks under
  "Notes for resume". (baseline taken, no commit of its own)
- [x] 2. Light and shadow: contact shadows from the sun and moon on High
  and Ultra; better torch falloff and flicker; light colour per biome.
  (looks: light, air, surfaces and colour moods)
  - Contact shadows: three's `SSSNode` in the post chain (`Renderer.ts`,
    `QualityProfile.contactShadows`), half resolution, 0.35 m march, pointed
    at the scene's shadow-casting sun or moon through a proxy light; the
    pass is skipped when there is none (indoor levels).
  - Torch falloff: packed lights fall off from a 0.4 m ball, not a point
    (`core/Lighting.ts`, `FLAME_RADIUS`): no white-hot wall behind a sconce.
  - Flicker: a dipping flame burns redder (`flameColour` in
    `world/Lighting.ts`, one call in `DungeonBuilder.updateLights`).
  - Light colour per biome: torches already had one; the indoor hero light
    now leans 22% toward the biome's torch colour.
- [x] 3. Air: height fog, cheap light shafts where a light meets fog, dust
  or snow motes near light. Off or reduced on Low and Medium.
  (looks: light, air, surfaces and colour moods)
  - Ground mist in the scene fog node (`Renderer.fogNodeFor`): lies 0.9 m
    deep on the hero's floor (`core/Air.ts`, set from `setWorldCutaway`),
    from just past the hero out, strength from the fog density, levels only.
    A few ALU ops; same on every quality.
  - Torch glow in the fog: exact in-scatter of a point light in even fog
    (`airLight` in `core/Lighting.ts`), the nearest torch-pool lights
    (`userData.torch`, or `userData.scatter`), solid surfaces only.
    `QualityProfile.air`: Low 0, Medium 0, High 4, Ultra 6.
  - Motes (`core/Motes.ts`): 22 per glowing torch, one draw, positions on
    the GPU from the same light list; warm dust rises, motes round a cold
    light sink like frost. High and Ultra only.
- [x] 4. Surfaces: wet floors, ice and metal that catch light (screen-space
  reflections on Ultra only if three.js WebGPU supports them well; else
  stronger roughness and normal work), better use of the floor and wall
  textures. (looks: light, air, surfaces and colour moods)
  - No SSR: three's `SSRNode` needs normal and metalness written by every
    material (more MRT outputs), and outputs that differ between Ultra and
    High rebuild every shader when the auto mode steps. Instead:
  - Standing water (`WorldMaterial.ts`, `wsPool`): the wettest heart of a
    damp patch on floors and terrain in wet places goes flat and near
    mirror-smooth (roughness 0.07, relief gone), so torches streak in it;
    in the frostvault the same patches read as glazed ice.
- [x] 5. Colour moods: a grade per biome (ice cold and blue-grey, hell
  ember red, swamp sick green, crypt bone and candle). Keep it dark.
  (looks: light, air, surfaces and colour moods)
  - Crypt bone and candle, frostvault blue-grey (grade and its ambient
    fill, which was a bright cobalt), tundra greyer, swamp sick green, hell
    ember red, town grey-blue instead of violet (grade in `TownScene`).
- [x] 6. Late pipelines (from speed's check-frames, see `speed.md` "Notes
  for resume"): put stand-ins in the scene's `warmup()` or build hidden at
  load for `warden:mouth`, `warden:shorts`, `item:gem`, `item:glow`, the
  `Output Color Transform` pass, `prop:altar` cloth and bone, and boss adds'
  `creature:bone` and `creature:shade`.
  (wip(looks): the icon studio warms its canvas output pass too)
  - Fixed and checked: `Output Color Transform` (the first item icon drawn
    to the screen canvas) is warmed by `warmIconStudio`; check-frames map
    no longer lists it. Draw calls on the map 185 (motes add one).
  - Not fixed, after one retry (see "Notes for resume"): `warden:mouth`,
    `warden:shorts`, `item-gem/item:gem` on the map; boss props and adds.
- [x] 7. Quality ladder check: every new effect has its level; Low and
  Medium cost no more than before (count draw calls and passes).
  (looks: handover)
  - check-quality: baseline, low, medium, ultra, high, low all drew a full
    frame (315 to 320 KB, none black), no page errors.
  - Low and Medium (by reading `QUALITY` in `Renderer.ts`): contact
    shadows off (no SSS pass), air 0 (the scatter loop runs zero times),
    motes off (no mesh in the scene). So no new pass and no new draw.
    Ground mist, standing water, the sized torch falloff, flame colour and
    the grades are a few shader ops at every level.
  - High and Ultra: one half-res contact shadow pass when a shadowed sun
    is up, a 4 or 6 light loop in the fog of opaque materials, one draw
    for the motes.
- [x] 8. Handover.

## Next up

Nothing. Stream done. Open items for `finish` are in "Handover".

## Notes for resume

- Baseline (High, 1280x720: town, caverns, darkForest, frostvault boss
  arenas), weakest looks: (1) frostvault was a bright, flat, saturated
  cobalt from wall to wall (ambient 0x7ea8d8 at 1.05 plus a sky-blue
  grade): cheerful, not cold; (2) the town's trodden ground read navy-purple
  (grade saturation 1.04 with a violet shadow tint over the strong blue
  hemisphere fill in `Town.ts`); (3) boss arenas in caverns and darkForest
  have hard black stripes across the floor (shadows of the arena ring), not
  a looks file, left alone; (4) no air: torches made pools on the floor but
  nothing in the fog, so rooms read clean rather than smoky.
- A biome shot takes about 5 minutes under software rendering; town 7.
- Late pipelines still made in play (check-frames, High, after the icon
  fix; two runs, so left per the testing rule):
  - map: `warden:mouth/MeshStandardMaterial`, `warden:shorts/hero-linen`,
    `item-gem/item:gem`. The gem stand-in in `itemLookStandIns` already
    uses a position+normal box like `Geo.clean`, so the key differs some
    other way (guess: the drop model's pose or scale in `buildDropModel`
    flips winding, or `receiveShadow` differs). The warden's mouth and
    shorts are likely hidden under armour at warm time or swapped in later
    (`Hero.ts` names them); `Engine.prime` skips hidden subtrees that hold
    a light.
  - boss: `prop:chestRare:0/prop:prop.timber.dark`,
    `prop:brazier:0/prop:prop.timber.charred`, `prop:altar:0/cloth.linen`,
    `creature:skin/creature:bone`, `creature:alt/creature:shade`. Guess:
    the brazier and altar hold lights, so prime does not unhide them;
    boss adds come from `warmSummons` with another rank or geometry.
  - Fix idea: in check-frames print each late pipeline's cache key next to
    the warm one with the same material, then match the odd field.

### From mapvariety: run theme light tint (optional to use)

- A map may carry a run theme: `level.runTheme` (`'flooded' | 'overgrown' |
  'burnt' | 'haunted'`, or undefined). `runTheme(level.runTheme)?.light` in
  `src/world/Themes.ts` is `{ tint, strength }` (cold blue-green, moss
  green, ember orange, pale violet; strength 0.3 to 0.4). It applies only
  to zones whose biome suits the theme: `themeFits(theme, zone.biome)`.
  Read it if you like (a grade or key light tint per zone); nothing needs it.

## For the owner to test

(Add one line per item: what to try and what should happen.)

- Outdoors on High (dark forest, desert): a monster's feet and a crate's
  base sit on the ground with a thin dark contact line; on Medium it is gone. Frame rate on High should be within a frame or two of before.
- In a torch-lit hall on High: each nearby torch has a soft glow in the
  air round it and a few dust motes drifting up through its light; in the
  frostvault the motes round the cold lamps sink. None on Medium or Low.
- Walk up to a wall sconce: the wall right behind the flame is bright but
  no longer burned flat white.
- Watch a torch for a few seconds: when it dips, its pool goes a little
  redder, then back.
- In the swamp, a flooded temple or a wet cave: the wettest floor patches
  show sharp torch streaks like standing water.
- Far end of a dungeon hall: the floor sinks into a thin low mist; around
  the hero the floor stays clear.
- Colour: crypt grey-brown with candle-yellow light, frostvault cold
  blue-grey (not bright blue), hell ember red, swamp sick green, town
  ground warm grey rather than purple.
- Start a run with a theme (flooded, overgrown, burnt, haunted): in zones
  that suit it, the light leans that way (cold blue-green, moss, ember,
  pale violet); in other zones nothing changes.
- Open the inventory for the first time in a run: no hitch when the first
  item icon draws.

## Handover

What exists now:
- Contact shadows from the sun or moon on High and Ultra: `SSSNode` in the
  post chain, `src/core/Renderer.ts` (`contactShadows`, `trackSun`).
- Light in the air: the nearest torches glow in the fog (analytic, no
  ray march), `airLight` in `src/core/Lighting.ts`, added in
  `fogNodeFor` in `Renderer.ts`; count per level is `QualityProfile.air`.
- Dust motes round those torches, one draw: `src/core/Motes.ts`.
- Low ground mist at the far end of halls: `uMist` in `Renderer.ts`,
  floor height from `src/core/Air.ts` (set by `setWorldCutaway`).
- Sized torch falloff (no white hot spot on walls) in `core/Lighting.ts`;
  flame colour that reddens on a dip, `flameColour` in
  `src/world/Lighting.ts`, used by `DungeonBuilder.updateLights`.
- Standing water on the wettest floors: `src/art/WorldMaterial.ts`.
- Colour moods: grades in `src/world/Biomes.ts` and `TownScene.ts`; a run
  theme leans the zone light (`themedMood`, `applyBiomeLighting`).
- The first item icon no longer builds a pass in play
  (`warmIconStudio` in `src/art/items/IconRender.ts`).

Left for `finish`:
- Late pipelines still made in play (list and guesses in "Notes for
  resume"): warden mouth and shorts, item gem drop, boss props (rare
  chest, brazier, altar) and boss adds (bone, shade).
- Boss arena floors in caverns and darkForest have hard black stripes
  (shadow of the arena ring); not a looks file.
- Real-GPU frame rate on High with contact shadows, air and motes: owner.
