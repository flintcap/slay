# Stream: vfx (every skill, attack, status and loot effect)

Status: done

Goal: every skill and attack effect remade from nothing in the Diablo II and
Path of Exile style: punchy, readable, elemental, lit.

## Milestones

- [x] Toolkit. New effect toolkit: GPU-friendly particles, soft sprites and
  flipbooks (CC0 or generated), ribbons and trails, light flashes, ground
  scorch, screen distortion if affordable. Pools, budgets, no garbage per
  frame. (`wip(vfx): new effect kit (particles, ribbons, lights, shapes,
  ground)` and `feat(vfx): effect library rebuilt on the kit; body looks,
  loot beacons, effect lab`. Screen distortion skipped: too costly under
  software rendering. Old names grep: 0 hits.)
- [x] Melee and attacks. Swing arcs per weapon, impacts, sparks, blood,
  bone chips, block flashes. Keyed off heroes' and creatures' hit frames.
  (`feat(vfx): melee swings keyed to hit frames, material hits, block
  flashes`.)
- [ ] Skills. Every skill's cast, travel, impact and lingering effect, per
  element (physical, fire, cold, lightning, poison, arcane). Projectiles, area
  blasts, chains, beams, channels, buffs, auras, summons. (`wip(vfx): skill
  colours from the element body, flares on release, shared exposure`.
  `check-skills --classes=ranger`: 22 working, 0 refused, 0 did nothing,
  0 threw. `check-vfx`: every school has a cast, wake, impact and mark.)
- [x] Monsters and bosses. Monster attacks, telegraphs on the ground, boss
  phase effects. (`feat(vfx): monster shots, hazards and boss phases through
  the effect kit` and `feat(vfx): hazards are floor glows only; portals and
  waypoints open in light`. grep hazardMaterial, hazardGeo: 0.)
- [x] Status and loot. Burn, chill, freeze, shock, poison, bleed, stun on
  bodies; drop beams by rarity, level up, portal, waypoint. (`feat(vfx):
  hazards are floor glows only; portals and waypoints open in light`; body
  looks and beacons came with the effect library commit.)
- [x] Switch and clean. Delete old `Effects.ts`, `Particles.ts`, `Trails.ts`
  internals and every reference. Speed check on a busy fight.
  (`refactor(vfx): drop effect exports nothing calls` and `perf(vfx): body
  looks skip status questions for bodies with no debuffs`. grep Trails,
  decalAtlasTexture, dissolveObject, effects.trails, hazardMaterial: 0 code
  hits. `check-perf --depths=1`: 490 draw calls (budget 900), 15 lights,
  update 3.5 ms; garbage 304 KB per step is over, none of it from fx.)

## Checkers

`check-feel`, `check-skills` if present, `check-decals`, screenshots during
combat.

## Next up

Nothing. The stream is done; see Handover.

## Notes for resume

- Lab: `SLAY_PORT=4329 timeout 900 node tools/check-decals.mjs [--only=a,b]`
  renders 16 scenes to `shots/vfx/` in about 30 s. Fails on page errors,
  black frames or more than 6% white.
- Look so far: bolts, novas, marks, beams, tells read well. Telegraphs now
  darken the floor with crisp coloured edges (emit 0.7), which answers
  ground's bright rings. Explosions read as glowing discs from above; level
  up is too big and bright; impacts are small. Tune these next.
- `BodyFX` is wired in `DungeonScene` (`watchBody` per spawn, hero bound
  once). Creature swing edges run from the bone that carries
  `socket:weapon` (walking up while shorter than 0.18 x scale) to the tip.
  Lab creatures must windup then attack again: only that reaches the
  animator's `strike` phase, where `hit` fires.
- Hit materials live in `fx/Materials.ts` (`hitMaterial(family)`,
  `MATERIAL_BURST`, `MATERIAL_MARK`); `Enemy` uses them for hit and death.
- Requests for `Enemy.rig` and item drop beams are in `finish.md`.
- Monster effects: the scene binds the effect system in `fx/MonsterFX.ts`
  (`bindMonsterFX`). Abilities fly bolts/shards/orbs as carried kit
  projectiles (`ProjectileOpts.carried`, moved with `setEndpoint`); rocks and
  rings stay meshes. Hazards are `decals.glow(HAZARD_GLOW[type])`. Boss
  phases call `effects.bossPhase`. Portals and waypoints call
  `effects.gateway`.
- Exposure: `kit/Exposure.ts` `FX_EXPOSURE` is shared by every light-adding
  shader; `EffectSystem.update` lowers it from summed flash intensity (free up
  to 90, floor 0.5). Telegraphs ignore it. Lab `storm` went from mean 98 to 37.
- Bursts cap `count` at 3x authored and `scale` at 3.5, and core layers
  (count 1 to 2: flashes, rings) are drawn once.
- Status looks use `status.*` emitters (authored counts, big sprites); small
  `count` on other emitters scales them down to nearly nothing (count/12).
- Upload ranges: pools use `kit/Upload.ts` `markRange`, never
  `clearUpdateRanges` themselves, so several updates per draw still upload.
- `feel-entry.ts` loot check now expects `LootFX.hasBeacon(root)`, and item
  model beams stay hidden.

- From ground: in `tools/shoot-ground.mjs` renders, fights put large glowing
  concentric rings round the hero and bright grey discs round the crypt boss
  (`wall_of_bone`?). They out-shine the floor; worth a look when you redo them.

- From ground: the old texture painter `src/art/Textures.ts` is gone. Its small
  effect textures (radial glow, beam, rune ring, web, crack, macro noise) now
  live in `src/fx/UtilityTextures.ts`, which vfx owns. Same function names and
  signatures.

## Handover

What exists now:

- Kit: `src/fx/kit/` (pooled GPU particles and emitters, ribbons, light
  pool, instanced cores/beams/columns/shells, solids, ground marks, glows
  and telegraphs, upload ranges, shared exposure). Nothing allocates per
  frame.
- Library: `src/fx/Effects.ts` (`EffectSystem`: impacts, melee hits,
  projectiles incl. carried monster shots, blasts, novas, slams, cones,
  beams, channels, chains, auras, shields, summons, teleports, level up,
  boss phases, gateways). `src/fx/Particles.ts` (`FXSystem` bursts),
  `src/fx/Decals.ts` (marks, glows, telegraphs).
- Bodies: `src/fx/BodyFX.ts` (swing arcs on hero and creature `hit`
  frames, cast flares on `release`, status looks). Loot: `src/fx/LootFX.ts`
  (pooled beacons by rarity). Monster side: `src/fx/MonsterFX.ts`.
  Hit materials: `src/fx/Materials.ts`.
- Lab: `tools/vfxlab.html` via `tools/check-decals.mjs` (16 scenes in
  about 40 s). Checkers passing: check-vfx, check-feel, check-particles,
  check-decalheight, check-decals, check-bossfights (one boss),
  check-skills (ranger).

Left for `finish` (also in `finish.md`): expose `Enemy.rig`; stop item
models building `beam/pool/sigil/dropLight`; per-step garbage outside fx
(`Nav.worldToTile` in projectile ticks, closures in `Enemy.hasStatus`);
`check-skills` for warden and shadowblade (each class boots the whole game,
so run one at a time).
