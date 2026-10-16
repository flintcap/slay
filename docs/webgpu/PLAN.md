# WebGPU build-out

The game draws only through WebGPU now. The WebGL2 fallback is gone: a
browser without WebGPU gets a plain message on the boot screen.

This list comes from reading the render code as it stands
(`src/core/Renderer.ts`, `Lighting.ts`, `ShadowNodes.ts`, `Studio.ts`,
`src/fx/kit/Particles.ts`, `src/art/WorldMaterial.ts`). Each step names what
it changes, what it buys, and how it is checked. Steps that cost GPU time sit
on the quality presets, so Low and Medium stay cheap.

## What we have

- One `WebGPURenderer`, shared by the game, icons, portraits and paperdoll.
- Post chain: scene pass into a half-float target with motion and emission
  beside it, temporal AA (High, Ultra), optional GTAO (Ultra), bloom from
  emission, one grade pass (exposure, contrast, split
  tone, vignette, aberration, grain, haze, hurt and low-life), ACES, SMAA (Medium). The chain draws
  through a camera of its own, so a new map never rebuilds it.
- Lights: shadowless torches packed in one storage buffer and one loop,
  culled to the view each frame. Shadow casters on three's own path, redrawn
  on a clock (`shadowHz`). Shadow pass skips surface shading.
- Particles: GPU compute moves them; three GPU passes pick, place and write
  the draw list; one indirect draw.
- Still geometry in render bundles; still town matrices frozen.

## Steps

1. **Soft particles.** *(done)* Smoke, fire and glows fade where they meet a wall or
   the floor instead of cutting a hard line. Flat ground sprites are left
   sharp. Check: pictures of smoke against a wall.
2. **GPU timings.** *(done)* Read real GPU time per frame with timestamp queries, show
   it in the perf readout, and let the auto quality step on GPU time rather
   than frame time alone.
3. **Temporal anti-aliasing** *(done)* on High and Ultra, in place of SMAA. Uses a
   velocity buffer from the scene pass. Removes the crawl on thin edges and
   the sparkle on metal. Later the same buffers drive temporal upscaling, so
   the auto mode drops resolution with far less blur.
4. **Glow from what glows.** *(done)* The scene pass writes emission to its own
   buffer and bloom reads that, so magic, fire and hot metal bloom and a
   torch-lit wall does not.
5. **Contact shadows** from the sun or moon, a short screen-space trace that
   seats heroes, monsters and props on the ground. High and Ultra.
6. **Light shafts** through trees and windows in outdoor and lit biomes.
   Ultra, and only where the scene has a sun or moon shadow.
7. **Tiled torch lighting.** A compute pass sorts the packed torches into
   screen tiles, so a pixel loops over the two or three that reach it, not
   all sixty-four. Lets busy maps carry more lights.
8. **Sparks that hit the world.** Particles collide with the depth buffer, so
   sparks skip off walls and stairs, not only a flat floor height.
9. **Hover outline** *(done for monsters)* on the monster or item under the
   cursor, drawn by the GPU around its silhouette. The body marks itself in
   a spare channel of the motion buffer and the grade draws the edge, so
   nothing is drawn twice. Medium and up.

Each step lands with typecheck, the fast checkers and fresh pictures.
