# Stream: animation (how bodies move)

Status: paused (milestone 1 done; milestone 2 researched, no code yet)

## Milestones

- [x] Locomotion: speed-blended walk and run, lean into turns, feet that plant instead of sliding. ("Plant the feet: a stepping gait driven by real ground speed")
- [ ] Attacks: anticipation, impact and recovery with real weight for every weapon grip; spell casts with a hand glow.
- [ ] Hit reactions and deaths: flinch, stagger, knockback, and death animations that fall and fade instead of vanishing.
- [ ] Monster motion: idle variety per family, spawn or emerge animations, movement that suits each body (scuttle, lope, float, lumber). (Monster looks moved to the models stream.)
- [ ] Secondary motion: cloth, cape, hair and loose gear that sway and settle; town NPCs idle with personality. (Player and NPC looks moved to the models stream.)
- [ ] Sweep: check-grips, check-clips and check-attack pass; nothing pops or snaps between states.

## Next up

Milestone 2, attacks. Concretely:

1. Rewrite the one-shot clips in `src/art/Animation.ts` (`attack1`, `attack2`, `slam`, `thrust`,
   `lunge`, `hurl`, `point`, `cast`, `channel`, `shoot`, `snapshot`, `skyshot`, `stomp`, `roar`,
   `plant`, `blink`) with a clear anticipation / strike / recovery shape. Author foot targets in
   units of `rig.hipY` (many old clips use raw metres and negative foot heights; the floor clamp in
   `applyPose` now hides the worst of that). Any foot that travels more than ~6 cm must lift
   (a `y` arc), never slide: `attack1` still slides its front foot forward on the strike, and that is
   what `check-footplant` reports in its "attack" row (slide 0.36 m/s, pop 0.23 m).
2. Keep hit timing: `Player.beginAction(clip, duration)` plays the clip at `speed = 0.45 / duration`,
   so the strike must land at the same normalised time as today (find where the sim applies damage
   in `src/scenes/SkillRunner.ts` / `DungeonScene.ts` before moving any strike key).
   `tools/grip-entry.ts` samples swings 20 frames in and requires the weapon tip `z > -0.75`.
3. Hand glow on casts: the animator can expose a `castGlow` 0..1 value (e.g. a getter driven by the
   current clip's gather/release curve) for the feel stream to read; do not build VFX here.
4. Findings already made for milestone 2 (no code written yet):
   - Melee damage lands the instant the attack starts: `SkillRunner.meleeSwing` runs on the click,
     not at a hit frame. So keep anticipation very short (contact about 0.12 to 0.16 s in) and export
     a per-clip normalised contact time from `Animation.ts` (e.g. `CLIP_CONTACT`) so combat or feel
     can later delay damage to it. Note this for combat in their progress file.
   - The clip outlives the action lock: real clip length is `def.duration * duration / 0.45`
     (about 1.38x `actionLock` for `attack1`), so the player starts moving while the swing is still
     playing and the feet skate. Add a per-clip `recover` time after which a `walk`/`run` request may
     interrupt the one-shot (not `idle`), crossfading into the gait.
   - Two-handed swings should keep the off hand on the haft with left-arm two-bone IK. Measured
     off-hand point in weapon (socket) space after the carry pose settles: `twoHand` (0, 0.19, -0.03),
     `staff` (0, 0.32, -0.03). Weapon space is the socket transform from `GRIPS` under `handR`; expose
     it from the grip code in `CharacterModels.ts` (animation's part) and solve in chest space using
     `chest.matrixWorld^-1 * handR.matrixWorld` after `updateWorldMatrix` on the root bone.
   - Per-weapon weight needs the one-hand grip too: add `Animator.setWeapon(grip: WeaponGrip)` and one
     line in `Player.refreshEquipmentVisuals` next to `setGrip`. Profiles: light (dagger, wand, fist),
     medium (sword), heavy (axe, mace), twoHand, polearm (staff grip).
   - `kf` eases to zero speed at every key, which is wrong at contact. Add a keyed curve with
     per-segment easing (accelerate into contact, decelerate out of it).
5. Extend `tools/footplant-entry.ts` with a row per action clip and then gate actions too
   (move them out of the "reported only" line in `check-footplant.mjs`). Add a `set=attacks` to
   `tools/pose-sheet.ts` showing anticipation / contact / recovery for sword, greatsword, dagger,
   staff, bow.

## Notes for resume

- **How locomotion works now.** `Animator.follow(obj)` reads `obj.position` and `obj.rotation.y`
  every update. `Player` calls `this.animator.follow(this.root)` (one line). Without `follow`, walk and
  run play on a treadmill at 1.4 / 4.6 m/s times the requested speed, which is what previews want.
  `idle`, `walk` and `run` are one locomotion state: switching among them renames the track and never
  crossfades. The body is `evalLocomotion` = idle pose blended into `evalGait` by `moveW`.
- **Feet.** `stepFeet` runs a gait clock (`phase`, cadence from speed, `duty` from walk/run/sprint) and
  two `Foot` records in character space (absolute ankle x/z, metres). Planted feet are moved by the
  inverse of the body's motion each frame (`sampleMotion` gives `moveX/moveZ/moveYaw`). Lift-off is
  a once-per-cycle latch (`lifted`) or an early lift when a foot trails more than `0.5 * hipY`.
  Swings land on a spot predicted from velocity plus time-to-land, locked to the floor for the last
  14% of the swing. Standing still, the gait keeps stepping only until both feet are home.
- **Leg solver.** IK targets (`Pose.foot`, `Pose.ik`) are now in character space (offset from the
  rest ankle), not pelvis space: `solveLeg` undoes the hips rotation first. Feet have a yaw
  (`Pose.fyaw`) and the knee swivels toward it. Soft IK past `SOFT_FROM` of full leg length. The
  pelvis guard (`guardReach`) lowers the hips with a spring so planted feet stay reachable. Ankles are
  clamped at the floor.
- **Actions.** `play()` of a one-shot captures where the feet were (`Track.entry`) and steps them
  over 0.16 to 0.23 s to the clip's first-frame feet, lifting when the gap is a real step; the entry
  start is carried with ground motion so a run into an attack does not skate. When an action ends,
  the gait takes the feet from exactly where the action left them (`syncFeet`, `resync`).
- **Checkers.** `node tools/check-footplant.mjs` (static, about 20 s): mean planted slide 0.006 m/s,
  worst frame 0.12, biggest joint second-difference 0.155 (limit 0.16; a running knee fold measures
  up to ~0.15, real snaps 0.2+). `node tools/check-grips.mjs` still passes.
- **Looking at poses.** `SLAY_PORT=4303 node tools/shot-poses.mjs --set=gait` writes
  `shots/animation/poses-gait.png` in about 90 s (vite dev server, no game boot). Add sets in
  `tools/pose-sheet.ts`. Prefer this over the full screenshot tool for animation work.
- **Ownership.** `tools/` belongs to quality; the files above are new. `MonsterModels.ts` (which also
  holds `RigAnimator`, the monster animator) now belongs to the models stream. For milestone 4, put
  monster motion in a new file (e.g. `src/art/MonsterAnimation.ts`) and ask models, via both progress
  files, to make `RigAnimator` a re-export of it, or agree a small additive hook. Bone names are a
  contract with models: never rename or move bones.
- Known look issue to revisit in the sweep: the walk is a little bent-kneed (soft IK keeps every
  knee slightly flexed, `SOFT_FROM = 0.975`).
