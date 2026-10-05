# Stream: animation (how bodies move)

Status: in progress (milestones 1-3 done; on milestone 4)

## Milestones

- [x] Locomotion: speed-blended walk and run, lean into turns, feet that plant instead of sliding. ("Plant the feet: a stepping gait driven by real ground speed")
- [x] Attacks: anticipation, impact and recovery with real weight for every weapon grip; spell casts with a hand glow. ("Animation: strikes land on the contact frame, feet held in actions, both hands on two-handed weapons")
- [x] Hit reactions and deaths: flinch, stagger, knockback, and death animations that fall and fade instead of vanishing. ("Animation: hits flinch without cutting swings, stagger, stun, knockdown, two deaths")
- [ ] Monster motion: idle variety per family, spawn or emerge animations, movement that suits each body (scuttle, lope, float, lumber). (Monster looks moved to the models stream.)
- [ ] Secondary motion: cloth, cape, hair and loose gear that sway and settle; town NPCs idle with personality. (Player and NPC looks moved to the models stream.)
- [ ] Sweep: check-grips, check-clips and check-attack pass; nothing pops or snaps between states.

## Next up

Milestone 4, monster motion. Concretely:

1. Move `RigAnimator` (and `RigAction`, `RigDriveOpts`) out of `src/entities/MonsterModels.ts` into a new
   `src/art/MonsterAnimation.ts`, then replace the class in MonsterModels with
   `export { RigAnimator } from '../art/MonsterAnimation'` (plus the types). Models agreed to this in
   both progress files; it is the only edit to MonsterModels. `Archetype` comes from MonsterModels
   (import the type only, to avoid a cycle). `Enemy.ts`, `SkillRunner.ts` (summons) and `Boss`
   drive it through `update(dt, { locomotion, action, actionT, time, deathT })`; keep that interface.
2. Inside it: crossfade between actions (snapshot bone rotations, blend ~0.1 s) so nothing pops;
   an `attack` that starts while another is running is the strike after a wind-up (Enemy sets
   `attack` for the telegraph, then again for 0.4 s on execute): wind-up coils and holds with a
   tremble, strike snaps through and follows through. Hits flinch additively; deaths fall by archetype
   (quadrupeds roll onto a side, fliers drop, serpents coil and go limp, oozes splat) and settle.
3. Idle variety per family (look around, shift weight, sniff, twitch) from a per-monster phase; spawn
   or emerge per archetype (climb out of the floor, unfurl, drop in); locomotion that suits the body:
   scuttle (insect/arachnid: fast tripod, low body), lope (quadruped: gallop at speed), float (bob and
   tilt into motion), lumber (big humanoids: heavier, slower cadence, more sway). Stride from real
   ground speed like the hero (monster `locomotion` is 0..1; Enemy also has its root position).
4. Add a static checker for monsters (every archetype x action: no NaN, no pops between actions,
   death ends low).

## Notes for resume

- **Reactions (milestone 3).** `play('hurt')` no longer plays a clip: it calls `Animator.flinch(1)`, an
  additive layer (`applyFlinch`) that alternates sides and is halved during actions. `stagger` is a
  one-shot with a catching step (Player.shove plays it for force >= 1.5; if a swing has not reached
  contact yet it becomes a strong flinch instead, so the blow still lands visibly). `setCondition`
  ('none' | 'stunned' | 'frozen' | 'down' | 'rooted', exported as `BodyCondition`) is called every frame
  by `Player.update` from the hero's statuses (`Player.bodyCondition`): stunned plays the `stun` loop
  (weapon hangs point down), frozen skips the update so the pose holds exactly, down plays `down` and
  holds, rooted sets `pinned` (no gait steps, no action steps). Conditions block other clips except
  deaths (`force` overrides). `death` picks `death` (thrown back, after a stagger or on alternate hits)
  or `deathFwd` (crumple onto the knees and face); both end lying on the floor. Deaths and `down` are
  `travel` clips (feet follow the clip). `node tools/check-reactions.mjs` checks all of it;
  `tools/pose-sheet.ts set=reactions` shows it.

- **How actions work now (milestone 2).** Clips are keyed poses (`keyed([...])`, `KeyPose`): joint
  angles in `b`, arms as swing directions in `sL`/`sR` ([elevation, azimuth, twist], slerped as
  quaternions through `Pose.sq`/`Pose.sw`, so an arm can go from behind the head to out front
  without euler flips), hips `hp` and feet `fl`/`fr` in hip-heights. Each key's `e` eases the segment
  that arrives at it: `in` for the contact (arrives at full speed), `out` leaving it. `strike()` and
  `gesture()` build the clip defs; `ClipDef.contact` is the contact key's share of the clip.
- **Contact timing.** `Player.beginAction` now passes `contact` (seconds, from combat's
  `contactDelay`, or `min(0.1, 0.3 * duration)` for things that resolve on the click) and
  `restart: true`. The animator warps time so the contact key lands exactly then (`Track.warp`), then
  plays the follow-through at the old rate. With under ~0.14 s to contact the wind-up is scaled down
  (`Track.antic`, `sampleAction`). Combat's table stays the source of truth for gameplay timing.
- **Interrupts.** A `walk`/`run` request cuts an action short once it is past `recover` (default:
  its contact) and the body really moves; `idle` never does.
- **Feet in actions.** `holdFeet` keeps each foot on its spot of floor while the body brakes and
  turns under a swing, and steps (always with a lift) when the clip wants it more than 0.1 hip-heights
  away or lifts it; one foot at a time unless far behind. A foot caught mid-air at the start finishes
  coming down as a step. Clips that travel (`travel: true`, the dodge) still use the old `entry` blend.
- **Weapon aim and two hands.** `ClipDef.aim` turns the wrist (up to 2 rad) so the business end points
  along a character-space direction around the contact, for any grip (bows in the left hand too).
  Two-handed grips put the off hand on the haft with a two-bone arm solve (`solveArm`), in carry and
  in strikes; haft points `HAFT_TWOHAND`/`HAFT_STAFF` (carry), `HILT_TWOHAND` under the guard for
  two-handed swords in swings. If the haft is out of the off arm's reach the main hand is drawn in.
  `Animator.setWeapon(grip, category)` (called from `Player.refreshEquipmentVisuals`) sets the weight
  profile: heavier weapons put more trunk into a swing (`torso()`).
- **Cast glow.** `Animator.castGlow` (0..1) and `castHands` follow the clip's `glow` curve; the
  animator also shows a soft additive sprite on the casting hands in the body's accent colour
  (`updateGlow`, lazy, hidden otherwise). Feel can read `castGlow` for anything bigger.
- **Checkers.** `node tools/check-strikes.mjs` (new, static, ~20 s): contact key on the contact frame,
  tip fastest within 0.06 s of it, business end forward at contact, planted-foot slide, joint pops
  outside the arms, off hand on the haft. `STRIKE_DEBUG=<case>` prints a case's feet per frame.
  `check-footplant`'s attack row now slides 0.006 m/s (was 0.36); its "inside actions" jump (0.22 at
  footL) is a running foot stopping mid-swing as the attack starts (a Hermite start would fix it).
  `tools/pose-sheet.ts` has `set=attacks` (wind, contact and follow for each weapon).

- **From world (bug fix made in your file, please keep it):** the invisible hero in foundry and caverns
  renders was `Animator.guardReach`'s pelvis spring. An explicit step with k = 900 diverges for any frame
  over ~65 ms (frames are capped at 0.1 s), and the harness caught `pelvisDrop` at 1e14 with the hips that
  far below the floor; the clamp at zero made it flicker, so the hero showed on some frames only. It now
  steps in closed form (exact critically damped). The weapon-lag spring (k 220) also grew at 0.1 s steps
  and is now sub-stepped at 60 Hz. Lean and bank are stable at 0.1 s. Any new stiff spring: step it in
  closed form or sub-step it.

**From combat (finished, 0c87c07):** melee damage now lands at the clip's contact point, at most 0.16 s into the swing, from a per-clip table in `Player.ts`. Make each strike visibly connect there, or publish your own contact times and point the table at them. Stunned heroes stand still with no pose: add a stun pose. Rooted heroes can attack but not move.

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
- **From models:** monsters are now one rigidly weighted SkinnedMesh per material under a `THREE.LOD`
  (near and far levels on one skeleton); bones and names are unchanged, so `RigAnimator` works as before.
  Models agrees in advance: when monster motion moves to `src/art/MonsterAnimation.ts`, replace the class
  in `MonsterModels.ts` with `export { RigAnimator } from '../art/MonsterAnimation'`. Player and NPC bodies
  are built by `buildPerson` on the same joints (`jointsFor` untouched); NPCs call `setGrip` for their
  two-handed tools.
