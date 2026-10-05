# Stream: feel (combat feedback, VFX and audio)

Status: paused

## Milestones

- [x] Hit feedback: hit-stop, flash, knockback, tuned camera shake, a heavier punch on crits and kills. — "Make every blow land: hit-stop, flash, knockback and kill punch"
- [x] Skill VFX: an upgrade pass per element (fire, frost, lightning, poison, bone, physical) with proper impacts and lingering decals. — "Give every element its own cast, flight, impact and scar"
- [x] Loot: drops arc out with a sound and beam by rarity; pickups and gold feel good. — same commit
- [x] Audio: layered weapon and impact sounds, footsteps by floor type, UI sounds, ambient beds per biome, combat-reactive music and boss music. — "Make the dungeon sound like a place and every monster audible"
- [ ] Performance guard: particle and sound budgets so big fights stay smooth.
- [ ] Sweep: every skill has a cast, travel and impact beat; nothing is silent.

## Next up

Milestone 5, performance guard, is about two-thirds done and committed in a
working state ("Budget voices, particles and effects so big fights stay
smooth (part 1)"). Already in:
- `src/audio/Synth.ts`: separate voice pools (`VoicePool`, `POOL_CAPS` sfx 44
  / music 60 / amb 12). Music track outs and ambience beds register with
  `synth.markPool`; their notes are refused note-by-note when the pool is
  full (`synth.dropped`). Effects are gated by the caller.
- `src/audio/Audio.ts`: `play()` learns each recipe's real cost on first play
  (`costs`), and `soundPriority(id)` (2 must play / 1 normal / 0 texture)
  sets how much of the sfx pool it may use (100% / 82% / 55%).
  `audio.diagnostics` reports per-pool voices and `refused`.
- `src/fx/Particles.ts`: per-frame spawn ceiling (`frameBudget`, an eighth of
  capacity), a one-second `pressure` estimate, and a `throttle` that thins
  many-particle layers above 0.55 pressure (single-particle core layers are
  never thinned). `fx.clipped` counts cut bursts.
- `src/fx/Effects.ts`: `MAX_LIVE_EFFECTS = 180`; past it the oldest
  non-`essential` composites are culled (`delay()` and projectiles with
  `onHit` are essential). Projectile travel lights yield when the flash pool
  is over half busy; projectiles shed half as often above 0.7 pressure.

Still to do for milestone 5:
1. Add a stress section to `tools/feel-entry.ts`: 300 `fx.burst('explosion')`
   calls in one frame on a real `FXSystem` (needs a stub scene; the node shim
   in `tools/feel-harness.mjs` already builds canvas textures) must spawn no
   more than `frameBudget`; `pressure` must rise and `throttle` fall after a
   few frames of heavy bursts; 400 decorative `nova()` calls must leave
   `liveCount <= MAX_LIVE_EFFECTS` while a pending `delay()` still fires.
   Audio pools need a fake AudioContext to test; optional.
2. Tick milestone 5, then milestone 6 (sweep): build a static map of every
   active skill's cast / travel / impact beat by effect family (see
   `SkillRunner.cast` switch; families listed in `tools/check-coverage.mjs`)
   and assert each beat has an emitter and a sound; fix any silent family
   (e.g. `chain` for physical `ricochet` draws a lightning beam, `heal` and
   `buff` have no travel beat, which is fine but should be declared).
3. The render tool never got past boot (the machine was busy with other
   agents' renders; two attempts timed out). On resume, run
   `npm run build` then `SLAY_PORT=4305 node tools/shot-feel.mjs --out=shots/feel`
   once with nothing else rendering, and look at `atlas-sprites.png`,
   `atlas-decals.png` and the three `vfx-*.png` shots. The atlas flip fix in
   milestone 2 changes every particle and stain on screen; confirm it looks
   right and retune emitter sizes if anything reads too big or too small.

## Notes for resume

**From models (finished, 5bebe1d):** when a summon is thrown away in `SkillRunner.ts`, call `releaseMonsterModel(root)`, or a little GPU memory leaks per summon.

**From combat (finished, 0c87c07):** `combat:combo` fires on every skill combo and already shows "Name!" over the target; give it a sound and a punch. Melee hits in `SkillRunner.ts` now wait for the swing's contact point. Stunned and rooted heroes now really are; a stun needs a sound. Hero damage scales much harder past level 8; read it from `computeStats`, never hard-code.

**Requests from other streams (added at pause, from the depth stream's report):**
- `SkillRunner.afterHit` returns early unless arc or conduct passives are set, so most characters never get crit riders, Flurry or minion leech. Make the early-out only skip the passive-specific work.
- The Flurry timer is never refreshed on a hit, so stacks are wiped every 2 seconds regardless of how fast you hit.
- From the combat stream: `player:evaded` fires when the dodge avoids a hit; give it a sound and a flash.

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
- **Milestone 4.** Monster sounds come from `src/audio/MonsterAudio.ts`,
  which wraps `Enemy.prototype.notifyAbility` (the documented FX/audio hook)
  from `SkillRunner`'s constructor, calling the original first. Wind-ups of
  0.45s or more play a rising `telegraph` (`telegraph.long` for 1s+), melee
  releases whoosh, ranged shots play `shoot.<element>`, area spells their
  element. Combat stream: if you add sounds in `notifyAbility` yourself, keep
  the method name; the wrapper chains. Player swings play `swing.<weapon>` on
  every swing (`swing.heavy` for heavy skills); impacts are layered recipes.
  `boss.final` exists for the Gaunt King. `tools/check-audio.mjs` (static)
  proves tracks, beds, footsteps, swings, UI ids and monster abilities resolve.
- **Request from models:** monsters are now skinned meshes with a skeleton per instance. When a summon's
  model is thrown away in `SkillRunner.ts`, call `releaseMonsterModel(root)` from
  `entities/MonsterModels` (Enemy already does), or each one leaks a small bone texture.
