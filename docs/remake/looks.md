# Stream: looks (Wave 4: light, shadow, air and colour)

Status: not started

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

- [ ] 1. Baseline, once: one contact sheet of the town and three biomes
  (one cave, one outdoor, one ice) on High. Note the weakest looks under
  "Notes for resume".
- [ ] 2. Light and shadow: contact shadows from the sun and moon on High
  and Ultra; better torch falloff and flicker; light colour per biome.
- [ ] 3. Air: height fog, cheap light shafts where a light meets fog, dust
  or snow motes near light. Off or reduced on Low and Medium.
- [ ] 4. Surfaces: wet floors, ice and metal that catch light (screen-space
  reflections on Ultra only if three.js WebGPU supports them well; else
  stronger roughness and normal work), better use of the floor and wall
  textures.
- [ ] 5. Colour moods: a grade per biome (ice cold and blue-grey, hell
  ember red, swamp sick green, crypt bone and candle). Keep it dark.
- [ ] 6. Late pipelines (from speed's check-frames, see `speed.md` "Notes
  for resume"): put stand-ins in the scene's `warmup()` or build hidden at
  load for `warden:mouth`, `warden:shorts`, `item:gem`, `item:glow`, the
  `Output Color Transform` pass, `prop:altar` cloth and bone, and boss adds'
  `creature:bone` and `creature:shade`.
- [ ] 7. Quality ladder check: every new effect has its level; Low and
  Medium cost no more than before (count draw calls and passes).
- [ ] 8. Handover.

## Next up

1. Do Setup in PROTOCOL.md. Set `Status: in progress`.
2. Milestone 1: read `src/core/Renderer.ts` (post chain and grade),
   `src/core/Lighting.ts`, `src/world/Lighting.ts` and the biome look fields
   in `src/world/Biomes.ts`, then take the baseline contact sheet.

## Notes for resume

## For the owner to test

(Add one line per item: what to try and what should happen.)

## Handover

(Written when every milestone is ticked.)
