# Stream: animation (how bodies move)

Status: in progress (milestones 1-5 done; on milestone 6, the sweep)

## Milestones

- [x] Locomotion: speed-blended walk and run, lean into turns, feet that plant instead of sliding. ("Plant the feet: a stepping gait driven by real ground speed")
- [x] Attacks: anticipation, impact and recovery with real weight for every weapon grip; spell casts with a hand glow. ("Animation: strikes land on the contact frame, feet held in actions, both hands on two-handed weapons")
- [x] Hit reactions and deaths: flinch, stagger, knockback, and death animations that fall and fade instead of vanishing. ("Animation: hits flinch without cutting swings, stagger, stun, knockdown, two deaths")
- [x] Monster motion: idle variety per family, spawn or emerge animations, movement that suits each body (scuttle, lope, float, lumber). (Monster looks moved to the models stream.) ("Animation: monsters move by body, wind up and strike, fidget, spawn and die their own way")
- [x] Secondary motion: cloth, cape, hair and loose gear that sway and settle; town NPCs idle with personality. (Player and NPC looks moved to the models stream.) ("Animation: long hair swings and settles, camp residents idle at their trades")
- [ ] Sweep: check-grips, check-clips and check-attack pass; nothing pops or snaps between states.

## Next up

Milestone 6, the sweep. Concretely:

1. Browser checkers, each one command under `timeout` (max 45 min), `SLAY_PORT=4303`, nothing left
   running: `node tools/check-clips.mjs` (vite dev server, boots the game) and
   `npm run build && node tools/check-attack.mjs` (vite preview). Each may fail at most twice for the
   same reason; then note it here and move on.
2. Static: `check-strikes`, `check-reactions`, `check-footplant`, `check-grips`, `check-monster-anim`
   all pass now; rerun them after any change.
3. Pops between states: done. A foot caught mid-stride keeps its speed into the action's step
   (Hermite start in `holdFeet`), and `check-footplant` now gates action pops and slide too.
4. Look issues to revisit if time allows: the walk is a little bent-kneed (`SOFT_FROM = 0.975`); hero
   capes do not sway (see the milestone 5 note).

## Notes for resume

- **Secondary motion and personas (milestone 5).** `src/art/Secondary.ts`: `SecondaryMotion.attach`
  (called by the Animator constructor, at bind pose) finds a person's `hairLong` cover meshes, adds a
  `hairSway` bone under `head`, re-weights the hair below the head joint toward it (more further
  down) and binds just those meshes to a copy of the skeleton with the bone appended. `update` drives
  it as a sub-stepped damped pendulum from the head's world motion: it hangs with gravity when the
  head tilts, streams back on a run, swings forward on a stop. Ranger (ponytail), pyromancer (long)
  and stormcaller (braids) have it. Not done: hero capes (the unique chest cape shares the heraldry
  material bucket with bands and panels, so isolating it means selecting vertices behind the back;
  or models could add a bone). A quiver on the back (`GearSway`, same file) swings from its strap
  on a spring driven by the chest's motion; it is looked up each frame among `chest`'s children
  (`socketSlot === 'offHand'`), so equipping and unequipping just work. Robes and skirts follow the legs through their
  skin weights already. `Animator.setPersona(id)` gives camp residents an idle layer
  (`PERSONAS`): kale hammers at the anvil, hesk reads his ledger and looks up, vell prays and reaches
  into her satchel, corvane holds his lantern up and scans, renn sweeps the camp with his eyes,
  marrow leans on his spear, the listener sways with his head tilted, gilder drinks, wenna reads her
  map. `Town.ts` calls it (one added line). `swingArm(p, side, elev, azim, w)` points an arm from
  inside a pose function. `tools/pose-sheet.ts` sets `npcs`, `kale` (a hammer cycle strip), `hair`;
  `check-reactions` has a long-hair row.

- **From art (47064a3):** the off-hand socket (`SOCKETS.offHand`, rot X 0.92π) carried shields with their authored front (+Z) toward the hero's back. Art now turns the shield inside `buildShield`, so it reads correctly as is. If you change the off-hand socket, tell art (art.md) so the inner turn can go. Sword grips are now centred on the origin with the guard above the hand (they used to sit half inside the blade); `check-grips` still passes.

- **Monsters (milestone 4).** `src/art/MonsterAnimation.ts` holds `RigAnimator` (re-exported from
  MonsterModels). Same interface as before. Ground speed comes from the model root's world position (a
  jump over 14 m/s is ignored) and sets the gait cadence per archetype (`cadence()`), eased (`rate`,
  `gSm`) so long chains (serpents) never whip. Bipeds walk/run, colossal lumber, quadrupeds blend from
  diagonal walk to a bounding gallop (`gal`, eased), many-legged scuttle on a tripod, floaters tilt and
  bank, oozes hop with squash and stretch. `attack` restarting while an attack (or a long cast) is
  running is the strike; otherwise it is the wind-up, which coils and holds with a tremble. Crossfades
  (bone quaternion snapshots) on any change that has its own pose. Hits flinch additively. Fidgets from
  a private seeded `Random`. Spawns and deaths per archetype. `node tools/check-monster-anim.mjs`
  checks one monster per archetype; `tools/pose-sheet.ts set=monsters` renders them.

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
