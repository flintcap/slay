# Stream: feel (combat feedback, VFX and audio)

Status: in progress

## Milestones

- [x] Hit feedback: hit-stop, flash, knockback, tuned camera shake, a heavier punch on crits and kills. — "Make every blow land: hit-stop, flash, knockback and kill punch"
- [ ] Skill VFX: an upgrade pass per element (fire, frost, lightning, poison, bone, physical) with proper impacts and lingering decals.
- [ ] Loot: drops arc out with a sound and beam by rarity; pickups and gold feel good.
- [ ] Audio: layered weapon and impact sounds, footsteps by floor type, UI sounds, ambient beds per biome, combat-reactive music and boss music.
- [ ] Performance guard: particle and sound budgets so big fights stay smooth.
- [ ] Sweep: every skill has a cast, travel and impact beat; nothing is silent.

## Next up

Milestone 2, skill VFX per element. Start in `src/fx/Effects.ts`:
`impact()`, `projectile()`, `nova()`, `explosion()` and the `ELEMENTS` table.
Give each element its own cast flare (at the caster, before travel), its own
travel look (fire: flickering core + smoke trail; frost: shard + mist; lightning:
crackling arc segments; poison: dripping glob; arcane/"bone": rune motes and
bone shards), and its own impact plus a lingering decal (scorch that cools,
frost rime that melts, char/scorch for lightning, bubbling pool for poison).
`SkillRunner.cast` calls these per effect family; `particleFor()` gives each
skill its emitter. Add a static check (pattern: `tools/feel-entry.ts` +
`tools/feel-harness.mjs`) that every element has cast/travel/impact/decal ids
that exist in `emitterIds()` and the decal kinds list in `src/fx/Decals.ts`.

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
