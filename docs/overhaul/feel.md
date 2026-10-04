# Stream: feel (combat feedback, VFX and audio)

Status: in progress

## Milestones

- [x] Hit feedback: hit-stop, flash, knockback, tuned camera shake, a heavier punch on crits and kills. — "Make every blow land: hit-stop, flash, knockback and kill punch"
- [x] Skill VFX: an upgrade pass per element (fire, frost, lightning, poison, bone, physical) with proper impacts and lingering decals. — "Give every element its own cast, flight, impact and scar"
- [x] Loot: drops arc out with a sound and beam by rarity; pickups and gold feel good. — same commit
- [ ] Audio: layered weapon and impact sounds, footsteps by floor type, UI sounds, ambient beds per biome, combat-reactive music and boss music.
- [ ] Performance guard: particle and sound budgets so big fights stay smooth.
- [ ] Sweep: every skill has a cast, travel and impact beat; nothing is silent.

## Next up

Milestone 4, audio. Partly done in the same commit (see notes): ambience beds,
footsteps, UI sounds, boss themes, combat heat floor and stingers all exist.
Still to do for milestone 4:
1. Swing whooshes per weapon at the start of every melee swing (in
   `SkillRunner.meleeSwing` / `basicAttack`, before the hit test), so a hit is
   whoosh + impact rather than impact alone.
2. Richer weapon impact recipes in `src/audio/Audio.ts` (`hit.sword`,
   `hit.axe`, `hit.blunt`, `hit.pierce`): add a short pitch-varied body layer
   and a tail so they read as layered, not as one burst.
3. Enemy attack and windup sounds by family (`monster.<family>.attack`) if
   combat's `Abilities.ts` does not already play them; hook via the `sfx` bus
   event only, do not edit combat's files.
4. Verify by adding audio cases to `tools/feel-entry.ts`: every bed id in
   `bedIds()` has a surface whose `footstep.<surface>` resolves, every boss
   `music` id in `src/data/bosses.ts` resolves to a real track (export a
   `hasTrack()` from `Music.ts`), every music track maps to a bed or is a
   state track.
Then milestone 5 (performance guard) — see the debt note below.

## Notes for resume

- **The world clock.** `DungeonScene.update` now runs the world on
  `rawDt * rig.worldScale` and calls `rig.update(rawDt)`. Before this, hit-stop
  and slow-mo in `CameraRig` only moved the camera; nothing in the world froze.
  Anything new that must ignore hit-stop (UI timers) should use real time.
- **CameraRig** (`src/fx/CameraRig.ts`): `hitStop(duration, scale, priority)`
  draws from a freeze budget (`HITSTOP_BUDGET`, `HITSTOP_REFILL`,
  `HITSTOP_COST`). Non-priority stops are all-or-nothing; kills/crits/boss slams
  pass `priority = true`. `kick(dx, dz, amount)` is a directional spring jolt.
  `worldScale` is the clamped multiplier scenes should use.
- **CombatFeel** (`src/fx/CombatFeel.ts`) owns per-blow feedback. It is created
  by `SkillRunner` (`skills.feel`) and every player hit in `SkillRunner` goes
  through `SkillRunner.strike()`, which calls `feel.hit()` after `takeDamage`.
  Hit kinds: melee, heavy, projectile, area, beam, chain, minion, proc. Tuning
  tables `STOP/KICK/TRAUMA/SHOVE` are at the top of the file. Ground zones tick
  as `proc` so they never strobe.
- **HitFlash** (`src/fx/HitFlash.ts`) swaps a struck body's solid meshes to a
  pooled `MeshBasicMaterial` for ~80-130ms and restores them. It skips
  additive/transparent/depthWrite-off materials and never restores over a
  material someone else changed mid-flash. Monster runtime code does not touch
  materials (checked), so the swap is safe. The player is deliberately not
  flashed (Player.ts mutates its own materials).
- **Knockback** is a short eased slide done by `CombatFeel` directly on
  `root.position`, wall-checked through `ctx.nav.lineOfSight`. It skips bosses,
  juggernauts and anything with a `motionOverride`. `Enemy.ts` is owned by the
  combat stream; no edit there was needed.
- DungeonScene hooks added (all small): `skills.feel.update(...)` per frame,
  `skills.feel.playerHit(taken, maxLife)` in `damagePlayer`,
  `skills.feel.clear()` + `rig.clearTimeEffects()` in `loadLevel`,
  `skills.feel.playerDied()` in `handleDeath`.
- New sounds in `src/audio/Audio.ts`: `hit.chitin`, `hit.wood`, `hit.ooze`,
  `hit.fist`, `hit.heavy`, `kill.confirm`, `kill.elite`, `kill.multi`,
  `player.hurtHeavy`, `arrow.thunk`. `resolvesSound(id)` is exported for checks.
- `EffectSystem.impact({ hitStop: 0 })` now means "no stop" (it used to fall
  through to the crit default). `EffectSystem.cameraRig` and `.chance()` exist.
- Checker: `node tools/check-feel.mjs` (static, ~20s). Shared runner for feel
  checks: `tools/feel-harness.mjs` (`runEntry(entry, outDir)`).
- Known audio debt for milestone 4/5: music voices count against the same
  `Synth.maxVoices = 26` budget as SFX and are never refused, so a busy score
  can starve combat sounds. Fix in the performance milestone (separate pools,
  cost-aware voice stealing).
- Damage numbers belong to the hud stream; hit-reaction animation to the
  animation stream. Do not edit their files.
- **Atlas bugs fixed (milestone 2).** Both the particle sprite sheet and the
  decal sheet were uploaded with three.js' default `flipY = true` while their
  shaders read rows top-down, so every particle drew the wrong sprite and every
  decal the wrong stain. Also, eight per-pixel sprites were painted at canvas
  (0,0) because `putImageData` ignores the transform. Both sheets are now 4x8
  cells (`SPRITE_CELLS`, `STAIN_CELLS`) with `flipY = false`.
- **Schools** (`School` in `src/fx/Effects.ts`): damage type plus `bone`.
  `ELEMENTS[school]` gives core/body/tail colours, impact/cast/wake emitters,
  mark decal and optional cooling `glowDecal`, ribbon trail and sounds.
  `schoolOf(def)` in `SkillRunner.ts` maps skills (ossuary physical -> bone;
  untyped skills borrow their tree's school). Damage still uses the type.
- `EffectSystem.castFlare(school, x, y, z)` is the cast beat; `projectile()`
  flares itself (opt out with `flare: false`), draws a per-school body (arrow,
  ice shard, bone spike, poison glob, mote), sheds the school wake every 0.42m,
  and only accepts real ribbon presets as `trail` (skill particle ids go in
  `shed`). `meteor()` with lightning is now `skyBolt()`, with physical
  `arrowRain()`. `nova({ mark: true })` leaves the school's scar.
- New emitters: `cast.<school>`, `trail.<school>`, `hit.bone`; layers can
  `converge` (spawn on a shell, fly inward).
- **LootFX** (`src/fx/LootFX.ts`): drops arc out of the body (auto-staggered
  when several launch on one tick), land with clink + rarity chime, jackpot
  (unique and up) pillar + fanfare + camera lean; gold lies flat, is
  magnet-pulled within 3.2m, pickups zip into the hero; gold pickups climb in
  pitch in a streak. DungeonScene calls `lootFx.launch` in `dropItem` /
  `dropGold`, `lootFx.collect` on pickup, `lootFx.magnet/update` in
  `updateLoot`, `lootFx.clear` in `loadLevel`. Drop beams themselves are built
  by `buildDropModel` (art stream); LootFX finds parts by name
  (`beam`, `pool`, `sigil`, `dropLight`, `spin`).
- **Audio milestone 4 work so far.** `src/audio/Ambience.ts`: a bed per biome
  (looping filtered noise / drones plus scattered one-shots) chosen from the
  music track name (`bedFor`). `audio.music(track)` switches the bed for place
  tracks only. Footsteps come from listener movement in
  `AudioEngine.setListener` (stride 1.15m, surface from the bed). UI clicks,
  hovers, tabs and panel open/close sounds are installed at the document level
  in `AudioEngine.installUiSounds` (buttons may set `data-sfx`). Music:
  `boss.<family>` tracks exist (they were all falling back to the crypt
  dirge), `ambient` returns to the remembered place track and waits for the
  victory theme, `boss:phase` lifts the key and plays a stinger, and
  `SkillRunner.update` feeds `audio.setCombatFloor(combatHeat(...))` twice a
  second.
- Render tool: `SLAY_PORT=4305 node tools/shot-feel.mjs --out=shots/feel`
  (after `npm run build`) dumps both atlases and stages every school's flight,
  impact and marks. Boot can take 10-20 minutes when other agents render.
- Only one player skill deals cold damage (`gravechill`); frost visuals exist
  but are rarely seen. Tell the combat stream (owns `src/data/skills.ts`).
