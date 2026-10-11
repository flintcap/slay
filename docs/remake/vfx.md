# Stream: vfx (every skill, attack, status and loot effect)

Status: in progress

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
  blasts, chains, beams, channels, buffs, auras, summons.
- [ ] Monsters and bosses. Monster attacks, telegraphs on the ground, boss
  phase effects.
- [ ] Status and loot. Burn, chill, freeze, shock, poison, bleed, stun on
  bodies; drop beams by rarity, level up, portal, waypoint.
- [ ] Switch and clean. Delete old `Effects.ts`, `Particles.ts`, `Trails.ts`
  internals and every reference. Speed check on a busy fight.

## Checkers

`check-feel`, `check-skills` if present, `check-decals`, screenshots during
combat.

## Next up

1. Skills: `SkillRunner` visuals use `ELEMENTS[school].core`; switch to body
   colour and key casts to the hero `release` event. Only 1 skill maps to
   cold in `check-vfx` (`bySchool.cold: 1`): check `schoolOf`.
2. Skills: stacking washes out. The lab `storm` scene (every school at once)
   is mean luma 98 and 2.5% white: cap additive light where effects pile up
   (per-pool brightness budget or fewer flash cores per frame).
3. Skills: explosions read as glowing discs from above; level up is too big
   and bright; impacts are small at 15 m.
4. Then monsters and bosses, status and loot polish, switch and clean.

## Notes for resume

- Lab: `SLAY_PORT=4329 timeout 900 node tools/check-decals.mjs [--only=a,b]`
  renders 14 scenes to `shots/vfx/` in about 30 s. Fails on page errors,
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
