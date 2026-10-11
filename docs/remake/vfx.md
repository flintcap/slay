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
- [ ] Melee and attacks. Swing arcs per weapon, impacts, sparks, blood,
  bone chips, block flashes. Keyed off heroes' and creatures' hit frames.
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

1. Melee: wire `BodyFX` into `DungeonScene` (owned by vfx for effect
   wiring only): `bindHero(player, school)` once, `bindCreature(e.root,
   e.rig?.creature, school)` per spawn (Enemy.rig is protected: read it with a
   cast until creatures expose it, request in finish.md), unbind on death.
   Track statuses: `trackList(player.root, player.status, { lit: true })`,
   `trackQuery(e.root, e, { height, radius })`, bosses `lit: true`.
   Call `body.update(dt, camera)` and `body.clear()` on exit.
2. Melee: check `CombatFeel` impacts, sparks, blood and block flashes against
   the kit; tune hit sizes (impacts read small in the lab at 15 m).
3. Skills: `SkillRunner` visuals use `ELEMENTS[school].core`; switch to body
   colour and key casts to `release`. Only 1 skill maps to cold (check
   `schoolOf`).
4. Then monsters and bosses, status and loot polish, switch and clean.

## Notes for resume

- Lab: `SLAY_PORT=4329 timeout 900 node tools/check-decals.mjs [--only=a,b]`
  renders 12 scenes to `shots/vfx/` in about 30 s. Fails on page errors,
  black frames or more than 6% white.
- Look so far: bolts, novas, marks, beams, tells read well. Telegraphs now
  darken the floor with crisp coloured edges (emit 0.7), which answers
  ground's bright rings. Explosions read as glowing discs from above; level
  up is too big and bright; impacts are small. Tune these next.
- Status looks use `status.*` emitters (authored counts, big sprites); small
  `count` on other emitters scales them down to nearly nothing (count/12).
- Upload ranges: pools use `kit/Upload.ts` `markRange`, never
  `clearUpdateRanges` themselves, so several updates per draw still upload.
- `feel-entry.ts` loot check now expects `LootFX.hasBeacon(root)`, and item
  model beams stay hidden. Ask items (finish.md) to stop building
  `beam/pool/sigil/dropLight`.

- From ground: in `tools/shoot-ground.mjs` renders, fights put large glowing
  concentric rings round the hero and bright grey discs round the crypt boss
  (`wall_of_bone`?). They out-shine the floor; worth a look when you redo them.

- From ground: the old texture painter `src/art/Textures.ts` is gone. Its small
  effect textures (radial glow, beam, rune ring, web, crack, macro noise) now
  live in `src/fx/UtilityTextures.ts`, which vfx owns. Same function names and
  signatures.
